import { prisma } from "@/lib/db";
import { kvStore } from "@/lib/redis";
import {
  generateSecureToken,
  generateSixDigitOtp,
  hashToken,
  hashVerificationOtp,
  verifyTokenHash,
  verifyVerificationOtpHash,
} from "@/lib/crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createServerSession,
  revokeAllUserSessions,
  revokeSessionByRawToken,
  type SessionPayload,
} from "@/lib/auth/session";
import {
  consumeRecoveryCode,
  decryptTotpSecret,
  generateAdminTotpEnrollment,
  verifyAndConsumeTotpCode,
  type TotpEnrollmentBundle,
} from "@/lib/auth/totp";
import {
  EmailDeliveryError,
  USER_FACING_EMAIL_DELIVERY_ERROR,
  sendAccountAlreadyExistsEmail,
  sendPasswordResetEmail,
  sendVerificationOtpEmail,
} from "@/lib/email";
import {
  SEED_SERVICEABLE_PIN_CODES,
  type SeedPinCodeRecord,
} from "@/lib/data/seed-data";
import type { RegisterInput } from "@/lib/validation/auth";
import { brandConfig } from "@/config/brand";
import {
  canonicalizeEmail,
  isEmailDomainAllowed,
  USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE,
} from "@/lib/auth/email-domains";

/**
 * Looks up a 6-digit Indian PIN code against the database (with seed fallback in dev/test).
 */
export async function lookupServiceablePinCode(
  pinCode: string
): Promise<SeedPinCodeRecord | null> {
  const cleaned = pinCode.trim();
  if (!/^[1-9]\d{5}$/.test(cleaned)) {
    return null;
  }

  if (!shouldUseMemoryDb()) {
    try {
      const row = await prisma.serviceablePinCode.findUnique({
        where: { pinCode: cleaned },
      });
      if (row) {
        if (!row.isActive) return null;
        return {
          pinCode: row.pinCode,
          city: row.city,
          state: row.state,
          stateCode: row.stateCode,
          zoneCode: row.zoneCode as SeedPinCodeRecord["zoneCode"],
          transitDays: row.transitDays,
          shippingFeePaise: row.shippingFeePaise,
          codAvailable: row.codAvailable,
          isActive: row.isActive,
        };
      }
    } catch {
      // Fallback to SEED_SERVICEABLE_PIN_CODES below if DB query fails in dev/test
    }
  }

  const found = SEED_SERVICEABLE_PIN_CODES.find(
    (item) => item.pinCode === cleaned && item.isActive
  );
  return found ?? null;
}

export interface AuthUserRecord {
  id: string;
  email: string;
  canonicalEmail: string;
  phone: string | null;
  fullName: string;
  passwordHash: string;
  role: "CUSTOMER" | "ADMIN";
  emailVerified: boolean;
  mustChangePassword: boolean;
  totpSecretEncrypted: string | null;
  totpEnabled: boolean;
  recoveryCodeHashes: string[];
  failedLoginCount: number;
  lockedUntil: Date | null;
  address?: {
    addressLine: string;
    city: string;
    state: string;
    pinCode: string;
    latitude: number | null;
    longitude: number | null;
  };
}

interface StoredEmailToken {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET";
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
}

export interface StoredConsentRecord {
  id: string;
  userId: string | null;
  anonymousId: string | null;
  consentType: string;
  purpose: string;
  policyVersion: string;
  granted: boolean;
  ipAddress: string;
  userAgent: string | null;
  createdAt: Date;
}

export const PRIVACY_POLICY_VERSION = "2026.02-DPDP";
export const EMAIL_VERIFICATION_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const RESEND_COOLDOWN_SECONDS = 60; // 60 seconds
export const MAX_OTP_WRONG_ATTEMPTS = 5; // 5 wrong attempts invalidate the code
export const MAX_OTP_SENDS_PER_HOUR = 5; // max 5 sends per hour per account and per IP
export const OTP_HOURLY_WINDOW_SECONDS = 3600; // 1 hour
export const MAX_OTP_SENDS_PER_EMAIL_DAILY = 10; // max 10 sends per day per account
export const MAX_OTP_SENDS_PER_IP_DAILY = 25; // max 25 sends per day per IP
export const OTP_DAILY_WINDOW_SECONDS = 86400; // 24 hours
export const DEFAULT_EMAIL_DAILY_LIMIT = 400;

export const USER_FACING_DAILY_QUOTA_MESSAGE =
  "Service is currently experiencing high verification volume. Please try again tomorrow or contact support at support@kalaandkiln.in.";

export {
  canonicalizeEmail,
  isEmailDomainAllowed,
  getAllowedEmailDomains,
  USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE,
} from "@/lib/auth/email-domains";

export const LOGIN_LOCKOUT_THRESHOLD = 5;
export const LOGIN_LOCKOUT_SECONDS = 15 * 60; // 15 minutes
export const LOGIN_TURNSTILE_THRESHOLD = 2;

/**
 * Per-IP login attempt rate limit across all accounts (blocks credential stuffing / spraying).
 */
export const LOGIN_IP_RATE_LIMIT_MAX = 12;
export const LOGIN_IP_RATE_LIMIT_WINDOW_SECONDS = 15 * 60; // 15 minutes

/**
 * Minimum duration floor (in ms) applied to customer registration so new and
 * existing email addresses exhibit indistinguishable response timing.
 */
export const REGISTRATION_MIN_DURATION_MS =
  process.env.NODE_ENV === "test" ? 120 : 380;

/**
 * Computes the escalating backoff delay (in milliseconds) for an account
 * experiencing repeated failed logins across any IP address.
 * Never hard-locks the account globally; caps at 8000ms.
 */
export function computeLoginEscalatingDelayMs(
  globalAccountFailures: number
): number {
  if (globalAccountFailures < LOGIN_TURNSTILE_THRESHOLD) {
    return 0;
  }
  const exponent = Math.min(
    globalAccountFailures - LOGIN_TURNSTILE_THRESHOLD,
    4
  );
  return Math.min(500 * Math.pow(2, exponent), 8000);
}

/**
 * Anti-enumeration constant messages:
 * Registration, login, verification resend, and forgot-password return identical
 * responses regardless of whether the email exists in the database.
 */
export const GENERIC_REGISTER_SUCCESS_MESSAGE =
  "If this email can be registered, we have sent a 6-digit verification code to your inbox.";

export const GENERIC_RESEND_VERIFICATION_MESSAGE =
  "If an unverified account matches that email address, a fresh 6-digit verification code has been sent.";

export const GENERIC_LOGIN_ERROR_MESSAGE =
  "Invalid email or password, or your email address has not been verified yet.";

export const GENERIC_FORGOT_PASSWORD_MESSAGE =
  "If an account exists for that email address, we have sent a password reset link.";

const DUMMY_OTP_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const memUsers = new Map<string, AuthUserRecord>();
const memTokens = new Map<string, StoredEmailToken>();
const memConsentRecords: StoredConsentRecord[] = [];
const memAuditLogs: Array<{
  id: string;
  actorId: string;
  userId: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  targetType: string;
  entityId: string;
  targetId: string;
  ipAddress: string;
  afterState?: Record<string, unknown>;
  createdAt: Date;
}> = [];

