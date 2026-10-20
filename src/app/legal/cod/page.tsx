import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { formatInrFromPaise } from "@/lib/cn";

/* draft for legal review */

export const metadata: Metadata = {
  title: "Cash on Delivery (COD) Policy",
  description:
    "How Cash on Delivery works on Kala & Kiln, including One-Time Code confirmation, order limits, and doorstep payment.",
};

export default function CodPolicyPage() {
  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
          Store Policy · Last updated: 10 October 2026
        </p>
        <h1 className="mt-2 font-sans text-3xl font-medium text-ink sm:text-4xl">
          Cash on Delivery (COD) Policy
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          We offer Cash on Delivery across serviceable Indian PIN codes with no extra
          COD handling surcharge for customers. To protect our regional dealers from
          fake or mistyped orders, all COD orders follow the verification rules below.
        </p>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-ink">
          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              1. One-Time Code (OTP) Order Confirmation
            </h2>
            <p className="mt-2 text-ink-muted">
              When you select Cash on Delivery at checkout, your order is created in{" "}
              <strong>Pending Confirmation</strong> status and we send a 6-digit
              One-Time Code to your verified email address (and registered phone).
              Once you enter that code on the confirmation screen, your order status
              moves to <strong>Confirmed</strong> and is queued for dealer assignment.
            </p>
          </section>

          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              2. COD Order Value Limits
            </h2>
            <Card surface="sand" padding="md" className="mt-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    New Verified Accounts
                  </p>
                  <p className="mt-1 font-sans text-lg font-medium text-ink">
                    Up to {formatInrFromPaise(500000)} per order
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Maximum 1 active unpaid COD order in transit at a time.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Repeat Customers (1+ Delivered Order)
                  </p>
                  <p className="mt-1 font-sans text-lg font-medium text-ink">
                    Up to {formatInrFromPaise(1500000)} per order
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Up to 2 active COD orders in transit at a time.
                  </p>
                </div>
              </div>
              <p className="mt-4 border-t border-stone pt-3 text-xs text-ink-muted">
                Orders above these thresholds can be completed online via Razorpay
                (UPI, credit card, debit card, or netbanking).
              </p>
            </Card>
          </section>

          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              3. Paying at Your Doorstep
            </h2>
            <p className="mt-2 text-ink-muted">
              Please keep the exact grand total shown on your order confirmation email
              ready at the time of delivery. Once the dealer&apos;s delivery partner
              collects payment and verifies your 6-digit Delivery OTP, your order is
              simultaneously marked <strong>Delivered</strong> and{" "}
              <strong>Paid</strong>, and your final GST tax invoice becomes available
              for download.
            </p>
          </section>

          <section>
            <h2 className="font-sans text-xl font-medium text-ink">
              4. Unjustified Doorstep Refusals
            </h2>
            <p className="mt-2 text-ink-muted">
              If your plans change, please cancel your order before it is marked{" "}
              <strong>Shipped</strong>. Refusing a valid, undamaged COD parcel at the
              doorstep wastes two-way shipping for our small regional suppliers. Two
              unjustified doorstep refusals will restrict the account and delivery
              address to online prepaid orders only. Note that you always retain the
              right to refuse a parcel if the outer packaging is visibly tampered with
              or damaged on arrival.
            </p>
            <p className="mt-3 text-xs text-ink-muted">
              For details on how COD returns are refunded via UPI or bank transfer,
              see our{" "}
              <Link
                href="/legal/returns"
                className="text-clay-text underline underline-offset-4 hover:text-ink"
              >
                Returns and Refunds Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
