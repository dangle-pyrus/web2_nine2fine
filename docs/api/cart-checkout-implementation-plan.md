# Kế hoạch triển khai Cart & Checkout (Slice 3) - locked cùng contract

Hợp đồng: `docs/api/openapi.yaml` (phần Slice 3 `status: locked (2026-11-07)`; auth và catalog không đổi). BR/AC: `docs/product/PRD.md` mục "Slice 3: Cart & Checkout" (BR-CART-01..14, BR-CHK-01..33, BR-VOU-01..13; AC-CART-01..20, AC-CHK-01..41, AC-VOU-01..16); khi mâu thuẫn, PRD thắng. Nguồn nghiệp vụ và bảng tham số: `docs/product/cart-checkout-business-rules.md`. Chỉ là tài liệu: agent triển khai làm theo mục 7 mà không cần hỏi lại; chỗ cần quyết định ở mục 9.

Chỗ nào ghi **[giả định chờ Thắng]** là theo đề xuất của PO trong `docs/handoff.md` (4 câu hỏi mở Slice 3) và có thể đổi: 
- **G1** COMMON-01..06 không có nội dung: tên trạng thái (`to_pay`, `to_ship`, `to_receive`, `completed`, `cancel_requested`, `cancelled`) và thanh toán (`pending`, `paid`, `failed`, `refunded`, `partially_refunded`) lấy từ CHK-PAY-14; mã % làm tròn xuống tới 1.000 ₫; tồn trừ khi tạo đơn, hoàn khi huỷ; OTP tra cứu khách theo BR-AUTH-04..09, quyền xem sau OTP 30 phút.
- **G2** QR tự đối soát cần tài khoản + webhook (SePay): chưa có thì ẩn QR ở HTTP (cờ `store_settings.bank_transfer_enabled = false`); thiết kế sẵn điểm mở rộng webhook (mục 4.8), **không bắt buộc làm** ở các lát đầu.
- **G3** Địa giới toàn quốc: 34 tỉnh/thành, phường/xã sau 01/07/2025, seed từ file công khai.
- **G4** Khách tự huỷ đơn `to_ship` thẳng cho tới khi có slice Admin.

Phạm vi BE Slice 3: 17 endpoint (contract): `GET /locations/provinces`, `GET /locations/provinces/{provinceCode}/wards`, `POST /checkout/quote`, `POST /vouchers/check`, `GET /cart`, `POST /cart/lines`, `PUT|DELETE /cart/lines/{variantId}`, `POST /cart/lines/{variantId}/change-variant`, `POST /cart/merge`, `POST|GET /orders`, `POST /orders/lookup/codes`, `POST /orders/lookup/verify`, `GET /orders/{orderCode}`, `POST /orders/{orderCode}/cancel`, `GET /orders/{orderCode}/payment` (QR, sau cờ). Ngoài phạm vi: gọi xác nhận COD, duyệt `cancel_requested`, bàn giao vận chuyển, hoàn tiền, trả hàng, hoá đơn điện tử thật, thẻ/ví, sổ địa chỉ, ví voucher, mã theo hạng/ngày sinh, CRUD voucher/tham số (đổi bằng SQL tới slice Admin), email vận chuyển/giao.

## 1. Schema Prisma (chỉ cộng thêm, BR-CHK-33)

Đối chiếu hiện trạng: đã có `users`, `addresses` (sổ địa chỉ kiểu cũ, **không dùng** ở Slice 3), `sessions`, `auth_action_tokens` (đã có `token_purpose.guest_order_lookup`, **tái dùng** cho OTP tra cứu), `auth_rate_limits`, 4 bảng catalog (`product_variants.inventory_qty` có `CHECK >= 0` là tồn khả dụng). Không đụng bảng cũ; chỉ thêm trường quan hệ ngược (`cart`, `orders`) vào model `User` ở phía Prisma, không sinh SQL.

Quy ước theo schema hiện có: khoá chính `uuid default gen_random_uuid()`, cột DB `snake_case` (map), thời gian `Timestamp(6)` **UTC**, enum DB `snake_case`. Khác Slice 2: **tiền là `Int` (VND)**, không `Decimal(12,2)`: tổng đơn tối đa 20 x 50.000.000 = 1.000.000.000 < 2.147.483.647, phép tính và CHECK `total = ...` làm trực tiếp trong SQL; nếu sau này giá trần tăng thì đổi sang `bigint` bằng migration riêng.

### Enum mới
`order_status` (to_pay, to_ship, to_receive, completed, cancel_requested, cancelled); `payment_status` (pending, paid, failed, refunded, partially_refunded); `payment_method` (cod, bank_transfer); `order_actor` (customer, shop, system); `voucher_kind` (percent, fixed, free_shipping).

### `store_settings` (1 dòng, tham số vận hành, BR 4.1)
`id int PK CHECK (id = 1)`, `max_per_variant int` (5), `max_items_per_order` (20), `max_cart_lines` (30), `cart_retention_days` (30), `shipping_fee` (30000), `free_shipping_threshold` (1000000), `cod_max_total` (5000000), `cod_refusal_limit` (2), `cod_refusal_months` (6), `cod_open_order_limit` (3), `bank_hold_minutes` (30), `bank_transfer_enabled boolean` (false, **G2**), `delivery_days_min` (2), `delivery_days_max` (4), `cutoff_hour` (16), `updated_at`. CHECK: mọi số nguyên `> 0` (trừ `shipping_fee >= 0`, `free_shipping_threshold >= 0`), `delivery_days_min <= delivery_days_max`, `cutoff_hour BETWEEN 0 AND 23`. Dòng quy định theo cột (không jsonb) để DB từ chối giá trị vô lý. Đổi bằng `UPDATE`; chỉ đơn mới đọc giá trị mới vì đơn đã chụp số liệu.

### `holidays`
`holiday_date date PK`, `name varchar(100) NOT NULL`. Ngày nghỉ ngoài Chủ nhật (BR-CHK-11).

### `provinces`, `wards` (G3, BR-CHK-06)
| Bảng | Cột chính |
| --- | --- |
| `provinces` | `province_code varchar(10) PK`, `name varchar(100) NOT NULL`, `name_search varchar(100) NOT NULL` (đã `foldVi`, cho sắp xếp / tìm) |
| `wards` | `ward_code varchar(10) PK`, `province_code varchar(10) NOT NULL FK provinces ON DELETE RESTRICT`, `name varchar(100) NOT NULL`, `name_search varchar(100) NOT NULL` |

Index `idx_wards_province_name (province_code, name_search)`. Đơn lưu **mã và tên chụp** (xem `orders`) nên đổi danh mục sau này không sửa đơn cũ; FK `orders.ward_code -> wards` là `ON DELETE RESTRICT` để khỏi mất tham chiếu.

### `carts`, `cart_lines` (giỏ thành viên, BR-CART-09)
| Bảng | Cột chính |
| --- | --- |
| `carts` | `cart_id uuid PK`, `user_id uuid NOT NULL UNIQUE FK users ON DELETE CASCADE`, `updated_at timestamp(6) NOT NULL` (lần sửa cuối = mốc 30 ngày) |
| `cart_lines` | `cart_id uuid FK carts ON DELETE CASCADE`, `variant_id uuid FK product_variants ON DELETE CASCADE`, `quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 99)`, `created_at`, `updated_at`; **PK `(cart_id, variant_id)`** |

Trần 5/phiên bản và 30 dòng là tham số (`store_settings`), kiểm ở ứng dụng; CHECK `<= 99` chỉ chặn rác. Index `idx_cart_lines_cart_updated (cart_id, updated_at)` cho việc loại dòng cũ nhất. Không lưu giá đã thấy (FE giữ bản chụp để hiện "Giá đã thay đổi"), không lưu "được chọn" (chế độ chọn là trạng thái phiên của FE, K4).

### `vouchers` (BR-VOU-02, 13)
| Cột | Kiểu | Ràng buộc / ghi chú |
| --- | --- | --- |
| voucher_id | uuid | PK |
| code | varchar(20) | UNIQUE, CHECK `code ~ '^[A-Z0-9]{4,20}$'` (lưu chữ hoa; so sánh bằng chữ hoa) |
| kind | voucher_kind | NOT NULL |
| value | int | `percent`: 1..90; `fixed`: > 0; `free_shipping`: NULL (CHECK theo `kind`) |
| max_discount | int | NULL; chỉ cho `percent`, `> 0` |
| min_subtotal | int | NOT NULL default 0, `>= 0` (tính trên tiền hàng đủ điều kiện, bằng là đạt) |
| is_active | boolean | NOT NULL default true |
| starts_at, ends_at | timestamp(6) | NULL = không giới hạn; CHECK `ends_at > starts_at` khi cả hai có. Lưu UTC; "31/12/2027 23:59:59 giờ Việt Nam" = `2027-12-31T16:59:59Z` |
| total_limit | int | NULL = không giới hạn; `>= 1` |
| used_count | int | NOT NULL default 0, CHECK `used_count >= 0 AND (total_limit IS NULL OR used_count <= total_limit)`: bộ đếm **lượt đang dùng + đang giữ** (đơn chưa huỷ), là bảo đảm cuối cùng chống bán quá lượt |
| per_user_limit | int | NOT NULL default 1, `>= 1` |
| members_only | boolean | NOT NULL default false |
| first_order_only | boolean | NOT NULL default false |
| category_id | uuid | NULL, FK `categories` ON DELETE RESTRICT (Should, BR-VOU-13) |
| exclude_sale_items | boolean | NOT NULL default false (Should) |
| name | varchar(100) | nhãn hiển thị ("Giảm 15% đơn đầu tiên") |
| created_at, updated_at | timestamp(6) | |

### `voucher_redemptions` (lượt dùng / giữ)
`redemption_id uuid PK`, `voucher_id uuid NOT NULL FK vouchers ON DELETE RESTRICT`, `order_id uuid NOT NULL FK orders ON DELETE CASCADE`, `user_id uuid NULL`, `phone varchar(10) NOT NULL`, `email varchar(254) NOT NULL` (chuẩn hoá chữ thường), `created_at`, `released_at timestamp(6) NULL` (NULL = lượt còn tính; khác NULL = đã **trả lượt**). UNIQUE `(voucher_id, order_id)`. Index thường (không partial, tránh `migrate dev` đòi `DROP INDEX`): `(voucher_id, user_id)`, `(voucher_id, phone)`, `(voucher_id, email)`, `(order_id)`.
Lượt "không được trả" (mã đã hết hạn lúc huỷ, BR-VOU-12) giữ `released_at = NULL` để vẫn tính cho giới hạn riêng của khách.

### `orders` (BR-CHK-18, 22)
| Cột | Kiểu | Ràng buộc / ghi chú |
| --- | --- | --- |
| order_id | uuid | PK, nội bộ, không lộ ra API |
| code | varchar(13) | UNIQUE, CHECK `code ~ '^N2F[0-9]{10}$'` |
| user_id | uuid | NULL, FK users ON DELETE SET NULL (đơn khách = NULL) |
| status | order_status | NOT NULL |
| payment_status | payment_status | NOT NULL default 'pending' |
| payment_method | payment_method | NOT NULL |
| email | varchar(254) | NOT NULL, CHECK `email = lower(email)` |
| recipient_name | varchar(50) | NOT NULL, CHECK `char_length(btrim(recipient_name)) BETWEEN 2 AND 50` |
| recipient_phone | varchar(10) | NOT NULL, CHECK `~ '^0(3\|5\|7\|8\|9)[0-9]{8}$'` |
| province_code, ward_code | varchar(10) | NOT NULL, FK `provinces`, `wards` ON DELETE RESTRICT |
| province_name, ward_name | varchar(100) | NOT NULL (chụp tên) |
| street | varchar(200) | NOT NULL, CHECK `char_length(btrim(street)) BETWEEN 5 AND 200` |
| note | varchar(250) | NULL |
| invoice_company, invoice_tax_code, invoice_address, invoice_email | varchar | cùng NULL hoặc cùng NOT NULL (CHECK); `invoice_tax_code ~ '^[0-9]{10}(-[0-9]{3})?$'` |
| subtotal, discount, shipping_fee, shipping_discount, total | int | CHECK `subtotal >= 0 AND discount BETWEEN 0 AND subtotal AND shipping_fee >= 0 AND shipping_discount BETWEEN 0 AND shipping_fee AND total = subtotal - discount + shipping_fee - shipping_discount` |
| discount_voucher_code, shipping_voucher_code | varchar(20) | NULL (chụp mã) |
| payment_due_at | timestamp(6) | CHECK `status <> 'to_pay' OR (payment_method = 'bank_transfer' AND payment_due_at IS NOT NULL)` |
| paid_at | timestamp(6) | NULL |
| estimated_from, estimated_to | date | NOT NULL (ngày giao dự kiến, tính lại khi `to_pay -> to_ship`) |
| needs_confirm_call | boolean | NOT NULL default false (BR-CHK-20, chụp lúc đặt) |
| terms_accepted_at | timestamp(6) | NOT NULL (BR-CHK-08) |
| items_fingerprint | char(64) | NOT NULL, SHA-256 của `variantId:qty` đã sắp (BR-CHK-16) |
| cancelled_at, cancelled_by, cancel_reason | timestamp / order_actor / varchar(250) | CHECK `(status = 'cancelled') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)` |
| stock_restored_at | timestamp(6) | NULL; CHECK `stock_restored_at IS NULL OR status = 'cancelled'`; **dấu "đã hoàn kho"** để hoàn đúng một lần |
| delivery_refused_at | timestamp(6) | NULL, do Admin/SQL ghi; nguồn của điều kiện COD (BR-CHK-19) |
| confirmation_email_sent_at | timestamp(6) | NULL; `email_attempts smallint default 0` |
| created_at | timestamp(6) | thời điểm đặt |

