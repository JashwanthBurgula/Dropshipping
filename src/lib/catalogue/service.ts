import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { shouldEnforceProductionBrandPlaceholders } from "@/config/brand";
import {
  computeDisplayedStock,
  type ComputedStockResult,
} from "@/lib/catalogue/stock";
import {
  SEED_PRODUCTS,
  SEED_SUPPLIERS,
  type SeedSupplierItem,
} from "@/lib/data/seed-products";
import {
  percentToTaxSlab,
  slugifyProductName,
  taxSlabToPercent,
  type AdminProductInput,
  type CatalogueFilterInput,
  type TaxSlab,
} from "@/lib/validation/product";

export interface StorefrontProductImage {
  id: string;
  url: string;
  altText: string;
  aspectRatio: "1:1" | "4:5";
  sortOrder: number;
}

/**
 * Customer-safe product representation.
 * Internal supplier details and raw stock counters are stripped on the server.
 */
export interface StorefrontProduct {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  tags: string[];
  material: string;
  dimensions: string;
  careInstructions: string | null;
  pricePaise: number;
  compareAtPaise: number | null;
  taxSlab: TaxSlab;
  hsnCode: string;
  dispatchTimeDays: number;
  stock: ComputedStockResult;
  images: StorefrontProductImage[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Full administrator product representation including supplier and buffer fields.
 */
export interface AdminProductRecord {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  tags: string[];
  material: string;
  dimensions: string;
  careInstructions: string | null;
  pricePaise: number;
  compareAtPaise: number | null;
  taxSlab: TaxSlab;
  hsnCode: string;
  supplierId: string;
  supplierName: string;
  supplierSku: string;
  supplierProductUrl: string | null;
  supplierStock: number;
  reservedStock: number;
  bufferStock: number;
  dispatchTimeDays: number;
  stockLastConfirmedAt: string | null;
  isActive: boolean;
  stock: ComputedStockResult;
  images: StorefrontProductImage[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedStorefrontCatalogue {
  items: StorefrontProduct[];
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
  appliedFilters: CatalogueFilterInput;
}

export interface AdminAuditEntry {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string;
  createdAt: string;
}

/**
 * In-memory fallback store used ONLY in development or test environments when
 * PostgreSQL is not running locally, ensuring deterministic tests and builds.
 */
interface InMemoryProductState {
  initialized: boolean;
  suppliers: Map<string, SeedSupplierItem>;
  products: Map<string, AdminProductRecord>;
  auditLogs: AdminAuditEntry[];
}

const globalForCatalogue = globalThis as unknown as {
  __kalaCatalogueMem?: InMemoryProductState;
};

function getInMemoryCatalogueState(): InMemoryProductState {
  if (!globalForCatalogue.__kalaCatalogueMem) {
    const suppliers = new Map<string, SeedSupplierItem>();
    for (const s of SEED_SUPPLIERS) {
      suppliers.set(s.id, s);
    }

    const products = new Map<string, AdminProductRecord>();
    const nowMs = Date.now();

    SEED_PRODUCTS.forEach((p, idx) => {
      const id = `prod-seed-${String(idx + 1).padStart(2, "0")}`;
      const confirmedAt = new Date(
        nowMs - p.stockConfirmedHoursAgo * 60 * 60 * 1000
      );
      const createdAt = new Date(
        nowMs - (SEED_PRODUCTS.length - idx) * 3600 * 1000
      ).toISOString();
      const sup = suppliers.get(p.supplierId);

      const stock = computeDisplayedStock({
        supplierStock: p.supplierStock,
        reservedStock: p.reservedStock,
        bufferStock: p.bufferStock,
        stockLastConfirmedAt: confirmedAt,
      });

      products.set(id, {
        id,
        slug: p.slug,
        name: p.name,
        shortDescription: p.shortDescription,
        description: p.description,
        category: p.category,
        tags: [...p.tags],
        material: p.material,
        dimensions: p.dimensions,
        careInstructions: p.careInstructions,
        pricePaise: p.pricePaise,
        compareAtPaise: p.compareAtPaise ?? null,
        taxSlab: p.taxSlab,
        hsnCode: p.hsnCode,
        supplierId: p.supplierId,
        supplierName: sup?.name ?? "Studio Workshop",
        supplierSku: p.supplierSku,
        supplierProductUrl: p.supplierProductUrl,
        supplierStock: p.supplierStock,
        reservedStock: p.reservedStock,
        bufferStock: p.bufferStock,
        dispatchTimeDays: p.dispatchTimeDays,
        stockLastConfirmedAt: confirmedAt.toISOString(),
        isActive: p.isActive,
        stock,
        images: p.images.map((img, i) => ({
          id: `${id}-img-${i + 1}`,
          url: img.url,
          altText: img.altText,
          aspectRatio: img.aspectRatio,
          sortOrder: img.sortOrder,
        })),
        createdAt,
        updatedAt: createdAt,
      });
    });

    globalForCatalogue.__kalaCatalogueMem = {
      initialized: true,
      suppliers,
      products,
      auditLogs: [],
    };
  }
  return globalForCatalogue.__kalaCatalogueMem;
}

export async function resetInMemoryCatalogueForTests(): Promise<void> {
  globalForCatalogue.__kalaCatalogueMem = undefined;
  if (process.env.DATABASE_URL) {
    try {
      await prisma.cartItem.deleteMany({});
      await prisma.product.deleteMany({
        where: {
          NOT: {
            id: {
              startsWith: "prod-seed-",
            },
          },
        },
      });
      const seed01 = SEED_PRODUCTS[0];
      if (seed01) {
        await prisma.product.updateMany({
          where: { id: "prod-seed-01" },
          data: {
            name: seed01.name,
            hsnCode: seed01.hsnCode,
            pricePaise: seed01.pricePaise,
            supplierStock: seed01.supplierStock,
            reservedStock: seed01.reservedStock,
            stockBuffer: seed01.bufferStock,
            isActive: true,
          },
        });
      }
      const seed02 = SEED_PRODUCTS[1];
      if (seed02) {
        await prisma.product.updateMany({
          where: { id: "prod-seed-02" },
          data: {
            name: seed02.name,
            pricePaise: seed02.pricePaise,
            supplierStock: seed02.supplierStock,
            reservedStock: seed02.reservedStock,
            stockBuffer: seed02.bufferStock,
            isActive: true,
          },
        });
      }
    } catch {
      // Ignore if DB is not connected
    }
  }
}

export function getInMemoryAuditLogsForTests(): AdminAuditEntry[] {
  return [...getInMemoryCatalogueState().auditLogs];
}

function toStorefrontProduct(record: AdminProductRecord): StorefrontProduct {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    shortDescription: record.shortDescription,
    description: record.description,
    category: record.category,
    tags: record.tags,
    material: record.material,
    dimensions: record.dimensions,
    careInstructions: record.careInstructions,
    pricePaise: record.pricePaise,
    compareAtPaise: record.compareAtPaise,
    taxSlab: record.taxSlab,
    hsnCode: record.hsnCode,
    dispatchTimeDays: record.dispatchTimeDays,
    stock: computeDisplayedStock({
      supplierStock: record.supplierStock,
      reservedStock: record.reservedStock,
      bufferStock: record.bufferStock,
      stockLastConfirmedAt: record.stockLastConfirmedAt,
    }),
    images: record.images,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function fetchAllAdminProductsFromDbOrFallback(): Promise<{
  records: AdminProductRecord[];
  usingFallback: boolean;
}> {
  if (!process.env.DATABASE_URL) {
    const state = getInMemoryCatalogueState();
    return {
      records: Array.from(state.products.values()).map((r) => ({
        ...r,
        stock: computeDisplayedStock({
          supplierStock: r.supplierStock,
          reservedStock: r.reservedStock,
          bufferStock: r.bufferStock,
          stockLastConfirmedAt: r.stockLastConfirmedAt,
        }),
      })),
      usingFallback: true,
    };
  }

  try {
    const rows = await prisma.product.findMany({
      include: {
        supplier: true,
        images: {
          orderBy: { position: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (rows.length === 0 && process.env.NODE_ENV !== "production") {
      const state = getInMemoryCatalogueState();
      return {
        records: Array.from(state.products.values()),
        usingFallback: true,
      };
    }

    const mapped: AdminProductRecord[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      shortDescription: row.shortDescription,
      description: row.description,
      category: row.category,
      tags: row.tags,
      material: row.material ?? "Handcrafted natural material",
      dimensions: row.dimensions ?? "Standard studio dimensions",
      careInstructions: row.careInstructions ?? null,
      pricePaise: row.pricePaise,
      compareAtPaise: row.compareAtPricePaise,
      taxSlab: percentToTaxSlab(row.taxSlabPercent),
      hsnCode: row.hsnCode,
      supplierId: row.supplierId,
      supplierName: row.supplier.name,
      supplierSku: row.supplierSku,
      supplierProductUrl: row.supplierProductUrl ?? null,
      supplierStock: row.supplierStock,
      reservedStock: row.reservedStock,
      bufferStock: row.stockBuffer,
      dispatchTimeDays: row.processingDays,
      stockLastConfirmedAt: row.stockLastConfirmedAt
        ? row.stockLastConfirmedAt.toISOString()
        : null,
      isActive: row.isActive,
      stock: computeDisplayedStock({
        supplierStock: row.supplierStock,
        reservedStock: row.reservedStock,
        bufferStock: row.stockBuffer,
        stockLastConfirmedAt: row.stockLastConfirmedAt,
      }),
      images: row.images.map((img) => ({
        id: img.id,
        url: img.imageUrl,
        altText: img.altText,
        aspectRatio: img.aspectRatio === "1:1" ? "1:1" : "4:5",
        sortOrder: img.position,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    return { records: mapped, usingFallback: false };
  } catch (err) {
    if (shouldEnforceProductionBrandPlaceholders(process.env)) {
      throw err;
    }
    const state = getInMemoryCatalogueState();
    return {
      records: Array.from(state.products.values()),
      usingFallback: true,
    };
  }
}

/**
 * Lists active storefront products with category filter, rupee price range,
 * sorting (newest, price_asc, price_desc), and numbered pagination.
 */
export async function listStorefrontCatalogue(
  filters: CatalogueFilterInput
): Promise<PaginatedStorefrontCatalogue> {
  const { records } = await fetchAllAdminProductsFromDbOrFallback();

  let active = records.filter((item) => item.isActive);

  if (filters.category && filters.category.trim() !== "") {
    const targetCategory = filters.category.trim().toLowerCase();
    active = active.filter(
      (item) => item.category.toLowerCase() === targetCategory
    );
  }

  if (typeof filters.minPrice === "number" && !Number.isNaN(filters.minPrice)) {
    const minPaise = Math.round(filters.minPrice * 100);
    active = active.filter((item) => item.pricePaise >= minPaise);
  }

  if (typeof filters.maxPrice === "number" && !Number.isNaN(filters.maxPrice)) {
    const maxPaise = Math.round(filters.maxPrice * 100);
    active = active.filter((item) => item.pricePaise <= maxPaise);
  }

  if (filters.sort === "price_asc") {
    active.sort((a, b) => a.pricePaise - b.pricePaise);
  } else if (filters.sort === "price_desc") {
    active.sort((a, b) => b.pricePaise - a.pricePaise);
  } else {
    active.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  const totalItems = active.length;
  const pageSize = filters.pageSize ?? 12;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const startIndex = (safePage - 1) * pageSize;

  const pageSlice = active
    .slice(startIndex, startIndex + pageSize)
    .map(toStorefrontProduct);

  return {
    items: pageSlice,
    totalItems,
    page: safePage,
    pageSize,
    totalPages,
    appliedFilters: {
      ...filters,
      page: safePage,
      pageSize,
    },
  };
}

/**
 * Fetches a single active product by slug for the storefront Product Detail Page.
 * Soft-deleted products (`isActive === false`) return null (404 on storefront).
 */
export async function getStorefrontProductBySlug(
  slug: string
): Promise<StorefrontProduct | null> {
  const normalizedSlug = slug.trim().toLowerCase();

  if (Boolean(process.env.DATABASE_URL)) {
    try {
      const row = await prisma.product.findFirst({
        where: {
          slug: normalizedSlug,
          isActive: true,
        },
        include: {
          supplier: true,
          images: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (row) {
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          shortDescription: row.shortDescription,
          description: row.description,
          category: row.category,
          tags: row.tags,
          material: row.material ?? "Handcrafted natural material",
          dimensions: row.dimensions ?? "Standard studio dimensions",
          careInstructions: row.careInstructions ?? null,
          pricePaise: row.pricePaise,
          compareAtPaise: row.compareAtPricePaise,
          taxSlab: percentToTaxSlab(row.taxSlabPercent),
          hsnCode: row.hsnCode,
          dispatchTimeDays: row.processingDays,
          stock: computeDisplayedStock({
            supplierStock: row.supplierStock,
            reservedStock: row.reservedStock,
            bufferStock: row.stockBuffer,
            stockLastConfirmedAt: row.stockLastConfirmedAt,
          }),
          images: row.images.map((img) => ({
            id: img.id,
            url: img.imageUrl,
            altText: img.altText,
            aspectRatio: img.aspectRatio === "1:1" ? "1:1" : "4:5",
            sortOrder: img.position,
          })),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      }
      return null;
    } catch {
      // Database query error; fall through to fallback
    }
  }

  const { records } = await fetchAllAdminProductsFromDbOrFallback();
  const match = records.find(
    (r) => r.slug.toLowerCase() === normalizedSlug && r.isActive
  );
  if (!match) return null;
  return toStorefrontProduct(match);
}

/**
 * Returns active product slugs and timestamps for `src/app/sitemap.ts`.
 * Soft-deleted products are excluded.
 */
export async function getActiveProductsForSitemap(): Promise<
  Array<{ slug: string; updatedAt: string }>
> {
  const { records } = await fetchAllAdminProductsFromDbOrFallback();
  return records
    .filter((r) => r.isActive)
    .map((r) => ({ slug: r.slug, updatedAt: r.updatedAt }));
}

/**
 * Fetches a product record by ID regardless of `isActive` status.
 * Used by the server-side Cart service (to warn when an item in a customer's cart
 * is later deactivated) and by historical Order readers.
 */
export async function getProductRecordByIdIncludingInactive(
  productId: string
): Promise<(StorefrontProduct & { isActive: boolean }) | null> {
  const { records } = await fetchAllAdminProductsFromDbOrFallback();
  const match = records.find((r) => r.id === productId);
  if (!match) return null;
  return {
    ...toStorefrontProduct(match),
    isActive: match.isActive,
  };
}

export interface HistoricalOrderProductView {
  productId: string;
  slug: string;
  name: string;
  category: string;
  hsnCode: string;
  taxSlab: TaxSlab;
  pricePaise: number;
  primaryImage: StorefrontProductImage | null;
  isActive: boolean;
  archivedNote: string | null;
}

/**
 * Resolves a product referenced by a past `OrderItem` (`order_items.product_id`).
 * Because products use soft-delete (`isActive = false`) and are never hard-deleted,
 * historical orders always retain full product readability even after a product
 * is archived from the storefront catalogue, search, and sitemap.
 */
export async function getOrderProductSnapshotForHistory(
  productId: string
): Promise<HistoricalOrderProductView | null> {
  const record = await getProductRecordByIdIncludingInactive(productId);
  if (!record) return null;

  return {
    productId: record.id,
    slug: record.slug,
    name: record.name,
    category: record.category,
    hsnCode: record.hsnCode,
    taxSlab: record.taxSlab,
    pricePaise: record.pricePaise,
    primaryImage: record.images[0] ?? null,
    isActive: record.isActive,
    archivedNote: record.isActive
      ? null
      : "This studio piece has been archived from the current catalogue, but your past order record and GST invoice details remain preserved.",
  };
}

/**
 * Lists all suppliers for the Admin Product form selector.
 */
export async function listSuppliersForAdmin(): Promise<SeedSupplierItem[]> {
  if (process.env.VITEST === "true") {
    return Array.from(getInMemoryCatalogueState().suppliers.values());
  }
  try {
    const rows = await prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    if (rows.length === 0) {
      return SEED_SUPPLIERS;
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      contactName: "",
      email: r.contactEmail,
      phone: r.contactPhone,
      city: "Studio",
      state: "India",
      pinCode: "",
      leadTimeDays: 2,
      notes: "",
    }));
  } catch {
    return SEED_SUPPLIERS;
  }
}

/**
 * Lists all products (both active and soft-deleted) for the Admin Portal
 * with search, category, and status (`all` | `active` | `archived`) filters.
 */
export async function listAdminProducts(params?: {
  search?: string;
  category?: string;
  status?: "all" | "active" | "archived";
}): Promise<AdminProductRecord[]> {
  const { records } = await fetchAllAdminProductsFromDbOrFallback();
  let filtered = [...records];

  if (params?.status === "active") {
    filtered = filtered.filter((r) => r.isActive);
  } else if (params?.status === "archived") {
    filtered = filtered.filter((r) => !r.isActive);
  }

  if (params?.category && params.category.trim() !== "") {
    const cat = params.category.trim().toLowerCase();
    filtered = filtered.filter((r) => r.category.toLowerCase() === cat);
  }

  if (params?.search && params.search.trim() !== "") {
    const q = params.search.trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        r.supplierSku.toLowerCase().includes(q) ||
        r.hsnCode.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }

  return filtered;
}

async function recordAdminProductAudit(params: {
  actorId: string;
  action: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string;
}): Promise<void> {
  const mem = getInMemoryCatalogueState();
  mem.auditLogs.push({
    id: crypto.randomUUID(),
    actorId: params.actorId,
    action: params.action,
    entityType: "Product",
    entityId: params.entityId,
    beforeState: params.beforeState,
    afterState: params.afterState,
    ipAddress: params.ipAddress,
    createdAt: new Date().toISOString(),
  });

  if (process.env.VITEST === "true") {
    return;
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: params.actorId,
        actorRole: "ADMIN",
        action: params.action,
        targetType: "Product",
        targetId: params.entityId,
        metadata: JSON.parse(
          JSON.stringify({
            beforeState: params.beforeState,
            afterState: params.afterState,
          })
        ),
        ipAddress: params.ipAddress,
      },
    });
  } catch {
    // Fallback audit entry is already recorded in memory for dev environments
  }
}

/**
 * Creates a new product in the catalogue and records an AuditLog entry.
 */
export async function createAdminProduct(
  input: AdminProductInput,
  actorId: string,
  ipAddress: string
): Promise<AdminProductRecord> {
  const baseSlug = input.slug || slugifyProductName(input.name);
  const nowIso = new Date().toISOString();
  const mem = getInMemoryCatalogueState();

  const existingSlugs = new Set(
    Array.from(mem.products.values()).map((p) => p.slug)
  );
  const finalSlug = existingSlugs.has(baseSlug)
    ? `${baseSlug}-${crypto.randomBytes(2).toString("hex")}`
    : baseSlug;

  if (Boolean(process.env.DATABASE_URL)) {
    try {
      const created = await prisma.product.create({
        data: {
          slug: finalSlug,
          name: input.name,
          shortDescription: input.shortDescription,
          description: input.description,
          category: input.category,
          tags: input.tags,
          material: input.material,
          dimensions: input.dimensions,
          careInstructions: input.careInstructions ?? null,
          pricePaise: input.pricePaise,
          compareAtPricePaise: input.compareAtPaise ?? null,
          taxSlabPercent: taxSlabToPercent(input.taxSlab),
          hsnCode: input.hsnCode,
          supplierId: input.supplierId,
          supplierSku: input.supplierSku,
          supplierProductUrl: input.supplierProductUrl || null,
          supplierStock: input.supplierStock,
          reservedStock: 0,
          stockBuffer: input.bufferStock,
          processingDays: input.dispatchTimeDays,
          stockLastConfirmedAt: new Date(),
          isActive: true,
          images: {
            create: input.images.map((img, i) => ({
              imageUrl: img.url,
              altText: img.altText,
              aspectRatio: img.aspectRatio,
              position: img.sortOrder ?? i,
            })),
          },
        },
        include: {
          supplier: true,
          images: { orderBy: { position: "asc" } },
        },
      });

      const record: AdminProductRecord = {
        id: created.id,
        slug: created.slug,
        name: created.name,
        shortDescription: created.shortDescription,
        description: created.description,
        category: created.category,
        tags: created.tags,
        material: created.material ?? input.material,
        dimensions: created.dimensions ?? input.dimensions,
        careInstructions: created.careInstructions ?? null,
        pricePaise: created.pricePaise,
        compareAtPaise: created.compareAtPricePaise,
        taxSlab: percentToTaxSlab(created.taxSlabPercent),
        hsnCode: created.hsnCode,
        supplierId: created.supplierId,
        supplierName: created.supplier.name,
        supplierSku: created.supplierSku,
        supplierProductUrl: created.supplierProductUrl ?? null,
        supplierStock: created.supplierStock,
        reservedStock: created.reservedStock,
        bufferStock: created.stockBuffer,
        dispatchTimeDays: created.processingDays,
        stockLastConfirmedAt:
          created.stockLastConfirmedAt?.toISOString() ?? nowIso,
        isActive: created.isActive,
        stock: computeDisplayedStock({
          supplierStock: created.supplierStock,
          reservedStock: created.reservedStock,
          bufferStock: created.stockBuffer,
          stockLastConfirmedAt: created.stockLastConfirmedAt,
        }),
        images: created.images.map((img) => ({
          id: img.id,
          url: img.imageUrl,
          altText: img.altText,
          aspectRatio: img.aspectRatio === "1:1" ? "1:1" : "4:5",
          sortOrder: img.position,
        })),
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };

      await recordAdminProductAudit({
        actorId,
        action: "PRODUCT_CREATED",
        entityId: record.id,
        beforeState: null,
        afterState: {
          slug: record.slug,
          name: record.name,
          pricePaise: record.pricePaise,
          taxSlab: record.taxSlab,
          hsnCode: record.hsnCode,
          supplierStock: record.supplierStock,
          bufferStock: record.bufferStock,
          isActive: record.isActive,
        },
        ipAddress,
      });

      return record;
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw err;
      }
    }
  }

  const id = `prod-${crypto.randomUUID().slice(0, 8)}`;
  const supplier = mem.suppliers.get(input.supplierId);
  const record: AdminProductRecord = {
    id,
    slug: finalSlug,
    name: input.name,
    shortDescription: input.shortDescription,
    description: input.description,
    category: input.category,
    tags: [...input.tags],
    material: input.material,
    dimensions: input.dimensions,
    careInstructions: input.careInstructions ?? null,
    pricePaise: input.pricePaise,
    compareAtPaise: input.compareAtPaise ?? null,
    taxSlab: input.taxSlab,
    hsnCode: input.hsnCode,
    supplierId: input.supplierId,
    supplierName: supplier?.name ?? "Studio Workshop",
    supplierSku: input.supplierSku,
    supplierProductUrl: input.supplierProductUrl || null,
    supplierStock: input.supplierStock,
    reservedStock: 0,
    bufferStock: input.bufferStock,
    dispatchTimeDays: input.dispatchTimeDays,
    stockLastConfirmedAt: nowIso,
    isActive: true,
    stock: computeDisplayedStock({
      supplierStock: input.supplierStock,
      reservedStock: 0,
      bufferStock: input.bufferStock,
      stockLastConfirmedAt: nowIso,
    }),
    images: input.images.map((img, i) => ({
      id: `${id}-img-${i + 1}`,
      url: img.url,
      altText: img.altText,
      aspectRatio: img.aspectRatio,
      sortOrder: img.sortOrder ?? i,
    })),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  mem.products.set(id, record);

  await recordAdminProductAudit({
    actorId,
    action: "PRODUCT_CREATED",
    entityId: record.id,
    beforeState: null,
    afterState: {
      slug: record.slug,
      name: record.name,
      pricePaise: record.pricePaise,
      taxSlab: record.taxSlab,
      hsnCode: record.hsnCode,
      supplierStock: record.supplierStock,
      bufferStock: record.bufferStock,
      isActive: record.isActive,
    },
    ipAddress,
  });

  return record;
}

/**
 * Updates an existing product and records before/after state in AuditLog.
 */
export async function updateAdminProduct(
  productId: string,
  input: AdminProductInput,
  actorId: string,
  ipAddress: string
): Promise<AdminProductRecord | null> {
  const mem = getInMemoryCatalogueState();
  const nowIso = new Date().toISOString();

  if (Boolean(process.env.DATABASE_URL)) {
    try {
      const existing = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (existing) {
        const beforeSnapshot = {
          name: existing.name,
          pricePaise: existing.pricePaise,
          taxSlab: percentToTaxSlab(existing.taxSlabPercent),
          hsnCode: existing.hsnCode,
          supplierStock: existing.supplierStock,
          bufferStock: existing.stockBuffer,
          isActive: existing.isActive,
        };

        await prisma.productImage.deleteMany({ where: { productId } });

        const updated = await prisma.product.update({
          where: { id: productId },
          data: {
            name: input.name,
            shortDescription: input.shortDescription,
            description: input.description,
            category: input.category,
            tags: input.tags,
            material: input.material,
            dimensions: input.dimensions,
            careInstructions: input.careInstructions ?? null,
            pricePaise: input.pricePaise,
            compareAtPricePaise: input.compareAtPaise ?? null,
            taxSlabPercent: taxSlabToPercent(input.taxSlab),
            hsnCode: input.hsnCode,
            supplierId: input.supplierId,
            supplierSku: input.supplierSku,
            supplierProductUrl: input.supplierProductUrl || null,
            supplierStock: input.supplierStock,
            stockBuffer: input.bufferStock,
            processingDays: input.dispatchTimeDays,
            stockLastConfirmedAt: new Date(),
            images: {
              create: input.images.map((img, i) => ({
                imageUrl: img.url,
                altText: img.altText,
                aspectRatio: img.aspectRatio,
                position: img.sortOrder ?? i,
              })),
            },
          },
          include: {
            supplier: true,
            images: { orderBy: { position: "asc" } },
          },
        });

        const record: AdminProductRecord = {
          id: updated.id,
          slug: updated.slug,
          name: updated.name,
          shortDescription: updated.shortDescription,
          description: updated.description,
          category: updated.category,
          tags: updated.tags,
          material: updated.material ?? input.material,
          dimensions: updated.dimensions ?? input.dimensions,
          careInstructions: updated.careInstructions ?? null,
          pricePaise: updated.pricePaise,
          compareAtPaise: updated.compareAtPricePaise,
          taxSlab: percentToTaxSlab(updated.taxSlabPercent),
          hsnCode: updated.hsnCode,
          supplierId: updated.supplierId,
          supplierName: updated.supplier.name,
          supplierSku: updated.supplierSku,
          supplierProductUrl: updated.supplierProductUrl ?? null,
          supplierStock: updated.supplierStock,
          reservedStock: updated.reservedStock,
          bufferStock: updated.stockBuffer,
          dispatchTimeDays: updated.processingDays,
          stockLastConfirmedAt:
            updated.stockLastConfirmedAt?.toISOString() ?? nowIso,
          isActive: updated.isActive,
          stock: computeDisplayedStock({
            supplierStock: updated.supplierStock,
            reservedStock: updated.reservedStock,
            bufferStock: updated.stockBuffer,
            stockLastConfirmedAt: updated.stockLastConfirmedAt,
          }),
          images: updated.images.map((img) => ({
            id: img.id,
            url: img.imageUrl,
            altText: img.altText,
            aspectRatio: img.aspectRatio === "1:1" ? "1:1" : "4:5",
            sortOrder: img.position,
          })),
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };

        await recordAdminProductAudit({
          actorId,
          action: "PRODUCT_UPDATED",
          entityId: productId,
          beforeState: beforeSnapshot,
          afterState: {
            name: record.name,
            pricePaise: record.pricePaise,
            taxSlab: record.taxSlab,
            hsnCode: record.hsnCode,
            supplierStock: record.supplierStock,
            bufferStock: record.bufferStock,
            isActive: record.isActive,
          },
          ipAddress,
        });

        return record;
      }
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw err;
      }
    }
  }

  const current = mem.products.get(productId);
  if (!current) return null;

  const beforeSnapshot = {
    name: current.name,
    pricePaise: current.pricePaise,
    taxSlab: current.taxSlab,
    hsnCode: current.hsnCode,
    supplierStock: current.supplierStock,
    bufferStock: current.bufferStock,
    isActive: current.isActive,
  };

  const supplier = mem.suppliers.get(input.supplierId);
  const updated: AdminProductRecord = {
    ...current,
    name: input.name,
    shortDescription: input.shortDescription,
    description: input.description,
    category: input.category,
    tags: [...input.tags],
    material: input.material,
    dimensions: input.dimensions,
    careInstructions: input.careInstructions ?? null,
    pricePaise: input.pricePaise,
    compareAtPaise: input.compareAtPaise ?? null,
    taxSlab: input.taxSlab,
    hsnCode: input.hsnCode,
    supplierId: input.supplierId,
    supplierName: supplier?.name ?? current.supplierName,
    supplierSku: input.supplierSku,
    supplierProductUrl: input.supplierProductUrl || null,
    supplierStock: input.supplierStock,
    bufferStock: input.bufferStock,
    dispatchTimeDays: input.dispatchTimeDays,
    stockLastConfirmedAt: nowIso,
    stock: computeDisplayedStock({
      supplierStock: input.supplierStock,
      reservedStock: current.reservedStock,
      bufferStock: input.bufferStock,
      stockLastConfirmedAt: nowIso,
    }),
    images: input.images.map((img, i) => ({
      id: `${productId}-img-${i + 1}`,
      url: img.url,
      altText: img.altText,
      aspectRatio: img.aspectRatio,
      sortOrder: img.sortOrder ?? i,
    })),
    updatedAt: nowIso,
  };

  mem.products.set(productId, updated);

  await recordAdminProductAudit({
    actorId,
    action: "PRODUCT_UPDATED",
    entityId: productId,
    beforeState: beforeSnapshot,
    afterState: {
      name: updated.name,
      pricePaise: updated.pricePaise,
      taxSlab: updated.taxSlab,
      hsnCode: updated.hsnCode,
      supplierStock: updated.supplierStock,
      bufferStock: updated.bufferStock,
      isActive: updated.isActive,
    },
    ipAddress,
  });

  return updated;
}

/**
 * Toggles soft-delete (`isActive = false`) or restore (`isActive = true`) on a product.
 * Hard deletion is prohibited so past order items always retain their product foreign key.
 */
export async function setAdminProductActiveState(
  productId: string,
  isActive: boolean,
  actorId: string,
  ipAddress: string
): Promise<AdminProductRecord | null> {
  const mem = getInMemoryCatalogueState();
  const actionName = isActive ? "PRODUCT_RESTORED" : "PRODUCT_SOFT_DELETED";

  if (Boolean(process.env.DATABASE_URL)) {
    try {
      const existing = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (existing) {
        const updated = await prisma.product.update({
          where: { id: productId },
          data: { isActive },
          include: {
            supplier: true,
            images: { orderBy: { position: "asc" } },
          },
        });

        await recordAdminProductAudit({
          actorId,
          action: actionName,
          entityId: productId,
          beforeState: { isActive: existing.isActive, slug: existing.slug },
          afterState: { isActive: updated.isActive, slug: updated.slug },
          ipAddress,
        });

        return {
          id: updated.id,
          slug: updated.slug,
          name: updated.name,
          shortDescription: updated.shortDescription,
          description: updated.description,
          category: updated.category,
          tags: updated.tags,
          material: updated.material ?? "",
          dimensions: updated.dimensions ?? "",
          careInstructions: updated.careInstructions ?? null,
          pricePaise: updated.pricePaise,
          compareAtPaise: updated.compareAtPricePaise,
          taxSlab: percentToTaxSlab(updated.taxSlabPercent),
          hsnCode: updated.hsnCode,
          supplierId: updated.supplierId,
          supplierName: updated.supplier.name,
          supplierSku: updated.supplierSku,
          supplierProductUrl: updated.supplierProductUrl ?? null,
          supplierStock: updated.supplierStock,
          reservedStock: updated.reservedStock,
          bufferStock: updated.stockBuffer,
          dispatchTimeDays: updated.processingDays,
          stockLastConfirmedAt:
            updated.stockLastConfirmedAt?.toISOString() ?? null,
          isActive: updated.isActive,
          stock: computeDisplayedStock({
            supplierStock: updated.supplierStock,
            reservedStock: updated.reservedStock,
            bufferStock: updated.stockBuffer,
            stockLastConfirmedAt: updated.stockLastConfirmedAt,
          }),
          images: updated.images.map((img) => ({
            id: img.id,
            url: img.imageUrl,
            altText: img.altText,
            aspectRatio: img.aspectRatio === "1:1" ? "1:1" : "4:5",
            sortOrder: img.position,
          })),
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };
      }
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw err;
      }
    }
  }

  const current = mem.products.get(productId);
  if (!current) return null;

  const beforeActive = current.isActive;
  const nextRecord: AdminProductRecord = {
    ...current,
    isActive,
    updatedAt: new Date().toISOString(),
  };
  mem.products.set(productId, nextRecord);

  await recordAdminProductAudit({
    actorId,
    action: actionName,
    entityId: productId,
    beforeState: { isActive: beforeActive, slug: current.slug },
    afterState: { isActive, slug: current.slug },
    ipAddress,
  });

  return nextRecord;
}
