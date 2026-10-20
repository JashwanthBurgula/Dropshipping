import { NextResponse } from "next/server";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { validateRequestCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/db";
import { updateProfileSchema } from "@/lib/validation/auth";

/**
 * GET /api/account/profile
 * Returns the customer profile, saved addresses, and orders.
 */
export async function GET(request: Request) {
  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Please sign in to access your account." },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      addressLine: true,
      city: true,
      state: true,
      pinCode: true,
      latitude: true,
      longitude: true,
      isVerified: true,
      role: true,
      createdAt: true,
      savedAddresses: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          orderId: true,
          status: true,
          totalPaise: true,
          paymentMethod: true,
          paymentStatus: true,
          estimatedDelivery: true,
          createdAt: true,
          items: {
            select: {
              productId: true,
              nameAtPurchase: true,
              quantity: true,
              lineTotalPaise: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, profile: user, user });
}

/**
 * PATCH /api/account/profile
 * Updates editable profile details (fullName, phone, delivery address).
 */
export async function PATCH(request: Request) {
  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Please sign in to update your account." },
      { status: 401 }
    );
  }

  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { error: "Security token expired. Please refresh and try again." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request." },
      { status: 400 }
    );
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { error: "Please correct the errors in the form.", fieldErrors },
      { status: 400 }
    );
  }

  const { fullName, phone, addressLine, city, state, pinCode, latitude, longitude } =
    parsed.data;

  const updateData: Record<string, unknown> = {
    fullName,
    phone,
  };

  if (addressLine !== undefined) updateData.addressLine = addressLine;
  if (city !== undefined) updateData.city = city;
  if (state !== undefined) updateData.state = state;
  if (pinCode !== undefined) updateData.pinCode = pinCode;
  if (latitude !== undefined) updateData.latitude = latitude;
  if (longitude !== undefined) updateData.longitude = longitude;

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: updateData,
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      addressLine: true,
      city: true,
      state: true,
      pinCode: true,
      latitude: true,
      longitude: true,
      isVerified: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Your profile details have been updated successfully.",
    profile: updated,
    user: updated,
  });
}
