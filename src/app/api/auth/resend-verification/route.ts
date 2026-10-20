import { NextResponse } from "next/server";
import { resendVerificationSchema } from "@/lib/validation/auth";
import { validateRequestCsrf } from "@/lib/csrf";
import { verifyBotProtection } from "@/lib/turnstile";
import { resendVerificationEmail } from "@/lib/auth/service";
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

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = resendVerificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        field: "email",
        message:
          parsed.error.issues[0]?.message ?? "Enter a valid email address.",
      },
      { status: 400 }
    );
  }

  const pendingCookie = await getPendingVerificationFromCookie();
  const targetEmail = parsed.data.email ?? pendingCookie?.email;

  if (!targetEmail) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        field: "email",
        message: "Enter the email address you registered with.",
      },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";

  const botCheck = await verifyBotProtection({
    honeypot: parsed.data.honeypot,
    formLoadedAt: parsed.data.formLoadedAt,
    turnstileToken: parsed.data.turnstileToken,
    requireTurnstile: true,
    remoteIp: ip,
  });

  if (!botCheck.passed) {
    return NextResponse.json(
      {
        ok: false,
        code: "BOT_REJECTED",
        message:
          botCheck.reason ?? "Security check failed. Please try again.",
      },
      { status: 400 }
    );
  }

  const result = await resendVerificationEmail(targetEmail, ip);

  if (!result.ok) {
    const status =
      result.code === "COOLDOWN_ACTIVE" ||
      result.code === "HOURLY_LIMIT_EXCEEDED" ||
      result.code === "DAILY_LIMIT_EXCEEDED"
        ? 429
        : 502;
    const headers: Record<string, string> = {};
    if (result.retryAfterSeconds) {
      headers["Retry-After"] = String(result.retryAfterSeconds);
    }
    return NextResponse.json(result, { status, headers });
  }

  // Refresh the signed HttpOnly cookie so the user stays on /verify-email without email in the URL
  await setPendingVerificationCookie({
    email: targetEmail,
    returnTo: pendingCookie?.returnTo,
  });

  return NextResponse.json(result, { status: 200 });
}
