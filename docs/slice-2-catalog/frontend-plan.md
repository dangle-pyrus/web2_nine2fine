# Slice 2 Catalog: kế hoạch frontend

Nguồn: `docs/product/PRD.md` (Slice 2: C1–C13, BR-CAT, AC-CAT), `docs/api/openapi.yaml` (tag `catalog`, locked), `docs/api/catalog-implementation-plan.md` mục 8 (13 điểm FE phải đổi, không chép lại ở đây). Khi mâu thuẫn: PRD > contract > file này > `docs/design/catalog-*.md` (spec viết dở, chỉ tham khảo bố cục và microcopy; bỏ phần phân trang số và tham số `page` trên URL).

Quy ước code: `frontend/AGENTS.md`. Component không gọi HTTP; mọi thứ qua `CATALOG_API`. Dùng token trong `src/styles.scss` và component trong `src/app/shared/**`. Giữ visual hiện có.

## 1. Cấu hình

| File | Việc |
| --- | --- |
| `src/app/core/api-config.ts` | Thêm `catalogMode: 'mock' \| 'http'` (mặc định `'http'`). Không đổi `mode` (Cart, Account, Admin vẫn mock). |
| `src/app/core/api-config.e2e.ts` | Thêm `catalogMode: 'mock'` để Playwright vẫn chạy mock. Hai file phải luôn cùng trường. |
| `src/app/app.config.ts:141` | `CATALOG_API` chọn adapter theo `catalogMode`, không theo `mode`. |

## 2. Model và adapter

| File | Việc | Plan §8 |
| --- | --- | --- |
| `src/app/features/catalog/models/product.ts` | `CatalogQuery`: đổi `search` → `q`; thêm `page?`, `limit?`, `ids?`. `ProductPage`: thêm `page`, `limit`. `ProductVariant`: thêm `stockStatus: 'IN_STOCK' \| 'LOW_STOCK' \| 'OUT_OF_STOCK'`. Id là chuỗi (UUID ở http). | 1, 2, 7, 8 |
| `src/app/features/catalog/data-access/catalog-api.ts` (`HttpCatalogApi`) | `list`: dựng `HttpParams` chỉ với giá trị khác rỗng/`false`/`0`; `ids` nối bằng dấu phẩy theo contract. `get`: bắt `404` có `error.code === 'not-found'` → `of(undefined)`, lỗi khác ném tiếp. `reviews`: trả `of([])` không gọi mạng (BR-CAT-17). `reviewEligibility`, `submitReview`, `notifyBackInStock`: không được gọi ở http (ném lỗi rõ nếu bị gọi). `mapProductPage` giữ `page`, `limit`. Đọc lỗi bằng `readApiError` có sẵn (`src/app/core/api-error.ts`). | 1–6 |
| `src/mocks/mock-catalog-api.ts` | Nhận `q`, `page`, `limit`, `ids` và trả `page`, `limit`, `stockStatus` cho khớp contract, để test mock vẫn đúng hành vi. | — |

## 3. Nơi gọi `list()` và thay đổi UI

| File | Việc | AC/BR |
| --- | --- | --- |
| `src/app/features/catalog/catalog-page.ts` | Tiêu đề "(N)" và `aria-live` dùng `total`. "Xem thêm" (Should, BR-CAT-15): nút dưới lưới, tải `page + 1` và nối, ẩn khi đã đủ `total`; đổi bộ lọc/sắp xếp/`q` thì về trang 1. URL KHÔNG có `page`. Trạng thái lỗi (mạng, 5xx, 429) có "Thử lại" giữ bộ lọc (đã có `retry$`). Empty có lọc và không lọc dùng hai câu khác nhau. | C1, BR-CAT-15 |
| `src/app/features/search/search-panel.ts:163` | `list({ ...DEFAULT_QUERY, q, limit: 5 })`. | C1 |
| `src/app/features/home/home-shop-rail.ts:50`, `src/app/features/cart/cart-view.ts:888`, `src/app/features/product/product-page.ts:139` (liên quan) | Thêm `limit` ≤ 12, bỏ `slice` phía client nếu có. | C1 |
| `src/app/features/wishlist/wishlist-state.ts` | Lấy sản phẩm bằng `list({ ids })` (≤ 48); id không còn tồn tại bị bỏ qua êm, không lỗi. | BR-CAT-16 (Should), C8 |
| `src/app/features/product/product-page.ts` | `undefined` → trang "không tìm thấy" (đã có); lỗi khác → "Chưa thể tải sản phẩm" + Thử lại. Ở `catalogMode: 'http'`: không render `product-reviews`, `review-form`, `stock-alert`, khối điểm sao. Màu mặc định là màu đầu tiên còn hàng. Hết hàng toàn bộ: nút chính "Hết hàng" bị vô hiệu, ẩn "Mua ngay" (kể cả thanh dính mobile). "Chỉ còn N" dùng `stockStatus === 'LOW_STOCK'`. Lỗi tải bảng size: toast lỗi và cho bấm lại (C11). | AC-CAT-26–32, BR-CAT-17, C11 |
| `src/app/shared/commerce/product-card.component.ts` | Không hiển thị sao khi `rating` vắng. Ảnh lỗi rơi về placeholder có sẵn. Sản phẩm hết hàng toàn bộ có nhãn "Hết hàng" và nút thêm nhanh bị vô hiệu. | BR-CAT-17 |
| `src/app/features/search/*` (`search-suggestions.ts`) | Kiểm lại từ gợi ý có kết quả với tìm kiếm theo từ, không dấu (C6). | C6 |
| Giỏ/wishlist trong `localStorage` | Id mock cũ không còn: bỏ qua êm, không làm vỡ trang. Checkout vẫn mock (C10). | C8, C10 |

Đề xuất ngoài PRD (được làm nếu rẻ, không bắt buộc): size hết hàng dùng `aria-disabled` thay `disabled` để vẫn focus được; giới hạn 100 ký tự cho ô tìm kiếm.

## 4. Hết phiên (AC-AUTH-69 qua AC-CAT-44)

Catalog là API công khai: cookie phiên sai/thu hồi KHÔNG làm catalog trả 401. Không cần đổi interceptor; Playwright kiểm rằng ở PLP với cookie hỏng vẫn xem được sản phẩm.

## 5. Test

- Playwright chạy ở cấu hình e2e (mock): cập nhật test hiện có đếm kết quả tìm kiếm và tiêu đề PLP; thêm test "Xem thêm", sản phẩm hết hàng toàn bộ trên PDP, slug lạ → không tìm thấy, ẩn đánh giá khi `catalogMode` là http (kiểm bằng unit của adapter hoặc thử thật trên backend cục bộ, nêu rõ cách đã kiểm).
- Ghi mã AC-CAT trong tên test.
- Kiểm thật với backend cục bộ: `npm run start:local`, mở `http://localhost:4200` (không dùng 127.0.0.1). Đi qua PLP có lọc + sắp xếp + Xem thêm, PDP, slug lạ, tìm "dam" và "đầm", wishlist.

## 6. Lệnh kiểm tra (trong `frontend/`)

`npm run lint`, `npm run format:check`, `npm run build`, Playwright cho các spec catalog/product/search/wishlist/home đã đổi (`npx playwright test <spec> --trace off`). Không bắt buộc chạy toàn bộ suite (khoảng 15 phút).
