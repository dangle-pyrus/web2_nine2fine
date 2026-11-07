-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "product_gender" AS ENUM ('nam', 'nu');

-- CreateEnum
CREATE TYPE "product_moment" AS ENUM ('work', 'dinner', 'event', 'weekend');

-- CreateTable
CREATE TABLE "categories" (
    "category_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type_label" VARCHAR(120) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "compare_at_price" DECIMAL(12,2),
    "badge" VARCHAR(20),
    "description" TEXT NOT NULL DEFAULT '',
    "material" TEXT NOT NULL DEFAULT '',
    "care" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "fit_summary" TEXT NOT NULL DEFAULT '',
    "fit_model" TEXT NOT NULL DEFAULT '',
    "looks" JSONB NOT NULL DEFAULT '[]',
    "cover_media_id" VARCHAR(100) NOT NULL,
    "gallery_media_ids" TEXT[] NOT NULL,
    "color_media" JSONB NOT NULL DEFAULT '{}',
    "moments" "product_moment"[] NOT NULL,
    "genders" "product_gender"[] NOT NULL,
    "sales_rank" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL,
    "search_text" TEXT NOT NULL,
    "status" "product_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" DATE NOT NULL DEFAULT CURRENT_DATE,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "variant_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "size" VARCHAR(10) NOT NULL,
    "color_name" VARCHAR(50) NOT NULL,
    "color_hex" CHAR(7) NOT NULL,
    "inventory_qty" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "size_charts" (
    "category_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "size_charts_pkey" PRIMARY KEY ("category_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "idx_products_category" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "idx_products_status_order" ON "products"("status", "display_order", "slug");

-- CreateIndex
CREATE INDEX "idx_products_moments" ON "products" USING GIN ("moments");

-- CreateIndex
CREATE INDEX "idx_products_genders" ON "products" USING GIN ("genders");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "uq_variants_product_color_size" ON "product_variants"("product_id", "color_name", "size");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "size_charts" ADD CONSTRAINT "size_charts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (not expressible in Prisma)
ALTER TABLE "categories" ADD CONSTRAINT "chk_categories_slug" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "products" ADD CONSTRAINT "chk_products_slug" CHECK (char_length("slug") BETWEEN 3 AND 80 AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "products" ADD CONSTRAINT "chk_products_name" CHECK (char_length(btrim("name")) >= 1);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_type_label" CHECK (char_length(btrim("type_label")) >= 1);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_price" CHECK ("price" BETWEEN 10000 AND 50000000 AND "price" = trunc("price"));
ALTER TABLE "products" ADD CONSTRAINT "chk_products_compare_at_price" CHECK ("compare_at_price" IS NULL OR "compare_at_price" > "price");
ALTER TABLE "products" ADD CONSTRAINT "chk_products_looks" CHECK (jsonb_typeof("looks") = 'array');
ALTER TABLE "products" ADD CONSTRAINT "chk_products_cover_media" CHECK ("cover_media_id" ~ '^[a-z0-9-]+$');
ALTER TABLE "products" ADD CONSTRAINT "chk_products_gallery" CHECK (cardinality("gallery_media_ids") >= 1);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_color_media" CHECK (jsonb_typeof("color_media") = 'object');
ALTER TABLE "products" ADD CONSTRAINT "chk_products_moments" CHECK (cardinality("moments") >= 1);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_genders" CHECK (cardinality("genders") >= 1);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_sales_rank" CHECK ("sales_rank" >= 1);

ALTER TABLE "product_variants" ADD CONSTRAINT "chk_variants_size" CHECK ("size" IN ('S', 'M', 'L', 'XL'));
ALTER TABLE "product_variants" ADD CONSTRAINT "chk_variants_color_hex" CHECK ("color_hex" ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE "product_variants" ADD CONSTRAINT "chk_variants_inventory" CHECK ("inventory_qty" >= 0);

-- Keep catalog tables out of Supabase's public Data API (no policy; backend connects as owner).
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "size_charts" ENABLE ROW LEVEL SECURITY;
