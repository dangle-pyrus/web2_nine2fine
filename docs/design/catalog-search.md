# Spec: Tìm kiếm (panel gợi ý + trang kết quả `/search?q=`)

> Lưu ý 2026-11-07: spec viết dở, có chỗ lệch PRD Slice 2 (ví dụ phân trang số với `page`). Khi mâu thuẫn, `docs/product/PRD.md` (Slice 2) và `docs/slice-2-catalog/frontend-plan.md` thắng.

Phạm vi: Slice 2 Catalog (chỉ đọc), chuyển từ mock sang API thật. Hai bề mặt:

1. **Panel tìm kiếm** (overlay từ header): `frontend/src/app/features/search/search-panel.{ts,html,scss}` (`n2f-search-panel`), `search-suggestions.ts` (`buildSuggestions`, `highlight`, `POPULAR_SEARCHES`, `SearchHistory`), `search-origin.ts`. Gợi ý nhanh + tối đa 5 sản phẩm.
2. **Trang kết quả** `/search?q=…`: dùng lại `CatalogPage` (`catalog-page.ts`, route `search` có `data.kind = 'search'`), tức mọi thứ ở `catalog-plp.md` (lưới, bộ lọc, sắp xếp, phân trang) áp dụng; tài liệu này chỉ ghi phần khác biệt.

Token và quy tắc: `design-system.md`. Master plan mục 12 (debounce, bàn phím, nút xoá, empty, loading, lịch sử tuỳ chọn). Giữ nguyên visual hiện có, kể cả hoạt ảnh FLIP.

Trạng thái mã AC: PRD chưa có BR-CAT/AC-CAT. Cột "AC" ghi "chờ map AC"; không tự đặt mã.

## 1. Luồng

```
Bấm ô tìm ở header --> panel mở (focus vào ô, kẹt focus)
   |-- ô trống ---------------> "Tìm kiếm gần đây" (xoá lịch sử được) + "Tìm kiếm phổ biến"
   |-- gõ (>=1 ký tự, đợi 250 ms) --> gọi API (huỷ yêu cầu cũ)
          |-- có kết quả -----> "Gợi ý hàng đầu" + "Sản phẩm (N)" tối đa 5 thẻ + "Xem tất cả kết quả"
          |-- 0 kết quả ------> thông báo + "Thử tìm" (từ phổ biến)
          |-- lỗi mạng/500 ---> thông báo + "Thử lại"
   |-- Enter không chọn gì / nút tìm --> /search?q=<từ khoá>   (panel đóng)
   |-- Enter đang chọn mục ---> mục đó (danh mục, khoảnh khắc, từ khoá, sản phẩm)
   |-- Esc / Hủy / bấm nền ---> đóng, trả focus về ô tìm ở header
/search?q=... --> trang kết quả (bộ lọc, sắp xếp, phân trang như PLP)
```

Danh mục/khoảnh khắc trong "Gợi ý" dẫn tới `/shop/:category` và `/shop-by-moment/:moment` (từ `CATEGORIES`, `MOMENTS`). Từ khoá dẫn tới `/search?q=`. Sản phẩm dẫn tới `/product/:slug`.

Dữ liệu cần (BE chốt): tìm theo từ khoá không dấu, không phân biệt hoa thường ("dam" ra "Đầm midi") trên tên và `type`; trả `items` (đủ trường cho thẻ) + `total`; lọc/sắp xếp/phân trang như danh sách. Chỉ sản phẩm `ACTIVE`.

## 2. Bố cục (tham chiếu, giữ nguyên)

**Panel:** `scrim` · `section.sheet[role=dialog][aria-modal]` gồm `.bar` (logo `.wordmark`, `form.field[role=search]` với `input#product-search` kiểu combobox + nút xoá `.clear` + nút gửi, nút `.cancel` "Hủy") · `.results` gồm khối theo trạng thái (mục 3). Khi có kết quả: cột trái "Gợi ý hàng đầu" (`.suggestions`, tối đa 5), cột phải "Sản phẩm (N)" (`.products`, lưới 5 thẻ `.search-result` gồm `n2f-media-image`, tên, type, giá) + link "Xem tất cả kết quả".