function shouldUseMemoryDb(): boolean {
  return process.env.USE_MEMORY_DB === "true" || !process.env.DATABASE_URL;
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function normalizeIp(ipAddress?: string): string {
  return (ipAddress ?? "127.0.0.1").trim() || "127.0.0.1";
}

function buildLoginAttemptKey(email: string, ipAddress?: string): string {
  return `login_fail_acct_ip:${email.trim().toLowerCase()}:${normalizeIp(ipAddress)}`;
}

function buildLoginLockKey(email: string, ipAddress?: string): string {
  return `login_lock_acct_ip:${email.trim().toLowerCase()}:${normalizeIp(ipAddress)}`;
}

function buildGlobalAccountFailureKey(email: string): string {
  return `login_fail_acct_global:${email.trim().toLowerCase()}`;
}

function buildGlobalAccountNotBeforeKey(email: string): string {
  return `login_not_before_acct_global:${email.trim().toLowerCase()}`;
}

function buildLoginIpSprayKey(ipAddress?: string): string {
  return `login_ip_spray:${normalizeIp(ipAddress)}`;
}

function buildOtpWrongAttemptsKey(userId: string): string {
  return `verify_otp_attempts:${userId}`;
}

export function buildOtpResendCooldownKey(email: string): string {
  return `verify_cooldown:${canonicalizeEmail(email)}`;
}

export function buildOtpHourlyAccountKey(email: string): string {
  return `verify_hourly_acct:${canonicalizeEmail(email)}`;
}

function buildOtpHourlyIpKey(ipAddress?: string): string {
  return `verify_hourly_ip:${normalizeIp(ipAddress)}`;
}

async function enforceMinimumDuration(
  startedAtMs: number,
  minDurationMs: number = REGISTRATION_MIN_DURATION_MS
): Promise<void> {
  const elapsed = Date.now() - startedAtMs;
  const remaining = minDurationMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

let defaultAdminSeeded = false;
async function ensureDefaultAdminInMemory(): Promise<void> {
  if (defaultAdminSeeded) return;
  defaultAdminSeeded = true;

  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL ?? "admin@kalaandkiln.in"
  ).toLowerCase();

  const initialPassword =
    process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMeOnFirstLogin#2026!";

  if (!memUsers.has(adminEmail)) {
    const pwHash = await hashPassword(initialPassword);
    memUsers.set(adminEmail, {
      id: "usr_admin_01",
      email: adminEmail,
      canonicalEmail: adminEmail,
      phone: "9845012345",
      fullName: "Aarav Sharma (Operations Admin)",
      passwordHash: pwHash,
      role: "ADMIN",
      emailVerified: true,
      mustChangePassword: true,
      totpSecretEncrypted: null,
      totpEnabled: false,
      recoveryCodeHashes: [],
      failedLoginCount: 0,
      lockedUntil: null,
    });
  }
}

export async function resetAuthMemoryStoreForTests(): Promise<void> {
  memUsers.clear();
  memTokens.clear();
  memConsentRecords.length = 0;
  memAuditLogs.length = 0;
  defaultAdminSeeded = false;
  await kvStore.flushForTests();
  await ensureDefaultAdminInMemory();

  if (!shouldUseMemoryDb()) {
    const adminEmail = (
      process.env.SEED_ADMIN_EMAIL ?? "admin@kalaandkiln.in"
    ).toLowerCase();
    const adminCanonical = canonicalizeEmail(adminEmail);
    const customerEmail = (
      process.env.SEED_CUSTOMER_EMAIL ?? "customer@kalaandkiln.in"
    ).toLowerCase();
    const initialAdminPassword =
      process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMeOnFirstLogin#2026!";
    const adminHash = await hashPassword(initialAdminPassword);

    await prisma.stockReservation.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.savedAddress.deleteMany({});
    await prisma.emailToken.deleteMany({});
    await prisma.consentRecord.deleteMany({
      where: {
        user: {
          email: {
            notIn: [adminEmail, customerEmail],
          },
        },
      },
    });
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          notIn: [adminEmail, customerEmail],
        },
      },
    });

    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        canonicalEmail: adminCanonical,
        passwordHash: adminHash,
        isVerified: true,
        mustChangePassword: true,
        totpSecretEncrypted: null,
        totpEnabled: false,
        totpRecoveryCodeHashes: [],
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: {
        id: "user-admin-1",
        email: adminEmail,
        canonicalEmail: adminCanonical,
        phone: "9880011223",
        fullName: "Kala & Kiln Operations Admin",
        passwordHash: adminHash,
        role: "ADMIN",
        isVerified: true,
        mustChangePassword: true,
        addressLine: "42 Indiranagar 100 Feet Road",
        city: "Bengaluru",
        state: "Karnataka",
        pinCode: "560038",
        totpEnabled: false,
        totpRecoveryCodeHashes: [],
      },
    });
  }
}

export function getAuditLogsForTests() {
  return [...memAuditLogs];
}

export function getConsentRecordsForTests() {
  return [...memConsentRecords];
}

async function getUserByEmail(email: string): Promise<AuthUserRecord | null> {
  const normalized = email.trim().toLowerCase();
  const canonical = canonicalizeEmail(email);
  if (shouldUseMemoryDb()) {
    await ensureDefaultAdminInMemory();
    for (const u of memUsers.values()) {
      if (u.email.toLowerCase() === normalized || u.canonicalEmail === canonical) {
        return u;
      }
    }
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalized },
        { canonicalEmail: canonical },
      ],
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    canonicalEmail: user.canonicalEmail,
    phone: user.phone,
    fullName: user.fullName,
    passwordHash: user.passwordHash,
    role: user.role === "ADMIN" ? "ADMIN" : "CUSTOMER",
    emailVerified: user.isVerified,
    mustChangePassword: user.mustChangePassword,
    totpSecretEncrypted: user.totpSecretEncrypted,
    totpEnabled: user.totpEnabled,
    recoveryCodeHashes: user.totpRecoveryCodeHashes,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil,
    address: {
      addressLine: user.addressLine,
      city: user.city,
      state: user.state,
      pinCode: user.pinCode,
      latitude: user.latitude ? Number(user.latitude) : null,
      longitude: user.longitude ? Number(user.longitude) : null,
    },
  };
}

async function getUserById(id: string): Promise<AuthUserRecord | null> {
  if (shouldUseMemoryDb()) {
    await ensureDefaultAdminInMemory();
    for (const u of memUsers.values()) {
      if (u.id === id) return u;
    }
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    canonicalEmail: user.canonicalEmail,
    phone: user.phone,
    fullName: user.fullName,
    passwordHash: user.passwordHash,
    role: user.role === "ADMIN" ? "ADMIN" : "CUSTOMER",
    emailVerified: user.isVerified,
    mustChangePassword: user.mustChangePassword,
    totpSecretEncrypted: user.totpSecretEncrypted,
    totpEnabled: user.totpEnabled,
    recoveryCodeHashes: user.totpRecoveryCodeHashes,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil,
  };
}

