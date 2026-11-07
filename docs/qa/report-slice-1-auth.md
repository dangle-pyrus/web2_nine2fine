# Báo cáo QA Slice 1 Auth (vòng 1)

Ngày 2026-11-07. Commit được kiểm: `b4337b7`. Người kiểm: qa-reviewer. Orchestrator lưu file này từ báo cáo trả về của QA vì công cụ ghi file không cho sub-agent tự lưu.

## Kết luận

**Chưa đạt nghiệm thu** (DoD ở PRD mục 6 yêu cầu mọi AC Must đạt). Luồng chính chạy đúng trên backend thật cục bộ và không có Blocker.

| Hạng mục | Số lượng |
| --- | --- |
| AC tổng | 101 |
| Pass | 89 |
| Fail | 4 (AC-07, 20, 29, 70) |
| Không kiểm được | 8 (AC-68, 69, 75, 84, 85, 88, 89, 95) |
| Blocker / Major / Minor | 0 / 3 / 20 |

Việc tối thiểu để nghiệm thu:
- Sửa M1 và M3.
- Xử lý N1, N2, N3 (sửa code hoặc PO sửa AC).
- PO quyết định 8 AC chưa kiểm được: dời slice hay kiểm trên môi trường triển khai.
- M2 cần có cách chạy test ổn định trước khi tin vào CI.

## Số liệu lệnh thật

| Lệnh | Kết quả |
| --- | --- |
| backend `npm run typecheck`, `npm run build` | exit 0 |
| backend `npm test` | 88/88 khi không crash; **8/25 lần crash** `0xC0000409`, exit 1 |
| frontend `npm run lint`, `format:check`, `build` | exit 0; initial 587,47 kB; `format:check` không quét `tests/` |
| `npx playwright test --trace off` | **160 pass, 2 fail, 6 skip** / 168, 15,1 phút, exit 1 |
| Chạy lại 2 test fail, `--repeat-each=6` | 12/12 pass, tức test chập chờn (N14) |
| `prisma migrate status`, `migrate diff` trên `n2f_dev` | 4 migration, up to date; No difference |

- 2 test fail: `tests/admin.spec.ts:138` (hết 5 giây chờ ở `:13`) và `tests/auth.spec.ts:28` (ở `:70`).
- 6 skip là skip có chủ ý theo `isMobile`/desktop.
- Môi trường: Postgres 18 cổng 54329, thư ghi vào thư mục tạm, không chạm Supabase, không gửi thư thật. UI thật kiểm bằng script Playwright ngoài repo trên Edge.

## Major

**M1. Dò email qua thời gian phản hồi của `POST /auth/codes` (BR-AUTH-03, AC-07). backend-dev.**
- File: `backend/src/modules/auth/auth.service.ts:76,78`, `backend/src/modules/auth/otp.service.ts:22`. `issueCode` chỉ được `await` khi thực sự phát mã, thêm 4 lượt truy vấn.
- Tái hiện: gọi 20 lần cho A và 20 lần cho N, xoá bộ đếm giữa các lần, qua proxy TCP thêm độ trễ tới Postgres.
- Kỳ vọng: chênh trung vị ≤ 300 ms.

| Trễ tới DB | login A / N | reset A / N | register A / N | Lượt truy vấn |
| --- | --- | --- | --- | --- |
| 0 ms | 295 / 169 ms (chênh 126) | 285 / 173 ms | 157 / 283 ms | 10 / 6 |
| 100 ms | **1251 / 748 ms (chênh 503)** | **1248 / 748 ms** | **749 / 1252 ms** | 10 / 6 |

- Chênh ≈ 126 ms + 4 × RTT, vượt 300 ms từ khoảng RTT 45 ms. Đây là mô phỏng, chưa đo trên Supabase; với đăng nhập 3-4,6 giây đo được thì rất có thể vượt.
- `backend/test/lookup-codes.test.ts:62` chạy không có độ trễ nên không bắt được.
- Rủi ro thực tế có giới hạn vì `/auth/lookup` đã lộ cùng thông tin (rủi ro chấp nhận ở BR-AUTH-02), nhưng BR-AUTH-03 và AC-07 cấm đường thứ hai.
- Mật khẩu sai không bị lỗi này: 1030 / 1032 / 1030 ms (A / N / P) ở RTT 100 ms.

