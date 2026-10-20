import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ShieldCheck,
  Clock,
  FileSpreadsheet,
  Package,
  Truck,
  IndianRupee,
  ShoppingBag,
  AlertCircle,
} from "lucide-react";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { createSignedCsrfToken } from "@/lib/csrf";
import { prisma } from "@/lib/db";
import { AdminLogoutActions } from "@/components/admin/AdminLogoutActions";
import { AdminOrdersManager, AdminOrderRow } from "@/components/admin/AdminOrdersManager";
import { formatInrFromPaise } from "@/lib/cn";
import { brandConfig } from "@/config/brand";

/**
 * Operations Admin Portal Home.
 *
 * Security Note: Never relies on proxy/middleware alone (CVE-2025-29927 defense).
 * Explicitly verifies the Redis session, `role === "ADMIN"`, and `totpVerified === true`
 * on the server before rendering any data.
 */
export default async function AdminPortalPage() {
  const adminCtx = await getCurrentAdminSession({ allowPendingTotp: false });
  if (
    !adminCtx ||
    adminCtx.session.role !== "ADMIN" ||
    !adminCtx.session.totpVerified
  ) {
    redirect(`${brandConfig.adminPortalPath}/login`);
  }

  const [orders, totalProducts, activeProducts, auditEntries] =
    await Promise.all([
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
          items: true,
        },
      }),
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
    ]);

  const totalRevenuePaise = orders.reduce((sum, o) => sum + o.totalPaise, 0);
  const pendingShipments = orders.filter((o) =>
    ["PLACED", "CONFIRMED", "ASSIGNED_TO_DEALER"].includes(o.status)
  ).length;

  const csrfToken = createSignedCsrfToken();

  const formattedOrders: AdminOrderRow[] = orders.map((o) => {
    const address = (o.addressSnapshot as any) ?? {};
    return {
      orderId: o.orderId,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      totalPaise: o.totalPaise,
      createdAt: o.createdAt.toISOString(),
      customer: {
        fullName: o.user.fullName,
        email: o.user.email,
        phone: o.user.phone,
      },
      shippingAddress: {
        recipientName: address.recipientName ?? o.user.fullName,
        phone: address.phone ?? o.user.phone,
        addressLine: address.addressLine ?? address.addressLine1 ?? "",
        city: address.city ?? "",
        state: address.state ?? "",
        pinCode: address.pinCode ?? "",
      },
      items: o.items.map((item) => ({
        id: item.id,
        name: item.nameAtPurchase,
        quantity: item.quantity,
        pricePaise: item.priceAtPurchasePaise,
        lineTotalPaise: item.lineTotalPaise,
      })),
    };
  });

  return (
    <div className="min-h-screen bg-[#F5F6F7] px-4 py-8 text-[#101828] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1280px]">
        {/* Top Header Card */}
        <div className="flex flex-col justify-between gap-4 rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-5 shadow-sm sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[#475467]">
              <ShieldCheck className="h-4 w-4 text-[#15803D]" />
              <span>2FA Verified Administrator Session</span>
              <span>·</span>
              <Clock className="h-3.5 w-3.5" />
              <span>30-minute idle timeout active</span>
            </div>
            <h1 className="mt-1 text-xl font-bold text-[#101828]">
              {brandConfig.name} Operations &amp; Dealer Dispatch Portal
            </h1>
            <p className="text-xs text-[#475467]">
              Signed in as {adminCtx.session.fullName} ({adminCtx.session.email})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={`${brandConfig.adminPortalPath}/products`}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[4px] bg-[#1D4ED8] px-3.5 py-1.5 text-xs font-semibold text-[#FFFFFF] hover:bg-[#1E40AF]"
            >
              <Package className="h-3.5 w-3.5" />
              <span>Manage Products ({totalProducts})</span>
            </Link>
            <AdminLogoutActions />
          </div>
        </div>

        {/* Operational KPI Cards */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-[#475467]">Total Revenue</span>
              <IndianRupee className="h-4 w-4 text-[#15803D]" />
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-[#101828]">
              {formatInrFromPaise(totalRevenuePaise)}
            </p>
            <p className="mt-1 text-[11px] text-[#475467]">Across all customer checkouts</p>
          </div>

          <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-[#475467]">Total Orders</span>
              <ShoppingBag className="h-4 w-4 text-[#1D4ED8]" />
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-[#101828]">
              {orders.length}
            </p>
            <p className="mt-1 text-[11px] text-[#475467]">Logged in store database</p>
          </div>

          <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-[#475467]">Pending Dispatch</span>
              <Truck className="h-4 w-4 text-[#C2410C]" />
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-[#101828]">
              {pendingShipments}
            </p>
            <p className="mt-1 text-[11px] text-[#475467]">Awaiting carrier pickup</p>
          </div>

          <div className="rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-[#475467]">Active Catalogue</span>
              <Package className="h-4 w-4 text-[#0F2742]" />
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-[#101828]">
              {activeProducts} <span className="text-xs font-normal text-[#475467]">/ {totalProducts}</span>
            </p>
            <p className="mt-1 text-[11px] text-[#475467]">Live studio items listed</p>
          </div>
        </div>

        {/* Live Orders Manager */}
        <section className="mt-6">
          <AdminOrdersManager initialOrders={formattedOrders} csrfToken={csrfToken} />
        </section>

        {/* Dense table-driven Audit Log view */}
        <section
          aria-labelledby="audit-log-heading"
          className="mt-6 rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-[#DDE1E6] px-5 py-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#475467]" />
              <h2
                id="audit-log-heading"
                className="text-sm font-bold text-[#101828]"
              >
                Recent Security &amp; Operations Audit Log
              </h2>
            </div>
            <Link
              href={`${brandConfig.adminPortalPath}/products`}
              className="text-xs font-medium text-[#1D4ED8] hover:underline"
            >
              Open Product &amp; Stock Table
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#DDE1E6] bg-[#F5F6F7] text-[#475467]">
                  <th className="px-4 py-2.5 font-semibold">Timestamp (UTC)</th>
                  <th className="px-4 py-2.5 font-semibold">Actor Role</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="px-4 py-2.5 font-semibold">Target</th>
                  <th className="px-4 py-2.5 font-semibold">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE1E6]">
                {auditEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-[#475467]"
                    >
                      No audit events recorded in database yet.
                    </td>
                  </tr>
                ) : (
                  auditEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[#F5F6F7]/60">
                      <td className="px-4 py-2.5 font-mono text-[#475467]">
                        {entry.createdAt.toISOString()}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[#101828]">
                        {entry.actorRole}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[#101828]">
                        {entry.action}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[#475467]">
                        {entry.targetType}:{entry.targetId.slice(0, 12)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[#475467]">
                        {entry.ipAddress ?? "local"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
