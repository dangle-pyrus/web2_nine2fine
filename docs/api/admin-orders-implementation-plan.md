# Kế hoạch triển khai Admin đơn hàng (Slice 4) - locked 2026-11-08 cùng contract

Hợp đồng: `docs/api/openapi.yaml` (phần Slice 4 `status: locked (2026-11-08)`, Orchestrator; auth, catalog, phần còn lại của Slice 3 cũng locked; đổi qua quy trình handoff -> Orchestrator duyệt -> cập nhật contract + `docs/decisions.md`). BR/AC: `docs/product/PRD.md` mục "Slice 4: Admin đơn hàng" (BR-ADM-01..41, AC-ADM-01..50, mục 7 câu hỏi). Lát giao: `docs/product/backlog.md` mục "Slice 4" (4.1-4.9). Khi mâu thuẫn, PRD thắng. Chỉ là tài liệu: agent triển khai làm theo mục 12 mà không cần hỏi lại; các chỗ cần quyết định nằm ở mục 14 và 15 (đã giải). Cùng khuôn với `docs/api/cart-checkout-implementation-plan.md` (đọc mục 4.4, 4.7 của file đó: khoá, `cancelOrderTx`).

## 0. Câu hỏi S4-Q1..Q9: đã trả lời (2026-11-08), điểm lật vẫn giữ

S4-Q1..Q7 và Q9 **đã trả lời**: Thắng nhận mặc định PO (`docs/decisions.md`, các dòng 2026-11-08 về Slice 4). Chỉ **S4-Q8** (nội dung COMMON-01..03) còn mở, không chặn. Các giá trị dưới đây là mặc định phát hành; vẫn gom vào **một** khối `ADMIN_ASSUMPTIONS` trong `backend/src/config/assumptions.ts` (cạnh `ASSUMPTIONS` của Slice 3) và một hằng `TRANSITIONS` (mục 4); đổi một câu trả lời = sửa đúng chỗ ghi ở cột "Lật ở đâu" + sửa BR/contract theo quy trình.

| Q | Mặc định đang dùng | Lật ở đâu | Hệ quả khi lật |
| --- | --- | --- | --- |
| S4-Q1 (đã trả lời) | Khách ở `to_ship` chỉ **gửi yêu cầu huỷ** (shop duyệt); phát hành cùng lát 4.5 với **`toShipCancelMode: 'request'`** | `ASSUMPTIONS.toShipCancelMode: 'direct' \| 'request'` (thay `customerCancellableFrom`, xem mục 14). `'direct'` = hành vi Slice 3 | `'direct'`: không có `cancel_requested` mới, bỏ 2 endpoint `cancel-request/*` khỏi router (cờ), tab `cancel-requests` luôn 0. Lát 4.1-4.4 không phụ thuộc; **lát 4.5 không còn bị chặn bởi câu hỏi** (vẫn phụ thuộc 4.3 / 4.4 về kỹ thuật: `runAction`, `cancelOrderTx` tách, email) |
| S4-Q2 (đã trả lời) | Hàng hoàn **hai bước**: huỷ từ `to_receive` không cộng tồn, `returned-stock` cộng sau | `ADMIN_ASSUMPTIONS.returnStockMode: 'two-step' \| 'one-step'` | `'one-step'`: huỷ từ `to_receive` gọi `restoreStock = true` (cộng ngay, như `to_ship`), `returned_from_transit` luôn `false`, tab `returning` luôn 0, `returned-stock` -> `409 invalid-transition`; vẫn ghi `delivery_refused_at` cho `refused` |
| S4-Q3 (đã trả lời) | 08:00-18:00, thứ Hai-thứ Bảy; gọi trong 2 giờ làm việc; duyệt huỷ trong 24 giờ; chỉ cờ | `ADMIN_ASSUMPTIONS.workHours = { fromHour: 8, toHour: 18, days: [1..6] }`, `callSlaWorkingHours: 2`, `cancelRequestSlaHours: 24` | Chỉ đổi cờ `overdue` (Should) |
| S4-Q4 (đã trả lời; thêm `customer_request`) | staff huỷ **5** lý do cố định (`unreachable`, `declined_on_call`, `customer_request`, `refused`, `undeliverable`) + duyệt / từ chối; chỉ admin huỷ `other` | `ADMIN_ASSUMPTIONS.adminOnlyCancelReasons: ['other']` | Thêm / bớt lý do admin-only; `allowedActions` đổi theo, FE không đổi |
| S4-Q5 (đã trả lời) | Đơn vị vận chuyển nhập tự do 2-50 ký tự | `ADMIN_ASSUMPTIONS.carrierMode: 'free-text'` (danh mục = đổi schema Zod `carrier` thành `z.enum`; contract đổi `AdminShipRequest.carrier`) | FE gợi ý GHN, GHTK, Viettel Post, J&T (không ép) |
| S4-Q6 (đã trả lời) | Mỗi đơn khách chỉ **một** yêu cầu huỷ | `ADMIN_ASSUMPTIONS.cancelRequestResubmit: false` | `true`: UPDATE yêu cầu không còn `AND cancel_requested_at IS NULL`, mỗi yêu cầu cần dòng riêng (cần bảng `order_cancel_requests` - **không làm** ở Slice 4; nên lật sang `true` là việc của slice sau) |
| S4-Q7 (đã trả lời) | Chữ email và 6 câu lý do theo PRD (gồm `customer_request`); Thắng sửa chữ sau khi đọc thư thật ở nghiệm thu 4.7 | Một file `mail/order-templates.ts` + hằng `SHOP_CANCEL_REASON_TEXT` | Sửa chữ, không đổi contract |
| S4-Q8 (**còn mở**, không chặn) | Bảng chuyển trạng thái mục 4 (suy ra từ CHK-PAY-14; COMMON-01..03 chưa có nội dung) | Hằng `TRANSITIONS` trong `order-state.ts` (mọi kiểm ở một chỗ) | Sửa bảng + test T-ADM-0x tương ứng |
| S4-Q9 (đã trả lời) | `declined_on_call`; `unreachable` = 3 lần gọi **liên tiếp** có lần cuối - lần đầu <= 24 giờ 00 phút (cửa sổ 24 giờ bất kỳ, chỉ mở lý do, không tự huỷ); mã vận đơn không trùng; staff thấy SĐT / email | `ADMIN_ASSUMPTIONS.unreachableAttempts: 3`, `unreachableWindowMs: 24 * 3600 * 1000` (so sánh `<=`) | Tham số |

Điều kiện (backlog): 4.1-4.4 làm theo mặc định; **lát 4.5 không còn chờ câu trả lời** (S4-Q1 đã trả lời) và phát hành với `toShipCancelMode: 'request'`; về kỹ thuật vẫn làm sau 4.3 (`runAction`, `cancelOrderTx` tách) và 4.4 (email, hàng hoàn). Điểm lật (`'direct'`, `'one-step'`, ...) giữ nguyên trong code và bảng trên để Thắng đổi ý sau này thì chỉ sửa cờ + contract theo quy trình.

## 1. Phạm vi BE Slice 4

12 endpoint mới (tag `admin-orders`, tất cả `adminSession`): `GET /admin/orders` (`page`, `limit`), `GET /admin/orders/counts`, `GET /admin/orders/{orderCode}`, `POST /admin/orders/{orderCode}/{call-attempts | confirm | ship | deliver | cancel | returned-stock | cancel-request/approve | cancel-request/reject | notes}`. Đổi 1 endpoint cũ: `POST /orders/{orderCode}/cancel` (khách; `to_ship` -> `cancel_requested`). Thêm trường cộng thêm vào `Order`, `OrderTimelineEntry`, `ErrorResponse`; 3 mã lỗi mới (mục 14).

Ngoài phạm vi: sửa địa chỉ / dòng hàng, hoàn tiền, `to_pay` / QR, trả hàng, trạng thái `delivering` / `delivery-failed` / `returned-to-sender`, mọi màn admin khác, vô hiệu hoá / đổi vai trò bằng giao diện (AC-AUTH-75), xuất file.

## 2. Schema Prisma (chỉ cộng thêm, BR-ADM-37)

Không bảng mới (không `DROP`, `RENAME`, đổi kiểu, `TRUNCATE`, `DELETE`). Chỉ `ALTER TABLE ... ADD COLUMN` (cột NULL hoặc có `DEFAULT` hằng, không ghi lại bảng), `CREATE TYPE` mới, `CREATE INDEX`, `ADD CONSTRAINT ... CHECK` (cột mới đều NULL nên qua với dữ liệu Slice 3). **Không có bảng mới nên không có bảng nào cần RLS mới**; test T-ADM-90 vẫn khẳng định mọi bảng `public` còn bật RLS. Idempotency tái dùng `idempotency_keys` sẵn có (scope mới `admin-action`, 12 ký tự <= `varchar(20)`).

### Enum mới
`order_event_kind` (`placed`, `payment_received`, `call_attempt`, `confirmed`, `shipped`, `delivered`, `cancel_requested`, `cancel_approved`, `cancel_rejected`, `cancelled`, `stock_restocked`, `stock_written_off`, `note`). Không đổi enum cũ (`order_status` đã có `cancel_requested`; `order_actor` giữ `customer/shop/system`: nhân viên ghi `actor = shop`).

