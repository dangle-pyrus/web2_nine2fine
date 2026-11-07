# Spec: Danh sách sản phẩm (PLP) `/new-in`, `/shop`, `/shop/nam|nu`, `/shop/:category`, `/shop-by-moment/:moment`

> Lưu ý 2026-11-07: spec viết dở, có chỗ lệch PRD Slice 2 (ví dụ phân trang số với `page`). Khi mâu thuẫn, `docs/product/PRD.md` (Slice 2) và `docs/slice-2-catalog/frontend-plan.md` thắng.

Phạm vi: Slice 2 Catalog (chỉ đọc), chuyển từ mock sang API thật (cờ catalog = http). Giữ nguyên visual hiện có (Nike-style: header dính, cột lọc trái, lưới thẻ). Code hiện có: `frontend/src/app/features/catalog/catalog-page.{ts,html,scss}` (`n2f-catalog-page`), `catalog-filters.ts` (`n2f-catalog-filters`), `filter-dialog.ts` (`n2f-filter-dialog`, drawer mobile), `models/product.ts`, `data-access/catalog-api.ts`, thẻ `shared/commerce/product-card.component.ts` (`n2f-product-card`), `shared/ui/empty-state.component.ts` (`n2f-empty-state`). Token và quy tắc chung: `design-system.md`. Tìm kiếm: `catalog-search.md` (cùng `CatalogPage`, `data.kind = 'search'`). Chi tiết: `catalog-pdp.md`.

Nguồn quy tắc: PRD `docs/product/PRD.md` mục "Slice 2: Catalog" (C1–C13, BR-CAT-01..23, AC-CAT-01..53) và `docs/decisions.md` (2026-11-07). PRD thắng khi mâu thuẫn. Các điểm spec thêm mà PRD chưa nói được đánh dấu "đề xuất ngoài PRD" và gom ở mục 9. Trạng thái không có AC ghi "không có AC, đề xuất".

## 1. Luồng

```
Header / menu / link ngoài --> PLP (loading skeleton)
   |-- 200, có hàng ------------> lưới thẻ (+ "Xem thêm" nếu đã tải < total, Should)
   |-- 200, total = 0 ----------> empty (có lọc: "Xóa bộ lọc"; không: link /shop)
   |-- mạng / 5xx / 429 --------> lỗi + "Thử lại" (giữ nguyên bộ lọc trên URL)
Đổi bộ lọc / sắp xếp / danh mục --> đổi URL --> tải lại từ đầu
Bấm thẻ --> /product/:slug (xem catalog-pdp.md)
```

Điểm vào: `/new-in` ("New in."), `/shop` ("The everyday edit."), `/shop/nam`, `/shop/nu` (`data.gender`, "Thời trang Nam." / "Thời trang Nữ."), `/shop/:category` (`tops|bottoms|dresses|outerwear`), `/shop-by-moment/:moment` (`work|dinner|event|weekend`). Các đường dẫn này tương đương tham số lọc tương ứng (BR-CAT-06).

Slug danh mục/khoảnh khắc lạ (`/shop/xyz`) **không** là `not-found`: API trả 200 với `total = 0` (PRD C3, BR-CAT-06, AC-CAT-17) và FE hiện trạng thái empty. Chỉ chi tiết sản phẩm và bảng size mới có `not-found`.

Dữ liệu màn hình cần (BE chốt tên trường trong `docs/api/openapi.yaml`): `items` của trang (đủ trường thẻ: id, slug, name, type, price, compareAtPrice, badge, mediaId, colorMedia, variants[size, color, inventory, stockStatus]) và `total` = tổng khớp bộ lọc (BR-CAT-08). Thẻ **không có điểm sao** ở chế độ HTTP (BR-CAT-17).

## 2. Bố cục (tham chiếu, không vẽ lại)

| Vùng | Thành phần có sẵn |
| --- | --- |
| Header dính | `h1#catalog-title` + `.count` "(N)" (N = `total`) · nút `.filter-desktop-toggle` "Ẩn bộ lọc / Hiện bộ lọc" (≥801px) · nút `.filter-toggle` "Bộ lọc" (≤800px, mở `FilterDialog` dạng drawer) · `select` "Sắp xếp theo" |
| Cột trái (≥801px) | `nav.category-links` (Tất cả sản phẩm + 4 danh mục) · `n2f-catalog-filters` (Dành cho, Khoảnh khắc, Kích cỡ, Màu sắc, Khoảng giá, Tình trạng) · `.sidebar-note` |
| Kết quả | (tuỳ) `.search-summary` · lưới `.product-grid` của `n2f-product-card` · (Should) nút "Xem thêm" · `.collection-end` |

