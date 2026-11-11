# Kế hoạch triển khai Admin tổng quan & cài đặt cửa hàng (Slice 8) - draft 2026-11-12

Hợp đồng: `docs/api/openapi.yaml` (phần Slice 8 `status: draft`, 7 operation, tag `admin-dashboard`, `admin-reports`, `admin-store-settings`, `admin-audit`, `store-settings`; chuyển `locked` sau khi Orchestrator duyệt mục 14, trước khi FE nối). BR/AC: `docs/product/PRD.md` mục "Slice 8" (BR-INS-01..09, BR-DSH-01..08, BR-RPT-01..09, BR-SET-01..13, BR-AUD-01..05; AC-INS-01..13, AC-DSH-01..10, AC-RPT-01..11, AC-SET-01..16, AC-AUD-01..05; S8-Q1..Q10). Lát giao: `docs/product/backlog.md` mục "Slice 8" (8.1-8.8). Khi mâu thuẫn, PRD thắng, trừ các điểm đã ghi ở mục 14 (chọn cách an toàn, chờ PO). Chỉ là tài liệu: agent triển khai làm theo mục 12 không cần hỏi lại. Cùng khuôn với `docs/api/admin-users-implementation-plan.md` (đọc mục 3, 4, 8, 9: `requirePermission`, `adminRateLimit`, `noStore`, nhật ký chỉ thêm).

## 0. Câu hỏi S8-Q1..Q10

Làm theo mặc định PO. Tham số gom vào khối `INSIGHTS_ASSUMPTIONS` trong `backend/src/config/assumptions.ts` (cạnh `USERS_ASSUMPTIONS`); bảng quyền `INSIGHT_PERMISSIONS` cùng file; giá trị mặc định thông tin cửa hàng `STORE_SETTINGS_SEED` (bằng `STORE_INFO` / `STORE_POLICY` của FE).

| Q | Mặc định | Lật ở đâu | Hệ quả khi lật |
| --- | --- | --- | --- |
| S8-Q1 | doanh thu = `completed` + `paid`, ngày `delivered_at` VN, hàng sau giảm, không ship | `revenue.sql.ts` (một chỗ, mục 5) | Đổi một điều kiện `WHERE` + test AC-INS-12/13; mọi màn tự đổi theo |
| S8-Q2 | staff không thấy tiền ở Tổng quan | `INSIGHT_PERMISSIONS.staff` thêm `dashboard.revenue` + `permissions.ts` FE | Một dòng ở hai nơi; staff vẫn 403 ở Báo cáo nếu tách `reports.view` (không tách ở bản này) |
| S8-Q3 | nhật ký hợp nhất làm ở mức Should | lát 8.5 tách riêng | Hoãn = bỏ route `/admin/audit-log`, bảng `store_settings_events` vẫn giữ (BR-SET-09 là Must) |
| S8-Q4 | Must 6 tham số; Should giỏ / COD; không sửa `low_stock_default`, chuyển khoản, đổi trả, hạng | `AdminStoreSettingsInput` + Zod `settings.schemas.ts` | Thêm tham số = thêm cột + trường contract |
| S8-Q5 | báo cáo <= 366 ngày, nhật ký <= 92 ngày, biểu đồ 30 ngày | `INSIGHTS_ASSUMPTIONS.reportMaxDays / auditMaxDays / seriesDays` | Tham số |
| S8-Q6 | CSV một tệp 5 khối, BOM, chống công thức | `csv.ts` | Tham số / hàm thuần |
| S8-Q7 | thông tin cửa hàng như `STORE_INFO` | cột `store_settings` (mục 2) | Thêm trường = migration mới |
| S8-Q8 | trường FE không có dữ liệu = Won't | - | Slice sau (cần cột giá vốn, bảng trả hàng) |
| S8-Q9 | `public, max-age=60` | `INSIGHTS_ASSUMPTIONS.publicSettingsMaxAge` | Tham số |
| S8-Q10 | khoảng giá trị tham số như BR-SET-05, 06 | `settings.schemas.ts` | Tầng ứng dụng, không cần migration (CHECK DB có sẵn rộng hơn) |

## 1. Phạm vi BE Slice 8

7 operation:

| Tag | Endpoint | Quyền | Giới hạn |
| --- | --- | --- | --- |
| admin-dashboard | `GET /admin/dashboard?range=today\|7d\|30d` | staff, admin (`dashboard.view`); phần tiền chỉ admin (`dashboard.revenue`) | đọc 120 / 60 giây |
| admin-reports | `GET /admin/reports/sales?from&to&sort` | admin (`dashboard.revenue`) | đọc 120 + riêng 20 / 60 giây |
| admin-reports | `GET /admin/reports/sales/export?from&to` (CSV, Should) | admin | chung bộ đếm 20 / 60 giây với trên |
| admin-store-settings | `GET /admin/settings/store`, `PUT /admin/settings/store` | admin (`settings.store`) | đọc 120, ghi 60 / 60 giây |
| admin-audit | `GET /admin/audit-log?from&to&targetType&page&limit` (Should) | admin (`settings.audit`) | đọc 120 / 60 giây |
| store-settings | `GET /store/settings` | công khai | catalog 120 / 60 giây / IP, `Cache-Control: public, max-age=60` |

Mã lỗi: **không thêm mã mới**. Dùng lại `unauthenticated` 401, `forbidden` 403, `origin-not-allowed` 403, `validation` 422, `version-conflict` 409 (Slice 6), `rate-limited` 429, `not-found` 404, `unavailable` 500. Thêm MỘT trường tuỳ chọn cho `ErrorResponse.error`: `fieldErrors: [{field, message}]` (chỉ `PUT /admin/settings/store`, AC-SET-02 cần trả mọi lỗi một lần; phần tử đầu trùng `field` / `message`). Cách làm: `Errors.validationMany(issues)` (`errors.ts`) và `parseBodyAll(schema, body)` (`validate.ts`, trả mọi `issue` đã qua `fieldOf`); `parseBody` hiện tại giữ nguyên.

Ngoài phạm vi: lãi gộp / giá vốn, trả hàng, đơn giao thất bại, ABC, tồn lâu, theo vùng, heatmap, size / màu, báo cáo khách / voucher, nhóm Đổi trả và Hạng thành viên ở Cài đặt, `bank_transfer_enabled` và tài khoản ngân hàng, nhật ký sản phẩm / voucher, xuất nhật ký, tìm văn bản trong nhật ký, nội dung (collections, bảng size, đánh giá, trang chủ).

## 2. Schema Prisma và migration (chỉ cộng thêm, BR-INS-06)

Một migration `backend/prisma/migrations/20261112000100_admin_insights_schema/` (sau `20261111000100`). **Không `DROP` / `TRUNCATE` / `RENAME` / đổi kiểu, không `UPDATE` / `INSERT` dữ liệu.** Chỉ: `ALTER TABLE "store_settings" ADD COLUMN ... NOT NULL DEFAULT <giá trị seed>` (dòng id = 1 đang có tự nhận giá trị mặc định = `STORE_INFO`, không cần `UPDATE`), `ADD CONSTRAINT` (các cột mới), `CREATE TABLE`, `CREATE INDEX IF NOT EXISTS`, `ENABLE ROW LEVEL SECURITY`.

Quy trình: `npx prisma migrate dev --create-only --name admin_insights_schema` trên DB cục bộ `n2f_dev`; mở SQL, thêm tay CHECK, RLS, sửa `CREATE INDEX` thành `IF NOT EXISTS`; quét `DROP|TRUNCATE|DELETE FROM|RENAME|ALTER COLUMN .* TYPE`: có thì dừng (cụm `ON DELETE SET NULL` của FK là hợp lệ). Áp lên Supabase chỉ khi Thắng duyệt (lát 8.7); Orchestrator / Thắng chạy `migrate deploy` (`DIRECT_URL`), không `migrate dev` / `reset` / `db push`.

SQL dự kiến:

