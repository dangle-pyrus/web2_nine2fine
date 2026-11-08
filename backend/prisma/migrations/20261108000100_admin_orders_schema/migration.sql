-- CreateEnum
CREATE TYPE "order_event_kind" AS ENUM ('placed', 'payment_received', 'call_attempt', 'confirmed', 'shipped', 'delivered', 'cancel_requested', 'cancel_approved', 'cancel_rejected', 'cancelled', 'stock_restocked', 'stock_written_off', 'note');

-- AlterTable
ALTER TABLE "order_events" ADD COLUMN     "actor_name" VARCHAR(100),
ADD COLUMN     "actor_role" "user_role",
ADD COLUMN     "actor_user_id" UUID,
ADD COLUMN     "email_attempts" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "email_sent_at" TIMESTAMP(6),
ADD COLUMN     "email_template" VARCHAR(30),
ADD COLUMN     "internal_note" VARCHAR(500),
ADD COLUMN     "kind" "order_event_kind",
ADD COLUMN     "reason_code" VARCHAR(20);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "active_tracking_number" VARCHAR(40),
ADD COLUMN     "cancel_note" VARCHAR(250),
ADD COLUMN     "cancel_reason_code" VARCHAR(20),
ADD COLUMN     "cancel_request_decided_at" TIMESTAMP(6),
ADD COLUMN     "cancel_request_decided_by" UUID,
ADD COLUMN     "cancel_request_outcome" VARCHAR(8),
ADD COLUMN     "cancel_request_reason" VARCHAR(250),
ADD COLUMN     "cancel_request_reject_reason" VARCHAR(250),
ADD COLUMN     "cancel_requested_at" TIMESTAMP(6),
ADD COLUMN     "carrier" VARCHAR(50),
ADD COLUMN     "confirmed_at" TIMESTAMP(6),
ADD COLUMN     "confirmed_by" UUID,
ADD COLUMN     "delivered_at" TIMESTAMP(6),
ADD COLUMN     "delivered_by" UUID,
ADD COLUMN     "handed_over_at" TIMESTAMP(6),
ADD COLUMN     "handed_over_by" UUID,
ADD COLUMN     "return_decision" VARCHAR(12),
ADD COLUMN     "return_handled_at" TIMESTAMP(6),
ADD COLUMN     "return_handled_by" UUID,
ADD COLUMN     "return_note" VARCHAR(250),
ADD COLUMN     "returned_from_transit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tracking_number" VARCHAR(40);

-- CreateIndex
CREATE INDEX "idx_order_events_email_pending" ON "order_events"("email_sent_at", "email_attempts", "at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_active_tracking_number_key" ON "orders"("active_tracking_number");

-- CreateIndex
CREATE INDEX "idx_orders_created" ON "orders"("created_at" DESC, "order_id" DESC);

-- CreateIndex
CREATE INDEX "idx_orders_status_created" ON "orders"("status", "created_at" DESC, "order_id" DESC);

-- CreateIndex
CREATE INDEX "idx_orders_return_pending" ON "orders"("returned_from_transit", "return_handled_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_handed_over_by_fkey" FOREIGN KEY ("handed_over_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_by_fkey" FOREIGN KEY ("delivered_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancel_request_decided_by_fkey" FOREIGN KEY ("cancel_request_decided_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_return_handled_by_fkey" FOREIGN KEY ("return_handled_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CHECK constraints (not expressible in Prisma). Additive only; new columns are NULL for existing rows.
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_shipment" CHECK (
  ("carrier" IS NULL) = ("tracking_number" IS NULL) AND ("carrier" IS NULL) = ("handed_over_at" IS NULL)
);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_tracking_format" CHECK ("tracking_number" IS NULL OR "tracking_number" ~ '^[A-Z0-9-]{4,40}$');
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_active_tracking" CHECK ("active_tracking_number" IS NULL OR "active_tracking_number" = "tracking_number");
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_delivered" CHECK ("delivered_at" IS NULL OR "status" = 'completed');
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_confirmed" CHECK ("confirmed_by" IS NULL OR "confirmed_at" IS NOT NULL);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_cancel_requested" CHECK ("status" <> 'cancel_requested' OR "cancel_requested_at" IS NOT NULL);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_cancel_request_outcome" CHECK (
  "cancel_request_outcome" IS NULL OR ("cancel_request_outcome" IN ('approved', 'rejected') AND "cancel_requested_at" IS NOT NULL)
);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_cancel_reason_code" CHECK (
  "cancel_reason_code" IS NULL OR ("status" = 'cancelled' AND "cancel_reason_code" IN ('unreachable', 'declined_on_call', 'customer_request', 'refused', 'undeliverable', 'other'))
);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_returned_transit" CHECK ("returned_from_transit" = false OR "status" = 'cancelled');
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_return_pair" CHECK (("return_handled_at" IS NULL) = ("return_decision" IS NULL));
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_return_handled" CHECK ("return_handled_at" IS NULL OR "returned_from_transit");
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_return_decision" CHECK ("return_decision" IS NULL OR "return_decision" IN ('restocked', 'written_off'));
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_return_restocked" CHECK ("return_decision" IS DISTINCT FROM 'restocked' OR "stock_restored_at" IS NOT NULL);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_delivery_refused" CHECK ("delivery_refused_at" IS NULL OR "status" = 'cancelled');

ALTER TABLE "order_events" ADD CONSTRAINT "chk_order_events_actor_user" CHECK ("actor_user_id" IS NULL OR "actor" = 'shop');
ALTER TABLE "order_events" ADD CONSTRAINT "chk_order_events_email_attempts" CHECK ("email_attempts" BETWEEN 0 AND 3);