async function checkAndRecordOtpSendRateLimits(params: {
  email: string;
  ipAddress?: string;
  enforceCooldown: boolean;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      code:
        | "COOLDOWN_ACTIVE"
        | "HOURLY_LIMIT_EXCEEDED"
        | "DAILY_LIMIT_EXCEEDED";
      retryAfterSeconds: number;
      message: string;
    }
> {
  const canonicalEmail = canonicalizeEmail(params.email);
  const ip = normalizeIp(params.ipAddress);
  const cooldownKey = buildOtpResendCooldownKey(canonicalEmail);
  const hourlyAcctKey = buildOtpHourlyAccountKey(canonicalEmail);
  const hourlyIpKey = buildOtpHourlyIpKey(ip);
  const dailyAcctKey = `verify_daily_acct:${canonicalEmail}`;
  const dailyIpKey = `verify_daily_ip:${ip}`;
  const todayDate = new Date().toISOString().slice(0, 10);
  const globalDailyKey = `email_global_daily_sends:${todayDate}`;

  // 1. Atomic Cooldown check via SET NX EX
  if (params.enforceCooldown) {
    const acquired = await kvStore.setNxEx(
      cooldownKey,
      RESEND_COOLDOWN_SECONDS,
      "1"
    );
    if (!acquired) {
      const ttl = await kvStore.ttl(cooldownKey);
      return {
        ok: false,
        code: "COOLDOWN_ACTIVE",
        retryAfterSeconds: ttl > 0 ? ttl : RESEND_COOLDOWN_SECONDS,
        message:
          "Please wait 60 seconds before requesting another verification code.",
      };
    }
  }

  // 2. Global Daily Quota Check with 80% warning and 95% block
  const dailyLimit = Number(
    process.env.EMAIL_DAILY_LIMIT ?? DEFAULT_EMAIL_DAILY_LIMIT
  );
  const globalCountRaw = await kvStore.get(globalDailyKey);
  const globalCount = globalCountRaw ? Number(globalCountRaw) : 0;
  const warn80 = Math.floor(dailyLimit * 0.8);
  const block95 = Math.floor(dailyLimit * 0.95);

  if (globalCount >= warn80) {
    console.warn(
      `[Email Quota Warning] Daily email send quota at ${Math.round((globalCount / dailyLimit) * 100)}% (${globalCount}/${dailyLimit}).`
    );
  }

  if (globalCount >= block95) {
    console.error(
      `[Email Quota Blocked] Daily email send quota reached 95% threshold (${globalCount}/${dailyLimit}). Refusing further sends.`
    );
    if (params.enforceCooldown) {
      await kvStore.del(cooldownKey);
    }
    return {
      ok: false,
      code: "DAILY_LIMIT_EXCEEDED",
      retryAfterSeconds: 3600,
      message: USER_FACING_DAILY_QUOTA_MESSAGE,
    };
  }

  // 3. Per-Account Daily Check (max 10 per day)
  const dailyAcctRaw = await kvStore.get(dailyAcctKey);
  const dailyAcct = dailyAcctRaw ? Number(dailyAcctRaw) : 0;
  if (dailyAcct >= MAX_OTP_SENDS_PER_EMAIL_DAILY) {
    const ttl = await kvStore.ttl(dailyAcctKey);
    if (params.enforceCooldown) {
      await kvStore.del(cooldownKey);
    }
    return {
      ok: false,
      code: "DAILY_LIMIT_EXCEEDED",
      retryAfterSeconds: ttl > 0 ? ttl : OTP_DAILY_WINDOW_SECONDS,
      message: `Maximum daily verification codes sent for this account (${MAX_OTP_SENDS_PER_EMAIL_DAILY} per day). Please try again tomorrow.`,
    };
  }

  // 4. Per-IP Daily Check (max 25 per day)
  const dailyIpRaw = await kvStore.get(dailyIpKey);
  const dailyIp = dailyIpRaw ? Number(dailyIpRaw) : 0;
  if (dailyIp >= MAX_OTP_SENDS_PER_IP_DAILY) {
    const ttl = await kvStore.ttl(dailyIpKey);
    if (params.enforceCooldown) {
      await kvStore.del(cooldownKey);
    }
    return {
      ok: false,
      code: "DAILY_LIMIT_EXCEEDED",
      retryAfterSeconds: ttl > 0 ? ttl : OTP_DAILY_WINDOW_SECONDS,
      message: `Maximum daily verification requests from this network exceeded (${MAX_OTP_SENDS_PER_IP_DAILY} per day). Please try again tomorrow.`,
    };
  }

  // 5. Hourly Checks (5 per hour per account and per IP)
  const currentAcctRaw = await kvStore.get(hourlyAcctKey);
  const currentIpRaw = await kvStore.get(hourlyIpKey);
  const currentAcct = currentAcctRaw ? Number(currentAcctRaw) : 0;
  const currentIp = currentIpRaw ? Number(currentIpRaw) : 0;

  if (
    currentAcct >= MAX_OTP_SENDS_PER_HOUR ||
    currentIp >= MAX_OTP_SENDS_PER_HOUR
  ) {
    if (params.enforceCooldown) {
      await kvStore.del(cooldownKey);
    }
    const acctTtl = await kvStore.ttl(hourlyAcctKey);
    const ipTtl = await kvStore.ttl(hourlyIpKey);
    const retryAfterSeconds = Math.max(
      acctTtl > 0 ? acctTtl : 0,
      ipTtl > 0 ? ipTtl : 0,
      60
    );
    return {
      ok: false,
      code: "HOURLY_LIMIT_EXCEEDED",
      retryAfterSeconds,
      message:
        "Maximum verification codes sent for this hour (5 per hour). Please try again later.",
    };
  }

  await kvStore.incrWithTtl(hourlyAcctKey, OTP_HOURLY_WINDOW_SECONDS);
  await kvStore.incrWithTtl(hourlyIpKey, OTP_HOURLY_WINDOW_SECONDS);
  await kvStore.incrWithTtl(dailyAcctKey, OTP_DAILY_WINDOW_SECONDS);
  await kvStore.incrWithTtl(dailyIpKey, OTP_DAILY_WINDOW_SECONDS);
  await kvStore.incrWithTtl(globalDailyKey, OTP_DAILY_WINDOW_SECONDS);

  if (!params.enforceCooldown) {
    await kvStore.setEx(cooldownKey, RESEND_COOLDOWN_SECONDS, "1");
  }

  return { ok: true };
}

/**
 * Issues a single-use 6-digit OTP for email verification, invalidates every older
 * verification code for that account, resets the Redis wrong-attempt counter,
 * and stores only the HMAC-SHA256 hash with TOKEN_HASH_PEPPER (10-minute expiry).
 */
async function createAndStoreVerificationOtp(params: {
  userId: string;
  ttlMs?: number;
}): Promise<string> {
  const rawOtp = generateSixDigitOtp();
  const tokenHash = hashVerificationOtp(params.userId, rawOtp);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + (params.ttlMs ?? EMAIL_VERIFICATION_OTP_TTL_MS)
  );

  await kvStore.del(buildOtpWrongAttemptsKey(params.userId));

  if (shouldUseMemoryDb()) {
    for (const [key, existing] of memTokens.entries()) {
      if (
        existing.userId === params.userId &&
        existing.purpose === "EMAIL_VERIFICATION" &&
        !existing.usedAt
      ) {
        existing.usedAt = now;
      }
    }

    const memKey = `${params.userId}:${tokenHash}`;
    memTokens.set(memKey, {
      id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: params.userId,
      tokenHash,
      purpose: "EMAIL_VERIFICATION",
      expiresAt,
      usedAt: null,
      attempts: 0,
    });
    return rawOtp;
  }

  await prisma.$transaction(async (tx) => {
    await tx.emailToken.updateMany({
      where: {
        userId: params.userId,
        purpose: "EMAIL_VERIFICATION",
        usedAt: null,
      },
      data: { usedAt: now },
    });

    await tx.emailToken.create({
      data: {
        userId: params.userId,
        tokenHash,
        purpose: "EMAIL_VERIFICATION",
        expiresAt,
        attempts: 0,
      },
    });
  });

  return rawOtp;
}

async function createAndStorePasswordResetToken(params: {
  userId: string;
}): Promise<string> {
  const rawToken = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  if (shouldUseMemoryDb()) {
    for (const existing of memTokens.values()) {
      if (
        existing.userId === params.userId &&
        existing.purpose === "PASSWORD_RESET" &&
        !existing.usedAt
      ) {
        existing.usedAt = new Date();
      }
    }

    memTokens.set(tokenHash, {
      id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: params.userId,
      tokenHash,
      purpose: "PASSWORD_RESET",
      expiresAt,
      usedAt: null,
      attempts: 0,
    });
    return rawToken;
  }

  await prisma.emailToken.updateMany({
    where: {
      userId: params.userId,
      purpose: "PASSWORD_RESET",
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });

  await prisma.emailToken.create({
    data: {
      userId: params.userId,
      tokenHash,
      purpose: "PASSWORD_RESET",
      expiresAt,
    },
  });

  return rawToken;
}

/**
 * Records an explicit DPDP Act 2023 consent entry.
 */
export async function recordPrivacyConsent(params: {
  userId: string | null;
  anonymousId?: string | null;
  consentType: string;
  purpose: string;
  granted: boolean;
  ipAddress?: string;
  userAgent?: string | null;
}): Promise<void> {
  const ip = params.ipAddress ?? "127.0.0.1";
  const record: StoredConsentRecord = {
    id: `consent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: params.userId,
    anonymousId: params.anonymousId ?? null,
    consentType: params.consentType,
    purpose: params.purpose,
    policyVersion: PRIVACY_POLICY_VERSION,
    granted: params.granted,
    ipAddress: ip,
    userAgent: params.userAgent ?? null,
    createdAt: new Date(),
  };
  memConsentRecords.push(record);

  if (shouldUseMemoryDb()) {
    return;
  }

  await prisma.consentRecord.create({
    data: {
      userId: params.userId,
      anonymousId: params.anonymousId ?? params.userId ?? "anonymous",
      categories: {
        consentType: params.consentType,
        purpose: params.purpose,
        granted: params.granted,
        userAgent: params.userAgent ?? null,
      },
      policyVersion: PRIVACY_POLICY_VERSION,
      ipAddress: ip,
    },
  });
}

/**
 * Records granular cookie/privacy banner consent categories (DPDP Act 2023).
 */
export async function recordCookieConsent(params: {
  userId: string | null;
  anonymousId: string;
  policyVersion: string;
  categories: {
    strictlyNecessary: boolean;
    preferences: boolean;
    analytics: boolean;
    marketing: boolean;
  };
  ipAddress: string | null;
}): Promise<void> {
  const ip = params.ipAddress ?? "127.0.0.1";
  memConsentRecords.push({
    id: `consent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: params.userId,
    anonymousId: params.anonymousId,
    consentType: "COOKIE_BANNER_PREFERENCES",
    purpose: JSON.stringify(params.categories),
    policyVersion: params.policyVersion,
    granted: true,
    ipAddress: ip,
    userAgent: null,
    createdAt: new Date(),
  });

  if (shouldUseMemoryDb()) {
    return;
  }

  await prisma.consentRecord.create({
    data: {
      userId: params.userId,
      anonymousId: params.anonymousId,
      categories: params.categories,
      policyVersion: params.policyVersion,
      ipAddress: ip,
    },
  });
}

/**
 * Registers a customer account:
 * - Validates PIN code serviceability server-side
 * - Equalizes timing and response message for existing vs new emails (anti-enumeration)
 * - Generates a 6-digit OTP via crypto.randomInt and stores only its HMAC-SHA256 hash
 * - Enforces Redis send cooldown (60s) and hourly limits (5/hr per account and per IP)
 * - Never fails silently on email delivery failure
 */
