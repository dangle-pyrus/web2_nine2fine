-- Slice 10 (gói P1): MỘT migration cho cả đợt. CHỈ CỘNG THÊM: bảng mới, cột nullable / có DEFAULT hằng, chỉ mục, CHECK, RLS.
-- Không DROP / TRUNCATE / RENAME / đổi kiểu, không sửa dữ liệu cũ, không thêm giá trị enum (nên không cần tệp enum riêng như Slice 9).
-- Bảng mới: product_reviews (B), wishlist_items (C), home_content (E, G), collections + collection_products (G, Should).
-- Cột mới: products.sale_price / sale_starts_at / sale_ends_at (F), size_charts.updated_by / updated_by_name (G), return_photos.grant_hash (A).
-- Phần tạo bảng / cột / chỉ mục / khoá ngoại sinh bởi `prisma migrate diff` (rồi thêm IF NOT EXISTS cho chỉ mục); CHECK + RLS viết tay ở cuối.
-- Không seed dữ liệu ở đây: nội dung trang chủ mặc định nằm trong mã + script seed idempotent (plan mục 4.4).

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "sale_ends_at" TIMESTAMP(6),
ADD COLUMN     "sale_price" DECIMAL(12,2),
ADD COLUMN     "sale_starts_at" TIMESTAMP(6);

-- AlterTable
ALTER TABLE "size_charts" ADD COLUMN     "updated_by" UUID,
ADD COLUMN     "updated_by_name" VARCHAR(100) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "return_photos" ADD COLUMN     "grant_hash" CHAR(64);

-- CreateTable
CREATE TABLE "product_reviews" (
    "review_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "user_id" UUID,
    "order_id" UUID,
    "author_display" VARCHAR(60) NOT NULL,
    "rating" SMALLINT NOT NULL,
    "fit" SMALLINT NOT NULL,
    "size_bought" VARCHAR(10) NOT NULL,
    "height" VARCHAR(20) NOT NULL DEFAULT '',
    "title" VARCHAR(80) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(7) NOT NULL DEFAULT 'visible',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'::text),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'::text),
    "hidden_at" TIMESTAMP(6),
    "hidden_by" UUID,
    "hidden_by_name" VARCHAR(100),
    "hidden_reason" VARCHAR(250),
    "reply_body" VARCHAR(500),
    "reply_at" TIMESTAMP(6),
    "reply_by" UUID,
    "reply_by_name" VARCHAR(100),

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("review_id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "added_at" TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'::text),

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("user_id","product_id")
);

-- CreateTable
CREATE TABLE "home_content" (
    "content_id" SMALLINT NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'::text),
    "updated_by" UUID,
    "updated_by_name" VARCHAR(100) NOT NULL DEFAULT '',

    CONSTRAINT "home_content_pkey" PRIMARY KEY ("content_id")
);

-- CreateTable
CREATE TABLE "collections" (
    "collection_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "status" VARCHAR(6) NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'::text),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'::text),
    "updated_by" UUID,
    "updated_by_name" VARCHAR(100) NOT NULL DEFAULT '',

    CONSTRAINT "collections_pkey" PRIMARY KEY ("collection_id")
);

