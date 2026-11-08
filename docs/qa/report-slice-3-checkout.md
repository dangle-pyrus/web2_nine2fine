# Báo cáo QA Slice 3 Cart & Checkout

Ngày 2026-11-08. HEAD được kiểm: `294bc35`, cộng thay đổi chưa commit: đổi tên test 429 thành "AC-CHK-36 (FE part)" ở `frontend/tests/cart-checkout.spec.ts:492` và `docs/handoff.md` dòng 11. Người kiểm: qa-reviewer độc lập (sonnet). Orchestrator lưu file từ báo cáo trả về và đã kiểm lại m-1, m-4. Không sửa code, không ghi DB, không chạm Supabase. Số liệu backend do orchestrator đo trong ngày. Số liệu frontend do QA chạy lại.

## Kết luận

**Chưa đạt DoD.** Không có Blocker. Không thấy lỗi chức năng ở bộ test đã chạy: 262 test backend không có assertion fail, Playwright mock 81 pass / 0 fail.

Lý do chưa đạt:
- `npm test` backend chưa pass 3 lần liền do crash native M2. Cả 5/5 lần chạy đầy đủ đều crash, không có AssertionError.
- DoD "FE chạy `checkoutMode: http` với BE thật trên Supabase" chưa kiểm được. Bước 9 chạy trên Postgres cục bộ. Migration và seed Slice 3 chưa áp lên Supabase. Kéo theo AC-CHK-41 (Supabase) chưa kiểm được.
- 1 AC Must Fail vì chữ AC sai (AC-VOU-08), hành vi code đúng.
- 9 AC Must chưa kiểm được trọn vẹn.
- 2 AC Must hoãn theo Q2 (QR/SePay), không tính là Fail.

| Nhóm | Pass | Fail | KKĐ | Hoãn (Q2) |
| --- | --- | --- | --- | --- |
| AC-CART Must (19) | 14 | 0 | 5 | 0 |
| AC-CHK Must (39) | 33 | 0 | 4 | 2 |
| AC-VOU Must (15) | 14 | 1 (AC sai) | 0 | 0 |
| **Tổng Must (73)** | **61** | **1** | **9** | **2** |
| Should (4: CART-20, CHK-03, CHK-20, VOU-16) | 3 | 0 | 1 | 0 |

## Số liệu lệnh

| Lệnh | Kết quả |
| --- | --- |
| backend `npm run typecheck` | exit 0 (orchestrator) |
| backend `npm run build` | exit 0 (orchestrator) |
| backend `npm test` toàn bộ, 5 lần (DB cục bộ 54329, `MAIL_MODE=dev-outbox`) | Cả 5 lần crash worker `3221226505` (0xC0000409) ở file khác nhau: quote-voucher, catalog ×2, quote-voucher, lookup-codes. Không AssertionError. **Không đạt "3 lần pass liền"** |
| backend chạy từng file (mỗi file một tiến trình) | 17/17 file pass đầy đủ ít nhất một lần, 262 test, 0 assertion fail (cart 16, catalog-seed 7, catalog 32, checkout-seed 3, concurrency 7, errors-slice3 7, latency 1, lookup-codes 26, migration 5, not-found 1, orders-lifecycle 16, orders 46, pricing 14, quote-voucher 15, register-login 36, session-security 27, text 3). Crash: catalog 1/4 lần, lookup-codes 3/4 lần |
| frontend `npm run lint` | exit 0, không cảnh báo (QA chạy) |
| frontend `npm run format:check` | "All matched files use Prettier code style" (QA chạy) |
| frontend `npm run build` | thành công. **Initial total 577,81 kB** (raw), 159,64 kB nén. Dưới ngưỡng 600 kB, không cảnh báo budget (QA chạy) |
| Playwright `cart-checkout`, `checkout`, `account`, `commerce`, `operations` (`--trace off`, e2e mock) | **81 pass, 0 fail, 1 skip**, 7,9 phút (QA chạy) |
| Playwright toàn bộ mock (frontend-dev báo, commit 294bc35) | 226 test: 219 pass, 0 fail, 7 skip. QA không chạy lại toàn bộ |
| Tích hợp thật bước 9 | Theo `docs/handoff.md` (Edge qua Playwright Node, BE + Postgres cục bộ). QA không chạy lại, dùng làm bằng chứng gián tiếp, ghi "S9" |

