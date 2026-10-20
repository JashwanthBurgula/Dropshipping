"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { brandConfig } from "@/config/brand";

export interface CookiePreferences {
  strictlyNecessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  policyVersion: string;
  anonymousId: string;
  savedAt: string;
  expiresAt: string;
}

const COOKIE_STORAGE_KEY = "kk_cookie_consent_v1";
const ANON_ID_STORAGE_KEY = "kk_anon_id_v1";
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export const OPEN_COOKIE_SETTINGS_EVENT = "kk:open-cookie-settings";

export function openCookieSettingsModal(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_COOKIE_SETTINGS_EVENT));
  }
}

function getOrCreateAnonymousId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(ANON_ID_STORAGE_KEY);
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(ANON_ID_STORAGE_KEY, generated);
  return generated;
}

export function getSavedCookiePreferences(): CookiePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookiePreferences;
    if (new Date(parsed.expiresAt).getTime() < Date.now()) {
      window.localStorage.removeItem(COOKIE_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function persistCookiePreferences(
  prefs: Pick<CookiePreferences, "preferences" | "analytics" | "marketing">
) {
  const now = new Date();
  const expires = new Date(now.getTime() + TWELVE_MONTHS_MS);
  const anonymousId = getOrCreateAnonymousId();
  const record: CookiePreferences = {
    ...prefs,
    strictlyNecessary: true,
    policyVersion: brandConfig.privacyPolicyVersion,
    anonymousId,
    savedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  window.localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(record));
  document.cookie = `${COOKIE_STORAGE_KEY}=${encodeURIComponent(
    JSON.stringify({
      n: 1,
      p: record.preferences ? 1 : 0,
      a: record.analytics ? 1 : 0,
      m: record.marketing ? 1 : 0,
      v: record.policyVersion,
    })
  )}; Max-Age=${365 * 24 * 60 * 60}; Path=/; SameSite=Lax`;

  try {
    await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anonymousId,
        policyVersion: brandConfig.privacyPolicyVersion,
        categories: {
          strictlyNecessary: true,
          preferences: record.preferences,
          analytics: record.analytics,
          marketing: record.marketing,
        },
      }),
    });
  } catch {
    // Non-blocking consent audit sync
  }
}

export function CookieBanner() {
  const [showBanner, setShowBanner] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [preferences, setPreferences] = React.useState(false);
  const [analytics, setAnalytics] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);

  React.useEffect(() => {
    const existing = getSavedCookiePreferences();
    if (!existing) {
      setShowBanner(true);
    } else {
      setPreferences(existing.preferences);
      setAnalytics(existing.analytics);
      setMarketing(existing.marketing);
    }

    const handleOpenSettings = () => {
      const current = getSavedCookiePreferences();
      if (current) {
        setPreferences(current.preferences);
        setAnalytics(current.analytics);
        setMarketing(current.marketing);
      }
      setIsModalOpen(true);
    };

    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, handleOpenSettings);
    return () => {
      window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, handleOpenSettings);
    };
  }, []);

  const handleAcceptAll = () => {
    void persistCookiePreferences({
      preferences: true,
      analytics: true,
      marketing: true,
    });
    setPreferences(true);
    setAnalytics(true);
    setMarketing(true);
    setShowBanner(false);
    setIsModalOpen(false);
  };

  const handleRejectNonEssential = () => {
    void persistCookiePreferences({
      preferences: false,
      analytics: false,
      marketing: false,
    });
    setPreferences(false);
    setAnalytics(false);
    setMarketing(false);
    setShowBanner(false);
    setIsModalOpen(false);
  };

  const handleSaveCustom = (event: React.FormEvent) => {
    event.preventDefault();
    void persistCookiePreferences({
      preferences,
      analytics,
      marketing,
    });
    setShowBanner(false);
    setIsModalOpen(false);
  };

  return (
    <>
      {showBanner ? (
        <aside
          aria-label="Cookie consent"
          className="fixed bottom-16 left-0 right-0 z-40 border-t border-stone bg-sand/95 p-4 shadow-floating md:bottom-0"
        >
          <div className="mx-auto flex max-w-content flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl text-sm text-ink">
              <p className="font-medium">Cookie and privacy settings</p>
              <p className="mt-1 text-ink-muted">
                We use strictly necessary cookies to keep your session, cart, and
                security tokens working. Optional cookies for preferences, analytics,
                and marketing remain off until you choose to enable them. Read our{" "}
                <Link
                  href="/legal/privacy"
                  className="font-medium text-clay-text underline underline-offset-4 hover:text-ink"
                >
                  Privacy Policy
                </Link>{" "}
                for details.
              </p>
            </div>

            {/* Equal-prominence buttons: identical variant and sizing, no dark patterns */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAcceptAll}
                className="bg-paper"
              >
                Accept all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRejectNonEssential}
                className="bg-paper"
              >
                Reject non-essential
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(true)}
                className="bg-paper"
              >
                Manage preferences
              </Button>
            </div>
          </div>
        </aside>
      ) : null}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Manage cookie preferences"
        description="Your choice is stored for 12 months and recorded with policy version history. You can update these settings at any time from the footer."
      >
        <form onSubmit={handleSaveCustom} className="flex flex-col gap-4">
          <div className="rounded-card border border-stone bg-sand p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">Strictly necessary</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Required for login sessions, CSRF protection, cart items, and
                  payment security.
                </p>
              </div>
              <span className="rounded-control border border-stone bg-paper px-2.5 py-1 text-xs font-medium text-ink">
                Always on
              </span>
            </div>
          </div>

          <label
            htmlFor="cookie-preferences"
            className="flex cursor-pointer items-start justify-between gap-4 rounded-card border border-stone bg-paper p-4"
          >
            <div>
              <span className="text-sm font-medium text-ink">Preferences</span>
              <p className="mt-0.5 text-xs text-ink-muted">
                Remembers your last checked delivery PIN code and display choices.
              </p>
            </div>
            <input
              id="cookie-preferences"
              type="checkbox"
              checked={preferences}
              onChange={(e) => setPreferences(e.target.checked)}
              className="mt-1 h-5 w-5 rounded-control border-stone accent-clay"
            />
          </label>

          <label
            htmlFor="cookie-analytics"
            className="flex cursor-pointer items-start justify-between gap-4 rounded-card border border-stone bg-paper p-4"
          >
            <div>
              <span className="text-sm font-medium text-ink">Analytics</span>
              <p className="mt-0.5 text-xs text-ink-muted">
                Helps us measure page speed and see which searches return no stock.
              </p>
            </div>
            <input
              id="cookie-analytics"
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
              className="mt-1 h-5 w-5 rounded-control border-stone accent-clay"
            />
          </label>

          <label
            htmlFor="cookie-marketing"
            className="flex cursor-pointer items-start justify-between gap-4 rounded-card border border-stone bg-paper p-4"
          >
            <div>
              <span className="text-sm font-medium text-ink">Marketing</span>
              <p className="mt-0.5 text-xs text-ink-muted">
                Used to measure the effectiveness of seasonal campaign links.
              </p>
            </div>
            <input
              id="cookie-marketing"
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="mt-1 h-5 w-5 rounded-control border-stone accent-clay"
            />
          </label>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button type="submit" variant="primary" size="sm">
              Save choices
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAcceptAll}
            >
              Accept all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRejectNonEssential}
            >
              Reject non-essential
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
