import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCronAuthorized } from "@/lib/cron-auth";

const EXPIRED_TOKEN_RETENTION_HOURS = 24;

/**
 * Idempotent cron job: Purges used OTP tokens and expired tokens older than 24 hours.
 * Leaves recent auditably useful active tokens untouched.
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
  const expiredRetentionCutoff = new Date(
    now.getTime() - EXPIRED_TOKEN_RETENTION_HOURS * 60 * 60 * 1000
  );

  const deleteResult = await prisma.emailToken.deleteMany({
    where: {
      OR: [
        { usedAt: { not: null } },
        { expiresAt: { lt: expiredRetentionCutoff } },
      ],
    },
  });

  return NextResponse.json({
    ok: true,
    purgedCount: deleteResult.count,
    timestamp: now.toISOString(),
  });
}