Quy ước bằng chứng:
- "B" là test backend, ghi `backend/test/<file>.test.ts` và tên test.
- "F" là Playwright mock, ghi `frontend/tests/cart-checkout.spec.ts` nếu không nêu file khác.
- "S9" là bước 9 tích hợp thật trong handoff.
- Test backend đặt tên theo "T-xxx", không theo mã AC. Ánh xạ AC sang T-xxx do QA đối chiếu nội dung.

## Rà soát commit 294bc35

1. **Adapter HTTP trong build thường: đạt.**
   - `frontend/src/app/core/storefront-adapters.ts` gắn `HttpCatalogApi`, `HttpCheckoutApi`, `HttpCartApi`, `HttpOrdersApi`, `HttpAuthApi`. `PAYMENT_SIMULATOR` là `null`.
   - `app.config.ts:123` trải `storefrontAdapterProviders`.
   - `angular.json` cấu hình `e2e` thay `api-config.ts` và `storefront-adapters.ts` bằng bản `.e2e.ts` (mock).
   - `build` mặc định là `production`. `start` và `start:local` không dùng `e2e`. Playwright dùng `start:e2e`.
2. **Account (ngoài đơn) và Admin vẫn mock: đạt.**
   - `app.config.ts` ~dòng 145: `ACCOUNT_API`, `STORE_SETTINGS_API`, `NEWSLETTER_API` theo `mode` (= `mock`).
   - `admin-providers.ts` theo `mode`, riêng admin auth theo `authMode`. Khớp BR-CHK-32.
3. **`authMode`/`catalogMode`/`checkoutMode` KHÔNG phải nhãn chết.** Vẫn được đọc để rẽ nhánh hành vi: `cart-state.ts:150,164,464,646`, `order-detail-page.ts:174`, `profile-page.ts:316`, `verification-code-field.ts:92`, `product-page.ts:69`, `mocks/demo-seed/index.ts:107`. Chỉ việc chọn adapter đã chuyển sang `storefront-adapters.ts`. Hệ quả: hai nơi cấu hình phải giữ khớp tay, và chú thích "only labels" ở `api-config.ts:21` gây hiểu nhầm (m-4).
4. **"Build thường không còn mock/demo trong chunk initial" (commit message): không đúng hoàn toàn.** Adapter mock giỏ/catalog/checkout/orders đã ra khỏi `main-*.js`, nhưng chunk vẫn chứa dữ liệu demo tài khoản (`demo@nine2fine.vn`, mật khẩu mock, mã demo, địa chỉ demo) do `MockAccountApi` vẫn bind trong `app.config.ts` (Account mock theo DoD) và `verification-code-field.ts:19` import `mocks/accounts` (m-1).
5. **`checkout-page.ts` (prefill): đạt.** Giá trị đã nhập hoặc nháp thắng hồ sơ thành viên; địa chỉ đã lưu không đè khi đã gõ. Khớp AC-CART-16. `checkout.spec.ts` "member checkout" pass, không hồi quy.
6. **`cart-state.ts` (toast gộp giỏ): đạt, kèm rủi ro chưa kiểm.** Toast hiện khi không ở `/cart` (regex trên `router.url`); F AC-CART-13 xác nhận đúng 1 toast. Rủi ro: khi `returnUrl=/cart`, `afterMerge` chạy lúc URL còn là `/auth/login...`, toast và câu trong giỏ có thể cùng hiện (m-2).
7. Test mới AC-CART-13..18 và 429 đều pass trong lần chạy QA. Cờ `sessionRevoked` ở `mock-auth-api.ts:198` chỉ chạm mock.

## Bảng AC Must

