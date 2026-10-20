import { describe, expect, it } from "vitest";
import {
  computeDisplayedStock,
  formatInrFromPaise,
} from "../../src/lib/catalogue/stock";
import {
  estimateDelivery,
  extractIstCalendarParts,
  SEED_INDIAN_HOLIDAYS_2026_2027,
  upsertHolidayForAdmin,
  resetInMemoryHolidaysForTests,
} from "../../src/lib/orders/estimate-delivery";
import {
  CloudObjectStorageAdapter,
  detectImageMimeFromMagicBytes,
  extractImageDimensions,
  isSafeUploadFilename,
  validateAndSanitizeImageBuffer,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_PIXEL_DIMENSION,
} from "../../src/lib/storage/image-adapter";
import {
  doesRouteRequirePerRequestNonce,
  buildStaticHashCspHeader,
  buildDynamicNonceCspHeader,
} from "../../src/proxy";
import {
  assertNoPlaceholdersInProduction,
  brandConfig,
  getLegalFieldDisplay,
  getUnconfiguredLegalFields,
  isDeploymentPlatformEnvironment,
  resolveBuildDeploymentMode,
  shouldEnforceProductionBrandPlaceholders,
} from "../../src/config/brand";
import { GET as getUploadRoute } from "../../src/app/api/uploads/[filename]/route";

/**
 * Helper to build a minimal valid PNG buffer with explicit width and height in IHDR.
 */
function createMinimalPngBuffer(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrLength = Buffer.alloc(4);
  ihdrLength.writeUInt32BE(13, 0);
  const ihdrType = Buffer.from("IHDR", "ascii");
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type
  const ihdrCrc = Buffer.alloc(4);
  const iendChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return Buffer.concat([
    signature,
    ihdrLength,
    ihdrType,
    ihdrData,
    ihdrCrc,
    iendChunk,
  ]);
}

