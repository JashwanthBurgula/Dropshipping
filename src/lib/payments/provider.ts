import crypto from "node:crypto";

export interface CreatePaymentInput {
  orderId: string;
  amountPaise: number;
  currency: "INR";
  customerId: string;
  customerEmail: string;
  customerPhone: string;
}

export interface CreatePaymentResult {
  provider: "RAZORPAY";
  providerOrderId: string;
  amountPaise: number;
  currency: "INR";
  keyId: string;
}

export interface VerifiedWebhookEvent {
  validSignature: boolean;
  providerEventId: string;
  eventType: "payment.captured" | "order.paid" | "payment.failed" | "unknown";
  orderId: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amountPaise: number | null;
  currency: string | null;
  failureReason: string | null;
  rawPayload: Record<string, unknown>;
}

export interface RefundPaymentInput {
  orderId: string;
  providerPaymentId: string;
  amountPaise: number;
  reason: string;
}

export interface RefundPaymentResult {
  providerRefundId: string;
  providerPaymentId: string;
  amountPaise: number;
  status: "PROCESSED" | "PENDING";
  createdAt: string;
}

/**
 * PaymentProvider interface as required by the architecture blueprint.
 * Razorpay is the single launch gateway; PayPal and Apple Pay can be added later as adapters.
 */
export interface PaymentProvider {
  readonly name: "RAZORPAY" | "PAYPAL" | "APPLE_PAY";
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyWebhook(params: {
    rawBody: string;
    signatureHeader: string | null;
    eventIdHeader?: string | null;
  }): Promise<VerifiedWebhookEvent>;
  refund(input: RefundPaymentInput): Promise<RefundPaymentResult>;
}

const DEFAULT_DEV_WEBHOOK_SECRET = "whsec_dev_local_secret_123456";
const DEFAULT_DEV_KEY_ID = "rzp_test_local_dev_key";

const recordedRefundsForTests: Array<
  RefundPaymentResult & { orderId: string; reason: string }
> = [];

export function getRazorpayWebhookSecret(): string {
  return process.env.RAZORPAY_WEBHOOK_SECRET || DEFAULT_DEV_WEBHOOK_SECRET;
}

export function getRazorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID || DEFAULT_DEV_KEY_ID;
}

