import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { brandConfig, getLegalFieldDisplay } from "@/config/brand";

/* draft for legal review */

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "Terms of sale, account verification, GST pricing, dealer fulfilment, and dispute resolution for Kala & Kiln.",
};

const toc = [
  { id: "accounts", title: "1. Account Registration and Verification Rules" },
  { id: "dealer-model", title: "2. Dealer-Fulfilled Dropshipping Disclosure" },
  { id: "pricing-taxes", title: "3. Pricing, Server-Side Calculation, and GST" },
  { id: "payments-cod", title: "4. Payments and Cash on Delivery Rules" },
  { id: "delivery-estimates", title: "5. Delivery Estimates and Doorstep OTP" },
  { id: "cancellation-returns", title: "6. Cancellations, Returns, and Refunds" },
  { id: "prohibited-use", title: "7. Acceptable Use and Prohibited Conduct" },
  { id: "liability", title: "8. Limitation of Liability" },
  { id: "governing-law", title: "9. Governing Law and Dispute Resolution" },
  { id: "contact", title: "10. Contact Information" },
];

export default function TermsPage() {
  const registeredOffice = getLegalFieldDisplay(
    brandConfig.registeredAddress,
    "REGISTERED_OFFICE_ADDRESS"
  );
  const gstinDisplay = getLegalFieldDisplay(
    brandConfig.gstinPlaceholder,
    "SELLER_GSTIN"
  );

  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
          Legal &amp; Compliance · Last updated: 10 October 2026
        </p>
        <h1 className="mt-2 font-sans text-3xl font-medium text-ink sm:text-4xl">
          Terms and Conditions
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          These Terms and Conditions govern your access to and purchases from{" "}
          {brandConfig.legalEntityName}. By creating a verified account or placing an
          order, you agree to these terms.
        </p>

        <Card surface="sand" padding="md" className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink">
            Table of Contents
          </h2>
          <ol className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="text-clay-text underline underline-offset-4 hover:text-ink"
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ol>
        </Card>

        <div className="mt-10 flex flex-col gap-8 text-base leading-relaxed text-ink">
          <section id="accounts" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              1. Account Registration and Verification Rules
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              To browse full stock, build a cart, or place an order, you must register
              with your full legal name, active email address, Indian mobile phone
              number, street address, and a serviceable 6-digit PIN code. Your account
              remains locked until you click the 24-hour verification link sent to your
              email. You are responsible for keeping your password confidential.
              Repeated failed login attempts will temporarily lock the account to
              protect your security.
            </p>
          </section>

          <section id="dealer-model" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              2. Dealer-Fulfilled Dropshipping Disclosure
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Kala &amp; Kiln operates a curated dropshipping storefront. We do not
              hold physical stock in a central warehouse. When your order is confirmed,
              our operations team assigns it to a verified regional supplier or courier
              partner (&quot;Dealer&quot;) who serves your PIN code. While the Dealer
              packs and ships the parcel directly to your door, Kala &amp; Kiln
              remains your single point of contact for payments, order tracking,
              cancellations, returns, and refunds.
            </p>
          </section>

          <section id="pricing-taxes" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              3. Pricing, Server-Side Calculation, and GST
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              All prices are quoted in Indian Rupees (INR). Every product belongs to a
              specific Goods and Services Tax (GST) slab (5%, 12%, or 18%) based on its
              HSN classification. Line totals, GST amounts, PIN-zone shipping charges,
              and grand totals are computed exclusively on our server. The final price
              charged is always the live server price at the moment you submit
              checkout. Each confirmed order receives a GST-compliant invoice.
            </p>
          </section>

          <section id="payments-cod" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              4. Payments and Cash on Delivery Rules
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              We accept online payments via Razorpay (credit cards, debit cards, UPI,
              and netbanking) as well as Cash on Delivery (COD) in serviceable PIN
              codes:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
              <li>
                <strong>Online Payments:</strong> An order is marked Paid only when
                Razorpay&apos;s cryptographic webhook confirms payment completion.
                Stock is reserved for 15 minutes when you start checkout and released
                automatically if payment fails or times out.
              </li>
              <li>
                <strong>Cash on Delivery (COD):</strong> COD orders start in Pending
                Confirmation status and require you to enter a One-Time Code (OTP)
                sent to your verified email or phone. New accounts have a maximum COD
                order limit of Rs. 5,000 (Rs. 15,000 for established accounts with
                completed deliveries). Repeated refusal of COD parcels at the doorstep
                may disable COD eligibility on your account. See our{" "}
                <Link
                  href="/legal/cod"
                  className="text-clay-text underline underline-offset-4 hover:text-ink"
                >
                  Cash on Delivery Policy
                </Link>{" "}
                for full details.
              </li>
            </ul>
          </section>

          <section id="delivery-estimates" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              5. Delivery Estimates and Doorstep OTP
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Your predicted delivery date equals the item&apos;s workshop processing
              days plus the transit days for your PIN code zone, skipping Sundays and
              public holidays. At delivery, you must provide the 6-digit Delivery OTP
              shown on your tracking page and confirmation email to the Dealer&apos;s
              courier to mark the parcel Delivered. Full terms appear in our{" "}
              <Link
                href="/legal/shipping"
                className="text-clay-text underline underline-offset-4 hover:text-ink"
              >
                Shipping Policy
              </Link>
              .
            </p>
          </section>

          <section id="cancellation-returns" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              6. Cancellations, Returns, and Refunds
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              You may cancel any order free of charge from your tracking or account
              page before the Dealer marks it Shipped. Online payments for cancelled
              orders are refunded automatically to the original payment source. Once
              delivered, eligible items may be returned within 7 days of delivery if
              damaged, defective, or unused in original packaging. Read our{" "}
              <Link
                href="/legal/returns"
                className="text-clay-text underline underline-offset-4 hover:text-ink"
              >
                Returns and Refunds Policy
              </Link>{" "}
              for step-by-step instructions.
            </p>
          </section>

          <section id="prohibited-use" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              7. Acceptable Use and Prohibited Conduct
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              You must not place fraudulent Cash on Delivery orders, use automated
              scripts or scrapers against our search or stock APIs, attempt to tamper
              with client-side prices, or probe dealer status links. Violations result
              in immediate account termination and IP blocking.
            </p>
          </section>

          <section id="liability" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              8. Limitation of Liability
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              To the maximum extent permitted by Indian consumer protection law, our
              aggregate liability for any claim arising out of an order shall not
              exceed the total amount paid by you for that order. Nothing in these
              terms limits your statutory rights under the Consumer Protection Act,
              2019 or Consumer Protection (E-Commerce) Rules, 2020.
            </p>
          </section>

          <section id="governing-law" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              9. Governing Law and Dispute Resolution
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              These Terms are governed by the laws of the Republic of India. Any
              dispute not resolved through our Grievance Officer within 15 days shall
              be subject to the jurisdiction of the courts in Bengaluru, Karnataka,
              without prejudice to your right to approach the appropriate Consumer
              Disputes Redressal Commission.
            </p>
          </section>

          <section id="contact" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              10. Contact Information
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              {brandConfig.legalEntityName} · Email: {brandConfig.supportEmail} ·
              Registered Office: {registeredOffice.displayText} · GSTIN:{" "}
              {gstinDisplay.displayText}.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