Index: `(user_id, created_at DESC, order_id)` (danh sách thành viên); `(status, payment_due_at)` (quét hết hạn); `(recipient_phone, created_at)`, `(email, created_at)` (COD, voucher, đơn đầu tiên); `(recipient_phone, items_fingerprint, created_at)` (đơn trùng); `(confirmation_email_sent_at, created_at)`.

### `order_items`
`order_item_id uuid PK`, `order_id uuid FK orders ON DELETE CASCADE`, `line_no smallint`, `variant_id uuid FK product_variants ON DELETE RESTRICT`, `product_id uuid`, `product_slug varchar(80)`, `name varchar(120)`, `color_name varchar(50)`, `size varchar(10)`, `sku varchar(64)`, `media_id varchar(100)`, `unit_price int CHECK >= 0`, `compare_at_price int NULL`, `quantity int CHECK BETWEEN 1 AND 99`, `line_discount int NOT NULL default 0 CHECK (line_discount BETWEEN 0 AND unit_price * quantity)`. UNIQUE `(order_id, variant_id)`. Tổng `line_discount` = `orders.discount` không ép bằng CHECK (liên bảng): kiểm bằng truy vấn cuối giao dịch đặt hàng (mục 4.4 bước 9) và test T-VOU-08.

### `order_events` (lịch sử + người đổi, BR-CHK-22)
`event_id uuid PK`, `order_id FK CASCADE`, `at timestamp(6)`, `from_status order_status NULL`, `to_status order_status NOT NULL`, `payment_status payment_status NOT NULL`, `actor order_actor NOT NULL`, `detail varchar(250) NULL`. Index `(order_id, at)`. `timeline` của API sinh từ bảng này (tiêu đề tiếng Việt theo `to_status`: "Đã đặt hàng", "Đã nhận thanh toán", "Đã huỷ đơn"...).

### `idempotency_keys` (BR-CHK-15)
`scope varchar(20)` (`order-create`, `cart-merge`), `key varchar(64)`, `request_hash char(64)` (SHA-256 của JSON chuẩn hoá của body + id người dùng hoặc `guest`), `order_id uuid NULL FK orders ON DELETE SET NULL`, `response_snapshot jsonb NULL` (cho `cart-merge`), `created_at`, `expires_at` (= `created_at + 24h`). **PK `(scope, key)`**. Index `(expires_at)`.

### `order_access_grants` (quyền xem đơn khách sau OTP, BR-CHK-26)
`token_hash char(64) PK` (SHA-256, dùng `hashSessionToken`), `order_id uuid FK orders ON DELETE CASCADE`, `created_at`, `expires_at` (= +30 phút). Index `(expires_at)`, `(order_id)`. Token 32 byte ngẫu nhiên (`generateSessionToken`), chỉ gửi qua cookie `n2f_oa`, không lưu rõ.

### Khối Prisma đề xuất (rút gọn: các CHECK thêm tay trong migration)
```prisma
enum order_status   { to_pay  to_ship  to_receive  completed  cancel_requested  cancelled }
enum payment_status { pending  paid  failed  refunded  partially_refunded }
enum payment_method { cod  bank_transfer }
enum order_actor    { customer  shop  system }
enum voucher_kind   { percent  fixed  free_shipping }

model StoreSetting {
  id                    Int      @id @default(1)
  maxPerVariant         Int      @default(5)        @map("max_per_variant")
  maxItemsPerOrder      Int      @default(20)       @map("max_items_per_order")
  maxCartLines          Int      @default(30)       @map("max_cart_lines")
  cartRetentionDays     Int      @default(30)       @map("cart_retention_days")
  shippingFee           Int      @default(30000)    @map("shipping_fee")
  freeShippingThreshold Int      @default(1000000)  @map("free_shipping_threshold")
  codMaxTotal           Int      @default(5000000)  @map("cod_max_total")
  codRefusalLimit       Int      @default(2)        @map("cod_refusal_limit")
  codRefusalMonths      Int      @default(6)        @map("cod_refusal_months")
  codOpenOrderLimit     Int      @default(3)        @map("cod_open_order_limit")
  bankHoldMinutes       Int      @default(30)       @map("bank_hold_minutes")
  bankTransferEnabled   Boolean  @default(false)    @map("bank_transfer_enabled")
  deliveryDaysMin       Int      @default(2)        @map("delivery_days_min")
  deliveryDaysMax       Int      @default(4)        @map("delivery_days_max")
  cutoffHour            Int      @default(16)       @map("cutoff_hour")
  updatedAt             DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  @@map("store_settings")
}

model Holiday  { date DateTime @id @map("holiday_date") @db.Date
                 name String   @db.VarChar(100)
                 @@map("holidays") }
model Province { code String @id @map("province_code") @db.VarChar(10)
                 name String @db.VarChar(100)
                 nameSearch String @map("name_search") @db.VarChar(100)
                 wards Ward[]
                 @@map("provinces") }
model Ward     { code String @id @map("ward_code") @db.VarChar(10)
                 provinceCode String @map("province_code") @db.VarChar(10)
                 name String @db.VarChar(100)
                 nameSearch String @map("name_search") @db.VarChar(100)
                 province Province @relation(fields: [provinceCode], references: [code], onDelete: Restrict)
                 @@index([provinceCode, nameSearch], map: "idx_wards_province_name")
                 @@map("wards") }

model Cart {
  cart_id   String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String     @unique @map("user_id") @db.Uuid
  updatedAt DateTime   @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  user      User       @relation(fields: [userId], references: [user_id], onDelete: Cascade)
  lines     CartLine[]
  @@map("carts")
}
model CartLine {
  cartId    String   @map("cart_id") @db.Uuid
  variantId String   @map("variant_id") @db.Uuid
  quantity  Int
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  cart      Cart           @relation(fields: [cartId], references: [cart_id], onDelete: Cascade)
  variant   ProductVariant @relation(fields: [variantId], references: [variant_id], onDelete: Cascade)
  @@id([cartId, variantId])
  @@index([cartId, updatedAt], map: "idx_cart_lines_cart_updated")
  @@map("cart_lines")
}

model Voucher {
  voucher_id       String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code             String       @unique @db.VarChar(20)
  name             String       @db.VarChar(100)
  kind             voucher_kind
  value            Int?
  maxDiscount      Int?         @map("max_discount")
  minSubtotal      Int          @default(0) @map("min_subtotal")
  isActive         Boolean      @default(true) @map("is_active")
  startsAt         DateTime?    @map("starts_at") @db.Timestamp(6)
  endsAt           DateTime?    @map("ends_at") @db.Timestamp(6)
  totalLimit       Int?         @map("total_limit")
  usedCount        Int          @default(0) @map("used_count")
  perUserLimit     Int          @default(1) @map("per_user_limit")
  membersOnly      Boolean      @default(false) @map("members_only")
  firstOrderOnly   Boolean      @default(false) @map("first_order_only")
  categoryId       String?      @map("category_id") @db.Uuid
  excludeSaleItems Boolean      @default(false) @map("exclude_sale_items")
  createdAt        DateTime     @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt        DateTime     @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  redemptions      VoucherRedemption[]
  @@map("vouchers")
}
model VoucherRedemption {
  redemption_id String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  voucherId     String    @map("voucher_id") @db.Uuid
  orderId       String    @map("order_id") @db.Uuid
  userId        String?   @map("user_id") @db.Uuid
  phone         String    @db.VarChar(10)
  email         String    @db.VarChar(254)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamp(6)
  releasedAt    DateTime? @map("released_at") @db.Timestamp(6)
  voucher       Voucher   @relation(fields: [voucherId], references: [voucher_id], onDelete: Restrict)
  order         Order     @relation(fields: [orderId], references: [order_id], onDelete: Cascade)
  @@unique([voucherId, orderId], map: "uq_redemptions_voucher_order")
  @@index([voucherId, userId], map: "idx_redemptions_voucher_user")
  @@index([voucherId, phone], map: "idx_redemptions_voucher_phone")
  @@index([voucherId, email], map: "idx_redemptions_voucher_email")
  @@index([orderId], map: "idx_redemptions_order")
  @@map("voucher_redemptions")
}

model Order {
  order_id          String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code              String         @unique @db.VarChar(13)
  userId            String?        @map("user_id") @db.Uuid
  status            order_status
  paymentStatus     payment_status @default(pending) @map("payment_status")
  paymentMethod     payment_method @map("payment_method")
  email             String         @db.VarChar(254)
  recipientName     String         @map("recipient_name") @db.VarChar(50)
  recipientPhone    String         @map("recipient_phone") @db.VarChar(10)
  provinceCode      String         @map("province_code") @db.VarChar(10)
  wardCode          String         @map("ward_code") @db.VarChar(10)
  provinceName      String         @map("province_name") @db.VarChar(100)
  wardName          String         @map("ward_name") @db.VarChar(100)
  street            String         @db.VarChar(200)
  note              String?        @db.VarChar(250)
  invoiceCompany    String?        @map("invoice_company") @db.VarChar(200)
  invoiceTaxCode    String?        @map("invoice_tax_code") @db.VarChar(14)
  invoiceAddress    String?        @map("invoice_address") @db.VarChar(200)
  invoiceEmail      String?        @map("invoice_email") @db.VarChar(254)
  subtotal          Int
  discount          Int
  shippingFee       Int            @map("shipping_fee")
  shippingDiscount  Int            @map("shipping_discount")
  total             Int
  discountVoucherCode String?      @map("discount_voucher_code") @db.VarChar(20)
  shippingVoucherCode String?      @map("shipping_voucher_code") @db.VarChar(20)
  paymentDueAt      DateTime?      @map("payment_due_at") @db.Timestamp(6)
  paidAt            DateTime?      @map("paid_at") @db.Timestamp(6)
  estimatedFrom     DateTime       @map("estimated_from") @db.Date
  estimatedTo       DateTime       @map("estimated_to") @db.Date
  needsConfirmCall  Boolean        @default(false) @map("needs_confirm_call")
  termsAcceptedAt   DateTime       @map("terms_accepted_at") @db.Timestamp(6)
  itemsFingerprint  String         @map("items_fingerprint") @db.Char(64)
  cancelledAt       DateTime?      @map("cancelled_at") @db.Timestamp(6)
  cancelledBy       order_actor?   @map("cancelled_by")
  cancelReason      String?        @map("cancel_reason") @db.VarChar(250)
  stockRestoredAt   DateTime?      @map("stock_restored_at") @db.Timestamp(6)
  deliveryRefusedAt DateTime?      @map("delivery_refused_at") @db.Timestamp(6)
  confirmationEmailSentAt DateTime? @map("confirmation_email_sent_at") @db.Timestamp(6)
  emailAttempts     Int            @default(0) @map("email_attempts") @db.SmallInt
  createdAt         DateTime       @default(now()) @map("created_at") @db.Timestamp(6)
  user              User?          @relation(fields: [userId], references: [user_id], onDelete: SetNull)
  items             OrderItem[]
  events            OrderEvent[]
  redemptions       VoucherRedemption[]
  grants            OrderAccessGrant[]
  @@index([userId, createdAt(sort: Desc), order_id], map: "idx_orders_user_created")
  @@index([status, paymentDueAt], map: "idx_orders_status_due")
  @@index([recipientPhone, createdAt], map: "idx_orders_phone_created")
  @@index([email, createdAt], map: "idx_orders_email_created")
  @@index([recipientPhone, itemsFingerprint, createdAt], map: "idx_orders_dup")
  @@index([confirmationEmailSentAt, createdAt], map: "idx_orders_email_pending")
  @@map("orders")
}
// OrderItem, OrderEvent, IdempotencyKey, OrderAccessGrant: cột theo bảng ở trên, cùng quy ước @map.
```
Thêm vào `User`: `cart Cart?` và `orders Order[]` (chỉ phía Prisma). Thêm vào `ProductVariant`: `cartLines CartLine[]`, `orderItems OrderItem[]`.

