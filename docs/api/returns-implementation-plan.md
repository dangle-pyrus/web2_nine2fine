# Kế hoạch triển khai Trả hàng / hoàn tiền (Slice 9) - draft 2026-11-12

Hợp đồng: `docs/api/openapi.yaml` (phần Slice 9 `x-status: draft`, 17 operation, tag `returns`, `return-photos`, `admin-returns`; chuyển `locked` sau khi Orchestrator duyệt mục 15, trước khi FE nối). BR/AC: `docs/product/PRD.md` mục "Slice 9" (BR-RET-01..09, 10..24, 30..44, 50..55; AC-RET-01..24, 30..44, 50..55; S9-Q1..Q14). Lát giao: `docs/product/backlog.md` mục "Slice 9" (9.1-9.9). Khi mâu thuẫn, PRD thắng, trừ các điểm đã ghi ở mục 15 (chọn cách an toàn, chờ PO). Chỉ là tài liệu: agent triển khai làm theo mục 13 không cần hỏi lại. Cùng khuôn với `docs/api/admin-insights-implementation-plan.md` (đọc mục 3, 4, 5: `requirePermission`, `adminRateLimit`, `noStore`, một nguồn doanh thu `revenue.sql.ts`, giờ VN tường minh UTC) và `docs/api/admin-orders-implementation-plan.md` (sự kiện đơn, thư theo sự kiện).

## 0. Câu hỏi S9-Q1..Q14

Làm theo mặc định PO. Tham số gom vào khối `RETURNS_ASSUMPTIONS` trong `backend/src/config/assumptions.ts`; quyền `RETURN_PERMISSIONS` cùng file.

| Q | Mặc định | Lật ở đâu | Hệ quả khi lật |
| --- | --- | --- | --- |
| S9-Q1 | thành viên Must; vãng lai Should (lát 9.6) | bỏ 5 operation `/orders/{orderCode}/return*` + nhánh `Principal = guest` | Cắt được nguyên khối: `createReturn` nhận `Principal` (`member` \| `guest`), phần vãng lai chỉ là router + kiểm quyền ảnh theo `order_id` |
| S9-Q2 | hạn = hết 23:59:59 VN ngày thứ 30 kể từ ngày giao | `RETURNS_ASSUMPTIONS.windowDays = 30` + `return-rules.ts::returnDeadline` | Một hằng số + test AC-RET-10 |
| S9-Q3 | một phần theo dòng, 6 lý do, phí gửi trả 30.000 chỉ lỗi của khách | `RETURNS_ASSUMPTIONS.returnShippingFee`, `REASONS` | Hằng số; thêm lý do = sửa `REASONS` + CHECK `chk_returns_reason` (migration mới) |
| S9-Q4 | ảnh riêng tư, lỗi shop >= 1, <= 5, <= 5 MB, cạnh 200..8.000 px | `RETURNS_ASSUMPTIONS.photo` | Tham số; đổi nơi lưu = thêm driver `PrivateImageStorage` (mục 8) |
| S9-Q5 | COD bắt buộc tài khoản, che, admin xem đủ ở `received`, xoá khi cuối | `account-secret.ts` + `return.mapper.ts` (`includeFullAccount`) | Cho staff xem đủ = thêm `returns.refund` cho staff (mục 12) |
| S9-Q6 | 6 trạng thái, huỷ chỉ ở `requested`, không hết hạn tự động | `return-rules.ts::TRANSITIONS` | Một bảng + test AC-RET-08 |
| S9-Q7 | staff: xem / duyệt / từ chối / nhận hàng; admin: xác nhận hoàn tiền + số đầy đủ | `RETURN_PERMISSIONS` + `permissions.ts` FE | Một dòng ở hai nơi |
| S9-Q8 | doanh thu trừ tiền hàng hoàn vào NGÀY BÁN GỐC; hạng trừ tiền hàng + phí giao hoàn | `revenue.sql.ts` + `net-spent.sql.ts` (mục 10) | Phương án "ngày hoàn" = viết lại các khối: Won't |
| S9-Q9 | số tiền do máy chủ chốt; admin chỉ xác nhận | `process-return.service.ts::refund` | Cho sửa tay = thêm `amount` tự do + cột `amount_override`: Won't |
| S9-Q10 | 1 yêu cầu không-`cancelled` / đơn (DB), `Idempotency-Key` bắt buộc | cột `active_order_id` UNIQUE (mục 2) | Cho tạo lại sau từ chối = bỏ `rejected` khỏi `active`: cần migration |
| S9-Q11 | 4 thư Must (+1 Should) | `return-templates.ts` | Chữ do PO soạn, sửa file mẫu |
| S9-Q12 | mốc 24 giờ / 2 ngày / 1-3 ngày chỉ là "dự kiến"; cờ quá hạn Should | `RETURNS_ASSUMPTIONS.overdueHours = 24`, `refundWorkingDays = 3` | Tham số |
| S9-Q13 | nhánh chuyển khoản xây + kiểm bằng seed | nhánh `paymentMethod = bank_transfer` ở `createReturn` | Đã có test seed (T-RET-18) |
| S9-Q14 | trường FE không có dữ liệu = Won't | FE | Không BE |

## 1. Phạm vi BE Slice 9

17 operation:

| Tag | Endpoint | Quyền | Giới hạn |
| --- | --- | --- | --- |
| returns | `POST /account/orders/{orderCode}/return` (tạo, `Idempotency-Key` bắt buộc) | chủ đơn (`n2f_sid`) | 10 / giờ / tài khoản |
| returns | `POST /account/orders/{orderCode}/return/estimate` (Should) | chủ đơn | đọc 120 / 60 giây / IP (`cartQuoteLimit`) |
| returns | `POST /account/orders/{orderCode}/return/cancel` | chủ đơn | `cartQuoteLimit` |
| return-photos | `POST /account/return-photos` (byte thô) | thành viên | 30 / giờ / tài khoản |
| return-photos | `GET /account/return-photos/{photoId}` | người tải / chủ đơn | `cartQuoteLimit` |
| returns / return-photos | 5 operation vãng lai `POST /orders/{orderCode}/return`, `.../cancel`, `.../estimate`, `POST .../return/photos`, `GET .../return/photos/{photoId}` (**Should, lát 9.6, có thể cắt**) | `n2f_oa` đúng đơn (hoặc chủ đơn) | 10 / giờ / IP (tạo), 30 / giờ / đơn (ảnh) |
| admin-returns | `GET /admin/returns?state&q&sort&page&limit` | staff, admin (`returns.process`) | đọc 120 / 60 giây |
| admin-returns | `GET /admin/returns/{returnId}` | `returns.process` | đọc |
| admin-returns | `POST /admin/returns/{returnId}/approve`, `/reject`, `/receive` | `returns.process` | ghi 60 / 60 giây |
| admin-returns | `POST /admin/returns/{returnId}/refund` | `returns.refund` (CHỈ admin) | ghi |
| return-photos | `GET /admin/return-photos/{photoId}` | staff, admin | đọc |

