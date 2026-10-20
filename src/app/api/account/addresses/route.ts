import { NextResponse } from "next/server";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { validateRequestCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/db";
import { savedAddressSchema } from "@/lib/validation/auth";

/**
 * GET /api/account/addresses
 * Returns the list of saved addresses for the logged-in customer.
 */
export async function GET(request: Request) {
  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const addresses = await prisma.savedAddress.findMany({
    where: { userId: session.userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ ok: true, addresses });
}

/**
 * POST /api/account/addresses
 * Creates a new saved address for the logged-in customer.
 */
export async function POST(request: Request) {
  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { error: "Security token expired. Please reload and try again." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = savedAddressSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { error: "Invalid address details.", fieldErrors },
      { status: 400 }
    );
  }

  const {
    label,
    recipientName,
    phone,
    addressLine,
    city,
    state,
    pinCode,
    latitude,
    longitude,
    isDefault,
  } = parsed.data;

  // If this address is default, unmark other default addresses for this user
  if (isDefault) {
    await prisma.savedAddress.updateMany({
      where: { userId: session.userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const address = await prisma.savedAddress.create({
    data: {
      userId: session.userId,
      label,
      recipientName,
      phone,
      addressLine,
      city,
      state,
      pinCode,
      latitude,
      longitude,
      isDefault: Boolean(isDefault),
    },
  });

  return NextResponse.json({ ok: true, address }, { status: 201 });
}
