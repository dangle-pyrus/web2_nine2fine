-- Slice 9 (trả hàng), tệp 2/2. CHỈ CỘNG THÊM: bảng, cột nullable, chỉ mục, CHECK, RLS.
-- Không xoá bảng hay cột, không đổi tên, không đổi kiểu, không sửa dữ liệu cũ. Yêu cầu trả hàng KHÔNG đổi order_status.

-- CreateTable
CREATE TABLE "order_returns" (
    "return_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "active_order_id" UUID,
    "state" VARCHAR(10) NOT NULL,
    "reason" VARCHAR(14) NOT NULL,
    "fault" VARCHAR(8) NOT NULL,
    "detail" VARCHAR(500) NOT NULL DEFAULT '',
    "condition_ack" BOOLEAN NOT NULL DEFAULT false,
    "requested_via" VARCHAR(6) NOT NULL,
    "requested_by" UUID,
    "requested_at" TIMESTAMP(6) NOT NULL,
    "approved_at" TIMESTAMP(6),
    "approved_by" UUID,
    "approve_note" VARCHAR(250),
    "carrier" VARCHAR(50),
    "tracking_number" VARCHAR(40),
    "rejected_at" TIMESTAMP(6),
    "rejected_by" UUID,
    "reject_note" VARCHAR(250),
    "received_at" TIMESTAMP(6),
    "received_by" UUID,
    "receive_note" VARCHAR(250),
    "refunded_at" TIMESTAMP(6),
    "refunded_by" UUID,
    "refund_reference" VARCHAR(60),
    "cancelled_at" TIMESTAMP(6),
    "goods_amount" INTEGER NOT NULL,
    "shipping_refund" INTEGER NOT NULL DEFAULT 0,
    "return_shipping_fee" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL,
    "amount_final" BOOLEAN NOT NULL DEFAULT false,
    "bank_name" VARCHAR(60),
    "account_last4" CHAR(4),
    "account_name" VARCHAR(50),
    "account_number_enc" VARCHAR(200),

    CONSTRAINT "order_returns_pkey" PRIMARY KEY ("return_id")
);

-- CreateTable
CREATE TABLE "order_return_items" (
    "return_item_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "return_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "accepted_quantity" INTEGER,
    "disposition" VARCHAR(8),
    "goods_amount" INTEGER NOT NULL,

    CONSTRAINT "order_return_items_pkey" PRIMARY KEY ("return_item_id")
);

-- CreateTable
CREATE TABLE "return_photos" (
    "photo_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "return_id" UUID,
    "order_id" UUID,
    "uploader_user_id" UUID,
    "storage_key" VARCHAR(40) NOT NULL,
    "storage" VARCHAR(10) NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'::text),

    CONSTRAINT "return_photos_pkey" PRIMARY KEY ("photo_id")
);

