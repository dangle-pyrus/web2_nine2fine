# Báo cáo QA Slice 2 Catalog

Ngày 2026-11-07. HEAD được kiểm: `8ab51d8`. Người kiểm: qa-reviewer (haiku). Orchestrator lưu file từ báo cáo trả về. Không sửa code, không ghi DB.

## Kết luận

**Chưa đạt DoD.** Không có Blocker. API live trên Supabase khớp contract ở mọi kiểm tra đã chạy.

Lý do chưa đạt:
- 1 AC Fail do chính AC viết sai (AC-18).
- 18/50 AC Must chưa kiểm được, chủ yếu là phần UI chưa chạy ở chế độ http.
- Bộ test backend chưa pass 3 lần liền do crash M2.
- 1 lỗi Major ở FE (BR-CAT-14).

| AC-CAT | Pass | Fail | Không kiểm được (KKĐ) |
| --- | --- | --- | --- |
| Must (50) | 31 | 1 | 18 |
| Should (3: 41, 42, 52) | 0 | 0 | 3 |

## Số liệu lệnh

| Lệnh | Kết quả |
| --- | --- |
| backend `npm run typecheck` | exit 0 |
| backend `npm run build` | QA bị hệ thống quyền từ chối; `tsc -p tsconfig.build.json --noEmit` exit 0. Orchestrator chạy lại `npm run build`: exit 0 |
| backend `npm test` (DB cục bộ 54329, `MAIL_MODE=dev-outbox`), 5 lần | Lần 1 và 3: 133/133 pass. Lần 2: 124/133, 1 error, chưa xác định. Lần 4 và 5: worker exit `3221226505`, không có AssertionError. Crash 3/5, không có 3 lần pass liền |
| frontend `npm run lint`, `format:check`, `build` | exit 0 |
| Playwright `tests/catalog.spec.ts` (e2e mock) | 12/12 pass (6 test × desktop/mobile); đây là spec duy nhất đổi |
| API live (Supabase qua backend :4000) | khoảng 106 request, chỉ GET, không gặp 429 |

Log: `scratchpad\qa\test-run4.log`, `test-run5.log`. Script: `scratchpad\qa\api-check.mjs`, `all8.mjs`, `final-check.mjs` (scratchpad của phiên điều phối).

## Bảng AC Must

"T-CAT-xx" là test backend đã pass ở lần chạy 1 và 3. "live" là gọi API thật trên Supabase.