## 2. Migration (chỉ cộng thêm, BR-CHK-33, AC-CHK-41)

- Một migration `backend/prisma/migrations/20261107000500_cart_checkout_schema/`: `CREATE TYPE` x5, `CREATE TABLE` x13 (`store_settings`, `holidays`, `provinces`, `wards`, `carts`, `cart_lines`, `vouchers`, `voucher_redemptions`, `orders`, `order_items`, `order_events`, `idempotency_keys`, `order_access_grants`; không gồm `payment_transactions`), FK, index, **CHECK thêm tay** (mục 1), cuối file `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` cho **mọi bảng mới** (như `auth_rate_limits`, catalog: không policy; BE kết nối bằng owner nên không bị ảnh hưởng; advisor Supabase có thể nhắc "RLS bật, chưa policy": chấp nhận). Không có `DROP`, `TRUNCATE`, `DELETE`, `RENAME`, `ALTER` bảng / enum cũ.
- Điểm cần tự tay thêm vào SQL do `migrate dev --create-only` sinh ra: toàn bộ `ALTER TABLE ... ADD CONSTRAINT ... CHECK` (Prisma không biểu diễn), RLS, và kiểm tra `ORDER BY ... DESC` trong index `idx_orders_user_created`.
- Cách làm: `npx prisma migrate dev --create-only --name cart_checkout_schema` trên **DB cục bộ `n2f_dev`** (không phải Supabase), mở SQL, bổ sung, rồi áp. Đọc SQL tìm `DROP|TRUNCATE|DELETE|RENAME` và `ALTER` ngoài bảng mới: có thì dừng. Không dùng index partial (Prisma không khai báo được; `migrate dev` sẽ đòi `DROP INDEX` mỗi lần).
- Kiểm cục bộ: (1) `npm test` chạy `migrate deploy` lên `n2f_test` qua `global-setup.ts` được từ DB sạch lẫn DB đã có 5 migration cũ với dữ liệu `users`, `products`; (2) `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <n2f_shadow>` rỗng; (3) `migrate deploy` lần hai: không đổi gì; (4) test T-CHK-90 kiểm mọi CHECK và RLS.
- Migration thứ hai **tuỳ chọn**, chỉ khi làm webhook (lát 3.8): `20261107000600_payment_transactions` (bảng `payment_transactions`, mục 4.8), tách riêng để các lát đầu không phải mang bảng chưa dùng.
- Lên Supabase: chỉ `prisma migrate deploy` (`DIRECT_URL` cổng 5432) do Orchestrator / Thắng chạy sau khi test cục bộ xanh; sau đó `npm run seed:checkout`. Không `migrate dev`, `migrate reset`, `db push`.

## 3. Seed idempotent (BR-CHK-33)

Script `backend/prisma/seed-checkout.ts`, export `seedCheckout(prisma)` (test gọi được), chạy khi là entry; `"seed:checkout": "tsx prisma/seed-checkout.ts"` (qua `DIRECT_URL`, không qua pgbouncer 6543). Không gắn vào `prisma db seed`.

| Dữ liệu | Nguồn | Cách ghi (chạy lại không trùng, không đặt lại lượt đã dùng) |
| --- | --- | --- |
| `store_settings` dòng `id=1` | giá trị khởi đầu của bảng tham số | `INSERT ... ON CONFLICT (id) DO NOTHING` (không ghi đè giá trị quản lý đã đổi) |
| `vouchers` `N2FWELCOME15` | percent 15, `first_order_only`, `min_subtotal 100000`, `per_user_limit 1`, công khai, `ends_at = 2027-12-31T16:59:59Z`, `total_limit NULL`, tên "Giảm 15% đơn đầu tiên" | `ON CONFLICT (code) DO NOTHING` (không đụng `used_count`) |
| `vouchers` `N2FFREESHIP` | free_shipping, `min_subtotal 300000`, công khai, cùng hạn, tên "Miễn phí giao hàng" | như trên |
| `provinces`, `wards` | `backend/prisma/seed-data/vn-locations.json` (commit), **G3** | `INSERT ... SELECT * FROM unnest($1::text[], ...) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, name_search = EXCLUDED.name_search` một câu cho mỗi bảng |
| `holidays` | `backend/prisma/seed-data/holidays-vn.json` (commit) | `ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name` |

- `N2FBDAY100` **không seed** (cần ngày sinh, slice Account). Voucher thử nghiệm (`T50K`, `TEXP`, `TOUT`...) do test tạo, không có trong seed.
- **Địa giới.** Đầu file JSON có `_source` (URL, ngày tải, giấy phép) và `_asOf: "2025-07-01"`. Nguồn gợi ý: danh mục đơn vị hành chính sau sắp xếp 01/07/2025 của cơ quan thống kê, hoặc bộ dữ liệu mở tương đương; **BE chọn một nguồn, kiểm lại bằng số liệu công bố rồi ghi vào `_source`**. Bắt buộc: đúng 34 tỉnh/thành; mọi phường/xã thuộc đúng một tỉnh; mã duy nhất; mã `01` (Hà Nội), `48` (Đà Nẵng), `79` (TP Hồ Chí Minh) có mặt vì mock FE đang dùng (nếu mã nguồn mới khác, ghi vào `docs/handoff.md`, không tự đổi mã mock). Số phường/xã khoảng 3.300: test chỉ khẳng định `>= 3000` và 34 tỉnh, không cứng con số.
- **Ngày nghỉ.** File JSON gồm các ngày lễ cố định theo dương lịch (01/01, 30/04, 01/05, 02/09 và ngày liền kề theo thông báo chính thức) và các kỳ nghỉ Tết, Giỗ Tổ 2026-2027 **theo thông báo chính thức của Chính phủ**; BE điền từ văn bản chính thức và ghi số văn bản vào `name`. Không suy ra ngày âm lịch bằng mã. Thiếu ngày nào thì thuật toán vẫn chạy (chỉ loại Chủ nhật), nên không chặn các lát đầu; AC-CHK-11 dùng ngày nghỉ do test tạo.
- Sau seed: assert trong script `COUNT(*)` provinces = 34, store_settings = 1, vouchers `>= 2`.

## 4. Module backend

```
backend/src/lib/vn-time.ts                    vnNow(now), vnYYMMDD(), vnDateISO(), addWorkingDays()
backend/src/lib/money.ts                      floorTo(n, step), allocateByWeight()
backend/src/middleware/optional-auth.ts       optionalAuth: authenticate() không ném; không phiên / sai -> req.auth = undefined, không Set-Cookie, không 401
backend/src/middleware/rate-limit.ts          createRateLimit({ name, windowMs, max }) (RAM, cùng cơ chế catalog-rate-limit.ts, tách bộ đếm từng nhóm)
backend/src/modules/store/settings.service.ts getSettings(db) (đọc dòng id=1)
backend/src/modules/location/{routes,controller,service}.ts
backend/src/modules/cart/{cart.routes,cart.schemas,cart.controller,cart.service}.ts
backend/src/modules/checkout/pricing.ts       tính tiền thuần (không DB)
backend/src/modules/checkout/delivery.ts      ngày giao dự kiến
backend/src/modules/checkout/lines.service.ts đọc + làm tươi dòng (RefreshedLine)
backend/src/modules/checkout/quote.service.ts buildQuote()
backend/src/modules/checkout/checkout.routes.ts (+ schemas, controller)  POST /checkout/quote
backend/src/modules/voucher/{voucher.rules,voucher.service,voucher.routes}.ts   evaluate / claim / release / check
backend/src/modules/order/order.schemas.ts
backend/src/modules/order/order-code.ts
backend/src/modules/order/idempotency.ts
backend/src/modules/order/place-order.service.ts
backend/src/modules/order/cancel-order.service.ts   cancelOrderTx() dùng chung khách / hệ thống
backend/src/modules/order/lookup.service.ts          OTP + order_access_grants
backend/src/modules/order/order.service.ts           list / get (kiểm quyền)
backend/src/modules/order/order.mapper.ts            toOrderDto, timeline, canCancel
backend/src/modules/order/order.routes.ts
backend/src/modules/order/expiry.job.ts              expireDueOrders(now), retryPendingEmails(now), purgeExpired(now)
backend/src/modules/order/payment.service.ts         getPaymentSession(), applyIncomingTransfer() (điểm mở rộng, mục 4.8)
backend/src/mail/order-templates.ts                  4 email (mục 5)
backend/prisma/seed-checkout.ts
```
Việc ngoài module (làm đầu tiên):
- `lib/errors.ts`: thêm vào `ErrorCode` và `STATUS`: `invalid-address` 422, `stock-changed` 409, `price-changed` 409, `voucher-changed` 409, `idempotency-conflict` 409, `possible-duplicate` 409, `not-cancellable` 409. `AppErrorExtras` thêm `quote?`, `stockIssues?`, `removedVoucherCodes?`, `existingOrderCode?`; `middleware/error.ts` đưa các trường này vào `error.{...}` (khớp `ErrorResponse`). Factory `Errors.stockChanged(issues, quote)`, `Errors.priceChanged(quote)`, `Errors.voucherChanged(removed, quote)`, `Errors.notCancellable()`, `Errors.invalidAddress(field)`, ... Ghi vào `docs/decisions.md` (mở rộng `ErrorCode` như tiền lệ `not-found`).
- `app.ts`: gắn `locationRouter` **trước** `originGuard` (công khai, GET, như catalog); sau `cookieParser()` gắn `optionalAuth` cho nhánh quote / vouchers / orders create / lookup, `requireAuth('storefront')` cho `/cart/**` và `GET /orders`. Thứ tự đăng ký trong `orderRouter`: `POST /lookup/codes`, `POST /lookup/verify`, `POST /` , `GET /`, rồi `GET|POST /:orderCode/...` (để `lookup` không bị nuốt bởi `:orderCode`). Thêm `Idempotency-Key` vào `allowedHeaders` của CORS (cần khi khác origin; cùng origin qua proxy không có preflight). Cookie `n2f_oa` đọc bằng `cookieParser`.
- `config/env.ts`: thêm `APP_BASE_URL` (mặc định origin đầu tiên của `CORS_ALLOWED_ORIGINS`, dùng cho link trong email) và nhóm tuỳ chọn `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME`, `PAYMENT_WEBHOOK_KEY` (G2). `bankTransferEnabled` hiệu lực = `store_settings.bank_transfer_enabled AND đủ 3 biến BANK_*`.
- `mail/mailer.ts`: export thêm `sendMail(msg): Promise<void>` (chờ kết quả, cho việc thử lại có đếm); `sendMailInBackground` giữ nguyên.
- Rate limit (BR-CHK-30), bộ đếm RAM riêng từng nhóm: `cartQuoteLimit` 120/60 s (giỏ + quote + vouchers/check, **không** chung với catalog / auth), `orderCreateLimit` 10/600 s, `orderLookupLimit` 10/900 s (codes + verify chung). Chống dò voucher (BR-VOU-09) và OTP tra cứu dùng bảng `auth_rate_limits` qua `rate-limit.service.ts` (`hitWindow`, `recordFailure`/`setLock` hiện có; khoá `voucher-miss:ip:<ip>`, `order-lookup:email:<email>`) để khoá sống sót qua khởi động lại.
- Tiền lệ giờ: **mọi so sánh thời gian trong SQL dùng tham số `$now` lấy từ `lib/clock.now()`**, không dùng `now()` của DB (để test đồng hồ giả hoạt động, và tránh lệch múi giờ phiên DB). Múi giờ Việt Nam (UTC+7, không DST) tính ở `vn-time.ts` bằng cộng 7 giờ.

