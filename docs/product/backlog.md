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
| G6 | **Rate limit catalog sau reverse proxy** (QA Slice 2 m6): bật `TRUST_PROXY` đúng số proxy của nơi deploy; xác nhận chạy 1 tiến trình (bộ đếm nằm trong RAM) hoặc chuyển bộ đếm vào DB. Đạt khi trên môi trường triển khai: 2 máy khác IP mỗi máy gửi 100 yêu cầu catalog trong 60 giây đều nhận 200; máy thứ ba gửi 121 yêu cầu thì yêu cầu 121 nhận 429 (BR-CAT-19) | backend-dev, Thắng | Không làm thì mọi khách chung một IP, cả site bị chặn sau 120 yêu cầu/phút. |
| G7 | AC-CAT-52 (Should): đo p95 danh sách ≤ 500 ms, chi tiết ≤ 300 ms với 100 sản phẩm thử, đo ở máy chủ triển khai | backend-dev | Hoãn từ Slice 2; đo trên máy dev không có giá trị. |
| G8 | Slice 2: `npm test` backend pass 3 lần liền hoặc pass trên Linux/CI (cùng việc với G1 và 1.21) | backend-dev | Tiền lệ Slice 1: M2 là crash môi trường vitest/Windows, không chặn nghiệm thu. |

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

## Slice 2 — Catalog chỉ đọc (P0) · Đạt có điều kiện (2026-11-07)

PRD: `docs/product/PRD.md` › Slice 2 (BR-CAT-01..23, AC-CAT-01..53). Mục tiêu: PLP, PDP, Search, panel gợi ý, dải sản phẩm ở Home/giỏ đọc dữ liệu thật từ BE thay fixture `products.ts`. Phạm vi chốt: không admin CRUD, giỏ/checkout, đánh giá thật, "báo khi có hàng", wishlist server.

Chia lát giao được (mỗi lát nghiệm thu riêng):

| # | Hạng mục | Mức | BR | Người làm chính | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Schema catalog (migration cộng thêm) + seed idempotent từ mock (8 sản phẩm, 64 biến thể, 4 bảng size) | Must | 01–05, 23 | BE | Xong (QA Pass AC-01..05, 08..10, 53; đã seed Supabase) |
| 2.2 | Hợp đồng `openapi.yaml` catalog + mã lỗi `not-found`, `validation`, `rate-limited` | Must | 20 | BE | Xong (AC-48 Pass) |
| 2.3 | API danh sách: lọc, sắp xếp, phân trang, `q` | Must | 06–08, 13 | BE | Xong phần API (QA Pass); phần UI chờ K1–K12 |
| 2.4 | API chi tiết theo slug, bảng size, đánh giá `[]` | Must | 09–12, 17 | BE | Xong phần API; phần UI chờ K1–K12 |
| 2.5 | Công khai chỉ đọc, giới hạn 120 yêu cầu/60 giây/IP | Must | 18, 19 | BE | Xong (T-CAT-45..47); deploy cần G6 |
| 2.6 | FE: cờ catalog độc lập (`catalogMode`), nối `HttpCatalogApi`, `not-found` → trang không tìm thấy, tiêu đề PLP theo `total`, `limit` cho panel (5) và dải (≤ 12), xử lý lỗi bảng size, ẩn đánh giá/báo hàng về ở HTTP | Must | 14, 17, 20, 21 | FE | Code xong; còn M1 (2.15) và kiểm tay K1–K12 |
| 2.7 | Spec thiết kế trạng thái mới (không tìm thấy, lỗi bảng size, khối đánh giá trống; "Xem thêm") | Must | 09, 12, 15 | Designer | Thay bằng `docs/slice-2-catalog/frontend-plan.md` (bỏ agent designer, decisions 2026-11-07) |
| 2.8 | Nút "Xem thêm" khi `total` > số đã tải | Should | 15 | FE | API Pass (T-CAT-41); UI 30 sản phẩm hoãn, không chặn |
| 2.9 | Lọc theo `ids` cho trang Yêu thích | Should | 16 | BE, FE | API Pass (T-CAT-42, live); còn m3 (2.17) |
| 2.10 | Chỉ tiêu hiệu năng (100 sản phẩm thử) | Should | 22 | BE, QA | Hoãn trước go-live (G7) |
| 2.11 | Quản lý sản phẩm/tồn kho/ảnh trong admin | Won't | — | slice Admin | Lý do: Slice 2 chỉ đọc |
| 2.12 | Đọc/gửi đánh giá thật; "Báo khi có hàng"; chuyển hướng slug cũ; giá theo biến thể; xếp hạng độ liên quan | Won't | 17 | — | Sau Slice 3 / slice thông báo |

