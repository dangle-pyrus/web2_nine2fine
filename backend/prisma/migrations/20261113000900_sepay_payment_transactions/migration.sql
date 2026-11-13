-- Chuyển khoản QR tự đối soát qua SePay (BR-CHK-21, plan cart-checkout mục 4.8). CHỈ CỘNG THÊM: một bảng mới, chỉ mục, CHECK, RLS.
-- Không đổi bảng / cột cũ, không sửa dữ liệu. Không lưu số tài khoản đối ứng.

-- CreateTable
CREATE TABLE "payment_transactions" (
    "tx_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" VARCHAR(20) NOT NULL,
    "provider_tx_id" VARCHAR(100) NOT NULL,
    "order_id" UUID,
    "amount" INTEGER NOT NULL,
    "content" VARCHAR(500) NOT NULL DEFAULT '',
    "reference" VARCHAR(100),
    "received_at" TIMESTAMP(6) NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "outcome" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("tx_id"),
    CONSTRAINT "payment_transactions_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "payment_transactions_outcome_check" CHECK ("outcome" IN ('unmatched', 'partial', 'paid', 'overpaid', 'after_paid', 'after_cancel')),
    CONSTRAINT "payment_transactions_matched_check" CHECK (("matched" AND "order_id" IS NOT NULL) OR (NOT "matched" AND "outcome" = 'unmatched'))
);

-- Idempotent theo mã giao dịch của nhà cung cấp (webhook gửi lại không cộng tiền hai lần).
CREATE UNIQUE INDEX "payment_transactions_provider_tx_key" ON "payment_transactions"("provider", "provider_tx_id");
CREATE INDEX "idx_payment_transactions_order" ON "payment_transactions"("order_id", "received_at");
CREATE INDEX "idx_payment_transactions_unmatched" ON "payment_transactions"("matched", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (không policy: chỉ vai trò máy chủ truy cập)
ALTER TABLE "payment_transactions" ENABLE ROW LEVEL SECURITY;