| AC | Kết quả | Bằng chứng |
| --- | --- | --- |
| 01 | Pass | 8 slug trả 200, giá khớp bảng; after-hours giá gạch 1.090.000 > 890.000 |
| 02, 03 | Pass | T-CAT-02, T-CAT-03 |
| 04 | Pass | live: 64 biến thể, 64 sku duy nhất, hex và size hợp lệ |
| 05 | Pass | T-CAT-05 |
| 06 | Pass | live: tồn 0 → OUT, 5 → LOW, 6 → IN; T-CAT-06 |
| 07 | KKĐ | API đúng (Đen S = 5, Xám S = 6, XL = 0); UI "Chỉ còn 5" và nút vô hiệu chưa chạy |
| 08 | Pass | 8 sản phẩm, 64 biến thể, 4 bảng size, khớp `products.ts`; T-CAT-08 |
| 09, 10 | Pass | T-CAT-09, T-CAT-10 |
| 11 | Pass | live: nam 5 (không có after-hours), nữ 6 |
| 12 | KKĐ | API total 1 đúng; UI `/shop/dresses` chưa chạy |
| 13 | Pass | live: event 3, có after-hours |
| 14 | KKĐ | API 8 / 0 / 8 đúng; UI trạng thái rỗng chưa chạy |
| 15 | Pass | live 2 / 3 / 1 / 8 |
| 16 | Pass | T-CAT-16 |
| 17 | Pass | live: `category=xyz` → 200, total 0; `maxPrice` -5, abc, 1.5 → 422 field `maxPrice` |
| 18 | **Fail (AC sai)** | live: nữ + Đỏ + ≤ 1.000.000 + sort → 2 sản phẩm (after-hours-dress và off-duty-top 390.000, cũng Đỏ, nữ). AC ghi chỉ after-hours-dress. API đúng BR-06, AC sai so với seed |
| 19 | Pass | live: asc và desc đúng sản phẩm đầu và cuối |
| 20 | Pass | live: bestselling đầu là nine-to-fine, newest đầu là the-straight-trousers; T-CAT-20 |
| 21 | KKĐ | API featured đúng, `sort=hot` → 422 field `sort`; FE chuẩn hoá `/shop?sort=hot` chưa chạy |
| 22 | Pass | live 3/3/2, gộp đủ 8 sản phẩm không trùng, đúng thứ tự giá |
| 23 | Pass | live: `page=4` → [] total 8; mặc định trả 8, limit 24 |
| 24 | Pass | live: `limit` 0/49/abc → 422 `limit`; `page` 0/1.5 → 422 `page`; `limit=48` hợp lệ |
| 25 | KKĐ | API 200 với slug chuẩn; FE `replaceUrl` chưa kiểm trên trình duyệt |
| 26 | Pass | live 404 `not-found`; Playwright AC-CAT-26 pass (mock) |
| 27 | Pass | live: 300 ký tự, `../etc`, `a'b`, `%00`, `%` → 404 `not-found` |
| 28 | KKĐ | Cần ngắt mạng, chưa chạy |
| 29 | Pass | live 8/8 không null; T-CAT-29 |
| 30 | KKĐ | Cần đổi giá trong DB rồi chờ; header `max-age=10` đúng |
| 31 | Pass | live: 4 bảng, mỗi bảng S/M/L/XL, 2 mảng cột; T-CAT-31 |
| 32 | KKĐ | live `shoes` → 404; UI khi offline chưa chạy |
| 33 | Pass | live: BLAZER, blazer, có khoảng trắng cho cùng kết quả |
| 34 | Pass | live: `dam` và `đầm` → after-hours; "blazer everyday" → blazer |
| 35 | Pass | live: `%`, `_`, `\`, `'`, chuỗi SQLi → 200 total 0; bảng vẫn 8 sản phẩm |
| 36 | Pass | live: rỗng → 8; 100 ký tự → 200; 101 ký tự → 422 field `q` |
| 37 | Pass | live: total 0, sau đó total 1 |
| 38 | KKĐ | Playwright mock khẳng định tiêu đề, (0), trạng thái rỗng, không có "Thử lại"; liên kết xoá tìm kiếm / về `/shop` chưa assert |
| 39 | KKĐ | API `q=bl&limit=5` → total 1 đúng; UI 250 ms, "Xem tất cả", số request chưa kiểm |
| 40 | KKĐ | Cần mạng chậm hoặc ngắt, chưa chạy |
| 43 | KKĐ | live reviews `[]` 200; T-CAT-43. UI ẩn đánh giá/điểm sao/form chưa kiểm (gating ở `product-page.html:144`) |
| 44 | KKĐ | live: cookie hỏng → 200, không có `Set-Cookie`; T-CAT-44. UI header thành khách chưa chạy; Playwright AC-CAT-44 chạy mock, không gọi API |
| 45 | KKĐ | live không có trường người dùng; UI không chuyển hướng chưa chạy |
| 46 | Pass | T-CAT-45/46; methodGate trả 404 (`catalog.routes.ts:12`); live không gửi POST/PUT/DELETE theo chỉ thị |
| 47 | KKĐ | T-CAT-47 pass (120/60s, `retryAfter`, bộ đếm tách khỏi auth); live không gửi request thứ 121; UI "lỗi có thử lại" chưa kiểm |
| 48 | Pass | T-CAT-48 (`validation`, `not-found`, `unavailable` khi DB lỗi giả, `no-store`) và live |
| 49 | KKĐ | Cần offline và "Thử lại" trên trình duyệt |
| 50 | KKĐ | `api-config.ts` đúng (`mode` mock, `catalogMode` http); bước đổi giá rồi chạy FE http chưa làm |
| 51 | KKĐ | Chỉ chạy `catalog.spec.ts` 12/12; bộ mock đầy đủ chưa chạy, chưa có số baseline |
| 53 | Pass | T-CAT-53; migration chỉ CREATE / ADD CONSTRAINT / INDEX (không DROP, TRUNCATE, DELETE, ALTER COLUMN); chưa chạy `migrate deploy` lặp lại trên live |

