import { NextResponse } from "next/server";
import { validateRequestCsrf } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { verifyBotProtection } from "@/lib/turnstile";
import { loginSchema } from "@/lib/validation/auth";
import {
  doesEmailRequireTurnstileOnLogin,
  loginAdminStepOne,
} from "@/lib/auth/service";
import { readCookieSessionToken, setSessionCookie } from "@/lib/auth/session";

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
  const rl = await checkRateLimit(RATE_LIMIT_RULES.adminLogin, ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Too many admin login attempts. Please wait ${rl.retryAfterSeconds} seconds.`,
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid administrator email and password." },
      { status: 400 }
    );
  }

  const requireTurnstile = await doesEmailRequireTurnstileOnLogin(
    parsed.data.email,
    ip
  );
  const botCheck = await verifyBotProtection({
    honeypot: parsed.data.honeypot,
    formLoadedAt: parsed.data.formLoadedAt,
    turnstileToken: parsed.data.turnstileToken,
    requireTurnstile,
    remoteIp: ip,
  });

  if (!botCheck.passed) {
    return NextResponse.json(
      {
        error: botCheck.reason ?? "Security challenge required.",
        requireTurnstile: true,
      },
      { status: 400 }
    );
  }

  const previousRawToken = await readCookieSessionToken("ADMIN");

  const result = await loginAdminStepOne(
    {
      email: parsed.data.email,
      password: parsed.data.password,
      previousRawSessionToken: previousRawToken,
    },
    ip
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.message,
        requireTurnstile: result.requireTurnstile,
      },
      { status: 401 }
    );
  }

  await setSessionCookie(result.rawSessionToken, "ADMIN", result.ttlSeconds);

  return NextResponse.json(
    {
      ok: true,
      totpEnabled: result.totpEnabled,
      mustChangePassword: result.mustChangePassword,
      requiresTwoFactor: true,
    },
    { status: 200 }
  );
}