Chạm contract cũ (chỉ CỘNG THÊM trường, mục 15 #3): `Order` (+`canReturn` bắt buộc, `returnDeadline`, `return`), `AdminOrder` (+`return`), `AdminOrderSummary` (+`returnPending` Should), `AdminEventKind` (+6), `AdminDashboardTodo` (+`returnRequested`, `returnApproved`, `returnReceived`), `AdminSalesReport.kpis` (+`refundedAmount`, `refundedUnits`, `returnedOrders`, `returnRate` Should), `ErrorResponse.error.currentReturnState`.

Mã lỗi mới: `not-returnable` 409, `return-window-closed` 409, `return-exists` 409 (`errors.ts`: `Errors.notReturnable()`, `returnWindowClosed()`, `returnExists()`, `invalidReturnTransition(currentReturnState)`; cộng vào `ErrorCode` + `STATUS`). Dùng lại: `unauthenticated`, `forbidden`, `origin-not-allowed`, `not-found`, `validation` (+`field` phẳng, +`fieldErrors` qua `parseBodyAll` / `Errors.validationMany` của Slice 8), `invalid-image`, `invalid-transition` (nay có `currentReturnState` thay `currentStatus`), `idempotency-conflict`, `rate-limited`, `unavailable`.

Ngoài phạm vi: đổi hàng, cổng hoàn tiền, nhân viên tạo hộ, sửa tay số tiền, hoàn nhiều đợt, tạo lại sau `rejected` / `refunded`, hoàn lượt voucher, lý do "khác", tự xoá ảnh theo lịch, sửa hạn / phí gửi trả ở Cài đặt, `returnRate` ở Tổng quan, hàng hoàn Slice 4 (`returning`, không đụng), địa chỉ trả.

## 2. Schema Prisma và migration (chỉ cộng thêm, BR-RET-05)

**Hai** migration (sau `20261112000100`): tách riêng giá trị enum, theo tiền lệ `20261107000100_auth_enum_register`.

1. `backend/prisma/migrations/20261112000200_returns_enum/migration.sql`: chỉ `ALTER TYPE "order_event_kind" ADD VALUE IF NOT EXISTS 'return_requested'` (rồi `'return_approved'`, `'return_rejected'`, `'return_received'`, `'return_refunded'`, `'return_cancelled'`). **Lý do tách:** Postgres từ 12 cho `ADD VALUE` trong khối giao dịch nhưng giá trị mới KHÔNG dùng được trong cùng giao dịch (`unsafe use of new value`), và Prisma chạy cả tệp như một lô; tách tệp thì giá trị mới đã commit trước khi tệp 2 chạy. Tệp 1 không chứa gì khác (không chỉ mục / CHECK / dữ liệu dùng giá trị mới). `IF NOT EXISTS` để chạy lại an toàn. Kiểm `SELECT version()` của DB cục bộ `n2f_dev` / `n2f_test` (cần >= 12; Supabase là 15) trước khi chạy. Không thể "gỡ" giá trị enum sau này: chấp nhận (cộng thêm).
2. `backend/prisma/migrations/20261112000300_returns_schema/migration.sql`: bảng, cột, chỉ mục, CHECK, RLS. **Không `DROP` / `TRUNCATE` / `RENAME` / đổi kiểu, không `UPDATE` / `INSERT` / `DELETE FROM`.** `ALTER TABLE "order_events" ADD COLUMN "return_id" UUID` (nullable, không DEFAULT = chỉ đổi catalog).

Quy trình: `npx prisma migrate dev --create-only --name returns_enum` rồi `--name returns_schema` trên `n2f_dev`; mở SQL, thêm tay CHECK, RLS, sửa `CREATE INDEX` thành `IF NOT EXISTS`; quét `DROP|TRUNCATE|DELETE FROM|RENAME|ALTER COLUMN .* TYPE|UPDATE `: có thì dừng (cụm `ON DELETE SET NULL` / `CASCADE` của FK là hợp lệ). Áp lên Supabase chỉ khi Thắng duyệt (lát 9.8); Orchestrator / Thắng chạy `migrate deploy` (`DIRECT_URL`), không `migrate dev` / `reset` / `db push`.

SQL dự kiến (tệp 2):

```sql
-- Yêu cầu trả hàng (D1, D2). KHÔNG đổi order_status. Trạng thái / lý do là VARCHAR + CHECK (không enum mới: tránh ADD VALUE cho thứ hay đổi).
CREATE TABLE "order_returns" (
    "return_id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "order_id"            UUID         NOT NULL,
    "active_order_id"     UUID,          -- = order_id khi state <> 'cancelled', NULL khi 'cancelled'; UNIQUE => tối đa 1 yêu cầu không-cancelled / đơn (BR-RET-09)
    "state"               VARCHAR(10)  NOT NULL,
    "reason"              VARCHAR(14)  NOT NULL,
    "fault"               VARCHAR(8)   NOT NULL,
    "detail"              VARCHAR(500) NOT NULL DEFAULT '',
    "condition_ack"       BOOLEAN      NOT NULL DEFAULT false,
    "requested_via"       VARCHAR(6)   NOT NULL,                      -- 'member' | 'guest'
    "requested_by"        UUID,
    "requested_at"        TIMESTAMP(6) NOT NULL,
    "approved_at"         TIMESTAMP(6), "approved_by" UUID, "approve_note" VARCHAR(250),
    "carrier"             VARCHAR(50),  "tracking_number" VARCHAR(40),   -- Should (BR-RET-44)
    "rejected_at"         TIMESTAMP(6), "rejected_by" UUID, "reject_note" VARCHAR(250),
    "received_at"         TIMESTAMP(6), "received_by" UUID, "receive_note" VARCHAR(250),
    "refunded_at"         TIMESTAMP(6), "refunded_by" UUID, "refund_reference" VARCHAR(60),
    "cancelled_at"        TIMESTAMP(6),
    "goods_amount"        INTEGER      NOT NULL,                      -- dự kiến lúc gửi, ĐÈ bằng số chốt lúc nhận hàng (amount_final = true)
    "shipping_refund"     INTEGER      NOT NULL DEFAULT 0,
    "return_shipping_fee" INTEGER      NOT NULL DEFAULT 0,
    "amount"              INTEGER      NOT NULL,
    "amount_final"        BOOLEAN      NOT NULL DEFAULT false,
    "bank_name"           VARCHAR(60),                                -- tài khoản nhận hoàn (đơn COD)
    "account_last4"       CHAR(4),
    "account_name"        VARCHAR(50),
    "account_number_enc"  VARCHAR(200),                               -- AES-256-GCM base64 (mục 7); NULL khi trạng thái cuối
    CONSTRAINT "order_returns_pkey" PRIMARY KEY ("return_id")
);
-- FK: order_id -> orders CASCADE; requested_by / approved_by / rejected_by / received_by / refunded_by -> users ON DELETE SET NULL.
CREATE UNIQUE INDEX "uq_order_returns_active" ON "order_returns" ("active_order_id");   -- NULL không va nhau; khai @unique trong Prisma (xem mục 14 R6)
CREATE INDEX IF NOT EXISTS "idx_order_returns_state_requested" ON "order_returns" ("state", "requested_at" DESC, "return_id" DESC);
CREATE INDEX IF NOT EXISTS "idx_order_returns_order"           ON "order_returns" ("order_id", "requested_at" DESC);

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
    AND ("account_number_enc" IS NULL OR ("bank_name" IS NOT NULL AND "state" IN ('requested','approved','received'))));   -- lưới cuối của BR-RET-17(d)

-- Dòng trả: theo dòng đơn (order_items), unique (return, order_item).
CREATE TABLE "order_return_items" (
    "return_item_id"    UUID    NOT NULL DEFAULT gen_random_uuid(),
    "return_id"         UUID    NOT NULL,
    "order_item_id"     UUID    NOT NULL,
    "quantity"          INTEGER NOT NULL,
    "accepted_quantity" INTEGER,                 -- NULL tới lúc nhận hàng
    "disposition"       VARCHAR(8),              -- 'restock' | 'writeoff', chỉ khi accepted_quantity > 0
    "goods_amount"      INTEGER NOT NULL,        -- tiền hàng của dòng: dự kiến theo quantity, chốt theo accepted_quantity
    CONSTRAINT "order_return_items_pkey" PRIMARY KEY ("return_item_id")
);
-- FK: return_id -> order_returns CASCADE; order_item_id -> order_items CASCADE.
CREATE UNIQUE INDEX "uq_order_return_items" ON "order_return_items" ("return_id", "order_item_id");
ALTER TABLE "order_return_items"
  ADD CONSTRAINT "chk_return_items_qty"  CHECK ("quantity" BETWEEN 1 AND 99 AND ("accepted_quantity" IS NULL OR "accepted_quantity" BETWEEN 0 AND "quantity")),
  ADD CONSTRAINT "chk_return_items_disp" CHECK ("disposition" IS NULL OR ("disposition" IN ('restock','writeoff') AND "accepted_quantity" > 0)),
  ADD CONSTRAINT "chk_return_items_amt"  CHECK ("goods_amount" >= 0);

-- Ảnh minh chứng (riêng tư). storage_key là khoá ở kho riêng tư (mẫu KHÁC MEDIA_ID_RE: không bao giờ khớp /api/media).
CREATE TABLE "return_photos" (
    "photo_id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "return_id"        UUID,                      -- NULL tới khi gắn vào yêu cầu
    "order_id"         UUID,                      -- chủ ảnh là khách vãng lai (Should)
    "uploader_user_id" UUID,                      -- chủ ảnh là thành viên
    "storage_key"      VARCHAR(40)  NOT NULL,
    "storage"          VARCHAR(10)  NOT NULL,
    "content_type"     VARCHAR(20)  NOT NULL,
    "byte_size"        INTEGER      NOT NULL,
    "width"            INTEGER      NOT NULL,
    "height"           INTEGER      NOT NULL,
    "created_at"       TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    CONSTRAINT "return_photos_pkey" PRIMARY KEY ("photo_id")
);
-- FK: return_id -> order_returns CASCADE; order_id -> orders CASCADE; uploader_user_id -> users SET NULL. KHÔNG CHECK "có chủ" (SET NULL khi xoá user sẽ vi phạm).
CREATE UNIQUE INDEX "uq_return_photos_key" ON "return_photos" ("storage_key");
CREATE INDEX IF NOT EXISTS "idx_return_photos_return" ON "return_photos" ("return_id");
ALTER TABLE "return_photos"
  ADD CONSTRAINT "chk_return_photos_key"  CHECK ("storage_key" ~ '^rp-[0-9a-f]{32}\.(jpg|png|webp)$'),
  ADD CONSTRAINT "chk_return_photos_type" CHECK ("content_type" IN ('image/jpeg','image/png','image/webp') AND "byte_size" BETWEEN 1 AND 5242880 AND "width" > 0 AND "height" > 0);

-- Sự kiện đơn của yêu cầu (BR-RET-40): liên kết để dựng lịch sử + thư.
ALTER TABLE "order_events" ADD COLUMN "return_id" UUID;
-- FK order_events.return_id -> order_returns CASCADE
CREATE INDEX IF NOT EXISTS "idx_order_events_return" ON "order_events" ("return_id", "at");

-- RLS (không policy: chỉ vai trò máy chủ truy cập)
ALTER TABLE "order_returns"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_return_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "return_photos"      ENABLE ROW LEVEL SECURITY;
```

Prisma: `enum order_event_kind` thêm 6 giá trị CUỐI danh sách theo đúng thứ tự tệp 1; `model OrderReturn` (`@@map("order_returns")`, `activeOrderId String? @unique @map("active_order_id")`, 5 quan hệ `User` có tên `ReturnRequester|Approver|Rejecter|Receiver|Refunder`), `model OrderReturnItem`, `model ReturnPhoto`; `OrderEvent.returnId` + quan hệ; `Order.returns OrderReturn[]`; khai cả 4 `@@index(..., map: "<tên trên>")` (bắt buộc: `migrate diff --from-migrations --to-schema-datamodel` phải rỗng; chỉ mục không khai báo bị Prisma coi là lệch). **Chỉ mục duy nhất từng phần** (`WHERE state <> 'cancelled'`) Prisma 6 không khai báo được nên dùng cột `active_order_id` + `@unique` (cùng kỹ thuật `orders.active_tracking_number` của Slice 4); `NULL` không va nhau nên nhiều yêu cầu `cancelled` + đúng 1 yêu cầu còn sống. `ALTER TYPE` không thể rollback: ghi trong `decisions.md`.

Test (`returns-migration.test.ts`): `migrate deploy` hai lần (lần 2 không có gì), `diff` rỗng, số dòng `orders`, `order_items`, `users`, `inventory_adjustments`, `order_events` không đổi, `enum_range(NULL::order_status)` không đổi, `order_event_kind` có đủ 6 giá trị mới, ba bảng mới bật RLS, quét tệp SQL không có `DROP|TRUNCATE|DELETE FROM|RENAME|ALTER COLUMN .* TYPE|UPDATE `, CHECK hình dạng: (a) chèn yêu cầu thứ hai không-`cancelled` cho cùng đơn bị từ chối (23505), yêu cầu `cancelled` + một yêu cầu sống cho cùng đơn được; (b) `state = 'refunded'` còn `account_number_enc` bị từ chối; (c) `amount` lệch công thức bị từ chối; (d) `disposition` khi `accepted_quantity = 0` bị từ chối; (e) `storage_key` sai mẫu bị từ chối (thêm `up-<hex>.jpg` của kho công khai); các chỉ mục tồn tại (`pg_indexes`). `resetState()` (test/helpers) thêm 3 bảng vào TRUNCATE (đã được `orders ... CASCADE` bao, ghi tường minh cho rõ) và dọn thư mục ảnh riêng tư cục bộ.

Chi phí: `idx_order_events_return` ghi thêm mỗi sự kiện đơn (cột NULL gần hết, chấp nhận); nối doanh thu dùng `uq_order_return_items` (return_id, order_item_id) nên không thêm chỉ mục.

## 3. Module backend

```
backend/src/modules/returns/
  returns.routes.ts            accountReturnsRouter (/account/orders/:orderCode/return*), accountReturnPhotosRouter (byte thô),
                               guestReturnsRouter + guestReturnPhotosRouter (Should), adminReturnsRouter, adminReturnPhotosRouter
  returns.schemas.ts           Zod (parseBodyAll): createReturnSchema, estimateSchema, approve / reject / receive / refund, listQuery
  return-rules.ts              REASONS + faultOf(reason), TRANSITIONS, returnDeadline(deliveredAt), checkEligibility(order, now), allowedActions(state, role)
  return-amount.ts             computeReturnAmount(): MỘT công thức (mục 5), hàm thuần
  return.query.ts              loadReturn(db, id), loadActiveReturnOf(db, orderId), listReturns(db, q), countReturns(db, q?), loadReturnsForOrders(db, ids)
  return.mapper.ts             toReturnRequest (khách), toAdminReturn (role, orderRow), photoUrl(audience, ...)
  create-return.service.ts     createReturn(principal, orderCode, body, key)   (mục 6.1)
  process-return.service.ts    cancel / approve / reject / receive / refund    (mục 6.2..6.6)
  account-secret.ts            encryptAccountNumber, decryptAccountNumber, last4Of, hmacForHash (AES-256-GCM, node:crypto)   (mục 7)
  photo.service.ts             uploadReturnPhoto(principal, body), readReturnPhoto(viewer, id), attachPhotos(tx, ...)           (mục 8)
  return-events.ts             emitReturnEvent(tx, ...) = insertOrderEvent + return_id, từng loại + email_template
  net-spent.sql.ts             fragment SQL "chi tiêu ròng" dùng cho getMembership và customer.query (mục 10)
backend/src/lib/storage/private.ts            PrivateImageStorage + getPrivateImageStorage() / setPrivateImageStorage() (test) + RETURN_PHOTO_KEY_RE
backend/src/lib/storage/private-local.ts      LocalPrivateStorage (dir riêng, mục 8)
backend/src/lib/storage/private-supabase.ts   SupabasePrivateStorage (bucket riêng, đọc bằng endpoint "authenticated")
backend/src/lib/errors.ts                     + notReturnable, returnWindowClosed, returnExists, invalidReturnTransition (ErrorCode + STATUS)
backend/src/lib/vn-time.ts                    (đã có vnStartOfDay, addCalendarDays, vnDateISO; thêm vnDeliveryDeadline nếu cần)
backend/src/modules/checkout/delivery.ts      trích addBusinessDays(date, n, holidays) khỏi estimateDelivery (KHÔNG đổi hành vi) cho expectedRefundBy
backend/src/config/assumptions.ts             + RETURNS_ASSUMPTIONS, ReturnPermission, RETURN_PERMISSIONS
backend/src/config/env.ts                     + RETURN_ACCOUNT_KEY, SUPABASE_RETURN_BUCKET (mặc định 'return-photos'), RETURN_PHOTO_LOCAL_DIR; cảnh báo khởi động (như mediaStorageWarning)
backend/src/middleware/require-permission.ts  Permission = ... | ReturnPermission
backend/src/middleware/rate-limit.ts          + returnCreateLimit (10 / giờ, key user), returnPhotoLimit (30 / giờ, key user), guestReturnCreateLimit, guestReturnPhotoLimit
backend/src/mail/return-templates.ts          5 mẫu thư (mục 9); order-templates.ts không đổi
backend/src/modules/order/order.mapper.ts     toOrderDto: + canReturn (thuần), returnDeadline; CUSTOMER_KINDS + 6 loại; timelineTitle + 6 case (BẮT BUỘC: nhánh default hiện trả "Đã huỷ đơn")
backend/src/modules/order/order.service.ts    withReturn(): ghép `return` + chỉnh `canReturn` (không có yêu cầu sống) cho getOrderDto / listMyOrders (1 truy vấn theo mảng id) / huỷ đơn
backend/src/modules/order/order-email.service.ts   EVENT_TEMPLATES: nhánh `return-*` đọc yêu cầu qua order_events.return_id (mục 9)
backend/src/modules/order/idempotency.ts      IdempotencyScope += 'return-create'
backend/src/modules/order-admin/order-admin.mapper.ts   TITLES + 6 loại; AdminOrder.return (+ returnPending Should ở danh sách)
backend/src/modules/catalog-admin/inventory.service.ts  trích restockVariantTx(tx, {variantId, qty, at, actor, note}) từ applyDelta + tx.inventoryAdjustment.create (KHÔNG đổi hành vi adjustStock)
backend/src/modules/insights-admin/revenue.sql.ts       sửa MỘT nguồn doanh thu + refundKpis (mục 10)
backend/src/modules/insights-admin/dashboard.service.ts + 3 số `todo`;  report.service.ts + 3 KPI;  csv.ts + dòng KPI;  audit.query.ts + 4 loại
backend/src/modules/account/account.service.ts          getMembership dùng net-spent;  users-admin/customer.query.ts dùng net-spent
backend/src/app.ts
  // TRƯỚC requireJsonBody (cạnh /admin/uploads): thân byte thô
  api.use('/account/return-photos', cookieParser(), noStore, requireAuth('storefront'), accountReturnPhotosRouter);
  api.use('/orders/:orderCode/return/photos', cookieParser(), noStore, guestReturnPhotosRouter);          // Should; tự dựng Principal từ n2f_oa / n2f_sid
  // SAU body parser, TRƯỚC api.use('/account', ...): chỉ /:orderCode/return*
  api.use('/account/orders', noStore, requireAuth('storefront'), accountReturnsRouter);
  const adminReturns = [noStore, requireAuth('admin'), requireRole('staff', 'admin'), adminRateLimit];
  api.use('/admin/returns',       ...adminReturns, adminReturnsRouter);
  api.use('/admin/return-photos', ...adminReturns, adminReturnPhotosRouter);
  // orderRouter (order.routes.ts): + POST /:orderCode/return, /return/cancel, /return/estimate TRƯỚC '/:orderCode' (Should)
backend/test/helpers.ts       + fixtures R1..R8 (AC mục 5 PRD) bằng insertRevenueOrder (+ lineDiscount), insertReturn({...}) chèn thẳng theo trạng thái, makePhoto(), setPrivateImageStorage(memory)
```

`requireAuth('admin')` đọc lại vai trò và `is_active` từ DB mỗi yêu cầu (BR-RET-02). `requirePermission` đứng **trước** Zod và trước mọi truy cập DB. `adminRateLimit` đứng trước `requirePermission` như Slice 7 / 8 (một bộ đếm admin chung).

## 4. Quy ước chung

- **Giờ VN tường minh UTC** (như Slice 8 mục 4, bắt buộc): không `now()` / `CURRENT_DATE` / `AT TIME ZONE 'Asia/...'` trong SQL mới; ranh giới tính ở JS rồi qua `ts()`. Hạn trả: `deliveryDay = vnDateISO(deliveredAt)` (ngày 0); `deadlineExclusive = vnStartOfDay(addCalendarDays(deliveryDay, 31))`; còn hạn khi `now < deadlineExclusive`; `returnDeadline` trả về `deadlineExclusive - 1 giây` (= 23:59:59 ngày thứ 30) ISO UTC. Test dưới 4 múi giờ phiên như T-INS-14.
- **Số nguyên:** mọi tiền `INTEGER`; `lineNet * q` tính ở JS (`< 2^53`: 100.000.000 x 99 x 99) rồi `divRoundHalfUp` (`lib/money-math.ts`); SQL cộng `::bigint`.
- **Chuẩn hoá chuỗi:** `cleanText()` (NFC, trim, gộp khoảng trắng) cho `bank`, `accountName`, `note`, `refundReference`; `detail` giữ xuống dòng (`\n`) nhưng chuẩn hoá `\r\n`, cắt hai đầu, cấm ký tự điều khiển khác (`/[\p{Cc}&&[^\n]]/u`); `accountNumber` bỏ khoảng trắng rồi `^[0-9]{6,19}$`; `accountName` `^[\p{L} ]{2,50}$` (chữ cái Unicode + khoảng trắng) rồi `toLocaleUpperCase('vi-VN')`; `bank` 2..60. Thông điệp lỗi Zod là chuỗi cố định theo trường, **không** nhúng giá trị nhập.
- **Id:** UUID sai dạng (`returnId`, `photoId`) -> `404 not-found` không chạm DB. `orderCode` qua `normalizeOrderCode` (mã sai dạng -> 404).
- **Giờ ghi:** mọi `at`, `*_at` ghi bằng `now()` của `lib/clock`.
- **Log:** chỉ `{ returnId, orderCode, userId, action, code }`. **Không bao giờ** log thân yêu cầu, `accountNumber`, `bank`, `accountName`, `detail`, `note`, tên / SĐT / email, `refundReference`, byte ảnh, `RETURN_ACCOUNT_KEY`. Test spy `logger` + quét đầu ra console (T-RET-41).
- **Cache:** mọi phản hồi của nhóm này (kể cả lỗi) `no-store`; ảnh `private, no-store` + `X-Content-Type-Options: nosniff`.
- **Thứ tự kiểm (ghi):** `noStore` -> `requireAuth` 401 -> `originGuard` 403 -> giới hạn 429 -> (admin) `requirePermission` 403 -> `Idempotency-Key` 422 -> Zod 422 (mọi lỗi) -> tải đơn / yêu cầu 404 -> giao dịch.
- **Giao dịch:** READ COMMITTED, `{ timeout: 10_000, maxWait: 5_000 }`, thử lại `isRetryable` tối đa 3 (như `adjustStock`). Thứ tự khoá toàn hệ thống: `orders` (tạo) -> `order_returns` -> `product_variants` theo `variant_id` tăng dần -> INSERT. Không bao giờ khoá `product_variants` trước `order_returns`.
- **So-sánh-rồi-đổi:** mọi chuyển trạng thái là `UPDATE order_returns SET state = $to, ... WHERE return_id = $1 AND state = $from RETURNING` (0 dòng -> đọc lại trạng thái -> `409 invalid-transition` kèm `currentReturnState`); `SELECT ... FOR UPDATE` trước để các bước phụ (tồn kho, `payment_status`) chạy đúng một lần dưới đua x20.

## 5. Công thức tiền dùng chung (`return-amount.ts`)

MỘT hàm thuần, gọi ở: ước tính, tạo (lưu dự kiến), nhận hàng (chốt), kiểm xác nhận hoàn tiền (không tính lại: so với số đã lưu). Không viết lại ở nơi khác (T-RET-50 quét tĩnh: `line_discount` chỉ được dùng cho tiền hoàn trong `return-amount.ts` + `return.query.ts`).

```ts
computeReturnAmount({
  orderLines: [{ orderItemId, unitPrice, quantity, lineDiscount }],   // MỌI dòng đơn
  qtyByItem: Map<orderItemId, number>,                                 // số lượng tính tiền (khách chọn / nhân viên cho đạt); 0 hoặc vắng = không tính
  fault: 'shop' | 'customer', shippingFee, shippingDiscount,
}) => { lines: Map<orderItemId, goodsAmount>, goodsAmount, shippingRefund, returnShippingFee, amount }
```

- `lineNet = unitPrice * quantity - lineDiscount`; dòng với `q`: `q === quantity ? lineNet : divRoundHalfUp(lineNet * q, quantity)`, `q = 0 -> 0`.
- `full = mọi dòng đơn có q === quantity`; `shippingRefund = fault === 'shop' && full ? shippingFee - shippingDiscount : 0`; `returnShippingFee = fault === 'customer' ? RETURNS_ASSUMPTIONS.returnShippingFee (30000) : 0`; `amount = goods + shippingRefund - fee`.
- Tạo: `amount <= 0` (chỉ xảy ra lỗi khách, AC-RET-21f) -> `422 field: lines` "Giá trị hàng trả không đủ bù phí gửi trả 30.000 ₫". Nhận hàng: Σ đạt = 0 hoặc `amount <= 0` -> đóng thẳng `rejected` (mục 6.5).
- Số chốt lưu vào `order_returns.{goods_amount, shipping_refund, return_shipping_fee, amount}` + `order_return_items.goods_amount`, `amount_final = true`; **không đọc lại** `store_settings` / `line_discount` sau đó (AC-RET-30 ý cuối).
- Bảng kiểm (T-RET-06) = AC-RET-21 (a..g) + AC-RET-30 (a..c) + ca biên `100.000.000 x 99`, `q = 1/3`, `lineDiscount = unitPrice * quantity` (lineNet 0).

## 6. Luồng nghiệp vụ

### 6.1 Tạo yêu cầu (`createReturn`)

1. `Principal`: `member { userId }` (từ `req.auth`) hoặc `guest { orderId }` (từ `grantedOrderId`, Should). Tải đơn theo `code` (member: `user_id` khớp, nếu không `404`).
2. Zod `parseBodyAll` (mục 6.1b). Giao dịch:
   - `acquireIdempotency(tx, 'return-create', key, hash, at)`: `hash = requestHash({ method, path, body: {…body, accountNumber: hmacForHash(accountNumber)} }, userId)` (xem mục 7.3: không băm số tài khoản trần). Phát lại -> trả `snapshot` (`ReturnRequest`) + `Idempotency-Replayed`.
   - `SELECT ... FROM orders WHERE order_id = $1 FOR UPDATE` (tuần tự hoá các yêu cầu cùng đơn).
   - `checkEligibility`: `status <> 'completed'` hoặc thiếu `delivered_at` hoặc `payment_status <> 'paid'` -> `not-returnable`; `now >= deadlineExclusive` -> `return-window-closed`. (Kiểm TRƯỚC `return-exists`: đơn `refunded` / `partially_refunded` -> `not-returnable`.)
   - Có yêu cầu `state <> 'cancelled'` cho đơn -> `return-exists`. Lưới cuối: `INSERT` vi phạm `uq_order_returns_active` (23505) -> `return-exists` (cho cả 20 yêu cầu song song khoá khác nhau).
   - Dòng: ánh xạ `variantId -> order_item` (`uq_order_items_order_variant`); trùng / lạ / `quantity` ngoài `1..quantity mua` -> `422 lines`. Ảnh: `SELECT ... FROM return_photos WHERE photo_id = ANY($1) AND return_id IS NULL AND created_at >= now - 24h AND (uploader_user_id = $user | order_id = $order) FOR UPDATE`; đủ số ảnh, không lạ -> nếu không `422 photos`.
   - Tài khoản: đơn `cod` -> bắt buộc 3 trường (đã Zod); đơn `bank_transfer` -> bỏ qua, không lưu.
   - `computeReturnAmount` -> kiểm `amount > 0` -> INSERT `order_returns` (`state='requested'`, `active_order_id = order_id`, `amount_final=false`, `account_number_enc = encrypt(số)`, `account_last4`) + `order_return_items` + `UPDATE return_photos SET return_id` + `emitReturnEvent(requested)` + `completeIdempotency(snapshot)`.
   - Commit rồi `scheduleEventEmail(eventId)` (thư "Đã nhận yêu cầu").
3. `201` (hoặc `200` phát lại). Snapshot lưu `ReturnRequest` đã che (không số tài khoản).

**6.1b Zod (`parseBodyAll`, `field` phẳng):** `lines` (mảng 1..32; mỗi phần tử `variantId` UUID, `quantity` nguyên 1..99), `reason` (enum), `detail`, `conditionAck`, `photos` (<= 5 UUID, không trùng), `bank`, `accountNumber`, `accountName`. Quy tắc phụ thuộc lý do / phương thức cần đơn nên kiểm ở bước 2: lỗi shop -> `detail` 10..500 + `photos >= 1`; lỗi khách -> `conditionAck === true`, `detail` <= 500; COD -> 3 trường tài khoản. **Mọi lỗi trả một lần** (`validationMany`): để làm được, đọc đơn (404 / phương thức thanh toán) TRƯỚC khi chạy bộ kiểm phụ thuộc, nhưng SAU `Idempotency-Key` và Zod hình dạng; các lỗi 409 (`not-returnable`...) vẫn đứng trước lỗi 422 theo dữ liệu.

### 6.2 Khách huỷ (`cancelByCustomer`)

Giao dịch: khoá yêu cầu sống của đơn (`active_order_id = order_id`), `UPDATE ... SET state='cancelled', cancelled_at, active_order_id = NULL, account_number_enc = NULL WHERE state = 'requested'` (CAS). 0 dòng -> `invalid-transition` (`currentReturnState`); không có yêu cầu sống nào -> `404`. Ghi `emitReturnEvent(cancelled)`; không email; ảnh giữ nguyên. Sau đó đơn tạo lại được (nếu còn hạn): `active_order_id` đã NULL.

### 6.3 Duyệt (`approve`, `returns.process`)

CAS `requested -> approved`, `approved_at/by`, `approve_note` (<= 250), Should `carrier` / `tracking_number`. Sự kiện `return_approved` (`detail` = `approve_note`, hiện cho khách), email (b). Không đổi tồn / tiền / `payment_status`.

### 6.4 Từ chối / đóng (`reject`, `returns.process`)

CAS `requested | approved -> rejected` (`WHERE state IN (...)`), `reject_note` 5..250 bắt buộc, `rejected_at/by`, `active_order_id` giữ nguyên (đã `rejected` thì KHÔNG tạo lại: BR-RET-09), xoá `account_number_enc`. Sự kiện `return_rejected` (`detail` = note), email (c).

### 6.5 Nhận hàng & kiểm (`receive`, `returns.process`)

Giao dịch: `SELECT ... FROM order_returns WHERE return_id = $1 FOR UPDATE`; `state <> 'approved'` -> `invalid-transition`. Kiểm `lines` khớp tập `order_return_items` (thiếu / thừa / lạ -> `422 lines`), `acceptedQuantity` 0..`quantity`, `disposition` bắt buộc khi `> 0`; có dòng đạt < yêu cầu -> `note` 5..250 (`422 note`). `computeReturnAmount` theo số ĐẠT.

- **Đóng thẳng** (Σ đạt = 0 hoặc `amount <= 0`): CAS `approved -> rejected`, `reject_note = note`, `received_at/by` ghi nhận đã kiểm, `accepted_quantity` lưu (0 hoặc số đạt), **không** `inventory`, **không** `payment_status`, xoá số tài khoản; sự kiện `return_rejected`; email (c). Số tiền cũ giữ (dự kiến).
- **Bình thường:** ghi `accepted_quantity`, `disposition`, `goods_amount` từng dòng; mỗi dòng `restock` với `q > 0` (duyệt theo `variant_id` tăng dần): `restockVariantTx` = `UPDATE product_variants SET inventory_qty = inventory_qty + q WHERE ... AND inventory_qty + q <= maxQty` + đúng 1 dòng `inventory_adjustments` (`reason='return'`, `delta=+q`, `note='Trả hàng #<mã đơn>'`, người + vai trò lúc đó); `writeoff` không đụng tồn; CAS `approved -> received` (`amount_final=true`, số chốt, `receive_note`); sự kiện `return_received` (Should: email "đã nhận hàng trả về"). Nếu `inventory_qty + q > maxQty` (100.000) -> `422 lines` (hiếm; ghi ở R10).

### 6.6 Xác nhận hoàn tiền (`refund`, `returns.refund`, chỉ admin)

Giao dịch: khoá yêu cầu; `state <> 'received'` -> `invalid-transition`; `body.amount !== row.amount` -> `422 amount` (thân đúng kiểu nhưng sai giá trị: kiểm SAU khi biết trạng thái); CAS `received -> refunded` (`refunded_at/by`, `refund_reference`, `account_number_enc = NULL`); `UPDATE orders SET payment_status = CASE WHEN (SELECT COALESCE(SUM(accepted_quantity),0) FROM order_return_items WHERE return_id = $r) = (SELECT SUM(quantity) FROM order_items WHERE order_id = $o) THEN 'refunded' ELSE 'partially_refunded' END WHERE order_id = $o AND status = 'completed' AND payment_status = 'paid'` (không có dòng bị ảnh hưởng -> `unavailable` + rollback: bất biến bị phá); sự kiện `return_refunded` mang `payment_status` mới; email (d). Đây là chỗ DUY NHẤT ghi `refunded` / `partially_refunded` (T-RET-50 quét tĩnh: hai giá trị này chỉ được ghi ở `process-return.service.ts`; các chỗ ghi `paid` / `pending` của Slice 3 / 4 không đổi).

### 6.7 Đọc

- Khách: `Order.return` (mục 3 `withReturn`): yêu cầu sống mới nhất, không có thì `cancelled` mới nhất. `canReturn = eligible && không có yêu cầu sống`. `refundTo` từ `bank_name` / `account_last4` / `account_name` (COD) hoặc `{type:'original'}` (chuyển khoản). `expectedRefundBy` = `addBusinessDays(vnDate(received_at), 3, holidays)` khi `received` (từ `received_at`). `instructions` (khi `approved`) = chữ cố định + địa chỉ cửa hàng từ `getPublicSettings` + `approve_note`.
- Admin: `toAdminReturn(role, row)`: `allowedActions` theo `TRANSITIONS` + vai trò; `refundTo.accountNumber` CHỈ khi `role === 'admin' && state === 'received' && order COD && account_number_enc != null` (giải mã tại chỗ, trong hàm mapper, không trả từ query); `history` từ `order_events WHERE return_id = $1 ORDER BY at, event_id` (tên + vai trò chụp, `detail`); `overdue` (Should) = `state = 'requested' && now - requested_at > 24h` tính khi đọc.
- Danh sách: `listReturns` SQL: `FROM order_returns r JOIN orders o`, `LEFT JOIN LATERAL (SELECT actor_name, actor_role, at FROM order_events WHERE return_id = r.return_id AND actor = 'shop' ORDER BY at DESC, event_id DESC LIMIT 1) h` cho "người xử lý gần nhất"; `q`: mã đơn (chuẩn hoá), tên (`foldCol` + `foldVi`, như `customer.query`), SĐT (>= 4 chữ số, bỏ ký tự phân cách); `state` -> `closed` = `IN ('rejected','cancelled')`; `ORDER BY r.requested_at DESC, r.return_id DESC` (hoặc `r.amount DESC, ...`); `counts` một truy vấn `COUNT(*) FILTER (...)` theo cùng `q`, không theo `state`; `itemCount` = `SUM(quantity)` từ `order_return_items`.

## 7. Số tài khoản nhận hoàn

### 7.1 Lưu

- Cột `account_number_enc` = `base64(iv(12) || tag(16) || ciphertext)` của `AES-256-GCM` (`node:crypto`, không thêm thư viện), khoá 32 byte từ `RETURN_ACCOUNT_KEY` (base64), AAD = `return_id` (đổi chỗ bản mã không giải được). `account_last4` (CHAR 4), `bank_name`, `account_name` (in hoa) lưu rõ.
- Production thiếu `RETURN_ACCOUNT_KEY` -> tạo yêu cầu COD trả `unavailable` (không ghi tài khoản sai chỗ), cảnh báo khi khởi động (như `mediaStorageWarning`). Dev / test: khoá cố định trong `test/setup.ts` (không dùng ở production). Xoay khoá: không hỗ trợ ở bản này (số chỉ sống trong khoảng `requested -> received`, ngắn); nếu cần, thêm `key_id` ở migration sau.
- Prisma truy vấn mặc định KHÔNG `select` cột bản mã: `return.query.ts` liệt kê cột; chỉ `loadAccountCipher(db, returnId)` đọc, chỉ gọi từ `toAdminReturn` khi đủ điều kiện (admin + `received`).

### 7.2 Che / lộ

- Khách và staff: chỉ `bank`, `last4`, `accountName` ở mọi trạng thái. Admin: thêm `accountNumber` CHỈ khi `received`. Email: `bank` + `last4` hoặc "tài khoản đã thanh toán". Sự kiện đơn / nhật ký / CSV / tên tệp / log / snapshot idempotency: không có số (snapshot lưu `ReturnRequest` đã che).
- Sau trạng thái cuối: `account_number_enc = NULL` (cùng giao dịch ở `refund`, `reject`, `receive`-đóng-thẳng, `cancel`); CHECK `chk_returns_account` là lưới cuối ở DB. Test SQL sau từng chuyển cuối: `account_number_enc IS NULL`, `bank_name` / `account_last4` / `account_name` còn.
- Chính sách giữ: không có tác vụ xoá nền (BR-RET-17 chỉ xoá khi cuối); yêu cầu kẹt ở `requested` / `approved` giữ bản mã cho tới khi xử lý (rủi ro R4).

### 7.3 Chống lộ qua băm idempotency

`idempotency_keys.request_hash` là SHA-256 của thân; số tài khoản 6..19 chữ số có thể dò ngược từ băm nếu lộ DB. Vì vậy trong `requestHash` thay `accountNumber` bằng `HMAC-SHA256(RETURN_ACCOUNT_KEY, accountNumber)` (hàm `hmacForHash`) trước khi băm; ngữ nghĩa "cùng khoá khác nội dung -> `409 idempotency-conflict`" giữ nguyên (số khác -> HMAC khác).

## 8. Ảnh riêng tư

Bucket `product-images` (và thư mục `.media/`) là CÔNG KHAI (BR-INV-27) nên KHÔNG dùng cho ảnh trả hàng.

- **Giao diện** `PrivateImageStorage { name; put(key, data, contentType); read(key): Promise<{data, contentType} | null> }` (khác `ImageStorage`: không có `publicUrl`). Khoá `rp-<32 hex>.<jpg|png|webp>` (`RETURN_PHOTO_KEY_RE`), KHÔNG khớp `MEDIA_ID_RE` (`up-...`) nên `GET /api/media/*` không bao giờ phục vụ được (T-RET-07 kiểm `404`).
- **Driver theo `MEDIA_STORAGE`** (cùng công tắc với ảnh sản phẩm): `local` -> `LocalPrivateStorage` thư mục `RETURN_PHOTO_LOCAL_DIR` (mặc định `backend/.media-private/`, thêm vào `.gitignore`; dev / test), production + `local` -> `unavailable`; `supabase` -> `SupabasePrivateStorage` bucket `SUPABASE_RETURN_BUCKET` (mặc định `return-photos`), ghi `POST /storage/v1/object/{bucket}/{key}`, đọc `GET /storage/v1/object/authenticated/{bucket}/{key}` (đều bằng service role key, header `Authorization`, không log). Tái dùng `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
- **Chốt chặn cấu hình (fail closed):** lần dùng đầu mỗi tiến trình, driver `supabase` gọi `GET /storage/v1/bucket/{bucket}`: nếu `public === true` HOẶC `bucket === SUPABASE_STORAGE_BUCKET` (trùng bucket công khai) -> log cảnh báo (không kèm khoá) và mọi thao tác ảnh trả `unavailable`. Tránh trường hợp Thắng tạo nhầm bucket công khai làm lộ ảnh.
- **Phục vụ byte:** `GET .../return-photos/{id}` kiểm quyền Ở MỖI LẦN rồi máy chủ `read()` và trả byte (`Content-Type` theo `return_photos.content_type`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`). Không `302`, không URL ký: URL ký mở được khi không cookie trong thời hạn, trái AC-RET-15 ("không URL ảnh nào trong phản hồi mở được không cookie"); đổi lại băng thông ảnh đi qua máy chủ (<= 5 MB x 5 ảnh / yêu cầu, chấp nhận). Quyền: member = `uploader_user_id = user` (ảnh chưa gắn) hoặc `return_id` thuộc đơn của user; guest = `order_id` khớp grant; admin = ảnh đã gắn yêu cầu. Sai -> `404` (không phân biệt).
- **Tải:** `express.raw({ type: () => true, limit: maxBytes + 1 })` (vượt -> `invalid-image size` qua `error.ts` như ảnh sản phẩm); thứ tự kiểm size -> format (`sniffImage`) -> dimensions (`short >= 200`, `long <= 8000`); `stripImageMetadata` rồi `sniffImage` lại; khoá `rp-` + `randomBytes(16)`; `put` rồi INSERT `return_photos` (INSERT lỗi sau `put` -> tệp mồ côi, chấp nhận như BR-INV-28). Tên tệp gốc KHÔNG được lưu. Hằng số ở `RETURNS_ASSUMPTIONS.photo = { maxBytes: 5 MiB, minShort: 200, maxLong: 8000, max: 5, attachWindowMs: 24h }`.
- **Không xoá theo lịch** (Won't); ảnh của yêu cầu giữ vô thời hạn (R5).

## 9. Email (BR-RET-41)

Cơ chế: sự kiện đơn mang `email_template` (varchar(30)) + `return_id`; `scheduleEventEmail(eventId)` / `retryPendingEventEmails` hiện có (CAS `email_attempts`, tối đa 3 lần, `notifySupportForEvent` sau lần 3) tự áp dụng. Sửa `attemptEventOnce`: nếu `order_events.return_id IS NOT NULL` thì nạp `ReturnMailData` (`loadReturnMailData`: dòng + tên, lý do (nhãn VN), số tiền, ghi chú hiển thị, `bank` + `last4` hoặc "tài khoản đã thanh toán", `refundReference`, **không** SELECT `account_number_enc`) và gọi `RETURN_TEMPLATES[name](order, data, contact)`; mẫu lạ / yêu cầu mất -> đánh dấu đã gửi như hiện nay. Hotline lấy từ `mailContact()` (cài đặt).

| `email_template` | Sự kiện | Tiêu đề |
| --- | --- | --- |
| `return-requested` | `return_requested` | nine2fine – Đã nhận yêu cầu trả hàng đơn #{mã} |
| `return-approved` | `return_approved` | nine2fine – Yêu cầu trả hàng đơn #{mã} đã được duyệt |
| `return-rejected` | `return_rejected` | nine2fine – Yêu cầu trả hàng đơn #{mã} không được chấp nhận |
| `return-refunded` | `return_refunded` | nine2fine – Đã hoàn tiền đơn #{mã} |
| `return-received` (Should) | `return_received` | nine2fine – Đã nhận hàng trả đơn #{mã} |

Đến địa chỉ của ĐƠN (`orders.email`). Khách tự huỷ: không thư. Test (SMTP giả bắt thư): đủ 4 thư với tiêu đề trên; không thư nào chứa số tài khoản đầy đủ (so với số seed); SMTP lỗi ở bước duyệt -> trạng thái vẫn `approved`, `email_attempts` tăng, thử lại không trùng.

## 10. Chỗ đổi doanh thu, hạng, Tổng quan, nhật ký (chính xác)

### 10.1 `insights-admin/revenue.sql.ts` (BR-RET-51, 52; D8)

Hiện (`revenueCte`): `ro` lọc `o.status = 'completed' AND o.payment_status = 'paid'`; `li` tính `qty = oi.quantity`, `amount = oi.unit_price::bigint * oi.quantity - oi.line_discount`. Đổi:

```sql
ro AS (... WHERE o.status = 'completed' AND o.payment_status IN ('paid', 'partially_refunded') AND (...delivered_at...)),
li AS (
  SELECT ..., (oi.quantity - COALESCE(ri.accepted_quantity, 0))::int AS qty,
         (oi.unit_price::bigint * oi.quantity - oi.line_discount - COALESCE(ri.goods_amount, 0)) AS amount,
         oi.line_discount::bigint AS discount
  FROM ro JOIN order_items oi ON oi.order_id = ro.order_id
  LEFT JOIN order_returns rr ON rr.order_id = ro.order_id AND rr.state = 'refunded'          -- tối đa 1 dòng / đơn (uq_order_returns_active)
  LEFT JOIN order_return_items ri ON ri.return_id = rr.return_id AND ri.order_item_id = oi.order_item_id
)
```

- `refunded` (hoàn đủ) vẫn bị loại bởi `IN ('paid','partially_refunded')`; ngày ghi nhận vẫn `delivered_at` của đơn gốc (không dịch sang ngày hoàn). `discount` (`discountTotal`) và `shippingCollected` KHÔNG đổi (PRD không nêu; mục 15 #6).
- Các khối `byCategory`, `topProducts`, `topVariants` thêm `HAVING SUM(l.qty) > 0 OR SUM(l.amount) > 0` (dòng `units = 0` và `revenue = 0` không hiện). Điều kiện này nằm ngay trong `revenue.sql.ts`; không khối nào tự lọc.
- `completedOrders` (`COUNT(DISTINCT order_id)`) vẫn đếm đơn `partially_refunded` (BR-RET-51).
- **`refundKpis(db, cur, prev)` MỚI** (cùng file, cùng `bound()`): `FROM orders o LEFT JOIN order_returns rr ON ... state = 'refunded' LEFT JOIN order_return_items ri ...  WHERE o.status = 'completed' AND o.delivered_at trong hợp hai kỳ` -> theo kỳ: `delivered = COUNT(DISTINCT o.order_id)`, `refundedAmount = SUM(ri.goods_amount)`, `refundedUnits = SUM(ri.accepted_quantity)`, `returnedOrders = COUNT(DISTINCT rr.order_id)`. `previous` của 3 KPI = `null` khi `delivered = 0` ở kỳ trước (mục 15 #7). Chuỗi `payment_status` chỉ xuất hiện ở file này (T-INS-30 sửa regex, mục 10.5).
- `report.service.ts`: `kpis.refundedAmount | refundedUnits | returnedOrders` (+ `returnRate = ratio4(refundedUnits, units + refundedUnits)` Should); `dashboard.service.ts`: doanh thu / `topProducts` / biểu đồ đổi theo MỘT nguồn nên KHÔNG sửa logic (chỉ thêm `todo`); `csv.ts`: thêm 3-4 dòng vào khối KPI.
- Bất biến AC-INS-13 giữ: Σ `byDay` = Σ `byCategory` = Σ `byPayment` = Σ `topProducts` (khi <= 10) = `kpis.revenue` vì mọi khối cùng `li`.

### 10.2 Hạng thành viên (BR-RET-53; D9)

Hai nơi dùng cùng công thức `COALESCE(delivered_at, created_at)` trong năm VN: `account.service.ts::getMembership` (hiện `SUM("total")`) và `users-admin/customer.query.ts::baseSql` (cột `year_spent` và `total_spent` trong LATERAL). Trích fragment `net-spent.sql.ts`: `SUM(o.total - COALESCE(rr.goods_amount,0) - COALESCE(rr.shipping_refund,0))` với `LEFT JOIN order_returns rr ON rr.order_id = o.order_id AND rr.state = 'refunded'`, rồi cả hai gọi fragment (một nguồn). KHÔNG trừ `return_shipping_fee`. `total_spent` (tổng mọi thời gian ở `customer.query`) cũng đổi sang ròng cho nhất quán (mục 15 #8). `tierCase()` giữ nguyên.

### 10.3 Việc cần làm (BR-RET-50)

`getDashboard`: `todo` thêm `returnRequested`, `returnApproved`, `returnReceived` từ `countReturns(db)` (cùng hàm với `counts` của danh sách; mọi vai trò). `returnRequests` / `returnRate` / `deliveryFailed` vẫn KHÔNG có. T-DSH-07 (khoá staff) không đổi; `insights-dashboard.test.ts` dòng ~141 (`Object.keys(a.body.todo)`) PHẢI thêm 3 khoá mới.

### 10.4 Nhật ký hợp nhất (BR-RET-40; `audit.query.ts`)

`ORDER_KINDS` thêm `return_approved`, `return_rejected`, `return_received`, `return_refunded` (không thêm `return_requested`, `return_cancelled`: nhánh đã lọc `actor = 'shop'` nên sự kiện của khách không hiện); `ACTION_LABELS`: `order.return-approved` "Duyệt yêu cầu trả hàng", `order.return-rejected` "Từ chối / đóng yêu cầu trả hàng", `order.return-received` "Nhận hàng trả về", `order.return-refunded` "Xác nhận hoàn tiền trả hàng". `reason` của nhánh lấy `reason_code`: sự kiện trả hàng của nhân viên để `reason_code = NULL` (ghi chú nằm ở `detail`, nhật ký không bao giờ chọn `detail`).

### 10.5 Test hiện có bị ảnh hưởng (chạy lại; sửa đúng chỗ ghi)

| Test / file | Ảnh hưởng | Việc |
| --- | --- | --- |
| `test/insights-reports.test.ts` T-INS-30 (dòng ~388, regex `payment_status\s*=\s*'paid'`) | chuỗi đổi thành `payment_status IN ('paid', ...)` nên regex không khớp | **Sửa:** regex `payment_status\s*(=\|IN)` và vẫn khẳng định chỉ `revenue.sql.ts` xuất hiện |
| `test/insights-dashboard.test.ts` ~141 (khoá `todo` của admin) | thêm 3 khoá | **Sửa:** thêm `returnApproved`, `returnReceived`, `returnRequested` |
| `test/insights-reports.test.ts` T-RPT-02/03/04/07, T-INS-14, T-INS-31; `insights-dashboard.test.ts` T-DSH-02, 09 | số liệu không đổi khi không có yêu cầu `refunded` (O9 `refunded` vẫn loại) | Chạy lại, không sửa; thêm ca mới ở `returns-metrics.test.ts` |
| `test/helpers.ts` `InsertRevenueOrder.paymentStatus` | đã có `partially_refunded`; cần dòng trả để ngoài `payment_status` | Thêm `insertReturn()`; `resetState` thêm bảng mới |
| `test/account.test.ts` 288-298 (`membership`), `test/users-customers.test.ts` 192, 210-232 (`totalSpent`, `spentThisYear`, hạng) | giá trị không đổi (không có hoàn); nhưng đổi SQL | Chạy lại; ca có hoàn ở `returns-metrics.test.ts` (AC-RET-53) |
| `test/insights-audit.test.ts` T-AUD-01..06 | số dòng / loại không đổi | Chạy lại; thêm ca `targetType=order` có 3 dòng trả hàng (AC-RET-40) |
| Test Slice 3 / 4 (`orders*.test.ts`, `admin-orders*.test.ts`, timeline) | `toOrderDto` thêm `canReturn`; `timelineTitle` thêm `case` | Chạy lại; không đổi kỳ vọng (chỉ `toMatchObject`) |
| Test Slice 6 (`admin-inventory.test.ts`) | trích `restockVariantTx` khỏi `applyDelta` | Chạy lại sau lát 9.1 / 9.3 |
| `test/migration.test.ts`, `admin-catalog-migration.test.ts` | thêm migration | Chạy lại (`migrate deploy`, `diff` rỗng) |

## 11. Truy vấn và độ phức tạp (ghi để không làm lại)

- Doanh thu: thêm hai `LEFT JOIN` theo `order_id` (`idx_order_returns_order`) và `order_item_id` (`uq_order_return_items`); bảng nhỏ ở quy mô đồ án, chấp nhận. `refundKpis` quét đơn `completed` trong kỳ (`idx_orders_status_delivered`).
- Danh sách: `idx_order_returns_state_requested` cho tab + sắp `requested_at`; `q` tên / SĐT quét `orders` đã nối (bảng nhỏ). `counts` một truy vấn.
- Lịch sử / "người xử lý gần nhất": `idx_order_events_return`.
- Đo ở lát 9.8 bằng `EXPLAIN (ANALYZE)` nếu chậm; chỉ mục khác chỉ thêm bằng migration mới.

## 12. Quyền, giới hạn, FE phải đổi

`RETURN_PERMISSIONS` (cùng tên với `frontend/src/app/admin/core/permissions.ts`; một nguồn nghĩ cho hai phía):

| Quyền | staff | admin | Dùng ở |
| --- | --- | --- | --- |
| `returns.process` | có | có | `GET /admin/returns*`, `/admin/return-photos/*`, `approve`, `reject`, `receive` |
| `returns.refund` | - | có | `POST .../refund`; bật `refundTo.accountNumber` (khi `received`); `allowedActions` có `refund` |

`requirePermission` tra thêm bảng này (kiểu `Permission` mở rộng). Không phiên / hết hạn / thu hồi / chỉ `n2f_sid` / `is_active = false` -> `401` + `no-store`; thiếu quyền -> `403`, trước khi đọc thân và truy cập DB, không dòng sự kiện.

### FE phải đổi (frontend-dev; BE chỉ đọc)

1. **Cờ `returnsMode`** (`'mock' | 'http'`) trong `ApiConfig`, độc lập các cờ cũ; e2e `mock` qua `localStorage['n2f.e2e.returnsMode']`; `http` hiện nút "Yêu cầu trả hàng", route `/account/orders/:orderId/return`, menu "Trả hàng" (staff + admin), bỏ K5 (`accountMode` không còn ẩn trả hàng).
2. **Khách:** `canReturn` / `returnDeadline` / `return` từ `Order` (bỏ `Date.now()`, `order.returnDays`, `estimateRefund` cục bộ hoặc dùng `POST .../return/estimate`); form gửi `lines` `[{variantId, quantity}]`, `reason`, `detail`, `conditionAck`, `photos` (id), `bank`, `accountNumber`, `accountName` PHẲNG kèm `Idempotency-Key` (một khoá cho mỗi lần bấm Gửi, dùng lại khi Thử lại); tải ảnh ngay bằng byte thô (`POST /account/return-photos`, tiến độ, lỗi theo ảnh, xoá); `<img src>` dùng `ReturnPhoto.url` (cần cookie, cùng origin qua proxy `/api`); 422 `fieldErrors` gắn từng ô; mã `not-returnable`, `return-window-closed`, `return-exists`, `invalid-transition` có câu riêng; nhãn đơn suy từ `return` (BR-RET-23), bỏ `return-requested` / `returned` khỏi trạng thái đơn HTTP; sửa chữ `help-page.ts` + chính sách (BR-RET-54).
3. **Admin:** `ReturnSummary` -> `AdminReturnSummary` (`state` 6 giá trị + tab `closed`, `counts`); bỏ `ReturnCompletionInput.refundAmount` và cờ `restock` chung: nhận hàng gửi `lines[{variantId, acceptedQuantity, disposition}]` + `note`, hoàn tiền gửi `{amount, refundReference}`; ô số đầy đủ chỉ khi `refundTo.accountNumber` có; nút theo `allowedActions`; 409 `invalid-transition` -> tải lại + "đã được xử lý bởi người khác"; ma trận quyền thêm `returns.process`, `returns.refund`; Tổng quan thêm 3 ô; Báo cáo thêm KPI hoàn + chú thích "Doanh thu đã trừ hàng trả".
4. Giữ `mock` mặc định ở e2e; thêm spec `contract-mock` cho `fieldErrors` ở tạo yêu cầu, `409` từng mã, staff không có `accountNumber`.

## 13. Thứ tự làm và test (T-RET ↔ AC theo lát)

Mỗi lát: `tsc --noEmit` và test của lát pass (từng file chạy 2 lần); chạy lại test Slice 3 / 4 / 6 / 7 / 8 theo mục 10.5 sau 9.1 và 9.3. `assertNoSecrets(res)`: quét thân phản hồi tìm `password_hash`, `ip_address`, `user_agent`, `internal_note`, `account_number_enc`, số tài khoản seed (`1234567890`); spy `logger`. Dữ liệu chung: fixture `R1..R8` (PRD mục 5) dựng bằng `insertRevenueOrder` + `lineDiscount`; đồng hồ giả `useClock('2026-11-12T08:00:00Z')` (D = 2026-11-12 VN).

**9.1 Nền** (hai migration, `RETURNS_ASSUMPTIONS`, `RETURN_PERMISSIONS`, `requirePermission` mở rộng, giới hạn, mã lỗi, `return-rules`, `return-amount`, `account-secret`, `PrivateImageStorage` + 2 driver, `env`, `resetState`, `openapi.yaml` locked):

| Test | AC | Kiểm |
| --- | --- | --- |
| T-RET-01 | AC-RET-05 | Mục 2 (migrate x2, RLS, CHECK, unique, `order_status` không đổi) |
| T-RET-02 | AC-RET-02 (khung), AC-RET-03 | Bảng quyền: staff 403 ở `refund` (trước Zod / DB), A hạ xuống staff bằng SQL -> 403 ngay; khoá `is_active` -> 401; giới hạn: 11 yêu cầu tạo / giờ -> thứ 11 `429` + `Retry-After`, 31 ảnh / giờ, 61 ghi admin / 60 giây (đồng hồ giả) |
| T-RET-03 | AC-RET-06 | Gây từng lỗi: `code` + HTTP đúng, không stack / SQL; thông điệp không chứa giá trị nhập |
| T-RET-04 | AC-RET-08 | Bảng `TRANSITIONS` toàn bộ (6 x 6): ngoài bảng và lặp lại -> `invalid-transition`, trong bảng -> ok (hàm thuần) |
| T-RET-05 | AC-RET-21, 30 | `computeReturnAmount`: a..g + c.a..c + biên (mục 5) |
| T-RET-06 | AC-RET-10 (thuần) | `returnDeadline` / `checkEligibility`: R2 23:59:59 ok, 00:00:00 ngày sau đóng; dưới 4 múi giờ phiên |
| T-RET-07 | AC-RET-15 (hạ tầng) | Driver cục bộ `put` / `read`, khoá sai mẫu bị từ chối, `/api/media/rp-...` 404; driver Supabase (fetch giả): đọc qua endpoint `authenticated`, KHÔNG gọi `public`; bucket `public = true` hoặc trùng `product-images` -> `unavailable`; khoá dịch vụ không vào log |
| T-RET-08 | AC-RET-17 (hạ tầng) | `account-secret`: mã hoá / giải mã qua lại, AAD khác -> lỗi, hai lần mã hoá khác bản mã (IV), `hmacForHash` ổn định + khác khi số khác; thiếu khoá ở production -> `unavailable` |

**9.2 Khách (member):**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-RET-10 | AC-RET-01 | Không cookie / `n2f_sid` hết hạn / chỉ `n2f_asid`: tạo, huỷ, ảnh -> 401 `no-store`, DB không đổi; N gọi R1 -> 404 như đơn không có |
| T-RET-11 | AC-RET-09 | 20 yêu cầu song song (khoá khác nhau) cho R1: đúng 1 thành công, 19 `return-exists`, SQL 1 dòng; R2 có yêu cầu `cancelled` tạo lại 201; R5 `rejected` -> `return-exists` |
| T-RET-12 | AC-RET-10 | R2 lúc D 23:59:59 201, 00:00:00 -> `return-window-closed`; R3 closed; R4 / `refunded` / `partially_refunded` -> `not-returnable`; `canReturn` / `returnDeadline` đúng, đổi giờ máy khách không đổi nút |
| T-RET-13 | AC-RET-11 | `lines`: hợp lệ (L1x2+L2x1, L1x1); L1x3, x0, x-1, trùng, dòng lạ, rỗng -> 422 `lines`, không tạo |
| T-RET-14 | AC-RET-12 | 6 lý do ok; `other`, `not-as-described`, thiếu -> 422 `reason` |
| T-RET-15 | AC-RET-13 | `detail` 9/10/500/501, toàn khoảng trắng, ký tự điều khiển; `conditionAck`; `fieldErrors` đủ mọi lỗi một lần |
| T-RET-16 | AC-RET-14 | Ảnh 3 MB ok, 6 MB `size`, `.exe` đổi đuôi `format`, PNG 150x150 `dimensions`, EXIF GPS bị gỡ (đọc lại byte từ kho riêng); `defective` 0 / 1 / 5 / 6 ảnh; ảnh của N / đã gắn / 25 giờ -> 422 `photos` |
| T-RET-17 | AC-RET-15 | Ảnh của M: không đăng nhập 401, N 404, M / S / A 200 đúng byte, id đoán 404; mọi `url` trong phản hồi cần cookie (gọi không cookie -> 401 / 404); `Cache-Control: private, no-store` |
| T-RET-18 | AC-RET-16, S9-Q13 | `bank` thiếu; số 5 / 6 / 19 / 20 chữ số, `1234 5678 90` (lưu `1234567890`), `12ab56`; tên 1 / 2 / 51, `nguyen van a` -> `NGUYEN VAN A`; R8 (chuyển khoản) không tài khoản 201, có tài khoản -> bỏ qua (SQL: `bank_name IS NULL`); nhiều lỗi một lần |
| T-RET-19 | AC-RET-17 (requested / approved) | M, S, A đọc: chỉ ngân hàng + `7890` + tên; SQL `account_number_enc IS NOT NULL` và KHÔNG giải mã được thành chuỗi trong phản hồi |
| T-RET-20 | AC-RET-18 | Cùng khoá hai lần -> 200 + `Idempotency-Replayed`, 1 yêu cầu, 1 sự kiện, 1 thư; khác nội dung (kể cả số tài khoản khác) -> `idempotency-conflict`; thiếu khoá 422; 2 lần song song 1 yêu cầu; SQL `request_hash` không đổi khi đổi số tài khoản KHÔNG phải HMAC (kiểm hash khác nhau) |
| T-RET-21 | AC-RET-19 | Huỷ `requested` 200 (số đầy đủ xoá, 1 sự kiện, không thư); huỷ `approved` / lần hai -> `invalid-transition`; tạo lại được |
| T-RET-22 | AC-RET-20 | `Order.canReturn`, `returnDeadline`, `return` đủ trạng thái, từng mốc, số tiền (dự kiến / chốt), ngày dự kiến hoàn, lý do từ chối, tài khoản che; không yêu cầu -> không khối `return`; danh sách đơn không N+1 (đếm truy vấn) |
| T-RET-23 | AC-RET-21 | Tạo / estimate: a..g đúng số, 422 `lines` ở (f), phản hồi đủ cấu phần |
| T-RET-24 | AC-RET-40 (khách), AC-RET-41(a) | 1 sự kiện `return_requested`; dòng thời gian khách "nine2fine" cho bước nhân viên; thư (a) tới email đơn, không số tài khoản |

**9.3 Admin:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-RET-30 | AC-RET-31 | 25 yêu cầu: mặc định 20 dòng + `counts` 8 / 5 / 4 / 5 / 3 / 25; `closed`; `q` mã / tên / SĐT; `limit` 50 ok, 0 / 51 422; `page=99`; `sort=amount`; `sort=reason` 422; hoà giây ổn định |
| T-RET-31 | AC-RET-32 | Chi tiết `approved` / `received`; id lạ 404; tên / SĐT / email như đơn; `AdminOrder.return` cùng dữ liệu |
| T-RET-32 | AC-RET-33 | Duyệt: ghi chú 251 -> 422 `note`, 250 / không ghi chú 200; tồn, `payment_status` không đổi; 1 sự kiện; 1 thư |
| T-RET-33 | AC-RET-34 | Từ chối 4 / 5 / 250 / 251 / thiếu; `approved -> rejected` ok; tạo lại -> `return-exists`; số tài khoản xoá; thư (c) có lý do |
| T-RET-34 | AC-RET-35 | Nhận hàng (a..f): số chốt 1.200.000 / 750.000; (b) 422 `note`; (d) đạt 0 -> `rejected`, `payment_status` không đổi; (e), (f) 422 `lines` |
| T-RET-35 | AC-RET-36 | V1 7 -> 9, đúng 1 dòng `inventory_adjustments` (`return`, +2, "Trả hàng #<mã>", người S), V2 vẫn 4 không dòng; lần hai và 20 lần song song: 1 thành công, 19 `invalid-transition`, V1 = 9; dòng `return` hiện ở `GET /admin/inventory/{id}/movements` cùng định dạng dòng nhập tay (AC-RET-55) |
| T-RET-36 | AC-RET-37 | S 403; `amount` 1.199.999 -> 422 `amount`; mã 3 / 4 / 60 / 61; A đúng 200 (`refunded_at`, người, mã); lần hai `invalid-transition`; thư (d) đúng số tiền, ngân hàng + `7890`, mã giao dịch |
| T-RET-37 | AC-RET-38 | (i) hoàn hết -> `refunded`; (ii) L1x1 -> `partially_refunded`; (iii) `rejected` sau nhận -> vẫn `paid`; đơn `refunded` khách gửi lại `not-returnable`; giả lỗi giữa giao dịch (`vi.spyOn` `emitReturnEvent`) -> rollback cả `payment_status` |
| T-RET-38 | AC-RET-39 | 20 lần lặp: S1 duyệt đồng thời S2 từ chối; A1 / A2 hoàn tiền: mỗi cặp 1 x 200 + còn lại 409; sự kiện, thư, `payment_status` đúng 1 lần; thao tác 422 không để lại gì |
| T-RET-39 | AC-RET-17 (đủ), AC-RET-40 | A thấy số đầy đủ CHỈ ở `received` (R: `requested`, `approved`, `refunded` che); chuỗi số seed không có trong thư, `order_events`, nhật ký hợp nhất, log, `idempotency_keys`; SQL sau `refunded` / `rejected` / `cancelled`: `account_number_enc IS NULL` + còn `last4`; mỗi bước đúng 1 sự kiện; nhật ký `targetType=order` có 3 dòng nhân viên, không dòng của khách |
| T-RET-40 | AC-RET-41 | SMTP giả: 4 thư tiêu đề đúng, hotline từ cài đặt; SMTP lỗi ở duyệt: trạng thái `approved`, `email_attempts` tăng, thử lại không trùng |
| T-RET-41 | AC-RET-17 / 41 (log) | Spy `logger` + console cả quy trình: không có số tài khoản, `bank`, `detail`, `note`, `refundReference`, khoá |
| T-RET-42 | AC-RET-50 | Tổng quan: `returnRequested` 2, `returnApproved` 1, `returnReceived` 1 bằng `counts` danh sách; không đổi theo `range`; S không có khoá tiền; không `returnRate` / `deliveryFailed` |
| T-RET-43 | AC-RET-51 (+ AC-INS-12, 13) | R1 + O1..O9: (a) 1.200.000; (b) `partially_refunded` L1x1 -> 750.000, `units` 2, `completedOrders` vẫn đếm R1; (c) `refunded` -> 0; Σ `byDay` = Σ `byCategory` = Σ `byPayment` = Σ `topProducts` = KPI; ngày D-5 không phải ngày hoàn; dòng 0 / 0 không hiện; chạy dưới 4 múi giờ phiên như T-INS-14; không có phí giao / phí gửi trả trong doanh thu |
| T-RET-44 | AC-RET-52 | `refundedAmount` 450.000, `refundedUnits` 1, `returnedOrders` 1 + `previous` (null khi kỳ trước không có đơn giao) |
| T-RET-45 | AC-RET-53 | M 18.000.000 gồm R1: (a) L1x1 `not-fit` -> 17.550.000 (không trừ phí gửi trả) Bronze, `nextTierAt` 18.000.000; (b) trả hết `wrong-size` -> 16.800.000; (c) `rejected` / `cancelled` -> 18.000.000 Silver; `GET /admin/customers/{id}` cùng số (`spentThisYear`, `tier`) |
| T-RET-46 | AC-RET-55 | Yêu cầu trả hàng không làm đơn vào tab `returning`; test Slice 4 hàng hoàn không đổi; điều chỉnh tay `return` hợp lệ |
| T-RET-47 | AC-RET-02 (đủ) | S 200 ở duyệt / từ chối / nhận hàng, 403 ở hoàn tiền (không sự kiện); A hạ xuống staff bằng SQL -> 403; S bị khoá -> 401 |
| T-RET-50 | AC-RET-30, 51 (cấu trúc) | Quét tĩnh: `payment_status` chỉ trong `revenue.sql.ts` (insights-admin); giá trị `refunded` / `partially_refunded` chỉ được ghi vào `orders.payment_status` ở `process-return.service.ts`; `account_number` / `accountNumber` không có trong `logger.*`, `mail/`, `return-events.ts`, `audit.query.ts`; không `now()` / `CURRENT_DATE` / `AT TIME ZONE 'Asia` trong SQL mới |

**9.6 Should (có thể cắt, làm sau 9.2..9.5):**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-RET-60 | AC-RET-22 | G (R7) với grant còn hạn: tạo / xem / huỷ, ảnh gắn theo đơn; grant hết hạn 401; grant R7 cho R2 -> 404 |
| T-RET-61 | AC-RET-44 | `overdue` (25 giờ vs 1 giờ, tính khi đọc), `returnPending` đúng 2 đơn, đơn vị / mã vận đơn hiện cho khách, thư "đã nhận hàng trả về" |
| T-RET-62 | AC-RET-52 (`returnRate`) | 1 / (2 + 1) = 0,3333; mẫu 0 -> 0 |

**9.7 / 9.8 Nghiệm thu thật** (Thắng / Orchestrator, cần duyệt áp migration): `migrate deploy` x2 (tệp enum rồi tệp schema) trên Supabase, `migrate status` "up to date"; kiểm chỉ đọc ba bảng mới RLS bật, 0 dòng, `order_status` không đổi; Thắng tạo bucket riêng (mục 15 "Việc Thắng"); chạy một yêu cầu thật trên 2 trình duyệt (gửi kèm ảnh, duyệt, nhận hàng + nhập kho, hoàn tiền), đọc 4 thư, thử mở URL ảnh trong cửa sổ ẩn danh (phải 401 / 404), đối chiếu Báo cáo / hạng bằng SQL chỉ đọc (AC-RET-05, 15, 17, 41, 51).

**Chỉ FE / E2E (không có T-RET BE):** AC-RET-04, 23, 24, 42, 43, 54 (+ AC-RET-22 phần chữ chính sách).

## 14. Rủi ro

| # | Rủi ro | Giảm nhẹ |
| --- | --- | --- |
| R1 | Số tài khoản lộ qua log / thư / sự kiện / nhật ký / snapshot / băm idempotency | Mục 7 (mã hoá cột, HMAC băm, DTO tường minh, cột liệt kê, xoá khi cuối + CHECK), T-RET-08, 19, 39, 41, 50 |
| R2 | Ảnh trả hàng lộ (bucket công khai, URL đoán được) | Kho riêng + khoá `rp-` khác `MEDIA_ID_RE`; máy chủ phục vụ byte sau kiểm quyền; chốt chặn bucket `public`; T-RET-07, 17 |
| R3 | Tồn kho / tiền / `payment_status` lệch dưới đua x20 | Khoá `order_returns` rồi CAS + `FOR UPDATE`, thứ tự khoá cố định, tồn cộng trong cùng giao dịch, `payment_status` chỉ đổi ở `refunded` có điều kiện `status='completed' AND payment_status='paid'`; T-RET-35, 37, 38 |
| R4 | Yêu cầu kẹt `requested` / `approved` giữ bản mã tài khoản vô thời hạn (không tác vụ nền, S9-Q6) | Chấp nhận ở bản này; ghi G10 / đề xuất: slice sau thêm tác vụ dọn hoặc `expires_at` |
| R5 | Ảnh giữ vô thời hạn, ảnh mồ côi (tải xong không gửi) chiếm kho | Won't tự xoá (PRD); giới hạn 30 / giờ + 5 MB; đề xuất dọn tay / job sau |
| R6 | Prisma không khai báo chỉ mục duy nhất từng phần: `migrate diff` đòi `DROP INDEX`, vỡ T-RET-01 | Cột `active_order_id` + `@unique` (kỹ thuật Slice 4); chỉ mục thường khai báo đủ trong `schema.prisma`; không dùng chỉ mục từng phần |
| R7 | `ALTER TYPE ... ADD VALUE` trong khối giao dịch / dùng ngay | Tách tệp 1 riêng (mục 2), tệp 1 không dùng giá trị mới; `IF NOT EXISTS` |
| R8 | Múi giờ: hạn 30 ngày, ngày bán gốc của doanh thu | Quy tắc mục 4; T-RET-06, 43 chạy dưới 4 múi giờ phiên; quét tĩnh |
| R9 | Doanh thu / hạng ba nơi lệch nhau | `revenue.sql.ts` và `net-spent.sql.ts` là nguồn duy nhất; T-RET-43, 45, 50; chạy lại toàn bộ test Slice 8 |
| R10 | Cộng tồn vượt `maxQty` 100.000 hoặc biến thể bị xoá | `422 lines` kèm giao dịch rollback; biến thể ẩn / lưu trữ vẫn cộng (`order_items.variant_id` RESTRICT nên không xoá) |
| R11 | Sửa `toOrderDto` / `timelineTitle` / `EVENT_TEMPLATES` chạm mã Slice 3 / 4 | Chỉ thêm; test Slice 3 / 4 chạy lại; nhánh `default` của `timelineTitle` là bẫy ("Đã huỷ đơn") nên thêm `case` tường minh cho 6 loại + test timeline |
| R12 | `Order.canReturn` bắt buộc nhưng phản hồi đặt đơn / email không biết yêu cầu | `toOrderDto` tính phần thuần (đơn đủ điều kiện), `withReturn` chỉnh theo yêu cầu sống; chỗ khác (thư, đặt đơn) luôn `false` vì chưa `completed` |
| R13 | Ảnh `<img>` cần cookie: nếu FE / BE khác origin, cookie `SameSite=Lax` không gửi kèm | Triển khai hiện tại cùng origin qua proxy `/api` (contract mục `servers`); nếu đổi, FE tải ảnh bằng `fetch` + `Blob URL` |
| R14 | Rate limit trong RAM (kế thừa) | Chấp nhận như các slice trước |
| R15 | Thư lỗi chặn chuyển trạng thái | Thư là hậu giao dịch (cơ chế sự kiện hiện có); lỗi gửi không rollback; T-RET-40 |

## 15. Đề xuất cho PO / điểm lệch cần Orchestrator duyệt (trước khi `locked`)

PRD mâu thuẫn hoặc mơ hồ so với mã thực tế; BE đã chọn cách an toàn (cột "Đã chọn") và không dừng:

1. **Chỉ mục duy nhất từng phần.** PRD / yêu cầu nói "partial unique index". Prisma 6 không khai báo được (R6) nên `migrate diff` sẽ lệch. *Đã chọn:* cột `active_order_id` + `@unique` + CHECK (`chk_returns_active`), hiệu lực giống hệt (tối đa 1 yêu cầu không-`cancelled` / đơn, DB tự từ chối bản thứ hai); cùng kỹ thuật `orders.active_tracking_number`.
2. **Hai migration** thay vì một (`..._returns_enum` rồi `..._returns_schema`) vì `ADD VALUE` (mục 2); `order_event_kind` thêm 6 giá trị không thể gỡ. Trạng thái / lý do yêu cầu là `VARCHAR + CHECK`, không enum mới.
3. **Chạm contract đã `locked`** (chỉ cộng thêm): `Order`, `AdminOrder`, `AdminOrderSummary`, `AdminEventKind`, `AdminDashboardTodo`, `AdminSalesReport.kpis`, `ErrorResponse.error.currentReturnState`, `fieldErrors` ở thêm 3 endpoint. `Order.canReturn` và 3 số `todo`, 3 KPI là trường bắt buộc ở phản hồi (BE luôn gửi; FE cũ bỏ qua trường lạ). Cần duyệt vì đổi contract Slice 3 / 4 / 8.
4. **Ảnh: máy chủ phục vụ byte, không URL ký.** Yêu cầu đề xuất "URL ký có hạn" nhưng AC-RET-15 cấm URL mở được khi không cookie; một URL ký mở được cho tới hết hạn. *Đã chọn:* bucket riêng tư mới + endpoint có kiểm quyền mỗi lần (BE đọc bằng service role qua endpoint `authenticated`). Đổi lại: băng thông ảnh qua máy chủ. `local` cho dev / test (thư mục `.media-private/`).
5. **Mã hoá số tài khoản ở cột (AES-256-GCM, khoá `RETURN_ACCOUNT_KEY`)** và băm idempotency bằng HMAC: PRD chỉ yêu cầu che / xoá khi cuối. Thêm 1 biến môi trường bí mật; thiếu ở production thì tạo yêu cầu COD báo `unavailable` (không ghi sai chỗ). *Đề xuất:* giữ (phòng lộ DB / backup); nếu PO muốn bỏ, sửa `account-secret.ts` (lưu rõ, bỏ HMAC), không đổi contract.
6. **`discountTotal` và `shippingCollected` KHÔNG đổi** khi hoàn một phần (BR-RET-51 chỉ nói doanh thu và `units`); `discountTotal` vẫn là Σ giảm giá của các dòng đơn tính doanh thu, kể cả phần của hàng đã trả. *Đề xuất:* PO quyết định có trừ phần giảm của hàng trả không.
7. **`previous` của KPI hoàn** = `null` khi kỳ trước không có đơn `completed` nào được giao (AC-RET-52 "null nếu kỳ trước không có đơn"); khác nhóm doanh thu (null khi không có đơn tính doanh thu).
8. **`totalSpent` của khách hàng ở admin** (tổng mọi thời gian, `GET /admin/customers`) cũng trừ tiền hoàn (PRD D9 chỉ nói hạng / `getMembership`). *Đã chọn:* cùng fragment `net-spent` cho cả ba chỗ để không lệch nhau; nếu PO muốn `totalSpent` thô, tách một dòng.
9. **Đóng thẳng khi nhận hàng** (Σ đạt = 0 hoặc `amount <= 0`) tính là MỘT chuyển `approved -> rejected` (một sự kiện `return_rejected`, một thư (c)), kèm kết quả kiểm lưu ở `order_return_items` và `received_at/by`; không sự kiện `return_received` riêng (BR-RET-40: mỗi chuyển 1 sự kiện).
10. **Định danh dòng trong API là `variantId`** (duy nhất trong đơn, đã có trong `OrderLine`), không dùng `order_item_id` (không lộ ra API khách). Admin nhận hàng cũng theo `variantId`.
11. **`reason_code` của sự kiện:** chỉ `return_requested` mang mã lý do (cho dòng thời gian admin); sự kiện nhân viên để `NULL` để nhật ký hợp nhất (chỉ đọc `reason_code`, không đọc `detail`) không lộ ghi chú.
12. **`estimate` (Should)** và 5 operation vãng lai có thể cắt riêng: cắt `estimate` thì FE dùng công thức cục bộ (rủi ro lệch vài đồng với máy chủ); cắt vãng lai thì chính sách giữ "gọi hotline / gửi email" (BR-RET-54d).
13. **Không `Idempotency-Key` cho thao tác admin** (PRD không yêu cầu; lặp lại -> `409`, FE tải lại), khác Slice 4 (khoá tuỳ chọn).
14. **Chạm mã ngoài module mới (không đổi hành vi hiện có):** trích `restockVariantTx` khỏi `applyDelta`, trích `addBusinessDays` khỏi `estimateDelivery`, mở rộng `Permission`, `IdempotencyScope`, `ErrorCode`, `EVENT_TEMPLATES`, `CUSTOMER_KINDS` / `timelineTitle`, `toOrderDto`; sửa `revenue.sql.ts`, `audit.query.ts`, `getMembership`, `customer.query.ts`. Chạy lại test Slice 3 / 4 / 6 / 7 / 8 sau lát 9.1 và 9.3.
15. **Áp migration lên Supabase** chỉ sau khi Thắng duyệt (lát 9.8). Hiện chỉ áp DB cục bộ `n2f_dev`, `n2f_test`. Orchestrator / Thắng chạy `migrate deploy`.
16. **Khi duyệt:** Orchestrator ghi `docs/decisions.md` (contract Slice 9 locked + các điểm trên), chuyển `x-status: draft` -> `locked` ở 17 operation và `status: draft` -> `locked` ở `info.description` + 3 tag, đồng thời cập nhật các schema cũ đã chạm (mục 3).

### Việc Thắng phải làm thủ công (BE không làm thay được)

1. **Tạo bucket riêng tư trên Supabase** (Storage -> New bucket): tên `return-photos`, **Public bucket = TẮT**, giới hạn kích thước 5 MB, MIME cho phép `image/jpeg, image/png, image/webp`; KHÔNG thêm policy nào (service role bỏ qua RLS; không policy = anon không đọc được). **Không** dùng bucket `product-images` (công khai). Nếu đặt tên khác, đặt biến `SUPABASE_RETURN_BUCKET`.
2. **Biến môi trường production** (Render / nơi chạy BE): `RETURN_ACCOUNT_KEY` = 32 byte ngẫu nhiên mã hoá base64 (ví dụ `openssl rand -base64 32`), giữ bí mật, KHÔNG commit; `SUPABASE_RETURN_BUCKET` (nếu khác mặc định); đã có sẵn `MEDIA_STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Mất khoá thì số tài khoản của yêu cầu đang xử lý không đọc lại được (khách phải gửi lại).
3. **Duyệt áp migration** `20261112000200_returns_enum` rồi `20261112000300_returns_schema` (cả hai chỉ cộng thêm; `ADD VALUE` không rollback được) bằng `npx prisma migrate deploy` trong `backend` với `.env` Supabase (lát 9.8), rồi chạy thử một yêu cầu thật (gửi kèm ảnh -> duyệt -> nhận hàng -> nhập kho -> chuyển khoản thật -> xác nhận hoàn tiền), mở URL ảnh bằng cửa sổ ẩn danh để kiểm không công khai, đọc 4 email và sửa chữ nếu cần (G10).
4. **Quyết định PO còn mở** (mục 15 #5, #6, #8): giữ mã hoá số tài khoản; có trừ phần giảm giá của hàng trả khỏi `discountTotal` không; `totalSpent` thô hay ròng.
