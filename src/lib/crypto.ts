import crypto from "node:crypto";

const DEFAULT_DEV_PEPPER =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const DEFAULT_DEV_AES_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function getPepper(): string {
  return process.env.TOKEN_HASH_PEPPER ?? DEFAULT_DEV_PEPPER;
}

function getAesKeyBuffer(): Buffer {
  const hex = process.env.ENCRYPTION_KEY_HEX ?? DEFAULT_DEV_AES_KEY_HEX;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "ENCRYPTION_KEY_HEX must be a 64-character hexadecimal string (32 bytes for AES-256-GCM)."
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Generates a cryptographically random 256-bit (32-byte) hex token.
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("hex");
}

/**
 * Hashes a raw token (email verification, password reset, dealer link, or OTP)
 * using HMAC-SHA256 with a server-side pepper so raw tokens are never stored in the database.
 */
export function hashToken(rawToken: string): string {
  return crypto
    .createHmac("sha256", getPepper())
    .update(rawToken.trim())
    .digest("hex");
}

/**
 * Generates a cryptographically uniform 6-digit numeric OTP (100000 to 999999).
 */
export function generateSixDigitOtp(): string {
  const value = crypto.randomInt(100000, 1000000);
  return String(value);
}

/**
 * Computes an account- and purpose-scoped HMAC-SHA256 hash of a 6-digit OTP.
 * Exact HMAC input: `${userId}:${purpose}:${code}`.
 */
export function hashOtpToken(
  userId: string,
  purpose: string,
  code: string
): string {
  return crypto
    .createHmac("sha256", getPepper())
    .update(`${userId.trim()}:${purpose.trim()}:${code.trim()}`)
    .digest("hex");
}

/**
 * Constant-time verification of an account- and purpose-scoped OTP against expected HMAC hash.
 */
export function verifyOtpTokenHash(
  userId: string,
  purpose: string,
  code: string,
  expectedHash: string
): boolean {
  const actualHash = hashOtpToken(userId, purpose, code);
  const actualBuf = Buffer.from(actualHash, "hex");
  const expectedBuf = Buffer.from(expectedHash, "hex");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Account-scoped HMAC-SHA256 for email verification OTP using exact HMAC input `${userId}:${purpose}:${code}`.
 */
export function hashVerificationOtp(userId: string, otpCode: string): string {
  return hashOtpToken(userId, "EMAIL_VERIFICATION", otpCode);
}

/**
 * Constant-time verification of a 6-digit OTP against a stored HMAC-SHA256 hash.
 */
export function verifyVerificationOtpHash(
  userId: string,
  otpCode: string,
  expectedHash: string
): boolean {
  return verifyOtpTokenHash(userId, "EMAIL_VERIFICATION", otpCode, expectedHash);
}

/**
 * Constant-time verification of a raw token or OTP against a stored HMAC-SHA256 hash.
 */
export function verifyTokenHash(rawToken: string, expectedHash: string): boolean {
  const actualHash = hashToken(rawToken);
  const actualBuf = Buffer.from(actualHash, "hex");
  const expectedBuf = Buffer.from(expectedHash, "hex");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypts sensitive data (such as COD refund UPI IDs, bank account numbers, or TOTP secrets)
 * using AES-256-GCM with a random 96-bit (12-byte) IV.
 */
export function encryptAes256Gcm(plaintext: string): EncryptedPayload {
  const key = getAesKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypts an AES-256-GCM payload and verifies its authentication tag.
 */
export function decryptAes256Gcm(payload: EncryptedPayload): string {
  const key = getAesKeyBuffer();
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Returns the fields required to permanently wipe encrypted COD UPI/bank details
 * from a Refund record immediately after the refund completes.
 */
export function buildPurgedCodPayoutUpdate() {
  return {
    codPayoutCiphertext: null,
    codPayoutIv: null,
    codPayoutAuthTag: null,
    codPayoutPurgedAt: new Date(),
  };
}