export async function registerCustomer(
  input: RegisterInput,
  options?: { ipAddress?: string; userAgent?: string | null }
): Promise<
  | {
      ok: true;
      email: string;
      message: string;
      verificationOtpForDev?: string;
      elapsedMs: number;
    }
  | {
      ok: false;
      code:
        | "PIN_NOT_SERVICEABLE"
        | "COOLDOWN_ACTIVE"
        | "HOURLY_LIMIT_EXCEEDED"
        | "DAILY_LIMIT_EXCEEDED"
        | "EMAIL_DOMAIN_NOT_ALLOWED"
        | "EMAIL_DELIVERY_FAILED";
      message: string;
      field?: string;
      retryAfterSeconds?: number;
    }
> {
  const startedAtMs = Date.now();
  const domainCheck = isEmailDomainAllowed(input.email);
  if (!domainCheck.allowed) {
    return {
      ok: false,
      code: "EMAIL_DOMAIN_NOT_ALLOWED",
      field: "email",
      message: USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE,
    };
  }

  const pinResult = await lookupServiceablePinCode(input.pinCode);
  if (!pinResult || !pinResult.isActive) {
    return {
      ok: false,
      code: "PIN_NOT_SERVICEABLE",
      field: "pinCode",
      message: `We do not currently deliver to PIN code ${input.pinCode}.`,
    };
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const canonicalEmail = canonicalizeEmail(input.email);
  const ipAddress = normalizeIp(options?.ipAddress);

  const rateCheck = await checkAndRecordOtpSendRateLimits({
    email: canonicalEmail,
    ipAddress,
    enforceCooldown: false,
  });
  if (!rateCheck.ok) {
    return {
      ok: false,
      code: rateCheck.code,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
      message: rateCheck.message,
    };
  }

  const existing = await getUserByEmail(canonicalEmail);
  const pwHash = await hashPassword(input.password);

  if (existing) {
    const loginUrl = `${getBaseUrl()}/login`;
    const forgotPasswordUrl = `${getBaseUrl()}/forgot-password`;
    try {
      await sendAccountAlreadyExistsEmail({
        to: input.email.trim(),
        fullName: existing.fullName,
        loginUrl,
        forgotPasswordUrl,
      });
    } catch (err) {
      await kvStore.del(buildOtpResendCooldownKey(canonicalEmail));
      await enforceMinimumDuration(startedAtMs);
      const userMessage =
        err instanceof EmailDeliveryError
          ? err.userMessage
          : USER_FACING_EMAIL_DELIVERY_ERROR;
      return {
        ok: false,
        code: "EMAIL_DELIVERY_FAILED",
        message: userMessage,
      };
    }

    await enforceMinimumDuration(startedAtMs);
    return {
      ok: true,
      email: normalizedEmail,
      message: GENERIC_REGISTER_SUCCESS_MESSAGE,
      elapsedMs: Date.now() - startedAtMs,
    };
  }

  let userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const resolvedCity = pinResult.city ?? input.city;
  const resolvedState = pinResult.state ?? input.state;

  if (shouldUseMemoryDb()) {
    memUsers.set(canonicalEmail, {
      id: userId,
      email: input.email.trim(),
      canonicalEmail,
      phone: input.phone,
      fullName: input.fullName.trim(),
      passwordHash: pwHash,
      role: "CUSTOMER",
      emailVerified: false,
      mustChangePassword: false,
      totpSecretEncrypted: null,
      totpEnabled: false,
      recoveryCodeHashes: [],
      failedLoginCount: 0,
      lockedUntil: null,
      address: {
        addressLine: input.addressLine.trim(),
        city: resolvedCity,
        state: resolvedState,
        pinCode: input.pinCode,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      },
    });
  } else {
    const created = await prisma.user.create({
      data: {
        email: input.email.trim(),
        canonicalEmail,
        phone: input.phone,
        fullName: input.fullName.trim(),
        passwordHash: pwHash,
        role: "CUSTOMER",
        isVerified: false,
        addressLine: input.addressLine.trim(),
        city: resolvedCity,
        state: resolvedState,
        pinCode: input.pinCode,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        savedAddresses: {
          create: {
            label: "Home",
            recipientName: input.fullName.trim(),
            phone: input.phone,
            addressLine: input.addressLine.trim(),
            city: resolvedCity,
            state: resolvedState,
            pinCode: input.pinCode,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            isDefault: true,
          },
        },
      },
    });
    userId = created.id;
  }

  await recordPrivacyConsent({
    userId,
    consentType: "ACCOUNT_REGISTRATION_AND_PRIVACY",
    purpose: `Customer account creation, order fulfillment, and transactional communications for ${brandConfig.name}`,
    granted: true,
    ipAddress,
    userAgent: options?.userAgent ?? null,
  });

  const rawOtp = await createAndStoreVerificationOtp({
    userId,
  });

  try {
    await sendVerificationOtpEmail({
      to: normalizedEmail,
      fullName: input.fullName.trim(),
      otpCode: rawOtp,
    });
  } catch (err) {
    await kvStore.del(buildOtpResendCooldownKey(canonicalEmail));
    await enforceMinimumDuration(startedAtMs);
    const userMessage =
      err instanceof EmailDeliveryError
        ? err.userMessage
        : USER_FACING_EMAIL_DELIVERY_ERROR;
    return {
      ok: false,
      code: "EMAIL_DELIVERY_FAILED",
      message: userMessage,
    };
  }

  await enforceMinimumDuration(startedAtMs);

  return {
    ok: true,
    email: normalizedEmail,
    message: GENERIC_REGISTER_SUCCESS_MESSAGE,
    verificationOtpForDev:
      process.env.NODE_ENV !== "production" ? rawOtp : undefined,
    elapsedMs: Date.now() - startedAtMs,
  };
}

/**
 * Verifies a 6-digit single-use OTP in constant time, enforces the 5-wrong-attempt
 * invalidation limit in Redis, activates the user account, and issues a freshly
 * rotated session.
 */
export async function verifyEmailOtp(params: {
  email?: string;
  code: string;
  previousRawSessionToken?: string | null;
  nowEpochMs?: number;
}): Promise<
  | {
      ok: true;
      userId: string;
      email: string;
      fullName: string;
      role: "CUSTOMER" | "ADMIN";
      session: SessionPayload;
      rawSessionToken: string;
      ttlSeconds: number;
    }
  | {
      ok: false;
      code:
        | "OTP_INVALID"
        | "OTP_EXPIRED"
        | "OTP_ALREADY_USED"
        | "OTP_MAX_ATTEMPTS";
      attemptsRemaining?: number;
      message: string;
    }
> {
  const startedAtMs = Date.now();
  const cleanCode = params.code.trim();
  const nowMs = params.nowEpochMs ?? Date.now();
  let user: AuthUserRecord | null = null;

  if (params.email) {
    user = await getUserByEmail(params.email);
  } else if (/^\d{6}$/.test(cleanCode)) {
    if (shouldUseMemoryDb()) {
      for (const candidate of memUsers.values()) {
        const expectedHash = hashVerificationOtp(candidate.id, cleanCode);
        if (memTokens.has(`${candidate.id}:${expectedHash}`)) {
          user = candidate;
          break;
        }
      }
    } else {
      const recentTokens = await prisma.emailToken.findMany({
        where: { purpose: "EMAIL_VERIFICATION" },
        orderBy: { createdAt: "desc" },
        take: 25,
      });
      for (const tok of recentTokens) {
        if (verifyVerificationOtpHash(tok.userId, cleanCode, tok.tokenHash)) {
          user = await getUserById(tok.userId);
          break;
        }
      }
    }
  }

  if (!user) {
    verifyVerificationOtpHash(
      "00000000-0000-0000-0000-000000000000",
      cleanCode,
      DUMMY_OTP_HASH
    );
    await enforceMinimumDuration(startedAtMs);
    return {
      ok: false,
      code: "OTP_INVALID",
      message:
        "Invalid or expired verification code. Check the 6-digit code sent to your email.",
    };
  }

  let latestUnusedToken: StoredEmailToken | null = null;
  let matchingUsedToken: StoredEmailToken | null = null;

  if (shouldUseMemoryDb()) {
    const userTokens = Array.from(memTokens.values()).filter(
      (t) => t.userId === user.id && t.purpose === "EMAIL_VERIFICATION"
    );
    for (let i = userTokens.length - 1; i >= 0; i--) {
      const tok = userTokens[i]!;
      if (!tok.usedAt && !latestUnusedToken) {
        latestUnusedToken = tok;
      } else if (
        tok.usedAt &&
        !matchingUsedToken &&
        verifyVerificationOtpHash(user.id, cleanCode, tok.tokenHash)
      ) {
        matchingUsedToken = tok;
      }
    }
  } else {
    const rows = await prisma.emailToken.findMany({
      where: {
        userId: user.id,
        purpose: "EMAIL_VERIFICATION",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    for (const r of rows) {
      const mapped: StoredEmailToken = {
        id: r.id,
        userId: r.userId,
        tokenHash: r.tokenHash,
        purpose: "EMAIL_VERIFICATION",
        expiresAt: r.expiresAt,
        usedAt: r.usedAt,
        attempts: r.attempts,
      };
      if (!mapped.usedAt && !latestUnusedToken) {
        latestUnusedToken = mapped;
      } else if (
        mapped.usedAt &&
        !matchingUsedToken &&
        verifyVerificationOtpHash(user.id, cleanCode, mapped.tokenHash)
      ) {
        matchingUsedToken = mapped;
      }
    }
  }

  if (
    matchingUsedToken &&
    (!latestUnusedToken ||
      !verifyVerificationOtpHash(user.id, cleanCode, latestUnusedToken.tokenHash))
  ) {
    await enforceMinimumDuration(startedAtMs);
    return {
      ok: false,
      code: "OTP_ALREADY_USED",
      message:
        "This verification code has already been used or replaced by a newer code. Request a new code if needed.",
    };
  }

  if (!latestUnusedToken) {
    verifyVerificationOtpHash(user.id, cleanCode, DUMMY_OTP_HASH);
    await enforceMinimumDuration(startedAtMs);
    return {
      ok: false,
      code: "OTP_INVALID",
      message:
        "Invalid or expired verification code. Check the 6-digit code sent to your email.",
    };
  }

  if ((latestUnusedToken.attempts ?? 0) >= MAX_OTP_WRONG_ATTEMPTS) {
    return {
      ok: false,
      code: "OTP_MAX_ATTEMPTS",
      attemptsRemaining: 0,
      message:
        "Too many incorrect attempts (5 of 5). This code has been invalidated. Request a new 6-digit code.",
    };
  }

  if (nowMs > latestUnusedToken.expiresAt.getTime()) {
    verifyVerificationOtpHash(user.id, cleanCode, latestUnusedToken.tokenHash);
    return {
      ok: false,
      code: "OTP_EXPIRED",
      message:
        "This verification code has expired (codes are valid for 10 minutes). Request a new code below.",
    };
  }

  const isMatch = verifyVerificationOtpHash(
    user.id,
    cleanCode,
    latestUnusedToken.tokenHash
  );

  const attemptKey = buildOtpWrongAttemptsKey(user.id);

  if (!isMatch) {
    if (shouldUseMemoryDb()) {
      if ((latestUnusedToken.attempts ?? 0) >= MAX_OTP_WRONG_ATTEMPTS || latestUnusedToken.usedAt) {
        return {
          ok: false,
          code: "OTP_MAX_ATTEMPTS",
          attemptsRemaining: 0,
          message:
            "Too many incorrect attempts (5 of 5). This code has been invalidated. Request a new 6-digit code.",
        };
      }
      latestUnusedToken.attempts = (latestUnusedToken.attempts ?? 0) + 1;
      const count = latestUnusedToken.attempts;
      await kvStore.incrWithTtl(attemptKey, Math.ceil(EMAIL_VERIFICATION_OTP_TTL_MS / 1000));
      if (count >= MAX_OTP_WRONG_ATTEMPTS) {
        latestUnusedToken.usedAt = new Date(nowMs);
        return {
          ok: false,
          code: "OTP_MAX_ATTEMPTS",
          attemptsRemaining: 0,
          message:
            "Too many incorrect attempts (5 of 5). This code has been invalidated. Request a new 6-digit code.",
        };
      }
      const remaining = MAX_OTP_WRONG_ATTEMPTS - count;
      return {
        ok: false,
        code: "OTP_INVALID",
        attemptsRemaining: remaining,
        message: `Incorrect verification code. You have ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before this code is invalidated.`,
      };
    } else {
      // Single atomic operation in PostgreSQL:
      // UPDATE email_tokens SET attempts = attempts + 1 WHERE id = ... AND attempts < 5 AND used_at IS NULL RETURNING attempts;
      const updated = await prisma.$queryRaw<Array<{ attempts: number }>>`
        UPDATE "email_tokens"
        SET "attempts" = "attempts" + 1
        WHERE "id" = ${latestUnusedToken.id}
          AND "attempts" < 5
          AND "used_at" IS NULL
        RETURNING "attempts";
      `;

      await kvStore.incrWithTtl(attemptKey, Math.ceil(EMAIL_VERIFICATION_OTP_TTL_MS / 1000));

      if (updated.length === 0) {
        // Attempts already reached 5 or token was already invalidated by a parallel request
        return {
          ok: false,
          code: "OTP_MAX_ATTEMPTS",
          attemptsRemaining: 0,
          message:
            "Too many incorrect attempts (5 of 5). This code has been invalidated. Request a new 6-digit code.",
        };
      }

      const count = updated[0]!.attempts;
      if (count >= MAX_OTP_WRONG_ATTEMPTS) {
        await prisma.emailToken.updateMany({
          where: {
            id: latestUnusedToken.id,
            usedAt: null,
          },
          data: { usedAt: new Date(nowMs) },
        });

        return {
          ok: false,
          code: "OTP_MAX_ATTEMPTS",
          attemptsRemaining: 0,
          message:
            "Too many incorrect attempts (5 of 5). This code has been invalidated. Request a new 6-digit code.",
        };
      }

      const remaining = MAX_OTP_WRONG_ATTEMPTS - count;
      return {
        ok: false,
        code: "OTP_INVALID",
        attemptsRemaining: remaining,
        message: `Incorrect verification code. You have ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before this code is invalidated.`,
      };
    }
  }

  const usedAt = new Date(nowMs);
  await kvStore.del(attemptKey);

  if (shouldUseMemoryDb()) {
    latestUnusedToken.usedAt = usedAt;
    user.emailVerified = true;
  } else {
    await prisma.$transaction([
      prisma.emailToken.update({
        where: { id: latestUnusedToken.id },
        data: { usedAt },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true },
      }),
    ]);
  }

  if (params.previousRawSessionToken) {
    await revokeSessionByRawToken(params.previousRawSessionToken);
  }

  const { rawToken, session, ttlSeconds } = await createServerSession({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });

  await enforceMinimumDuration(startedAtMs);
  return {
    ok: true,
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    session,
    rawSessionToken: rawToken,
    ttlSeconds,
  };
}

/**
 * Backward-compatible alias for verifyEmailOtp.
 */
export async function verifyEmailToken(
  codeOrParams:
    | string
    | {
        email?: string;
        code: string;
        previousRawSessionToken?: string | null;
        nowEpochMs?: number;
      },
  emailArg?: string
) {
  if (typeof codeOrParams === "string") {
    return verifyEmailOtp({
      code: codeOrParams,
      email: emailArg,
    });
  }
  return verifyEmailOtp(codeOrParams);
}

/**
 * Test helper to expire an active verification OTP in PostgreSQL or memory so
 * expiry rejection can be tested deterministically against the real database.
 */
export async function expireActiveVerificationOtpForTests(
  email: string
): Promise<void> {
  const user = await getUserByEmail(email);
  if (!user) return;
  const pastDate = new Date(Date.now() - 60_000);

  if (shouldUseMemoryDb()) {
    for (const tok of memTokens.values()) {
      if (
        tok.userId === user.id &&
        tok.purpose === "EMAIL_VERIFICATION" &&
        !tok.usedAt
      ) {
        tok.expiresAt = pastDate;
      }
    }
    return;
  }

  await prisma.emailToken.updateMany({
    where: {
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      usedAt: null,
    },
    data: {
      expiresAt: pastDate,
    },
  });
}

/**
 * Resends a 6-digit verification OTP with a 60-second cooldown and a maximum
 * of 5 sends per hour per account and per IP in Redis.
 * Returns the exact same generic response for unknown or already-verified emails.
 */
export async function resendVerificationEmail(
  email: string,
  ipAddress?: string
): Promise<
  | {
      ok: true;
      message: string;
      cooldownSeconds: number;
      verificationOtpForDev?: string;
    }
  | {
      ok: false;
      code:
        | "COOLDOWN_ACTIVE"
        | "HOURLY_LIMIT_EXCEEDED"
        | "DAILY_LIMIT_EXCEEDED"
        | "EMAIL_DELIVERY_FAILED";
      retryAfterSeconds?: number;
      message: string;
    }
> {
  const startedAtMs = Date.now();
  const canonicalEmail = canonicalizeEmail(email);
  const rateCheck = await checkAndRecordOtpSendRateLimits({
    email: canonicalEmail,
    ipAddress,
    enforceCooldown: true,
  });

  if (!rateCheck.ok) {
    return {
      ok: false,
      code: rateCheck.code,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
      message: rateCheck.message,
    };
  }

  const user = await getUserByEmail(canonicalEmail);

  if (!user || user.emailVerified) {
    await enforceMinimumDuration(startedAtMs);
    return {
      ok: true,
      message: GENERIC_RESEND_VERIFICATION_MESSAGE,
      cooldownSeconds: RESEND_COOLDOWN_SECONDS,
    };
  }

  const rawOtp = await createAndStoreVerificationOtp({
    userId: user.id,
  });

  try {
    await sendVerificationOtpEmail({
      to: user.email,
      fullName: user.fullName,
      otpCode: rawOtp,
    });
  } catch (err) {
    await kvStore.del(buildOtpResendCooldownKey(canonicalEmail));
    await enforceMinimumDuration(startedAtMs);
    const userMessage =
      err instanceof EmailDeliveryError
        ? err.userMessage
        : USER_FACING_EMAIL_DELIVERY_ERROR;
    return {
      ok: false,
      code: "EMAIL_DELIVERY_FAILED",
      message: userMessage,
    };
  }

  await enforceMinimumDuration(startedAtMs);
  return {
    ok: true,
    message: GENERIC_RESEND_VERIFICATION_MESSAGE,
    cooldownSeconds: RESEND_COOLDOWN_SECONDS,
    verificationOtpForDev:
      process.env.NODE_ENV !== "production" ? rawOtp : undefined,
  };
}

/**
 * Allows a user who mistyped their email during registration to update their
 * unverified account's email address after confirming their password, and sends
 * a fresh 6-digit OTP to the new address while invalidating older codes.
 */
export async function changeUnverifiedEmail(params: {
  currentEmail: string;
  newEmail: string;
  password: string;
  ipAddress?: string;
}): Promise<
  | {
      ok: true;
      newEmail: string;
      verificationOtpForDev?: string;
    }
  | {
      ok: false;
      code:
        | "INVALID_CREDENTIALS"
        | "ALREADY_VERIFIED"
        | "EMAIL_TAKEN"
        | "EMAIL_DOMAIN_NOT_ALLOWED"
        | "COOLDOWN_ACTIVE"
        | "HOURLY_LIMIT_EXCEEDED"
        | "DAILY_LIMIT_EXCEEDED"
        | "EMAIL_DELIVERY_FAILED";
      field?: string;
      retryAfterSeconds?: number;
      message: string;
    }
> {
  const domainCheck = isEmailDomainAllowed(params.newEmail);
  if (!domainCheck.allowed) {
    return {
      ok: false,
      code: "EMAIL_DOMAIN_NOT_ALLOWED",
      field: "newEmail",
      message: USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE,
    };
  }

  const currentCanonical = canonicalizeEmail(params.currentEmail);
  const newCanonical = canonicalizeEmail(params.newEmail);
  const newDisplay = params.newEmail.trim();

  const user = await getUserByEmail(currentCanonical);
  if (!user) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Could not verify your original email and password.",
    };
  }

  const validPw = await verifyPassword(user.passwordHash, params.password);
  if (!validPw) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Could not verify your original email and password.",
    };
  }

  if (user.emailVerified) {
    return {
      ok: false,
      code: "ALREADY_VERIFIED",
      message: "Your email address is already verified. You can sign in directly.",
    };
  }

  const existingTarget = await getUserByEmail(newCanonical);
  if (existingTarget && existingTarget.id !== user.id) {
    return {
      ok: false,
      code: "EMAIL_TAKEN",
      message: "Unable to switch to that email address. Try another address.",
    };
  }

  const rateCheck = await checkAndRecordOtpSendRateLimits({
    email: newCanonical,
    ipAddress: params.ipAddress,
    enforceCooldown: false,
  });
  if (!rateCheck.ok) {
    return {
      ok: false,
      code: rateCheck.code,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
      message: rateCheck.message,
    };
  }

  if (shouldUseMemoryDb()) {
    memUsers.delete(user.email.toLowerCase());
    memUsers.delete(user.canonicalEmail);
    user.email = newDisplay;
    user.canonicalEmail = newCanonical;
    memUsers.set(newDisplay.toLowerCase(), user);
    memUsers.set(newCanonical, user);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newDisplay,
        canonicalEmail: newCanonical,
      },
    });
  }

  const rawOtp = await createAndStoreVerificationOtp({
    userId: user.id,
  });

  try {
    await sendVerificationOtpEmail({
      to: newDisplay,
      fullName: user.fullName,
      otpCode: rawOtp,
    });
  } catch (err) {
    await kvStore.del(buildOtpResendCooldownKey(newCanonical));
    const userMessage =
      err instanceof EmailDeliveryError
        ? err.userMessage
        : USER_FACING_EMAIL_DELIVERY_ERROR;
    return {
      ok: false,
      code: "EMAIL_DELIVERY_FAILED",
      message: userMessage,
    };
  }

  return {
    ok: true,
    newEmail: newDisplay,
    verificationOtpForDev:
      process.env.NODE_ENV !== "production" ? rawOtp : undefined,
  };
}