| AC | Kết quả | Bằng chứng |
| --- | --- | --- |
| CART-01 | Pass | `commerce.spec.ts:37` "variant validation, cart limits..."; B cart "thêm: cộng dồn, cắt 5" |
| CART-02 | Pass | F "AC-CART-02/04"; B cart "cắt theo tồn có notice stock-limit" |
| CART-03 | KKĐ | Không có test riêng cho "−" ở số lượng 1 xoá dòng |
| CART-04 | Pass | F "AC-CART-02/04"; B cart "dòng thứ 31 -> 422 variantId" |
| CART-05 | KKĐ | API có: B quote-voucher T-QUO-03, orders "tổng quantity > 20 -> 422 items". UI khoá Thanh toán và câu "Mỗi đơn tối đa 20 sản phẩm." chưa có test |
| CART-06 | KKĐ | API có: B cart T-CART-02 (Đen/S 4 + Đen/M 3 -> 5, notice merged adjustedTo 5). UI câu "Đã gộp..." và khoá size hết hàng chưa có test |
| CART-07 | Pass | `commerce.spec.ts:183` "selection mode ... checks out only those"; B orders T-CART-08 |
| CART-08 | Pass | F "AC-CART-08"; B cart T-CART-03 |
| CART-09 | Pass | F "AC-CART-09"; B cart T-CART-03 (giá đổi, tồn giảm, DRAFT, id lạ) |
| CART-10 | KKĐ | F "AC-CART-10" pass phần chặn mạng và Thử lại. "+ 5 lần trong 1 giây -> 1 request" (debounce 300 ms) chưa có test |
| CART-11 | Pass | B cart T-CART-04 (hai thiết bị cùng thấy 2 dòng); S9 khách không gọi API giỏ |
| CART-12 | KKĐ | B cart T-CART-04 (31 ngày rỗng, 29 ngày còn) chỉ cho giỏ tài khoản. Hết hạn giỏ khách trên máy chưa có bằng chứng |
| CART-13 | Pass | F "AC-CART-13"; B cart T-CART-05; S9 |
| CART-14 | Pass | F "AC-CART-14"; B cart T-CART-06 |
| CART-15 | Pass | F "AC-CART-15"; B cart T-CART-07; S9 "không nhân đôi sau tải lại". Race vài chục ms còn mở (m-3) |
| CART-16 | Pass | F "AC-CART-16" |
| CART-17 | Pass | F "AC-CART-17" |
| CART-18 | Pass | F "AC-CART-18" (cờ `sessionRevoked`) |
| CART-19 | Pass | F "AC-CART-19" |
| CHK-01 | Pass | `operations.spec.ts:58` guest checkout; S9 đơn khách N2F2611081801 |
| CHK-02 | Pass | B orders T-ORD-01 ("phiên sai không 401"); S9 `n2f_sid` hỏng |
| CHK-04 | Pass | B orders T-ORD-02/03 (`it.each` 17 ca); F "AC-CHK-04/09". Thiếu ca email 101 ký tự và `84912345678` (m-7) |
| CHK-05 | KKĐ | B: email sai và T-ORD-12 (đơn khách trùng email không vào lịch sử) pass. Gợi ý đăng nhập ở FE chưa có test |
| CHK-06 | Pass | B orders T-ORD-03 (`invalid-address`), quote-voucher T-LOC-01, T-QUO-05 (`addressRequired`) |
| CHK-07 | Pass | B orders "hoá đơn công ty hợp lệ" cùng 2 ca MST sai / thiếu tên công ty; `operations.spec.ts:58` |
| CHK-08 | Pass | B orders ca "chưa tick điều khoản", "thiếu điều khoản" -> `acceptedTerms` |
| CHK-09 | Pass | F "AC-CHK-04/09" |
| CHK-10 | Pass | B quote-voucher T-QUO-01 |
| CHK-11 | Pass | B pricing T-CHK-03 (4 ca, gồm lùi theo ngày lễ) |
| CHK-12 | Pass | B orders T-ORD-04 (tăng và giảm giá); F "AC-CHK-12"; S9 `price-changed` |
| CHK-13 | Pass | B orders T-ORD-05; F "AC-CHK-13" |
| CHK-14 | Pass | B orders T-ORD-01 (tồn trừ); S9 (tồn 4 -> 5 sau huỷ). Độ trễ PDP ≤ 30 giây dựa vào cache catalog Slice 2 |
| CHK-15 | Pass | B concurrency T-CON-01 (20 lần) |
| CHK-16 | Pass | B orders-lifecycle T-CAN-01 (huỷ lần 2 -> 409, tồn không đổi); S9 |
| CHK-17 | Pass | B orders T-ORD-06; S9 "lỗi mạng rồi Thử lại không tạo đơn thứ hai" |
| CHK-18 | Pass | B orders T-ORD-06 (khác nội dung, thiếu / sai khoá, sau 25 giờ); concurrency T-CON-03 |
| CHK-19 | Pass | F "AC-CHK-19/26/30"; S9 bấm đôi = 1 đơn |
| CHK-21 | Pass | B orders T-ORD-08 (1.000 mã) |
| CHK-22 | Pass | B orders T-ORD-09 |
| CHK-23 | Pass | B orders T-ORD-10 (> 5.000.000 và SĐT bị chặn -> 422 `paymentMethod`) |
| CHK-24 | Pass | B orders T-ORD-10; quote-voucher T-QUO-04 |
| CHK-25 | Hoãn (Q2) | Nhánh tự chuyển sang chuyển khoản cần QR. QR tắt: B quote-voucher T-QUO-04 khoá phương thức. Câu "kèm hotline" ở FE chưa có test |
| CHK-26 | Pass | B orders T-ORD-01, T-ORD-11; F "AC-CHK-19/26/30" |
| CHK-27 | Hoãn (Q2) | Lát 3.8 QR/SePay chưa làm theo Q2. Có: B orders-lifecycle "payment (QR chưa bật)" (404), T-ORD-10 "QR tắt -> 422", T-CAN-02 hết hạn thanh toán |
| CHK-28 | Pass | B migration "trạng thái ... sai bị từ chối". Ánh xạ `to_receive` -> "Đang vận chuyển" ở FE chỉ qua mock |
| CHK-29 | Pass | B orders-lifecycle T-CAN-01 (to_pay, to_ship huỷ được; to_receive 409) |
| CHK-30 | Pass | F "AC-CHK-19/26/30"; B orders T-ORD-12; S9 |
| CHK-31 | Pass | B orders-lifecycle T-LKP-01..03; `checkout.spec.ts:82`; S9 |
| CHK-32 | Pass | B orders-lifecycle T-LST-01 (12 đơn, 2 trang, đơn người khác 404); S9 |
| CHK-33 | Pass | B T-LST-01 (phiên thu hồi -> 401, đơn không đổi); S9 `n2f_sid` hỏng -> `/auth/login?returnUrl=...`; F "AC-CART-18" (giỏ không mất khi thu hồi phiên). Không có E2E tự động trọn luồng ở chế độ http. Chấp nhận cho AC-AUTH-68 |
| CHK-34 | KKĐ | Gmail thật chưa gửi (luôn `dev-outbox`). B T-MAIL-01 kiểm nội dung, câu chống lừa đảo, tổng khớp; S9 email khớp tổng. Cần Thắng chạy bản thật |
| CHK-35 | Pass | B orders T-MAIL-02 (201, 3 lần thử, báo CSKH không kèm email khách) |
| CHK-36 | Pass | B T-RL-01 (quote 121/60 giây, đặt 11/10 phút, tra cứu 11/15 phút); F "AC-CHK-36 (FE part)" |
| CHK-37 | KKĐ | Mã lỗi và không lộ stack: B errors-slice3 T-ERR-01, orders T-ERR-01. Chưa gây "tắt DB". Chưa kiểm câu FE cho từng lỗi |
| CHK-38 | Pass | S9 (lỗi mạng, Thử lại cùng khoá); B T-ORD-06 |
| CHK-39 | Pass | S9 (cart, checkout, đặt, đơn qua API thật). QA đọc code: `ACCOUNT_API` theo `mode` mock nên Profile vẫn mock |
| CHK-40 | Pass | QA chạy `checkout`, `account`, `operations`, `commerce` (mock): 0 fail; frontend-dev: 219 pass toàn bộ. Adapter mock không gọi `/api` |
| CHK-41 | KKĐ | Cục bộ: B migration (chỉ cộng thêm, RLS bật mọi bảng mới), checkout-seed (chạy lại không trùng, không đặt lại lượt đã dùng). Chưa chạy `migrate deploy` 2 lần trên Supabase (chưa áp) |
| VOU-01 | Pass | B pricing "AC-VOU-01", quote-voucher T-VOU-01, orders T-VOU-08/01 (332.000); F "AC-VOU-01/02/06/09" |
| VOU-02 | Pass | B quote-voucher T-VOU-02; F "AC-VOU-01/02/06/09" |
| VOU-03 | Pass | B quote-voucher T-VOU-02 ("lý do đúng thứ tự") |
| VOU-04 | Pass | B quote-voucher T-VOU-03/05 |
| VOU-05 | Pass | B quote-voucher T-VOU-03/05; orders "mã đơn đầu tiên dùng lần hai" |
| VOU-06 | Pass | B quote-voucher T-VOU-04; F "AC-VOU-01/02/06/09" |
| VOU-07 | Pass | B pricing "AC-VOU-07" |
| VOU-08 | **Fail (AC sai)** | Hành vi đúng. B pricing "ví dụ AC-VOU-08": 390.000 + 550.000, giảm 141.000 -> 58.500 + 82.500, chia hết, dư 0. B pricing "có dư ... dư vào dòng 250.000". B orders T-VOU-08: tổng = 141.000. AC viết "dòng 550.000 nhận phần dư" nên không kiểm được đúng chữ. PO sửa AC |
| VOU-09 | Pass | F "AC-VOU-01/02/06/09" |
| VOU-10 | Pass | B quote-voucher T-VOU-05 (gỡ mã khi đổi giỏ, bỏ phiên) |
| VOU-11 | Pass | B quote-voucher T-VOU-06 (10 sai -> lần 11 bị 429, 9 lần chưa khoá); F "AC-VOU-11" |
| VOU-12 | Pass | B orders T-VOU-07; F "AC-VOU-12" |
| VOU-13 | Pass | B concurrency T-CON-02, T-CON-04 |
| VOU-14 | Pass | B orders T-VOU-09 |
| VOU-15 | Pass | B orders-lifecycle T-VOU-10 |