Lưới: 3 cột (4 cột khi ẩn bộ lọc ở ≥1101px), 3 cột ≤1100px, 2 cột ≤800px.

## 3. Bảng trạng thái

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Loading lần đầu / đổi bộ lọc / đổi sắp xếp | 6 `.skeleton-product` trong `.product-grid` (đã có); `.catalog-results[aria-busy=true]`; `h1` giữ tiêu đề, bỏ `.count` tới khi có `total`. Đổi lọc nữa thì huỷ yêu cầu trước (`switchMap` đã có) | không có AC, đề xuất |
| Thành công, có sản phẩm | Lưới + `h1 (total)` + `.collection-end`. Mở `/shop/nu?color=Đỏ&maxPrice=1000000&sort=price-asc` hiện "Đang lọc (3)" và đúng sản phẩm; tải lại giữ nguyên; Back về trạng thái trước; "Xóa tất cả" về `/shop` | AC-CAT-12, 18, 19 |
| Empty có bộ lọc hoặc từ khoá (kể cả `size=XL&available=true`) | `n2f-empty-state`: heading "Chưa tìm thấy lựa chọn phù hợp", mô tả "Thử thay đổi hoặc xóa bộ lọc để khám phá thêm.", nút `.button.dark` "Xóa bộ lọc" (`clear()`). Không phải lỗi | AC-CAT-14, 17 |
| Empty không bộ lọc (kể cả slug danh mục/khoảnh khắc lạ `/shop/xyz`) | `n2f-empty-state`: heading "Chưa có sản phẩm trong mục này", mô tả "Mời bạn xem các sản phẩm khác của nine2fine.", link `.button.dark` "Khám phá sản phẩm" tới `/shop` (ẩn nếu đang ở `/shop`). Với slug lạ, `h1` = "Bộ sưu tập." thay vì rơi về "New in." (đề xuất ngoài PRD) | AC-CAT-17 (rỗng, không lỗi); chữ và `h1`: không có AC, đề xuất |
| Lỗi mạng / 5xx / hết thời gian | `n2f-empty-state`: heading "Chưa thể tải sản phẩm", mô tả "Kiểm tra kết nối rồi thử lại.", nút `.button.dark` "Thử lại" (`retry()`, giữ nguyên URL và bộ lọc, không reset). Cột lọc và sắp xếp vẫn hiển thị | AC-CAT-49, BR-CAT-20 |
| 429 `rate-limited` | Cùng khối lỗi; mô tả "Có quá nhiều yêu cầu. Vui lòng thử lại sau N giây." (N = `retryAfterSeconds`, định dạng theo `design-system.md` mục 5.1). Nút "Thử lại" bật sau khi hết N giây (đề xuất ngoài PRD); PRD chỉ yêu cầu "lỗi có thử lại" | AC-CAT-47 |
| 422 `validation` (tham số URL sai dạng mà FE chưa chuẩn hoá) | FE chuẩn hoá trước khi gọi nên không để xảy ra (mục 4.2). Nếu vẫn xảy ra thì dùng khối lỗi chung, không hiện chi tiết kỹ thuật | AC-CAT-48 |
| Hết hàng toàn bộ sản phẩm (mọi biến thể `OUT_OF_STOCK`) | Thẻ vẫn hiện (chỉ ẩn khi bật "Chỉ hiện còn hàng", AC-CAT-14). Thẻ thêm nhãn "Hết hàng" (vị trí `.badge`) và nút giỏ nhanh `.quick-add` `disabled` kèm `aria-label` "<Tên> đã hết hàng" | không có AC, đề xuất |
| Hết hàng một size (panel size của thẻ) | Nút size `disabled`, gạch ngang (đã có), `aria-label` "Size M - hết hàng" (khớp BR-CAT-04) | BR-CAT-04, AC-CAT-07 |
| Hết hàng một màu (thẻ) | Chấm màu vẫn chọn được; chọn màu mà mọi size hết thì mọi nút size gạch ngang, nút thêm vào giỏ `disabled`, thêm dòng nhỏ "Màu này đã hết hàng" | không có AC, đề xuất |
| Ảnh lỗi | Thẻ đổi sang `catalog-placeholder` + "Ảnh đang cập nhật" (`.image-note`, `.temporary`). Tỉ lệ 4/5 giữ nguyên. `mediaId` là id trong media manifest của FE, không phải URL (PRD mục 2) nên chủ yếu là dự phòng khi id không có trong manifest | không có AC, đề xuất |
| Dữ liệu dài | Tên trong thẻ tối đa 2 dòng rồi "…" (`-webkit-line-clamp: 2`, `title` đầy đủ); `type` 1 dòng "…"; giá + giá gốc xuống dòng (`.price` đã `flex-wrap`); `h1` `overflow-wrap: anywhere` (đã có); từ khoá dài trong `.search-summary` xuống dòng. Tên tối đa 120 ký tự (BR-CAT-01) | không có AC, đề xuất |
| `total` lớn | `.count` có dấu chấm ngăn nghìn (`1.234`) | không có AC, đề xuất |
| Chưa chọn size trong thẻ | Nút thêm `disabled` tới khi chọn size (hiện có) | |
| Xem thêm (Should): đã tải < `total` | Dưới lưới, thay dòng cuối: "Đang xem {đã tải} trên {total} sản phẩm" + nút `.button` outline "Xem thêm". Nút không hiện khi đã tải đủ; seed 8 sản phẩm không có nút | AC-CAT-41 (Should), BR-CAT-15 |
| Xem thêm: đang tải | Nút `disabled`, chữ "Đang tải…"; lưới giữ nguyên, thêm 4 skeleton nối cuối | AC-CAT-41 |
| Xem thêm: thành công | Nối thêm vào lưới, không trùng; URL không đổi; tiêu đề vẫn đếm `total`; focus chuyển vào link tên của thẻ mới đầu tiên | AC-CAT-41 |
| Xem thêm: lỗi | Giữ nguyên các thẻ đã hiện. Dưới lưới `role="alert"`: "Chưa tải thêm được. Vui lòng thử lại." + nút "Thử lại" (tải lại đúng trang đó) | AC-CAT-41 |

