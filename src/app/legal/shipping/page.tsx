import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { formatInrFromPaise } from "@/lib/cn";

/* draft for legal review */

export const metadata: Metadata = {
  title: "Shipping & Delivery Policy",
  description:
    "How Kala & Kiln calculates delivery dates, PIN-code zone shipping fees, and dealer dispatch across India.",
};

export default function ShippingPolicyPage() {
  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
          Store Policy · Last updated: 10 October 2026
        </p>
        <h1 className="mt-2 font-sans text-3xl font-medium text-ink sm:text-4xl">
          Shipping and Delivery Policy
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          Every product page, cart view, and checkout screen shows your exact
          shipping fee and predicted delivery date before you commit to buying.
        </p>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-ink">
          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              1. PIN Code Serviceability and Zones
            </h2>
            <p className="mt-2 text-ink-muted">
              We deliver to verified 6-digit Indian PIN codes served by our regional
              dealers and courier partners. When you enter your PIN code at
              registration or on a product page, our server checks whether a partner
              dealer covers your area and auto-fills your city and state.
            </p>
            <Card surface="sand" padding="md" className="mt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Zone A (Metro &amp; Tier 1)
                  </p>
                  <p className="mt-1 font-sans text-base font-medium text-ink">
                    2 to 3 transit days
                  </p>
                  <p className="text-xs text-ink-muted">
                    Standard shipping: {formatInrFromPaise(6000)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Zone B (Tier 2 &amp; State Capitals)
                  </p>
                  <p className="mt-1 font-sans text-base font-medium text-ink">
                    3 to 4 transit days
                  </p>
                  <p className="text-xs text-ink-muted">
                    Standard shipping: {formatInrFromPaise(8500)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Zone C (Regional Towns)
                  </p>
                  <p className="mt-1 font-sans text-base font-medium text-ink">
                    4 to 6 transit days
                  </p>
                  <p className="text-xs text-ink-muted">
                    Standard shipping: {formatInrFromPaise(11000)}
                  </p>
                </div>
              </div>
              <p className="mt-4 border-t border-stone pt-3 text-xs text-ink">
                <strong>Free Shipping Threshold:</strong> Orders with a merchandise
                subtotal of {formatInrFromPaise(99900)} or above qualify for free
                shipping across all serviceable zones.
              </p>
            </Card>
          </section>

          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              2. How Your Predicted Delivery Date Is Calculated
            </h2>
            <p className="mt-2 text-ink-muted">
              Our server calculates your predicted delivery date using the formula:
            </p>
            <p className="mt-2 rounded-control border border-stone bg-sand px-4 py-3 font-mono text-xs text-ink">
              Predicted Delivery Date = Order Date + Max(Product Processing Days) +
              PIN Zone Transit Days (skipping Sundays and public holidays)
            </p>
            <p className="mt-2 text-ink-muted">
              If your order contains multiple items with different workshop processing
              times (for example, 1 day for stoneware and 2 days for seasoned teak),
              we use the longer processing time so your entire order arrives on or
              before the promised date.
            </p>
          </section>

          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              3. Dealer Confirmation and Backup Routing
            </h2>
            <p className="mt-2 text-ink-muted">
              Once your order is confirmed, our admin assigns it to the primary dealer
              for your PIN code. The dealer must confirm dispatch readiness within 4
              operating hours. If a dealer cannot fulfil the order in time, our system
              automatically routes the order to our backup dealer for your zone so
              your delivery date stays on track.
            </p>
          </section>

          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              4. Live Order Tracking and Doorstep OTP
            </h2>
            <p className="mt-2 text-ink-muted">
              Every order passes through a transparent status timeline: Placed,
              Confirmed, Assigned to Dealer, Awaiting Dealer Confirmation, Shipped,
              Out for Delivery, and Delivered. When the courier arrives at your
              address, they will ask for the 6-digit Delivery OTP displayed on your{" "}
              <Link
                href="/track"
                className="text-clay-text underline underline-offset-4 hover:text-ink"
              >
                Order Tracking
              </Link>{" "}
              page before marking the parcel Delivered.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
