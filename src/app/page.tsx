import Link from "next/link";
import {
  ShieldCheck,
  Truck,
  RotateCcw,
  ArrowRight,
  MapPin,
  ReceiptIndianRupee,
  Package,
} from "lucide-react";
import { PhotoSlot } from "@/components/catalogue/PhotoSlot";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { formatInrFromPaise } from "@/lib/cn";
import { prisma } from "@/lib/db";
import { brandConfig } from "@/config/brand";

export default async function HomePage() {
  let featuredProducts: Array<{
    id: string;
    slug: string;
    name: string;
    pricePaise: number;
    compareAtPricePaise: number | null;
    category: string;
    images: Array<{ imageUrl: string; altText: string }>;
  }> = [];

  let dbError = false;

  try {
    featuredProducts = await prisma.product.findMany({
      where: { isActive: true },
      take: 4,
      orderBy: { createdAt: "desc" },
      include: {
        images: {
          orderBy: { position: "asc" },
          take: 1,
        },
      },
    });
  } catch (error) {
    dbError = true;
    console.error("[HomePage] Database unavailable when fetching featured products:", error);
    if (process.env.NODE_ENV !== "production") {
      const { SEED_PRODUCTS } = await import("@/lib/data/seed-products");
      featuredProducts = SEED_PRODUCTS.slice(0, 4).map((p, idx) => ({
        id: `prod-seed-${String(idx + 1).padStart(2, "0")}`,
        slug: p.slug,
        name: p.name,
        pricePaise: p.pricePaise,
        compareAtPricePaise: p.compareAtPaise ?? null,
        category: p.category,
        images: p.images.slice(0, 1).map((img) => ({
          imageUrl: img.url,
          altText: img.altText,
        })),
      }));
    }
  }

  const categories = [
    {
      title: "Tableware & Ceramics",
      subtitle: "High-fired reduction stoneware and dinner sets",
      href: "/catalogue?category=Tableware+%26+Ceramics",
      imageUrl: "/api/uploads/4ed4af06-ec79-440f-9e15-f18d13266595.jpg",
    },
    {
      title: "Linen & Textiles",
      subtitle: "Handloom kala cotton runners and waffle weave towels",
      href: "/catalogue?category=Linen+%26+Textiles",
      imageUrl: "/api/uploads/e9119a6c-e4fb-434d-b924-819b1f61a78e.jpg",
    },
    {
      title: "Brass & Metalwork",
      subtitle: "Sand-cast Moradabad brass cookware and vessels",
      href: "/catalogue?category=Brass+%26+Metalwork",
      imageUrl: "/api/uploads/7184852e-b657-49d9-9f7a-f0e14eca87e2.jpg",
    },
    {
      title: "Lighting & Glass",
      subtitle: "Mouth-blown glass pendants and reading lamps",
      href: "/catalogue?category=Lighting+%26+Glass",
      imageUrl: "/api/uploads/c9a0164c-7c79-4282-a7e9-8be10bd7f640.jpg",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F6F7]">
      {/* Specific Hero Section */}
      <section
        aria-labelledby="hero-heading"
        className="border-b border-[#DDE1E6] bg-[#FFFFFF] py-10 sm:py-16"
      >
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="flex flex-col items-start lg:col-span-7">
              <span className="inline-flex rounded-[4px] bg-[#F5F6F7] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#101828]">
                Everyday Indian Craft Goods
              </span>

              <h1
                id="hero-heading"
                className="mt-4 text-3xl font-bold tracking-tight text-[#101828] sm:text-4xl lg:text-5xl"
              >
                Handcrafted stoneware, brass utility, and table linen delivered across India.
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#475467] sm:text-lg">
                Dispatched directly from regional workshops in 24 hours. Delivered in 2 to 4 business days.
                Every piece carries an all-inclusive GST price with live order tracking and Cash on Delivery.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/catalogue"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-[4px] bg-[#1D4ED8] px-6 py-2.5 text-base font-semibold text-[#FFFFFF] hover:bg-[#1E40AF]"
                >
                  Explore catalogue
                </Link>
                <Link
                  href="/register"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-5 py-2.5 text-base font-medium text-[#101828] hover:bg-[#F5F6F7]"
                >
                  Check delivery PIN code
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] shadow-sm">
                <PhotoSlot
                  url="/api/uploads/4ed4af06-ec79-440f-9e15-f18d13266595.jpg"
                  altText="Ash-Glaze Stoneware Dinner Plate on dining table"
                  aspectRatio="1:1"
                />
                <div className="p-4">
                  <p className="text-xs font-semibold uppercase text-[#475467]">
                    Featured workshop piece
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#101828]">
                    Ash-Glaze Stoneware Dinner Plate (27 cm)
                  </p>
                  <p className="text-xs text-[#475467]">
                    Bhadravati Stoneware Collective · ₹1,450 incl. GST
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Strip */}
      <section
        aria-label="Service guarantees"
        className="border-b border-[#DDE1E6] bg-[#FFFFFF] py-6"
      >
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            <div className="flex items-start gap-3">
              <Truck className="h-6 w-6 shrink-0 text-[#1D4ED8]" />
              <div>
                <h2 className="text-sm font-bold text-[#101828]">Free delivery</h2>
                <p className="text-xs text-[#475467]">On all orders above ₹999</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <ReceiptIndianRupee className="h-6 w-6 shrink-0 text-[#15803D]" />
              <div>
                <h2 className="text-sm font-bold text-[#101828]">Cash on Delivery</h2>
                <p className="text-xs text-[#475467]">OTP-verified at checkout</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <ShieldCheck className="h-6 w-6 shrink-0 text-[#1D4ED8]" />
              <div>
                <h2 className="text-sm font-bold text-[#101828]">All-inclusive prices</h2>
                <p className="text-xs text-[#475467]">Transparent GST invoices</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <RotateCcw className="h-6 w-6 shrink-0 text-[#C2410C]" />
              <div>
                <h2 className="text-sm font-bold text-[#101828]">Easy 7-day returns</h2>
                <p className="text-xs text-[#475467]">Hassle-free replacement</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Tiles */}
      <section
        aria-labelledby="categories-heading"
        className="py-12 sm:py-16"
      >
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-baseline justify-between border-b border-[#DDE1E6] pb-4">
            <div>
              <h2
                id="categories-heading"
                className="text-2xl font-bold tracking-tight text-[#101828]"
              >
                Explore categories
              </h2>
              <p className="mt-1 text-sm text-[#475467]">
                Authentic utility craft goods categorized by material and purpose.
              </p>
            </div>
            <Link
              href="/catalogue"
              className="hidden text-sm font-semibold text-[#1D4ED8] hover:underline sm:inline-flex sm:items-center sm:gap-1"
            >
              All products <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((cat, idx) => (
              <Link
                key={idx}
                href={cat.href}
                className="group flex flex-col overflow-hidden rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="aspect-square w-full overflow-hidden">
                  <PhotoSlot
                    url={cat.imageUrl}
                    altText={cat.title}
                    aspectRatio="1:1"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-base font-bold text-[#101828] group-hover:text-[#1D4ED8]">
                    {cat.title}
                  </h3>
                  <p className="mt-1 text-xs text-[#475467]">{cat.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products Row */}
      <section
        aria-labelledby="featured-heading"
        className="border-t border-[#DDE1E6] bg-[#FFFFFF] py-12 sm:py-16"
      >
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-baseline justify-between border-b border-[#DDE1E6] pb-4">
            <div>
              <h2
                id="featured-heading"
                className="text-2xl font-bold tracking-tight text-[#101828]"
              >
                Featured products
              </h2>
              <p className="mt-1 text-sm text-[#475467]">
                In-stock regional craft goods ready for immediate dispatch.
              </p>
            </div>
            <Link
              href="/catalogue"
              className="text-sm font-semibold text-[#1D4ED8] hover:underline"
            >
              View all products
            </Link>
          </div>

          {featuredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-8 text-center">
              <Package className="h-10 w-10 text-[#475467]" />
              <p className="mt-3 text-sm font-semibold text-[#101828]">
                Featured items are temporarily updating.
              </p>
              <Link
                href="/catalogue"
                className="mt-4 inline-flex min-h-[40px] items-center justify-center rounded-[4px] bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-[#FFFFFF] hover:bg-[#1E40AF]"
              >
                Browse full catalogue
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {featuredProducts.map((prod) => {
              const imgUrl = prod.images[0]?.imageUrl ?? "";
              return (
                <div
                  key={prod.id}
                  className="flex flex-col justify-between overflow-hidden rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] shadow-sm"
                >
                  <div>
                    <Link href={`/catalogue/${prod.slug}`}>
                      <PhotoSlot
                        url={imgUrl}
                        altText={prod.name}
                        aspectRatio="1:1"
                      />
                    </Link>
                    <div className="p-4">
                      <span className="text-xs font-semibold text-[#15803D]">
                        In stock
                      </span>
                      <h3 className="mt-1 line-clamp-2 text-sm font-bold text-[#101828]">
                        <Link
                          href={`/catalogue/${prod.slug}`}
                          className="hover:text-[#1D4ED8]"
                        >
                          {prod.name}
                        </Link>
                      </h3>
                      <p className="mt-2 text-base font-bold text-[#101828]">
                        {formatInrFromPaise(prod.pricePaise)}
                      </p>
                      <p className="text-[11px] text-[#475467]">Inclusive of all taxes</p>
                    </div>
                  </div>

                  <div className="border-t border-[#DDE1E6] p-3">
                    <AddToCartButton
                      productId={prod.id}
                      productName={prod.name}
                      isPurchasable={true}
                      returnToPath="/"
                      fullWidth
                      size="sm"
                    />
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
