-- AlterTable User: add canonical_email nullable first for backfill
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "canonical_email" TEXT;

-- Backfill existing rows:
-- For gmail.com and googlemail.com, lowercase, strip dots in local part, and strip +alias
UPDATE "users"
SET "canonical_email" = CASE
  WHEN LOWER(SPLIT_PART("email", '@', 2)) IN ('gmail.com', 'googlemail.com') THEN
    REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(LOWER("email"), '@', 1), '+', 1), '\.', '', 'g') || '@gmail.com'
  ELSE
    LOWER(TRIM("email"))
END
WHERE "canonical_email" IS NULL;

-- Enforce NOT NULL on canonical_email
ALTER TABLE "users" ALTER COLUMN "canonical_email" SET NOT NULL;

-- Create unique index on canonical_email
CREATE UNIQUE INDEX IF NOT EXISTS "users_canonical_email_key" ON "users"("canonical_email");

-- AlterTable EmailToken: add attempts
ALTER TABLE "email_tokens" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