```sql
-- Thông tin cửa hàng (BR-SET-02..04): cột trên bảng singleton đang có. Mặc định = STORE_INFO của FE (D7), nên storefront không đổi gì cho tới khi admin sửa.
ALTER TABLE "store_settings"
  ADD COLUMN "legal_name"          VARCHAR(120) NOT NULL DEFAULT 'Công ty TNHH Thời trang Nine2Fine',
  ADD COLUMN "registration_number" VARCHAR(13)  NOT NULL DEFAULT '0319245768',
  ADD COLUMN "registration_issuer" VARCHAR(100) NOT NULL DEFAULT 'Sở Tài chính TP. Hồ Chí Minh',
  ADD COLUMN "registration_date"   DATE                  DEFAULT DATE '2025-08-15',
  ADD COLUMN "address"             VARCHAR(200) NOT NULL DEFAULT 'Tầng 5, 172 Hai Bà Trưng, Phường Tân Định, TP. Hồ Chí Minh',
  ADD COLUMN "hotline"             VARCHAR(20)  NOT NULL DEFAULT '1900 6868 29',
  ADD COLUMN "email"               VARCHAR(254) NOT NULL DEFAULT 'cskh@nine2fine.vn',
  ADD COLUMN "privacy_email"       VARCHAR(254) NOT NULL DEFAULT 'dulieu@nine2fine.vn',
  ADD COLUMN "hours"               VARCHAR(100) NOT NULL DEFAULT '9:00 – 21:00, tất cả các ngày trong tuần',
  ADD COLUMN "notification_url"    VARCHAR(300) NOT NULL DEFAULT '',
  ADD COLUMN "social_facebook"     VARCHAR(300) NOT NULL DEFAULT '',
  ADD COLUMN "social_instagram"    VARCHAR(300) NOT NULL DEFAULT '',
  ADD COLUMN "social_tiktok"       VARCHAR(300) NOT NULL DEFAULT '',
  ADD COLUMN "social_youtube"      VARCHAR(300) NOT NULL DEFAULT '';

-- Lưới cuối của BR-SET-02..04 (tầng ứng dụng là nơi báo lỗi theo trường). Dòng hiện có thoả vì mặc định thoả.
ALTER TABLE "store_settings"
  ADD CONSTRAINT "chk_store_info_text"    CHECK (char_length("legal_name") >= 2 AND char_length("address") >= 10),
  ADD CONSTRAINT "chk_store_info_reg"     CHECK ("registration_number" ~ '^([0-9]{10}|[0-9]{13})$'),
  ADD CONSTRAINT "chk_store_info_hotline" CHECK (
        regexp_replace("hotline", '[ .-]', '', 'g') ~ '^(0|1800|1900)[0-9]*$'
    AND char_length(regexp_replace("hotline", '[ .-]', '', 'g')) BETWEEN 8 AND 11),
  ADD CONSTRAINT "chk_store_info_urls"    CHECK (
        ("notification_url" = '' OR "notification_url" ~ '^https://[^[:space:]]+$')
    AND ("social_facebook"  = '' OR "social_facebook"  ~ '^https://[^[:space:]]+$')
    AND ("social_instagram" = '' OR "social_instagram" ~ '^https://[^[:space:]]+$')
    AND ("social_tiktok"    = '' OR "social_tiktok"    ~ '^https://[^[:space:]]+$')
    AND ("social_youtube"   = '' OR "social_youtube"   ~ '^https://[^[:space:]]+$'));

-- Nhật ký đổi cài đặt (BR-SET-09): chỉ INSERT / SELECT trong mã. 1 dòng / lần lưu có thay đổi.
CREATE TABLE "store_settings_events" (
    "event_id"      UUID         NOT NULL DEFAULT gen_random_uuid(),
    "at"            TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    "actor_user_id" UUID,
    "actor_name"    VARCHAR(100) NOT NULL,
    "actor_role"    "user_role"  NOT NULL,
    "changes"       JSONB        NOT NULL,      -- [{"field","label","before","after"}], mỗi giá trị <= 300 ký tự
    CONSTRAINT "store_settings_events_pkey" PRIMARY KEY ("event_id")
);
ALTER TABLE "store_settings_events" ADD CONSTRAINT "store_settings_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;   -- như account_events: dọn người dùng test không bị chặn
ALTER TABLE "store_settings_events"
  ADD CONSTRAINT "chk_store_settings_events_actor"   CHECK ("actor_role" = 'admin'),
  ADD CONSTRAINT "chk_store_settings_events_changes" CHECK (jsonb_typeof("changes") = 'array' AND jsonb_array_length("changes") BETWEEN 1 AND 40);

-- Chỉ mục phục vụ truy vấn (BR-INS-06). Không dùng chỉ mục từng phần (xem mục 13 R6).
CREATE INDEX IF NOT EXISTS "idx_store_settings_events_at" ON "store_settings_events" ("at" DESC, "event_id" DESC);
CREATE INDEX IF NOT EXISTS "idx_order_events_at"          ON "order_events"          ("at" DESC, "event_id" DESC);
CREATE INDEX IF NOT EXISTS "idx_inv_adj_at"               ON "inventory_adjustments" ("at" DESC, "adjustment_id" DESC);
CREATE INDEX IF NOT EXISTS "idx_account_events_at"        ON "account_events"        ("at" DESC, "event_id" DESC);
CREATE INDEX IF NOT EXISTS "idx_orders_status_delivered"  ON "orders"                ("status", "delivered_at");

-- RLS (không policy: chỉ vai trò máy chủ truy cập)
ALTER TABLE "store_settings_events" ENABLE ROW LEVEL SECURITY;
```

Prisma: cộng 14 trường vào `model StoreSetting` (`legalName`, ..., `socialYoutube`, `@map`); `model StoreSettingsEvent` (`@@map("store_settings_events")`, `changes Json`, quan hệ có tên `StoreSettingsEventActor` trên `User`); khai báo cả 5 `@@index(..., map: "<tên trên>")` trong `schema.prisma` (bắt buộc: `migrate diff --from-migrations --to-schema-datamodel` phải rỗng; chỉ mục không khai báo sẽ bị Prisma coi là lệch). `order_events` dùng `@@index([at(sort: Desc), event_id(sort: Desc)], map: "idx_order_events_at")`; `inventory_adjustments`: `[at(sort: Desc), adjustment_id(sort: Desc)]`; `account_events`: `[at(sort: Desc), eventId(sort: Desc)]`; `orders`: `[status, deliveredAt]`.

Test: `migrate deploy` hai lần, `diff` rỗng, số dòng `orders`, `users`, `store_settings` không đổi, dòng `store_settings` id 1 có đúng giá trị `STORE_INFO` sau migration, `store_settings_events` bật RLS, CHECK hình dạng (chèn `registration_number` 9 chữ số, hotline `1900`, URL `http://`, `changes` = `[]` bị từ chối), năm chỉ mục tồn tại (`pg_indexes`), quét tệp SQL không có `DROP|TRUNCATE|RENAME|ALTER COLUMN .* TYPE` (mở rộng `admin-catalog-migration.test.ts` hoặc file `insights-migration.test.ts` mới).

Chi phí: `idx_order_events_at` ghi thêm mỗi sự kiện đơn (bảng nhỏ ở quy mô đồ án, chấp nhận). Không thêm chỉ mục `users(created_at)` (đếm khách mới quét bảng `users` nhỏ).

## 3. Module backend

```
backend/src/lib/errors.ts                 + Errors.validationMany(issues)   (không đổi ErrorCode / STATUS)
backend/src/lib/validate.ts               + parseBodyAll(schema, body)      (trả mọi lỗi theo trường)
backend/src/lib/vn-time.ts                + vnDayBoundsUtc(isoFrom, isoTo) -> {from, to} UTC; daysBetween(a, b); isRealDate(iso)  (dùng vnStartOfDay, addCalendarDays có sẵn)
backend/src/lib/money-math.ts             divRoundHalfUp(a, b), ratio4(a, b)  (số nguyên, mục 4)
backend/src/config/assumptions.ts         + INSIGHTS_ASSUMPTIONS, InsightPermission, INSIGHT_PERMISSIONS, STORE_SETTINGS_SEED
backend/src/middleware/require-permission.ts   Permission = Catalog | User | InsightPermission
backend/src/middleware/rate-limit.ts      + adminReportLimit (20 / 60 giây, key byAdminUser, name 'admin-report')
backend/src/modules/insights-admin/
  insights-admin.routes.ts    4 router: adminDashboardRouter, adminReportsRouter, adminSettingsRouter, adminAuditRouter (Zod gắn ở đây)
  insights.schemas.ts         range, from/to/sort (report), audit query, parseDateRange()
  revenue.sql.ts              MỘT nguồn định nghĩa doanh thu (mục 5): revenueOrdersCte(), revenueLines, periodKpis(db, range)
  dashboard.service.ts        getDashboard(role, range, now)
  report.service.ts           getSalesReport(db, from, to, sort)  (dùng cho JSON và CSV)
  csv.ts                      toSalesCsv(report): hàm thuần, BOM, chống công thức
  audit.query.ts              listAudit(db, {from, to, targetType, page, limit})  (UNION ALL, mục 9)
  settings.schemas.ts         Zod của AdminStoreSettingsInput (mục 8)
  settings.service.ts         getAdminSettings(db), updateSettings(actor, body)  (giao dịch, so sánh, nhật ký)
  settings.diff.ts            flatten + diff + nhãn tiếng Việt + cắt 300 ký tự
backend/src/modules/store/
  settings.service.ts         + getPublicSettings(db) (rơi về STORE_SETTINGS_SEED khi thiếu dòng), toPublic(); getSettings() giữ nguyên
  store.routes.ts             storeRouter: GET /settings (catalogRateLimit, public max-age=60)
backend/src/modules/order-admin/order-admin.query.ts   export countOrders(): dùng lại, không đổi
backend/src/modules/catalog-admin/inventory.query.ts   export inventoryCounts(db) (trích từ inventoryFacets: countStatuses + buildWhere rỗng)
backend/src/mail/order-templates.ts   HOTLINE hằng số -> tham số (mục 8.4)
backend/src/app.ts
  const adminInsights = [noStore, requireAuth('admin'), requireRole('staff', 'admin'), adminRateLimit];
  api.use('/admin/dashboard',  ...adminInsights, adminDashboardRouter);
  api.use('/admin/reports',    ...adminInsights, adminReportsRouter);
  api.use('/admin/settings',   ...adminInsights, adminSettingsRouter);   // chỉ có /store ở bản này; cạnh /admin/customers (SAU originGuard)
  api.use('/admin/audit-log',  ...adminInsights, adminAuditRouter);
  api.use('/store', storeRouter);   // TRƯỚC originGuard, cạnh catalogRouter / locationRouter: phương thức ghi -> 404 not-found như catalog
backend/test/helpers.ts       + insertRevenueOrder({...}) (chèn thẳng `completed` + `paid` + `delivered_at` + dòng đơn, không đi qua checkout), makeFixtureO1..O9, resetState() thêm "store_settings_events" vào TRUNCATE và đưa dòng `store_settings` id 1 về mặc định (UPDATE ... = seed) để các test đổi cài đặt không rò sang test khác
```

`requireAuth('admin')` đọc lại vai trò và `is_active` từ DB mỗi yêu cầu (BR-INS-01). `requirePermission` đứng **trước** Zod và trước mọi truy cập DB. `adminReportLimit` đứng SAU `requirePermission` (staff 403 không đốt bộ đếm admin, như Slice 7).

## 4. Quy ước chung

