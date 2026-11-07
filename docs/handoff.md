# Handoff

## Slice hiện tại: 1 — Auth thật

### Đã xong
- 2026-11-05 Orchestrator: tạo đội agent và khung `docs/`.
- 2026-11-05 product-owner: `docs/product/PRD.md` Slice 1 (38 BR-AUTH, 98 AC-AUTH; mục 3 chốt 22 điểm lệch FE/BE) và `docs/product/backlog.md`.

- 2026-11-07 Orchestrator: kiểm tra Supabase (project Nine2Fine, ap-northeast-1). Có 6 bảng khớp schema Prisma; `users` có 2 tài khoản member (1 không mật khẩu, 1 có mật khẩu), chưa có staff/admin; `auth_action_tokens` 2 dòng; các bảng khác rỗng. Chưa có bảng `_prisma_migrations` (schema được tạo bằng `db push`), nên migration đầu tiên phải **baseline** (`prisma migrate diff` + `migrate resolve --applied`) rồi mới thêm thay đổi, không được `migrate reset`. Tất cả bảng bật RLS nhưng BE kết nối bằng chuỗi Postgres trực tiếp nên không bị ảnh hưởng.

- 2026-11-07 ui-ux-designer: `docs/design/` (design-system + 4 spec: auth-login, auth-register, auth-forgot-password, admin-login). Câu hỏi đã chốt trong decisions.md.
- 2026-11-07 Orchestrator: contract `docs/api/openapi.yaml` chuyển **locked**.

- 2026-11-07 backend-dev: triển khai 11 endpoint, 4 migration (baseline + 3 cộng thêm), seed. Typecheck/build qua. Test 88 test, nhưng vitest crash native Windows ngắt quãng (xem mục Vấn đề đã biết).
- 2026-11-07 frontend-dev: adapter HTTP, interceptor, proxy, thay đổi UI theo spec, mock bám contract. Lint/build/format qua; Playwright mock 154 pass, 6 skip (số do agent báo).

### Đang làm
- Supabase: Thắng đã chạy baseline, migrate deploy, seed (06:54Z); `_prisma_migrations` 4 dòng, users = 5. Đang chạy các luồng trên Supabase với Gmail thật, sau đó QA.

### Vấn đề đã biết
- 2026-11-07 Thắng thử thủ công trên Supabase + Gmail thật: đăng ký, đăng nhập, quên mật khẩu chạy được; thư vào hộp thư chính (bằng chứng cho AC-AUTH-95). Lỗi: bấm avatar bị đăng xuất, đang sửa.
- `npm test` backend: worker vitest thỉnh thoảng chết với mã `0xC0000409` trên Windows/Node 24 (5/11 lần), xảy ra cả với pool threads và forks. Prisma và các thư viện chạy riêng ngoài vitest không tái hiện (15 lần mỗi loại). Chưa rõ nguyên nhân. Khi crash, lệnh báo lỗi, không báo đạt giả.
- Test dùng Postgres 18 cục bộ, Supabase là 17.

### Đề xuất từ frontend-dev, chờ quyết định
- Staff/admin đăng nhập ở `/auth/login` được chuyển `/admin`, nhưng cookie admin tách riêng nên guard đẩy tiếp sang `/admin/login`. Cần chốt hành vi.
- Guard admin: member đang đăng nhập mở `/admin` → `/new-in` (AC-AUTH-87), thêm ngoài yêu cầu ghi rõ.
- Mật khẩu mock admin (`admin-seed.ts`, tests) vẫn nằm trong repo, chỉ dùng cho mock.

### Đề xuất từ backend-dev, chờ quyết định
- Giới hạn sai mã 30 lần/15 phút/IP do agent tự chọn (contract chỉ nói `rate-limited`).
- Route không tồn tại trả 404 với `error.code = validation` (contract không có mã not-found).
- Dọn token/phiên cũ đưa vào backlog "Dọn schema auth".
- Slice Admin phải gọi `revokeAllUserSessions` khi vô hiệu hoá hoặc đổi vai trò (AC-AUTH-75 mới kiểm một phần).

### Câu hỏi mở
- 8 câu hỏi cho Thắng ở `docs/product/PRD.md` › Slice 1 › mục 7 (tuổi tối thiểu, email người gửi, trang đăng nhập admin, phiên bản điều khoản, thời hạn phiên, kênh liên hệ khi tài khoản bị khoá, dữ liệu/seed Supabase, đổi mật khẩu ở Profile). BR liên quan đánh dấu "chờ xác nhận".
- Slice 3: có giữ voucher free-ship không (xem `backlog.md`).

### Câu hỏi mở cho Backend (từ backend-dev, 2026-11-07)
> Orchestrator 2026-11-07: #1, #2, #4, #6 đã chốt trong `decisions.md`. #3: Thắng chọn GIỮ LẠI, chỉ migration cộng thêm (xem decisions.md). #5 (Gmail App Password) Thắng cung cấp ở bước triển khai.
1. Triển khai FE và API cùng site (proxy `/api`, khuyến nghị) hay khác site (vd. Vercel + Render)? Khác site cần `SameSite=None; Secure` và domain HTTPS cho cả hai; contract hiện giả định cùng site.
2. Với 2 user member đang có trên Supabase (xem mục Đã xong): (a) có phải user thật không; (b) `first_name`/`last_name` cũ có bị đảo nghĩa không, có đảo lại không (UPDATE phá huỷ); (c) băm mật khẩu cũ (bcrypt trần) không khớp cách băm mới -> chấp nhận bắt đặt lại mật khẩu, hay giữ tương thích bcrypt trần?
3. Xác nhận cho phép migration phá huỷ dữ liệu tạm: xoá bảng `login_attempts`, xoá cột `attempts`/`locked_until` và các OTP cũ ở `auth_action_tokens`, xoá cột `sessions.device_id`, xoá enum `Role` không dùng (chi tiết `auth-implementation-plan.md` mục 1).
4. Cần ghi vào `decisions.md` thư viện mới: zod, nodemailer, cookie-parser, helmet, vitest, supertest; gỡ jsonwebtoken. Và quyết định cơ chế phiên (token mờ + cookie HttpOnly, 2 cookie storefront/admin).
5. Tài khoản Gmail nhóm dùng gửi thư có App Password chưa (cần 2FA)? Hạn mức Gmail ~500 thư/ngày đủ cho đồ án nhưng không cho vận hành thật.
6. Admin `me` giữ 401 khi chưa đăng nhập (khớp FE admin hiện có), trong khi storefront `me` trả 200 `{user:null}` (BR-AUTH-25). Chấp nhận không đồng nhất này?

### Việc cho product-owner
- Cập nhật BR-AUTH-31 (và BR-AUTH-30 nếu cần) cho khớp quyết định 2026-11-07: staff/admin đăng nhập ở storefront về `/new-in`, không tự vào `/admin`.
- Thêm vào backlog mục "Dọn schema auth cũ" (xoá `login_attempts`, cột `attempts`/`locked_until`, `sessions.device_id`, enum `Role`) cho slice sau — Thắng chọn giữ lại ở Slice 1.

### Đề xuất đổi contract
(chưa có)