## AC Should

| AC | Kết quả | Bằng chứng |
| --- | --- | --- |
| CART-20 | Pass (làm) | F "AC-CART-20" |
| CHK-03 | KKĐ | Nháp form chỉ kiểm gián tiếp qua F "AC-CART-16". Chưa có test 25 giờ, tải lại, sau đặt |
| CHK-20 | Pass (làm, BE) | B orders T-ORD-07 (`possible-duplicate` + `confirmDuplicate`, sau 11 phút không hỏi). Hộp thoại FE chưa có test |
| VOU-16 | Pass (làm) | B quote-voucher "T-VOU-11 (Should)" |

## Đối chiếu Định nghĩa xong

| Mục | Kết quả | Ghi chú |
| --- | --- | --- |
| Mọi AC Must pass có bằng chứng | Chưa đạt | 61/73 pass; 1 Fail (AC sai), 9 KKĐ, 2 hoãn Q2 |
| Lệnh kiểm tra đều pass | Chưa đạt | lint, format, build, typecheck pass; `npm test` crash M2, không có 3 lần liền |
| Công thức tổng nhất quán | Đạt | Server tính. B orders T-ORD-01 (công thức), T-MAIL-01 (email khớp tổng). S9: 390.000 − 58.000 + 30.000 − 30.000 = 332.000, khớp ở checkout, trang thành công, email, chi tiết đơn |
| Backlog 2.14 (AC-CHK-13..16) | Đạt | CHK-13, 14, 15, 16 đều Pass |
| AC-AUTH-68 bằng AC-CHK-33 | Đạt (kèm ghi chú) | CHK-33 Pass bằng B + S9, chưa có E2E tự động |
| `openapi.yaml` khớp code | Đạt | Handoff ghi 6 đề xuất đổi contract, đều chờ duyệt. QA không phát hiện lệch ngoài danh sách |
| FE `checkoutMode: http` với BE thật trên Supabase | Chưa đạt | Mới kiểm trên Postgres cục bộ; Supabase chưa áp migration/seed Slice 3 |
| Account (trừ đơn) và Admin vẫn mock; Playwright mock pass nguyên | Đạt | Rà soát mục 2; 81 pass, 0 fail (5 file); 219 pass toàn bộ theo frontend-dev |
| Ghi handoff, decisions | Đạt | handoff có bước 7-9, sau bước 9 và đề xuất contract; decisions có dòng Slice 3 BE |
| Commit theo bước, không push | Đạt | Nhánh `fullstack` |

