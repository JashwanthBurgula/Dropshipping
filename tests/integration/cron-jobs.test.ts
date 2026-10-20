import { describe, expect, it, beforeAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { POST as postReleaseReservations } from "../../src/app/api/cron/release-reservations/route";
import { POST as postCancelCodOrders } from "../../src/app/api/cron/cancel-cod-orders/route";
import { POST as postPurgeOtpTokens } from "../../src/app/api/cron/purge-otp-tokens/route";
import { POST as postPurgeSearchLogs } from "../../src/app/api/cron/purge-search-logs/route";

const VALID_CRON_SECRET =
  process.env.CRON_SECRET ??
  "f4d3a2b1c0e9876543210fedcba9876543210abcdef0123456789abcdef01234";

function makeCronRequest(secret?: string): Request {
  const headers = new Headers();
  if (secret) {
    headers.set("Authorization", `Bearer ${secret}`);
  }
  return new Request("http://localhost:3000/api/cron/test", {
    method: "POST",
    headers,
  });
}

describe("Stage 1.7: Cron Jobs Protection and Idempotency Tests", () => {
  beforeAll(async () => {
    process.env.CRON_SECRET = VALID_CRON_SECRET;
  });

  it("CRON_SECRET Guard: rejects unauthorized requests with 401 across all cron endpoints", async () => {
    const unauthReq = makeCronRequest();
    const wrongSecretReq = makeCronRequest("wrong-secret-12345678");

    const endpoints = [
      postReleaseReservations,
      postCancelCodOrders,
      postPurgeOtpTokens,
      postPurgeSearchLogs,
    ];

    for (const endpoint of endpoints) {
      const resMissing = await endpoint(unauthReq);
      expect(resMissing.status).toBe(401);

      const resWrong = await endpoint(wrongSecretReq);
      expect(resWrong.status).toBe(401);
    }
  });

  it("release-reservations: releases expired stock reservations and decrements Product.reservedStock idempotently", async () => {
    // 1. Get or create a product to test reservation release
    const product = await prisma.product.findFirst({
      where: { isActive: true },
    });
    expect(product).toBeDefined();
    if (!product) return;

    const initialReservedStock = product.reservedStock;
    const initialAvailableStock = product.supplierStock - initialReservedStock;

    // Create an expired reservation
    const testOrderId = `ORD_CRON_${Date.now()}`;
    const user = await prisma.user.findFirst();
    expect(user).toBeDefined();
    if (!user) return;

    // First ensure an order exists to link the reservation
    const testOrder = await prisma.order.create({
      data: {
        orderId: testOrderId,
        userId: user.id,
        subtotalPaise: product.pricePaise,
        taxPaise: 0,
        shippingPaise: 0,
        totalPaise: product.pricePaise,
        paymentMethod: "COD",
        paymentStatus: "PENDING_CONFIRMATION",
        status: "PLACED",
        addressSnapshot: { line: "Cron Test Address", pinCode: "560001" },
        estimatedDelivery: new Date(),
        deliveryOtpHash: "dummy_delivery_otp_hash",
        trackingTokenHash: `dummy_tracking_token_${Date.now()}`,
      },
    });

    const reservationQty = 2;
    await prisma.stockReservation.create({
      data: {
        orderId: testOrder.orderId,
        productId: product.id,
        userId: user.id,
        quantity: reservationQty,
        expiresAt: new Date(Date.now() - 5 * 60 * 1000), // expired 5 minutes ago
        released: false,
      },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { reservedStock: { increment: reservationQty } },
    });

    // Run 1: Should release reservation
    const run1Res = await postReleaseReservations(makeCronRequest(VALID_CRON_SECRET));
    expect(run1Res.status).toBe(200);
    const run1Body = await run1Res.json();
    expect(run1Body.ok).toBe(true);
    expect(run1Body.releasedCount).toBeGreaterThanOrEqual(1);

    const updatedProduct = await prisma.product.findUnique({
      where: { id: product.id },
    });
    expect(updatedProduct?.reservedStock).toBe(initialReservedStock);

    // Run 2 (Idempotency): Running again produces 0 new releases
    const run2Res = await postReleaseReservations(makeCronRequest(VALID_CRON_SECRET));
    expect(run2Res.status).toBe(200);
    const run2Body = await run2Res.json();
    expect(run2Body.ok).toBe(true);
    expect(run2Body.releasedCount).toBe(0);
  });

  it("cancel-cod-orders: auto-cancels unconfirmed COD orders older than 10 minutes idempotently", async () => {
    const user = await prisma.user.findFirst();
    if (!user) return;

    const testOrderId = `ORD_EXP_${Date.now()}`;
    const past15Min = new Date(Date.now() - 15 * 60 * 1000);

    await prisma.order.create({
      data: {
        orderId: testOrderId,
        userId: user.id,
        subtotalPaise: 100000,
        taxPaise: 0,
        shippingPaise: 0,
        totalPaise: 100000,
        paymentMethod: "COD",
        paymentStatus: "PENDING_CONFIRMATION",
        status: "PLACED",
        confirmedAt: null,
        createdAt: past15Min,
        addressSnapshot: { line: "Cron Test", pinCode: "560001" },
        estimatedDelivery: new Date(),
        deliveryOtpHash: "dummy_hash",
        trackingTokenHash: `cron_track_${Date.now()}`,
      },
    });

    // Run 1: Cancels the order
    const run1Res = await postCancelCodOrders(makeCronRequest(VALID_CRON_SECRET));
    expect(run1Res.status).toBe(200);
    const run1Body = await run1Res.json();
    expect(run1Body.ok).toBe(true);
    expect(run1Body.cancelledCount).toBeGreaterThanOrEqual(1);

    const checkOrder = await prisma.order.findUnique({
      where: { orderId: testOrderId },
    });
    expect(checkOrder?.status).toBe("CANCELLED");
    expect(checkOrder?.cancelledAt).toBeDefined();

    // Run 2 (Idempotency): Second run produces 0 cancellations
    const run2Res = await postCancelCodOrders(makeCronRequest(VALID_CRON_SECRET));
    expect(run2Res.status).toBe(200);
    const run2Body = await run2Res.json();
    expect(run2Body.ok).toBe(true);
    expect(run2Body.cancelledCount).toBe(0);
  });

  it("purge-otp-tokens: purges used tokens and expired tokens older than 24h idempotently", async () => {
    const user = await prisma.user.findFirst();
    if (!user) return;

    const now = new Date();
    // 1. Used token
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: `used_tok_${Date.now()}`,
        purpose: "EMAIL_VERIFICATION",
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        usedAt: now,
      },
    });

    // 2. Old expired token (> 24 hours ago)
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: `old_expired_tok_${Date.now()}`,
        purpose: "EMAIL_VERIFICATION",
        expiresAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        usedAt: null,
      },
    });

    // Run 1: Purges them
    const run1Res = await postPurgeOtpTokens(makeCronRequest(VALID_CRON_SECRET));
    expect(run1Res.status).toBe(200);
    const run1Body = await run1Res.json();
    expect(run1Body.ok).toBe(true);
    expect(run1Body.purgedCount).toBeGreaterThanOrEqual(2);

    // Run 2 (Idempotency): Second run produces 0 purges
    const run2Res = await postPurgeOtpTokens(makeCronRequest(VALID_CRON_SECRET));
    expect(run2Res.status).toBe(200);
    const run2Body = await run2Res.json();
    expect(run2Body.ok).toBe(true);
    expect(run2Body.purgedCount).toBe(0);
  });

  it("purge-search-logs: purges search query logs older than 30 days idempotently", async () => {
    const past40Days = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    await prisma.searchQueryLog.create({
      data: {
        queryDate: "2026-09-01",
        normalizedQuery: `old_query_${Date.now()}`.slice(0, 50),
        searchCount: 5,
        resultCount: 2,
        createdAt: past40Days,
      },
    });

    // Run 1: Purges
    const run1Res = await postPurgeSearchLogs(makeCronRequest(VALID_CRON_SECRET));
    expect(run1Res.status).toBe(200);
    const run1Body = await run1Res.json();
    expect(run1Body.ok).toBe(true);
    expect(run1Body.purgedCount).toBeGreaterThanOrEqual(1);

    // Run 2 (Idempotency): Second run produces 0 purges
    const run2Res = await postPurgeSearchLogs(makeCronRequest(VALID_CRON_SECRET));
    expect(run2Res.status).toBe(200);
    const run2Body = await run2Res.json();
    expect(run2Body.ok).toBe(true);
    expect(run2Body.purgedCount).toBe(0);
  });
});
