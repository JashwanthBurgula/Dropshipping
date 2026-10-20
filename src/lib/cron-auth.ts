import crypto from "node:crypto";

/**
 * Validates that an incoming cron request provides a valid CRON_SECRET
 * matching process.env.CRON_SECRET via constant-time comparison.
 */
export function assertCronAuthorized(request: Request): {
  authorized: boolean;
  status?: number;
  error?: string;
} {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret || configuredSecret.length < 16) {
    return {
      authorized: false,
      status: 500,
      error: "CRON_SECRET is not configured or is too short (min 16 chars required)",
    };
  }

  const authHeader = request.headers.get("authorization");
  const xCronHeader = request.headers.get("x-cron-secret");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : xCronHeader?.trim();

  if (!provided) {
    return {
      authorized: false,
      status: 401,
      error: "Missing authorization header. Supply Bearer <CRON_SECRET> or x-cron-secret",
    };
  }

  const providedBuf = Buffer.from(provided);
  const configuredBuf = Buffer.from(configuredSecret);

  if (
    providedBuf.length !== configuredBuf.length ||
    !crypto.timingSafeEqual(providedBuf, configuredBuf)
  ) {
    return {
      authorized: false,
      status: 401,
      error: "Invalid cron secret",
    };
  }

  return { authorized: true };
}
