# Handoff

## Slice 4 — Admin đơn hàng: thiết kế xong, contract locked (2026-11-08)
- Chọn slice: Thắng (decisions 2026-11-08). PRD Slice 4: 41 BR (BR-ADM-01..41), 50 AC (46 Must, 4 Should); backlog lát 4.1–4.9.
- Câu hỏi: S4-Q1..Q7, Q9 chốt theo mặc định PO; PO thêm lý do huỷ `customer_request` (staff, `to_ship`) — Thắng có thể bác. S4-Q8 (nội dung COMMON-01..03) còn mở, không chặn.
- Contract: `docs/api/openapi.yaml` tag `admin-orders` 12 endpoint, **locked** (commit 9b9a7b7). Mã lỗi mới `invalid-transition`, `order-state-changed`, `condition-not-met`. Kế hoạch BE: `docs/api/admin-orders-implementation-plan.md` (migration chỉ cộng thêm, máy trạng thái, test T-ADM ↔ AC-ADM, điểm FE phải đổi).
- Lưu ý: trường `callAttempts.inFirstDay` giữ tên nhưng nghĩa là số lần lớn nhất trong một cửa sổ 24 giờ.
- Tiếp theo: lát 4.1 (quyền, migration, cờ `adminOrdersMode`) → 4.2 (đọc) → 4.3 → 4.4 → 4.5 (bật `toShipCancelMode: 'request'`) → 4.6 Should → 4.7 nghiệm thu trên Supabase.

## Slice 3 — QA vòng 2 (2026-11-08)
- Must 71/73 Pass, 0 Fail, 0 KKĐ, 2 hoãn Q2 (CHK-25, 27); Should 4/4. Minor m-1..m-5, m-7 đóng (commit 552e3a3, 78b83eb + commit tài liệu). Chi tiết: `docs/qa/report-slice-3-checkout.md` › "Cập nhật vòng 2".
- Còn chặn DoD: M-1 crash worker vitest trên Windows (không assertion fail). Đề xuất thử Node 22 LTS hoặc Thắng ghi chấp nhận.
- Còn mở: flaky khi tải nặng AC-CART-18 (desktop) và `home.spec.ts:56` (mobile); m-6 ngày nghỉ 2027; PO xem chữ AC-CART-06 (dòng gộp "được chọn") và AC-CHK-05 (gợi ý đăng nhập tĩnh).

## Slice 3 — bước 11 QA (2026-11-08, chưa đạt DoD, 0 Blocker)
- Báo cáo: `docs/qa/report-slice-3-checkout.md`. AC Must 73: 61 Pass, 1 Fail do chữ AC sai (AC-VOU-08), 9 chưa kiểm được, 2 hoãn Q2 (AC-CHK-25, 27). Should 4: 3 Pass, 1 chưa kiểm.
- Lệnh: BE typecheck/build qua; `npm test` toàn bộ 5/5 lần crash M2 (0xC0000409), không assertion fail; chạy từng file: 17/17 file, 262 test pass. FE lint/format/build qua (initial 577,81 kB); Playwright 5 spec liên quan 81 pass / 0 fail / 1 skip.
- Major: M-1 crash M2 (chưa 3 lần pass liền). M-2 đã đóng (xem 2 mục Supabase dưới).
- Đơn thật trên Supabase (2026-11-08, Thắng duyệt "đặt rồi huỷ"): FE `start:local` + BE trỏ Supabase, `MAIL_MODE=smtp`. Đơn khách COD N2F2611082686 (blazer Đen/S × 1, 1.290.000 ₫, phí 30.000 được miễn vì ≥ 1.000.000 ₫), email phthang0872@gmail.com. Thư xác nhận gửi lúc 07:30:38Z, 1 lần thử, Thắng xác nhận vào hộp thư chính, tổng đúng (AC-CHK-34 Pass). Tra cứu: mã + email -> OTP 8 số qua Gmail -> xem đơn đúng. Huỷ qua trang tra cứu: `cancelled`, `stock_restored_at` có, tồn biến thể 4 -> 5. Đơn đã huỷ còn nằm trong bảng `orders` trên Supabase (dữ liệu test, địa chỉ ghi "đơn test, sẽ huỷ").
- Lưu ý môi trường: tiến trình BE chạy từ Bash không hiện trong `Get-NetTCPConnection`/`netstat` của PowerShell; khi gặp `EADDRINUSE` cổng 4000 thì tìm theo dòng lệnh `server.ts` (Win32_Process) rồi `taskkill /T`.
- Supabase (2026-11-08, Thắng xác nhận áp): `_prisma_migrations` cho thấy `20261107000500_cart_checkout_schema` đã được áp lúc 05:36:53Z (trước khi orchestrator kiểm, chưa ghi ở handoff). Orchestrator chạy `npx prisma migrate deploy` 2 lần: cả hai "No pending migrations to apply" (AC-CHK-41 phần migration). `npm run seed:checkout` chạy lại: số dòng không đổi (34 tỉnh/thành, 3.321 phường/xã, 24 ngày nghỉ, 2 voucher, `used_count` 0, 0 đơn, users 6). RLS bật mọi bảng trừ `_prisma_migrations`. BE cục bộ trỏ Supabase (`MAIL_MODE=dev-outbox`): `/locations/provinces` 200 (~1,8 s), phường TP.HCM 168, `POST /checkout/quote` 1 blazer + `N2FWELCOME15` + `N2FFREESHIP`: 1.290.000 − 193.000 + 30.000 − 30.000 = 1.097.000 (200, ~3,5 s). Không tạo đơn, không gửi thư trên Supabase.
- Minor cần frontend-dev: m-1 dữ liệu demo Account vẫn trong `main-*.js` (dòng 11 dưới ghi "không còn mock/demo" là chưa đúng cho Account); m-2 toast gộp có thể trùng khi `returnUrl=/cart`; m-3 race tải lại; m-4 chú thích "only labels" ở `api-config.ts` sai (cờ mode vẫn được đọc ở `cart-state.ts` v.v.). PO: m-5 sửa AC-VOU-08. Thắng: m-6 ngày nghỉ 2027.
- Postgres cục bộ 54329 đã bật lại (cụm `C:/Users/ADMIN/AppData/Local/Temp/n2f-pg18`).

