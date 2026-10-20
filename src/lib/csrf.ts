import type cryptoType from "node:crypto";

export const CSRF_COOKIE_NAME = "kk_csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

const DEFAULT_DEV_CSRF_SECRET =
  "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a";

function getNodeCrypto(): typeof cryptoType {
  const builtin = (
    process as unknown as {
      getBuiltinModule?: (id: string) => typeof cryptoType;
    }
  ).getBuiltinModule?.("node:crypto");
  if (!builtin) {
    throw new Error("Server crypto module is only available on the server.");
  }
  return builtin;
}

function getCsrfSecret(): string {
  return process.env.CSRF_SECRET ?? DEFAULT_DEV_CSRF_SECRET;
}

function signCsrfNonce(nonce: string): string {
  return getNodeCrypto()
    .createHmac("sha256", getCsrfSecret())
    .update(nonce)
    .digest("hex");
}

/**
 * Generates a signed CSRF token in the format `nonce.signature`.
 */
export function createSignedCsrfToken(): string {
  const nonce = getNodeCrypto().randomBytes(24).toString("hex");
  const signature = signCsrfNonce(nonce);
  return `${nonce}.${signature}`;
}

/**
 * Verifies that a CSRF token has a valid HMAC signature and matches the double-submit token.
 */
export function verifySignedCsrfToken(
  tokenFromClient: string | null | undefined,
  tokenFromCookie?: string | null | undefined
): boolean {
  if (!tokenFromClient) return false;
  const parts = tokenFromClient.split(".");
  if (parts.length !== 2) return false;
  const [nonce, signature] = parts;
  if (!nonce || !signature) return false;

  const expectedSig = signCsrfNonce(nonce);
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!getNodeCrypto().timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  if (tokenFromCookie !== undefined && tokenFromCookie !== null) {
    return tokenFromClient === tokenFromCookie;
  }

  return true;
}

function readCookieFromHeader(
  cookieHeader: string | null,
  cookieName: string
): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [rawName, ...rest] = pair.trim().split("=");
    if (rawName === cookieName) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/**
 * Server helper to issue or retrieve the current CSRF token cookie.
 */
export async function ensureCsrfCookie(): Promise<string> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const existing = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  if (existing && verifySignedCsrfToken(existing)) {
    return existing;
  }
  const token = createSignedCsrfToken();
  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return token;
}

/**
 * Validates the `x-csrf-token` header on incoming state-changing requests.
 */
export async function validateRequestCsrf(request: Request): Promise<boolean> {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (!headerToken) return false;

  const cookieFromReq = readCookieFromHeader(
    request.headers.get("cookie"),
    CSRF_COOKIE_NAME
  );
  if (cookieFromReq) {
    return verifySignedCsrfToken(headerToken, cookieFromReq);
  }

  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
    if (cookieToken) {
      return verifySignedCsrfToken(headerToken, cookieToken);
    }
  } catch {
    // In direct unit/integration test invocations outside Next request context, verify signature
  }
  return verifySignedCsrfToken(headerToken);
}
