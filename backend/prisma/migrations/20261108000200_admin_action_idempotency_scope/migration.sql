-- Slice 4 lát 4.3: Idempotency-Key của hành động admin dùng scope 'admin-action' (plan mục 2, 6.1).
-- CHECK cũ (20261107000500) chỉ nhận 'order-create', 'cart-merge'. Thay bằng CHECK RỘNG HƠN trong MỘT câu lệnh
-- (một khoá ACCESS EXCLUSIVE ngắn, mọi dòng cũ vẫn hợp lệ). Không đổi / xoá dữ liệu, không đổi cột.
ALTER TABLE "idempotency_keys"
  DROP CONSTRAINT "chk_idempotency_scope",
  ADD CONSTRAINT "chk_idempotency_scope" CHECK ("scope" IN ('order-create', 'cart-merge', 'admin-action'));
