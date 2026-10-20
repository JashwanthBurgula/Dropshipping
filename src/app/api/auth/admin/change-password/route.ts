import { NextResponse } from "next/server";
import { validateRequestCsrf } from "@/lib/csrf";
import { adminFirstLoginPasswordSchema } from "@/lib/validation/auth";
import {
  clearAdminSessionMustChangePassword,
  getCurrentAdminSession,
} from "@/lib/auth/session";
import { changeAdminFirstLoginPassword } from "@/lib/auth/service";

/**
 * POST /api/auth/admin/change-password
 * Replaces the initial seeded administrator password on first login
 * and clears `mustChangePassword` on the User row.
 */
export async function POST(request: Request) {
  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { error: "Security token expired. Reload the page and try again." },
      { status: 403 }
    );
  }

  const adminCtx = await getCurrentAdminSession({
    allowPendingTotp: true,
    allowMustChangePassword: true,
  });
  if (!adminCtx || adminCtx.session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Admin session expired. Please sign in again." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = adminFirstLoginPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter your current password and a strong new password (at least 10 characters).",
      },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  const result = await changeAdminFirstLoginPassword({
    adminUserId: adminCtx.session.userId,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
    ipAddress: ip,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  await clearAdminSessionMustChangePassword(adminCtx.rawToken);

  return NextResponse.json({ ok: true }, { status: 200 });
}
