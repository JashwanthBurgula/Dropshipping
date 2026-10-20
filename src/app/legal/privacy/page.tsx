import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { brandConfig, getLegalFieldDisplay } from "@/config/brand";

/* draft for legal review */

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Kala & Kiln collects, uses, retains, and protects personal data under India's Digital Personal Data Protection Act, 2023 and GDPR.",
};

const sections = [
  { id: "data-collected", title: "1. Personal Data We Collect" },
  { id: "purposes-legal-basis", title: "2. Purposes, Legal Basis, and Consent" },
  { id: "sharing-dealers-providers", title: "3. Sharing with Dealers and Service Providers" },
  { id: "data-retention", title: "4. Data Retention Periods" },
  { id: "cookies-storage", title: "5. Cookies and Local Storage" },
  { id: "your-rights", title: "6. Your Rights under DPDP Act 2023 and GDPR" },
  { id: "children-data", title: "7. Children's Personal Data" },
  { id: "security-breach", title: "8. Security Controls and Data Breach Handling" },
  { id: "grievance-officer", title: "9. Data Protection and Grievance Officer" },
  { id: "policy-updates", title: "10. Changes to This Policy" },
];

export default function PrivacyPolicyPage() {
  const grievanceOfficer = getLegalFieldDisplay(
    brandConfig.grievanceOfficerName,
    "GRIEVANCE_OFFICER_NAME"
  );
  const registeredOffice = getLegalFieldDisplay(
    brandConfig.registeredAddress,
    "REGISTERED_OFFICE_ADDRESS"
  );

  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
          Legal &amp; Compliance · Last updated: 10 October 2026
        </p>
        <h1 className="mt-2 font-sans text-3xl font-medium text-ink sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          This Privacy Policy explains how {brandConfig.legalEntityName} (&quot;we&quot;,
          &quot;us&quot;, or &quot;our&quot;), acting as a Data Fiduciary under India&apos;s
          Digital Personal Data Protection Act, 2023 (DPDP Act) and as a Data
          Controller under the EU/UK General Data Protection Regulation (GDPR),
          collects, processes, shares, and protects your personal data.
        </p>

        <Card surface="sand" padding="md" className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink">
            Table of Contents
          </h2>
          <ol className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-clay-text underline underline-offset-4 hover:text-ink"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </Card>

        <div className="mt-10 flex flex-col gap-8 text-base leading-relaxed text-ink">
          <section id="data-collected" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              1. Personal Data We Collect
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              We collect only the fields required to verify your account, compute
              taxes and shipping, process payment, and deliver your order:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
              <li>
                <strong>Account and Identity Data:</strong> Full name, email address,
                Indian mobile phone number, and Argon2id-hashed password.
              </li>
              <li>
                <strong>Delivery Address and Location Data:</strong> Street address,
                city, state, 6-digit Indian PIN code, and optional GPS coordinates
                (latitude and longitude) only if you explicitly click the location
                sharing button during registration or checkout.
              </li>
              <li>
                <strong>Order and Transaction References:</strong> Order IDs
                (ORD-YYYYMMDD-XXXXX), purchased items, GST invoices, payment method,
                and gateway reference IDs from Razorpay. We never see or store raw
                credit/debit card numbers or UPI PINs.
              </li>
              <li>
                <strong>Refund Details for Cash on Delivery:</strong> If a Cash on
                Delivery order is returned after payment, we collect your UPI ID or
                bank account details solely to transfer your refund.
              </li>
              <li>
                <strong>Technical and Security Logs:</strong> IP address, session
                identifiers, failed login counts, and Cloudflare Turnstile verification
                tokens to prevent automated abuse.
              </li>
            </ul>
          </section>

          <section id="purposes-legal-basis" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              2. Purposes, Legal Basis, and Consent
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Under the DPDP Act 2023 and GDPR Article 6, we process your personal
              data on the following grounds:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
              <li>
                <strong>Explicit Consent:</strong> When you register an account, share
                optional GPS coordinates, or opt into non-essential cookies, you give
                free, specific, informed, and unambiguous consent. You may withdraw
                consent at any time.
              </li>
              <li>
                <strong>Contractual Fulfilment:</strong> Validating your PIN code,
                confirming Cash on Delivery orders via One-Time Password (OTP),
                handing off delivery details to our assigned regional dealer, and
                providing order tracking updates.
              </li>
              <li>
                <strong>Legal Obligation:</strong> Issuing GST-compliant tax invoices
                and retaining financial records under the Central Goods and Services
                Tax Act, 2017 and the Income-tax Act, 1961.
              </li>
            </ul>
          </section>

          <section id="sharing-dealers-providers" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              3. Sharing with Dealers and Service Providers
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              We do not sell or rent your personal data. Because we operate on a
              dealer-fulfilled dropshipping model, we share specific subsets of data
              only with the parties needed to complete your order:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
              <li>
                <strong>Assigned Fulfilment Dealers:</strong> When an admin assigns
                your confirmed order to a verified regional dealer serving your PIN
                code, that dealer receives only your name, delivery address, PIN code,
                optional GPS pin, phone number, and ordered items so they can ship and
                deliver the parcel. Their access link expires automatically once
                delivery is completed.
              </li>
              <li>
                <strong>Payment Gateway (Razorpay):</strong> Processes card, UPI, and
                netbanking payments on hosted PCI-DSS compliant fields and notifies our
                server via signed webhooks.
              </li>
              <li>
                <strong>Transactional Email Provider (Resend / AWS SES):</strong>{" "}
                Delivers account verification links, password resets, COD OTP codes,
                and order receipts.
              </li>
            </ul>
          </section>

          <section id="data-retention" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              4. Data Retention Periods
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
              <li>
                <strong>Unverified Accounts:</strong> Deleted automatically if the
                24-hour verification link expires and no new link is requested within
                14 days.
              </li>
              <li>
                <strong>Active Customer Accounts:</strong> Retained while your account
                remains active. You may request account deletion at any time.
              </li>
              <li>
                <strong>Order and Tax Invoice Snapshots:</strong> Retained for 8 years
                from the end of the relevant financial year as required by Indian GST
                and tax audit laws, even if you delete your customer profile.
              </li>
              <li>
                <strong>Security and Audit Logs:</strong> Retained for 180 days for
                fraud investigation and security compliance.
              </li>
            </ul>
          </section>

          <section id="cookies-storage" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              5. Cookies and Local Storage
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              We use strictly necessary HttpOnly, Secure, SameSite cookies for login
              sessions and CSRF protection. Optional cookies (Preferences, Analytics,
              and Marketing) are disabled by default and load only if you consent via
              our cookie banner. Your cookie choice is stored for 12 months and can be
              changed anytime via the &quot;Cookie settings&quot; link in the footer.
            </p>
          </section>

          <section id="your-rights" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              6. Your Rights under DPDP Act 2023 and GDPR
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              As a Data Principal (India) or Data Subject (EU/UK), you have the right
              to:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
              <li>
                <strong>Access and Summary:</strong> Request a clear summary of the
                personal data we hold about you and the dealers or processors with
                whom it has been shared.
              </li>
              <li>
                <strong>Correction and Updating:</strong> Correct inaccurate or
                incomplete profile and address details from your account page.
              </li>
              <li>
                <strong>Erasure (Right to Delete):</strong> Request deletion of your
                account and personal data that is no longer necessary for pending
                orders or statutory tax retention.
              </li>
              <li>
                <strong>Withdraw Consent:</strong> Withdraw optional GPS location
                sharing or cookie consent at any time without affecting the lawfulness
                of prior processing.
              </li>
              <li>
                <strong>Nomination (DPDP Act Section 14):</strong> Nominate an
                individual to exercise your rights in the event of death or
                incapacity.
              </li>
            </ul>
          </section>

          <section id="children-data" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              7. Children&apos;s Personal Data
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Our platform is intended exclusively for adults aged 18 years and older
              who can form legally binding contracts under the Indian Contract Act,
              1872. We do not knowingly collect personal data from anyone under 18. If
              we learn that an account belongs to a minor, we will close the account
              and delete the associated personal data immediately.
            </p>
          </section>

          <section id="security-breach" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              8. Security Controls and Data Breach Handling
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              We protect your data using TLS/HTTPS encryption in transit (with HSTS),
              encrypted database storage at rest, Argon2 password hashing, rate
              limiting, and two-factor authentication for all admin accounts. In the
              unlikely event of a personal data breach, we will notify the Data
              Protection Board of India (and relevant supervisory authorities) as well
              as each affected user with clear details of the breach and protective
              steps to take.
            </p>
          </section>

          <section id="grievance-officer" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              9. Data Protection and Grievance Officer
            </h2>
            <Card surface="sand" padding="md" className="mt-3">
              <p className="text-sm font-medium text-ink">
                Designated Grievance Officer (DPDP Act 2023 &amp; IT Rules, 2021)
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Name: {grievanceOfficer.displayText}
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Email: {brandConfig.grievanceEmail}
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Postal Address: {registeredOffice.displayText}
              </p>
              {(!grievanceOfficer.isConfigured || !registeredOffice.isConfigured) && (
                <p className="mt-2 rounded-control border border-stone bg-paper px-3 py-2 font-mono text-xs text-ink-muted">
                  Local Preview Status: Grievance Officer name and/or Registered
                  Office address are currently unconfigured placeholders and are
                  enforced before production deployment.
                </p>
              )}
              <p className="mt-2 text-xs text-ink-muted">
                We acknowledge all privacy requests and grievances within 24 hours and
                resolve them within 7 business days. If you are unsatisfied with our
                resolution, you have the right to escalate your complaint to the Data
                Protection Board of India.
              </p>
            </Card>
          </section>

          <section id="policy-updates" className="scroll-mt-24">
            <h2 className="font-sans text-xl font-medium text-ink">
              10. Changes to This Policy
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Whenever we make material updates to this Privacy Policy, we will update
              the &quot;Last updated&quot; date at the top of this page and notify
              registered customers by email before the changes take effect. Related
              store policies can be reviewed on our{" "}
              <Link
                href="/legal/terms"
                className="text-clay-text underline underline-offset-4 hover:text-ink"
              >
                Terms &amp; Conditions
              </Link>{" "}
              page.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
