import { z } from "zod";
import { indianPhoneSchema, indianPinCodeSchema } from "./auth";

export const checkoutAddressSchema = z.object({
  recipientName: z
    .string()
    .trim()
    .min(2, "Enter the recipient's full name (at least 2 characters).")
    .max(100, "Recipient name cannot exceed 100 characters."),
  phone: indianPhoneSchema,
  addressLine1: z
    .string()
    .trim()
    .min(5, "Enter flat, house number, building, and street (at least 5 characters).")
    .max(200, "Address line 1 cannot exceed 200 characters."),
  addressLine2: z
    .string()
    .trim()
    .max(200, "Landmark or area cannot exceed 200 characters.")
    .optional()
    .or(z.literal("")),
  pinCode: indianPinCodeSchema,
  city: z
    .string()
    .trim()
    .min(2, "City is required.")
    .max(80, "City name is too long."),
  state: z
    .string()
    .trim()
    .min(2, "State is required.")
    .max(80, "State name is too long."),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  saveAddressToProfile: z.boolean().optional(),
  addressLabel: z.string().trim().max(40).optional(),
});

export const createCheckoutOrderSchema = z.object({
  idempotencyKey: z
    .string()
    .trim()
    .min(8, "Idempotency-Key must be at least 8 characters.")
    .max(128, "Idempotency-Key cannot exceed 128 characters."),
  address: checkoutAddressSchema,
  paymentMethod: z.enum(["RAZORPAY", "COD", "PAYPAL"]),
  expectedTotalPaise: z
    .number()
    .int("Expected total must be an integer in paise.")
    .nonnegative("Expected total cannot be negative."),
  termsAccepted: z.boolean().refine((val) => val === true, {
    message:
      "You must accept the Terms of Service and Refund Policy before placing your order.",
  }),
});

export const verifyCodOtpSchema = z.object({
  otpCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit verification code sent to your email and phone."),
});

export type CheckoutAddressInput = z.infer<typeof checkoutAddressSchema>;
export type CreateCheckoutOrderInput = z.infer<typeof createCheckoutOrderSchema>;
