# Backlog nine2fine

Chủ sở hữu: product-owner. Thứ tự slice đã chốt (decisions 2026-11-05): Auth → Catalog → Cart & Checkout. Ưu tiên P0/P1/P2 theo master plan mục 52.

## Definition of Done chung (mọi slice)

Một slice chỉ "Xong" khi đủ cả:
1. Mọi AC Must của slice trong `docs/product/PRD.md` được qa-reviewer ghi **Đạt** trong `docs/qa/report-<slice>.md`; PO đối chiếu và ghi kết quả nghiệm thu vào bảng slice bên dưới.
2. Hợp đồng API của slice có trong `docs/api/openapi.yaml` (backend-dev), gồm mã lỗi; FE chạy chế độ HTTP với BE thật trên Supabase, mock vẫn cùng interface.
3. Màn hình mới/đổi có spec trong `docs/design/` (ui-ux-designer); màn hình cũ giữ visual (master plan 19, 20).
4. Đạt Definition of Done UI/Page của master plan mục 49–50 (responsive, focus, loading/error/empty, không lỗi console).
5. Test E2E/contract của slice pass; không có migration phá huỷ dữ liệu chưa được Thắng xác nhận.
6. Quyết định ghi `docs/decisions.md`; bàn giao và câu hỏi còn mở ghi `docs/handoff.md`.

---

## Việc phải chạy trước go-live (chuyển từ Slice 1, chốt 2026-11-07)

Slice 1 đóng có điều kiện theo yêu cầu Thắng (decisions 2026-11-07). Các việc dưới đây hoãn, **không được bỏ**; chưa xong thì chưa go-live.

| # | Việc | Người làm | Ghi chú |
| --- | --- | --- | --- |
| G1 | **QA vòng 2 Slice 1** (`docs/qa/report-slice-1-auth.md`): kiểm lại AC-07, 20, 29, 70 sau khi M1, M3, N1, N2 sửa; chạy `npm test` backend 3 lần liên tiếp pass hoặc pass trên Linux/CI | qa-reviewer | Điều kiện nghiệm thu chính thức của Slice 1. |
| G2 | **AC-AUTH-95a**: Thắng yêu cầu mã 10 lần cho một hộp thư Gmail thật; đạt khi ≥ 9/10 vào hộp thư chính trong 60 giây, người gửi "nine2fine" | Thắng | Trước đây là điều kiện đóng Slice 1; nay là điều kiện go-live. |
| G3 | AC-AUTH-95b (Outlook, 10 lần, Should) và AC-AUTH-89 (kiểm log/console/URL/analytics một lần trên môi trường triển khai) | Thắng, qa-reviewer | Theo PRD Slice 1 mục 6. |
| G4 | AC hoãn theo slice: AC-AUTH-69 → Slice 2 (AC-CAT-44); AC-AUTH-68, 88 → Account; AC-AUTH-75, 84, 85 → Admin | qa-reviewer | Slice được giao không được đóng nếu chưa kiểm. |
| G5 | Dọn mock (xem mục "Dọn mock") và nội dung catalog thật (xem Slice 2) | dev, Thắng | Bản production sạch. |

---

## Slice 1 — Auth thật (P0) · Đóng có điều kiện (2026-11-07)

PRD: `docs/product/PRD.md` › Slice 1 (BR-AUTH-01..38, AC-AUTH-01..97).