- **Giờ VN tường minh UTC (bắt buộc, BR-INS-08).** Postgres cục bộ đặt `timezone = Asia/Bangkok` (UTC+7 trùng VN nên lỗi múi giờ **không lộ cục bộ**), Supabase là UTC. Mọi cột thời gian là `timestamp(6)` không múi giờ, ghi UTC bằng `lib/clock`. Quy tắc cho mọi SQL của slice này:
  1. **Không dùng** `now()`, `CURRENT_DATE`, `CURRENT_TIMESTAMP`, `::date` trên `timestamptz`, `AT TIME ZONE 'Asia/Ho_Chi_Minh'`, `generate_series(date, date, interval)` (kiểu `timestamptz`, phụ thuộc `timezone` phiên), `date_trunc` trên `timestamptz`.
  2. Ranh giới thời gian tính **ở JS** bằng `vnStartOfDay(iso)` (00:00 VN = 17:00Z hôm trước) rồi truyền qua `ts(date)` (`(${d}::timestamptz AT TIME ZONE 'UTC')`, có sẵn ở `lib/sql.ts`, kết quả `timestamp` UTC không phụ thuộc phiên). Khoảng luôn nửa mở `[from, to)`.
  3. Ngày VN của một thời điểm: `(col + INTERVAL '7 hours')::date` (phép cộng trên `timestamp` thuần và ép `timestamp -> date` không đọc `timezone`). VN không có DST nên độ lệch cố định (khớp `vn-time.ts`). Ép ra chuỗi bằng `to_char(day, 'YYYY-MM-DD')` để khỏi phụ thuộc `DateStyle`.
  4. Chuỗi ngày đủ 30 / N điểm do **JS** dựng (`addCalendarDays`) rồi điền 0 vào chỗ thiếu; không `generate_series` ngày ở SQL.
  5. Hàm truy vấn nhận `db: Db` (client hoặc giao dịch) để test chạy cùng hàm dưới `SET LOCAL TIME ZONE 'America/Los_Angeles' | 'Pacific/Kiritimati' | 'UTC' | 'Asia/Bangkok'` và so kết quả bằng nhau (T-INS-14).
- **Số nguyên:** `unit_price`, `line_discount`, `total` là `INTEGER`; `unit_price * quantity` có thể vượt 2^31 (100.000.000 x 20), nên **ép `::bigint` trước khi nhân** và `SUM(...)::bigint`; đọc về `Number` (an toàn < 2^53). Không float cho tiền.
- **Tỉ lệ half-up 4 chữ số bằng số nguyên:** `divRoundHalfUp(a, b) = floor((2a + b) / (2b))` cho a >= 0, b > 0; `ratio4(num, den) = divRoundHalfUp(num * 10000, den) / 10000`; `change = (cur - prev) / prev` dùng dấu rồi giá trị tuyệt đối (`-0,125` -> `-0,125`, không `-0`); `prev = 0` -> `null`. Giá trị TB/đơn = `divRoundHalfUp(revenue, completed)` (0 đơn -> 0). `share` = `ratio4(revenue_dòng, revenue_tổng)` (tổng 0 -> 0).
- **Chuẩn hoá chuỗi:** `cleanText()` (có sẵn Slice 6: NFC, trim, gộp khoảng trắng) cho `legalName`, `registrationIssuer`, `address`, `hours`; cấm ký tự điều khiển (`/\p{Cc}/u`). Email: trim + chữ thường, Zod email Slice 1 nhưng <= 254. Hotline: giữ đúng chuỗi đã nhập (đã cắt hai đầu, gộp khoảng trắng), kiểm trên bản bỏ ` `, `.`, `-`; độ dài chuỗi thô <= 20 (điểm 14.13).
- **Id:** UUID sai dạng -> `404 not-found`, không chạm DB (như các slice trước). Ở slice này chỉ có tham số truy vấn, không có id đường dẫn.
- **Giờ ghi:** mọi `at`, `updated_at` ghi bằng `now()` của `lib/clock`.
- **Log:** chỉ `userId`, hành động, mã lỗi. Không log giá trị cài đặt (thông tin pháp lý / liên hệ), `reason`, tên, email, nội dung CSV.
- **Cache:** mọi `GET /admin/*` `no-store` (từ `noStore`); `GET /store/settings` `public, max-age=60`; lỗi của endpoint công khai `no-store`.
- **Thứ tự kiểm yêu cầu ghi (`PUT /admin/settings/store`):** `noStore` -> `requireAuth` 401 -> `originGuard` 403 -> `adminRateLimit` 429 -> `requirePermission('settings.store')` 403 -> Zod 422 (mọi lỗi) -> giao dịch: khoá dòng -> không đổi gì 200 -> `updatedAt` lệch 409 -> ghi + nhật ký.

## 5. Định nghĩa doanh thu dùng chung (`revenue.sql.ts`)

Một file là nguồn duy nhất của D1 / BR-INS-09; Tổng quan, Báo cáo, CSV đều gọi. Không viết lại điều kiện ở nơi khác (T-INS-30 quét tĩnh: chuỗi `payment_status = 'paid'` chỉ xuất hiện ở `revenue.sql.ts`).

```sql
-- Đơn tính doanh thu trong [from, to): completed + paid, tính theo delivered_at (completed thiếu delivered_at tự loại vì so sánh NULL = không đúng)
WITH ro AS (
  SELECT o.order_id, o.payment_method, o.shipping_fee, o.shipping_discount,
         (o.delivered_at + INTERVAL '7 hours')::date AS vn_day
  FROM orders o
  WHERE o.status = 'completed' AND o.payment_status = 'paid'
    AND o.delivered_at >= ${ts(from)} AND o.delivered_at < ${ts(to)}          -- dùng idx_orders_status_delivered
), li AS (                                                                       -- một dòng / order_item
  SELECT ro.vn_day, ro.order_id, ro.payment_method, oi.product_id, oi.variant_id,
         oi.quantity::int AS qty,
         (oi.unit_price::bigint * oi.quantity - oi.line_discount) AS amount,
         oi.line_discount::bigint AS discount
  FROM ro JOIN order_items oi ON oi.order_id = ro.order_id
)
```

Mọi khối là một phép `GROUP BY` trên cùng `li` nên tổng khớp từng đồng (AC-INS-13):

| Khối | Truy vấn trên `li` |
| --- | --- |
| KPI | `SUM(amount)`, `SUM(qty)`, `SUM(discount)`, `COUNT(DISTINCT order_id)`; `shippingCollected = SUM(shipping_fee - shipping_discount)` lấy từ `ro` (không từ `li`, để không nhân theo số dòng) |
| `byDay` | `GROUP BY vn_day` -> JS điền 0 cho ngày thiếu; `completedOrders = COUNT(DISTINCT order_id)`, `units = SUM(qty)` |
| `byPayment` | `GROUP BY payment_method` -> JS luôn trả đủ `cod`, `bank-transfer` (DB `bank_transfer` ánh xạ `bank-transfer`) |
| `byCategory` | `JOIN products p ON p.product_id = li.product_id JOIN categories c` -> `GROUP BY c.category_id` (danh mục hiện tại, BR-RPT-05); `share` = `ratio4` trên tổng JS |
| `topProducts` | `GROUP BY product_id` + `(ARRAY_AGG(name ORDER BY delivered_at DESC))[1]` (tên chụp dòng mới nhất; cần `ro.delivered_at` + `oi.name` trong `li`); `ORDER BY units DESC, revenue DESC, product_id ASC LIMIT 10` (hoặc `revenue DESC, units DESC, ...` khi `sort=revenue`; Tổng quan: `units` và `LIMIT 5`) |
| `topVariants` | `GROUP BY variant_id` + tên / màu / size / sku chụp dòng mới nhất; cùng quy tắc xếp, `LIMIT 10` |

Kỳ so sánh (D3): hàm `periodsOf(range | {from,to}, now)` trả `{cur: [a,b), prev: [c,d)}` UTC. `today`: `cur = [vnStartOfDay(hôm nay), now)`, `prev = [cur.a - 7 ngày, now - 7 ngày)`. `7d` / `30d`: `cur = [vnStartOfDay(D - (n-1)), vnStartOfDay(D + 1))`, `prev` = n ngày liền trước. Báo cáo: `from..to` gồm hai đầu, `prev` = cùng số ngày liền trước. KPI hai kỳ trong **một** truy vấn (`FILTER (WHERE cur)` / `FILTER (WHERE prev)` trên các đơn thuộc hợp hai khoảng).

**Đơn đặt / đơn huỷ:** `orders.created_at` trong kỳ: đặt = `status <> 'cancelled'`; huỷ = `status = 'cancelled'` (BR-INS-09; dùng `idx_orders_created`). `cancelRate = ratio4(cancelled, placed + cancelled)`, mẫu 0 -> 0. `previous` của KPI nhóm đơn đặt / huỷ là `null` khi kỳ trước không có đơn đặt lẫn huỷ; của nhóm doanh thu là `null` khi kỳ trước không có đơn tính doanh thu (AC-RPT-03).

**Khách mới:** `COUNT(*) FROM users WHERE role = 'member' AND created_at >= ${ts(a)} AND created_at < ${ts(b)}` (kể cả đang bị khoá; staff / admin không tính, AC-DSH-04).

**Bất biến:** với mọi đơn tính doanh thu, `Σ(unit_price*qty - line_discount) = subtotal - discount` (Slice 3 `allocateByWeight` chia đủ). T-INS-31 kiểm bằng SQL trên dữ liệu thật của luồng đặt đơn (đơn có voucher % / cố định) để doanh thu dòng khớp doanh thu đơn.

## 6. Tổng quan (`dashboard.service.ts`)

