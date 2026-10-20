import Link from "next/link";
import { Search, PackageCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-content px-4 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-wider text-clay-text">
          HTTP 404 · Page Not Found
        </p>
        <h1 className="mt-2 font-sans text-3xl font-medium text-ink sm:text-4xl">
          That page or item link is no longer at this address.
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          The product may have been retired from our active catalogue, or the address
          was mistyped. Search for an in-stock alternative below, browse a department,
          or look up an existing order.
        </p>

        {/* Search box with visible label */}
        <form
          action="/search"
          method="GET"
          role="search"
          className="mt-8 rounded-card border border-stone bg-sand p-5"
        >
          <label
            htmlFor="not-found-search"
            className="block text-sm font-medium text-ink"
          >
            Search our in-stock catalogue
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <input
                id="not-found-search"
                name="q"
                type="search"
                required
                placeholder="e.g. stoneware plate, brass tadka pan, cotton runner"
                className="min-h-[44px] w-full rounded-control border border-stone bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-ink-muted/70"
              />
            </div>
            <Button type="submit" variant="primary">
              <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Search goods</span>
            </Button>
          </div>
        </form>

        {/* Top categories */}
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Browse Top Categories
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/catalogue?category=kitchen-dining"
              className="rounded-card border border-stone bg-paper px-4 py-3.5 text-sm font-medium text-ink hover:bg-sand"
            >
              Kitchen &amp; Dining Stoneware
            </Link>
            <Link
              href="/catalogue?category=linen-textiles"
              className="rounded-card border border-stone bg-paper px-4 py-3.5 text-sm font-medium text-ink hover:bg-sand"
            >
              Woven Table &amp; Kitchen Linen
            </Link>
            <Link
              href="/catalogue?category=brass-utility"
              className="rounded-card border border-stone bg-paper px-4 py-3.5 text-sm font-medium text-ink hover:bg-sand"
            >
              Cast Brass &amp; Pantry Utility
            </Link>
            <Link
              href="/catalogue?category=lighting"
              className="rounded-card border border-stone bg-paper px-4 py-3.5 text-sm font-medium text-ink hover:bg-sand"
            >
              Study &amp; Dining Table Lighting
            </Link>
          </div>
        </div>

        {/* Track an order & Home navigation */}
        <Card surface="sand" padding="md" className="mt-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <PackageCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-ink"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-ink">
                  Looking for an order you already placed?
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Check your live delivery timeline using your ORD-YYYYMMDD-XXXXX
                  order ID.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/track" prefetch={false}>
                <Button variant="outline" size="sm" className="bg-paper">
                  Track an order
                </Button>
              </Link>
              <Link href="/">
                <Button variant="secondary" size="sm">
                  <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>Back to Home</span>
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
