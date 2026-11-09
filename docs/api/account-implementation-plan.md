# Slice 5 Account — kế hoạch và ghi chú triển khai

PRD: `docs/product/PRD.md` › Slice 5 (BR-ACC-01..18, AC-ACC-01..26). Contract: `docs/api/openapi.yaml` tag `account` (locked 2026-11-08).

## Backend
- Module `backend/src/modules/account/`: `account.routes.ts` (gắn ở `app.ts`: `/api/account` → `noStore` → `requireAuth('storefront')` → router; giới hạn theo tài khoản đọc 120 / ghi 30 mỗi 60 giây), `account.schemas.ts` (zod; tái dùng `phoneField`, quy tắc ngày sinh / 13 tuổi / mật khẩu của auth), `account.service.ts` (hồ sơ, mật khẩu, hạng), `address.service.ts` (sổ địa chỉ), `voucher-list.service.ts` (ưu đãi công khai).
- Mật khẩu: kiểm `currentPassword` bằng `verifyPassword`; sai ghi `recordFailure('pwchange:<userId>', 5 lần / cách 15 phút, khoá 15 phút)` → lần 1–5 `422 invalid-password`, sau đó `429 password-locked` (kể cả nhập đúng) tới hết khoá. Thành công: một giao dịch đổi băm + thu hồi mọi phiên khác (`revoke_reason = password-changed`), xoá bộ đếm đổi mật khẩu và sai mật khẩu đăng nhập, thư `passwordChangedMail` gửi nền.
- Sổ địa chỉ: mọi ghi chạy trong giao dịch có `SELECT ... FOR UPDATE` trên dòng `users` của người gọi, nên thêm / đặt mặc định đồng thời không vượt 10 và không tạo hai mặc định; DB chặn thêm bằng index duy nhất `uq_addresses_one_default` (partial `WHERE is_default`).
- Hạng: tổng `orders.total` của `status = completed`, `user_id` = người gọi, `COALESCE(delivered_at, created_at)` trong năm VN hiện tại. Ngưỡng ở `ACCOUNT_ASSUMPTIONS.tiers`.
- Ưu đãi: `vouchers` đang bật, trong thời gian, còn lượt chung, `customerRuleViolation` (lượt riêng, đơn đầu) với `{ userId, email, phone hồ sơ }`.
- Mã lỗi mới: `invalid-password` (422). Không thêm thư viện.

## Migration `20261109000100_account_addresses` (chỉ cộng thêm)
Thêm `province_code`, `ward_code` (FK danh mục, RESTRICT), `updated_at`; `district`, `city` → nullable; FK `user_id → users` (CASCADE, `NOT VALID` để không quét dữ liệu cũ); CHECK `province_code`/`ward_code` cùng có hoặc cùng không (`NOT VALID`); index duy nhất một mặc định mỗi người; index `(user_id, created_at)`; bật RLS (đã bật sẵn trên Supabase). Không phụ thuộc hai migration Slice 4.

## Frontend
- Cờ `ApiConfig.accountMode`: `http` (bản thường), `mock` (e2e). `ACCOUNT_API` nay nằm trong `STOREFRONT_TOKENS`: `storefront-adapters.ts` → `HttpAccountApi`, bản `.e2e.ts` → `MockAccountApi`. Bỏ `LazyMockAccountApi` và provider ở `app.config.ts`.
- `HttpAccountApi` đổi lỗi contract → `AccountError(code, detail, field, retryAfterSeconds)`; `accountErrorMessage` dùng câu của máy chủ cho `validation`, `underage`, `password-locked`, `rate-limited`. 401 vẫn do interceptor chung chuyển về đăng nhập.
- Profile: bỏ nhánh `accountLive`; luôn hiện Email, Họ và tên (Họ + Tên), Mật khẩu (tạo / đổi), Sinh nhật, SĐT.
- Địa chỉ: ẩn công tắc "địa chỉ trả hàng" khi `accountMode = http`.
- Ưu đãi: `expiresAt` có thể null → "Không thời hạn".
- Checkout: `prefillMember` luôn dùng `ACCOUNT_API` (hồ sơ + sổ địa chỉ + ưu đãi); lỗi thì quay về tên/email của phiên.

## Kiểm
- BE: `test/account.test.ts` (T-ACC-01..26). Toàn bộ `npm test` trên Linux.
- FE: lint, format, build; Playwright mock `account`, `checkout`, `cart-checkout`; chạy thật FE (`ng serve`, proxy) + BE (Postgres cục bộ) bằng kịch bản Playwright (xem `docs/handoff.md`).
