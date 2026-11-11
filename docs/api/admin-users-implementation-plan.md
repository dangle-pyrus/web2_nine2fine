# Kế hoạch triển khai Admin khách hàng & nhân viên (Slice 7) - draft 2026-11-11

Hợp đồng: `docs/api/openapi.yaml` (phần Slice 7 `status: draft`, 11 operation, tag `admin-customers`, `admin-staff`; chuyển `locked` sau khi Orchestrator duyệt mục 12, trước khi FE nối). BR/AC: `docs/product/PRD.md` mục "Slice 7" (BR-USR-01..25, AC-USR-01..44, S7-Q1..Q9). Lát giao: `docs/product/backlog.md` mục "Slice 7" (7.1-7.8). Khi mâu thuẫn, PRD thắng. Chỉ là tài liệu: agent triển khai làm theo mục 11 không cần hỏi lại; các điểm lệch cần duyệt ở mục 12. Cùng khuôn với `docs/api/admin-catalog-implementation-plan.md` (đọc mục 3, 4, 10: `requirePermission`, `adminRateLimit`, `noStore`, idempotency `admin-action`).

## 0. Câu hỏi S7-Q1..Q9

Làm theo mặc định PO. Tham số gom vào khối `USERS_ASSUMPTIONS` trong `backend/src/config/assumptions.ts` (cạnh `CATALOG_ASSUMPTIONS`); bảng quyền `USER_PERMISSIONS` cùng file.

