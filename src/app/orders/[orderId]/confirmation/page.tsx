"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  MapPin,
  Package,
  RefreshCw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPaiseToInr } from "@/lib/pricing/gst";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";
import type { OrderSnapshotDetail } from "@/lib/orders/service";

function readCsrfCookieFromDocument(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

export default function OrderConfirmationPage() {
  const params = useParams<{ orderId: string }>();
  const orderIdParam = typeof params.orderId === "string" ? params.orderId : "";

  const [order, setOrder] = useState<OrderSnapshotDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<boolean>(false);

  // COD OTP state
  const [otpCode, setOtpCode] = useState<string>("");
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);
  const [resendingOtp, setResendingOtp] = useState<boolean>(false);
  const [otpFeedback, setOtpFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState<number>(0);

  // Dev Razorpay Webhook Simulator state
  const [simulatingWebhook, setSimulatingWebhook] = useState<boolean>(false);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderIdParam) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(orderIdParam)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as {
        ok: boolean;
        order?: OrderSnapshotDetail;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.order) {
        setErrorMessage(data.error ?? "Order not found.");
        setLoading(false);
        return;
      }

      setOrder(data.order);
      if (data.order.codOtpResendAvailableAt) {
        const remaining = Math.max(
          0,
          Math.ceil(
            (new Date(data.order.codOtpResendAvailableAt).getTime() -
              Date.now()) /
              1000
          )
        );
        setResendCooldownSeconds(remaining);
      }
    } catch {
      setErrorMessage("Unable to load order confirmation details.");
    } finally {
      setLoading(false);
    }
  }, [orderIdParam]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    if (resendCooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setResendCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldownSeconds]);

  const handleCopyOrderId = async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.orderId);
      setCopiedOrderId(true);
      setTimeout(() => setCopiedOrderId(false), 2500);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleVerifyCodOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || verifyingOtp) return;

    setVerifyingOtp(true);
    setOtpFeedback(null);
    try {
      const csrfToken = readCsrfCookieFromDocument();
      const res = await fetch(
        `/api/orders/${encodeURIComponent(order.orderId)}/cod-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [CSRF_HEADER_NAME]: csrfToken,
          },
          body: JSON.stringify({ otpCode: otpCode.trim() }),
        }
      );
      const data = (await res.json()) as {
        ok: boolean;
        order?: OrderSnapshotDetail;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setOtpFeedback({
          type: "error",
          text:
            data.error ??
            "Verification failed. Check your 6-digit code and try again.",
        });
        await fetchOrder();
        return;
      }

      if (data.order) {
        setOrder(data.order);
      }
      setOtpFeedback({
        type: "success",
        text: "Cash on Delivery verified. Your order is now confirmed for studio dispatch.",
      });
    } catch {
      setOtpFeedback({
        type: "error",
        text: "Network error while verifying your code.",
      });
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendCodOtp = async () => {
    if (!order || resendingOtp || resendCooldownSeconds > 0) return;
    setResendingOtp(true);
    setOtpFeedback(null);

    try {
      const csrfToken = readCsrfCookieFromDocument();
      const res = await fetch(
        `/api/orders/${encodeURIComponent(order.orderId)}/cod-otp`,
        {
          method: "PUT",
          headers: {
            [CSRF_HEADER_NAME]: csrfToken,
          },
        }
      );
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
        retryAfterSeconds?: number;
      };

      if (!res.ok || !data.ok) {
        if (typeof data.retryAfterSeconds === "number") {
          setResendCooldownSeconds(data.retryAfterSeconds);
        }
        setOtpFeedback({
          type: "error",
          text: data.error ?? "Unable to resend verification code right now.",
        });
        return;
      }

      setResendCooldownSeconds(60);
      setOtpFeedback({
        type: "success",
        text:
          data.message ??
          "A new 6-digit verification code has been sent to your email and mobile number.",
      });
      await fetchOrder();
    } catch {
      setOtpFeedback({
        type: "error",
        text: "Network error while resending code.",
      });
    } finally {
      setResendingOtp(false);
    }
  };

  const handleSimulateRazorpayWebhook = async (
    event: "payment.captured" | "payment.failed"
  ) => {
    if (!order || simulatingWebhook) return;
    setSimulatingWebhook(true);
    setWebhookMessage(null);
    try {
      const res = await fetch("/api/dev/razorpay-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.orderId,
          event,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
      };
      setWebhookMessage(
        data.message ?? `Simulated Razorpay ${event} webhook processed.`
      );
      await fetchOrder();
    } catch {
      setWebhookMessage("Failed to trigger simulated Razorpay webhook.");
    } finally {
      setSimulatingWebhook(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="h-40 animate-pulse rounded-[8px] border border-border bg-surface-alt" />
        <div className="mt-6 h-80 animate-pulse rounded-[8px] border border-border bg-surface-alt" />
      </div>
    );
  }

  if (errorMessage || !order) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-16 sm:px-6">
        <div className="rounded-[8px] border border-border bg-surface-alt p-8">
          <h1 className="font-sans text-2xl font-semibold text-ink">
            Order Confirmation Unavailable
          </h1>
          <p className="mt-2 text-sm text-muted">
            {errorMessage ?? "We could not locate that order."}
          </p>
          <div className="mt-6">
            <Link href="/catalogue">
              <Button variant="primary">Return to Catalogue</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isConfirmed = order.status === "CONFIRMED";
  const isCancelled = order.status === "CANCELLED";
  const isPendingCod =
    order.paymentMethod === "COD" && order.status === "PENDING_CONFIRMATION";
  const isPendingRazorpay =
    order.paymentMethod === "RAZORPAY" &&
    order.paymentStatus === "PENDING" &&
    order.status === "PLACED";

  return (
    <div className="mx-auto max-w-[960px] px-4 py-10 sm:px-6 lg:px-8">
      {/* Top Banner Card with Large Order ID + Copy Button */}
      <section className="rounded-[8px] border border-border bg-surface-alt p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted">
              {isConfirmed ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Order Confirmed
                </>
              ) : isCancelled ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-danger" />
                  Order Cancelled
                </>
              ) : (
                <>
                  <Clock className="h-4 w-4 text-warning" />
                  Action Required to Confirm Order
                </>
              )}
            </div>

            <h1 className="mt-2 font-sans text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {order.orderId}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Placed on {order.createdAt.slice(0, 10)} | Status:{" "}
              <span className="font-semibold text-ink">{order.status}</span> |
              Payment:{" "}
              <span className="font-semibold text-ink">
                {order.paymentMethod} ({order.paymentStatus})
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleCopyOrderId()}
            >
              {copiedOrderId ? (
                <>
                  <Check className="mr-1.5 h-4 w-4 text-success" />
                  Copied Order ID
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copy Order ID
                </>
              )}
            </Button>

            <Link href={`/orders/${encodeURIComponent(order.orderId)}`}>
              <Button variant="primary">Track Order</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* COD One-Time Verification Box (Shown when PENDING_CONFIRMATION) */}
      {isPendingCod && (
        <section
          aria-labelledby="cod-otp-heading"
          className="mt-6 rounded-[8px] border-2 border-accent bg-surface p-6"
        >
          <div className="flex items-start gap-3">
            <KeyRound className="mt-1 h-5 w-5 shrink-0 text-accent" />
            <div className="flex-1">
              <h2
                id="cod-otp-heading"
                className="font-sans text-xl font-semibold text-ink"
              >
                Verify Your Cash on Delivery Order
              </h2>
              <p className="mt-1 text-sm text-muted">
                Enter the 6-digit verification code sent to your email and{" "}
                <span className="font-mono text-ink">
                  +91 {order.shippingPhone}
                </span>{" "}
                within 10 minutes. Unconfirmed COD orders automatically release
                their reserved stock after 10 minutes.
              </p>

              {otpFeedback && (
                <div
                  role="alert"
                  className={`mt-4 rounded-[4px] border p-3 text-xs font-medium ${
                    otpFeedback.type === "success"
                      ? "border-success bg-success/10 text-success"
                      : "border-danger bg-danger/10 text-danger"
                  }`}
                >
                  {otpFeedback.text}
                </div>
              )}

              <form
                onSubmit={(e) => void handleVerifyCodOtp(e)}
                className="mt-4 flex flex-wrap items-center gap-3"
              >
                <label htmlFor="cod-otp-input" className="sr-only">
                  6-Digit COD Verification Code
                </label>
                <input
                  id="cod-otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  className="w-40 rounded-[4px] border border-border bg-surface-alt px-4 py-2.5 font-mono text-lg tracking-widest text-ink focus:border-accent focus:outline-none"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={verifyingOtp || otpCode.length !== 6}
                >
                  {verifyingOtp ? "Verifying..." : "Confirm COD Order"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={resendingOtp || resendCooldownSeconds > 0}
                  onClick={() => void handleResendCodOtp()}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {resendCooldownSeconds > 0
                    ? `Resend in ${resendCooldownSeconds}s`
                    : "Resend Code"}
                </Button>
              </form>

              <p className="mt-3 text-xs text-muted">
                Attempts used: {order.codOtpAttempts} of 5 | Expires at:{" "}
                {order.codOtpExpiresAt
                  ? new Date(order.codOtpExpiresAt).toLocaleTimeString("en-IN")
                  : "10 minutes"}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Local Development Razorpay Webhook Simulator (Shown when PLACED + PENDING) */}
      {isPendingRazorpay && (
        <section className="mt-6 rounded-[8px] border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                Waiting for Razorpay Webhook Confirmation
              </p>
              <h2 className="mt-1 font-sans text-lg font-semibold text-ink">
                Stock is reserved for 15 minutes
              </h2>
              <p className="mt-1 text-xs text-muted">
                Orders transition to PAID and CONFIRMED strictly from a
                signature-verified Razorpay webhook. In local development, use
                the buttons on the right to fire a signed webhook payload.
              </p>
              {webhookMessage && (
                <p className="mt-2 text-xs font-medium text-ink">
                  {webhookMessage}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button
                type="button"
                variant="primary"
                disabled={simulatingWebhook}
                onClick={() =>
                  void handleSimulateRazorpayWebhook("payment.captured")
                }
              >
                Simulate payment.captured
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={simulatingWebhook}
                onClick={() =>
                  void handleSimulateRazorpayWebhook("payment.failed")
                }
              >
                Simulate payment.failed
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Delivery Estimate & Shipping Address */}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section className="rounded-[8px] border border-border bg-surface-alt p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Truck className="h-4 w-4 text-accent" />
            Predicted Delivery Window
          </div>
          <p className="mt-3 font-sans text-xl font-semibold text-ink">
            {order.estimatedDeliveryMin && order.estimatedDeliveryMax
              ? `${order.estimatedDeliveryMin} to ${order.estimatedDeliveryMax}`
              : "5 to 8 business days"}
          </p>
          {order.estimatedDispatchBy && (
            <p className="mt-1 text-xs text-muted">
              Estimated workshop dispatch by{" "}
              <span className="font-mono text-ink">
                {order.estimatedDispatchBy}
              </span>{" "}
              (Asia/Kolkata business calendar)
            </p>
          )}
        </section>

        <section className="rounded-[8px] border border-border bg-surface-alt p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <MapPin className="h-4 w-4 text-accent" />
            Delivery Address Snapshot
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">
            {order.shippingRecipientName}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {order.shippingAddressLine1}
          </p>
          {order.shippingAddressLine2 && (
            <p className="text-xs text-muted">{order.shippingAddressLine2}</p>
          )}
          <p className="text-xs text-muted">
            {order.shippingCity}, {order.shippingState} -{" "}
            <span className="font-mono text-ink">{order.shippingPinCode}</span>
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            Phone: +91 {order.shippingPhone}
          </p>
        </section>
      </div>

      {/* Order Items & Immutable Tax Snapshot */}
      <section className="mt-6 rounded-[8px] border border-border bg-surface-alt p-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-accent" />
            <h2 className="font-sans text-xl font-semibold text-ink">
              Order Items & GST Snapshot
            </h2>
          </div>
          <span className="text-xs text-muted">
            Prices & HSN tax slabs locked at purchase
          </span>
        </div>

        <div className="mt-4 divide-y divide-border">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
              <div>
                <p className="font-medium text-ink">{item.productName}</p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  SKU: {item.sku} | HSN: {item.hsnCode} | GST{" "}
                  {item.taxSlabPercent}%
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Qty {item.quantity} x {formatPaiseToInr(item.unitPricePaise)}{" "}
                  (Taxable: {formatPaiseToInr(item.taxableAmountPaise)})
                </p>
              </div>
              <div className="text-right font-mono tabular-nums">
                <p className="text-sm font-semibold text-ink">
                  {formatPaiseToInr(item.lineTotalPaise)}
                </p>
                <p className="text-xs text-muted">
                  {order.isIntraState
                    ? `CGST ${formatPaiseToInr(
                        item.cgstPaise
                      )} + SGST ${formatPaiseToInr(item.sgstPaise)}`
                    : `IGST ${formatPaiseToInr(item.igstPaise)}`}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* HSN Tax Breakdown Table */}
        <div className="mt-6 border-t border-border pt-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <ShieldCheck className="h-4 w-4 text-accent" />
            HSN Tax Summary (
            {order.isIntraState
              ? `Intra-state ${order.sellerState} CGST + SGST`
              : `Inter-state ${order.sellerState} to ${order.shippingState} IGST`}
            )
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="pb-2 font-medium">HSN Code</th>
                  <th className="pb-2 font-medium">GST Slab</th>
                  <th className="pb-2 text-right font-medium">Taxable Value</th>
                  {order.isIntraState ? (
                    <>
                      <th className="pb-2 text-right font-medium">CGST</th>
                      <th className="pb-2 text-right font-medium">SGST</th>
                    </>
                  ) : (
                    <th className="pb-2 text-right font-medium">IGST</th>
                  )}
                  <th className="pb-2 text-right font-medium">Total Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono tabular-nums">
                {order.hsnSummary.map((row) => (
                  <tr key={`${row.hsnCode}-${row.taxSlabPercent}`}>
                    <td className="py-2 text-ink">{row.hsnCode}</td>
                    <td className="py-2 text-muted">{row.taxSlabPercent}%</td>
                    <td className="py-2 text-right text-ink">
                      {formatPaiseToInr(row.taxablePaise)}
                    </td>
                    {order.isIntraState ? (
                      <>
                        <td className="py-2 text-right text-muted">
                          {formatPaiseToInr(row.cgstPaise)}
                        </td>
                        <td className="py-2 text-right text-muted">
                          {formatPaiseToInr(row.sgstPaise)}
                        </td>
                      </>
                    ) : (
                      <td className="py-2 text-right text-muted">
                        {formatPaiseToInr(row.igstPaise)}
                      </td>
                    )}
                    <td className="py-2 text-right font-semibold text-ink">
                      {formatPaiseToInr(row.totalTaxPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals Footer */}
        <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Taxable Subtotal (Excl. GST)</dt>
            <dd className="font-mono tabular-nums text-ink">
              {formatPaiseToInr(order.taxableSubtotalPaise)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Total GST</dt>
            <dd className="font-mono tabular-nums text-ink">
              {formatPaiseToInr(order.taxTotalPaise)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Shipping</dt>
            <dd className="font-mono tabular-nums text-ink">
              {order.shippingPaise === 0
                ? "Free"
                : formatPaiseToInr(order.shippingPaise)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-ink">
            <dt>Grand Total</dt>
            <dd className="font-mono tabular-nums">
              {formatPaiseToInr(order.grandTotalPaise)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
