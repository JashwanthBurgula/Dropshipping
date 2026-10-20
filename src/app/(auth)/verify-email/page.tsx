"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Mail,
  RefreshCw,
  AlertCircle,
  Edit3,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { CSRF_HEADER_NAME } from "@/lib/csrf";

function VerifyEmailContent() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [returnTo, setReturnTo] = useState("/catalogue");
  const [isDevelopment, setIsDevelopment] = useState(
    process.env.NODE_ENV === "development"
  );
  const [csrfToken, setCsrfToken] = useState("");

  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedMessage, setVerifiedMessage] = useState("");

  const [cooldown, setCooldown] = useState(60);
  const [isResending, setIsResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState("");

  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [changeEmailFeedback, setChangeEmailFeedback] = useState("");
  const [changeEmailError, setChangeEmailError] = useState("");

  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const lastAutoSubmittedCodeRef = useRef<string>("");

  useEffect(() => {
    void fetch("/api/auth/csrf")
      .then((r) => r.json())
      .then((d: { csrfToken?: string }) => {
        if (d.csrfToken) setCsrfToken(d.csrfToken);
      })
      .catch(() => {});

    void fetch("/api/auth/verify-email")
      .then((r) => r.json())
      .then(
        (d: {
          pending?: boolean;
          email?: string | null;
          returnTo?: string;
          isDevelopment?: boolean;
        }) => {
          if (d.email) {
            setEmail(d.email);
          }
          if (d.returnTo) {
            setReturnTo(d.returnTo);
          }
          if (typeof d.isDevelopment === "boolean") {
            setIsDevelopment(d.isDevelopment);
          }
        }
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const submitOtpCode = useCallback(
    async (codeToVerify: string) => {
      const clean = codeToVerify.replace(/\D/g, "").slice(0, 6);
      if (clean.length !== 6) {
        setOtpError("Enter the 6-digit numeric verification code sent to your email.");
        otpInputRef.current?.focus();
        return;
      }

      setIsVerifying(true);
      setOtpError("");
      setResendFeedback("");

      try {
        let activeCsrf = csrfToken;
        if (!activeCsrf) {
          const csrfRes = await fetch("/api/auth/csrf");
          const csrfData = (await csrfRes.json()) as { csrfToken?: string };
          activeCsrf = csrfData.csrfToken ?? "";
          setCsrfToken(activeCsrf);
        }

        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [CSRF_HEADER_NAME]: activeCsrf,
          },
          body: JSON.stringify({
            code: clean,
            email: email.trim() || undefined,
            returnTo,
          }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          message?: string;
          redirectTo?: string;
        };

        if (!res.ok || !data.ok) {
          setOtpError(
            data.message ??
              "Invalid or expired verification code. Check your code or request a new one."
          );
          setIsVerifying(false);
          otpInputRef.current?.focus();
          return;
        }

        setVerifiedMessage(
          data.message ?? "Your email address is verified. Redirecting now..."
        );
        const destination = data.redirectTo || returnTo || "/catalogue";
        router.push(destination);
        router.refresh();
      } catch {
        setOtpError(
          "Network error while verifying your code. Please try again."
        );
        setIsVerifying(false);
      }
    },
    [csrfToken, email, returnTo, router]
  );

  const handleOtpInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtpCode(digitsOnly);
    if (otpError) {
      setOtpError("");
    }
    if (digitsOnly.length < 6) {
      lastAutoSubmittedCodeRef.current = "";
    }
    if (
      digitsOnly.length === 6 &&
      !isVerifying &&
      !verifiedMessage &&
      lastAutoSubmittedCodeRef.current !== digitsOnly
    ) {
      lastAutoSubmittedCodeRef.current = digitsOnly;
      void submitOtpCode(digitsOnly);
    }
  };

  const handleVerifyFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying || Boolean(verifiedMessage)) return;
    await submitOtpCode(otpCode);
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;

    setIsResending(true);
    setResendFeedback("");
    setOtpError("");

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({
          email: email.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        cooldownSeconds?: number;
        retryAfterSeconds?: number;
      };

      if (!res.ok || !data.ok) {
        if (data.retryAfterSeconds) {
          setCooldown(data.retryAfterSeconds);
        }
        setOtpError(
          data.message ?? "We could not send the email. Try again in a minute."
        );
      } else {
        setCooldown(data.cooldownSeconds ?? 60);
        setOtpCode("");
        lastAutoSubmittedCodeRef.current = "";
        setResendFeedback(
          data.message ??
            "A fresh 6-digit verification code has been sent to your email."
        );
        otpInputRef.current?.focus();
      }
    } catch {
      setOtpError("Network error while resending verification code.");
    } finally {
      setIsResending(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeEmailError("");
    setChangeEmailFeedback("");

    if (!newEmail.trim() || !confirmPassword) {
      setChangeEmailError(
        "Enter the new email address and your password to confirm."
      );
      return;
    }

    setIsChangingEmail(true);
    try {
      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({
          currentEmail: email.trim() || undefined,
          newEmail: newEmail.trim(),
          password: confirmPassword,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        newEmail?: string;
        message?: string;
      };

      if (!res.ok || !data.ok) {
        setChangeEmailError(
          data.message ?? "Unable to update your email address."
        );
      } else {
        const updatedEmail = data.newEmail ?? newEmail.trim().toLowerCase();
        setEmail(updatedEmail);
        setNewEmail("");
        setConfirmPassword("");
        setShowChangeEmail(false);
        setOtpCode("");
        lastAutoSubmittedCodeRef.current = "";
        setOtpError("");
        setCooldown(60);
        setChangeEmailFeedback(
          data.message ??
            `Updated email to ${updatedEmail} and sent a fresh 6-digit verification code.`
        );
        otpInputRef.current?.focus();
      }
    } catch {
      setChangeEmailError("Network error while updating your email address.");
    } finally {
      setIsChangingEmail(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[#F5F6F7] px-4 py-12 sm:px-6 lg:py-16 flex items-center justify-center">
      <div className="w-full max-w-lg">
        <Card surface="paper" padding="lg" className="border border-stone bg-paper shadow-sm flex flex-col gap-6">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-stone bg-sand text-clay-text">
              <Mail className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-ink">
                Enter verification code
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                Confirm your email address to activate your account
              </p>
            </div>
          </div>

          {verifiedMessage ? (
            <div
              role="status"
              className="flex flex-col gap-3 rounded-card border border-moss bg-moss/10 p-4 text-sm text-moss"
            >
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2
                  className="h-5 w-5 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>{verifiedMessage}</span>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-card border border-stone bg-sand p-4 text-sm text-ink">
                <p className="leading-relaxed">
                  We sent a single-use 6-digit verification code to{" "}
                  <span className="font-mono font-medium text-ink">
                    {email || "your registered email address"}
                  </span>
                  . The code expires in 10 minutes.
                </p>
                {isDevelopment ? (
                  <div className="mt-3 flex items-center justify-between border-t border-stone pt-2.5 text-xs text-ink-muted">
                    <span>Local development mode</span>
                    <Link
                      href="/dev/inbox"
                      className="inline-flex items-center gap-1.5 font-medium text-clay-text underline underline-offset-4 hover:text-ink"
                    >
                      <Inbox
                        className="h-3.5 w-3.5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Open dev inbox
                    </Link>
                  </div>
                ) : null}
              </div>

              { !email ? (
                <Input
                  id="verify-fallback-email"
                  label="Registered email address"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  hint="Enter the email address you registered with to verify or request a new code."
                />
              ) : null }

              <form
                onSubmit={handleVerifyFormSubmit}
                noValidate
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="verify-otp-code"
                    className="text-sm font-medium text-ink"
                  >
                    6-digit verification code{" "}
                    <span className="text-clay-text" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    ref={otpInputRef}
                    id="verify-otp-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    disabled={isVerifying || Boolean(verifiedMessage)}
                    value={otpCode}
                    onChange={handleOtpInputChange}
                    aria-invalid={Boolean(otpError)}
                    aria-describedby={
                      otpError ? "verify-otp-code-error" : "verify-otp-code-hint"
                    }
                    placeholder="123456"
                    className={`min-h-[52px] w-full rounded-control border bg-sand px-4 py-2.5 text-center font-mono text-2xl font-bold tracking-[0.35em] text-ink transition-colors placeholder:tracking-normal placeholder:text-ink-muted/40 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-clay disabled:cursor-not-allowed disabled:opacity-60 ${
                      otpError
                        ? "border-brick focus-visible:outline-brick"
                        : "border-stone hover:border-ink-muted"
                    }`}
                  />
                  {otpError ? (
                    <p
                      id="verify-otp-code-error"
                      role="alert"
                      className="flex items-start gap-1.5 text-xs font-medium text-brick"
                    >
                      <AlertCircle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span>{otpError}</span>
                    </p>
                  ) : (
                    <p
                      id="verify-otp-code-hint"
                      className="text-xs text-ink-muted"
                    >
                      Enter all 6 digits. Verification submits automatically once 6 digits are entered.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={
                    isVerifying ||
                    Boolean(verifiedMessage) ||
                    otpCode.length !== 6
                  }
                  isLoading={isVerifying}
                  loadingText="Verifying code..."
                >
                  Verify &amp; continue
                </Button>
              </form>

              <div className="flex flex-col gap-3 border-t border-border-warm pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={cooldown > 0 || isResending || isVerifying}
                    isLoading={isResending}
                    loadingText="Sending code..."
                    onClick={handleResend}
                  >
                    <RefreshCw
                      className="h-4 w-4 shrink-0"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span>
                      {cooldown > 0
                        ? `Resend code in ${cooldown}s`
                        : "Resend 6-digit code"}
                    </span>
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowChangeEmail((prev) => !prev);
                      setChangeEmailError("");
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-clay-text underline underline-offset-4 hover:text-ink"
                  >
                    <Edit3
                      className="h-3.5 w-3.5"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    {showChangeEmail
                      ? "Cancel email change"
                      : "Mistyped your email address?"}
                  </button>
                </div>

                {resendFeedback ? (
                  <p role="status" className="text-xs font-medium text-moss">
                    {resendFeedback}
                  </p>
                ) : null}

                {changeEmailFeedback ? (
                  <p role="status" className="text-xs font-medium text-moss">
                    {changeEmailFeedback}
                  </p>
                ) : null}
              </div>

              {showChangeEmail ? (
                <form
                  onSubmit={handleChangeEmail}
                  className="flex flex-col gap-4 rounded-card border border-border-warm bg-paper p-4"
                >
                  <p className="text-xs font-medium text-ink">
                    Update your unverified email address and send a fresh 6-digit code
                  </p>
                  <Input
                    id="verify-change-new-email"
                    label="New email address"
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="correct.name@domain.com"
                  />
                  <Input
                    id="verify-change-password"
                    label="Confirm your account password"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Enter the password you chose at registration"
                    error={changeEmailError || undefined}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={isChangingEmail}
                    loadingText="Updating email..."
                  >
                    Update email &amp; send new code
                  </Button>
                </form>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-content px-4 py-12 text-center text-sm text-ink-muted">
          Loading email verification...
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
