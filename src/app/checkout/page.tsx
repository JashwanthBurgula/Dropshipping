"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Lock,
  MapPin,
  ShieldCheck,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPaiseToInr } from "@/lib/pricing/gst";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";
import type { CustomerCartView } from "@/lib/cart/service";
import type { CodEligibilityStatus } from "@/lib/orders/service";

interface SavedAddressItem {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pinCode: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

interface CheckoutPreviewResponse {
  ok: boolean;
  code?: string;
  error?: string;
  customer?: {
    id: string;
    email: string;
    fullName: string;
  };
  profileAddress?: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pinCode: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
  savedAddresses?: SavedAddressItem[];
  cart?: CustomerCartView;
  codEligibility?: CodEligibilityStatus;
}

type CheckoutStep = 1 | 2 | 3;

function readCsrfCookieFromDocument(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

function createClientIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `chk_${crypto.randomUUID()}`;
  }
  return `chk_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const formId = useId();

  const [step, setStep] = useState<CheckoutStep>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [cart, setCart] = useState<CustomerCartView | null>(null);
  const [codEligibility, setCodEligibility] =
    useState<CodEligibilityStatus | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressItem[]>([]);

  // Address form state
  const [recipientName, setRecipientName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [addressLine1, setAddressLine1] = useState<string>("");
  const [addressLine2, setAddressLine2] = useState<string>("");
  const [pinCode, setPinCode] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [stateName, setStateName] = useState<string>("");
  const [showMapPin, setShowMapPin] = useState<boolean>(false);
  const [latitude, setLatitude] = useState<number>(12.9716);
  const [longitude, setLongitude] = useState<number>(77.5946);
  const [saveAddressToProfile, setSaveAddressToProfile] =
    useState<boolean>(false);
  const [addressLabel, setAddressLabel] = useState<string>("Home");

  // PIN verification state
  const [pinStatusMessage, setPinStatusMessage] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [checkingPin, setCheckingPin] = useState<boolean>(false);

  // Step 2: Payment method state
  const [paymentMethod, setPaymentMethod] = useState<
    "RAZORPAY" | "COD" | "PAYPAL"
  >("RAZORPAY");

  // Step 3: Review & submission state
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mismatchNotice, setMismatchNotice] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    createClientIdempotencyKey()
  );

  const loadCheckoutPreview = useCallback(async (targetPin?: string) => {
    setLoading(true);
    try {
      const url = targetPin
        ? `/api/checkout?pinCode=${encodeURIComponent(targetPin)}`
        : "/api/checkout";
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) {
        setAuthRequired(true);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as CheckoutPreviewResponse;
      if (!data.ok || !data.cart) {
        setSubmitError(data.error ?? "Unable to load checkout details.");
        setLoading(false);
        return;
      }

      setCart(data.cart);
      setCodEligibility(data.codEligibility ?? null);
      setSavedAddresses(data.savedAddresses ?? []);

      const defaultSaved = data.savedAddresses?.find((a) => a.isDefault);
      const initialAddr = defaultSaved ?? data.profileAddress;
      if (initialAddr && !targetPin) {
        setRecipientName(initialAddr.recipientName);
        setPhone(initialAddr.phone);
        setAddressLine1(initialAddr.addressLine1);
        setAddressLine2(initialAddr.addressLine2 || "");
        setPinCode(initialAddr.pinCode);
        setCity(initialAddr.city);
        setStateName(initialAddr.state);
        if (
          typeof initialAddr.latitude === "number" &&
          typeof initialAddr.longitude === "number"
        ) {
          setLatitude(initialAddr.latitude);
          setLongitude(initialAddr.longitude);
        }
      }
    } catch {
      setSubmitError("Network error while loading checkout.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCheckoutPreview();
  }, [loadCheckoutPreview]);

  const handlePinVerify = async (candidatePin: string) => {
    const cleaned = candidatePin.trim();
    setPinCode(cleaned);
    setPinError(null);
    setPinStatusMessage(null);

    if (!/^[1-9]\d{5}$/.test(cleaned)) {
      if (cleaned.length === 6) {
        setPinError("Enter a valid 6-digit Indian PIN code.");
      }
      return;
    }

    setCheckingPin(true);
    try {
      const res = await fetch(
        `/api/pincode?pin=${encodeURIComponent(cleaned)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as {
        serviceable?: boolean;
        city?: string;
        state?: string;
        codAvailable?: boolean;
        message?: string;
      };
      if (!res.ok || !data.serviceable) {
        setPinError(
          data.message ??
            `PIN code ${cleaned} is not currently serviceable for delivery.`
        );
        return;
      }

      setCity(data.city ?? "");
      setStateName(data.state ?? "");
      setPinStatusMessage(
        `Delivering to ${data.city}, ${data.state}. ${
          data.codAvailable
            ? "Online payment and Cash on Delivery available."
            : "Prepaid online orders only for this PIN code."
        }`
      );
      await loadCheckoutPreview(cleaned);
    } catch {
      setPinError("Unable to verify PIN code right now.");
    } finally {
      setCheckingPin(false);
    }
  };

  const applySavedAddress = async (addr: SavedAddressItem) => {
    setRecipientName(addr.recipientName);
    setPhone(addr.phone);
    setAddressLine1(addr.addressLine1);
    setAddressLine2(addr.addressLine2 || "");
    setPinCode(addr.pinCode);
    setCity(addr.city);
    setStateName(addr.state);
    if (typeof addr.latitude === "number" && typeof addr.longitude === "number") {
      setLatitude(addr.latitude);
      setLongitude(addr.longitude);
    }
    await handlePinVerify(addr.pinCode);
  };

  const validateStepOne = (): boolean => {
    if (recipientName.trim().length < 2) {
      setSubmitError("Enter the recipient's full name.");
      return false;
    }
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      setSubmitError(
        "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9."
      );
      return false;
    }
    if (addressLine1.trim().length < 5) {
      setSubmitError(
        "Enter your flat/house number, building, and street address."
      );
      return false;
    }
    if (!/^[1-9]\d{5}$/.test(pinCode.trim()) || pinError) {
      setSubmitError("Enter a serviceable 6-digit Indian PIN code.");
      return false;
    }
    if (!city.trim() || !stateName.trim()) {
      setSubmitError("Verify your 6-digit PIN code to populate city and state.");
      return false;
    }
    setSubmitError(null);
    return true;
  };

  const handleContinueToPayment = () => {
    if (!validateStepOne()) return;
    if (paymentMethod === "COD" && codEligibility && !codEligibility.allowed) {
      setPaymentMethod("RAZORPAY");
    }
    setStep(2);
  };

  const handleContinueToReview = () => {
    if (paymentMethod === "COD" && codEligibility && !codEligibility.allowed) {
      setSubmitError(
        codEligibility.reason ??
          "Cash on Delivery is not available for this order."
      );
      return;
    }
    setSubmitError(null);
    setIdempotencyKey(createClientIdempotencyKey());
    setStep(3);
  };

  const grandTotalPaise = cart?.totals.grandTotalPaise ?? 0;
  const formattedGrandTotal = useMemo(
    () => formatPaiseToInr(grandTotalPaise),
    [grandTotalPaise]
  );

  const handlePlaceOrder = async () => {
    if (!cart || submitting) return;
    if (!termsAccepted) {
      setSubmitError(
        "Please accept the Terms of Service and Refund & Cancellation Policy before placing your order."
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setMismatchNotice(null);

    try {
      const csrfToken = readCsrfCookieFromDocument();
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          idempotencyKey,
          address: {
            recipientName: recipientName.trim(),
            phone: phone.trim(),
            addressLine1: addressLine1.trim(),
            addressLine2: addressLine2.trim(),
            pinCode: pinCode.trim(),
            city: city.trim(),
            state: stateName.trim(),
            latitude: showMapPin ? latitude : null,
            longitude: showMapPin ? longitude : null,
            saveAddressToProfile,
            addressLabel: addressLabel.trim() || "Home",
          },
          paymentMethod,
          expectedTotalPaise: grandTotalPaise,
          termsAccepted: true,
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        code?: string;
        error?: string;
        currentTotalPaise?: number;
        order?: { orderId: string };
      };

      if (!res.ok || !data.ok) {
        if (data.code === "PRICE_OR_TOTAL_CHANGED") {
          setMismatchNotice(
            data.error ??
              "Item prices or totals changed while you were reviewing. We have refreshed your order total below. Please review and click Place Order again to confirm."
          );
          setIdempotencyKey(createClientIdempotencyKey());
          await loadCheckoutPreview(pinCode);
          setSubmitting(false);
          return;
        }

        setSubmitError(
          data.error ?? "Could not complete your order. Please try again."
        );
        setIdempotencyKey(createClientIdempotencyKey());
        await loadCheckoutPreview(pinCode);
        setSubmitting(false);
        return;
      }

      if (data.order?.orderId) {
        router.push(
          `/orders/${encodeURIComponent(data.order.orderId)}/confirmation`
        );
      }
    } catch {
      setSubmitError(
        "A network error occurred while placing your order. Your Idempotency-Key protects you from duplicate charges if you try again."
      );
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1160px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="h-7 w-48 animate-pulse rounded-[4px] bg-surface-alt" />
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="h-96 animate-pulse rounded-[8px] border border-border bg-surface-alt lg:col-span-7" />
          <div className="h-80 animate-pulse rounded-[8px] border border-border bg-surface-alt lg:col-span-5" />
        </div>
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-16 sm:px-6">
        <div className="rounded-[8px] border border-border bg-surface-alt p-8">
          <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
            <Lock className="h-4 w-4 text-accent" />
            Verified Account Checkout
          </div>
          <h1 className="font-sans text-2xl font-semibold text-ink">
            Sign in to complete your order
          </h1>
          <p className="mt-2 text-sm text-muted">
            Checkout requires a verified customer account so we can reserve
            workshop inventory, calculate exact GST for your PIN code, and send
            your order receipt and tracking updates.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login?next=/checkout">
              <Button variant="primary">Sign In to Continue</Button>
            </Link>
            <Link href="/register">
              <Button variant="secondary">Create Verified Account</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-16 sm:px-6">
        <div className="rounded-[8px] border border-border bg-surface-alt p-8">
          <h1 className="font-sans text-2xl font-semibold text-ink">
            Your cart is empty
          </h1>
          <p className="mt-2 text-sm text-muted">
            Add handcrafted tableware, brassware, or linen pieces to your cart
            before proceeding to checkout.
          </p>
          <div className="mt-6">
            <Link href="/catalogue">
              <Button variant="primary">Explore the Catalogue</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1160px] px-4 pb-28 pt-8 sm:px-6 lg:pb-16 lg:px-8">
      {/* Load Razorpay checkout SDK exclusively on /checkout */}
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />

      <header className="border-b border-border pb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted">
          Verified Checkout
        </p>
        <h1 className="mt-1 font-sans text-3xl font-semibold text-ink">
          Complete Your Order
        </h1>

        {/* 3-Step Progress Bar */}
        <nav
          aria-label="Checkout steps"
          className="mt-6 grid grid-cols-3 gap-3"
        >
          {[
            { num: 1 as const, title: "1. Delivery Address" },
            { num: 2 as const, title: "2. Payment Method" },
            { num: 3 as const, title: "3. Review & Place Order" },
          ].map((item) => {
            const isActive = step === item.num;
            const isComplete = step > item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => {
                  if (item.num < step) setStep(item.num);
                }}
                disabled={item.num > step}
                className={`flex items-center justify-between rounded-[4px] border px-3.5 py-2.5 text-left text-xs font-medium transition-colors sm:text-sm ${
                  isActive
                    ? "border-accent bg-accent/10 text-ink"
                    : isComplete
                      ? "border-border bg-surface-alt text-ink hover:border-ink"
                      : "cursor-not-allowed border-border bg-surface text-muted opacity-65"
                }`}
              >
                <span>{item.title}</span>
                {isComplete && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {submitError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-[8px] border border-danger bg-danger/10 p-4 text-sm text-danger"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{submitError}</div>
        </div>
      )}

      {mismatchNotice && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-[8px] border border-warning bg-warning/10 p-4 text-sm text-ink"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">Order Total Updated</p>
            <p className="mt-1 text-muted">{mismatchNotice}</p>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Active Step */}
        <div className="space-y-6 lg:col-span-7">
          {step === 1 && (
            <section
              aria-labelledby={`${formId}-step1-heading`}
              className="rounded-[8px] border border-border bg-surface-alt p-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2
                    id={`${formId}-step1-heading`}
                    className="font-sans text-xl font-semibold text-ink"
                  >
                    Step 1: Delivery Address
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Select a saved address or enter a serviceable Indian PIN
                    code.
                  </p>
                </div>
                <MapPin className="h-5 w-5 text-accent" />
              </div>

              {savedAddresses.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Saved Addresses
                  </p>
                  <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {savedAddresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => void applySavedAddress(addr)}
                        className={`rounded-[8px] border p-3.5 text-left text-xs transition-colors ${
                          pinCode === addr.pinCode &&
                          addressLine1 === addr.addressLine1
                            ? "border-accent bg-surface"
                            : "border-border bg-surface hover:border-ink"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">
                            {addr.label}
                          </span>
                          <span className="font-mono text-[11px] text-muted">
                            {addr.pinCode}
                          </span>
                        </div>
                        <p className="mt-1 font-medium text-ink">
                          {addr.recipientName}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-muted">
                          {addr.addressLine1}
                        </p>
                        <p className="text-muted">
                          {addr.city}, {addr.state}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`${formId}-recipient`}
                    className="block text-xs font-medium text-ink"
                  >
                    Recipient Full Name
                  </label>
                  <input
                    id={`${formId}-recipient`}
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="mt-1.5 w-full rounded-[4px] border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                    placeholder="Aarav Sharma"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-phone`}
                    className="block text-xs font-medium text-ink"
                  >
                    Mobile Number (India +91)
                  </label>
                  <input
                    id={`${formId}-phone`}
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    className="mt-1.5 w-full rounded-[4px] border border-border bg-surface px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
                    placeholder="9845012345"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor={`${formId}-line1`}
                    className="block text-xs font-medium text-ink"
                  >
                    Flat, House No., Building, Street
                  </label>
                  <input
                    id={`${formId}-line1`}
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    className="mt-1.5 w-full rounded-[4px] border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                    placeholder="Flat 402, Terracotta Heights, 12th Main Road"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor={`${formId}-line2`}
                    className="block text-xs font-medium text-ink"
                  >
                    Area, Landmark (Optional)
                  </label>
                  <input
                    id={`${formId}-line2`}
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    className="mt-1.5 w-full rounded-[4px] border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                    placeholder="Near Indiranagar Metro Station"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-pin`}
                    className="block text-xs font-medium text-ink"
                  >
                    6-Digit PIN Code
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id={`${formId}-pin`}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={pinCode}
                      onChange={(e) => {
                        const val = e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 6);
                        setPinCode(val);
                        if (val.length === 6) {
                          void handlePinVerify(val);
                        }
                      }}
                      className="w-full rounded-[4px] border border-border bg-surface px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
                      placeholder="560001"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handlePinVerify(pinCode)}
                      disabled={checkingPin}
                    >
                      {checkingPin ? "Checking..." : "Check"}
                    </Button>
                  </div>
                  {pinError && (
                    <p className="mt-1 text-xs text-danger">{pinError}</p>
                  )}
                  {pinStatusMessage && !pinError && (
                    <p className="mt-1 text-xs text-success">
                      {pinStatusMessage}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor={`${formId}-city`}
                      className="block text-xs font-medium text-ink"
                    >
                      City
                    </label>
                    <input
                      id={`${formId}-city`}
                      type="text"
                      value={city}
                      readOnly
                      className="mt-1.5 w-full rounded-[4px] border border-border bg-surface-alt px-3 py-2 text-sm text-muted"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`${formId}-state`}
                      className="block text-xs font-medium text-ink"
                    >
                      State
                    </label>
                    <input
                      id={`${formId}-state`}
                      type="text"
                      value={stateName}
                      readOnly
                      className="mt-1.5 w-full rounded-[4px] border border-border bg-surface-alt px-3 py-2 text-sm text-muted"
                    />
                  </div>
                </div>
              </div>

              {/* Optional OpenStreetMap / Leaflet Delivery Pin */}
              <div className="mt-5 rounded-[8px] border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-ink">
                      Optional OpenStreetMap Delivery Pin
                    </p>
                    <p className="text-xs text-muted">
                      Attach exact coordinates to help courier partners locate
                      your gate.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMapPin((prev) => !prev)}
                    className="rounded-[4px] border border-border px-3 py-1.5 text-xs font-medium text-ink hover:border-ink"
                  >
                    {showMapPin ? "Remove Pin" : "Set Map Pin"}
                  </button>
                </div>

                {showMapPin && (
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
                    <div>
                      <label
                        htmlFor={`${formId}-lat`}
                        className="block text-xs text-muted"
                      >
                        Latitude (OpenStreetMap)
                      </label>
                      <input
                        id={`${formId}-lat`}
                        type="number"
                        step="0.0001"
                        value={latitude}
                        onChange={(e) =>
                          setLatitude(parseFloat(e.target.value) || 0)
                        }
                        className="mt-1 w-full rounded-[4px] border border-border bg-surface-alt px-2.5 py-1.5 font-mono text-xs text-ink"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`${formId}-lng`}
                        className="block text-xs text-muted"
                      >
                        Longitude (OpenStreetMap)
                      </label>
                      <input
                        id={`${formId}-lng`}
                        type="number"
                        step="0.0001"
                        value={longitude}
                        onChange={(e) =>
                          setLongitude(parseFloat(e.target.value) || 0)
                        }
                        className="mt-1 w-full rounded-[4px] border border-border bg-surface-alt px-2.5 py-1.5 font-mono text-xs text-ink"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <input
                  id={`${formId}-save-addr`}
                  type="checkbox"
                  checked={saveAddressToProfile}
                  onChange={(e) => setSaveAddressToProfile(e.target.checked)}
                  className="h-4 w-4 rounded-[4px] border-border text-accent focus:ring-accent"
                />
                <label
                  htmlFor={`${formId}-save-addr`}
                  className="text-xs text-ink"
                >
                  Save this address to my address book for future orders
                </label>
                {saveAddressToProfile && (
                  <input
                    type="text"
                    value={addressLabel}
                    onChange={(e) => setAddressLabel(e.target.value)}
                    placeholder="Label (e.g. Home, Studio)"
                    className="ml-auto w-36 rounded-[4px] border border-border bg-surface px-2.5 py-1 text-xs text-ink"
                  />
                )}
              </div>

              <div className="mt-6 flex justify-end border-t border-border pt-4">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleContinueToPayment}
                >
                  Continue to Payment Method
                </Button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section
              aria-labelledby={`${formId}-step2-heading`}
              className="rounded-[8px] border border-border bg-surface-alt p-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2
                    id={`${formId}-step2-heading`}
                    className="font-sans text-xl font-semibold text-ink"
                  >
                    Step 2: Select Payment Method
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Choose between instant online payment via Razorpay or Cash
                    on Delivery.
                  </p>
                </div>
                <CreditCard className="h-5 w-5 text-accent" />
              </div>

              <div className="mt-5 space-y-4" role="radiogroup">
                {/* Large Selectable Row 1: Razorpay */}
                <label
                  className={`flex cursor-pointer items-start gap-4 rounded-[8px] border p-4 transition-colors ${
                    paymentMethod === "RAZORPAY"
                      ? "border-accent bg-surface"
                      : "border-border bg-surface hover:border-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="RAZORPAY"
                    checked={paymentMethod === "RAZORPAY"}
                    onChange={() => setPaymentMethod("RAZORPAY")}
                    className="mt-1 h-4 w-4 text-accent focus:ring-accent"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">
                        Pay Online via Razorpay (UPI, Cards, Netbanking)
                      </span>
                      <CreditCard className="h-4 w-4 text-accent" />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Instant confirmation via UPI apps (GPay, PhonePe, BHIM),
                      Visa, Mastercard, RuPay cards, and Indian netbanking.
                      Stock is reserved for 15 minutes while you complete
                      payment.
                    </p>
                  </div>
                </label>

                {/* Large Selectable Row 2: Cash on Delivery */}
                {(() => {
                  const codAllowed = codEligibility?.allowed ?? false;
                  return (
                    <label
                      className={`flex items-start gap-4 rounded-[8px] border p-4 transition-colors ${
                        !codAllowed
                          ? "cursor-not-allowed border-border bg-surface/60 opacity-75"
                          : paymentMethod === "COD"
                            ? "cursor-pointer border-accent bg-surface"
                            : "cursor-pointer border-border bg-surface hover:border-ink"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="COD"
                        disabled={!codAllowed}
                        checked={paymentMethod === "COD"}
                        onChange={() => {
                          if (codAllowed) setPaymentMethod("COD");
                        }}
                        className="mt-1 h-4 w-4 text-accent focus:ring-accent"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">
                            Cash on Delivery (Requires 6-Digit OTP Verification)
                          </span>
                          <Wallet className="h-4 w-4 text-muted" />
                        </div>
                        {codAllowed ? (
                          <p className="mt-1 text-xs text-muted">
                            Pay in cash or UPI at your doorstep upon delivery.
                            We will send a 6-digit one-time verification code to
                            your email and mobile number that must be entered
                            within 10 minutes.
                          </p>
                        ) : (
                          <p className="mt-1 text-xs font-medium text-danger">
                            {codEligibility?.reason ??
                              "Cash on Delivery is not available for this PIN code or order total."}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })()}

                {/* Large Selectable Row 3: PayPal Online Payment */}
                <label
                  className={`flex cursor-pointer items-start gap-4 rounded-[8px] border p-4 transition-colors ${
                    paymentMethod === "PAYPAL"
                      ? "border-accent bg-surface"
                      : "border-border bg-surface hover:border-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="PAYPAL"
                    checked={paymentMethod === "PAYPAL"}
                    onChange={() => setPaymentMethod("PAYPAL")}
                    className="mt-1 h-4 w-4 text-accent focus:ring-accent"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">
                        PayPal (Express Cards &amp; Multi-Currency)
                      </span>
                      <Wallet className="h-4 w-4 text-accent" />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Seamless global checkout for international debit/credit cards and PayPal Balance. Instant order confirmation with real-time dispatch tracking.
                    </p>
                  </div>
                </label>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep(1)}
                >
                  Back to Address
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleContinueToReview}
                >
                  Continue to Review
                </Button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section
              aria-labelledby={`${formId}-step3-heading`}
              className="rounded-[8px] border border-border bg-surface-alt p-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2
                    id={`${formId}-step3-heading`}
                    className="font-sans text-xl font-semibold text-ink"
                  >
                    Step 3: Review & Confirm Order
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Verify your delivery address, predicted delivery dates, and
                    GST breakdown before placing your order.
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 text-accent" />
              </div>

              {/* Address & Payment Summary Box */}
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-[8px] border border-border bg-surface p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase tracking-wider text-muted">
                      Delivery Address
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="font-medium text-accent underline"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="mt-2 font-semibold text-ink">{recipientName}</p>
                  <p className="mt-0.5 text-muted">{addressLine1}</p>
                  {addressLine2 && (
                    <p className="text-muted">{addressLine2}</p>
                  )}
                  <p className="text-muted">
                    {city}, {stateName} -{" "}
                    <span className="font-mono">{pinCode}</span>
                  </p>
                  <p className="mt-1 font-mono text-muted">+91 {phone}</p>
                </div>

                <div className="rounded-[8px] border border-border bg-surface p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase tracking-wider text-muted">
                      Payment & Delivery
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="font-medium text-accent underline"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="mt-2 font-semibold text-ink">
                    {paymentMethod === "RAZORPAY"
                      ? "Razorpay Online Payment"
                      : paymentMethod === "PAYPAL"
                      ? "PayPal Express Payment"
                      : "Cash on Delivery (6-Digit OTP)"}
                  </p>
                  {cart.deliveryEstimate && (
                    <div className="mt-2 flex items-start gap-2 text-muted">
                      <Truck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <div>
                        <p className="font-medium text-ink">
                          Estimated Arrival:{" "}
                          {cart.deliveryEstimate.formattedDeliveryWindow}
                        </p>
                        <p className="text-[11px]">
                          Studio dispatch by{" "}
                          {cart.deliveryEstimate.estimatedDispatchDate}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Snapshot Items List */}
              <div className="mt-5 divide-y divide-border rounded-[8px] border border-border bg-surface p-4">
                {cart.lines.map((line) => (
                  <div
                    key={line.productId}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {line.name}
                      </p>
                      <p className="text-xs text-muted">
                        HSN {line.hsnCode} | GST {line.taxSlab} | Qty{" "}
                        {line.effectiveQuantity} x{" "}
                        {formatPaiseToInr(line.currentUnitPricePaise)}
                      </p>
                    </div>
                    <p className="font-mono text-sm font-semibold tabular-nums text-ink">
                      {formatPaiseToInr(line.taxBreakdown.lineTotalPaise)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Required Terms & Policy Consent Checkbox */}
              <div className="mt-5 rounded-[8px] border border-border bg-surface p-4">
                <label className="flex cursor-pointer items-start gap-3 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded-[4px] border-border text-accent focus:ring-accent"
                  />
                  <span>
                    I have reviewed my order details and accept the{" "}
                    <Link
                      href="/legal/terms"
                      className="font-medium text-accent underline"
                    >
                      Terms of Service
                    </Link>
                    ,{" "}
                    <Link
                      href="/legal/refund"
                      className="font-medium text-accent underline"
                    >
                      Refund & Cancellation Policy
                    </Link>
                    , and{" "}
                    <Link
                      href="/legal/shipping"
                      className="font-medium text-accent underline"
                    >
                      Shipping Policy
                    </Link>
                    .
                  </span>
                </label>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                >
                  Back to Payment
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void handlePlaceOrder()}
                  disabled={submitting || !termsAccepted}
                >
                  {submitting
                    ? "Reserving Stock & Placing Order..."
                    : `Place Order - ${formattedGrandTotal}`}
                </Button>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Server-Calculated Tax & Totals Summary */}
        <aside className="lg:col-span-5">
          <div className="sticky top-24 rounded-[8px] border border-border bg-surface-alt p-6">
            <h2 className="font-sans text-lg font-semibold text-ink">
              Order Summary
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              All product prices are GST-inclusive. Invoice tax is the exact sum
              of per-line tax in integer paise.
            </p>

            <dl className="mt-5 space-y-2.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Taxable Value (Excl. GST)</dt>
                <dd className="font-mono tabular-nums text-ink">
                  {formatPaiseToInr(cart.totals.taxableSubtotalPaise)}
                </dd>
              </div>

              {cart.totals.isIntraState ? (
                <>
                  <div className="flex justify-between text-xs">
                    <dt className="text-muted">
                      CGST (Intra-state {cart.totals.sellerStateCode})
                    </dt>
                    <dd className="font-mono tabular-nums text-ink">
                      {formatPaiseToInr(cart.totals.cgstTotalPaise)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-xs">
                    <dt className="text-muted">
                      SGST (Intra-state {cart.totals.sellerStateCode})
                    </dt>
                    <dd className="font-mono tabular-nums text-ink">
                      {formatPaiseToInr(cart.totals.sgstTotalPaise)}
                    </dd>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-xs">
                  <dt className="text-muted">
                    IGST (Inter-state to {cart.totals.deliveryStateCode})
                  </dt>
                  <dd className="font-mono tabular-nums text-ink">
                    {formatPaiseToInr(cart.totals.igstTotalPaise)}
                  </dd>
                </div>
              )}

              <div className="flex justify-between">
                <dt className="text-muted">Items Subtotal (Incl. GST)</dt>
                <dd className="font-mono tabular-nums text-ink">
                  {formatPaiseToInr(cart.totals.subtotalPaise)}
                </dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-muted">Insured Surface Shipping</dt>
                <dd className="font-mono tabular-nums text-ink">
                  {cart.totals.shippingPaise === 0
                    ? "Free"
                    : formatPaiseToInr(cart.totals.shippingPaise)}
                </dd>
              </div>

              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-ink">
                <dt>Grand Total</dt>
                <dd className="font-mono tabular-nums">
                  {formattedGrandTotal}
                </dd>
              </div>
            </dl>

            {/* HSN Tax Summary Table */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                HSN Tax Breakdown
              </p>
              <table className="mt-2 w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="pb-1.5 font-medium">HSN (Slab)</th>
                    <th className="pb-1.5 text-right font-medium">Taxable</th>
                    <th className="pb-1.5 text-right font-medium">Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono tabular-nums">
                  {cart.totals.lines.map((row) => (
                    <tr key={`${row.productId}-${row.hsnCode}`}>
                      <td className="py-1.5 text-ink">
                        {row.hsnCode} ({row.taxRatePercent}%)
                      </td>
                      <td className="py-1.5 text-right text-muted">
                        {formatPaiseToInr(row.taxableAmountPaise)}
                      </td>
                      <td className="py-1.5 text-right text-ink">
                        {formatPaiseToInr(row.totalTaxPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </div>

      {/* Sticky Mobile Bottom Bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface p-4 shadow-md lg:hidden">
        <div className="mx-auto flex max-w-[640px] items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted">Grand Total (Incl. GST)</p>
            <p className="font-mono text-base font-semibold tabular-nums text-ink">
              {formattedGrandTotal}
            </p>
          </div>
          {step < 3 ? (
            <Button
              type="button"
              variant="primary"
              onClick={
                step === 1 ? handleContinueToPayment : handleContinueToReview
              }
            >
              {step === 1 ? "Next: Payment" : "Next: Review"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={submitting || !termsAccepted}
              onClick={() => void handlePlaceOrder()}
            >
              {submitting
                ? "Submitting..."
                : `Place Order - ${formattedGrandTotal}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