## Slice 3 BE — Cart & Checkout (2026-11-08, backend xong, đã áp Supabase)
- Đã làm (bước 1-6 của `docs/implementation/slice-3-cart-checkout.md`): 7 mã lỗi mới; migration `20261107000500_cart_checkout_schema` (13 bảng, CHECK, RLS, chỉ cộng thêm); seed `npm run seed:checkout` (tham số, 2 voucher, 34 tỉnh/thành + 3.321 phường/xã, ngày nghỉ); giỏ thành viên, báo giá, voucher, địa giới; đặt COD nguyên tử + `Idempotency-Key`; huỷ; tra cứu OTP; đơn thành viên; email; job nền 60 giây (`server.ts`). Chưa làm: lát 3.8 QR/SePay (Q2); `GET /orders/{code}/payment` có nhưng 404 vì QR tắt.
- Giả định chờ Thắng gom ở `backend/src/config/assumptions.ts` (làm tròn mã % 1.000 ₫, OTP tra cứu, cookie 30 phút, huỷ `to_ship`, khoá idempotency 24 giờ). Tên trạng thái nằm ở enum DB.
- Dữ liệu cần Thắng đối chiếu trước go-live: `backend/prisma/seed-data/holidays-vn.json` (2026 theo lịch đã công bố, 2027 chỉ ước tính Tết 5-9/2; thiếu Giỗ Tổ 2027) và `vn-locations.json` (nguồn provinces.open-api.vn v2, mã tỉnh 2 số, mã phường 5 số).