| # | Hạng mục | Mức | BR | Người làm chính | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Thống nhất hợp đồng auth (tên thao tác, trường, mã lỗi) trong `openapi.yaml`; FE sửa adapter + mapper | Must | 36, D1–D8 | BE → FE | Chưa |
| 1.2 | Tra cứu email + giới hạn tần suất | Must | 01–03 | BE, FE | Chưa |
| 1.3 | Gửi / gửi lại mã theo 3 mục đích, hạn, cooldown, khoá sai, vô hiệu mã cũ | Must | 04–09 | BE, FE | Chưa |
| 1.4 | Gửi thư thật (mã, thư "đã có tài khoản", thư "tài khoản bị khoá") | Must | 37 | BE | Chưa (Gmail SMTP của nhóm, chốt 2026-11-07) |
| 1.5 | Đăng ký passwordless (họ tên, ngày sinh, điều khoản, marketing) | Must | 10–15 | BE, FE | Chưa |
| 1.6 | Đăng nhập bằng mã và mật khẩu, khoá tạm, tài khoản vô hiệu | Must | 16–19 | BE, FE | Chưa |
| 1.7 | Quy tắc mật khẩu dùng chung FE/BE | Must | 20–21 | BE, FE | Chưa |
| 1.8 | Quên / đặt lại mật khẩu, thu hồi mọi phiên | Must | 22 | BE, FE | Chưa |
| 1.9 | Phiên: tạo, thời hạn, phiên hiện tại khi khởi động, hết hạn giữa chừng, đăng xuất, giới hạn 10 thiết bị | Must | 23–30 | BE, FE | Chưa |
| 1.10 | returnUrl an toàn + trang mặc định theo vai trò | Must | 31 | FE | Chưa |
| 1.11 | Giữ giỏ khách và mục yêu thích chờ qua đăng nhập/đăng ký | Must | 32 | FE | Chưa |
| 1.12 | Vai trò member/staff/admin trong phiên, chặn truy cập theo bảng 4.10a, seed staff/admin | Must | 33–34 | BE, FE | Chưa (trang `/admin/login` chốt 2026-11-07; dữ liệu `users`/seed staff-admin: Orchestrator xử lý, Câu hỏi mở 7; mật khẩu seed hợp lệ BR-AUTH-20, không ghi vào tài liệu) |
| 1.13 | Bảo vệ dữ liệu: không log mã/mật khẩu, che email, bí mật cấu hình bắt buộc, giới hạn nguồn gọi API | Must | 35 | BE | Chưa |
| 1.14 | Chống gửi trùng, giữ dữ liệu khi lỗi/mất mạng | Must | 38 | FE | Chưa |
| 1.15 | Thư "mật khẩu vừa thay đổi" | Should | 22 | BE | Chưa |
| 1.16 | Tạo / đổi mật khẩu ở Profile nối API thật | Won't (Slice 1) | 20 | BE, FE | Dời sang slice Account (chốt 2026-11-07) |
| 1.17 | Lưu phiên bản điều khoản đã đồng ý | Won't | 12 | BE | Bỏ; chỉ lưu thời điểm đồng ý (chốt 2026-11-07) |
| 1.18 | Chuẩn hoá mã khi dán (bỏ khoảng trắng / gạch nối) | Should | 04 | FE | Chưa |
| 1.19 | Tuổi tối thiểu 13 khi có ngày sinh; bộ chọn năm ≤ năm hiện tại − 10 | Must | 11 | BE, FE | Chưa (chốt 2026-11-07) |

Won't trong Slice 1: gộp giỏ phía máy chủ (→ Slice 3), đồng bộ wishlist (→ P1 Wishlist), ghi nhớ đăng nhập, đăng xuất mọi thiết bị, đăng nhập mạng xã hội, 2FA, CAPTCHA, đổi email, xoá tài khoản, quản lý staff bằng UI, tạo/đổi mật khẩu ở Profile (→ slice Account), lưu phiên bản điều khoản.

Trạng thái đóng (decisions 2026-11-07, Thắng yêu cầu): chỉ sửa nốt M1, M3, N1, N2 (mục 1.20) rồi chuyển sang Slice 2. QA vòng 2 và AC-95a hoãn, nằm ở mục "Việc phải chạy trước go-live" (G1, G2). Kết quả nghiệm thu chính thức của Slice 1 ghi vào đây sau G1.

Nghiệm thu: QA vòng 1 (`docs/qa/report-slice-1-auth.md`, 2026-11-07): chưa đạt (89 Pass, 4 Fail: AC-07, 20, 29, 70; 8 chưa kiểm được). PO đề xuất đạt có điều kiện khi: M1, M3, N1, N2 sửa và QA kiểm lại; AC-29 đã sửa chữ AC (N3); AC-95a do Thắng chạy; AC hoãn theo PRD mục 6. M2 (test crash `0xC0000409`) không chặn nghiệm thu vì chỉ tái hiện trong vitest/Windows, không phải runtime; điều kiện: chạy `npm test` 3 lần liên tiếp pass hoặc pass trên Linux/CI, và M2 giữ mở trong backlog.

### Việc phát sinh sau QA vòng 1 (Slice 1)

