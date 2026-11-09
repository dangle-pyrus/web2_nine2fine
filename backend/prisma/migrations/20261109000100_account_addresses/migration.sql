-- Slice 5 (Account): sổ địa chỉ theo danh mục địa giới Slice 3. Chỉ cộng thêm (decisions 2026-11-08):
-- không xoá cột, không xoá dữ liệu; `district`, `city` chỉ nới NOT NULL -> NULL.

ALTER TABLE "addresses" ADD COLUMN "province_code" VARCHAR(10);
ALTER TABLE "addresses" ADD COLUMN "ward_code" VARCHAR(10);
ALTER TABLE "addresses" ADD COLUMN "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "addresses" ALTER COLUMN "district" DROP NOT NULL;
ALTER TABLE "addresses" ALTER COLUMN "city" DROP NOT NULL;

ALTER TABLE "addresses"
  ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "addresses"
  ADD CONSTRAINT "addresses_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("province_code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "addresses"
  ADD CONSTRAINT "addresses_ward_code_fkey" FOREIGN KEY ("ward_code") REFERENCES "wards"("ward_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dòng mới (Slice 5) luôn có mã tỉnh + phường; dòng cũ (nếu có) giữ chữ tự do.
ALTER TABLE "addresses"
  ADD CONSTRAINT "chk_addresses_location" CHECK (("province_code" IS NULL) = ("ward_code" IS NULL)) NOT VALID;

-- Đúng một địa chỉ mặc định mỗi người (BR-ACC-11): DB bảo đảm "không quá một".
-- IF NOT EXISTS: Supabase đã có sẵn index cùng tên, cùng nghĩa (tạo ngoài migration, phát hiện 2026-11-09).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_addresses_one_default" ON "addresses"("user_id") WHERE "is_default";
CREATE INDEX IF NOT EXISTS "idx_addresses_user_created" ON "addresses"("user_id", "created_at");

ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;
