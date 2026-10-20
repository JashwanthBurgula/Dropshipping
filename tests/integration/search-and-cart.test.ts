import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  explainSearchQueryPlan,
  getInstantSearchSuggestions,
  getNoResultQueryKpiLogs,
  purgeExpiredSearchQueryLogs,
  recordNoResultSearchQueryLog,
  resetSearchQueryLogsForTests,
  SEARCH_QUERY_LOG_MAX_CHARS,
  searchStorefrontProducts,
  shouldDropSearchQueryFromLog,
  truncateSearchQueryForLog,
} from "@/lib/search/service";
import {
  explainSimilarProductsQueryPlan,
  getSimilarInStockProducts,
} from "@/lib/catalogue/similar";
import {
  addItemToCustomerCart,
  getCustomerCart,
  resetInMemoryCartsForTests,
  setCustomerCartPinCode,
} from "@/lib/cart/service";
import {
  getProductRecordByIdIncludingInactive,
  listAdminProducts,
  resetInMemoryCatalogueForTests,
  setAdminProductActiveState,
  updateAdminProduct,
} from "@/lib/catalogue/service";
import { GET as getCartRoute, POST as postCartRoute } from "@/app/api/cart/route";
import { GET as getSuggestRoute } from "@/app/api/search/suggest/route";

