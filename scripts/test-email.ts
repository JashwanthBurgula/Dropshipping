import fs from "node:fs";
import path from "node:path";
import {
  EmailDeliveryError,
  resolveEmailProvider,
  sendVerificationOtpEmail,
} from "../src/lib/email";
import { generateSixDigitOtp } from "../src/lib/crypto";

function loadDotEnvIfPresent(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

async function main() {
  loadDotEnvIfPresent();

  const args = process.argv.slice(2);
  const allowConsole = args.includes("--allow-console");
  const recipient = args
    .find((arg) => arg.includes("@") && !arg.startsWith("--"))
    ?.trim();

  if (!recipient) {
    console.error(
      "Usage: npm run email:test -- <recipient-email@example.com> [--allow-console]"
    );
    process.exit(1);
  }

  const provider = resolveEmailProvider(process.env);
  console.info(`[Email Test] Active provider: ${provider}`);

  if (provider === "console" && !allowConsole) {
    console.error(
      `[ERROR] EMAIL_PROVIDER is set to "console". Refusing to run live delivery test with mock console adapter.\nTo test against the local development inbox, pass --allow-console:\n  npm run email:test -- ${recipient} --allow-console\nTo test real delivery, configure EMAIL_PROVIDER=smtp (with SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) or EMAIL_PROVIDER=resend in .env.`
    );
    process.exit(1);
  }

  const sampleOtp = generateSixDigitOtp();
  try {
    const result = await sendVerificationOtpEmail({
      to: recipient,
      fullName: "Kala & Kiln Test Recipient",
      otpCode: sampleOtp,
    });
    console.info(
      `[SUCCESS] Test email delivered via provider="${result.provider}" to="${result.to}" (id="${result.id}").`
    );
  } catch (err) {
    if (err instanceof EmailDeliveryError) {
      console.error(
        `[FAILURE] Email delivery failed via provider="${provider}": ${err.providerError}\nUser-facing message: ${err.userMessage}`
      );
    } else {
      console.error(
        `[FAILURE] Unexpected error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    process.exit(1);
  }
}

void main();
