"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  User,
  Menu,
  MapPin,
  ChevronDown,
  LogOut,
  PackageCheck,
  Package,
  X,
} from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { SearchCombobox } from "@/components/search/SearchCombobox";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { useCart } from "@/components/cart/CartProvider";
import { brandConfig } from "@/config/brand";

interface CurrentUser {
  id: string;
  fullName: string;
  firstName: string;
  email: string;
  pinCode?: string;
  city?: string;
}

export function Header() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = React.useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = React.useState(false);
  const [deliveryPin, setDeliveryPin] = React.useState("560001");
  const [pinCity, setPinCity] = React.useState("Bengaluru");
  const [pinInput, setPinInput] = React.useState("");
  const [pinError, setPinError] = React.useState("");
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = React.useState(true);

  const { cart, badgePulse, setIsCartOpen } = useCart();
  const cartCount = cart?.totals.totalQuantity ?? 0;

  const accountMenuRef = React.useRef<HTMLDivElement>(null);

  // Fetch session and default delivery PIN
  React.useEffect(() => {
    let isMounted = true;

    // Load saved PIN code
    try {
      const savedPin = window.localStorage.getItem("kk_delivery_pin");
      const savedCity = window.localStorage.getItem("kk_delivery_city");
      if (savedPin) setDeliveryPin(savedPin);
      if (savedCity) setPinCity(savedCity);
    } catch {
      // Ignore
    }

    void fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { ok?: boolean; user?: CurrentUser }) => {
        if (!isMounted) return;
        if (data.ok && data.user) {
          setUser(data.user);
          if (data.user.pinCode) {
            setDeliveryPin(data.user.pinCode);
            if (data.user.city) setPinCity(data.user.city);
          }
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        if (isMounted) setUser(null);
      })
      .finally(() => {
        if (isMounted) setIsCheckingAuth(false);
      });

    const handleClickOutside = (e: MouseEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target as Node)
      ) {
        setIsAccountMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      isMounted = false;
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    setIsAccountMenuOpen(false);
    setIsMobileMenuOpen(false);
    try {
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      setUser(null);
      router.push("/login");
      router.refresh();
    } catch {
      window.location.href = "/login";
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    if (!/^[1-9]\d{5}$/.test(pinInput)) {
      setPinError("Enter a valid 6-digit Indian PIN code.");
      return;
    }

    try {
      const res = await fetch(`/api/pin-codes/${pinInput}`);
      const data = (await res.json()) as {
        ok?: boolean;
        pinCode?: { city: string; state: string; codAvailable: boolean };
        error?: string;
      };

      if (!res.ok || !data.pinCode) {
        setPinError(data.error ?? "PIN code not currently serviceable.");
        return;
      }

      setDeliveryPin(pinInput);
      setPinCity(data.pinCode.city);
      try {
        window.localStorage.setItem("kk_delivery_pin", pinInput);
        window.localStorage.setItem("kk_delivery_city", data.pinCode.city);
      } catch {
        // Ignore
      }
      setIsPinModalOpen(false);
      setPinInput("");
    } catch {
      setPinError("Could not verify PIN code. Please try again.");
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-[#0F2742] text-[#FFFFFF] shadow-sm">
      {/* Top Main Navigation Bar */}
      <div className="w-full">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:gap-6">
          {/* Brand Logo & Mobile Menu Toggle */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isMobileMenuOpen}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[4px] text-[#FFFFFF] hover:bg-[#FFFFFF]/10 md:hidden"
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>

            <Link
              href="/"
              className="flex shrink-0 items-center whitespace-nowrap text-xl font-bold tracking-tight text-[#FFFFFF] sm:text-2xl"
            >
              {brandConfig.name}
            </Link>
          </div>

          {/* Deliver to {pin} Selector (Desktop >= 1024px) */}
          <button
            type="button"
            onClick={() => {
              setPinInput(deliveryPin);
              setPinError("");
              setIsPinModalOpen(true);
            }}
            aria-label={`Deliver to PIN code ${deliveryPin}, ${pinCity}`}
            className="hidden shrink-0 items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-left text-xs hover:bg-[#FFFFFF]/10 lg:flex"
          >
            <MapPin className="h-4 w-4 shrink-0 text-[#FFB400]" />
            <div>
              <span className="block text-[11px] text-[#DDE1E6]">Deliver to</span>
              <span className="block font-bold text-[#FFFFFF]">
                {pinCity} {deliveryPin}
              </span>
            </div>
          </button>

          {/* Center Search Combobox (Desktop >= 768px) */}
          <div className="hidden flex-1 max-w-2xl md:block">
            <SearchCombobox compact />
          </div>

          {/* Right Action Icons: Account & Cart */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Account / Sign In Dropdown */}
            <div className="relative" ref={accountMenuRef}>
              {user ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                    aria-expanded={isAccountMenuOpen}
                    aria-label={`Account menu for ${user.fullName}`}
                    className="flex min-h-[44px] items-center gap-1 rounded-[4px] px-2.5 py-1 text-left text-xs hover:bg-[#FFFFFF]/10"
                  >
                    <div>
                      <span className="block text-[11px] text-[#DDE1E6]">
                        Hello, {user.firstName}
                      </span>
                      <span className="flex items-center gap-0.5 font-bold text-[#FFFFFF]">
                        Account <ChevronDown className="h-3 w-3" />
                      </span>
                    </div>
                  </button>

                  {/* Dropdown Menu */}
                  {isAccountMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-52 rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] py-2 text-[#101828] shadow-lg">
                      <div className="border-b border-[#DDE1E6] px-4 py-2">
                        <p className="text-xs text-[#475467]">Signed in as</p>
                        <p className="truncate text-sm font-bold text-[#101828]">
                          {user.fullName}
                        </p>
                      </div>

                      <Link
                        href="/account"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[#F5F6F7]"
                      >
                        <User className="h-4 w-4 text-[#475467]" />
                        Your account
                      </Link>

                      <Link
                        href="/account#orders"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[#F5F6F7]"
                      >
                        <Package className="h-4 w-4 text-[#475467]" />
                        Your orders
                      </Link>

                      <div className="my-1 border-t border-[#DDE1E6]" />

                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[#B42318] hover:bg-[#FEF2F2]"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href="/login"
                  aria-label="Sign in"
                  className="flex min-h-[44px] items-center gap-1 rounded-[4px] px-2.5 py-1 text-left text-xs hover:bg-[#FFFFFF]/10"
                >
                  <User className="h-5 w-5 sm:hidden" />
                  <div className="hidden sm:block">
                    <span className="block text-[11px] text-[#DDE1E6]">Hello, Sign in</span>
                    <span className="block font-bold text-[#FFFFFF]">Account</span>
                  </div>
                </Link>
              )}
            </div>

            {/* Shopping Cart Button */}
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              aria-label={`Shopping cart with ${cartCount} items`}
              className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-[4px] bg-[#FFB400] px-3.5 py-1.5 text-sm font-bold text-[#101828] hover:bg-[#E5A300]"
            >
              <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Cart</span>
              <span
                aria-live="polite"
                aria-atomic="true"
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-[4px] bg-[#101828] px-1 text-xs font-bold text-[#FFFFFF] transition-transform ${
                  badgePulse ? "scale-125" : "scale-100"
                }`}
              >
                {cartCount}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Search Row & PIN Bar (< 768px) */}
      <div className="border-t border-[#FFFFFF]/10 px-4 py-2 md:hidden">
        <div className="mb-2 flex items-center justify-between text-xs text-[#DDE1E6]">
          <button
            type="button"
            onClick={() => {
              setPinInput(deliveryPin);
              setPinError("");
              setIsPinModalOpen(true);
            }}
            className="flex items-center gap-1 hover:text-[#FFFFFF]"
          >
            <MapPin className="h-3.5 w-3.5 text-[#FFB400]" />
            <span>
              Deliver to <strong>{pinCity} {deliveryPin}</strong>
            </span>
          </button>
          <Link href="/catalogue" className="text-[#FFB400] hover:underline">
            All goods
          </Link>
        </div>
        <SearchCombobox compact />
      </div>

      {/* Category Links Sub-bar (Desktop & Tablet >= 768px) */}
      <div className="hidden border-t border-[#FFFFFF]/10 bg-[#0A1A2D] px-4 py-1.5 md:block">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between text-xs">
          <nav aria-label="Category navigation" className="flex items-center gap-5 font-medium text-[#DDE1E6]">
            <Link href="/catalogue" className="hover:text-[#FFFFFF]">
              All Goods
            </Link>
            <Link
              href="/catalogue?category=Tableware+%26+Ceramics"
              className="hover:text-[#FFFFFF]"
            >
              Tableware &amp; Ceramics
            </Link>
            <Link
              href="/catalogue?category=Linen+%26+Textiles"
              className="hover:text-[#FFFFFF]"
            >
              Linen &amp; Textiles
            </Link>
            <Link
              href="/catalogue?category=Brass+%26+Metalwork"
              className="hover:text-[#FFFFFF]"
            >
              Brass &amp; Metalwork
            </Link>
            <Link
              href="/catalogue?category=Lighting+%26+Glass"
              className="hover:text-[#FFFFFF]"
            >
              Lighting &amp; Glass
            </Link>
          </nav>

          <div className="flex items-center gap-4 text-xs text-[#DDE1E6]">
            <Link
              href="/track"
              prefetch={false}
              className="flex items-center gap-1 hover:text-[#FFFFFF]"
            >
              <PackageCheck className="h-3.5 w-3.5 text-[#FFB400]" />
              <span>Track order</span>
            </Link>
            <Link href="/legal/shipping" className="hover:text-[#FFFFFF]">
              Shipping policy
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu (< 768px) */}
      <Drawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        title={brandConfig.name}
        position="left"
      >
        <div className="flex flex-col gap-4 p-4 text-[#101828]">
          {/* User Header Block in Drawer */}
          <div className="rounded-[4px] bg-[#F5F6F7] p-3">
            {user ? (
              <div>
                <p className="text-xs text-[#475467]">Signed in as</p>
                <p className="text-base font-bold text-[#101828]">{user.fullName}</p>
                <p className="text-xs text-[#475467]">{user.email}</p>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#475467]">Welcome</p>
                  <p className="text-sm font-bold text-[#101828]">Sign in to your account</p>
                </div>
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="rounded-[4px] bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-[#FFFFFF]"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav aria-label="Mobile menu" className="flex flex-col gap-1 text-sm font-medium">
            {user ? (
              <>
                <Link
                  href="/account"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex min-h-[44px] items-center gap-2 rounded-[4px] px-2 hover:bg-[#F5F6F7]"
                >
                  <User className="h-4 w-4" />
                  Your account
                </Link>
                <Link
                  href="/account#orders"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex min-h-[44px] items-center gap-2 rounded-[4px] px-2 hover:bg-[#F5F6F7]"
                >
                  <Package className="h-4 w-4" />
                  Your orders
                </Link>
                <hr className="my-2 border-[#DDE1E6]" />
              </>
            ) : null}

            <Link
              href="/catalogue"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex min-h-[44px] items-center rounded-[4px] px-2 hover:bg-[#F5F6F7]"
            >
              All Goods
            </Link>
            <Link
              href="/catalogue?category=Tableware+%26+Ceramics"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex min-h-[44px] items-center rounded-[4px] px-2 hover:bg-[#F5F6F7]"
            >
              Tableware &amp; Ceramics
            </Link>
            <Link
              href="/catalogue?category=Linen+%26+Textiles"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex min-h-[44px] items-center rounded-[4px] px-2 hover:bg-[#F5F6F7]"
            >
              Linen &amp; Textiles
            </Link>
            <Link
              href="/catalogue?category=Brass+%26+Metalwork"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex min-h-[44px] items-center rounded-[4px] px-2 hover:bg-[#F5F6F7]"
            >
              Brass &amp; Metalwork
            </Link>
            <Link
              href="/catalogue?category=Lighting+%26+Glass"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex min-h-[44px] items-center rounded-[4px] px-2 hover:bg-[#F5F6F7]"
            >
              Lighting &amp; Glass
            </Link>

            <hr className="my-2 border-[#DDE1E6]" />

            <Link
              href="/track"
              prefetch={false}
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex min-h-[44px] items-center gap-2 rounded-[4px] px-2 hover:bg-[#F5F6F7]"
            >
              <PackageCheck className="h-4 w-4" />
              Track order
            </Link>

            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex min-h-[44px] items-center gap-2 rounded-[4px] px-2 text-left text-[#B42318] hover:bg-[#FEF2F2]"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            ) : null}
          </nav>
        </div>
      </Drawer>

      {/* PIN Code Delivery Selector Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/50 p-4">
          <div className="w-full max-w-sm rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 text-[#101828] shadow-xl">
            <div className="flex items-center justify-between border-b border-[#DDE1E6] pb-3">
              <h3 className="text-base font-bold text-[#101828]">Choose delivery location</h3>
              <button
                type="button"
                onClick={() => setIsPinModalOpen(false)}
                className="rounded-[4px] p-1 text-[#475467] hover:bg-[#F5F6F7]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-[#475467]">
              Enter your Indian PIN code to see product availability and delivery estimates.
            </p>

            <form onSubmit={handleUpdatePin} className="mt-4 flex flex-col gap-3">
              <input
                type="text"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter 6-digit PIN code"
                className="min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 text-sm text-[#101828] focus:border-[#1D4ED8]"
              />

              {pinError && <p className="text-xs text-[#B42318]">{pinError}</p>}

              <button
                type="submit"
                className="min-h-[44px] w-full rounded-[4px] bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-[#FFFFFF] hover:bg-[#1E40AF]"
              >
                Apply PIN code
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Slide-in Cart Drawer */}
      <CartDrawer />
    </header>
  );
}