### 4.1 Làm tươi dòng (`lines.service.ts`, dùng cho giỏ, quote, đặt hàng)
Một truy vấn cho mọi `variantId`:
```sql
SELECT v.variant_id, v.sku, v.size, v.color_name, v.inventory_qty,
       p.product_id, p.slug, p.name, p.price, p.compare_at_price, p.cover_media_id, p.color_media, p.category_id, p.status
FROM product_variants v JOIN products p ON p.product_id = v.product_id
WHERE v.variant_id = ANY($1::uuid[])
ORDER BY v.variant_id;
```
(bản đặt hàng thêm `FOR SHARE OF p`, bước 2 mục 4.4). Quy tắc: biến thể không có dòng hoặc `p.status <> 'ACTIVE'` -> `discontinued` (`maxQuantity 0`); `inventory_qty = 0` -> `out-of-stock`; `1..5` -> `low-stock`; còn lại `available`. `maxQuantity = min(maxPerVariant, inventory_qty)`; `effectiveQuantity = min(requestedQuantity, maxQuantity)`; `limitedBy = 'stock'` nếu `inventory_qty < min(requested, maxPerVariant)` nếu không `'per-variant-limit'` khi `requested > maxPerVariant`. `mediaId = colorMedia[color_name] ?? cover_media_id`. `unitPrice = Number(price)`.

### 4.2 Tính tiền thuần (`pricing.ts`, đơn vị test riêng)
Đầu vào: dòng đã làm tươi (chỉ `effectiveQuantity > 0`), voucher đã qua bộ lọc điều kiện, `settings`. Đầu ra `Pricing` + `lineDiscounts` + `shipping`.
1. `subtotal = Σ unitPrice x effectiveQuantity`.
2. Phí: `shippingFee = settings.shippingFee`; `thresholdFree = subtotal >= freeShippingThreshold` (xét **trước voucher**, BR-VOU-05).
3. Voucher giảm tiền: `base = Σ giá trị dòng đủ điều kiện` (lọc danh mục, loại hàng giảm giá nếu bật; Should). `percent`: `d = floorTo(floor(base x value / 100), 1000)` rồi `min(d, maxDiscount ?? d)` (**G1**: 15% của 1.290.000 = 193.000, của 390.000 = 58.000); `fixed`: `min(value, base)`; luôn `min(d, base)`.
4. Voucher free-ship: chỉ áp khi `!thresholdFree` (mục 9 của BR-VOU-03). Áp -> `shippingDiscount = shippingFee`, `freeReason = 'voucher'`; nếu `thresholdFree` -> `shippingDiscount = shippingFee`, `freeReason = 'threshold'` (mã bị từ chối `shipping-already-free`); ngược lại `shippingDiscount = 0`.
5. `total = subtotal - discount + shippingFee - shippingDiscount` (khớp CHECK DB).
6. `allocateByWeight(discount, dòng đủ điều kiện)`: phần dòng `i` = `floor(discount x giá trị_i / base)`; phần dư (`discount - Σ`) cộng vào dòng giá trị lớn nhất (hoà: `variantId` nhỏ nhất). Kiểm `Σ = discount` (AC-VOU-08). Test thuộc tính (property) với số ngẫu nhiên.
Ví dụ cần có trong test: 390.000 + `N2FWELCOME15` + `N2FFREESHIP` -> giảm 58.000, phí miễn, tổng 332.000 (AC-VOU-01); 1.290.000 + `N2FWELCOME15` -> giảm 193.000, miễn phí theo ngưỡng, tổng 1.097.000 (AC-VOU-07).

### 4.3 Ngày giao dự kiến (`delivery.ts`, BR-CHK-11)
`from`/`to` ISO ngày. Giờ VN `t = now + 7h`. `start` = hôm nay VN nếu `t.hour < cutoffHour` và là ngày làm việc; ngược lại ngày làm việc kế tiếp (ngày làm việc = không phải Chủ nhật, không có trong `holidays`). `from = start + deliveryDaysMin` ngày làm việc, `to = start + deliveryDaysMax` ngày làm việc (start là ngày 0). Kiểm với AC-CHK-11: thứ Hai 10:00 -> Tư..Sáu; thứ Hai 16:30 -> start thứ Ba, Năm..Bảy; thứ Sáu 10:00 -> Hai..Tư (bỏ Chủ nhật). Khi đơn `to_pay -> to_ship` (thanh toán) tính lại từ lúc chuyển.

### 4.4 Đặt hàng (`place-order.service.ts`), tồn kho nguyên tử
Tiền xử lý (ngoài giao dịch): zod chuẩn hoá (trim, `+84 -> 0`, email chữ thường, `voucherCodes` chữ hoa), kiểm `Idempotency-Key`, giới hạn `orderCreateLimit`, `optionalAuth`. `request_hash = sha256(canonicalJSON(body) + '|' + (userId ?? 'guest'))`. Kiểm hạn mức cấu trúc (không trùng `variantId`, mỗi dòng 1..5, tổng <= 20, dòng <= 30) -> `422 validation`. Kiểm `acceptedTerms`, hoá đơn công ty, `paymentMethod = bank_transfer` mà QR chưa bật -> `422 validation` (`field` đúng tên).

Một `prisma.$transaction(async tx => ..., { isolationLevel: 'ReadCommitted', timeout: 10_000, maxWait: 5_000 })`; bọc **thử lại tối đa 3 lần** khi gặp deadlock / serialization (Prisma `P2034`, SQLSTATE `40P01`/`40001`), cùng `Idempotency-Key`. Các bước (thứ tự **cố định** vì quyết định thứ tự khoá):

1. **Idempotency.**
   ```sql
   INSERT INTO idempotency_keys (scope, key, request_hash, created_at, expires_at)
   VALUES ('order-create', $1, $2, $now, $now + interval '24 hours')
   ON CONFLICT (scope, key) DO UPDATE
     SET request_hash = EXCLUDED.request_hash, order_id = NULL, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at
     WHERE idempotency_keys.expires_at <= $now
   RETURNING 1;
   ```
   Có dòng trả về: khoá mới (hoặc đã hết hạn, coi như lượt mới) -> tiếp tục. Không có: đọc dòng hiện tại -> `request_hash` khác -> `409 idempotency-conflict`; trùng và `order_id` không NULL -> bỏ giao dịch, trả đơn đó (`200`, `Idempotency-Replayed: true`, không tác dụng phụ). Hai yêu cầu cùng khoá đồng thời: yêu cầu sau **chờ khoá chỉ mục duy nhất** tới khi yêu cầu trước commit (có đơn -> phát lại) hoặc rollback (xử lý như mới). Khoá chỉ tồn tại khi giao dịch commit, nên lỗi `409/422/5xx` không "đốt" khoá (AC-CHK-18, AC-CHK-38).
2. **Đọc địa chỉ và cấu hình.** `SELECT p.name, w.name FROM wards w JOIN provinces p ... WHERE w.ward_code=$1 AND w.province_code=$2` (không có -> `422 invalid-address`, `field: address.wardCode`); `getSettings(tx)`.
3. **Đọc dòng có khoá chia sẻ sản phẩm** (truy vấn mục 4.1 + `FOR SHARE OF p`): giá không đổi giữa lúc đọc và lúc commit (slice Admin sẽ `UPDATE products` cần khoá ghi, nên bị chặn tới khi đơn commit).
4. **Kiểm không khoá** (thứ tự quyết định mã lỗi, CHK-CF-01): (a) điều kiện phương thức thanh toán (mục 4.5) sai -> `422 validation` (`field: paymentMethod`); (b) tồn: mọi dòng `requested <= maxQuantity`, nếu không gom **mọi** dòng thiếu thành `stockIssues` (`available = max(0, min(5, inventory))`, 0 khi ngừng bán / hết) -> ném `stock-changed` (BR-CHK-13); (c) mã voucher: `evaluateVouchers(...)` không khoá; có mã bị từ chối -> `voucher-changed` kèm `removedVoucherCodes`; (d) `computePricing`, so với `expected`: giá bất kỳ dòng khác hoặc bất kỳ trường `pricing` khác -> `price-changed`; (e) đơn trùng 10 phút (Should): `SELECT code FROM orders WHERE recipient_phone=$1 AND items_fingerprint=$2 AND created_at > $now - interval '10 minutes' AND status <> 'cancelled' LIMIT 1` và `!confirmDuplicate` -> `possible-duplicate`. Mọi lỗi ở bước này ném ra **ngoài giao dịch** (rollback) rồi bộ xử lý lỗi gọi `buildQuote()` với đầu vào đã bỏ mã bị gỡ để đưa `quote` vào phản hồi `409`.
5. **Khoá điện thoại** (chỉ khi COD hoặc có mã đơn đầu tiên): `SELECT pg_advisory_xact_lock(hashtextextended('order-phone:' || $phone, 0))`: hai đơn cùng SĐT tuần tự hoá để đếm "đơn COD chưa giao" và "đơn đầu tiên" không bị chạy đua. Chỉ một khoá advisory mỗi giao dịch -> không tự deadlock.
6. **Giữ lượt voucher, theo `voucher_id` tăng dần (khoá trước tồn kho, mục "thứ tự khoá").** Với mỗi mã:
   ```sql
   UPDATE vouchers SET used_count = used_count + 1, updated_at = $now
   WHERE voucher_id = $1 AND is_active
     AND (starts_at IS NULL OR starts_at <= $now) AND (ends_at IS NULL OR ends_at > $now)
     AND (total_limit IS NULL OR used_count < total_limit)
   RETURNING used_count;
   ```
   0 dòng -> `voucher-changed` (hết hạn / hết lượt / bị tắt giữa chừng, BR-VOU-10). `UPDATE` giữ khoá dòng voucher tới hết giao dịch, nên sau khi có khoá **chạy lại** kiểm lượt riêng và "đơn đầu tiên" (đọc `voucher_redemptions` / `orders` đã commit): vi phạm -> `voucher-changed`. Hai đơn cuối-cùng-lượt: một `UPDATE` thắng, `UPDATE` kia chờ rồi thấy `used_count = total_limit` -> 0 dòng (AC-VOU-13). CHECK `used_count <= total_limit` là lớp chặn thứ hai.
7. **Trừ tồn từng dòng theo `variant_id` tăng dần:**
   ```sql
   UPDATE product_variants SET inventory_qty = inventory_qty - $2, updated_at = $now
   WHERE variant_id = $1 AND inventory_qty >= $2
   RETURNING inventory_qty;
   ```
   0 dòng = thiếu hàng (có người mua trước giữa bước 4 và 7). **Không dừng ở dòng đầu**: chạy hết các dòng, gom tất cả dòng thất bại, rồi ném `stock-changed` với `available` đọc lại bằng `SELECT inventory_qty` (giao dịch rollback nên các dòng đã trừ được hoàn). Postgres khoá dòng khi `UPDATE`; kẻ đến sau chờ, rồi đánh giá lại `WHERE` trên bản mới nhất (READ COMMITTED), nên **không bao giờ âm** kể cả đồng thời; CHECK `inventory_qty >= 0` là lớp chặn thứ hai (AC-CHK-15).
8. **Tạo đơn.** Sinh mã (mục 4.6) và chèn bằng `INSERT ... ON CONFLICT (code) DO NOTHING RETURNING order_id` (trùng mã -> thử mã khác, tối đa 10 lần; không dùng ngoại lệ vì lỗi unique làm hỏng giao dịch). Trạng thái: COD `to_ship` + `pending`, `estimated_*` từ `delivery.ts`; `bank_transfer` `to_pay` + `pending`, `payment_due_at = $now + bank_hold_minutes`. `needs_confirm_call` theo BR-CHK-20. Chèn `order_items` (chụp giá, `line_discount` đã chia), `voucher_redemptions` (kèm `user_id`, `phone`, `email`), `order_events` (`null -> status`, actor `customer`).
9. **Kiểm cuối:** `SELECT SUM(line_discount) = orders.discount` và `SELECT SUM(unit_price*quantity) = subtotal` bằng một truy vấn; lệch -> ném lỗi nội bộ (rollback, `500`) vì là bug.
10. **Giỏ thành viên** (nếu có phiên member): `DELETE FROM cart_lines WHERE cart_id = (SELECT cart_id FROM carts WHERE user_id=$1) AND variant_id = ANY($2)`; `UPDATE carts SET updated_at=$now`. Chỉ xoá dòng đã mua (BR-CART-07).
11. Ghi `idempotency_keys.order_id`. Commit.

