import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signRazorpayWebhookPayload } from "@/lib/payments/provider";
import { processRazorpayWebhook } from "@/lib/orders/service";

/**
 * POST /api/dev/razorpay-webhook
 * Development-only webhook simulator that constructs a realistic Razorpay webhook payload,
 * signs its raw body with `RAZORPAY_WEBHOOK_SECRET`, and invokes `processRazorpayWebhook`.
 *
 * Strictly returns 404 unless `NODE_ENV === "development"` (or `"test"`).
 */
export async function POST(request: Request) {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.NODE_ENV !== "test"
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    orderId?: string;
    event?: "payment.captured" | "order.paid" | "payment.failed";
    eventId?: string;
    amountPaiseOverride?: number;
  } | null;

  if (!body?.orderId) {
    return NextResponse.json(
      { ok: false, error: "orderId is required." },
      { status: 400 }
    );
  }

  const order = await prisma.order.findUnique({
    where: { orderId: body.orderId.trim() },
    include: { payments: true },
  });
  if (!order) {
    return NextResponse.json(
      { ok: false, error: "Order not found." },
      { status: 404 }
    );
  }

  const eventType = body.event ?? "payment.captured";
  const eventId =
    body.eventId ?? `evt_dev_${crypto.randomBytes(8).toString("hex")}`;
  const paymentId = `pay_dev_${crypto.randomBytes(7).toString("hex")}`;
  const amountPaise =
    typeof body.amountPaiseOverride === "number"
      ? body.amountPaiseOverride
      : order.totalPaise;

  const snap =
    order.addressSnapshot &&
    typeof order.addressSnapshot === "object" &&
    !Array.isArray(order.addressSnapshot)
      ? (order.addressSnapshot as Record<string, unknown>)
      : {};
  const rzpOrderId =
    (typeof snap.razorpayOrderId === "string" ? snap.razorpayOrderId : null) ??
    order.payments[0]?.providerOrderId ??
    `order_dev_${order.orderId}`;

  const webhookPayload = {
    entity: "event",
    account_id: "acc_dev_local",
    event: eventType,
    contains: ["payment", "order"],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: "payment",
          amount: amountPaise,
          currency: "INR",
          status: eventType === "payment.failed" ? "failed" : "captured",
          order_id: rzpOrderId,
          notes: {
            orderId: order.orderId,
          },
          error_description:
            eventType === "payment.failed"
              ? "Simulated bank decline in local dev mode"
              : null,
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };

  const rawBody = JSON.stringify(webhookPayload);
  const signatureHeader = signRazorpayWebhookPayload(rawBody);

  const result = await processRazorpayWebhook({
    rawBody,
    signatureHeader,
    eventIdHeader: eventId,
  });

  return NextResponse.json(
    {
      ok: result.httpStatus >= 200 && result.httpStatus < 300,
      simulatedEventId: eventId,
      simulatedPaymentId: paymentId,
      code: result.code,
      orderId: result.orderId,
      refundId: result.refundId,
      message: result.message,
    },
    { status: result.httpStatus }
  );
}
