import { NextResponse } from "next/server";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { validateRequestCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/db";
import { savedAddressSchema } from "@/lib/validation/auth";

/**
 * PATCH /api/account/addresses/[id]
 * Updates a saved address or sets it as default. Strictly checks ownership.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;

  // Strict ownership check
  const existing = await prisma.savedAddress.findUnique({
    where: { id },
  });

  if (!existing || existing.userId !== session.userId) {
    return NextResponse.json(
      { error: "Address not found or unauthorized." },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = savedAddressSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid address fields." },
      { status: 400 }
    );
  }

  if (parsed.data.isDefault) {
    await prisma.savedAddress.updateMany({
      where: { userId: session.userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.savedAddress.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ ok: true, address: updated });
}

/**
 * DELETE /api/account/addresses/[id]
 * Deletes a saved address with strict ownership check.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;

  const existing = await prisma.savedAddress.findUnique({
    where: { id },
  });

  if (!existing || existing.userId !== session.userId) {
    return NextResponse.json(
      { error: "Address not found or unauthorized." },
      { status: 404 }
    );
  }

  await prisma.savedAddress.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true, message: "Address deleted." });
}
