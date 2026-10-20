import { NextResponse } from "next/server";
import { getCurrentCustomerSession, revokeAllUserSessions, CUSTOMER_SESSION_COOKIE } from "@/lib/auth/session";
import { validateRequestCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/db";
import { deleteAccountSchema } from "@/lib/validation/auth";
import { verifyPassword } from "@/lib/auth/password";
import { cookies } from "next/headers";

/**
 * POST /api/account/delete
 * Account erasure under Privacy Policy.
 * Verifies password, records audit log, revokes all sessions, and anonymizes/deletes account data.
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

  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter your password to confirm deletion." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const passwordValid = await verifyPassword(
    user.passwordHash,
    parsed.data.password
  );

  if (!passwordValid) {
    return NextResponse.json(
      { error: "Incorrect password. Account deletion aborted." },
      { status: 400 }
    );
  }

  // Create audit log entry
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      actorRole: "CUSTOMER",
      action: "ACCOUNT_DELETED",
      targetType: "USER",
      targetId: user.id,
      metadata: {
        email: user.email,
        deletedAt: new Date().toISOString(),
        reason: "Customer requested account deletion",
      },
    },
  });

  // Revoke all sessions across devices
  await revokeAllUserSessions(user.id);

  // Anonymize user details to preserve order and invoice audit trails while erasing PII
  const anonymizedEmail = `deleted_${user.id.slice(0, 8)}_${Date.now()}@deleted.invalid`;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      fullName: "Deleted Customer",
      email: anonymizedEmail,
      canonicalEmail: anonymizedEmail,
      phone: "0000000000",
      addressLine: "Deleted",
      city: "Deleted",
      state: "Deleted",
      pinCode: "000000",
      latitude: null,
      longitude: null,
      isVerified: false,
    },
  });

  // Delete saved addresses
  await prisma.savedAddress.deleteMany({
    where: { userId: user.id },
  });

  // Clear cookie
  try {
    const cookieStore = await cookies();
    cookieStore.set(CUSTOMER_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  } catch {
    // Graceful fallback outside Next.js request scope
  }

  return NextResponse.json({
    ok: true,
    message: "Your account and personal details have been deleted.",
  });
}
