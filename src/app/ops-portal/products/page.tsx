import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, ArrowLeft, Package } from "lucide-react";
import { getCurrentAdminSession } from "@/lib/auth/session";
import {
  listAdminProducts,
  listSuppliersForAdmin,
} from "@/lib/catalogue/service";
import { AdminLogoutActions } from "@/components/admin/AdminLogoutActions";
import { AdminProductsClient } from "@/components/admin/AdminProductsClient";
import { brandConfig } from "@/config/brand";

/**
 * Operations Admin Portal: Product & Supplier Stock Management.
 * Enforces full server-side session + ADMIN role + TOTP verification check.
 */
export default async function AdminProductsPage() {
  const adminCtx = await getCurrentAdminSession({ allowPendingTotp: false });
  if (
    !adminCtx ||
    adminCtx.session.role !== "ADMIN" ||
    !adminCtx.session.totpVerified
  ) {
    redirect(`${brandConfig.adminPortalPath}/login`);
  }

  const [products, suppliers] = await Promise.all([
    listAdminProducts(),
    listSuppliersForAdmin(),
  ]);

  return (
    <div className="min-h-[84vh] bg-[#F4F4F5] px-4 py-8 text-[#18181B] sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 rounded-card border border-[#E4E4E7] bg-white p-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#52525B]">
              <Link
                href={brandConfig.adminPortalPath}
                className="inline-flex items-center gap-1 font-medium text-[#18181B] hover:text-clay"
              >
                <ArrowLeft
                  className="h-3.5 w-3.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>Operations Home</span>
              </Link>
              <span>·</span>
              <ShieldCheck
                className="h-4 w-4 text-moss"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>2FA Verified Administrator</span>
            </div>
            <h1 className="mt-1 flex items-center gap-2 font-sans text-xl font-semibold text-[#18181B]">
              <Package
                className="h-5 w-5 text-[#18181B]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>Catalogue &amp; Supplier Stock Management</span>
            </h1>
            <p className="text-xs text-[#52525B]">
              Soft-delete only (`is_active: false`). All creates, edits,
              archives, and restores are logged to `audit_logs`.
            </p>
          </div>

          <AdminLogoutActions />
        </div>

        <AdminProductsClient
          initialProducts={products}
          suppliers={suppliers}
        />
      </div>
    </div>
  );
}
