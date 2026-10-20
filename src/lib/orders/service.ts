import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { brandConfig } from "@/config/brand";
import { hashToken, verifyTokenHash } from "@/lib/crypto";
import { lookupServiceablePinCode } from "@/lib/auth/service";
import {
  computeBasketTotals,
  formatPaiseToInr,
  type ComputedBasketTotals,
  type HsnSummaryRowPaise,
} from "@/lib/pricing/gst";
import {
  estimateDelivery,
  extractIstCalendarParts,
} from "@/lib/orders/estimate-delivery";
import {
  razorpayProvider,
  type CreatePaymentResult,
  type PaymentProvider,
} from "@/lib/payments/provider";
import {
  sendCodOtpEmail,
  sendOrderConfirmationReceiptEmail,
} from "@/lib/email";
import { sendCodOtpSms } from "@/lib/sms";
import type { CheckoutAddressInput } from "@/lib/validation/checkout";

export const CROCKFORD_BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ORDER_ID_REGEX =
  /^ORD-\d{8}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/;

export const STOCK_RESERVATION_MINUTES = 15;
export const COD_OTP_EXPIRY_MINUTES = 10;
export const COD_OTP_RESEND_COOLDOWN_SECONDS = 60;
export const MAX_COD_OTP_ATTEMPTS = 5;
export const COD_OTP_LOCKOUT_MINUTES = 30;

const CONFIRMED_HOLD_DAYS = 30;

export function generateCrockfordSuffix(length: number = 5): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = bytes[i]! & 31;
    out += CROCKFORD_BASE32_ALPHABET[idx];
  }
  return out;
}

/**
 * Generates an Order ID in `ORD-YYYYMMDD-XXXXX` format using the Asia/Kolkata calendar date
 * and a 5-character Crockford Base32 suffix.
 */
export function generateOrderId(nowDate: Date = new Date()): string {
  const istParts = extractIstCalendarParts(nowDate);
  const yyyymmdd = istParts.isoDate.replace(/-/g, "");
  const suffix = generateCrockfordSuffix(5);
  return `ORD-${yyyymmdd}-${suffix}`;
}

export function generateSixDigitOtp(): string {
  const num = crypto.randomInt(100000, 1000000);
  return String(num);
}

export interface OrderAddressSnapshotJson {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  stateCode: string;
  pinCode: string;
  latitude: number | null;
  longitude: number | null;
  sellerState: string;
  sellerStateCode: string;
  estimatedDispatchBy: string | null;
  estimatedDeliveryMin: string | null;
  estimatedDeliveryMax: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  reservationExpiresAt: string | null;
  codOtpResentAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
}

export interface OrderSnapshotItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  hsnCode: string;
  imageUrl: string | null;
  quantity: number;
  unitPricePaise: number;
  taxableAmountPaise: number;
  taxSlabPercent: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  lineTotalPaise: number;
}

export interface OrderSnapshotDetail {
  id: string;
  orderId: string;
  userId: string;
  status: string;
  paymentMethod: "RAZORPAY" | "COD" | "PAYPAL";
  paymentStatus: string;
  shippingRecipientName: string;
  shippingPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPinCode: string;
  shippingLatitude: number | null;
  shippingLongitude: number | null;
  sellerState: string;
  isIntraState: boolean;
  taxableSubtotalPaise: number;
  subtotalPaise: number;
  shippingPaise: number;
  cgstTotalPaise: number;
  sgstTotalPaise: number;
  igstTotalPaise: number;
  taxTotalPaise: number;
  grandTotalPaise: number;
  estimatedDispatchBy: string | null;
  estimatedDeliveryMin: string | null;
  estimatedDeliveryMax: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  reservationExpiresAt: string | null;
  codOtpRequired: boolean;
  codOtpExpiresAt: string | null;
  codOtpAttempts: number;
  codOtpLockedUntil: string | null;
  codOtpResendAvailableAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: OrderSnapshotItem[];
  hsnSummary: HsnSummaryRowPaise[];
}

export interface CodEligibilityStatus {
  allowed: boolean;
  reason: string | null;
  maxCapPaise: number;
  isNewAccountCap: boolean;
  hasUnconfirmedCodOrder: boolean;
  unconfirmedCodOrderId: string | null;
}

function buildHsnSummaryFromItems(
  items: OrderSnapshotItem[]
): HsnSummaryRowPaise[] {
  const map = new Map<string, HsnSummaryRowPaise>();
  for (const item of items) {
    const key = `${item.hsnCode}:${item.taxSlabPercent}`;
    const lineTaxPaise = item.cgstPaise + item.sgstPaise + item.igstPaise;
    const existing = map.get(key);
    if (existing) {
      existing.taxablePaise += item.taxableAmountPaise;
      existing.cgstPaise += item.cgstPaise;
      existing.sgstPaise += item.sgstPaise;
      existing.igstPaise += item.igstPaise;
      existing.totalTaxPaise += lineTaxPaise;
      existing.grossPaise += item.lineTotalPaise;
    } else {
      map.set(key, {
        hsnCode: item.hsnCode,
        taxSlabPercent: item.taxSlabPercent,
        taxablePaise: item.taxableAmountPaise,
        cgstPaise: item.cgstPaise,
        sgstPaise: item.sgstPaise,
        igstPaise: item.igstPaise,
        totalTaxPaise: lineTaxPaise,
        grossPaise: item.lineTotalPaise,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.hsnCode.localeCompare(b.hsnCode)
  );
}

function parseAddressSnapshot(raw: Prisma.JsonValue): OrderAddressSnapshotJson {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    recipientName:
      typeof obj.recipientName === "string" ? obj.recipientName : "",
    phone: typeof obj.phone === "string" ? obj.phone : "",
    addressLine1: typeof obj.addressLine1 === "string" ? obj.addressLine1 : "",
    addressLine2:
      typeof obj.addressLine2 === "string" ? obj.addressLine2 : null,
    city: typeof obj.city === "string" ? obj.city : "",
    state: typeof obj.state === "string" ? obj.state : "",
    stateCode: typeof obj.stateCode === "string" ? obj.stateCode : "KA",
    pinCode: typeof obj.pinCode === "string" ? obj.pinCode : "",
    latitude: typeof obj.latitude === "number" ? obj.latitude : null,
    longitude: typeof obj.longitude === "number" ? obj.longitude : null,
    sellerState:
      typeof obj.sellerState === "string"
        ? obj.sellerState
        : brandConfig.sellerStateName,
    sellerStateCode:
      typeof obj.sellerStateCode === "string"
        ? obj.sellerStateCode
        : brandConfig.sellerStateCode,
    estimatedDispatchBy:
      typeof obj.estimatedDispatchBy === "string"
        ? obj.estimatedDispatchBy
        : null,
    estimatedDeliveryMin:
      typeof obj.estimatedDeliveryMin === "string"
        ? obj.estimatedDeliveryMin
        : null,
    estimatedDeliveryMax:
      typeof obj.estimatedDeliveryMax === "string"
        ? obj.estimatedDeliveryMax
        : null,
    razorpayOrderId:
      typeof obj.razorpayOrderId === "string" ? obj.razorpayOrderId : null,
    razorpayPaymentId:
      typeof obj.razorpayPaymentId === "string" ? obj.razorpayPaymentId : null,
    reservationExpiresAt:
      typeof obj.reservationExpiresAt === "string"
        ? obj.reservationExpiresAt
        : null,
    codOtpResentAt:
      typeof obj.codOtpResentAt === "string" ? obj.codOtpResentAt : null,
    confirmedAt: typeof obj.confirmedAt === "string" ? obj.confirmedAt : null,
    cancelledAt: typeof obj.cancelledAt === "string" ? obj.cancelledAt : null,
  };
}

function mapOrderRecordToDetail(
  order: Prisma.OrderGetPayload<{ include: { items: true } }>
): OrderSnapshotDetail {
  const snap = parseAddressSnapshot(order.addressSnapshot);

  const items: OrderSnapshotItem[] = order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.nameAtPurchase,
    sku: item.skuAtPurchase,
    hsnCode: item.hsnCodeAtPurchase,
    imageUrl: item.imageUrlAtPurchase ?? null,
    quantity: item.quantity,
    unitPricePaise: item.priceAtPurchasePaise,
    taxableAmountPaise: item.taxableAmountPaise,
    taxSlabPercent: item.taxSlabPercent,
    cgstPaise: item.cgstPaise,
    sgstPaise: item.sgstPaise,
    igstPaise: item.igstPaise,
    lineTotalPaise: item.lineTotalPaise,
  }));

  const isIntraState =
    snap.stateCode.trim().toUpperCase() ===
    snap.sellerStateCode.trim().toUpperCase();

  const resentAtDate =
    order.codOtpResentAt ??
    (snap.codOtpResentAt ? new Date(snap.codOtpResentAt) : null);

  const resendAvailableAt = resentAtDate
    ? new Date(
        resentAtDate.getTime() + COD_OTP_RESEND_COOLDOWN_SECONDS * 1000
      ).toISOString()
    : null;

  const isPendingCodConfirmation =
    order.paymentMethod === "COD" &&
    order.paymentStatus === "PENDING_CONFIRMATION" &&
    order.status === "PLACED";

  const displayStatus = isPendingCodConfirmation
    ? "PENDING_CONFIRMATION"
    : order.status;

  return {
    id: order.orderId,
    orderId: order.orderId,
    userId: order.userId,
    status: displayStatus,
    paymentMethod: order.paymentMethod as "RAZORPAY" | "COD",
    paymentStatus: order.paymentStatus,
    shippingRecipientName: snap.recipientName,
    shippingPhone: snap.phone,
    shippingAddressLine1: snap.addressLine1,
    shippingAddressLine2: snap.addressLine2,
    shippingCity: snap.city,
    shippingState: snap.state,
    shippingPinCode: snap.pinCode,
    shippingLatitude: snap.latitude,
    shippingLongitude: snap.longitude,
    sellerState: snap.sellerState,
    isIntraState,
    taxableSubtotalPaise: order.taxableSubtotalPaise,
    subtotalPaise: order.subtotalPaise,
    shippingPaise: order.shippingPaise,
    cgstTotalPaise: order.cgstPaise,
    sgstTotalPaise: order.sgstPaise,
    igstTotalPaise: order.igstPaise,
    taxTotalPaise: order.taxPaise,
    grandTotalPaise: order.totalPaise,
    estimatedDispatchBy: snap.estimatedDispatchBy,
    estimatedDeliveryMin:
      snap.estimatedDeliveryMin ??
      order.estimatedDelivery.toISOString().slice(0, 10),
    estimatedDeliveryMax:
      snap.estimatedDeliveryMax ??
      order.estimatedDelivery.toISOString().slice(0, 10),
    razorpayOrderId: snap.razorpayOrderId,
    razorpayPaymentId: snap.razorpayPaymentId,
    reservationExpiresAt: order.reservationExpiresAt
      ? order.reservationExpiresAt.toISOString()
      : snap.reservationExpiresAt,
    codOtpRequired: isPendingCodConfirmation,
    codOtpExpiresAt: order.codOtpExpiresAt
      ? order.codOtpExpiresAt.toISOString()
      : null,
    codOtpAttempts: order.codOtpAttempts,
    codOtpLockedUntil: order.codOtpLockedUntil
      ? order.codOtpLockedUntil.toISOString()
      : null,
    codOtpResendAvailableAt: resendAvailableAt,
    confirmedAt: order.confirmedAt
      ? order.confirmedAt.toISOString()
      : snap.confirmedAt,
    cancelledAt: order.cancelledAt
      ? order.cancelledAt.toISOString()
      : snap.cancelledAt,
    createdAt: order.createdAt.toISOString(),
    items,
    hsnSummary: buildHsnSummaryFromItems(items),
  };
}

