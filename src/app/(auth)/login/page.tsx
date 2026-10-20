"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { loginSchema } from "@/lib/validation/auth";
import { CSRF_HEADER_NAME } from "@/lib/csrf";

export default function LoginPage() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = React.useState("");
  const [formLoadedAt] = React.useState<number>(() => Date.now() - 1500);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [honeypot, setHoneypot] = React.useState("");
  const [turnstileToken, setTurnstileToken] = React.useState(
    "XXXX.DUMMY.TOKEN.XXXX"
  );
  const [requireTurnstile, setRequireTurnstile] = React.useState(false);

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const [formError, setFormError] = React.useState("");
  const [unverifiedEmail, setUnverifiedEmail] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    void fetch("/api/auth/csrf")
      .then((res) => res.json())
      .then((data: { csrfToken?: string }) => {
        if (data.csrfToken) setCsrfToken(data.csrfToken);
      })
      .catch(() => undefined);

    void fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { ok?: boolean; user?: unknown }) => {
        if (data.ok && data.user) {
          const params = new URLSearchParams(window.location.search);
          const rawReturnTo = params.get("returnTo") ?? "";
          const safeReturnTo =
            rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
              ? rawReturnTo
              : "/account";
          router.replace(safeReturnTo);
        }
      })
      .catch(() => undefined);
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    setUnverifiedEmail(false);

    const parsed = loginSchema.safeParse({
      email,
      password,
      honeypot,
      formLoadedAt,
      turnstileToken,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      if (nextErrors.email) {
        document.getElementById("login-email")?.focus();
      } else if (nextErrors.password) {
        document.getElementById("login-password")?.focus();
      }
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify(parsed.data),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        requireTurnstile?: boolean;
      };

      if (!res.ok || !data.ok) {
        if (data.requireTurnstile) {
          setRequireTurnstile(true);
        }
        if (data.code === "EMAIL_UNVERIFIED") {
          setUnverifiedEmail(true);
        }
        setFormError(
          data.error ??
            "The email address or password you entered is incorrect. Check both fields and try again."
        );
        setIsSubmitting(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const rawReturnTo = params.get("returnTo") ?? "";
      const safeReturnTo =
        rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
          ? rawReturnTo
          : "/account";

      router.push(safeReturnTo);
      router.refresh();
    } catch {
      setFormError("Network error while signing in. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[#F5F6F7] px-4 py-12 sm:px-6 lg:py-16 flex items-center justify-center">
      <div className="w-full max-w-md">
        <Card surface="paper" padding="lg" className="border border-stone bg-paper shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-ink">
              Sign in to your account
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              New customer?{" "}
              <Link
                href="/register"
                className="font-medium text-clay-text underline underline-offset-4 hover:text-ink"
              >
                Create your account
              </Link>
              .
            </p>
          </div>

          {formError ? (
            <div
              role="alert"
              className="mb-5 flex flex-col gap-2 rounded-card border border-brick bg-brick/5 p-4 text-sm text-brick"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle
                  className="mt-0.5 h-5 w-5 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <p className="font-medium">{formError}</p>
              </div>
              {unverifiedEmail ? (
                <Link
                  href="/verify-email"
                  className="ml-7 font-medium text-clay-text underline underline-offset-4 hover:text-ink"
                >
                  Go to email verification page
                </Link>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <Input
              id="login-email"
              name="email"
              type="email"
              label="Email address"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
              placeholder="you@example.com"
            />

            <div className="flex flex-col gap-1.5">
              <Input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                label="Password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-control text-ink-muted hover:bg-sand hover:text-ink"
                  >
                    {showPassword ? (
                      <EyeOff
                        className="h-4 w-4"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    ) : (
                      <Eye
                        className="h-4 w-4"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                }
              />
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-clay-text underline underline-offset-4 hover:text-ink"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {requireTurnstile ? (
              <TurnstileWidget
                onVerify={setTurnstileToken}
                honeypotValue={honeypot}
                onHoneypotChange={setHoneypot}
              />
            ) : (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
              >
                <input
                  type="text"
                  tabIndex={-1}
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              loadingText="Signing in..."
            >
              Sign in
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
