import type { NextConfig } from "next";
import {
  assertNoPlaceholdersInProduction,
  brandConfig,
  getUnconfiguredLegalFields,
  resolveBuildDeploymentMode,
  shouldEnforceProductionBrandPlaceholders,
} from "./src/config/brand";
import {
  assertEmailProviderConfig,
  printEmailStartupBannerOnce,
} from "./src/lib/email";

const buildDeploymentMode = resolveBuildDeploymentMode(process.env);
printEmailStartupBannerOnce(process.env);

if (shouldEnforceProductionBrandPlaceholders(process.env)) {
  assertNoPlaceholdersInProduction(brandConfig, process.env);
  assertEmailProviderConfig(process.env, { enforceProduction: true });
} else if (buildDeploymentMode === "local-preview") {
  const unconfigured = getUnconfiguredLegalFields(brandConfig);
  if (unconfigured.length > 0) {
    console.warn(
      `[LOCAL PREVIEW BUILD] Proceeding with unconfigured legal placeholders (${unconfigured
        .map((field) => field.envVar)
        .join(
          ", "
        )}). These values are labeled as unconfigured in the UI and will fail a production deployment build.`
    );
  }
}

const adminPortalPath = process.env.ADMIN_PORTAL_PATH ?? "/ops-portal";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["argon2"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              'geolocation=(self), camera=(), microphone=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com"), usb=(), interest-cohort=()',
          },
        ],
      },
      {
        source: `${adminPortalPath}/:path*`,
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
      {
        source: "/dealer/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
