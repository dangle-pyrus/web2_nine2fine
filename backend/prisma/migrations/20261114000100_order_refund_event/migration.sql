-- COMMON-02.4 (2026-11-14): admin xác nhận đã hoàn tiền cho đơn đã thanh toán nhưng bị huỷ -> payment_status = refunded.
-- Chỉ cộng thêm một giá trị enum cho sự kiện đơn. Không đổi dữ liệu cũ.
ALTER TYPE "order_event_kind" ADD VALUE IF NOT EXISTS 'refunded';
