import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCronAuthorized } from "@/lib/cron-auth";

/**
 * Idempotent cron job: Releases expired, unreleased stock reservations and decrements Product.reservedStock.
 * Safe to run repeatedly; if no expired reservations exist, performs zero changes.
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

  // Find all expired and unreleased reservations
  const expired = await prisma.stockReservation.findMany({
    where: {
      expiresAt: { lt: now },
      released: false,
    },
    select: {
      id: true,
      productId: true,
      quantity: true,
    },
  });

  if (expired.length === 0) {
    return NextResponse.json({
      ok: true,
      releasedCount: 0,
      affectedProducts: 0,
      timestamp: now.toISOString(),
    });
  }

  // Aggregate quantities by product
  const productQuantities = new Map<string, number>();
  for (const res of expired) {
    const current = productQuantities.get(res.productId) ?? 0;
    productQuantities.set(res.productId, current + res.quantity);
  }

  const reservationIds = expired.map((r) => r.id);

  await prisma.$transaction(async (tx) => {
    // 1. Mark reservations as released
    await tx.stockReservation.updateMany({
      where: {
        id: { in: reservationIds },
        released: false,
      },
      data: { released: true },
    });

    // 2. Decrement reserved stock on products
    for (const [productId, qty] of productQuantities.entries()) {
      await tx.product.update({
        where: { id: productId },
        data: {
          reservedStock: { decrement: qty },
        },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    releasedCount: expired.length,
    affectedProducts: productQuantities.size,
    timestamp: now.toISOString(),
  });
}