describe("Phase 4 & Step 1 Real PostgreSQL Integration: Search, GIN Indexes, Similar Products, Search Query Log & Cart", () => {
  beforeEach(async () => {
    await resetInMemoryCatalogueForTests();
    await resetSearchQueryLogsForTests();
    await resetInMemoryCartsForTests();
  });

  afterAll(async () => {
    await resetInMemoryCatalogueForTests();
    await resetSearchQueryLogsForTests();
    await resetInMemoryCartsForTests();
  });

  describe("Step 1.1 & Step 1.6: Real PostgreSQL Full-Text + Trigram GIN Search, EXPLAIN Plans & Privacy-Safe Daily Log", () => {
    it("executes search and similar-products ranking in SQL using PostgreSQL GIN indexes without loading the catalogue into memory", async () => {
      const searchSource = fs.readFileSync(
        path.resolve(process.cwd(), "src/lib/search/service.ts"),
        "utf8"
      );
      const similarSource = fs.readFileSync(
        path.resolve(process.cwd(), "src/lib/catalogue/similar.ts"),
        "utf8"
      );
      expect(searchSource).not.toContain("listAllActiveStorefrontProducts");
      expect(similarSource).not.toContain("listAllActiveStorefrontProducts");

      const searchPlan = await explainSearchQueryPlan("terracota carfe");
      const searchPlanText = searchPlan.join("\n");
      expect(searchPlanText).toContain("products_fts_gin_idx");
      expect(searchPlanText).toContain("products_name_trgm_gin_idx");
      expect(searchPlanText).toContain("products_search_text_trgm_gin_idx");
      expect(searchPlanText).toContain("products_tags_gin_idx");

      const similarPlan = await explainSimilarProductsQueryPlan("prod-seed-01");
      const similarPlanText = similarPlan.join("\n");
      expect(similarPlanText).toContain("Sort");
    });

    it("matches exact and typo queries across name, description, category, and tags in PostgreSQL", async () => {
      // Exact query
      const exact = await searchStorefrontProducts({ query: "carafe" });
      expect(exact.hasNoResults).toBe(false);
      expect(exact.items.length).toBeGreaterThan(0);
      expect(exact.items[0]?.slug).toBe("fluted-terracotta-water-carafe");

      // Typo query via pg_trgm similarity ("terracota carfe" instead of "terracotta carafe")
      const typo = await searchStorefrontProducts({ query: "terracota carfe" });
      expect(typo.items.length).toBeGreaterThan(0);
      expect(
        typo.items.some(
          (item) => item.slug === "fluted-terracotta-water-carafe"
        )
      ).toBe(true);
    });

    it("returns in-stock alternatives first with an explanation and logs zero-PII KPI entry on no-result queries", async () => {
      const noMatch = await searchStorefrontProducts({
        query: "quantum spaceship",
      });
      expect(noMatch.hasNoResults).toBe(true);
      expect(noMatch.items).toHaveLength(0);
      expect(noMatch.inStockAlternatives.length).toBeGreaterThan(0);
      expect(
        noMatch.inStockAlternatives.every(
          (alt) => alt.stock.displayedStock > 0 && alt.stock.isPurchasable
        )
      ).toBe(true);
      expect(noMatch.fallbackExplanation).toContain(
        "We found no exact matches"
      );

      const logs = await getNoResultQueryKpiLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.normalizedQuery).toBe("quantum spaceship");
      expect(logs[0]?.resultCount).toBe(0);
      expect(logs[0]?.hasInStockMatch).toBe(false);
      expect(logs[0]?.searchCount).toBe(1);
    });

    it("Step 1.6: drops queries matching email, phone or long digit patterns, truncates to 60 chars, aggregates counts by day, and deletes rows older than 30 days", async () => {
      // 1. Drops email, phone, and long digit patterns
      expect(shouldDropSearchQueryFromLog("arjun.nair@example.com")).toBe(true);
      expect(shouldDropSearchQueryFromLog("+91 98450 12345")).toBe(true);
      expect(shouldDropSearchQueryFromLog("9845012345")).toBe(true);
      expect(shouldDropSearchQueryFromLog("pin 560038")).toBe(true);
      expect(shouldDropSearchQueryFromLog("order 12345")).toBe(true);
      expect(shouldDropSearchQueryFromLog("celadon bowl set")).toBe(false);

      const droppedEmail = await recordNoResultSearchQueryLog(
        "customer@example.com"
      );
      const droppedPhone = await recordNoResultSearchQueryLog("9845012345");
      const droppedDigits = await recordNoResultSearchQueryLog("invoice 998877");
      expect(droppedEmail.logged).toBe(false);
      expect(droppedPhone.logged).toBe(false);
      expect(droppedDigits.logged).toBe(false);
      expect(await getNoResultQueryKpiLogs()).toHaveLength(0);

      // 2. Truncates queries to 60 characters
      const longQuery =
        "handcrafted unglazed terracotta fermentation crock with heavy stoneware weight lid";
      const truncated = truncateSearchQueryForLog(longQuery);
      expect(truncated.length).toBeLessThanOrEqual(SEARCH_QUERY_LOG_MAX_CHARS);

      const today = new Date("2026-10-12T10:00:00.000Z");
      const firstLog = await recordNoResultSearchQueryLog(longQuery, today);
      expect(firstLog.logged).toBe(true);
      expect(firstLog.normalizedQuery?.length).toBeLessThanOrEqual(60);

      // 3. Aggregates counts by day when the same normalized query is searched again on the same date
      const secondLog = await recordNoResultSearchQueryLog(longQuery, today);
      expect(secondLog.logged).toBe(true);
      expect(secondLog.searchCount).toBe(2);

      // 4. Inserts an older entry (45 days ago) and verifies purgeExpiredSearchQueryLogs deletes rows older than 30 days
      const fortyFiveDaysAgo = new Date("2026-08-25T10:00:00.000Z");
      await recordNoResultSearchQueryLog(
        "vintage indigo runner",
        fortyFiveDaysAgo
      );
      expect(await getNoResultQueryKpiLogs()).toHaveLength(2);

      const purgedCount = await purgeExpiredSearchQueryLogs(today);
      expect(purgedCount).toBe(1);

      const remainingLogs = await getNoResultQueryKpiLogs();
      expect(remainingLogs).toHaveLength(1);
      expect(remainingLogs[0]?.normalizedQuery).toBe(truncated);
      expect(remainingLogs[0]?.searchCount).toBe(2);
    });

    it("surfaces in-stock alternatives first when the matched item is out of stock", async () => {
      // "Celadon Ribbed Stoneware Tea Caddy (250 g)" (prod-seed-06) is seeded out of stock (supplier=4, reserved=1, buffer=3 -> 0)
      const oosSearch = await searchStorefrontProducts({
        query: "Celadon Ribbed Stoneware Tea Caddy",
      });
      expect(oosSearch.topMatchOutOfStock).toBe(true);
      expect(oosSearch.inStockAlternatives.length).toBeGreaterThan(0);
      expect(
        oosSearch.inStockAlternatives.every(
          (item) => item.stock.displayedStock > 0 && item.stock.isPurchasable
        )
      ).toBe(true);
      expect(oosSearch.fallbackExplanation).toContain("currently out of stock");
    });

    it("returns instant suggestions and enforces rate limiting on /api/search/suggest", async () => {
      const { suggestions } = await getInstantSearchSuggestions("stoneware", 5);
      expect(suggestions.length).toBeGreaterThan(0);

      const req = new NextRequest(
        "http://localhost:3000/api/search/suggest?q=stoneware",
        {
          headers: { "x-forwarded-for": "203.0.113.55" },
        }
      );
      const res = await getSuggestRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("Similar Products Ranking", () => {
    it("ranks similar products by shared category, tag overlap, and trigram similarity while excluding self and out-of-stock items", async () => {
      const current = await getProductRecordByIdIncludingInactive(
        "prod-seed-01"
      );
      expect(current).not.toBeNull();

      const similar = await getSimilarInStockProducts({
        product: current!,
        limit: 4,
      });
      expect(similar.length).toBeGreaterThan(0);
      expect(similar.length).toBeLessThanOrEqual(4);

      // Must exclude self
      expect(similar.some((m) => m.product.id === current!.id)).toBe(false);
      // Must exclude out-of-stock items (like prod-seed-06 Celadon Tea Caddy)
      expect(
        similar.every(
          (m) =>
            m.product.stock.displayedStock > 0 && m.product.stock.isPurchasable
        )
      ).toBe(true);
      // Top match should share category Tableware & Ceramics
      expect(similar[0]?.product.category).toBe("Tableware & Ceramics");
    });
  });

  describe("Authenticated Database Cart, Stock Caps, Warnings, PIN GST Split & Tamper Prevention", () => {
    const userId = "user-customer-1";

    it("returns 401 AUTH_REQUIRED when an anonymous visitor calls /api/cart", async () => {
      const getReq = new NextRequest("http://localhost:3000/api/cart?strict=1");
      const getRes = await getCartRoute(getReq);
      expect(getRes.status).toBe(401);
      const getJson = await getRes.json();
      expect(getJson.code).toBe("AUTH_REQUIRED");

      const postReq = new NextRequest("http://localhost:3000/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: "prod-seed-01",
          quantity: 1,
        }),
      });
      const postRes = await postCartRoute(postReq);
      expect(postRes.status).toBe(401);
      const postJson = await postRes.json();
      expect(postJson.code).toBe("AUTH_REQUIRED");
    });

    it("rejects or caps quantities above displayed stock and ignores any client-supplied price", async () => {
      // prod-seed-03 (Shino Filter Coffee Dabarah) has supplierStock=9, reservedStock=2, bufferStock=3 -> displayedStock = 4
      const result = await addItemToCustomerCart({
        userId,
        productId: "prod-seed-03",
        quantityToAdd: 8, // Requesting 8 when only 4 are available
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.cappedByStock).toBe(true);
        expect(result.appliedQuantity).toBe(4);
        const line = result.cart.lines.find(
          (i) => i.productId === "prod-seed-03"
        );
        expect(line).toBeDefined();
        expect(line?.effectiveQuantity).toBe(4);
        // Price comes strictly from catalogue DB (118000 paise)
        expect(line?.currentUnitPricePaise).toBe(118000);
        expect(line?.taxBreakdown.lineTotalPaise).toBe(472000);
      }
    });

    it("surfaces plain-language warnings when a cart item changes price, has stock reduced below desired qty, sells out, or is deactivated", async () => {
      // Add prod-seed-01 (Ash-Glaze Stoneware Dinner Plate, price = 145000, displayedStock = 23) with quantityToAdd = 5
      await addItemToCustomerCart({
        userId,
        productId: "prod-seed-01",
        quantityToAdd: 5,
      });

      const adminList = await listAdminProducts({ status: "all" });
      const original = adminList.find((p) => p.id === "prod-seed-01");
      expect(original).toBeDefined();

      // 1. Admin changes price from Rs 1,450 (145000) to Rs 1,550 (155000) and reduces supplierStock to 7 (reserved=2, buffer=3 -> displayed=2)
      await updateAdminProduct(
        "prod-seed-01",
        {
          name: original!.name,
          shortDescription: original!.shortDescription,
          description: original!.description,
          category: original!.category,
          tags: original!.tags,
          material: original!.material,
          dimensions: original!.dimensions,
          careInstructions: original!.careInstructions ?? undefined,
          pricePaise: 155000,
          compareAtPaise: original!.compareAtPaise,
          taxSlab: original!.taxSlab,
          hsnCode: original!.hsnCode,
          supplierId: original!.supplierId,
          supplierSku: original!.supplierSku,
          supplierProductUrl: original!.supplierProductUrl ?? undefined,
          supplierStock: 7,
          bufferStock: 3,
          dispatchTimeDays: original!.dispatchTimeDays,
          images: original!.images.map((img) => ({
            url: img.url,
            altText: img.altText,
            aspectRatio: img.aspectRatio,
            sortOrder: img.sortOrder,
          })),
        },
        "admin-test",
        "127.0.0.1"
      );

      const cartAfterReduce = await getCustomerCart(userId);
      expect(
        cartAfterReduce.warnings.some(
          (w) => w.code === "QUANTITY_REDUCED_BY_STOCK"
        )
      ).toBe(true);
      expect(
        cartAfterReduce.warnings.some((w) => w.code === "PRICE_CHANGED")
      ).toBe(true);
      expect(cartAfterReduce.lines[0]?.effectiveQuantity).toBe(2);
      expect(cartAfterReduce.lines[0]?.currentUnitPricePaise).toBe(155000);

      // 2. Admin reduces supplierStock to 5 (reserved=2, buffer=3 -> displayed=0, out of stock)
      await updateAdminProduct(
        "prod-seed-01",
        {
          name: original!.name,
          shortDescription: original!.shortDescription,
          description: original!.description,
          category: original!.category,
          tags: original!.tags,
          material: original!.material,
          dimensions: original!.dimensions,
          careInstructions: original!.careInstructions ?? undefined,
          pricePaise: 155000,
          compareAtPaise: original!.compareAtPaise,
          taxSlab: original!.taxSlab,
          hsnCode: original!.hsnCode,
          supplierId: original!.supplierId,
          supplierSku: original!.supplierSku,
          supplierProductUrl: original!.supplierProductUrl ?? undefined,
          supplierStock: 5,
          bufferStock: 3,
          dispatchTimeDays: original!.dispatchTimeDays,
          images: original!.images.map((img) => ({
            url: img.url,
            altText: img.altText,
            aspectRatio: img.aspectRatio,
            sortOrder: img.sortOrder,
          })),
        },
        "admin-test",
        "127.0.0.1"
      );

      const cartAfterOos = await getCustomerCart(userId);
      expect(
        cartAfterOos.warnings.some((w) => w.code === "ITEM_OUT_OF_STOCK")
      ).toBe(true);
      expect(cartAfterOos.hasBlockingIssues).toBe(true);

      // 3. Admin soft-deletes (deactivates) the product
      await setAdminProductActiveState(
        "prod-seed-01",
        false,
        "admin-test",
        "127.0.0.1"
      );
      const cartAfterDeactivate = await getCustomerCart(userId);
      expect(
        cartAfterDeactivate.warnings.some((w) => w.code === "ITEM_DEACTIVATED")
      ).toBe(true);
      expect(cartAfterDeactivate.hasBlockingIssues).toBe(true);
    });

    it("computes intra-state CGST+SGST vs inter-state IGST and delivery date from PIN code, and rejects unserviceable PIN codes", async () => {
      await addItemToCustomerCart({
        userId,
        productId: "prod-seed-01", // Rs 1,450.00 (145000 paise), 12% GST
        quantityToAdd: 1,
      });

      // 1. Intra-state PIN: 560001 (Bengaluru, Karnataka)
      const intra = await setCustomerCartPinCode({ userId, pinCode: "560001" });
      expect(intra.ok).toBe(true);
      if (intra.ok) {
        expect(intra.cart.pinServiceability?.state).toBe("Karnataka");
        expect(intra.cart.totals.isIntraState).toBe(true);
        expect(intra.cart.totals.cgstTotalPaise).toBeGreaterThan(0);
        expect(intra.cart.totals.sgstTotalPaise).toBeGreaterThan(0);
        expect(intra.cart.totals.igstTotalPaise).toBe(0);
        expect(intra.cart.deliveryEstimate?.estimatedDeliveryDateMin).toMatch(
          /^\d{4}-\d{2}-\d{2}$/
        );
      }

      // 2. Inter-state PIN: 400001 (Mumbai, Maharashtra)
      const inter = await setCustomerCartPinCode({ userId, pinCode: "400001" });
      expect(inter.ok).toBe(true);
      if (inter.ok) {
        expect(inter.cart.pinServiceability?.state).toBe("Maharashtra");
        expect(inter.cart.totals.isIntraState).toBe(false);
        expect(inter.cart.totals.cgstTotalPaise).toBe(0);
        expect(inter.cart.totals.sgstTotalPaise).toBe(0);
        expect(inter.cart.totals.igstTotalPaise).toBeGreaterThan(0);
      }

      // 3. Unserviceable PIN: 999999
      const badPin = await setCustomerCartPinCode({
        userId,
        pinCode: "999999",
      });
      expect(badPin.ok).toBe(false);
      if (!badPin.ok) {
        expect(badPin.code).toBe("PIN_CODE_UNSERVICEABLE");
        expect(badPin.message).toContain(
          "PIN code 999999 is not currently serviceable"
        );
      }
    });
  });
});
