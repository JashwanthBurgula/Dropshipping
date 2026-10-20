import { beforeEach, describe, expect, it } from "vitest";
import {
  resetInMemoryCatalogueForTests,
  listStorefrontCatalogue,
  getStorefrontProductBySlug,
  getActiveProductsForSitemap,
  getOrderProductSnapshotForHistory,
  listAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  setAdminProductActiveState,
  getInMemoryAuditLogsForTests,
} from "../../src/lib/catalogue/service";
import {
  searchStorefrontProducts,
  getInstantSearchSuggestions,
} from "../../src/lib/search/service";
import { GET as adminProductsGet, POST as adminProductsPost } from "../../src/app/api/admin/products/route";
import { DELETE as adminProductDelete } from "../../src/app/api/admin/products/[id]/route";
import { createSignedCsrfToken, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/lib/csrf";

describe("Phase 3 & Step 1.7 Integration Tests: Storefront Catalogue Filters, Admin CRUD, Soft Delete, Search/Sitemap Exclusion, and Past Order Readability", () => {
  beforeEach(async () => {
    await resetInMemoryCatalogueForTests();
  });

  it("seeds 24 active products across 4 categories and supports category filter, price range filter, sorting, and numbered pagination", async () => {
    const page1 = await listStorefrontCatalogue({
      sort: "newest",
      page: 1,
      pageSize: 12,
    });
    expect(page1.totalItems).toBe(24);
    expect(page1.totalPages).toBe(2);
    expect(page1.items).toHaveLength(12);

    // Filter by category
    const ceramics = await listStorefrontCatalogue({
      category: "Tableware & Ceramics",
      sort: "price_asc",
      page: 1,
      pageSize: 12,
    });
    expect(ceramics.totalItems).toBe(6);
    expect(
      ceramics.items.every((p) => p.category === "Tableware & Ceramics")
    ).toBe(true);
    // Verify ascending price sort
    for (let i = 1; i < ceramics.items.length; i++) {
      expect(ceramics.items[i]!.pricePaise).toBeGreaterThanOrEqual(
        ceramics.items[i - 1]!.pricePaise
      );
    }

    // Filter by price range (INR 1,000 to INR 2,000)
    const priceBand = await listStorefrontCatalogue({
      minPrice: 1000,
      maxPrice: 2000,
      sort: "price_desc",
      page: 1,
      pageSize: 24,
    });
    expect(priceBand.items.length).toBeGreaterThan(0);
    for (const item of priceBand.items) {
      expect(item.pricePaise).toBeGreaterThanOrEqual(100000);
      expect(item.pricePaise).toBeLessThanOrEqual(200000);
    }
  });

  it("Step 1.7: soft-deleted (inactive) products return null/404 on product detail, are excluded from catalogue, search, and sitemap, yet remain readable in past orders", async () => {
    // 1. Create a new product as Admin
    const created = await createAdminProduct(
      {
        name: "Bidriware Silver-Inlaid Paperweight",
        shortDescription:
          "Blackened zinc-copper alloy paperweight inlaid with pure silver geometric bands.",
        description:
          "Cast in Bidar using traditional soil-oxidation patination and inlaid by hand with 999 fine silver wire.",
        category: "Brass & Metalwork",
        tags: ["bidriware", "study", "silver-inlay"],
        material: "Zinc-copper alloy with 999 pure silver inlay",
        dimensions: "8 cm x 8 cm x 1.8 cm, Weight 410 g",
        careInstructions: "Wipe with a dry soft cloth.",
        pricePaise: 295000,
        compareAtPaise: null,
        taxSlab: "GST_12",
        hsnCode: "74181021",
        supplierId: "sup-moradabad-foundry",
        supplierSku: "PNF-BD-08-PW",
        supplierProductUrl: "https://peetalnagri.example.in/products/pnf-bd-08-pw",
        supplierStock: 15,
        bufferStock: 3,
        dispatchTimeDays: 3,
        images: [
          {
            url: "/placeholder/pnf-bd-08-pw-1",
            altText: "Bidriware Silver-Inlaid Paperweight",
            aspectRatio: "1:1",
            sortOrder: 0,
          },
        ],
      },
      "admin-seed-1",
      "127.0.0.1"
    );

    expect(created.isActive).toBe(true);
    expect(created.stock.displayedStock).toBe(12); // 15 - 0 - 3

    // Visible on storefront and sitemap
    const onStorefront = await getStorefrontProductBySlug(created.slug);
    expect(onStorefront).not.toBeNull();

    // 2. Edit product price and stock
    const updated = await updateAdminProduct(
      created.id,
      {
        name: "Bidriware Silver-Inlaid Paperweight (Large)",
        shortDescription:
          "Blackened zinc-copper alloy paperweight inlaid with pure silver geometric bands.",
        description:
          "Cast in Bidar using traditional soil-oxidation patination and inlaid by hand with 999 fine silver wire.",
        category: "Brass & Metalwork",
        tags: ["bidriware", "study"],
        material: "Zinc-copper alloy with 999 pure silver inlay",
        dimensions: "9 cm x 9 cm x 2 cm, Weight 480 g",
        careInstructions: "Wipe with a dry soft cloth.",
        pricePaise: 315000,
        compareAtPaise: null,
        taxSlab: "GST_12",
        hsnCode: "74181021",
        supplierId: "sup-moradabad-foundry",
        supplierSku: "PNF-BD-08-PW",
        supplierProductUrl: "https://peetalnagri.example.in/products/pnf-bd-08-pw",
        supplierStock: 10,
        bufferStock: 2,
        dispatchTimeDays: 3,
        images: [
          {
            url: "/placeholder/pnf-bd-08-pw-1",
            altText: "Bidriware Silver-Inlaid Paperweight",
            aspectRatio: "1:1",
            sortOrder: 0,
          },
        ],
      },
      "admin-seed-1",
      "127.0.0.1"
    );
    expect(updated?.pricePaise).toBe(315000);
    expect(updated?.stock.displayedStock).toBe(8);

    // 3. Soft delete (isActive = false)
    const archived = await setAdminProductActiveState(
      created.id,
      false,
      "admin-seed-1",
      "127.0.0.1"
    );
    expect(archived?.isActive).toBe(false);

    // Must return null (404) on Product Detail Page
    expect(await getStorefrontProductBySlug(created.slug)).toBeNull();

    // Must be excluded from storefront catalogue
    const catalogueAfterArchive = await listStorefrontCatalogue({
      sort: "newest",
      page: 1,
      pageSize: 48,
    });
    expect(
      catalogueAfterArchive.items.some((item) => item.id === created.id)
    ).toBe(false);

    // Must be excluded from search results and instant suggestions
    const searchAfterArchive = await searchStorefrontProducts({
      query: "Bidriware",
    });
    expect(
      searchAfterArchive.items.some((item) => item.id === created.id)
    ).toBe(false);
    const suggestAfterArchive = await getInstantSearchSuggestions("Bidriware");
    expect(
      suggestAfterArchive.suggestions.some((item) => item.id === created.id)
    ).toBe(false);

    // Must be excluded from sitemap
    const sitemapItems = await getActiveProductsForSitemap();
    expect(sitemapItems.some((s) => s.slug === created.slug)).toBe(false);

    // Must remain readable in past orders (getOrderProductSnapshotForHistory)
    const pastOrderSnapshot = await getOrderProductSnapshotForHistory(
      created.id
    );
    expect(pastOrderSnapshot).not.toBeNull();
    expect(pastOrderSnapshot?.isActive).toBe(false);
    expect(pastOrderSnapshot?.name).toBe(
      "Bidriware Silver-Inlaid Paperweight (Large)"
    );
    expect(pastOrderSnapshot?.hsnCode).toBe("74181021");
    expect(pastOrderSnapshot?.archivedNote).toContain("archived");

    // Must still exist in Admin product list
    const adminArchivedList = await listAdminProducts({ status: "archived" });
    expect(adminArchivedList.some((p) => p.id === created.id)).toBe(true);

    // 4. Restore product (isActive = true)
    const restored = await setAdminProductActiveState(
      created.id,
      true,
      "admin-seed-1",
      "127.0.0.1"
    );
    expect(restored?.isActive).toBe(true);
    expect(await getStorefrontProductBySlug(created.slug)).not.toBeNull();

    // 5. Verify AuditLog entries contain before and after values
    const audits = getInMemoryAuditLogsForTests();
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("PRODUCT_CREATED");
    expect(actions).toContain("PRODUCT_UPDATED");
    expect(actions).toContain("PRODUCT_SOFT_DELETED");
    expect(actions).toContain("PRODUCT_RESTORED");

    const updateAudit = audits.find((a) => a.action === "PRODUCT_UPDATED");
    expect(updateAudit?.beforeState).toMatchObject({ pricePaise: 295000 });
    expect(updateAudit?.afterState).toMatchObject({ pricePaise: 315000 });
  });

  it("returns 403 Forbidden when an unauthenticated or non-admin request calls admin product routes", async () => {
    const getRes = await adminProductsGet(
      new Request("http://localhost:3000/api/admin/products")
    );
    expect(getRes.status).toBe(403);

    const csrfToken = createSignedCsrfToken();
    const postRes = await adminProductsPost(
      new Request("http://localhost:3000/api/admin/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ name: "Unauthorized Attempt" }),
      })
    );
    expect(postRes.status).toBe(403);

    const delRes = await adminProductDelete(
      new Request("http://localhost:3000/api/admin/products/prod-seed-01", {
        method: "DELETE",
        headers: {
          Cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
          [CSRF_HEADER_NAME]: csrfToken,
        },
      }),
      { params: Promise.resolve({ id: "prod-seed-01" }) }
    );
    expect(delRes.status).toBe(403);
  });
});

