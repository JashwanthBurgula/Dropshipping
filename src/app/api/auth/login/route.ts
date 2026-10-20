import { NextResponse } from "next/server";
import { validateRequestCsrf } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { verifyBotProtection } from "@/lib/turnstile";
import { loginSchema } from "@/lib/validation/auth";
import {
  doesEmailRequireTurnstileOnLogin,
  loginCustomer,
} from "@/lib/auth/service";
import { readCookieSessionToken, setSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      {
        error:
          "Your security token expired. Reload the page and sign in again.",
      },
      { status: 403 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = await checkRateLimit(RATE_LIMIT_RULES.login, ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Too many sign-in attempts. Please wait ${rl.retryAfterSeconds} seconds before trying again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
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
  if (!body) {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "form");
      if (!fieldErrors[k]) {
        fieldErrors[k] = issue.message;
      }
    }
    return NextResponse.json(
      {
        error: "Enter a valid email address and password.",
        fieldErrors,
      },
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
        error: botCheck.reason ?? "Security check required.",
        requireTurnstile: true,
      },
      { status: 400 }
    );
  }

  const previousRawToken = await readCookieSessionToken("CUSTOMER");

  const result = await loginCustomer(
    {
      email: parsed.data.email,
      password: parsed.data.password,
      previousRawSessionToken: previousRawToken,
    },
    ip
  );

  if (!result.ok) {
    if (
      result.code === "LOGIN_BACKOFF_ACTIVE" ||
      result.code === "IP_RATE_LIMITED"
    ) {
      const retrySeconds = Math.max(1, result.retryAfterSeconds ?? 1);
      return NextResponse.json(
        {
          error: result.message,
          code: result.code,
          requireTurnstile: result.requireTurnstile,
          retryAfterSeconds: retrySeconds,
          notBeforeEpochMs: result.notBeforeEpochMs ?? null,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retrySeconds),
          },
        }
      );
    }

    return NextResponse.json(
      {
        error: result.message,
        code: result.code,
        requireTurnstile: result.requireTurnstile,
        notBeforeEpochMs: result.notBeforeEpochMs ?? null,
        retryAfterSeconds: result.retryAfterSeconds ?? 0,
      },
      { status: 401 }
    );
  }

  await setSessionCookie(
    result.rawSessionToken,
    result.session.role,
    result.ttlSeconds
  );

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: result.session.userId,
        email: result.session.email,
        fullName: result.session.fullName,
        role: result.session.role,
      },
    },
    { status: 200 }
  );
}