## 4. URL state

### 4.1 Tham số đang dùng (giữ nguyên, **không thêm `page`**)

| Tham số | Nguồn | Chuẩn hoá ở FE trước khi gọi API | Ghi chú |
| --- | --- | --- | --- |
| `category` | path `/shop/:category` hoặc query | Không chuẩn hoá: giá trị lạ gửi nguyên, API trả 200 rỗng | `tops`, `bottoms`, `dresses`, `outerwear` |
| `moment` | path `/shop-by-moment/:moment` hoặc query | Như trên | `work`, `dinner`, `event`, `weekend` |
| `gender` | path `/shop/nam|nu` (`data.gender`) hoặc query | Giữ code hiện có: giá trị ngoài `nam|nu` bị bỏ | |
| `size` | query | Gửi nguyên, lạ → rỗng | `S`, `M`, `L`, `XL` |
| `color` | query | Gửi nguyên, lạ → rỗng | Tên màu tiếng Việt: `Đen`, `Trắng`, `Xám`, `Đỏ` (mã hoá URL) |
| `maxPrice` | query | Phải là số nguyên > 0; thập phân (`1.5`), âm, chữ → bỏ (về 0, không gửi). Hiện `Number('1.5') > 0` lọt qua và API trả 422: cần thêm `Number.isInteger` | `500000`, `800000`, `1000000` |
| `available` | query | Chỉ `true` | `false` bị xoá khỏi URL |
| `q` | query | Bỏ khoảng trắng hai đầu; cắt còn 100 ký tự (đề xuất ngoài PRD, tránh 422 khi dán link dài) | Xem `catalog-search.md` |
| `sort` | query | Ngoài tập hợp → `featured` (AC-CAT-21) | `featured` (mặc định, không ghi vào URL), `newest`, `price-asc`, `price-desc`, `bestselling` |

Quy tắc chung (`update()` hiện có): giá trị rỗng/`false`/`0` bị xoá khỏi URL; URL phản ánh đủ trạng thái; mở lại link ra đúng kết quả.

### 4.2 Lệnh gọi API

Hiện `HttpCatalogApi.list` gửi cả tham số rỗng (`gender=`, `maxPrice=0`, `available=false`). Chuyển sang HTTP: chỉ gửi tham số có giá trị (rỗng hoặc vắng = không lọc, BR-CAT-06), đúng tên bảng 4.1, cộng `limit` và `page` do FE điều khiển trong bộ nhớ (không lên URL): PLP `limit=24` (mặc định, tối đa 48); Xem thêm tăng `page` nội bộ. Tên tham số theo `openapi.yaml`.

### 4.3 Lịch sử trình duyệt, chia sẻ

