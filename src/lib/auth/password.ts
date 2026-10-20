import crypto from "node:crypto";
import argon2 from "argon2";
import { isBreachedOrWeakPassword } from "@/lib/auth/password-policy";

export { isBreachedOrWeakPassword };

export interface HibpRangeResult {
  pwned: boolean;
  count: number;
  lookupFailed: boolean;
  prefixSent: string;
}

/**
 * Queries the Have I Been Pwned (HIBP) Pwned Passwords Range API using k-anonymity:
 * 1. Computes the uppercase SHA-1 digest of the candidate password.
 * 2. Sends ONLY the first 5 hex characters (`prefix`) to `https://api.pwnedpasswords.com/range/{prefix}`
 *    with `Add-Padding: true` and an explicit timeout (`timeoutMs`, default 2500ms).
 * 3. Compares the remaining 35 hex characters (`suffix`) locally in memory.
 *
 * Fail Policy on Network Timeout / Outage:
 * - Tier 1 (`isBreachedOrWeakPassword` local dictionary + sequence check) ALWAYS runs first and fails closed.
 * - Tier 2 (remote HIBP range API) defaults to FAIL-OPEN on network timeout (`HIBP_STRICT_FAIL_CLOSED !== "true"`)
 *   so an external HIBP outage does not block customer registrations, unless `options.failClosedOnNetworkError`
 *   or `process.env.HIBP_STRICT_FAIL_CLOSED === "true"` is set (used for high-privilege admin password updates).
 */
export async function checkPasswordPwnedRangeApi(
  password: string,
  options?: {
    timeoutMs?: number;
    failClosedOnNetworkError?: boolean;
    fetchImpl?: typeof fetch;
  }
): Promise<HibpRangeResult> {
  const sha1Hex = crypto
    .createHash("sha1")
    .update(password, "utf8")
    .digest("hex")
    .toUpperCase();

  const prefixSent = sha1Hex.slice(0, 5);
  const expectedSuffix = sha1Hex.slice(5);

  const timeoutMs = options?.timeoutMs ?? 2500;
  const failClosed =
    options?.failClosedOnNetworkError ??
    process.env.HIBP_STRICT_FAIL_CLOSED === "true";
  const fetcher = options?.fetchImpl ?? globalThis.fetch;

  if (isBreachedOrWeakPassword(password)) {
    return {
      pwned: true,
      count: 10000,
      lookupFailed: false,
      prefixSent,
    };
  }

  if (process.env.NODE_ENV === "test" && !options?.fetchImpl) {
    return {
      pwned: false,
      count: 0,
      lookupFailed: false,
      prefixSent,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetcher(
      `https://api.pwnedpasswords.com/range/${prefixSent}`,
      {
        method: "GET",
        headers: {
          "Add-Padding": "true",
          "User-Agent": "KalaAndKiln-Security-Check/1.0",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timer);

    if (!response.ok) {
      return {
        pwned: failClosed,
        count: 0,
        lookupFailed: true,
        prefixSent,
      };
    }

    const bodyText = await response.text();
    const lines = bodyText.split(/\r?\n/);

    for (const line of lines) {
      const [suffix, countStr] = line.split(":");
      if (suffix && suffix.trim().toUpperCase() === expectedSuffix) {
        const count = parseInt((countStr ?? "0").trim(), 10);
        if (count > 0) {
          return {
            pwned: true,
            count,
            lookupFailed: false,
            prefixSent,
          };
        }
      }
    }

    return {
      pwned: false,
      count: 0,
      lookupFailed: false,
      prefixSent,
    };
  } catch {
    return {
      pwned: failClosed,
      count: 0,
      lookupFailed: true,
      prefixSent,
    };
  }
}

export type StoredPasswordHash = string & { readonly __brand: "StoredPasswordHash" };
export type PlaintextPassword = string;

export function toStoredPasswordHash(hash: string): StoredPasswordHash {
  return hash as StoredPasswordHash;
}

/**
 * Hashes a plaintext password using Argon2id with OWASP recommended parameters.
 */
export async function hashPassword(
  plaintext: PlaintextPassword
): Promise<StoredPasswordHash> {
  const hash = await argon2.hash(plaintext, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  return hash as StoredPasswordHash;
}

/**
 * Verifies a plaintext password against an Argon2id stored hash.
 * FIXED SIGNATURE: verifyPassword(storedHash, plainPassword).
 * Argument-order detection is strictly removed.
 * Stored hash MUST be an Argon2 PHC string ($argon2id$).
 * A password starting with "$" passed as the hash will never be treated as a hash.
 */
export async function verifyPassword(
  storedHash: StoredPasswordHash | string,
  plainPassword: PlaintextPassword
): Promise<boolean> {
  if (!storedHash || typeof storedHash !== "string") return false;
  if (!plainPassword || typeof plainPassword !== "string") return false;

  // Strict: only genuine Argon2 PHC format accepted as storedHash
  if (
    !storedHash.startsWith("$argon2id$") &&
    !storedHash.startsWith("$argon2i$") &&
    !storedHash.startsWith("$argon2d$")
  ) {
    return false;
  }

  try {
    return await argon2.verify(storedHash, plainPassword);
  } catch {
    return false;
  }
}