- `getDashboard(role, range, now)`: `todo` và `orders` cho mọi vai trò; chỉ khi `INSIGHT_PERMISSIONS[role]` có `dashboard.revenue` mới thêm `range`, `period`, `revenue`, `completedOrders`, `averageOrderValue`, `newCustomers`, `revenueSeries`, `topProducts`. DTO dựng bằng hai nhánh đối tượng (như `customer.mapper`): staff **không có khoá** (không phải `null`); T-DSH-07 so sánh danh sách khoá.
- `orders` là `KpiValue {value, change}` ở cả hai vai trò (không tiền), kỳ so sánh như D3.
- **`todo` bằng số tab Đơn hàng / Tồn kho (AC-DSH-05, 06):** gọi đúng `countOrders({})` (`order-admin.query.ts`, cùng `TAB_SQL`) và lấy `to-confirm`, `pending-payment`, `to-fulfil`, `in-transit`, `cancel-requests`, `returning`; `inventoryCounts(db)` trích từ `inventoryFacets` (cùng `STATUS_SQL`, ngưỡng riêng SKU hoặc `low_stock_default`) lấy `low` -> `lowStock`, `out` -> `outOfStock`. `lateDelivery` = `COUNT(*) FROM orders WHERE status = 'to_receive' AND estimated_to < ${vnDateISO(now)}::date` (`estimated_to` là `DATE` thuần, so với ngày VN tính ở JS; cùng định nghĩa cờ `delivery` của `overdue.ts`).
- **Biểu đồ (BR-DSH-06):** một truy vấn `GROUP BY vn_day` trên khoảng 60 ngày `[vnStartOfDay(D-59), vnStartOfDay(D+1))`; JS dựng 30 điểm `D-29..D` với `previous` = doanh thu của ngày `D-59..D-30` cùng vị trí. Cố định 30 ngày, không phụ thuộc `range`.
- Các truy vấn chạy `Promise.all` (đọc, không giao dịch); `generatedAt = now()`.
- Tên sản phẩm / ảnh của `topProducts`: ảnh = ảnh bìa hiện tại (`products.cover_media_id`, qua `mediaUrlOf`) rơi về `order_items.media_id`.

## 7. Báo cáo và CSV (`report.service.ts`, `csv.ts`)

- **Tham số (`parseDateRange`, dùng chung cho báo cáo và nhật ký):** `from` / `to` khớp `^\d{4}-\d{2}-\d{2}$` **và** là ngày có thật (`isRealDate`: dựng `Date.UTC`, so lại năm-tháng-ngày; bắt `2026-02-30`, `2026-13-01`). `to` thiếu = `vnDateISO(now)`; `from` thiếu = `to` - 29 ngày. Lỗi: định dạng / ngày không thật -> `field` của tham số đó; `from > to` -> `field: from`; báo cáo `to` > hôm nay -> `field: to`; khoảng > 366 (nhật ký: 92) ngày -> `field: to`; `sort` ngoài {`units`, `revenue`} -> `field: sort`. Trả lỗi đầu tiên theo thứ tự `from`, `to`, khoảng, `sort`.
- Dựng `AdminSalesReport` từ mục 5: 1 truy vấn KPI (hai kỳ), 1 `byDay`, 1 `byPayment`, 1 `byCategory`, 2 top (có thể `Promise.all`). `days` = số ngày, `byDay` đủ `days` điểm.
- **CSV (`toSalesCsv`, hàm thuần, Should):** nhận chính `AdminSalesReport` đã dựng (không truy vấn riêng, nên số bằng màn). Chuỗi bắt đầu bằng `﻿`, dòng kết thúc `\r\n`. Năm khối theo thứ tự `KPI`, `Theo ngày`, `Top sản phẩm`, `Theo danh mục`, `Theo phương thức thanh toán`; mỗi khối: dòng tên khối, dòng tiêu đề cột, các dòng dữ liệu, một dòng trống. Ô: số nguyên không phân cách nghìn; tỉ lệ `0.3333` (dấu chấm); ô văn bản chuẩn hoá `csvCell(s)`: nếu `^[=+\-@\t\r]` thì thêm `'` đầu, rồi nếu chứa `,` `"` `\r` `\n` thì bọc `"` và nhân đôi `"`. Số âm không xuất hiện (mọi giá trị >= 0). Header `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="nine2fine-bao-cao-<from>_<to>.csv"` (từ `from`, `to` đã áp mặc định, chỉ gồm `[0-9-_]`), `Cache-Control: no-store`. Lỗi trước khi tạo tệp vẫn JSON `ErrorResponse`.

## 8. Cài đặt cửa hàng

### 8.1 Đọc

`getAdminSettings(db)`: đọc dòng id = 1 (thiếu dòng -> `INSERT ... ON CONFLICT DO NOTHING` bằng mặc định rồi đọc; đường admin được phép ghi dòng mặc định, đường công khai thì không ghi: mục 8.3). Dựng `AdminStoreSettings`: `info` (kèm `hotlineHref = 'tel:' + chữ số của hotline`, `registrationDate` `YYYY-MM-DD`), `operations`, `cart`, `derived.deliveryWindow = "{min}–{max} ngày"` (gạch EN, như `STORE_POLICY.deliveryWindow`), `derived.lowStockDefault`, `updatedAt = row.updatedAt.toISOString()` (mili-giây). Không đọc `bankTransferEnabled`.

### 8.2 Ghi (`updateSettings`)

Zod (`settings.schemas.ts`, `parseBodyAll`): `updatedAt` ISO hợp lệ; `info.*` theo BR-SET-02..04 (khoảng độ dài, MST `^(\d{10}|\d{13})$`, `registrationDate` ngày thật và `<= vnDateISO(now)` hoặc `null` / `""`, hotline, email <= 254 chữ thường, URL `https://` <= 300, không `javascript:` / `data:` / `http:`); `operations.*` theo BR-SET-05 (`Number.isInteger`, khoảng, bội 1.000 cho `shippingFee`, `freeShippingThreshold`; `deliveryDaysMin <= deliveryDaysMax` báo lỗi ở `operations.deliveryDaysMax`); `cart.*` theo BR-SET-06. Trường lạ bị loại (`.strip()`). `field` là đường dẫn đầy đủ (`info.hotline`, `operations.shippingFee`); riêng `updatedAt`. Chuỗi / số sai kiểu -> `validation` tại trường.

Giao dịch (READ COMMITTED, `{ timeout: 10_000, maxWait: 5_000 }`):

```
1. SELECT * FROM store_settings WHERE id = 1 FOR UPDATE   (thiếu dòng: INSERT mặc định rồi khoá)
2. next = (bản đã chuẩn hoá của thân) trộn với dòng hiện có (social / notificationUrl / cart vắng = giữ)
3. changes = diff(current, next)            -- theo từng trường phẳng, so sau chuẩn hoá; rỗng -> trả 200 với dòng hiện có (không ghi, không đổi updatedAt)
4. body.updatedAt (mili-giây) <> current.updatedAt (mili-giây) -> 409 version-conflict
5. UPDATE store_settings SET <các cột>, updated_at = $now  WHERE id = 1      -- $now = now() của lib/clock; Prisma @updatedAt KHÔNG dùng (đường raw của Slice 6 không chạm updated_at)
6. INSERT store_settings_events (at = $now, actor_*, changes)   -- hàm riêng insertSettingsEvent(tx, ...) để test giả lỗi (vi.spyOn) chứng minh rollback
7. đọc lại -> AdminStoreSettings
```

- `diff`: nhãn tiếng Việt theo bảng `SETTING_LABELS` (vd. `operations.shippingFee` -> "Phí vận chuyển"), `before` / `after` là chuỗi (`String(value)`, `registrationDate` `YYYY-MM-DD`), cắt 300 ký tự (thêm `…`). Chỉ các trường ở BR-SET-02..06: không có trường nhạy cảm nào để lọc.
- **Chống ghi chồng (BR-SET-07):** bước 3 đứng TRƯỚC bước 4: lưu giá trị y hệt hiện có luôn `200` (kể cả `updatedAt` cũ): bấm lại sau khi mất phản hồi không tạo `409`, và không tạo dòng nhật ký thứ hai. Có thay đổi mà `updatedAt` cũ -> `409`. Điểm lệch nhẹ với chữ PRD: mục 14 #5.
- Hai lần lưu đồng thời: cả hai chờ `FOR UPDATE`; lần sau thấy `updated_at` mới nên `409` (hoặc `200` nếu cùng giá trị). Đúng 1 dòng nhật ký cho mỗi lần ghi.
- Lỗi một trường -> không mở giao dịch (Zod chạy trước). Lỗi giữa giao dịch (giả `insertSettingsEvent` ném) -> rollback cả `UPDATE` (AC-SET-09 / T-SET-12).

### 8.3 Công khai (`GET /store/settings`)

`getPublicSettings(db)`: `findUnique({id:1})`; thiếu dòng -> trả `STORE_SETTINGS_SEED` (không ném lỗi như `getSettings()`, không ghi DB). `toPublic()` dựng đúng whitelist của schema `StorePublicSettings`; chuỗi rỗng ở `notificationUrl`, `social.*` -> `null`; `registrationDate` `null` nếu chưa nhập. Dựng DTO tường minh từng trường (không spread dòng DB) để một cột mới sau này không rò ra ngoài; T-SET-30 so khoá chính xác + `JSON.stringify` không chứa `codMax`, `maxPerVariant`, `updatedAt`, `bank`.

`storeRouter` gắn trước `originGuard` với `catalogRateLimit`: `GET` -> `res.set('Cache-Control', 'public, max-age=60')`; phương thức khác -> 404 `not-found` (như catalog, AC-CAT-46). Cookie phiên gửi kèm bị bỏ qua (không `cookieParser` ở đường này).

### 8.4 Nơi BE đọc / đang "hardcode" tham số vận hành, và đơn đã tạo không đổi

Kiểm mã (2026-11-12), **khác chữ "hardcode" của yêu cầu**: giá trị vận hành **đã** đọc từ DB ở mọi yêu cầu, không cần sửa logic để đổi có hiệu lực:

| Tham số | Nơi dùng (đọc `getSettings(db)` mỗi lần gọi) | Chụp lúc tạo đơn (nên đơn cũ không đổi) |
| --- | --- | --- |
| `shippingFee`, `freeShippingThreshold` | `checkout/pricing.ts` `computePricing`; `checkout/quote.service.ts:89,108`; `order/place-order.service.ts:140,166`; `cart/cart.service.ts` (6 chỗ) | `orders.shipping_fee`, `shipping_discount`, `total` (ghi lúc `INSERT`) |
| `bankHoldMinutes` | `place-order.service.ts:286` (`payment_due_at = at + hold`), `order/payment.service.ts` | `orders.payment_due_at`; `order.service.ts:32` và `expiry.job.ts` chỉ so với cột này, không đọc lại cài đặt |
| `codMaxTotal`, `codRefusalLimit`, `codRefusalMonths`, `codOpenOrderLimit` | `checkout/quote.service.ts:63`, `place-order.service.ts` | không cần chụp (chỉ chặn đặt mới) |
| `deliveryDaysMin/Max`, `cutoffHour` | `checkout/delivery.ts` `estimateDelivery` | `orders.estimated_from`, `estimated_to` (`DATE`) |
| `maxPerVariant`, `maxItemsPerOrder`, `maxCartLines`, `cartRetentionDays` | `cart/cart.service.ts`, `checkout/lines.service.ts` | không cần chụp; giỏ đang có không bị cắt, chỉ chặn thao tác thêm mới (BR-SET-06) |