Chờ xác nhận Thắng: câu hỏi 1 (nội dung catalog demo cho go-live) và 2 (ẩn đánh giá/báo hàng về ở HTTP; BR-CAT-17).

DoD: theo DoD chung; thêm: giá/tồn kho hiển thị lấy từ BE, không còn fixture trong chế độ HTTP; Cart/Checkout/Account vẫn mock; AC-AUTH-69 kiểm bằng AC-CAT-44; migration chỉ cộng thêm.

Nghiệm thu (PO, 2026-11-07, theo `docs/qa/report-slice-2-catalog.md`, HEAD `8ab51d8`): **đạt có điều kiện**. QA: 31 Pass, 1 Fail (AC-18, lỗi chữ AC, đã sửa trong PRD; API đúng), 18 chưa kiểm được (phần UI ở chế độ http), 0 Blocker. API live trên Supabase khớp contract; không injection, không lộ dữ liệu người dùng, RLS bật.

Slice 2 chuyển sang "Xong" khi đủ 3 điều kiện:
1. Làm xong 2.15 (M1) và 2.16 (chạy đủ bộ Playwright mock, AC-51).
2. Thắng đi danh sách K1–K12 bên dưới với FE http + BE thật; mọi bước đạt. Bước nào trượt thì ghi lỗi vào bảng "Việc sửa", sửa rồi chỉ kiểm lại bước đó. Không chạy lại QA rộng.
3. Không bắt buộc trước khi đóng: M2 (G8, tiền lệ Slice 1: crash môi trường vitest/Windows; 2 lần chạy 133/133 pass, không có AssertionError), AC-52 (G7), m6 (G6), các việc Should 2.17–2.21.

AC hoãn từ Slice 1: AC-AUTH-69 kiểm ở bước K10 (cùng AC-CAT-44).

### Danh sách kiểm tay K1–K12 (Thắng, khoảng 30 phút)

Chuẩn bị: BE `:4000` nối Supabase; FE `ng serve` ở `localhost:4200` với `catalogMode: http`, `mode: mock`; mở DevTools tab Network. Để giả mất mạng dùng Network → "Block request URL" với mẫu `*/api/*` (không dùng Offline, vì tải lại trang sẽ không có HTML). Ghi Đạt/Trượt từng bước vào cột cuối.

