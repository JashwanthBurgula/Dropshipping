import { NextResponse } from "next/server";
import { getLocalInboxMessages } from "@/lib/email";

/**
 * Dev-only local email inbox preview endpoint.
 * Strictly returns HTTP 404 unless NODE_ENV === "development".
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email") ?? undefined;
  const messages = getLocalInboxMessages(email);

  return NextResponse.json(
    {
      environment: "development",
      count: messages.length,
      messages,
    },
    { status: 200 }
  );
}