## Lỗi

### Blocker
Không có.

### Major
- **M-1. Bộ test backend crash M2, chưa 3 lần pass liền.**
  - Bước: chạy `npm test` toàn bộ (DB cục bộ).
  - Kỳ vọng: pass 3 lần liền.
  - Thực tế: 5/5 lần crash `0xC0000409`, không AssertionError. Từng file đều pass.
  - Ghi chú: M2 đã được cho phép không chặn ở Slice 2. DoD Slice 3 vẫn ghi lệnh phải pass.
  - Chịu trách nhiệm: backend-dev (nguyên nhân Windows/Node 24 chưa rõ). Orchestrator ghi chấp nhận vào `decisions.md` nếu Thắng đồng ý.
- **M-2. Chưa tích hợp thật trên Supabase.**
  - Kỳ vọng: DoD "FE chạy `checkoutMode: http` với BE thật trên Supabase".
  - Thực tế: migration `20261107000500_cart_checkout_schema` và `seed:checkout` chưa áp lên Supabase. Bước 9 dùng Postgres cục bộ. AC-CHK-41 và AC-CHK-34 (Gmail thật) vì thế chưa kiểm.
  - Chịu trách nhiệm: Thắng xác nhận rồi áp (`migrate deploy` hai lần, seed bằng `DIRECT_URL`). backend-dev hỗ trợ.

