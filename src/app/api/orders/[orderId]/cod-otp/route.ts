import { NextResponse } from "next/server";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { validateRequestCsrf } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import {
  resendCodOrderOtp,
  verifyCodOrderOtp,
} from "@/lib/orders/service";
import { verifyCodOtpSchema } from "@/lib/validation/checkout";

/**
 * POST /api/orders/[orderId]/cod-otp
 * Verifies the 6-digit Cash on Delivery OTP within the 10-minute window (max 5 attempts).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      {
        ok: false,
        code: "CSRF_INVALID",
        error: "Your security token expired. Reload the page and try again.",
      },
      { status: 403 }
    );
  }

  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Please sign in to verify your Cash on Delivery order.",
      },
      { status: 401 }
    );
  }

  const { orderId } = await context.params;
  const rl = await checkRateLimit(
    RATE_LIMIT_RULES.codOtp,
    `${session.userId}:${orderId}`
  );
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMITED",
        error: `Too many verification attempts. Please wait ${rl.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
        },
      }
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const parsed = verifyCodOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        error:
          parsed.error.issues[0]?.message ??
          "Enter a valid 6-digit verification code.",
      },
      { status: 400 }
    );
  }

  const result = await verifyCodOrderOtp({
    orderId: orderId.trim(),
    userId: session.userId,
    userEmail: session.email,
    otpCode: parsed.data.otpCode,
  });

  if (!result.ok) {
    const status =
      result.code === "ORDER_NOT_FOUND"
        ? 404
        : result.code === "COD_OTP_LOCKED"
          ? 429
          : 400;
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        remainingAttempts: result.remainingAttempts,
        error: result.message,
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      alreadyConfirmed: result.alreadyConfirmed,
      order: result.order,
    },
    { status: 200 }
  );
}

/**
 * PUT /api/orders/[orderId]/cod-otp
 * Resends a fresh 6-digit COD OTP after enforcing the 60-second resend cooldown.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      {
        ok: false,
        code: "CSRF_INVALID",
        error: "Your security token expired. Reload the page and try again.",
      },
      { status: 403 }
    );
  }

  const session = await getCurrentCustomerSession(request);
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Please sign in to resend your verification code.",
      },
      { status: 401 }
    );
  }

  const { orderId } = await context.params;
  const rl = await checkRateLimit(
    RATE_LIMIT_RULES.codOtp,
    `resend:${session.userId}:${orderId}`
  );
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMITED",
        error: `Too many resend requests. Please wait ${rl.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
        },
      }
    );
  }

  const result = await resendCodOrderOtp({
    orderId: orderId.trim(),
    userId: session.userId,
    userEmail: session.email,
  });

  if (!result.ok) {
    if (result.code === "COD_OTP_COOLDOWN") {
      const retrySeconds = Math.max(1, result.retryAfterSeconds ?? 60);
      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          retryAfterSeconds: retrySeconds,
          error: result.message,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retrySeconds),
          },
        }
      );
    }

    const status =
      result.code === "ORDER_NOT_FOUND"
        ? 404
        : result.code === "COD_OTP_LOCKED"
          ? 429
          : 400;

    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        error: result.message,
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      codOtpExpiresAt: result.codOtpExpiresAt,
      codOtpForDev: result.codOtpForDev,
      message: result.message,
    },
    { status: 200 }
  );
}
