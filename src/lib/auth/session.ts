import { cookies } from "next/headers";
import { kvStore } from "@/lib/redis";
import { generateSecureToken, hashToken } from "@/lib/crypto";

export const CUSTOMER_SESSION_COOKIE = "kk_session";
export const ADMIN_SESSION_COOKIE = "kk_admin_session";

const CUSTOMER_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const ADMIN_TTL_SECONDS = 30 * 60; // 30 minutes short session timeout for admins

export interface SessionRecord {
  sessionIdHash: string;
  userId: string;
  email: string;
  fullName: string;
  role: "CUSTOMER" | "ADMIN";
  totpVerified: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  expiresAt: string;
}

function sessionKey(sessionIdHash: string): string {
  return `sess:${sessionIdHash}`;
}

function userSessionsSetKey(userId: string): string {
  return `user_sessions:${userId}`;
}

/**
 * Creates a new session in Redis and returns the raw session token plus metadata.
 * If `previousRawToken` is passed, revokes the old session immediately to rotate
 * the session ID on login and prevent session fixation.
 */
export async function createServerSession(params: {
  userId: string;
  email: string;
  fullName: string;
  role: "CUSTOMER" | "ADMIN";
  totpVerified?: boolean;
  mustChangePassword?: boolean;
  previousRawToken?: string | null;
}): Promise<{ rawToken: string; session: SessionRecord; ttlSeconds: number }> {
  if (params.previousRawToken) {
    await revokeSessionByRawToken(params.previousRawToken);
  }

  const rawToken = generateSecureToken(32);
  const sessionIdHash = hashToken(rawToken);
  const ttlSeconds =
    params.role === "ADMIN" ? ADMIN_TTL_SECONDS : CUSTOMER_TTL_SECONDS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const session: SessionRecord = {
    sessionIdHash,
    userId: params.userId,
    email: params.email,
    fullName: params.fullName,
    role: params.role,
    totpVerified: Boolean(params.totpVerified),
    mustChangePassword: Boolean(params.mustChangePassword),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  await kvStore.setEx(
    sessionKey(sessionIdHash),
    ttlSeconds,
    JSON.stringify(session)
  );
  await kvStore.sadd(userSessionsSetKey(params.userId), sessionIdHash);

  return { rawToken, session, ttlSeconds };
}

export interface CookieStoreAdapter {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax" | "strict" | "none";
      path: string;
      maxAge: number;
    }
  ): void;
}

let injectedCookieAdapterForTests: CookieStoreAdapter | null = null;

export function setInjectedCookieAdapterForTests(
  adapter: CookieStoreAdapter | null
): void {
  injectedCookieAdapterForTests = adapter;
}

/**
 * Rotates the session cookie on login by revoking any existing session token in cookies
 * before setting the new HttpOnly, Secure, SameSite=Lax session cookie.
 * before setting the new HttpOnly, Secure, SameSite=Lax session cookie.
 * Blanket try/catch is REMOVED: failure raises directly to the caller.
 */
export async function setRotatedSessionCookie(
  newRawToken: string,
  role: "CUSTOMER" | "ADMIN",
  ttlSeconds: number,
  injectedAdapter?: CookieStoreAdapter
): Promise<void> {
  const adapter = injectedAdapter ?? injectedCookieAdapterForTests;
  const cookieStore = adapter ?? (await cookies());

  const cookieName =
    role === "ADMIN" ? ADMIN_SESSION_COOKIE : CUSTOMER_SESSION_COOKIE;
  const existingToken = cookieStore.get(cookieName)?.value;
  if (existingToken && existingToken !== newRawToken) {
    await revokeSessionByRawToken(existingToken);
  }

  cookieStore.set(cookieName, newRawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds,
  });
}

export const setSessionCookie = setRotatedSessionCookie;

/**
 * Retrieves and validates a session by its raw token.
 * For ADMIN sessions, refreshes the 30-minute sliding idle window on activity.
 */
export async function getSessionByRawToken(
  rawToken: string | undefined | null
): Promise<SessionRecord | null> {
  if (!rawToken) return null;
  const sessionIdHash = hashToken(rawToken);
  const rawJson = await kvStore.get(sessionKey(sessionIdHash));
  if (!rawJson) return null;

  try {
    const record = JSON.parse(rawJson) as SessionRecord;
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      await kvStore.del(sessionKey(sessionIdHash));
      return null;
    }

    if (record.role === "ADMIN") {
      const refreshedExpiry = new Date(
        Date.now() + ADMIN_TTL_SECONDS * 1000
      ).toISOString();
      const updated: SessionRecord = { ...record, expiresAt: refreshedExpiry };
      await kvStore.setEx(
        sessionKey(sessionIdHash),
        ADMIN_TTL_SECONDS,
        JSON.stringify(updated)
      );
      return updated;
    }

    return record;
  } catch {
    return null;
  }
}

