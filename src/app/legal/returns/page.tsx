import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

/* draft for legal review */

export const metadata: Metadata = {
  title: "Returns & Refunds Policy",
  description:
    "Pre-shipment cancellation, 7-day doorstep returns, inspection process, and refund timelines for online and Cash on Delivery orders.",
};

export default function ReturnsPolicyPage() {
  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
          Store Policy · Last updated: 10 October 2026
        </p>
        <h1 className="mt-2 font-sans text-3xl font-medium text-ink sm:text-4xl">
          Returns, Replacements, and Refunds Policy
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          We stand behind every piece shipped by our partner dealers. Below are the
          exact steps and timelines for cancelling an order before dispatch or
          returning an item after delivery.
        </p>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-ink">
          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              1. Free Cancellation Before Shipping
            </h2>
            <p className="mt-2 text-ink-muted">
              You can cancel any order immediately from your account or order tracking
              page while its status is <strong>Placed</strong>,{" "}
              <strong>Confirmed</strong>, <strong>Assigned to Dealer</strong>, or{" "}
              <strong>Awaiting Dealer Confirmation</strong> (before the dealer marks
              it <strong>Shipped</strong>).
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink">
              <li>
                <strong>Online Payments (Razorpay):</strong> Cancelling before
                shipping triggers an automatic full refund to your original card, UPI
                ID, or bank account. Once Razorpay&apos;s refund webhook confirms
                completion, your refund typically reflects within 3 to 5 business
                days.
              </li>
              <li>
                <strong>Cash on Delivery:</strong> The order is cancelled immediately
                with zero charge, and the reserved inventory is returned to active
                stock.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              2. 7-Day Post-Delivery Returns
            </h2>
            <p className="mt-2 text-ink-muted">
              You may request a return or replacement within 7 calendar days of the
              date your order was marked <strong>Delivered</strong> if:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink">
              <li>
                The item arrived chipped, cracked, dented, or damaged in transit.
              </li>
              <li>
                The item delivered does not match the dimensions, material, or
                description on the product page.
              </li>
              <li>
                You wish to return an unused item in its original studio packaging
                with all tags intact.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              3. Return Status Lifecycle
            </h2>
            <p className="mt-2 text-ink-muted">
              Every return follows a tracked five-step progression visible on your
              order page:
            </p>
            <Card surface="sand" padding="md" className="mt-4">
              <ol className="list-decimal space-y-2.5 pl-5 text-sm text-ink">
                <li>
                  <strong>Return Requested:</strong> You submit the return reason and
                  optional photo of the item from your order page.
                </li>
                <li>
                  <strong>Approved or Rejected:</strong> Our team reviews the request
                  within 24 hours.
                </li>
                <li>
                  <strong>Pickup Arranged:</strong> Our dealer partner schedules a
                  reverse pickup from your delivery address within 2 to 3 business
                  days.
                </li>
                <li>
                  <strong>Received and Inspected:</strong> The returned parcel is
                  checked within 24 hours of reaching the dealer facility.
                </li>
                <li>
                  <strong>Refunded or Replaced:</strong> Your refund or replacement
                  unit is issued immediately upon inspection approval.
                </li>
              </ol>
            </Card>
          </section>

          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              4. How Refunds Are Paid Out
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-ink">
              <li>
                <strong>Card, UPI, and Netbanking Orders:</strong> Refunded directly
                via Razorpay to the original payment source. Status updates to
                Completed once confirmed by the payment gateway webhook.
              </li>
              <li>
                <strong>Cash on Delivery (COD) Orders:</strong> Because cash was
                collected at delivery, you can choose to receive your refund via{" "}
                <strong>UPI transfer</strong>, <strong>NEFT/IMPS bank transfer</strong>{" "}
                (provided securely at the time of return request), or instant{" "}
                <strong>Store Credit</strong>.
              </li>
            </ul>
            <p className="mt-4 text-xs text-ink-muted">
              Have a question about an active return? Visit your{" "}
              <Link
                href="/track"
                className="text-clay-text underline underline-offset-4 hover:text-ink"
              >
                Order Tracking
              </Link>{" "}
              page or email support@kalaandkiln.in.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
