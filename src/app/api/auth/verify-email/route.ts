import { NextResponse } from "next/server";
import { verifyEmailOtpSchema } from "@/lib/validation/auth";
import { validateRequestCsrf } from "@/lib/csrf";
import { verifyEmailOtp } from "@/lib/auth/service";
import {
  getRawSessionTokenFromCookie,
  setRotatedSessionCookie,
} from "@/lib/auth/session";
import {
  clearPendingVerificationCookie,
  getPendingVerificationFromCookie,
  sanitizeReturnToPath,
} from "@/lib/auth/verification-cookie";

/**
 * Returns the pending verification email from the signed HttpOnly cookie
 * so the /verify-email page can display the address without placing it in the URL.
 */
export async function GET() {
  const pending = await getPendingVerificationFromCookie();
  if (!pending) {
    return NextResponse.json(
      {
        ok: true,
        pending: false,
        email: null,
        returnTo: "/catalogue",
        isDevelopment: process.env.NODE_ENV === "development",
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      pending: true,
      email: pending.email,
      returnTo: pending.returnTo,
      isDevelopment: process.env.NODE_ENV === "development",
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      {
        ok: false,
        code: "CSRF_INVALID",
        message: "Security token expired. Reload the page and try again.",
      },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = verifyEmailOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        field: "code",
        message:
          parsed.error.issues[0]?.message ??
          "Enter the 6-digit numeric verification code sent to your email.",
      },
      { status: 400 }
    );
  }

  const pendingCookie = await getPendingVerificationFromCookie();
  const targetEmail = pendingCookie?.email ?? parsed.data.email;
  const returnTo = sanitizeReturnToPath(
    parsed.data.returnTo ?? pendingCookie?.returnTo
  );

  if (!targetEmail) {
    return NextResponse.json(
      {
        ok: false,
        code: "MISSING_PENDING_EMAIL",
        field: "code",
        message:
          "Your verification session expired. Enter your email below to request a fresh 6-digit code.",
      },
      { status: 400 }
    );
  }

  const previousRawSessionToken = await getRawSessionTokenFromCookie();
  const result = await verifyEmailOtp({
    email: targetEmail,
    code: parsed.data.code,
    previousRawSessionToken,
  });

  if (!result.ok) {
    const status = result.code === "OTP_MAX_ATTEMPTS" ? 429 : 400;
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        field: "code",
        attemptsRemaining: result.attemptsRemaining,
        message: result.message,
      },
      { status }
    );
  }

  // Sign the user in with a freshly rotated session cookie and clear the pending verification cookie
  try {
    await setRotatedSessionCookie(
      result.rawSessionToken,
      result.role,
      result.ttlSeconds
    );
    await clearPendingVerificationCookie();
  } catch (cookieErr) {
    console.error("[Session Cookie Error] Failed to set session cookie on verify-email:", cookieErr);
    return NextResponse.json(
      {
        ok: false,
        code: "SESSION_COOKIE_FAILED",
        message: "An internal error occurred while setting your secure session cookie.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message: "Your email address is verified. Signing you in now.",
      redirectTo: returnTo,
      user: {
        id: result.userId,
        email: result.email,
        fullName: result.fullName,
        role: result.role,
      },
    },
    { status: 200 }
  );
}