Hardcode **thật** còn lại (cần xử lý hoặc ghi nhận):

1. `backend/src/mail/order-templates.ts:10` `const HOTLINE = '1900 6868 29'` dùng ở 3 thư (chân thư khách, chân thư Slice 4, thư từ chối huỷ). Sau khi hotline sửa được, thư sẽ in số cũ (vi phạm BR-SET-11 về nhất quán). **Sửa ở lát 8.4:** các hàm dựng thư nhận thêm tham số `contact: { hotline: string }` (mặc định `STORE_SETTINGS_SEED.hotline`); chỗ gọi (`order-email.service.ts:51,128`, `cancel-order.service.ts:160`) đọc `getPublicSettings(prisma)` một lần trước khi dựng thư (thư gửi nền, không ảnh hưởng độ trễ phản hồi). Test: đổi hotline rồi đặt đơn -> thư chứa số mới; đơn trước đó không bị gửi lại.
2. DB `DEFAULT` của `store_settings` (`migration 20261107000500`) và `getSettings()` ném lỗi khi thiếu dòng: giữ nguyên (đường checkout cần dòng seed; `GET /store/settings` đã có đường rơi về mặc định riêng).
3. `ASSUMPTIONS.noConfirmCallBelowTotal` (1.000.000, BR-CHK-20 "cần gọi xác nhận") và `percentRoundStep`: không thuộc danh sách sửa được của Slice 8; giữ.
4. Phía FE: `STORE_POLICY`, `STORE_INFO`, `MEMBERSHIP_POLICY` là giá trị dựng sẵn / dự phòng (mục 10).

Bảo đảm "đơn đã tạo không đổi" (AC-SET-11): không có luồng nào đọc lại `store_settings` để tính lại đơn đã tồn tại; T-SET-20 chụp đơn trước, đổi cài đặt, đọc lại đơn qua `GET /orders/{code}`, `GET /admin/orders/{code}` và cột DB: `shipping_fee`, `total`, `payment_due_at`, `estimated_*` không đổi; đơn mới dùng giá trị mới.

## 9. Nhật ký hợp nhất (`audit.query.ts`)

`listAudit(db, {from, to, targetType, page, limit})`: cửa sổ `[vnStartOfDay(from), vnStartOfDay(to + 1))` qua `ts()`. Dựng `UNION ALL` chỉ gồm các nhánh khớp `targetType` (không có -> cả bốn), cột chung `id text, at timestamp, actor_id uuid, actor_name text, actor_role text, action_code text, action_extra, target_type text, target_id text, target_label text, reason text, role_before text, role_after text, changes jsonb`; `ORDER BY at DESC, id DESC LIMIT $limit OFFSET $offset`; `total` = `COUNT(*)` bọc cùng `UNION`. Nhánh nào cũng lọc `at` trước (dùng chỉ mục `at`), không `SELECT *` (chỉ cột liệt kê: không bao giờ chọn `internal_note`, `detail`, `email_*`, IP, UA).

| Nguồn | Điều kiện | `id` | `target` | `action.code` |
| --- | --- | --- | --- | --- |
| `order_events` (a) | `actor = 'shop' AND kind IN (call_attempt, confirmed, shipped, delivered, cancelled, cancel_approved, cancel_rejected, stock_restocked, stock_written_off, note)` | `'order:' \|\| event_id` | `order`, `orders.code`, `#<code>` | `order.<kind đổi '_' -> '-'>`, `note` -> `order.note-added` |
| `inventory_adjustments` (b) | tất cả | `'inventory:' \|\| adjustment_id` | `inventory`, `variant_id`, `<sku> - <tên sản phẩm>` (JOIN `product_variants`, `products`) | `inventory.adjusted` |
| `account_events` (c) | tất cả | `'account:' \|\| event_id` | `customer` nếu `target_role = 'member'` ngược lại `staff`; `target_user_id` (null nếu đã xoá); `target_name` | `account.<action>` |
| `store_settings_events` (d) | tất cả | `'settings:' \|\| event_id` | `settings`, `'store'`, "Cài đặt cửa hàng" | `settings.updated` |

- **Người thao tác:** `actor_name` / `actor_role` là ảnh chụp lúc làm (`order_events.actor_name` có thể NULL ở dữ liệu cũ -> "Nhân viên", vai trò rơi về `staff`; JOIN `users` chỉ để bù khi `actor_user_id` còn).
- **`reason`:** (a) chỉ `reason_code` (mã ổn định của lý do huỷ, vd. `unreachable`), **không** `detail` / `internal_note` (có thể chứa nội dung cuộc gọi / ghi chú); (b) `note` của điều chỉnh (nhập tay, hiển thị cho admin) hoặc rỗng; (c) `reason`; (d) không có. Bỏ qua khoá khi rỗng.
- **Nhãn:** BE dựng `action.label` (`LABELS` theo mã; tồn kho: "Điều chỉnh tồn kho +5 (Nhập hàng)" từ `delta` và `reason`).
- `changes` chỉ ở (d); `roleBefore` / `roleAfter` chỉ ở (c) `role-changed` / `staff-created`. DTO dựng tường minh theo nguồn (T-AUD-02 quét JSON không có `internal_note`, `detail`, `ip`, `user_agent`, `email_`).
- `limit` 1..50 mặc định 20, `page` >= 1 (sai -> 422 `page` / `limit`); trang quá cuối -> `items: []`, `total` đúng. Hoà `at` ổn định nhờ `id` (chuỗi, so sánh bytewise như nhau ở mọi lần gọi; `COLLATE "C"` trên `id` để không phụ thuộc locale DB).
- Chỉ-đọc: router không có `PUT` / `PATCH` / `DELETE`; test quét tĩnh `src/` không có `insert|update|delete` vào bảng nào qua module `insights-admin/audit*`; `PUT` / `DELETE` `/admin/audit-log` -> 404.

## 10. Quyền, giới hạn, FE phải đổi

`INSIGHT_PERMISSIONS` (cùng tên với `frontend/src/app/admin/core/permissions.ts`; một nguồn nghĩ cho hai phía):

| Quyền | staff | admin | Dùng ở |
| --- | --- | --- | --- |
| `dashboard.view` | có | có | `GET /admin/dashboard` |
| `dashboard.revenue` | - | có | không chặn route Tổng quan; quyết định khoá tiền của `getDashboard`; chặn `GET /admin/reports/sales`, `.../export` |
| `settings.store` | - | có | `GET/PUT /admin/settings/store` |
| `settings.audit` | - | có | `GET /admin/audit-log` |

Không phiên / hết hạn / thu hồi / chỉ `n2f_sid` / `is_active = false` -> `401` + `no-store`. Thiếu quyền -> `403`, trước khi đọc thân và truy cập DB. `requirePermission` tra thêm bảng này (kiểu `Permission` mở rộng).

### FE phải đổi (frontend-dev; BE chỉ đọc)

