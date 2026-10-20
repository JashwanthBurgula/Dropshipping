import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/orders
 * Returns all orders with customer details, items, address snapshot, and status.
 */
export async function GET() {
  const adminCtx = await getCurrentAdminSession();
  if (!adminCtx || adminCtx.session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden. Verified administrator session required." },
      { status: 403 }
    );
  }

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
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
      events: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  const formatted = orders.map((o) => {
    const address = (o.addressSnapshot as any) ?? {};
    return {
      orderId: o.orderId,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      totalPaise: o.totalPaise,
      subtotalPaise: o.subtotalPaise,
      taxPaise: o.taxPaise,
      shippingPaise: o.shippingPaise,
      estimatedDelivery: o.estimatedDelivery ? o.estimatedDelivery.toISOString() : null,
      createdAt: o.createdAt.toISOString(),
      customer: {
        id: o.user.id,
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
        productId: item.productId,
        name: item.nameAtPurchase,
        sku: item.skuAtPurchase,
        quantity: item.quantity,
        pricePaise: item.priceAtPurchasePaise,
        lineTotalPaise: item.lineTotalPaise,
      })),
      events: o.events.map((ev) => ({
        id: ev.id,
        status: ev.status,
        note: ev.note,
        changedBy: ev.changedBy,
        createdAt: ev.createdAt.toISOString(),
      })),
    };
  });

  return NextResponse.json(
    {
      ok: true,
      orders: formatted,
    },
    { status: 200 }
  );
}
