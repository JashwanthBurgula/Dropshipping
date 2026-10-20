import { NextResponse } from "next/server";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * GET /api/auth/me
 * Returns the currently authenticated customer profile from the secure session.
 * Never leaks password hashes or tokens.
 */
export async function GET(request: Request) {
  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, user: null }, { status: 200 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      pinCode: true,
      city: true,
      state: true,
      isVerified: true,
      role: true,
    },
  });

  if (!user) {
    return NextResponse.json({ ok: false, user: null }, { status: 200 });
  }

  const firstName = user.fullName.split(" ")[0] || "Customer";

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        firstName,
        email: user.email,
        phone: user.phone,
        pinCode: user.pinCode,
        city: user.city,
        state: user.state,
        isVerified: user.isVerified,
        role: user.role,
      },
    },
    { status: 200 }
  );
}
