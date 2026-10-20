import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { brandConfig, shouldEnforceProductionBrandPlaceholders } from "../../config/brand";

export type EmailProviderType = "smtp" | "resend" | "console";

export const USER_FACING_EMAIL_DELIVERY_ERROR =
  "We could not send the email. Try again in a minute.";

export class EmailDeliveryError extends Error {
  public readonly userMessage: string;
  public readonly providerError: string;

  constructor(providerError: string, userMessage: string = USER_FACING_EMAIL_DELIVERY_ERROR) {
    super(userMessage);
    this.name = "EmailDeliveryError";
    this.userMessage = userMessage;
    this.providerError = providerError;
  }
}

export interface EmailMessage {
  id: string;
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  sentAt: string;
  provider: EmailProviderType;
  metadata?: Record<string, string>;
}

const LOCAL_INBOX_FILE = path.join(process.cwd(), ".local-inbox.json");
const inMemoryInbox: EmailMessage[] = [];

const globalForEmail = globalThis as unknown as {
  __kalaEmailBannerPrinted?: boolean;
  __kalaSimulateEmailFailureForTests?: boolean;
};

export function setSimulateEmailFailureForTests(shouldFail: boolean): void {
  globalForEmail.__kalaSimulateEmailFailureForTests = shouldFail;
}

export function isPlaceholderEmailValue(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower === "re_placeholder" ||
    lower.includes("placeholder") ||
    lower.includes("your-app-password") ||
    lower.includes("your_app_password") ||
    lower.includes("your-email") ||
    lower.includes("your_email") ||
    lower.includes("changeme") ||
    lower.startsWith("re_123") ||
    lower.startsWith("re_test_placeholder")
  );
}

export function resolveEmailProvider(
  env: NodeJS.ProcessEnv = process.env
): EmailProviderType {
  const raw = (env.EMAIL_PROVIDER ?? "console").trim().toLowerCase();
  if (raw === "console" || raw === "local" || raw === "") {
    return "console";
  }
  if (raw === "smtp") {
    return "smtp";
  }
  if (raw === "resend") {
    return "resend";
  }
  throw new Error(
    `FATAL EMAIL CONFIG CHECK: Invalid EMAIL_PROVIDER="${env.EMAIL_PROVIDER}". Expected "smtp", "resend", or "console".`
  );
}

/**
 * Validates the active email provider configuration.
 * In production, refuses to start with the "console" provider or placeholder credentials.
 */
export function assertEmailProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
  options?: { enforceProduction?: boolean }
): { provider: EmailProviderType; from: string } {
  const provider = resolveEmailProvider(env);
  const from = (
    env.EMAIL_FROM ?? `${brandConfig.name} <${brandConfig.supportEmail}>`
  ).trim();
  const isProd =
    options?.enforceProduction ??
    (env.NODE_ENV === "production" && shouldEnforceProductionBrandPlaceholders(env));

  if (isProd) {
    if (provider === "console") {
      throw new Error(
        "FATAL EMAIL CONFIG CHECK: EMAIL_PROVIDER cannot be 'console' in production. Configure 'smtp' or 'resend' with real credentials."
      );
    }
    if (!env.EMAIL_FROM || isPlaceholderEmailValue(env.EMAIL_FROM)) {
      throw new Error(
        "FATAL EMAIL CONFIG CHECK: EMAIL_FROM must be explicitly configured with a real sender address in production."
      );
    }
  }

  if (provider === "smtp") {
    const host = env.SMTP_HOST?.trim();
    const portRaw = env.SMTP_PORT?.trim();
    const user = env.SMTP_USER?.trim();
    const pass = env.SMTP_PASS?.trim();

    if (
      !host ||
      !portRaw ||
      !user ||
      !pass ||
      isPlaceholderEmailValue(host) ||
      isPlaceholderEmailValue(user) ||
      isPlaceholderEmailValue(pass)
    ) {
      throw new Error(
        "FATAL EMAIL CONFIG CHECK: EMAIL_PROVIDER='smtp' requires non-placeholder SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM."
      );
    }
    const port = Number(portRaw);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(
        `FATAL EMAIL CONFIG CHECK: Invalid SMTP_PORT="${portRaw}". Must be an integer between 1 and 65535.`
      );
    }
  }

  if (provider === "resend") {
    const apiKey = env.RESEND_API_KEY?.trim();
    if (!apiKey || isPlaceholderEmailValue(apiKey)) {
      throw new Error(
        "FATAL EMAIL CONFIG CHECK: EMAIL_PROVIDER='resend' requires a valid non-placeholder RESEND_API_KEY."
      );
    }
  }

  return { provider, from };
}

