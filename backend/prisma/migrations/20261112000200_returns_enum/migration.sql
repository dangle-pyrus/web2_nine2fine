-- Slice 9 (trả hàng), tệp 1/2: CHỈ cộng giá trị enum, không dùng giá trị mới ở đây.
-- Tách riêng vì giá trị enum mới không dùng được trong cùng giao dịch với ALTER TYPE ... ADD VALUE
-- (tiền lệ 20261107000100_auth_enum_register). IF NOT EXISTS để chạy lại an toàn. Không thể gỡ giá trị enum sau này.
ALTER TYPE "order_event_kind" ADD VALUE IF NOT EXISTS 'return_requested';
ALTER TYPE "order_event_kind" ADD VALUE IF NOT EXISTS 'return_approved';
ALTER TYPE "order_event_kind" ADD VALUE IF NOT EXISTS 'return_rejected';
ALTER TYPE "order_event_kind" ADD VALUE IF NOT EXISTS 'return_received';
ALTER TYPE "order_event_kind" ADD VALUE IF NOT EXISTS 'return_refunded';
ALTER TYPE "order_event_kind" ADD VALUE IF NOT EXISTS 'return_cancelled';