### Minor
- **m-1. Dữ liệu demo tài khoản nằm trong initial chunk của build thường.**
  - Bước: `npm run build`, tìm `demo@nine2fine.vn` và mật khẩu mock trong `dist/nine2fine/browser/main-*.js`.
  - Thực tế: có (orchestrator kiểm lại: khớp). Do `MockAccountApi` bind trong `app.config.ts` và `verification-code-field.ts:19` import `mocks/accounts`. Commit message 294bc35 nói ngược lại.
  - Rủi ro: không lộ dữ liệu thật; chỉ là dữ liệu mock.
  - Chịu trách nhiệm: frontend-dev (tách mock Account khỏi initial khi Account lên HTTP). PO xác nhận chấp nhận đến lúc đó.
- **m-2. Thông báo gộp giỏ có thể hiện 2 lần** khi đăng nhập với `returnUrl=/cart` (suy từ code: `afterMerge` kiểm `router.url` lúc còn ở `/auth/login`). QA chưa tái hiện. Chịu trách nhiệm: frontend-dev.
- **m-3. Tải lại trong vài chục ms sau khi thêm hàng (đã đăng nhập) có thể gộp lặp dòng đó** (baseline chưa lưu). Ảnh hưởng bị chặn bởi hạn mức 5/dòng. Chịu trách nhiệm: frontend-dev.
- **m-4. Hai nơi cấu hình adapter và chú thích sai.** `api-config.ts:21` ghi `authMode/catalogMode/checkoutMode` "only labels", nhưng còn nhiều chỗ đọc (rà soát mục 3; orchestrator kiểm lại `cart-state.ts:150,164,464`: khớp). `storefront-adapters.ts` và `.e2e.ts` phải sửa đồng thời. Chịu trách nhiệm: frontend-dev.
- **m-5. AC-VOU-08 chữ sai** (ví dụ chia hết, không có phần dư). Chịu trách nhiệm: product-owner.
- **m-6. Dữ liệu ngày nghỉ.** `backend/prisma/seed-data/holidays-vn.json`: 2027 chỉ ước tính (Tết 5-9/2/2027), thiếu Giỗ Tổ 2027. Ảnh hưởng AC-CHK-11 cho đơn năm 2027. Chịu trách nhiệm: Thắng đối chiếu văn bản chính thức trước go-live.
- **m-7. Thiếu ca test:** email 101 ký tự và SĐT `84912345678` (AC-CHK-04); "+ 5 lần trong 1 giây" (AC-CART-10); nháp 25 giờ (AC-CHK-03 Should); hộp thoại đơn trùng ở FE (AC-CHK-20 Should).

## Việc còn lại

1. Thắng xác nhận rồi áp migration và seed Slice 3 lên Supabase (`migrate deploy` hai lần), kiểm lại luồng đặt hàng với BE trỏ Supabase, gửi 1 đơn có email Gmail thật (AC-CHK-34, AC-CHK-41).
2. Sáu đề xuất đổi contract trong `docs/handoff.md` còn mở, chờ duyệt (không tính là lỗi).
3. Q1-Q4 đang chạy theo giả định. Lát 3.8 QR/SePay chưa làm, chờ Thắng (Q2); khi làm xong chạy lại AC-CHK-25, AC-CHK-27.
4. Xử lý M2, hoặc ghi chấp nhận trong `decisions.md`, để đóng DoD lệnh kiểm tra.
5. Sửa m-1 đến m-5, bổ sung test m-7. QA vòng 2 cho các AC KKĐ: CART-03, 05, 06, 10, 12; CHK-05, 37; Should CHK-03.