| # | Hạng mục | Mức | Ghi chú |
| --- | --- | --- | --- |
| 1.20 | Sửa M1 (thời gian phản hồi `/auth/codes`), N1 (900 giây/"15 phút"), N2 (đăng xuất về `/`), M3 (ẩn "Tạo mật khẩu" ở Profile khi `authMode: http`) | Must | Điều kiện đóng Slice 1; việc duy nhất còn lại trước khi sang Slice 2 |
| 1.21 | M2: ổn định test backend (thử Linux CI, Node 22 LTS, Prisma `engineType = "client"`) | Should | Không chặn nghiệm thu; chặn tin vào CI |
| 1.22 | N4 (email chứa NUL → 422), N6, N7, N8, N10, N11, N13, N14, N15, N18, N20 | Should | Minor, làm cùng đợt sửa nếu rẻ |
| 1.23 | N17 đăng nhập chậm: đặt API cùng vùng DB, giảm số lượt truy vấn | Should | PRD chưa có chỉ tiêu; xem xét khi triển khai |

### Dọn schema auth (slice sau Slice 1)

Không làm trong Slice 1 (decisions 2026-11-07: chỉ migration cộng thêm). Cần Thắng xác nhận trước khi chạy vì phá huỷ dữ liệu.

- Xoá bảng `login_attempts`, cột `attempts` và `locked_until`, cột `sessions.device_id`, enum `Role` không còn dùng.
- Dọn OTP cũ ở `auth_action_tokens`, token và phiên đã hết hạn/đã dùng (job định kỳ hoặc script một lần).
- Dọn `auth_rate_limits` quá hạn.

### Dọn mock (trước go-live)

- Bản production không chứa mật khẩu/mã demo mock (`app.config.ts`, `admin-providers.ts`, `mocks/accounts.ts`, `admin-seed.ts`); tách mock khỏi bundle production hoặc loại ở build. Hạn: khi Catalog, Account, Admin đều có API thật, và trước go-live. Tới lúc đó `mode: mock` được dùng cho catalog/account.
- Thêm `fullstack.bundle` vào `.gitignore` (Orchestrator/dev).

---

## Slice 2 — Catalog chỉ đọc (P0) · Đang làm (PO đã viết BR/AC 2026-11-07)

PRD: `docs/product/PRD.md` › Slice 2 (BR-CAT-01..23, AC-CAT-01..53). Mục tiêu: PLP, PDP, Search, panel gợi ý, dải sản phẩm ở Home/giỏ đọc dữ liệu thật từ BE thay fixture `products.ts`. Phạm vi chốt: không admin CRUD, giỏ/checkout, đánh giá thật, "báo khi có hàng", wishlist server.

Chia lát giao được (mỗi lát nghiệm thu riêng):

| # | Hạng mục | Mức | BR | Người làm chính | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Schema catalog (migration cộng thêm) + seed idempotent từ mock (8 sản phẩm, 64 biến thể, 4 bảng size) | Must | 01–05, 23 | BE | Chưa |
| 2.2 | Hợp đồng `openapi.yaml` catalog + mã lỗi `not-found`, `validation`, `rate-limited` | Must | 20 | BE | Chưa |
| 2.3 | API danh sách: lọc, sắp xếp, phân trang, `q` | Must | 06–08, 13 | BE | Chưa |
| 2.4 | API chi tiết theo slug, bảng size, đánh giá `[]` | Must | 09–12, 17 | BE | Chưa |
| 2.5 | Công khai chỉ đọc, giới hạn 120 yêu cầu/60 giây/IP | Must | 18, 19 | BE | Chưa |
| 2.6 | FE: cờ catalog độc lập (`catalogMode`), nối `HttpCatalogApi`, `not-found` → trang không tìm thấy, tiêu đề PLP theo `total`, `limit` cho panel (5) và dải (≤ 12), xử lý lỗi bảng size, ẩn đánh giá/báo hàng về ở HTTP | Must | 14, 17, 20, 21 | FE | Chưa |
| 2.7 | Spec thiết kế trạng thái mới (không tìm thấy, lỗi bảng size, khối đánh giá trống; "Xem thêm") | Must | 09, 12, 15 | Designer | Chưa |
| 2.8 | Nút "Xem thêm" khi `total` > số đã tải | Should | 15 | FE | Chưa |
| 2.9 | Lọc theo `ids` cho trang Yêu thích | Should | 16 | BE, FE | Chưa |
| 2.10 | Chỉ tiêu hiệu năng (100 sản phẩm thử) | Should | 22 | BE, QA | Chưa |
| 2.11 | Quản lý sản phẩm/tồn kho/ảnh trong admin | Won't | — | slice Admin | Lý do: Slice 2 chỉ đọc |
| 2.12 | Đọc/gửi đánh giá thật; "Báo khi có hàng"; chuyển hướng slug cũ; giá theo biến thể; xếp hạng độ liên quan | Won't | 17 | — | Sau Slice 3 / slice thông báo |