/**
 * Releases expired `StockReservation` rows and auto-cancels their unconfirmed orders
 * (`status = "PLACED"` where payment has not completed or COD OTP timed out).
 * Safe to invoke both as a periodic cleanup job and lazily before checkout/webhook/order queries.
 */
export async function releaseExpiredStockReservations(
  nowDate: Date = new Date()
): Promise<{
  releasedReservationCount: number;
  cancelledOrderIds: string[];
}> {
  const expiredReservations = await prisma.stockReservation.findMany({
    where: {
      released: false,
      expiresAt: { lte: nowDate },
    },
    include: {
      order: {
        select: {
          orderId: true,
          status: true,
          paymentStatus: true,
          addressSnapshot: true,
        },
      },
    },
    orderBy: { productId: "asc" },
  });

  if (expiredReservations.length === 0) {
    return { releasedReservationCount: 0, cancelledOrderIds: [] };
  }

  let releasedReservationCount = 0;
  const cancelledOrderIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const res of expiredReservations) {
      // Do not release reservations for orders that are already PAID or CONFIRMED
      if (
        res.order.paymentStatus === "PAID" ||
        (res.order.status !== "PLACED" && res.order.status !== "CANCELLED")
      ) {
        const extended = new Date(
          nowDate.getTime() + CONFIRMED_HOLD_DAYS * 24 * 60 * 60 * 1000
        );
        await tx.stockReservation.update({
          where: { id: res.id },
          data: { expiresAt: extended },
        });
        continue;
      }

      const claim = await tx.stockReservation.updateMany({
        where: { id: res.id, released: false },
        data: { released: true },
      });

      if (claim.count === 1) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "products"
          SET "reserved_stock" = GREATEST(0, "reserved_stock" - ${res.quantity}),
              "updated_at" = NOW()
          WHERE "id" = ${res.productId}
        `);
        releasedReservationCount += 1;

        if (res.order.status === "PLACED") {
          const snap = parseAddressSnapshot(res.order.addressSnapshot);
          snap.cancelledAt = nowDate.toISOString();

          const updatedOrder = await tx.order.updateMany({
            where: {
              orderId: res.orderId,
              status: "PLACED",
              paymentStatus: { in: ["PENDING_CONFIRMATION", "PENDING_PAYMENT"] },
            },
            data: {
              status: "CANCELLED",
              cancelledAt: nowDate,
              addressSnapshot: snap as unknown as Prisma.InputJsonValue,
            },
          });

          if (updatedOrder.count === 1) {
            cancelledOrderIds.add(res.order.orderId);
            await tx.orderEvent.create({
              data: {
                orderId: res.orderId,
                status: "CANCELLED",
                note: "Order auto-cancelled after stock reservation / OTP confirmation window expired.",
                changedBy: "SYSTEM",
                actorRole: "SYSTEM",
              },
            });
          }
        }
      }
    }
  });

  return {
    releasedReservationCount,
    cancelledOrderIds: Array.from(cancelledOrderIds),
  };
}

/**
 * Evaluates Cash on Delivery (COD) eligibility for a customer, PIN code, and grand total.
 * Enforces:
 * - Serviceable PIN code `codAvailable`
 * - At most 1 unconfirmed COD order (`paymentStatus = "PENDING_CONFIRMATION"`, `status = "PLACED"`) per customer
 * - Lower COD cap (`brandConfig.codNewAccountMaxPaise` = Rs 5,000) for accounts with 0 prior `DELIVERED` orders
 * - Standard COD cap (`brandConfig.codStandardMaxPaise` = Rs 15,000) for accounts with >= 1 `DELIVERED` order
 */
export async function evaluateCodEligibility(params: {
  userId: string;
  pinCode: string;
  grandTotalPaise: number;
  nowDate?: Date;
}): Promise<CodEligibilityStatus> {
  await releaseExpiredStockReservations(params.nowDate ?? new Date());

  const [pinInfo, deliveredOrdersCount, unconfirmedCodOrder] = await Promise.all([
    lookupServiceablePinCode(params.pinCode),
    prisma.order.count({
      where: {
        userId: params.userId,
        status: "DELIVERED",
      },
    }),
    prisma.order.findFirst({
      where: {
        userId: params.userId,
        paymentMethod: "COD",
        status: "PLACED",
        paymentStatus: "PENDING_CONFIRMATION",
      },
      select: { orderId: true },
    }),
  ]);

  const isNewAccountCap = deliveredOrdersCount === 0;
  const maxCapPaise = isNewAccountCap
    ? brandConfig.codNewAccountMaxPaise
    : brandConfig.codStandardMaxPaise;

  if (!pinInfo || !pinInfo.isActive) {
    return {
      allowed: false,
      reason: "Delivery is not serviceable for the selected PIN code.",
      maxCapPaise,
      isNewAccountCap,
      hasUnconfirmedCodOrder: Boolean(unconfirmedCodOrder),
      unconfirmedCodOrderId: unconfirmedCodOrder?.orderId ?? null,
    };
  }

  if (!pinInfo.codAvailable) {
    return {
      allowed: false,
      reason: `Cash on Delivery is not available for PIN code ${params.pinCode} (${pinInfo.city}, ${pinInfo.state}). Please choose Razorpay (UPI, card, or netbanking).`,
      maxCapPaise,
      isNewAccountCap,
      hasUnconfirmedCodOrder: Boolean(unconfirmedCodOrder),
      unconfirmedCodOrderId: unconfirmedCodOrder?.orderId ?? null,
    };
  }

  if (unconfirmedCodOrder) {
    return {
      allowed: false,
      reason: `You already have an unconfirmed Cash on Delivery order (${unconfirmedCodOrder.orderId}) awaiting OTP verification. Please confirm or wait for it to expire before placing another COD order.`,
      maxCapPaise,
      isNewAccountCap,
      hasUnconfirmedCodOrder: true,
      unconfirmedCodOrderId: unconfirmedCodOrder.orderId,
    };
  }

  if (params.grandTotalPaise > maxCapPaise) {
    const capFormatted = formatPaiseToInr(maxCapPaise);
    return {
      allowed: false,
      reason: isNewAccountCap
        ? `Cash on Delivery is available up to ${capFormatted} for first-time accounts (increases to ${formatPaiseToInr(
            brandConfig.codStandardMaxPaise
          )} after your first completed delivery). Your current order total is ${formatPaiseToInr(
            params.grandTotalPaise
          )}.`
        : `Cash on Delivery is available for orders up to ${capFormatted}. Your current order total is ${formatPaiseToInr(
            params.grandTotalPaise
          )}.`,
      maxCapPaise,
      isNewAccountCap,
      hasUnconfirmedCodOrder: false,
      unconfirmedCodOrderId: null,
    };
  }

  return {
    allowed: true,
    reason: null,
    maxCapPaise,
    isNewAccountCap,
    hasUnconfirmedCodOrder: false,
    unconfirmedCodOrderId: null,
  };
}

export type CreateOrderResult =
  | {
      ok: true;
      idempotentReplay: boolean;
      order: OrderSnapshotDetail;
      razorpayPayment?: CreatePaymentResult;
      /** Populated only in development/test so local dev and integration tests can inspect the COD OTP */
      codOtpForDev?: string;
    }
  | {
      ok: false;
      code:
        | "EMPTY_CART"
        | "UNSERVICEABLE_PIN"
        | "PRODUCT_INACTIVE"
        | "OUT_OF_STOCK"
        | "PRICE_OR_TOTAL_CHANGED"
        | "COD_NOT_ELIGIBLE"
        | "UNCONFIRMED_COD_ORDER_EXISTS";
      message: string;
      currentTotalPaise?: number;
      updatedTotals?: ComputedBasketTotals;
      outOfStockProductId?: string;
      outOfStockProductName?: string;
    };

class CheckoutTransactionError extends Error {
  public readonly code:
    | "EMPTY_CART"
    | "UNSERVICEABLE_PIN"
    | "PRODUCT_INACTIVE"
    | "OUT_OF_STOCK"
    | "PRICE_OR_TOTAL_CHANGED"
    | "COD_NOT_ELIGIBLE"
    | "UNCONFIRMED_COD_ORDER_EXISTS";
  public readonly currentTotalPaise?: number;
  public readonly updatedTotals?: ComputedBasketTotals;
  public readonly outOfStockProductId?: string;
  public readonly outOfStockProductName?: string;

  constructor(opts: {
    code: CheckoutTransactionError["code"];
    message: string;
    currentTotalPaise?: number;
    updatedTotals?: ComputedBasketTotals;
    outOfStockProductId?: string;
    outOfStockProductName?: string;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.currentTotalPaise = opts.currentTotalPaise;
    this.updatedTotals = opts.updatedTotals;
    this.outOfStockProductId = opts.outOfStockProductId;
    this.outOfStockProductName = opts.outOfStockProductName;
  }
}

async function dispatchOrderConfirmationEmail(
  detail: OrderSnapshotDetail,
  userEmail: string
): Promise<void> {
  const deliveryWindow =
    detail.estimatedDeliveryMin && detail.estimatedDeliveryMax
      ? `${detail.estimatedDeliveryMin} to ${detail.estimatedDeliveryMax}`
      : "5 to 7 working days";

  const shippingAddressFormatted = [
    detail.shippingRecipientName,
    detail.shippingAddressLine1,
    detail.shippingAddressLine2,
    `${detail.shippingCity}, ${detail.shippingState} - ${detail.shippingPinCode}`,
    `Phone: ${detail.shippingPhone}`,
  ]
    .filter(Boolean)
    .join(", ");

  await sendOrderConfirmationReceiptEmail({
    to: userEmail,
    fullName: detail.shippingRecipientName,
    orderId: detail.orderId,
    paymentMethodLabel:
      detail.paymentMethod === "COD"
        ? "Cash on Delivery"
        : "Online Payment via Razorpay",
    paymentStatusLabel:
      detail.paymentMethod === "COD" ? "OTP Confirmed" : "PAID",
    shippingAddressBlock: shippingAddressFormatted,
    predictedDeliveryWindow: deliveryWindow,
    isIntraState: detail.isIntraState,
    items: detail.items.map((i) => ({
      productName: i.productName,
      sku: i.sku,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unitPriceFormatted: formatPaiseToInr(i.unitPricePaise),
      lineTotalFormatted: formatPaiseToInr(i.lineTotalPaise),
      taxSlabPercent: i.taxSlabPercent,
    })),
    hsnSummary: detail.hsnSummary.map((row) => ({
      hsnCode: row.hsnCode,
      taxSlabPercent: row.taxSlabPercent,
      taxableFormatted: formatPaiseToInr(row.taxablePaise),
      cgstFormatted: formatPaiseToInr(row.cgstPaise),
      sgstFormatted: formatPaiseToInr(row.sgstPaise),
      igstFormatted: formatPaiseToInr(row.igstPaise),
      totalTaxFormatted: formatPaiseToInr(row.totalTaxPaise),
    })),
    taxableSubtotalFormatted: formatPaiseToInr(detail.taxableSubtotalPaise),
    taxTotalFormatted: formatPaiseToInr(detail.taxTotalPaise),
    shippingFormatted:
      detail.shippingPaise === 0
        ? "Free"
        : formatPaiseToInr(detail.shippingPaise),
    grandTotalFormatted: formatPaiseToInr(detail.grandTotalPaise),
  });
}

/**
 * Single authoritative server function that creates an order inside a PostgreSQL transaction.
 *
 * Security & Atomicity Guarantees:
 * 1. Enforces `Idempotency-Key` uniqueness (`orders.idempotency_key`): if the same key is
 *    submitted again (double-click or network retry), returns the existing order snapshot.
 * 2. Never trusts any price, tax, or shipping amount from the client; re-reads live products
 *    and serviceable PIN code inside the transaction and computes GST in integer paise.
 * 3. Compares `expectedTotalPaise` (what the customer saw on the review screen) against the
 *    recomputed server `grandTotalPaise`; rejects with `PRICE_OR_TOTAL_CHANGED` on mismatch.
 * 4. Locks & updates product stock in deterministic sorted `productId` order (`ORDER BY id ASC`)
 *    using an atomic conditional `UPDATE ... WHERE (supplier_stock - reserved_stock - stock_buffer) >= qty`
 *    so 20 concurrent checkouts for the last unit allow at most 1 winner and never deadlocks.
 * 5. Creates 15-minute `StockReservation` rows (10 minutes for unconfirmed COD), immutable
 *    `OrderItem` snapshots (name, SKU, HSN code, unit price, CGST/SGST/IGST split), `ConsentRecord`,
 *    and HMAC-SHA256 hashed delivery OTP / tracking token / COD OTP.
 */
export async function createOrderInTransaction(params: {
  userId: string;
  userEmail: string;
  idempotencyKey: string;
  address: CheckoutAddressInput;
  paymentMethod: "RAZORPAY" | "COD" | "PAYPAL";
  expectedTotalPaise: number;
  termsAccepted: boolean;
  /** Optional explicit line items (used by integration tests); defaults to reading customer's DB cart */
  explicitLines?: Array<{ productId: string; quantity: number }>;
  nowDate?: Date;
  paymentProvider?: PaymentProvider;
}): Promise<CreateOrderResult> {
  const nowDate = params.nowDate ?? new Date();
  const provider = params.paymentProvider ?? razorpayProvider;
  const cleanIdempotencyKey = params.idempotencyKey.trim();

  // Lazily release any expired reservations before starting
  await releaseExpiredStockReservations(nowDate);

  // Fast-path idempotency check
  const existingByKey = await prisma.order.findUnique({
    where: { idempotencyKey: cleanIdempotencyKey },
    include: { items: true },
  });

  if (existingByKey && existingByKey.userId === params.userId) {
    const detail = mapOrderRecordToDetail(existingByKey);
    let razorpayPayment: CreatePaymentResult | undefined;
    if (
      detail.paymentMethod === "RAZORPAY" &&
      detail.paymentStatus !== "PAID" &&
      detail.razorpayOrderId
    ) {
      razorpayPayment = {
        provider: "RAZORPAY",
        providerOrderId: detail.razorpayOrderId,
        amountPaise: detail.grandTotalPaise,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_local_dev_key",
      };
    }
    return {
      ok: true,
      idempotentReplay: true,
      order: detail,
      razorpayPayment,
    };
  }

  const pinInfo = await lookupServiceablePinCode(params.address.pinCode);
  if (!pinInfo || !pinInfo.isActive) {
    return {
      ok: false,
      code: "UNSERVICEABLE_PIN",
      message: `PIN code ${params.address.pinCode} is not serviceable for delivery.`,
    };
  }

  let rawCodOtpGenerated: string | undefined;
  const rawDeliveryOtp = generateSixDigitOtp();
  const rawTrackingToken = crypto.randomBytes(24).toString("hex");

  try {
    const createdOrder = await prisma.$transaction(
      async (tx) => {
        // Re-check idempotency key inside transaction
        const txExisting = await tx.order.findUnique({
          where: { idempotencyKey: cleanIdempotencyKey },
          include: { items: true },
        });
        if (txExisting) {
          if (txExisting.userId !== params.userId) {
            throw new Error("Idempotency key belongs to another customer.");
          }
          return {
            orderRecord: txExisting,
            idempotentHit: true,
            rzpPayment: undefined as CreatePaymentResult | undefined,
          };
        }

        // Determine basket lines from customer's DB cart or explicitLines
        let requestedLines: Array<{ productId: string; quantity: number }> = [];
        let customerCartId: string | null = null;

        if (params.explicitLines && params.explicitLines.length > 0) {
          requestedLines = params.explicitLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          }));
        } else {
          const customerCart = await tx.cart.findUnique({
            where: { userId: params.userId },
            include: { items: true },
          });
          customerCartId = customerCart?.id ?? null;
          requestedLines = (customerCart?.items ?? []).map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          }));
        }

        // Consolidate duplicate productIds and sort by productId ASC to prevent deadlocks
        const qtyByProduct = new Map<string, number>();
        for (const line of requestedLines) {
          if (line.quantity > 0) {
            qtyByProduct.set(
              line.productId,
              (qtyByProduct.get(line.productId) ?? 0) + line.quantity
            );
          }
        }

        const sortedProductIds = Array.from(qtyByProduct.keys()).sort((a, b) =>
          a.localeCompare(b)
        );

        if (sortedProductIds.length === 0) {
          throw new CheckoutTransactionError({
            code: "EMPTY_CART",
            message:
              "Your cart is empty. Please add items before checking out.",
          });
        }

        const sortedLines = sortedProductIds.map((productId) => ({
          productId,
          quantity: qtyByProduct.get(productId)!,
        }));

        // Fetch live product rows
        const products = await tx.product.findMany({
          where: { id: { in: sortedProductIds } },
          include: {
            images: {
              orderBy: { position: "asc" },
              take: 1,
            },
          },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        for (const line of sortedLines) {
          const prod = productMap.get(line.productId);
          if (!prod || !prod.isActive) {
            throw new CheckoutTransactionError({
              code: "PRODUCT_INACTIVE",
              message: prod
                ? `"${prod.name}" is no longer available in the catalogue.`
                : "One of the items in your cart is no longer available.",
              outOfStockProductId: line.productId,
              outOfStockProductName: prod?.name,
            });
          }
          const available =
            prod.supplierStock - prod.reservedStock - prod.stockBuffer;
          if (available < line.quantity) {
            throw new CheckoutTransactionError({
              code: "OUT_OF_STOCK",
              message:
                available <= 0
                  ? `"${prod.name}" just went out of stock.`
                  : `Only ${available} unit(s) of "${prod.name}" remain in stock.`,
              outOfStockProductId: prod.id,
              outOfStockProductName: prod.name,
            });
          }
        }

        // Recompute authoritative server-side prices, HSN codes, and GST split
        const computedTotals = computeBasketTotals({
          lines: sortedLines.map((line) => {
            const prod = productMap.get(line.productId)!;
            return {
              productId: prod.id,
              name: prod.name,
              hsnCode: prod.hsnCode,
              unitPricePaise: prod.pricePaise,
              quantity: line.quantity,
              taxSlab: prod.taxSlabPercent,
            };
          }),
          deliveryStateCode: pinInfo.stateCode,
          sellerStateCode: brandConfig.sellerStateCode,
          pinZoneShippingFeePaise: pinInfo.shippingFeePaise,
        });

        // Verify expectedTotalPaise matches server-computed grand total
        if (params.expectedTotalPaise !== computedTotals.grandTotalPaise) {
          throw new CheckoutTransactionError({
            code: "PRICE_OR_TOTAL_CHANGED",
            message: `The order total changed from ${formatPaiseToInr(
              params.expectedTotalPaise
            )} to ${formatPaiseToInr(
              computedTotals.grandTotalPaise
            )}. Please review the updated total and confirm your order.`,
            currentTotalPaise: computedTotals.grandTotalPaise,
            updatedTotals: computedTotals,
          });
        }

        // Enforce COD rules inside the transaction
        if (params.paymentMethod === "COD") {
          if (!pinInfo.codAvailable) {
            throw new CheckoutTransactionError({
              code: "COD_NOT_ELIGIBLE",
              message: `Cash on Delivery is not available for PIN code ${params.address.pinCode}.`,
            });
          }

          const existingUnconfirmedCod = await tx.order.findFirst({
            where: {
              userId: params.userId,
              paymentMethod: "COD",
              status: "PLACED",
              paymentStatus: "PENDING_CONFIRMATION",
            },
            select: { orderId: true },
          });
          if (existingUnconfirmedCod) {
            throw new CheckoutTransactionError({
              code: "UNCONFIRMED_COD_ORDER_EXISTS",
              message: `You already have an unconfirmed Cash on Delivery order (${existingUnconfirmedCod.orderId}). Please verify or cancel it first.`,
            });
          }

          const deliveredOrdersCount = await tx.order.count({
            where: {
              userId: params.userId,
              status: "DELIVERED",
            },
          });
          const codCapPaise =
            deliveredOrdersCount === 0
              ? brandConfig.codNewAccountMaxPaise
              : brandConfig.codStandardMaxPaise;

          if (computedTotals.grandTotalPaise > codCapPaise) {
            throw new CheckoutTransactionError({
              code: "COD_NOT_ELIGIBLE",
              message:
                deliveredOrdersCount === 0
                  ? `Cash on Delivery is capped at ${formatPaiseToInr(
                      codCapPaise
                    )} for new accounts without a completed delivery.`
                  : `Cash on Delivery is capped at ${formatPaiseToInr(
                      codCapPaise
                    )}.`,
            });
          }
        }

        // Atomically reserve stock in sorted productId order using conditional UPDATE
        for (const line of sortedLines) {
          const prod = productMap.get(line.productId)!;
          const updatedCount = await tx.$executeRaw(Prisma.sql`
            UPDATE "products"
            SET "reserved_stock" = "reserved_stock" + ${line.quantity},
                "updated_at" = NOW()
            WHERE "id" = ${line.productId}
              AND "is_active" = true
              AND ("supplier_stock" - "reserved_stock" - "stock_buffer") >= ${line.quantity}
          `);

          if (Number(updatedCount) !== 1) {
            throw new CheckoutTransactionError({
              code: "OUT_OF_STOCK",
              message: `"${prod.name}" just sold out while completing your request. No payment was charged.`,
              outOfStockProductId: prod.id,
              outOfStockProductName: prod.name,
            });
          }
        }

        // Compute predicted delivery window in IST
        const maxProcessingDays = Math.max(
          ...sortedLines.map(
            (l) => productMap.get(l.productId)!.processingDays
          )
        );
        const deliveryEst = estimateDelivery({
          processingDays: maxProcessingDays,
          transitDays: pinInfo.transitDays,
          startDate: nowDate,
        });

        // Generate unique Order ID (ORD-YYYYMMDD-XXXXX) with retry on collision
        let generatedOrderId = "";
        for (let attempt = 0; attempt < 8; attempt++) {
          const candidate = generateOrderId(nowDate);
          const collision = await tx.order.findUnique({
            where: { orderId: candidate },
            select: { orderId: true },
          });
          if (!collision) {
            generatedOrderId = candidate;
            break;
          }
        }
        if (!generatedOrderId) {
          throw new Error(
            "Could not generate a unique Order ID after 8 attempts."
          );
        }

        const reservationMinutes =
          params.paymentMethod === "COD"
            ? COD_OTP_EXPIRY_MINUTES
            : STOCK_RESERVATION_MINUTES;
        const reservationExpiresAt = new Date(
          nowDate.getTime() + reservationMinutes * 60 * 1000
        );

        let codOtpHash: string | null = null;
        let codOtpExpiresAt: Date | null = null;
        let codOtpResentAt: Date | null = null;

        if (params.paymentMethod === "COD") {
          rawCodOtpGenerated = generateSixDigitOtp();
          codOtpHash = hashToken(rawCodOtpGenerated);
          codOtpExpiresAt = reservationExpiresAt;
          codOtpResentAt = nowDate;
        }

        // Create Razorpay provider order ID if paymentMethod is RAZORPAY
        const rzpPayment =
          params.paymentMethod === "RAZORPAY"
            ? await provider.createPayment({
                orderId: generatedOrderId,
                amountPaise: computedTotals.grandTotalPaise,
                currency: "INR",
                customerId: params.userId,
                customerEmail: params.userEmail,
                customerPhone: params.address.phone,
              })
            : undefined;

        const addressSnapshotData: OrderAddressSnapshotJson = {
          recipientName: params.address.recipientName,
          phone: params.address.phone,
          addressLine1: params.address.addressLine1,
          addressLine2: params.address.addressLine2 || null,
          city: pinInfo.city,
          state: pinInfo.state,
          stateCode: pinInfo.stateCode,
          pinCode: params.address.pinCode,
          latitude: params.address.latitude ?? null,
          longitude: params.address.longitude ?? null,
          sellerState: brandConfig.sellerStateName,
          sellerStateCode: brandConfig.sellerStateCode,
          estimatedDispatchBy: deliveryEst.estimatedDispatchDate,
          estimatedDeliveryMin: deliveryEst.estimatedDeliveryDateMin,
          estimatedDeliveryMax: deliveryEst.estimatedDeliveryDateMax,
          razorpayOrderId: rzpPayment?.providerOrderId ?? null,
          razorpayPaymentId: null,
          reservationExpiresAt: reservationExpiresAt.toISOString(),
          codOtpResentAt: codOtpResentAt ? codOtpResentAt.toISOString() : null,
          confirmedAt: null,
          cancelledAt: null,
        };

        const orderRecord = await tx.order.create({
          data: {
            orderId: generatedOrderId,
            idempotencyKey: cleanIdempotencyKey,
            userId: params.userId,
            status: params.paymentMethod === "PAYPAL" ? "CONFIRMED" : "PLACED",
            paymentMethod: params.paymentMethod,
            paymentStatus:
              params.paymentMethod === "COD"
                ? "PENDING_CONFIRMATION"
                : params.paymentMethod === "PAYPAL"
                ? "PAID"
                : "PENDING_PAYMENT",
            confirmedAt: params.paymentMethod === "PAYPAL" ? nowDate : null,
            addressSnapshot:
              addressSnapshotData as unknown as Prisma.InputJsonValue,
            taxableSubtotalPaise: computedTotals.taxableSubtotalPaise,
            subtotalPaise: computedTotals.subtotalPaise,
            cgstPaise: computedTotals.cgstTotalPaise,
            sgstPaise: computedTotals.sgstTotalPaise,
            igstPaise: computedTotals.igstTotalPaise,
            taxPaise: computedTotals.totalTaxPaise,
            shippingPaise: computedTotals.shippingPaise,
            totalPaise: computedTotals.grandTotalPaise,
            estimatedDelivery: new Date(
              `${deliveryEst.estimatedDeliveryDateMax}T00:00:00.000Z`
            ),
            reservationExpiresAt,
            codOtpHash,
            codOtpExpiresAt,
            codOtpResentAt,
            deliveryOtpHash: hashToken(rawDeliveryOtp),
            trackingTokenHash: hashToken(rawTrackingToken),
            items: {
              create: sortedLines.map((line, index) => {
                const prod = productMap.get(line.productId)!;
                const lineBreakdown = computedTotals.lines[index]!;
                return {
                  productId: prod.id,
                  nameAtPurchase: prod.name,
                  skuAtPurchase: prod.supplierSku,
                  hsnCodeAtPurchase: prod.hsnCode,
                  imageUrlAtPurchase: prod.images[0]?.imageUrl ?? null,
                  quantity: line.quantity,
                  priceAtPurchasePaise: prod.pricePaise,
                  taxableAmountPaise: lineBreakdown.taxableAmountPaise,
                  taxSlabPercent: prod.taxSlabPercent,
                  cgstPaise: lineBreakdown.cgstPaise,
                  sgstPaise: lineBreakdown.sgstPaise,
                  igstPaise: lineBreakdown.igstPaise,
                  taxPaise: lineBreakdown.totalTaxPaise,
                  lineTotalPaise: lineBreakdown.lineTotalPaise,
                };
              }),
            },
            stockReservations: {
              create: sortedLines.map((line) => ({
                productId: line.productId,
                userId: params.userId,
                quantity: line.quantity,
                expiresAt: reservationExpiresAt,
                released: false,
              })),
            },
            events: {
              create: {
                status: "PLACED",
                note:
                  params.paymentMethod === "COD"
                    ? "Order placed with Cash on Delivery. Waiting for 6-digit OTP verification within 10 minutes."
                    : "Order placed. Stock reserved for 15 minutes while awaiting Razorpay payment confirmation.",
                changedBy: params.userId,
                actorRole: "CUSTOMER",
              },
            },
            ...(rzpPayment
              ? {
                  payments: {
                    create: {
                      provider: "RAZORPAY",
                      providerOrderId: rzpPayment.providerOrderId,
                      amountPaise: computedTotals.grandTotalPaise,
                      status: "PENDING_PAYMENT",
                    },
                  },
                }
              : {}),
          },
          include: {
            items: true,
          },
        });

        // Record legal Terms & Refund Policy acceptance in ConsentRecord
        if (params.termsAccepted) {
          await tx.consentRecord.create({
            data: {
              userId: params.userId,
              anonymousId: params.userId,
              categories: {
                necessary: true,
                checkoutTermsAndRefundPolicy: true,
                orderId: generatedOrderId,
              },
              policyVersion: "2026.1",
            },
          });
        }

        // Save address to SavedAddress if requested
        if (params.address.saveAddressToProfile) {
          const combinedLine = [
            params.address.addressLine1.trim(),
            params.address.addressLine2?.trim(),
          ]
            .filter(Boolean)
            .join(", ");
          await tx.savedAddress.create({
            data: {
              userId: params.userId,
              label: params.address.addressLabel?.trim() || "Saved Address",
              recipientName: params.address.recipientName,
              phone: params.address.phone,
              addressLine: combinedLine,
              city: pinInfo.city,
              state: pinInfo.state,
              pinCode: params.address.pinCode,
              latitude: params.address.latitude ?? null,
              longitude: params.address.longitude ?? null,
            },
          });
        }

        // Clear the customer's DB cart items if we used the cart
        if (customerCartId) {
          await tx.cartItem.deleteMany({
            where: { cartId: customerCartId },
          });
        }

        return {
          orderRecord,
          idempotentHit: false,
          rzpPayment,
        };
      },
      {
        maxWait: 10000,
        timeout: 15000,
      }
    );

    const detail = mapOrderRecordToDetail(createdOrder.orderRecord);

    if (createdOrder.idempotentHit) {
      return {
        ok: true,
        idempotentReplay: true,
        order: detail,
        razorpayPayment:
          detail.paymentMethod === "RAZORPAY" && detail.razorpayOrderId
            ? {
                provider: "RAZORPAY",
                providerOrderId: detail.razorpayOrderId,
                amountPaise: detail.grandTotalPaise,
                currency: "INR",
                keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_local_dev_key",
              }
            : undefined,
      };
    }

    if (params.paymentMethod === "COD" && rawCodOtpGenerated) {
      const formattedTotal = formatPaiseToInr(detail.grandTotalPaise);
      await Promise.all([
        sendCodOtpEmail({
          to: params.userEmail,
          fullName: detail.shippingRecipientName,
          orderId: detail.orderId,
          otpCode: rawCodOtpGenerated,
          amountFormatted: formattedTotal,
        }),
        sendCodOtpSms({
          toPhone: detail.shippingPhone,
          orderId: detail.orderId,
          otpCode: rawCodOtpGenerated,
          amountFormatted: formattedTotal,
        }),
      ]);
    }

    return {
      ok: true,
      idempotentReplay: false,
      order: detail,
      razorpayPayment: createdOrder.rzpPayment,
      codOtpForDev:
        process.env.NODE_ENV !== "production" ? rawCodOtpGenerated : undefined,
    };
  } catch (error) {
    if (error instanceof CheckoutTransactionError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        currentTotalPaise: error.currentTotalPaise,
        updatedTotals: error.updatedTotals,
        outOfStockProductId: error.outOfStockProductId,
        outOfStockProductName: error.outOfStockProductName,
      };
    }

    // Handle concurrent Idempotency-Key P2002 unique constraint race
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey: cleanIdempotencyKey },
        include: { items: true },
      });
      if (existing) {
        const detail = mapOrderRecordToDetail(existing);
        return {
          ok: true,
          idempotentReplay: true,
          order: detail,
          razorpayPayment:
            detail.paymentMethod === "RAZORPAY" && detail.razorpayOrderId
              ? {
                  provider: "RAZORPAY",
                  providerOrderId: detail.razorpayOrderId,
                  amountPaise: detail.grandTotalPaise,
                  currency: "INR",
                  keyId:
                    process.env.RAZORPAY_KEY_ID || "rzp_test_local_dev_key",
                }
              : undefined,
        };
      }
    }

    throw error;
  }
}

export type VerifyCodOtpResult =
  | {
      ok: true;
      alreadyConfirmed?: boolean;
      order: OrderSnapshotDetail;
    }
  | {
      ok: false;
      code:
        | "ORDER_NOT_FOUND"
        | "NOT_PENDING_COD"
        | "COD_OTP_EXPIRED"
        | "COD_OTP_LOCKED"
        | "COD_OTP_INVALID";
      message: string;
      remainingAttempts?: number;
    };

/**
 * Verifies the 6-digit COD confirmation OTP.
 * Enforces:
 * - 10-minute expiration (auto-cancels and releases stock if expired)
 * - 5-attempt lockout (auto-cancels and releases stock on 5th failed attempt)
 * - Constant-time HMAC hash comparison (`verifyTokenHash`)
 * - Transitions order to `CONFIRMED` and dispatches confirmation receipt email
 */
export async function verifyCodOrderOtp(params: {
  orderId: string;
  userId: string;
  userEmail: string;
  otpCode: string;
  nowDate?: Date;
}): Promise<VerifyCodOtpResult> {
  const nowDate = params.nowDate ?? new Date();

  const order = await prisma.order.findUnique({
    where: { orderId: params.orderId },
    include: { items: true },
  });

  if (!order || order.userId !== params.userId) {
    return {
      ok: false,
      code: "ORDER_NOT_FOUND",
      message: "Order not found.",
    };
  }

  if (order.paymentMethod !== "COD") {
    return {
      ok: false,
      code: "NOT_PENDING_COD",
      message: "This order does not use Cash on Delivery.",
    };
  }

  if (order.status === "CONFIRMED") {
    return {
      ok: true,
      alreadyConfirmed: true,
      order: mapOrderRecordToDetail(order),
    };
  }

  if (
    order.status !== "PLACED" ||
    order.paymentStatus !== "PENDING_CONFIRMATION"
  ) {
    return {
      ok: false,
      code: "NOT_PENDING_COD",
      message: `This order is currently ${order.status} and cannot be confirmed via OTP.`,
    };
  }

  if (order.codOtpLockedUntil && order.codOtpLockedUntil > nowDate) {
    return {
      ok: false,
      code: "COD_OTP_LOCKED",
      message:
        "Too many incorrect verification attempts. This order has been locked and cancelled.",
      remainingAttempts: 0,
    };
  }

  if (
    !order.codOtpExpiresAt ||
    order.codOtpExpiresAt <= nowDate ||
    !order.codOtpHash
  ) {
    await releaseExpiredStockReservations(nowDate);
    return {
      ok: false,
      code: "COD_OTP_EXPIRED",
      message:
        "Your 10-minute COD verification code has expired and reserved stock has been released.",
    };
  }

  const isValid = verifyTokenHash(params.otpCode.trim(), order.codOtpHash);

  if (!isValid) {
    const nextAttempts = order.codOtpAttempts + 1;
    const isLockedOut = nextAttempts >= MAX_COD_OTP_ATTEMPTS;
    const lockedUntil = isLockedOut
      ? new Date(nowDate.getTime() + COD_OTP_LOCKOUT_MINUTES * 60 * 1000)
      : null;

    await prisma.$transaction(async (tx) => {
      if (isLockedOut) {
        const activeReservations = await tx.stockReservation.findMany({
          where: { orderId: order.orderId, released: false },
          orderBy: { productId: "asc" },
        });
        for (const res of activeReservations) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "products"
            SET "reserved_stock" = GREATEST(0, "reserved_stock" - ${res.quantity}),
                "updated_at" = NOW()
            WHERE "id" = ${res.productId}
          `);
          await tx.stockReservation.update({
            where: { id: res.id },
            data: { released: true },
          });
        }

        const snap = parseAddressSnapshot(order.addressSnapshot);
        snap.cancelledAt = nowDate.toISOString();

        await tx.order.update({
          where: { orderId: order.orderId },
          data: {
            codOtpAttempts: nextAttempts,
            codOtpLockedUntil: lockedUntil,
            status: "CANCELLED",
            cancelledAt: nowDate,
            addressSnapshot: snap as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.orderEvent.create({
          data: {
            orderId: order.orderId,
            status: "CANCELLED",
            note: "Order cancelled after 5 failed Cash on Delivery OTP verification attempts.",
            changedBy: params.userId,
            actorRole: "CUSTOMER",
          },
        });
      } else {
        await tx.order.update({
          where: { orderId: order.orderId },
          data: {
            codOtpAttempts: nextAttempts,
          },
        });
      }
    });

    if (isLockedOut) {
      return {
        ok: false,
        code: "COD_OTP_LOCKED",
        message:
          "Maximum 5 verification attempts exceeded. This order has been cancelled and reserved stock released.",
        remainingAttempts: 0,
      };
    }

    const remaining = MAX_COD_OTP_ATTEMPTS - nextAttempts;
    return {
      ok: false,
      code: "COD_OTP_INVALID",
      message: `Invalid verification code. ${remaining} attempt(s) remaining.`,
      remainingAttempts: remaining,
    };
  }

  // Valid OTP: transition order to CONFIRMED + PENDING_PAYMENT (to be collected on delivery) and extend stock reservation hold
  const holdUntil = new Date(
    nowDate.getTime() + CONFIRMED_HOLD_DAYS * 24 * 60 * 60 * 1000
  );

  const updatedOrder = await prisma.$transaction(async (tx) => {
    await tx.stockReservation.updateMany({
      where: { orderId: order.orderId, released: false },
      data: { expiresAt: holdUntil },
    });

    const snap = parseAddressSnapshot(order.addressSnapshot);
    snap.confirmedAt = nowDate.toISOString();
    snap.reservationExpiresAt = holdUntil.toISOString();

    const updated = await tx.order.update({
      where: { orderId: order.orderId },
      data: {
        status: "CONFIRMED",
        paymentStatus: "PENDING_PAYMENT",
        confirmedAt: nowDate,
        reservationExpiresAt: holdUntil,
        codOtpHash: null,
        addressSnapshot: snap as unknown as Prisma.InputJsonValue,
      },
      include: { items: true },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.orderId,
        status: "CONFIRMED",
        note: "Cash on Delivery OTP verified by customer. Order confirmed.",
        changedBy: params.userId,
        actorRole: "CUSTOMER",
      },
    });

    return updated;
  });

  const detail = mapOrderRecordToDetail(updatedOrder);
  await dispatchOrderConfirmationEmail(detail, params.userEmail);

  return {
    ok: true,
    alreadyConfirmed: false,
    order: detail,
  };
}