| # | Làm | Đạt khi | AC | Kết quả |
| --- | --- | --- | --- | --- |
| K1 | Mở `/shop/dresses`; rồi `/shop?sort=hot` | `/shop/dresses`: đúng 1 thẻ (after-hours-dress), tiêu đề đúng danh mục. `sort=hot`: hiện danh sách thứ tự nổi bật (the-everyday-blazer đầu), không báo lỗi; request API không chứa `sort=hot` | 12, 21 | |
| K2 | Mở `/shop?size=XL&available=true` (hoặc chọn lọc XL + còn hàng); rồi `/search?q=zzzz`, bấm đường xoá tìm kiếm / về `/shop` | Bước 1: trạng thái rỗng, không phải lỗi. Bước 2: tiêu đề "Tìm kiếm.", số "0", không lỗi, không nút "Thử lại"; bấm đường dẫn về được danh sách | 14, 38 | |
| K3 | Mở `/shop/nu?color=Đỏ&maxPrice=1000000&sort=price-asc`; tải lại; đổi một bộ lọc rồi bấm Back; bấm "Xóa tất cả" | Request có `gender=nu`, `color=Đỏ`, `maxPrice=1000000`, `sort=price-asc`; "Đang lọc (3)"; 2 thẻ: off-duty-top rồi after-hours-dress; tải lại giữ nguyên; Back về đúng trạng thái trước; "Xóa tất cả" về `/shop` | 18 | |
| K4 | Mở `/product/The-Everyday-Blazer`; bấm Back một lần | URL thành `/product/the-everyday-blazer`; Back không quay lại URL chữ hoa | 25 | |
| K5 | Trên PDP the-everyday-blazer: chọn Đen → S; Xám → S; xem XL; cuộn xuống phần đánh giá. Mở `/shop` xem thẻ sản phẩm | Đen S hiện "Chỉ còn 5"; Xám S không hiện dòng này; XL vô hiệu, nhãn "Size XL - hết hàng", không thêm được vào giỏ. Không có đánh giá mẫu, điểm sao (cả trên thẻ PLP), form viết đánh giá, "Báo khi có hàng"; Network không có `/stock-alerts`, `/reviews/eligibility` | 07, 43 | |
| K6 | Mở panel tìm kiếm, gõ "bl", dừng; bấm "Xem tất cả". Mở lại panel, dán chuỗi 101 ký tự | Đúng 1 request `q=bl&limit=5`; ≤ 5 sản phẩm và "Xem tất cả (1)"; bấm → `/search?q=bl`. Ô nhập dừng ở 100 ký tự, không hiện lỗi (kiểm M1 đã sửa) | 39, BR-14 | |
| K7 | Network throttling tuỳ chỉnh độ trễ 2000 ms: gõ "bl" rồi ngay "blazer". Bỏ throttling, bật chặn `*/api/*`, gõ thêm 1 ký tự; bỏ chặn, bấm "Thử lại" | Chỉ kết quả "blazer" hiện, không bị "bl" ghi đè. Khi chặn: trạng thái lỗi + nút thử lại, từ khoá còn nguyên; bỏ chặn bấm thử lại ra kết quả | 40 | |
| K8 | Ở PDP the-everyday-blazer bật chặn `*/api/*`, tải lại; bỏ chặn, bấm thử lại. Bật chặn lần nữa, bấm "Hướng dẫn chọn size"; bỏ chặn, bấm lại | Tải lại: trạng thái lỗi có nút thử lại (không phải "không tìm thấy"); thử lại → PDP đúng. Bảng size: có thông báo lỗi, nút bấm lại được; bỏ chặn bấm lại mở được hộp thoại | 28, 32 | |
| K9 | Mở `/shop/nu?color=Đỏ&sort=price-asc`, bật chặn `*/api/*`, tải lại; bỏ chặn, bấm "Thử lại" | Có trạng thái lỗi và "Thử lại"; sau khi bấm, danh sách đúng bộ lọc trên URL (không reset) | 49 | |
| K10 | Chưa đăng nhập: xem PLP, PDP, tìm kiếm, bảng size, xem Response JSON của `/api/products`. Sau đó đăng nhập tài khoản thật, mở `/shop`, trong Application → Cookies sửa giá trị `n2f_sid` thành `xxx`, tải lại | Khách dùng đủ, không bị chuyển sang `/auth/login`; JSON không có trường người dùng. Sau khi sửa cookie: danh sách tải 200, ở lại `/shop`, header thành khách, không chuyển hướng | 44, 45, AUTH-69 | |
| K11 | Trên Supabase SQL: đặt `price` the-straight-trousers = 700000 và một biến thể size S của sản phẩm này `inventory` = 0. Chờ 30 giây, tải lại PLP và PDP; thêm một size còn hàng vào giỏ, mở giỏ. **Xong thì trả lại giá 690000 và inventory cũ** | PLP và PDP hiện 700.000 ₫; size đó hiện hết hàng; thêm giỏ chạy (mock); Network không có `/api/cart`, `/api/orders`, `/api/account/...` | 30, 50 | |
| K12 | (Làm cuối) Ở Console trang `/shop` chạy `for (let i = 0; i < 125; i++) fetch('/api/products?limit=1')`; tải lại `/shop`; chờ 60 giây, bấm "Thử lại" | Tải lại: trạng thái lỗi có thử lại (không trang trắng); sau 60 giây bấm thử lại ra danh sách. Các bước K1–K11 không gặp 429 (đủ điều kiện "duyệt tay 30 thao tác/phút") | 47 | |

Ghi chú: K11 dùng the-straight-trousers thay weekend-shirt cho AC-30; cùng quy tắc BR-CAT-11, PO chấp nhận để chỉ đổi DB một lần. AC-41 (UI 30 sản phẩm) và AC-42 (UI `/wishlist`) là Should, không nằm trong danh sách.

### Việc sửa sau QA Slice 2 (giao agent code)

