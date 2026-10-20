import { NextResponse } from "next/server";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { validateRequestCsrf } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import {
  getCustomerCart,
  setCustomerCartPinCode,
} from "@/lib/cart/service";
import {
  createOrderInTransaction,
  evaluateCodEligibility,
  getCustomerAddressesForCheckout,
  releaseExpiredStockReservations,
} from "@/lib/orders/service";
import { createCheckoutOrderSchema } from "@/lib/validation/checkout";

/**
 * GET /api/checkout
 * Returns the authenticated customer's checkout preview:
 * - profileAddress & savedAddresses
 * - evaluated server cart (with PIN-based GST split & delivery estimate)
 * - COD eligibility status (PIN availability, new-account Rs 5,000 cap vs standard Rs 15,000 cap, 1-unconfirmed-order rule)
 */
export async function GET(request: Request) {
  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Please sign in with a verified customer account to proceed to checkout.",
      },
      { status: 401 }
    );
  }

  await releaseExpiredStockReservations();

  const { searchParams } = new URL(request.url);
  const requestedPin = searchParams.get("pinCode")?.trim();

  const addressBundle = await getCustomerAddressesForCheckout(session.userId);
  const fallbackPin =
    requestedPin ||
    addressBundle.savedAddresses.find((a) => a.isDefault)?.pinCode ||
    addressBundle.profileAddress?.pinCode ||
    "560001";

  if (/^[1-9]\d{5}$/.test(fallbackPin)) {
    await setCustomerCartPinCode({
      userId: session.userId,
      pinCode: fallbackPin,
    });
  }

  const cart = await getCustomerCart(session.userId);
  const activePin = cart.pinCode || fallbackPin;

  const codEligibility = await evaluateCodEligibility({
    userId: session.userId,
    pinCode: activePin,
    grandTotalPaise: cart.totals.grandTotalPaise,
  });

  return NextResponse.json(
    {
      ok: true,
      customer: {
        id: session.userId,
        email: session.email,
        fullName: session.fullName,
      },
      profileAddress: addressBundle.profileAddress,
      savedAddresses: addressBundle.savedAddresses,
      cart,
      codEligibility,
    },
    { status: 200 }
  );
}

/**
 * POST /api/checkout
 * Creates an order inside a single PostgreSQL transaction with:
 * - CSRF verification
 * - Rate limiting
 * - Idempotency-Key deduplication (from `Idempotency-Key` header or `idempotencyKey` body field)
 * - Server-side price, HSN, GST split, shipping, and grand total verification
 * - Atomic conditional stock reservation
 */
export async function POST(request: Request) {
  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      {
        ok: false,
        code: "CSRF_INVALID",
        error: "Your security token expired. Reload the page and try again.",
      },
      { status: 403 }
    );
  }

  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Please sign in with a verified customer account to place an order.",
      },
      { status: 401 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    session.userId;
  const rl = await checkRateLimit(RATE_LIMIT_RULES.checkout, ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMITED",
        error: `Too many checkout attempts. Please wait ${rl.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
        },
      }
    );
  }

  const rawBody = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!rawBody) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_JSON",
        error: "Invalid checkout request payload.",
      },
      { status: 400 }
    );
  }

  const headerIdempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  const payloadWithIdempotency = {
    ...rawBody,
    idempotencyKey:
      headerIdempotencyKey ||
      (typeof rawBody.idempotencyKey === "string"
        ? rawBody.idempotencyKey
        : ""),
  };

  const parsed = createCheckoutOrderSchema.safeParse(payloadWithIdempotency);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        error:
          parsed.error.issues[0]?.message ??
          "Please check your delivery address and payment details.",
        fieldErrors,
      },
      { status: 400 }
    );
  }

  const result = await createOrderInTransaction({
    userId: session.userId,
    userEmail: session.email,
    idempotencyKey: parsed.data.idempotencyKey,
    address: parsed.data.address,
    paymentMethod: parsed.data.paymentMethod,
    expectedTotalPaise: parsed.data.expectedTotalPaise,
    termsAccepted: parsed.data.termsAccepted,
  });

  if (!result.ok) {
    const status =
      result.code === "PRICE_OR_TOTAL_CHANGED" ||
      result.code === "OUT_OF_STOCK" ||
      result.code === "UNCONFIRMED_COD_ORDER_EXISTS" ||
      result.code === "PRODUCT_INACTIVE"
        ? 409
        : 400;

    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        error: result.message,
        currentTotalPaise: result.currentTotalPaise,
        updatedTotals: result.updatedTotals,
        outOfStockProductId: result.outOfStockProductId,
        outOfStockProductName: result.outOfStockProductName,
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      idempotentReplay: result.idempotentReplay,
      order: result.order,
      razorpayPayment: result.razorpayPayment,
      codOtpForDev: result.codOtpForDev,
    },
    { status: result.idempotentReplay ? 200 : 201 }
  );
}
