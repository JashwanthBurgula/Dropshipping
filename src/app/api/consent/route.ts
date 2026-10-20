import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCookieConsent } from "@/lib/auth/service";
import { getCurrentCustomerSession } from "@/lib/auth/session";
import { brandConfig } from "@/config/brand";

const consentPayloadSchema = z.object({
  anonymousId: z.string().trim().min(4).max(128),
  policyVersion: z.string().trim().min(1).max(64).default(brandConfig.privacyPolicyVersion),
  categories: z.object({
    strictlyNecessary: z.boolean(),
    preferences: z.boolean(),
    analytics: z.boolean(),
    marketing: z.boolean(),
  }),
});

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const parsed = consentPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid consent payload." },
        { status: 400 }
      );
    }

    const session = await getCurrentCustomerSession();
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    await recordCookieConsent({
      userId: session?.userId ?? null,
      anonymousId: parsed.data.anonymousId,
      policyVersion: parsed.data.policyVersion,
      categories: parsed.data.categories,
      ipAddress,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Could not save consent record." },
      { status: 500 }
    );
  }
}