| # | Lỗi QA | Việc | Mức | Người làm | Đạt khi |
| --- | --- | --- | --- | --- | --- |
| 2.15 | M1 | Ô tìm kiếm (panel và trang `/search`) giới hạn 100 ký tự: `maxlength` + validator; dán chuỗi dài thì cắt ở 100; không bao giờ gửi `q` > 100 | Must | frontend-dev | Không có request `q` > 100 ký tự; K6 đạt; thêm 1 test Playwright gõ 101 ký tự. **Xong 2026-11-07 (e236e57); K6 chờ kiểm tay** |
| 2.16 | AC-51, m5 | Chạy toàn bộ Playwright mock (`catalogMode: mock`), ghi số pass/fail vào `docs/handoff.md`; test nào fail thì kiểm ở commit trước Slice 2 (`dc488d3^` hoặc cũ hơn) xem có sẵn từ trước không. Đổi tên test "AC-CAT-44", "AC-CAT-41" trong `catalog.spec.ts` cho đúng cái chúng kiểm (mock, không chạm API) | Must | frontend-dev | 0 test fail mới do Slice 2; không có request `/api/products` ở chế độ mock. **Xong 2026-11-07: 178 pass / 1 fail flaky có từ trước / 7 skip, xem handoff** |
| 2.17 | m3 | Trang Yêu thích không cắt lặng lẽ ở 48: chia `ids` thành nhiều request ≤ 48 id rồi gộp | Should | frontend-dev | 60 mục yêu thích hiện đủ 60 thẻ, mỗi request ≤ 48 id |
| 2.18 | m4 | Tham số URL không hợp lệ (`maxPrice` âm/không nguyên/chữ, `page`, `limit` sai) bị bỏ qua trước khi gọi API, như `sort=hot` | Should | frontend-dev | `/shop?maxPrice=1.5` hiện đủ 8 sản phẩm, không lỗi, không request 422 |
| 2.19 | m2 | `search_text` luôn đồng bộ với `name`/`type_label`: seed tính lại mỗi lần chạy; ghi rõ trong kế hoạch BE rằng mọi đường ghi sản phẩm sau này (Admin) phải cập nhật cột này (hoặc dùng trigger DB) | Should; thành Must ở slice Admin | backend-dev | Sửa `name` rồi chạy seed: `q` theo tên mới tìm ra sản phẩm |
| 2.20 | m7 | `getSizeChart`/`toSizeChartDto` trả kiểu DTO cụ thể thay `unknown` | Should | backend-dev | `npm run typecheck` exit 0, không còn `unknown` ở hai hàm |
| 2.21 | m6 | Ghi `TRUST_PROXY` và giới hạn "bộ đếm RAM, 1 tiến trình" vào checklist deploy | Should (Must trước go-live, xem G6) | backend-dev | Có mục trong tài liệu deploy |

M2 (test backend crash) nằm ở 1.21 / G8, không mở việc mới.

### Việc cần làm trước go-live phát sinh từ Slice 2

| # | Việc | Người làm |
| --- | --- | --- |
| 2.13 | Nội dung catalog thật (giá, chất liệu, ảnh, phân Nam/Nữ) thay dữ liệu demo; nhập bằng file seed đến khi có Admin | Thắng, BE |
| 2.14 | Đơn mock không trừ kho trong DB (chấp nhận đến Slice 3); Slice 3 phải đọc tồn kho từ DB khi đặt hàng | BE (Slice 3) |

---

## Slice 3 — Cart & Checkout (P0)

PRD: `docs/product/PRD.md` › Slice 3 (BR-CART-01..14, BR-CHK-01..33, BR-VOU-01..13; AC-CART-01..20, AC-CHK-01..41, AC-VOU-01..16), dựa trên 69 quy tắc nguồn `docs/product/cart-checkout-business-rules.md`. Voucher free-ship: giữ (Thắng 2026-11-07).

Chia lát giao được (mỗi lát nghiệm thu riêng, theo thứ tự):