## Slice 3 — bước 9 tích hợp thật (2026-11-08, đã kiểm trên BE + Postgres cục bộ)
- Đã chạy qua trình duyệt thật (Playwright Node, Edge) trên `http://localhost:4200`: giỏ khách (không gọi API giỏ), đăng nhập + gộp giỏ (không nhân đôi sau tải lại), báo giá + `N2FWELCOME15` + `N2FFREESHIP`, đặt COD (đơn N2F2611080017: 390.000 − 58.000 + 30.000 − 30.000 = 332.000), bấm đôi = 1 đơn, danh sách/chi tiết đơn thành viên, đơn khách N2F2611081801 + tra cứu OTP (sai email: không gửi thư; sai OTP: 404; đúng: cookie `n2f_oa`), huỷ đơn (tồn 4 -> 5, hoàn đúng 1 lần, lần huỷ 2 trả 409), email xác nhận/huỷ khớp tổng, `price-changed` 409 hiện đúng, lỗi mạng rồi Thử lại không tạo đơn thứ hai, `n2f_sid` hỏng -> `/auth/login?returnUrl=...`, đơn người khác -> "Không tìm thấy đơn hàng".
- Lỗi đã sửa: dữ liệu demo seed (giỏ 4 dòng id mock) vẫn được ghi vào localStorage khi `checkoutMode`/`catalogMode` là http, làm giỏ khách có dòng "không còn kinh doanh". Nay chỉ seed khi cả ba chế độ là mock (`src/mocks/demo-seed/index.ts`).
- Đã đóng (FE, sau bước 9): toast gộp giỏ trước đây KHÔNG hiện ngoài /cart (chỉ có câu trong giỏ); nay `CartState.afterMerge` bật toast khi không ở /cart (test AC-CART-13 xác nhận hiện đúng 1 lần). Test mock mới trong `tests/cart-checkout.spec.ts`: AC-CART-13..18 (cờ `serverCart`, thêm cờ `sessionRevoked` cho thu hồi phiên) và AC-CHK-36 phần FE (429 đặt hàng). Sửa kèm: checkout mock không còn ghi đè họ tên/email/SĐT/địa chỉ đã nhập bằng hồ sơ thành viên (AC-CART-16). Bundle initial 616,67 kB -> 577,81 kB (< 600 kB): adapter auth/catalog/cart/checkout/orders tách ra `core/storefront-adapters.ts` (HTTP) và bản `.e2e.ts` (mock, thay trong angular.json cấu hình e2e); build thường không còn mock/demo trong chunk initial. Playwright mock toàn bộ: 219 pass, 0 fail, 7 skip. Còn mở: bấm tải lại trong vài chục ms sau khi thêm hàng khi đã đăng nhập (trước khi server trả lời) có thể làm gộp lặp dòng đó (baseline chưa lưu).

## Slice 3 FE — bước 7, 8 (2026-11-08, mock xong, chưa tích hợp thật)
- Commit 1ea60b7 (bước 7), 65b2e7c, 391342e (bước 8). `checkoutMode` (http mặc định, e2e mock), adapter HTTP + mock cho giỏ/báo giá/voucher/đặt hàng/địa giới/tra cứu OTP/đơn thành viên (`ORDERS_API`), `CartState` hai nguồn lưu (khoá v2, gộp sau đăng nhập, đăng xuất xoá giỏ máy, làm tươi giá debounce 300 ms, Hoàn tác), checkout 2 ô voucher + Idempotency-Key + xử lý 409, trang thành công (biên nhận sessionStorage), tra cứu mã đơn + email + OTP, danh sách đơn phân trang.
- Giả định Q1-Q4 gom ở `features/orders/order-status-map.ts` (`SLICE3_ASSUMPTIONS`, ánh xạ trạng thái) và `core/commerce-policy.ts`; QR ẩn khi `policy.bankTransferEnabled` false (HTTP).
- Kiểm: lint, format:check, build qua (cảnh báo budget initial 616 kB > 600 kB). Playwright mock toàn bộ: 204 pass, 1 fail (admin.spec.ts:24 desktop, flaky khởi động nguội như ở Slice 2), 7 skip; trước Slice 3 là 178 pass. Có 26 test mới trong `tests/cart-checkout.spec.ts`. Cờ giả lập lỗi cho test: sessionStorage `n2f.mock.flags` (`src/mocks/mock-flags.ts`).
- Chưa làm/kiểm: bước 9 (tích hợp thật), giỏ thành viên + gộp ở chế độ mock chỉ bật qua cờ `serverCart` (chưa có test Playwright AC-CART-13..18), 429 đặt hàng, khôi phục form sau đăng nhập từ checkout chưa có test, tra cứu bằng SĐT đã bỏ cả ở mock.
- Lệch contract: không có. Lưu ý `stockIssues[].available` là tồn còn lại; FE tự cắt theo `maxPerVariant` khi bấm "Cập nhật theo số còn lại".

