import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation/auth";
import { validateRequestCsrf } from "@/lib/csrf";
import { verifyBotProtection } from "@/lib/turnstile";
import { checkPasswordPwnedRangeApi } from "@/lib/auth/password";
import { registerCustomer } from "@/lib/auth/service";
import { setPendingVerificationCookie } from "@/lib/auth/verification-cookie";

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

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        field: firstIssue?.path[0] ? String(firstIssue.path[0]) : undefined,
        message:
          firstIssue?.message ?? "Please check the highlighted form fields.",
        issues: parsed.error.flatten().fieldErrors,
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

  // Server-side Have I Been Pwned k-anonymity range check (5-char SHA-1 prefix, 2500ms timeout, fails open on network outage)
  const pwnedCheck = await checkPasswordPwnedRangeApi(parsed.data.password);
  if (pwnedCheck.pwned) {
    return NextResponse.json(
      {
        ok: false,
        code: "PASSWORD_BREACHED",
        field: "password",
        message:
          "This password appears in public data breaches. Choose a unique passphrase with at least 10 characters.",
      },
      { status: 400 }
    );
  }

  const userAgent = request.headers.get("user-agent");
  const result = await registerCustomer(parsed.data, {
    ipAddress: ip,
    userAgent,
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
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        field: result.field,
        retryAfterSeconds: result.retryAfterSeconds,
        message: result.message,
      },
      { status, headers }
    );
  }

  // Keep the email address and returnTo in a short-lived signed HttpOnly cookie, NEVER in the URL
  await setPendingVerificationCookie({
    email: result.email,
    returnTo: parsed.data.returnTo,
  });

  return NextResponse.json(
    {
      ok: true,
      message: result.message,
      redirectUrl: "/verify-email",
      verificationOtpForDev: result.verificationOtpForDev,
    },
    { status: 201 }
  );
}
