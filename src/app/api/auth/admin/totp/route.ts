import { NextResponse } from "next/server";
import { validateRequestCsrf } from "@/lib/csrf";
import { adminTotpVerifySchema } from "@/lib/validation/auth";
import {
  getCurrentAdminSession,
  markAdminSessionTotpVerified,
  setSessionCookie,
} from "@/lib/auth/session";
import {
  enrollAdminTotp,
  verifyAdminSecondFactor,
} from "@/lib/auth/service";

/**
 * GET /api/auth/admin/totp
 * Generates a TOTP secret, QR code data URL, and 8 single-use recovery codes
 * for an authenticated Admin session that is completing 2FA setup.
 */
export async function GET() {
  const adminCtx = await getCurrentAdminSession({ allowPendingTotp: true });
  if (!adminCtx || adminCtx.session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Unauthorized administrator session." },
      { status: 401 }
    );
  }

  const result = await enrollAdminTotp(adminCtx.session.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      secret: result.bundle.secret,
      qrCodeDataUrl: result.bundle.qrCodeDataUrl,
      recoveryCodes: result.bundle.recoveryCodes,
    },
    { status: 200 }
  );
}

/**
 * POST /api/auth/admin/totp
 * Verifies a 6-digit TOTP authenticator code or recovery code and upgrades the
 * Admin session in Redis to `totpVerified: true` with a rotated session token.
 */
export async function POST(request: Request) {
  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { error: "Security token expired. Reload the page and try again." },
      { status: 403 }
    );
  }

  const adminCtx = await getCurrentAdminSession({ allowPendingTotp: true });
  if (!adminCtx || adminCtx.session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Admin session expired. Please sign in again." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = adminTotpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter a valid 6-digit authenticator code or recovery code.",
      },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  const verification = await verifyAdminSecondFactor(
    adminCtx.session.userId,
    parsed.data.code,
    ip
  );

  if (!verification.ok) {
    return NextResponse.json({ error: verification.message }, { status: 401 });
  }

  const rotated = await markAdminSessionTotpVerified(adminCtx.rawToken);
  if (rotated) {
    await setSessionCookie(rotated.rotatedRawToken, "ADMIN", rotated.ttlSeconds);
  }

  return NextResponse.json(
    {
      ok: true,
      usedRecoveryCode: verification.usedRecoveryCode,
    },
    { status: 200 }
  );
}
