import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCronAuthorized } from "@/lib/cron-auth";

const RETENTION_DAYS = 30;

/**
 * Idempotent cron job: Purges search query logs older than 30 days.
 * Preserves aggregated search logs within the 30-day analytics window.
 */
export async function POST(request: Request) {
  const auth = assertCronAuthorized(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status ?? 401 }
    );
  }

  const now = new Date();
  const retentionCutoff = new Date(
    now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const deleteResult = await prisma.searchQueryLog.deleteMany({
    where: {
      createdAt: { lt: retentionCutoff },
    },
  });

  return NextResponse.json({
    ok: true,
    purgedCount: deleteResult.count,
    timestamp: now.toISOString(),
  });
}
