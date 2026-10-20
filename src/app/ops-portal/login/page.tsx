"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Shield, KeyRound, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { CSRF_HEADER_NAME } from "@/lib/csrf";
import { brandConfig } from "@/config/brand";

interface TotpEnrollmentState {
  secret: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = React.useState("");
  const [formLoadedAt] = React.useState<number>(() => Date.now() - 1500);

  const [step, setStep] = React.useState<
    "credentials" | "change-password" | "totp"
  >("credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [honeypot, setHoneypot] = React.useState("");
  const [turnstileToken, setTurnstileToken] = React.useState(
    "XXXX.DUMMY.TOKEN.XXXX"
  );
  const [requireTurnstile, setRequireTurnstile] = React.useState(false);

  const [totpEnabledOnAccount, setTotpEnabledOnAccount] = React.useState(false);
  const [enrollment, setEnrollment] =
    React.useState<TotpEnrollmentState | null>(null);
  const [totpCode, setTotpCode] = React.useState("");

  const [error, setError] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    void fetch("/api/auth/csrf")
      .then((res) => res.json())
      .then((data: { csrfToken?: string }) => {
        if (data.csrfToken) setCsrfToken(data.csrfToken);
      })
      .catch(() => undefined);
  }, []);

  const fetchTotpEnrollmentIfNeeded = async (alreadyEnabled: boolean) => {
    if (alreadyEnabled) return;
    const enrollRes = await fetch("/api/auth/admin/totp", {
      method: "GET",
    });
    const enrollData = (await enrollRes.json()) as {
      ok?: boolean;
      secret?: string;
      qrCodeDataUrl?: string;
      recoveryCodes?: string[];
    };
    if (
      enrollRes.ok &&
      enrollData.ok &&
      enrollData.secret &&
      enrollData.qrCodeDataUrl &&
      enrollData.recoveryCodes
    ) {
      setEnrollment({
        secret: enrollData.secret,
        qrCodeDataUrl: enrollData.qrCodeDataUrl,
        recoveryCodes: enrollData.recoveryCodes,
      });
    }
  };

  const handleCredentialsSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({
          email,
          password,
          honeypot,
          formLoadedAt,
          turnstileToken,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        totpEnabled?: boolean;
        mustChangePassword?: boolean;
        requireTurnstile?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        if (data.requireTurnstile) {
          setRequireTurnstile(true);
        }
        setError(
          data.error ??
            "Invalid administrator credentials or insufficient permissions."
        );
        setIsSubmitting(false);
        return;
      }

      const alreadyTotpEnabled = Boolean(data.totpEnabled);
      setTotpEnabledOnAccount(alreadyTotpEnabled);

      if (data.mustChangePassword) {
        setStep("change-password");
        setIsSubmitting(false);
        return;
      }

      setStep("totp");
      await fetchTotpEnrollmentIfNeeded(alreadyTotpEnabled);
    } catch {
      setError("Network error while signing in to administrator portal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordChangeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/admin/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({
          currentPassword: password,
          newPassword,
        }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(
          data.error ??
            "Could not update initial administrator password. Choose a stronger password."
        );
        setIsSubmitting(false);
        return;
      }

      setPassword(newPassword);
      setStep("totp");
      await fetchTotpEnrollmentIfNeeded(totpEnabledOnAccount);
    } catch {
      setError("Network error while updating administrator password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTotpSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/admin/totp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ code: totpCode }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(
          data.error ??
            "Invalid 6-digit authenticator code or recovery code. Try again."
        );
        setIsSubmitting(false);
        return;
      }

      router.push(brandConfig.adminPortalPath);
      router.refresh();
    } catch {
      setError("Network error while verifying two-factor code.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] bg-[#F4F4F5] px-4 py-12 text-[#18181B]">
      <div className="mx-auto max-w-md rounded-card border border-[#E4E4E7] bg-white p-6">
        <div className="flex items-center gap-2.5 border-b border-[#E4E4E7] pb-4">
          <Shield
            className="h-5 w-5 text-[#18181B]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div>
            <h1 className="font-sans text-base font-semibold text-[#18181B]">
              {brandConfig.name} Operations Portal
            </h1>
            <p className="text-xs text-[#52525B]">
              Restricted access · Two-factor authentication required · 30m session
              timeout
            </p>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-control border border-brick bg-brick/5 p-3 text-xs font-medium text-brick"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p>{error}</p>
          </div>
        ) : null}

        {step === "credentials" ? (
          <form
            onSubmit={handleCredentialsSubmit}
            noValidate
            className="mt-5 flex flex-col gap-4"
          >
            <Input
              id="admin-email"
              name="email"
              type="email"
              label="Administrator email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@kalaandkiln.in"
            />

            <Input
              id="admin-password"
              name="password"
              type={showPassword ? "text" : "password"}
              label="Password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-control text-[#52525B] hover:bg-[#F4F4F5]"
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

            {requireTurnstile ? (
              <TurnstileWidget
                onVerify={setTurnstileToken}
                honeypotValue={honeypot}
                onHoneypotChange={setHoneypot}
              />
            ) : null}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isSubmitting}
              loadingText="Verifying credentials..."
            >
              Continue to 2FA verification
            </Button>
          </form>
        ) : step === "change-password" ? (
          <form
            onSubmit={handlePasswordChangeSubmit}
            noValidate
            className="mt-5 flex flex-col gap-4"
          >
            <div className="rounded-control border border-[#E4E4E7] bg-[#F4F4F5] p-3 text-xs text-[#18181B]">
              <p className="font-semibold">
                Mandatory First-Login Password Change
              </p>
              <p className="mt-1 text-[#52525B]">
                This administrator account is using its initial seeded password.
                Choose a new password (minimum 10 characters, not in breach
                lists) before completing two-factor verification.
              </p>
            </div>

            <Input
              id="admin-new-password"
              name="newPassword"
              type={showPassword ? "text" : "password"}
              label="New administrator password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              hint="At least 10 characters with uppercase, lowercase, and a number or symbol."
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isSubmitting}
              loadingText="Updating password..."
            >
              Save new password &amp; continue to 2FA
            </Button>
          </form>
        ) : (
          <form
            onSubmit={handleTotpSubmit}
            noValidate
            className="mt-5 flex flex-col gap-4"
          >
            {!totpEnabledOnAccount && enrollment ? (
              <div className="flex flex-col gap-3 rounded-control border border-[#E4E4E7] bg-[#F4F4F5] p-3.5 text-xs">
                <p className="font-semibold text-[#18181B]">
                  Step 2: Configure Authenticator App (First-Time Setup)
                </p>
                <p className="text-[#52525B]">
                  Scan this QR code with your TOTP authenticator app, or enter the
                  Base32 key manually:
                </p>
                <div className="flex justify-center border border-[#E4E4E7] bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={enrollment.qrCodeDataUrl}
                    alt="TOTP Authenticator QR Code"
                    width={180}
                    height={180}
                  />
                </div>
                <p className="break-all font-mono text-[11px] text-[#18181B]">
                  Secret Key: {enrollment.secret}
                </p>

                <div className="border-t border-[#E4E4E7] pt-2.5">
                  <p className="font-semibold text-[#18181B]">
                    Single-Use Recovery Codes (Save these in a password manager)
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 font-mono text-[11px] text-[#18181B]">
                    {enrollment.recoveryCodes.map((code) => (
                      <span
                        key={code}
                        className="rounded-control border border-[#E4E4E7] bg-white px-2 py-1 text-center"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <Input
              id="admin-totp-code"
              name="code"
              label="6-digit authenticator code (or recovery code)"
              inputMode="text"
              autoComplete="one-time-code"
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="e.g. 123456 or A1B2-C3D4"
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isSubmitting}
              loadingText="Verifying 2FA code..."
            >
              <KeyRound
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>Verify &amp; open Operations Portal</span>
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
