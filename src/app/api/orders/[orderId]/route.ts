import { NextResponse } from "next/server";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { getOrderDetailForCustomer } from "@/lib/orders/service";

/**
 * GET /api/orders/[orderId]
 * Returns the order snapshot and HSN tax breakdown for the authenticated customer.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Please sign in to view your order.",
      },
      { status: 401 }
    );
  }

  const { orderId } = await context.params;
  const order = await getOrderDetailForCustomer({
    orderId: orderId.trim(),
    userId: session.userId,
  });

  if (!order) {
    return NextResponse.json(
      {
        ok: false,
        code: "ORDER_NOT_FOUND",
        error: "Order not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      order,
    },
    { status: 200 }
  );
}
