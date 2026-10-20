"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, MapPin, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { registerSchema } from "@/lib/validation/auth";
import { CSRF_HEADER_NAME } from "@/lib/csrf";
import { formatInrFromPaise } from "@/lib/cn";

interface PinLookupStatus {
  loading: boolean;
  serviceable: boolean | null;
  city: string;
  state: string;
  transitDays?: number;
  shippingFeePaise?: number;
  codAvailable?: boolean;
  message?: string;
}

const FIELD_ORDER = [
  "fullName",
  "email",
  "phone",
  "password",
  "pinCode",
  "addressLine",
  "privacyConsent",
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = React.useState<string>("");
  const [formLoadedAt] = React.useState<number>(() => Date.now() - 1500);

  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [pinCode, setPinCode] = React.useState("");
  const [city, setCity] = React.useState("");
  const [stateName, setStateName] = React.useState("");
  const [addressLine, setAddressLine] = React.useState("");
  const [latitude, setLatitude] = React.useState<number | null>(null);
  const [longitude, setLongitude] = React.useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = React.useState<string>("");
  const [privacyConsent, setPrivacyConsent] = React.useState(false);

  const [honeypot, setHoneypot] = React.useState("");
  const [turnstileToken, setTurnstileToken] = React.useState(
    "XXXX.DUMMY.TOKEN.XXXX"
  );

  const [pinLookup, setPinLookup] = React.useState<PinLookupStatus>({
    loading: false,
    serviceable: null,
    city: "",
    state: "",
  });

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const [formError, setFormError] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    void fetch("/api/auth/csrf")
      .then((res) => res.json())
      .then((data: { csrfToken?: string }) => {
        if (data.csrfToken) setCsrfToken(data.csrfToken);
      })
      .catch(() => undefined);
  }, []);

  const checkPinCodeServiceability = React.useCallback(async (pin: string) => {
    const cleaned = pin.trim();
    if (!/^[1-9]\d{5}$/.test(cleaned)) {
      setPinLookup({
        loading: false,
        serviceable: false,
        city: "",
        state: "",
        message: "Enter a valid 6-digit Indian PIN code (for example, 560038).",
      });
      setCity("");
      setStateName("");
      return;
    }

    setPinLookup((prev) => ({ ...prev, loading: true, message: undefined }));
    try {
      const response = await fetch(`/api/pin-codes/${encodeURIComponent(cleaned)}`);
      const data = (await response.json()) as {
        serviceable: boolean;
        city?: string;
        state?: string;
        transitDays?: number;
        shippingFeePaise?: number;
        codAvailable?: boolean;
        message?: string;
      };

      if (response.ok && data.serviceable && data.city && data.state) {
        setCity(data.city);
        setStateName(data.state);
        setPinLookup({
          loading: false,
          serviceable: true,
          city: data.city,
          state: data.state,
          transitDays: data.transitDays,
          shippingFeePaise: data.shippingFeePaise,
          codAvailable: data.codAvailable,
        });
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next.pinCode;
          delete next.city;
          delete next.state;
          return next;
        });
      } else {
        setCity("");
        setStateName("");
        const msg =
          data.message ??
          "That PIN code is not in our delivery area yet. Try a nearby one or check back soon.";
        setPinLookup({
          loading: false,
          serviceable: false,
          city: "",
          state: "",
          message: msg,
        });
        setFieldErrors((prev) => ({ ...prev, pinCode: msg }));
      }
    } catch {
      setPinLookup({
        loading: false,
        serviceable: null,
        city: "",
        state: "",
        message: "Could not verify PIN code right now. Please try again.",
      });
    }
  }, []);

  const handlePinCodeChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 6);
    setPinCode(digitsOnly);
    if (digitsOnly.length === 6) {
      void checkPinCodeServiceability(digitsOnly);
    } else {
      setPinLookup({ loading: false, serviceable: null, city: "", state: "" });
      setCity("");
      setStateName("");
    }
  };

  const validateSingleField = (fieldName: string, currentPayload: unknown) => {
    const parsed = registerSchema.safeParse(currentPayload);
    if (parsed.success) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
      return;
    }
    const issue = parsed.error.issues.find(
      (i) => String(i.path[0]) === fieldName
    );
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (issue) {
        next[fieldName] = issue.message;
      } else {
        delete next[fieldName];
      }
      return next;
    });
  };

  const currentPayload = {
    fullName,
    email,
    phone,
    password,
    addressLine,
    pinCode,
    city,
    state: stateName,
    latitude,
    longitude,
    privacyConsent,
    honeypot,
    formLoadedAt,
    turnstileToken,
  };

  const handleShareGps = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGpsStatus(
        "Browser location is unavailable on this device. Your PIN code and street address are sufficient."
      );
      return;
    }
    setGpsStatus("Requesting GPS coordinates from your browser...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        setGpsStatus(`Location pinned (${lat}, ${lng}).`);
      },
      () => {
        setGpsStatus(
          "Location permission was declined. You can continue using your street address and PIN code."
        );
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const focusFirstError = (errors: Record<string, string>) => {
    for (const key of FIELD_ORDER) {
      if (errors[key]) {
        const element = document.getElementById(`reg-${key}`);
        element?.focus();
        break;
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    const parsed = registerSchema.safeParse(currentPayload);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      if (pinLookup.serviceable === false && pinLookup.message) {
        nextErrors.pinCode = pinLookup.message;
      }
      setFieldErrors(nextErrors);
      setFormError("Please review and fix the highlighted fields below.");
      focusFirstError(nextErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify(parsed.data),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        field?: string;
        fieldErrors?: Record<string, string>;
        issues?: Record<string, string[]>;
      };

      if (!response.ok || !data.ok) {
        if (data.fieldErrors) {
          setFieldErrors(data.fieldErrors);
          focusFirstError(data.fieldErrors);
        } else if (data.field && (data.message || data.error)) {
          const singleFieldErr = {
            [data.field]: data.message ?? data.error ?? "Invalid input.",
          };
          setFieldErrors(singleFieldErr);
          focusFirstError(singleFieldErr);
        }
        setFormError(
          data.message ??
            data.error ??
            "Could not complete registration. Please try again."
        );
        setIsSubmitting(false);
        return;
      }

      // Navigate to /verify-email without placing the email address in the URL (stored in HttpOnly cookie)
      router.push("/verify-email");
    } catch {
      setFormError(
        "Network error while creating your account. Your entered details have been preserved; please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[#F5F6F7] px-4 py-10 sm:px-6 lg:py-14">
      <div className="mx-auto max-w-2xl">
        <Card surface="paper" padding="lg" className="border border-stone bg-paper shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-ink">
              Create your account
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              We verify your email and check that we deliver to your PIN code. Already registered?{" "}
              <Link
                href="/login"
                className="font-medium text-clay-text underline underline-offset-4 hover:text-ink"
              >
                Sign in here
              </Link>
              .
            </p>
          </div>

          {formError ? (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-card border border-brick bg-brick/5 p-4 text-sm text-brick"
            >
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">{formError}</p>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Input
                id="reg-fullName"
                name="fullName"
                label="Full name"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() =>
                  validateSingleField("fullName", {
                    ...currentPayload,
                    fullName,
                  })
                }
                error={fieldErrors.fullName}
                placeholder="e.g. Meera Krishnan"
              />

              <Input
                id="reg-phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                label="Mobile number (India)"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() =>
                  validateSingleField("phone", { ...currentPayload, phone })
                }
                error={fieldErrors.phone}
                hint="10-digit mobile number for delivery updates and COD OTP."
                placeholder="e.g. 9845012345"
              />
            </div>

            <Input
              id="reg-email"
              name="email"
              type="email"
              label="Email address"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() =>
                validateSingleField("email", { ...currentPayload, email })
              }
              error={fieldErrors.email}
              hint="We will send a 24-hour verification link to this address."
              placeholder="you@example.com"
            />

            <Input
              id="reg-password"
              name="password"
              type={showPassword ? "text" : "password"}
              label="Create password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() =>
                validateSingleField("password", {
                  ...currentPayload,
                  password,
                })
              }
              error={fieldErrors.password}
              hint="Minimum 10 characters with upper and lowercase letters and a number or symbol."
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-control text-ink-muted hover:bg-sand hover:text-ink"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  )}
                </button>
              }
            />

            <hr className="border-stone" />

            <div>
              <h2 className="text-lg font-semibold text-ink">
                Delivery Address &amp; PIN Code Serviceability
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Try serviceable PIN codes such as 560038 (Bengaluru), 400001
                (Mumbai), 110001 (New Delhi), 600001 (Chennai), or 500001
                (Hyderabad).
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                id="reg-pinCode"
                name="pinCode"
                inputMode="numeric"
                maxLength={6}
                label="6-digit PIN code"
                autoComplete="postal-code"
                required
                value={pinCode}
                onChange={(e) => handlePinCodeChange(e.target.value)}
                onBlur={() => {
                  if (pinCode.length === 6) {
                    void checkPinCodeServiceability(pinCode);
                  } else {
                    validateSingleField("pinCode", {
                      ...currentPayload,
                      pinCode,
                    });
                  }
                }}
                error={fieldErrors.pinCode}
                placeholder="e.g. 560038"
              />

              <Input
                id="reg-city"
                name="city"
                label="City / District"
                value={city}
                readOnly
                required
                error={fieldErrors.city}
                placeholder="Auto-filled from PIN"
              />

              <Input
                id="reg-state"
                name="state"
                label="State"
                value={stateName}
                readOnly
                required
                error={fieldErrors.state}
                placeholder="Auto-filled from PIN"
              />
            </div>

            {pinLookup.serviceable === true ? (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-moss/30 bg-moss/10 px-3.5 py-2.5 text-xs text-moss"
              >
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2
                    className="h-4 w-4 shrink-0"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>
                    Serviceable in {pinLookup.city}, {pinLookup.state} · Transit time:{" "}
                    {pinLookup.transitDays} days
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="inStock">
                    Shipping: {formatInrFromPaise(pinLookup.shippingFeePaise ?? 6000)}
                  </Badge>
                  <Badge variant="neutral">
                    {pinLookup.codAvailable ? "COD available" : "Prepaid only"}
                  </Badge>
                </div>
              </div>
            ) : null}

            <Input
              id="reg-addressLine"
              name="addressLine"
              label="Street address, flat / house number, and landmark"
              autoComplete="street-address"
              required
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              onBlur={() =>
                validateSingleField("addressLine", {
                  ...currentPayload,
                  addressLine,
                })
              }
              error={fieldErrors.addressLine}
              placeholder="e.g. Flat 302, Banyan Court, 12th Main, Indiranagar"
            />

            {/* Optional GPS sharing with plain explanation */}
            <div className="rounded-card border border-stone bg-paper p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-medium text-ink">
                    Optional: Share GPS coordinates for doorstep accuracy
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Sharing your GPS pin helps our regional dealer&apos;s courier
                    locate your building entrance without calling for directions.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleShareGps}
                >
                  <MapPin
                    className="h-4 w-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>
                    {latitude !== null ? "Update GPS pin" : "Share GPS location"}
                  </span>
                </Button>
              </div>
              {gpsStatus ? (
                <p className="mt-2 text-xs font-medium text-ink-muted">
                  {gpsStatus}
                </p>
              ) : null}
            </div>

            {/* Mandatory Privacy & Terms Consent Checkbox */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="reg-privacyConsent"
                className="flex cursor-pointer items-start gap-3 rounded-control border border-stone bg-paper p-3.5 text-sm text-ink"
              >
                <input
                  id="reg-privacyConsent"
                  name="privacyConsent"
                  type="checkbox"
                  checked={privacyConsent}
                  onChange={(e) => {
                    setPrivacyConsent(e.target.checked);
                    validateSingleField("privacyConsent", {
                      ...currentPayload,
                      privacyConsent: e.target.checked,
                    });
                  }}
                  aria-invalid={fieldErrors.privacyConsent ? "true" : "false"}
                  aria-describedby={
                    fieldErrors.privacyConsent
                      ? "reg-privacyConsent-error"
                      : undefined
                  }
                  className="mt-1 h-5 w-5 shrink-0 rounded-control border-stone accent-clay"
                />
                <span>
                  I consent to the collection and processing of my name, contact
                  details, delivery address, and optional GPS coordinates to fulfil
                  orders in accordance with the{" "}
                  <Link
                    href="/legal/privacy"
                    className="font-medium text-clay-text underline underline-offset-4 hover:text-ink"
                  >
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/legal/terms"
                    className="font-medium text-clay-text underline underline-offset-4 hover:text-ink"
                  >
                    Terms &amp; Conditions
                  </Link>
                  .
                </span>
              </label>
              {fieldErrors.privacyConsent ? (
                <p
                  id="reg-privacyConsent-error"
                  role="alert"
                  className="text-sm font-medium text-brick"
                >
                  {fieldErrors.privacyConsent}
                </p>
              ) : null}
            </div>

            <TurnstileWidget
              onVerify={setTurnstileToken}
              honeypotValue={honeypot}
              onHoneypotChange={setHoneypot}
            />

            {/* Single primary action button on the screen */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isSubmitting}
                loadingText="Creating account & sending verification link..."
              >
                Create account &amp; send verification link
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
