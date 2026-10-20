import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { validateRequestCsrf } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import {
  addItemToCustomerCart,
  clearCustomerCart,
  getCustomerCart,
  MAX_QTY_PER_LINE,
  removeItemFromCustomerCart,
  setCustomerCartPinCode,
  updateCustomerCartItemQuantity,
} from "@/lib/cart/service";

const addItemSchema = z.object({
  productId: z.string().trim().min(1, "Product ID is required."),
  quantity: z
    .number()
    .int()
    .min(1, "Quantity must be at least 1.")
    .max(100, "Invalid quantity.")
    .optional()
    .default(1),
});

const patchCartSchema = z.union([
  z.object({
    action: z.literal("pin"),
    pinCode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit Indian PIN code."),
  }),
  z.object({
    action: z.literal("quantity").optional(),
    productId: z.string().trim().min(1, "Product ID is required."),
    quantity: z.number().int().min(0).max(100),
  }),
]);

/**
 * GET /api/cart
 * Recomputes the authenticated customer's cart on the server.
 * If `?strict=1` is passed and the request is unauthenticated, returns 401.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const strict = searchParams.get("strict") === "1";

  const session = await getCurrentCustomerSession();
  if (!session) {
    if (strict) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: false,
          code: "AUTH_REQUIRED",
          error:
            "Please sign in with a verified customer account to access your cart.",
        },
        { status: 401 }
      );
    }
    return NextResponse.json(
      {
        ok: true,
        authenticated: false,
        cart: null,
        maxQtyPerLine: MAX_QTY_PER_LINE,
      },
      { status: 200 }
    );
  }

  const cart = await getCustomerCart(session.userId);
  return NextResponse.json(
    {
      ok: true,
      authenticated: true,
      cart,
      maxQtyPerLine: MAX_QTY_PER_LINE,
    },
    { status: 200 }
  );
}

/**
 * POST /api/cart
 * Adds an item to the authenticated customer's cart.
 * Security:
 * - Requires a logged-in verified customer (`401` if unauthenticated).
 * - Requires a valid CSRF token (`403` if missing/invalid).
 * - Never accepts browser-supplied prices, tax slabs, or totals.
 */
export async function POST(request: Request) {
  const session = await getCurrentCustomerSession();
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error:
          "Please sign in with a verified customer account to add items to your cart.",
      },
      { status: 401 }
    );
  }

  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { ok: false, error: "Invalid or expired CSRF security token." },
      { status: 403 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = await checkRateLimit(RATE_LIMIT_RULES.cart, `${session.userId}:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many cart updates. Please wait ${rl.retryAfterSeconds} seconds.`,
      },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Invalid cart item parameters.",
      },
      { status: 400 }
    );
  }

  const result = await addItemToCustomerCart({
    userId: session.userId,
    productId: parsed.data.productId,
    quantityToAdd: parsed.data.quantity,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        error: result.message,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      cart: result.cart,
      cappedByStock: result.cappedByStock,
      appliedQuantity: result.appliedQuantity,
      notice: result.notice,
    },
    { status: 200 }
  );
}

/**
 * PATCH /api/cart
 * Updates an item's quantity (`0` removes it) or updates the cart's delivery PIN code.
 */
export async function PATCH(request: Request) {
  const session = await getCurrentCustomerSession();
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Please sign in to update your cart.",
      },
      { status: 401 }
    );
  }

  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { ok: false, error: "Invalid or expired CSRF security token." },
      { status: 403 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = await checkRateLimit(RATE_LIMIT_RULES.cart, `${session.userId}:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many cart updates. Please wait ${rl.retryAfterSeconds} seconds.`,
      },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const parsed = patchCartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Invalid cart update request.",
      },
      { status: 400 }
    );
  }

  if (parsed.data.action === "pin") {
    const pinResult = await setCustomerCartPinCode({
      userId: session.userId,
      pinCode: parsed.data.pinCode,
    });

    if (!pinResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: pinResult.code,
          error: pinResult.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        cart: pinResult.cart,
      },
      { status: 200 }
    );
  }

  const qtyResult = await updateCustomerCartItemQuantity({
    userId: session.userId,
    productId: parsed.data.productId,
    quantity: parsed.data.quantity,
  });

  if (!qtyResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: qtyResult.code,
        error: qtyResult.message,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      cart: qtyResult.cart,
      cappedByStock: qtyResult.cappedByStock,
      appliedQuantity: qtyResult.appliedQuantity,
      notice: qtyResult.notice,
    },
    { status: 200 }
  );
}

/**
 * DELETE /api/cart?productId=...
 * Removes a single line item if `productId` is supplied, or clears the entire cart.
 */
export async function DELETE(request: Request) {
  const session = await getCurrentCustomerSession();
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Please sign in to modify your cart.",
      },
      { status: 401 }
    );
  }

  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { ok: false, error: "Invalid or expired CSRF security token." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId")?.trim();

  const cart = productId
    ? await removeItemFromCustomerCart({ userId: session.userId, productId })
    : await clearCustomerCart(session.userId);

  return NextResponse.json(
    {
      ok: true,
      cart,
    },
    { status: 200 }
  );
}
