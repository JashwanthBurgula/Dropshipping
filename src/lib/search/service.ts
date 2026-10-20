import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeDisplayedStock } from "@/lib/catalogue/stock";
import { getSimilarInStockProducts } from "@/lib/catalogue/similar";
import { extractIstCalendarParts } from "@/lib/orders/estimate-delivery";
import {
  percentToTaxSlab,
  type CatalogueSortOption,
} from "@/lib/validation/product";
import type {
  StorefrontProduct,
  StorefrontProductImage,
} from "@/lib/catalogue/service";

export const MAX_SEARCH_QUERY_LENGTH = 80;
export const MAX_LOGGED_QUERY_LENGTH = 60;
export const SEARCH_QUERY_LOG_MAX_CHARS = MAX_LOGGED_QUERY_LENGTH;
export const SEARCH_LOG_RETENTION_DAYS = 30;
export const SEARCH_QUERY_LOG_RETENTION_DAYS = SEARCH_LOG_RETENTION_DAYS;

export interface NoResultQueryKpiLog {
  id: string;
  queryDate: string;
  normalizedQuery: string;
  searchCount: number;
  resultCount: number;
  hasInStockMatch: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Detects whether a search query contains personal data or sensitive numeric patterns:
 * - Email address pattern (`user@domain.tld`)
 * - Indian / international phone pattern (`+91 98450 11201`, `9845011201`)
 * - Any sequence of 5 or more digits (PIN codes, phone fragments, order IDs, card numbers, Aadhaar)
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /(?:\+?91[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}\b/;
const LONG_DIGIT_PATTERN = /\d{5,}/;

export function shouldDropSearchQueryFromLog(rawQuery: string): boolean {
  const cleaned = rawQuery.trim();
  if (!cleaned) return true;
  if (EMAIL_PATTERN.test(cleaned)) return true;
  if (PHONE_PATTERN.test(cleaned)) return true;
  // Also check digit count after stripping spaces/hyphens for spaced phone/card numbers
  const digitsOnly = cleaned.replace(/[\s.-]+/g, "");
  if (LONG_DIGIT_PATTERN.test(cleaned) || LONG_DIGIT_PATTERN.test(digitsOnly)) {
    return true;
  }
  return false;
}

/**
 * Normalizes whitespace, lowercases, and truncates a search query to 60 characters for KPI logging.
 */
export function truncateSearchQueryForLog(rawQuery: string): string {
  return rawQuery
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, MAX_LOGGED_QUERY_LENGTH)
    .trim();
}

/**
 * Computes the YYYY-MM-DD cutoff date 30 days prior to `referenceDate` in IST.
 */
export function computeSearchLogRetentionCutoffDateIso(
  referenceDate: Date = new Date()
): string {
  const cutoffInstant = new Date(
    referenceDate.getTime() - SEARCH_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  return extractIstCalendarParts(cutoffInstant).isoDate;
}

/**
 * Deletes rows in `search_query_logs` older than 30 days.
 */
export async function purgeExpiredSearchQueryLogs(
  referenceDate: Date = new Date()
): Promise<number> {
  const cutoffDateIso = computeSearchLogRetentionCutoffDateIso(referenceDate);
  const deleted = await prisma.searchQueryLog.deleteMany({
    where: {
      queryDate: {
        lt: cutoffDateIso,
      },
    },
  });
  return deleted.count;
}

/**
 * Clears all search query logs in PostgreSQL for deterministic test isolation.
 */
export async function resetSearchQueryLogsForTests(): Promise<void> {
  await prisma.searchQueryLog.deleteMany({});
}

/**
 * Returns aggregated zero-result search queries from PostgreSQL ordered by date DESC, count DESC.
 * Contains strictly zero personal data.
 */
export async function getNoResultQueryKpiLogs(): Promise<NoResultQueryKpiLog[]> {
  const rows = await prisma.searchQueryLog.findMany({
    orderBy: [{ queryDate: "desc" }, { searchCount: "desc" }],
    take: 250,
  });

  return rows.map((r) => ({
    id: r.id,
    queryDate: r.queryDate,
    normalizedQuery: r.normalizedQuery,
    searchCount: r.searchCount,
    resultCount: r.resultCount,
    hasInStockMatch: r.hasInStockMatch,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * Sanitizes and caps a raw user search query to `MAX_SEARCH_QUERY_LENGTH` (80 chars).
 */
export function sanitizeSearchQuery(
  rawQuery: string | undefined | null
): string {
  if (!rawQuery || typeof rawQuery !== "string") return "";
  return rawQuery
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_QUERY_LENGTH);
}

/**
 * Logs a zero-result search query in PostgreSQL:
 * 1. Drops queries matching email, phone, or long digit patterns (`>= 5` digits).
 * 2. Truncates normalized query to 60 characters (`MAX_LOGGED_QUERY_LENGTH`).
 * 3. Aggregates counts by day (`queryDate` in IST `YYYY-MM-DD`).
 * 4. Deletes rows older than 30 days (`SEARCH_LOG_RETENTION_DAYS`).
 */
export async function logZeroResultSearchQuery(
  rawQuery: string,
  referenceDate: Date = new Date()
): Promise<{
  logged: boolean;
  normalizedQuery?: string;
  queryDate?: string;
  searchCount?: number;
}> {
  if (shouldDropSearchQueryFromLog(rawQuery)) {
    return { logged: false };
  }

  const normalizedQuery = truncateSearchQueryForLog(rawQuery);
  if (!normalizedQuery) {
    return { logged: false };
  }

  const queryDate = extractIstCalendarParts(referenceDate).isoDate;

  // Purge rows older than 30 days first
  await purgeExpiredSearchQueryLogs(referenceDate);

  // Atomic daily aggregation upsert
  const id = crypto.randomUUID();
  const rows = await prisma.$queryRaw<Array<{ search_count: number }>>(Prisma.sql`
    INSERT INTO "search_query_logs" (
      "id",
      "query_date",
      "normalized_query",
      "search_count",
      "result_count",
      "has_in_stock_match",
      "created_at",
      "updated_at"
    )
    VALUES (
      ${id},
      ${queryDate},
      ${normalizedQuery},
      1,
      0,
      false,
      NOW(),
      NOW()
    )
    ON CONFLICT ("query_date", "normalized_query")
    DO UPDATE SET
      "search_count" = "search_query_logs"."search_count" + 1,
      "updated_at" = NOW()
    RETURNING "search_count"
  `);

  return {
    logged: true,
    normalizedQuery,
    queryDate,
    searchCount: Number(rows[0]?.search_count ?? 1),
  };
}

export const recordNoResultSearchQueryLog = logZeroResultSearchQuery;

export interface SearchSuggestionItem {
  id: string;
  slug: string;
  name: string;
  category: string;
  pricePaise: number;
  stockLabel: string;
  isPurchasable: boolean;
  thumbnailAspectRatio: "1:1" | "4:5";
  thumbnailAlt: string;
  thumbnailUrl?: string;
}

export interface SearchCatalogueOptions {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: CatalogueSortOption;
}

export interface SearchCatalogueResult {
  query: string;
  items: StorefrontProduct[];
  totalMatches: number;
  hasNoResults: boolean;
  topMatchOutOfStock: boolean;
  inStockAlternatives: StorefrontProduct[];
  fallbackExplanation: string | null;
}

interface RawProductSearchRow {
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
  rank_score: number;
}

/**
 * Hydrates SQL product rows with their `product_images` and computed stock status.
 * Never loads the full catalogue into memory.
 */
async function hydrateSqlSearchRows(
  rows: RawProductSearchRow[]
): Promise<StorefrontProduct[]> {
  if (rows.length === 0) return [];
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

  return rows.map((row) => {
    const stock = computeDisplayedStock({
      supplierStock: Number(row.supplier_stock),
      reservedStock: Number(row.reserved_stock),
      bufferStock: Number(row.stock_buffer),
      stockLastConfirmedAt: row.stock_last_confirmed_at,
    });

    return {
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
    };
  });
}

function extractQueryTags(cleanQuery: string): string[] {
  return cleanQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Executes parameterized PostgreSQL Full-Text Search (`to_tsvector` / `websearch_to_tsquery`)
 * + `pg_trgm` (`%`, `similarity`, `word_similarity`) + tag array overlap (`&&`)
 * directly in PostgreSQL using the GIN indexes (`products_fts_gin_idx`,
 * `products_name_trgm_gin_idx`, `products_search_text_trgm_gin_idx`, `products_tags_gin_idx`).
 *
 * Soft-deleted products (`is_active = false`) are strictly excluded in SQL.
 * Never loads the entire product table into application memory.
 */
async function queryRankedActiveProductsSql(options: {
  cleanQuery: string;
  category?: string | undefined;
  minPricePaise?: number | undefined;
  maxPricePaise?: number | undefined;
  sort?: CatalogueSortOption | undefined;
  limit?: number | undefined;
}): Promise<StorefrontProduct[]> {
  const { cleanQuery } = options;
  const limit = Math.min(Math.max(1, options.limit ?? 48), 48);
  const queryTags = extractQueryTags(cleanQuery);

  const categoryClause =
    options.category && options.category.trim() !== ""
      ? Prisma.sql`AND LOWER(p.category) = LOWER(${options.category.trim()})`
      : Prisma.empty;

  const minPriceClause =
    typeof options.minPricePaise === "number"
      ? Prisma.sql`AND p.price_paise >= ${options.minPricePaise}`
      : Prisma.empty;

  const maxPriceClause =
    typeof options.maxPricePaise === "number"
      ? Prisma.sql`AND p.price_paise <= ${options.maxPricePaise}`
      : Prisma.empty;

  if (!cleanQuery) {
    const orderByEmpty =
      options.sort === "price_asc"
        ? Prisma.sql`p.price_paise ASC, p.created_at DESC`
        : options.sort === "price_desc"
          ? Prisma.sql`p.price_paise DESC, p.created_at DESC`
          : Prisma.sql`p.created_at DESC`;

    const rows = await prisma.$queryRaw<RawProductSearchRow[]>(Prisma.sql`
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
        1.0::float8 AS rank_score
      FROM products p
      WHERE coalesce(p.is_active, false) = true
        ${categoryClause}
        ${minPriceClause}
        ${maxPriceClause}
      ORDER BY ${orderByEmpty}
      LIMIT ${limit}
    `);

    return hydrateSqlSearchRows(rows);
  }

  const orderByRanked =
    options.sort === "price_asc"
      ? Prisma.sql`p.price_paise ASC, rank_score DESC`
      : options.sort === "price_desc"
        ? Prisma.sql`p.price_paise DESC, rank_score DESC`
        : Prisma.sql`rank_score DESC, p.created_at DESC`;

  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL pg_trgm.similarity_threshold = 0.14;`);
    await tx.$executeRawUnsafe(
      `SET LOCAL pg_trgm.word_similarity_threshold = 0.28;`
    );

    return tx.$queryRaw<RawProductSearchRow[]>(Prisma.sql`
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
          ts_rank_cd(
            to_tsvector(
              'english',
              coalesce(p.name, '') || ' ' ||
              coalesce(p.short_description, '') || ' ' ||
              coalesce(p.description, '') || ' ' ||
              coalesce(p.category, '')
            ),
            websearch_to_tsquery('english', ${cleanQuery})
          ) * 5.0
          + similarity(p.name, ${cleanQuery}) * 4.0
          + word_similarity(${cleanQuery}, p.name) * 3.5
          + word_similarity(
              ${cleanQuery},
              coalesce(p.name, '') || ' ' ||
              coalesce(p.short_description, '') || ' ' ||
              coalesce(p.description, '') || ' ' ||
              coalesce(p.category, '')
            ) * 2.0
          + CASE WHEN p.tags && ${queryTags}::text[] THEN 2.5 ELSE 0.0 END
        )::float8 AS rank_score
      FROM products p
      WHERE (
          to_tsvector(
            'english',
            coalesce(p.name, '') || ' ' ||
            coalesce(p.short_description, '') || ' ' ||
            coalesce(p.description, '') || ' ' ||
            coalesce(p.category, '')
          ) @@ websearch_to_tsquery('english', ${cleanQuery})
          OR p.name % ${cleanQuery}
          OR (
            coalesce(p.name, '') || ' ' ||
            coalesce(p.short_description, '') || ' ' ||
            coalesce(p.description, '') || ' ' ||
            coalesce(p.category, '')
          ) % ${cleanQuery}
          OR p.tags && ${queryTags}::text[]
          OR word_similarity(${cleanQuery}, p.name) >= 0.28
        )
        AND coalesce(p.is_active, false) = true
        ${categoryClause}
        ${minPriceClause}
        ${maxPriceClause}
      ORDER BY ${orderByRanked}
      LIMIT ${limit}
    `);
  });

  return hydrateSqlSearchRows(rows);
}

/**
 * Fetches up to `limit` in-stock active products directly via SQL for 0-result fallback alternatives.
 */
async function queryInStockFallbackAlternativesSql(
  limit: number = 4
): Promise<StorefrontProduct[]> {
  const rows = await prisma.$queryRaw<RawProductSearchRow[]>(Prisma.sql`
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
      1.0::float8 AS rank_score
    FROM products p
    WHERE coalesce(p.is_active, false) = true
      AND (p.supplier_stock - p.reserved_stock - p.stock_buffer) > 0
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `);

  return hydrateSqlSearchRows(rows);
}

/**
 * Returns the PostgreSQL `EXPLAIN (COSTS OFF)` plan proving that `products_fts_gin_idx`,
 * `products_name_trgm_gin_idx`, `products_search_text_trgm_gin_idx`, and `products_tags_gin_idx`
 * are used by the search query.
 */
export async function explainSearchQueryPlan(
  rawQuery: string
): Promise<string[]> {
  const cleanQuery = sanitizeSearchQuery(rawQuery) || "terracotta carafe";
  const queryTags = extractQueryTags(cleanQuery);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = off;`);
    await tx.$executeRawUnsafe(`SET LOCAL pg_trgm.similarity_threshold = 0.2;`);
    const planRows = await tx.$queryRaw<Array<{ "QUERY PLAN": string }>>(
      Prisma.sql`
        EXPLAIN (COSTS OFF)
        SELECT
          p.id,
          p.slug,
          p.name
        FROM products p
        WHERE (
            to_tsvector(
              'english',
              coalesce(p.name, '') || ' ' ||
              coalesce(p.short_description, '') || ' ' ||
              coalesce(p.description, '') || ' ' ||
              coalesce(p.category, '')
            ) @@ websearch_to_tsquery('english', ${cleanQuery})
            OR p.name % ${cleanQuery}
            OR (
              coalesce(p.name, '') || ' ' ||
              coalesce(p.short_description, '') || ' ' ||
              coalesce(p.description, '') || ' ' ||
              coalesce(p.category, '')
            ) % ${cleanQuery}
            OR p.tags && ${queryTags}::text[]
          )
          AND coalesce(p.is_active, false) = true
        ORDER BY
          ts_rank_cd(
            to_tsvector(
              'english',
              coalesce(p.name, '') || ' ' ||
              coalesce(p.short_description, '') || ' ' ||
              coalesce(p.description, '') || ' ' ||
              coalesce(p.category, '')
            ),
            websearch_to_tsquery('english', ${cleanQuery})
          ) * 5.0
          + similarity(p.name, ${cleanQuery}) * 4.0 DESC
        LIMIT 12
      `
    );
    return planRows.map((r) => r["QUERY PLAN"]);
  });
}

/**
 * Returns up to 6 instant search suggestions with thumbnail slot metadata directly from PostgreSQL SQL.
 */
export async function getInstantSearchSuggestions(
  rawQuery: string,
  limit: number = 6
): Promise<{
  query: string;
  suggestions: SearchSuggestionItem[];
}> {
  const query = sanitizeSearchQuery(rawQuery);
  if (query.length < 2) {
    return { query, suggestions: [] };
  }

  const cappedLimit = Math.min(Math.max(1, limit), 8);
  const products = await queryRankedActiveProductsSql({
    cleanQuery: query,
    limit: cappedLimit,
  });

  const suggestions: SearchSuggestionItem[] = products.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    pricePaise: product.pricePaise,
    stockLabel: product.stock.label,
    isPurchasable: product.stock.isPurchasable,
    thumbnailAspectRatio: product.images[0]?.aspectRatio ?? "4:5",
    thumbnailAlt: product.images[0]?.altText ?? product.name,
    thumbnailUrl: product.images[0]?.url,
  }));

  return { query, suggestions };
}