/**
 * Upgrades an Admin session to `totpVerified: true` after 2FA verification completes,
 * and rotates the session ID so the pre-2FA session token cannot be reused.
 */
export async function markAdminSessionTotpVerified(
  previousRawToken: string
): Promise<{ session: SessionRecord; rotatedRawToken: string; ttlSeconds: number } | null> {
  const existing = await getSessionByRawToken(previousRawToken);
  if (!existing || existing.role !== "ADMIN") return null;

  const { rawToken, session, ttlSeconds } = await createServerSession({
    userId: existing.userId,
    email: existing.email,
    fullName: existing.fullName,
    role: "ADMIN",
    totpVerified: true,
    mustChangePassword: existing.mustChangePassword,
    previousRawToken,
  });

  return { session, rotatedRawToken: rawToken, ttlSeconds };
}

/**
 * Clears the `mustChangePassword` flag on an active Admin session after first-login password update.
 */
export async function clearAdminSessionMustChangePassword(
  rawToken: string
): Promise<SessionRecord | null> {
  const session = await getSessionByRawToken(rawToken);
  if (!session || session.role !== "ADMIN") return null;

  const updated: SessionRecord = {
    ...session,
    mustChangePassword: false,
    expiresAt: new Date(Date.now() + ADMIN_TTL_SECONDS * 1000).toISOString(),
  };

  await kvStore.setEx(
    sessionKey(session.sessionIdHash),
    ADMIN_TTL_SECONDS,
    JSON.stringify(updated)
  );
  return updated;
}

/**
 * Revokes a single session by raw token.
 */
export async function revokeSessionByRawToken(
  rawToken: string | undefined | null
): Promise<void> {
  if (!rawToken) return;
  const sessionIdHash = hashToken(rawToken);
  const rawJson = await kvStore.get(sessionKey(sessionIdHash));
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as SessionRecord;
      await kvStore.srem(userSessionsSetKey(parsed.userId), sessionIdHash);
    } catch {
      // Ignore
    }
  }
  await kvStore.del(sessionKey(sessionIdHash));
}

/**
 * Revokes ALL active sessions across all devices for a given userId.
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const hashes = await kvStore.smembers(userSessionsSetKey(userId));
  for (const hash of hashes) {
    await kvStore.del(sessionKey(hash));
  }
  await kvStore.del(userSessionsSetKey(userId));
  return hashes.length;
}

export const createSession = createServerSession;

export type SessionPayload = SessionRecord;

/**
 * Safely reads any existing Customer or Admin session cookie token from the request context.
 */
export async function readCookieSessionToken(
  role: "CUSTOMER" | "ADMIN" = "CUSTOMER"
): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const cookieName =
      role === "ADMIN" ? ADMIN_SESSION_COOKIE : CUSTOMER_SESSION_COOKIE;
    return cookieStore.get(cookieName)?.value ?? null;
  } catch {
    return null;
  }
}

export const getRawSessionTokenFromCookie = readCookieSessionToken;

/**
 * Server-side helper to get the current logged-in Customer session from cookies.
 */
export async function getCurrentCustomerSession(
  request?: Request
): Promise<SessionRecord | null> {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
    if (rawToken) {
      return getSessionByRawToken(rawToken);
    }
  } catch {
    // Fall back to parsing request Cookie header when invoked directly in route tests
  }

  if (request) {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      for (const pair of cookieHeader.split(";")) {
        const [name, ...rest] = pair.trim().split("=");
        if (name === CUSTOMER_SESSION_COOKIE) {
          const rawToken = decodeURIComponent(rest.join("="));
          return getSessionByRawToken(rawToken);
        }
      }
    }
  }

  return null;
}

/**
 * Server-side helper to get the current Admin session from cookies and verify
 * both `role === "ADMIN"` and `totpVerified === true`.
 */
export async function getCurrentAdminSession(options?: {
  allowPendingTotp?: boolean;
  allowMustChangePassword?: boolean;
}): Promise<{ session: SessionRecord; rawToken: string } | null> {
  let rawToken: string | undefined;
  try {
    const cookieStore = await cookies();
    rawToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!rawToken) return null;
  const session = await getSessionByRawToken(rawToken);
  if (!session || session.role !== "ADMIN") {
    return null;
  }
  if (!options?.allowPendingTotp && !session.totpVerified) {
    return null;
  }
  if (!options?.allowMustChangePassword && session.mustChangePassword) {
    return null;
  }
  return { session, rawToken };
}
