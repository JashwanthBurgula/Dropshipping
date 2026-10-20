import { NextResponse, type NextRequest } from "next/server";
import { STATIC_BUILD_SCRIPT_SHA256_HASHES } from "@/config/static-csp-hashes";

/**
 * Routes that load third-party security or payment scripts (Cloudflare Turnstile
 * or Razorpay Checkout) or require dynamic authenticated rendering with a
 * per-request cryptographic CSP nonce.
 *
 * All other informational and storefront pages (home `/`, `/legal/*`, `/404`, etc.)
 * load zero third-party scripts and are served with a strict hash-based CSP
 * so Next.js can pre-render and cache them statically (`○ Static`).
 */
export function doesRouteRequirePerRequestNonce(
  pathname: string,
  adminPath: string = process.env.ADMIN_PORTAL_PATH ?? "/ops-portal"
): boolean {
  const normalized = pathname.toLowerCase();
  const dynamicNoncePrefixes = [
    "/login",
    "/register",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/checkout",
    "/account",
    "/dealer",
    adminPath.toLowerCase(),
  ];

  return dynamicNoncePrefixes.some(
    (prefix) =>
      normalized === prefix ||
      normalized.startsWith(`${prefix}/`)
  );
}

const BUILD_EXTRACTED_HASH_PLACEHOLDER = "__NEXT_STATIC_CSP_HASHES_PLACEHOLDER__";

/**
 * Strict hash-based Content-Security-Policy for static pages that load
 * zero third-party scripts. Blocks Cloudflare Turnstile and Razorpay script/frame
 * origins completely on static pages and permits only `'self'` plus verified SHA-256
 * script hashes extracted at build time (`scripts/extract-static-csp-hashes.mjs`).
 */
export function buildStaticHashCspHeader(
  isDev: boolean = process.env.NODE_ENV === "development",
  extraSha256Hashes: readonly string[] = [],
  nonce?: string
): string {
  const injectedFromBuild = BUILD_EXTRACTED_HASH_PLACEHOLDER.split(" ").filter(
    (token) => token.startsWith("'sha256-")
  );
  const hashSet = new Set<string>([
    "'sha256-4RS22DYeB7U14dra4KcQYxmwt5HkOInieXK1NUMBmQI='",
    ...STATIC_BUILD_SCRIPT_SHA256_HASHES,
    ...injectedFromBuild,
    ...extraSha256Hashes.map((h) =>
      h.startsWith("'sha256-") ? h : `'sha256-${h}'`
    ),
  ]);

  const scriptParts: string[] = ["script-src 'self'"];
  if (nonce) {
    scriptParts.push(`'nonce-${nonce}'`);
  }
  if (!isDev || !nonce) {
    scriptParts.push(Array.from(hashSet).join(" "));
  }
  if (isDev) {
    scriptParts.push("'unsafe-eval'");
    scriptParts.push("'unsafe-inline'");
  }

  return [
    "default-src 'self'",
    scriptParts.join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    !isDev ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Per-request nonce Content-Security-Policy for routes that load Cloudflare
 * Turnstile or Razorpay (`auth`, `checkout`, `admin`).
 */
export function buildDynamicNonceCspHeader(
  nonce: string,
  isDev: boolean = process.env.NODE_ENV === "development"
): string {
  const injectedFromBuild = BUILD_EXTRACTED_HASH_PLACEHOLDER.split(" ").filter(
    (token) => token.startsWith("'sha256-")
  );
  const hashSet = new Set<string>([
    "'sha256-4RS22DYeB7U14dra4KcQYxmwt5HkOInieXK1NUMBmQI='",
    "'sha256-2G+HL+OS8W2brr1hDaTZ3OuaRf94CD3pvSoY+TL7gqM='",
    ...STATIC_BUILD_SCRIPT_SHA256_HASHES,
    ...injectedFromBuild,
  ]);
  const hashes = Array.from(hashSet).join(" ");

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${hashes} https://challenges.cloudflare.com https://checkout.razorpay.com${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://cdn.razorpay.com",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com https://api.razorpay.com https://lumberjack.razorpay.com",
    "frame-src 'self' https://challenges.cloudflare.com https://api.razorpay.com https://checkout.razorpay.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    !isDev ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Next.js 16 Request Proxy (replaces legacy middleware.ts).
 *
 * Security Note (CVE-2025-29927 defense-in-depth):
 * Authentication and role authorization are NEVER delegated to proxy.ts alone;
 * every route handler, server action, and protected server page verifies the
 * session and role directly on the server.
 */
export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const pathname = request.nextUrl.pathname;

  if (
    !isDev &&
    (pathname === "/dev" ||
      pathname.startsWith("/dev/") ||
      pathname.startsWith("/api/dev/"))
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const adminPath = process.env.ADMIN_PORTAL_PATH ?? "/ops-portal";
  const useNonceCsp = doesRouteRequirePerRequestNonce(pathname, adminPath);

  const permissionsPolicy = [
    "geolocation=(self)",
    "camera=()",
    "microphone=()",
    'payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")',
    "usb=()",
    "interest-cohort=()",
  ].join(", ");

  const requestHeaders = new Headers(request.headers);
  let cspDirectives: string;

  if (useNonceCsp) {
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const nonce = Buffer.from(nonceBytes).toString("base64");
    cspDirectives = buildDynamicNonceCspHeader(nonce, isDev);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("x-csp-mode", "nonce");
  } else {
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const nonce = Buffer.from(nonceBytes).toString("base64");
    cspDirectives = buildStaticHashCspHeader(isDev, [], nonce);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("x-csp-mode", "static-hash");
  }

  requestHeaders.set("Content-Security-Policy", cspDirectives);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", cspDirectives);
  response.headers.set("Permissions-Policy", permissionsPolicy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-CSP-Mode", useNonceCsp ? "nonce" : "static-hash");

  if (pathname.startsWith(adminPath) || pathname.startsWith("/dealer")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "no-store, max-age=0");
    if (pathname.startsWith("/dealer")) {
      response.headers.set("Referrer-Policy", "no-referrer");
    }
  }

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

