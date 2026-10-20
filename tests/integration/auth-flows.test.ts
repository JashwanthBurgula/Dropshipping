import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/db";
import { kvStore } from "../../src/lib/redis";
import {
  resetAuthMemoryStoreForTests,
  registerCustomer,
  verifyEmailOtp,
  verifyEmailToken,
  expireActiveVerificationOtpForTests,
  resendVerificationEmail,
  changeUnverifiedEmail,
  loginCustomer,
  requestPasswordReset,
  resetPasswordWithToken,
  loginAdminStepOne,
  changeAdminFirstLoginPassword,
  enrollAdminTotp,
  verifyAdminSecondFactor,
  getAuditLogsForTests,
  computeLoginEscalatingDelayMs,
  doesEmailRequireTurnstileOnLogin,
  getGlobalAccountFailureCount,
  REGISTRATION_MIN_DURATION_MS,
  GENERIC_LOGIN_ERROR_MESSAGE,
  GENERIC_REGISTER_SUCCESS_MESSAGE,
  GENERIC_RESEND_VERIFICATION_MESSAGE,
  GENERIC_FORGOT_PASSWORD_MESSAGE,
  buildOtpResendCooldownKey,
} from "../../src/lib/auth/service";
import {
  createServerSession,
  getSessionByRawToken,
  revokeAllUserSessions,
  setInjectedCookieAdapterForTests,
  CUSTOMER_SESSION_COOKIE,
} from "../../src/lib/auth/session";
import {
  PENDING_VERIFICATION_COOKIE_NAME,
  createSignedPendingVerificationCookieValue,
  verifySignedPendingVerificationCookieValue,
} from "../../src/lib/auth/verification-cookie";
import { generateCurrentTotpCode } from "../../src/lib/auth/totp";
import {
  getLocalInboxMessages,
  clearLocalInboxForTests,
  assertEmailProviderConfig,
  setSimulateEmailFailureForTests,
  USER_FACING_EMAIL_DELIVERY_ERROR,
} from "../../src/lib/email";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  createSignedCsrfToken,
} from "../../src/lib/csrf";
import { hashVerificationOtp } from "../../src/lib/crypto";
import { POST as postLoginRoute } from "../../src/app/api/auth/login/route";
import { POST as postRegisterRoute } from "../../src/app/api/auth/register/route";
import { POST as postVerifyEmailRoute } from "../../src/app/api/auth/verify-email/route";

function extractTokenFromUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("Expected password reset URL in test mode.");
  }
  const parsed = new URL(url);
  const token = parsed.searchParams.get("token");
  if (!token) {
    throw new Error(`No token parameter found in URL: ${url}`);
  }
  return token;
}

