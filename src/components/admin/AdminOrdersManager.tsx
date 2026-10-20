"use client";

import * as React from "react";
import Link from "next/link";
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronDown,
  RefreshCw,
  Search,
  Filter,
} from "lucide-react";
import { formatInrFromPaise } from "@/lib/cn";
import { CSRF_HEADER_NAME } from "@/lib/csrf";

export interface AdminOrderRow {
  orderId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalPaise: number;
  createdAt: string;
  customer: {
    fullName: string;
    email: string;
    phone: string;
  };
  shippingAddress: {
    recipientName: string;
    phone: string;
    addressLine: string;
    city: string;
    state: string;
    pinCode: string;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    pricePaise: number;
    lineTotalPaise: number;
  }>;
}

interface Props {
  initialOrders: AdminOrderRow[];
  csrfToken: string;
}

const STATUS_OPTIONS = [
  "PLACED",
  "CONFIRMED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;

export function AdminOrdersManager({ initialOrders, csrfToken }: Props) {
  const [orders, setOrders] = React.useState<AdminOrderRow[]>(initialOrders);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [updatingOrderId, setUpdatingOrderId] = React.useState<string | null>(null);
  const [actionNotice, setActionNotice] = React.useState<string | null>(null);

  const filteredOrders = React.useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        search === "" ||
        o.orderId.toLowerCase().includes(search.toLowerCase()) ||
        o.customer.fullName.toLowerCase().includes(search.toLowerCase()) ||
        o.shippingAddress.city.toLowerCase().includes(search.toLowerCase()) ||
        o.shippingAddress.pinCode.includes(search);

      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    setUpdatingOrderId(orderId);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({
          status: nextStatus,
          note: `Fulfillment status advanced to ${nextStatus} via Ops Portal.`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionNotice(`Failed to update ${orderId}: ${data.error ?? "Server error"}`);
        return;
      }

      setOrders((prev) =>
        prev.map((o) => (o.orderId === orderId ? { ...o, status: nextStatus } : o))
      );
      setActionNotice(`Order ${orderId} status updated to ${nextStatus}.`);
    } catch {
      setActionNotice(`Network error updating order ${orderId}.`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[#DDE1E6] pb-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-[#1D4ED8]" />
            <h2 className="text-lg font-bold text-[#101828]">
              Customer Orders &amp; Delivery Dispatch
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#475467]">
            Review incoming orders, verify COD/Online payments, and advance parcel delivery milestones.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by ID, name, PIN..."
              className="min-h-[36px] w-48 rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#101828] placeholder-[#9CA3AF] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[36px] rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#101828] focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {actionNotice && (
        <div className="mt-4 rounded-[4px] border border-[#15803D] bg-[#DCFCE7] p-3 text-xs font-medium text-[#15803D]">
          {actionNotice}
        </div>
      )}

      {/* Orders Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#DDE1E6] bg-[#F5F6F7] text-[#475467]">
              <th className="px-3.5 py-2.5 font-semibold">Order ID</th>
              <th className="px-3.5 py-2.5 font-semibold">Date</th>
              <th className="px-3.5 py-2.5 font-semibold">Customer &amp; Location</th>
              <th className="px-3.5 py-2.5 font-semibold">Items</th>
              <th className="px-3.5 py-2.5 font-semibold">Payment</th>
              <th className="px-3.5 py-2.5 font-semibold">Total</th>
              <th className="px-3.5 py-2.5 font-semibold">Current Status</th>
              <th className="px-3.5 py-2.5 font-semibold text-right">Update Delivery</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DDE1E6]">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[#475467]">
                  No orders match the selected filters.
                </td>
              </tr>
            ) : (
              filteredOrders.map((o) => (
                <tr key={o.orderId} className="hover:bg-[#F5F6F7]/50">
                  <td className="px-3.5 py-3 font-mono font-bold text-[#101828]">
                    <Link
                      href={`/track?orderId=${encodeURIComponent(o.orderId)}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 hover:text-[#1D4ED8] hover:underline"
                    >
                      <span>{o.orderId}</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="px-3.5 py-3 whitespace-nowrap text-[#475467]">
                    {new Date(o.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3.5 py-3">
                    <p className="font-semibold text-[#101828]">{o.customer.fullName}</p>
                    <p className="text-[#475467]">
                      {o.shippingAddress.city}, {o.shippingAddress.state} ({o.shippingAddress.pinCode})
                    </p>
                  </td>
                  <td className="px-3.5 py-3">
                    <div className="flex flex-col gap-0.5">
                      {o.items.slice(0, 2).map((it, idx) => (
                        <span key={idx} className="text-[#101828]">
                          {it.quantity}x {it.name}
                        </span>
                      ))}
                      {o.items.length > 2 && (
                        <span className="text-[#475467] font-medium">
                          +{o.items.length - 2} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3.5 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-[4px] px-2 py-0.5 text-[11px] font-bold uppercase ${
                        o.paymentMethod === "COD"
                          ? "bg-[#FEF3C7] text-[#92400E]"
                          : "bg-[#DBEAFE] text-[#1D4ED8]"
                      }`}
                    >
                      {o.paymentMethod} ({o.paymentStatus})
                    </span>
                  </td>
                  <td className="px-3.5 py-3 font-mono font-bold text-[#101828]">
                    {formatInrFromPaise(o.totalPaise)}
                  </td>
                  <td className="px-3.5 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-[4px] px-2.5 py-0.5 text-xs font-semibold uppercase ${
                        o.status === "DELIVERED"
                          ? "bg-[#DCFCE7] text-[#15803D]"
                          : o.status === "CANCELLED"
                          ? "bg-[#FEF2F2] text-[#B42318]"
                          : o.status === "SHIPPED" || o.status === "OUT_FOR_DELIVERY"
                          ? "bg-[#DBEAFE] text-[#1D4ED8]"
                          : "bg-[#F5F6F7] text-[#101828]"
                      }`}
                    >
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 text-right whitespace-nowrap">
                    <select
                      disabled={updatingOrderId === o.orderId}
                      value={o.status}
                      onChange={(e) => handleUpdateStatus(o.orderId, e.target.value)}
                      className="min-h-[32px] rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-2 py-1 text-xs font-semibold text-[#101828] hover:border-[#1D4ED8] focus:border-[#1D4ED8] disabled:opacity-50"
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          Mark {st.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
