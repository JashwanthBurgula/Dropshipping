import { describe, expect, it } from "vitest";
import {
  indianPhoneSchema,
  indianPinCodeSchema,
  strongPasswordSchema,
  registerSchema,
} from "../../src/lib/validation/auth";
import {
  generateSecureToken,
  hashToken,
  verifyTokenHash,
  encryptAes256Gcm,
  decryptAes256Gcm,
  buildPurgedCodPayoutUpdate,
} from "../../src/lib/crypto";
import {
  createSignedCsrfToken,
  verifySignedCsrfToken,
} from "../../src/lib/csrf";
import {
  generateAdminTotpEnrollment,
  decryptTotpSecret,
  generateCurrentTotpCode,
  verifyTotpCode,
  consumeRecoveryCode,
  encodeBase32,
  computeTotpAtUnixSeconds,
  matchTotpCodeInWindow,
  verifyAndConsumeTotpCode,
} from "../../src/lib/auth/totp";
import {
  checkPasswordPwnedRangeApi,
  hashPassword,
  verifyPassword,
} from "../../src/lib/auth/password";
import { assertTestSafetyIsolation } from "../../src/lib/test-isolation";
import { isFallbackAllowedEnvironment } from "../../src/lib/redis";
import {
  assertNoPlaceholdersInProduction,
  brandConfig,
} from "../../src/config/brand";
import { assertSeedEnvironmentAndGetAdminPassword } from "../../prisma/seed";
import { GET as devInboxGet } from "../../src/app/api/dev/inbox/route";