- **BE lát 4.1 + 4.2 xong (2026-11-08, backend-dev)**: migration `20261108000100_admin_orders_schema` (chỉ cộng thêm; áp n2f_dev + n2f_test, chưa chạm Supabase); 3 mã lỗi + `currentStatus`/`order`; `noStore`, `adminRateLimit` theo tài khoản; `ADMIN_ASSUMPTIONS`, `toShipCancelMode: 'direct'` (đổi 'request' ở lát 4.5); `insertOrderEvent` (mọi ghi sự kiện); `GET /admin/orders`, `/counts`, `/{code}` (timeline mới nhất trước, `allowedActions`); DTO khách thêm `actor`, `shipment`, `deliveredAt`, `cancelRequest`, `cancelMode`, timeline lọc theo kind. Test `backend/test/admin-orders.test.ts` (T-ADM-01..10, 12, 45, 49, 90 phần 4.1/4.2).
- Lệch có chủ ý: `POST /admin/orders/{code}/cancel` hiện chỉ có cổng quyền `other` -> 403 cho staff (để kiểm AC-ADM-02/03), phần còn lại trả 404 tới lát 4.3. `notes` để lát 4.6; `overdue` luôn `[]` tới 4.6. Hai test Slice 3 sửa dữ liệu dựng bằng SQL cho khớp CHECK mới (`cancel_requested` cần `cancel_requested_at`; `delivery_refused_at` chỉ ở `cancelled`) và 1 assert timeline thêm `actor` (cộng thêm theo contract). Test RLS chỉ kiểm bảng đơn/checkout (bảng auth baseline cục bộ không bật RLS, có từ trước).
- Đề xuất đổi contract (Slice 4): không có.

### Đề xuất đổi contract (Slice 3)
Code lệch nhẹ, không sửa openapi (locked); chờ Orchestrator duyệt:
1. `POST /checkout/quote` và `/vouchers/check` trả `422 invalid-address` khi `address` sai (contract chỉ ghi `validation`).
2. `POST /checkout/quote` trả `429` khi IP đang bị khoá dò mã mà body có `voucherCodes` (contract chỉ nêu ở `/vouchers/check`); mã không tồn tại trong quote cũng cộng bộ đếm 10/15 phút.
3. `quote.lineDiscounts` luôn có (mảng rỗng khi không giảm); `pricing.shippingFee = 0` khi không còn dòng nào mua được (tạm tính 0).
4. AC-VOU-08: 390.000 + 550.000 giảm 141.000 chia ra 58.500 + 82.500 (chia hết, phần dư 0); PRD nói "dòng 550.000 nhận phần dư" nên cần PO sửa chữ AC (ví dụ dùng số khác).
5. `limitedBy: 'stock'` cũng trả cho dòng `discontinued`.
6. Đơn bị huỷ trước khi thư xác nhận kịp gửi: không gửi thư xác nhận (chỉ thư huỷ).

## Slice 2 — Catalog (2026-11-07, chờ QA/PO nghiệm thu)
- BE (commit c263fee, 3e3a306, dc488d3, ee7fe6a): mã `not-found`, migration cộng thêm `20261107000400_catalog_schema` (RLS bật 4 bảng mới), `foldVi` + seed catalog idempotent (8 SP, 64 biến thể, 4 bảng size), module catalog, rate limit 120/60s/IP, cache header, đếm truy vấn. typecheck/build qua; `npm test` 133/133 pass (8 file), chưa đạt 3 lần pass liền do worker crash 0xC0000409 (không có assertion fail).
- FE (commit 62d6520, b4c0d4a, 975ed2a): `catalogMode`, adapter HTTP + mock theo contract, Xem thêm, tiêu đề theo `total`, wishlist theo `ids`, PDP ẩn đánh giá ở http, hết hàng. lint/format/build qua; `catalog.spec.ts` 12/12; `pdp-plp/header/home/commerce` 32 pass, 4 skip, 2 fail (`commerce:144` flaky, `home:56` mobile banner → /auth/login, luồng auth, chưa xác nhận có từ trước).
- Tích hợp thật cục bộ (BE + `start:local`): PLP 8 SP từ API, slug chữ hoa đổi về slug chuẩn, slug lạ hiện "Không tìm thấy sản phẩm", `/search?q=dam` ra 1 SP, bảng size `public, max-age=3600`, route lạ 404 `not-found` + `no-store`, giỏ localStorage không vỡ. Console chỉ có lỗi 404 mạng của slug lạ (mong đợi).
- Chưa kiểm được: Xem thêm với 30 SP (AC-CAT-41, seed chỉ 8), ngắt mạng/Thử lại (AC-CAT-28, 49), p95 trên Supabase (AC-CAT-52).
- Postgres cục bộ: cổng 54329 hiện là cụm tạm `C:/Users/ADMIN/AppData/Local/Temp/n2f-pg18` do agent BE dựng lại; dữ liệu auth cũ của `n2f_dev` không có trong cụm này. Bật lại: `"C:/Program Files/PostgreSQL/18/bin/pg_ctl" -D C:/Users/ADMIN/AppData/Local/Temp/n2f-pg18 -o "-p 54329 -c listen_addresses=127.0.0.1" start`.
- 2026-11-07 14:54Z Thắng đã chạy `migrate deploy` + `seed:catalog` lên Supabase. Kiểm chỉ đọc: `_prisma_migrations` 5 dòng (có `20261107000400_catalog_schema`), categories 4, products 8, variants 64, size_charts 4, RLS bật 4 bảng, users 6 (không đổi). BE cục bộ trỏ Supabase: list/search/chi tiết/bảng size 200, slug lạ 404. Thời gian từ máy Thắng tới pooler Tokyo: danh sách ~1,2–1,5 s, chi tiết ~0,8–1 s (chủ yếu độ trễ mạng; AC-CAT-52 đo ở máy chủ, chưa đo được).
- Lệnh áp Supabase (đã chạy), trong `backend/` với `.env` Supabase: `npx prisma migrate deploy` rồi `npm run seed:catalog` (DIRECT_URL cổng 5432).