export function sanitizeProviderErrorMessage(
  rawError: unknown,
  env: NodeJS.ProcessEnv = process.env
): string {
  let msg =
    rawError instanceof Error
      ? rawError.message
      : typeof rawError === "string"
        ? rawError
        : "Unknown email transport error";

  const secretsToScrub = [
    env.SMTP_PASS,
    env.RESEND_API_KEY,
    process.env.SMTP_PASS,
    process.env.RESEND_API_KEY,
  ].filter((val): val is string => Boolean(val && val.trim().length >= 4));

  for (const secret of secretsToScrub) {
    msg = msg.split(secret).join("[REDACTED]");
  }
  msg = msg.replace(/re_[A-Za-z0-9_]{8,}/g, "[REDACTED_API_KEY]");
  return msg;
}

export function formatEmailStartupBanner(
  env: NodeJS.ProcessEnv = process.env
): string {
  const provider = resolveEmailProvider(env);
  const from = (
    env.EMAIL_FROM ?? `${brandConfig.name} <${brandConfig.supportEmail}>`
  ).trim();

  if (provider === "smtp") {
    const host = env.SMTP_HOST?.trim() || "unconfigured-host";
    const port = env.SMTP_PORT?.trim() || "587";
    const secure = env.SMTP_SECURE === "true" ? "true" : "false";
    return `[Email Service] Active provider: smtp (${host}:${port}, secure=${secure}) | From: ${from}`;
  }

  if (provider === "resend") {
    return `[Email Service] Active provider: resend (api.resend.com) | From: ${from}`;
  }

  return `[Email Service] Active provider: console (local dev inbox capture at .local-inbox.json) | From: ${from}`;
}

export function isTransientSmtpError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  const responseCode = (err as { responseCode?: number }).responseCode;
  if (typeof responseCode === "number" && responseCode >= 400 && responseCode < 500) {
    return true;
  }
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "EHOSTUNREACH" ||
    code === "ENOTFOUND"
  ) {
    return true;
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    msg.includes("timeout") ||
    msg.includes("temporar") ||
    msg.includes("rate limit") ||
    msg.includes("try again") ||
    msg.includes("busy")
  );
}

export async function verifySmtpTransporter(
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const provider = resolveEmailProvider(env);
  if (provider !== "smtp") {
    return true;
  }

  const host = env.SMTP_HOST?.trim() || "unconfigured-host";
  const port = Number(env.SMTP_PORT?.trim() || "587");
  const secure =
    env.SMTP_SECURE === "true" ||
    (env.SMTP_SECURE === undefined && port === 465);
  const user = env.SMTP_USER?.trim() || "";
  const pass = env.SMTP_PASS?.trim() || "";

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    await transporter.verify();
    console.info(
      `[Email Service] SMTP connection verified successfully (${host}:${port}, secure=${secure})`
    );
    return true;
  } catch (err) {
    const sanitized = sanitizeProviderErrorMessage(err, env);
    console.error(
      `[Email Service] SMTP connection verification failed (${host}:${port}): ${sanitized}`
    );
    return false;
  }
}

export function printEmailStartupBannerOnce(
  env: NodeJS.ProcessEnv = process.env
): void {
  if (globalForEmail.__kalaEmailBannerPrinted) {
    return;
  }
  globalForEmail.__kalaEmailBannerPrinted = true;
  try {
    const banner = formatEmailStartupBanner(env);
    console.info(banner);
    if (resolveEmailProvider(env) === "smtp" && env.NODE_ENV !== "test") {
      void verifySmtpTransporter(env);
    }
  } catch {
    // Config validation errors are surfaced when assertEmailProviderConfig or sendEmail runs
  }
}

