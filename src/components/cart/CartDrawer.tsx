"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  MapPin,
  Minus,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { PhotoSlot } from "@/components/ui/PhotoSlot";
import { useCart } from "@/components/cart/CartProvider";
import { formatInrFromPaise } from "@/lib/cn";
import { brandConfig } from "@/config/brand";

export function CartDrawer() {
  const {
    cart,
    authenticated,
    isCartOpen,
    setIsCartOpen,
    updateQuantity,
    removeItem,
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

  const lines = cart?.lines ?? [];
  const totals = cart?.totals;
  const warnings = cart?.warnings ?? [];

  return (
    <Drawer
      isOpen={isCartOpen}
      onClose={() => setIsCartOpen(false)}
      title={`Your Cart (${totals?.totalQuantity ?? 0})`}
      position="right"
      footer={
        lines.length > 0 && totals ? (
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5 text-xs text-ink-muted">
              <div className="flex items-center justify-between">
                <span>Taxable merchandise value</span>
                <span className="font-mono tabular-nums">
                  {formatInrFromPaise(totals.taxableSubtotalPaise)}
                </span>
              </div>
              {totals.isIntraState ? (
                <>
                  <div className="flex items-center justify-between">
                    <span>
                      CGST (Intra-state {totals.deliveryStateCode})
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatInrFromPaise(totals.cgstTotalPaise)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>
                      SGST (Intra-state {totals.deliveryStateCode})
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatInrFromPaise(totals.sgstTotalPaise)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span>
                    IGST (Inter-state {totals.sellerStateCode} to{" "}
                    {totals.deliveryStateCode})
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatInrFromPaise(totals.igstTotalPaise)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span>
                  Shipping (
                  {totals.isFreeShippingApplied
                    ? `Free at/above ${formatInrFromPaise(
                        totals.freeShippingThresholdPaise
                      )} post-tax`
                    : cart?.pinServiceability
                      ? `${cart.pinServiceability.city}`
                      : "Select PIN"}
                  )
                </span>
                <span className="font-mono tabular-nums">
                  {totals.shippingPaise === 0
                    ? "Free"
                    : formatInrFromPaise(totals.shippingPaise)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-stone pt-2 text-sm font-semibold text-ink">
                <span>Grand Total (GST Inclusive)</span>
                <span className="font-sans text-base tabular-nums">
                  {formatInrFromPaise(totals.grandTotalPaise)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <Link href="/cart" onClick={() => setIsCartOpen(false)}>
                <Button variant="secondary" fullWidth>
                  View Full Cart
                </Button>
              </Link>
              <Link
                href={cart?.hasBlockingIssues ? "/cart" : "/checkout"}
                onClick={() => setIsCartOpen(false)}
              >
                <Button
                  variant="primary"
                  fullWidth
                  disabled={Boolean(cart?.hasBlockingIssues)}
                >
                  Checkout
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>Free delivery at or above {formatInrFromPaise(brandConfig.freeShippingThresholdPaise)} (post-tax subtotal)</span>
            </div>
            <Link href="/catalogue" onClick={() => setIsCartOpen(false)}>
              <Button variant="primary" fullWidth>
                Browse in-stock goods
              </Button>
            </Link>
          </div>
        )
      }
    >
      {!authenticated ? (
        <div className="flex flex-col items-start justify-center py-8 text-left">
          <p className="font-sans text-lg text-ink">
            Sign in to use your verified cart
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Cart items, PIN-code shipping rates, and GST invoices are saved to
            your verified customer account.
          </p>
          <div className="mt-5 flex w-full gap-3">
            <Link
              href="/login?returnTo=/cart"
              onClick={() => setIsCartOpen(false)}
              className="flex-1"
            >
              <Button variant="primary" fullWidth>
                Sign in
              </Button>
            </Link>
            <Link
              href="/register"
              onClick={() => setIsCartOpen(false)}
              className="flex-1"
            >
              <Button variant="secondary" fullWidth>
                Register
              </Button>
            </Link>
          </div>
        </div>
      ) : lines.length === 0 ? (
        <div className="flex flex-col items-start justify-center py-8 text-left">
          <p className="font-sans text-lg text-ink">
            Your cart is currently empty.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Add stoneware, table linen, or cast brass utility pieces to view
            itemised GST slabs, PIN-code shipping fees, and your predicted
            delivery window.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Explicit Warnings Banner */}
          {warnings.length > 0 ? (
            <div
              role="alert"
              className="rounded-card border border-amber/50 bg-amber/10 p-3 text-xs text-ink"
            >
              <div className="flex items-center gap-1.5 font-semibold text-amber">
                <AlertTriangle
                  className="h-4 w-4 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>Cart stock or price update</span>
              </div>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-ink">
                {warnings.map((w, idx) => (
                  <li key={`${w.code}-${w.productId}-${idx}`}>{w.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* PIN Code Input for Shipping & GST Split */}
          <form
            onSubmit={handlePinSubmit}
            className="rounded-card border border-stone bg-sand p-3"
          >
            <label
              htmlFor="drawer-pin-input"
              className="flex items-center gap-1.5 text-xs font-medium text-ink"
            >
              <MapPin
                className="h-3.5 w-3.5 text-clay"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>Delivery PIN code (computes GST split &amp; shipping)</span>
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="drawer-pin-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) =>
                  setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="6-digit PIN"
                className="min-h-[38px] flex-1 rounded-control border border-stone bg-paper px-3 font-mono text-xs text-ink focus:border-clay focus:outline-none"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                isLoading={isUpdatingPin}
                loadingText="..."
              >
                Apply
              </Button>
            </div>
            {pinError ? (
              <p role="alert" className="mt-1.5 text-xs font-medium text-brick">
                {pinError}
              </p>
            ) : cart?.pinServiceability ? (
              <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
                <Truck
                  className="h-3.5 w-3.5 text-moss"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>
                  {cart.pinServiceability.city}, {cart.pinServiceability.state} (
                  {cart.pinServiceability.stateCode}) ·{" "}
                  {cart.deliveryEstimate?.formattedDeliveryWindow ??
                    `${cart.pinServiceability.transitDays}d transit`}
                </span>
              </p>
            ) : null}
          </form>

          {/* Line Items */}
          <ul className="divide-y divide-stone">
            {lines.map((line) => (
              <li key={line.itemId} className="py-3.5">
                <div className="flex gap-3">
                  <div className="h-20 w-16 shrink-0 overflow-hidden border border-stone bg-sand">
                    <PhotoSlot
                      url={line.primaryImage?.url}
                      aspectRatio={line.primaryImage?.aspectRatio ?? "4:5"}
                      altText={line.name}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/catalogue/${line.slug}`}
                        onClick={() => setIsCartOpen(false)}
                        className="text-sm font-medium text-ink hover:text-clay-text"
                      >
                        {line.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void removeItem(line.productId)}
                        aria-label={`Remove ${line.name} from cart`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-control text-ink-muted hover:bg-sand hover:text-brick"
                      >
                        <Trash2
                          className="h-3.5 w-3.5"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      </button>
                    </div>

                    <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                      {formatInrFromPaise(line.currentUnitPricePaise)} each ·{" "}
                      {line.taxBreakdown.taxRatePercent}% GST · HSN{" "}
                      {line.hsnCode}
                    </p>

                    <div className="mt-2.5 flex items-center justify-between">
                      {line.isActive && line.isPurchasable ? (
                        <div className="inline-flex items-center rounded-control border border-stone bg-paper">
                          <button
                            type="button"
                            onClick={() =>
                              void updateQuantity(
                                line.productId,
                                line.effectiveQuantity - 1
                              )
                            }
                            aria-label={`Decrease quantity of ${line.name}`}
                            className="inline-flex h-7 w-7 items-center justify-center text-ink hover:bg-sand"
                          >
                            <Minus
                              className="h-3 w-3"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          </button>
                          <span className="min-w-[28px] text-center font-mono text-xs text-ink tabular-nums">
                            {line.effectiveQuantity}
                          </span>
                          <button
                            type="button"
                            disabled={
                              line.effectiveQuantity >= line.maxAllowedQuantity
                            }
                            onClick={() =>
                              void updateQuantity(
                                line.productId,
                                line.effectiveQuantity + 1
                              )
                            }
                            aria-label={`Increase quantity of ${line.name}`}
                            className="inline-flex h-7 w-7 items-center justify-center text-ink hover:bg-sand disabled:opacity-40"
                          >
                            <Plus
                              className="h-3 w-3"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      ) : (
                        <span className="rounded-control border border-brick/40 bg-brick/10 px-2 py-0.5 font-mono text-[11px] text-brick">
                          {line.isActive ? "Sold out" : "Archived"}
                        </span>
                      )}

                      <span className="font-sans text-sm font-semibold text-ink tabular-nums">
                        {formatInrFromPaise(line.taxBreakdown.lineTotalPaise)}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Drawer>
  );
}