export type ResendCodOtpResult =
  | {
      ok: true;
      codOtpExpiresAt: string;
      codOtpForDev?: string;
      message: string;
    }
  | {
      ok: false;
      code:
        | "ORDER_NOT_FOUND"
        | "NOT_PENDING_COD"
        | "COD_OTP_LOCKED"
        | "COD_OTP_COOLDOWN";
      message: string;
      retryAfterSeconds?: number;
    };

/**
 * Resends a fresh 6-digit COD confirmation OTP, enforcing a 60-second cooldown.
 */
export async function resendCodOrderOtp(params: {
  orderId: string;
  userId: string;
  userEmail: string;
  nowDate?: Date;
}): Promise<ResendCodOtpResult> {
  const nowDate = params.nowDate ?? new Date();

  const order = await prisma.order.findUnique({
    where: { orderId: params.orderId },
  });

  if (!order || order.userId !== params.userId) {
    return {
      ok: false,
      code: "ORDER_NOT_FOUND",
      message: "Order not found.",
    };
  }

  if (
    order.paymentMethod !== "COD" ||
    order.status !== "PLACED" ||
    order.paymentStatus !== "PENDING_CONFIRMATION"
  ) {
    return {
      ok: false,
      code: "NOT_PENDING_COD",
      message: "This order is not awaiting COD verification.",
    };
  }

  if (order.codOtpLockedUntil && order.codOtpLockedUntil > nowDate) {
    return {
      ok: false,
      code: "COD_OTP_LOCKED",
      message: "Too many failed attempts. This order is locked.",
    };
  }

  const snap = parseAddressSnapshot(order.addressSnapshot);
  const lastResentAt =
    order.codOtpResentAt ??
    (snap.codOtpResentAt ? new Date(snap.codOtpResentAt) : null);

  if (lastResentAt) {
    const elapsedSeconds = Math.floor(
      (nowDate.getTime() - lastResentAt.getTime()) / 1000
    );
    if (elapsedSeconds < COD_OTP_RESEND_COOLDOWN_SECONDS) {
      const retryAfterSeconds =
        COD_OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;
      return {
        ok: false,
        code: "COD_OTP_COOLDOWN",
        message: `Please wait ${retryAfterSeconds} seconds before requesting another verification code.`,
        retryAfterSeconds,
      };
    }
  }

  const newOtp = generateSixDigitOtp();
  const newExpiresAt = new Date(
    nowDate.getTime() + COD_OTP_EXPIRY_MINUTES * 60 * 1000
  );

  snap.codOtpResentAt = nowDate.toISOString();
  snap.reservationExpiresAt = newExpiresAt.toISOString();

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { orderId: order.orderId },
      data: {
        codOtpHash: hashToken(newOtp),
        codOtpExpiresAt: newExpiresAt,
        codOtpResentAt: nowDate,
        reservationExpiresAt: newExpiresAt,
        addressSnapshot: snap as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.stockReservation.updateMany({
      where: { orderId: order.orderId, released: false },
      data: { expiresAt: newExpiresAt },
    });
  });

  const formattedTotal = formatPaiseToInr(order.totalPaise);
  await Promise.all([
    sendCodOtpEmail({
      to: params.userEmail,
      fullName: snap.recipientName,
      orderId: order.orderId,
      otpCode: newOtp,
      amountFormatted: formattedTotal,
    }),
    sendCodOtpSms({
      toPhone: snap.phone,
      orderId: order.orderId,
      otpCode: newOtp,
      amountFormatted: formattedTotal,
    }),
  ]);

  return {
    ok: true,
    codOtpExpiresAt: newExpiresAt.toISOString(),
    codOtpForDev: process.env.NODE_ENV !== "production" ? newOtp : undefined,
    message:
      "A new 6-digit verification code has been sent to your email and mobile number.",
  };
}