1. **Cờ `adminInsightsMode`** (`'mock' | 'http'`) trong `ApiConfig`, độc lập các cờ cũ; e2e `mock` qua `localStorage['n2f.e2e.adminInsightsMode']`. `http`: `/admin` = Tổng quan (staff + admin); menu đúng AC-INS-07; `/admin/reports`, `/admin/settings/store`, `/admin/settings/audit` guard theo `permissions.ts` (`dashboard.revenue`, `settings.store`, `settings.audit`).
2. **`DashboardSummary` thu hẹp** theo `AdminDashboard`: bỏ `kpis.returnRate`, `todo.deliveryFailed`, `todo.returnRequests`; `kpis` tách thành các `KpiValue` top-level (`orders` mọi vai trò; `revenue`, `completedOrders`, `averageOrderValue`, `newCustomers` chỉ admin => kiểu tuỳ chọn, ẩn ô khi vắng); `todo` thêm `cancelRequests`, `returning`, `outOfStock`; `range` và `period` (nhãn "so với cùng giờ thứ X tuần trước" / "so với 7 ngày trước" suy từ `range`); `revenueSeries` 30 điểm `{date, revenue, previous}`; `topProducts[].image` là `AdminImageRef | null` (tra media manifest khi `url = null`); `generatedAt` hiện "Cập nhật lúc HH:mm"; `change = null` hiện "—".
3. **`SalesReport` thu hẹp** theo `AdminSalesReport`: `ReportRange` (`7d/30d/90d/365d`) chỉ còn là nút chọn nhanh, FE tính `to` = hôm nay VN, `from` = `to` - (n-1) rồi gọi bằng `from` / `to` (URL giữ `from`, `to`; ngày tự do > 366 báo lỗi ở ô `to`, không gọi API). `kpis.netRevenue` -> `revenue`; `orders` -> `completedOrders` + `placedOrders`; `averageOrder` -> `averageOrderValue`; bỏ `grossProfit`, `grossMargin`, `unitsPerOrder` (tính phía FE nếu cần: `units / completedOrders`), `refundRate`, `customers`; `discountRate` bỏ (BE chỉ có `discountTotal`); `trend` -> `byDay` (luôn theo ngày, `previous` không có: bỏ đường so sánh hoặc chỉ so tổng KPI); `categories` -> `byCategory` (bỏ `profit`, thêm chú thích "Theo danh mục hiện tại của sản phẩm"); `products` -> `topProducts` + `topVariants` (bỏ `profit`, `margin`, `returnRate`, `onHand`, `daysOfCover`, `sellThrough`, `abc`); bỏ `bySize`, `byColor`, `customers`, mọi khối Won't. Thêm nút "Xuất CSV" (`/admin/reports/sales/export` mở bằng `window.location` hoặc `Blob` + `Content-Disposition`, Should).
4. **`AuditEntry`:** `actor` chuỗi -> `{id, name, role}`; `action` chuỗi -> `{code, label}`; `target.type` bỏ `product`, `promotion`; `before` / `after` -> `changes[]` (nhiều trường một dòng) + `reason`, `roleBefore`, `roleAfter`; `id` là chuỗi `nguồn:uuid`; bỏ ô lọc sản phẩm / voucher và ô tìm văn bản; chọn dòng `order` mở `/admin/orders/{target.id}`, `customer` mở `/admin/customers/{target.id}` (nếu `target.id` null thì không bấm được).
5. **Cài đặt cửa hàng:** adapter HTTP `get` / `put` (`PUT` kèm `updatedAt` đã đọc, giữ giá trị server trả về; `409 version-conflict` -> tải lại + giữ bản đang nhập để so; `fieldErrors` -> lỗi cạnh từng ô theo `field` đường dẫn). Chỉ hiện nhóm Thông tin cửa hàng, Liên hệ, Vận chuyển và thanh toán, "Tham số giỏ và COD"; ẩn Đổi trả, Hạng thành viên, tài khoản ngân hàng; ngưỡng sắp hết chỉ đọc (`derived.lowStockDefault`) + liên kết "Sửa ở Tồn kho"; chữ ngưỡng free-ship "Giá trị hàng trước mã giảm giá."; cảnh báo trước khi lưu ngưỡng `0`; `deliveryWindow` hiển thị chỉ đọc; `unsavedChangesGuard`.
6. **Storefront:** `HttpStoreSettingsApi` kiểu trả về `{ info, policy }` (không `membership`, `policy` chỉ 4 khoá); `applyStoreSettings` đã gộp với mặc định nhưng nay `info.registrationDate`, `info.notificationUrl`, `info.social.*` có thể `null` (không ghi đè mặc định bằng `null` mà ẩn mục); gọi một lần lúc khởi động + làm mới <= 60 giây theo `max-age`; lỗi / chậm dùng `DEFAULT_STORE_SETTINGS`. Footer hiện biểu tượng MXH khi có URL.
7. **Lỗi theo `error.code`:** `forbidden` (ẩn / chặn), `validation` (+ `field`, `fieldErrors`), `version-conflict`, `rate-limited` (`retryAfterSeconds`), `unauthenticated` (-> `/admin/login`), `unavailable`; mọi màn có đang tải / lỗi + "Thử lại" / rỗng; không NaN khi `change` / `previous` null hay mẫu 0.
8. Giữ `mock` mặc định ở e2e; thêm spec `contract-mock` cho `409 version-conflict`, `fieldErrors`, staff không có khoá tiền.

## 11. Truy vấn và độ phức tạp (ghi để không làm lại)

- Doanh thu: `idx_orders_status_delivered` cho khoảng `delivered_at`, `idx_order_items`(PK / `uq_order_items_order_variant` theo `order_id`) cho dòng; 366 ngày x đồ án nhỏ -> quét vài nghìn dòng, chấp nhận. Không bảng tổng hợp / cache (BR-INS-08: tính tại lúc gọi).
- Đơn đặt / huỷ: `idx_orders_created` (`created_at DESC`).
- Nhật ký: mỗi nhánh dùng chỉ mục `at` (`idx_order_events_at`, `idx_inv_adj_at`, `idx_account_events_at`, `idx_store_settings_events_at`); `OFFSET` tới trang sâu chấp nhận (cửa sổ <= 92 ngày).
- Đo ở lát 8.7 trên Supabase bằng `EXPLAIN (ANALYZE)` nếu chậm; chỉ mục khác chỉ thêm bằng migration mới.

## 12. Thứ tự làm và test (T-INS / T-DSH / T-RPT / T-SET / T-AUD ↔ AC theo lát)

Mỗi lát: `tsc --noEmit` và test của lát pass (từng file chạy 2 lần); chạy lại test Slice 3 / 4 / 6 / 7 sau 8.1 và 8.4 để chứng minh không đổi hành vi. `assertNoSecrets(res)` quét thân phản hồi tìm `password_hash`, `ip_address`, `user_agent`, `internal_note` và spy trên `logger` (không log giá trị cài đặt). Dữ liệu chung: fixture `O1..O9`, `P1..P3` (AC mục 5 PRD) dựng bằng `insertRevenueOrder`; đồng hồ giả `useClock('2026-11-12T08:00:00Z')` (D = 2026-11-12 VN, 15:00 VN).

**8.1 Nền** (migration, `INSIGHT_PERMISSIONS`, `requirePermission` mở rộng, `adminReportLimit`, `parseBodyAll` / `validationMany`, `vn-time` / `money-math`, `STORE_SETTINGS_SEED`, 4 router rỗng + `storeRouter`, `resetState`, `openapi.yaml` locked):

| Test | AC | Kiểm |
| --- | --- | --- |
| T-INS-01 | AC-INS-01 | Không cookie / chỉ `n2f_sid` / staff `is_active=false`: GET tổng quan, báo cáo, cài đặt, nhật ký + PUT cài đặt -> 401 `no-store`, DB không đổi; `GET /store/settings` không cookie 200 chỉ whitelist |
| T-INS-02 | AC-INS-02, 03 | S: báo cáo, CSV, GET / PUT cài đặt, nhật ký -> 403, tổng quan 200 (phần staff), không dòng `store_settings_events`; A: cùng API 200; A hạ bằng SQL -> báo cáo 403 không đăng nhập lại |
| T-INS-03 | AC-INS-06 | 21 yêu cầu báo cáo / 60 giây: 21 -> 429 + `Retry-After` + `retryAfterSeconds`, 20 đầu 200 (đồng hồ giả); 61 yêu cầu ghi (`PUT` cài đặt không đổi) -> 61 là 429; CSV chung bộ đếm với báo cáo |
| T-INS-04 | AC-INS-09 | `migrate deploy` x2, không DROP / TRUNCATE / đổi kiểu, RLS, `diff` rỗng, số dòng `orders` / `users` / `store_settings` không đổi, `store_settings` id 1 = `STORE_INFO`, CHECK hình dạng, 5 chỉ mục |
| T-INS-05 | AC-INS-10 | Gây lỗi AC-INS-01, 02, 06; AC-RPT-02; AC-SET-04, 12: `code` + HTTP đúng, không stack / SQL / `password_hash` |
| T-INS-06 | BR-INS-09 | Hàm `divRoundHalfUp`, `ratio4`, `change` (bảng ca biên: 733.333,33; 0,1; kỳ trước 0 -> null; âm), `isRealDate`, `periodsOf` (today / 7d / 30d, ranh giới 17:00Z) |

**8.2 Tổng quan:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-DSH-01 | AC-DSH-01 | `range` = `today`, `7d`, `30d` 200 đúng khoảng (`period.from/to`); `week` 422 `field: range`; vắng = `today` |
| T-DSH-02 | AC-DSH-02, AC-INS-12 (phần ngày) | `today`: revenue 1.200.000 (O1 + O3; O2 hôm qua, O9 refunded loại), completed 2, AOV 600.000, orders 2; `7d`: 2.200.000, 3, 733.333, `change` 0,1 |
| T-DSH-03 | AC-DSH-03 | DB không đơn: `change` null, AOV 0, không NaN / 500 (cả `today`, `30d`) |
| T-DSH-04 | AC-DSH-04 | 2 khách hôm nay, 1 hôm qua, 1 staff hôm nay: `newCustomers` 2 |
| T-DSH-05 | AC-DSH-05 | O4, O6, O7, 1 `to_ship` đã gọi, 1 `cancel_requested`: `todo` bằng `GET /admin/orders/counts` cùng lúc (so từng khoá); S và A cùng số |
| T-DSH-06 | AC-DSH-06 | 2 sắp hết + 1 hết: bằng `GET /admin/inventory/facets` `counts`; đổi ngưỡng SKU / mặc định -> số đổi |
| T-DSH-07 | AC-DSH-09 | S: khoá chính xác `{generatedAt, orders, todo}`; không `revenue`, `averageOrderValue`, `newCustomers`, `revenueSeries`, `topProducts`, `returnRate`, `deliveryFailed`, `returnRequests` (cả A) |
| T-DSH-08 | AC-DSH-07 (Should) | `lateDelivery` = 1 (O7 hạn D-1; hạn D chưa trễ) |
| T-DSH-09 | AC-DSH-08 | 30 ngày, đơn vào 3 ngày: 30 điểm cũ trước, ngày trống 0, Σ = KPI, `previous` đúng vị trí; `topProducts` P2, P1, P3 (hoà `units` phân theo `revenue`), <= 5 dòng |

