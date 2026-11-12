-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "address" VARCHAR(200) NOT NULL DEFAULT 'Tầng 5, 172 Hai Bà Trưng, Phường Tân Định, TP. Hồ Chí Minh',
ADD COLUMN     "email" VARCHAR(254) NOT NULL DEFAULT 'cskh@nine2fine.vn',
ADD COLUMN     "hotline" VARCHAR(20) NOT NULL DEFAULT '1900 6868 29',
ADD COLUMN     "hours" VARCHAR(100) NOT NULL DEFAULT '9:00 – 21:00, tất cả các ngày trong tuần',
ADD COLUMN     "legal_name" VARCHAR(120) NOT NULL DEFAULT 'Công ty TNHH Thời trang Nine2Fine',
ADD COLUMN     "notification_url" VARCHAR(300) NOT NULL DEFAULT '',
ADD COLUMN     "privacy_email" VARCHAR(254) NOT NULL DEFAULT 'dulieu@nine2fine.vn',
ADD COLUMN     "registration_date" DATE DEFAULT '2025-08-15'::date,
ADD COLUMN     "registration_issuer" VARCHAR(100) NOT NULL DEFAULT 'Sở Tài chính TP. Hồ Chí Minh',
ADD COLUMN     "registration_number" VARCHAR(13) NOT NULL DEFAULT '0319245768',
ADD COLUMN     "social_facebook" VARCHAR(300) NOT NULL DEFAULT '',
ADD COLUMN     "social_instagram" VARCHAR(300) NOT NULL DEFAULT '',
ADD COLUMN     "social_tiktok" VARCHAR(300) NOT NULL DEFAULT '',
ADD COLUMN     "social_youtube" VARCHAR(300) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "store_settings_events" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "at" TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'::text),
    "actor_user_id" UUID,
    "actor_name" VARCHAR(100) NOT NULL,
    "actor_role" "user_role" NOT NULL,
    "changes" JSONB NOT NULL,

    CONSTRAINT "store_settings_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_store_settings_events_at" ON "store_settings_events"("at" DESC, "event_id" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_account_events_at" ON "account_events"("at" DESC, "event_id" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_inv_adj_at" ON "inventory_adjustments"("at" DESC, "adjustment_id" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_order_events_at" ON "order_events"("at" DESC, "event_id" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_orders_status_delivered" ON "orders"("status", "delivered_at");

-- AddForeignKey
ALTER TABLE "store_settings_events" ADD CONSTRAINT "store_settings_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK: lưới cuối của BR-SET-02..04 (tầng ứng dụng là nơi báo lỗi theo trường). Dòng hiện có thoả vì mặc định thoả.
ALTER TABLE "store_settings"
  ADD CONSTRAINT "chk_store_info_text"    CHECK (char_length("legal_name") >= 2 AND char_length("address") >= 10),
  ADD CONSTRAINT "chk_store_info_reg"     CHECK ("registration_number" ~ '^([0-9]{10}|[0-9]{13})$'),
  ADD CONSTRAINT "chk_store_info_hotline" CHECK (
        regexp_replace("hotline", '[ .-]', '', 'g') ~ '^(0|1800|1900)[0-9]*$'
    AND char_length(regexp_replace("hotline", '[ .-]', '', 'g')) BETWEEN 8 AND 11),
  ADD CONSTRAINT "chk_store_info_urls"    CHECK (
        ("notification_url" = '' OR "notification_url" ~ '^https://[^[:space:]]+$')
    AND ("social_facebook"  = '' OR "social_facebook"  ~ '^https://[^[:space:]]+$')
    AND ("social_instagram" = '' OR "social_instagram" ~ '^https://[^[:space:]]+$')
    AND ("social_tiktok"    = '' OR "social_tiktok"    ~ '^https://[^[:space:]]+$')
    AND ("social_youtube"   = '' OR "social_youtube"   ~ '^https://[^[:space:]]+$'));

-- CHECK: nhật ký đổi cài đặt (BR-SET-09)
ALTER TABLE "store_settings_events"
  ADD CONSTRAINT "chk_store_settings_events_actor"   CHECK ("actor_role" = 'admin'),
  ADD CONSTRAINT "chk_store_settings_events_changes" CHECK (jsonb_typeof("changes") = 'array' AND jsonb_array_length("changes") BETWEEN 1 AND 40);

-- RLS (không policy: chỉ vai trò máy chủ truy cập)
ALTER TABLE "store_settings_events" ENABLE ROW LEVEL SECURITY;
