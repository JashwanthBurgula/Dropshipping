import { NextResponse } from "next/server";
import { changeUnverifiedEmailSchema } from "@/lib/validation/auth";
import { validateRequestCsrf } from "@/lib/csrf";
import { changeUnverifiedEmail } from "@/lib/auth/service";
import {
  getPendingVerificationFromCookie,
  setPendingVerificationCookie,
} from "@/lib/auth/verification-cookie";

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

  const parsed = changeUnverifiedEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ?? "Please check your email inputs.",
      },
      { status: 400 }
    );
  }

  const pendingCookie = await getPendingVerificationFromCookie();
  const currentEmail = parsed.data.currentEmail ?? pendingCookie?.email;

  if (!currentEmail) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        field: "currentEmail",
        message: "Enter the original email address you registered with.",
      },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";
  const result = await changeUnverifiedEmail({
    currentEmail,
    newEmail: parsed.data.newEmail,
    password: parsed.data.password,
    ipAddress: ip,
  });

  if (!result.ok) {
    const status =
      result.code === "COOLDOWN_ACTIVE" ||
      result.code === "HOURLY_LIMIT_EXCEEDED" ||
      result.code === "DAILY_LIMIT_EXCEEDED"
        ? 429
        : result.code === "EMAIL_DELIVERY_FAILED"
          ? 502
          : 400;
    const headers: Record<string, string> = {};
    if (result.retryAfterSeconds) {
      headers["Retry-After"] = String(result.retryAfterSeconds);
    }
    return NextResponse.json(result, { status, headers });
  }

  // Rotate the signed HttpOnly pending verification cookie to the new email address
  await setPendingVerificationCookie({
    email: result.newEmail,
    returnTo: pendingCookie?.returnTo,
  });

  return NextResponse.json(
    {
      ok: true,
      newEmail: result.newEmail,
      message: `We updated your email address to ${result.newEmail} and sent a fresh 6-digit verification code.`,
      verificationOtpForDev: result.verificationOtpForDev,
    },
    { status: 200 }
  );
}