**M2. Test backend crash ngắt quãng. backend-dev.**
- 8/25 lần worker thoát `3221226505` (`0xC0000409`), exit 1, không có đạt giả.
- Crash giữa file ở cả 3 file test, tại các test khác nhau. stderr của worker rỗng, Event Log không có bản ghi trong ngày.

| Thí nghiệm | Kết quả |
| --- | --- |
| Bộ test thật, vitest | 8/25 crash |
| Vitest + app thật + Prisma + supertest (tối giản, ngoài repo) | **4/6 crash**, 1 ok, 1 fail do cạn cổng (lỗi của script) |
| Vitest + Prisma, không HTTP | 0/5 |
| Vitest + Prisma + Date giả | 0/5 |
| Vitest + express/supertest/bcrypt, không Prisma | 0/5 |
| App thật + Prisma + supertest, tsx thường, không vitest | 0 crash, 180 giây, 1110 vòng |
| Như trên, `fork` cùng tuỳ chọn pool của vitest | 0 crash, 180 giây |
| Prisma, không vitest (trong tiến trình và qua `fork`) | 0 crash, khoảng 20.000 vòng mỗi loại |

- Nhận định: cần đồng thời worker vitest, engine Prisma native và HTTP trong tiến trình. Không tái hiện ngoài vitest, nên đây là lỗi môi trường test, không phải runtime sản phẩm.
- **Nguyên nhân gốc chưa xác định.** `0xC0000409` trên Windows cũng là mã của `abort()`/fastfail; đây là giả thuyết.
- Thử tiếp: Linux CI, Node 22 LTS, hạ vitest, hoặc Prisma `engineType = "client"`.