| Q | Mặc định | Lật ở đâu | Hệ quả khi lật |
| --- | --- | --- | --- |
| S7-Q1 | tạo nhân viên không mật khẩu + thư hướng dẫn "Quên mật khẩu" | `staff.service.ts` + `staffInviteMail` | Phương án "liên kết mời một lần" = bảng token mới + trang FE mới (Won't); không lật được bằng tham số |
| S7-Q2 | chỉ admin khoá / mở khách | `USER_PERMISSIONS.staff` thêm `customers.edit` + `permissions.ts` FE | Đổi 1 dòng ở hai nơi; test T-USR-02 đổi ma trận |
| S7-Q3 | staff thấy liên hệ đã che, không ngày sinh / địa chỉ | `USER_PERMISSIONS.staff` thêm `customers.contact` | `canSeeContact(role)` đọc bảng quyền nên một dòng là đủ; `contactMasked` tự thành `false` |
| S7-Q4 | lý do khoá 5-250, không thư, chỉ chặn đăng nhập | `USERS_ASSUMPTIONS.reason` | Tham số |
| S7-Q5 | email của khách không nâng được thành nhân viên (`409 duplicate`) | `staff.service.ts` (kiểm email) | Đổi = tính năng "nâng khách" (Won't) |
| S7-Q6 | hạng theo BR-ACC-15 | `ACCOUNT_ASSUMPTIONS.tiers` (có sẵn) | Một nguồn với `GET /account/membership` |
| S7-Q7, Q8 | trường FE không có cột = Won't; không xoá cứng | - | Thêm cột / bảng ở slice sau |
| S7-Q9 | 10 tạo nhân viên / 60 phút; `limit` <= 50; nhân viên <= 200; lý do 5-250; tên 2-100 | `USERS_ASSUMPTIONS` | Tham số (nhưng CHECK DB của lý do 250 / 5 phải đổi bằng migration mới) |

## 1. Phạm vi BE Slice 7

11 operation (tất cả admin):

| Tag | Endpoint | Quyền |
| --- | --- | --- |
| admin-customers | `GET /admin/customers` (kèm `counts`; không có endpoint `counts` riêng) | staff, admin (`customers.view`) |
| admin-customers | `GET /admin/customers/{customerId}` | staff, admin |
| admin-customers | `GET /admin/customers/{customerId}/orders` | staff, admin |
| admin-customers | `POST /admin/customers/{customerId}/lock`, `POST .../unlock` | admin (`customers.edit`) |
| admin-staff | `GET /admin/staff`, `POST /admin/staff` | admin (`settings.staff`) |
| admin-staff | `POST /admin/staff/{staffId}/lock`, `POST .../unlock`, `PUT .../role` | admin |
| admin-staff | `GET /admin/accounts/{accountId}/history` (khách hoặc nhân viên) | admin |

Mã lỗi mới (2, thêm vào `ErrorCode` + `STATUS`): `self-change` 409, `last-admin` 409. Dùng lại: `unauthenticated`, `forbidden`, `origin-not-allowed`, `not-found`, `validation`, `duplicate` (`field: email`), `idempotency-conflict`, `rate-limited`, `unavailable`. `Errors.selfChange()` ("Bạn không thể tự khoá hoặc tự đổi vai trò của chính mình."), `Errors.lastAdmin()` ("Hệ thống phải còn ít nhất một quản trị viên đang hoạt động."). `ErrorResponse.error` **không** thêm trường mới.

Ngoài phạm vi: ghi chú / tag khách, xuất CSV, gộp khách, xoá tài khoản, nâng khách thành nhân viên, gửi lại thư mời, đổi họ tên nhân viên, thư báo khoá, báo cáo / nội dung / cài đặt cửa hàng / nhật ký toàn hệ thống.

## 2. Schema Prisma và migration (chỉ cộng thêm, BR-USR-06)

Một migration `backend/prisma/migrations/20261111000100_admin_users_schema/` (sau `20261110000100`). **Không sửa `users`, `sessions` hay bảng nào đang có.** Chỉ `CREATE TABLE`, `ALTER TABLE ... ADD CONSTRAINT` (trên bảng mới), `CREATE INDEX IF NOT EXISTS`, `ENABLE ROW LEVEL SECURITY`. Không `UPDATE`/`INSERT` dữ liệu.

Quy trình: `npx prisma migrate dev --create-only --name admin_users_schema` trên DB cục bộ `n2f_dev`; mở SQL, thêm tay các CHECK, RLS, sửa `CREATE INDEX` thành `IF NOT EXISTS`; quét `DROP|TRUNCATE|DELETE FROM|RENAME|ALTER COLUMN .* TYPE`: có thì dừng (cụm `ON DELETE SET NULL` của FK là hợp lệ, không phải xoá dữ liệu). Áp lên Supabase chỉ khi Thắng duyệt (lát 7.7); Orchestrator chạy `migrate deploy` (`DIRECT_URL`), không `migrate dev`/`reset`/`db push`.

SQL dự kiến (mọi câu):

```sql
-- CreateTable
CREATE TABLE "account_events" (
    "event_id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "at"               TIMESTAMP(6) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    "action"           VARCHAR(16)  NOT NULL,
    "actor_user_id"    UUID,
    "actor_name"       VARCHAR(100) NOT NULL,
    "actor_role"       "user_role"  NOT NULL,
    "target_user_id"   UUID,
    "target_email"     VARCHAR(254) NOT NULL,
    "target_name"      VARCHAR(100) NOT NULL,
    "target_role"      "user_role"  NOT NULL,
    "role_before"      "user_role",
    "role_after"       "user_role",
    "reason"           VARCHAR(250) NOT NULL DEFAULT '',
    "sessions_revoked" INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT "account_events_pkey" PRIMARY KEY ("event_id")
);

-- ForeignKey (SET NULL như inventory_adjustments: test dọn người dùng không bị chặn; dòng vẫn giữ ảnh chụp tên / email)
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK (lưới cuối của BR-USR-24: hình dạng dòng nhật ký)
ALTER TABLE "account_events"
  ADD CONSTRAINT "chk_account_events_action"  CHECK ("action" IN ('staff-created','locked','unlocked','role-changed')),
  ADD CONSTRAINT "chk_account_events_actor"   CHECK ("actor_role" IN ('staff','admin')),
  ADD CONSTRAINT "chk_account_events_shape"   CHECK (
       ("action" = 'staff-created' AND "role_before" IS NULL AND "role_after" IN ('staff','admin'))
    OR ("action" = 'role-changed'  AND "role_before" IN ('staff','admin') AND "role_after" IN ('staff','admin') AND "role_before" <> "role_after")
    OR ("action" IN ('locked','unlocked') AND "role_before" IS NULL AND "role_after" IS NULL)),
  ADD CONSTRAINT "chk_account_events_reason"  CHECK (char_length("reason") <= 250 AND ("action" <> 'locked' OR char_length("reason") >= 5)),
  ADD CONSTRAINT "chk_account_events_revoked" CHECK ("sessions_revoked" >= 0 AND ("action" IN ('locked','role-changed') OR "sessions_revoked" = 0));

-- Lịch sử một tài khoản: 20 dòng mới nhất (BR-USR-17)
CREATE INDEX IF NOT EXISTS "idx_account_events_target_at" ON "account_events" ("target_user_id", "at" DESC, "event_id" DESC);

-- RLS (không policy: chỉ vai trò máy chủ truy cập)
ALTER TABLE "account_events" ENABLE ROW LEVEL SECURITY;
```

Model Prisma `AccountEvent` (`@@map("account_events")`) + hai quan hệ có tên trên `User` (`accountEventsActed`, `accountEventsTargeted`). Chỉ có `INSERT`/`SELECT` trong mã; không `update`/`delete` (T-USR-42 quét tĩnh). **Không dùng trigger chặn UPDATE/DELETE**: FK `ON DELETE SET NULL` sinh UPDATE ngầm khi dọn người dùng (test, `resetState`), trigger sẽ phá. Đã cân nhắc, ghi ở mục 12 #6.

Không thêm index cho truy vấn khách / nhân viên: số khách đồ án nhỏ, danh sách khách quét `users` + `LATERAL` theo `idx_orders_user_created` đã có (R2 của Slice 4: chấp nhận quét tuần tự). Test: `migrate deploy` hai lần, `migrate diff --from-migrations --to-schema-datamodel` rỗng, số dòng `users`, `sessions`, `orders` không đổi, mọi bảng `public` mới đều RLS (mở rộng `admin-catalog-migration.test.ts` hoặc file mới).

## 3. Module backend

```
backend/src/lib/errors.ts                 + 'self-change', 'last-admin' (STATUS 409); Errors.selfChange(), .lastAdmin()
backend/src/config/assumptions.ts         + USERS_ASSUMPTIONS, UserPermission, USER_PERMISSIONS (mục 9)
backend/src/middleware/require-permission.ts   nhận Permission = CatalogPermission | UserPermission; tra cả hai bảng theo vai trò
backend/src/middleware/rate-limit.ts      + adminStaffCreateLimit (10 / 60 phút / tài khoản, key byAdminUser)
backend/src/lib/sql-fold.ts               foldCol() chuyển từ order-admin.query.ts (không đổi hành vi; order-admin import lại)
backend/src/lib/vn-time.ts                + vnYearBounds(now) (trích từ getMembership; account.service dùng lại)
backend/src/modules/order-admin/order-admin.query.ts   OrderFilter + userId? (nội bộ; contract admin-orders không đổi)
backend/src/mail/templates.ts             + staffInviteMail(to, name, role, appBaseUrl)
backend/src/modules/users-admin/
  users-admin.routes.ts       3 router: adminCustomersRouter, adminStaffRouter, adminAccountsRouter (Zod gắn ở đây)
  users-admin.schemas.ts      list khách (q, view, tier, sort, page, limit), orders (page, limit), lock {reason}, unlock {reason?}, staff {name,email,role}, role {role,reason?}; cleanText()
  customer.query.ts           listCustomers (CTE + LATERAL), loadCustomer, listCustomerOrders (qua listOrders + userId)
  customer.mapper.ts          maskEmail, maskPhone, toCustomerSummary/Detail(role) -> khoá birthDate/addresses CHỈ khi canSeeContact
  staff.query.ts              listStaff, loadStaff
  account-status.service.ts   changeAccountState(): lõi giao dịch dùng chung (mục 5)
  staff.service.ts            createStaff() + gửi thư sau commit (mục 7)
  account-event.ts            insertAccountEvent(tx, ...), listAccountEvents(id)
backend/src/app.ts
  const adminUsers = [noStore, requireAuth('admin'), requireRole('staff','admin'), adminRateLimit];
  api.use('/admin/customers', ...adminUsers, adminCustomersRouter);
  api.use('/admin/staff',     ...adminUsers, adminStaffRouter);
  api.use('/admin/accounts',  ...adminUsers, adminAccountsRouter);     // cạnh /admin/categories ... (SAU originGuard); body JSON 16 KB toàn cục là đủ
backend/test/helpers.ts       + loginAdminTwice/ makeMember({orders}) / makeStaff({passwordHash:null}) nếu chưa có
```

`requireAuth('admin')` đọc lại vai trò và `is_active` từ DB mỗi yêu cầu (BR-USR-01). `requirePermission` đứng **trước** Zod và trước mọi truy cập DB (staff gửi body sai vẫn nhận 403).

## 4. Quy ước chung

- **Chuẩn hoá chuỗi:** `cleanText()` dùng chung (có sẵn ở Slice 6: NFC, trim, gộp khoảng trắng). `reason` giữ nguyên chữ sau chuẩn hoá; đếm ký tự sau chuẩn hoá (5..250). `email` trim + chữ thường (CHECK `users_email_lowercase_chk` có sẵn); `Email` Zod như Slice 1 (<= 254).
- **Id:** sai UUID -> `404 not-found` ngay (không chạm DB), như Slice 6.
- **Thứ tự kiểm yêu cầu ghi:** `noStore` -> `requireAuth` 401 -> `originGuard` 403 -> `adminRateLimit` 429 -> `requirePermission` 403 -> (tạo nhân viên: `adminStaffCreateLimit` 429) -> `Idempotency-Key` 422 -> Zod 422 -> giao dịch: phát lại idempotency -> khoá toàn cục (nhân viên) -> kiểm lại người gọi 401/403 -> đọc đích 404 -> `self-change` -> `duplicate` / `last-admin` -> ghi. (Giới hạn tạo nhân viên đứng sau 403 để staff không đốt bộ đếm của admin; nó đếm **mọi** lần gọi tới được bước đó, kể cả 409 / 422.)
- **Giờ:** mọi `at`, `updated_at` ghi bằng `now()` của `lib/clock` (test đặt giờ được).
- **Log:** chỉ `userId`, hành động, mã lỗi. Không log `q` (email / SĐT khách), `reason`, tên, email nhân viên, token, mật khẩu. Không có nhật ký truy cập HTTP ghi query string (đã kiểm: `app.ts`, `middleware/*` không ghi `req.url`).
- **Che dữ liệu (BR-USR-11):** `canSeeContact(role) = USER_PERMISSIONS[role].includes('customers.contact')`. `maskEmail(e)`: phần tên dài >= 3 giữ 2 ký tự đầu, ngắn hơn giữ 1, rồi `***@domain`. `maskPhone(p)`: chỉ giữ chữ số, `84…` -> `0…`; >= 8 số: 4 số đầu + ` *** ` + 3 số cuối; ngắn hơn: `*** ` + 2 số cuối; null giữ null. Staff: **không có khoá** `birthDate`, `addresses` (không phải `null`): mapper dựng đối tượng theo hai nhánh, test so sánh toàn chuỗi JSON.

## 5. Đổi trạng thái / vai trò tài khoản (`account-status.service.ts`)

Một hàm lõi cho 5 thao tác: `lockCustomer`, `unlockCustomer`, `lockStaff`, `unlockStaff`, `setStaffRole`. Tham số: `actor { id, sessionId, role, name }`, `targetId`, `kind: 'customer' | 'staff'`, thao tác, `reason`, `key?`, `path`.

```
prisma.$transaction(async (tx) => {                       // READ COMMITTED (mặc định); { timeout: 10_000, maxWait: 5_000 }
  0. nếu có Idempotency-Key: acquireIdempotency(tx, 'admin-action', key, hash, now)  -- hash = {userId, method, path, body}
       replay -> trả snapshot (200, Idempotency-Replayed: true); hash khác -> 409 idempotency-conflict
  1. nếu kind = 'staff': SELECT pg_advisory_xact_lock($USERS_ASSUMPTIONS.adminGuardKey)   -- khoá toàn cục, chỉ cho thao tác nhân viên
  2. KIỂM LẠI NGƯỜI GỌI trong giao dịch (sau khi có khoá, nên thấy trạng thái đã commit của người đi trước):
       SELECT u.role, u.is_active, s.revoked_at FROM users u JOIN sessions s ON s.session_id = $sessionId WHERE u.user_id = $actorId
       không có dòng | s.revoked_at != NULL | !u.is_active  -> 401 unauthenticated
       u.role != 'admin' (hạ bằng SQL, phiên chưa thu hồi)  -> 403 forbidden
  3. SELECT ... FROM users WHERE user_id = $targetId AND role = ANY($roles) FOR UPDATE
       $roles = {member} cho khách, {staff, admin} cho nhân viên; không thấy -> 404
  4. kind = 'staff' và targetId = actorId  -> 409 self-change            (TRƯỚC mọi no-op, AC-USR-41)
  5. theo thao tác:
     lock:   !target.is_active -> trả DTO hiện tại (200, không ghi gì)
             kind='staff' và target.role='admin': đếm = COUNT(*) FROM users WHERE role='admin' AND is_active AND user_id <> $targetId
                                                 đếm = 0 -> 409 last-admin
             UPDATE users SET is_active=false, updated_at=$now; n = revokeAllUserSessions(tx, id, 'account-disabled')
             INSERT account_events (action 'locked', reason, sessions_revoked n, ...)
     unlock: target.is_active -> 200 không ghi; UPDATE is_active=true; INSERT 'unlocked' (sessions_revoked 0)  -- KHÔNG đụng sessions
     role:   role = target.role -> 200 không ghi
             hạ admin -> staff mà target.is_active và đếm admin hoạt động khác target = 0 -> 409 last-admin
             (target đã khoá: hạ không làm giảm số admin hoạt động nên được phép)
             UPDATE users SET role=$new, updated_at=$now; n = revokeAllUserSessions(tx, id, 'role-changed')
             INSERT 'role-changed' (role_before, role_after, sessions_revoked n)
  6. đọc lại DTO (cùng tx) ; nếu có key: completeIdempotency(tx, ..., snapshot = DTO)
})
```

Vì sao đúng:
- **Một giao dịch:** `is_active` / `role`, thu hồi phiên và dòng nhật ký nằm chung một `$transaction`. `insertAccountEvent` là hàm riêng của module để test giả lỗi (`vi.spyOn`) và chứng minh rollback toàn bộ (AC-USR-28).
- **Không bao giờ 0 admin hoạt động:** mọi đường **giảm** số admin hoạt động của hệ thống (khoá admin, hạ admin) đều là thao tác nhân viên, đều lấy cùng `pg_advisory_xact_lock` trước khi đếm; nên chúng chạy tuần tự, và mỗi lần đếm thấy kết quả đã commit của lần trước (READ COMMITTED lấy snapshot mới cho từng câu lệnh, kể cả sau khi chờ khoá). Hai admin hạ nhau cùng lúc: bên thứ hai, sau khi bên thứ nhất commit, hoặc gặp `401` ở bước 2 (phiên vừa bị thu hồi bởi `role-changed` / `account-disabled`) hoặc, nếu phiên còn sống nhưng đã mất quyền, `403`; trường hợp còn lại không còn hai admin thì `409 last-admin`. Không bên nào ghi mà để lại 0 admin. Thao tác **tăng** số admin (tạo admin, mở khoá admin, nâng staff) không cần khoá toàn cục (mở khoá vẫn đi qua hàm này nên được tuần tự hoá cho gọn).
- **Khách không dùng khoá toàn cục:** khoá / mở khách không đổi số admin; chỉ `FOR UPDATE` dòng khách nên hai admin khoá cùng khách: lần hai thấy `is_active = false` -> 200 không nhật ký.
- **Khoá `pg_advisory_xact_lock` (mức giao dịch):** tự nhả khi commit / rollback; chạy được qua pgbouncer chế độ transaction của Supabase (`DATABASE_URL`), khác khoá mức phiên. Khoá ưu tiên đứng đầu thứ tự khoá: khoá nhân viên -> dòng `users` đích; các đường khác (địa chỉ khoá dòng `users` đơn lẻ, đặt hàng khoá `orders`/`product_variants`) không giữ khoá nào của ta nên không chu trình. Tái thử `P2034`/`40P01` tối đa 3 lần.
- **Phiên bị thu hồi:** `revokeAllUserSessions(userId, reason, tx)` có sẵn (`revoked_at IS NULL`, mọi `audience`); số trả về = `sessions_revoked` (đếm cả dòng đã hết hạn nhưng chưa đóng dấu, vô hại). Yêu cầu kế tiếp của mọi máy: `authenticate()` thấy `revoked_at` -> 401 (AC-USR-22, 26, 27). Yêu cầu đã qua `authenticate` ngay trước commit vẫn chạy nốt (phạm vi "yêu cầu kế tiếp", BR-USR-16); với thao tác ghi của chính nhân viên đó thì bước 2 chặn.
- **Mở khoá không khôi phục phiên** (không có đường nào bỏ `revoked_at`); cookie cũ vẫn 401 (AC-USR-25, 29).
- **Đăng nhập chạy đồng thời với khoá:** phiên tạo giữa lúc đang khoá vẫn bị `authenticate()` từ chối vì `is_active = false` đọc mỗi yêu cầu.

## 6. Khách hàng (`customer.query.ts`)

Một CTE tính số liệu cho mọi `member` (đã lọc `q`), rồi lọc `tier` / `view`, sắp, phân trang:

```sql
WITH base AS (
  SELECT u.user_id, u.first_name, u.last_name, u.email, u.phone_number, u.is_active,
         agg.order_count, agg.total_spent, agg.last_order_at, agg.year_spent,
         CASE WHEN agg.year_spent >= $gold THEN 'gold' WHEN agg.year_spent >= $silver THEN 'silver' ELSE 'bronze' END AS tier
  FROM users u
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE o.status <> 'cancelled')::int                                  AS order_count,
           COALESCE(SUM(o.total) FILTER (WHERE o.status = 'completed'), 0)::bigint               AS total_spent,
           MAX(o.created_at) FILTER (WHERE o.status <> 'cancelled')                              AS last_order_at,
           COALESCE(SUM(o.total) FILTER (WHERE o.status = 'completed'
             AND COALESCE(o.delivered_at, o.created_at) >= $yearFrom AND COALESCE(o.delivered_at, o.created_at) < $yearTo), 0)::bigint AS year_spent
    FROM orders o WHERE o.user_id = u.user_id) agg ON true
  WHERE u.role = 'member' AND <điều kiện q>
)
```
- Hạng: ngưỡng lấy từ `ACCOUNT_ASSUMPTIONS.tiers`, năm VN qua `vnYearBounds(now())`; công thức đúng `getMembership` (`delivered_at` nếu có, không thì `created_at`) nên chi tiết khớp `GET /account/membership` (AC-USR-16).
- `q` (<= 100 sau trim, dài hơn -> 422 `q`): `OR` của (a) tên: `foldCol(last_name || ' ' || first_name) LIKE '%fold(q)%' ESCAPE '\'`; (b) email: `email LIKE '%lower(q)%' ESCAPE '\'`; (c) SĐT: nếu `q` sau bỏ khoảng trắng / `.` / `-` và chuẩn hoá `+84`/`84` -> `0` còn >= 4 chữ số liên tiếp: `regexp_replace(phone_number, '\D', '', 'g') LIKE '%digits%'`. `escapeLike` (có sẵn `lib/like.ts`) nên `%`, `_` là ký tự thường (AC-USR-12). Cùng hàm cho `list` và `counts`.
- `counts` = một truy vấn `COUNT(*)` và `COUNT(*) FILTER (WHERE NOT is_active)` trên `base` đã lọc `q` + `tier` (không `view`). Trang: `ORDER BY` theo `sort` (mặc định `last_order_at DESC NULLS LAST`; `total_spent DESC`; `order_count DESC`; tên: `foldCol(first_name)`, `foldCol(last_name)` tăng, theo thứ tự Việt: tên rồi họ), luôn thêm `user_id` để hoà; `COUNT(*) OVER()` cho `total`.
- Chi tiết: `loadCustomer(id, role)`: `users WHERE user_id = $id AND role = 'member'` (không thấy -> 404); số liệu qua cùng CTE giới hạn một id; `recentOrders` = `listOrders({ userId, page: 1, limit: 10 })` + `toAdminSummary` (tái dùng Slice 4); admin: `addresses` (`addresses` join `provinces`, `wards`, sắp `is_default DESC, created_at ASC`; `line` = `street, ward, province`, địa chỉ cũ thiếu mã thì dùng `district`, `city`) và `birthDate`.
- `GET .../orders`: `listOrders({ userId, page, limit })`, 404 nếu id không phải khách; `limit` 1..50.
- Số liệu đọc tại lúc gọi, không cache (BR-USR-09). `Cache-Control: no-store` từ `noStore`.

## 7. Nhân viên (`staff.service.ts`, `staff.query.ts`)

- **Danh sách:** `users WHERE role IN ('staff','admin') ORDER BY created_at ASC, user_id ASC LIMIT 200`, `lastActiveAt = (SELECT MAX(last_used_at) FROM sessions WHERE user_id = u.user_id)` (cả phiên đã thu hồi), `passwordSet = password_hash IS NOT NULL`, `status = is_active ? 'active' : 'disabled'`. Không bao giờ chọn `password_hash`: `SELECT` liệt kê cột, DTO dựng thủ công.
- **Tạo (`createStaff`):** Zod: `name` (cleanText, 2..100), `email` (Slice 1), `role` in {staff, admin} (`member`, `owner` -> 422 `role`). Một giao dịch: bước 0 idempotency (bắt buộc), bước 2 kiểm lại người gọi (như mục 5, không cần khoá toàn cục vì không giảm admin), `SELECT 1 FROM users WHERE lower(email) = $email` có -> `409 duplicate` (`field: email`; bắt thêm `P2002` của `users_email_key` khi đua), `INSERT users` (`email`, `first_name`, `last_name`, `role`, `is_active = true`, `password_hash = NULL`, `marketing_opt_in = false`, `terms_accepted_at = now()` vì cột NOT NULL: xem mục 12 #7), `INSERT account_events ('staff-created', role_after)`, snapshot idempotency. Tách tên: từ cuối là `first_name`, phần còn lại là `last_name` ("Trần Thu Hà" -> `Trần Thu` / `Hà`; một từ -> `last_name = ''`); hiển thị `${last_name} ${first_name}` (khớp `staffDisplayName`) nên trả lại đúng chuỗi đã nhập.
- **Thư (BR-USR-20):** SAU commit, `sendMailInBackground(staffInviteMail(email, name, role, cfg.appBaseUrl))` (cùng đường `mailer.ts`: SMTP thật hoặc `dev-outbox`). Nội dung: tên, vai trò (Nhân viên / Quản trị viên), 3 bước: mở `{appBaseUrl}/auth/forgot-password`, nhập đúng email này, nhập mã 8 chữ số nhận bằng thư (hiệu lực 10 phút, xin lại được), đặt mật khẩu theo quy tắc hiện hành, rồi đăng nhập ở `{appBaseUrl}/admin/login`. **Không chứa mã hay mật khẩu.** Lỗi gửi chỉ log tên lỗi (`runInBackground`) -> vẫn 201 (AC-USR-34). Không bảng outbox bền / thử lại (mục 12 #9). Phát lại idempotency không gửi thư lần hai.
- **Đặt mật khẩu:** không đổi mã auth. `requestCode(email, 'reset-password')` đã gửi mã cho tài khoản `is_active` bất kể `password_hash`; `resetPassword` đặt hash và thu hồi mọi phiên; `/admin/auth/login` với tài khoản chưa có hash đi nhánh `verifyPasswordDummy` -> `invalid-credentials`, không lộ "chưa đặt mật khẩu" (AC-USR-35); tài khoản khoá -> thư `accountDisabledMail`, không mã (AC-USR-36). Test tích hợp đi hết luồng này.
- **Khoá / mở / đổi vai trò:** mục 5. Phản hồi `AdminStaffMember` đọc lại sau thao tác.
- **Lịch sử:** `account_events WHERE target_user_id = $id ORDER BY at DESC, event_id DESC LIMIT 20`; 404 nếu `users` không có id.

## 8. Idempotency và giới hạn tần suất

- **Idempotency:** tái dùng bảng `idempotency_keys`, scope `admin-action` (không cần migration). `acquireIdempotency` / `completeIdempotency` như `adjustStock`; hash = `{userId, method, path, body}` nên cùng khoá khác đường dẫn / thân -> `409 idempotency-conflict`. Tạo nhân viên: **bắt buộc** khoá (thiếu -> 422 `Idempotency-Key`); phát lại -> `200` + `Idempotency-Replayed: true` (lần đầu `201`). Lỗi 4xx/5xx không lưu khoá (khoá chỉ tồn tại khi commit). Khoá / mở / đổi vai trò: khoá tuỳ chọn (tự chúng đã idempotent theo trạng thái; AC-USR-05 chỉ cần "bấm lại không thêm dòng nhật ký").
- **Rate limit:** `adminRateLimit` có sẵn (đọc 120 / 60 giây, ghi 60 / 60 giây, theo `user_id`, chung bộ đếm với Slice 4 và 6); `adminStaffCreateLimit` = `createRateLimit({ name: 'admin-staff-create', windowMs: 60 * 60_000, max: 10, key: byAdminUser })`, gắn ở route `POST /admin/staff` sau `requirePermission`. `429` kèm `Retry-After` + `retryAfterSeconds` (AC-USR-06 dùng đồng hồ giả).

## 9. Ma trận quyền

`USER_PERMISSIONS` (cùng tên với `frontend/src/app/admin/core/permissions.ts` để một nguồn nghĩ cho hai phía):

| Quyền | staff | admin | Dùng ở |
| --- | --- | --- | --- |
| `customers.view` | có | có | `GET /admin/customers`, `.../{id}`, `.../{id}/orders` |
| `customers.contact` | - | có | không chặn route; quyết định bỏ che email / SĐT và có `birthDate`, `addresses` |
| `customers.edit` | - | có | `POST /admin/customers/{id}/lock`, `.../unlock` |
| `settings.staff` | - | có | `GET/POST /admin/staff`, `POST /admin/staff/{id}/lock|unlock`, `PUT .../role`, `GET /admin/accounts/{id}/history` |

Không phiên / hết hạn / thu hồi / chỉ `n2f_sid` / `is_active = false` -> `401 unauthenticated` + `Cache-Control: no-store` (`requireAuth('admin')`). Thiếu quyền -> `403 forbidden`, trước khi đọc thân và mở giao dịch, nên không đổi dữ liệu / không nhật ký / không thư (AC-USR-02). `member` không có phiên admin nên luôn 401.

## 10. Điểm FE phải đổi (frontend-dev; BE chỉ đọc)

1. **Cờ `adminUsersMode`** (`'mock' | 'http'`) trong `ApiConfig`, độc lập `adminOrdersMode` / `adminCatalogMode`; e2e giữ `mock`. `http` mở menu Khách hàng và Cài đặt › Nhân viên (chỉ admin); các route admin khác vẫn "Chưa khả dụng"; ẩn Won't (BR-USR-05, AC-USR-07, 08).
2. **`HttpAdminCustomersApi`:** `search` -> `q`, `pageSize` -> `limit`, `status` -> `view` (`''` -> `all`), `tier`: `member` -> `bronze` (nhãn Đồng); trả `Page` + `counts` (số trên tab). Bỏ `sort`/`dir` kiểu cũ, dùng `sort` mới. **Bỏ việc che email ở client** ở chế độ HTTP (máy chủ đã che; che hai lần ra `m***`): dùng `contactMasked` để hiện chữ "Liên hệ được ẩn bớt theo quyền của bạn."
3. **`AdminCustomer`:** bỏ `tags`, `note`, `returnCount`, `usualSizes`, `averageOrderValue`, nút Xuất CSV, ô tag / ghi chú; `birthDate` và `addresses` có thể vắng (staff) -> ẩn mục; thêm `spentThisYear`. `recentOrders` (<= 10) mỗi dòng dẫn `/admin/orders/{id}`. "Xem tất cả đơn": admin -> `/admin/orders?q=<email>` kèm chữ "theo email"; staff (không có email đầy đủ) -> danh sách phân trang từ `GET /admin/customers/{id}/orders` trong chính trang chi tiết.
4. **Khoá / mở khách:** `update(id, {status})` -> `POST /admin/customers/{id}/lock|unlock` + hộp thoại nhập lý do (5-250 khi khoá, tuỳ chọn khi mở); chữ khoá: "Khách không đăng nhập được cho đến khi bạn mở khoá. Đơn đang xử lý không bị ảnh hưởng." Nút khoá khi đang gửi; lỗi / mất mạng giữ nguyên hộp thoại; ẩn nút với staff (`customers.edit`).
5. **Màn Nhân viên:** `listStaff` -> `GET /admin/staff` (mảng, không phân trang); `inviteStaff` -> `POST /admin/staff` kèm `Idempotency-Key` sinh **một lần cho mỗi ý định** (giữ khi "Thử lại"); `updateStaff` tách: khoá / mở -> `POST .../lock|unlock` (+ lý do), đổi vai trò -> `PUT .../role`; `StaffMember` thêm `passwordSet` (nhãn "Chờ đặt mật khẩu" thay "Chưa đăng nhập"), `lastActiveAt` có thể null; dòng "(bạn)" (so với id của `GET /admin/auth/me`) không có menu thao tác; hộp thoại tạo hiện lại email + vai trò để xác nhận (mục 12 #8); sau tạo hiện "Nếu nhân viên không nhận được thư, họ vẫn dùng Quên mật khẩu với email này."; chữ khoá "bị đăng xuất" giữ (đúng thật nhờ thu hồi phiên). Ẩn bảng quyền các dòng Won't.
6. **Xử lý lỗi theo `error.code`:** `self-change`, `last-admin` (câu ở mục 1), `duplicate` (gắn vào ô email), `forbidden` (ẩn nút), `rate-limited` (`retryAfterSeconds`), `idempotency-conflict`, `unauthenticated` (-> `/admin/login`, gồm khi chính mình bị khoá / hạ vai trò), `validation` + `field` (`reason`, `name`, `email`, `role`, `q`). Không trang trắng.
7. **`permissions.ts`:** staff đã không có `customers.edit` / `customers.contact` / `settings.staff` (khớp mục 9, không đổi); admin giữ. Guard `/admin/settings/staff` theo `settings.staff`.
8. **`/admin/login`:** thêm liên kết "Quên mật khẩu" -> `/auth/forgot-password` (BR-USR-25, Should).
9. Giữ nguyên `mode: mock`; Playwright mock pass nguyên. Thêm spec HTTP-mô-phỏng (`contract-mock`) cho `self-change` / `last-admin`.

## 11. Thứ tự làm và test (T-USR ↔ AC-USR theo lát)

Mỗi lát: `tsc --noEmit` và test của lát pass (từng file chạy 2 lần). Kèm `assertNoSecrets(res)` trong helper test: sau mỗi lời gọi API Slice 7 quét thân phản hồi tìm `password_hash`, `passwordHash`, `refresh_token_hash`, `ip_address`, `user_agent`, mã OTP 8 số của thư; và một spy trên `logger` quét mọi dòng log (AC-USR-21).

**7.1 Nền** (migration, `USER_PERMISSIONS`, `requirePermission` mở rộng, 2 mã lỗi, `adminStaffCreateLimit`, mount 3 router rỗng, `USERS_ASSUMPTIONS`, `foldCol` / `vnYearBounds` trích, `openapi.yaml` locked):

| Test | AC | Kiểm |
| --- | --- | --- |
| T-USR-01 | AC-USR-01 | Không cookie / chỉ `n2f_sid` / staff `is_active=false`: `GET` khách, `GET` nhân viên, `POST` khoá khách, `POST` tạo nhân viên -> 401, `no-store`, DB không đổi |
| T-USR-02 | AC-USR-02 (đóng AC-AUTH-85) | S: danh sách / tạo / đổi vai trò / khoá nhân viên, khoá khách, lịch sử -> 403, không dòng `account_events`, không thư; S vẫn `GET` khách + chi tiết 200; A cùng các API 200/201 |
| T-USR-03 | AC-USR-03 | A hạ bằng SQL, S nâng bằng SQL: A 403, S 200, không đăng nhập lại |
| T-USR-04 | AC-USR-06 | 61 ghi / 60 giây -> 429 + `Retry-After` + `retryAfterSeconds`; 11 lần tạo nhân viên / 60 phút -> 429, 10 lần đầu 201 (đồng hồ giả) |
| T-USR-05 | AC-USR-09 | `migrate deploy` x2; không DROP/TRUNCATE/RENAME/đổi kiểu; `account_events` bật RLS; số dòng `users`/`sessions`/`orders` không đổi; `diff` rỗng; CHECK hình dạng (chèn sai bị từ chối) |
| T-USR-06 | AC-USR-10 (BE) | Gây lỗi của AC-USR-01, 02, 23, 33, 37, 41: `code` + HTTP đúng; quét không có stack / SQL / `password_hash` |

**7.2 Khách đọc** (kèm Should: sổ địa chỉ BR-USR-12 làm ở lát 7.6):

| Test | AC | Kiểm |
| --- | --- | --- |
| T-USR-10 | AC-USR-11 | 25 khách: trang 1 = 20 dòng, M trước, 5 khách không đơn ở cuối; trang 2 = 5; `limit=51`, `limit=0` 422; `page=99` rỗng `total 25` |
| T-USR-11 | AC-USR-12 | `q` = `nguyen van minh`, `minh.ng`, `0912`, `+84912345` ra M; 101 ký tự 422 `q`; `%` chỉ khớp ký tự `%` |
| T-USR-12 | AC-USR-13 | Tab `blocked`, lọc Vàng, Vàng + `blocked`; `counts` = số dòng; `tier` lạ 422 |
| T-USR-13 | AC-USR-14 | Không dòng nào là A/S/N; chi tiết id của S 404; id lạ / sai dạng 404 |
| T-USR-14 | AC-USR-15 | M: `orderCount` 2, `totalSpent` 2.000.000, `lastOrderAt` = giờ đặt O2; đơn vãng lai G cùng email không tính |
| T-USR-15 | AC-USR-16 | K1 17.999.999 Đồng; K2 18.000.000 Bạc; K3 40.000.000 Vàng; K4 năm ngoái 50tr Đồng; chi tiết khớp `GET /account/membership` của khách (đăng nhập thật) |
| T-USR-16 | AC-USR-17 | M 12 đơn: chi tiết đúng 10 đơn mới nhất; `GET .../orders` phân trang đủ 12; đơn mở được ở `GET /admin/orders/{id}` |
| T-USR-17 | AC-USR-18, 19 | S và A đọc M: S email `mi***@gmail.com`, SĐT `0912 *** 678`, JSON không chứa `minh.nguyen`, `0912345678`, ngày sinh, địa chỉ, không khoá `birthDate`/`addresses`; A đầy đủ; S tìm `q` = email đầy đủ và SĐT đầy đủ ra M (hiển thị vẫn che) |
| T-USR-18 | BR-USR-09 | `maskEmail` / `maskPhone` bảng ca biên (tên 1-2 ký tự, SĐT ngắn, null) |

**7.3 Khoá / mở khách + lõi dùng chung:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-USR-20 | AC-USR-22 | M 2 phiên `n2f_sid`: A khoá "Hoàn hàng gian lận lặp lại" -> 200, `is_active=false`, 2 dòng `sessions` `revoked_at` + `account-disabled`, 1 dòng `locked` (`sessions_revoked` 2), `GET /account/profile` ở cả hai -> 401 |
| T-USR-21 | AC-USR-23 | Lý do 4 / 251 ký tự / thiếu -> 422 `reason` x3; khoá lần hai 200 không dòng mới; id lạ 404; không dòng nhật ký cho các ca lỗi |
| T-USR-22 | AC-USR-24 | M khoá: đăng nhập mã + mật khẩu bị `account-disabled` + thư khoá; yêu cầu đặt lại không có mã; khách vãng lai đặt COD bằng email M được; O2 vẫn `to_ship` |
| T-USR-23 | AC-USR-25 | Mở khoá có / không lý do, 1 dòng `unlocked`; M đăng nhập được; cookie cũ 401; mở lần hai 200 không dòng |
| T-USR-24 | AC-USR-28 | Giả lỗi ở `insertAccountEvent` (spy) khi khoá N: lỗi; `is_active` vẫn true, không dòng, phiên không thu hồi |
| T-USR-25 | AC-USR-05 (BE) | Khoá lần một thành công rồi gửi lại (cùng / không cùng `Idempotency-Key`): đúng 1 dòng `locked` |

**7.4 Nhân viên đọc + tạo:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-USR-30 | AC-USR-31 | Chỉ A, A2, S, N (kể cả N khoá `disabled`); đủ trường; `lastActiveAt` = `last_used_at` lớn nhất, null nếu chưa đăng nhập; `passwordSet`; sắp `createdAt` tăng |
| T-USR-31 | AC-USR-32 | Tạo "Trần Thu Hà" `  Ha.Tran@Nine2fine.test ` `staff`: 201, email chữ thường đã cắt, `password_hash` NULL (SQL), 1 dòng `staff-created`, đúng 1 thư (vai trò + hướng dẫn, không mã / mật khẩu), phản hồi không mật khẩu, `name` hiển thị lại đúng chuỗi |
| T-USR-32 | AC-USR-33 | Email sai / 255 ký tự; tên 1 / 101 ký tự; vai trò `member`, `owner`: 422 đúng `field`; email của S (đổi hoa thường) và của M: 409 `duplicate` `email`; không tạo / nhật ký / thư |
| T-USR-33 | AC-USR-34 | SMTP lỗi (transport giả ném): 201, dòng nhật ký có, không 500; sau khi hết lỗi N vẫn "Quên mật khẩu" được |
| T-USR-34 | AC-USR-35, 36 | Tích hợp đầy đủ: đăng nhập bịa -> `invalid-credentials`; forgot-password + mã + mật khẩu yếu rồi hợp lệ -> vào được `/admin/auth/login` đúng vai trò; mã sau 11 phút hết hạn, xin mã mới được; N khoá trước -> thư khoá, không mã |
| T-USR-35 | AC-USR-06 (tạo) / BR-USR-03 | Idempotency tạo: gửi lại cùng khoá -> 200 `Idempotency-Replayed`, 1 tài khoản, 1 dòng, 1 thư; cùng khoá khác thân 409 `idempotency-conflict`; thiếu khoá 422 |

**7.5 Nhân viên khoá / mở / đổi vai trò (đóng AC-AUTH-75):**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-USR-40 | AC-USR-26 (đóng AC-AUTH-75), AC-USR-29 | N 2 máy: A khoá N; N gọi `GET /admin/customers` ở máy 1 rồi máy 2 -> 401 cả hai; 2 phiên `account-disabled`; nhật ký `sessions_revoked` 2; N mở khoá: cookie cũ 401, đăng nhập lại được |
| T-USR-41 | AC-USR-27 (đóng AC-AUTH-75) | A2 2 máy: A hạ A2 -> A2 gọi API nhân viên ở cả 2 máy 401 (không 403); `role-changed`; đăng nhập lại: API nhân viên 403, khách / đơn 200 |
| T-USR-42 | AC-USR-37 | A khoá S (5 ký tự) ok; lý do rỗng 422; mở khoá ok; A khoá A -> 409 `self-change`, A vẫn hoạt động; mỗi thao tác thành công 1 dòng |
| T-USR-43 | AC-USR-38, 39 | A đổi S thành admin, S đăng nhập lại thấy `GET /admin/staff` 200; về staff; A đổi A -> 409 `self-change`; S đã staff đặt staff -> 200 không dòng; id của M -> 404; `member` -> 422 `role` |
| T-USR-44 | AC-USR-40 | A, A2 là admin hoạt động duy nhất: chạy 20 lần hai yêu cầu song song (A hạ A2 / A2 hạ A, và biến thể khoá nhau): sau mỗi lần số admin hoạt động >= 1, đúng <= 1 thành công, bên kia 409 `last-admin` hoặc 401, không 500, mỗi thành công đúng 1 dòng |
| T-USR-45 | AC-USR-41 | A là admin hoạt động duy nhất, A3 admin khoá: A khoá A 409 `self-change`; A hạ A 409 `self-change`; A hạ A3 200; A mở khoá A3 200; luôn >= 1 admin |
| T-USR-46 | BR-USR-23 | Ba admin: hạ chéo tuần tự không để 0; hạ admin đã khoá không bị `last-admin` |
| T-USR-47 | AC-USR-28 (nhân viên) | Giả lỗi ở bước thu hồi phiên: vai trò / `is_active` không đổi, không dòng nhật ký |

**7.6 Should:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-USR-50 | AC-USR-20 | A thấy 2 địa chỉ, mặc định đứng đầu, đủ người nhận / SĐT / số nhà + phường + tỉnh; S không có khoá, JSON không có chuỗi địa chỉ |
| T-USR-51 | AC-USR-30 | M 3 thao tác (khoá, mở, khoá): A thấy 3 dòng mới trước đủ người / vai trò / hành động / lý do; S 403; id lạ 404 |
| T-USR-52 | AC-USR-42 | Sau AC-USR-32, 37, 38: lịch sử đủ trường (người + vai trò, đích id/email/tên lúc đó, vai trò trước/sau, lý do, số phiên); ca bị từ chối không dòng; `PUT`/`PATCH`/`DELETE` dòng và `DELETE` tài khoản -> 404; quét tĩnh: không có `accountEvent.update/delete*`, `UPDATE|DELETE FROM "account_events"` trong `backend/src` |
| T-USR-53 | AC-USR-43 (BE phần dữ liệu) | `passwordSet=false` cho N chưa đặt mật khẩu; `lastActiveAt` cho N2; N3 `disabled` |

**7.7 Nghiệm thu thật** (Thắng / Orchestrator, cần duyệt áp migration): tạo 1 nhân viên bằng email Thắng chọn, thư Gmail thật, đặt mật khẩu qua "Quên mật khẩu", vào `/admin`; khoá / mở 1 khách test; AC-AUTH-75 trên 2 trình duyệt; `migrate deploy` lần hai không có gì (AC-USR-09, 26, 27, 32, 35).

**Chỉ FE / E2E (không có T-USR):** AC-USR-04, 07, 08, 44; AC-USR-05 (phần mất mạng, FE), AC-USR-10 (phần câu hiển thị), AC-USR-43 (nhãn và liên kết).

Ghi kết quả đóng AC-AUTH-75 / AC-AUTH-85 vào `docs/product/backlog.md` G4 khi T-USR-02, 40, 41 xanh (việc của product-owner / Orchestrator).

## 12. Điểm lệch / cần Orchestrator duyệt (trước khi `locked`)

1. **Endpoint thêm ngoài PRD: `GET /admin/customers/{id}/orders`.** BR-USR-10 chỉ nêu "Xem tất cả đơn" mở màn Đơn hàng với `q` = email; staff nhận email đã che nên không dùng được `q`. Endpoint này cho staff (và admin) xem mọi đơn của khách theo `user_id`, phân trang. Admin vẫn có đường `q` = email để thấy cả đơn vãng lai. Không đổi contract Slice 4 (chỉ thêm tham số nội bộ `userId` ở `listOrders`).
2. **Hình dạng ghi:** `POST .../lock|unlock` (khách và nhân viên) + `PUT /admin/staff/{id}/role` + `GET /admin/accounts/{id}/history` dùng chung, thay cho `PATCH status` của FE mock (FE phải đổi, mục 10). `reason` nằm trong thân.
3. **Idempotency:** `POST /admin/staff` bắt buộc `Idempotency-Key` (lệch Slice 4 nơi tuỳ chọn; lý do: tạo không idempotent theo trạng thái, mất mạng sẽ nhận `409 duplicate` sai); phát lại trả `200`. Khoá / mở / đổi vai trò: tuỳ chọn.
4. **Tên mã lỗi** `self-change`, `last-admin` (PRD để BE chốt) và tái dùng `duplicate` cho email.
5. **Chống đua bằng `pg_advisory_xact_lock` toàn cục** cho mọi thao tác nhân viên (không cho khách) + kiểm lại người gọi (phiên chưa thu hồi, còn hoạt động, còn là admin) **trong giao dịch** -> trả `401` nếu đã bị thu hồi (khớp AC-USR-40: "409 `last-admin` hoặc 401"). Thay phương án khoá mọi dòng admin `FOR UPDATE`. Hoạt động qua pgbouncer transaction mode vì là khoá mức giao dịch. Hệ quả: hai thao tác nhân viên luôn tuần tự (chấp nhận, tần suất thấp).
6. **Bảng mới `account_events`** (cột, CHECK, FK `SET NULL`, index, RLS ở mục 2). Bất biến "không sửa / xoá" bảo vệ bằng không có đường ghi + test quét tĩnh, **không trigger** (FK `SET NULL` và dọn dữ liệu test sẽ vướng). Nhắc: `users`, `sessions` từ baseline vẫn chưa bật RLS (đã ghi nhận từ Slice 6, ngoài phạm vi Slice 7).
7. **Tạo nhân viên ghi `terms_accepted_at = now()`** (cột NOT NULL; nhân viên chưa từng chấp nhận điều khoản storefront, giá trị chỉ mang tính kỹ thuật). **Tách tên:** từ cuối = `first_name`, phần còn lại = `last_name` (một từ -> `last_name = ''`); không có cột "tên đầy đủ". Chấp nhận?
8. **Rủi ro email gõ nhầm (hệ quả của S7-Q1):** ai nhận được thư và dùng "Quên mật khẩu" với email đó sẽ chiếm tài khoản (kể cả `admin`). Đề xuất: FE bắt xác nhận lại email + vai trò trước khi tạo; BE giữ nguyên PRD (cho tạo `admin` trực tiếp). Có muốn chỉ cho tạo `staff` rồi nâng sau (thêm một bước, không đổi contract)?
9. **Thư mời không có outbox bền / thử lại:** chỉ gửi nền một lần, lỗi chỉ log; không ghi trạng thái gửi vào nhật ký. Khôi phục = nhân viên tự dùng "Quên mật khẩu". (Khác thư đơn hàng có `order_events.email_attempts`.) PRD chấp nhận (BR-USR-19, AC-USR-34); xác nhận không cần hơn.
10. **Dò email qua `q` của staff:** AC-USR-19 yêu cầu staff tìm được theo email / SĐT đầy đủ nên staff có thể thử "email X có là khách không". Giảm nhẹ duy nhất hiện có: giới hạn đọc 120 / 60 giây. Làm theo PRD; có muốn thêm giới hạn riêng cho `q` của staff (vd. 30 / phút) hoặc chỉ khớp toàn bộ giá trị với staff không?
11. **Số liệu / sắp xếp giả định:** `orderCount` và `lastOrderAt` loại `cancelled`; `totalSpent` = `completed` mọi thời gian (hạng dùng riêng chi tiêu năm nay: hai số khác nhau, cả hai hiển thị); sắp "tên A-Z" theo tên (`first_name`) rồi họ, bỏ dấu; tính tại lúc gọi bằng `LATERAL`, không cache, không thêm index. `sessions_revoked` đếm cả dòng đã hết hạn nhưng chưa đóng dấu.
12. **Chạm mã ngoài module mới (không đổi hành vi):** trích `foldCol` sang `lib/sql-fold.ts`, `vnYearBounds` sang `lib/vn-time.ts`, thêm `userId?` vào `OrderFilter` của `order-admin.query.ts`, mở rộng kiểu `requirePermission`. Chạy lại test Slice 4 / 5 / 6 sau lát 7.1 để chứng minh.
13. **Giới hạn tạo nhân viên đếm mọi lần gọi tới được** (kể cả 409 / 422), đặt sau `requirePermission` để staff không đốt bộ đếm của admin. PRD nói "10 lần / 60 phút / admin": hiểu là 10 lần gọi.
14. **Áp migration lên Supabase** chỉ sau khi Thắng duyệt (lát 7.7); hiện chỉ áp DB cục bộ. Thông tin cần Thắng cho 7.7: email thật để tạo nhân viên.

**Orchestrator duyệt (2026-11-11):** chấp nhận cả 14 điểm mục 12 như đề xuất; contract tag `admin-customers`, `admin-staff` chuyển **locked**. Điểm 7: FE bắt buộc bước xác nhận lại email + vai trò trước khi tạo nhân viên. Điểm 9: dùng giới hạn tần suất admin theo tài khoản hiện có, không thêm bộ đếm riêng.