Sau commit (ngoài giao dịch): `scheduleOrderEmail(orderId)` (mục 5). Phản hồi `201 {order}` dựng từ dữ liệu vừa ghi.

**Thứ tự khoá toàn hệ thống (chống deadlock):** `advisory(phone)` -> `vouchers` (theo `voucher_id`) -> `product_variants` (theo `variant_id`). Huỷ đơn / hết hạn / thanh toán dùng cùng thứ tự: khoá dòng `orders` đích (đơn đã tồn tại, không ai khác khoá theo chiều ngược) -> `vouchers` -> `product_variants`. Đặt hàng chỉ giữ `FOR SHARE` trên `products` ở bước 3 và không bao giờ khoá `orders` có sẵn. Test T-CHK-72 chạy đặt hàng + huỷ đồng thời để bắt vi phạm.

### 4.5 Điều kiện COD và QR (BR-CHK-19)
- COD không dùng được nếu: `total > cod_max_total` (`over-limit`); hoặc có `>= cod_refusal_limit` đơn COD cùng `recipient_phone` với `delivery_refused_at > $now - cod_refusal_months months` (`too-many-refusals`); hoặc có `>= cod_open_order_limit` đơn COD cùng SĐT ở `status IN ('to_ship','to_receive','cancel_requested')` (`too-many-open-orders`).
- `bank-transfer` không dùng được khi QR chưa bật (`not-enabled`, G2).
- `quote.paymentMethods` luôn liệt kê cả hai kèm `reason`; `quote` không biết SĐT khi khách chưa nhập -> chỉ áp `over-limit`.

### 4.6 Mã đơn (`order-code.ts`, BR-CHK-17)
`N2F` + `YYMMDD` (ngày VN của `$now`) + `String(randomInt(0, 10000)).padStart(4, '0')` bằng CSPRNG (`node:crypto.randomInt`). Duy nhất toàn cục nhờ `UNIQUE(code)` (đã có ngày trong tiền tố nên "không trùng trong ngày" thoả). Thử tối đa 10 lần; hết lần -> `unavailable` (thực tế chỉ khi > ~9.000 đơn/ngày; rủi ro R4). Tra cứu: `normalizeOrderCode(s) = s.trim().replace(/^#/, '').toUpperCase()`; sai dạng ở `/orders/{orderCode}` -> `404 not-found`, ở `lookup/*` -> đi tiếp như "không khớp".

### 4.7 Huỷ, hết hạn, trả tồn và lượt (`cancel-order.service.ts`, BR-CHK-14, 23; BR-VOU-12)
`cancelOrderTx(tx, orderId, actor, reason, allowedFrom)`:
```sql
UPDATE orders SET status='cancelled', cancelled_at=$now, cancelled_by=$actor, cancel_reason=$reason, stock_restored_at=$now
WHERE order_id=$1 AND status = ANY($allowedFrom::order_status[]) AND stock_restored_at IS NULL
RETURNING order_id, payment_status;
```
- Khách: `allowedFrom = ['to_pay','to_ship']` (**G4**). Hệ thống (hết hạn): `['to_pay']`. 0 dòng -> `409 not-cancellable` (đã huỷ / `to_receive` / `completed` / `cancel_requested`; **không** trả thêm gì, AC-CHK-16).
- Rồi (cùng giao dịch): (1) khoá voucher của đơn: `SELECT voucher_id FROM voucher_redemptions WHERE order_id=$1 AND released_at IS NULL ORDER BY voucher_id` -> `SELECT ... FROM vouchers WHERE voucher_id = ANY(...) ORDER BY voucher_id FOR UPDATE`; (2) trả lượt cho mã **còn hạn**: `UPDATE voucher_redemptions r SET released_at=$now FROM vouchers v WHERE r.order_id=$1 AND r.released_at IS NULL AND v.voucher_id=r.voucher_id AND (v.ends_at IS NULL OR v.ends_at > $now) RETURNING r.voucher_id` rồi `UPDATE vouchers SET used_count = used_count - 1 WHERE voucher_id = $1` cho từng `voucher_id` trả về; (3) trả tồn đúng số đã trừ, theo `variant_id` tăng dần: `UPDATE product_variants v SET inventory_qty = v.inventory_qty + i.quantity FROM order_items i WHERE i.order_id=$1 AND v.variant_id=i.variant_id AND v.variant_id=$2` (từng dòng, không gộp một câu để giữ thứ tự khoá); (4) `order_events`; commit; (5) sau commit gửi email "đã huỷ".
- `payment_status` giữ nguyên (đơn QR đã `paid` rồi khách huỷ ở `to_ship`: kế toán hoàn thủ công; email ghi 1-3 ngày làm việc).
- **Hết hạn 30 phút** (`expireDueOrders($now)`): `SELECT order_id FROM orders WHERE status='to_pay' AND payment_due_at <= $now ORDER BY payment_due_at LIMIT 50 FOR UPDATE SKIP LOCKED` rồi gọi `cancelOrderTx(..., 'system', 'Hết thời gian thanh toán', ['to_pay'])`; lặp tới khi hết. Chạy bằng `setInterval(60s)` khởi động trong `server.ts` (không trong `createApp`, để test gọi hàm trực tiếp); nhiều instance an toàn nhờ `SKIP LOCKED` và dấu `stock_restored_at`. Ngoài ra **lười**: `GET /orders/{code}` và `GET .../payment` gọi `expireIfDue(order)` trước khi trả (đơn quá hạn thấy ngay `cancelled`). Mục tiêu <= 2 phút sau hạn (BR-CHK-21) thoả với chu kỳ 60 giây.
- Quét dọn trong cùng job: xoá `idempotency_keys` hết hạn, `order_access_grants` hết hạn, `auth_action_tokens` lookup hết hạn; giỏ hết 30 ngày (`DELETE FROM carts WHERE updated_at < $now - 30 days`, cascade). Cũng xoá lười lúc `GET /cart`.

### 4.8 Chuyển khoản QR và điểm mở rộng webhook (G2, lát 3.8, không bắt buộc)
Đã có sẵn ở các lát trước (để khi có SePay chỉ thêm route): bước 8 mục 4.4 tạo đơn `to_pay`; hết hạn mục 4.7; `GET /orders/{code}/payment` trả `awaiting|paid|expired`, `transferContent` = mã đơn, `qrImageUrl` dựng từ `BANK_*` (VietQR, nhúng số tiền và nội dung); khi `bankTransferEnabled` sai trả `404`.
Điểm mở rộng: `payment.service.applyIncomingTransfer({ provider, providerTxId, content, amount, receivedAt })` (hàm thuần theo giao dịch, chưa có route):
1. Tách mã đơn bằng `/N2F\d{10}/i` trong `content`; không có -> ghi `payment_transactions` (matched=false), dừng.
2. `INSERT INTO payment_transactions ... ON CONFLICT (provider, provider_tx_id) DO NOTHING RETURNING` (không có dòng -> đã xử lý, thoát: idempotent theo mã giao dịch của ngân hàng).
3. Khoá đơn `FOR UPDATE`. `to_pay` và tổng đã nhận (cộng các giao dịch của đơn) `>= total` -> `payment_status='paid'`, `paid_at`, `to_ship`, tính lại `estimated_*`, `order_events`, email "đã nhận thanh toán"; thừa -> ghi `detail` "cần hoàn phần thừa". Thiếu -> giữ `to_pay`, trả `shortfall` ở `/payment`. Đơn đã `cancelled` -> không khôi phục, `detail` "hoàn 100%".
4. Route (khi làm): `POST /api/payments/sepay/webhook`, gắn **trước** `originGuard` và `cookieParser`, xác thực bằng header `Authorization: Apikey ${PAYMENT_WEBHOOK_KEY}` (so sánh `timingSafeEqual`), trả `200 {success:true}`; **chưa nằm trong openapi** cho tới khi Thắng xác nhận nhà cung cấp (khi đó thêm bằng quy trình đổi contract). Bảng `payment_transactions` (migration tuỳ chọn): `tx_id uuid PK`, `provider varchar(20)`, `provider_tx_id varchar(100)`, `order_id uuid NULL FK`, `amount int`, `content varchar(500)`, `received_at timestamp(6)`, `matched boolean`, `created_at`; UNIQUE `(provider, provider_tx_id)`. Không lưu số tài khoản đối ứng đầy đủ.

### 4.9 Giỏ thành viên (`cart.service.ts`, BR-CART-09..12)
Mọi thao tác trong một giao dịch, mở đầu bằng `INSERT INTO carts (user_id, updated_at) VALUES ($1,$now) ON CONFLICT (user_id) DO UPDATE SET user_id = carts.user_id RETURNING cart_id, updated_at` rồi `SELECT ... FROM carts WHERE cart_id=$1 FOR UPDATE` (khoá giỏ để tuần tự hoá thao tác đồng thời cùng một người). Nếu `updated_at < $now - cart_retention_days` thì `DELETE FROM cart_lines WHERE cart_id=$1` trước (giỏ hết hạn coi như rỗng, AC-CART-12; mốc 29 ngày còn nguyên). Mỗi thao tác ghi cập nhật `carts.updated_at = $now`.
- **add:** sản phẩm không bán / `inventory = 0` -> `409 stock-changed`; giới hạn dòng: nếu dòng mới và `count(lines) >= max_cart_lines` -> `422 validation` (`field: variantId`). Upsert: `INSERT ... ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = LEAST($cap, cart_lines.quantity + EXCLUDED.quantity), updated_at=$now` với `cap = min(max_per_variant, inventory)`; `notice` nếu bị cắt.
- **setQuantity:** dòng không tồn tại -> `404`; `quantity = LEAST(quantity, cap)`; `notice`. **remove:** `DELETE` (không tồn tại vẫn `200`).
- **change-variant:** cùng `product_id`, đích còn bán, trong giao dịch: đọc dòng nguồn, `DELETE` nguồn, upsert đích cộng dồn cắt `cap` (`notice.code='merged'` khi đích đã có, kèm `adjustedTo` nếu cắt).
- **merge:** `Idempotency-Key` (`scope 'cart-merge'`, cùng bảng, cùng cách phát lại ở bước 1 mục 4.4; phát lại trả `response_snapshot` + giỏ hiện tại). Với mỗi dòng (theo `variantId` tăng dần): bỏ qua nếu không bán (`skippedVariantIds`); upsert cộng dồn cắt `max_per_variant` (không cắt theo tồn: dòng hết hàng vẫn mang sang để FE hiện "Đã hết hàng", CART-10). Sau đó nếu `count > max_cart_lines`: `SELECT variant_id, product_id, quantity FROM cart_lines JOIN ... WHERE cart_id=$1 AND variant_id <> ALL($vừa_gộp) ORDER BY updated_at ASC, variant_id LIMIT (count - 30)`, xoá chúng, trả ở `evicted`. `mergedVariantIds` = các dòng vừa mang sang; `addedCount` = độ dài. FE chỉ gửi **phần chênh** (mục 8).
- `GET /cart`: sắp `updated_at DESC, variant_id`; trả `expiresAt = carts.updated_at + 30d` hoặc `null` khi rỗng. `cart_lines` luôn là giá trị đã lưu (`requestedQuantity`); chưa bao giờ sửa trong `GET`.
- Staff/admin gọi `/cart` bằng cookie storefront vẫn có giỏ riêng (không phân biệt vai trò).

### 4.10 Voucher (`voucher.service.ts`, `voucher.rules.ts`)
`evaluateVouchers({ codes, lines, customer: { userId?, phone?, email? }, now, shippingFeeApplies, tx|prisma }) -> { applied[], rejected[] }`: chuẩn hoá mã (trim, bỏ khoảng trắng, chữ hoa), tra theo `code`; hai mã cùng nhóm (`discount` hay `free-shipping`) thì mã đứng sau thay mã đứng trước. Mỗi mã kiểm **đúng thứ tự BR-VOU-03** và dừng ở điều kiện đầu tiên không đạt: `not-found` -> (`not-started` nếu `starts_at > now`, `expired` nếu `ends_at <= now` hoặc `!is_active`; AC-VOU-02/03: tắt = `expired`) -> `exhausted` (`total_limit IS NOT NULL AND used_count >= total_limit`) -> `login-required` (`members_only` và khách) -> `per-user-limit` (đếm `voucher_redemptions` với `released_at IS NULL` và (`user_id` hoặc `phone` hoặc `email` trùng) `>= per_user_limit`) -> `first-order-only` (tồn tại đơn `status <> 'cancelled'` của cùng `user_id` / `recipient_phone` / `email`) -> `category-mismatch` / `excluded-sale-items` (Should) -> `min-spend` (`base < min_subtotal`; `missingAmount`, `minSubtotal`) -> `shipping-already-free`. Khách chưa có SĐT / email (quote sớm) coi như không có lịch sử; kiểm lại khi đặt hàng với dữ liệu thật, nên FE gọi lại `quote` sau khi khách rời ô SĐT / email (BR-VOU-08). `POST /vouchers/check` = `evaluate` mã mới đặt **cuối** + `buildQuote`, mã không tồn tại cộng bộ đếm 10/15 phút theo IP.