export function signRazorpayWebhookPayload(
  rawBody: string,
  secret: string = getRazorpayWebhookSecret()
): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyRazorpayHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string = getRazorpayWebhookSecret()
): boolean {
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return false;
  }
  const cleanHeader = signatureHeader.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHeader)) {
    return false;
  }
  const expectedHex = signRazorpayWebhookPayload(rawBody, secret);
  const actualBuf = Buffer.from(cleanHeader, "hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export class RazorpayPaymentProvider implements PaymentProvider {
  public readonly name = "RAZORPAY" as const;

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (
      !Number.isSafeInteger(input.amountPaise) ||
      input.amountPaise <= 0 ||
      input.currency !== "INR"
    ) {
      throw new Error(
        "createPayment requires a positive integer amountPaise in INR."
      );
    }

    const digest = crypto
      .createHash("sha256")
      .update(`${input.orderId}:${input.amountPaise}:${Date.now()}`)
      .digest("hex")
      .slice(0, 14);

    return {
      provider: "RAZORPAY",
      providerOrderId: `order_${digest}`,
      amountPaise: input.amountPaise,
      currency: "INR",
      keyId: getRazorpayKeyId(),
    };
  }

  async verifyWebhook(params: {
    rawBody: string;
    signatureHeader: string | null;
    eventIdHeader?: string | null;
  }): Promise<VerifiedWebhookEvent> {
    const validSignature = verifyRazorpayHmacSignature(
      params.rawBody,
      params.signatureHeader
    );

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(params.rawBody) as Record<string, unknown>;
    } catch {
      return {
        validSignature: false,
        providerEventId: params.eventIdHeader || "invalid_json",
        eventType: "unknown",
        orderId: null,
        providerOrderId: null,
        providerPaymentId: null,
        amountPaise: null,
        currency: null,
        failureReason: "Invalid JSON webhook body",
        rawPayload: {},
      };
    }

    const rawEvent = typeof parsed.event === "string" ? parsed.event : "unknown";
    const eventType: VerifiedWebhookEvent["eventType"] =
      rawEvent === "payment.captured" ||
      rawEvent === "order.paid" ||
      rawEvent === "payment.failed"
        ? rawEvent
        : "unknown";

    const payloadObj =
      (parsed.payload as Record<string, unknown> | undefined) ?? {};
    const paymentWrapper =
      (payloadObj.payment as Record<string, unknown> | undefined) ?? {};
    const paymentEntity =
      (paymentWrapper.entity as Record<string, unknown> | undefined) ?? {};
    const orderWrapper =
      (payloadObj.order as Record<string, unknown> | undefined) ?? {};
    const orderEntity =
      (orderWrapper.entity as Record<string, unknown> | undefined) ?? {};

    const notesFromPayment =
      (paymentEntity.notes as Record<string, unknown> | undefined) ?? {};
    const notesFromOrder =
      (orderEntity.notes as Record<string, unknown> | undefined) ?? {};

    const providerPaymentId =
      typeof paymentEntity.id === "string"
        ? paymentEntity.id
        : typeof parsed.providerPaymentId === "string"
          ? parsed.providerPaymentId
          : null;

    const providerOrderId =
      typeof paymentEntity.order_id === "string"
        ? paymentEntity.order_id
        : typeof orderEntity.id === "string"
          ? orderEntity.id
          : typeof parsed.providerOrderId === "string"
            ? parsed.providerOrderId
            : null;

    const orderId =
      typeof notesFromPayment.orderId === "string"
        ? notesFromPayment.orderId
        : typeof notesFromOrder.orderId === "string"
          ? notesFromOrder.orderId
          : typeof parsed.orderId === "string"
            ? parsed.orderId
            : null;

    const rawAmount =
      typeof paymentEntity.amount === "number"
        ? paymentEntity.amount
        : typeof orderEntity.amount_paid === "number"
          ? orderEntity.amount_paid
          : typeof parsed.amountPaise === "number"
            ? parsed.amountPaise
            : null;

    const currency =
      typeof paymentEntity.currency === "string"
        ? paymentEntity.currency
        : typeof orderEntity.currency === "string"
          ? orderEntity.currency
          : typeof parsed.currency === "string"
            ? parsed.currency
            : null;

    const failureReason =
      typeof paymentEntity.error_description === "string"
        ? paymentEntity.error_description
        : typeof parsed.failureReason === "string"
          ? parsed.failureReason
          : null;

    const fallbackEventId =
      typeof parsed.eventId === "string" && parsed.eventId.trim().length > 0
        ? parsed.eventId.trim()
        : `evt_${crypto
            .createHash("sha256")
            .update(params.rawBody)
            .digest("hex")
            .slice(0, 20)}`;

    const providerEventId =
      params.eventIdHeader && params.eventIdHeader.trim().length > 0
        ? params.eventIdHeader.trim()
        : fallbackEventId;

    return {
      validSignature,
      providerEventId,
      eventType,
      orderId,
      providerOrderId,
      providerPaymentId,
      amountPaise:
        typeof rawAmount === "number" && Number.isSafeInteger(rawAmount)
          ? rawAmount
          : null,
      currency,
      failureReason,
      rawPayload: parsed,
    };
  }

  async refund(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const refundId = `rfnd_${crypto
      .createHash("sha256")
      .update(`${input.providerPaymentId}:${input.amountPaise}:${Date.now()}`)
      .digest("hex")
      .slice(0, 14)}`;

    const result: RefundPaymentResult = {
      providerRefundId: refundId,
      providerPaymentId: input.providerPaymentId,
      amountPaise: input.amountPaise,
      status: "PROCESSED",
      createdAt: new Date().toISOString(),
    };

    recordedRefundsForTests.unshift({
      ...result,
      orderId: input.orderId,
      reason: input.reason,
    });

    return result;
  }
}

export const razorpayProvider: PaymentProvider = new RazorpayPaymentProvider();

export function getRecordedRefundsForTests(): Array<
  RefundPaymentResult & { orderId: string; reason: string }
> {
  return [...recordedRefundsForTests];
}

export function clearRecordedRefundsForTests(): void {
  recordedRefundsForTests.length = 0;
}
