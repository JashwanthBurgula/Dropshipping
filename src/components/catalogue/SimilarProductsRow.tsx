import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PhotoSlot } from "@/components/ui/PhotoSlot";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { formatInrFromPaise } from "@/lib/catalogue/stock";
import type { SimilarProductMatch } from "@/lib/catalogue/similar";
import type { StorefrontProduct } from "@/lib/catalogue/service";

export interface SimilarProductsRowProps {
  title?: string;
  eyebrow?: string;
  category?: string;
  items: ReadonlyArray<SimilarProductMatch | StorefrontProduct>;
  returnToPath?: string;
}

function unwrapProduct(
  entry: SimilarProductMatch | StorefrontProduct
): StorefrontProduct {
  return "product" in entry ? entry.product : entry;
}

/**
 * "You may also like" row rendered on Product Detail (`/catalogue/[slug]`)
 * and Search (`/search`). Displays in-stock items only, excluding the item itself,
 * with a working `AddToCartButton` on every tile.
 */
export function SimilarProductsRow({
  title = "You may also like",
  eyebrow = "Curated Studio Pairing",
  category,
  items,
  returnToPath,
}: SimilarProductsRowProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="similar-products-heading"
      className="mt-14 border-t border-stone pt-10"
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs tracking-wider text-ink-muted uppercase">
            {eyebrow}
          </p>
          <h2
            id="similar-products-heading"
            className="mt-1 font-sans text-xl font-normal text-ink sm:text-2xl"
          >
            {title}
          </h2>
        </div>
        {category ? (
          <Link
            href={`/catalogue?category=${encodeURIComponent(category)}`}
            className="text-xs font-medium text-clay-text hover:underline"
          >
            View all in {category}
          </Link>
        ) : (
          <Link
            href="/catalogue"
            className="text-xs font-medium text-clay-text hover:underline"
          >
            Browse full catalogue
          </Link>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {items.map((entry) => {
          const item = unwrapProduct(entry);
          const primaryImage = item.images[0];
          const aspectRatio = primaryImage?.aspectRatio ?? "4:5";

          return (
            <Card
              key={item.id}
              className="flex h-full flex-col justify-between overflow-hidden p-0 transition-colors hover:border-ink/40"
            >
              <div>
                <Link
                  href={`/catalogue/${item.slug}`}
                  className="block focus-visible:outline-none"
                >
                  <div className="relative border-b border-stone bg-sand">
                    <PhotoSlot
                      url={item.images[0]?.url}
                      aspectRatio={aspectRatio}
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
                    {item.category}
                  </p>
                  <Link
                    href={`/catalogue/${item.slug}`}
                    className="mt-1 block font-sans text-base font-normal text-ink hover:text-clay-text"
                  >
                    {item.name}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                    {item.shortDescription}
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
                  returnToPath={returnToPath ?? `/catalogue/${item.slug}`}
                  size="sm"
                  fullWidth
                />
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