- Mỗi lần đổi bộ lọc/sắp xếp/danh mục là một mục lịch sử (hiện tại, giữ): Back quay về trạng thái trước (AC-CAT-18).
- Đổi bộ lọc, sắp xếp hoặc `q` quay về danh sách trang 1 (BR-CAT-15); các thẻ đã "Xem thêm" bị bỏ.
- Hạn chế đã biết: số thẻ đã "Xem thêm" nằm trong bộ nhớ, không lên URL. Vào PDP rồi Back thì danh sách mở lại 24 thẻ đầu, có thể mất vị trí cuộn nếu đã nối thêm. Seed 8 sản phẩm không gặp (xem câu hỏi 1).
- "Ẩn bộ lọc" là tuỳ chọn trình duyệt (`localStorage` `n2f.plp.filters-hidden`), không vào URL.
- Link chia sẻ mở ra cùng kết quả (trang 1); không phụ thuộc đăng nhập (BR-CAT-18).

## 5. Responsive

| Khung | Hành vi |
| --- | --- |
| Desktop >1100px | 220px cột lọc + lưới 3 cột (4 cột khi ẩn lọc); header dính; cột lọc dính, cuộn riêng |
| Tablet 801–1100px | Cột lọc 160px; lưới 3 cột; lề `--page-gutter` 32px |
| Mobile ≤800px | Không cột lọc; nút "Bộ lọc" mở drawer; `select` sắp xếp rộng tối đa 130px, ẩn chữ "Sắp xếp theo" (`aria-label` giữ); lưới 2 cột; lề 16px |
| 320px | Kiểm tra bắt buộc: không cuộn ngang; `h1` 20px xuống dòng; `.header-actions` xuống dòng dưới `h1`; nút lọc, sắp xếp cao ≥44px; thẻ 2 cột (~144px): tên 2 dòng, giá xuống dòng; nút "Xem thêm" rộng 100% |

Drawer lọc (`FilterDialog`): nút cuối "Xem sản phẩm" đổi nhãn thành "Xem N sản phẩm" khi có `total`; đang tải "Đang tải…"; `total = 0` "Không có sản phẩm phù hợp" (vẫn đóng drawer để thấy empty). Đề xuất ngoài PRD.

## 6. Accessibility

- **Số kết quả:** `<span class="sr-only" aria-live="polite">` (đã có) đọc: loading "Đang tải sản phẩm"; thành công "N sản phẩm" (N = `total`, không dùng số thẻ đã tải); 0 kết quả "Không có sản phẩm phù hợp"; lỗi "Chưa thể tải sản phẩm"; sau Xem thêm "Đã tải thêm, đang xem X trên N sản phẩm". Chỉ cập nhật khi kết quả đổi.
- **Focus:** `:focus-visible` toàn cục (2px `--brand`), không `outline: none`. Đóng drawer trả focus về nút "Bộ lọc" (CDK đã làm). Khối lỗi có `role="alert"`; sau "Thử lại" thành công không cần chuyển focus. Sau Xem thêm focus vào thẻ mới đầu tiên.
- **Bộ lọc:** `details/summary` + `fieldset/legend.sr-only` (đã có). Nút size/màu có `aria-pressed`. "Ẩn/Hiện bộ lọc" có `aria-expanded`, `aria-controls` (đã có). `.filter-count` thêm `.sr-only` " bộ lọc đang bật".
- **Danh mục:** `nav.category-links` dùng `aria-current="page"` (đã có).
- **Thẻ:** link ảnh `aria-label` "<Tên>, màu <màu>" (đã có), thêm ", hết hàng" khi hết toàn bộ; `h2` là link; nút màu và yêu thích `aria-pressed`.
- **Xem thêm:** là `<button>`; `disabled` khi đang tải kèm chữ "Đang tải…".
- **Tương phản:** nhãn "Hết hàng" dùng `--ink` trên trắng; không dùng `--muted` nhỏ hơn 12px.
- `prefers-reduced-motion` đã tắt chuyển động toàn cục.

## 7. Microcopy tiếng Việt

