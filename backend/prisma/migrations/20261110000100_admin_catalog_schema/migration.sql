-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "low_stock_threshold" SMALLINT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "image_meta" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "published_at" TIMESTAMP(6),
ADD COLUMN     "updated_by" UUID;

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "low_stock_default" SMALLINT NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "vouchers" ADD COLUMN     "admin_updated_at" TIMESTAMP(6),
ADD COLUMN     "updated_by" UUID;

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "adjustment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delta" INTEGER NOT NULL,
    "available_after" INTEGER NOT NULL,
    "reason" VARCHAR(12) NOT NULL,
    "note" VARCHAR(200) NOT NULL DEFAULT '',
    "actor_user_id" UUID,
    "actor_name" VARCHAR(100) NOT NULL,
    "actor_role" "user_role" NOT NULL,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("adjustment_id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "media_id" VARCHAR(100) NOT NULL,
    "storage" VARCHAR(10) NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("media_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_inv_adj_variant_at" ON "inventory_adjustments"("variant_id", "at" DESC, "adjustment_id" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_order_items_variant" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_products_updated" ON "products"("updated_at" DESC, "product_id" DESC);

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Phần viết tay (Slice 6, plan mục 2). Không xoá bảng / cột / dữ liệu, không đổi tên, không đổi kiểu cột.
-- ---------------------------------------------------------------------------------------------

-- Nhật ký kho: chỉ INSERT (BR-INV-34). Dấu của delta khớp lý do (BR-INV-32).
ALTER TABLE "inventory_adjustments"
  ADD CONSTRAINT "chk_inv_adj_reason" CHECK ("reason" IN ('received','return','damaged','count','correction')),
  ADD CONSTRAINT "chk_inv_adj_delta" CHECK ("delta" <> 0),
  ADD CONSTRAINT "chk_inv_adj_after" CHECK ("available_after" >= 0),
  ADD CONSTRAINT "chk_inv_adj_sign" CHECK (
    ("reason" = 'received' AND "delta" > 0) OR ("reason" = 'return' AND "delta" > 0)
    OR ("reason" = 'damaged' AND "delta" < 0) OR "reason" IN ('count','correction')
  );

-- Ảnh tải lên (BR-INV-24..27). Cạnh ngắn >= 600 kiểm ở dịch vụ (tham số đổi được).
ALTER TABLE "media_assets"
  ADD CONSTRAINT "chk_media_content_type" CHECK ("content_type" IN ('image/jpeg','image/png','image/webp')),
  ADD CONSTRAINT "chk_media_byte_size" CHECK ("byte_size" BETWEEN 1 AND 5242880),
  ADD CONSTRAINT "chk_media_dimensions" CHECK ("width" > 0 AND "height" > 0),
  ADD CONSTRAINT "chk_media_storage" CHECK ("storage" IN ('local','supabase'));

-- Ngưỡng sắp hết (BR-INV-35, 36).
ALTER TABLE "product_variants"
  ADD CONSTRAINT "chk_variants_low_stock" CHECK ("low_stock_threshold" IS NULL OR "low_stock_threshold" BETWEEN 0 AND 1000);
ALTER TABLE "store_settings"
  ADD CONSTRAINT "chk_store_low_stock_default" CHECK ("low_stock_default" BETWEEN 0 AND 1000);

-- NỚI 3 CHECK của Slice 2 (lệch plan mục 2, ghi ở docs/handoff.md): chúng chặn chính các quy tắc Slice 6.
--   chk_products_price       : 10.000..50.000.000 -> 1.000..100.000.000 (S6-Q9, contract locked).
--   chk_products_cover_media : thêm id ảnh tải lên `up-<32 hex>.<jpg|png|webp>` (có dấu chấm) và '' (nháp chưa có ảnh).
--   chk_products_gallery     : bỏ "gallery >= 1" (nháp 0 ảnh); thay bằng chk_products_active_has_images (ACTIVE >= 1 ảnh, ghi mới).
-- Chỉ nới (mọi dòng hiện có vẫn thoả), không mất dữ liệu; chk_products_genders / moments (>= 1) GIỮ NGUYÊN.
ALTER TABLE "products" DROP CONSTRAINT "chk_products_price";
ALTER TABLE "products" ADD CONSTRAINT "chk_products_price" CHECK ("price" BETWEEN 1000 AND 100000000 AND "price" = trunc("price"));
ALTER TABLE "products" DROP CONSTRAINT "chk_products_cover_media";
ALTER TABLE "products" ADD CONSTRAINT "chk_products_cover_media" CHECK (
  "cover_media_id" = '' OR "cover_media_id" ~ '^[a-z0-9-]+$' OR "cover_media_id" ~ '^up-[0-9a-f]{32}\.(jpg|png|webp)$'
);
ALTER TABLE "products" DROP CONSTRAINT "chk_products_gallery";

-- Chỉ áp cho GHI MỚI: dữ liệu seed cũ không bị kiểm lại (NOT VALID).
ALTER TABLE "products"
  ADD CONSTRAINT "chk_products_compare_price" CHECK ("compare_at_price" IS NULL OR ("compare_at_price" > "price" AND "compare_at_price" <= 100000000)) NOT VALID,
  ADD CONSTRAINT "chk_products_gallery_max" CHECK (cardinality("gallery_media_ids") <= 12) NOT VALID,
  ADD CONSTRAINT "chk_products_active_has_images" CHECK ("status" <> 'ACTIVE' OR ("cover_media_id" <> '' AND cardinality("gallery_media_ids") >= 1)) NOT VALID;
ALTER TABLE "product_variants"
  ADD CONSTRAINT "chk_variants_inventory_max" CHECK ("inventory_qty" <= 1000000) NOT VALID;

-- RLS cho 2 bảng mới (không policy: chỉ vai trò máy chủ truy cập).
ALTER TABLE "inventory_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;

-- Điền published_at cho sản phẩm đang công khai (K8). Không xoá dữ liệu; chạy lại không đổi gì.
UPDATE "products" SET "published_at" = now() WHERE "status" = 'ACTIVE' AND "published_at" IS NULL;
