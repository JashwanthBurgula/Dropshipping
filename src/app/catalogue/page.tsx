import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ChevronLeft, PackageSearch } from "lucide-react";
import { PhotoSlot } from "@/components/catalogue/PhotoSlot";
import { CatalogueFilterControls } from "@/components/catalogue/CatalogueFilterControls";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { listStorefrontCatalogue } from "@/lib/catalogue/service";
import { formatInrFromPaise } from "@/lib/catalogue/stock";
import {
  catalogueFilterSchema,
  type CatalogueSortOption,
} from "@/lib/validation/product";
import { brandConfig } from "@/config/brand";

export const metadata: Metadata = {
  title: "All Products",
  description:
    "Shop handcrafted Indian stoneware, handloom textiles, cast brassware, and artisan lighting delivered to your doorstep.",
  openGraph: {
    title: `Products | ${brandConfig.name}`,
    description:
      "Handcrafted Indian craft goods with transparent GST-inclusive pricing and fast delivery.",
    type: "website",
  },
};

interface CataloguePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

function buildPaginationHref(
  params: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: CatalogueSortOption;
  },
  targetPage: number
): string {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (typeof params.minPrice === "number")
    qs.set("minPrice", String(params.minPrice));
  if (typeof params.maxPrice === "number")
    qs.set("maxPrice", String(params.maxPrice));
  if (params.sort && params.sort !== "newest") qs.set("sort", params.sort);
  qs.set("page", String(targetPage));
  return `/catalogue?${qs.toString()}`;
}