function appendToLocalInbox(msg: EmailMessage): void {
  inMemoryInbox.unshift(msg);
  if (inMemoryInbox.length > 100) {
    inMemoryInbox.pop();
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.DEPLOYMENT_TARGET !== "local-preview"
  ) {
    return;
  }

  try {
    let existing: EmailMessage[] = [];
    if (fs.existsSync(LOCAL_INBOX_FILE)) {
      const raw = fs.readFileSync(LOCAL_INBOX_FILE, "utf8");
      existing = JSON.parse(raw) as EmailMessage[];
    }
    existing.unshift(msg);
    fs.writeFileSync(
      LOCAL_INBOX_FILE,
      JSON.stringify(existing.slice(0, 50), null, 2),
      "utf8"
    );
  } catch {
    // Non-fatal if filesystem is read-only
  }
}

export function getLocalInboxMessages(recipientEmail?: string): EmailMessage[] {
  let messages = [...inMemoryInbox];
  if (
    messages.length === 0 &&
    process.env.NODE_ENV !== "test" &&
    fs.existsSync(LOCAL_INBOX_FILE)
  ) {
    try {
      messages = JSON.parse(
        fs.readFileSync(LOCAL_INBOX_FILE, "utf8")
      ) as EmailMessage[];
    } catch {
      messages = [];
    }
  }

  if (recipientEmail) {
    const normalized = recipientEmail.trim().toLowerCase();
    return messages.filter((m) => m.to.toLowerCase() === normalized);
  }
  return messages;
}

export function clearLocalInboxForTests(): void {
  inMemoryInbox.length = 0;
}

/**
 * Sends a transactional email via the active provider ("smtp", "resend", or "console").
 * Never fails silently: logs the sanitized provider error and throws EmailDeliveryError.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  metadata?: Record<string, string>;
}): Promise<EmailMessage> {
  printEmailStartupBannerOnce();

  if (globalForEmail.__kalaSimulateEmailFailureForTests) {
    const simulatedErr = "Simulated SMTP/provider transport failure";
    console.error(`[Email Delivery Error] ${simulatedErr}`);
    throw new EmailDeliveryError(simulatedErr);
  }

  let config: { provider: EmailProviderType; from: string };
  try {
    config = assertEmailProviderConfig(process.env);
  } catch (err) {
    const cleanErr = sanitizeProviderErrorMessage(err);
    console.error(`[Email Config Error] ${cleanErr}`);
    throw new EmailDeliveryError(cleanErr);
  }

  const { provider, from } = config;
  const message: EmailMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    to: params.to,
    from,
    subject: params.subject,
    html: params.html,
    text: params.text,
    sentAt: new Date().toISOString(),
    provider,
    metadata: params.metadata,
  };

  if (provider === "smtp") {
    const host = process.env.SMTP_HOST!.trim();
    const port = Number(process.env.SMTP_PORT!.trim());
    const secure =
      process.env.SMTP_SECURE === "true" ||
      (process.env.SMTP_SECURE === undefined && port === 465);
    const user = process.env.SMTP_USER!.trim();
    const pass = process.env.SMTP_PASS!.trim();

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    let lastSmtpErr: unknown = null;
    for (let sendAttempt = 1; sendAttempt <= 2; sendAttempt++) {
      try {
        await transporter.sendMail({
          from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        });
        lastSmtpErr = null;
        break;
      } catch (err) {
        lastSmtpErr = err;
        if (sendAttempt === 1 && isTransientSmtpError(err)) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        break;
      }
    }

    if (lastSmtpErr) {
      const sanitized = sanitizeProviderErrorMessage(lastSmtpErr);
      console.error(
        `[Email Delivery Error] Provider=smtp To=${params.to} Error=${sanitized}`
      );
      throw new EmailDeliveryError(sanitized, USER_FACING_EMAIL_DELIVERY_ERROR);
    }

    if (
      process.env.NODE_ENV !== "production" ||
      process.env.DEPLOYMENT_TARGET === "local-preview" ||
      process.env.NEXT_PUBLIC_ALLOW_LOCAL_INBOX === "true"
    ) {
      appendToLocalInbox(message);
    }
    return message;
  }

  if (provider === "resend") {
    const resendKey = process.env.RESEND_API_KEY!.trim();
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        throw new Error(
          `Resend HTTP ${res.status}: ${bodyText || res.statusText}`
        );
      }

      if (process.env.NODE_ENV === "development") {
        appendToLocalInbox(message);
      }
      return message;
    } catch (err) {
      const sanitized = sanitizeProviderErrorMessage(err);
      console.error(
        `[Email Delivery Error] Provider=resend To=${params.to} Error=${sanitized}`
      );
      throw new EmailDeliveryError(sanitized);
    }
  }

  // Console / local development inbox adapter
  appendToLocalInbox(message);
  if (process.env.NODE_ENV !== "test") {
    console.info(
      `[Console Email] To: ${message.to} | Subject: ${message.subject}`
    );
  }
  return message;
}

/**
 * Sends a 6-digit single-use verification OTP email.
 * Strictly contains NO links the user must click, no em dashes, and no emoji.
 */
