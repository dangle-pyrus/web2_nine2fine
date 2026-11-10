# QA Slice 6 — Admin kho & sản phẩm (vòng 1)

HEAD cbf31a8, kiểm 2026-11-11 (qa-reviewer; orchestrator lưu file). Không sửa code, không chạm Supabase.

## 1. Kết luận
- Blocker 0, Major 1 (M-1), Minor 7. Chưa đạt DoD.
- AC: 48. Pass 46, Fail 1 (AC-INV-39, Should), chưa kiểm được 1 (AC-INV-09 phần Supabase). Must 45: 44 Pass, 1 chưa kiểm. Should 3: 2 Pass, 1 Fail.
- Đạt có điều kiện sau khi sửa M-1 và xử lý AC-INV-39; phần Supabase (S6-Q1, áp migration) là việc của Thắng (lát 6.8).

## 2. Số liệu lệnh
| Lệnh | Kết quả |
| --- | --- |
| BE `npm run typecheck` | exit 0 |
| BE 5 file test Slice 6 (admin-products, admin-media, admin-inventory, admin-promotions, admin-catalog-migration) | 74/74 pass |
| BE `npm test` toàn bộ (orchestrator) | 29/29 file pass (2 file crash M2, chạy lại riêng pass) |
| FE lint / build | exit 0; initial 545,78 kB |
| FE format:check | Fail 9 file có từ Slice 3–5, ngoài diff Slice 6 (m-7) |
| Playwright toàn bộ (qa-runner) | 411 pass, 9 fail, 8 skip. `admin-catalog.spec.ts` desktop 25/25, mobile 24 + 1 skip có chủ đích. 9 fail ngoài Slice 6: AC-CART-18, home:56 (flaky đã biết), commerce:37, :183, operations:58, :103 |

## 3. AC
Bằng chứng: B = test BE, F = `frontend/tests/admin-catalog.spec.ts` (desktop + mobile), R = chạy thật của orchestrator (FE http + BE DB cục bộ).

| AC | Kết quả | Bằng chứng chính |
| --- | --- | --- |
| 01–05 (quyền, phiên, hạ vai trò, giới hạn tần suất) | Pass | B admin-products/inventory/promotions/media; F AC-INV-03 |
| 06 (version-conflict) | Pass | B products + promotions; F AC-INV-06 |
| 07, 08 (cờ http, ẩn trường Won't) | Pass | F AC-INV-07, 08; adapter HTTP không import mock |
| 09 (migration) | Chưa kiểm được phần Supabase | B admin-catalog-migration 9 test trên DB cục bộ |
| 10–24 (danh sách, ghi sản phẩm, slug, công khai, hàng loạt, ẩn, giá, xoá, biến thể, search_text) | Pass | B T-INV-20..32; F AC-INV-10, 14, 16, 17, 20, 23 |
| 25–28 (ảnh) | Pass (driver local) | B admin-media; F AC-INV-25; driver Supabase chưa kiểm thật (S6-Q1) |
| 29–36 (tồn kho, lý do, đua ×20, stock-changed, idempotency, nhật ký) | Pass | B admin-inventory; F AC-INV-32, 34, 35 |
| 37, 38 (Should: ngưỡng, biến động do đơn) | Pass | B admin-inventory; F AC-INV-37 |
| 39 (Should: "Cập nhật bởi") | **Fail** | BE trả `updatedBy`, FE không hiện (m-1) |
| 40–46 (voucher) | Pass | B admin-promotions; F AC-INV-41, 42, 44, 45, 46 |
| 47, 48 (lỗi, mất mạng) | Pass | B; F AC-INV-47, 48 (mất mạng mô phỏng) |

## 4. Lỗi
**Major**
- M-1 (BE): `GET /api/media/{id}` dùng chung bộ đếm `catalogRateLimit` 120/60 giây/IP với catalog (`media.routes.ts:13`). Vài trang PLP/PDP có ảnh tải lên đủ làm 429 cả ảnh lẫn API catalog, trái BR-CAT-19. Sửa: bộ đếm riêng cho /media (ngưỡng cao hơn) hoặc không tính.

**Minor**
- m-1 (FE): AC-INV-39 — `toProduct` bỏ `updatedBy`, form không hiện "Cập nhật bởi {tên} lúc {giờ}".
- m-2 (FE): danh mục dùng hằng `CATEGORIES` thay `GET /admin/categories` (BR-INV-10).
- m-3 (FE, có thể cả BE): alt ảnh tải lên rỗng trên storefront; BR-INV-26 alt trống = tên sản phẩm.
- m-4 (BE, PO quyết): ảnh tải lên giữ nguyên EXIF (GPS, thiết bị) và phục vụ công khai.
- m-5 (BE): migration dùng `now()`/`CURRENT_TIMESTAMP` cho cột timestamp không múi giờ, phụ thuộc timezone phiên DB (Supabase UTC nên chưa lỗi).
- m-6 (BE): trùng `isRetryable` ở 3 file, `escapeLike` ở 2 file.
- m-7 (FE, ngoài Slice 6): format:check fail 9 file Slice 3–5.

## 5. Bảo mật
Đạt: quyền từng endpoint theo S6-Q2, vai trò đọc lại mỗi request, no-store, originGuard trước mọi ghi kể cả upload; ảnh nhận diện bằng magic bytes, tên do server sinh, không SVG, giới hạn 5 MB; chặn path traversal ở `/media/{id}`; SQL tham số hoá, không `$queryRawUnsafe`; service key Supabase không log; lỗi không lộ stack/SQL. Lưu ý: bộ đếm rate limit trong RAM (một tiến trình).

## 6. Migration `20261110000100_admin_catalog_schema`
Chỉ cộng thêm ngoài 3 `DROP CONSTRAINT` (nới `chk_products_price`, `chk_products_cover_media`, `chk_products_gallery`); không DROP bảng/cột, RENAME, TRUNCATE, đổi kiểu, xoá dữ liệu. CHECK mới rủi ro với dữ liệu cũ đều `NOT VALID`. RLS bật cho `inventory_adjustments`, `media_assets`. Cần Thắng duyệt trước khi áp Supabase.

## 7. Bất biến tồn kho
Delta là một UPDATE có điều kiện + CHECK DB; set khoá dòng `FOR UPDATE` và so `expectedAvailable`; đúng 1 dòng nhật ký mỗi điều chỉnh, replay theo Idempotency-Key không ghi lần hai; đua ×20 với đặt hàng không âm. Đạt.

## 8. Việc để đạt DoD
1. M-1. 2. AC-INV-39 (làm hoặc hoãn). 3. Quyết định m-2, m-3, m-4. 4. m-5, m-6, m-7. 5. Thắng: S6-Q1, duyệt migration, áp Supabase (lát 6.8). 6. 4 fail Playwright mới ngoài Slice 6 (commerce:37, :183, operations:58, :103) cần kiểm có từ trước không.