| Ngữ cảnh | Chữ |
| --- | --- |
| Tiêu đề | "New in.", "The everyday edit.", "Thời trang Nam.", "Thời trang Nữ.", tên danh mục / khoảnh khắc; slug lạ: "Bộ sưu tập." |
| Loading (đọc) | "Đang tải sản phẩm" |
| Số kết quả | "(N)" cạnh `h1`; đọc "N sản phẩm" |
| Dòng cuối | "Đang xem {đã tải} trên {total} sản phẩm" |
| Xem thêm | "Xem thêm" / "Đang tải…" / lỗi "Chưa tải thêm được. Vui lòng thử lại." + "Thử lại" |
| Empty có lọc | "Chưa tìm thấy lựa chọn phù hợp" / "Thử thay đổi hoặc xóa bộ lọc để khám phá thêm." / "Xóa bộ lọc" |
| Empty không lọc | "Chưa có sản phẩm trong mục này" / "Mời bạn xem các sản phẩm khác của nine2fine." / "Khám phá sản phẩm" |
| Lỗi | "Chưa thể tải sản phẩm" / "Kiểm tra kết nối rồi thử lại." / "Thử lại" |
| 429 | "Có quá nhiều yêu cầu. Vui lòng thử lại sau N giây." |
| Thẻ hết hàng | nhãn "Hết hàng"; nút giỏ "<Tên> đã hết hàng"; panel size "Size M - hết hàng", "Màu này đã hết hàng" |
| Ảnh lỗi | "Ảnh đang cập nhật" |
| Bộ lọc | "Đang lọc (N)", "Xóa tất cả" (đã có) |
| Drawer | "Xem N sản phẩm" / "Đang tải…" / "Không có sản phẩm phù hợp" |

Thuật ngữ: **sản phẩm**, **bộ lọc**, **kích cỡ** (nhãn nhóm lọc) và **size** (nút, thẻ, thông báo), **hết hàng**, **thử lại**, **yêu thích**.

## 8. Thay đổi so với UI hiện tại

Visual không đổi. Chỉ các thay đổi cần cho API thật (cờ catalog = http; mock giữ nguyên hành vi, BR-CAT-21):

1. `h1 (N)` và aria-live dùng `total` từ API, không dùng `visibleProducts().length` (C1). **Không** thêm `page` vào URL, **không** có bộ chuyển trang số.
2. "Xem thêm" (Should, BR-CAT-15): nút nối trang kế, dòng cuối "Đang xem X trên N sản phẩm" thay "Đã xem N sản phẩm".
3. Gọi API chỉ gửi tham số có giá trị; `maxPrice` phải nguyên dương; `sort` lạ về `featured`.
4. Lỗi: 429 có chữ riêng kèm N giây; lỗi mạng/5xx đổi mô tả thành "Kiểm tra kết nối rồi thử lại."
5. Hai kiểu empty (có lọc / không lọc); slug danh mục/khoảnh khắc lạ là empty (không phải not-found).
6. Thẻ không hiện điểm sao ở HTTP (BR-CAT-17).
7. Thẻ hết hàng toàn bộ, hết một màu (đề xuất ngoài PRD); nhãn size "Size M - hết hàng".
8. Ảnh lỗi rơi về placeholder (dự phòng).
9. A11y: aria-live theo `total`; `.sr-only` số bộ lọc; drawer "Xem N sản phẩm".
10. Trang Yêu thích: lọc theo `ids` từ API (BR-CAT-16, Should, AC-CAT-42) thay vì lọc FE; ngoài spec này, ghi để Frontend lưu ý. Nếu BR-CAT-16 hoãn thì wishlist lỗi khi > 1 trang (PRD đã nêu).

## 9. Đề xuất ngoài PRD (để chuyển PO)

1. Thẻ "Hết hàng" khi mọi biến thể hết; dòng "Màu này đã hết hàng" ở panel size.
2. `h1` "Bộ sưu tập." cho slug danh mục/khoảnh khắc lạ.
3. Chữ 429 có N giây và nút "Thử lại" bật sau N giây.
4. Cắt `q` ở 100 ký tự khi đọc từ URL (BR-CAT-14 chỉ nêu giới hạn ô nhập).
5. Nhãn drawer "Xem N sản phẩm", dấu chấm ngăn nghìn ở `.count`.
6. Chữ các empty state, lỗi "Chưa tải thêm được…".

## 10. Câu hỏi mở

1. **Back từ PDP sau "Xem thêm"** mở lại 24 thẻ đầu, mất vị trí. Đề xuất: chấp nhận trong Slice 2 (seed 8 sản phẩm, Xem thêm là Should); nếu cần sau này lưu số trang đã tải vào `sessionStorage` theo khoá URL, không đưa `page` lên URL.
2. **Thẻ hết hàng toàn bộ: hiện hay ẩn.** PRD chưa nói (seed luôn có S/M/L còn hàng nên không gặp). Đề xuất: hiện với nhãn "Hết hàng"; "Chỉ hiện còn hàng" (`available=true`) ẩn chúng.