## 5. Email xác nhận / huỷ (BR-CHK-28, 29; mailer có sẵn)

`mail/order-templates.ts` trả `MailMessage` (mailer hiện **chỉ text thuần**): `orderConfirmedMail(order)` ("nine2fine – Xác nhận đơn hàng #{code}"), `orderAwaitingPaymentMail(order)` ("nine2fine – Đơn #{code} đang chờ thanh toán"; thêm số tiền, hạn `paymentDueAt` giờ VN, link `${APP_BASE_URL}/payment/{code}`, **không in số tài khoản**), `paymentReceivedMail(order)`, `orderCancelledMail(order)` (lý do; nếu đã `paid` thêm "hoàn tiền trong 1-3 ngày làm việc"). Mọi thư có: mã đơn và trạng thái; từng dòng (tên, màu, size, số lượng, đơn giá); tạm tính, giảm giá kèm mã, phí giao, tổng; phương thức; người nhận, SĐT, địa chỉ; ngày giao dự kiến; hoá đơn công ty nếu có; link xem / tra cứu (`/account/orders/{code}` cho thành viên, `/track-order?code={code}` cho khách); cách huỷ; link chính sách đổi trả; hotline; câu chống lừa đảo nguyên văn ở CHK-CF-12. Tiền định dạng `459.000₫`. **Độ lệch cần ghi:** ảnh sản phẩm và "nút" bấm trong CHK-CF-11 chưa làm được bằng text; thay bằng link văn bản. HTML là việc riêng (cần đổi `MailMessage`, ngoài phạm vi này).
- Gửi: `scheduleOrderEmail(orderId)` chạy qua `runInBackground`: thử lần 1 ngay, lần 2 sau 10 giây, lần 3 sau 60 giây (tổng < 5 phút, BR-CHK-28); mỗi lần dùng `sendMail` (chờ kết quả), tăng `orders.email_attempts`; thành công -> `confirmation_email_sent_at = $now`. Sau lần 3 lỗi: gửi một thư tới `config.supportEmail` ("Không gửi được email xác nhận đơn {code}", **không** kèm email khách) và log `order-email-failed` chỉ với mã đơn và tên lỗi. Đơn **không bao giờ** bị huỷ vì email.
- `retryPendingEmails($now)` trong job nền: đơn `confirmation_email_sent_at IS NULL AND email_attempts < 3 AND created_at BETWEEN $now - 1h AND $now - 2 minutes` được gửi lại (phòng tiến trình chết sau commit). Email huỷ / đã nhận thanh toán gửi một lần sau commit, lỗi chỉ log (không bảng theo dõi).
- Log không chứa email đầy đủ, SĐT, địa chỉ, nội dung thư.

## 6. Test (vitest + supertest, DB cục bộ)

Chốt chặn như Slice 1, 2: `test/setup.ts` gọi `forceTestEnv()`; mọi thao tác xoá gọi `assertLocalTestDb()`. Thêm `resetCheckout()` ở `test/helpers.ts`: `TRUNCATE "idempotency_keys","order_access_grants","order_events","voucher_redemptions","order_items","orders","cart_lines","carts","vouchers" RESTART IDENTITY CASCADE` -> `resetCatalog()` -> `seedCheckout(prisma)` (địa giới nạp một lần ở `beforeAll`, không TRUNCATE mỗi test). `connection_limit` của DATABASE_URL test >= 10 (test đồng thời cần nhiều kết nối). Đồng hồ giả `useClock` cho giờ cắt 16:00, hết hạn 30 phút, hạn mã, giỏ 30 ngày. Thư: `setMailTransport(fake)` + `flushMail()`. Dữ liệu tham chiếu: giá seed Slice 2 (off-duty-top 390.000, weekend-shirt 550.000, after-hours-dress 890.000, the-everyday-blazer 1.290.000), blazer Đen/S tồn 5. Helper `makeVoucher({...})`, `loginMember()`, `placeOrderBody({...})`.

Test ánh xạ AC (AC chỉ có phần FE/E2E ghi ở dưới bảng):
| Mã test | Nội dung | AC |
| --- | --- | --- |
| T-LOC-01 | 34 tỉnh, `>= 3000` phường, mọi phường thuộc đúng 1 tỉnh; `wards` của tỉnh lạ -> 404; header cache 86400; công khai (cookie sai không 401) | CHK-06 |
| T-CHK-01 | `pricing.ts`: bảng ví dụ giá / voucher (999.000, 1.000.000, blazer + WELCOME15, trần 100.000, số tiền 500.000 trên 390.000) | VOU-07 |
| T-CHK-02 | `allocateByWeight`: tổng phần chia = giảm giá (property test 200 mẫu); dòng 550.000 nhận phần dư ở ví dụ AC-VOU-08 | VOU-08 |
| T-CHK-03 | `delivery.ts`: 4 tình huống thứ Hai 10:00, 16:30, thứ Sáu 10:00, thứ Sáu trước lễ do test tạo | CHK-11 |
| T-QUO-01 | Quote bỏ qua `price` giả trong body (390.000, phí 30.000, tổng 420.000, ngưỡng 1.000.000); khách không phiên và phiên sai đều 200 | CHK-10, 02 |
| T-QUO-02 | Làm tươi: tồn 2 / yêu cầu 4 -> `effectiveQuantity 2`, `limitedBy stock`; tồn 0 -> `out-of-stock`; DRAFT và id lạ -> `discontinued`; giá DB đổi -> `unitPrice` mới | CART-08, 09 |
| T-QUO-03 | 25 sản phẩm (5 x 5) -> 422 `field: items`; 31 dòng -> 422; 20 -> 200; `variantId` trùng -> 422 | CART-05 |
| T-QUO-04 | `paymentMethods`: 5.000.000 COD được, 5.001.000 `over-limit`; SĐT có 3 đơn COD `to_ship` -> `too-many-open-orders`; 2 đơn `delivery_refused_at` trong 6 tháng -> `too-many-refusals` (SQL); QR tắt -> `not-enabled` | CHK-23, 24 |
| T-QUO-05 | Chưa có `address` -> `addressRequired true`; ngày giao theo giờ giả | CHK-06, 11 |
| T-VOU-01 | Áp WELCOME15 + FREESHIP: giảm 58.000, phí miễn lý do `voucher`, tổng 332.000; thay bằng `T50K`: giảm 50.000, tổng 340.000, free-ship còn | VOU-01 |
| T-VOU-02 | Mã `KHONGCO`, `TFUT`, `TEXP`, `TOFF`, `TOUT`, `TMEM`: `reason` đúng từng cái; mã hết hạn **và** hết lượt -> `expired` | VOU-02, 03 |
| T-VOU-03 | Cùng SĐT khác email / cùng email khác SĐT dùng WELCOME15 -> `per-user-limit` (hoặc `first-order-only`); sau huỷ đơn D1 áp lại được; đơn COD còn hiệu lực -> `first-order-only`; đơn duy nhất đã huỷ -> áp được | VOU-04, 05 |
| T-VOU-04 | FREESHIP: 290.000 -> `min-spend` (`missingAmount 10000`), 390.000 -> phí về 0 không có dòng giảm, blazer -> `shipping-already-free`, lượt không tăng | VOU-06 |
| T-VOU-05 | Gỡ mã khi đổi giỏ (thêm blazer) và khi bỏ phiên (`TMEM` -> `login-required`) | VOU-10 (API) |
| T-VOU-06 | `vouchers/check`: 10 mã không tồn tại -> lần 11 `429` (kể cả mã đúng), `retryAfterSeconds <= 900`; 9 lần chưa khoá; sau 15 phút giả hết khoá | VOU-11 |
| T-VOU-07 | Mã `TEXP2` hết hạn giữa chừng: `POST /orders` -> 409 `voucher-changed`, 0 đơn, `removedVoucherCodes`, `quote` mới 420.000; gửi lại -> 201 | VOU-12 |
| T-VOU-08 | Đặt WELCOME15 với 2 dòng: `SUM(line_discount) = 141.000`, dòng 550.000 nhận dư | VOU-08 |
| T-VOU-09 | Hết hạn mã sau khi đặt: đơn giữ nguyên giảm giá và tổng | VOU-14 |
| T-VOU-10 | Huỷ đơn có mã còn hạn -> `used_count` giảm, `released_at` đặt, áp lại được; mã hết hạn lúc huỷ -> không trả, vẫn tính lượt riêng | VOU-15 |
| T-VOU-11 | Mã `tops` + loại hàng giảm giá (Should) cho after-hours-dress | VOU-16 |
| T-CART-01 | add / set / remove / change-variant: cộng dồn, cắt 5, cắt theo tồn + `notice`, dòng 31 -> 422 "Giỏ hàng tối đa 30 sản phẩm khác nhau."; hết hàng -> 409 | CART-02, 04 |
| T-CART-02 | change-variant gộp: Đen/S x4 + Đen/M x3 -> Đen/S = 5, `notice merged` `adjustedTo 5` | CART-06 |
| T-CART-03 | `GET /cart`: giá DB đổi, tồn giảm, DRAFT, id lạ; không sửa dữ liệu; 401 khi không phiên | CART-08, 09 (API) |
| T-CART-04 | Giỏ 31 ngày rỗng, 29 ngày còn (đồng hồ giả); hai thiết bị cùng thấy 2 dòng | CART-11, 12 |
| T-CART-05 | merge: X x2 + Y; khách X x2 + Z + id lạ -> X = 4, Y, Z; `mergedVariantIds` = {X, Z}; `addedCount 2`; `skippedVariantIds` = {id lạ} | CART-13 |
| T-CART-06 | merge cắt X = 5; tài khoản 29 dòng + 3 dòng mới -> 30 dòng, `evicted` là các dòng `updatedAt` cũ nhất | CART-14 |
| T-CART-07 | merge cùng `Idempotency-Key` hai lần -> lần 2 phát lại, giỏ không đổi; hai lần đồng thời -> 1 lần cộng | CART-15 |
| T-CART-08 | Đặt đơn thành viên chỉ xoá khỏi giỏ dòng đã mua | CART-07 (API) |
| T-ORD-01 | Đặt COD khách: 201, `to_ship` + `pending`, mã đơn khớp `^N2F\d{10}$`, tổng = `subtotal - discount + fee - feeDiscount`, `estimatedDelivery`, tồn trừ (blazer 5 -> 2 sau đặt 3), 1 email; phiên sai không 401; không có `userId` trong body | CHK-02, 14, 26, 30 |
| T-ORD-02 | Validation theo bảng AC-CHK-04..08: tên, SĐT (`+84` -> lưu `0...`), địa chỉ, ghi chú, email, hoá đơn, `acceptedTerms`, `field` đúng, 0 đơn, 0 trừ tồn | CHK-04, 05, 07, 08 |
| T-ORD-03 | Địa chỉ: `provinceCode` lạ, `wardCode` của tỉnh khác -> 422 `invalid-address` | CHK-06 |
| T-ORD-04 | `price-changed` khi giá tăng và khi giảm, 0 đơn, `quote` mới; gửi lại với số mới -> 201 | CHK-12 |
| T-ORD-05 | `stock-changed` chỉ dòng thiếu (`available 2`), tồn dòng đủ không đổi, 0 đơn; gộp **mọi** dòng thiếu | CHK-13 |
| T-ORD-06 | Idempotency: cùng khoá + nội dung -> cùng mã đơn, `200` + `Idempotency-Replayed`, 1 đơn, tồn trừ 1 lần, 1 email; khác nội dung -> 409; thiếu / 10 ký tự -> 422; sau 25 giờ giả -> lượt mới; lỗi 409 trước đó không đốt khoá | CHK-17, 18, 38 |
| T-ORD-07 | Đơn trùng 10 phút (Should): 409 `possible-duplicate` + `existingOrderCode`; `confirmDuplicate` -> 201; sau 11 phút không hỏi | CHK-20 |
| T-ORD-08 | 1.000 mã đơn: khớp regex, 6 số đầu = ngày VN, không trùng, tra cứu chữ thường / có `#` | CHK-21 |
| T-ORD-09 | Đổi tên, giá sản phẩm, `store_settings.shipping_fee` sau khi đặt: đơn giữ nguyên | CHK-22 |
| T-ORD-10 | COD > 5.000.000 và SĐT bị chặn -> 422 `field: paymentMethod`; QR tắt -> 422 | CHK-23, 24 |
| T-ORD-11 | `needs_confirm_call`: khách true; thành viên có đơn `completed` (SQL) và đơn < 1.000.000 -> false | CHK-26 |
| T-ORD-12 | Đơn khách trùng email tài khoản: không vào `GET /orders` của tài khoản đó | CHK-05, 30 |
| T-ORD-13 | Ràng buộc DB: trạng thái `abc`, `total` sai công thức, `stock_restored_at` khi chưa huỷ, tồn âm bị từ chối | CHK-28 |
| T-CAN-01 | Huỷ `to_pay` / `to_ship` -> `cancelled`, `cancelledBy customer`, tồn hoàn đủ, email huỷ; huỷ lần hai 409 `not-cancellable`, tồn không đổi; `to_receive` 409 | CHK-16, 29 |
| T-CAN-02 | Hết hạn: `to_pay` quá `paymentDueAt`: `expireDueOrders` -> `cancelled` actor `system`, tồn + lượt voucher hoàn, email; `GET /orders/{code}` quá hạn thấy `cancelled` ngay (lười); chạy hai lần không hoàn hai lần | CHK-27 |
| T-LKP-01 | `lookup/codes`: cùng phản hồi cho khớp và không khớp (mã sai, email sai); chỉ khớp mới có thư; 60 giây gửi lại | CHK-31 |
| T-LKP-02 | `verify`: đúng -> 200 + `Set-Cookie n2f_oa` (HttpOnly, `Path=/api/orders`, `Max-Age=1800`), không `userId`; `A@X.VN` hoa; sai mã đơn / email / OTP -> cùng 404 "Không tìm thấy đơn hàng phù hợp"; OTP dùng lại 404; sai nhiều lần khoá | CHK-31 |
| T-LKP-03 | Cookie `n2f_oa` xem / huỷ được đúng đơn của nó trong 30 phút, sau 31 phút giả -> 401, đơn khác -> 404; thành viên khác -> 404 | CHK-31, 32 |
| T-LST-01 | 12 đơn: trang 1 có 10 mới nhất trước, trang 2 có 2; đơn của người khác `GET` -> 404; phiên thu hồi -> 401 `unauthenticated` ở `GET /orders` và `cancel`, đơn không đổi | CHK-32, 33 |
| T-MAIL-01 | Nội dung email xác nhận: tiêu đề, đủ mục BR-CHK-28, câu chống lừa đảo, tổng khớp đơn; email chờ thanh toán không có số tài khoản | CHK-34 |
| T-MAIL-02 | SMTP giả lỗi: đơn vẫn 201, thử đúng 3 lần (đồng hồ giả), thư báo CSKH tới `supportEmail`, log không có email đầy đủ; `retryPendingEmails` gửi lại | CHK-35 |
| T-RL-01 | 121 quote / 60 giây, 11 đặt / 10 phút, 11 tra cứu / 15 phút -> 429 `retryAfterSeconds`; bộ đếm catalog / auth không đổi | CHK-36 |
| T-ERR-01 | Mỗi mã lỗi mới có HTTP và `code` đúng, không stack trace / SQL; tắt DB -> 500 `unavailable` | CHK-37 |
| T-CON-01 | **2 người mua món cuối**: biến thể T tồn 1, hai `POST /orders` đồng thời (`Promise.all`, khác khoá), lặp 20 lần (đặt lại tồn 1 giữa các lần): mỗi lần đúng 1 `201` và 1 `409 stock-changed`; tồn cuối 0; không lần nào âm; đúng 1 đơn | CHK-15, 14 |
| T-CON-02 | **2 đơn dùng mã cuối**: mã T `total_limit 1`, hai khách khác nhau đặt đồng thời, lặp 10 lần với mã mới: mỗi lần đúng 1 đơn có mã, người kia `409 voucher-changed`, không có đơn, **tồn của đơn thua không đổi**, `used_count = 1` | VOU-13 |
| T-CON-03 | Cùng `Idempotency-Key` gửi đồng thời 2 yêu cầu: 1 đơn, cả hai phản hồi cùng mã (một `201`, một `200`) | CHK-18 |
| T-CON-04 | Cùng khách (cùng SĐT) hai đơn đồng thời dùng mã `per_user_limit 1`: chỉ một đơn có mã | VOU-04 (đồng thời) |
| T-CON-05 | Đặt hàng + huỷ đơn khác đồng thời chạm cùng biến thể và cùng voucher, lặp 30 lần: không deadlock treo (mỗi yêu cầu xong < 5 giây), tồn cuối = ban đầu - tổng đơn chưa huỷ | thứ tự khoá |
| T-CON-06 | Hai yêu cầu huỷ cùng đơn đồng thời: một `200`, một `409`; tồn hoàn đúng một lần | CHK-16 |
| T-CON-07 | Đặt 3 đơn đồng thời cùng một biến thể (tồn 5, mỗi đơn 2): 2 đơn thành công, 1 thất bại, tồn cuối 1 | CHK-14 |
| T-MIG-01 | Migration: DB có `users`, `products`; `migrate deploy` hai lần; mọi bảng mới có RLS (`relrowsecurity`); không `DROP`/`TRUNCATE`/`DELETE` trong file migration (quét văn bản); seed hai lần sau 1 đơn dùng `N2FFREESHIP`: `used_count` giữ nguyên, voucher / địa giới / ngày nghỉ không trùng | CHK-41 |
| T-MIG-02 | CHECK: voucher `percent 95`, `used_count > total_limit`, `orders.total` sai, `line_discount > giá dòng`, `store_settings` thứ hai, `cart_lines.quantity 0` bị từ chối | CHK-28, 41 |
| T-QR-01 | (lát 3.8, chạy khi bật cờ) đặt `bank_transfer` -> `to_pay` + `pending`, `paymentDueAt = +30 phút`; `/payment` có số tiền, nội dung = mã đơn, `awaiting`; `applyIncomingTransfer` đủ / thiếu / thừa / sau khi huỷ; trùng `provider_tx_id` không cộng hai lần; quá hạn -> `expired` + hoàn tồn / lượt; cờ tắt -> 404 và `bank-transfer` 422 | CHK-27 |