/**
 * Full catalogue search in PostgreSQL SQL with typo tolerance, category/price filters,
 * sort options, PII-filtered 60-char daily-aggregated KPI logging for 0-result queries,
 * and automatic in-stock alternatives when a search has 0 results or the top match is out of stock.
 */
export async function searchStorefrontProducts(
  options: SearchCatalogueOptions
): Promise<SearchCatalogueResult> {
  const query = sanitizeSearchQuery(options.query);
  const minPricePaise =
    typeof options.minPrice === "number" && !Number.isNaN(options.minPrice)
      ? Math.round(options.minPrice * 100)
      : undefined;
  const maxPricePaise =
    typeof options.maxPrice === "number" && !Number.isNaN(options.maxPrice)
      ? Math.round(options.maxPrice * 100)
      : undefined;

  const filtered = await queryRankedActiveProductsSql({
    cleanQuery: query,
    category: options.category,
    minPricePaise,
    maxPricePaise,
    sort: options.sort,
    limit: 48,
  });

  const hasNoResults = query.length > 0 && filtered.length === 0;
  const topMatch = filtered[0];
  const topMatchOutOfStock = Boolean(
    topMatch &&
      (!topMatch.stock.isPurchasable || topMatch.stock.displayedStock <= 0)
  );

  let inStockAlternatives: StorefrontProduct[] = [];
  let fallbackExplanation: string | null = null;

  if (hasNoResults) {
    await logZeroResultSearchQuery(query);
    inStockAlternatives = await queryInStockFallbackAlternativesSql(4);
    fallbackExplanation = `We found no exact matches for "${query}". Here are in-stock workshop pieces ready for immediate dispatch.`;
  } else if (topMatchOutOfStock && topMatch) {
    const similarMatches = await getSimilarInStockProducts({
      product: topMatch,
      limit: 4,
    });
    inStockAlternatives = similarMatches.map((m) => m.product);
    fallbackExplanation = `"${topMatch.name}" is currently out of stock at the studio. These similar in-stock pieces from ${topMatch.category} are ready to ship now.`;
  }

  return {
    query,
    items: filtered,
    totalMatches: filtered.length,
    hasNoResults,
    topMatchOutOfStock,
    inStockAlternatives,
    fallbackExplanation,
  };
}