-- CreateTable
CREATE TABLE "collection_products" (
    "collection_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("collection_id","product_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_product_reviews_public" ON "product_reviews"("product_id", "status", "created_at" DESC, "review_id" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_product_reviews_created" ON "product_reviews"("created_at" DESC, "review_id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_reviews_user_product" ON "product_reviews"("user_id", "product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_wishlist_user_added" ON "wishlist_items"("user_id", "added_at" DESC, "product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_wishlist_product" ON "wishlist_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_collections_slug" ON "collections"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_collections_status" ON "collections"("status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_collection_products_pos" ON "collection_products"("collection_id", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_collection_products_product" ON "collection_products"("product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_products_sale" ON "products"("sale_ends_at", "sale_starts_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_return_photos_grant" ON "return_photos"("grant_hash");

-- AddForeignKey
ALTER TABLE "size_charts" ADD CONSTRAINT "size_charts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_hidden_by_fkey" FOREIGN KEY ("hidden_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_reply_by_fkey" FOREIGN KEY ("reply_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_content" ADD CONSTRAINT "home_content_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("collection_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK (thêm tay; Prisma không khai báo)
-- ---------------------------------------------------------------------------

-- Đợt giảm giá (BR-PROMO-01, 05): ba cột cùng có hoặc cùng trống; 1.000 <= sale_price < price (đồng nguyên); kết thúc >= bắt đầu và
-- độ dài < 90 ngày (bắt đầu 00:00:00 giờ VN ngày D, kết thúc <= 23:59:59 giờ VN ngày D+89; dữ liệu là UTC không múi giờ).
ALTER TABLE "products"
  ADD CONSTRAINT "chk_products_sale_all_or_none" CHECK (("sale_price" IS NULL) = ("sale_starts_at" IS NULL) AND ("sale_price" IS NULL) = ("sale_ends_at" IS NULL)),
  ADD CONSTRAINT "chk_products_sale_price" CHECK ("sale_price" IS NULL OR ("sale_price" >= 1000 AND "sale_price" < "price" AND "sale_price" = trunc("sale_price"))),
  ADD CONSTRAINT "chk_products_sale_window" CHECK ("sale_price" IS NULL OR ("sale_ends_at" >= "sale_starts_at" AND "sale_ends_at" < "sale_starts_at" + interval '90 days'));

-- Đánh giá (BR-REV-03, 04, 07): giá trị hợp lệ, độ dài tối thiểu sau cắt khoảng trắng, ẩn có lý do, trả lời có thời điểm.
ALTER TABLE "product_reviews"
  ADD CONSTRAINT "chk_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "chk_reviews_fit" CHECK ("fit" IN (-1, 0, 1)),
  ADD CONSTRAINT "chk_reviews_status" CHECK ("status" IN ('visible', 'hidden')),
  ADD CONSTRAINT "chk_reviews_text" CHECK (char_length(btrim("title")) >= 2 AND char_length(btrim("body")) >= 20 AND char_length(btrim("size_bought")) >= 1),
  ADD CONSTRAINT "chk_reviews_hidden" CHECK (("status" = 'hidden') = ("hidden_at" IS NOT NULL) AND ("status" <> 'hidden' OR ("hidden_reason" IS NOT NULL AND char_length(btrim("hidden_reason")) >= 5))),
  ADD CONSTRAINT "chk_reviews_reply" CHECK (("reply_body" IS NULL) = ("reply_at" IS NULL) AND ("reply_body" IS NULL OR char_length(btrim("reply_body")) >= 5));

-- Nội dung trang chủ: đúng một dòng, dữ liệu là đối tượng JSON.
ALTER TABLE "home_content"
  ADD CONSTRAINT "chk_home_content_single" CHECK ("content_id" = 1),
  ADD CONSTRAINT "chk_home_content_data" CHECK (jsonb_typeof("data") = 'object');

-- Bộ sưu tập (BR-CMS-07).
ALTER TABLE "collections"
  ADD CONSTRAINT "chk_collections_slug" CHECK ("slug" ~ '^[a-z0-9-]{2,50}$'),
  ADD CONSTRAINT "chk_collections_status" CHECK ("status" IN ('active', 'draft')),
  ADD CONSTRAINT "chk_collections_name" CHECK (char_length(btrim("name")) >= 1),
  ADD CONSTRAINT "chk_collections_published" CHECK ("status" <> 'active' OR "published_at" IS NOT NULL);
ALTER TABLE "collection_products"
  ADD CONSTRAINT "chk_collection_products_pos" CHECK ("position" >= 0);

-- Ảnh trả hàng vãng lai (BR-RET-62): chỉ một chủ tải (tài khoản HOẶC grant), grant là SHA-256 hex (không FK: grant hết hạn / bị dọn không làm mất ảnh).
ALTER TABLE "return_photos"
  ADD CONSTRAINT "chk_return_photos_grant" CHECK ("grant_hash" IS NULL OR ("uploader_user_id" IS NULL AND "grant_hash" ~ '^[0-9a-f]{64}$'));

-- ---------------------------------------------------------------------------
-- RLS (không policy: chỉ vai trò máy chủ truy cập, như các bảng khác)
-- ---------------------------------------------------------------------------
ALTER TABLE "product_reviews"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wishlist_items"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "home_content"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collections"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collection_products" ENABLE ROW LEVEL SECURITY;
