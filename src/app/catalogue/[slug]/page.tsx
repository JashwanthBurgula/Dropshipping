import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ShieldCheck, Layers, Ruler, Sparkles, CheckCircle2 } from "lucide-react";
import {
  ProductDetailGallery,
  PinDeliveryEstimator,
} from "@/components/catalogue/ProductDetailClient";
import { SimilarProductsRow } from "@/components/catalogue/SimilarProductsRow";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { getStorefrontProductBySlug } from "@/lib/catalogue/service";
import { getSimilarInStockProducts } from "@/lib/catalogue/similar";
import { formatInrFromPaise } from "@/lib/catalogue/stock";
import { brandConfig } from "@/config/brand";

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

const getCachedProduct = cache((slug: string) => getStorefrontProductBySlug(slug));

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCachedProduct(slug);

  if (!product) {
    return {
      title: "Product Not Found",
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const canonicalUrl = `${baseUrl}/catalogue/${product.slug}`;

  return {
    title: product.name,
    description: product.shortDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${product.name} | ${brandConfig.name}`,
      description: product.shortDescription,
      url: canonicalUrl,
      siteName: brandConfig.name,
      type: "website",
    },
  };
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const product = await getCachedProduct(slug);

  if (!product) {
    notFound();
  }

  const similarProducts = await getSimilarInStockProducts({
    product,
    limit: 4,
  });

  const hasDiscount =
    product.compareAtPaise && product.compareAtPaise > product.pricePaise;
  const discountPercent = hasDiscount
    ? Math.round(
        ((product.compareAtPaise! - product.pricePaise) /
          product.compareAtPaise!) *
          100
      )
    : 0;

  return (
    <div className="min-h-screen bg-[#F5F6F7] py-6 sm:py-8">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-[#475467]">
          <Link href="/" className="hover:text-[#101828]">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/catalogue" className="hover:text-[#101828]">
            Catalogue
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link
            href={`/catalogue?category=${encodeURIComponent(product.category)}`}
            className="hover:text-[#101828]"
          >
            {product.category}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-[#101828]">{product.name}</span>
        </nav>

        {/* Main Product Layout */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Left Column: Gallery */}
          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-4 shadow-sm">
              <ProductDetailGallery
                images={product.images}
                productName={product.name}
              />
            </div>
          </div>

          {/* Right Column: Pricing, Delivery, Add to Cart */}
          <div className="flex flex-col gap-6 lg:col-span-6">
            <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 shadow-sm">
              {/* Category & Stock */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-[#475467]">
                  {product.category}
                </span>
                <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#DCFCE7] px-2 py-0.5 text-xs font-semibold text-[#15803D]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  In stock
                </span>
              </div>

              {/* Title */}
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#101828] sm:text-3xl">
                {product.name}
              </h1>

              {/* Pricing */}
              <div className="mt-4 flex flex-wrap items-baseline gap-3 border-t border-[#DDE1E6] pt-4">
                <span className="text-3xl font-bold tracking-tight text-[#101828]">
                  {formatInrFromPaise(product.pricePaise)}
                </span>
                {hasDiscount ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-[#475467] line-through">
                      MRP {formatInrFromPaise(product.compareAtPaise!)}
                    </span>
                    <span className="text-sm font-bold text-[#B42318]">
                      ({discountPercent}% off)
                    </span>
                  </div>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-[#475467]">
                Inclusive of all taxes · Free shipping on orders above ₹999
              </p>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <AddToCartButton
                    productId={product.id}
                    productName={product.name}
                    isPurchasable={product.stock.isPurchasable}
                    returnToPath={`/catalogue/${product.slug}`}
                    size="lg"
                    fullWidth
                    label="Add to Cart"
                  />
                </div>
                <div className="flex-1">
                  <AddToCartButton
                    productId={product.id}
                    productName={product.name}
                    isPurchasable={product.stock.isPurchasable}
                    returnToPath={`/catalogue/${product.slug}`}
                    mode="buyNow"
                    size="lg"
                    fullWidth
                    label="Buy Now"
                  />
                </div>
              </div>

              {/* Delivery Estimator */}
              <div className="mt-6 border-t border-[#DDE1E6] pt-6">
                <PinDeliveryEstimator dispatchTimeDays={product.dispatchTimeDays} />
              </div>
            </div>

            {/* Product Details & Specifications */}
            <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 shadow-sm">
              <h2 className="text-base font-bold text-[#101828]">
                Product description
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#101828]">
                {product.shortDescription}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#475467]">
                {product.description}
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4 border-t border-[#DDE1E6] pt-5 sm:grid-cols-2">
                {product.material && (
                  <div>
                    <span className="text-xs font-semibold uppercase text-[#475467]">
                      Material
                    </span>
                    <p className="mt-1 text-sm font-medium text-[#101828]">
                      {product.material}
                    </p>
                  </div>
                )}
                {product.dimensions && (
                  <div>
                    <span className="text-xs font-semibold uppercase text-[#475467]">
                      Dimensions
                    </span>
                    <p className="mt-1 text-sm font-medium text-[#101828]">
                      {product.dimensions}
                    </p>
                  </div>
                )}
                {product.careInstructions && (
                  <div className="sm:col-span-2">
                    <span className="text-xs font-semibold uppercase text-[#475467]">
                      Care instructions
                    </span>
                    <p className="mt-1 text-sm text-[#475467]">
                      {product.careInstructions}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Similar Products Row */}
        {similarProducts.length > 0 && (
          <div className="mt-16">
            <SimilarProductsRow items={similarProducts} />
          </div>
        )}
      </div>
    </div>
  );
}
