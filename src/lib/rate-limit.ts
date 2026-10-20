import { kvStore } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitRule {
  bucket: string;
  maxRequests: number;
  windowSeconds: number;
}

export const RATE_LIMIT_RULES = {
  register: { bucket: "rl:register", maxRequests: 5, windowSeconds: 600 },
  login: { bucket: "rl:login", maxRequests: 8, windowSeconds: 300 },
  adminLogin: { bucket: "rl:admin_login", maxRequests: 5, windowSeconds: 600 },
  verifyEmail: { bucket: "rl:verify_email", maxRequests: 10, windowSeconds: 300 },
  resendVerification: {
    bucket: "rl:resend_verify",
    maxRequests: 3,
    windowSeconds: 300,
  },
  passwordReset: { bucket: "rl:pw_reset", maxRequests: 4, windowSeconds: 600 },
  pinLookup: { bucket: "rl:pin_lookup", maxRequests: 30, windowSeconds: 60 },
  search: { bucket: "rl:search", maxRequests: 45, windowSeconds: 60 },
  searchSuggest: {
    bucket: "rl:search_suggest",
    maxRequests: 90,
    windowSeconds: 60,
  },
  cart: { bucket: "rl:cart", maxRequests: 60, windowSeconds: 60 },
  checkout: { bucket: "rl:checkout", maxRequests: 15, windowSeconds: 60 },
  codOtp: { bucket: "rl:cod_otp", maxRequests: 10, windowSeconds: 300 },
} as const;

export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string
): Promise<RateLimitResult> {
  const normalizedId = identifier.trim().toLowerCase() || "anonymous";
  const key = `${rule.bucket}:${normalizedId}`;
  const { count, ttlSeconds } = await kvStore.incrWithTtl(
    key,
    rule.windowSeconds
  );

  const allowed = count <= rule.maxRequests;
  const remaining = Math.max(0, rule.maxRequests - count);

  return {
    allowed,
    remaining,
    retryAfterSeconds: allowed ? 0 : ttlSeconds,
  };
}