**M3. Trang hồ sơ báo tạo mật khẩu thành công nhưng máy chủ không đổi. frontend-dev.**
- File: `frontend/src/mocks/mock-account-store.ts:217`, `frontend/src/mocks/mock-account-api.ts:46-51`, `frontend/src/app/features/account/profile/profile-page.ts:49-54,411`.
- Tái hiện: bản http, đăng nhập tài khoản có mật khẩu, `/account/profile`, bấm "Tạo mật khẩu", nhập mật khẩu mới, lưu.
- Thực tế: tài khoản đã có mật khẩu vẫn hiện "Chưa tạo mật khẩu"; sau khi lưu hiện "Đã tạo mật khẩu."; API thật với mật khẩu đó trả 401. Ngày sinh đã nhập khi đăng ký hiện "Chưa cập nhật".
- Kỳ vọng: không có thao tác giả ở chức năng bảo mật (PRD ghi Won't ở Slice 1). Đề xuất ẩn nút khi `authMode: http`.
- Đây là hệ quả còn lại của bản sửa avatar.

## Minor

| # | Lỗi | File:dòng | Thực tế → Kỳ vọng | Phụ trách |
| --- | --- | --- | --- | --- |
| N1 | AC-20 sai số phút | `backend/src/modules/auth/otp.service.ts:55,93` | 5 lần sai mã: `retryAfterSeconds` 901, "16 phút" → 900, "15 phút". `lookup-codes.test.ts:222` chỉ kiểm `> 0` | backend-dev |
| N2 | AC-70 đăng xuất về `/new-in` | `frontend/src/app/features/account/account-layout.ts:175` | → `/` theo BR-AUTH-27, hoặc PO đổi BR | frontend-dev |
| N3 | AC-29 không nơi nào hiện đủ họ tên | `account-layout.ts:26`, `frontend/src/app/layouts/store-layout.ts:73` | Dữ liệu đúng, UI chỉ "@Minh" → "Nguyễn Văn Minh", hoặc PO sửa AC | frontend-dev, product-owner |
| N4 | Email chứa NUL trả 500 | `backend/src/modules/auth/auth.schemas.ts:22,28-31` | `a\u0000b@example.com` ở lookup, codes, login/password, register → `422 validation` | backend-dev |
| N5 | Mật khẩu mock và mã demo trong bundle production và repo | `frontend/src/app/app.config.ts:157`, `frontend/src/app/admin/admin-providers.ts:35`, `frontend/src/mocks/accounts.ts`, `frontend/src/mocks/admin/admin-seed.ts`, `frontend/tests/admin*.spec.ts` | `main-*.js` có 1 mật khẩu mock và mã demo; chunk admin có 2 mật khẩu mock. Không dùng được (xem mục Bảo mật) nhưng trái chữ BR-AUTH-35 | frontend-dev, PO quyết định |
| N6 | Admin mất mạng bấm đăng xuất không có tác dụng | `frontend/src/app/admin/layout/admin-shell.ts:269-275` | Vẫn ở `/admin` → xoá trạng thái, về `/admin/login` | frontend-dev |
| N7 | Hết phiên ở `/wishlist` không về đăng nhập | `frontend/src/app/features/auth/auth-session.ts:35` | 401 giả: ở nguyên trang → về đăng nhập | frontend-dev |
| N8 | Sau đăng xuất ô email còn địa chỉ người trước | `auth-session.ts:85` | → ô trống | frontend-dev |
| N9 | Khách mở `/admin` không có `returnUrl` | `frontend/src/app/admin/core/admin-session.ts:48` | Kết quả sau đăng nhập vẫn đúng; đề nghị PO chấp nhận | frontend-dev, product-owner |
| N10 | `returnUrl` mã hoá hai lần vào trang 404 | `frontend/src/app/core/return-url.ts:10-14` | `%2F%255Cevil.com` → 404 cùng origin, không có open redirect; nên về `/new-in` | frontend-dev |
| N11 | CSRF lớp 3 lệch contract | `backend/src/middleware/csrf.ts:21-27` | POST không body, không `Content-Type`: 204. `X-Requested-With` vẫn buộc preflight, không khai thác được | backend-dev |
| N12 | 404 dùng mã `validation` | `backend/src/middleware/error.ts:6` | Cần chốt ở contract | backend-dev, Orchestrator |
| N13 | `npm start` theo README không đăng nhập được | `frontend/package.json:6`, `frontend/README.md:11,14` | 127.0.0.1 ngoài allowlist nên POST bị 403 → đổi README hoặc allowlist. Đánh giá từ code và kết quả API Origin lạ, chưa bấm thử trên UI | frontend-dev |
| N14 | Playwright chập chờn | `frontend/tests/auth.spec.ts:67-70`, `frontend/tests/admin.spec.ts:13` | `reload` trước khi chuyển trang; đăng nhập admin có lúc quá 5 giây | frontend-dev |
| N15 | Nhãn AC trong test lệch PRD; AC-08 mẫu nhỏ | `frontend/tests/auth.spec.ts:28,73,185`, `backend/test/lookup-codes.test.ts:90,151` | AC-08 chỉ 40 mã thay vì 1000 | frontend-dev, backend-dev |
| N16 | Phiên bị thu hồi rồi tải lại: không có thông báo hết hạn | `frontend/src/app/features/account/account-guard.ts:14-15` | BR-AUTH-26 chưa nói rõ | product-owner |
| N17 | Đăng nhập chậm khi DB xa | `backend/src/lib/crypto.ts:15`, `auth.service.ts:110-128`, `session.service.ts:44-77` | Xem mục Đăng nhập chậm | backend-dev |
| N18 | `maskEmail` là mã chết | `backend/src/lib/logger.ts:2` | Không có log sự kiện auth nên "email che" chưa có gì để áp dụng | backend-dev |
| N19 | Tài liệu lệch quyết định | PRD BR-AUTH-31, AC-79, AC-32c, mục 6; `docs/design/auth-login.md:11`; `docs/product/backlog.md` chưa có "Dọn schema auth"; `docs/handoff.md:26` | Cần cập nhật | product-owner, ui-ux-designer |
| N20 | Link nhỏ ở 320px | `frontend/src/app/features/auth/login-page.ts:130` | "Quên mật khẩu" cao 16px, "Chỉnh sửa Email" 21px; spec không bắt buộc 44px, đề nghị ≥ 24px | ui-ux-designer, frontend-dev |

## Bảng AC

Bằng chứng: **BE** = `backend/test/<file>:<dòng>` (L = lookup-codes, R = register-login, S = session-security). **Thật** = UI thật + backend thật cục bộ. **API** = gọi trực tiếp backend cục bộ. **Mock** = Playwright cấu hình mock. KKĐ = Không kiểm được.

| AC | Kết quả | Bằng chứng |
| --- | --- | --- |
| 01 | Pass | Thật: `  QA-B@Example.COM ` vào bước mã, thư tới địa chỉ chữ thường; BE L:16 |
| 02 | Pass | Thật: 3 giá trị, 0 request; API 422 field email |
| 03 | Pass | Thật: `/auth/register`, URL không có email |
| 04 | Pass | API: chỉ `{"registered":true}` |
| 05 | Pass | BE L:37; Mock auth.spec:103 |
| 06 | Pass | BE L:51 |
| 07 | **Fail** | M1. Trạng thái, cấu trúc, thông điệp giống nhau; thời gian vượt 300 ms ở RTT 100 ms (mô phỏng) |
| 08 | Pass | 1000 mã: 1000 khác nhau, 117 bắt đầu bằng 0, 0 cặp tăng dần; DB 170 token, 0 dạng rõ |
| 09, 10 | Pass | BE L:108, L:115 |
| 11, 12 | Pass | BE L:123 (đồng hồ giả) |
| 13 | Pass | Thật: "Gửi lại mã trong 60 giây", nút khoá; BE L:139 |
| 14 | Pass | Thật: sau 20 giây còn "40 giây", không lỗi, không thư mới, mã cũ dùng được |
| 15 | Pass | BE L:160; Mock auth.spec:417 |
| 16 | Pass | BE L:178 |
| 17, 18 | Pass | BE L:192, L:202 |
| 19 | Pass | Thật + BE L:208 |
| 20 | **Fail** | N1: hiện 16 phút, yêu cầu 15. Phần còn lại đúng |
| 21 | Pass | BE L:231: cùng thông báo như AC-20 (mang theo sai số N1) |
| 22 | Pass | BE L:241 |
| 23 | Pass | Thật: 0 request; `1234abcd` bị lọc còn `1234` |
| 24, 25, 26 | Pass | BE L:265, L:277, L:285; API: 0 thư cho N |
| 27 | Pass | Thật: 3 lỗi, 0 request |
| 28 | Pass | BE R:33; Mock auth.spec:227 |
| 29 | **Fail** | N3: dữ liệu đúng (DB, BE R:43), UI không hiện đủ họ tên |
| 30 | Pass | Thật |
| 31, 32 | Pass | BE R:65, R:72; Mock auth.spec:252, 287 |
| 32a | Pass | BE R:83 |
| 32b | Pass | Thật + BE R:83 |
| 32c | Pass | Theo decisions 2026-11-07 (3 ô nhập): Mock auth.spec:252; PO cần sửa chữ AC |
| 33 | Pass | BE R:99 |
| 34 | Pass | DB: `terms_accepted_at` lệch `created_at` 5 ms; không có cột phiên bản |
| 35 | Pass | Thật |
| 36 | Pass | BE R:107 |
| 37, 38 | Pass | BE R:124, R:141 |
| 39 | Pass | Thật: về `/shop`, tải lại vẫn đăng nhập; BE R:195 |
| 40, 41 | Pass | Thật: focus `h1`, ô mã xoá, email điền sẵn |
| 42, 43, 44 | Pass | Thật + BE R:195, R:208, R:216 |
| 45, 46, 47, 48 | Pass | BE R:185, R:228, R:243, R:250 |
| 49, 50 | Pass | Thật (có mailto hỗ trợ) + BE R:258 |
| 51 | Pass | Thật + BE R:279 |
| 51b | Pass | BE R:290; Mock auth.spec:334 |
| 52 | Pass | Thật |
| 53, 54 | Pass | BE R:279 (mã chưa tiêu), R:298 |
| 55 | Pass | API: chỉ 5 trường hồ sơ; DB: mọi hash là bcrypt |
| 56 | Pass | BE R:314; Thật: về bước mật khẩu kèm thông báo |
| 57 | Pass | Thật: tài khoản chưa có mật khẩu tạo được rồi đăng nhập |
| 58, 59 | Pass | BE R:335, R:343 |
| 60 | Pass | Thật |
| 61 | Pass | BE R:156, R:167; DB có đủ `password`, `otp`, `register` |
| 62, 63, 64 | Pass | BE S:73, S:82, S:93 (đồng hồ giả) |
| 65 | Pass | Thật: F5, tab mới không thoáng qua trang đăng nhập, mở lại trình duyệt; cookie 90 ngày |
| 66 | Pass | Thật: `200 {user:null}`, 0 lỗi console |
| 67 | Pass | Thật: `me` chậm 3 giây không chuyển trang; treo thì về đăng nhập sau 10,7 giây |
| 68 | KKĐ | Interceptor Pass với 401 giả; không có đường thật |
| 69 | KKĐ | Với 401 giả: ở lại PLP, header thành khách |
| 70 | **Fail** | N2: về `/new-in`. Máy 2 vẫn đăng nhập, Back không thấy dữ liệu |
| 71 | Pass | BE S:119 |
| 72 | Pass | Thật: chặn `/auth/logout`, vẫn thành khách |
| 73, 74 | Pass | BE S:119, S:140 |
| 75 | KKĐ | Chưa có API admin vô hiệu tài khoản; BE S:152 kiểm phần service |
| 76 | Pass | Thật |
| 77 | Pass | Thật: 7 giá trị về `/new-in`; dạng mã hoá hai lần xem N10 |
| 78 | Pass | Thật |
| 79 | Pass | Thật: member về `/new-in`; staff ở `/admin/login` về `/admin`. Staff ở storefront về `/new-in` theo decisions, AC chưa cập nhật |
| 80 | Pass | Thật: cả nhánh đăng ký và đặt lại mật khẩu về `/shop` |
| 81, 82 | Pass | Thật: giỏ không đổi qua 3 bước; trái tim quay về PDP và đã lưu |
| 83 | Pass | API + BE R:59: role `member` |
| 84, 85 | KKĐ | Chưa có API admin thật; BE S:166 kiểm middleware trên route test |
| 86 | Pass | Thật; ghi chú N9 |
| 87 | Pass | Thật: về `/new-in`; guard chặn trước khi render khung admin (đọc code) |
| 88 | KKĐ | Chưa có API account thật; BE S:166 kiểm middleware |
| 89 | KKĐ | Chưa có môi trường triển khai. Cục bộ: 169 mã, 0 trong log server; 0 mật khẩu, 0 email; 0 trong console và URL |
| 90 | Pass | Thật: `document.cookie` rỗng; storage không có token |
| 91 | Pass | Chạy thật: thiếu `OTP_HMAC_SECRET` thì exit 1, chỉ in tên biến; BE S:311 |
| 92 | Pass | API: Origin lạ / thiếu / thiếu header đều 403; preflight và GET không có ACAO; BE S:217, S:227 |
| 93 | Pass | BE S:263, S:270; Thật: sai mã hiện đúng câu |
| 94 | Pass | Thật: abort và 500 đều "Không thể kết nối. Vui lòng thử lại." |
| 95 | KKĐ | Nguồn **Thắng** (thủ công, Supabase + Gmail thật): đăng ký, đăng nhập mã, quên mật khẩu chạy được, thư vào hộp thư chính. Chưa có số liệu 20 lần, chưa thử Outlook. QA kiểm nội dung thư cục bộ: tên gửi nine2fine, hạn 10 phút, 213 thư không có link |
| 96 | Pass | Thật: 3 click, 1 request; Mock auth.spec:283 |
| 97 | Pass | Thật: mất mạng giữ nguyên trường, bấm lại thành công |

## Không kiểm được và lý do

- **Hết phiên 401 với backend thật (AC-68, 69):** `mode: mock` nên account và catalog không gọi HTTP, còn các đường auth có 401 đều nằm trong `OWN_AUTH_PATHS`. Không có request thật nào kích hoạt `SessionEvents.expired`.
  - Đã làm: trên `ng serve` dev, gọi `HttpClient` thật qua interceptor thật, trả 401 đúng định dạng. Kết quả: về `/auth/login?returnUrl=%2Faccount%2Faddresses`, có thông báo, giỏ giữ nguyên; ở PLP thì ở lại và thành khách.
  - Thu hồi phiên trong DB rồi dùng tiếp trong app: **không phát hiện**, vẫn ở `/account/addresses`. Tải lại thì về đăng nhập.
- **AC-75, 84, 85, 88:** chưa có API admin/account thật; test middleware và service pass.
- **AC-89:** chưa có môi trường triển khai; audit cục bộ sạch.
- **AC-95:** không gửi thư thật theo ràng buộc; dựa vào Thắng.
- **Thời gian thật trên Supabase:** không chạy tải theo ràng buộc; dùng mô phỏng độ trễ cục bộ.

Lưu ý trước khi triển khai (chưa phải lỗi):
- `NODE_ENV` phải là `production` thì cookie mới có `Secure` (`session.service.ts:146`); `backend/.env` hiện là `development`.
- `TRUST_PROXY=false` sau reverse proxy sẽ gộp mọi người dùng vào một IP, 20 lượt tra cứu/15 phút sẽ chặn toàn bộ khách.

## Bảo mật

| Kiểm tra | Kết quả |
| --- | --- |
| Log không lộ OTP, mật khẩu, token | Đạt: 169 mã, 0 trùng trong log server |
| Cookie | Đạt: `n2f_sid` HttpOnly, SameSite=Lax, Path=/api, 90 ngày; `n2f_asid` Path=/api/admin, 24 giờ; `Secure` khi production (BE S:60) |
| CSRF | Đạt, trừ N11 |
| CORS | Đạt: allowlist, không `*` |
| Chống dò email | Cấu trúc đạt; thời gian không đạt ở `/auth/codes` (M1) |
| Rate limit | Đạt theo BE L:37-51, L:160-178, R:250 |
| Header bảo mật | Đạt: CSP, nosniff, HSTS; không có X-Powered-By |
| Secret mặc định | Đạt: `OTP_HMAC_SECRET` bắt buộc ≥ 32 ký tự, không có mặc định |
| `.env` | Đạt: được ignore, không có trong lịch sử git. `SMTP_PASS`, `OTP_HMAC_SECRET`, `SEED_*_PASSWORD`, mật khẩu DB: 0 file tracked, 0 commit, không có trong bundle. Hostname DB từng xuất hiện trong 2 commit, hiện không còn trong file tracked; không kèm mật khẩu |
| Mật khẩu mock trong bundle | **Có** (N5) |
| Đăng nhập bằng mock trên bản http | **Không được**: 2 tài khoản mock admin nhận 401 từ API thật; mã demo nhận `invalid-code`, không hiện gợi ý chế độ trải nghiệm. `SEED_*` không trùng mật khẩu mock |
| Khác | `fullstack.bundle` (33 MB) không được ignore, dễ bị `git add -A` đưa vào |

## Đăng nhập chậm 3-4,6 giây

| Trễ tới DB | Trung vị (10 lần, cục bộ) | Lượt truy vấn |
| --- | --- | --- |
| 0 ms | 976 ms | 8 |
| 100 ms | 1412 ms | 8 |

- `bcryptjs` cost 12: 387-403 ms mỗi lần so sánh; cost không quá cao, chỉ khoảng 10% của 3-4,6 giây.
- 8 lượt: `peekWindow`, `getLockSeconds`, tìm user, `clearKeys`, `BEGIN`, tìm phiên, tạo phiên, `COMMIT`. Không có N+1. Thừa: `clearKeys` chạy cả khi không có bộ đếm; `peekWindow` và `getLockSeconds` gộp được.
- Phần lớn thời gian là độ trễ mạng nhân số lượt. 3-4,6 giây tương ứng khoảng 300-500 ms mỗi lượt theo mô hình này, cao hơn mức thường gặp. Chưa xác nhận nguyên nhân (có thể gồm kết nối lại qua pooler); cần đo `SELECT 1` qua pooler.
- Đề xuất: đặt API cùng vùng với DB (lợi nhất), rồi giảm còn khoảng 5 lượt. PRD không có chỉ tiêu thời gian nên xếp Minor.

## Migration và điểm lệch ở handoff

**Migration: Đạt.** Quét `DROP`, `DELETE`, `TRUNCATE`, `RENAME` chỉ thấy `ALTER COLUMN device_id DROP NOT NULL`, được phép theo decisions 2026-11-07. Schema còn đủ `login_attempts`, `attempts`, `locked_until`, `sessions.device_id`, enum `Role`. RLS bật cho `auth_rate_limits`. Có hai câu `UPDATE` chuẩn hoá email về chữ thường, dừng có báo lỗi nếu trùng.

- **30 lần/15 phút/IP** (`otp.service.ts:15`): hợp lý, không xung đột AC, contract cho phép `rate-limited`. Con số do agent tự chọn, chưa có test riêng; cần ghi vào BR hoặc decisions.
- **404 dùng mã `validation`:** N12. Nên chốt ở contract trước slice Catalog.
- **Staff đăng nhập storefront về `/new-in`:** code đúng decisions 2026-11-07, đã kiểm thật, không có vòng chuyển trang. BR-AUTH-31, AC-79, `auth-login.md:11` chưa cập nhật (N19).

## Lỗi avatar do Thắng báo

- Đã sửa ở `b4337b7`.
- **Trên backend thật: đạt.** Đăng nhập bằng mã, bấm avatar, chờ 2,5 giây vẫn ở `/account/profile`, `/api/auth/me` còn phiên, tải lại vẫn ở đó, `/account/addresses`, `/orders`, `/vouchers` đều vào được.
- **Test có bắt được lỗi: có.** Tạm bỏ bản sửa ở `mock-account-api.ts`, `tests/auth-backend-user.spec.ts:26` fail: nhận `/auth/login?returnUrl=%2Faccount%2Fprofile`. Đã khôi phục bằng `git checkout`, `git status` sạch.

## Giao diện 320px

Đã xem screenshot: email, mã, mật khẩu (kèm lỗi), quên mật khẩu kèm quy tắc, đăng ký (email dài, đủ lỗi), đăng nhập admin (kèm lỗi).

- **Đạt:** `scrollWidth` 320/320 ở mọi màn đã đo, email dài xuống dòng, 2 cột Tên-Họ và 3 ô ngày sinh không bị cắt, lỗi không bị cắt. Cỡ chữ ô nhập ≥ 16px ở các màn đăng nhập và quên mật khẩu; nút gửi lại và hiện/ẩn mật khẩu không nằm trong danh sách dưới 44px. Link nhỏ xem N20.
- Ảnh full-page đăng ký có link "Đến nội dung chính" đè tiêu đề: đã kiểm, đây là hiệu ứng khi chụp full-page lúc trang đã cuộn (`fixed`, `top: -60px`), không phải lỗi.

## Ghi chú về cách kiểm

- Lần chạy Playwright đầu bị bỏ: QA chạy song song vòng lặp test backend làm máy quá tải, 20 test hết thời gian chờ. Đã dừng theo PID và chạy lại khi không có tải khác; số báo cáo là của lần chạy lại.
- Lệnh `npm test` đầu tiên của QA **thiếu biến ghi đè** trong khi `backend/.env` trỏ Supabase. Hệ thống quyền đã từ chối nên lệnh không chạy, không có gì bị ghi. Mọi lần sau đều trỏ `n2f_test` và `MAIL_MODE=dev-outbox`.
- `npm run typecheck` và `npm run build` của backend chạy không có biến ghi đè; hai lệnh này không kết nối DB.
- `n2f_dev` đã dọn user QA, còn 5 user như ban đầu; bảng `auth_rate_limits` cục bộ bị xoá nhiều lần khi đo. Không chạm Supabase, không gửi thư.