-- AlterTable (cột nullable, không DEFAULT: chỉ đổi catalog)
ALTER TABLE "order_events" ADD COLUMN "return_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_order_returns_active" ON "order_returns"("active_order_id");
CREATE INDEX IF NOT EXISTS "idx_order_returns_state_requested" ON "order_returns"("state", "requested_at" DESC, "return_id" DESC);
CREATE INDEX IF NOT EXISTS "idx_order_returns_order" ON "order_returns"("order_id", "requested_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_order_return_items" ON "order_return_items"("return_id", "order_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_return_photos_key" ON "return_photos"("storage_key");
CREATE INDEX IF NOT EXISTS "idx_return_photos_return" ON "return_photos"("return_id");
CREATE INDEX IF NOT EXISTS "idx_order_events_return" ON "order_events"("return_id", "at");

-- AddForeignKey
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "order_returns"("return_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("order_item_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "return_photos" ADD CONSTRAINT "return_photos_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "order_returns"("return_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "return_photos" ADD CONSTRAINT "return_photos_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "return_photos" ADD CONSTRAINT "return_photos_uploader_user_id_fkey" FOREIGN KEY ("uploader_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "order_returns"("return_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK (thêm tay; Prisma không khai báo)
ALTER TABLE "order_returns"
  ADD CONSTRAINT "chk_returns_state"   CHECK ("state" IN ('requested','approved','received','refunded','rejected','cancelled')),
  ADD CONSTRAINT "chk_returns_reason"  CHECK ("reason" IN ('wrong-size','wrong-color','wrong-item','defective','not-fit','changed-mind')),
  ADD CONSTRAINT "chk_returns_fault"   CHECK (("fault" = 'shop') = ("reason" IN ('wrong-size','wrong-color','wrong-item','defective')) AND "fault" IN ('shop','customer')),
  ADD CONSTRAINT "chk_returns_via"     CHECK ("requested_via" IN ('member','guest')),
  ADD CONSTRAINT "chk_returns_active"  CHECK (("state" = 'cancelled') = ("active_order_id" IS NULL) AND ("active_order_id" IS NULL OR "active_order_id" = "order_id")),
  ADD CONSTRAINT "chk_returns_amounts" CHECK ("goods_amount" >= 0 AND "shipping_refund" >= 0 AND "return_shipping_fee" >= 0 AND "amount" >= 0
                                               AND "amount" = "goods_amount" + "shipping_refund" - "return_shipping_fee"),
  ADD CONSTRAINT "chk_returns_steps"   CHECK (
        ("state" <> 'approved'  OR "approved_at" IS NOT NULL)
    AND ("state" <> 'received'  OR ("approved_at" IS NOT NULL AND "received_at" IS NOT NULL AND "amount_final"))
    AND ("state" <> 'refunded'  OR ("received_at" IS NOT NULL AND "refunded_at" IS NOT NULL AND "refund_reference" IS NOT NULL AND "amount_final"))
    AND ("state" <> 'rejected'  OR ("rejected_at" IS NOT NULL AND "reject_note" IS NOT NULL AND char_length(btrim("reject_note")) >= 5))
    AND ("state" <> 'cancelled' OR "cancelled_at" IS NOT NULL)
    AND (NOT "amount_final" OR "state" IN ('received','refunded'))),
  ADD CONSTRAINT "chk_returns_refund_ref" CHECK ("refund_reference" IS NULL OR char_length("refund_reference") BETWEEN 4 AND 60),
  ADD CONSTRAINT "chk_returns_account" CHECK (
        (("bank_name" IS NULL) = ("account_last4" IS NULL)) AND (("bank_name" IS NULL) = ("account_name" IS NULL))
    AND ("account_last4" IS NULL OR "account_last4" ~ '^[0-9]{4}$')
    AND ("account_number_enc" IS NULL OR ("bank_name" IS NOT NULL AND "state" IN ('requested','approved','received'))));

ALTER TABLE "order_return_items"
  ADD CONSTRAINT "chk_return_items_qty"  CHECK ("quantity" BETWEEN 1 AND 99 AND ("accepted_quantity" IS NULL OR "accepted_quantity" BETWEEN 0 AND "quantity")),
  ADD CONSTRAINT "chk_return_items_disp" CHECK ("disposition" IS NULL OR ("disposition" IN ('restock','writeoff') AND "accepted_quantity" > 0)),
  ADD CONSTRAINT "chk_return_items_amt"  CHECK ("goods_amount" >= 0);

ALTER TABLE "return_photos"
  ADD CONSTRAINT "chk_return_photos_key"  CHECK ("storage_key" ~ '^rp-[0-9a-f]{32}\.(jpg|png|webp)$'),
  ADD CONSTRAINT "chk_return_photos_type" CHECK ("content_type" IN ('image/jpeg','image/png','image/webp') AND "byte_size" BETWEEN 1 AND 5242880 AND "width" > 0 AND "height" > 0);

-- RLS (không policy: chỉ vai trò máy chủ truy cập)
ALTER TABLE "order_returns"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_return_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "return_photos"      ENABLE ROW LEVEL SECURITY;
