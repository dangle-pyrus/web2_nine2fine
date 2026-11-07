-- Slice 1 Auth - additive migration. Nothing is dropped; existing rows are preserved.

-- 1) Email must be lowercase (BR-AUTH-01). Stop with a clear error on case-insensitive duplicates;
--    never merge accounts automatically.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users" GROUP BY lower(btrim("email")) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'users.email has duplicates that differ only by case/whitespace; resolve them manually before applying this migration';
  END IF;
END $$;

UPDATE "users" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));
UPDATE "auth_action_tokens" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));

ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" = lower("email"));

-- 2) users.marketing_opt_in_at (BR-AUTH-13); backfill from terms_accepted_at for existing opt-ins.
ALTER TABLE "users" ADD COLUMN "marketing_opt_in_at" TIMESTAMP(6);
UPDATE "users" SET "marketing_opt_in_at" = "terms_accepted_at" WHERE "marketing_opt_in" = true;

-- 3) sessions: audience, absolute expiry, device_id optional.
CREATE TYPE "session_audience" AS ENUM ('storefront', 'admin');

ALTER TABLE "sessions" ALTER COLUMN "device_id" DROP NOT NULL;
ALTER TABLE "sessions" ADD COLUMN "audience" "session_audience" NOT NULL DEFAULT 'storefront';
ALTER TABLE "sessions" ADD COLUMN "absolute_expires_at" TIMESTAMP(6);
UPDATE "sessions" SET "absolute_expires_at" = "expires_at";
ALTER TABLE "sessions" ALTER COLUMN "absolute_expires_at" SET NOT NULL;

-- 4) Rate-limit / lock counters stored in the database (works across instances and restarts).
CREATE TABLE "auth_rate_limits" (
    "key" VARCHAR(400) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(6) NOT NULL,
    "locked_until" TIMESTAMP(6),

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "idx_auth_rate_limits_window_start" ON "auth_rate_limits"("window_start");

-- 5) Faster "latest code for email + purpose" lookups.
CREATE INDEX "idx_auth_tokens_email_purpose_created" ON "auth_action_tokens"("email", "purpose", "created_at");