| # | Hạng mục | Mức | BR | AC | Người làm | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| 3.1 | Nền: migration cộng thêm (đơn, dòng đơn, voucher, lượt dùng, giỏ, tham số, địa giới, ngày nghỉ, khoá idempotency), seed; contract `openapi.yaml`; cờ `checkoutMode` | Must | CHK-06, 32, 33; VOU-02 | CHK-06, 41 | BE → FE | Chưa (phạm vi địa giới chờ câu hỏi 3) |
| 3.2 | Báo giá máy chủ + voucher (1 mã giảm + 1 free-ship, điều kiện, lý do, làm tròn, chia dòng, chống dò, kiểm lại); FE 2 ô mã, tóm tắt | Must | CHK-10, 11; VOU-01..12 | CHK-10, 11; VOU-01..15 | BE, FE | Chưa |
| 3.3 | Giỏ trên trình duyệt: hạn mức 5/20/30, đổi màu/size gộp, chọn dòng, làm tươi giá/tồn/ngừng kinh doanh, thanh free-ship, 30 ngày | Must | CART-01..08, 13 | CART-01..10, 19 | FE (+ BE báo giá) | Chưa |
| 3.4 | Giỏ thành viên trên máy chủ, gộp khi đăng nhập, đăng nhập tại checkout, đăng xuất / hết phiên | Must | CART-09..12 | CART-11..18 | BE, FE | Chưa |
| 3.5 | Đặt hàng COD: form người nhận, kiểm lại giá/tồn, trừ tồn nguyên tử, idempotency, mã đơn, chốt đơn, điều kiện COD, trạng thái, trang thành công, mã lỗi. **Đóng 2.14** | Must | CHK-01, 02, 04, 05, 07..09, 12..15, 17..20, 22, 25, 30, 31 | CHK-01, 02, 04, 05, 07..09, 12..19, 21..26, 28, 30, 36..40 | BE, FE | Chưa |
| 3.6 | Email xác nhận, email đơn đã huỷ (thử lại 3 lần, báo CSKH) | Must | CHK-28, 29 | CHK-34, 35 | BE | Chưa |
| 3.7 | Tra cứu đơn khách (mã + email + OTP), huỷ đơn; đơn của thành viên (danh sách, chi tiết, huỷ). Kiểm AC-AUTH-68 | Must | CHK-23, 26, 27 | CHK-16, 29, 31..33 | BE, FE | Chưa (huỷ ở `to_ship` chờ câu hỏi 4; OTP chờ câu hỏi 1) |
| 3.8 | Chuyển khoản QR tự đối soát, giữ đơn 30 phút, hết hạn tự huỷ, email chờ thanh toán / đã nhận tiền | Must (chờ xác nhận) | CHK-21 | CHK-25, 27 | BE, FE, Thắng (tài khoản dịch vụ) | Chờ câu hỏi 2; chưa có thì ẩn QR ở HTTP |
| 3.9 | Nháp checkout 24 giờ; hỏi lại đơn trùng 10 phút; Hoàn tác xoá dòng 5 giây; "Đặt lại đơn này"; voucher theo danh mục / loại trừ hàng đang giảm | Should | CART-14; CHK-03, 16, 24; VOU-13 | CART-20; CHK-03, 20; VOU-16 | BE, FE | Chưa |
| 3.10 | Sổ địa chỉ ở checkout, ví voucher / mã theo hạng | Won't | — | — | slice Account | Nguồn CHK-07..09, CHK-VC-08 |
| 3.11 | Gọi xác nhận COD, từ chối nhận, duyệt yêu cầu huỷ, vận chuyển, email giao hàng; trả hàng/hoàn tiền | Won't | — | — | slice Admin | Nguồn CHK-PAY-06 (vận hành), 07; CF-13 phần còn lại |
| 3.12 | Thẻ/ví; xuất hoá đơn điện tử thật; cộng ngày xã đảo | Won't | — | — | — | Giai đoạn sau / chưa có dữ liệu |

Điều kiện bắt đầu code (PO, 2026-11-07): 2.15, 2.16 xong và K1–K12 đạt. Lát 3.1 cần câu hỏi 3; 3.7 cần câu hỏi 1 (phần OTP) và 4; 3.8 cần câu hỏi 2 (PRD Slice 3 mục 7). Các lát khác làm được ngay với giả định tạm đã ghi.

Câu hỏi mở (chi tiết ở PRD mục 7 và `docs/handoff.md`): (1) nội dung nhóm COMMON-01..06 chưa có; (2) dịch vụ đối soát chuyển khoản; (3) phạm vi địa giới; (4) huỷ ở `to_ship` trước khi có Admin.

AC hoãn nhận về: AC-AUTH-68 (kiểm bằng AC-CHK-33).

DoD: theo DoD chung; thêm: tổng tiền `subtotal − discount + shippingFee − shippingDiscount = total` do máy chủ tính và khớp ở checkout, trang thành công, email, chi tiết đơn; 2.14 đóng khi AC-CHK-13..16 đạt.

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