**8.3 Báo cáo:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-RPT-01 | AC-RPT-01, 02 | Mặc định 30 ngày kết thúc D; `from=to=D` 200; 366 ngày 200; 367 ngày 422 `to`; `from > to` 422 `from`; `to = D+1` 422 `to`; `2026-02-30`, `2026-13-01`, `abc` 422 `from`; chỉ `from` -> `to = D` 200; kỳ trước cùng số ngày |
| T-RPT-02 | AC-RPT-03, AC-INS-12 | O1..O9 khoảng D..D: revenue 1.200.000, completed 2, units, AOV 600.000, discount 100.000, shippingCollected 60.000, placed 2, cancelled 1, cancelRate 0,3333, `previous`; khoảng D-8..D: 4.200.000 (O9, O4..O7 không tính) |
| T-RPT-03 | AC-INS-13 | Σ `byDay` = Σ `byCategory` = Σ `byPayment` = Σ `topProducts` (khi <= 10 sản phẩm) = KPI, từng đồng, nhiều khoảng (D..D, D-8..D) |
| T-RPT-04 | AC-RPT-04 | Khoảng D-2..D, đơn D-2 và D: đúng 3 điểm, D-1 = 0 mọi chỉ tiêu; đơn 17:00Z rơi ngày sau; Σ = KPI |
| T-RPT-05 | AC-RPT-05 | Mặc định P2, P1, P3; `sort=revenue`; `sort=profit` 422 `sort`; 12 sản phẩm -> 10 dòng; hoà hoàn toàn theo `productId` tăng |
| T-RPT-06 | AC-RPT-06 | P3 `ARCHIVED` sau khi bán: vẫn có (tên / màu / size / SKU chụp), `topVariants` <= 10, Σ `units` biến thể = `units` sản phẩm |
| T-RPT-07 | AC-RPT-07 | P1 chuyển danh mục sau khi bán: tính theo danh mục hiện tại, `share` 4 chữ số, sắp doanh thu giảm, Σ = KPI |
| T-RPT-08 | AC-RPT-08 | Chỉ COD: `byPayment` đủ 2 dòng, `bank-transfer` 0 / 0 / 0, `share` `cod` = 1 |
| T-RPT-09 | AC-RPT-10 (BE phần dữ liệu) | S 403; khoảng rỗng: mảng rỗng / 0, không NaN, `byDay` đủ ngày |
| T-INS-14 | AC-INS-11 | Đơn giao 16:59:59Z và 17:00:00Z ngày 11: báo cáo `from=to=12` chỉ có đơn 17:00:00Z; `from=to=11` chỉ có đơn 16:59:59Z; **chạy cùng hàm dưới `SET LOCAL TIME ZONE` `UTC`, `Asia/Bangkok`, `America/Los_Angeles`, `Pacific/Kiritimati` và so kết quả bằng nhau** (bắt lỗi múi giờ mà DB cục bộ Bangkok che mất); thời điểm trả về ISO UTC, tiền số nguyên |
| T-INS-30 | AC-INS-13 (cấu trúc) | Quét tĩnh: `payment_status = 'paid'` chỉ ở `revenue.sql.ts`; không `now()` / `CURRENT_DATE` / `AT TIME ZONE 'Asia` trong `src/modules/insights-admin/` |
| T-INS-31 | AC-INS-12 (bất biến) | Đơn thật (đặt qua checkout, voucher % và cố định, giao) : Σ dòng = `subtotal - discount`; doanh thu báo cáo = Σ đơn |

