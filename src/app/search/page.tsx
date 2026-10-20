import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PhotoSlot } from "@/components/ui/PhotoSlot";
import { SearchCombobox } from "@/components/search/SearchCombobox";
import { HighlightText } from "@/components/search/HighlightText";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { SimilarProductsRow } from "@/components/catalogue/SimilarProductsRow";
import { searchStorefrontProducts } from "@/lib/search/service";
import { getSimilarInStockProducts } from "@/lib/catalogue/similar";
import { listStorefrontCatalogue } from "@/lib/catalogue/service";
import { formatInrFromPaise } from "@/lib/catalogue/stock";
import { PRODUCT_CATEGORIES, type CatalogueSortOption } from "@/lib/validation/product";

export const metadata: Metadata = {
  title: "Search Studio Goods",
  description:
    "Search handcrafted stoneware, table linen, cast brass utility ware, and warm lighting across serviceable Indian PIN codes.",
};

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const rawParams = await searchParams;
  const q = firstParam(rawParams.q);
  const category = firstParam(rawParams.category);
  const sortRaw = firstParam(rawParams.sort);
  const minPriceRaw = firstParam(rawParams.minPrice);
  const maxPriceRaw = firstParam(rawParams.maxPrice);

  const sort: CatalogueSortOption =
    sortRaw === "price_asc" || sortRaw === "price_desc" ? sortRaw : "newest";
  const minPrice = minPriceRaw ? Number(minPriceRaw) : undefined;
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;

  const result = await searchStorefrontProducts({
    query: q,
    category: category || undefined,
    minPrice: typeof minPrice === "number" && !Number.isNaN(minPrice) ? minPrice : undefined,
    maxPrice: typeof maxPrice === "number" && !Number.isNaN(maxPrice) ? maxPrice : undefined,
    sort,
  });

  const referenceProduct =
    result.items[0] ??
    result.inStockAlternatives[0] ??
    (await listStorefrontCatalogue({ page: 1, pageSize: 1, sort: "newest" })).items[0];

  const similarMatches = referenceProduct
    ? await getSimilarInStockProducts({
        product: referenceProduct,
        limit: 4,
      })
    : [];

  const returnToPath = `/search${
    result.query ? `?q=${encodeURIComponent(result.query)}` : ""
  }`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* Header & Combobox */}
      <div className="mb-8 border-b border-stone pb-6">
        <p className="font-mono text-xs tracking-wider text-ink-muted uppercase">
          Typo-Tolerant Studio Search
        </p>
        <h1 className="mt-1 font-sans text-2xl font-normal tracking-tight text-ink sm:text-3xl">
          {result.query
            ? `Search results for "${result.query}"`
            : "Search the Workshop Catalogue"}
        </h1>
        <div className="mt-4 max-w-xl">
          <SearchCombobox initialQuery={result.query} />
        </div>

        {/* Filter & Sort Form */}
        <form
          method="GET"
          action="/search"
          className="mt-5 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="q" value={result.query} />

          <div>
            <label
              htmlFor="search-category-filter"
              className="block font-mono text-[11px] text-ink-muted uppercase"
            >
              Category
            </label>
            <select
              id="search-category-filter"
              name="category"
              defaultValue={category}
              className="mt-1 min-h-[38px] rounded-control border border-stone bg-paper px-3 text-xs text-ink focus:border-clay focus:outline-none"
            >
              <option value="">All Categories</option>
              {PRODUCT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="search-min-price"
              className="block font-mono text-[11px] text-ink-muted uppercase"
            >
              Min Price (Rs)
            </label>
            <input
              id="search-min-price"
              type="number"
              name="minPrice"
              min={0}
              defaultValue={minPriceRaw}
              placeholder="0"
              className="mt-1 min-h-[38px] w-28 rounded-control border border-stone bg-paper px-3 font-mono text-xs text-ink focus:border-clay focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="search-max-price"
              className="block font-mono text-[11px] text-ink-muted uppercase"
            >
              Max Price (Rs)
            </label>
            <input
              id="search-max-price"
              type="number"
              name="maxPrice"
              min={0}
              defaultValue={maxPriceRaw}
              placeholder="25000"
              className="mt-1 min-h-[38px] w-28 rounded-control border border-stone bg-paper px-3 font-mono text-xs text-ink focus:border-clay focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="search-sort"
              className="block font-mono text-[11px] text-ink-muted uppercase"
            >
              Sort By
            </label>
            <select
              id="search-sort"
              name="sort"
              defaultValue={sort}
              className="mt-1 min-h-[38px] rounded-control border border-stone bg-paper px-3 text-xs text-ink focus:border-clay focus:outline-none"
            >
              <option value="newest">Relevance / Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>

          <button
            type="submit"
            className="min-h-[38px] rounded-control bg-clay px-4 text-xs font-medium text-paper hover:bg-clay-hover"
          >
            Apply Filters
          </button>

          {category || minPriceRaw || maxPriceRaw || sort !== "newest" ? (
            <Link
              href={
                result.query
                  ? `/search?q=${encodeURIComponent(result.query)}`
                  : "/search"
              }
              className="min-h-[38px] inline-flex items-center px-2 text-xs text-ink-muted underline hover:text-ink"
            >
              Reset filters
            </Link>
          ) : null}
        </form>
      </div>

      {/* In-Stock Alternatives First when 0 results OR top match is out of stock */}
      {(result.hasNoResults || result.topMatchOutOfStock) &&
      result.inStockAlternatives.length > 0 ? (
        <section
          aria-labelledby="in-stock-alternatives-heading"
          className="mb-10 rounded-card border border-stone bg-sand p-5 sm:p-6"
        >
          <div className="flex items-start gap-2.5">
            <Sparkles
              className="mt-0.5 h-4 w-4 shrink-0 text-clay"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div>
              <h2
                id="in-stock-alternatives-heading"
                className="font-sans text-lg font-normal text-ink"
              >
                In-Stock Workshop Alternatives Ready for Dispatch
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {result.fallbackExplanation}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {result.inStockAlternatives.map((alt) => (
              <Card
                key={alt.id}
                className="flex h-full flex-col justify-between overflow-hidden bg-paper p-0"
              >
                <div>
                  <Link href={`/catalogue/${alt.slug}`} className="block">
                    <div className="relative border-b border-stone bg-sand">
                      <PhotoSlot
                        url={alt.images[0]?.url}
                        aspectRatio={alt.images[0]?.aspectRatio ?? "4:5"}
                        altText={alt.name}
                        className="w-full"
                      />
                      <div className="absolute top-2.5 left-2.5">
                        <Badge variant={alt.stock.badgeVariant}>
                          {alt.stock.label}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                  <div className="p-3.5">
                    <p className="font-mono text-[11px] text-ink-muted uppercase">
                      {alt.category}
                    </p>
                    <Link
                      href={`/catalogue/${alt.slug}`}
                      className="mt-1 block font-sans text-base text-ink hover:text-clay-text"
                    >
                      {alt.name}
                    </Link>
                  </div>
                </div>
                <div className="border-t border-stone/70 p-3.5">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="font-sans text-base font-semibold text-ink tabular-nums">
                      {formatInrFromPaise(alt.pricePaise)}
                    </span>
                    <span className="font-mono text-[10px] text-ink-muted">
                      Incl. GST
                    </span>
                  </div>
                  <AddToCartButton
                    productId={alt.id}
                    productName={alt.name}
                    isPurchasable={alt.stock.isPurchasable}
                    returnToPath={returnToPath}
                    size="sm"
                    fullWidth
                  />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Matched Search Results */}
      {result.items.length > 0 ? (
        <section aria-label="Matched catalogue pieces">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-mono text-xs text-ink-muted">
              Showing {result.totalMatches}{" "}
              {result.totalMatches === 1 ? "piece" : "pieces"}
              {result.query ? ` matching "${result.query}"` : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {result.items.map((item) => (
              <Card
                key={item.id}
                className="flex h-full flex-col justify-between overflow-hidden p-0 transition-colors hover:border-ink/40"
              >
                <div>
                  <Link href={`/catalogue/${item.slug}`} className="block">
                    <div className="relative border-b border-stone bg-sand">
                      <PhotoSlot
                        url={item.images[0]?.url}
                        aspectRatio={item.images[0]?.aspectRatio ?? "4:5"}
                        altText={item.name}
                        className="w-full"
                      />
                      <div className="absolute top-2.5 left-2.5">
                        <Badge variant={item.stock.badgeVariant}>
                          {item.stock.label}
                        </Badge>
                      </div>
                    </div>
                  </Link>

                  <div className="p-3.5 sm:p-4">
                    <p className="font-mono text-[11px] tracking-wider text-ink-muted uppercase">
                      <HighlightText
                        text={item.category}
                        query={result.query}
                      />
                    </p>
                    <Link
                      href={`/catalogue/${item.slug}`}
                      className="mt-1 block font-sans text-base font-normal text-ink hover:text-clay-text"
                    >
                      <HighlightText text={item.name} query={result.query} />
                    </Link>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                      <HighlightText
                        text={item.shortDescription}
                        query={result.query}
                      />
                    </p>
                  </div>
                </div>

                <div className="border-t border-stone/70 bg-paper px-3.5 py-3 sm:px-4">
                  <div className="mb-2.5 flex items-baseline justify-between gap-2">
                    <span className="font-sans text-base font-semibold text-ink tabular-nums">
                      {formatInrFromPaise(item.pricePaise)}
                    </span>
                    <span className="font-mono text-[10px] text-ink-muted">
                      Incl. GST
                    </span>
                  </div>
                  <AddToCartButton
                    productId={item.id}
                    productName={item.name}
                    isPurchasable={item.stock.isPurchasable}
                    returnToPath={returnToPath}
                    size="sm"
                    fullWidth
                  />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Similar Products Row ("You may also like") */}
      <SimilarProductsRow
        title="You may also like"
        eyebrow="In-Stock Studio Recommendations"
        items={similarMatches}
        returnToPath={returnToPath}
      />
    </div>
  );
}
