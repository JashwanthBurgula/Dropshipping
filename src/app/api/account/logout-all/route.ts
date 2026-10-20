import { NextResponse } from "next/server";
import { getCurrentCustomerSession, revokeAllUserSessions, CUSTOMER_SESSION_COOKIE } from "@/lib/auth/session";
import { validateRequestCsrf } from "@/lib/csrf";
import { cookies } from "next/headers";

/**
 * POST /api/account/logout-all
 * Signs out of all active devices and sessions for the current customer.
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

  const revokedCount = await revokeAllUserSessions(session.userId);

  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({
    ok: true,
    message: `Signed out of all ${revokedCount} active devices and sessions.`,
  });
}