export async function sendVerificationOtpEmail(params: {
  to: string;
  fullName: string;
  otpCode: string;
}): Promise<EmailMessage> {
  const subject = `Your ${brandConfig.name} verification code`;
  const text = [
    `Hello ${params.fullName},`,
    "",
    `Your ${brandConfig.name} email verification code is:`,
    "",
    params.otpCode,
    "",
    "This code expires in 10 minutes and can only be used once.",
    "Enter this 6-digit code on the verification screen to activate your account.",
    "",
    "If you did not request this code, you can safely ignore this message.",
  ].join("\n");

  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #101828; background: #FFFFFF; padding: 32px; max-width: 540px; border: 1px solid #DDE1E6; border-radius: 8px;">
      <p style="font-size: 14px; font-weight: 700; letter-spacing: 0.04em; color: #0F2742; margin: 0 0 16px;">${brandConfig.name}</p>
      <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 16px; color: #101828;">Your verification code</h1>
      <p style="font-size: 15px; line-height: 1.6; color: #475467; margin: 0 0 20px;">
        Hello ${params.fullName}, enter the 6-digit verification code below to confirm your email address:
      </p>
      <div style="background: #F5F6F7; border: 1px solid #DDE1E6; border-radius: 4px; padding: 20px 24px; text-align: center; margin: 0 0 20px;">
        <span style="font-family: monospace; font-size: 34px; font-weight: 700; letter-spacing: 0.28em; color: #0F2742; display: inline-block;">${params.otpCode}</span>
      </div>
      <p style="font-size: 14px; line-height: 1.5; color: #101828; margin: 0 0 12px;">
        <strong>Expiry time:</strong> This code expires in 10 minutes and can only be used once.
      </p>
      <p style="font-size: 13px; line-height: 1.5; color: #475467; margin: 16px 0 0;">
        If you did not request this code, you can safely ignore this message.
      </p>
    </div>
  `.trim();

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
    metadata: {
      type: "EMAIL_VERIFICATION_OTP",
      otpCode: params.otpCode,
    },
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  fullName: string;
  resetUrl: string;
}): Promise<EmailMessage> {
  const subject = `Reset your ${brandConfig.name} password`;
  const text = `Hello ${params.fullName},\n\nWe received a request to reset the password for your ${brandConfig.name} account. This link expires in 30 minutes and can only be used once:\n\n${params.resetUrl}\n\nIf you did not request a password reset, no changes have been made to your account.`;
  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #101828; background: #FFFFFF; padding: 32px; max-width: 540px; border: 1px solid #DDE1E6; border-radius: 8px;">
      <p style="font-size: 14px; font-weight: 700; letter-spacing: 0.04em; color: #0F2742; margin: 0 0 16px;">${brandConfig.name}</p>
      <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 16px; color: #101828;">Reset your password</h1>
      <p style="font-size: 15px; line-height: 1.6; color: #475467; margin: 0 0 24px;">
        Hello ${params.fullName}, use the link below within 30 minutes to choose a new password. Resetting your password will sign out all active sessions.
      </p>
      <p style="margin: 0 0 24px;">
        <a href="${params.resetUrl}" style="display: inline-block; background: #1D4ED8; color: #FFFFFF; text-decoration: none; padding: 12px 20px; border-radius: 4px; font-size: 14px; font-weight: 600;">
          Choose a new password
        </a>
      </p>
      <p style="font-size: 13px; color: #475467; word-break: break-all;">
        Direct link: ${params.resetUrl}
      </p>
    </div>
  `.trim();

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
    metadata: {
      type: "PASSWORD_RESET",
      resetUrl: params.resetUrl,
    },
  });
}

