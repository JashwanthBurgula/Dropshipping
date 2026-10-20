import { NextResponse } from "next/server";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * GET /api/account/export-data
 * GDPR/DPDP personal data export endpoint.
 * Returns all user profile details, saved addresses, orders, and consent records as a JSON file.
 * Never leaks password hashes or tokens.
 */
export async function GET(request: Request) {
  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
      updatedAt: true,
      savedAddresses: true,
      orders: {
        include: {
          items: true,
          events: true,
        },
      },
      consentRecords: true,
      storeCreditEntries: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const exportPayload = {
    exportDate: new Date().toISOString(),
    store: "Kala & Kiln Retail Pvt. Ltd.",
    user,
  };

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="kala-and-kiln-account-data-${session.userId.slice(0, 8)}.json"`,
    },
  });
}