### `orders` thêm cột
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| confirmed_at, confirmed_by | timestamp(6) NULL, uuid NULL FK `users` ON DELETE SET NULL | khách xác nhận (BR-ADM-17) |
| carrier | varchar(50) NULL | đơn vị vận chuyển |
| tracking_number | varchar(40) NULL | lưu chữ hoa, để hiển thị |
| active_tracking_number | varchar(40) **UNIQUE** NULL | = `tracking_number` khi đơn chưa huỷ; đặt `NULL` khi huỷ. Postgres coi nhiều NULL là khác nhau nên đơn đã huỷ không chiếm mã (BR-ADM-20, AC-ADM-23). Dùng cột thay cho index partial (Prisma không khai báo được) |
| handed_over_at, handed_over_by | timestamp(6) NULL, uuid NULL FK users SET NULL | bàn giao |
| delivered_at, delivered_by | timestamp(6) NULL, uuid NULL FK users SET NULL | giao xong; COD: `paid_at` đặt cùng lúc |
| cancel_requested_at | timestamp(6) NULL | thời điểm khách gửi yêu cầu; **không bao giờ xoá về NULL** nên cũng là dấu "đã dùng yêu cầu duy nhất" (S4-Q6) |
| cancel_request_reason | varchar(250) NULL | lý do khách nhập |
| cancel_request_outcome | varchar(8) NULL | `approved` / `rejected` |
| cancel_request_decided_at, cancel_request_decided_by | timestamp(6) NULL, uuid NULL FK users SET NULL | |
| cancel_request_reject_reason | varchar(250) NULL | khách thấy |
| cancel_reason_code | varchar(20) NULL | `unreachable`, `declined_on_call`, `customer_request`, `refused`, `undeliverable`, `other` (chỉ huỷ qua `.../cancel`; dài nhất 16 ký tự) |
| cancel_note | varchar(250) NULL | ghi chú nội bộ của huỷ do shop; **không bao giờ vào DTO khách / email** |
| returned_from_transit | boolean NOT NULL DEFAULT false | đặt `true` khi huỷ từ `to_receive` (S4-Q2 hai bước) |
| return_handled_at, return_handled_by | timestamp(6) NULL, uuid NULL FK users SET NULL | xử lý hàng hoàn |
| return_decision | varchar(12) NULL | `restocked` / `written_off` |
| return_note | varchar(250) NULL | bắt buộc 5-250 khi `written_off` |

`cancel_reason` (cột có sẵn) = chuỗi **hiển thị cho khách**: lý do khách nhập (khách huỷ), câu chuẩn BR-ADM-28 (huỷ do shop), lý do khách nhập (yêu cầu được duyệt). `delivery_refused_at`, `stock_restored_at` (có sẵn) dùng tiếp: `stock_restored_at` vẫn là **dấu duy nhất "đã cộng lại tồn"** cho mọi đường (huỷ khách, hết hạn, shop, duyệt, hàng hoàn về), nên đúng một lần bất kể đường nào.

CHECK thêm tay (cột mới NULL nên chạy được trên dữ liệu cũ):
- `(carrier IS NULL) = (tracking_number IS NULL) AND (carrier IS NULL) = (handed_over_at IS NULL)`; `tracking_number IS NULL OR tracking_number ~ '^[A-Z0-9-]{4,40}$'`; `active_tracking_number IS NULL OR active_tracking_number = tracking_number`.
- `delivered_at IS NULL OR status = 'completed'`; `confirmed_by IS NULL OR confirmed_at IS NOT NULL`.
- `status <> 'cancel_requested' OR cancel_requested_at IS NOT NULL`; `cancel_request_outcome IS NULL OR (cancel_request_outcome IN ('approved','rejected') AND cancel_requested_at IS NOT NULL)`.
- `cancel_reason_code IS NULL OR (status = 'cancelled' AND cancel_reason_code IN ('unreachable','declined_on_call','customer_request','refused','undeliverable','other'))`.
- `returned_from_transit = false OR status = 'cancelled'`; `(return_handled_at IS NULL) = (return_decision IS NULL)`; `return_handled_at IS NULL OR returned_from_transit`; `return_decision IS NULL OR return_decision IN ('restocked','written_off')`; `return_decision <> 'restocked' OR stock_restored_at IS NOT NULL`.
- `delivery_refused_at IS NULL OR status = 'cancelled'`.

Index (không partial, không biểu thức): `idx_orders_created (created_at DESC, order_id DESC)` (tab `all`); `idx_orders_status_created (status, created_at DESC, order_id DESC)` (các tab theo trạng thái); `idx_orders_return_pending (returned_from_transit, return_handled_at)`; UNIQUE trên `active_tracking_number` (Prisma `@unique`).

### `order_events` thêm cột
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| kind | order_event_kind NULL | sự kiện cũ (Slice 3) = NULL, mapper suy ra: `from_status NULL` -> `placed`; `to_pay -> to_ship` -> `payment_received`; `to_status = cancelled` -> `cancelled` |
| actor_user_id | uuid NULL FK users ON DELETE SET NULL | chỉ khi `actor = shop`; CHECK `actor_user_id IS NULL OR actor = 'shop'` |
| actor_name | varchar(100) NULL | **chụp** tên lúc làm (đổi tên / xoá user sau này không đổi vết kiểm toán) |
| actor_role | user_role NULL | chụp vai trò lúc làm (enum `user_role` có sẵn) |
| reason_code | varchar(20) NULL | mã lý do huỷ / quyết định hàng hoàn |
| internal_note | varchar(500) NULL | ghi chú nội bộ; **chỉ admin API đọc** |
| email_template | varchar(30) NULL | tên thư cần gửi cho sự kiện này (mục 8); NULL = không có thư |
| email_attempts | smallint NOT NULL DEFAULT 0 | CHECK `BETWEEN 0 AND 3` |
| email_sent_at | timestamp(6) NULL | |

`detail` (có sẵn, <= 250) tiếp tục là phần **khách được thấy** (câu chuẩn lý do, lý do khách nhập, "GHTK - GHTK-12345", lý do từ chối). Index `idx_order_events_email_pending (email_sent_at, email_attempts, at)` cho job gửi lại. Sự kiện chỉ thêm: không có route sửa / xoá (AC-ADM-10: `PUT`/`DELETE` -> 404). Tuỳ chọn gia cố sau: trigger chặn `UPDATE` ngoài ba cột `email_*` và chặn `DELETE`; không làm ở Slice 4 (ghi vào backlog).

### Khối Prisma đề xuất (rút gọn)
```prisma
enum order_event_kind { placed payment_received call_attempt confirmed shipped delivered cancel_requested cancel_approved cancel_rejected cancelled stock_restocked stock_written_off note }

// model Order: thêm
//   confirmedAt DateTime? @map("confirmed_at") @db.Timestamp(6);   confirmedBy String? @map("confirmed_by") @db.Uuid
//   carrier String? @db.VarChar(50);  trackingNumber String? @map("tracking_number") @db.VarChar(40)
//   activeTrackingNumber String? @unique @map("active_tracking_number") @db.VarChar(40)
//   handedOverAt, handedOverBy, deliveredAt, deliveredBy, cancelRequestedAt, cancelRequestReason, cancelRequestOutcome,
//   cancelRequestDecidedAt, cancelRequestDecidedBy, cancelRequestRejectReason, cancelReasonCode, cancelNote,
//   returnedFromTransit Boolean @default(false), returnHandledAt, returnHandledBy, returnDecision, returnNote  (map snake_case như bảng trên)
//   relation: confirmer User? @relation("OrderConfirmer", fields: [confirmedBy], ...) ... (mỗi cột *_by một relation đặt tên, onDelete: SetNull)
//   @@index([createdAt(sort: Desc), order_id(sort: Desc)], map: "idx_orders_created")
//   @@index([status, createdAt(sort: Desc), order_id(sort: Desc)], map: "idx_orders_status_created")
//   @@index([returnedFromTransit, returnHandledAt], map: "idx_orders_return_pending")
// model OrderEvent: thêm kind order_event_kind?, actorUserId String? @db.Uuid, actorName String? @db.VarChar(100),
//   actorRole user_role?, reasonCode String? @db.VarChar(20), internalNote String? @db.VarChar(500),
//   emailTemplate String? @db.VarChar(30), emailAttempts Int @default(0) @db.SmallInt, emailSentAt DateTime? @db.Timestamp(6)
```
Quan hệ ngược cần thêm vào `model User` (chỉ phía Prisma, không sinh SQL): `confirmedOrders`, `handedOverOrders`... (đặt tên theo từng relation).

## 3. Migration

- Một migration `backend/prisma/migrations/<ts>_admin_orders_schema/` (timestamp sau `20261107000500`). Cách làm như Slice 3: `npx prisma migrate dev --create-only --name admin_orders_schema` trên **DB cục bộ `n2f_dev`**, mở SQL, bổ sung CHECK và (nếu cần) bỏ `DROP` ngoài ý muốn, rồi áp. Đọc SQL tìm `DROP|TRUNCATE|DELETE|RENAME|ALTER COLUMN ... TYPE`: có thì dừng. Chỉ có `ADD COLUMN`, `CREATE TYPE`, `CREATE INDEX`, `ADD CONSTRAINT`, `ADD FOREIGN KEY`.
- Không backfill: đơn và sự kiện Slice 3 giữ nguyên (cột mới NULL / `false`), hiển thị đúng "Khách" / "Hệ thống" theo `actor` (K11, AC-ADM-45).
- Kiểm cục bộ (như Slice 3): `npm test` chạy `migrate deploy` lên `n2f_test` từ DB sạch lẫn DB đã có 6 migration cũ + đơn thật; `prisma migrate diff --from-migrations ... --to-schema-datamodel ...` rỗng; `migrate deploy` lần hai không đổi gì (AC-ADM-45); T-ADM-90 kiểm CHECK, UNIQUE, RLS.
- Lên Supabase: chỉ `prisma migrate deploy` (`DIRECT_URL` cổng 5432) do Orchestrator / Thắng chạy sau khi test xanh; đơn thật `N2F2611082686` (đã huỷ) là mẫu kiểm. Không `migrate dev` / `reset` / `db push`.

## 4. Máy trạng thái (S4-Q8)

Một nguồn sự thật: `backend/src/modules/order-admin/order-state.ts` xuất `TRANSITIONS` (bảng dưới) và `computeAllowedActions(order, role, callStats)`; service kiểm bằng **cùng** hằng này nên `allowedActions` và `409` không thể lệch nhau. Ký hiệu: S = staff + admin, A = chỉ admin. "Cần gọi" = COD, `to_ship`, `needs_confirm_call`, `confirmed_at IS NULL`. "Hoàn tồn" = cộng lại đúng số lượng mỗi dòng, đặt `stock_restored_at`, một lần. "Trả voucher" = như `cancelOrderTx` (mã còn hạn mới trả).

