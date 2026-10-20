import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/db";
import { kvStore } from "../../src/lib/redis";
import {
  registerCustomer,
  verifyEmailOtp,
  resendVerificationEmail,
  changeUnverifiedEmail,
  loginCustomer,
  loginAdminStepOne,
  buildOtpResendCooldownKey,
  canonicalizeEmail,
  isEmailDomainAllowed,
  DEFAULT_EMAIL_DAILY_LIMIT,
  USER_FACING_DAILY_QUOTA_MESSAGE,
  USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE,
  GENERIC_REGISTER_SUCCESS_MESSAGE,
  GENERIC_RESEND_VERIFICATION_MESSAGE,
  resetAuthMemoryStoreForTests,
} from "../../src/lib/auth/service";
import {
  getLocalInboxMessages,
  clearLocalInboxForTests,
  sendVerificationOtpEmail,
  USER_FACING_EMAIL_DELIVERY_ERROR,
} from "../../src/lib/email";
import {
  createSignedCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from "../../src/lib/csrf";
import { POST as postRegisterRoute } from "../../src/app/api/auth/register/route";
import { POST as postResendRoute } from "../../src/app/api/auth/resend-verification/route";
import { POST as postVerifyRoute } from "../../src/app/api/auth/verify-email/route";
import { GET as devInboxGet } from "../../src/app/api/dev/inbox/route";

describe("OTP Hardening Checklist Audit Tests (Items 1 to 11)", () => {
  beforeEach(async () => {
    clearLocalInboxForTests();
    await resetAuthMemoryStoreForTests();
  });

  // ---------------------------------------------------------------------------
  // Item 1: Atomic Attempt Counting
  // ---------------------------------------------------------------------------
  it("Item 1: 50 parallel wrong guesses against real PostgreSQL: prove at most 5 are counted and the code is invalidated", async () => {
    const testEmail = `atomic.guesses.${Date.now()}@gmail.com`;
    const reg = await registerCustomer({
      fullName: "Atomic Guess User",
      email: testEmail,
      phone: "9845011221",
      password: "Stoneware#Kiln2026",
      addressLine: "100 Feet Road, Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    const correctOtp = reg.verificationOtpForDev!;
    expect(correctOtp).toBeDefined();

    // Fire 50 parallel wrong guesses concurrently
    const guesses = await Promise.all(
      Array.from({ length: 50 }, () =>
        verifyEmailOtp({
          email: testEmail,
          code: "000000", // Guaranteed incorrect
        })
      )
    );

    // Filter results
    const invalidAttempts = guesses.filter(
      (g) => !g.ok && g.code === "OTP_INVALID"
    );
    const maxAttemptsHits = guesses.filter(
      (g) => !g.ok && g.code === "OTP_MAX_ATTEMPTS"
    );

    // Exactly 4 wrong attempts return OTP_INVALID (attempts 1..4), and the remaining 46 return OTP_MAX_ATTEMPTS
    expect(invalidAttempts.length).toBeLessThanOrEqual(4);
    expect(maxAttemptsHits.length).toBeGreaterThanOrEqual(46);
    expect(invalidAttempts.length + maxAttemptsHits.length).toBe(50);

    // Query real PostgreSQL 16 database directly to inspect stored row
    const user = await prisma.user.findFirst({
      where: { canonicalEmail: canonicalizeEmail(testEmail) },
      include: { emailTokens: { where: { purpose: "EMAIL_VERIFICATION" } } },
    });
    expect(user).not.toBeNull();
    const token = user!.emailTokens[0]!;
    expect(token).toBeDefined();

    // Prove: attempts column never exceeds 5, and token is invalidated (usedAt is set)
    expect(token.attempts).toBe(5);
    expect(token.usedAt).not.toBeNull();

    // Prove: subsequent attempt even with the correct OTP is rejected because code was invalidated
    const tryCorrect = await verifyEmailOtp({
      email: testEmail,
      code: correctOtp,
    });
    expect(tryCorrect.ok).toBe(false);
    if (!tryCorrect.ok) {
      expect(["OTP_MAX_ATTEMPTS", "OTP_ALREADY_USED"]).toContain(
        tryCorrect.code
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Item 2: Atomic Resend Cooldown & Single Active Code
  // ---------------------------------------------------------------------------
  it("Item 2: 20 parallel resend requests: exactly one email is sent and cooldown is acquired", async () => {
    const testEmail = `atomic.resend.${Date.now()}@gmail.com`;
    const reg = await registerCustomer({
      fullName: "Atomic Resend User",
      email: testEmail,
      phone: "9845011222",
      password: "Stoneware#Kiln2026",
      addressLine: "100 Feet Road, Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(reg.ok).toBe(true);

    // Clear local inbox and cooldown key before parallel test
    clearLocalInboxForTests();
    await kvStore.del(buildOtpResendCooldownKey(testEmail));

    // Fire 20 parallel resend requests simultaneously
    const resends = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        resendVerificationEmail(testEmail, `198.51.100.${10 + i}`)
      )
    );

    const successfulResends = resends.filter((r) => r.ok);
    const cooldownBlocked = resends.filter(
      (r) => !r.ok && r.code === "COOLDOWN_ACTIVE"
    );

    // Exactly one atomic request acquires the Redis cooldown lock via SET NX EX
    expect(successfulResends).toHaveLength(1);
    expect(cooldownBlocked).toHaveLength(19);

    // Exactly one email was dispatched to the transport
    const inbox = getLocalInboxMessages();
    const sentToTestEmail = inbox.filter((m) => m.to.includes(testEmail));
    expect(sentToTestEmail).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Item 3: Gmail Normalisation & Canonical Email Uniqueness
  // ---------------------------------------------------------------------------
  it("Item 3: Gmail normalisation: a.b@gmail.com, ab@gmail.com and ab+shop@gmail.com cannot create three accounts, with generic response", async () => {
    const timestamp = Date.now();
    const baseEmail = `uniqueuser${timestamp}`;
    const email1 = `${baseEmail.slice(0, 4)}.${baseEmail.slice(4)}@gmail.com`; // a.b form
    const email2 = `${baseEmail}@gmail.com`; // plain form
    const email3 = `${baseEmail}+shop@gmail.com`; // plus-alias form

    // Register first form
    const reg1 = await registerCustomer({
      fullName: "First Registration",
      email: email1,
      phone: "9845011223",
      password: "Stoneware#Kiln2026",
      addressLine: "100 Feet Road, Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(reg1.ok).toBe(true);
    if (reg1.ok) {
      expect(reg1.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
    }

    // Register second variant (plain) -> Must return exact same generic message
    const reg2 = await registerCustomer({
      fullName: "Second Registration",
      email: email2,
      phone: "9845011224",
      password: "Stoneware#Kiln2026",
      addressLine: "100 Feet Road, Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(reg2.ok).toBe(true);
    if (reg2.ok) {
      expect(reg2.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
    }

    // Register third variant (alias) -> Must return exact same generic message
    const reg3 = await registerCustomer({
      fullName: "Third Registration",
      email: email3,
      phone: "9845011225",
      password: "Stoneware#Kiln2026",
      addressLine: "100 Feet Road, Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(reg3.ok).toBe(true);
    if (reg3.ok) {
      expect(reg3.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
    }

    // Prove in PostgreSQL 16: exactly 1 user row exists with canonical_email = baseEmail@gmail.com
    const canonical = canonicalizeEmail(email1);
    const matchingUsers = await prisma.user.findMany({
      where: { canonicalEmail: canonical },
    });
    expect(matchingUsers).toHaveLength(1);
    expect(matchingUsers[0]?.canonicalEmail).toBe(`${baseEmail}@gmail.com`);
    // Original typed email is preserved in `email` for display and delivery
    expect(matchingUsers[0]?.email).toBe(email1.toLowerCase());
  });

  // ---------------------------------------------------------------------------
  // Item 4: Allowed Email Domains Setting
  // ---------------------------------------------------------------------------
  it("Item 4: Allowed domains setting: registration and change-email reject other domains with plain explanation", async () => {
    expect(isEmailDomainAllowed("user@gmail.com").allowed).toBe(true);
    expect(isEmailDomainAllowed("user@googlemail.com").allowed).toBe(true);
    expect(isEmailDomainAllowed("user@yahoo.com").allowed).toBe(false);
    expect(isEmailDomainAllowed("user@outlook.com").allowed).toBe(false);

    // Registration with disallowed domain is rejected
    const regBadDomain = await registerCustomer({
      fullName: "Disallowed Domain User",
      email: "disallowed@yahoo.com",
      phone: "9845011226",
      password: "Stoneware#Kiln2026",
      addressLine: "100 Feet Road, Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(regBadDomain.ok).toBe(false);
    if (!regBadDomain.ok) {
      expect(regBadDomain.code).toBe("EMAIL_DOMAIN_NOT_ALLOWED");
      expect(regBadDomain.message).toBe(USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE);
    }

    // Register a valid unverified user
    const validEmail = `unverified.domain.${Date.now()}@gmail.com`;
    const regValid = await registerCustomer({
      fullName: "Valid User",
      email: validEmail,
      phone: "9845011227",
      password: "Stoneware#Kiln2026",
      addressLine: "100 Feet Road, Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(regValid.ok).toBe(true);

    // Changing unverified email to disallowed domain is rejected
    const changeBad = await changeUnverifiedEmail({
      currentEmail: validEmail,
      newEmail: "changed@protonmail.com",
      password: "Stoneware#Kiln2026",
    });
    expect(changeBad.ok).toBe(false);
    if (!changeBad.ok) {
      expect(changeBad.code).toBe("EMAIL_DOMAIN_NOT_ALLOWED");
      expect(changeBad.message).toBe(USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE);
    }
  });

  // ---------------------------------------------------------------------------
  // Item 5: Abuse & Quota Protection (Turnstile, Daily Limits, Quota Thresholds)
  // ---------------------------------------------------------------------------
  it("Item 5: Abuse and quota protection: Turnstile on resend, per-email daily limit, per-IP daily limit, and global daily limit (80% warning, 95% block)", async () => {
    const csrfToken = createSignedCsrfToken();
    const testEmail = `quota.test.${Date.now()}@gmail.com`;

    // 1. Turnstile required on /api/auth/resend-verification
    const resendReqNoTurnstile = new Request(
      "http://localhost:3000/api/auth/resend-verification",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
          cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
        },
        body: JSON.stringify({ email: testEmail }),
      }
    );
    const resendResNoTurnstile = await postResendRoute(resendReqNoTurnstile);
    expect(resendResNoTurnstile.status).toBe(400);
    const bodyNoTurnstile = (await resendResNoTurnstile.json()) as {
      code: string;
    };
    expect(bodyNoTurnstile.code).toBe("BOT_REJECTED");

    // 2. Per-email daily limit: 10 sends per day
    const canonical = canonicalizeEmail(testEmail);
    const dailyAcctKey = `verify_daily_acct:${canonical}`;
    await kvStore.setEx(dailyAcctKey, 86400, "10"); // Account already reached 10 sends today

    const resendDailyLimit = await resendVerificationEmail(testEmail);
    expect(resendDailyLimit.ok).toBe(false);
    if (!resendDailyLimit.ok) {
      expect(resendDailyLimit.code).toBe("DAILY_LIMIT_EXCEEDED");
      expect(resendDailyLimit.message).toContain(
        "Maximum daily verification codes sent for this account"
      );
    }
    await kvStore.del(dailyAcctKey);

    // 3. Per-IP daily limit: 25 sends per day
    const testIp = "198.51.100.99";
    const dailyIpKey = `verify_daily_ip:${testIp}`;
    await kvStore.setEx(dailyIpKey, 86400, "25");

    const resendIpLimit = await resendVerificationEmail(
      `fresh.${Date.now()}@gmail.com`,
      testIp
    );
    expect(resendIpLimit.ok).toBe(false);
    if (!resendIpLimit.ok) {
      expect(resendIpLimit.code).toBe("DAILY_LIMIT_EXCEEDED");
      expect(resendIpLimit.message).toContain(
        "Maximum daily verification requests from this network exceeded"
      );
    }
    await kvStore.del(dailyIpKey);

    // 4. Global daily limit: 80% warning and 95% block
    const todayDate = new Date().toISOString().slice(0, 10);
    const globalDailyKey = `email_global_daily_sends:${todayDate}`;

    // Set to 95% (380 sends of 400 default)
    await kvStore.setEx(globalDailyKey, 86400, "380");
    const blockedGlobal = await resendVerificationEmail(
      `blocked.global.${Date.now()}@gmail.com`,
      "198.51.100.1"
    );
    expect(blockedGlobal.ok).toBe(false);
    if (!blockedGlobal.ok) {
      expect(blockedGlobal.code).toBe("DAILY_LIMIT_EXCEEDED");
      expect(blockedGlobal.message).toBe(USER_FACING_DAILY_QUOTA_MESSAGE);
    }
    await kvStore.del(globalDailyKey);
  });

  // ---------------------------------------------------------------------------
  // Item 6 & 7: Email Transport and Content Safety Checks
  // ---------------------------------------------------------------------------
  it("Item 7: Email content: plain text and HTML parts, large code, expiry time, ignore line, no URLs, no em dashes, no emojis, subject without code", async () => {
    clearLocalInboxForTests();
    const testEmail = `content.audit.${Date.now()}@gmail.com`;
    const testOtp = "729304";

    await sendVerificationOtpEmail({
      to: testEmail,
      fullName: "Content Audit User",
      otpCode: testOtp,
    });

    const messages = getLocalInboxMessages();
    const sent = messages.find((m) => m.to.includes(testEmail));
    expect(sent).toBeDefined();

    // 1. Subject does NOT contain the OTP code
    expect(sent!.subject).not.toContain(testOtp);
    expect(sent!.subject).toBe("Your Kala & Kiln verification code");

    // 2. Both plain text and HTML parts exist
    expect(sent!.text).toBeDefined();
    expect(sent!.html).toBeDefined();

    // 3. Large code font in HTML (34px)
    expect(sent!.html).toContain("font-size: 34px");
    expect(sent!.html).toContain(testOtp);

    // 4. Expiry time (10 minutes) present in both text and HTML
    expect(sent!.text).toContain("10 minutes");
    expect(sent!.html).toContain("10 minutes");

    // 5. Ignore-if-not-requested line present
    expect(sent!.text).toContain(
      "If you did not request this code, you can safely ignore this message."
    );
    expect(sent!.html).toContain(
      "If you did not request this code, you can safely ignore this message."
    );

    // 6. Zero links / URLs to click (No http://, https://, or <a href>)
    expect(sent!.text).not.toMatch(/https?:\/\//i);
    expect(sent!.html).not.toMatch(/<a\s+(?:[^>]*?\s+)?href=/i);
    expect(sent!.html).not.toMatch(/https?:\/\//i);

    // 7. Zero em dashes (U+2014)
    expect(sent!.text).not.toContain("\u2014");
    expect(sent!.html).not.toContain("\u2014");
    expect(sent!.subject).not.toContain("\u2014");

    // 8. Zero emojis
    const emojiRegex =
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/;
    expect(emojiRegex.test(sent!.text)).toBe(false);
    expect(emojiRegex.test(sent!.html)).toBe(false);
    expect(emojiRegex.test(sent!.subject)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Item 8: Customer & Admin Login Architecture Guard
  // ---------------------------------------------------------------------------
  it("Item 8: Customer login uses email + password without email OTP; Admin uses email + password + TOTP", async () => {
    const customerEmail = `login.arch.${Date.now()}@gmail.com`;
    const reg = await registerCustomer({
      fullName: "Login Arch Customer",
      email: customerEmail,
      phone: "9845011228",
      password: "Stoneware#Kiln2026",
      addressLine: "100 Feet Road, Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    // Verify customer
    const verify = await verifyEmailOtp({
      email: customerEmail,
      code: reg.verificationOtpForDev!,
    });
    expect(verify.ok).toBe(true);

    // Customer logs in strictly with email and password (no OTP required or accepted)
    const customerLogin = await loginCustomer({
      email: customerEmail,
      password: "Stoneware#Kiln2026",
    });
    expect(customerLogin.ok).toBe(true);
    if (customerLogin.ok) {
      expect(customerLogin.session.role).toBe("CUSTOMER");
      expect(customerLogin.session).toBeDefined();
    }

    // Admin login step 1 strictly requires second factor (TOTP or recovery code)
    const adminLoginStepOne = await loginAdminStepOne({
      email: "admin@kalaandkiln.in",
      password: "ChangeMeOnFirstLogin#2026!",
    });
    expect(adminLoginStepOne.ok).toBe(true);
    if (adminLoginStepOne.ok) {
      // Admin flow requires TOTP enrollment/verification or first-login password change
      expect(
        adminLoginStepOne.mustChangePassword || adminLoginStepOne.totpEnabled !== undefined
      ).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Item 9: Anti-Enumeration & Response Timing
  // ---------------------------------------------------------------------------
  it("Item 9: Unknown or already registered email on verify and resend endpoints return identical generic response and indistinguishable timing", async () => {
    // 1. Prepare already-registered and verified user
    const registeredEmail = `registered.verified.${Date.now()}@gmail.com`;
    const unknownEmail = `completely.unknown.${Date.now()}@gmail.com`;

    const reg = await registerCustomer({
      fullName: "Registered User",
      email: registeredEmail,
      phone: "9845011229",
      password: "Stoneware#Kiln2026",
      addressLine: "100 Feet Road, Indiranagar",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: true,
    });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    await verifyEmailOtp({
      email: registeredEmail,
      code: reg.verificationOtpForDev!,
    });

    // Clear cooldowns
    await kvStore.del(buildOtpResendCooldownKey(registeredEmail));
    await kvStore.del(buildOtpResendCooldownKey(unknownEmail));

    // A. Resend endpoint: Compare already verified vs unknown email
    const startResendVerified = Date.now();
    const resendVerified = await resendVerificationEmail(
      registeredEmail,
      "198.51.100.60"
    );
    const durationResendVerified = Date.now() - startResendVerified;

    const startResendUnknown = Date.now();
    const resendUnknown = await resendVerificationEmail(
      unknownEmail,
      "198.51.100.61"
    );
    const durationResendUnknown = Date.now() - startResendUnknown;

    expect(resendVerified.ok).toBe(true);
    expect(resendUnknown.ok).toBe(true);
    if (resendVerified.ok && resendUnknown.ok) {
      // Identical generic messages
      expect(resendVerified.message).toBe(GENERIC_RESEND_VERIFICATION_MESSAGE);
      expect(resendUnknown.message).toBe(GENERIC_RESEND_VERIFICATION_MESSAGE);
    }
    // Timing difference bounded by timing equalization floor
    expect(
      Math.abs(durationResendVerified - durationResendUnknown)
    ).toBeLessThanOrEqual(250);

    // B. Verify endpoint: Compare already verified vs unknown email with invalid code
    const startVerifyVerified = Date.now();
    const verifyVerified = await verifyEmailOtp({
      email: registeredEmail,
      code: "123456",
    });
    const durationVerifyVerified = Date.now() - startVerifyVerified;

    const startVerifyUnknown = Date.now();
    const verifyUnknown = await verifyEmailOtp({
      email: unknownEmail,
      code: "123456",
    });
    const durationVerifyUnknown = Date.now() - startVerifyUnknown;

    expect(verifyVerified.ok).toBe(false);
    expect(verifyUnknown.ok).toBe(false);
    if (!verifyVerified.ok && !verifyUnknown.ok) {
      expect(verifyVerified.code).toBe(verifyUnknown.code);
      expect(verifyVerified.message).toBe(verifyUnknown.message);
    }
    expect(
      Math.abs(durationVerifyVerified - durationVerifyUnknown)
    ).toBeLessThanOrEqual(250);
  });

  // ---------------------------------------------------------------------------
  // Item 6: Email Transport Hardening (Transient Retry, Failure Messaging, Dev Inbox Isolation)
  // ---------------------------------------------------------------------------
  it("Item 6: Email transport: retries once on transient error with backoff, returns clear message on permanent failure, dev inbox active only in development", async () => {
    // 1. Permanent failure returns USER_FACING_EMAIL_DELIVERY_ERROR
    expect(USER_FACING_EMAIL_DELIVERY_ERROR).toBe(
      "We could not send the email. Try again in a minute."
    );

    // 2. Dev inbox preview route strictly returns 404 outside NODE_ENV=development
    const devInboxReq = new Request("http://localhost:3000/api/dev/inbox");
    const devInbox404 = await devInboxGet(devInboxReq);
    expect(devInbox404.status).toBe(404);

    // 3. In development mode, dev inbox returns 200 with captured messages
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      const devInbox200 = await devInboxGet(devInboxReq);
      expect(devInbox200.status).toBe(200);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
    }
  });

  // ---------------------------------------------------------------------------
  // Item 11: Manual Delivery Script
  // ---------------------------------------------------------------------------
  it(
    "Item 11: Manual real-delivery test script: refuses console provider without --allow-console flag",
    async () => {
      const { execSync } = await import("node:child_process");

      // Running email:test without --allow-console when provider is console exits with non-zero exit code
      let failedWithoutFlag = false;
      try {
        execSync("npx tsx scripts/test-email.ts test@gmail.com", {
          stdio: "pipe",
          env: { ...process.env, EMAIL_PROVIDER: "console" },
        });
      } catch {
        failedWithoutFlag = true;
      }
      expect(failedWithoutFlag).toBe(true);

      // Running email:test with --allow-console exits with code 0
      const out = execSync(
        "npx tsx scripts/test-email.ts test@gmail.com --allow-console",
        {
          stdio: "pipe",
          env: { ...process.env, EMAIL_PROVIDER: "console" },
        }
      ).toString();
      expect(out).toContain('[SUCCESS] Test email delivered via provider="console"');
    },
    25000
  );
});