export async function sendAccountAlreadyExistsEmail(params: {
  to: string;
  fullName: string;
  loginUrl: string;
  forgotPasswordUrl: string;
}): Promise<EmailMessage> {
  const subject = `Account already exists on ${brandConfig.name}`;
  const text = `Hello ${params.fullName},\n\nSomeone recently tried to register a new ${brandConfig.name} account using your email address (${params.to}).\n\nBecause an account already exists for this address, no new account was created. You can sign in at:\n${params.loginUrl}\n\nOr reset your password at:\n${params.forgotPasswordUrl}\n\nIf this was not you, you can safely ignore this message.`;
  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #101828; background: #FFFFFF; padding: 32px; max-width: 540px; border: 1px solid #DDE1E6; border-radius: 8px;">
      <p style="font-size: 14px; font-weight: 700; letter-spacing: 0.04em; color: #0F2742; margin: 0 0 16px;">${brandConfig.name}</p>
      <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 16px; color: #101828;">Account already exists</h1>
      <p style="font-size: 15px; line-height: 1.6; color: #475467; margin: 0 0 16px;">
        Hello ${params.fullName}, we received a request to create a new ${brandConfig.name} account with this email address. Because an account is already registered to you, no changes were made.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #475467; margin: 0 0 24px;">
        You can <a href="${params.loginUrl}" style="color: #1D4ED8; font-weight: 600;">sign in to your account</a> or <a href="${params.forgotPasswordUrl}" style="color: #1D4ED8; font-weight: 600;">reset your password</a> if you forgot your credentials.
      </p>
    </div>
  `.trim();

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
    metadata: {
      type: "ACCOUNT_ALREADY_EXISTS",
      loginUrl: params.loginUrl,
      forgotPasswordUrl: params.forgotPasswordUrl,
    },
  });
}

export async function sendCodOtpEmail(params: {
  to: string;
  fullName: string;
  orderId: string;
  otpCode: string;
  amountFormatted: string;
}): Promise<EmailMessage> {
  const subject = `Confirm Cash on Delivery for order ${params.orderId}`;
  const text = [
    `Hello ${params.fullName},`,
    "",
    `Your Cash on Delivery verification code for order ${params.orderId} (${params.amountFormatted}) is:`,
    "",
    params.otpCode,
    "",
    "This code expires in 10 minutes and can only be used once.",
    "If you did not place this order, you can safely ignore this message.",
  ].join("\n");

  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #101828; background: #FFFFFF; padding: 32px; max-width: 540px; border: 1px solid #DDE1E6; border-radius: 8px;">
      <p style="font-size: 14px; font-weight: 700; letter-spacing: 0.04em; color: #0F2742; margin: 0 0 16px;">${brandConfig.name}</p>
      <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 16px; color: #101828;">Confirm your Cash on Delivery order</h1>
      <p style="font-size: 15px; line-height: 1.6; color: #475467; margin: 0 0 16px;">
        Hello ${params.fullName}, enter the 6-digit code below within 10 minutes to confirm order <strong>${params.orderId}</strong> (${params.amountFormatted}):
      </p>
      <div style="background: #F5F6F7; border: 1px solid #DDE1E6; border-radius: 4px; padding: 18px 24px; text-align: center; margin: 0 0 18px;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 0.25em; color: #0F2742;">${params.otpCode}</span>
      </div>
      <p style="font-size: 13px; color: #475467; margin: 0;">
        If you did not place this order, you can safely ignore this message.
      </p>
    </div>
  `.trim();

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
    metadata: {
      type: "COD_OTP",
      orderId: params.orderId,
      otpCode: params.otpCode,
    },
  });
}

