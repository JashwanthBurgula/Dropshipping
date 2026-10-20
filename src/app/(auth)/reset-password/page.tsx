"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { CSRF_HEADER_NAME } from "@/lib/csrf";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [csrfToken, setCsrfToken] = React.useState("");
  const [formLoadedAt] = React.useState<number>(() => Date.now() - 1500);
  const [newPassword, setNewPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState("");
  const [completed, setCompleted] = React.useState(false);
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

    const parsed = resetPasswordSchema.safeParse({
      token,
      newPassword,
      formLoadedAt,
    });

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          "Choose a strong password of at least 10 characters."
      );
      document.getElementById("reset-new-password")?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not reset password. Request a new link.");
      } else {
        setCompleted(true);
      }
    } catch {
      setError("Network error while resetting password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-md">
        <h1 className="font-sans text-3xl font-medium text-ink">
          Choose a new password
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Setting a new password will also sign you out of all other active
          devices.
        </p>

        <Card surface="sand" padding="lg" className="mt-6">
          {completed ? (
            <div className="flex flex-col gap-4">
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-control border border-moss/40 bg-moss/10 p-3.5 text-sm text-moss"
              >
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <p>
                  Your password has been updated and all prior sessions have been
                  signed out.
                </p>
              </div>
              <Link href="/login">
                <Button variant="primary" fullWidth>
                  Sign in with new password
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              <Input
                id="reset-new-password"
                name="newPassword"
                type={showPassword ? "text" : "password"}
                label="New password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={error}
                hint="Minimum 10 characters, including upper and lowercase letters and a number or symbol."
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

              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={isSubmitting}
                loadingText="Updating password..."
              >
                Save new password
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-ink-muted">
          Loading password reset form...
        </div>
      }
    >
      <ResetPasswordContent />
    </React.Suspense>
  );
}
