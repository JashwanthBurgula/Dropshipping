import { NextResponse } from "next/server";
import { getCurrentCustomerSession, revokeAllUserSessions, setRotatedSessionCookie, createServerSession } from "@/lib/auth/session";
import { validateRequestCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/db";
import { changeCustomerPasswordSchema } from "@/lib/validation/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/**
 * POST /api/account/change-password
 * Changes the customer password after verifying current password.
 * Checks breached password policy and revokes other active sessions.
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

  const parsed = changeCustomerPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { error: "Please correct the errors below.", fieldErrors },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const currentValid = await verifyPassword(
    user.passwordHash,
    parsed.data.currentPassword
  );

  if (!currentValid) {
    return NextResponse.json(
      {
        error: "Your current password is incorrect.",
        fieldErrors: { currentPassword: "The current password you entered is incorrect." },
      },
      { status: 400 }
    );
  }

  const newHash = await hashPassword(parsed.data.newPassword);

  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: newHash },
  });

  // Revoke all existing sessions across devices
  await revokeAllUserSessions(session.userId);

  // Create fresh session for current device
  const freshSession = await createServerSession({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: "CUSTOMER",
  });

  await setRotatedSessionCookie(
    freshSession.rawToken,
    "CUSTOMER",
    freshSession.ttlSeconds
  );

  return NextResponse.json({
    ok: true,
    message: "Your password has been changed successfully. Other devices have been signed out.",
  });
}