export async function sendOrderConfirmationReceiptEmail(params: {
  to: string;
  fullName: string;
  orderId: string;
  paymentMethodLabel: string;
  paymentStatusLabel: string;
  shippingAddressBlock: string;
  predictedDeliveryWindow: string;
  isIntraState: boolean;
  items: Array<{
    productName: string;
    sku: string;
    hsnCode: string;
    quantity: number;
    unitPriceFormatted: string;
    lineTotalFormatted: string;
    taxSlabPercent: number;
  }>;
  hsnSummary: Array<{
    hsnCode: string;
    taxSlabPercent: number;
    taxableFormatted: string;
    cgstFormatted: string;
    sgstFormatted: string;
    igstFormatted: string;
    totalTaxFormatted: string;
  }>;
  taxableSubtotalFormatted: string;
  taxTotalFormatted: string;
  shippingFormatted: string;
  grandTotalFormatted: string;
}): Promise<EmailMessage> {
  const subject = `Order receipt ${params.orderId} (${brandConfig.name})`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const itemLines = params.items
    .map(
      (i) =>
        `- ${i.productName} (SKU: ${i.sku}, HSN: ${i.hsnCode}) x${i.quantity}: ${i.lineTotalFormatted} (GST ${i.taxSlabPercent}%)`
    )
    .join("\n");

  const hsnLines = params.hsnSummary
    .map((row) =>
      params.isIntraState
        ? `  HSN ${row.hsnCode} (${row.taxSlabPercent}%): Taxable ${row.taxableFormatted}, CGST ${row.cgstFormatted}, SGST ${row.sgstFormatted}, Total Tax ${row.totalTaxFormatted}`
        : `  HSN ${row.hsnCode} (${row.taxSlabPercent}%): Taxable ${row.taxableFormatted}, IGST ${row.igstFormatted}, Total Tax ${row.totalTaxFormatted}`
    )
    .join("\n");

  const text = [
    `Hello ${params.fullName},`,
    "",
    `Thank you for your order with ${brandConfig.name}.`,
    `Order ID: ${params.orderId}`,
    `Seller GSTIN: ${brandConfig.gstinPlaceholder}`,
    `Payment: ${params.paymentMethodLabel} (${params.paymentStatusLabel})`,
    `Estimated delivery: ${params.predictedDeliveryWindow}`,
    `Shipping address: ${params.shippingAddressBlock}`,
    "",
    "Items:",
    itemLines,
    "",
    "Tax breakdown by HSN:",
    hsnLines,
    "",
    `Taxable subtotal: ${params.taxableSubtotalFormatted}`,
    `Total GST: ${params.taxTotalFormatted}`,
    `Shipping: ${params.shippingFormatted}`,
    `Grand total: ${params.grandTotalFormatted}`,
    "",
    "Policy information:",
    `- Terms of Service: ${baseUrl}/legal/terms`,
    `- Privacy Policy: ${baseUrl}/legal/privacy`,
    `- Shipping Policy: ${baseUrl}/legal/shipping`,
    `- Returns and Cancellations: ${baseUrl}/legal/returns`,
  ].join("\n");

  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #101828; background: #FFFFFF; padding: 32px; max-width: 600px; border: 1px solid #DDE1E6; border-radius: 8px;">
      <p style="font-size: 14px; font-weight: 700; letter-spacing: 0.04em; color: #0F2742; margin: 0 0 16px;">${brandConfig.name}</p>
      <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 12px; color: #101828;">Order receipt: ${params.orderId}</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #101828; margin: 0 0 12px;">
        Hello ${params.fullName}, your order is confirmed. Estimated delivery: <strong>${params.predictedDeliveryWindow}</strong>.
      </p>
      <p style="font-size: 13px; color: #475467; line-height: 1.5; margin: 0 0 16px;">
        Seller GSTIN: ${brandConfig.gstinPlaceholder}<br />
        Payment: ${params.paymentMethodLabel} (${params.paymentStatusLabel})<br />
        Delivering to: ${params.shippingAddressBlock}
      </p>
      <p style="font-size: 14px; font-weight: 600; color: #101828; margin: 0 0 16px;">
        Grand total: ${params.grandTotalFormatted} (Taxable: ${params.taxableSubtotalFormatted}, GST: ${params.taxTotalFormatted}, Shipping: ${params.shippingFormatted})
      </p>
      <hr style="border: 0; border-top: 1px solid #DDE1E6; margin: 20px 0;" />
      <p style="font-size: 12px; color: #475467; line-height: 1.5; margin: 0;">
        <a href="${baseUrl}/legal/terms" style="color: #1D4ED8; text-decoration: underline;">Terms</a> |
        <a href="${baseUrl}/legal/privacy" style="color: #1D4ED8; text-decoration: underline;">Privacy</a> |
        <a href="${baseUrl}/legal/shipping" style="color: #1D4ED8; text-decoration: underline;">Shipping</a> |
        <a href="${baseUrl}/legal/returns" style="color: #1D4ED8; text-decoration: underline;">Returns</a>
      </p>
    </div>
  `.trim();

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
    metadata: {
      type: "ORDER_CONFIRMATION_RECEIPT",
      orderId: params.orderId,
    },
  });
}
