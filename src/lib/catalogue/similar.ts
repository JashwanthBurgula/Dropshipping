import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeDisplayedStock } from "@/lib/catalogue/stock";
import { percentToTaxSlab } from "@/lib/validation/product";
import type {
  StorefrontProduct,
  StorefrontProductImage,
} from "@/lib/catalogue/service";

/**
 * Computes PostgreSQL `pg_trgm`-compatible trigram similarity between two strings.
 * Pads each word with two leading spaces and one trailing space as `pg_trgm` does,
 * returning |T(a) ∩ T(b)| / |T(a) ∪ T(b)| in [0, 1].
 */
export function computeTrigramSimilarity(a: string, b: string): number {
  const extractTrigrams = (input: string): Set<string> => {
    const cleaned = input
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .trim();
    if (!cleaned) return new Set();

    const words = cleaned.split(/\s+/).filter(Boolean);
    const set = new Set<string>();

    for (const word of words) {
      const padded = `  ${word} `;
      for (let i = 0; i <= padded.length - 3; i++) {
        set.add(padded.slice(i, i + 3));
      }
    }
    return set;
  };

  const setA = extractTrigrams(a);
  const setB = extractTrigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const tri of setA) {
    if (setB.has(tri)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface SimilarProductMatch {
  product: StorefrontProduct;
  similarityScore: number;
  sharedCategory: boolean;
  sharedTags: string[];
}

interface RawSimilarProductRow {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  description: string;
  category: string;
  tags: string[];
  material: string | null;
  dimensions: string | null;
  care_instructions: string | null;
  price_paise: number;
  compare_at_price_paise: number | null;
  tax_slab_percent: number;
  hsn_code: string;
  processing_days: number;
  supplier_stock: number;
  reserved_stock: number;
  stock_buffer: number;
  stock_last_confirmed_at: Date;
  created_at: Date;
  updated_at: Date;
  score: number;
}

/**
 * Hydrates only the matched SQL rows with their images from `product_images`
 * and computes customer-safe stock status. Never loads the full catalogue into memory.
 */
async function hydrateMatchedProductRows(
  rows: RawSimilarProductRow[]
): Promise<Map<string, StorefrontProduct>> {
  const map = new Map<string, StorefrontProduct>();
  if (rows.length === 0) return map;

  const ids = rows.map((r) => r.id);
  const images = await prisma.productImage.findMany({
    where: { productId: { in: ids } },
    orderBy: { position: "asc" },
  });

  const imagesByProductId = new Map<string, StorefrontProductImage[]>();
  for (const img of images) {
    const list = imagesByProductId.get(img.productId) ?? [];
    list.push({
      id: img.id,
      url: img.imageUrl,
      altText: img.altText,
      aspectRatio: img.aspectRatio === "1:1" ? "1:1" : "4:5",
      sortOrder: img.position,
    });
    imagesByProductId.set(img.productId, list);
  }

  for (const row of rows) {
    const stock = computeDisplayedStock({
      supplierStock: Number(row.supplier_stock),
      reservedStock: Number(row.reserved_stock),
      bufferStock: Number(row.stock_buffer),
      stockLastConfirmedAt: row.stock_last_confirmed_at,
    });

    map.set(row.id, {
      id: row.id,
      slug: row.slug,
      name: row.name,
      shortDescription: row.short_description,
      description: row.description,
      category: row.category,
      tags: Array.isArray(row.tags) ? row.tags : [],
      material: row.material ?? "",
      dimensions: row.dimensions ?? "",
      careInstructions: row.care_instructions ?? null,
      pricePaise: Number(row.price_paise),
      compareAtPaise:
        row.compare_at_price_paise !== null
          ? Number(row.compare_at_price_paise)
          : null,
      taxSlab: percentToTaxSlab(Number(row.tax_slab_percent)),
      hsnCode: row.hsn_code,
      dispatchTimeDays: Number(row.processing_days),
      stock,
      images: imagesByProductId.get(row.id) ?? [],
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
  }

  return map;
}

/**
 * Ranks similar products strictly inside PostgreSQL SQL using:
 * 1. Shared category weight (+3.0)
 * 2. Tag overlap count (+1.25 per shared tag, indexed via `products_tags_gin_idx`)
 * 3. `pg_trgm` `similarity(p.name, target.name) * 2.5` (indexed via `products_name_trgm_gin_idx`)
 * 4. `pg_trgm` `similarity(p.description, target.description) * 1.5`
 *
 * Strict SQL filtering rules:
 * - Active products only (`coalesce(p.is_active, false) = true`)
 * - In-stock items only (`(p.supplier_stock - p.reserved_stock - p.stock_buffer) > 0`)
 * - Never includes the reference product itself (`p.id <> target.id AND LOWER(p.slug) <> LOWER(target.slug)`)
 * - Never loads the entire product table into application memory.
 */
export async function getSimilarInStockProducts(params: {
  product: Pick<
    StorefrontProduct,
    "id" | "slug" | "name" | "description" | "category" | "tags"
  >;
  limit?: number;
}): Promise<SimilarProductMatch[]> {
  const limit = Math.min(Math.max(1, params.limit ?? 4), 12);
  const target = params.product;
  const targetTagsLower = target.tags.map((t) => t.toLowerCase());

  const sqlRows = await prisma.$queryRaw<RawSimilarProductRow[]>(Prisma.sql`
    SELECT
      p.id,
      p.slug,
      p.name,
      p.short_description,
      p.description,
      p.category,
      p.tags,
      p.material,
      p.dimensions,
      p.care_instructions,
      p.price_paise,
      p.compare_at_price_paise,
      p.tax_slab_percent,
      p.hsn_code,
      p.processing_days,
      p.supplier_stock,
      p.reserved_stock,
      p.stock_buffer,
      p.stock_last_confirmed_at,
      p.created_at,
      p.updated_at,
      (
        CASE WHEN LOWER(p.category) = LOWER(${target.category}) THEN 3.0 ELSE 0.0 END
        + (
          COALESCE(
            (
              SELECT COUNT(*)::float
              FROM unnest(p.tags) AS t
              WHERE LOWER(t) = ANY(${targetTagsLower}::text[])
            ),
            0.0
          ) * 1.25
        )
        + (similarity(p.name, ${target.name}) * 2.5)
        + (similarity(p.description, ${target.description}) * 1.5)
      )::float8 AS score
    FROM products p
    WHERE coalesce(p.is_active, false) = true
      AND p.id <> ${target.id}
      AND LOWER(p.slug) <> LOWER(${target.slug})
      AND (p.supplier_stock - p.reserved_stock - p.stock_buffer) > 0
    ORDER BY score DESC, p.price_paise ASC
    LIMIT ${limit}
  `);

  const hydratedMap = await hydrateMatchedProductRows(sqlRows);
  const targetTagsSet = new Set(targetTagsLower);

  const results: SimilarProductMatch[] = [];
  for (const row of sqlRows) {
    const item = hydratedMap.get(row.id);
    if (
      item &&
      item.id !== target.id &&
      item.slug.toLowerCase() !== target.slug.toLowerCase() &&
      item.stock.isPurchasable &&
      item.stock.displayedStock > 0
    ) {
      results.push({
        product: item,
        similarityScore: Number(Number(row.score).toFixed(4)),
        sharedCategory:
          item.category.toLowerCase() === target.category.toLowerCase(),
        sharedTags: item.tags.filter((t) =>
          targetTagsSet.has(t.toLowerCase())
        ),
      });
    }
  }

  return results;
}

/**
 * Returns the PostgreSQL `EXPLAIN (COSTS OFF)` plan for the similar-products
 * candidate query using the `products_tags_gin_idx` and `products_name_trgm_gin_idx` GIN indexes.
 */
export async function explainSimilarProductsQueryPlan(
  params:
    | {
        name: string;
        tags: string[];
      }
    | string
): Promise<string[]> {
  const resolved =
    typeof params === "string"
      ? {
          name: "Ash-Glaze Stoneware Dinner Plate",
          tags: ["stoneware", "tableware", "hand-thrown"],
        }
      : params;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = off;`);
    await tx.$executeRawUnsafe(`SET LOCAL pg_trgm.similarity_threshold = 0.2;`);
    const planRows = await tx.$queryRaw<Array<{ "QUERY PLAN": string }>>(
      Prisma.sql`
        EXPLAIN (COSTS OFF)
        SELECT p.id, p.name, similarity(p.name, ${resolved.name}) AS name_sim
        FROM products p
        WHERE (
          p.tags && ${resolved.tags}::text[]
          OR p.name % ${resolved.name}
        )
        AND coalesce(p.is_active, false) = true
        AND (p.supplier_stock - p.reserved_stock - p.stock_buffer) > 0
        ORDER BY similarity(p.name, ${resolved.name}) DESC
        LIMIT 4
      `
    );
    return planRows.map((r) => r["QUERY PLAN"]);
  });
}
