import { NextResponse } from "next/server";
import { ensureCsrfCookie } from "@/lib/csrf";

export async function GET() {
  const csrfToken = await ensureCsrfCookie();
  return NextResponse.json({ csrfToken }, { status: 200 });
}
