import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validateRequestCsrf } from "@/lib/csrf";
import {
  CUSTOMER_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
  getSessionByRawToken,
  revokeSessionByRawToken,
  revokeAllUserSessions,
} from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/service";

export async function POST(request: Request) {
  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { error: "Security token expired." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    allDevices?: boolean;
  };
  const cookieStore = await cookies();
  const customerRaw = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  const adminRaw = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const activeRaw = adminRaw ?? customerRaw;

  if (activeRaw) {
    const session = await getSessionByRawToken(activeRaw);
    if (session && body.allDevices) {
      await revokeAllUserSessions(session.userId);
      await writeAuditLog({
        userId: session.userId,
        actorRole: session.role,
        action: "LOGOUT_ALL_DEVICES",
        targetType: "USER",
        targetId: session.userId,
      });
    } else if (session) {
      await revokeSessionByRawToken(activeRaw);
      await writeAuditLog({
        userId: session.userId,
        actorRole: session.role,
        action: "LOGOUT_SINGLE_SESSION",
        targetType: "USER",
        targetId: session.userId,
      });
    }
  }

  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
  cookieStore.delete(ADMIN_SESSION_COOKIE);

  return NextResponse.json({ ok: true }, { status: 200 });
}
