import { NextResponse } from "next/server";
import { validateRequestCsrf } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { verifyBotProtection } from "@/lib/turnstile";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/lib/auth/service";

export async function POST(request: Request) {
  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { error: "Security token expired. Reload the page and try again." },
      { status: 403 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = await checkRateLimit(RATE_LIMIT_RULES.passwordReset, ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Too many password reset requests. Please wait ${rl.retryAfterSeconds} seconds.`,
      },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const botCheck = await verifyBotProtection({
    honeypot: typeof body.honeypot === "string" ? body.honeypot : undefined,
    formLoadedAt:
      typeof body.formLoadedAt === "number" ? body.formLoadedAt : undefined,
    turnstileToken:
      typeof body.turnstileToken === "string"
        ? body.turnstileToken
        : "XXXX.DUMMY.TOKEN.XXXX",
    requireTurnstile: true,
    remoteIp: ip,
  });

  if (!botCheck.passed) {
    return NextResponse.json(
      { error: botCheck.reason ?? "Request blocked." },
      { status: 400 }
    );
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a valid email." },
      { status: 400 }
    );
  }

  const res = await requestPasswordReset(parsed.data.email, ip);

  return NextResponse.json(
    {
      ok: true,
      message:
        "If an account exists for that email address, we have sent a 1-hour password reset link.",
      devResetUrl:
        process.env.NODE_ENV !== "production" ? res.resetUrlForDev : undefined,
    },
    { status: 200 }
  );
}
