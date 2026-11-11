-- CreateTable
CREATE TABLE "account_events" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "at" TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'::text),
    "action" VARCHAR(16) NOT NULL,
    "actor_user_id" UUID,
    "actor_name" VARCHAR(100) NOT NULL,
    "actor_role" "user_role" NOT NULL,
    "target_user_id" UUID,
    "target_email" VARCHAR(254) NOT NULL,
    "target_name" VARCHAR(100) NOT NULL,
    "target_role" "user_role" NOT NULL,
    "role_before" "user_role",
    "role_after" "user_role",
    "reason" VARCHAR(250) NOT NULL DEFAULT '',
    "sessions_revoked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "account_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_account_events_target_at" ON "account_events"("target_user_id", "at" DESC, "event_id" DESC);

-- AddForeignKey
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK (lưới cuối của BR-USR-24: hình dạng dòng nhật ký)
ALTER TABLE "account_events"
  ADD CONSTRAINT "chk_account_events_action" CHECK ("action" IN ('staff-created','locked','unlocked','role-changed')),
  ADD CONSTRAINT "chk_account_events_actor" CHECK ("actor_role" IN ('staff','admin')),
  ADD CONSTRAINT "chk_account_events_shape" CHECK (
       ("action" = 'staff-created' AND "role_before" IS NULL AND "role_after" IN ('staff','admin'))
    OR ("action" = 'role-changed' AND "role_before" IN ('staff','admin') AND "role_after" IN ('staff','admin') AND "role_before" <> "role_after")
    OR ("action" IN ('locked','unlocked') AND "role_before" IS NULL AND "role_after" IS NULL)),
  ADD CONSTRAINT "chk_account_events_reason" CHECK (char_length("reason") <= 250 AND ("action" <> 'locked' OR char_length("reason") >= 5)),
  ADD CONSTRAINT "chk_account_events_revoked" CHECK ("sessions_revoked" >= 0 AND ("action" IN ('locked','role-changed') OR "sessions_revoked" = 0));

-- RLS (không policy: chỉ vai trò máy chủ truy cập)
ALTER TABLE "account_events" ENABLE ROW LEVEL SECURITY;
