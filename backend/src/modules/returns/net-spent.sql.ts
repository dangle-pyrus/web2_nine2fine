import { Prisma } from '@prisma/client';

/**
 * MỘT nguồn "chi tiêu ròng" cho hạng thành viên (BR-RET-53; plan Slice 9 mục 10.2): `total` của đơn trừ tiền hàng và phí giao đã
 * hoàn của yêu cầu `refunded`. KHÔNG trừ phí gửi trả. Dùng ở `getMembership` (account) và `customer.query` (admin khách hàng).
 * Alias bắt buộc: bảng đơn `o`; fragment nối thêm `rr` (yêu cầu `refunded`, tối đa 1 dòng / đơn nhờ `uq_order_returns_active`).
 */
export const NET_SPENT_JOIN = Prisma.sql`LEFT JOIN "order_returns" rr ON rr."order_id" = o."order_id" AND rr."state" = 'refunded'`;
export const NET_TOTAL = Prisma.sql`(o."total" - COALESCE(rr."goods_amount", 0) - COALESCE(rr."shipping_refund", 0))`;