AC chỉ kiểm ở FE / E2E (Playwright, không phải test BE): AC-CART-01, 03, 09 (phần giao diện), 10 (chặn mạng, debounce 300 ms), 19, 20; AC-CHK-01, 03, 09, 19 (nút khoá, Back/F5), 25 (tự chuyển sang chuyển khoản), 30 (trang thành công), 38 (giữ form); AC-VOU-09, 10 (phần giao diện); AC-CHK-39, 40 (cờ `checkoutMode`). Playwright mock phải giữ nguyên số test đạt (AC-CHK-40).

## 7. Thứ tự làm

0. Điều kiện: Slice 2 đạt các điều kiện (a)-(c) (decisions 2026-11-07); Orchestrator duyệt hợp đồng này và 4 giả định G1-G4 (cho phép làm trước, đổi sau theo quy trình contract).
1. `lib/errors.ts` + `middleware/error.ts`: 7 mã lỗi mới và trường `quote`/`stockIssues`/`removedVoucherCodes`/`existingOrderCode`; ghi `docs/decisions.md`; test hình dạng lỗi (T-ERR-01 phần mã). `npm run typecheck`, `npm test`.
2. Schema Prisma + migration `20261107000500_cart_checkout_schema` trên DB cục bộ (mục 2); `migrate diff` rỗng; T-MIG-01, T-MIG-02.
3. `lib/vn-time.ts`, `lib/money.ts`, `middleware/optional-auth.ts`, `middleware/rate-limit.ts`, `settings.service.ts`, `config/env.ts` (`APP_BASE_URL`, `BANK_*`), `mailer.sendMail`. `seed-checkout.ts` + `vn-locations.json` + `holidays-vn.json`; `resetCheckout()`.
4. Lát 3.1 - địa giới: `location` module (T-LOC-01). **(FE có thể bật chọn tỉnh/phường thật.)**
5. Lát 3.2 - tính tiền thuần: `pricing.ts`, `delivery.ts` (T-CHK-01..03).
6. Lát 3.3 - báo giá + voucher: `lines.service.ts`, `voucher.rules/service`, `quote.service`, `POST /checkout/quote`, `POST /vouchers/check`, rate limit, chống dò (T-QUO-*, T-VOU-01..06, 11, T-RL-01 phần quote).
7. Lát 3.4 - giỏ thành viên: `cart` module (T-CART-*).
8. Lát 3.5 - đặt đơn COD: `order-code`, `idempotency`, `place-order.service` (mục 4.4), mapper, `POST /orders`, email (mục 5) (T-ORD-*, T-VOU-07..10, T-MAIL-*, T-CON-01..04, 07).
9. Lát 3.6 - xem / huỷ / tra cứu: `order.service`, `cancel-order.service`, `lookup.service`, `GET /orders`, `GET /orders/{code}`, `cancel`, `lookup/*` (T-CAN-01, T-LKP-*, T-LST-01, T-CON-05, 06).
10. Lát 3.7 - hết hạn đơn: `expiry.job.ts` (`expireDueOrders`, `retryPendingEmails`, `purgeExpired`), `setInterval` trong `server.ts`, lười khi đọc (T-CAN-02).
11. Lát 3.8 - QR (chỉ khi Thắng chốt G2): `GET /orders/{code}/payment`, migration `20261107000600_payment_transactions`, `applyIncomingTransfer`, route webhook, đổi contract nếu thêm path (T-QR-01).
12. `npm run typecheck`, `npm run build`, `npm test` (3 lần liên tiếp do vấn đề vitest crash Windows, hoặc trên Linux / CI). Báo kết quả thật. Cập nhật `openapi.yaml` nếu lệch (đề xuất đổi qua `docs/handoff.md` vì đã locked). Ghi `docs/handoff.md`.
13. `migrate deploy` + `seed:checkout` lên Supabase theo yêu cầu của Orchestrator / Thắng; kiểm bằng `curl` quote / đặt một đơn COD thử rồi huỷ (trả tồn); chạy bản đo hiệu năng đặt hàng.
14. Giao danh sách việc FE (mục 8).

## 8. Điểm FE phải đổi để khớp hợp đồng

