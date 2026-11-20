-- ADM-RET-05/08 (2026-11-20): kiểm hàng trả chia từng dòng thành phần nhập lại kho và phần không nhập kho.
-- `restock_quantity` = số đạt được nhập lại kho (0..accepted_quantity); NULL cho dòng cũ (đọc theo `disposition`).
ALTER TABLE "order_return_items" ADD COLUMN "restock_quantity" INTEGER;

UPDATE "order_return_items"
SET "restock_quantity" = CASE WHEN "disposition" = 'restock' THEN "accepted_quantity" ELSE 0 END
WHERE "accepted_quantity" IS NOT NULL AND "accepted_quantity" > 0;

ALTER TABLE "order_return_items"
  ADD CONSTRAINT "chk_return_items_restock"
  CHECK ("restock_quantity" IS NULL OR ("accepted_quantity" IS NOT NULL AND "restock_quantity" BETWEEN 0 AND "accepted_quantity"));
