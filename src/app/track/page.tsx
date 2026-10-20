"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Package,
  Search,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ArrowRight,
  ShieldCheck,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { formatInrFromPaise } from "@/lib/cn";
import { PhotoSlot } from "@/components/catalogue/PhotoSlot";

interface TrackedOrderItem {
  productId: string;
  name: string;
  quantity: number;
  pricePaise: number;
  lineTotalPaise: number;
  imageUrl?: string | null;
}

interface TrackedOrder {
  orderId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  shippingRecipientName: string;
  shippingCity: string;
  shippingState: string;
  shippingPinCode: string;
  grandTotalPaise: number;
  estimatedDeliveryMin?: string | null;
  estimatedDeliveryMax?: string | null;
  createdAt: string;
  items: TrackedOrderItem[];
}

const ORDER_STEPS = [
  { key: "PLACED", label: "Order Placed", desc: "Received at studio" },
  { key: "CONFIRMED", label: "Confirmed", desc: "Verified & queued for dispatch" },
  { key: "SHIPPED", label: "Dispatched", desc: "Handed over to carrier" },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery", desc: "With local courier partner" },
  { key: "DELIVERED", label: "Delivered", desc: "Received safely" },
];

function getStepProgress(status: string): number {
  switch (status) {
    case "PLACED":
      return 0;
    case "CONFIRMED":
    case "ASSIGNED_TO_DEALER":
    case "AWAITING_DEALER_CONFIRMATION":
      return 1;
    case "SHIPPED":
      return 2;
    case "OUT_FOR_DELIVERY":
      return 3;
    case "DELIVERED":
      return 4;
    default:
      return 0;
  }
}

export default function TrackOrderPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-[#F5F6F7] p-8 text-center text-sm text-[#475467]">Loading tracker...</div>}>
      <TrackOrderContent />
    </React.Suspense>
  );
}