export default async function CataloguePage({
  searchParams,
}: CataloguePageProps) {
  const rawParams = await searchParams;

  const parsedFilters = catalogueFilterSchema.safeParse({
    category: firstParam(rawParams.category),
    minPrice: firstParam(rawParams.minPrice),
    maxPrice: firstParam(rawParams.maxPrice),
    sort: firstParam(rawParams.sort),
    page: firstParam(rawParams.page),
    pageSize: 12,
  });

  const filters = parsedFilters.success
    ? parsedFilters.data
    : { sort: "newest" as const, page: 1, pageSize: 12 };

  const catalogue = await listStorefrontCatalogue(filters);

  const headingText = filters.category ? filters.category : "All products";

  return (
    <div className="min-h-screen bg-[#F5F6F7] py-6 sm:py-8">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs text-[#475467]">
          <Link href="/" className="hover:text-[#101828]">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/catalogue" className="hover:text-[#101828]">
            Catalogue
          </Link>
          {filters.category ? (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="font-semibold text-[#101828]">{filters.category}</span>
            </>
          ) : null}
        </nav>

        {/* Heading Block */}
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-[#DDE1E6] pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#101828] sm:text-3xl">
              {headingText}
            </h1>
            <p className="mt-1 text-sm text-[#475467]">
              Showing {catalogue.totalItems} {catalogue.totalItems === 1 ? "product" : "products"} with all-inclusive GST pricing.
            </p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start lg:gap-8">
          {/* Filters Sidebar */}
          <CatalogueFilterControls
            currentCategory={filters.category ?? ""}
            currentMinPrice={
              typeof filters.minPrice === "number" ? String(filters.minPrice) : ""
            }
            currentMaxPrice={
              typeof filters.maxPrice === "number" ? String(filters.maxPrice) : ""
            }
            currentSort={filters.sort}
            totalItems={catalogue.totalItems}
          />

          {/* Main Product Grid */}
          <div className="flex-1">
            {catalogue.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] px-6 py-16 text-center">
                <PackageSearch className="h-12 w-12 text-[#475467]" />
                <h2 className="mt-4 text-lg font-bold text-[#101828]">
                  No products found
                </h2>
                <p className="mt-1.5 max-w-md text-sm text-[#475467]">
                  No products matched your selected filters. Try clearing your filters or choosing a different price range.
                </p>
                <Link
                  href="/catalogue"
                  className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[4px] bg-[#1D4ED8] px-5 py-2.5 text-sm font-medium text-[#FFFFFF] hover:bg-[#1E40AF]"
                >
                  View all products
                </Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                  {catalogue.items.map((product) => {
                    const primaryImage = product.images[0] ?? {
                      url: "",
                      altText: product.name,
                      aspectRatio: "1:1" as const,
                    };

                    const hasDiscount =
                      product.compareAtPaise &&
                      product.compareAtPaise > product.pricePaise;
                    const discountPercent = hasDiscount
                      ? Math.round(
                          ((product.compareAtPaise! - product.pricePaise) /
                            product.compareAtPaise!) *
                            100
                        )
                      : 0;

                    return (
                      <div
                        key={product.id}
                        className="group flex flex-col justify-between overflow-hidden rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div>
                          <Link
                            href={`/catalogue/${product.slug}`}
                            className="block focus:outline-none"
                          >
                            <PhotoSlot
                              url={primaryImage.url}
                              altText={primaryImage.altText}
                              aspectRatio="1:1"
                            />
                          </Link>

                          <div className="p-3 sm:p-4">
                            {/* Stock Badge */}
                            <div className="mb-2 flex items-center justify-between">
                              <span className="inline-flex rounded-[4px] bg-[#DCFCE7] px-2 py-0.5 text-xs font-semibold text-[#15803D]">
                                In stock
                              </span>
                              <span className="text-xs text-[#475467]">
                                {product.category.split(" ")[0]}
                              </span>
                            </div>

                            {/* Product Name (Max 2 lines) */}
                            <h2 className="line-clamp-2 text-sm font-bold text-[#101828] sm:text-base">
                              <Link
                                href={`/catalogue/${product.slug}`}
                                className="hover:text-[#1D4ED8]"
                              >
                                {product.name}
                              </Link>
                            </h2>

                            {/* Price Block */}
                            <div className="mt-3 flex flex-wrap items-baseline gap-2">
                              <span className="text-lg font-bold text-[#101828] sm:text-xl">
                                {formatInrFromPaise(product.pricePaise)}
                              </span>
                              {hasDiscount ? (
                                <div className="flex items-baseline gap-1.5 text-xs">
                                  <span className="text-[#475467] line-through">
                                    MRP {formatInrFromPaise(product.compareAtPaise!)}
                                  </span>
                                  <span className="font-bold text-[#B42318]">
                                    ({discountPercent}% off)
                                  </span>
                                </div>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[11px] text-[#475467]">
                              Inclusive of all taxes
                            </p>
                          </div>
                        </div>

                        {/* Add to Cart Footer */}
                        <div className="border-t border-[#DDE1E6] p-3 sm:p-4">
                          <AddToCartButton
                            productId={product.id}
                            productName={product.name}
                            isPurchasable={product.stock.isPurchasable}
                            returnToPath={`/catalogue/${product.slug}`}
                            fullWidth
                            size="sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {catalogue.totalPages > 1 && (
                  <nav
                    aria-label="Catalogue pagination"
                    className="mt-10 flex items-center justify-between border-t border-[#DDE1E6] pt-6"
                  >
                    <p className="text-xs text-[#475467]">
                      Page <span className="font-bold text-[#101828]">{catalogue.page}</span> of{" "}
                      <span className="font-bold text-[#101828]">{catalogue.totalPages}</span>
                    </p>

                    <div className="flex items-center gap-2">
                      {catalogue.page > 1 ? (
                        <Link
                          href={buildPaginationHref(filters, catalogue.page - 1)}
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-xs font-medium text-[#101828] hover:bg-[#F5F6F7]"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Link>
                      ) : null}

                      {catalogue.page < catalogue.totalPages ? (
                        <Link
                          href={buildPaginationHref(filters, catalogue.page + 1)}
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 text-xs font-medium text-[#101828] hover:bg-[#F5F6F7]"
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      ) : null}
                    </div>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