**Trang kết quả:** `h1` "Tìm kiếm." + `.count` · `.search-summary` "Kết quả cho “<q>” Xóa" · bộ lọc, sắp xếp, lưới, phân trang như PLP. `nav.category-links` vẫn hiện trên `/search` (chỉ ẩn ở wishlist), giữ nguyên.

## 3. Bảng trạng thái

### 3.1 Panel

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Mở, ô trống, có lịch sử | Khối "Tìm kiếm gần đây" (tối đa 5 chip có icon `reiconHistory`, nút "Xóa lịch sử") + "Tìm kiếm phổ biến" (6 chip) | chờ map AC |
| Mở, ô trống, chưa có lịch sử | Chỉ "Tìm kiếm phổ biến" | chờ map AC |
| Đang gõ, chờ debounce / loading | Thẻ cũ giữ nguyên nếu đã có (mờ `aria-busy`), nếu chưa có thì 5 `.result-skeleton`. Không nháy trống | chờ map AC |
| Có kết quả | "Gợi ý hàng đầu" + "Sản phẩm (N)" (N = `total` từ API, không phải 5) + "Xem tất cả kết quả". Gợi ý trống thì dòng "Không có gợi ý cho “<q>”." (đã có) | chờ map AC |
| 0 kết quả | `.message`: "Chưa tìm thấy sản phẩm cho “<q>”." + "Thử tìm" + chip phổ biến. Không có "Xem tất cả" | chờ map AC |
| Lỗi mạng / 500 | `.message[role=alert]`: "Chưa thể tìm kiếm. Vui lòng thử lại." + chip "Thử lại" (`retry()`); từ đã gõ giữ nguyên | chờ map AC |
| Từ khoá chỉ có khoảng trắng | Coi như ô trống (đã `trim`); không gọi API | chờ map AC |
| Từ khoá quá dài | `maxlength="100"` trên ô; dán dài hơn bị cắt 100 ký tự. Hiển thị lại trong thông báo xuống dòng được (`overflow-wrap: anywhere`) | chờ map AC |
| Ký tự đặc biệt (`%`, `<`, `"`, `\`) | Coi là chữ thường, không báo lỗi, luôn mã hoá URL; hiển thị dạng văn bản (không HTML). Kết quả có thể là 0 | chờ map AC |
| Tên / type sản phẩm dài trong thẻ | `.result-name` tối đa 2 dòng "…", `.result-type` 1 dòng "…"; gợi ý 1 dòng "…" với `title` đầy đủ | chờ map AC |
| Ảnh sản phẩm lỗi | `n2f-media-image` rơi về `catalog-placeholder` (alt rỗng vì `decorative`) | chờ map AC |
| Sản phẩm hết hàng toàn bộ | Vẫn hiện trong kết quả với nhãn nhỏ "Hết hàng" cạnh giá (`.result-price`), `aria-label` link thêm ", hết hàng" | chờ map AC |
| Lịch sử | Lưu cục bộ (`localStorage` `n2f.search.recent.v1`, tối đa 5, không gửi đi); thêm khi chọn kết quả/gợi ý/gửi tìm; không thêm từ khoá gõ dở | |

### 3.2 Trang `/search`

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Không có `q` (hoặc `q` trống/khoảng trắng) | Không gọi API. `n2f-empty-state`: heading "Bạn đang tìm gì?", mô tả "Nhập từ khóa vào ô tìm kiếm ở đầu trang để xem sản phẩm.", link `.button.dark` "Khám phá sản phẩm" tới `/shop`. `h1` "Tìm kiếm." không có `.count` | chờ map AC |
| Loading | Như PLP (6 skeleton); `.search-summary` đã hiện ngay | chờ map AC |
| Có kết quả | `h1 Tìm kiếm. (N)`; `.search-summary` "Kết quả cho “<q>” [Xóa]"; lưới và phân trang như PLP | chờ map AC |
| 0 kết quả, chỉ có từ khoá | `n2f-empty-state`: heading "Không có kết quả cho “<q>”", mô tả "Kiểm tra chính tả hoặc thử từ khóa khác.", link `.button.dark` "Khám phá sản phẩm" | chờ map AC |
| 0 kết quả, có từ khoá + bộ lọc | Heading như trên; mô tả "Thử bỏ bớt bộ lọc hoặc đổi từ khóa."; nút `.button.dark` "Xóa bộ lọc" (giữ `q`) | chờ map AC |
| Lỗi mạng / 500 | Như PLP: "Chưa thể tải sản phẩm" / "Kiểm tra kết nối rồi thử lại." / "Thử lại" | chờ map AC |
| Từ khoá dài trong `.search-summary` | Xuống dòng tự do, nút "Xóa" không bị đẩy ra ngoài (`flex-wrap` hoặc `gap`) | chờ map AC |
| `page` vượt trang cuối | Như PLP (4.4) | chờ map AC |

`not-found` không áp dụng cho tìm kiếm (đường dẫn `/search` luôn tồn tại); 0 kết quả là trạng thái bình thường, không phải lỗi.

## 4. URL state

| Tham số | Ý nghĩa | Ghi chú |
| --- | --- | --- |
| `q` | Từ khoá, bỏ khoảng trắng hai đầu, ≤100 ký tự | Chuỗi khác rỗng mới gọi API. Mã hoá URL chuẩn (`q=%C4%91%E1%BA%A7m`) |
| `sort`, `size`, `color`, `maxPrice`, `available`, `gender`, `moment`, `category`, `page` | Như `catalog-plp.md` mục 4.1 | Đổi bất kỳ tham số nào (kể cả `q`) xoá `page` |

- Từ panel: chọn từ khoá/Enter/"Xem tất cả" điều hướng `/search?q=<từ>` **không** mang bộ lọc cũ (tìm mới). Chọn từ trang kết quả khác cũng bắt đầu lại.
- Trên trang kết quả, "Xóa" bỏ `q` giữ các tham số còn lại, kết quả là trạng thái "Không có `q`" ở 3.2.
- Back/Forward: mỗi lần tìm là một mục lịch sử; Back từ `/search` về trang trước khi mở panel, Forward trở lại kết quả. Panel đóng khi điều hướng; mở lại panel không điền sẵn `q` hiện tại (đề xuất ở câu hỏi 3).
- Chia sẻ link `/search?q=blazer&sort=price-asc&page=2` mở đúng kết quả, không phụ thuộc lịch sử cục bộ.
- Panel không thay đổi URL khi gõ.
- Tiêu đề tab: `Tìm “<q>” | nine2fine` khi có `q`, ngược lại "Tìm kiếm | nine2fine".
- Panel gọi API với `search` + kích thước trang nhỏ (đề xuất 8, đủ 5 thẻ và 5 gợi ý); trang kết quả dùng kích thước trang PLP. Tên tham số theo contract BE.

## 5. Responsive

| Khung | Hành vi |
| --- | --- |
| Desktop >1100px | Panel: thanh 3 cột (logo, ô tìm tối đa 680px, Hủy); kết quả 2 cột (gợi ý 180–240px + lưới 5 thẻ) |
| Tablet 801–1100px | Lưới thẻ trong panel 3 cột; ô tìm theo icon-only morph (đã có) |
| Mobile ≤800px | Thanh `[ô tìm][Hủy]` (logo ẩn theo CSS hiện có); gợi ý trên, thẻ dưới; lưới thẻ 2 cột; panel cuộn trong `max-height: 100svh - bar-top`; trang chặn cuộn nền (đã có) |
| 320px | Kiểm tra bắt buộc: ô nhập chữ ≥16px (không tự phóng to trên iOS); chip xuống dòng; nút xoá và Hủy vùng bấm ≥44px; thông báo lỗi và 0 kết quả không bị cắt; bàn phím ảo không che chip/nút "Thử lại" (khối kết quả cuộn được) |

Trang `/search`: như PLP (2 cột lưới ≤800px, nút "Bộ lọc" mở drawer).

## 6. Accessibility

- **Combobox (đã có, giữ):** `input[role=combobox]`, `aria-controls="search-listbox"`, `aria-expanded`, `aria-activedescendant`; ↑/↓ di chuyển tuần hoàn theo thứ tự gợi ý → "Xem tất cả" → sản phẩm; Enter chọn mục đang sáng, nếu chưa sáng thì gửi tìm; Esc đóng (host `keydown.escape`); Tab thoát khỏi danh sách tới nút xoá/Hủy (kẹt focus bằng `cdkTrapFocus`).
- **aria-live cho số kết quả (sửa):** hiện `aria-live="polite"` đặt trên toàn bộ `.results .container` nên mỗi lần gõ trình đọc đọc lại cả khối. Đổi thành một vùng `<p class="sr-only" aria-live="polite">` riêng, chỉ nội dung này thay đổi: loading "Đang tìm…"; có kết quả "Có N sản phẩm cho “<q>”"; 0 kết quả "Không tìm thấy sản phẩm cho “<q>”"; lỗi "Chưa thể tìm kiếm". Cập nhật sau khi API trả (không mỗi phím gõ). Khối kết quả bỏ `aria-live`.
- **Trang `/search`:** vùng `.sr-only` live của PLP đọc "N sản phẩm cho “<q>”" thay vì chỉ "N sản phẩm". Sau khi đi từ panel sang `/search`, focus chuyển vào `h1` (`tabindex="-1"`).
- **Nhãn:** `<label for="product-search" class="sr-only">Tìm sản phẩm</label>`; nút xoá `aria-label` "Xóa nội dung tìm kiếm"; `scrim` `aria-label` "Đóng tìm kiếm"; nút gửi `aria-label` "Tìm kiếm" (`tabindex="-1"`, Enter trong ô đã gửi); nút "Hủy" là chữ thật.
- **Focus:** mở: focus vào ô (`cdkFocusInitial`); đóng: trả về nút mở trong header. `:focus-visible` 2px `--brand`; mục đang sáng bằng phím mũi tên có nền `--surface` + viền `--ink` (không chỉ đổi màu chữ).
- **Gợi ý có nhóm:** `role="group"` + `aria-labelledby` (đã có). Khối "Tìm kiếm gần đây"/"phổ biến" là link thường (Tab).
- **Lỗi và 0 kết quả:** lỗi `role="alert"`; 0 kết quả đọc qua vùng live (không dùng `alert` vì không phải lỗi).
- **Điều hướng bằng phím không cần gõ:** chip lịch sử và phổ biến là `<a>`; "Xóa lịch sử" là `<button>`.
- **Tương phản:** `.eyebrow`, `.muted` dùng `--muted` (≥7:1); phần khớp (`.match`) dùng đậm chứ không chỉ đổi màu.
- **Reduced motion:** morph/clip-path của panel bỏ khi `prefers-reduced-motion` (đã có trong `play()`).

## 7. Microcopy tiếng Việt

| Ngữ cảnh | Chữ |
| --- | --- |
| Placeholder / nhãn ô | "Bạn đang tìm gì đó?" / "Tìm sản phẩm" (ẩn) |
| Khối rỗng | "Tìm kiếm gần đây", "Xóa lịch sử", "Tìm kiếm phổ biến" |
| Có kết quả | "Gợi ý hàng đầu", "Sản phẩm (N)", "Xem tất cả kết quả" |
| Không gợi ý | "Không có gợi ý cho “<q>”." |
| 0 kết quả (panel) | "Chưa tìm thấy sản phẩm cho “<q>”." / "Thử tìm" |
| Lỗi (panel) | "Chưa thể tìm kiếm. Vui lòng thử lại." / chip "Thử lại" |
| Loading (đọc) | "Đang tìm…" |
| `/search` rỗng | "Bạn đang tìm gì?" / "Nhập từ khóa vào ô tìm kiếm ở đầu trang để xem sản phẩm." / "Khám phá sản phẩm" |
| `/search` 0 kết quả | "Không có kết quả cho “<q>”" / "Kiểm tra chính tả hoặc thử từ khóa khác." (có lọc: "Thử bỏ bớt bộ lọc hoặc đổi từ khóa." + "Xóa bộ lọc") |
| Tóm tắt | "Kết quả cho “<q>”" · "Xóa" (`aria-label` "Xóa từ khóa tìm kiếm") |
| Lỗi (trang) | "Chưa thể tải sản phẩm" / "Kiểm tra kết nối rồi thử lại." / "Thử lại" |
| Nhãn | "Hết hàng" |

Dấu ngoặc kép cong “ ” như đang dùng. Thuật ngữ: **tìm kiếm** (danh từ, tiêu đề), **tìm** (động từ), **từ khóa** (trong câu), **sản phẩm**.

## 8. Thay đổi so với UI hiện tại

Visual không đổi. Chỉ các thay đổi cần cho API thật và a11y:

1. Panel gọi API với `search` và kích thước trang nhỏ; tổng "Sản phẩm (N)" dùng `total` (hiện đã dùng `state().total`, giữ). Gợi ý theo `buildSuggestions` chỉ dùng tối đa 8 sản phẩm trả về (chất lượng gợi ý từ tên/type có thể giảm so với mock: câu hỏi 2).
2. `/search` không có `q`: empty "Bạn đang tìm gì?" thay vì liệt kê toàn bộ sản phẩm dưới tiêu đề "Tìm kiếm." (hiện route chạy `list` không `q`).
3. 0 kết quả của `/search` có chữ riêng theo từ khoá ("Không có kết quả cho “<q>”") và ẩn nút "Xóa bộ lọc" khi không có bộ lọc; hiện dùng chữ chung của PLP.
4. Không đổi: danh mục trong kết quả tìm vẫn lọc được (`category` kèm `q`).
5. Giới hạn 100 ký tự cho ô và `q`; `q` được cắt khoảng trắng hai đầu trước khi vào URL.
6. Tách vùng `aria-live` (mục 6) thay cho `aria-live` trên cả khối kết quả.
7. Sản phẩm hết hàng toàn bộ vẫn hiện nhưng có nhãn "Hết hàng".
8. Ảnh lỗi trong thẻ panel rơi về placeholder.
9. Phân trang trên `/search` (thừa hưởng PLP).
10. Tiêu đề tab theo từ khoá; focus vào `h1` khi vào `/search` từ panel.
11. Trong chế độ HTTP, `POPULAR_SEARCHES` giữ nguyên danh sách tĩnh (không phụ thuộc API); mỗi từ phải có ít nhất 1 sản phẩm trong dữ liệu seed (BE seed kiểm tra, câu hỏi 4).

## 9. Câu hỏi mở

1. **Độ dài tối thiểu để gọi API.** Hiện 1 ký tự. Đề xuất giữ 1 trong Slice 2 (UI không đổi) và BE giới hạn tốc độ; nếu tải cao thì nâng lên 2 ký tự và hiện dòng "Nhập thêm ký tự để tìm" trong panel.
2. **Gợi ý hàng đầu từ đâu.** Hiện tính ở FE từ tên/type của các sản phẩm trả về + danh mục/khoảnh khắc + từ phổ biến. Đề xuất giữ ở FE trong Slice 2 (đủ cho đồ án), không thêm endpoint `/search/suggestions`.
3. **Mở lại panel có điền sẵn `q` hiện tại không?** Đề xuất không (ô trống, hiện lịch sử gần đây), đúng với Nike và hành vi hiện tại.
4. **Từ phổ biến** (`Blazer`, `Sơ mi`, `Đầm midi`, `Quần ống suông`, `Chân váy`, `Gile`): danh sách tĩnh, BE seed phải có sản phẩm khớp cho từng từ, nếu không "Thử tìm" dẫn tới 0 kết quả. Có thể để BE/PO đổi danh sách.
5. **Khớp nghĩa tìm kiếm.** Mock khớp chuỗi con không dấu trong `name + type`. Đề xuất BE giữ cùng quy tắc (chưa cần xếp hạng độ liên quan, sắp xếp mặc định `featured`); nếu muốn tìm trong mô tả hoặc danh mục, PO nêu trong BR-CAT.
6. **Lưu lịch sử khi 0 kết quả:** hiện vẫn lưu. Đề xuất chỉ lưu từ khoá đã được chọn từ kết quả có sản phẩm hoặc gửi tìm; PO xác nhận.
7. **Mã AC:** chờ PO viết BR-CAT/AC-CAT; Designer map lại cột AC.
