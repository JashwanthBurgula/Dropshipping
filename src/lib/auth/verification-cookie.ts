import crypto from "node:crypto";
import { cookies } from "next/headers";

export const PENDING_VERIFICATION_COOKIE_NAME = "kk_pending_verify";
export const PENDING_VERIFICATION_TTL_SECONDS = 30 * 60; // 30 minutes

const DEFAULT_DEV_SECRET =
  "a8f5f167f44f4964e6c998dee827110c92b8d19a47c2e1f8d3b4c5a6e7f80912";

function getSigningSecret(): string {
  return process.env.SESSION_SECRET ?? DEFAULT_DEV_SECRET;
}

export interface PendingVerificationPayload {
  email: string;
  returnTo: string;
  exp: number;
}

/**
 * Sanitizes a returnTo path so open redirects are impossible and auth loops are avoided.
 * Defaults to "/catalogue".
 */
export function sanitizeReturnToPath(rawPath?: string | null): string {
  if (!rawPath || typeof rawPath !== "string") {
    return "/catalogue";
  }
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/catalogue";
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("/verify-email") ||
    lower.startsWith("/register") ||
    lower.startsWith("/login")
  ) {
    return "/catalogue";
  }
  return trimmed;
}

function signPayloadBase64(payloadBase64: string): string {
  return crypto
    .createHmac("sha256", getSigningSecret())
    .update(`pending_verify:${payloadBase64}`)
    .digest("hex");
}

export function createSignedPendingVerificationCookieValue(params: {
  email: string;
  returnTo?: string | null;
  ttlSeconds?: number;
  nowMs?: number;
}): string {
  const nowMs = params.nowMs ?? Date.now();
  const ttlSeconds = params.ttlSeconds ?? PENDING_VERIFICATION_TTL_SECONDS;
  const payload: PendingVerificationPayload = {
    email: params.email.trim().toLowerCase(),
    returnTo: sanitizeReturnToPath(params.returnTo),
    exp: nowMs + ttlSeconds * 1000,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const signature = signPayloadBase64(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function verifySignedPendingVerificationCookieValue(
  cookieValue: string | undefined | null,
  nowMs: number = Date.now()
): { email: string; returnTo: string } | null {
  if (!cookieValue || typeof cookieValue !== "string") {
    return null;
  }
  const parts = cookieValue.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payloadBase64, signature] = parts;
  if (!payloadBase64 || !signature) {
    return null;
  }

  const expectedSig = signPayloadBase64(payloadBase64);
  const actualBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (
    actualBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(actualBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payloadBase64, "base64url").toString("utf8")
    ) as PendingVerificationPayload;
    if (
      !decoded ||
      typeof decoded.email !== "string" ||
      typeof decoded.exp !== "number"
    ) {
      return null;
    }
    if (nowMs > decoded.exp) {
      return null;
    }
    return {
      email: decoded.email.trim().toLowerCase(),
      returnTo: sanitizeReturnToPath(decoded.returnTo),
    };
  } catch {
    return null;
  }
}

export async function setPendingVerificationCookie(params: {
  email: string;
  returnTo?: string | null;
}): Promise<string> {
  const signedValue = createSignedPendingVerificationCookieValue(params);
  try {
    const cookieStore = await cookies();
    cookieStore.set(PENDING_VERIFICATION_COOKIE_NAME, signedValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PENDING_VERIFICATION_TTL_SECONDS,
    });
  } catch {
    // Ignored when called outside Next.js request context (e.g., direct service unit tests)
  }
  return signedValue;
}

export async function getPendingVerificationFromCookie(): Promise<{
  email: string;
  returnTo: string;
} | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(PENDING_VERIFICATION_COOKIE_NAME)?.value;
    return verifySignedPendingVerificationCookieValue(raw);
  } catch {
    return null;
  }
}

export async function clearPendingVerificationCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(PENDING_VERIFICATION_COOKIE_NAME);
  } catch {
    // Ignored outside Next.js request context
  }
}