**8.4 Cài đặt cửa hàng + công khai:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-SET-01 | AC-SET-01 | A GET 200 đủ `info` + `operations` + `cart` + `derived` + `updatedAt`; S GET / PUT 403, DB không đổi; không `bankTransferEnabled` |
| T-SET-02 | AC-SET-02 | `legalName` 1 / 121; `registrationNumber` `12345`, 9, `0319245768`, 13 chữ số; `address` 9; `registrationDate` ngày mai / không thật; `hours` 101: sai -> 422 đúng `field` + `fieldErrors` đủ mọi lỗi một lần, không lưu trường nào, không dòng nhật ký; hợp lệ lưu |
| T-SET-03 | AC-SET-03 | Hotline `1900 6868 29`, `0912.345.678`, `1800-1234` lưu, `hotlineHref` `tel:1900686829`; `123`, `abc`, `1900` 422 `info.hotline`; email `CSKH@Nine2Fine.vn ` -> `cskh@nine2fine.vn`; `a@b`, 255 ký tự 422; `privacyEmail` rỗng hợp lệ |
| T-SET-04 | AC-SET-05 | `shippingFee` 500.000 ok / 500.001, -1, 30.500, 25,5 422; ngưỡng 0, 50.000.000 ok / 50.001.000 422; `bankHoldMinutes` 9, 10, 1.440, 1.441; `codMaxTotal` 99.000, 100.000, 50.000.001 |
| T-SET-05 | AC-SET-06 | `deliveryDaysMin/Max` 4/2 422 `operations.deliveryDaysMax`; 2/4 ok, `derived.deliveryWindow` "2–4 ngày"; 0/3, 3/31 422; `cutoffHour` 24, -1 422, 16 ok |
| T-SET-06 | AC-SET-08 | A1, A2 cùng `updatedAt` T: A1 200 `updatedAt` mới; A2 (hotline mới, T cũ) 409 `version-conflict`, DB = bản A1; đúng 1 dòng nhật ký |
| T-SET-07 | AC-SET-09 | `shippingFee` hợp lệ + `bankHoldMinutes` 5: 422 `operations.bankHoldMinutes`; `shipping_fee` không đổi (SQL); không dòng |
| T-SET-08 | AC-SET-10 | Lưu đúng giá trị hiện có (cả `updatedAt` hiện tại và cũ): 200, `updated_at` không đổi, không dòng |
| T-SET-09 | AC-SET-12 | Đổi `shippingFee` + `hotline`: đúng 1 dòng, người A + vai trò + thời điểm, 2 mục (trường, trước, sau); sau đó 422 và 403 không thêm dòng; `PUT` / `DELETE` `/admin/audit-log` 404 |
| T-SET-10 | AC-SET-12 (nguyên tử) | Giả lỗi `insertSettingsEvent` (spy): lỗi; cài đặt không đổi, không dòng; hai `PUT` song song cùng `updatedAt`: đúng 1 thành công, 1 `409`, 1 dòng |
| T-SET-20 | AC-SET-11 | Đơn O (ship 30.000, giữ tới 14:30) + giỏ M 600.000; đổi `shippingFee` 45.000, `bankHoldMinutes` 60: O không đổi (API + SQL); báo giá M ship 45.000; đơn mới ship 45.000, `payment_due_at` = +60 phút; giỏ không bị sửa; thư đơn mới in hotline mới (điểm 8.4 #1) |
| T-SET-30 | AC-SET-13 | Công khai: 200 `Cache-Control: public, max-age=60`; khoá chính xác `{info, policy}`; JSON không chứa `codMax`, `maxPerVariant`, `updatedAt`, `bank`; `deliveryWindow` "2–4 ngày" theo min-max; xoá dòng `store_settings` -> trả mặc định, không 500; `POST /store/settings` 404; cookie lạ vẫn 200 không `Set-Cookie`; 121 yêu cầu -> 429 |
| T-SET-31 | AC-SET-14 (BE) | Đổi hotline / address rồi `GET /store/settings` trả giá trị mới (đồng hồ giả +60 giây cho cache phía client giả định) |

**8.5 Nhật ký (Should):**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-AUD-01 | AC-AUD-01 | S xác nhận đơn + điều chỉnh tồn, A khoá khách + tạo nhân viên + đổi cài đặt, 1 sự kiện `customer` / `system`: đúng 5 dòng; đủ trường; dòng cài đặt có `changes`; dòng vai trò có `roleBefore/After` |
| T-AUD-02 | AC-AUD-01 (an toàn) | `internal_note`, `detail` (gọi, giao), IP, UA không xuất hiện trong JSON; `reason` đơn chỉ là mã |
| T-AUD-03 | AC-AUD-02 | 60 dòng trong 30 ngày + 5 dòng 100 ngày trước: trang 1 / 2 đủ 20; `limit` 51 / 0 422; `page=99` rỗng `total 60`; khoảng 93 ngày 422 `to`; `targetType=product` 422; 5 dòng cũ không có |
| T-AUD-04 | AC-AUD-03 | Hai dòng cùng `at` (cả cùng micro-giây): thứ tự giống nhau qua nhiều lần gọi và qua ranh giới trang, không trùng / sót |
| T-AUD-05 | AC-AUD-04 | S 403; A `targetType=inventory`: số dòng = số `inventory_adjustments` trong khoảng; thao tác bị 403 / 409 / 422 không có dòng; `PUT` / `DELETE` 404; mở màn không tạo dòng (đếm trước / sau) |
| T-AUD-06 | AC-AUD-02 (múi giờ) | Dòng 16:59:59Z / 17:00:00Z ngày biên: cửa sổ `from=to` theo giờ VN, chạy dưới 3 múi giờ phiên (như T-INS-14) |

**8.6 Should nhỏ:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-RPT-10 | AC-RPT-11 | CSV O1..O3 khoảng D-1..D: BOM, tên tệp, 5 khối, số bằng JSON cùng khoảng; sản phẩm `=HYPERLINK(...)` -> `'=HYPERLINK`; ô có dấu phẩy / `"` / xuống dòng bọc đúng; S 403; 367 ngày 422 JSON; vượt 20 / 60 giây 429 |
| T-SET-11 | AC-SET-04 | MXH `https://facebook.com/nine2fine` ok; `http://x.com`, `javascript:alert(1)`, 301 ký tự 422 `info.social.facebook`; rỗng -> public `null`; `notificationUrl` tương tự |
| T-SET-12 | AC-SET-07 | Giỏ 10 dòng; `maxCartLines` 5 lưu; giỏ giữ 10 dòng; thêm dòng 11 bị từ chối theo hành vi hiện có; `maxPerVariant` 21 / 0 422 `cart.maxPerVariant` |

**8.7 Nghiệm thu thật** (Thắng / Orchestrator, cần duyệt áp migration): `migrate deploy` lần hai không có gì; Thắng nhập thông tin pháp lý thật (G9) ở `/admin/settings/store` và kiểm chân trang storefront trong <= 60 giây; so số Tổng quan / Báo cáo với đơn thật bằng SQL chỉ đọc; đổi phí ship rồi đặt đơn thử; `EXPLAIN` nếu chậm (AC-INS-09, 11, 12, 13; AC-SET-11, 14).

**Chỉ FE / E2E (không có T-xxx BE):** AC-INS-04, 05, 07, 08; AC-DSH-10; AC-RPT-09, 10 (phần giao diện); AC-SET-14 (phần giao diện), 15, 16; AC-AUD-05.

## 13. Rủi ro

| # | Rủi ro | Giảm nhẹ |
| --- | --- | --- |
| R1 | Múi giờ: DB cục bộ `Asia/Bangkok` (= UTC+7) che lỗi ranh giới ngày; Supabase UTC lộ lỗi | Quy tắc mục 4 (không dùng hàm phụ thuộc phiên); T-INS-14 / T-AUD-06 chạy dưới 4 múi giờ phiên qua `SET LOCAL TIME ZONE` trong giao dịch; T-INS-30 quét tĩnh |
| R2 | Ba màn lệch nhau (định nghĩa doanh thu viết ở nhiều nơi) | Một `revenue.sql.ts`; T-RPT-03, T-INS-30, T-INS-31 |
| R3 | Tràn `int4` khi nhân `unit_price * quantity` | Ép `::bigint` trước khi nhân; test ca `100.000.000 x 20` |
| R4 | `store_settings.updated_at` làm token phiên bản nhưng `PUT /admin/inventory/thresholds` (Slice 6, SQL thô) không đụng `updated_at` | Đúng ý: ngưỡng sắp hết không nằm trong thân `PUT` cài đặt, đổi ngưỡng không gây `409` giả; nhưng đổi ngưỡng cũng **không** vào nhật ký cài đặt (S8-Q4 không nhân đôi). Ghi ở mục 14 #12 |
| R5 | Thư đơn hàng vẫn in hotline cũ | Mục 8.4 #1 (tham số hoá) + T-SET-20 |
| R6 | Chỉ mục từng phần (`WHERE actor = 'shop'`, `WHERE status = 'completed'`) nhỏ hơn nhưng Prisma không khai báo được: `migrate diff` sẽ đòi `DROP INDEX` và làm vỡ T-INS-04 | Dùng chỉ mục đầy đủ khai báo trong `schema.prisma`; chi phí ghi thêm chấp nhận |
| R7 | `Date` tham số tới `timestamp` không múi giờ có thể bị hiểu theo múi giờ phiên | Luôn `ts(date)` (`::timestamptz AT TIME ZONE 'UTC'`), không bind `Date` trực tiếp vào so sánh với cột `timestamp` |
| R8 | Ghi đè cài đặt do hai tab / hai admin | `FOR UPDATE` + `updatedAt` mili-giây; T-SET-06, T-SET-10 |
| R9 | `INSERT` lúc dòng `store_settings` chưa tồn tại (DB mới) | `getSettings()` vẫn ném (checkout cần seed); đường admin tự tạo dòng mặc định, đường công khai rơi về hằng seed; test T-SET-30 |
| R10 | Đơn `completed` thiếu `delivered_at` hoặc `paid` do dữ liệu cũ / test | Không tính (BR-INS-09); T-RPT-02 có ca; 8.7 so sánh SQL chỉ đọc trên Supabase để lộ chênh lệch |
| R11 | Rò dữ liệu qua nhật ký (`internal_note`, `detail`) | Chỉ liệt kê cột, DTO tường minh, T-AUD-02 |
| R12 | Nhật ký phình / chậm | Cửa sổ <= 92 ngày, `limit` <= 50, chỉ mục `at`; Won't thêm nhật ký sản phẩm |
| R13 | Sửa `HOTLINE` chạm mã thư (Slice 3 / 4) | Tham số có giá trị mặc định = hằng cũ; chạy lại test thư Slice 3 / 4 |
| R14 | CSV bị Excel chạy công thức / lỗi mã hoá | `csvCell`, BOM, T-RPT-10 |
| R15 | Cache công khai 60 giây làm khách thấy số cũ sau khi sửa | Đúng thiết kế (S8-Q9); FE gọi lúc khởi động và định kỳ; không xoá cache tay |

## 14. Đề xuất cho PO / điểm lệch cần Orchestrator duyệt (trước khi `locked`)

PRD mâu thuẫn hoặc mơ hồ so với mã thực tế; BE đã chọn cách an toàn (cột "Đã chọn") và không dừng:

1. **"Hardcode tham số vận hành" không đúng với mã.** Giá và hạn đã đọc từ `store_settings` ở mỗi yêu cầu và được chụp vào đơn lúc tạo (mục 8.4); PRD D8 / BR-SET-08 vẫn đúng. Chỗ hardcode thật duy nhất ảnh hưởng khách là hotline trong thư đơn hàng (`order-templates.ts:10`, 3 chỗ). *Đã chọn:* tham số hoá thư ở lát 8.4 (không đổi hợp đồng). Ngoài danh sách sửa được: `noConfirmCallBelowTotal` (1.000.000, BR-CHK-20). *Đề xuất:* PO quyết định có đưa ngưỡng "cần gọi xác nhận" vào Cài đặt ở slice sau không.
2. **Tên phương thức thanh toán.** PRD viết `bank_transfer` (tên DB); contract Slice 3 / 4 dùng `bank-transfer`. *Đã chọn:* `byPayment[].method` dùng `PaymentMethod` hiện có (`cod`, `bank-transfer`).
3. **Lỗi nhiều trường.** BR-SET-02 / AC-SET-02 cần "mọi lỗi một lần" nhưng `ErrorResponse.error` chỉ có một `field`. *Đã chọn:* thêm `fieldErrors` tuỳ chọn (cộng thêm, chỉ `PUT /admin/settings/store`). Đây là thay đổi `ErrorResponse` dù mã lỗi không đổi: cần duyệt.
4. **Mã lỗi mới:** PRD gợi ý "mã lỗi mới" nhưng đủ dùng lại `version-conflict`, `validation`, `forbidden`; *Đã chọn:* không thêm mã nào.
5. **`version-conflict` khi giá trị y hệt.** BR-SET-07 viết "khác `updatedAt` hiện tại -> 409". *Đã chọn:* nếu toàn bộ giá trị đã chuẩn hoá bằng giá trị hiện tại thì `200` kể cả `updatedAt` cũ (không ghi, không nhật ký); chỉ khi có thay đổi thật mà `updatedAt` cũ mới `409`. Lý do: bấm lại sau khi mất phản hồi của chính mình không nên báo xung đột; AC-SET-08, 10, 16 vẫn đúng. Nếu PO muốn đúng chữ (luôn `409` khi lệch), đổi thứ tự bước 3 / 4 ở mục 8.2 (một dòng).
6. **Dạng phản hồi Tổng quan.** AC-DSH-09 nói staff nhận "chỉ `todo`, `orders`, `generatedAt`". *Đã chọn:* `range` và `period` chỉ có ở admin; `orders` là `KpiValue {value, change}` ở cả hai vai trò (không có tiền).
7. **`before` / `after` thành `changes[]`.** AC-SET-12 yêu cầu một dòng với "hai mục (trường, trước, sau)" nên một trường `before` / `after` đơn không đủ. *Đã chọn:* `changes: [{field, label, before, after}]` cho `settings.updated`; vai trò trước / sau của nguồn (c) ở `roleBefore` / `roleAfter`.
8. **Nhật ký đơn.** PRD loại "ghi chú nội bộ, nội dung cuộc gọi" nhưng không nói có liệt kê *sự kiện* ghi chú / gọi hay không. *Đã chọn:* liệt kê sự kiện (`order.note-added`, `order.call-attempt`) không kèm nội dung; `reason` của nguồn (a) chỉ là `reason_code`. *Đề xuất:* PO cân nhắc ẩn hẳn hai loại này nếu thấy lộ hoạt động nội bộ.
9. **Nhật ký không chặn `to` ở tương lai** (PRD chỉ nói "sai -> 422"); báo cáo chặn `to` sau hôm nay (BR-RPT-01). *Đã chọn:* khác nhau có chủ ý, vì nhật ký không có kỳ so sánh.
10. **`previous = null`.** PRD: "null nếu kỳ trước không có đơn nào". *Đã chọn:* nhóm doanh thu null khi kỳ trước không có đơn tính doanh thu; nhóm đơn đặt / huỷ / `cancelRate` null khi kỳ trước không có đơn đặt lẫn huỷ (mục 5).
11. **Đường dẫn:** `GET /admin/reports/sales/export` (không dùng đuôi `.csv`), `GET /admin/audit-log`, `/admin/settings/store`; `lateDelivery` (Should) có trong schema và làm ngay ở 8.2 vì rẻ.
12. **Ngưỡng sắp hết** (`low_stock_default`) đổi ở Tồn kho không vào nhật ký hợp nhất (S8-Q4 không nhân đôi, `inventory_adjustments` chỉ ghi điều chỉnh số lượng) và không đổi `updatedAt` của cài đặt. *Đề xuất:* nếu PO muốn nhật ký đủ, Slice sau thêm sự kiện ngưỡng.
13. **Hotline:** thêm giới hạn độ dài chuỗi thô <= 20 (PRD chỉ nêu 8-11 chữ số sau khi bỏ ký tự phân cách).
14. **Cột thông tin cửa hàng nằm trên `store_settings`** (không bảng riêng) để một `updatedAt` và một khoá dòng cover cả lô (BR-SET-07 nguyên tử); đây là `ALTER TABLE ... ADD COLUMN ... DEFAULT` + `ADD CONSTRAINT` trên bảng đang có (cộng thêm, không mất dữ liệu; tiền lệ Slice 6 đã làm với `low_stock_default`).
15. **Chạm mã ngoài module mới (không đổi hành vi):** trích `inventoryCounts` khỏi `inventoryFacets`, mở rộng kiểu `requirePermission`, thêm tham số `contact` cho các hàm dựng thư, thêm `parseBodyAll` / `validationMany`, `resetState` thêm bảng nhật ký cài đặt và đặt lại dòng cài đặt. Chạy lại test Slice 3 / 4 / 6 / 7 sau lát 8.1 và 8.4.
16. **Áp migration lên Supabase** chỉ sau khi Thắng duyệt (lát 8.7). Thông tin cần Thắng: giá trị pháp lý thật (G9). Hiện chỉ áp DB cục bộ `n2f_dev`, `n2f_test`.
17. **Khi duyệt:** Orchestrator ghi `docs/decisions.md` (contract Slice 8 locked + các điểm trên) và chuyển `x-status: draft` -> `locked`, `status: draft` -> `locked` ở `info.description` và 5 tag.