describe("Phase 2 & Step 1 Unit Tests: Validation, Crypto, CSRF, RFC 6238 TOTP, HIBP, and Production Guards", () => {
  it("normalizes valid Indian mobile phone numbers and rejects invalid prefixes", () => {
    expect(indianPhoneSchema.parse("+91 98450-12345")).toBe("9845012345");
    expect(indianPhoneSchema.parse("08765432109")).toBe("8765432109");
    expect(indianPhoneSchema.safeParse("5123456789").success).toBe(false);
    expect(indianPhoneSchema.safeParse("98450123").success).toBe(false);
  });

  it("validates 6-digit Indian PIN codes", () => {
    expect(indianPinCodeSchema.safeParse("560038").success).toBe(true);
    expect(indianPinCodeSchema.safeParse("060038").success).toBe(false);
    expect(indianPinCodeSchema.safeParse("56003").success).toBe(false);
  });

  it("enforces minimum 10-character passwords and rejects breached or sequential passwords", () => {
    expect(strongPasswordSchema.safeParse("Short1!").success).toBe(false);
    expect(strongPasswordSchema.safeParse("Password123!").success).toBe(false);
    expect(strongPasswordSchema.safeParse("welcome@123").success).toBe(false);
    expect(strongPasswordSchema.safeParse("Abcdefgh12!").success).toBe(false);
    expect(strongPasswordSchema.safeParse("Stoneware#Kiln2026").success).toBe(
      true
    );
  });

  it("requires explicit privacy consent on registration schema", () => {
    const invalid = registerSchema.safeParse({
      fullName: "Meera Krishnan",
      email: "meera@gmail.com",
      phone: "9845012345",
      password: "Stoneware#Kiln2026",
      addressLine: "42 Indiranagar 100 Feet Road",
      pinCode: "560038",
      city: "Bengaluru",
      state: "Karnataka",
      privacyConsent: false,
    });
    expect(invalid.success).toBe(false);
  });

  it("hashes 256-bit tokens deterministically and verifies in constant time", () => {
    const raw = generateSecureToken(32);
    expect(raw).toHaveLength(64);
    const hashed = hashToken(raw);
    expect(hashed).not.toBe(raw);
    expect(verifyTokenHash(raw, hashed)).toBe(true);
    expect(verifyTokenHash(`${raw}x`, hashed)).toBe(false);
  });

  it("encrypts and decrypts COD refund UPI/bank details with AES-256-GCM and purges after completion", () => {
    const sensitiveUpi = JSON.stringify({
      upiId: "meera.krishnan@okaxis",
      accountHolder: "Meera Krishnan",
    });
    const encrypted = encryptAes256Gcm(sensitiveUpi);
    expect(encrypted.ciphertext).not.toContain("meera.krishnan");

    const decrypted = decryptAes256Gcm(encrypted);
    expect(decrypted).toBe(sensitiveUpi);

    const purged = buildPurgedCodPayoutUpdate();
    expect(purged.codPayoutCiphertext).toBeNull();
    expect(purged.codPayoutIv).toBeNull();
    expect(purged.codPayoutAuthTag).toBeNull();
    expect(purged.codPayoutPurgedAt).toBeInstanceOf(Date);
  });

  it("signs and verifies double-submit CSRF tokens", () => {
    const token = createSignedCsrfToken();
    expect(verifySignedCsrfToken(token, token)).toBe(true);
    expect(verifySignedCsrfToken(`${token}tampered`, token)).toBe(false);
  });

  it("generates TOTP secret stored encrypted (AES-256-GCM), QR code, and consumes single-use recovery code", async () => {
    const bundle = await generateAdminTotpEnrollment("admin@kalaandkiln.in");
    expect(bundle.qrCodeDataUrl.startsWith("data:image/png;base64,")).toBe(
      true
    );
    expect(bundle.recoveryCodes).toHaveLength(8);

    // Confirm encrypted secret JSON does not contain the raw Base32 secret
    expect(bundle.encryptedSecretJson).not.toContain(bundle.secret);
    const decryptedSecret = decryptTotpSecret(bundle.encryptedSecretJson);
    expect(decryptedSecret).toBe(bundle.secret);

    const currentCode = generateCurrentTotpCode(decryptedSecret);
    expect(verifyTotpCode(currentCode, decryptedSecret)).toBe(true);

    const firstRecovery = bundle.recoveryCodes[0]!;
    const firstConsume = consumeRecoveryCode(
      firstRecovery,
      bundle.recoveryCodeHashes
    );
    expect(firstConsume.matched).toBe(true);
    expect(firstConsume.remainingHashes).toHaveLength(7);

    // Reusing the same recovery code must fail
    const secondConsume = consumeRecoveryCode(
      firstRecovery,
      firstConsume.remainingHashes
    );
    expect(secondConsume.matched).toBe(false);
  });

  it("matches RFC 6238 Appendix B SHA-1 test vectors, enforces +/-1 step window, and prevents TOTP replay", async () => {
    // RFC 6238 Appendix B SHA-1 seed: ASCII "12345678901234567890" (20 bytes)
    const rfcAsciiSecret = Buffer.from("12345678901234567890", "ascii");
    const rfcBase32Secret = encodeBase32(rfcAsciiSecret);

    const vectors: Array<{ unixTime: number; expected8Digit: string }> = [
      { unixTime: 59, expected8Digit: "94287082" },
      { unixTime: 1111111109, expected8Digit: "07081804" },
      { unixTime: 1111111111, expected8Digit: "14050471" },
      { unixTime: 1234567890, expected8Digit: "89005924" },
      { unixTime: 2000000000, expected8Digit: "69279037" },
      { unixTime: 20000000000, expected8Digit: "65353130" },
    ];

    for (const v of vectors) {
      const actual = computeTotpAtUnixSeconds(rfcBase32Secret, v.unixTime, 8);
      expect(actual).toBe(v.expected8Digit);
    }

    // +/- 1 step window check (30s steps around unixTime = 1234567890)
    const baseTimeSec = 1234567890;
    const baseTimeMs = baseTimeSec * 1000;
    const prevStepCode = computeTotpAtUnixSeconds(
      rfcBase32Secret,
      baseTimeSec - 30,
      6
    );
    const currStepCode = computeTotpAtUnixSeconds(
      rfcBase32Secret,
      baseTimeSec,
      6
    );
    const nextStepCode = computeTotpAtUnixSeconds(
      rfcBase32Secret,
      baseTimeSec + 30,
      6
    );
    const twoStepsAgoCode = computeTotpAtUnixSeconds(
      rfcBase32Secret,
      baseTimeSec - 60,
      6
    );

    expect(
      matchTotpCodeInWindow(prevStepCode, rfcBase32Secret, baseTimeMs).valid
    ).toBe(true);
    expect(
      matchTotpCodeInWindow(currStepCode, rfcBase32Secret, baseTimeMs).valid
    ).toBe(true);
    expect(
      matchTotpCodeInWindow(nextStepCode, rfcBase32Secret, baseTimeMs).valid
    ).toBe(true);
    expect(
      matchTotpCodeInWindow(twoStepsAgoCode, rfcBase32Secret, baseTimeMs).valid
    ).toBe(false);

    // Replay protection: first verification in step window succeeds, second verification of the same code in the same window is rejected
    const firstTry = await verifyAndConsumeTotpCode({
      userId: "admin-replay-test",
      code: currStepCode,
      secret: rfcBase32Secret,
      timestampMs: baseTimeMs,
    });
    expect(firstTry.valid).toBe(true);
    expect(firstTry.replayed).toBe(false);

    const replayTry = await verifyAndConsumeTotpCode({
      userId: "admin-replay-test",
      code: currStepCode,
      secret: rfcBase32Secret,
      timestampMs: baseTimeMs,
    });
    expect(replayTry.valid).toBe(false);
    expect(replayTry.replayed).toBe(true);
  });

  it("queries Have I Been Pwned range API with 5-char SHA-1 k-anonymity prefix and supports fail-open or fail-closed on network error", async () => {
    const requestedUrls: string[] = [];

    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const mockFetchHit: typeof fetch = async (input) => {
      requestedUrls.push(String(input));
      return new Response(
        "00000000000000000000000000000000000:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:10432000\r\n",
        { status: 200 }
      );
    };

    const hitResult = await checkPasswordPwnedRangeApi("password", {
      fetchImpl: mockFetchHit,
    });
    expect(requestedUrls[0]).toBe(
      "https://api.pwnedpasswords.com/range/5BAA6"
    );
    expect(hitResult.pwned).toBe(true);
    expect(hitResult.count).toBe(10432000);

    // Simulate network failure: fail-open (default) vs fail-closed
    const mockFetchError: typeof fetch = async () => {
      throw new Error("Simulated timeout");
    };

    const failOpenRes = await checkPasswordPwnedRangeApi(
      "UniquePhrase#Kiln2026!",
      {
        fetchImpl: mockFetchError,
        failClosedOnNetworkError: false,
      }
    );
    expect(failOpenRes.pwned).toBe(false);
    expect(failOpenRes.lookupFailed).toBe(true);

    const failClosedRes = await checkPasswordPwnedRangeApi(
      "UniquePhrase#Kiln2026!",
      {
        fetchImpl: mockFetchError,
        failClosedOnNetworkError: true,
      }
    );
    expect(failClosedRes.pwned).toBe(true);
    expect(failClosedRes.lookupFailed).toBe(true);
  });

  it("enforces Step 1 production guards: Redis fallback, seed script, dev inbox 404, and brand.ts placeholders", async () => {
    // 1. Redis fallback allowed ONLY in development or test
    expect(isFallbackAllowedEnvironment("development")).toBe(true);
    expect(isFallbackAllowedEnvironment("test")).toBe(true);
    expect(isFallbackAllowedEnvironment("production")).toBe(false);

    // 2. Seed script refuses to run in production and requires INITIAL_ADMIN_PASSWORD
    expect(() =>
      assertSeedEnvironmentAndGetAdminPassword({
        NODE_ENV: "production",
        INITIAL_ADMIN_PASSWORD: "ValidAdminPassword#2026",
      })
    ).toThrow(/refuses to run when NODE_ENV is 'production'/i);

    expect(() =>
      assertSeedEnvironmentAndGetAdminPassword({
        NODE_ENV: "development",
      })
    ).toThrow(/INITIAL_ADMIN_PASSWORD/i);

    expect(
      assertSeedEnvironmentAndGetAdminPassword({
        NODE_ENV: "development",
        INITIAL_ADMIN_PASSWORD: "ValidAdminPassword#2026",
      })
    ).toBe("ValidAdminPassword#2026");

    // 3. /api/dev/inbox returns 404 when NODE_ENV !== "development"
    const resInTestEnv = await devInboxGet(
      new Request("http://localhost:3000/api/dev/inbox")
    );
    expect(resInTestEnv.status).toBe(404);

    // 4. brand.ts fails production build while PLACEHOLDER_ values remain
    expect(() =>
      assertNoPlaceholdersInProduction(brandConfig, "production")
    ).toThrow(/FATAL PRODUCTION COMPLIANCE CHECK/i);
  });

  it("Stage 1.1: verifyPassword enforces fixed signature (storedHash, plainPassword) and never treats a password starting with $ as a hash", async () => {
    const plainWithDollar = "$ecretPassword2026!";
    const storedHash = await hashPassword(plainWithDollar);

    // 1. Correct signature and matching password -> true
    expect(await verifyPassword(storedHash, plainWithDollar)).toBe(true);

    // 2. Correct signature but wrong password -> false
    expect(await verifyPassword(storedHash, "WrongPassword#123")).toBe(false);

    // 3. Inverted arguments: (plainPassword, storedHash) where plain starts with $ must NEVER be treated as a hash
    // Must return false without throwing
    expect(await verifyPassword(plainWithDollar, storedHash)).toBe(false);

    // 4. Passwords starting with $ passed as storedHash to plain password -> false
    expect(await verifyPassword("$plainStartingWithDollar", "$plainStartingWithDollar")).toBe(false);

    // 5. Empty inputs -> false
    expect(await verifyPassword("", plainWithDollar)).toBe(false);
    expect(await verifyPassword(storedHash, "")).toBe(false);
  });

  it("Stage 1.4: assertTestSafetyIsolation refuses to run tests unless db ends with _test and Redis index > 0", () => {
    // 1. Valid test environment: passes
    expect(() =>
      assertTestSafetyIsolation({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:55432/dropshipping_test?schema=public",
        REDIS_URL: "redis://localhost:6379/1",
      })
    ).not.toThrow();

    // 2. Refuses development or production DB name
    expect(() =>
      assertTestSafetyIsolation({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:55432/dropshipping_store?schema=public",
        REDIS_URL: "redis://localhost:6379/1",
      })
    ).toThrow(/Database name MUST end with "_test"/i);

    // 3. Refuses Redis index 0
    expect(() =>
      assertTestSafetyIsolation({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:55432/dropshipping_test?schema=public",
        REDIS_URL: "redis://localhost:6379/0",
      })
    ).toThrow(/Tests refuse to run against Redis DB index 0/i);

    // 4. Refuses missing Redis index (defaults to 0)
    expect(() =>
      assertTestSafetyIsolation({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:55432/dropshipping_test?schema=public",
        REDIS_URL: "redis://localhost:6379",
      })
    ).toThrow(/Tests refuse to run against Redis DB index 0/i);
  });
});