export async function doesEmailRequireTurnstileOnLogin(
  email: string,
  ipAddress?: string
): Promise<boolean> {
  const pairAttemptsRaw = await kvStore.get(
    buildLoginAttemptKey(email, ipAddress)
  );
  const globalAttemptsRaw = await kvStore.get(
    buildGlobalAccountFailureKey(email)
  );
  const pairAttempts = pairAttemptsRaw ? Number(pairAttemptsRaw) : 0;
  const globalAttempts = globalAttemptsRaw ? Number(globalAttemptsRaw) : 0;
  return (
    pairAttempts >= LOGIN_TURNSTILE_THRESHOLD ||
    globalAttempts >= LOGIN_TURNSTILE_THRESHOLD
  );
}

export async function getGlobalAccountFailureCount(
  email: string
): Promise<number> {
  const raw = await kvStore.get(buildGlobalAccountFailureKey(email));
  return raw ? Number(raw) : 0;
}

export async function getAccountLoginNotBeforeEpochMs(
  email: string
): Promise<number> {
  const raw = await kvStore.get(buildGlobalAccountNotBeforeKey(email));
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loginCustomer(
  params: {
    email: string;
    password: string;
    previousRawSessionToken?: string | null;
    nowEpochMs?: number;
  },
  ipAddress?: string
): Promise<
  | {
      ok: true;
      session: SessionPayload;
      rawSessionToken: string;
      ttlSeconds: number;
      appliedDelayMs: number;
    }
  | {
      ok: false;
      code:
        | "INVALID_CREDENTIALS"
        | "ACCOUNT_LOCKED"
        | "IP_RATE_LIMITED"
        | "LOGIN_BACKOFF_ACTIVE";
      message: string;
      requireTurnstile: boolean;
      lockedSecondsRemaining?: number;
      retryAfterSeconds?: number;
      notBeforeEpochMs?: number;
      appliedDelayMs: number;
      globalAccountFailures: number;
    }
> {
  const normalized = params.email.trim().toLowerCase();
  const nowMs = params.nowEpochMs ?? Date.now();
  const lockKey = buildLoginLockKey(normalized, ipAddress);
  const attemptKey = buildLoginAttemptKey(normalized, ipAddress);
  const globalAttemptKey = buildGlobalAccountFailureKey(normalized);
  const globalNotBeforeKey = buildGlobalAccountNotBeforeKey(normalized);
  const ipSprayKey = buildLoginIpSprayKey(ipAddress);

  const notBeforeEpochMs = await getAccountLoginNotBeforeEpochMs(normalized);
  if (notBeforeEpochMs > nowMs) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((notBeforeEpochMs - nowMs) / 1000)
    );
    const currentGlobalFailures =
      await getGlobalAccountFailureCount(normalized);
    return {
      ok: false,
      code: "LOGIN_BACKOFF_ACTIVE",
      message: `Too many rapid sign-in attempts for this account. Please wait ${retryAfterSeconds} seconds before trying again.`,
      requireTurnstile: true,
      retryAfterSeconds,
      notBeforeEpochMs,
      appliedDelayMs: 0,
      globalAccountFailures: currentGlobalFailures,
    };
  }

  const ipSprayState = await kvStore.incrWithTtl(
    ipSprayKey,
    LOGIN_IP_RATE_LIMIT_WINDOW_SECONDS
  );
  if (ipSprayState.count > LOGIN_IP_RATE_LIMIT_MAX) {
    const currentGlobalFailures =
      await getGlobalAccountFailureCount(normalized);
    return {
      ok: false,
      code: "IP_RATE_LIMITED",
      message:
        "Too many sign-in attempts from your network. Please wait 15 minutes before trying again.",
      requireTurnstile: true,
      lockedSecondsRemaining: ipSprayState.ttlSeconds,
      retryAfterSeconds: ipSprayState.ttlSeconds,
      appliedDelayMs: 0,
      globalAccountFailures: currentGlobalFailures,
    };
  }

  const lockState = await kvStore.get(lockKey);
  if (lockState) {
    const currentGlobalFailures =
      await getGlobalAccountFailureCount(normalized);
    return {
      ok: false,
      code: "ACCOUNT_LOCKED",
      message:
        "Too many failed sign-in attempts from this network. Wait 15 minutes or reset your password via email to unlock immediately.",
      requireTurnstile: true,
      lockedSecondsRemaining: LOGIN_LOCKOUT_SECONDS,
      retryAfterSeconds: LOGIN_LOCKOUT_SECONDS,
      appliedDelayMs: 0,
      globalAccountFailures: currentGlobalFailures,
    };
  }

  const user = await getUserByEmail(normalized);

  const recordFailedAttempt = async () => {
    const [{ count: pairCount }, { count: globalCount }] = await Promise.all([
      kvStore.incrWithTtl(attemptKey, LOGIN_LOCKOUT_SECONDS),
      kvStore.incrWithTtl(globalAttemptKey, LOGIN_LOCKOUT_SECONDS),
    ]);

    const nextBackoffMs = computeLoginEscalatingDelayMs(globalCount);
    let nextNotBeforeEpochMs: number | undefined;
    let retryAfterSeconds: number | undefined;

    if (nextBackoffMs > 0) {
      nextNotBeforeEpochMs = nowMs + nextBackoffMs;
      retryAfterSeconds = Math.max(1, Math.ceil(nextBackoffMs / 1000));
      await kvStore.setEx(
        globalNotBeforeKey,
        LOGIN_LOCKOUT_SECONDS,
        String(nextNotBeforeEpochMs)
      );
    }

    if (pairCount >= LOGIN_LOCKOUT_THRESHOLD) {
      await kvStore.setEx(lockKey, LOGIN_LOCKOUT_SECONDS, "locked");
      return {
        ok: false as const,
        code: "ACCOUNT_LOCKED" as const,
        message:
          "Too many failed sign-in attempts from this network. Wait 15 minutes or reset your password via email to unlock immediately.",
        requireTurnstile: true,
        lockedSecondsRemaining: LOGIN_LOCKOUT_SECONDS,
        retryAfterSeconds: LOGIN_LOCKOUT_SECONDS,
        notBeforeEpochMs: nextNotBeforeEpochMs,
        appliedDelayMs: nextBackoffMs,
        globalAccountFailures: globalCount,
      };
    }

    return {
      ok: false as const,
      code: "INVALID_CREDENTIALS" as const,
      message: GENERIC_LOGIN_ERROR_MESSAGE,
      requireTurnstile:
        pairCount >= LOGIN_TURNSTILE_THRESHOLD ||
        globalCount >= LOGIN_TURNSTILE_THRESHOLD,
      retryAfterSeconds,
      notBeforeEpochMs: nextNotBeforeEpochMs,
      appliedDelayMs: nextBackoffMs,
      globalAccountFailures: globalCount,
    };
  };

  if (!user) {
    return recordFailedAttempt();
  }

  const validPw = await verifyPassword(user.passwordHash, params.password);
  if (!validPw || !user.emailVerified) {
    return recordFailedAttempt();
  }

  await Promise.all([
    kvStore.del(attemptKey),
    kvStore.del(lockKey),
    kvStore.del(globalAttemptKey),
    kvStore.del(globalNotBeforeKey),
    kvStore.del(ipSprayKey),
  ]);

  if (params.previousRawSessionToken) {
    await revokeSessionByRawToken(params.previousRawSessionToken);
  }

  const { rawToken, session, ttlSeconds } = await createServerSession({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });

  return {
    ok: true,
    session,
    rawSessionToken: rawToken,
    ttlSeconds,
    appliedDelayMs: 0,
  };
}

