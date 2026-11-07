-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('to_pay', 'to_ship', 'to_receive', 'completed', 'cancel_requested', 'cancelled');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'failed', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('cod', 'bank_transfer');

-- CreateEnum
CREATE TYPE "order_actor" AS ENUM ('customer', 'shop', 'system');

-- CreateEnum
CREATE TYPE "voucher_kind" AS ENUM ('percent', 'fixed', 'free_shipping');

-- CreateTable
CREATE TABLE "store_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "max_per_variant" INTEGER NOT NULL DEFAULT 5,
    "max_items_per_order" INTEGER NOT NULL DEFAULT 20,
    "max_cart_lines" INTEGER NOT NULL DEFAULT 30,
    "cart_retention_days" INTEGER NOT NULL DEFAULT 30,
    "shipping_fee" INTEGER NOT NULL DEFAULT 30000,
    "free_shipping_threshold" INTEGER NOT NULL DEFAULT 1000000,
    "cod_max_total" INTEGER NOT NULL DEFAULT 5000000,
    "cod_refusal_limit" INTEGER NOT NULL DEFAULT 2,
    "cod_refusal_months" INTEGER NOT NULL DEFAULT 6,
    "cod_open_order_limit" INTEGER NOT NULL DEFAULT 3,
    "bank_hold_minutes" INTEGER NOT NULL DEFAULT 30,
    "bank_transfer_enabled" BOOLEAN NOT NULL DEFAULT false,
    "delivery_days_min" INTEGER NOT NULL DEFAULT 2,
    "delivery_days_max" INTEGER NOT NULL DEFAULT 4,
    "cutoff_hour" INTEGER NOT NULL DEFAULT 16,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "holiday_date" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("holiday_date")
);

-- CreateTable
CREATE TABLE "provinces" (
    "province_code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_search" VARCHAR(100) NOT NULL,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("province_code")
);

-- CreateTable
CREATE TABLE "wards" (
    "ward_code" VARCHAR(10) NOT NULL,
    "province_code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_search" VARCHAR(100) NOT NULL,

    CONSTRAINT "wards_pkey" PRIMARY KEY ("ward_code")
);

-- CreateTable
CREATE TABLE "carts" (
    "cart_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("cart_id")
);

-- CreateTable
CREATE TABLE "cart_lines" (
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_lines_pkey" PRIMARY KEY ("cart_id","variant_id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "voucher_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" "voucher_kind" NOT NULL,
    "value" INTEGER,
    "max_discount" INTEGER,
    "min_subtotal" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(6),
    "ends_at" TIMESTAMP(6),
    "total_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "per_user_limit" INTEGER NOT NULL DEFAULT 1,
    "members_only" BOOLEAN NOT NULL DEFAULT false,
    "first_order_only" BOOLEAN NOT NULL DEFAULT false,
    "category_id" UUID,
    "exclude_sale_items" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("voucher_id")
);

