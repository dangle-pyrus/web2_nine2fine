-- Giỏ khách: tối đa 10 / sản phẩm (biến thể) thay cho 5 (2026-11-17).
-- Đổi mặc định cột và nâng dòng cài đặt còn ở mặc định cũ (5); giá trị admin đã tự đặt khác 5 được giữ nguyên.
ALTER TABLE "store_settings" ALTER COLUMN "max_per_variant" SET DEFAULT 10;
UPDATE "store_settings" SET "max_per_variant" = 10 WHERE "max_per_variant" = 5;