AC Should:
- 41 KKĐ: T-CAT-41 pass; FE "Xem thêm" với 30 sản phẩm chưa chạy.
- 42 KKĐ: live `ids` 3 sản phẩm thật + 1 id giả → total 3; T-CAT-42 pass; `/wishlist` chưa chạy.
- 52 KKĐ: chưa có 100 sản phẩm; số đo phía client 2–4 ms không đáng tin, chưa đo ở máy chủ.

## Lỗi

**Blocker:** không có.

**Major**

| # | Phụ trách | Lỗi | Bằng chứng / tái hiện |
| --- | --- | --- | --- |
| M1 | frontend-dev | BR-CAT-14: ô tìm kiếm không giới hạn 100 ký tự | `search-panel.html:25-33` không có `maxlength`; `search-panel.ts:99` FormControl không có validator. Gõ 101 ký tự: kỳ vọng dừng ở 100; thực tế (suy từ code và API 422 đã xác nhận) request `q` 101 ký tự → 422 → trạng thái lỗi. Chưa tái hiện trên trình duyệt |
| M2 | backend-dev | Bộ test backend không ổn định (`0xC0000409`, lỗi M2 đã biết), chặn DoD | 5 lần chạy, 3 lần crash, không có lần pass liền. Tái hiện: chạy lặp `npm test` với ghi đè DB như trên |

**Minor**

| # | Phụ trách | Lỗi |
| --- | --- | --- |
| m1 | product-owner | AC-CAT-18: sửa phần Then cho đúng seed (thêm off-duty-top) hoặc đổi bộ lọc |
| m2 | backend-dev | `search_text` là cột dẫn xuất, chỉ gán lúc seed (`seed-catalog.ts:109`). Sửa `name`/`type_label` bằng SQL sẽ không cập nhật tìm kiếm; không có trigger hay ràng buộc |
| m3 | frontend-dev | Wishlist cắt lặng lẽ còn 48 mục (`catalog-page.ts:153`, `slice(0, WISHLIST_LIMIT)`). BR-16 giới hạn 48 id mỗi request, không giới hạn số mục yêu thích |
| m4 | frontend-dev | `maxPrice` không nguyên (ví dụ 1.5) vẫn được gửi (`catalog-page.ts:140`), API trả 422, UI hiện lỗi. Nên bỏ qua tham số không hợp lệ |
| m5 | frontend-dev | `catalog.spec.ts` chạy e2e mock nên không kiểm được chế độ http; test "AC-CAT-44" và "AC-CAT-41" không chạm API hay 30 sản phẩm |
| m6 | backend-dev | Rate limit dùng `req.ip` và bộ đếm RAM theo tiến trình (`catalog-rate-limit.ts:29`); `TRUST_PROXY` mặc định false (`env.ts:22`). Sau reverse proxy mọi khách chung một IP và bị chặn (BR-19). Ghi vào checklist deploy |
| m7 | backend-dev | `getSizeChart` và `toSizeChartDto` trả `unknown` (`catalog.service.ts:85`), kiểu lỏng |
| m8 | orchestrator | Đã xác nhận (truy vấn chỉ đọc): Supabase có 6 user = 5 user lúc seed Slice 1 + 1 tài khoản Thắng tự đăng ký khi thử thật. Không phải lỗi. 8 sản phẩm, 64 biến thể |

## Bảo mật và sạch code

- Không có injection: `q` chứa chuỗi SQLi và ký tự LIKE đều an toàn, LIKE được escape.
- Phản hồi không có trường người dùng. Lỗi không lộ stack hay SQL.
- RLS bật cho 4 bảng catalog.
- Diff không có secret hay TODO mới; `console.log` chỉ nằm trong script CLI.

## Việc cần để đạt DoD

1. Sửa M1.
2. PO sửa AC-18.
3. Backend xử lý M2.
4. Chạy UI ở cấu hình http cho các AC chưa kiểm được.
5. Đo p95 ở máy chủ (AC-52).
