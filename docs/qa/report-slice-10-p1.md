# Báo cáo QA Slice 10 (gói P1)

Nhánh `fullstack`, HEAD a5e1379 (2026-11-13). QA độc lập (qa-reviewer); orchestrator ghi file và bổ sung mục "Sau QA".

## 1. Kết luận
**Đạt ở các AC Must có test: 0 Blocker, 0 Major, 5 Minor.** AC có test và Pass: 47; Pass một phần: 1 (AC-P1-02); Chưa kiểm được: 1 (AC-P1-01); Fail: 0.

### Kết quả lệnh thật
| Lệnh | Kết quả |
|---|---|
| BE `npx tsc --noEmit` | Sạch |
| BE returns-guest / wishlist / recommendations / content-home / reviews / promo / collections | 24/24, 16/16, 16/16, 24/24, 31/31, 27/27, 8/8 |
| BE catalog / cart / quote-voucher / orders / migration | 32/32, 16/16, 15/15, 52/52, 5/5 (crash worker Windows 0xC0000409 chạy lại thì pass) |
| BE insights-audit | 6/7, T-AUD-01 đỏ, có từ trước (đỏ cả ở a354b24) |
| FE lint / build | Sạch / đạt |
| FE format:check | Fail 12 file (m-4) → đã sửa sau QA |
| Playwright Slice 10 (9 spec, desktop, cổng 4233) | 43/43 |
| Playwright toàn bộ desktop | QA chưa chạy xong (timeout của QA) → xem "Sau QA" |

## 2. Bảng AC
| Nhóm | AC | Kết quả | Bằng chứng |
|---|---|---|---|
| Nền | AC-P1-01 | Chưa kiểm được | Không test gắn mã; migration đã áp thật lên Supabase |
| Nền | AC-P1-02 | Pass một phần | 5 spec `*-http` pass; không test đổi từng cờ sang mock |
| Nền | AC-P1-03 | Pass | promo.test.ts:144-155, 456-470; content-home.test.ts:133-137; reviews.test.ts:464 |
| Nền | AC-P1-04 | Pass | reviews.test.ts:324 (lần 6 → 429 + Retry-After); wishlist.test.ts |
| A | AC-RET-60..66 | Pass | returns-guest.test.ts (24) + returns-guest.spec |
| B | AC-REV-01..08 | Pass | reviews.test.ts (31) + reviews-http.spec, admin-content.spec, nav-live.spec |
| C | AC-WISH-01..07 | Pass | wishlist.test.ts (16) + wishlist-http.spec |
| D | AC-REC-01..07 | Pass | recommendations.test.ts (16) + recommendations-http.spec |
| E | AC-MOM-01..03 | Pass | content-home.test.ts + home-content-http.spec |
| F | AC-PROMO-01..08 | Pass | promo.test.ts (27), quote-voucher, cart, orders + promotions-http.spec |
| G | AC-CMS-01..07 | Pass | content-home.test.ts, collections.test.ts + admin-content, collections, nav-live spec |

## 3. Bảo mật và nhất quán (không có Blocker/Major)
- Grant vãng lai chỉ cookie `n2f_oa` (băm, còn hạn); `n2f_sid` không mở được; thiếu/hết hạn 401; đơn lạ / người khác / thành viên đều 404 cùng phản hồi; rate limit theo grant + IP sau auth; `no-store`.
- Ảnh trả hàng `private, no-store`, `nosniff`; vãng lai chỉ xem ảnh của đơn thuộc grant.
- XSS: `href` trang chủ chặn `//`, `javascript:`, khoảng trắng, ký tự điều khiển; FE chỉ `routerLink`, không `innerHTML`/`bypassSecurity`; đánh giá hiển thị bằng nội suy.
- Quyền: `reviews.moderate` staff + admin; `content.edit`, `promotions.write` chỉ admin, kiểm trước khi đọc thân.
- Đánh giá công khai chỉ có tên dạng "Nguyễn V.", không email/SĐT/id.
- Đồng thời: wishlist `FOR UPDATE` dòng user; đánh giá UNIQUE (user, product).
- Giá hiệu lực một hàm `effectivePrice` cho catalog (lọc/sắp xếp/sale), giỏ, báo giá, đơn lưu giá lúc đặt.

## 4. Lỗi Minor
- **m-1 (BE, test):** chưa có test AC-P1-01 (migrate 2 lần, UNIQUE review/wishlist, RLS bảng p1_bundle). Rủi ro thấp.
- **m-2 (BE, test):** AC-P1-02/04 không test gắn mã; `admin-promotions.test.ts` chưa chạy lại → đã chạy sau QA.
- **m-3 (BE, hiệu năng):** khi có `maxPrice`, `sale=true` hoặc sắp theo giá, catalog tải mọi sản phẩm khớp lọc vào bộ nhớ rồi lọc/sắp ở TS. Chấp nhận ở quy mô đồ án; ghi backlog nếu catalog lớn.
- **m-4 (FE, convention):** format:check lỗi 12 file của a5e1379 → đã sửa sau QA.
- **m-5 (BE, nợ có sẵn):** insights-audit T-AUD-01 thiếu dòng `settings.updated`, đỏ từ trước Slice 10.

## 5. Sau QA (orchestrator)
- m-4: `prettier --write` 12 file, `format:check` sạch.
- m-2: `admin-promotions.test.ts` 12/12.
- Playwright toàn bộ desktop (cổng 4233): 314 pass, 1 skip, 4 fail. Chạy lại: `admin-login` returnUrl 12/12 pass; `admin.spec` 3 test đỏ do dev server nguội (chuyển hướng staff đúng nhưng > 5 giây, timeout 30 giây), không phải lỗi hành vi: guard `settings.staff` không đổi trong Slice 10. Đã nâng timeout trong `tests/admin.spec.ts`; "dashboard shows today" còn lúc đỏ khi chạy cả bộ, chạy riêng xanh. Đề xuất: tăng `expect.timeout` toàn cục hoặc chạy e2e trên bản build.
