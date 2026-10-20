import type { MetadataRoute } from "next";

/**
 * Public robots.txt configuration.
 * Note: The admin portal path is intentionally omitted from robots.txt so its URL
 * is not disclosed to crawlers or scanners; it is protected via X-Robots-Tag: noindex
 * headers and server-side authentication + TOTP 2FA on every route.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/catalogue", "/legal/"],
        disallow: ["/dealer/", "/api/", "/account", "/checkout"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