| # | Hành động (endpoint) | Từ | Điều kiện thêm | Sang | Ai | Hiệu ứng phụ (cùng 1 giao dịch) | Sự kiện (`kind`) | Email |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | `call-attempts` | `to_ship` | cần gọi | `to_ship` | S | chỉ sự kiện (`internal_note` = note) | `call_attempt` | không |
| T2 | `confirm` | `to_ship` | cần gọi | `to_ship` | S | `confirmed_at/by` | `confirmed` | không |
| T3 | `ship` | `to_ship` | không cần gọi hoặc đã xác nhận (nếu không: `condition-not-met`) | `to_receive` | S | `carrier`, `tracking_number`, `active_tracking_number`, `handed_over_at/by`; tồn không đổi; `payment_status` giữ `pending` | `shipped` | `order-shipped` |
| T4 | `deliver` | `to_receive` | - | `completed` | S | `payment_status = paid`, `paid_at = COALESCE(paid_at, $now)`, `delivered_at/by`; không hoàn tác | `delivered` | `order-delivered` |
| T5 | `cancel` `unreachable` | `to_ship` | cần gọi + có 3 lần `call_attempt` **liên tiếp** mà lần cuối - lần đầu <= 24 giờ 00 phút (cửa sổ 24 giờ bất kỳ, `<=`; không đủ, kể cả 24 giờ 01 phút: `condition-not-met` 409). SQL: `lead(at, 2) OVER (ORDER BY at) - at <= interval '24 hours'` tồn tại. Chỉ **mở** lý do trong `allowedActions`, không tự huỷ | `cancelled` | S | hoàn tồn + trả voucher; `cancelled_by = shop`, `cancel_reason_code`, `cancel_reason` = câu chuẩn; `active_tracking_number` NULL | `cancelled` | `order-cancelled-shop` |
| T6 | `cancel` `declined_on_call` | `to_ship` | cần gọi | `cancelled` | S | như T5 | `cancelled` | `order-cancelled-shop` |
| T6a | `cancel` `customer_request` | `to_ship` | `note` 5-250 (422 `field: note`); **mọi** đơn `to_ship` (cần gọi hay không, đã xác nhận hay chưa) | `cancelled` | S | hoàn tồn + trả voucher như T5, nhưng `cancelled_by = customer` (sự kiện vẫn `actor = shop`, ghi tên + vai trò nhân viên, `reason_code = customer_request`); **không** ghi `delivery_refused_at` (không tính giới hạn COD); `cancel_reason` = "Đơn đã được huỷ theo yêu cầu của bạn."; `cancel_note` = note; `active_tracking_number` NULL | `cancelled` | `order-cancelled-shop` (câu `customer_request`) |
| T7 | `cancel` `refused` | `to_receive` | - | `cancelled` | S | **chưa** hoàn tồn; trả voucher; `delivery_refused_at = $now`; `returned_from_transit = true`; `active_tracking_number` NULL | `cancelled` | `order-cancelled-shop` |
| T8 | `cancel` `undeliverable` | `to_receive` | - | `cancelled` | S | như T7 nhưng **không** ghi `delivery_refused_at` | `cancelled` | `order-cancelled-shop` |
| T9 | `cancel` `other` | `to_ship` | `note` 5-250 | `cancelled` | **A** | như T5 | `cancelled` | `order-cancelled-shop` |
| T10 | `cancel` `other` | `to_receive` | `note` 5-250 | `cancelled` | **A** | như T7 không ghi `delivery_refused_at` | `cancelled` | `order-cancelled-shop` |
| T11 | `returned-stock` `restocked` | `cancelled` | `returned_from_transit AND return_handled_at IS NULL AND stock_restored_at IS NULL` | `cancelled` | S | hoàn tồn (đặt `stock_restored_at`), `return_*` | `stock_restocked` | không |
| T12 | `returned-stock` `written_off` | `cancelled` | như T11; `note` 5-250 | `cancelled` | S | `return_*`; **không** cộng tồn | `stock_written_off` | không |
| T13 | `cancel-request/approve` | `cancel_requested` | - | `cancelled` | S | hoàn tồn + trả voucher; `cancelled_by = customer`; `cancel_reason` = `cancel_request_reason`; `cancel_request_outcome = approved`, `decided_*` | `cancel_approved` | `cancel-approved` |
| T14 | `cancel-request/reject` | `cancel_requested` | `reason` 5-250 | `to_ship` | S | `cancel_request_outcome = rejected`, `decided_*`, `cancel_request_reject_reason`; tồn, voucher giữ; `confirmed_*` giữ nguyên | `cancel_rejected` | `cancel-rejected` |
| T15 | `notes` | mọi trạng thái | - | không đổi | S | chỉ sự kiện | `note` | không |
| C1 | khách `POST /orders/{code}/cancel` | `to_ship` | `cancel_requested_at IS NULL` (S4-Q6) | `cancel_requested` | khách | `cancel_requested_at`, `cancel_request_reason`; tồn, voucher, thanh toán giữ | `cancel_requested` (`actor = customer`) | không |
| C2 | khách cancel | `to_pay` | - | `cancelled` | khách | `cancelOrderTx` hiện có (hoàn tồn, trả voucher) | (hiện có) | (hiện có) |
| C3 | hết hạn thanh toán | `to_pay` | quá `payment_due_at` | `cancelled` | hệ thống | hiện có | (hiện có) | (hiện có) |

Mọi cặp (trạng thái, hành động) không nằm trong bảng (kể cả `to_pay`, `completed`, `cancelled` thường là chỉ xem; khách huỷ ở `to_receive` / `completed` / `cancelled` / `cancel_requested` / sau khi bị từ chối) -> `409 invalid-transition` (admin) hoặc `409 not-cancellable` (khách), **không đổi dữ liệu, không sự kiện, không thư**. Thứ tự kiểm: mục 6.2. Mỗi dòng thao tác thành công = **đúng 1** `order_events` (BR-ADM-11).

