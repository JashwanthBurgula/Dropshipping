const CLOUDFLARE_TEST_SECRET = "1x0000000000000000000000000000000AA";
export const MIN_FORM_SUBMIT_MS = 1200;

export interface BotCheckInput {
  honeypot?: string | undefined;
  formLoadedAt?: number | undefined;
  turnstileToken?: string | undefined;
  requireTurnstile: boolean;
  remoteIp?: string | undefined;
}

export interface BotCheckResult {
  passed: boolean;
  reason?: string;
}

/**
 * Verifies a Cloudflare Turnstile token against Cloudflare's siteverify endpoint,
 * or accepts official test tokens when using the Cloudflare test secret key locally.
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  remoteIp?: string
): Promise<boolean> {
  if (!token || token.trim().length === 0) {
    return false;
  }

  const secretKey =
    process.env.TURNSTILE_SECRET_KEY ?? CLOUDFLARE_TEST_SECRET;

  if (
    secretKey === CLOUDFLARE_TEST_SECRET &&
    (token === "XXXX.DUMMY.TOKEN.XXXX" || token.startsWith("test-turnstile-"))
  ) {
    return true;
  }

  try {
    const formData = new URLSearchParams();
    formData.set("secret", secretKey);
    formData.set("response", token);
    if (remoteIp) {
      formData.set("remoteip", remoteIp);
    }

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return secretKey === CLOUDFLARE_TEST_SECRET;
  }
}

/**
 * Enforces all three anti-bot checks on form submissions:
 * 1. Hidden honeypot field must be empty.
 * 2. Minimum human interaction time (MIN_FORM_SUBMIT_MS) must have elapsed since form render.
 * 3. Cloudflare Turnstile token must pass when required.
 */
export async function verifyBotProtection(
  input: BotCheckInput
): Promise<BotCheckResult> {
  if (input.honeypot && input.honeypot.trim().length > 0) {
    return {
      passed: false,
      reason: "Automated submission blocked.",
    };
  }

  if (typeof input.formLoadedAt === "number") {
    const elapsedMs = Date.now() - input.formLoadedAt;
    if (elapsedMs < MIN_FORM_SUBMIT_MS) {
      return {
        passed: false,
        reason:
          "Form submitted too quickly. Please review your entries and submit again.",
      };
    }
  }

  if (input.requireTurnstile) {
    const turnstileOk = await verifyTurnstileToken(
      input.turnstileToken,
      input.remoteIp
    );
    if (!turnstileOk) {
      return {
        passed: false,
        reason:
          "Security check failed or expired. Please complete the verification challenge and try again.",
      };
    }
  }

  return { passed: true };
}
