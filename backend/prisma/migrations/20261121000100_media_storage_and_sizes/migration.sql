-- 2026-11-21: lưu trữ ảnh (Cloudinary cho ảnh công khai, PostgreSQL cho ảnh trả hàng riêng tư) và nới size / số ảnh
-- cho dữ liệu sản phẩm thật. Chỉ thêm / nới ràng buộc, không xoá dữ liệu.
--
-- (1) Ảnh minh chứng trả hàng (RIÊNG TƯ) lưu byte trong PostgreSQL thay vì đĩa máy chủ: không có ổ đĩa bền vững khi
-- triển khai, cả nhóm dùng chung DB, sao lưu một nơi (pg_dump).
-- Khoá = `return_photos.storage_key`; byte ghi trước, dòng `return_photos` sau nên không đặt khoá ngoại (cùng thứ tự với
-- kho đĩa cũ). Giới hạn 5 MB/ảnh do service kiểm, CHECK chặn thêm ở DB.
CREATE TABLE "return_photo_blobs" (
  "storage_key"  VARCHAR(40)  NOT NULL,
  "content_type" VARCHAR(20)  NOT NULL,
  "data"         BYTEA        NOT NULL,
  "created_at"   TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'::text),
  CONSTRAINT "return_photo_blobs_pkey" PRIMARY KEY ("storage_key"),
  CONSTRAINT "chk_return_photo_blobs_key" CHECK ("storage_key" ~ '^rp-[0-9a-f]{32}\.(jpg|png|webp)$'),
  CONSTRAINT "chk_return_photo_blobs_size" CHECK (octet_length("data") BETWEEN 1 AND 5242880)
);
-- Như mọi bảng public: bật RLS, không policy (chỉ backend qua vai trò chủ bảng đọc / ghi).
ALTER TABLE "return_photo_blobs" ENABLE ROW LEVEL SECURITY;

-- Ảnh công khai có thêm driver Cloudinary: nới CHECK nơi lưu của `media_assets`.
ALTER TABLE "media_assets" DROP CONSTRAINT "chk_media_storage";
ALTER TABLE "media_assets"
  ADD CONSTRAINT "chk_media_storage" CHECK ("storage" IN ('local','supabase','cloudinary'));

-- Ảnh đã có sẵn trên Cloudinary (nhập từ file dữ liệu sản phẩm): giữ nguyên link gốc thay vì tải lại.
-- `/api/media/{id}` chuyển hướng tới `source_url` khi có. Chỉ nhận https://res.cloudinary.com/...
ALTER TABLE "media_assets" ADD COLUMN "source_url" VARCHAR(500);
ALTER TABLE "media_assets"
  ADD CONSTRAINT "chk_media_source_url" CHECK ("source_url" IS NULL OR "source_url" ~ '^https://res\.cloudinary\.com/[a-z0-9_-]+/image/upload/');

-- Size theo dữ liệu thật: XS..XXL, FREESIZE, size số 34–56 (khớp CATALOG_ASSUMPTIONS.variant.sizes).
ALTER TABLE "product_variants" DROP CONSTRAINT "chk_variants_size";
ALTER TABLE "product_variants" ADD CONSTRAINT "chk_variants_size" CHECK ("size" IN (
  'XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56'
));

-- Ảnh mỗi sản phẩm: 12 -> 120 (mỗi màu một bộ ảnh; khớp CATALOG_ASSUMPTIONS.image.maxPerProduct). Giữ NOT VALID như bản cũ.
ALTER TABLE "products" DROP CONSTRAINT "chk_products_gallery_max";
ALTER TABLE "products" ADD CONSTRAINT "chk_products_gallery_max" CHECK (cardinality("gallery_media_ids") <= 120) NOT VALID;
