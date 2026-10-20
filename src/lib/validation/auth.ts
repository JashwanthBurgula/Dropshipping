import { z } from "zod";
import { isBreachedOrWeakPassword } from "@/lib/auth/password-policy";
import {
  isEmailDomainAllowed,
  USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE,
} from "@/lib/auth/email-domains";

/**
 * Indian mobile number validation:
 * Accepts 10 digits starting with 6-9, optionally prefixed by +91 or 91 or 0,
 * and normalizes to a 10-digit string (e.g. "9876543210").
 */
export const indianPhoneSchema = z
  .string()
  .trim()
  .min(1, "Enter your 10-digit Indian mobile number.")
  .transform((val) => val.replace(/[\s\-()]/g, ""))
  .refine(
    (val) => /^(?:\+91|91|0)?[6-9]\d{9}$/.test(val),
    "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9."
  )
  .transform((val) => val.slice(-10));

/**
 * 6-digit Indian PIN code validation:
 * First digit must be 1-9, followed by 5 digits.
 */
export const indianPinCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[1-9]\d{5}$/,
    "Enter a valid 6-digit Indian PIN code (for example, 560038)."
  );

/**
 * Strong password schema:
 * - Minimum 10 characters
 * - At least one uppercase letter, one lowercase letter, and one digit or symbol
 * - Not in the breached or sequential password list
 */
export const strongPasswordSchema = z
  .string()
  .min(
    10,
    "Password must be at least 10 characters long. Include upper and lowercase letters and a number."
  )
  .max(128, "Password must be 128 characters or fewer.")
  .refine(
    (val) => /[a-z]/.test(val) && /[A-Z]/.test(val) && /[0-9!@#$%^&*(),.?":{}|<>_\-+=]/.test(val),
    "Password must include an uppercase letter, a lowercase letter, and at least one number or symbol."
  )
  .refine(
    (val) => !isBreachedOrWeakPassword(val),
    "This password appears in known data breaches or uses a common sequence. Choose a more unique phrase."
  );

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name (at least 2 characters).")
    .max(100, "Full name must be under 100 characters."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address (for example, name@domain.com).")
    .refine(
      (val) => isEmailDomainAllowed(val).allowed,
      USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE
    ),
  phone: indianPhoneSchema,
  password: strongPasswordSchema,
  addressLine: z
    .string()
    .trim()
    .min(
      8,
      "Enter your complete street address, house or flat number, and landmark."
    )
    .max(250, "Street address must be under 250 characters."),
  pinCode: indianPinCodeSchema,
  city: z
    .string()
    .trim()
    .min(2, "City is auto-filled from a serviceable 6-digit PIN code."),
  state: z
    .string()
    .trim()
    .min(2, "State is auto-filled from a serviceable 6-digit PIN code."),
  latitude: z
    .number()
    .min(-90, "Latitude must be between -90 and 90.")
    .max(90, "Latitude must be between -90 and 90.")
    .nullable()
    .optional(),
  longitude: z
    .number()
    .min(-180, "Longitude must be between -180 and 180.")
    .max(180, "Longitude must be between -180 and 180.")
    .nullable()
    .optional(),
  privacyConsent: z.boolean().refine((val) => val === true, {
    message:
      "You must agree to the Privacy Policy and Terms to create a verified account.",
  }),
  returnTo: z.string().optional(),
  honeypot: z.string().optional(),
  formLoadedAt: z.number().optional(),
  turnstileToken: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyEmailOtpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit numeric verification code sent to your email."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter the email address you registered with.")
    .optional(),
  returnTo: z.string().optional(),
});

export type VerifyEmailOtpInput = z.infer<typeof verifyEmailOtpSchema>;

export const verifyEmailSchema = verifyEmailOtpSchema;

export const resendVerificationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter the email address you used to register.")
    .optional(),
  honeypot: z.string().optional(),
  formLoadedAt: z.number().optional(),
  turnstileToken: z.string().optional(),
});

export const changeUnverifiedEmailSchema = z.object({
  currentEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter the original email address you registered with.")
    .optional(),
  newEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter the new email address where we should send the verification code.")
    .refine(
      (val) => isEmailDomainAllowed(val).allowed,
      USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE
    ),
  password: z
    .string()
    .min(1, "Enter your account password to confirm the email change."),
  honeypot: z.string().optional(),
  formLoadedAt: z.number().optional(),
  turnstileToken: z.string().optional(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  returnTo: z.string().optional(),
  honeypot: z.string().optional(),
  formLoadedAt: z.number().optional(),
  turnstileToken: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter the email address associated with your account."),
  honeypot: z.string().optional(),
  formLoadedAt: z.number().optional(),
  turnstileToken: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  token: z
    .string()
    .trim()
    .min(32, "Reset link token is missing or invalid."),
  newPassword: strongPasswordSchema,
  honeypot: z.string().optional(),
  formLoadedAt: z.number().optional(),
  turnstileToken: z.string().optional(),
});

export const adminTotpVerifySchema = z.object({
  code: z
    .string()
    .trim()
    .min(
      6,
      "Enter the 6-digit authenticator code or an 8-character recovery code."
    )
    .max(16, "Code is too long."),
});

export const adminFirstLoginPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current temporary password."),
  newPassword: strongPasswordSchema,
});

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name (at least 2 characters).")
    .max(100, "Full name must be under 100 characters."),
  phone: indianPhoneSchema,
  addressLine: z
    .string()
    .trim()
    .min(5, "Address must be at least 5 characters.")
    .max(250, "Address must be under 250 characters.")
    .optional(),
  city: z.string().trim().min(2, "City is required.").optional(),
  state: z.string().trim().min(2, "State is required.").optional(),
  pinCode: indianPinCodeSchema.optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const savedAddressSchema = z.object({
  label: z.string().trim().min(1, "Label is required (e.g. Home, Work).").max(50),
  recipientName: z
    .string()
    .trim()
    .min(2, "Enter the recipient's full name.")
    .max(100),
  phone: indianPhoneSchema,
  addressLine: z
    .string()
    .trim()
    .min(8, "Enter complete street address and house/flat number.")
    .max(250),
  city: z.string().trim().min(2, "Enter city."),
  state: z.string().trim().min(2, "Enter state."),
  pinCode: indianPinCodeSchema,
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export type SavedAddressInput = z.infer<typeof savedAddressSchema>;

export const changeCustomerPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: strongPasswordSchema,
});

export type ChangeCustomerPasswordInput = z.infer<typeof changeCustomerPasswordSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Re-enter your password to confirm account deletion."),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;


