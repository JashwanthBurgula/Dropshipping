import crypto from "node:crypto";
import QRCode from "qrcode";
import {
  encryptAes256Gcm,
  decryptAes256Gcm,
  hashToken,
  verifyTokenHash,
  type EncryptedPayload,
} from "@/lib/crypto";
import { kvStore } from "@/lib/redis";
import { brandConfig } from "@/config/brand";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
const REPLAY_TTL_SECONDS = 90; // Covers [-1, 0, +1] 30s steps

export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? "A";
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? "A";
  }

  return output;
}

export function decodeBase32(base32: string): Buffer {
  const cleaned = base32
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Low-level RFC 4226 / RFC 6238 HOTP computation supporting 6 or 8 digits
 * (8 digits used in RFC 6238 Appendix B test vectors; 6 digits used in production authenticator apps).
 */
export function computeHotp(
  secretBase32: string,
  counter: number,
  digits: 6 | 8 = TOTP_DIGITS
): string {
  const key = decodeBase32(secretBase32);
  const counterBuf = Buffer.alloc(8);
  let temp = Math.floor(counter);
  for (let i = 7; i >= 0; i -= 1) {
    counterBuf[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }

  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  const otp = binary % 10 ** digits;
  return String(otp).padStart(digits, "0");
}

/**
 * Computes an RFC 6238 TOTP code at a specific Unix timestamp in seconds.
 */
export function computeTotpAtUnixSeconds(
  secretBase32: string,
  unixSeconds: number,
  digits: 6 | 8 = TOTP_DIGITS
): string {
  const counter = Math.floor(unixSeconds / TOTP_STEP_SECONDS);
  return computeHotp(secretBase32, counter, digits);
}

export interface TotpEnrollmentBundle {
  secret: string;
  encryptedSecretJson: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
  recoveryCodeHashes: string[];
}

/**
 * Generates an RFC 6238 TOTP secret (160-bit Base32), encrypts it with AES-256-GCM,
 * builds a QR code data URL, and issues 8 single-use recovery codes.
 */
export async function generateAdminTotpEnrollment(
  adminEmail: string
): Promise<TotpEnrollmentBundle> {
  const secret = encodeBase32(crypto.randomBytes(20));
  const issuer = `${brandConfig.name} Admin`;
  const label = encodeURIComponent(`${issuer}:${adminEmail}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(
    issuer
  )}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;

  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    width: 220,
    margin: 1,
    color: {
      dark: "#1D1B18",
      light: "#F6F2EA",
    },
  });

  const encryptedPayload = encryptAes256Gcm(secret);
  const encryptedSecretJson = JSON.stringify(encryptedPayload);

  const recoveryCodes: string[] = [];
  const recoveryCodeHashes: string[] = [];

  for (let i = 0; i < 8; i += 1) {
    const partA = crypto.randomBytes(2).toString("hex").toUpperCase();
    const partB = crypto.randomBytes(2).toString("hex").toUpperCase();
    const code = `${partA}-${partB}`;
    recoveryCodes.push(code);
    recoveryCodeHashes.push(hashToken(code));
  }

  return {
    secret,
    encryptedSecretJson,
    otpauthUrl,
    qrCodeDataUrl,
    recoveryCodes,
    recoveryCodeHashes,
  };
}

/**
 * Decrypts a stored AES-256-GCM encrypted TOTP secret JSON string.
 */
export function decryptTotpSecret(encryptedSecretJson: string): string {
  const payload = JSON.parse(encryptedSecretJson) as EncryptedPayload;
  return decryptAes256Gcm(payload);
}

/**
 * Generates the current 6-digit RFC 6238 TOTP code for a Base32 secret.
 */
export function generateCurrentTotpCode(
  secret: string,
  timestampMs = Date.now()
): string {
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  return computeHotp(secret, counter, 6);
}

/**
 * Verifies a 6-digit TOTP code against a Base32 secret allowing a +/- 1 step (30s) window.
 * Returns `{ valid: boolean; matchedCounter: number | null }`.
 */
export function matchTotpCodeInWindow(
  code: string,
  secret: string,
  timestampMs = Date.now()
): { valid: boolean; matchedCounter: number | null } {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) {
    return { valid: false, matchedCounter: null };
  }

  const currentCounter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  for (const offset of [-1, 0, 1]) {
    const stepCounter = currentCounter + offset;
    const candidate = computeHotp(secret, stepCounter, 6);
    const a = Buffer.from(cleaned, "utf8");
    const b = Buffer.from(candidate, "utf8");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { valid: true, matchedCounter: stepCounter };
    }
  }
  return { valid: false, matchedCounter: null };
}

/**
 * Stateless TOTP verification helper (for unit tests that do not test replay).
 */
export function verifyTotpCode(
  code: string,
  secret: string,
  timestampMs = Date.now()
): boolean {
  return matchTotpCodeInWindow(code, secret, timestampMs).valid;
}

/**
 * Stateful TOTP verification with replay protection:
 * Verifies the 6-digit code within the [-1, 0, +1] window AND atomically records
 * `(userId, matchedCounter, code)` in Redis for 90 seconds so the same TOTP code
 * cannot be replayed a second time within its acceptance window.
 */
export async function verifyAndConsumeTotpCode(params: {
  userId: string;
  code: string;
  secret: string;
  timestampMs?: number;
}): Promise<{ valid: boolean; replayed: boolean }> {
  const match = matchTotpCodeInWindow(
    params.code,
    params.secret,
    params.timestampMs ?? Date.now()
  );
  if (!match.valid || match.matchedCounter === null) {
    return { valid: false, replayed: false };
  }

  const replayKey = `totp_used:${params.userId}:${match.matchedCounter}`;
  const acquired = await kvStore.setNxEx(
    replayKey,
    REPLAY_TTL_SECONDS,
    params.code.trim()
  );

  if (!acquired) {
    return { valid: false, replayed: true };
  }

  return { valid: true, replayed: false };
}

/**
 * Checks a single-use recovery code against the user's remaining hashed recovery codes.
 */
export function consumeRecoveryCode(
  inputCode: string,
  storedHashes: string[]
): { matched: boolean; remainingHashes: string[] } {
  const normalized = inputCode.trim().toUpperCase();
  const matchIndex = storedHashes.findIndex((hash) =>
    verifyTokenHash(normalized, hash)
  );
  if (matchIndex === -1) {
    return { matched: false, remainingHashes: storedHashes };
  }
  const remainingHashes = storedHashes.filter((_, idx) => idx !== matchIndex);
  return { matched: true, remainingHashes };
}