/**
 * Initiates a password reset flow (kept using a single-use link for now).
 * Always returns the same generic success message whether or not the email exists.
 */
export async function requestPasswordReset(
  email: string,
  _ipAddress?: string
): Promise<{
  ok: true;
  message: string;
  resetUrlForDev?: string;
}> {
  const normalized = email.trim().toLowerCase();
  const user = await getUserByEmail(normalized);

  if (!user) {
    return {
      ok: true,
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
    };
  }

  const rawToken = await createAndStorePasswordResetToken({
    userId: user.id,
  });

  const resetUrl = `${getBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await sendPasswordResetEmail({
    to: normalized,
    fullName: user.fullName,
    resetUrl,
  });

  return {
    ok: true,
    message: GENERIC_FORGOT_PASSWORD_MESSAGE,
    resetUrlForDev:
      process.env.NODE_ENV !== "production" ? resetUrl : undefined,
  };
}

/**
 * Completes a password reset with a single-use token, clears any account lockouts,
 * and revokes all active sessions for the user.
 */
export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string,
  ipAddress?: string
): Promise<
  | { ok: true; userId: string }
  | { ok: false; code: "INVALID_OR_EXPIRED"; message: string }
> {
  const expectedHash = hashToken(rawToken);
  const now = new Date();

  if (shouldUseMemoryDb()) {
    let matched: StoredEmailToken | null = null;
    for (const tok of memTokens.values()) {
      if (
        tok.purpose === "PASSWORD_RESET" &&
        verifyTokenHash(rawToken, tok.tokenHash)
      ) {
        matched = tok;
        break;
      }
    }

    if (!matched || matched.usedAt || now > matched.expiresAt) {
      return {
        ok: false,
        code: "INVALID_OR_EXPIRED",
        message: "This password reset link is invalid or has expired.",
      };
    }

    matched.usedAt = now;
    const user = await getUserById(matched.userId);
    if (!user) {
      return {
        ok: false,
        code: "INVALID_OR_EXPIRED",
        message: "Account not found.",
      };
    }

    user.passwordHash = await hashPassword(newPassword);
    user.emailVerified = true;
    user.mustChangePassword = false;
    user.failedLoginCount = 0;
    user.lockedUntil = null;

    await Promise.all([
      kvStore.del(buildLoginLockKey(user.email, ipAddress)),
      kvStore.del(buildLoginAttemptKey(user.email, ipAddress)),
      kvStore.del(buildGlobalAccountFailureKey(user.email)),
      kvStore.del(buildGlobalAccountNotBeforeKey(user.email)),
    ]);
    await revokeAllUserSessions(user.id);

    return { ok: true, userId: user.id };
  }

  const record = await prisma.emailToken.findFirst({
    where: { tokenHash: expectedHash },
  });

  if (
    !record ||
    record.purpose !== "PASSWORD_RESET" ||
    record.usedAt !== null ||
    now > record.expiresAt
  ) {
    return {
      ok: false,
      code: "INVALID_OR_EXPIRED",
      message: "This password reset link is invalid or has expired.",
    };
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) {
    return {
      ok: false,
      code: "INVALID_OR_EXPIRED",
      message: "Account not found.",
    };
  }

  const newPwHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.emailToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPwHash,
        isVerified: true,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
  ]);

  await Promise.all([
    kvStore.del(buildLoginLockKey(user.email, ipAddress)),
    kvStore.del(buildLoginAttemptKey(user.email, ipAddress)),
    kvStore.del(buildGlobalAccountFailureKey(user.email)),
    kvStore.del(buildGlobalAccountNotBeforeKey(user.email)),
  ]);
  await revokeAllUserSessions(user.id);

  return { ok: true, userId: user.id };
}

export async function loginAdminStepOne(
  params: {
    email: string;
    password: string;
    previousRawSessionToken?: string | null;
  },
  ipAddress = "127.0.0.1"
): Promise<
  | {
      ok: true;
      adminId: string;
      email: string;
      fullName: string;
      mustChangePassword: boolean;
      totpEnabled: boolean;
      session: SessionPayload;
      rawSessionToken: string;
      ttlSeconds: number;
    }
  | {
      ok: false;
      code: "INVALID_CREDENTIALS" | "NOT_ADMIN" | "ACCOUNT_LOCKED";
      message: string;
      requireTurnstile: boolean;
    }
> {
  const normalized = params.email.trim().toLowerCase();
  const lockKey = buildLoginLockKey(normalized, ipAddress);
  if (await kvStore.get(lockKey)) {
    return {
      ok: false,
      code: "ACCOUNT_LOCKED",
      message: "Admin account is temporarily locked due to failed attempts.",
      requireTurnstile: true,
    };
  }

  const user = await getUserByEmail(normalized);
  if (!user || user.role !== "ADMIN") {
    const { count } = await kvStore.incrWithTtl(
      buildLoginAttemptKey(normalized, ipAddress),
      LOGIN_LOCKOUT_SECONDS
    );
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Invalid administrator credentials.",
      requireTurnstile: count >= LOGIN_TURNSTILE_THRESHOLD,
    };
  }

  const validPw = await verifyPassword(user.passwordHash, params.password);
  if (!validPw) {
    const { count } = await kvStore.incrWithTtl(
      buildLoginAttemptKey(normalized, ipAddress),
      LOGIN_LOCKOUT_SECONDS
    );
    if (count >= LOGIN_LOCKOUT_THRESHOLD) {
      await kvStore.setEx(lockKey, LOGIN_LOCKOUT_SECONDS, "locked");
    }
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Invalid administrator credentials.",
      requireTurnstile: count >= LOGIN_TURNSTILE_THRESHOLD,
    };
  }

  await kvStore.del(buildLoginAttemptKey(normalized, ipAddress));

  if (params.previousRawSessionToken) {
    await revokeSessionByRawToken(params.previousRawSessionToken);
  }

  const { rawToken, session, ttlSeconds } = await createServerSession({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: "ADMIN",
    totpVerified: false,
    mustChangePassword: user.mustChangePassword,
  });

  await writeAuditLog({
    actorId: user.id,
    action: "ADMIN_STEP1_AUTH_SUCCESS",
    entityType: "User",
    entityId: user.id,
    ipAddress,
  });

  return {
    ok: true,
    adminId: user.id,
    email: user.email,
    fullName: user.fullName,
    mustChangePassword: user.mustChangePassword,
    totpEnabled: user.totpEnabled,
    session,
    rawSessionToken: rawToken,
    ttlSeconds,
  };
}

export async function changeAdminFirstLoginPassword(params: {
  adminUserId: string;
  currentPassword: string;
  newPassword: string;
  ipAddress?: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      code: "INVALID_CURRENT_PASSWORD" | "SAME_PASSWORD" | "NOT_ADMIN";
      message: string;
    }
> {
  const user = await getUserById(params.adminUserId);
  if (!user || user.role !== "ADMIN") {
    return {
      ok: false,
      code: "NOT_ADMIN",
      message: "Administrator account not found.",
    };
  }

  const validCurrent = await verifyPassword(
    user.passwordHash,
    params.currentPassword
  );
  if (!validCurrent) {
    return {
      ok: false,
      code: "INVALID_CURRENT_PASSWORD",
      message: "Your current temporary password is incorrect.",
    };
  }

  if (params.currentPassword === params.newPassword) {
    return {
      ok: false,
      code: "SAME_PASSWORD",
      message:
        "Choose a new password that is different from your initial temporary password.",
    };
  }

  const newPwHash = await hashPassword(params.newPassword);

  if (shouldUseMemoryDb()) {
    const memUser = memUsers.get(user.email);
    if (memUser) {
      memUser.passwordHash = newPwHash;
      memUser.mustChangePassword = false;
    }
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPwHash,
        mustChangePassword: false,
      },
    });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "ADMIN_FIRST_LOGIN_PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
    ipAddress: params.ipAddress ?? "127.0.0.1",
  });

  return { ok: true };
}

export async function enrollAdminTotp(
  adminUserId: string,
  ipAddress = "127.0.0.1"
): Promise<
  | { ok: true; bundle: TotpEnrollmentBundle }
  | { ok: false; message: string }
> {
  const user = await getUserById(adminUserId);
  if (!user || user.role !== "ADMIN") {
    return { ok: false, message: "Administrator account not found." };
  }

  if (user.mustChangePassword) {
    return {
      ok: false,
      message: "You must change your initial password before enrolling 2FA.",
    };
  }

  const bundle = await generateAdminTotpEnrollment(user.email);

  if (shouldUseMemoryDb()) {
    const memUser = memUsers.get(user.email);
    if (memUser) {
      memUser.totpSecretEncrypted = bundle.encryptedSecretJson;
      memUser.recoveryCodeHashes = bundle.recoveryCodeHashes;
      memUser.totpEnabled = false;
    }
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecretEncrypted: bundle.encryptedSecretJson,
        totpRecoveryCodeHashes: bundle.recoveryCodeHashes,
        totpEnabled: false,
      },
    });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "ADMIN_TOTP_ENROLLMENT_STARTED",
    entityType: "User",
    entityId: user.id,
    ipAddress,
  });

  return { ok: true, bundle };
}

export async function verifyAdminSecondFactor(
  adminUserId: string,
  code: string,
  ipAddress = "127.0.0.1",
  previousRawSessionToken?: string | null
): Promise<
  | {
      ok: true;
      session: SessionPayload;
      rawSessionToken: string;
      usedRecoveryCode: boolean;
    }
  | { ok: false; message: string }
> {
  const user = await getUserById(adminUserId);
  if (!user || user.role !== "ADMIN" || !user.totpSecretEncrypted) {
    return {
      ok: false,
      message: "TOTP 2FA is not configured for this administrator.",
    };
  }

  if (user.mustChangePassword) {
    return {
      ok: false,
      message: "You must change your initial password before completing 2FA.",
    };
  }

  const secret = decryptTotpSecret(user.totpSecretEncrypted);
  const cleanCode = code.trim();

  let verifiedViaTotp = false;
  let usedRecovery = false;

  if (/^\d{6}$/.test(cleanCode)) {
    const totpCheck = await verifyAndConsumeTotpCode({
      userId: user.id,
      code: cleanCode,
      secret,
    });
    if (totpCheck.replayed) {
      return {
        ok: false,
        message:
          "This authenticator code was already used. Wait 30 seconds for the next code.",
      };
    }
    verifiedViaTotp = totpCheck.valid;
  }

  if (!verifiedViaTotp) {
    const recoveryResult = consumeRecoveryCode(
      cleanCode,
      user.recoveryCodeHashes
    );
    if (recoveryResult.matched) {
      usedRecovery = true;
      if (shouldUseMemoryDb()) {
        const memUser = memUsers.get(user.email);
        if (memUser) {
          memUser.recoveryCodeHashes = recoveryResult.remainingHashes;
          memUser.totpEnabled = true;
        }
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            totpRecoveryCodeHashes: recoveryResult.remainingHashes,
            totpEnabled: true,
          },
        });
      }
    }
  } else {
    if (!user.totpEnabled) {
      if (shouldUseMemoryDb()) {
        const memUser = memUsers.get(user.email);
        if (memUser) memUser.totpEnabled = true;
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { totpEnabled: true },
        });
      }
    }
  }

  if (!verifiedViaTotp && !usedRecovery) {
    await writeAuditLog({
      actorId: user.id,
      action: "ADMIN_2FA_FAILED",
      entityType: "User",
      entityId: user.id,
      ipAddress,
    });
    return {
      ok: false,
      message: "Invalid authenticator code or recovery code.",
    };
  }

  await writeAuditLog({
    actorId: user.id,
    action: usedRecovery
      ? "ADMIN_2FA_VERIFIED_RECOVERY_CODE"
      : "ADMIN_2FA_VERIFIED_TOTP",
    entityType: "User",
    entityId: user.id,
    ipAddress,
  });

  if (previousRawSessionToken) {
    await revokeSessionByRawToken(previousRawSessionToken);
  }

  const { rawToken, session } = await createServerSession({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: "ADMIN",
    totpVerified: true,
  });

  return {
    ok: true,
    session,
    rawSessionToken: rawToken,
    usedRecoveryCode: usedRecovery,
  };
}

export async function writeAuditLog(params: {
  actorId?: string;
  userId?: string;
  actorRole?: string;
  action: string;
  entityType?: string;
  targetType?: string;
  entityId?: string;
  targetId?: string;
  ipAddress?: string;
  afterState?: Record<string, unknown>;
}): Promise<void> {
  const actorId = params.actorId ?? params.userId ?? "system";
  const userId = params.userId ?? params.actorId ?? null;
  const actorRole = params.actorRole ?? "ADMIN";
  const entityType = params.entityType ?? params.targetType ?? "SYSTEM";
  const targetType = params.targetType ?? params.entityType ?? "SYSTEM";
  const entityId = params.entityId ?? params.targetId ?? "unknown";
  const targetId = params.targetId ?? params.entityId ?? "unknown";
  const ipAddress = params.ipAddress ?? "127.0.0.1";

  memAuditLogs.push({
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    actorId,
    userId,
    actorRole,
    action: params.action,
    entityType,
    targetType,
    entityId,
    targetId,
    ipAddress,
    afterState: params.afterState,
    createdAt: new Date(),
  });

  if (shouldUseMemoryDb()) {
    return;
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        actorRole,
        action: params.action,
        targetType,
        targetId,
        ipAddress,
        metadata: params.afterState ? (params.afterState as object) : undefined,
      },
    });
  } catch {
    // Already recorded in memAuditLogs above
  }
}
