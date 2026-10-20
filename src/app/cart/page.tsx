"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PhotoSlot } from "@/components/ui/PhotoSlot";
import { useCart } from "@/components/cart/CartProvider";
import { formatInrFromPaise } from "@/lib/cn";
import { brandConfig } from "@/config/brand";

export default function CartPage() {
  const {
    cart,
    authenticated,
    isLoading,
    updateQuantity,
    removeItem,
    clearCart,
    updatePinCode,
  } = useCart();

  const [pinInput, setPinInput] = React.useState(cart?.pinCode ?? "560038");
  const [pinError, setPinError] = React.useState("");
  const [isUpdatingPin, setIsUpdatingPin] = React.useState(false);

  React.useEffect(() => {
    if (cart?.pinCode) {
      setPinInput(cart.pinCode);
    }
  }, [cart?.pinCode]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    const cleaned = pinInput.trim();
    if (!/^[1-9]\d{5}$/.test(cleaned)) {
      setPinError("Enter a valid 6-digit Indian PIN code.");
      return;
    }
    setIsUpdatingPin(true);
    const res = await updatePinCode(cleaned);
    setIsUpdatingPin(false);
    if (!res.ok) {
      setPinError(
        res.error ?? "This PIN code is not currently serviceable."
      );
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="font-mono text-xs text-ink-muted">
          Loading your server-verified cart...
        </p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <Card surface="sand" padding="lg">
          <p className="font-mono text-xs tracking-wider text-ink-muted uppercase">
            Verified Customer Cart
          </p>
          <h1 className="mt-1.5 font-sans text-2xl font-normal text-ink sm:text-3xl">
            Sign in to view your cart &amp; GST breakdown
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            To protect workshop inventory and calculate accurate PIN-zone
            shipping and GST splits, shopping carts require a verified customer
            account.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login?returnTo=/cart">
              <Button variant="primary" size="lg">
                Sign in to your account
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="secondary" size="lg">
                Create a verified account
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const lines = cart?.lines ?? [];
  const totals = cart?.totals;
  const warnings = cart?.warnings ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-28 sm:px-6 sm:pt-10 lg:px-8 lg:pb-16">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-stone pb-5">
        <div>
          <Link
            href="/catalogue"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            <ArrowLeft
              className="h-3.5 w-3.5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>Continue browsing catalogue</span>
          </Link>
          <h1 className="mt-2 font-sans text-2xl font-normal tracking-tight text-ink sm:text-3xl">
            Your Shopping Cart ({totals?.totalQuantity ?? 0}{" "}
            {totals?.totalQuantity === 1 ? "piece" : "pieces"})
          </h1>
        </div>

        {lines.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void clearCart()}
          >
            Clear entire cart
          </Button>
        ) : null}
      </div>

      {/* Explicit Warnings Banner */}
      {warnings.length > 0 ? (
        <div
          role="alert"
          className="mb-6 rounded-card border border-amber/60 bg-amber/10 p-4 text-sm text-ink"
        >
          <div className="flex items-center gap-2 font-semibold text-amber">
            <AlertTriangle
              className="h-4 w-4 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>Important updates to items in your cart</span>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink">
            {warnings.map((w, idx) => (
              <li key={`${w.code}-${w.productId}-${idx}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {lines.length === 0 || !totals ? (
        <Card surface="sand" padding="lg" className="max-w-xl">
          <h2 className="font-sans text-xl font-normal text-ink">
            Your cart is currently empty
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Explore stoneware, handloom table linen, and cast brass pieces.
            Orders at or above{" "}
            {formatInrFromPaise(brandConfig.freeShippingThresholdPaise)}{" "}
            (post-tax subtotal) qualify for free delivery across all serviceable
            Indian PIN codes.
          </p>
          <div className="mt-5">
            <Link href="/catalogue">
              <Button variant="primary">Browse Studio Catalogue</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Cart Lines */}
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="divide-y divide-stone rounded-card border border-stone bg-paper">
              {lines.map((line) => (
                <div key={line.itemId} className="p-4 sm:p-5">
                  <div className="flex gap-4">
                    <div className="h-24 w-20 shrink-0 overflow-hidden border border-stone bg-sand">
                      <PhotoSlot
                        url={line.primaryImage?.url}
                        aspectRatio={line.primaryImage?.aspectRatio ?? "4:5"}
                        altText={line.name}
                        className="h-full w-full"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-[11px] text-ink-muted uppercase">
                            {line.category} · HSN {line.hsnCode}
                          </p>
                          <Link
                            href={`/catalogue/${line.slug}`}
                            className="mt-0.5 block font-sans text-lg font-normal text-ink hover:text-clay-text"
                          >
                            {line.name}
                          </Link>
                        </div>

                        <div className="text-right">
                          <p className="font-sans text-lg font-semibold text-ink tabular-nums">
                            {formatInrFromPaise(
                              line.taxBreakdown.lineTotalPaise
                            )}
                          </p>
                          <p className="font-mono text-[11px] text-ink-muted tabular-nums">
                            {formatInrFromPaise(line.currentUnitPricePaise)} ×{" "}
                            {line.effectiveQuantity}
                          </p>
                        </div>
                      </div>

                      {/* Line-level Tax & HSN Summary */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-muted">
                        <span>
                          Taxable:{" "}
                          {formatInrFromPaise(
                            line.taxBreakdown.taxableAmountPaise
                          )}
                        </span>
                        <span>Rate: {line.taxBreakdown.taxRatePercent}% GST</span>
                        {totals.isIntraState ? (
                          <span>
                            CGST:{" "}
                            {formatInrFromPaise(line.taxBreakdown.cgstPaise)} +
                            SGST:{" "}
                            {formatInrFromPaise(line.taxBreakdown.sgstPaise)}
                          </span>
                        ) : (
                          <span>
                            IGST:{" "}
                            {formatInrFromPaise(line.taxBreakdown.igstPaise)}
                          </span>
                        )}
                      </div>

                      {line.warnings.length > 0 ? (
                        <div className="mt-2 rounded-control border border-amber/40 bg-amber/10 px-2.5 py-1.5 text-xs text-amber">
                          {line.warnings.map((w) => w.message).join(" ")}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        {line.isActive && line.isPurchasable ? (
                          <div className="inline-flex items-center rounded-control border border-stone bg-sand">
                            <button
                              type="button"
                              onClick={() =>
                                void updateQuantity(
                                  line.productId,
                                  line.effectiveQuantity - 1
                                )
                              }
                              aria-label={`Decrease quantity of ${line.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center text-ink hover:bg-paper"
                            >
                              <Minus
                                className="h-3.5 w-3.5"
                                strokeWidth={1.75}
                                aria-hidden="true"
                              />
                            </button>
                            <span className="min-w-[36px] text-center font-mono text-xs font-medium text-ink tabular-nums">
                              {line.effectiveQuantity}
                            </span>
                            <button
                              type="button"
                              disabled={
                                line.effectiveQuantity >=
                                line.maxAllowedQuantity
                              }
                              onClick={() =>
                                void updateQuantity(
                                  line.productId,
                                  line.effectiveQuantity + 1
                                )
                              }
                              aria-label={`Increase quantity of ${line.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center text-ink hover:bg-paper disabled:opacity-40"
                            >
                              <Plus
                                className="h-3.5 w-3.5"
                                strokeWidth={1.75}
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        ) : (
                          <span className="rounded-control border border-brick/40 bg-brick/10 px-2.5 py-1 font-mono text-xs text-brick">
                            {line.isActive
                              ? "Out of stock - remove to checkout"
                              : "Archived from catalogue - remove to checkout"}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => void removeItem(line.productId)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-brick"
                        >
                          <Trash2
                            className="h-3.5 w-3.5"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: PIN Code & Server-Computed GST Summary */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="sticky top-24 space-y-5">
              {/* PIN Code & Delivery Zone Estimator */}
              <Card surface="sand" padding="md">
                <form onSubmit={handlePinSubmit}>
                  <label
                    htmlFor="cart-page-pin-input"
                    className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-ink uppercase"
                  >
                    <MapPin
                      className="h-4 w-4 text-clay"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span>Delivery PIN Code</span>
                  </label>
                  <p className="mt-1 text-xs text-ink-muted">
                    Calculates PIN-zone shipping and intra-state (CGST + SGST)
                    vs. inter-state (IGST) tax split.
                  </p>

                  <div className="mt-3 flex gap-2">
                    <input
                      id="cart-page-pin-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={pinInput}
                      onChange={(e) =>
                        setPinInput(
                          e.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                      placeholder="Enter 6-digit PIN"
                      className="min-h-[40px] flex-1 rounded-control border border-stone bg-paper px-3 font-mono text-sm text-ink focus:border-clay focus:outline-none"
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      isLoading={isUpdatingPin}
                      loadingText="Checking..."
                    >
                      Calculate
                    </Button>
                  </div>

                  {pinError ? (
                    <p
                      role="alert"
                      className="mt-2 text-xs font-medium text-brick"
                    >
                      {pinError}
                    </p>
                  ) : cart?.pinServiceability ? (
                    <div className="mt-3 rounded-control border border-stone bg-paper p-3 text-xs">
                      <p className="font-medium text-ink">
                        Delivering to {cart.pinServiceability.city},{" "}
                        {cart.pinServiceability.state} (
                        {cart.pinServiceability.pinCode})
                      </p>
                      {cart.deliveryEstimate ? (
                        <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-moss">
                          <Truck
                            className="h-3.5 w-3.5 shrink-0"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span>
                            Estimated arrival:{" "}
                            {cart.deliveryEstimate.formattedDeliveryWindow}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </form>
              </Card>

              {/* Server-Computed Tax & Totals Summary */}
              <Card surface="paper" padding="lg">
                <h2 className="font-sans text-lg font-normal text-ink">
                  Order &amp; GST Summary
                </h2>

                <dl className="mt-4 space-y-2.5 text-xs text-ink-muted">
                  <div className="flex items-center justify-between">
                    <dt>Taxable merchandise value (pre-tax)</dt>
                    <dd className="font-mono text-ink tabular-nums">
                      {formatInrFromPaise(totals.taxableSubtotalPaise)}
                    </dd>
                  </div>

                  {totals.isIntraState ? (
                    <>
                      <div className="flex items-center justify-between">
                        <dt>
                          CGST (Intra-state {totals.deliveryStateCode})
                        </dt>
                        <dd className="font-mono text-ink tabular-nums">
                          {formatInrFromPaise(totals.cgstTotalPaise)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>
                          SGST (Intra-state {totals.deliveryStateCode})
                        </dt>
                        <dd className="font-mono text-ink tabular-nums">
                          {formatInrFromPaise(totals.sgstTotalPaise)}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <dt>
                        IGST (Inter-state {totals.sellerStateCode} to{" "}
                        {totals.deliveryStateCode})
                      </dt>
                      <dd className="font-mono text-ink tabular-nums">
                        {formatInrFromPaise(totals.igstTotalPaise)}
                      </dd>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-stone/70 pt-2">
                    <dt className="font-medium text-ink">
                      Post-tax merchandise subtotal
                    </dt>
                    <dd className="font-mono font-medium text-ink tabular-nums">
                      {formatInrFromPaise(totals.subtotalPaise)}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between">
                    <dt>
                      PIN-zone shipping (
                      {totals.isFreeShippingApplied
                        ? "Free at/above Rs 999 post-tax"
                        : cart?.pinServiceability?.zoneCode ?? "Standard"}
                      )
                    </dt>
                    <dd className="font-mono text-ink tabular-nums">
                      {totals.shippingPaise === 0
                        ? "Free"
                        : formatInrFromPaise(totals.shippingPaise)}
                    </dd>
                  </div>

                  {!totals.isFreeShippingApplied &&
                  totals.amountRemainingForFreeShippingPaise > 0 ? (
                    <p className="rounded-control bg-sand px-2.5 py-1.5 font-mono text-[11px] text-ink-muted">
                      Add{" "}
                      {formatInrFromPaise(
                        totals.amountRemainingForFreeShippingPaise
                      )}{" "}
                      more (post-tax subtotal) for free delivery.
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between border-t border-stone pt-3 text-base font-semibold text-ink">
                    <dt>Grand Total</dt>
                    <dd className="font-sans text-xl tabular-nums">
                      {formatInrFromPaise(totals.grandTotalPaise)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5">
                  <Link
                    href={cart?.hasBlockingIssues ? "/cart" : "/checkout"}
                  >
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      disabled={Boolean(cart?.hasBlockingIssues)}
                    >
                      Proceed to Checkout
                    </Button>
                  </Link>
                </div>

                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-muted">
                  <ShieldCheck
                    className="h-3.5 w-3.5 shrink-0 text-moss"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>
                    All prices and GST splits are verified server-side in integer
                    paise.
                  </span>
                </p>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Summary Bar on Mobile */}
      {lines.length > 0 && totals ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone bg-paper px-4 py-3 lg:hidden">
          <div className="mx-auto flex max-w-content items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] text-ink-muted">
                Grand Total ({totals.totalQuantity}{" "}
                {totals.totalQuantity === 1 ? "item" : "items"})
              </p>
              <p className="font-sans text-lg font-semibold text-ink tabular-nums">
                {formatInrFromPaise(totals.grandTotalPaise)}
              </p>
            </div>
            <Link href={cart?.hasBlockingIssues ? "/cart" : "/checkout"}>
              <Button
                variant="primary"
                size="md"
                disabled={Boolean(cart?.hasBlockingIssues)}
              >
                Checkout
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
