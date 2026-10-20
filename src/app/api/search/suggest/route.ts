import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import {
  getInstantSearchSuggestions,
  MAX_SEARCH_QUERY_LENGTH,
} from "@/lib/search/service";

/**
 * GET /api/search/suggest?q=...
 * Returns instant typo-tolerant product suggestions with thumbnail slot metadata.
 * Enforces Redis rate limiting and a strict query length cap (80 characters).
 */
export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = await checkRateLimit(RATE_LIMIT_RULES.searchSuggest, ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Search rate limit reached. Try again in ${rl.retryAfterSeconds} seconds.`,
      },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") ?? "";

  if (rawQuery.length > MAX_SEARCH_QUERY_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        error: `Search query cannot exceed ${MAX_SEARCH_QUERY_LENGTH} characters.`,
      },
      { status: 400 }
    );
  }

  const { query, suggestions } = await getInstantSearchSuggestions(rawQuery, 6);

  return NextResponse.json(
    {
      ok: true,
      query,
      suggestions,
    },
    { status: 200 }
  );
}