function TrackOrderContent() {
  const searchParams = useSearchParams();
  const initialOrderId = searchParams.get("orderId") ?? "";

  const [searchInput, setSearchInput] = React.useState(initialOrderId);
  const [order, setOrder] = React.useState<TrackedOrder | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [recentOrders, setRecentOrders] = React.useState<TrackedOrder[]>([]);

  // Fetch recent orders if user is authenticated
  React.useEffect(() => {
    async function loadRecentOrders() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const meData = await res.json();
        if (meData?.authenticated && meData.user?.orders?.length > 0) {
          setRecentOrders(meData.user.orders);
        }
      } catch {
        // Ignore unauthenticated visitor
      }
    }
    void loadRecentOrders();
  }, []);

  const fetchOrderDetails = React.useCallback(async (orderIdToSearch: string) => {
    const id = orderIdToSearch.trim();
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok || !data.ok || !data.order) {
        if (res.status === 401) {
          setError("Please sign in to track this order, or check the order confirmation link sent to your email.");
        } else {
          setError(data.error ?? "Order not found. Please verify your order ID.");
        }
        setOrder(null);
        return;
      }
      setOrder({
        orderId: data.order.orderId,
        status: data.order.status,
        paymentMethod: data.order.paymentMethod,
        paymentStatus: data.order.paymentStatus,
        shippingRecipientName: data.order.shippingRecipientName,
        shippingCity: data.order.shippingCity,
        shippingState: data.order.shippingState,
        shippingPinCode: data.order.shippingPinCode,
        grandTotalPaise: data.order.grandTotalPaise,
        estimatedDeliveryMin: data.order.estimatedDeliveryMin,
        estimatedDeliveryMax: data.order.estimatedDeliveryMax,
        createdAt: data.order.createdAt,
        items: data.order.items.map((i: any) => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          pricePaise: i.pricePaise,
          lineTotalPaise: i.lineTotalPaise,
          imageUrl: i.imageUrl,
        })),
      });
    } catch {
      setError("Network error while searching for order. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (initialOrderId) {
      void fetchOrderDetails(initialOrderId);
    }
  }, [initialOrderId, fetchOrderDetails]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      void fetchOrderDetails(searchInput);
    }
  };

  const activeStep = order ? getStepProgress(order.status) : 0;
  const isCancelled = order?.status === "CANCELLED" || order?.status === "DELIVERY_FAILED";

  return (
    <div className="min-h-screen bg-[#F5F6F7] py-8 sm:py-12">
      <div className="mx-auto max-w-[1024px] px-4 sm:px-6 lg:px-8">
        {/* Header Breadcrumbs */}
        <div className="mb-6 flex items-center gap-2 text-xs text-[#475467]">
          <Link href="/" className="hover:text-[#101828]">Home</Link>
          <span>/</span>
          <span className="font-semibold text-[#101828]">Track Order</span>
        </div>

        {/* Title & Search Box */}
        <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[4px] bg-[#1D4ED8]/10 text-[#1D4ED8]">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#101828] sm:text-2xl">
                Track your shipment
              </h1>
              <p className="mt-0.5 text-xs text-[#475467] sm:text-sm">
                Enter your order ID (found in your order receipt email) for live dispatch and delivery updates.
              </p>
            </div>
          </div>

          <form onSubmit={handleSearchSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="e.g. ord_..."
                className="min-h-[44px] w-full rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3.5 py-2 font-mono text-sm text-[#101828] placeholder-[#9CA3AF] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !searchInput.trim()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[4px] bg-[#1D4ED8] px-6 py-2 text-sm font-semibold text-[#FFFFFF] hover:bg-[#1E40AF] disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              {loading ? "Locating..." : "Track Order"}
            </button>
          </form>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-[4px] border border-[#B42318] bg-[#FEF2F2] p-3 text-xs text-[#B42318]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Active Tracking Result */}
        {order && (
          <div className="mt-8 rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE1E6] pb-4">
              <div>
                <span className="text-xs uppercase text-[#475467]">Shipment Reference</span>
                <p className="font-mono text-base font-bold text-[#101828]">{order.orderId}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-[#475467]">Ordered On</span>
                <p className="text-sm font-medium text-[#101828]">
                  {new Date(order.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div>
                <span className="text-xs uppercase text-[#475467]">Delivery Destination</span>
                <p className="text-sm font-medium text-[#101828]">
                  {order.shippingCity}, {order.shippingState} - {order.shippingPinCode}
                </p>
              </div>
              <div>
                <span className="text-xs uppercase text-[#475467]">Status</span>
                <span className={`inline-flex rounded-[4px] px-2.5 py-0.5 text-xs font-bold uppercase ${
                  order.status === "DELIVERED"
                    ? "bg-[#DCFCE7] text-[#15803D]"
                    : order.status === "CANCELLED"
                    ? "bg-[#FEF2F2] text-[#B42318]"
                    : "bg-[#DBEAFE] text-[#1D4ED8]"
                }`}>
                  {order.status.replace(/_/g, " ")}
                </span>
              </div>
            </div>

            {/* Visual Progress Stepper */}
            <div className="my-8">
              {isCancelled ? (
                <div className="rounded-[4px] border border-[#B42318] bg-[#FEF2F2] p-4 text-center">
                  <p className="text-sm font-semibold text-[#B42318]">
                    This order has been cancelled or could not be delivered.
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                    {ORDER_STEPS.map((step, idx) => {
                      const isComplete = idx <= activeStep;
                      const isCurrent = idx === activeStep;
                      return (
                        <div key={step.key} className="flex flex-col items-center text-center">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-[4px] border text-xs font-bold transition-colors ${
                              isComplete
                                ? "border-[#15803D] bg-[#15803D] text-[#FFFFFF]"
                                : isCurrent
                                ? "border-[#1D4ED8] bg-[#1D4ED8] text-[#FFFFFF]"
                                : "border-[#DDE1E6] bg-[#F5F6F7] text-[#475467]"
                            }`}
                          >
                            {isComplete ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                          </div>
                          <p className={`mt-2 text-xs font-bold ${isComplete ? "text-[#101828]" : "text-[#475467]"}`}>
                            {step.label}
                          </p>
                          <p className="text-[11px] text-[#475467]">{step.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Order Items & Summary */}
            <div className="border-t border-[#DDE1E6] pt-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#101828]">
                Items in this parcel ({order.items.length})
              </h2>
              <div className="mt-4 divide-y divide-[#DDE1E6]">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF]">
                        {item.imageUrl ? (
                          <PhotoSlot url={item.imageUrl} altText={item.name} aspectRatio="1:1" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[#F5F6F7]">
                            <Package className="h-5 w-5 text-[#475467]" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#101828]">{item.name}</p>
                        <p className="text-xs text-[#475467]">
                          Qty: {item.quantity} · {formatInrFromPaise(item.pricePaise)} each
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-sm font-bold text-[#101828]">
                      {formatInrFromPaise(item.lineTotalPaise)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#DDE1E6] pt-4">
                <span className="text-sm text-[#475467]">
                  Payment Method: <strong className="text-[#101828]">{order.paymentMethod}</strong> ({order.paymentStatus})
                </span>
                <span className="text-base font-bold text-[#101828]">
                  Total: {formatInrFromPaise(order.grandTotalPaise)}
                </span>
              </div>

              <div className="mt-6 flex justify-end">
                <Link
                  href={`/orders/${order.orderId}/confirmation`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-4 py-2 text-sm font-semibold text-[#101828] hover:bg-[#F5F6F7]"
                >
                  <span>View Tax Invoice & Receipt</span>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Recent Orders quick links if signed in */}
        {recentOrders.length > 0 && !order && (
          <div className="mt-8 rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#101828]">
              Your Recent Orders
            </h2>
            <div className="mt-4 divide-y divide-[#DDE1E6]">
              {recentOrders.map((rec) => (
                <div key={rec.orderId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#101828]">{rec.orderId}</span>
                    <p className="text-xs text-[#475467]">
                      {new Date(rec.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })} · {rec.items.length} items
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput(rec.orderId);
                      void fetchOrderDetails(rec.orderId);
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-[4px] bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-[#FFFFFF] hover:bg-[#1E40AF]"
                  >
                    Track Shipment
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
