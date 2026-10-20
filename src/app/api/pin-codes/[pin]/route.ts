import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { lookupServiceablePinCode } from "@/lib/auth/service";

export async function GET(
  request: Request,
  context: { params: Promise<{ pin: string }> }
) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = await checkRateLimit(RATE_LIMIT_RULES.pinLookup, ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        serviceable: false,
        message: "Too many PIN code lookups. Please wait a moment and try again.",
      },
      { status: 429 }
    );
  }

  const { pin } = await context.params;
  if (!/^[1-9]\d{5}$/.test(pin)) {
    return NextResponse.json(
      {
        serviceable: false,
        message: "Enter a valid 6-digit Indian PIN code.",
      },
      { status: 400 }
    );
  }

  const record = await lookupServiceablePinCode(pin);
  if (!record) {
    return NextResponse.json(
      {
        serviceable: false,
        message:
          "That PIN code is not in our delivery area yet. Try a nearby 6-digit PIN code or check back soon.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      serviceable: true,
      pinCode: record.pinCode,
      city: record.city,
      state: record.state,
      stateCode: record.stateCode,
      zoneCode: record.zoneCode,
      transitDays: record.transitDays,
      shippingFeePaise: record.shippingFeePaise,
      codAvailable: record.codAvailable,
    },
    { status: 200 }
  );
}
