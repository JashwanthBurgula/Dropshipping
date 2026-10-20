"use client";

import * as React from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { CSRF_HEADER_NAME } from "@/lib/csrf";

export default function ForgotPasswordPage() {
  const [csrfToken, setCsrfToken] = React.useState("");
  const [formLoadedAt] = React.useState<number>(() => Date.now() - 1500);
  const [email, setEmail] = React.useState("");
  const [honeypot, setHoneypot] = React.useState("");
  const [turnstileToken, setTurnstileToken] = React.useState(
    "XXXX.DUMMY.TOKEN.XXXX"
  );
  const [error, setError] = React.useState("");
  const [submittedMessage, setSubmittedMessage] = React.useState("");
  const [devResetUrl, setDevResetUrl] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    void fetch("/api/auth/csrf")
      .then((res) => res.json())
      .then((data: { csrfToken?: string }) => {
        if (data.csrfToken) setCsrfToken(data.csrfToken);
      })
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const parsed = forgotPasswordSchema.safeParse({
      email,
      honeypot,
      formLoadedAt,
      turnstileToken,
    });

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Enter a valid email address."
      );
      document.getElementById("forgot-email")?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        devResetUrl?: string;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not send reset email right now.");
      } else {
        setSubmittedMessage(
          data.message ??
            "If an account exists for that email address, we have sent a 1-hour password reset link."
        );
        if (data.devResetUrl) {
          setDevResetUrl(data.devResetUrl);
        }
      }
    } catch {
      setError("Network error while requesting password reset.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-md">
        <h1 className="font-sans text-3xl font-medium text-ink">
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Enter the email address associated with your account and we will send a
          1-hour link to set a new password.
        </p>

        <Card surface="sand" padding="lg" className="mt-6">
          {submittedMessage ? (
            <div className="flex flex-col gap-4">
              <p role="status" className="text-sm text-ink">
                {submittedMessage}
              </p>
              {devResetUrl ? (
                <div className="rounded-control border border-stone bg-paper p-3 text-xs">
                  <p className="font-mono uppercase text-ink-muted">
                    Local Dev Reset Link Preview
                  </p>
                  <a
                    href={devResetUrl}
                    className="mt-1 inline-block break-all font-medium text-clay-text underline underline-offset-4"
                  >
                    {devResetUrl}
                  </a>
                </div>
              ) : null}
              <Link href="/login">
                <Button variant="secondary" fullWidth>
                  Return to Sign In
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              <Input
                id="forgot-email"
                name="email"
                type="email"
                label="Account email address"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={error}
                placeholder="you@example.com"
              />

              <TurnstileWidget
                onVerify={setTurnstileToken}
                honeypotValue={honeypot}
                onHoneypotChange={setHoneypot}
              />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={isSubmitting}
                loadingText="Sending reset link..."
              >
                Send password reset link
              </Button>

              <Link
                href="/login"
                className="text-center text-sm font-medium text-clay-text underline underline-offset-4 hover:text-ink"
              >
                Back to Sign In
              </Link>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