Ghi chú: bảng cho thấy xác nhận không đổi trạng thái; đơn `to_ship` đã xác nhận (hoặc không cần gọi) staff chỉ có thể bàn giao, hoặc admin huỷ `other`; khi khách gọi hotline xin huỷ thì staff / admin huỷ bằng `customer_request` (T6a, BR-ADM-24; xem mục 15 #5). `cancel_requested` không huỷ bằng lý do nào ở `.../cancel` (-> `invalid-transition`, AC-ADM-50).

## 5. Module backend

```
backend/src/lib/errors.ts                       + ErrorCode 'invalid-transition' 409, 'order-state-changed' 409, 'condition-not-met' 409; AppErrorExtras { currentStatus?, order? }; Errors.invalidTransition(status), .orderStateChanged(order), .conditionNotMet(msg, status)
backend/src/middleware/error.ts                 đưa currentStatus, order vào error.{...}
backend/src/middleware/rate-limit.ts            createRateLimit nhận opts.key?: (req) => string; adminReadLimit, adminWriteLimit (mục 9)
backend/src/middleware/no-store.ts              noStore: đặt Cache-Control: no-store ở đầu router admin (kể cả 401/403)
backend/src/config/assumptions.ts               + ADMIN_ASSUMPTIONS, toShipCancelMode (mục 0, 14)
backend/src/lib/vn-time.ts                      + addWorkingHours(from, hours, cfg), vnDayRange(from, to) (đầu ngày 00:00 GMT+7 .. hết ngày)
backend/src/modules/order-admin/order-admin.routes.ts      router + schemas Zod gắn ở đây
backend/src/modules/order-admin/order-admin.schemas.ts     zod: query list/counts, body 9 hành động
backend/src/modules/order-admin/order-admin.controller.ts
backend/src/modules/order-admin/order-state.ts             TRANSITIONS, computeAllowedActions, SHOP_CANCEL_REASON_TEXT, tabOf(order)
backend/src/modules/order-admin/order-admin.query.ts       list / counts / search SQL (mục 7)
backend/src/modules/order-admin/order-admin.service.ts     getAdminOrder, runAction(): khoá + so expectedStatus + dispatch + idempotency (mục 6)
backend/src/modules/order-admin/actions/*.ts               call-attempt, confirm, ship, deliver, cancel, returned-stock, approve-cancel, reject-cancel, note (mỗi file một hàm `(tx, ctx) => ActionResult`)
backend/src/modules/order-admin/order-admin.mapper.ts      toAdminOrder, toAdminTimeline, overdue flags
backend/src/modules/order/cancel-order.service.ts          REFACTOR: cancelOrderTx nhận options (mục 6.4); thêm requestCancelTx, restockReturnedTx; cancelByCustomer theo toShipCancelMode
backend/src/modules/order/order.mapper.ts                  + shipment, deliveredAt, cancelRequest, cancelMode, canCancel mới; timeline khách lọc theo kind (mục 6.6)
backend/src/modules/order/order-event.ts                   insertOrderEvent(tx, {...}): MỌI ghi sự kiện đi qua đây (kind, actor, snapshot tên/vai trò, email_template)
backend/src/modules/order/order-email.service.ts           + scheduleEventEmail(eventId), retryPendingEventEmails(now)
backend/src/modules/order/expiry.job.ts                    + gọi retryPendingEventEmails; quét idempotency_keys scope admin-action hết hạn (đã có quét theo expires_at)
backend/src/mail/order-templates.ts                        + 5 mẫu (mục 8)
backend/src/app.ts                                         api.use('/admin/orders', noStore, requireAuth('admin'), requireRole('staff','admin'), orderAdminRouter) SAU originGuard, cạnh '/admin/auth'
backend/test/helpers.ts                                    + loginStaff(), loginAdmin(), makeOrder({ status, needsCall, ... }), postAdmin()
```
`requireAuth('admin')` hiện có đã: đọc `role` và `is_active` từ `users` ở mỗi yêu cầu, loại `member`, xoá cookie khi hỏng (BR-ADM-01, 03; AC-ADM-03). `requireRole('staff','admin')` chỉ là lưới an toàn (member đã bị loại). **Quyền theo hành động** (`cancel other` chỉ admin) kiểm trong controller **trước** khi đọc đơn (mục 6.2) rồi lặp lại trong `computeAllowedActions` / `actions/cancel.ts` (phòng thủ hai lớp: nếu `reason` thuộc `adminOnlyCancelReasons` mà `role <> admin` -> `Errors.forbidden()`).

Ghi chú: HTTP admin đã đổi vai trò / vô hiệu có hiệu lực ngay (AC-ADM-03) nhờ đọc `users` mỗi yêu cầu; **không** có `revokeAllUserSessions` ở Slice 4 (xem mục 15 #8).

## 6. Giao dịch, khoá, đồng thời, idempotency

### 6.1 Khuôn một hành động admin (`runAction`)
```
prisma.$transaction(async (tx) => {
  1. SELECT ... FROM orders WHERE code = $code FOR UPDATE            -- khoá dòng đơn; không thấy -> 404
  2. (nếu có Idempotency-Key) SELECT FROM idempotency_keys WHERE scope='admin-action' AND key=$k FOR UPDATE:
       - có, request_hash khớp, chưa hết hạn -> trả response_snapshot (200 + Idempotency-Replayed) NGAY, không làm gì
       - có, hash khác                        -> 409 idempotency-conflict
  3. so expectedStatus với status đã khoá -> khác: 409 order-state-changed (kèm đơn hiện tại)
  4. kiểm TRANSITIONS: (status, hành động, role, điều kiện) -> invalid-transition / condition-not-met
  5. UPDATE orders ... WHERE order_id = $id AND status = $expected [AND điều kiện dấu: stock_restored_at IS NULL, return_handled_at IS NULL, cancel_requested_at IS NULL ...]   -- 0 dòng (không nên xảy ra sau khoá) -> 409 order-state-changed
  6. hiệu ứng phụ theo bảng mục 4 (voucher, tồn: theo thứ tự khoá 6.3)
  7. insertOrderEvent(tx, ...)        -- đúng 1 dòng, cùng giao dịch
  8. (nếu có key) INSERT idempotency_keys (scope, key, request_hash, order_id, response_snapshot = AdminOrder JSON, expires_at = now + 24h)
  9. đọc lại AdminOrder (cùng tx) làm kết quả
}, { timeout: 10_000, maxWait: 5_000 })
sau commit: nếu sự kiện có email_template -> scheduleEventEmail(eventId)
```
- **Một cơ chế chống đua = khoá dòng + so trạng thái**: hai yêu cầu cùng đơn chạy tuần tự trên dòng khoá; yêu cầu thứ hai thấy trạng thái mới -> `order-state-changed` (cùng `expectedStatus` cũ) hoặc, nếu FE gửi `expectedStatus` mới, `invalid-transition`. AC-ADM-14, 15, 33, 40: không cộng tồn hai lần vì (a) chỉ một giao dịch qua được bước 4, (b) `stock_restored_at IS NULL` nằm trong `WHERE` của bước 5 (đai thứ hai).
- `request_hash` = SHA-256 của JSON chuẩn hoá `{ userId, method, path, body }`. Cùng khoá dùng bởi **người khác** hoặc đường dẫn khác -> hash khác -> `idempotency-conflict`. `Idempotency-Key` không bắt buộc (khác Slice 3): thiếu thì chỉ `expectedStatus` bảo vệ; bấm đúp bị FE chặn (một request, BR-ADM-15).
- `notes` không có `expectedStatus` (ghi chú hợp lệ ở mọi trạng thái); vẫn khoá dòng để thứ tự sự kiện đúng.
- Lỗi giữa chừng (AC-ADM-11: chèn lỗi giữa bước cộng tồn) -> exception -> rollback toàn bộ: không đổi trạng thái, tồn, voucher, **không** sự kiện, không idempotency row, không thư (thư lên lịch chỉ sau commit). Test chèn lỗi bằng `vi.spyOn` lên hàm tồn hoặc `CHECK` giả (T-ADM-11).
- Tái thử khi `P2034` / `40P01` (deadlock): tối đa 3 lần với backoff ngắn (như Slice 3 R1); thực tế một thứ tự khoá duy nhất (6.3) nên hiếm.

### 6.2 Thứ tự kiểm (khớp contract)
`requireAuth` 401 -> `originGuard` 403 -> rate limit 429 -> **quyền theo `reason`** 403 -> Zod 422 (kể cả `Idempotency-Key` sai dạng) -> đọc / khoá đơn 404 -> idempotency replay / conflict -> `expectedStatus` 409 `order-state-changed` -> `TRANSITIONS` 409 `invalid-transition` -> điều kiện 409 `condition-not-met` -> `trackingNumber` trùng 422 (bắt `P2002` trên `active_tracking_number`, đổi thành `Errors.validation('trackingNumber')`; vì ở trong giao dịch nên rollback sạch) -> thực hiện.

### 6.3 Thứ tự khoá toàn hệ thống (kế thừa Slice 3 mục 4.4)
`orders` (dòng đích) -> `vouchers` (theo `voucher_id` tăng dần) -> `product_variants` (theo `variant_id` tăng dần) -> `order_events` / `idempotency_keys` (chỉ INSERT). Mọi hành động Slice 4 và đường huỷ khách / hết hạn tuân theo, nên không có chu trình khoá. Hành động chạm đơn nào cũng khoá **một** đơn; không có thao tác nhiều đơn.

### 6.4 Dịch vụ huỷ dùng chung (lát 4.3)
Tách `cancelOrderTx(tx, p)` hiện có thành tham số: `{ orderId, actor: 'customer'|'shop'|'system' /* actor của sự kiện */, cancelledBy: 'customer'|'shop'|'system' /* cột cancelled_by; customer_request = 'customer' dù actor = 'shop' */, actorUser?: { id, name, role }, allowedFrom, restoreStock: boolean, reason: string|null /* cột cancel_reason: hiển thị khách */, internalNote?, reasonCode?, markReturned?: boolean, markRefused?: boolean, eventKind, eventDetail, emailTemplate }`. Thân hàm: khoá dòng đơn -> `UPDATE orders SET status='cancelled', cancelled_at, cancelled_by, cancel_reason, [cancel_reason_code, cancel_note], [stock_restored_at = $now nếu restoreStock], [returned_from_transit = true nếu markReturned], [delivery_refused_at = $now nếu markRefused], active_tracking_number = NULL WHERE order_id AND status = ANY(allowedFrom) AND stock_restored_at IS NULL RETURNING ...` -> trả voucher (giữ nguyên truy vấn hiện có) -> **nếu `restoreStock`**: cộng tồn từng dòng theo `variant_id` -> `insertOrderEvent`. Khác Slice 3: `stock_restored_at` chỉ đặt khi thật sự hoàn (huỷ từ `to_receive` để NULL tới khi T11). `restockReturnedTx` làm riêng T11: `UPDATE orders SET stock_restored_at=$now, return_handled_at, return_decision='restocked' ... WHERE returned_from_transit AND return_handled_at IS NULL AND stock_restored_at IS NULL` rồi cộng tồn.
Khách (`cancelByCustomer`): `to_pay` -> `cancelOrderTx` như cũ; `to_ship` -> nếu `toShipCancelMode = 'request'` gọi `requestCancelTx` (C1) và **không** gửi email "đã huỷ" (không có thư cho yêu cầu); nếu `'direct'` -> `cancelOrderTx` như Slice 3. Khoá dòng đơn dùng chung với admin nên AC-ADM-40 (khách yêu cầu đua nhân viên bàn giao) chỉ có một bên thắng: bên thua thấy trạng thái đã đổi -> khách `not-cancellable`, nhân viên `order-state-changed`.

### 6.5 Bảo vệ "tối đa 1 hiệu ứng phụ"
Tồn: `stock_restored_at` (một dấu cho mọi đường) + khoá dòng + `WHERE ... IS NULL`. Voucher: `released_at IS NULL` trong `UPDATE ... RETURNING` (hiện có), `used_count - 1` chỉ cho dòng thực sự đổi. Thư: mỗi sự kiện tối đa một lần gửi nhờ CAS `email_attempts` (mục 8). Hoàn kho xảy ra trong **cùng** giao dịch với đổi trạng thái nên không có trạng thái "đã huỷ nhưng chưa cộng" nhìn thấy được.

### 6.6 DTO khách (BR-ADM-12, 33)
`toOrderDto` đổi: `timeline` chỉ lấy sự kiện kind in (`placed`, `payment_received`, `shipped`, `delivered`, `cancel_requested`, `cancel_approved`, `cancel_rejected`, `cancelled`) (sự kiện cũ `kind NULL` đi theo suy luận mục 2); mỗi dòng thêm `actor` = `customer` nếu `actor = customer`, ngược lại `nine2fine`; `detail` = `detail` đã làm sạch (không đọc `internal_note`, `cancel_note`, `reason_code`); tiêu đề: `shipped` "Đang vận chuyển" (+ `detail` = "<đơn vị> - <mã>"), `delivered` "Giao hàng thành công", `cancel_requested` "Đã gửi yêu cầu huỷ", `cancel_rejected` "Yêu cầu huỷ chưa được chấp nhận". Thêm `shipment`, `deliveredAt`, `cancelRequest` (`outcome`: `pending` khi `status = cancel_requested`; `rejected` / `approved` theo cột), `cancelMode` (`cancel` ở `to_pay`, `request` ở `to_ship` khi `toShipCancelMode = 'request'` và chưa có `cancel_requested_at`), `canCancel` = `cancelMode` tồn tại. Không bao giờ có `userId`, `confirmed_by`, `handed_over_by`, tên nhân viên. Test T-ADM-12 serialize toàn bộ JSON và khẳng định không chứa email / tên / UUID nhân viên, `internal_note`, `cancel_note`.

## 7. Danh sách, đếm, tìm kiếm (`order-admin.query.ts`)

Một hàm dựng `WHERE` dùng chung cho `list` và `counts` (nên số đếm luôn khớp), tham số hoá bằng `Prisma.sql`; không nối chuỗi người dùng. `from`/`to`: `created_at >= vnStartOfDay(from) AND created_at < vnStartOfDay(to + 1 ngày)` (GMT+7, UTC + 7h; AC-ADM-08 đơn 00:30 GMT+7 ngày 08 = 17:30Z ngày 07). `payment`: `payment_method = $` (map `bank-transfer` <-> `bank_transfer`).

Biểu thức tab (mỗi đơn đúng một; `needsCall` = `payment_method='cod' AND status='to_ship' AND needs_confirm_call AND confirmed_at IS NULL`):
| view | điều kiện |
| --- | --- |
| `pending-payment` | `status = 'to_pay'` |
| `to-confirm` | `needsCall` |
| `to-fulfil` | `status = 'to_ship' AND NOT needsCall` |
| `in-transit` | `status = 'to_receive'` |
| `cancel-requests` | `status = 'cancel_requested'` |
| `returning` | `status = 'cancelled' AND returned_from_transit AND return_handled_at IS NULL` |
| `completed` | `status = 'completed'` |
| `cancelled` | `status = 'cancelled' AND NOT (returned_from_transit AND return_handled_at IS NULL)` |

Counts: một truy vấn `COUNT(*) FILTER (WHERE <tab>)` x8 + `COUNT(*)` (đảm bảo tổng 8 tab = `all` bằng test đối chiếu). Ở `to_ship` mà đơn không cần gọi do `payment_method = bank_transfer`: rơi vào `to-fulfil` (đúng định nghĩa).

Tìm `q` (sau trim, `char_length > 100` -> 422 `field: q`; rỗng bỏ qua): OR của (1) mã: bỏ `#`, chữ hoa, nếu độ dài >= 6 -> `code LIKE $upper || '%'` (thoát `\ % _`); (2) SĐT: bỏ khoảng trắng / `.`/`-`, `+84` / `84` đầu -> `0`; nếu toàn chữ số và >= 4 -> `recipient_phone LIKE '%' || $d || '%'`; (3) email: `email LIKE '%' || lower($q) || '%'` (cột đã chữ thường); (4) tên: bỏ dấu cả hai phía bằng `translate()` (`foldViSql(recipient_name) LIKE '%' || foldVi($q) || '%'`, hằng bảng ánh xạ `àáảãạăắằ... -> a`, `đ -> d`, có `lower()`). Mọi `LIKE` dùng `ESCAPE '\'` và thoát `%`, `_`, `\` từ `q` (nên `q = '%'` khớp 0 đơn, AC-ADM-06). Không dùng extension (`unaccent`) hay thêm cột (không UPDATE dữ liệu cũ); chi phí quét tuần tự chấp nhận ở quy mô đồ án, kèm cảnh báo ở mục 15 R2.

`list`: `ORDER BY created_at DESC, code DESC LIMIT $limit OFFSET (page-1)*$limit` + `COUNT(*)` cùng `WHERE`; mỗi dòng cần `itemCount` = `SUM(order_items.quantity)` (subquery tương quan hoặc `LEFT JOIN LATERAL`), `tab` tính bằng `CASE` cùng biểu thức, `overdue` tính ở mapper (Should). Danh sách **không** tải `events`.

## 8. Email (5 thư, BR-ADM-21, 23, 28, 30, 31, 35; mailer có sẵn, text thuần)

Thêm vào `mail/order-templates.ts` (cùng `orderBlock`, `footer` có câu chống lừa đảo của BR-CHK-28 và hotline):
| `email_template` | Sự kiện | Tiêu đề | Nội dung riêng |
| --- | --- | --- | --- |
| `order-shipped` | T3 | nine2fine – Đơn #{mã} đã được giao cho đơn vị vận chuyển | mã đơn, đơn vị, mã vận đơn, ngày giao dự kiến (`estimatedFrom-To`), tổng thanh toán (COD: số tiền shipper thu), người nhận + địa chỉ, link xem / tra cứu |
| `order-delivered` | T4 | nine2fine – Đơn #{mã} đã giao thành công | mã, ngày giao (`deliveredAt` giờ VN), sản phẩm, tổng; link chính sách đổi trả; hotline; **không** lời mời đánh giá |
| `order-cancelled-shop` | T5-T10, T6a | nine2fine – Đơn #{mã} đã huỷ (cùng khuôn `orderCancelledMail`) | câu chuẩn theo `reason_code` (S4-Q7): `unreachable` "Chúng tôi không liên lạc được với bạn để xác nhận đơn.", `declined_on_call` "Bạn đã báo không muốn nhận đơn.", `refused` "Đơn không được nhận khi giao hàng.", `undeliverable` "Giao hàng không thành công.", `customer_request` "Đơn đã được huỷ theo yêu cầu của bạn.", `other` "nine2fine không thể thực hiện đơn này."; **COD: không có đoạn hoàn tiền**; không in `cancel_note` |
| `cancel-approved` | T13 | nine2fine – Yêu cầu huỷ đơn #{mã} đã được duyệt | đơn đã huỷ, tồn trả, không có thông tin hoàn tiền (COD) |
| `cancel-rejected` | T14 | nine2fine – Yêu cầu huỷ đơn #{mã} chưa được chấp nhận | lý do từ chối, đơn vẫn được xử lý và giao, hotline, hướng dẫn gọi nếu vẫn muốn huỷ |

Gửi (BR-ADM-35): `insertOrderEvent` đặt `email_template` trong **cùng giao dịch**; sau commit `scheduleEventEmail(eventId)` qua `runInBackground`: lần 1 ngay, lần 2 sau 10 giây, lần 3 sau 60 giây (tổng < 5 phút). Mỗi lần: CAS `UPDATE order_events SET email_attempts = email_attempts + 1 WHERE event_id = $ AND email_sent_at IS NULL AND email_attempts = $n RETURNING 1` (ai thắng CAS mới gửi, nên job bù và gửi nền không trùng) -> `sendMail` -> thành công `email_sent_at = $now`. Sau lần 3 lỗi: một thư tới `config.supportEmail` ("Không gửi được email đơn {mã}", **không** kèm email khách) rồi dừng (`email_attempts = 3`). Job nền (60 giây) `retryPendingEventEmails($now)`: sự kiện `email_template IS NOT NULL AND email_sent_at IS NULL AND email_attempts < 3 AND at BETWEEN $now - 1h AND $now - 2 minutes` (bù tiến trình chết sau commit). Lỗi SMTP **không** đổi trạng thái đơn (AC-ADM-43). Giới hạn đã biết: tiến trình chết đúng giữa `sendMail` thành công và ghi `email_sent_at` có thể gửi trùng một thư (chấp nhận, hiếm; ưu tiên không mất thư). Log chỉ có mã đơn, `eventId`, tên lỗi; không email, SĐT, nội dung.

## 9. Giới hạn tần suất, bảo mật (BR-ADM-41, BR-ADM-01..03)

- `createRateLimit` thêm `key?: (req) => string` (mặc định IP). `adminReadLimit` = 120 / 60 giây, `adminWriteLimit` = 60 / 60 giây, khoá = `req.auth.user.user_id` (gắn **sau** `requireAuth`, nên 401 không đốt bộ đếm; bộ đếm RAM riêng, hết khi khởi động lại: chấp nhận như R10 Slice 3). `GET` đếm đọc, `POST` đếm ghi. Vượt -> `429 rate-limited` + `Retry-After`. Duyệt 20 đơn liên tiếp không chạm (AC-ADM-49). Đăng nhập admin tiếp tục dùng bộ đếm auth hiện có.
- `Cache-Control: no-store` bằng `noStore` đặt **trước** `requireAuth` nên có cả ở `401` (AC-ADM-01).
- Quyền đọc từ DB mỗi yêu cầu (hiện có). Staff thấy SĐT / email đầy đủ (S4-Q9); không có API khác lộ dữ liệu khách.
- Log: không ghi `note`, email, SĐT, tên người nhận; chỉ mã đơn, hành động, `userId` nhân viên (nội bộ).
- Không thêm thư viện (R12 Slice 3 giữ nguyên): zod, @prisma/client, nodemailer, vitest, supertest, `node:crypto`.

## 10. Seed

Không đổi seed Slice 3. Tài khoản staff / admin đã có ở `prisma/seed.ts` (decisions 2026-11-07: `admin@nine2fine.test`, `staff@nine2fine.test`, mật khẩu `SEED_*_PASSWORD`); chạy `npm run seed` trên Supabase nếu chưa có (không ghi đè user có sẵn). Test **không** phụ thuộc seed: `createUser({ role: 'staff' | 'admin' })` (đã có trong `test/helpers.ts`) + `loginStaff()` / `loginAdmin()` qua `POST /admin/auth/login`. Dữ liệu thử đơn tạo bằng `makeOrder(...)` (Prisma + SQL, cho phép đặt `status`, `needs_confirm_call`, `confirmed_at`, `created_at`, tồn đã trừ), không đi qua `POST /orders` trừ test tích hợp (T-ADM-60). Không seed đơn mẫu vào Supabase; nghiệm thu 4.7 dùng đơn thật.

## 11. Test (vitest + supertest, DB cục bộ; chốt chặn như Slice 3)

`resetCheckout()` mở rộng không cần đổi (TRUNCATE đã gồm `orders`, `order_events`). Đồng thời: `connection_limit >= 10`; Promise.all hai yêu cầu supertest song song (lặp 20 lần theo AC), mỗi lần đơn mới. Đồng hồ giả `useClock` cho cửa sổ 24 giờ, giờ làm việc; thư `setMailTransport(fake)` + `flushMail()`.

| Mã test | Nội dung | AC |
| --- | --- | --- |
| T-ADM-01 | Không cookie / `n2f_asid` hết hạn / thu hồi / chỉ có `n2f_sid`: `GET` list, `GET` detail, `POST` hành động đều 401 `unauthenticated`, không có dữ liệu đơn, `Cache-Control: no-store`; đơn không đổi | 01 (AUTH-84) |
| T-ADM-02 | staff `cancel other` 403 (đơn / sự kiện không đổi); staff `ship` 200; staff `cancel customer_request` 200; admin `cancel other` 200; kiểm quyền xảy ra trước 404 / trạng thái | 02 (AUTH-85) |
| T-ADM-03 | Vai trò đọc lại mỗi yêu cầu (cùng cookie, không đăng nhập lại): SQL hạ admin -> staff: `cancel other` 403 `forbidden` (đơn / sự kiện không đổi) và `GET` danh sách vẫn 200; SQL `is_active = false`: `GET` danh sách 401 `unauthenticated`, không có dữ liệu đơn. **Không** kiểm xoá dòng `sessions` / cookie (-> slice Admin người dùng, AC-AUTH-75) | 03 |
| T-ADM-04 | `allowedActions`: staff không có `cancel-other`, admin có; theo trạng thái / điều kiện (chưa xác nhận: không có `ship`; < 3 lần gọi: không có `cancel-unreachable`) | 04, 09 |
| T-ADM-05 | Phân trang: 45 đơn: mặc định 20, `page=3` = 5, `page=9` rỗng `total 45`, `limit=51` / `0` -> 422 `field: limit`; phản hồi có `page`, `limit` (không có `pageSize`) | 05 |
| T-ADM-06 | `q`: mã đủ / `#` / tiền tố 8 ký tự, SĐT `0912...`, `+84912...`, `5678`, email hoa, tên không dấu, `%` -> 0, 101 ký tự -> 422, rỗng -> tất cả | 06 |
| T-ADM-07 | Counts khớp danh sách ở mọi tab; tổng 8 tab = `all`; sau `confirm`: `to-confirm` giảm 1, `to-fulfil` tăng 1; counts có bộ lọc khớp list có bộ lọc | 07 |
| T-ADM-08 | Lọc ngày GMT+7 biên (00:30 và 23:59 hôm trước), `payment`, `from > to` 422, kết hợp AND với `view` + `q` | 08 |
| T-ADM-09 | Chi tiết đủ trường (dòng, voucher, địa chỉ, ghi chú, `confirmation`, `shipment`), mã `#`/hoa thường, mã lạ 404 | 09 |
| T-ADM-10 | Timeline: mỗi thao tác đúng 1 dòng, mới nhất trước, người "tên (vai trò)", dòng đặt hàng là Khách; `PUT`/`DELETE` sự kiện / đơn -> 404/405, số sự kiện không đổi | 10 |
| T-ADM-11 | Lỗi chèn giữa bước cộng tồn (huỷ `declined_on_call`, `other`): 5xx, trạng thái / tồn / voucher / sự kiện / thư không đổi; bỏ lỗi, làm lại 200, đủ 1 sự kiện | 11 |
| T-ADM-12 | DTO khách: tra cứu OTP và đơn thành viên: có đặt hàng + đang vận chuyển (đơn vị + mã), không lần gọi, ghi chú, tên nhân viên; `actor = nine2fine`; JSON không chứa UUID / email nhân viên | 12, 41 |
| T-ADM-13 | 5 cặp sai trạng thái (`completed` huỷ other; `cancelled` ship; `to_receive` confirm; `to_ship` deliver; `to_pay` ship): 409 `invalid-transition` + `currentStatus`; DB / tồn / voucher / sự kiện / thư không đổi | 13 |
| T-ADM-14 | Hai `approve` đồng thời x20: mỗi lần 1x200 + 1x409 `order-state-changed`; tồn đúng +2 (không +4); 1 sự kiện; 1 email; voucher trả 1 lần | 14 |
| T-ADM-15 | `approve` vs `reject` đồng thời x20: một bên thắng, trạng thái cuối khớp, đúng 1 thư đúng loại | 15 |
| T-ADM-16 | NV1 `ship` sau khi NV2 đã `ship`: 409 `order-state-changed` kèm `order` (`to_receive`); không sự kiện / thư thứ hai; hai `ship` song song cùng đơn khác: 1 sự kiện | 16 |
| T-ADM-17 | `Idempotency-Key`: cùng khoá + body -> 200 `Idempotency-Replayed: true`, không sự kiện / thư mới; khác body hoặc khác người -> 409 `idempotency-conflict`; lỗi 4xx không lưu khoá; hai request cùng khoá song song: 1 thực hiện | 17 |
| T-ADM-18 | `call-attempts`: A hợp lệ nhiều lần (250 / 251 ký tự), vẫn `to_ship` và `to-confirm`; đơn không cần gọi, đã xác nhận, `completed`: 409 | 18 |
| T-ADM-19 | `confirm`: lưu giờ + người, vẫn `to_ship`, sang `to-fulfil`; lần hai 409 | 19 |
| T-ADM-20 | `unreachable` (đồng hồ giả, `call_attempt` chèn bằng SQL): 2 lần -> 409 `condition-not-met`; (t, t+23h, t+25h) -> 409; 3 lần trong 2 giờ -> 200; (t, t+30h, t+31h, t+32h) -> 200; **biên**: (t, t+12h, t+24h00m00s) -> 200, (t, t+12h, t+24h01m) -> 409 `condition-not-met`; sau 409 `allowedActions` không có `cancel-unreachable`, đơn vẫn `to_ship` | 20 |
| T-ADM-21 | `unreachable` thành công: `cancelled`, `cancelledBy shop`, `pending`, tồn +2, voucher trả, email có câu chuẩn, `delivery_refused_at` NULL | 21 |
| T-ADM-22 | `declined_on_call`: chưa xác nhận 200 (tồn hoàn, email); đã xác nhận 409; đơn không cần gọi 409 | 22 |
| T-ADM-23 | `ship` validate: carrier 1 / 51, mã 3 / `ab c!` / 41 ký tự, mã trùng đơn chưa huỷ -> 422 đúng `field`; mã trùng đơn đã huỷ hợp lệ; `P2002` được dịch thành 422 | 23 |
| T-ADM-24 | `ship`: chưa xác nhận -> 409 `condition-not-met`; xác nhận hoặc không cần gọi -> 200, mã `GHTK-12345` chữ hoa, `handed_over_at`, tồn không đổi, `pending`, ngày dự kiến không đổi; lần hai 409 | 24 |
| T-ADM-25 | Email `order-shipped`: tiêu đề, đơn vị, mã, ngày dự kiến, tổng, địa chỉ, chống lừa đảo; hai `ship` song song -> 1 thư (thư Gmail thật ở nghiệm thu 4.7) | 25 |
| T-ADM-26 | `deliver`: `completed` + `paid` + `paid_at`/`delivered_at` (GMT+7), 1 sự kiện; lần hai 409; `to_ship` 409 | 26 |
| T-ADM-27 | `completed`: admin `cancel`/`ship`/`approve` 409 `invalid-transition`; khách cancel 409 `not-cancellable` | 27 |
| T-ADM-28 | Email `order-delivered`: đủ mục, không lời mời đánh giá | 28 |
| T-ADM-29 | Ma trận lý do x trạng thái: `refused`/`undeliverable` ở `to_ship` và `unreachable` ở `to_receive` 409; `other` note rỗng / 4 / 251 -> 422, 5 -> 200 ở `to_ship` và `to_receive`, `cancelledBy shop` | 29 |
| T-ADM-30 | Hoàn kho nhiều dòng (blazer Đen/S x2, off-duty-top x1, weekend-shirt x1): cộng đúng từng biến thể; voucher còn hạn trả, `TEXP` hết hạn sau khi đặt không trả; `stock_restored_at`; huỷ lần hai (mọi đường: admin, khách `to_pay`, hết hạn) 409, tồn không đổi | 30 |
| T-ADM-31 | `refused` từ `to_receive`: `cancelled`, `delivery_refused_at`, tồn vẫn 3, voucher trả, tab `returning`, email câu chuẩn | 31 |
| T-ADM-32 | 2 đơn `refused` cùng SĐT -> `quote` COD khoá (`too-many-refusals`, dữ liệu thật); `undeliverable` / `other` không tính; SĐT khác COD mở | 32 |
| T-ADM-33 | `restocked`: tồn +2, `return_handled_at`, vẫn `cancelled`, 1 sự kiện; lần hai 409; hai NV đồng thời x20: đúng 1 thành công, không +4 | 33 |
| T-ADM-34 | `written_off`: note rỗng / 4 -> 422, 5 -> 200 tồn không đổi, rời `returning` sang `cancelled`; `restocked` trên đơn đã hoàn kho từ `to_ship`: 409; `written_off` rồi `restocked`: 409 | 34 |
| T-ADM-35 | Email `order-cancelled-shop` `other` với note "nội bộ: lệch kho": không chứa "lệch kho", có câu chuẩn, không đoạn hoàn tiền | 35 |
| T-ADM-36 | Khách `to_ship` huỷ: reason 250 -> 200 `cancel_requested` (tồn, voucher, thanh toán không đổi, `cancelRequest.outcome pending`); 251 -> 422; lần hai 409 `not-cancellable`; tab `cancel-requests` | 36 |
| T-ADM-37 | Khách `to_pay` huỷ thẳng; `to_receive` 409; khách OTP `to_ship` -> `cancel_requested`; cờ `toShipCancelMode = 'direct'` giữ hành vi Slice 3 (cập nhật AC-CHK-29 dòng `to_ship`) | 37 |
| T-ADM-38 | `approve`: `cancelled`, `cancelledBy customer`, sự kiện ghi tên NV, tồn +, voucher trả, `payment` không đổi, email đã duyệt; lần hai 409 | 38 |
| T-ADM-39 | `reject`: reason rỗng / 4 -> 422, 5 -> 200 `to_ship` giữ trạng thái xác nhận, tồn không đổi, email có lý do + hotline; khách yêu cầu mới 409 `not-cancellable` | 39 |
| T-ADM-40 | `cancel_requested`: call-attempt / confirm / ship / deliver / cancel other 409 `invalid-transition`; đua khách yêu cầu vs NV `ship` x20: 1 bên thắng, không có đơn vừa `to_receive` vừa có yêu cầu huỷ | 40 |
| T-ADM-42 | Bảng mã lỗi: mỗi tình huống đúng `code` + HTTP, không stack trace / SQL; DB tắt -> 500 `unavailable` | 42 |
| T-ADM-43 | SMTP lỗi: `ship` vẫn 200 `to_receive`; thử lại 3 lần; thư báo CSKH không kèm email khách; log không có email đầy đủ; `retryPendingEventEmails` bù | 43 |
| T-ADM-45 | Migration: áp lên DB đã có 6 migration + đơn Slice 3 (kể cả `cancelled`): không DROP/TRUNCATE/DELETE, lần 2 không đổi; đơn cũ hiện timeline "Khách"/"Hệ thống"; huỷ lại 409 | 45 |
| T-ADM-46 | `notes` 500 ký tự 200 (1 sự kiện, không có trong API khách), 501 -> 422 | 46 (Should) |
| T-ADM-48 | Cờ `overdue`: cần gọi 3 giờ làm việc, `cancel_requested` 25 giờ, `to_receive` quá `estimated_to`; trong hạn không có cờ; `addWorkingHours` đơn vị test riêng (qua Chủ nhật, 18:00) | 48 (Should) |
| T-ADM-49 | Rate limit: 121 `GET` / 60 giây và 61 `POST` / 60 giây của một tài khoản -> 429 + `retryAfterSeconds`; duyệt 20 đơn liên tiếp không bị chặn; tài khoản khác không bị ảnh hưởng | 49 (Should) |
| T-ADM-50 | `customer_request`: note rỗng / 4 / 251 -> 422 `field: note`, 5 -> 200 cho đơn chưa xác nhận, đã xác nhận, không cần gọi (staff và admin): `cancelled`, `cancelledBy customer`, tồn hoàn đúng 1 lần, voucher trả, `payment pending`, 1 sự kiện ghi tên + vai trò NV, `delivery_refused_at` NULL (COD không bị khoá: `quote` cùng SĐT vẫn mở), email có "Đơn đã được huỷ theo yêu cầu của bạn." và không chứa note; `to_receive` và `cancel_requested` -> 409 `invalid-transition`; lần hai 409; `allowedActions` có `cancel-customer-request` ở mọi `to_ship` | 50 |
| T-ADM-60 | Tích hợp: `POST /orders` COD cần gọi -> call-attempt x3 -> `unreachable`; và đặt -> confirm -> ship -> deliver; tồn khớp DB sau mỗi bước | 21, 24, 26 |
| T-ADM-90 | Schema: CHECK/UNIQUE mới (mã vận đơn trùng đơn chưa huỷ bị chặn, `delivered_at` chỉ ở `completed`, `cancel_requested` cần `cancel_requested_at`...); mọi bảng còn RLS; `active_tracking_number` NULL sau huỷ | 45 |

AC chỉ có phần FE / thật: AC-ADM-04 (menu, "Chưa khả dụng", không gọi API khác), 15 (FE hiện câu "Đơn vừa được cập nhật bởi người khác." và bấm đúp một request), 17 (chặn mạng, Thử lại), 41 (nhãn storefront), 44 (cờ `adminOrdersMode`, Playwright `admin` mock pass nguyên), 47 (in phiếu): Playwright mock `*.spec.ts` + kiểm tay; AC-ADM-25, 28, 35 và hai nhánh thật của mục 6 PRD: nghiệm thu 4.7 trên Supabase + Gmail.

## 12. Thứ tự làm (theo lát backlog)

1. **4.1 Nền**: migration + Prisma + `lib/errors.ts` (3 mã, `currentStatus`, `order`) + `noStore` + `app.ts` mount + rate limit key + `ADMIN_ASSUMPTIONS`; `order-event.ts` (`insertOrderEvent`, **sửa mọi nơi hiện đang `INSERT INTO order_events`** để đi qua nó và đặt `kind`); test T-ADM-01..03, 45, 90. FE: cờ, đăng nhập HTTP, menu, "Chưa khả dụng", ma trận quyền.
2. **4.2 Đọc**: `order-admin.query.ts`, `order-admin.mapper.ts`, `GET list / counts / detail`, DTO khách (6.6); T-ADM-04..10, 12, 41-phần BE.
3. **4.3 Gọi xác nhận + dịch vụ huỷ dùng chung**: refactor `cancelOrderTx` (6.4) giữ nguyên test Slice 3 xanh; `runAction`; T1, T2, T5, T6, T6a, T9; T-ADM-11, 13, 18-22, 29-30, 50.
4. **4.4 Bàn giao, giao xong, hàng hoàn**: T3, T4, T7, T8, T10-T12; email `order-shipped`, `order-delivered`, `order-cancelled-shop`; T-ADM-16, 17, 23-28, 31-35, 43.
5. **4.5 Yêu cầu huỷ** (S4-Q1 đã trả lời; phát hành `toShipCancelMode: 'request'`; không còn bị chặn bởi câu hỏi, chỉ đi sau 4.3 / 4.4): C1, T13, T14, `toShipCancelMode`, email 2 mẫu; T-ADM-14, 15, 36-40. Đồng thời sửa `assumptions.ts` (mục 14) và FE storefront.
6. **4.6 Should**: `notes`, `overdue`, rate limit; T-ADM-46, 48, 49.
7. **4.7 Nghiệm thu thật**: Orchestrator / Thắng chạy `migrate deploy` hai lần, hai nhánh đơn thật.

Mỗi lát: `tsc --noEmit` và `npm test` pass (M-1 vitest crash: chạy 3 lần liên tiếp theo ghi chú handoff).

## 13. Điểm FE phải đổi (admin FE đang là mock, chỉ đọc code FE; việc của frontend-dev)

1. **Cờ cấu hình**: thêm `adminOrdersMode: 'mock' | 'http'` vào `ApiConfig` (`core/api-config.ts`, `api-config.e2e.ts` giữ `mock`), độc lập `mode`, `authMode`... `admin-providers.ts`: `bind()` nhận khoá `'adminOrdersMode'`; `ADMIN_ORDERS_API` -> `HttpAdminOrdersApi` khi `http`. Cần `authMode = 'http'` (admin login thật, cookie `n2f_asid`): cấu hình `adminOrdersMode: http` + `authMode: mock` là sai (không có cookie) - FE `console.warn`/chặn khi khởi động. Các `ADMIN_*_API` khác không đổi (vẫn `mode`).
2. **`HttpAdminOrdersApi`**: `GET /admin/orders` (`view`, `q`, `payment`, `from`, `to`, `page`, `limit`; không dùng `pageSize`), `GET /admin/orders/counts` (badge tab), `GET /admin/orders/{code}`, 9 hành động `POST` (mỗi lần mang `X-Requested-With: n2f` qua interceptor có sẵn, `withCredentials`, `expectedStatus` lấy từ đơn đang hiển thị, `Idempotency-Key` sinh một lần mỗi ý định và dùng lại khi Thử lại). Lỗi đọc theo `error.code` (BR-ADM-34): `order-state-changed` -> thay đơn bằng `error.order`, toast "Đơn vừa được cập nhật bởi người khác."; `invalid-transition` / `condition-not-met` -> tải lại đơn; `forbidden` -> ẩn nút; `unauthenticated` -> `/admin/login`; `rate-limited` -> `retryAfterSeconds`; mất mạng / 5xx -> giữ dữ liệu đã nhập, "Thử lại" **tải lại đơn trước** (BR-ADM-15). Không cập nhật lạc quan; nút khoá tới khi có kết quả.
3. **Ánh xạ trạng thái** (K1; API giữ 6 trạng thái, FE `OrderStatus` mock có 11):
   | API (`status` + dữ liệu) | FE `OrderStatus` | Nhãn |
   | --- | --- | --- |
   | `to_pay` | `pending-payment` | Chờ thanh toán |
   | `to_ship` + `tab = to-confirm` (`needsCall`) | `pending-confirmation` | Chờ xác nhận |
   | `to_ship` còn lại | `processing` | Đang chuẩn bị |
   | `to_receive` | `shipping` | Đang vận chuyển |
   | `completed` | `completed` | Hoàn thành |
   | `cancel_requested` | **thêm** `cancel-requested` (cả storefront `order-status.ts` và `ORDER_TONES` admin, tone `warning`) | Chờ duyệt huỷ |
   | `cancelled` | `cancelled` | Đã huỷ; tab `returning` (`returnHandling.state = pending`) hiện thêm huy hiệu "Hàng hoàn chờ xử lý" |
   | (bỏ ở HTTP) | `delivering`, `delivery-failed`, `returned-to-sender`, `return-requested`, `returned` | không hiện ở filter / badge |
4. **Ánh xạ thanh toán** (K2; `PaymentState` mock = `paid/unpaid/cod/refunded/void`): COD + `pending` + chưa huỷ -> `cod` ("Thu khi giao"); `paid` -> `paid`; `bank_transfer` + `pending` (`to_pay`) -> `unpaid`; `cancelled` + COD + `pending` -> `void` ("Không thu tiền"); `refunded` / `partially_refunded` -> `refunded`; `failed` -> `unpaid`. Phương thức: API `bank-transfer` = FE `bank-transfer` (không có `card`).
5. **Tab danh sách**: giữ các tab cần thiết ánh xạ 1-1 vào `view`: `all`, `pending-payment`, `to-confirm` ("Cần gọi"), `to-fulfil`, `in-transit`, `cancel-requests`, `returning`, `completed`, `cancelled`; badge lấy từ `/counts`. Bộ lọc `payment`, ngày `from/to` (GMT+7), ô tìm `q` (<= 100 ký tự, debounce).
6. **Hành động**: nút lấy từ `allowedActions`, không tự suy: `call-attempt`, `confirm`, `ship` (hộp thoại đơn vị + mã vận đơn; **bỏ `estimatedAt`** của `ShipInput` mock, K5; gợi ý GHN/GHTK/Viettel Post/J&T nhưng nhập tự do), `deliver`, `cancel-*` (hộp thoại chọn lý do theo `allowedActions`, ghi chú bắt buộc khi `other` và `customer_request`), `restock` / `write-off`, `approve-cancel` / `reject-cancel` (lý do), `add-note`, `print-slip`. Xoá các hành động mock không còn trong API (đổi địa chỉ, sửa dòng hàng, trả hàng, delivering...): ẩn ở `http`.
7. **Chi tiết**: timeline từ `timeline` (mới nhất trước; `actor.type`/`name`/`role`; `note` nội bộ); khối "Vận chuyển" (`shipment`), "Xác nhận" (`confirmation`), "Yêu cầu huỷ" (`cancelRequest`), "Hàng hoàn" (`returnHandling`), "Cuộc gọi" (`callAttempts.inFirstDay` / 3); cờ `overdue`.
8. **`permissions.ts` (ma trận)**: staff **thêm** `orders.cancel` (năm lý do cố định, gồm `customer_request`) - hiện staff không có; admin có thêm quyền **mới** `orders.cancel-other` (huỷ lý do khác). `orders.process` bao gồm ghi cuộc gọi / xác nhận / bàn giao / giao xong / hàng hoàn / duyệt-từ chối. `returns.process`, `orders.export`: giữ nhưng ẩn ở `http` (Won't). Cập nhật `PERMISSION_MATRIX` (màn Cài đặt vẫn mock): dòng "Hủy đơn" cho cả hai vai trò, thêm dòng "Hủy đơn với lý do khác" chỉ admin. Đây chỉ là trải nghiệm: máy chủ mới là chốt chặn (BR-ADM-04).
9. **Route và menu ở HTTP** (BR-ADM-36, AC-ADM-04, 44): `/admin` -> `/admin/orders`; menu chỉ "Đơn hàng"; mọi route admin khác (dashboard, products, inventory, customers, promotions, reports, content, settings, returns) -> trang "Chưa khả dụng" **không** inject mock API nào nên không có dữ liệu mock và không request nào khác ngoài `/api/admin/auth/*` và `/api/admin/orders/*`; tìm kiếm toàn cục (`ADMIN_SEARCH_API`) ẩn. `mock` giữ nguyên hành vi hiện tại (số test Playwright `admin.spec.ts` pass không giảm).
10. **Storefront** (BR-ADM-33; phần 4.5): `cancel_requested` -> "Đang chờ duyệt huỷ" + "Đã gửi yêu cầu huỷ", ẩn nút Huỷ; `to_receive` -> "Đang vận chuyển" + `shipment.carrier` + `trackingNumber`; `completed` -> "Hoàn thành"; nút ở `to_ship` ghi "Gửi yêu cầu huỷ" khi `cancelMode = 'request'`; `cancelRequest.outcome = rejected` -> không có nút, câu "Yêu cầu huỷ chưa được chấp nhận" + `rejectReason` + hướng dẫn gọi hotline (S4-Q6). `mapOrderStatus` (Slice 3 mục 8.9) thêm `cancel_requested` -> `cancel-requested`. Timeline khách hiện `actor = nine2fine` / "Khách".
11. **Tài khoản demo**: dùng tài khoản seed BE (`admin@nine2fine.test`, `staff@nine2fine.test`), không `@nine2fine.vn` của mock (K9).

## 14. Thay đổi phần Slice 3 (locked 2026-11-08 cùng Slice 4)

| # | Chỗ | Loại | Chi tiết |
| --- | --- | --- | --- |
| 1 | `POST /orders/{orderCode}/cancel` | **Đổi hành vi** (S4-Q1) | `to_ship` -> `cancel_requested` thay vì huỷ ngay; thêm `409 not-cancellable` cho yêu cầu thứ hai / sau từ chối. Thay giả định chờ Thắng số 4 của Slice 3. Phát hành ở lát 4.5 qua `ASSUMPTIONS.toShipCancelMode` |
| 2 | `Order` | Cộng thêm (tuỳ chọn) | `shipment`, `deliveredAt`, `cancelRequest`, `cancelMode`; `canCancel` nới nghĩa ("`to_ship` chưa từng yêu cầu") |
| 3 | `OrderTimelineEntry` | Cộng thêm | `actor: customer \| nine2fine` (tuỳ chọn); `Order.timeline` ở Slice 4 chỉ gồm các lần đổi trạng thái |
| 4 | `OrderStatus.cancel_requested` | Nay xuất hiện thật | không đổi enum; mô tả cũ "(FE thêm)" thành hiện thực |
| 5 | `Order.cancelReason` | Làm rõ | đơn huỷ do shop: câu chuẩn cho khách, không phải ghi chú nội bộ |
| 6 | `ErrorCode` | Cộng thêm 3 mã | `invalid-transition`, `order-state-changed`, `condition-not-met` (cần dòng mới ở `docs/decisions.md` như tiền lệ Slice 3) |
| 7 | `ErrorResponse.error` | Cộng thêm 2 trường | `currentStatus`, `order` (`AdminOrder`) |

`backend/src/config/assumptions.ts`:
- **Q4 của Slice 3** (khối chú thích đầu file + `customerCancellableFrom: ['to_pay', 'to_ship']`): thay bằng `toShipCancelMode: 'direct' | 'request'` (mặc định phát hành `'request'` cùng lát 4.5; trước lát 4.5 code giữ `'direct'` để storefront không đổi hành vi sớm; dùng ở `cancelByCustomer` và `toOrderDto.cancelMode/canCancel`) và `customerDirectCancelFrom: ['to_pay']`. Cập nhật chú thích: "Q4 (Slice 3) -> thay bởi S4-Q1". **Đặt tên:** PRD Slice 3 đánh số "Q4" cho huỷ `to_ship`, PRD Slice 4 dùng "Q4" cho phân quyền; code dùng tiền tố `S4-` để khỏi nhầm.
- Thêm `ADMIN_ASSUMPTIONS` (mục 0).
- `systemCancellableFrom: ['to_pay']` giữ nguyên.

**`delivery_refused_at` nay được ghi** (BR-ADM-26, K7): chỉ ở T7 (`refused`) trong `cancelOrderTx` (`markRefused`), trong cùng giao dịch với đổi trạng thái; `quote.service.ts` đã đọc cột này (đếm `delivery_refused_at > $now - 6 tháng`, theo SĐT) nên **không đổi code**; AC-CHK-24 lần đầu kiểm được dữ liệu thật (T-ADM-32). Hoàn kho từ `refused` không ảnh hưởng giới hạn.

## 15. Phát hiện ở PRD / điểm cần Orchestrator-PO xem, rủi ro


Tất cả đã giải (2026-11-08, `docs/decisions.md` + PRD cập nhật):
1. **BR-CHK-27 `unauthorized`**: đã giải, dùng `unauthenticated` (401) / `forbidden` (403) (PRD Slice 4 K10; contract không đổi).
2. **Tên phương thức** `bank_transfer` (DB) vs `bank-transfer` (contract): đã giải, admin API theo contract (`payment=bank-transfer`); mapper đổi qua lại.
3. **Phân trang**: đã giải, admin dùng `page` + `limit` (1..50, mặc định 20, lỗi `field: limit`) như Slice 3 (BR-ADM-05); không còn `pageSize`.
4. **Hướng sắp xếp timeline**: đã giải, admin mới nhất trước, khách cũ nhất trước (chủ ý, BR-ADM-10); contract ghi rõ ở cả hai mô tả.
5. **Khoảng trống quyền `to_ship` đã xác nhận**: đã giải bằng lý do mới `customer_request` (staff + admin, mọi đơn `to_ship`, note 5-250, `cancelledBy = customer`, không tính giới hạn COD; BR-ADM-02, 24, 28; AC-ADM-50). Staff có 5 lý do; chỉ admin có `other`.
6. **"Q4" trùng số**: đã giải, code dùng tiền tố `S4-` (mục 14).
7. **BR-ADM-18 "tính từ lần đầu"**: đã giải theo hướng khác bản nháp: **cửa sổ 24 giờ bất kỳ** (3 lần liên tiếp, lần cuối - lần đầu <= 24 giờ 00 phút; biên 24 giờ 00 đủ, 24 giờ 01 không; chỉ mở `unreachable`, không tự huỷ). Lỗi khi chưa đủ: `409 condition-not-met`. `callAttempts.inFirstDay` giữ tên, nghĩa = số lần lớn nhất trong một cửa sổ 24 giờ. Cập nhật T5 và T-ADM-20 (mục 4, 11).
8. **AC-ADM-03 "phiên bị xoá"**: đã giải, kiểm bằng hành vi: vai trò đọc lại mỗi yêu cầu (hạ vai trò bằng SQL: hành động chỉ admin -> 403, `GET` vẫn 200; `is_active = false` -> 401 `unauthenticated`). Slice 4 **không** thu hồi dòng `sessions` / xoá cookie; việc đó thuộc slice Admin người dùng (AC-AUTH-75).
9. **BR-ADM-41 "theo tài khoản"**: đã tính ở mục 5, 9 (`createRateLimit` thêm `key`).
10. **Thứ tự kiểm `expectedStatus` trước `invalid-transition`**: đã giải ở contract + mục 6.2 (`order-state-changed` trước; test gửi `expectedStatus` = trạng thái thật cho AC-ADM-13, 19).
11. **Thư xác nhận yêu cầu huỷ (C1) và thư "đã quyết định hàng hoàn"**: không làm (PRD không có).
12. **S4-Q1..Q7, Q9** đã trả lời (mục 0); **S4-Q8** (COMMON-01..03) còn mở, không chặn.

Rủi ro:
| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| R1 | Refactor `cancelOrderTx` đụng đường huỷ khách / hết hạn đã nghiệm thu | Giữ nguyên chữ ký cũ qua wrapper, chạy lại toàn bộ test Slice 3 (T-ORD, T-CON) trước khi thêm hành động admin |
| R2 | Tìm tên bỏ dấu bằng `translate()` quét tuần tự bảng `orders` | Đủ cho đồ án; nếu chậm: thêm cột `recipient_name_search` (backfill bằng migration riêng, có xác nhận) hoặc extension `unaccent` (đổi decisions) |
| R3 | `email_*` cập nhật trên `order_events` mâu thuẫn với "sự kiện bất biến" | Chỉ ba cột `email_*` được UPDATE; nếu thêm trigger chặn sửa thì cho phép riêng ba cột này; hoặc tách bảng `order_event_emails` (không làm ở Slice 4) |
| R4 | `Idempotency-Key` tuỳ chọn: FE quên gửi thì chỉ có `expectedStatus` bảo vệ | Đủ cho BR-ADM-14 (không có hiệu ứng trùng); FE nên luôn gửi |
| R5 | Bộ đếm rate limit RAM theo instance | Chấp nhận (R10 Slice 3) |
| R6 | Deadlock giữa đặt hàng, huỷ khách, huỷ admin, hết hạn | Một thứ tự khoá (6.3); thử lại 3 lần với `P2034` / `40P01`; test đồng thời T-ADM-14, 15, 33, 40 |
| R7 | Supabase pgbouncer (transaction mode) với `SELECT ... FOR UPDATE` trong giao dịch tương tác | Đã dùng ở Slice 3 (R4); kiểm bằng nghiệm thu 4.7 |
| R8 | `ALTER TABLE orders ADD COLUMN` + CHECK trên Supabase có đơn thật | Cột NULL/DEFAULT hằng không ghi lại bảng; CHECK trên cột NULL qua ngay; chạy `migrate deploy` ngoài giờ cao điểm, sao lưu trước (Orchestrator) |
| R9 | Hai bước hàng hoàn (S4-Q2) cho phép "huỷ rồi quên cộng tồn" | Tab `returning` + cờ `overdue` (Should); một bước là cờ `returnStockMode` |
| R10 | Thư viện mới | Không thêm |