/**
 * Processes a raw Razorpay webhook event with:
 * - Constant-time HMAC-SHA256 signature verification (`crypto.timingSafeEqual`)
 * - Event deduplication via `PaymentWebhookEvent` (`providerEventId` primary key)
 * - Exact amount (in paise) and currency (`INR`) verification against the server order
 * - Out-of-order protection (`payment.failed` arriving after `PAID` never downgrades a paid order)
 * - Late webhook handling after 15-min stock reservation expiry:
 *   - Re-reserves stock atomically if still available and confirms the order
 *   - Otherwise cancels the order and issues an automatic refund via `paymentProvider.refund()`
 */
export async function processRazorpayWebhook(params: {
  rawBody: string;
  signatureHeader: string | null;
  eventIdHeader?: string | null;
  nowDate?: Date;
  paymentProvider?: PaymentProvider;
}): Promise<{
  httpStatus: 200 | 400 | 404 | 500;
  code:
    | "INVALID_SIGNATURE"
    | "DUPLICATE_EVENT"
    | "ORDER_NOT_FOUND"
    | "AMOUNT_OR_CURRENCY_MISMATCH"
    | "PAYMENT_CONFIRMED"
    | "LATE_PAYMENT_RERESERVED_CONFIRMED"
    | "LATE_PAYMENT_AUTO_REFUNDED"
    | "PAYMENT_FAILED_RECORDED"
    | "IGNORED_OUT_OF_ORDER_FAILURE"
    | "IGNORED_UNHANDLED_EVENT";
  orderId?: string;
  refundId?: string;
  message: string;
}> {
  const nowDate = params.nowDate ?? new Date();
  const provider = params.paymentProvider ?? razorpayProvider;

  const verified = await provider.verifyWebhook({
    rawBody: params.rawBody,
    signatureHeader: params.signatureHeader,
    eventIdHeader: params.eventIdHeader,
  });

  if (!verified.validSignature) {
    return {
      httpStatus: 400,
      code: "INVALID_SIGNATURE",
      message: "Webhook HMAC signature verification failed.",
    };
  }

  // Check if this providerEventId was already processed
  const existingEvent = await prisma.paymentWebhookEvent.findUnique({
    where: { providerEventId: verified.providerEventId },
  });
  if (existingEvent) {
    return {
      httpStatus: 200,
      code: "DUPLICATE_EVENT",
      orderId: existingEvent.orderId,
      message: "Webhook event already processed.",
    };
  }

  if (verified.eventType === "unknown") {
    return {
      httpStatus: 200,
      code: "IGNORED_UNHANDLED_EVENT",
      message: "Unhandled webhook event type ignored.",
    };
  }

  // Locate order by orderId or via Payment.providerOrderId
  let targetOrderId = verified.orderId;
  if (!targetOrderId && verified.providerOrderId) {
    const paymentRow = await prisma.payment.findFirst({
      where: { providerOrderId: verified.providerOrderId },
      select: { orderId: true },
    });
    targetOrderId = paymentRow?.orderId ?? null;
  }

  const order = targetOrderId
    ? await prisma.order.findUnique({
        where: { orderId: targetOrderId },
        include: {
          items: true,
          stockReservations: true,
          user: {
            select: { email: true },
          },
        },
      })
    : null;

  if (!order) {
    return {
      httpStatus: 404,
      code: "ORDER_NOT_FOUND",
      message: "Matching order not found for webhook event.",
    };
  }

  // Verify currency and exact integer paise amount
  if (
    verified.currency !== "INR" ||
    verified.amountPaise !== order.totalPaise
  ) {
    return {
      httpStatus: 400,
      code: "AMOUNT_OR_CURRENCY_MISMATCH",
      orderId: order.orderId,
      message: `Webhook amount/currency (${verified.currency} ${verified.amountPaise}) does not match order total (INR ${order.totalPaise}).`,
    };
  }

  // Handle payment.failed
  if (verified.eventType === "payment.failed") {
    // Out-of-order protection: never downgrade an already PAID or CONFIRMED order
    if (order.paymentStatus === "PAID" || order.status === "CONFIRMED") {
      await prisma.paymentWebhookEvent.create({
        data: {
          providerEventId: verified.providerEventId,
          orderId: order.orderId,
          eventType: verified.eventType,
          amountPaise: verified.amountPaise ?? order.totalPaise,
          currency: verified.currency ?? "INR",
          outcome: "IGNORED_OUT_OF_ORDER_FAILURE",
          rawPayload: verified.rawPayload as Prisma.InputJsonValue,
        },
      });
      return {
        httpStatus: 200,
        code: "IGNORED_OUT_OF_ORDER_FAILURE",
        orderId: order.orderId,
        message:
          "Ignored out-of-order payment.failed event because order is already PAID.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentWebhookEvent.create({
        data: {
          providerEventId: verified.providerEventId,
          orderId: order.orderId,
          eventType: verified.eventType,
          amountPaise: verified.amountPaise ?? order.totalPaise,
          currency: verified.currency ?? "INR",
          outcome: "PAYMENT_FAILED_RECORDED",
          rawPayload: verified.rawPayload as Prisma.InputJsonValue,
        },
      });

      const activeReservations = await tx.stockReservation.findMany({
        where: { orderId: order.orderId, released: false },
        orderBy: { productId: "asc" },
      });

      for (const res of activeReservations) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "products"
          SET "reserved_stock" = GREATEST(0, "reserved_stock" - ${res.quantity}),
              "updated_at" = NOW()
          WHERE "id" = ${res.productId}
        `);
        await tx.stockReservation.update({
          where: { id: res.id },
          data: { released: true },
        });
      }

      const snap = parseAddressSnapshot(order.addressSnapshot);
      snap.cancelledAt = nowDate.toISOString();

      await tx.order.update({
        where: { orderId: order.orderId },
        data: {
          paymentStatus: "FAILED",
          status: "CANCELLED",
          cancelledAt: nowDate,
          addressSnapshot: snap as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: order.orderId,
          status: "CANCELLED",
          note: `Razorpay payment failed${
            verified.failureReason ? `: ${verified.failureReason}` : "."
          } Reserved stock released.`,
          changedBy: "SYSTEM",
          actorRole: "SYSTEM",
        },
      });
    });

    return {
      httpStatus: 200,
      code: "PAYMENT_FAILED_RECORDED",
      orderId: order.orderId,
      message: "Payment failure recorded and reserved stock released.",
    };
  }

  // Handle payment.captured / order.paid
  // First, lazily expire any reservations that timed out before this webhook arrived
  await releaseExpiredStockReservations(nowDate);

  const freshOrder = await prisma.order.findUnique({
    where: { orderId: order.orderId },
    include: {
      items: true,
      stockReservations: true,
      user: { select: { email: true } },
    },
  });
  if (!freshOrder) {
    return {
      httpStatus: 404,
      code: "ORDER_NOT_FOUND",
      message: "Order not found.",
    };
  }

  // If already PAID by an earlier event (e.g., payment.captured followed by order.paid)
  if (freshOrder.paymentStatus === "PAID") {
    await prisma.paymentWebhookEvent.create({
      data: {
        providerEventId: verified.providerEventId,
        orderId: freshOrder.orderId,
        eventType: verified.eventType,
        amountPaise: verified.amountPaise ?? freshOrder.totalPaise,
        currency: verified.currency ?? "INR",
        outcome: "DUPLICATE_ALREADY_PAID",
        rawPayload: verified.rawPayload as Prisma.InputJsonValue,
      },
    });
    return {
      httpStatus: 200,
      code: "DUPLICATE_EVENT",
      orderId: freshOrder.orderId,
      message: "Order already marked PAID.",
    };
  }

  const holdUntil = new Date(
    nowDate.getTime() + CONFIRMED_HOLD_DAYS * 24 * 60 * 60 * 1000
  );
  const allReservationsStillHeld =
    freshOrder.stockReservations.length > 0 &&
    freshOrder.stockReservations.every((r) => !r.released);

  if (allReservationsStillHeld) {
    const confirmedOrder = await prisma.$transaction(async (tx) => {
      await tx.paymentWebhookEvent.create({
        data: {
          providerEventId: verified.providerEventId,
          orderId: freshOrder.orderId,
          eventType: verified.eventType,
          amountPaise: verified.amountPaise ?? freshOrder.totalPaise,
          currency: verified.currency ?? "INR",
          outcome: "PAYMENT_CONFIRMED",
          rawPayload: verified.rawPayload as Prisma.InputJsonValue,
        },
      });

      await tx.stockReservation.updateMany({
        where: { orderId: freshOrder.orderId, released: false },
        data: { expiresAt: holdUntil },
      });

      const snap = parseAddressSnapshot(freshOrder.addressSnapshot);
      snap.confirmedAt = nowDate.toISOString();
      snap.razorpayPaymentId =
        verified.providerPaymentId ?? snap.razorpayPaymentId;
      snap.reservationExpiresAt = holdUntil.toISOString();

      const updated = await tx.order.update({
        where: { orderId: freshOrder.orderId },
        data: {
          paymentStatus: "PAID",
          status: "CONFIRMED",
          confirmedAt: nowDate,
          reservationExpiresAt: holdUntil,
          addressSnapshot: snap as unknown as Prisma.InputJsonValue,
        },
        include: { items: true },
      });

      await tx.orderEvent.create({
        data: {
          orderId: freshOrder.orderId,
          status: "CONFIRMED",
          note: `Razorpay payment captured (${
            verified.providerPaymentId ?? "verified"
          }). Order confirmed.`,
          changedBy: "SYSTEM",
          actorRole: "SYSTEM",
        },
      });

      return updated;
    });

    const detail = mapOrderRecordToDetail(confirmedOrder);
    await dispatchOrderConfirmationEmail(detail, freshOrder.user.email);

    return {
      httpStatus: 200,
      code: "PAYMENT_CONFIRMED",
      orderId: freshOrder.orderId,
      message: "Payment verified and order confirmed.",
    };
  }

  // Late webhook path: the 15-minute reservation expired and was released before the webhook arrived!
  // Attempt to atomically re-reserve all items in sorted productId order.
  const sortedItems = [...freshOrder.items].sort((a, b) =>
    a.productId.localeCompare(b.productId)
  );

  let rereservedOrder: Prisma.OrderGetPayload<{
    include: { items: true };
  }> | null = null;

  try {
    rereservedOrder = await prisma.$transaction(async (tx) => {
      for (const item of sortedItems) {
        const updatedCount = await tx.$executeRaw(Prisma.sql`
          UPDATE "products"
          SET "reserved_stock" = "reserved_stock" + ${item.quantity},
              "updated_at" = NOW()
          WHERE "id" = ${item.productId}
            AND "is_active" = true
            AND ("supplier_stock" - "reserved_stock" - "stock_buffer") >= ${item.quantity}
        `);
        if (Number(updatedCount) !== 1) {
          throw new Error("INSUFFICIENT_STOCK_FOR_LATE_WEBHOOK");
        }
      }

      await tx.paymentWebhookEvent.create({
        data: {
          providerEventId: verified.providerEventId,
          orderId: freshOrder.orderId,
          eventType: verified.eventType,
          amountPaise: verified.amountPaise ?? freshOrder.totalPaise,
          currency: verified.currency ?? "INR",
          outcome: "LATE_PAYMENT_RERESERVED_CONFIRMED",
          rawPayload: verified.rawPayload as Prisma.InputJsonValue,
        },
      });

      await tx.stockReservation.updateMany({
        where: { orderId: freshOrder.orderId },
        data: {
          released: false,
          expiresAt: holdUntil,
        },
      });

      const snap = parseAddressSnapshot(freshOrder.addressSnapshot);
      snap.confirmedAt = nowDate.toISOString();
      snap.cancelledAt = null;
      snap.razorpayPaymentId =
        verified.providerPaymentId ?? snap.razorpayPaymentId;
      snap.reservationExpiresAt = holdUntil.toISOString();

      const updated = await tx.order.update({
        where: { orderId: freshOrder.orderId },
        data: {
          paymentStatus: "PAID",
          status: "CONFIRMED",
          confirmedAt: nowDate,
          cancelledAt: null,
          reservationExpiresAt: holdUntil,
          addressSnapshot: snap as unknown as Prisma.InputJsonValue,
        },
        include: { items: true },
      });

      await tx.orderEvent.create({
        data: {
          orderId: freshOrder.orderId,
          status: "CONFIRMED",
          note: "Late Razorpay webhook arrived after 15-minute reservation expiry; stock re-reserved atomically and order confirmed.",
          changedBy: "SYSTEM",
          actorRole: "SYSTEM",
        },
      });

      return updated;
    });
  } catch (err) {
    if (
      !(err instanceof Error) ||
      err.message !== "INSUFFICIENT_STOCK_FOR_LATE_WEBHOOK"
    ) {
      throw err;
    }
  }

  if (rereservedOrder) {
    const detail = mapOrderRecordToDetail(rereservedOrder);
    await dispatchOrderConfirmationEmail(detail, freshOrder.user.email);
    return {
      httpStatus: 200,
      code: "LATE_PAYMENT_RERESERVED_CONFIRMED",
      orderId: freshOrder.orderId,
      message:
        "Late payment webhook arrived after expiry; stock was re-reserved and order confirmed.",
    };
  }

  // Stock is no longer available for the late webhook: cancel order and trigger automatic refund
  const refundResult = await provider.refund({
    orderId: freshOrder.orderId,
    providerPaymentId:
      verified.providerPaymentId ?? `pay_late_${freshOrder.orderId}`,
    amountPaise: freshOrder.totalPaise,
    reason:
      "Late payment webhook arrived after 15-minute stock reservation expired and item sold out.",
  });

  await prisma.$transaction(async (tx) => {
    await tx.paymentWebhookEvent.create({
      data: {
        providerEventId: verified.providerEventId,
        orderId: freshOrder.orderId,
        eventType: verified.eventType,
        amountPaise: verified.amountPaise ?? freshOrder.totalPaise,
        currency: verified.currency ?? "INR",
        outcome: "LATE_PAYMENT_AUTO_REFUNDED",
        rawPayload: verified.rawPayload as Prisma.InputJsonValue,
      },
    });

    const snap = parseAddressSnapshot(freshOrder.addressSnapshot);
    snap.cancelledAt = nowDate.toISOString();
    snap.razorpayPaymentId =
      verified.providerPaymentId ?? snap.razorpayPaymentId;

    await tx.order.update({
      where: { orderId: freshOrder.orderId },
      data: {
        paymentStatus: "REFUNDED",
        status: "CANCELLED",
        cancelledAt: nowDate,
        addressSnapshot: snap as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: freshOrder.orderId,
        status: "CANCELLED",
        note: `Late payment webhook arrived after 15-minute reservation expired and stock was unavailable. Order cancelled and automatic refund (${refundResult.providerRefundId}) initiated.`,
        changedBy: "SYSTEM",
        actorRole: "SYSTEM",
      },
    });
  });

  return {
    httpStatus: 200,
    code: "LATE_PAYMENT_AUTO_REFUNDED",
    orderId: freshOrder.orderId,
    refundId: refundResult.providerRefundId,
    message:
      "Late payment arrived after stock sold out; order cancelled and automatic refund initiated.",
  };
}

/**
 * Fetches an order snapshot for a specific customer (enforcing ownership).
 */
export async function getOrderDetailForCustomer(params: {
  orderId: string;
  userId: string;
  nowDate?: Date;
}): Promise<OrderSnapshotDetail | null> {
  await releaseExpiredStockReservations(params.nowDate ?? new Date());

  const order = await prisma.order.findUnique({
    where: { orderId: params.orderId },
    include: { items: true },
  });

  if (!order || order.userId !== params.userId) {
    return null;
  }

  return mapOrderRecordToDetail(order);
}

/**
 * Returns saved addresses and default profile address for the checkout step.
 */
export async function getCustomerAddressesForCheckout(userId: string) {
  const [user, savedAddresses] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        phone: true,
        addressLine: true,
        city: true,
        state: true,
        pinCode: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.savedAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  return {
    profileAddress: user
      ? {
          recipientName: user.fullName,
          phone: user.phone,
          addressLine1: user.addressLine,
          addressLine2: "",
          city: user.city,
          state: user.state,
          pinCode: user.pinCode,
          latitude: user.latitude !== null ? Number(user.latitude) : null,
          longitude: user.longitude !== null ? Number(user.longitude) : null,
        }
      : null,
    savedAddresses: savedAddresses.map((addr) => ({
      id: addr.id,
      label: addr.label,
      recipientName: addr.recipientName,
      phone: addr.phone,
      addressLine1: addr.addressLine,
      addressLine2: "",
      city: addr.city,
      state: addr.state,
      pinCode: addr.pinCode,
      latitude: addr.latitude !== null ? Number(addr.latitude) : null,
      longitude: addr.longitude !== null ? Number(addr.longitude) : null,
      isDefault: addr.isDefault,
    })),
  };
}

/**
 * Resets orders, reservations, webhook events, and payments created during tests.
 */
export async function resetOrdersAndReservationsForTests(): Promise<void> {
  await prisma.paymentWebhookEvent.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.orderEvent.deleteMany({});
  await prisma.stockReservation.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
}
