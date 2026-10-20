import { NextResponse } from "next/server";
import { validateRequestCsrf } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { verifyBotProtection } from "@/lib/turnstile";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { resetPasswordWithToken } from "@/lib/auth/service";

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
        error: `Too many reset attempts. Please wait ${rl.retryAfterSeconds} seconds.`,
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
    requireTurnstile: false,
    remoteIp: ip,
  });

  if (!botCheck.passed) {
    return NextResponse.json(
      { error: botCheck.reason ?? "Request blocked." },
      { status: 400 }
    );
  }

  const parsed = resetPasswordSchema.safeParse(body);
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
        error:
          parsed.error.issues[0]?.message ??
          "Please fix the highlighted password errors.",
        fieldErrors,
      },
      { status: 400 }
    );
  }

  const result = await resetPasswordWithToken(
    parsed.data.token,
    parsed.data.newPassword,
    ip
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
