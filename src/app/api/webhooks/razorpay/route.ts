import { NextResponse } from "next/server";
import { processRazorpayWebhook } from "@/lib/orders/service";

/**
 * POST /api/webhooks/razorpay
 * Server-to-server Razorpay webhook endpoint (exempt from browser CSRF, authenticated via
 * raw-body HMAC-SHA256 signature verification using `crypto.timingSafeEqual`).
 *
 * Returns:
 * - 200 for verified events, duplicate events, and ignored out-of-order events
 * - 400 for invalid HMAC signatures or amount/currency mismatches
 * - 404 if the referenced order does not exist
 * - 500 on transient infrastructure errors so Razorpay retries
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("x-razorpay-signature");
    const eventIdHeader = request.headers.get("x-razorpay-event-id");

    const result = await processRazorpayWebhook({
      rawBody,
      signatureHeader,
      eventIdHeader,
    });

    return NextResponse.json(
      {
        ok: result.httpStatus >= 200 && result.httpStatus < 300,
        code: result.code,
        orderId: result.orderId,
        refundId: result.refundId,
        message: result.message,
      },
      { status: result.httpStatus }
    );
  } catch (error) {
    console.error("[Razorpay Webhook Error]", error);
    return NextResponse.json(
      {
        ok: false,
        code: "WEBHOOK_TRANSIENT_ERROR",
        message: "Internal server error processing webhook.",
      },
      { status: 500 }
    );
  }
}