describe("Phase 2 & Urgent OTP Fix Integration Tests (Real PostgreSQL 16 + Redis 7)", () => {
  beforeEach(async () => {
    setSimulateEmailFailureForTests(false);
    clearLocalInboxForTests();
    await resetAuthMemoryStoreForTests();
  });

  it("connects to real PostgreSQL 16 and Redis 7 instances", async () => {
    const redisPong = await kvStore.ping();
    expect(redisPong).toBe("PONG");

    const dbRow = await prisma.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`;
    expect(dbRow[0]?.one).toBe(1);
  });

  it("STEP 6: (1) Correct 6-digit OTP verifies and signs in with rotated session, (2) wrong code increments attempts, (3) 5 wrong attempts invalidate the code, (4) expired code rejected, (5) reused code rejected, and (6) new code invalidates the old one", async () => {
    // Register user 1 to test wrong attempts (1..4) and 5th wrong attempt invalidation
    const regAttempts = await registerCustomer(
      {
        fullName: "Kiran Bhat",
        email: "kiran.otp@gmail.com",
        phone: "9845011220",
        password: "Stoneware#Kiln2026",
        addressLine: "14 Residency Road",
        pinCode: "560001",
        city: "Bengaluru",
        state: "Karnataka",
        privacyConsent: true,
      },
      { ipAddress: "198.51.100.21" }
    );
    expect(regAttempts.ok).toBe(true);
    if (!regAttempts.ok) return;

    const firstOtp = regAttempts.verificationOtpForDev!;
    expect(firstOtp).toMatch(/^\d{6}$/);

    // Verify only the HMAC hash (never the raw 6-digit OTP) is stored in PostgreSQL 16
    const dbUser = await prisma.user.findUnique({
      where: { email: "kiran.otp@gmail.com" },
      include: { emailTokens: true },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.emailTokens[0]?.tokenHash).not.toBe(firstOtp);
    expect(dbUser?.emailTokens[0]?.tokenHash).toHaveLength(64);

    const wrongCode = firstOtp === "000000" ? "111111" : "000000";

    // Wrong attempts 1 through 4 increment Redis counter and report remaining attempts
    for (let attempt = 1; attempt <= 4; attempt++) {
      const wrongRes = await verifyEmailOtp({
        email: "kiran.otp@gmail.com",
        code: wrongCode,
      });
      expect(wrongRes.ok).toBe(false);
      if (!wrongRes.ok) {
        expect(wrongRes.code).toBe("OTP_INVALID");
        expect(wrongRes.attemptsRemaining).toBe(5 - attempt);
      }
      const redisCount = await kvStore.get(
        `verify_otp_attempts:${dbUser!.id}`
      );
      expect(Number(redisCount)).toBe(attempt);
    }

    // 5th wrong attempt invalidates the code in PostgreSQL and requires a resend
    const fifthWrong = await verifyEmailOtp({
      email: "kiran.otp@gmail.com",
      code: wrongCode,
    });
    expect(fifthWrong.ok).toBe(false);
    if (!fifthWrong.ok) {
      expect(fifthWrong.code).toBe("OTP_MAX_ATTEMPTS");
      expect(fifthWrong.attemptsRemaining).toBe(0);
    }

    // Even supplying the original correct OTP after 5 wrong attempts is rejected because the code was invalidated
    const tryValidAfterInvalidation = await verifyEmailOtp({
      email: "kiran.otp@gmail.com",
      code: firstOtp,
    });
    expect(tryValidAfterInvalidation.ok).toBe(false);
    if (!tryValidAfterInvalidation.ok) {
      expect(tryValidAfterInvalidation.code).toBe("OTP_ALREADY_USED");
    }

    // Clear cooldown in Redis so we can issue a new code and test:
    // (6) New code invalidates the old one & (4) Expired code rejected & (1) Correct code verifies and signs in & (5) Reused code rejected
    await kvStore.del(buildOtpResendCooldownKey("kiran.otp@gmail.com"));
    const secondSend = await resendVerificationEmail(
      "kiran.otp@gmail.com",
      "198.51.100.22"
    );
    expect(secondSend.ok).toBe(true);
    if (!secondSend.ok) return;
    const secondOtp = secondSend.verificationOtpForDev!;

    // Issue a 3rd OTP: this must invalidate secondOtp
    await kvStore.del(buildOtpResendCooldownKey("kiran.otp@gmail.com"));
    const thirdSend = await resendVerificationEmail(
      "kiran.otp@gmail.com",
      "198.51.100.23"
    );
    expect(thirdSend.ok).toBe(true);
    if (!thirdSend.ok) return;
    const thirdOtp = thirdSend.verificationOtpForDev!;

    if (secondOtp !== thirdOtp) {
      const oldOtpAttempt = await verifyEmailOtp({
        email: "kiran.otp@gmail.com",
        code: secondOtp,
      });
      expect(oldOtpAttempt.ok).toBe(false);
      if (!oldOtpAttempt.ok) {
        expect(oldOtpAttempt.code).toBe("OTP_ALREADY_USED");
      }
    }

    // (4) Expired code rejected: expire thirdOtp in PostgreSQL 16 and confirm rejection
    await expireActiveVerificationOtpForTests("kiran.otp@gmail.com");
    const expiredAttempt = await verifyEmailOtp({
      email: "kiran.otp@gmail.com",
      code: thirdOtp,
    });
    expect(expiredAttempt.ok).toBe(false);
    if (!expiredAttempt.ok) {
      expect(expiredAttempt.code).toBe("OTP_EXPIRED");
    }

    // Send a 4th fresh OTP and verify with a pre-existing session to confirm session rotation on verification
    await kvStore.del(buildOtpResendCooldownKey("kiran.otp@gmail.com"));
    const fourthSend = await resendVerificationEmail(
      "kiran.otp@gmail.com",
      "198.51.100.24"
    );
    expect(fourthSend.ok).toBe(true);
    if (!fourthSend.ok) return;
    const fourthOtp = fourthSend.verificationOtpForDev!;

    const preVerifySession = await createServerSession({
      userId: dbUser!.id,
      email: "kiran.otp@gmail.com",
      fullName: "Kiran Bhat",
      role: "CUSTOMER",
    });

    // (1) Correct code verifies and signs in with freshly rotated session
    const validVerify = await verifyEmailOtp({
      email: "kiran.otp@gmail.com",
      code: fourthOtp,
      previousRawSessionToken: preVerifySession.rawToken,
    });
    expect(validVerify.ok).toBe(true);
    if (!validVerify.ok) return;

    expect(validVerify.rawSessionToken).not.toBe(preVerifySession.rawToken);
    expect(await getSessionByRawToken(preVerifySession.rawToken)).toBeNull();
    const activeSession = await getSessionByRawToken(
      validVerify.rawSessionToken
    );
    expect(activeSession).not.toBeNull();
    expect(activeSession?.email).toBe("kiran.otp@gmail.com");

    // (5) Reused code rejected
    const reusedAttempt = await verifyEmailOtp({
      email: "kiran.otp@gmail.com",
      code: fourthOtp,
    });
    expect(reusedAttempt.ok).toBe(false);
    if (!reusedAttempt.ok) {
      expect(reusedAttempt.code).toBe("OTP_ALREADY_USED");
    }
  });

  it("STEP 6: (7) Enforces 60s resend cooldown and max 5 sends per hour per account and per IP in Redis, and (8) returns generic response for unknown email", async () => {
    const reg = await registerCustomer(
      {
        fullName: "Deepa Menon",
        email: "deepa.limits@gmail.com",
        phone: "9845033445",
        password: "Stoneware#Kiln2026",
        addressLine: "100 Feet Road, Indiranagar",
        pinCode: "560038",
        city: "Bengaluru",
        state: "Karnataka",
        privacyConsent: true,
      },
      { ipAddress: "198.51.100.50" }
    );
    expect(reg.ok).toBe(true);

    // Immediate resend within 60 seconds is blocked by Redis cooldown
    const immediateResend = await resendVerificationEmail(
      "deepa.limits@gmail.com",
      "198.51.100.51"
    );
    expect(immediateResend.ok).toBe(false);
    if (!immediateResend.ok) {
      expect(immediateResend.code).toBe("COOLDOWN_ACTIVE");
      expect(immediateResend.retryAfterSeconds).toBeGreaterThan(0);
    }

    // Simulate cooldown expiry 4 times (total 1 initial send + 4 resends = 5 sends for this account)
    for (let i = 2; i <= 5; i++) {
      await kvStore.del(buildOtpResendCooldownKey("deepa.limits@gmail.com"));
      const resendOk = await resendVerificationEmail(
        "deepa.limits@gmail.com",
        `198.51.100.${50 + i}`
      );
      expect(resendOk.ok).toBe(true);
    }

    // 6th send in the same hour for the same account is rejected with HOURLY_LIMIT_EXCEEDED
    await kvStore.del(buildOtpResendCooldownKey("deepa.limits@gmail.com"));
    const sixthAccountSend = await resendVerificationEmail(
      "deepa.limits@gmail.com",
      "198.51.100.99"
    );
    expect(sixthAccountSend.ok).toBe(false);
    if (!sixthAccountSend.ok) {
      expect(sixthAccountSend.code).toBe("HOURLY_LIMIT_EXCEEDED");
    }

    // Per-IP hourly limit (5 sends/hr from the same IP across different accounts)
    const sharedIp = "203.0.113.77";
    for (let i = 1; i <= 5; i++) {
      const ipSend = await resendVerificationEmail(
        `unknown.user.${i}@gmail.com`,
        sharedIp
      );
      expect(ipSend.ok).toBe(true);
      if (ipSend.ok) {
        // (8) Unknown email gets the exact same generic response
        expect(ipSend.message).toBe(GENERIC_RESEND_VERIFICATION_MESSAGE);
      }
    }

    const sixthIpSend = await resendVerificationEmail(
      "unknown.user.6@gmail.com",
      sharedIp
    );
    expect(sixthIpSend.ok).toBe(false);
    if (!sixthIpSend.ok) {
      expect(sixthIpSend.code).toBe("HOURLY_LIMIT_EXCEEDED");
    }
  });

  it("STEP 6: (9) Keeps email address absent from URLs (using signed HttpOnly cookie), verifies OTP email has no links, and (10) refuses console or placeholder email config in production and never fails silently", async () => {
    clearLocalInboxForTests();

    const csrfToken = createSignedCsrfToken();
    const registerReq = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: csrfToken,
        cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
        "x-forwarded-for": "198.51.100.88",
      },
      body: JSON.stringify({
        fullName: "Ananya Iyer",
        email: "ananya.privacy@gmail.com",
        phone: "9845044556",
        password: "Stoneware#Kiln2026",
        addressLine: "19 Church Street",
        pinCode: "560001",
        city: "Bengaluru",
        state: "Karnataka",
        privacyConsent: true,
        returnTo: "/catalogue?category=Tableware+%26+Ceramics",
        turnstileToken: "dev-turnstile-token",
        formLoadedAt: Date.now() - 5000,
      }),
    });

    const registerRes = await postRegisterRoute(registerReq);
    expect(registerRes.status).toBe(201);
    const registerBody = (await registerRes.json()) as {
      ok: boolean;
      redirectUrl: string;
      verificationOtpForDev?: string;
    };
    expect(registerBody.ok).toBe(true);
    // Redirect URL must be "/verify-email" with NO email address in the URL
    expect(registerBody.redirectUrl).toBe("/verify-email");
    expect(registerBody.redirectUrl).not.toContain("ananya.privacy");
    expect(registerBody.redirectUrl).not.toContain("?");

    // Confirm OTP email in inbox has subject "Your Kala & Kiln verification code" and NO links
    const inbox = getLocalInboxMessages("ananya.privacy@gmail.com");
    expect(inbox.length).toBe(1);
    const otpMail = inbox[0]!;
    expect(otpMail.subject).toBe("Your Kala & Kiln verification code");
    expect(otpMail.text).toContain(registerBody.verificationOtpForDev!);
    expect(otpMail.text).toContain("10 minutes");
    expect(otpMail.text.toLowerCase()).toContain("ignore");
    expect(otpMail.html.toLowerCase()).not.toContain("<a ");
    expect(otpMail.text.toLowerCase()).not.toContain("http://");
    expect(otpMail.text.toLowerCase()).not.toContain("https://");

    // Verify signed HttpOnly cookie encodes and verifies email + returnTo without exposing email in URLs
    const signedCookie = createSignedPendingVerificationCookieValue({
      email: "ananya.privacy@gmail.com",
      returnTo: "/catalogue?category=Tableware+%26+Ceramics",
    });
    const decodedCookie =
      verifySignedPendingVerificationCookieValue(signedCookie);
    expect(decodedCookie).toEqual({
      email: "ananya.privacy@gmail.com",
      returnTo: "/catalogue?category=Tableware+%26+Ceramics",
    });

    const testCookieStore = new Map<string, { value: string; options: any }>();
    setInjectedCookieAdapterForTests({
      get: (name) => {
        const item = testCookieStore.get(name);
        return item ? { value: item.value } : undefined;
      },
      set: (name, value, options) => {
        testCookieStore.set(name, { value, options });
      },
    });

    const verifyReq = new Request(
      "http://localhost:3000/api/auth/verify-email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
          cookie: `${CSRF_COOKIE_NAME}=${csrfToken}; ${PENDING_VERIFICATION_COOKIE_NAME}=${signedCookie}`,
        },
        body: JSON.stringify({
          code: registerBody.verificationOtpForDev,
          email: "ananya.privacy@gmail.com",
          returnTo: "/catalogue?category=Tableware+%26+Ceramics",
        }),
      }
    );
    let verifyRes: Response;
    try {
      verifyRes = await postVerifyEmailRoute(verifyReq);
    } finally {
      setInjectedCookieAdapterForTests(null);
    }
    expect(verifyRes.status).toBe(200);
    const sessionCookieRecord = testCookieStore.get(CUSTOMER_SESSION_COOKIE);
    expect(sessionCookieRecord).toBeDefined();
    expect(sessionCookieRecord?.options.httpOnly).toBe(true);
    expect(sessionCookieRecord?.options.sameSite).toBe("lax");
    const verifyBody = (await verifyRes.json()) as {
      ok: boolean;
      redirectTo: string;
    };
    expect(verifyBody.ok).toBe(true);
    expect(verifyBody.redirectTo).toBe(
      "/catalogue?category=Tableware+%26+Ceramics"
    );

    // Static scan: confirm register, login, and verify-email pages never build `/verify-email?email=` URLs
    const registerPageSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/(auth)/register/page.tsx"),
      "utf8"
    );
    const loginPageSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/(auth)/login/page.tsx"),
      "utf8"
    );
    expect(registerPageSrc).not.toContain('searchParams.set("email"');
    expect(loginPageSrc).not.toContain("/verify-email?email=");

    // (10) Production refuses console or placeholder email config
    expect(() =>
      assertEmailProviderConfig(
        {
          NODE_ENV: "production",
          DEPLOYMENT_TARGET: "production",
          EMAIL_PROVIDER: "console",
          EMAIL_FROM: "Kala & Kiln <orders@kalaandkiln.in>",
        } as unknown as NodeJS.ProcessEnv,
        { enforceProduction: true }
      )
    ).toThrow(/EMAIL_PROVIDER cannot be 'console' in production/i);

    expect(() =>
      assertEmailProviderConfig(
        {
          NODE_ENV: "production",
          DEPLOYMENT_TARGET: "production",
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "re_placeholder",
          EMAIL_FROM: "Kala & Kiln <orders@kalaandkiln.in>",
        } as unknown as NodeJS.ProcessEnv,
        { enforceProduction: true }
      )
    ).toThrow(/requires a valid non-placeholder RESEND_API_KEY/i);

    expect(() =>
      assertEmailProviderConfig(
        {
          NODE_ENV: "production",
          DEPLOYMENT_TARGET: "production",
          EMAIL_PROVIDER: "smtp",
          SMTP_HOST: "smtp.gmail.com",
          SMTP_PORT: "587",
          SMTP_USER: "placeholder_user@gmail.com",
          SMTP_PASS: "placeholder_app_password",
          EMAIL_FROM: "Kala & Kiln <orders@kalaandkiln.in>",
        } as unknown as NodeJS.ProcessEnv,
        { enforceProduction: true }
      )
    ).toThrow(/requires non-placeholder SMTP_HOST/i);

    // Non-silent email failure: returns clear user message without revealing if account exists
    setSimulateEmailFailureForTests(true);
    const failedDeliveryReg = await registerCustomer({
      fullName: "Delivery Fail Test",
      email: "delivery.fail@gmail.com",
      phone: "9845066778",
      password: "Stoneware#Kiln2026",
      addressLine: "12 MG Road",
      pinCode: "560001",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(failedDeliveryReg.ok).toBe(false);
    if (!failedDeliveryReg.ok) {
      expect(failedDeliveryReg.code).toBe("EMAIL_DELIVERY_FAILED");
      expect(failedDeliveryReg.message).toBe(USER_FACING_EMAIL_DELIVERY_ERROR);
    }
    setSimulateEmailFailureForTests(false);
  });

  it("rejects unserviceable PIN codes on registration with a clear message", async () => {
    const res = await registerCustomer({
      fullName: "Arjun Nair",
      email: "arjun@gmail.com",
      phone: "9845011223",
      password: "Stoneware#Kiln2026",
      addressLine: "14 Hill Road",
      pinCode: "999999",
      city: "Unknown",
      state: "Unknown",
      privacyConsent: true,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("PIN_NOT_SERVICEABLE");
      expect(res.field).toBe("pinCode");
    }
  });

  it("returns the exact same generic response for existing and unknown emails on registration, login, and forgot-password (anti-enumeration)", async () => {
    const firstReg = await registerCustomer({
      fullName: "Kavita Rao",
      email: "kavita@gmail.com",
      phone: "9845012399",
      password: "Stoneware#Kiln2026",
      addressLine: "12 MG Road",
      pinCode: "560001",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(firstReg.ok).toBe(true);

    const duplicateReg = await registerCustomer({
      fullName: "Kavita Rao",
      email: "kavita@gmail.com",
      phone: "9845012399",
      password: "Stoneware#Kiln2026",
      addressLine: "12 MG Road",
      pinCode: "560001",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(duplicateReg.ok).toBe(true);
    if (firstReg.ok && duplicateReg.ok) {
      expect(firstReg.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
      expect(duplicateReg.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
    }

    const unknownLogin = await loginCustomer({
      email: "nonexistent@gmail.com",
      password: "Stoneware#Kiln2026",
    });
    const unverifiedLogin = await loginCustomer({
      email: "kavita@gmail.com",
      password: "Stoneware#Kiln2026",
    });
    expect(unknownLogin.ok).toBe(false);
    expect(unverifiedLogin.ok).toBe(false);
    if (!unknownLogin.ok && !unverifiedLogin.ok) {
      expect(unknownLogin.message).toBe(GENERIC_LOGIN_ERROR_MESSAGE);
      expect(unverifiedLogin.message).toBe(GENERIC_LOGIN_ERROR_MESSAGE);
    }

    const existingForgot = await requestPasswordReset("kavita@gmail.com");
    const unknownForgot = await requestPasswordReset("nobody@gmail.com");
    expect(existingForgot.ok).toBe(true);
    expect(unknownForgot.ok).toBe(true);
    expect(existingForgot.message).toBe(GENERIC_FORGOT_PASSWORD_MESSAGE);
    expect(unknownForgot.message).toBe(GENERIC_FORGOT_PASSWORD_MESSAGE);
  });

  it("rotates the session ID on login and keys lockout by (account + IP) so a third party cannot lock out a real customer", async () => {
    const reg = await registerCustomer({
      fullName: "Vikram Sethi",
      email: "vikram@gmail.com",
      phone: "9845099887",
      password: "Stoneware#Kiln2026",
      addressLine: "88 Residency Road",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    const verifiedResult = await verifyEmailToken(
      reg.verificationOtpForDev!,
      "vikram@gmail.com"
    );
    expect(verifiedResult.ok).toBe(true);
    if (!verifiedResult.ok) return;

    const preAuthSession = await createServerSession({
      userId: verifiedResult.userId,
      email: "vikram@gmail.com",
      fullName: "Vikram Sethi",
      role: "CUSTOMER",
    });

    const rotatedLogin = await loginCustomer(
      {
        email: "vikram@gmail.com",
        password: "Stoneware#Kiln2026",
        previousRawSessionToken: preAuthSession.rawToken,
      },
      "198.51.100.10"
    );
    expect(rotatedLogin.ok).toBe(true);
    if (!rotatedLogin.ok) return;

    expect(rotatedLogin.rawSessionToken).not.toBe(preAuthSession.rawToken);
    expect(await getSessionByRawToken(preAuthSession.rawToken)).toBeNull();
    expect(
      await getSessionByRawToken(rotatedLogin.rawSessionToken)
    ).not.toBeNull();

    let simNowMs = Date.now();
    for (let i = 0; i < 5; i++) {
      await loginCustomer(
        {
          email: "vikram@gmail.com",
          password: `AttackerWrongPass#${i}`,
          nowEpochMs: simNowMs,
        },
        "203.0.113.99"
      );
      simNowMs += 15_000;
    }

    const attackerBlocked = await loginCustomer(
      {
        email: "vikram@gmail.com",
        password: "Stoneware#Kiln2026",
        nowEpochMs: simNowMs,
      },
      "203.0.113.99"
    );
    expect(attackerBlocked.ok).toBe(false);
    if (!attackerBlocked.ok) {
      expect(attackerBlocked.code).toBe("ACCOUNT_LOCKED");
    }

    const legitimateCustomerLogin = await loginCustomer(
      {
        email: "vikram@gmail.com",
        password: "Stoneware#Kiln2026",
        nowEpochMs: simNowMs,
      },
      "198.51.100.10"
    );
    expect(legitimateCustomerLogin.ok).toBe(true);
  });

  it("completes full registration, blocks login until verified, enforces resend cooldown, supports change-email with fresh OTP, and logs in after verification", async () => {
    const reg = await registerCustomer({
      fullName: "Meera Krishnan",
      email: "meera.typo@gmail.com",
      phone: "9845098450",
      password: "Stoneware#Kiln2026",
      addressLine: "Flat 302, Banyan Court, Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });

    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    const prematureLogin = await loginCustomer({
      email: "meera.typo@gmail.com",
      password: "Stoneware#Kiln2026",
    });
    expect(prematureLogin.ok).toBe(false);
    if (!prematureLogin.ok) {
      expect(prematureLogin.code).toBe("INVALID_CREDENTIALS");
      expect(prematureLogin.message).toBe(GENERIC_LOGIN_ERROR_MESSAGE);
    }

    const immediateResend = await resendVerificationEmail(
      "meera.typo@gmail.com"
    );
    expect(immediateResend.ok).toBe(false);
    if (!immediateResend.ok) {
      expect(immediateResend.code).toBe("COOLDOWN_ACTIVE");
    }

    const changed = await changeUnverifiedEmail({
      currentEmail: "meera.typo@gmail.com",
      newEmail: "meera@gmail.com",
      password: "Stoneware#Kiln2026",
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;

    // Old OTP from initial registration must now be invalidated
    const oldOtp = reg.verificationOtpForDev!;
    const newOtp = changed.verificationOtpForDev!;
    if (oldOtp !== newOtp) {
      const oldVerify = await verifyEmailOtp({
        email: "meera@gmail.com",
        code: oldOtp,
      });
      expect(oldVerify.ok).toBe(false);
    }

    // Verify with the new 6-digit OTP sent to meera@gmail.com
    const verified = await verifyEmailOtp({
      email: "meera@gmail.com",
      code: newOtp,
    });
    expect(verified.ok).toBe(true);

    const login = await loginCustomer({
      email: "meera@gmail.com",
      password: "Stoneware#Kiln2026",
    });
    expect(login.ok).toBe(true);
    if (!login.ok) return;

    const session = await getSessionByRawToken(login.rawSessionToken);
    expect(session).not.toBeNull();
    expect(session?.email).toBe("meera@gmail.com");
  });

  it("enforces Turnstile after 2 failed logins, locks (account+IP) after 5 failures, and unlocks via password reset while revoking all sessions", async () => {
    const reg = await registerCustomer({
      fullName: "Rohan Deshmukh",
      email: "rohan@gmail.com",
      phone: "9820112233",
      password: "CastBrass#Tadka2026",
      addressLine: "18 Marine Drive",
      pinCode: "400001",
      city: "Mumbai",
      state: "Maharashtra",
      privacyConsent: true,
    });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    await verifyEmailOtp({
      email: "rohan@gmail.com",
      code: reg.verificationOtpForDev!,
    });

    const initialLogin = await loginCustomer({
      email: "rohan@gmail.com",
      password: "CastBrass#Tadka2026",
    });
    expect(initialLogin.ok).toBe(true);
    if (!initialLogin.ok) return;

    let simClock = Date.now();
    const fail1 = await loginCustomer({
      email: "rohan@gmail.com",
      password: "WrongPassword#1",
      nowEpochMs: simClock,
    });
    expect(fail1.ok).toBe(false);
    if (!fail1.ok) {
      expect(fail1.requireTurnstile).toBe(false);
    }

    const fail2 = await loginCustomer({
      email: "rohan@gmail.com",
      password: "WrongPassword#2",
      nowEpochMs: simClock,
    });
    expect(fail2.ok).toBe(false);
    if (!fail2.ok) {
      expect(fail2.requireTurnstile).toBe(true);
      expect(fail2.notBeforeEpochMs).toBeGreaterThan(simClock);
    }

    simClock += 15_000;
    await loginCustomer({
      email: "rohan@gmail.com",
      password: "WrongPassword#3",
      nowEpochMs: simClock,
    });
    simClock += 15_000;
    await loginCustomer({
      email: "rohan@gmail.com",
      password: "WrongPassword#4",
      nowEpochMs: simClock,
    });
    simClock += 15_000;
    const fail5 = await loginCustomer({
      email: "rohan@gmail.com",
      password: "WrongPassword#5",
      nowEpochMs: simClock,
    });
    expect(fail5.ok).toBe(false);
    if (!fail5.ok) {
      expect(fail5.code).toBe("ACCOUNT_LOCKED");
    }

    const resetReq = await requestPasswordReset("rohan@gmail.com");
    expect(resetReq.ok).toBe(true);
    expect(resetReq.resetUrlForDev).toBeDefined();

    const inbox = getLocalInboxMessages("rohan@gmail.com");
    expect(inbox.length).toBeGreaterThan(0);

    const resetToken = extractTokenFromUrl(resetReq.resetUrlForDev!);
    const resetRes = await resetPasswordWithToken(
      resetToken,
      "NewTeakwood#Box2026"
    );
    expect(resetRes.ok).toBe(true);

    const oldSessionAfterReset = await getSessionByRawToken(
      initialLogin.rawSessionToken
    );
    expect(oldSessionAfterReset).toBeNull();

    const freshLogin = await loginCustomer({
      email: "rohan@gmail.com",
      password: "NewTeakwood#Box2026",
      nowEpochMs: simClock + 15_000,
    });
    expect(freshLogin.ok).toBe(true);
    if (!freshLogin.ok) return;

    const revokedCount = await revokeAllUserSessions(
      freshLogin.session.userId
    );
    expect(revokedCount).toBe(1);
    expect(await getSessionByRawToken(freshLogin.rawSessionToken)).toBeNull();
  });

  it("authenticates Admin, enforces mandatory first-login password change, enrolls TOTP 2FA, and records audit logs", async () => {
    const initialAdminPassword =
      process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMeOnFirstLogin#2026!";

    const step1 = await loginAdminStepOne(
      {
        email: "admin@kalaandkiln.in",
        password: initialAdminPassword,
      },
      "127.0.0.1"
    );
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;

    expect(step1.mustChangePassword).toBe(true);

    const pwChanged = await changeAdminFirstLoginPassword({
      adminUserId: step1.adminId,
      currentPassword: initialAdminPassword,
      newPassword: "RotatedKilnAdmin#2026!",
      ipAddress: "127.0.0.1",
    });
    expect(pwChanged.ok).toBe(true);

    const enrollment = await enrollAdminTotp(step1.adminId, "127.0.0.1");
    expect(enrollment.ok).toBe(true);
    if (!enrollment.ok) return;

    const validCode = generateCurrentTotpCode(enrollment.bundle.secret);
    const step2 = await verifyAdminSecondFactor(
      step1.adminId,
      validCode,
      "127.0.0.1"
    );
    expect(step2.ok).toBe(true);
    if (step2.ok) {
      expect(step2.usedRecoveryCode).toBe(false);
    }

    const replayAttempt = await verifyAdminSecondFactor(
      step1.adminId,
      validCode,
      "127.0.0.1"
    );
    expect(replayAttempt.ok).toBe(false);

    const recoveryCode = enrollment.bundle.recoveryCodes[0]!;
    const recoveryStep = await verifyAdminSecondFactor(
      step1.adminId,
      recoveryCode,
      "127.0.0.1"
    );
    expect(recoveryStep.ok).toBe(true);
    if (recoveryStep.ok) {
      expect(recoveryStep.usedRecoveryCode).toBe(true);
    }

    const auditLogs = getAuditLogsForTests();
    expect(
      auditLogs.some(
        (log) => log.action === "ADMIN_FIRST_LOGIN_PASSWORD_CHANGED"
      )
    ).toBe(true);
    expect(
      auditLogs.some((log) => log.action === "ADMIN_2FA_VERIFIED_TOTP")
    ).toBe(true);
    expect(
      auditLogs.some((log) => log.action === "ADMIN_2FA_VERIFIED_RECOVERY_CODE")
    ).toBe(true);
  });

  it("Step 1.3 & Step 1.7: tracks per-account failures across all IPs, sets a Redis 'not before' timestamp (returning 429 with Retry-After instead of sleeping), and enforces a per-IP limit", async () => {
    const reg = await registerCustomer({
      fullName: "Neha Kulkarni",
      email: "neha@gmail.com",
      phone: "9845077112",
      password: "Stoneware#Kiln2026",
      addressLine: "22 Lavelle Road",
      pinCode: "560001",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    await verifyEmailOtp({
      email: "neha@gmail.com",
      code: reg.verificationOtpForDev!,
    });

    let baseClock = Date.now();

    const attemptIp1 = await loginCustomer(
      { email: "neha@gmail.com", password: "Wrong#1", nowEpochMs: baseClock },
      "192.0.2.11"
    );
    expect(attemptIp1.ok).toBe(false);
    if (!attemptIp1.ok) {
      expect(attemptIp1.globalAccountFailures).toBe(1);
      expect(attemptIp1.appliedDelayMs).toBe(0);
    }

    const attemptIp2 = await loginCustomer(
      { email: "neha@gmail.com", password: "Wrong#2", nowEpochMs: baseClock },
      "192.0.2.22"
    );
    expect(attemptIp2.ok).toBe(false);
    if (!attemptIp2.ok) {
      expect(attemptIp2.globalAccountFailures).toBe(2);
      expect(attemptIp2.requireTurnstile).toBe(true);
      expect(attemptIp2.appliedDelayMs).toBe(
        computeLoginEscalatingDelayMs(2)
      );
      expect(attemptIp2.notBeforeEpochMs).toBe(
        baseClock + computeLoginEscalatingDelayMs(2)
      );
      expect(attemptIp2.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }

    const immediateRetry = await loginCustomer(
      {
        email: "neha@gmail.com",
        password: "Stoneware#Kiln2026",
        nowEpochMs: baseClock + 100,
      },
      "192.0.2.33"
    );
    expect(immediateRetry.ok).toBe(false);
    if (!immediateRetry.ok) {
      expect(immediateRetry.code).toBe("LOGIN_BACKOFF_ACTIVE");
      expect(immediateRetry.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }

    const liveClock = Date.now() + 5_000;
    await loginCustomer(
      {
        email: "neha@gmail.com",
        password: "Wrong#3",
        nowEpochMs: liveClock,
      },
      "192.0.2.31"
    );
    const csrfToken = createSignedCsrfToken();
    const httpLoginReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: csrfToken,
        cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
        "x-forwarded-for": "192.0.2.44",
      },
      body: JSON.stringify({
        email: "neha@gmail.com",
        password: "Stoneware#Kiln2026",
        turnstileToken: "dev-turnstile-token",
        formLoadedAt: Date.now() - 5_000,
      }),
    });
    const httpLoginRes = await postLoginRoute(httpLoginReq);
    expect(httpLoginRes.status).toBe(429);
    expect(httpLoginRes.headers.get("Retry-After")).toBeTruthy();
    const httpLoginBody = await httpLoginRes.json();
    expect(httpLoginBody.code).toBe("LOGIN_BACKOFF_ACTIVE");

    expect(
      await doesEmailRequireTurnstileOnLogin("neha@gmail.com", "192.0.2.33")
    ).toBe(true);
    expect(await getGlobalAccountFailureCount("neha@gmail.com")).toBe(3);

    baseClock = liveClock;
    for (let i = 4; i <= 6; i++) {
      baseClock += 20_000;
      await loginCustomer(
        {
          email: "neha@gmail.com",
          password: `Wrong#${i}`,
          nowEpochMs: baseClock,
        },
        `192.0.2.${30 + i}`
      );
    }
    baseClock += 20_000;
    const legitimateSignIn = await loginCustomer(
      {
        email: "neha@gmail.com",
        password: "Stoneware#Kiln2026",
        nowEpochMs: baseClock,
      },
      "198.51.100.77"
    );
    expect(legitimateSignIn.ok).toBe(true);

    const sprayIp = "203.0.113.250";
    let lastSprayResult: Awaited<ReturnType<typeof loginCustomer>> | null =
      null;
    for (let i = 1; i <= 15; i++) {
      lastSprayResult = await loginCustomer(
        { email: `victim${i}@gmail.com`, password: "SprayPassword#1" },
        sprayIp
      );
    }
    expect(lastSprayResult?.ok).toBe(false);
    if (lastSprayResult && !lastSprayResult.ok) {
      expect(lastSprayResult.code).toBe("IP_RATE_LIMITED");
    }
  });

  it("Step 1.4: equalises registration response time between new and existing emails and sends the existing owner an 'Account already exists' email", async () => {
    clearLocalInboxForTests();

    const newReg = await registerCustomer({
      fullName: "Aditi Menon",
      email: "aditi@gmail.com",
      phone: "9845066554",
      password: "Stoneware#Kiln2026",
      addressLine: "9 Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(newReg.ok).toBe(true);
    if (!newReg.ok) return;

    const existingReg = await registerCustomer({
      fullName: "Aditi Menon Duplicate",
      email: "aditi@gmail.com",
      phone: "9845066554",
      password: "Stoneware#Kiln2026",
      addressLine: "9 Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(existingReg.ok).toBe(true);
    if (!existingReg.ok) return;

    expect(newReg.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
    expect(existingReg.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
    expect(newReg.elapsedMs).toBeGreaterThanOrEqual(
      REGISTRATION_MIN_DURATION_MS - 15
    );
    expect(existingReg.elapsedMs).toBeGreaterThanOrEqual(
      REGISTRATION_MIN_DURATION_MS - 15
    );

    const aditiEmails = getLocalInboxMessages("aditi@gmail.com");
    expect(aditiEmails.length).toBe(2);
    expect(
      aditiEmails.some((m) =>
        m.subject.toLowerCase().includes("account already exists")
      )
    ).toBe(true);
  });

  it("Stage 1.3: two users with the same 6-digit code both verify independently using account-scoped HMAC ${userId}:${purpose}:${code} and composite index (user_id, purpose, token_hash)", async () => {
    // 1. Register User Alpha
    const regAlpha = await registerCustomer({
      fullName: "Alpha Test User",
      email: "alpha.sharedcode@gmail.com",
      phone: "9845011111",
      password: "StrongPassword#2026A",
      addressLine: "10 Alpha Road",
      pinCode: "560001",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(regAlpha.ok).toBe(true);

    // 2. Register User Beta
    const regBeta = await registerCustomer({
      fullName: "Beta Test User",
      email: "beta.sharedcode@gmail.com",
      phone: "9845022222",
      password: "StrongPassword#2026B",
      addressLine: "20 Beta Lane",
      pinCode: "560001",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(regBeta.ok).toBe(true);

    const userAlpha = await prisma.user.findUnique({
      where: { email: "alpha.sharedcode@gmail.com" },
    });
    const userBeta = await prisma.user.findUnique({
      where: { email: "beta.sharedcode@gmail.com" },
    });
    expect(userAlpha).toBeDefined();
    expect(userBeta).toBeDefined();
    if (!userAlpha || !userBeta) return;

    // Both users receive the exact same 6-digit code: "741963"
    const sharedCode = "741963";
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const hashAlpha = hashVerificationOtp(userAlpha.id, sharedCode);
    const hashBeta = hashVerificationOtp(userBeta.id, sharedCode);

    // Confirm that the HMAC hashes are completely distinct due to ${userId} scoping
    expect(hashAlpha).not.toBe(hashBeta);

    // Insert both tokens into PostgreSQL 16 (composite index allows both without unique constraint error)
    await prisma.emailToken.create({
      data: {
        userId: userAlpha.id,
        purpose: "EMAIL_VERIFICATION",
        tokenHash: hashAlpha,
        expiresAt,
      },
    });

    await prisma.emailToken.create({
      data: {
        userId: userBeta.id,
        purpose: "EMAIL_VERIFICATION",
        tokenHash: hashBeta,
        expiresAt,
      },
    });

    // Verify User Alpha with the shared code
    const verifyAlpha = await verifyEmailOtp({
      email: "alpha.sharedcode@gmail.com",
      code: sharedCode,
    });
    expect(verifyAlpha.ok).toBe(true);

    // User Beta must still be unverified in PostgreSQL
    const freshBeta = await prisma.user.findUnique({
      where: { id: userBeta.id },
    });
    expect(freshBeta?.isVerified).toBe(false);

    // User Beta now verifies with the same shared code
    const verifyBeta = await verifyEmailOtp({
      email: "beta.sharedcode@gmail.com",
      code: sharedCode,
    });
    expect(verifyBeta.ok).toBe(true);

    const finalBeta = await prisma.user.findUnique({
      where: { id: userBeta.id },
    });
    expect(finalBeta?.isVerified).toBe(true);
  });
});