describe("Phase 3 & Step 1 Unit Tests: Stock, Asia/Kolkata Delivery Estimator, CSP Split, Deployment Compliance, and Image Serving", () => {
  it("computes displayedStock = supplier_stock - reserved - buffer and resolves status labels accurately", () => {
    const refNow = new Date("2026-10-10T12:00:00Z");
    const freshConfirm = new Date("2026-10-10T06:00:00Z");
    const staleConfirm = new Date("2026-10-05T12:00:00Z");

    const inStock = computeDisplayedStock(
      {
        supplierStock: 25,
        reservedStock: 2,
        bufferStock: 3,
        stockLastConfirmedAt: freshConfirm,
      },
      { now: refNow }
    );
    expect(inStock.displayedStock).toBe(20);
    expect(inStock.statusKind).toBe("IN_STOCK");
    expect(inStock.label).toBe("In stock");
    expect(inStock.isPurchasable).toBe(true);

    const lowStock = computeDisplayedStock(
      {
        supplierStock: 9,
        reservedStock: 3,
        bufferStock: 3,
        stockLastConfirmedAt: freshConfirm,
      },
      { now: refNow }
    );
    expect(lowStock.displayedStock).toBe(3);
    expect(lowStock.statusKind).toBe("LOW_STOCK");
    expect(lowStock.label).toBe("Only 3 left");

    const staleStock = computeDisplayedStock(
      {
        supplierStock: 20,
        reservedStock: 1,
        bufferStock: 2,
        stockLastConfirmedAt: staleConfirm,
      },
      { now: refNow }
    );
    expect(staleStock.isStaleConfirmation).toBe(true);
    expect(staleStock.statusKind).toBe("LIMITED_STOCK");
    expect(staleStock.label).toBe("Limited stock");

    const outOfStock = computeDisplayedStock(
      {
        supplierStock: 4,
        reservedStock: 2,
        bufferStock: 3,
        stockLastConfirmedAt: freshConfirm,
      },
      { now: refNow }
    );
    expect(outOfStock.displayedStock).toBe(0);
    expect(outOfStock.statusKind).toBe("OUT_OF_STOCK");
    expect(outOfStock.isPurchasable).toBe(false);
  });

  it("formats paise as Indian Rupees with en-IN grouping", () => {
    expect(formatInrFromPaise(145000)).toBe("₹1,450");
    expect(formatInrFromPaise(12500000)).toBe("₹1,25,000");
  });

  it("Step 1.1: keeps home, legal pages, and 404 on a strict hash-based CSP and uses per-request nonces only on auth, checkout, and admin routes", () => {
    expect(doesRouteRequirePerRequestNonce("/")).toBe(false);
    expect(doesRouteRequirePerRequestNonce("/legal/privacy")).toBe(false);
    expect(doesRouteRequirePerRequestNonce("/legal/terms")).toBe(false);
    expect(doesRouteRequirePerRequestNonce("/404")).toBe(false);
    expect(doesRouteRequirePerRequestNonce("/catalogue")).toBe(false);

    expect(doesRouteRequirePerRequestNonce("/login")).toBe(true);
    expect(doesRouteRequirePerRequestNonce("/register")).toBe(true);
    expect(doesRouteRequirePerRequestNonce("/checkout")).toBe(true);
    expect(doesRouteRequirePerRequestNonce("/ops-portal/products")).toBe(true);

    const staticCsp = buildStaticHashCspHeader(false);
    expect(staticCsp).toContain("script-src 'self' 'sha256-");
    expect(staticCsp).not.toContain("challenges.cloudflare.com");
    expect(staticCsp).not.toContain("checkout.razorpay.com");
    expect(staticCsp).toContain("frame-src 'none'");

    const dynamicCsp = buildDynamicNonceCspHeader("testNonce123==", false);
    expect(dynamicCsp).toContain("'nonce-testNonce123=='");
    expect(dynamicCsp).toContain("https://challenges.cloudflare.com");
    expect(dynamicCsp).toContain("https://checkout.razorpay.com");
  });

  it("Step 1.2: distinguishes local-preview builds from production deployments, rejects placeholders/missing fields in production, and passes when legitimate values are supplied", () => {
    // 1. Local preview build with placeholders (NODE_ENV=production set by `next build`, DEPLOYMENT_TARGET=local-preview on localhost)
    const localPreviewEnv = {
      NODE_ENV: "production",
      DEPLOYMENT_TARGET: "local-preview",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    } as unknown as NodeJS.ProcessEnv;
    expect(isDeploymentPlatformEnvironment(localPreviewEnv)).toBe(false);
    expect(resolveBuildDeploymentMode(localPreviewEnv)).toBe("local-preview");
    expect(shouldEnforceProductionBrandPlaceholders(localPreviewEnv)).toBe(
      false
    );
    expect(() =>
      assertNoPlaceholdersInProduction(brandConfig, localPreviewEnv)
    ).not.toThrow();

    // Unconfigured legal fields are explicitly labeled as unconfigured and never represented as verified
    const unconfiguredList = getUnconfiguredLegalFields({
      grievanceOfficerName:
        "PLACEHOLDER_GRIEVANCE_OFFICER_REPLACE_BEFORE_LAUNCH",
      registeredAddress:
        "PLACEHOLDER_REGISTERED_ADDRESS_REPLACE_BEFORE_LAUNCH",
      gstinPlaceholder: "PLACEHOLDER_GSTIN_29AABCK0000X1Z5",
    });
    expect(unconfiguredList).toHaveLength(3);
    const officerDisplay = getLegalFieldDisplay(
      "PLACEHOLDER_GRIEVANCE_OFFICER_REPLACE_BEFORE_LAUNCH",
      "GRIEVANCE_OFFICER_NAME"
    );
    expect(officerDisplay.isConfigured).toBe(false);
    expect(officerDisplay.displayText).toContain("Unconfigured");

    // 2. Legacy ALLOW_PLACEHOLDER_BRAND_IN_BUILD=true on localhost is also treated as local-preview
    const legacyLocalBuildEnv = {
      NODE_ENV: "production",
      ALLOW_PLACEHOLDER_BRAND_IN_BUILD: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    } as unknown as NodeJS.ProcessEnv;
    expect(shouldEnforceProductionBrandPlaceholders(legacyLocalBuildEnv)).toBe(
      false
    );

    // 3. Production lock: DEPLOYMENT_TARGET=local-preview and ALLOW_PLACEHOLDER_BRAND_IN_BUILD=true
    // are strictly ignored on any cloud deployment platform OR when NEXT_PUBLIC_APP_URL is a non-localhost domain
    const vercelProdEnv = {
      NODE_ENV: "production",
      DEPLOYMENT_TARGET: "local-preview",
      ALLOW_PLACEHOLDER_BRAND_IN_BUILD: "true",
      VERCEL: "1",
    } as unknown as NodeJS.ProcessEnv;
    expect(isDeploymentPlatformEnvironment(vercelProdEnv)).toBe(true);
    expect(resolveBuildDeploymentMode(vercelProdEnv)).toBe("production");
    expect(shouldEnforceProductionBrandPlaceholders(vercelProdEnv)).toBe(true);
    expect(() =>
      assertNoPlaceholdersInProduction(
        {
          grievanceOfficerName: "PLACEHOLDER_GRIEVANCE_OFFICER",
        },
        vercelProdEnv
      )
    ).toThrow(/FATAL PRODUCTION COMPLIANCE CHECK/i);

    const publicDomainEnv = {
      NODE_ENV: "production",
      DEPLOYMENT_TARGET: "local-preview",
      ALLOW_PLACEHOLDER_BRAND_IN_BUILD: "true",
      NEXT_PUBLIC_APP_URL: "https://kalaandkiln.in",
    } as unknown as NodeJS.ProcessEnv;
    expect(resolveBuildDeploymentMode(publicDomainEnv)).toBe("production");
    expect(shouldEnforceProductionBrandPlaceholders(publicDomainEnv)).toBe(
      true
    );
    expect(() =>
      assertNoPlaceholdersInProduction(brandConfig, publicDomainEnv)
    ).toThrow(/FATAL PRODUCTION COMPLIANCE CHECK/i);

    const explicitProdTargetEnv = {
      NODE_ENV: "production",
      DEPLOYMENT_TARGET: "production",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    } as unknown as NodeJS.ProcessEnv;
    expect(shouldEnforceProductionBrandPlaceholders(explicitProdTargetEnv)).toBe(
      true
    );
    expect(() =>
      assertNoPlaceholdersInProduction(brandConfig, explicitProdTargetEnv)
    ).toThrow(/FATAL PRODUCTION COMPLIANCE CHECK/i);

    // 4. Production rejection when required legal fields are empty or missing
    expect(() =>
      assertNoPlaceholdersInProduction(
        {
          grievanceOfficerName: "   ",
          registeredAddress: "18 Residency Road, Bengaluru, Karnataka 560025",
          gstinPlaceholder: "29AABCK9182F1Z4",
        },
        explicitProdTargetEnv
      )
    ).toThrow(/FATAL PRODUCTION COMPLIANCE CHECK/i);

    // 5. Successful production validation when legitimate values are supplied
    const legitimateProdConfig = {
      ...brandConfig,
      grievanceOfficerName: "Priya Nair, Grievance & Compliance Officer",
      registeredAddress:
        "No. 18, Residency Road, Ashok Nagar, Bengaluru, Karnataka 560025",
      gstinPlaceholder: "29AABCK9182F1Z4",
    };
    expect(getUnconfiguredLegalFields(legitimateProdConfig)).toEqual([]);
    expect(() =>
      assertNoPlaceholdersInProduction(legitimateProdConfig, vercelProdEnv)
    ).not.toThrow();
    expect(() =>
      assertNoPlaceholdersInProduction(
        legitimateProdConfig,
        explicitProdTargetEnv
      )
    ).not.toThrow();
    expect(() =>
      assertNoPlaceholdersInProduction(legitimateProdConfig, "production")
    ).not.toThrow();

    const verifiedGstinDisplay = getLegalFieldDisplay(
      legitimateProdConfig.gstinPlaceholder,
      "SELLER_GSTIN"
    );
    expect(verifiedGstinDisplay.isConfigured).toBe(true);
    expect(verifiedGstinDisplay.displayText).toBe("29AABCK9182F1Z4");
  });

  it("Step 1.5: computes delivery dates in Asia/Kolkata across midnight boundaries, daily order cut-off times, Sundays, and 2026/2027 holidays", async () => {
    resetInMemoryHolidaysForTests();

    // Verify both 2026 and 2027 holidays are seeded
    const years = new Set(SEED_INDIAN_HOLIDAYS_2026_2027.map((h) => h.year));
    expect(years.has(2026)).toBe(true);
    expect(years.has(2027)).toBe(true);

    // 1. Midnight boundary in Asia/Kolkata (UTC+05:30):
    // 2026-10-16T18:15:00Z = 2026-10-16 23:45 IST (still Friday 16 Oct in India)
    // 2026-10-16T18:45:00Z = 2026-10-17 00:15 IST (already Saturday 17 Oct in India)
    const beforeMidnightIst = extractIstCalendarParts("2026-10-16T18:15:00Z");
    const afterMidnightIst = extractIstCalendarParts("2026-10-16T18:45:00Z");
    expect(beforeMidnightIst.isoDate).toBe("2026-10-16");
    expect(beforeMidnightIst.hour).toBe(23);
    expect(afterMidnightIst.isoDate).toBe("2026-10-17");
    expect(afterMidnightIst.hour).toBe(0);

    // 2. Daily order cut-off time in Asia/Kolkata (14:00 IST):
    // Order placed at 13:45 IST (08:15 UTC) on Thursday 2026-10-15 -> before 14:00 IST cut-off
    const beforeCutoff = estimateDelivery({
      processingDays: 1,
      transitDays: 2,
      startDate: "2026-10-15T08:15:00Z", // 13:45 IST
      cutoffHourIst: 14,
      cutoffMinuteIst: 0,
    });
    expect(beforeCutoff.passedDailyCutoff).toBe(false);
    expect(beforeCutoff.effectiveProcessingDays).toBe(1);
    expect(beforeCutoff.estimatedDispatchDate).toBe("2026-10-16");

    // Order placed at 14:15 IST (08:45 UTC) on Thursday 2026-10-15 -> after 14:00 IST cut-off (+1 working day)
    const afterCutoff = estimateDelivery({
      processingDays: 1,
      transitDays: 2,
      startDate: "2026-10-15T08:45:00Z", // 14:15 IST
      cutoffHourIst: 14,
      cutoffMinuteIst: 0,
    });
    expect(afterCutoff.passedDailyCutoff).toBe(true);
    expect(afterCutoff.effectiveProcessingDays).toBe(2);
    expect(afterCutoff.estimatedDispatchDate).toBe("2026-10-17");

    // 3. 2027 Republic Day (Tuesday 2027-01-26) + Sunday (2027-01-24) skipping:
    // Start: Saturday 2027-01-23, processingDays = 2, transitDays = 1
    //   Sun 2027-01-24 -> Skipped (Sunday)
    //   Mon 2027-01-25 -> Working day 1
    //   Tue 2027-01-26 -> Skipped (2027 Republic Day holiday)
    //   Wed 2027-01-27 -> Working day 2 (Dispatch Date)
    //   Thu 2027-01-28 -> Transit day 1 (Earliest Delivery Date)
    const estimate2027 = estimateDelivery({
      processingDays: 2,
      transitDays: 1,
      startDate: "2027-01-23",
    });
    expect(estimate2027.estimatedDispatchDate).toBe("2027-01-27");
    expect(estimate2027.estimatedDeliveryDateMin).toBe("2027-01-28");
    expect(estimate2027.skippedSundays).toBe(1);
    expect(estimate2027.skippedHolidays).toContain("2027-01-26");

    // 4. Admin can add a custom studio holiday and estimateDelivery skips it
    await upsertHolidayForAdmin({
      date: "2027-02-10",
      name: "Annual Kiln Maintenance",
      isActive: true,
    });
    const withCustomHoliday = estimateDelivery({
      processingDays: 1,
      transitDays: 1,
      startDate: "2027-02-09",
    });
    expect(withCustomHoliday.skippedHolidays).toContain("2027-02-10");
    expect(withCustomHoliday.estimatedDispatchDate).toBe("2027-02-11");
  });

  it("Step 1.6: blocks path traversal, rejects SVG, enforces max 4096x4096 pixel dimensions, sets nosniff + immutable headers, and supports S3/Cloudinary adapters", async () => {
    // 1. Path traversal blocking
    expect(isSafeUploadFilename("../secret.jpg")).toBe(false);
    expect(isSafeUploadFilename("..\\secret.jpg")).toBe(false);
    expect(isSafeUploadFilename("%2e%2e%2fpasswd.jpg")).toBe(false);
    expect(
      isSafeUploadFilename("550e8400-e29b-41d4-a716-446655440000.svg")
    ).toBe(false);
    expect(
      isSafeUploadFilename("550e8400-e29b-41d4-a716-446655440000.png")
    ).toBe(true);

    const traversalResponse = await getUploadRoute(
      new Request("http://localhost:3000/api/uploads/..%2fpackage.json"),
      { params: Promise.resolve({ filename: "..%2fpackage.json" }) }
    );
    expect(traversalResponse.status).toBe(404);
    expect(traversalResponse.headers.get("X-Content-Type-Options")).toBe(
      "nosniff"
    );

    // 2. Disguised SVG rejection
    const fakeSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "utf8"
    );
    expect(detectImageMimeFromMagicBytes(fakeSvg)).toBeNull();
    expect(() => validateAndSanitizeImageBuffer(fakeSvg)).toThrow(
      /Unsupported or invalid image file signature/i
    );

    // 3. Valid PNG dimensions (800x1000) vs oversized pixel dimensions (5000x5000 > 4096x4096)
    const validPng = createMinimalPngBuffer(800, 1000);
    const dims = extractImageDimensions(validPng, "image/png");
    expect(dims).toEqual({ width: 800, height: 1000 });
    const sanitizedValid = validateAndSanitizeImageBuffer(validPng);
    expect(sanitizedValid.signature.mime).toBe("image/png");

    const hugePixelPng = createMinimalPngBuffer(
      MAX_IMAGE_PIXEL_DIMENSION + 500,
      1000
    );
    expect(() => validateAndSanitizeImageBuffer(hugePixelPng)).toThrow(
      /exceed the maximum allowed 4096x4096 pixels/i
    );

    // 4. Oversized byte buffer (> 5 MB)
    const oversizedBytes = Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1024, 0xff);
    expect(() => validateAndSanitizeImageBuffer(oversizedBytes)).toThrow(
      /exceeds the maximum allowed size/i
    );

    // 5. CloudObjectStorageAdapter (S3 & Cloudinary) behind ImageStorageAdapter
    let putHeaders: Record<string, string> = {};
    const s3Adapter = new CloudObjectStorageAdapter({
      provider: "s3",
      s3Bucket: "kala-kiln-assets",
      s3EndpointUrl: "https://s3.ap-south-1.amazonaws.com",
      fetchImpl: async (_url, init) => {
        putHeaders = (init?.headers ?? {}) as Record<string, string>;
        return new Response("", { status: 200 });
      },
    });

    const storedS3 = await s3Adapter.storeSanitizedImage({ buffer: validPng });
    expect(storedS3.provider).toBe("s3");
    expect(storedS3.mime).toBe("image/png");
    expect(putHeaders["Content-Type"]).toBe("image/png");
    expect(putHeaders["Cache-Control"]).toBe(
      "public, max-age=31536000, immutable"
    );
  });
});
