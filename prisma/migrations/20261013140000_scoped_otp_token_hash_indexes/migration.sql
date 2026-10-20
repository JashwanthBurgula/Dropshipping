-- DropIndex
DROP INDEX IF EXISTS "email_tokens_token_hash_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_tokens_user_id_purpose_token_hash_idx" ON "email_tokens"("user_id", "purpose", "token_hash");
