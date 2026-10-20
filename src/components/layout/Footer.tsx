"use client";

import * as React from "react";
import Link from "next/link";
import { openCookieSettingsModal } from "@/components/layout/CookieBanner";
import { brandConfig, getLegalFieldDisplay } from "@/config/brand";

export function Footer() {
  const gstinDisplay = getLegalFieldDisplay(
    brandConfig.gstinPlaceholder,
    "SELLER_GSTIN"
  );
  const grievanceOfficerDisplay = getLegalFieldDisplay(
    brandConfig.grievanceOfficerName,
    "GRIEVANCE_OFFICER_NAME"
  );

  return (
    <footer className="mt-20 border-t border-[#FFFFFF]/10 bg-[#0F2742] text-[#FFFFFF]">
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="text-xl font-bold text-[#FFFFFF]">
              {brandConfig.name}
            </p>
            <p className="mt-3 max-w-sm text-sm text-[#DDE1E6]">
              Everyday home, kitchen, and table goods dispatched directly from
              verified regional craft suppliers across India. Every parcel carries
              a live delivery timeline and all prices are inclusive of GST.
            </p>
            <p className="mt-4 text-xs text-[#DDE1E6]">
              GSTIN: {gstinDisplay.displayText}
            </p>
          </div>

          <div className="lg:col-span-2">
            <h2 className="text-sm font-bold text-[#FFFFFF]">
              Product categories
            </h2>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm text-[#DDE1E6]">
              <li>
                <Link href="/catalogue?category=Tableware+%26+Ceramics" className="hover:text-[#FFFFFF]">
                  Tableware &amp; Ceramics
                </Link>
              </li>
              <li>
                <Link href="/catalogue?category=Linen+%26+Textiles" className="hover:text-[#FFFFFF]">
                  Linen &amp; Textiles
                </Link>
              </li>
              <li>
                <Link href="/catalogue?category=Brass+%26+Metalwork" className="hover:text-[#FFFFFF]">
                  Brass &amp; Metalwork
                </Link>
              </li>
              <li>
                <Link href="/catalogue?category=Lighting+%26+Glass" className="hover:text-[#FFFFFF]">
                  Lighting &amp; Glass
                </Link>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-3">
            <h2 className="text-sm font-bold text-[#FFFFFF]">
              Customer service
            </h2>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm text-[#DDE1E6]">
              <li>
                <Link href="/track" prefetch={false} className="hover:text-[#FFFFFF]">
                  Track an order
                </Link>
              </li>
              <li>
                <Link href="/account" className="hover:text-[#FFFFFF]">
                  Your account
                </Link>
              </li>
              <li>
                <Link href="/legal/shipping" className="hover:text-[#FFFFFF]">
                  Shipping &amp; delivery policy
                </Link>
              </li>
              <li>
                <Link href="/legal/returns" className="hover:text-[#FFFFFF]">
                  Returns &amp; refund policy
                </Link>
              </li>
              <li>
                <Link href="/legal/cod" className="hover:text-[#FFFFFF]">
                  Cash on Delivery policy
                </Link>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-3">
            <h2 className="text-sm font-bold text-[#FFFFFF]">
              Legal &amp; privacy
            </h2>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm text-[#DDE1E6]">
              <li>
                <Link href="/legal/privacy" className="hover:text-[#FFFFFF]">
                  Privacy policy (DPDP &amp; GDPR)
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="hover:text-[#FFFFFF]">
                  Terms &amp; conditions
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={openCookieSettingsModal}
                  className="text-left text-sm text-[#DDE1E6] underline underline-offset-4 hover:text-[#FFFFFF]"
                >
                  Cookie settings
                </button>
              </li>
            </ul>
            <div className="mt-4 border-t border-[#FFFFFF]/10 pt-3 text-xs text-[#DDE1E6]">
              <p>Support: {brandConfig.supportEmail}</p>
              <p className="mt-0.5">
                Grievance officer: {grievanceOfficerDisplay.displayText} (
                {brandConfig.grievanceEmail})
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-[#FFFFFF]/10 pt-6 text-xs text-[#DDE1E6] sm:flex-row sm:items-center">
          <p>
            &copy; {new Date().getFullYear()} {brandConfig.legalEntityName} All
            rights reserved.
          </p>
          <p>
            Payments processed via Razorpay (Cards, UPI, Netbanking) and OTP-verified
            Cash on Delivery.
          </p>
        </div>
      </div>
    </footer>
  );
}
