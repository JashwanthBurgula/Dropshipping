import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCronAuthorized } from "@/lib/cron-auth";

const COD_EXPIRY_MINUTES = 10;

/**
 * Idempotent cron job: Auto-cancels unconfirmed COD orders older than 10 minutes,
 * releases their stock reservations, and logs the audit event.
 * Safe to run repeatedly; only targets unconfirmed PLACED COD orders older than 10 minutes.
 */
export async function POST(request: Request) {
  const auth = assertCronAuthorized(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status ?? 401 }
    );
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - COD_EXPIRY_MINUTES * 60 * 1000);

  const expiredCodOrders = await prisma.order.findMany({
    where: {
      paymentMethod: "COD",
      status: "PLACED",
      confirmedAt: null,
      createdAt: { lt: cutoff },
    },
    include: {
      stockReservations: {
        where: { released: false },
      },
    },
  });

  if (expiredCodOrders.length === 0) {
    return NextResponse.json({
      ok: true,
      cancelledCount: 0,
      timestamp: now.toISOString(),
    });
  }

  let cancelledCount = 0;

  for (const order of expiredCodOrders) {
    await prisma.$transaction(async (tx) => {
      // 1. Mark order CANCELLED
      await tx.order.update({
        where: { orderId: order.orderId },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancellationReason: "Auto-cancelled: COD OTP verification expired after 10 minutes",
        },
      });

      // 2. Release any unreleased stock reservations for this order
      if (order.stockReservations.length > 0) {
        await tx.stockReservation.updateMany({
          where: {
            orderId: order.orderId,
            released: false,
          },
          data: { released: true },
        });

        for (const res of order.stockReservations) {
          await tx.product.update({
            where: { id: res.productId },
            data: {
              reservedStock: { decrement: res.quantity },
            },
          });
        }
      }

      // 3. Record order event
      await tx.orderEvent.create({
        data: {
          orderId: order.orderId,
          status: "CANCELLED",
          note: "Auto-cancelled: COD verification timed out after 10 minutes",
          changedBy: "cron:cancel-cod-orders",
          actorRole: "SYSTEM",
        },
      });
    });

    cancelledCount++;
  }

  return NextResponse.json({
    ok: true,
    cancelledCount,
    timestamp: now.toISOString(),
  });
}