1. **Cờ cấu hình:** thêm `checkoutMode: 'mock' | 'http'` vào `ApiConfig` (`core/api-config.ts`, `api-config.e2e.ts`, như `authMode`, `catalogMode`); `CHECKOUT_API` và adapter đơn hàng chọn theo cờ này. Ở `http` bỏ chặn "Thanh toán hiện chưa khả dụng"; ẩn "Địa chỉ đã lưu", "Mã của bạn", ghi chú "Bản trải nghiệm" (BR-CHK-32); điền họ tên / email từ phiên. Ở `mock` giữ nguyên (AC-CHK-40).
2. **`CheckoutApi` / `HttpCheckoutApi`** (`checkout-api.ts`): `QuoteRequest.voucherCode` -> `voucherCodes: string[]` (2 ô mã: giảm + free-ship); `CheckoutQuote` đổi theo `Quote` (dòng làm tươi, `vouchers`, `rejectedVouchers[].reason`, `shipping`, `paymentMethods`, `policy`); `placeOrder` gửi `items`, `contact`, `address`, `paymentMethod`, `invoice`, `acceptedTerms`, **`expected`** (giá dòng + `pricing` đang hiển thị), `Idempotency-Key`; phản hồi `{order}` thay `OrderReceipt` cũ. Đường dẫn: `POST /checkout/quote`, `POST /orders` (không còn `/orders/track`, `/orders/track/cancel`).
3. **Lỗi theo `error.code`, không theo HTTP status** (K19): `toCheckoutError` đọc `body.error.code`; thêm `CheckoutErrorCode`: `validation` (+ `field`), `invalid-address`, `stock-changed` (+ `stockIssues`), `price-changed` (+ `quote`), `voucher-changed` (+ `removedVoucherCodes`, `quote`), `idempotency-conflict`, `possible-duplicate` (+ `existingOrderCode`), `not-cancellable`, `not-found`, `unauthenticated`, `rate-limited` (+ `retryAfterSeconds`), `unavailable`. Câu thông báo ghép ở FE theo `reason` / `code` (BR-VOU-04). `422 validation` gắn `field` vào đúng ô (bỏ "Địa chỉ giao hàng chưa hợp lệ" cho mọi 422). Mất kết nối: giữ form, giỏ, mã; **không tự gửi lại**, nút Thử lại dùng cùng `Idempotency-Key` (sinh một lần mỗi lượt checkout, lưu trong `sessionStorage` tới khi 201/4xx dứt khoát).
4. **Giỏ thành viên:** thêm `CartApi` (`GET /cart`, add / set / remove / change-variant / merge). `CartState` ở `http` + đã đăng nhập: nguồn sự thật là máy chủ (thấy thay đổi ở lần tải kế tiếp); khách chưa đăng nhập: `localStorage` như cũ và **không gọi `/cart/**`** (AC-CART-11). `CartLine` thêm `maxQuantity`, `availability`; bỏ `applyStock` xoá dòng hết hàng, thay bằng dòng mờ "Đã hết hàng" / "Sản phẩm không còn kinh doanh" (K5, K23). Hạn mức 5 / 20 / 30 đọc từ `policy`, không hằng số. Hoàn tác 5 giây = thêm lại đúng số lượng (Should).
5. **Làm tươi giá / tồn mọi lần mở giỏ và checkout:** khách -> `POST /checkout/quote` (debounce 300 ms sau thao tác cuối, 1 request cho nhiều lần bấm); thành viên -> `GET /cart`. FE so `unitPrice` với bản chụp cục bộ để hiện "Giá đã thay đổi từ X₫ thành Y₫" (server không lưu giá đã thấy); lỗi mạng / 5xx / 429: hiện bản lưu + "Chưa cập nhật được giá mới nhất" + Thử lại, khoá Thanh toán.
6. **Gộp giỏ khi đăng nhập (BR-CART-10):** sau đăng nhập / đăng ký, gọi `POST /cart/merge` **chỉ với phần chênh**: giữ `baseline` cục bộ (`variantId -> quantity` của lần đồng bộ máy chủ gần nhất) và gửi `max(0, local - baseline)` mỗi dòng, mỗi lượt gộp một `Idempotency-Key` sinh trước khi gọi (lưu để Thử lại). Nhờ vậy AC-CART-18 (phiên bị thu hồi, thêm dòng Z, đăng nhập lại) không nhân đôi phần đã có. Thành công: đặt `baseline` = giỏ máy chủ, chọn chỉ `mergedVariantIds`, báo một lần "Đã thêm N sản phẩm...", chuyển `evicted` (có `productId`) vào wishlist cục bộ. Lỗi mạng: giữ giỏ khách, thử lại lần tải kế tiếp. Đăng nhập ngay ở checkout: chỉ các dòng đã chọn sang checkout (BR-CART-11).
7. **Đăng xuất chủ động (CART-15, K3):** xoá giỏ hiển thị trên thiết bị (`localStorage` + `baseline`), giỏ khách mới rỗng; hết phiên / bị thu hồi (401) thì **giữ** giỏ hiển thị (BR-AUTH-32). Cần sửa chỗ đang giữ giỏ khi `logout`.
8. **Địa giới:** `LocationApi` http gọi `GET /locations/provinces`, `GET /locations/provinces/{code}/wards`; bỏ danh sách 3 thành phố của mock ở chế độ `http`; đổi tỉnh xoá phường.
9. **Ánh xạ trạng thái** API -> `OrderStatus` hiện có (một hàm `mapOrderStatus` đặt cạnh `order-status.ts`): `to_pay` -> `pending-payment`; `to_ship` -> `processing` (COD cần gọi xác nhận có thể hiện thêm câu "sẽ gọi trong 2 giờ làm việc" theo `willCallToConfirm`); `to_receive` -> `shipping` / `delivering`; `completed` -> `completed`; `cancel_requested` -> thêm trạng thái mới ở FE khi Admin làm; `cancelled` -> `cancelled`. `Order` API -> `Order` FE: `placedAt`, `paymentStatus` + `paymentMethod` -> `payment {method, label, paid}`, `recipient` + `shippingAddress` -> `shippingAddress.{recipient, phone, ...}`, `vouchers[0..]` -> `voucherCode`, `timeline`, `cancelledBy`. Trang thành công: lưu biên nhận trong `sessionStorage` của tab, Back / F5 về trang đơn, không mở lại form (K17, AC-CHK-19).
10. **Đơn của thành viên:** tách adapter đơn hàng khỏi `ACCOUNT_API` theo `checkoutMode` (K20): `GET /orders?page=&limit=10` ("Xem thêm"), `GET /orders/{id}`, `POST /orders/{id}/cancel`; `401 unauthenticated` -> `/auth/login?returnUrl=…` với "Phiên đăng nhập đã hết hạn…", giữ giỏ (AC-CHK-33). Profile / địa chỉ / voucher vẫn mock.
11. **Tra cứu đơn khách** (`track-order-page.ts`): luồng 2 bước thay "mã + SĐT/email": (1) `POST /orders/lookup/codes {orderCode, email}` -> hiện ô nhập OTP (cùng thông báo dù khớp hay không, đếm ngược `resendAfterSeconds`); (2) `POST /orders/lookup/verify` -> hiện đơn; huỷ đơn gọi `POST /orders/{code}/cancel` kèm cookie `n2f_oa` (cần `withCredentials`). Sai -> "Không tìm thấy đơn hàng phù hợp". Mã đơn, email, OTP chỉ trong body (không vào URL). Bỏ `trackOrder` / `cancelOrder` (TrackOrderRequest `contact`).
12. **Thanh toán QR** (`payment-page.ts`): `GET /orders/{code}/payment` poll 5 giây; `PaymentSession` mới (`transferContent`, `account`, `qrImageUrl`, `shortfall`); bỏ `PAYMENT_SIMULATOR` ở `http`; ẩn lựa chọn `bank-transfer` khi `policy.bankTransferEnabled` sai (G2) và khi đó đơn > 5.000.000 hiện lý do + hotline (AC-CHK-25).
13. **Chính sách:** `core/store-policy.ts` ở `http` lấy từ `policy` của `quote` / `GET /cart` (phí 30.000, ngưỡng 1.000.000, COD 5.000.000, hạn mức) thay vì hằng số; ghi chú giao hàng ≤ 250, tên 2-50, SĐT đầu 03/05/07/08/09 theo BR-CHK-04 (FE hiện nới hơn).
14. **Tồn kho hiển thị (BR-CAT-11):** sau khi đặt đơn thật, PLP / PDP thấy tồn mới trong ≤ 30 giây (cache catalog 10 giây) - FE không cần đổi, chỉ lưu ý khi viết E2E (AC-CHK-14).
15. **Id:** `variantId` đã là UUID từ Slice 2; id cũ (`01-0-S`) trong `localStorage` hiện "Sản phẩm không còn kinh doanh", chỉ có nút Xoá (K23).

## 9. Rủi ro và câu hỏi mở (kèm phương án đề xuất)

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| Q1 | G1-G4 chưa có xác nhận của Thắng (COMMON, QR, địa giới, huỷ `to_ship`) | Làm theo đề xuất PO; đổi tên trạng thái / hành vi sau này là đổi contract locked (quy trình handoff). G2 không chặn: QR là lát 3.8, các lát khác chạy độc lập. |
| Q2 | Số điện thoại khách vãng lai là khoá "cùng khách" cho lượt voucher: người khác có thể cố tình dùng SĐT của người khác để đốt lượt | Chấp nhận (nguồn yêu cầu nhận diện theo SĐT hoặc email); giới hạn tần suất đặt đơn 10/10 phút/IP; theo dõi sau go-live. |
| Q3 | Email có HTML, ảnh sản phẩm trong thư (CHK-CF-11) | Slice này gửi text thuần + link; HTML cần đổi `MailMessage` (việc riêng, backlog). |
| Q4 | Mã đơn chỉ 10.000 giá trị mỗi ngày: từ khoảng 5.000 đơn/ngày xác suất va chạm lần đầu cao, thử lại 10 lần | Đủ cho đồ án; nếu cần mở rộng thì tăng số chữ số là đổi nguồn BR (CHK-CF-07), không tự làm. |
| Q5 | Khách huỷ `to_ship` thẳng bỏ qua bước CSKH (G4) | Chấp nhận tới khi có Admin; sau đó `to_ship` chuyển `cancel_requested` (đổi contract). |
| R1 | Deadlock giữa đặt hàng, huỷ, hết hạn | Một thứ tự khoá duy nhất (mục 4.4); thử lại 3 lần với `P2034`/`40P01`; T-CON-05. |
| R2 | Điểm nóng khoá dòng voucher: mọi đơn dùng cùng mã chạy tuần tự trong lúc giữ khoá | Chấp nhận ở quy mô này (giữ khoá ngắn, giao dịch < vài trăm ms); nếu đo thấy chậm, tách bước voucher ra giao dịch ngắn đầu tiên không đổi thứ tự khoá. |
| R3 | Lệch múi giờ: DB cục bộ có thể đặt `timezone` khác UTC; `now()` DB không dùng được với đồng hồ giả | Mọi thời gian truyền qua tham số `$now` từ `lib/clock`; so sánh `timestamp` UTC; không dùng `now()` trong SQL của slice này. |
| R4 | Phụ thuộc pgbouncer của Supabase (cổng 6543, chế độ transaction) với giao dịch tương tác và `pg_advisory_xact_lock` | Khoá `xact` vẫn đúng trong chế độ transaction; `$queryRaw` có tham số cần `?pgbouncer=true` đã có ở `DATABASE_URL`; migration / seed dùng `DIRECT_URL`. Kiểm bằng một đơn thật ở bước 13. |
| R5 | `migrate dev` đòi `DROP INDEX`/thay đổi cho thứ Prisma không biểu diễn (CHECK, index biểu thức) | CHECK không bị diff; tránh index partial / biểu thức; luôn `--create-only`, đọc SQL, xoá `DROP` ngoài ý muốn. |
| R6 | Dữ liệu địa giới và ngày nghỉ phụ thuộc nguồn bên ngoài, dễ sai mã / thiếu phường | Ghi `_source`, `_asOf`; test đếm 34 tỉnh, `>= 3000` phường, không phường mồ côi; ngày nghỉ thiếu không làm sai logic (chỉ lệch ngày giao dự kiến). |
| R7 | Tiền xử lý `expected` buộc FE gửi đúng số đang hiển thị; sai lệch làm lặp `price-changed` | Đã định nghĩa so sánh từng giá dòng + 5 trường `pricing`; FE lấy số từ chính `Quote` cuối cùng; test T-ORD-04. |
| R8 | Giỏ khách / thành viên và `baseline` ở FE phức tạp, dễ nhân đôi dòng nếu quên gửi phần chênh | `merge` có `Idempotency-Key`; test E2E AC-CART-15, 18; mô tả rõ ở mục 8.6. |
| R9 | Job nền `setInterval` chết khi tiến trình khởi động lại; email có thể mất giữa commit và gửi | Hết hạn còn có kiểm lười khi đọc; `retryPendingEmails` bù email chưa gửi; mọi thao tác job idempotent (`stock_restored_at`, `confirmation_email_sent_at`). |
| R10 | Bộ đếm tần suất cart / quote / order-create nằm trong RAM theo instance | Chấp nhận (như catalog); chống dò voucher và OTP dùng DB (`auth_rate_limits`) nên bền. |
| R11 | Vitest crash ngẫu nhiên trên Windows (vấn đề đã biết), test đồng thời dùng nhiều kết nối | Chạy 3 lần liên tiếp hoặc trên Linux / CI; `connection_limit >= 10` cho DB test. |
| R12 | Thư viện mới | Không thêm. Dùng `zod`, `@prisma/client`, `nodemailer`, `cookie-parser`, `vitest`, `supertest` đã có; `node:crypto` cho CSPRNG / băm; không cần thư viện ngày giờ hay lập lịch (`setInterval`). |
