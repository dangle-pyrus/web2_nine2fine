# Kế hoạch triển khai Auth (Slice 1) - draft

Hợp đồng: `docs/api/openapi.yaml` (draft). Chưa viết code. 11 endpoint, phiên mờ phía máy chủ + cookie HttpOnly.

## 1. Thay đổi schema Prisma

Mọi thay đổi qua `prisma migrate dev`, chia migration nhỏ. **Hiện trạng (handoff 2026-11-07): Supabase có 2 user member, chưa có staff/admin, không có `_prisma_migrations` -> migration #0 là baseline (`prisma migrate diff` + `migrate resolve --applied`), tuyệt đối không `migrate reset`.** Ký hiệu: OK = cộng thêm, an toàn; ĐỔI = đổi tên ở tầng Prisma, giữ cột DB; PHÁ HUỶ = mất dữ liệu, cần xác nhận.

| # | Thay đổi | Mức |
| --- | --- | --- |
| 1 | `User.marketingOptInAt DateTime?` (BR-AUTH-13). Backfill: `= terms_accepted_at` cho dòng có `marketing_opt_in = true`. | OK |
| 2 | Chuẩn hoá email cũ về lowercase + thêm `CHECK (email = lower(email))`. Có thể lỗi nếu trùng khi lowercase: kiểm trước. | OK nếu không trùng; trùng -> hỏi |
| 3 | Dữ liệu `first_name`/`last_name` cũ có thể bị đảo nghĩa (BE cũ gán first = Họ). Cần quyết định đảo hay giữ nếu có user thật. | **PHÁ HUỶ nếu UPDATE đảo** - chờ xác nhận |
| 4 | `Session.refreshTokenHash` -> field `tokenHash` (`@map("refresh_token_hash")` giữ tên cột). Hash mới = SHA-256 token mờ. | ĐỔI (không mất dữ liệu) |
| 5 | `Session`: thêm `audience` (enum mới `session_audience`: storefront, admin) và `absoluteExpiresAt`; `expiresAt` = hạn không-hoạt-động. Backfill `absoluteExpiresAt = expiresAt`, `audience = storefront`. | OK |
| 6 | `Session.deviceId` bỏ `NOT NULL` (FE không gửi); xoá cột + 3 index device ở migration dọn dẹp sau. | Bước 1 OK; **bước xoá cột PHÁ HUỶ** (chỉ dữ liệu tạm) |
| 7 | Enum `auth_method`: thêm `register` (`ALTER TYPE ... ADD VALUE`). | OK |
| 8 | Bảng mới `auth_rate_limits(key varchar(200) PK, count int, window_start, locked_until)` cho mọi bộ đếm: `lookup:ip:*`, `lookup:email:*`, `codesend:cooldown/email+purpose`, `codesend:email+purpose`, `codesend:ip`, `codeverify:email+purpose` (sai 5 lần/khoá 15 phút), `pwfail:email`, `pwfail:ip`. Ghi bằng upsert nguyên tử. Dùng DB thay RAM vì nhiều instance và khởi động lại. | OK |
| 9 | Xoá bảng `login_attempts` (khoá theo email+device_id, thay bằng #8). | **PHÁ HUỶ** (dữ liệu tạm; Orchestrator xác nhận) |
| 10 | `AuthActionToken`: xoá `attempts`, `lockedUntil` (đếm sai chuyển sang #8); thêm index `(email, purpose, created_at)`. Xoá các dòng cũ đã hash bằng bcrypt (không còn khớp HMAC). | **PHÁ HUỶ** (mã OTP tạm, vô hại; Orchestrator xác nhận) |
| 11 | Xoá enum `Role` (MEMBER/STAFF/ADMIN) không dùng, giữ `user_role`. Cần `grep` xác nhận không cột nào dùng. | PHÁ HUỶ nhẹ (chỉ type) - làm sau cùng, tuỳ chọn |
| 12 | Seed `prisma/seed.ts`: tạo 1 admin + 1 staff từ biến môi trường, mật khẩu theo BR-AUTH-20, idempotent (upsert theo email), không in mật khẩu. | OK |
| 13 | Job dọn dẹp định kỳ (ngày): xoá token OTP quá hạn >7 ngày, session hết hạn >30 ngày, bucket cũ. | OK |

Mật khẩu: lưu `bcrypt(base64(sha256(password)))` cost 12 (tránh giới hạn 72 byte của bcrypt với mật khẩu Unicode 64 ký tự). Băm bcrypt cũ trong DB sẽ không khớp -> user đã có mật khẩu phải đặt lại (xem câu hỏi mở). OTP lưu `HMAC-SHA256(OTP_HMAC_SECRET, email|purpose|code)` hex.

## 2. Thư viện đề xuất (chưa có trong decisions.md - cần Orchestrator ghi)

- `zod`: validate + chuẩn hoá body, sinh thông điệp lỗi theo trường, một nguồn schema.
- `nodemailer`: gửi Gmail SMTP (chốt 2026-11-07); transport "dev-outbox" ghi file `.eml` cho dev/test.
- `cookie-parser`: đọc cookie phiên (không dùng cookie ký, vì token đã mờ + băm phía server).
- `helmet`: header bảo mật cơ bản (nosniff, frame, HSTS ở production).
- `vitest` + `supertest` (+ `@types/supertest`): test logic và endpoint; `vi.useFakeTimers` cho hạn mã / phiên.
- Gỡ: `jsonwebtoken`, `@types/jsonwebtoken` (không còn JWT).
- Giữ: `bcryptjs`, `cors`, `dotenv`, `express@5`, `prisma`. Dùng `node:crypto` (`randomInt`, `randomBytes`, `createHmac`, `timingSafeEqual`) thay `Math.random`.
- Test DB: dùng Postgres thật (nhánh Supabase hoặc Docker local) với schema riêng; không mock Prisma cho test endpoint.

## 3. Biến môi trường mới cho `.env.example` (chỉ tên)

`NODE_ENV`, `TRUST_PROXY`, `CORS_ALLOWED_ORIGINS`, `COOKIE_SAMESITE` (mặc định lax), `OTP_HMAC_SECRET` (bắt buộc >= 32 ký tự, thiếu -> không khởi động, AC-AUTH-91), `MAIL_MODE` (`smtp` | `dev-outbox`), `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS`, `SUPPORT_EMAIL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_STAFF_EMAIL`, `SEED_STAFF_PASSWORD`. Bỏ `JWT_SECRET`, `JWT_EXPIRES_IN`. Giữ `PORT`, `DATABASE_URL`, `DIRECT_URL`. `server.ts` kiểm tập biến bắt buộc lúc khởi động (zod) và thoát với tên biến thiếu, không in giá trị.

Lưu ý Gmail: bắt buộc App Password (2FA), mỗi tài khoản có hạn mức gửi/ngày (~500); `From` phải là chính địa chỉ Gmail, chỉ tên hiển thị đặt được "nine2fine".

## 4. Test sẽ viết (vitest + supertest, Postgres thật, đồng hồ giả)

| Nhóm | Test | AC |
| --- | --- | --- |
| Chuẩn hoá / validate | email hoa-thường + khoảng trắng; email sai/255 ký tự; tên 51 ký tự, `Minh2`, `<b>`; gộp khoảng trắng | 01, 02, 28, 29 |
| Lookup | N/X/A chỉ trả `registered`; 21 lần/IP; 11 lần/email nhiều IP | 03-06 |
| Chống dò email | so sánh status + body + thời gian (20 lần, trung vị) cho codes/login/reset giữa A và N | 07, 21, 47 |
| OTP | 8 số, có số 0 đầu, lưu HMAC không rõ; sai mục đích; dùng 1 lần; hết hạn 9:50 / 10:01 và không tăng đếm; mã mới vô hiệu mã cũ cùng mục đích, không đụng mục đích khác | 08-12, 17, 18 |
| Gửi lại | cooldown 60s trả `resendAfterSeconds`, mã cũ còn hiệu lực; 5 lần/30 phút; 30 lần/giờ/IP | 13-16 |
| Sai mã | 4 lần cùng thông báo; lần 5 khoá 15 phút, mật khẩu vẫn dùng được, hết khoá dùng lại; email không tồn tại cùng hành vi | 19-22 |
| Thư | outbox: register-đã-có -> thư "đã có tài khoản"; login-N -> không thư; login-X -> thư khoá + email hỗ trợ | 24-26 |
| Đăng ký | trường bắt buộc, tuổi 13 (07/11/2013 ok, 08/11/2013 lỗi, 31/02, 1899, tương lai), thiếu `acceptedTerms`, `role` bị bỏ qua, thời điểm đồng ý/marketing, 2 yêu cầu đồng thời -> 1 user, kiểm mã trước email trùng, trường lỗi không tiêu mã | 29, 31-34, 36-39, 83 |
| Đăng nhập mã/mật khẩu | cùng thông báo cho A sai hoa thường, N, P, khoảng trắng đầu; X sai/đúng mật khẩu; khoá 5 lần, mở khoá bằng mã, hết 15 phút, đếm cho N, 20 lần/IP | 40, 42-50 |
| Mật khẩu | 7 ký tự, thiếu hoa, thiếu số, 65 ký tự, trùng email, 64 ký tự ok, kiểm trước khi tiêu mã; không trả hash | 51, 51b, 53-55 |
| Reset | thu hồi mọi phiên, không auto login, P tạo mật khẩu, mở khoá, mã dùng 1 lần | 56-59 |
| Phiên | 1 phiên cho mỗi cách đăng nhập, thất bại không tạo; hạn 30/90 ngày, 8h/24h (đồng hồ giả); `/me` khách -> `{user:null}`; cookie HttpOnly/SameSite/Secure; không token trong body; tối đa 10 phiên; vô hiệu/đổi vai trò -> 401 | 61-66, 74, 75, 90 |
| Đăng xuất | chỉ phiên hiện tại; phiên hết hạn -> 204; cookie giả không thu hồi gì; thiếu Origin -> 403 | 70, 71, 73 |
| Phân quyền | 401 vs 403; staff không vào API settings.staff, admin vào được; cookie storefront không dùng được ở `/admin` | 84, 85, 88 |
| Bảo mật / CORS | `Origin` lạ bị chặn, preflight không cho nguồn lạ, thiếu `X-Requested-With`; thiếu `OTP_HMAC_SECRET` -> process thoát; log không chứa mã/mật khẩu/token, email đã che; lỗi 500 không lộ stack/SQL | 89, 91-94 |

Không phải test BE (FE/QA/e2e/thủ công): AC-AUTH-23, 27, 30, 35, 41, 52, 60, 67-69, 72, 76-82, 86, 87, 96, 97 (FE/Playwright); AC-AUTH-95 (thủ công trên môi trường triển khai); AC-AUTH-40 (e2e + hộp thư dev); AC-AUTH-89 phần console/analytics (QA).

## 5. Lỗi bảo mật hiện có sẽ sửa

1. OTP sinh bằng `Math.random` -> `crypto.randomInt`, 8 số, lưu HMAC (BR-AUTH-04).
2. Mã OTP in ra `console.log` trong `sendEmail` -> thay bằng nodemailer; dev dùng outbox file; không log nội dung thư (BR-AUTH-35).
3. `JWT_SECRET` mặc định trong code, token 7 ngày trong body -> bỏ JWT, phiên mờ + cookie HttpOnly; không có secret mặc định, thiếu cấu hình thì không khởi động.
4. `logout` dùng `jwt.decode` (không kiểm chữ ký), thu hồi **mọi** phiên, ai cũng gọi được với `anonymous` -> chỉ thu hồi phiên khớp cookie.
5. Khoá đăng nhập theo `(email, device_id)` với `'default-device'` dùng chung -> theo email + IP (BR-AUTH-18); không đếm riêng theo thiết bị.
6. Chỉ đăng nhập mật khẩu tạo bản ghi `sessions`; đăng nhập mã / đăng ký không -> mọi cách đều tạo (BR-AUTH-23).
7. `check-email` trả `has_password`; `send-otp` trả 409 cho email đã đăng ký; thông báo sai mã khác nhau tuỳ email có mã -> dò email; thay bằng phản hồi đồng nhất (BR-AUTH-02, 03, 08, 09).
8. `register` kiểm email trùng trước mã -> kiểm mã trước (BR-AUTH-14); không có transaction -> dựa UNIQUE + bắt lỗi P2002.
9. OTP hạn 5 phút, bcrypt cho mã 8 số tốn CPU và lưu trong cùng bảng với bộ đếm -> 10 phút, HMAC, bộ đếm riêng.
10. Reset mật khẩu chỉ kiểm độ dài, không thu hồi phiên -> BR-AUTH-20, thu hồi mọi phiên (BR-AUTH-22).
11. Controller trả `error.message` thô và `console.error(error)` toàn bộ -> middleware lỗi tập trung: log có che email, không lộ nội dung nội bộ (BR-AUTH-36).
12. `cors()` mở mọi nguồn, không `credentials` -> allowlist + credentials + kiểm Origin + `X-Requested-With`.
13. Thiếu `helmet`, giới hạn kích thước body (đặt 16 KB), `trust proxy` (cần để lấy IP thật cho giới hạn tần suất), `Cache-Control: no-store` cho `/me`.
14. Không có validate ngày sinh / tuổi 13 / định dạng tên, vai trò không bị ép `member` ở tầng validate -> zod với danh sách trường cho phép.
15. `server.ts`: `dotenv.config()` chạy sau `import app` (biến môi trường có thể chưa nạp khi module khởi tạo); `app.listen` try/catch vô tác dụng -> nạp env trước, kiểm env, xử lý lỗi `listen`.
16. `package.json` chưa có script `build`, `typecheck`, `test`; thêm cùng `tsconfig` strict nếu thiếu.

## 6. Thứ tự làm

(1) Orchestrator duyệt contract + ghi thư viện vào decisions.md; (2) baseline migration #0; (3) migration #1,#4-#8,#10 (+ #9 sau xác nhận); (4) config/env + mail + rate-limit bucket + session service; (5) endpoint theo thứ tự lookup -> codes -> login/code -> register -> login/password -> reset -> me/logout -> admin; (6) test bám bảng mục 4; (7) seed + dọn dẹp; (8) `locked` contract khi FE adapter chạy với BE thật.
