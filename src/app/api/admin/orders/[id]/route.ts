import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { validateRequestCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/db";
import { OrderStatus } from "@prisma/client";

/**
 * PATCH /api/admin/orders/[id]
 * Allows an authenticated admin to update the order's fulfillment status.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const adminCtx = await getCurrentAdminSession();
  if (!adminCtx || adminCtx.session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden. Verified administrator session required." },
      { status: 403 }
    );
  }

  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { error: "Invalid CSRF token." },
      { status: 403 }
    );
  }

  const { id: orderId } = await context.params;

  try {
    const body = await request.json();
    const nextStatus = body.status as OrderStatus;
    const note = (body.note as string) ?? `Status updated to ${nextStatus}`;

    if (!Object.values(OrderStatus).includes(nextStatus)) {
      return NextResponse.json(
        { error: "Invalid order status value." },
        { status: 400 }
      );
    }

    const existing = await prisma.order.findUnique({
      where: { orderId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Order not found." },
        { status: 404 }
      );
    }

    // Update order status and append OrderEvent + AuditLog in transaction
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { orderId },
        data: {
          status: nextStatus,
          ...(nextStatus === OrderStatus.CONFIRMED && !existing.confirmedAt
            ? { confirmedAt: new Date() }
            : {}),
          ...(nextStatus === OrderStatus.CANCELLED && !existing.cancelledAt
            ? { cancelledAt: new Date(), cancellationReason: note }
            : {}),
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId,
          status: nextStatus,
          note,
          changedBy: adminCtx.session.email,
          actorRole: "ADMIN",
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminCtx.session.userId,
          actorRole: "ADMIN",
          action: "ORDER_STATUS_UPDATE",
          targetType: "ORDER",
          targetId: orderId,
          metadata: {
            previousStatus: existing.status,
            newStatus: nextStatus,
            note,
          },
        },
      });

      return order;
    });

    return NextResponse.json(
      {
        ok: true,
        order: {
          orderId: updated.orderId,
          status: updated.status,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update order status." },
      { status: 500 }
    );
  }
}