- 2.15 xong (commit e236e57): ô tìm kiếm cắt 100 ký tự (maxlength + validator + cắt khi dán; URL `?q=` dài cũng bị cắt; `toParams` không bao giờ gửi `q` > 100). Test `2.15` trong `catalog.spec.ts`; đã đổi tên AC-CAT-41, AC-CAT-44 thành (mock only, no API call).
- 2.16 (2026-11-07, mock, `--trace off`, trên e236e57): toàn bộ Playwright **178 pass, 1 fail, 7 skip** (186 test). Fail duy nhất: `admin.spec.ts:24 admin opens every section` (desktop), timeout 5s ở trang Khách hàng khi dev server biên dịch lười lần đầu. Chạy riêng test đó: pass ở e236e57 và pass ở `dc488d3^` (b4c0d4a), bản mobile cũng pass trong cùng lần chạy; kết luận: flaky lúc khởi động nguội, từ trước, không do Slice 2. Lần chạy đầu (bị dừng giữa chừng) còn gặp `commerce.spec.ts:144` fail một lần rồi pass ở lần chạy đầy đủ: cũng flaky. 7 skip là skip có chủ ý trong code test (mobile/desktop only).
### Đề xuất đổi contract (Slice 2)
- `gender` dài hơn `maxLength` 20: BE coi là giá trị lạ, trả trang rỗng thay vì 422. Cần xác nhận.

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
- Slice 3 (product-owner, 2026-11-07), chi tiết ở `docs/product/PRD.md` › Slice 3 › mục 7; BR liên quan đánh dấu "chờ xác nhận":
  1. Nhóm COMMON-01..06 được `cart-checkout-business-rules.md` tham chiếu nhưng không có nội dung (trạng thái đơn/thanh toán, trừ/hoàn kho, làm tròn tiền, quyền khách và OTP tra cứu). Đề xuất: Thắng gửi nội dung; tạm dùng giả định ghi ở PRD (tên trạng thái COMMON + ánh xạ FE, làm tròn xuống tới 1.000 ₫, OTP theo BR-AUTH-04..09). Ảnh hưởng BR-CHK-22, 23, 26, BR-VOU-05.
  2. Chuyển khoản QR tự đối soát cần tài khoản nhận + webhook. Đề xuất: SePay, Thắng mở tài khoản; chưa có thì ẩn QR ở HTTP (đơn > 5.000.000 ₫ chưa đặt online được). Ảnh hưởng BR-CHK-19, 21.
  3. Phạm vi địa giới: đề xuất toàn quốc 34 tỉnh/thành, seed từ file công khai. Ảnh hưởng BR-CHK-06.
  4. Huỷ ở `to_ship` trước khi có Admin: đề xuất huỷ thẳng, chuyển sang `cancel_requested` khi có Admin. Ảnh hưởng BR-CHK-23.

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

### Sau QA vòng 1 (2026-11-07)
- product-owner đã cập nhật PRD (BR-AUTH-09, 26, 31, 35, 36; AC-29, 32c, 79, 95a/95b; mục 6) và backlog (Dọn schema auth, Dọn mock, việc phát sinh sau QA). Quyết định ở decisions.md.
- Việc cho ui-ux-designer: `docs/design/auth-login.md:11` còn ghi staff/admin đăng nhập storefront về `/admin`; cập nhật theo decisions 2026-11-07. Xem thêm N20 (link nhỏ ở 320px).
- Việc cho backend-dev trước Slice 2: thêm mã `not-found` vào contract; test riêng cho giới hạn 30 lần sai mã/15 phút/IP.
- Cần Thắng: chạy AC-95a (10 lần mã qua Gmail thật); xác nhận hoãn 8 AC.