Chờ xác nhận Thắng: câu hỏi 1 (nội dung catalog demo cho go-live) và 2 (ẩn đánh giá/báo hàng về ở HTTP; BR-CAT-17).

DoD: theo DoD chung; thêm: giá/tồn kho hiển thị lấy từ BE, không còn fixture trong chế độ HTTP; Cart/Checkout/Account vẫn mock; AC-AUTH-69 kiểm bằng AC-CAT-44; migration chỉ cộng thêm.

Nghiệm thu: (chưa có báo cáo QA).

### Việc cần làm trước go-live phát sinh từ Slice 2

| # | Việc | Người làm |
| --- | --- | --- |
| 2.13 | Nội dung catalog thật (giá, chất liệu, ảnh, phân Nam/Nữ) thay dữ liệu demo; nhập bằng file seed đến khi có Admin | Thắng, BE |
| 2.14 | Đơn mock không trừ kho trong DB (chấp nhận đến Slice 3); Slice 3 phải đọc tồn kho từ DB khi đặt hàng | BE (Slice 3) |

---

## Slice 3 — Cart & Checkout (P0)

Đã có bộ **69 BR riêng** cho Cart & Checkout (PO chuyển vào PRD mục Slice 3 khi bắt đầu, đánh mã BR-CART / BR-CHK).

| # | Hạng mục | Mức |
| --- | --- | --- |
| 3.1 | Giỏ hàng phía máy chủ cho thành viên + quy tắc gộp giỏ khách khi đăng nhập (tiếp nối BR-AUTH-32) | Must |
| 3.2 | Báo giá: tạm tính, voucher, phí vận chuyển, ngưỡng freeship — máy chủ quyết định | Must |
| 3.3 | Đặt hàng có khoá chống trùng (Idempotency-Key), giữ tồn kho, COD + chuyển khoản | Must |
| 3.4 | Order Success, tra cứu đơn khách (cùng 404 cho mã sai và liên hệ sai), huỷ đơn | Must |
| 3.5 | Lịch sử đơn, chi tiết đơn, yêu cầu trả hàng trong Account | Must |

Câu hỏi mở của slice: **có giữ voucher free-ship (giảm phí vận chuyển) song song với ngưỡng freeship không?** — cần Thắng trả lời trước khi chốt BR báo giá.

DoD: theo DoD chung; thêm: tổng tiền `subtotal − discount + shippingFee − shippingDiscount = total` do máy chủ tính và khớp ở giỏ, checkout, đơn.

---

## Sau các slice P0 (tóm tắt từ master plan mục 52)

Các P0 còn lại cần nối BE: Account (profile, địa chỉ, voucher, hạng thành viên), Order Tracking timeline, SEO cơ bản, accessibility cơ bản, responsive QA — gom vào slice Account và slice Admin sau Slice 3.

| Mức | Hạng mục | Ghi chú |
| --- | --- | --- |
| P1 | Wishlist (đồng bộ máy chủ, gộp khi đăng nhập) | FE đã có, bắt đăng nhập. |
| P1 | Shop by Moment | FE đã có với fixture. |
| P1 | Reviews (gửi đánh giá khi đã nhận hàng) | Phụ thuộc Slice 3. |
| P1 | Recommendations | |
| P1 | GSAP storytelling | Chỉ FE. |
| P1 | UGC | |
| P1 | Promotion system | Liên quan câu hỏi voucher free-ship. |
| P2 | Personalization, Recently viewed, Advanced recommendation, Loyalty, Omnichannel inventory UI, AI styling assistant | Chưa lên kế hoạch. |