-- CreateTable
CREATE TABLE "voucher_redemptions" (
    "redemption_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "voucher_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID,
    "phone" VARCHAR(10) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(6),

    CONSTRAINT "voucher_redemptions_pkey" PRIMARY KEY ("redemption_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(13) NOT NULL,
    "user_id" UUID,
    "status" "order_status" NOT NULL,
    "payment_status" "payment_status" NOT NULL DEFAULT 'pending',
    "payment_method" "payment_method" NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "recipient_name" VARCHAR(50) NOT NULL,
    "recipient_phone" VARCHAR(10) NOT NULL,
    "province_code" VARCHAR(10) NOT NULL,
    "ward_code" VARCHAR(10) NOT NULL,
    "province_name" VARCHAR(100) NOT NULL,
    "ward_name" VARCHAR(100) NOT NULL,
    "street" VARCHAR(200) NOT NULL,
    "note" VARCHAR(250),
    "invoice_company" VARCHAR(200),
    "invoice_tax_code" VARCHAR(14),
    "invoice_address" VARCHAR(200),
    "invoice_email" VARCHAR(254),
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL,
    "shipping_fee" INTEGER NOT NULL,
    "shipping_discount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "discount_voucher_code" VARCHAR(20),
    "shipping_voucher_code" VARCHAR(20),
    "payment_due_at" TIMESTAMP(6),
    "paid_at" TIMESTAMP(6),
    "estimated_from" DATE NOT NULL,
    "estimated_to" DATE NOT NULL,
    "needs_confirm_call" BOOLEAN NOT NULL DEFAULT false,
    "terms_accepted_at" TIMESTAMP(6) NOT NULL,
    "items_fingerprint" CHAR(64) NOT NULL,
    "cancelled_at" TIMESTAMP(6),
    "cancelled_by" "order_actor",
    "cancel_reason" VARCHAR(250),
    "stock_restored_at" TIMESTAMP(6),
    "delivery_refused_at" TIMESTAMP(6),
    "confirmation_email_sent_at" TIMESTAMP(6),
    "email_attempts" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "order_item_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "line_no" SMALLINT NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "color_name" VARCHAR(50) NOT NULL,
    "size" VARCHAR(10) NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "media_id" VARCHAR(100) NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "compare_at_price" INTEGER,
    "quantity" INTEGER NOT NULL,
    "line_discount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_item_id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_status" "order_status",
    "to_status" "order_status" NOT NULL,
    "payment_status" "payment_status" NOT NULL,
    "actor" "order_actor" NOT NULL,
    "detail" VARCHAR(250),

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "scope" VARCHAR(20) NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "order_id" UUID,
    "response_snapshot" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("scope","key")
);

-- CreateTable
CREATE TABLE "order_access_grants" (
    "token_hash" CHAR(64) NOT NULL,
    "order_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "order_access_grants_pkey" PRIMARY KEY ("token_hash")
);

-- CreateIndex
CREATE INDEX "idx_wards_province_name" ON "wards"("province_code", "name_search");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE INDEX "idx_cart_lines_cart_updated" ON "cart_lines"("cart_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");

-- CreateIndex
CREATE INDEX "idx_redemptions_voucher_user" ON "voucher_redemptions"("voucher_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_redemptions_voucher_phone" ON "voucher_redemptions"("voucher_id", "phone");

-- CreateIndex
CREATE INDEX "idx_redemptions_voucher_email" ON "voucher_redemptions"("voucher_id", "email");

-- CreateIndex
CREATE INDEX "idx_redemptions_order" ON "voucher_redemptions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_redemptions_voucher_order" ON "voucher_redemptions"("voucher_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_code_key" ON "orders"("code");

-- CreateIndex
CREATE INDEX "idx_orders_user_created" ON "orders"("user_id", "created_at" DESC, "order_id");

-- CreateIndex
CREATE INDEX "idx_orders_status_due" ON "orders"("status", "payment_due_at");

-- CreateIndex
CREATE INDEX "idx_orders_phone_created" ON "orders"("recipient_phone", "created_at");

-- CreateIndex
CREATE INDEX "idx_orders_email_created" ON "orders"("email", "created_at");

-- CreateIndex
CREATE INDEX "idx_orders_dup" ON "orders"("recipient_phone", "items_fingerprint", "created_at");

-- CreateIndex
CREATE INDEX "idx_orders_email_pending" ON "orders"("confirmation_email_sent_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_order_items_order_variant" ON "order_items"("order_id", "variant_id");

-- CreateIndex
CREATE INDEX "idx_order_events_order_at" ON "order_events"("order_id", "at");

-- CreateIndex
CREATE INDEX "idx_idempotency_expires" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE INDEX "idx_order_grants_expires" ON "order_access_grants"("expires_at");

-- CreateIndex
CREATE INDEX "idx_order_grants_order" ON "order_access_grants"("order_id");

-- AddForeignKey
ALTER TABLE "wards" ADD CONSTRAINT "wards_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("province_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("cart_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("voucher_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("province_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_ward_code_fkey" FOREIGN KEY ("ward_code") REFERENCES "wards"("ward_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_access_grants" ADD CONSTRAINT "order_access_grants_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (not expressible in Prisma). Additive only.
ALTER TABLE "store_settings" ADD CONSTRAINT "chk_store_settings_singleton" CHECK ("id" = 1);
ALTER TABLE "store_settings" ADD CONSTRAINT "chk_store_settings_positive" CHECK (
  "max_per_variant" > 0 AND "max_items_per_order" > 0 AND "max_cart_lines" > 0 AND "cart_retention_days" > 0
  AND "cod_max_total" > 0 AND "cod_refusal_limit" > 0 AND "cod_refusal_months" > 0 AND "cod_open_order_limit" > 0
  AND "bank_hold_minutes" > 0 AND "delivery_days_min" > 0 AND "delivery_days_max" > 0);
ALTER TABLE "store_settings" ADD CONSTRAINT "chk_store_settings_nonneg" CHECK ("shipping_fee" >= 0 AND "free_shipping_threshold" >= 0);
ALTER TABLE "store_settings" ADD CONSTRAINT "chk_store_settings_delivery" CHECK ("delivery_days_min" <= "delivery_days_max");
ALTER TABLE "store_settings" ADD CONSTRAINT "chk_store_settings_cutoff" CHECK ("cutoff_hour" BETWEEN 0 AND 23);

ALTER TABLE "holidays" ADD CONSTRAINT "chk_holidays_name" CHECK (char_length(btrim("name")) >= 1);

ALTER TABLE "provinces" ADD CONSTRAINT "chk_provinces_name" CHECK (char_length(btrim("name")) >= 1);
ALTER TABLE "wards" ADD CONSTRAINT "chk_wards_name" CHECK (char_length(btrim("name")) >= 1);

ALTER TABLE "cart_lines" ADD CONSTRAINT "chk_cart_lines_quantity" CHECK ("quantity" BETWEEN 1 AND 99);

ALTER TABLE "vouchers" ADD CONSTRAINT "chk_vouchers_code" CHECK ("code" ~ '^[A-Z0-9]{4,20}$');
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_vouchers_value" CHECK (
  ("kind" = 'percent' AND "value" BETWEEN 1 AND 90)
  OR ("kind" = 'fixed' AND "value" > 0)
  OR ("kind" = 'free_shipping' AND "value" IS NULL));
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_vouchers_max_discount" CHECK ("max_discount" IS NULL OR ("kind" = 'percent' AND "max_discount" > 0));
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_vouchers_min_subtotal" CHECK ("min_subtotal" >= 0);
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_vouchers_period" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_vouchers_total_limit" CHECK ("total_limit" IS NULL OR "total_limit" >= 1);
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_vouchers_used_count" CHECK ("used_count" >= 0 AND ("total_limit" IS NULL OR "used_count" <= "total_limit"));
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_vouchers_per_user" CHECK ("per_user_limit" >= 1);

ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_code" CHECK ("code" ~ '^N2F[0-9]{10}$');
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_email" CHECK ("email" = lower("email"));
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_recipient_name" CHECK (char_length(btrim("recipient_name")) BETWEEN 2 AND 50);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_recipient_phone" CHECK ("recipient_phone" ~ '^0(3|5|7|8|9)[0-9]{8}$');
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_street" CHECK (char_length(btrim("street")) BETWEEN 5 AND 200);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_invoice_all_or_none" CHECK (
  ("invoice_company" IS NULL AND "invoice_tax_code" IS NULL AND "invoice_address" IS NULL AND "invoice_email" IS NULL)
  OR ("invoice_company" IS NOT NULL AND "invoice_tax_code" IS NOT NULL AND "invoice_address" IS NOT NULL AND "invoice_email" IS NOT NULL));
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_invoice_tax_code" CHECK ("invoice_tax_code" IS NULL OR "invoice_tax_code" ~ '^[0-9]{10}(-[0-9]{3})?$');
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_totals" CHECK (
  "subtotal" >= 0 AND "discount" BETWEEN 0 AND "subtotal" AND "shipping_fee" >= 0
  AND "shipping_discount" BETWEEN 0 AND "shipping_fee"
  AND "total" = "subtotal" - "discount" + "shipping_fee" - "shipping_discount");
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_to_pay_due" CHECK ("status" <> 'to_pay' OR ("payment_method" = 'bank_transfer' AND "payment_due_at" IS NOT NULL));
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_cancelled" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL));
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_stock_restored" CHECK ("stock_restored_at" IS NULL OR "status" = 'cancelled');

ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_price" CHECK ("unit_price" >= 0 AND ("compare_at_price" IS NULL OR "compare_at_price" >= 0));
ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_quantity" CHECK ("quantity" BETWEEN 1 AND 99);
ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_line_discount" CHECK ("line_discount" BETWEEN 0 AND ("unit_price"::bigint * "quantity"));

ALTER TABLE "idempotency_keys" ADD CONSTRAINT "chk_idempotency_scope" CHECK ("scope" IN ('order-create', 'cart-merge'));

-- Keep new tables out of Supabase's public Data API (no policy; backend connects as owner).
ALTER TABLE "store_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provinces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vouchers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "voucher_redemptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_access_grants" ENABLE ROW LEVEL SECURITY;
