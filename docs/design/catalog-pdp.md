# Spec: Chi tiết sản phẩm (PDP) `/product/:slug`

> Lưu ý 2026-11-07: spec viết dở, có chỗ lệch PRD Slice 2 (ví dụ phân trang số với `page`). Khi mâu thuẫn, `docs/product/PRD.md` (Slice 2) và `docs/slice-2-catalog/frontend-plan.md` thắng.

Phạm vi: Slice 2 Catalog (chỉ đọc), chuyển từ mock sang API thật. Giữ nguyên visual hiện có. Code hiện có: `frontend/src/app/features/product/product-page.{ts,html,scss}` (`n2f-product-page`), `product-gallery.ts` (`n2f-product-gallery`), `size-guide-dialog.ts`, `stock-alert.ts` (`n2f-stock-alert`), `product-reviews.ts`, `review-form.ts`; dùng chung `shared/commerce/product-card.component.ts`, `shared/commerce/price.pipe.ts` (`vnd`), `shared/ui/empty-state.component.ts`, `shared/ui/icon.component.ts`, `shared/ui/toast.ts`, `shared/ui/overlay.service.ts`. Token và quy tắc: `design-system.md`. Danh sách: `catalog-plp.md`; tìm kiếm: `catalog-search.md`.

Trạng thái mã AC: PRD chưa có BR-CAT/AC-CAT. Cột "AC" ghi "chờ map AC"; không tự đặt mã.

Thêm giỏ và mua ngay là hành vi giỏ hiện có (Slice 3 sẽ chuyển sang giỏ phía máy chủ). Slice 2 chỉ đổi nguồn dữ liệu và trạng thái hiển thị của sản phẩm; không đổi logic giỏ.

## 1. Luồng

```
Link từ PLP / tìm kiếm / chia sẻ --> /product/:slug (skeleton)
   |-- thành công ------------> trang đầy đủ; chọn màu --> chọn size --> Thêm vào giỏ / Mua ngay
   |-- slug cũ (đã đổi tên) --> chuyển (replaceUrl) sang slug hiện tại
   |-- not-found (không có, DRAFT, ARCHIVED) --> empty "Không tìm thấy sản phẩm"
   |-- mạng / 500 ------------> empty lỗi + "Thử lại"
Phần phụ (đánh giá, "Có thể bạn cũng thích") tải song song, lỗi thì ẩn êm, không chặn mua.
```

Dữ liệu màn hình cần (BE chốt contract): `Product` đầy đủ (id, slug, name, type, category, moments, price, compareAtPrice, badge, gallery, variants[id, size, color{name,hex}, inventory], material, care[], fit{summary, model}); bảng size theo danh mục (`/size-charts/:category`); đánh giá chỉ đọc; sản phẩm liên quan (cùng khoảnh khắc).

## 2. Bố cục (tham chiếu, giữ nguyên)

| Vùng | Thành phần có sẵn |
| --- | --- |
| Breadcrumb | `nav.breadcrumb`: Cửa hàng / <Danh mục> / <Tên sản phẩm> (`aria-current="page"`) |
| Cột trái | `n2f-product-gallery` (desktop: rail thumbnail + stage + mũi tên; ≤900px hoặc cảm ứng: track vuốt + bộ đếm "1 / N") |
| Cột phải `.product-info` | `.highlight` (Mới về / Bán chạy / Giảm N%) · `h1` + nút yêu thích · `.type` · `.price` (giá, `del` giá gốc) · `.tax-note` "Giá đã bao gồm VAT" · fieldset màu · fieldset size + nút "Hướng dẫn chọn size" · lỗi size · `n2f-stock-alert` · `.purchase` (Thêm vào giỏ, Mua ngay) · `.stock` aria-live · `ul.trust` · accordion "Chất liệu & chăm sóc" |
| Dưới | `section.reviews#reviews` (`n2f-review-form`, `n2f-product-reviews`) · `section.related` (`n2f-product-card`) · `.sticky-bar` mobile |

Mô tả (`description`) và dòng fit (`fit.summary`) hiện không hiển thị trên trang (đã bỏ khi gọn nội dung 2026-10-18; `fit` dùng trong hộp Hướng dẫn chọn size). Giữ nguyên, xem câu hỏi 4.

## 3. Bảng trạng thái

### 3.1 Tải trang

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Loading | `.product-layout` hai khối skeleton (`gallery-skeleton` 4/5, `info-skeleton`), `aria-label="Đang tải sản phẩm"`; breadcrumb chưa hiện. Tiêu đề tab "Sản phẩm | nine2fine" | chờ map AC |
| Thành công | Trang đầy đủ; tiêu đề tab "<Tên> | nine2fine"; màu mặc định là màu **đầu tiên còn hàng** (không phải màu đầu tiên), chưa chọn size | chờ map AC |
| `not-found` (slug không có; sản phẩm DRAFT hoặc ARCHIVED coi như không có) | `n2f-empty-state`: heading "Không tìm thấy sản phẩm", mô tả "Sản phẩm không tồn tại hoặc đã ngừng bán.", link `.button.dark` "Khám phá sản phẩm" tới `/shop`. Không breadcrumb. Tiêu đề tab "Không tìm thấy sản phẩm | nine2fine" | chờ map AC |
| Lỗi mạng / 500 / hết thời gian | `n2f-empty-state`: heading "Chưa thể tải sản phẩm", mô tả "Kiểm tra kết nối rồi thử lại.", nút `.button.dark` "Thử lại" (gọi lại cùng slug) và link phụ "Khám phá sản phẩm". Phải tách khỏi `not-found` theo mã lỗi (hiện mọi lỗi HTTP đều thành `failed`) | chờ map AC |
| Slug cũ | Chuyển sang URL hiện tại bằng `replaceUrl` (đã có), không thêm mục lịch sử, không nháy empty | chờ map AC |
| Sản phẩm không có biến thể nào (dữ liệu lỗi) | Giống hết hàng toàn bộ (3.2) nhưng dòng thông báo "Sản phẩm tạm chưa mở bán." | chờ map AC |

### 3.2 Tồn kho và biến thể

Quy ước: "hết một size" = biến thể có `inventory = 0`; "hết một màu" = mọi size của màu đó hết; "hết toàn bộ" = mọi biến thể hết.

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Còn hàng bình thường | Như hiện tại | chờ map AC |
| Hết một size (màu đang chọn) | Nút size có `aria-disabled="true"` (không dùng `disabled`, để Tab vẫn dừng được và trình đọc đọc "hết hàng"), kiểu gạch ngang hiện có (`.sizes button:disabled`), `aria-label` "M - hết hàng", bấm không làm gì. Dưới fieldset hiện `n2f-stock-alert` ("Hết size bạn cần? Báo tôi khi có hàng") | chờ map AC |
| Sắp hết (1–5, size đã chọn) | `.stock.low`: "Chỉ còn N sản phẩm size M" (aria-live polite, đã có). Ngưỡng 5 lấy từ code hiện tại, PO xác nhận (câu hỏi 6) | chờ map AC |
| Hết một màu | Chấm màu vẫn chọn được (để xem ảnh và đăng ký báo có hàng) nhưng thêm dấu hết hàng: viền gạch chéo bằng `linear-gradient` 45° màu `--line` trên `.color-option span`; `aria-label` "Đen - hết hàng"; `title` như vậy. Khi chọn: mọi nút size ở trạng thái hết, hiện dòng `.stock` "Màu này đã hết hàng" và `n2f-stock-alert` | chờ map AC |
| Hết toàn bộ sản phẩm | `.highlight` thêm "Hết hàng". Nút "Thêm vào giỏ" đổi chữ thành "Hết hàng", `aria-disabled="true"`, kiểu disabled; nút "Mua ngay" ẩn. Bấm không hiện lỗi chọn size. `n2f-stock-alert` hiện cho size của màu đang chọn. `.sticky-bar` mobile: nút "Hết hàng" disabled. Dòng `.stock` "Sản phẩm tạm hết hàng." | chờ map AC |
| Chưa chọn size khi bấm Thêm/Mua ngay | `.field-error#size-error` (`role="alert"`) "Vui lòng chọn kích cỡ của bạn.", cuộn tới và focus vào fieldset size (đã có) | chờ map AC |
| Đổi màu | Reset size đã chọn và lỗi (đã có); `h1`, giá, gallery giữ nguyên; legend màu `Màu sắc: <tên>` đọc được | |
| Tồn kho đổi giữa lúc xem và lúc thêm (BE từ chối) | Hiển thị lỗi bằng `.field-error` "Size này vừa hết hàng. Vui lòng chọn size khác.", nút size đó chuyển sang hết hàng ngay trên giao diện. Mã lỗi cụ thể chờ contract Cart (Slice 3); Slice 2 chỉ cần FE xử lý được khi giỏ báo hết hàng (`cart.message()` đã có) | chờ map AC |
| Giá khuyến mãi | `del` giá gốc có `.sr-only` "Giá gốc" (đã có); `.highlight` "Giảm N%" làm tròn từ `compareAtPrice` (đã có). Bỏ `del` và `Giảm` nếu `compareAtPrice ≤ price` | chờ map AC |

### 3.3 Ảnh

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Ảnh chính / ảnh trong gallery lỗi | `<img>` `error` thì thay bằng `catalog-placeholder` kèm chữ "Ảnh đang cập nhật" (đã có kiểu `.temporary`). Thumbnail lỗi cũng đổi tương ứng. Tỉ lệ 4/5 giữ nguyên, không nhảy bố cục | chờ map AC |
| Không có ảnh nào (`gallery` rỗng) | Một ô `catalog-placeholder` (code đã dự phòng `['catalog-placeholder']`); bộ đếm "1 / 1", ẩn mũi tên và rail khi chỉ có 1 ảnh | chờ map AC |
| Chỉ 1 ảnh | Ẩn mũi tên, rail và bộ đếm | chờ map AC |
| Ảnh tải chậm | Nền `--surface` (đã có) giữ chỗ; ảnh đầu `fetchpriority="high"`, các ảnh sau lazy (đã có) | |

### 3.4 Dữ liệu dài

| Trường | Quy tắc |
| --- | --- |
| Tên (`h1`) | Xuống dòng tối đa 4 dòng, `overflow-wrap: anywhere`; không cắt "…" (người mua cần đọc đủ). Hàng `.title-row` giữ nút yêu thích cố định bên phải (`flex-shrink: 0`) |
| `type` | Xuống dòng, không cắt |
| Chất liệu, hướng dẫn chăm sóc | Trong accordion, xuống dòng tự do; `overflow-wrap: anywhere`; danh sách `care` tối đa theo dữ liệu, không cuộn riêng |
| Tên trong `.sticky-bar` | Một dòng, cắt "…" (đã có), `title` đầy đủ |
| Màu nhiều (>6) | `.colors` xuống dòng (`flex-wrap: wrap`); mỗi nút ≥44px |
| Size nhiều (>6) | `.sizes` xuống dòng, nút ≥44px |
| Breadcrumb | Tên cuối cắt "…" một dòng, `title` đầy đủ; hai mục đầu không cắt |

### 3.5 Phần phụ

| Phần | Trạng thái |
| --- | --- |
| Đánh giá | Tải song song; lỗi thì coi là 0 đánh giá (đã có `catchError`). Tiêu đề "Đánh giá (N)". 0 đánh giá: dòng "Chưa có đánh giá cho sản phẩm này." Dòng "Đánh giá mẫu dùng cho bản trải nghiệm…" chỉ khi `mode: mock` hoặc đánh giá có cờ `sample` |
| Form viết đánh giá | Cần đơn đã nhận, thuộc Slice 3. Trong Slice 2 chế độ HTTP: ẩn `n2f-review-form` (không gọi `reviews/eligibility`); mock giữ nguyên |
| Có thể bạn cũng thích | Tối đa 4 thẻ cùng khoảnh khắc, bỏ chính sản phẩm; lỗi hoặc 0 thẻ thì ẩn cả mục (đã có). Request chỉ cần 5 phần tử |
| Bảng size | Mở từ "Hướng dẫn chọn size". Lỗi tải: toast "Chưa tải được bảng size. Vui lòng thử lại." (hiện lỗi bị bỏ qua, nút như không hoạt động). Loading: nút `disabled` và chữ "Đang tải…" |
| Báo có hàng (`n2f-stock-alert`) | Thành công: `role="status"` "Đã đăng ký…" (đã có). Lỗi: "Chưa đăng ký được. Vui lòng thử lại." Email sai: "Nhập địa chỉ email hợp lệ." (đã có). Endpoint `POST /stock-alerts` chưa nằm trong phạm vi chỉ đọc; chờ PO xác định thuộc Slice 2 hay không (câu hỏi 5) |
| Yêu thích | Chưa đăng nhập: hành vi hiện tại của `WishlistState` (không đổi trong Slice 2) |

## 4. URL state

- Đường dẫn: `/product/:slug`. Slug lạ cũ → `replaceUrl` về slug hiện tại (đã có).
- Không có query. Màu, size, ảnh đang xem, trạng thái accordion không lên URL (đúng với hiện tại). Chia sẻ link mở ra màu đầu tiên còn hàng. Xem câu hỏi 1 nếu muốn giữ màu.
- Back/Forward: về PLP với đúng bộ lọc/trang/vị trí cuộn (Router `scrollPositionRestoration` do cấu hình router, Frontend kiểm). Từ tìm kiếm Back về `/search?q=…` hoặc đóng panel đúng như hiện tại.
- Đổi sang sản phẩm khác (thẻ "Có thể bạn cũng thích"): trang đặt lại về đầu, focus vào `h1` (`tabindex="-1"`), chọn lại màu mặc định.
- Link `#reviews` (từ nơi khác trỏ vào) cuộn tới `section.reviews` (đã có `tabindex="-1"`).

## 5. Responsive

| Khung | Hành vi |
| --- | --- |
| Desktop >1100px | Hai cột 1.35fr / 1fr, gallery dính; rail thumbnail 72px |
| Tablet 901–1100px | Cột phải hẹp lại (đã có media query); lề 32px |
| ≤900px hoặc cảm ứng | Gallery là track vuốt ngang, bộ đếm "N / M"; một cột; `.related-grid` 2 cột |
| ≤800px | `.sticky-bar` hiện khi nút "Thêm vào giỏ" ra khỏi màn hình (tên + giá + size; nút "Chọn kích cỡ" hoặc "Thêm vào giỏ ngay"); lề 16px; không che nội dung cuối (padding-bottom ≥ chiều cao thanh) |
| 320px | Kiểm tra bắt buộc: không cuộn ngang; `h1` 24px xuống dòng; màu và size xuống dòng, nút ≥44px; `.purchase` hai nút xếp dọc rộng 100%; `.sticky-bar` tên cắt "…", nút ≥44px; breadcrumb xuống dòng; hộp `n2f-stock-alert` xếp dọc (Size, Email, nút Báo tôi rộng 100%) |

## 6. Accessibility

- **Chọn biến thể bằng bàn phím:** màu và size là nhóm `button` có `aria-pressed` trong `fieldset/legend` (đã có); Tab đi qua từng nút, Space/Enter chọn. Đề xuất bổ sung phím mũi tên trái/phải (hoặc lên/xuống) di chuyển focus giữa các nút trong cùng nhóm (roving tabindex) để Tab không phải qua tất cả size. Nút hết hàng (`aria-disabled`) vẫn nhận focus và được đọc "hết hàng".
- **Lỗi chọn size:** `#size-error` có `role="alert"`, fieldset `aria-describedby` trỏ tới nó (đã có), focus chuyển vào fieldset (`tabindex="-1"`). Sau khi chọn size, lỗi tự biến mất.
- **Thông báo tồn kho:** `.stock` `aria-live="polite"` (đã có) đọc "Chỉ còn N sản phẩm size M" khi chọn size; đọc "Màu này đã hết hàng" khi đổi màu.
- **Tên truy cập nút màu:** "Đen" hoặc "Đen - hết hàng"; đang chọn có `aria-pressed="true"`. Chữ `Màu sắc: <tên>` ở legend cho biết màu hiện tại.
- **Gallery:** rail là `tablist`/`tab` (đã có); mũi tên trái/phải đổi ảnh khi focus trong gallery (đã có); `alt` mỗi ảnh "<Tên> — <mô tả ảnh>"; ảnh placeholder alt "Ảnh sản phẩm đang được cập nhật". Track mobile `tabindex="0"` có `aria-label` (đã có). Bộ đếm `aria-live="polite"` đang có sẽ đọc mỗi lần vuốt: đổi thành `aria-hidden="true"` và để vùng `.sr-only` live chỉ cập nhật khi dừng (debounce 500 ms) "Ảnh 2 trên 5".
- **Nút yêu thích:** `aria-pressed`, `aria-label` "Yêu thích <Tên>" / "Bỏ yêu thích <Tên>" (đã có).
- **Thêm vào giỏ:** toast thông báo (`shared/ui/toast.ts`) phải có `role="status"`; focus không bị cướp.
- **Hết hàng toàn bộ:** nút "Hết hàng" `aria-disabled="true"`; có `aria-describedby` tới dòng "Sản phẩm tạm hết hàng."
- **Dialog Hướng dẫn chọn size:** modal, giữ bẫy focus, đóng trả focus về nút mở (CDK đã làm).
- **Tương phản:** `--muted` cho `type`, `tax-note`, `del` (≥7:1 trên trắng); gạch chéo màu hết hàng chỉ là tín hiệu thêm, ý nghĩa đã có ở `aria-label` và `title`. Lỗi `--required` `#d9080d` trên trắng ≈ 5.2:1.
- Một `h1` duy nhất; các khu có `h2` (Đánh giá, Có thể bạn cũng thích); breadcrumb là `nav` có nhãn.

## 7. Microcopy tiếng Việt

| Ngữ cảnh | Chữ |
| --- | --- |
| Nhãn nổi bật | "Mới về", "Bán chạy", "Giảm N%", "Hết hàng" |
| Nút | "Thêm vào giỏ", "Mua ngay", "Hết hàng" (khi hết toàn bộ), sticky: "Chọn kích cỡ" / "Thêm vào giỏ ngay" |
| Lỗi chưa chọn size | "Vui lòng chọn kích cỡ của bạn." |
| Hết size | `aria-label` "M - hết hàng"; liên kết "Hết size bạn cần? Báo tôi khi có hàng" |
| Hết màu | "Đen - hết hàng"; dòng "Màu này đã hết hàng" |
| Sắp hết | "Chỉ còn N sản phẩm size M" |
| Hết toàn bộ | "Sản phẩm tạm hết hàng." |
| Không tìm thấy | "Không tìm thấy sản phẩm" / "Sản phẩm không tồn tại hoặc đã ngừng bán." / nút "Khám phá sản phẩm" |
| Lỗi tải | "Chưa thể tải sản phẩm" / "Kiểm tra kết nối rồi thử lại." / nút "Thử lại" |
| Bảng size lỗi | "Chưa tải được bảng size. Vui lòng thử lại." |
| 0 đánh giá | "Chưa có đánh giá cho sản phẩm này." |
| Ảnh | "Ảnh đang cập nhật" |
| Giá | "Giá đã bao gồm VAT" (đã có) |
| Chính sách | "Giao dự kiến …", "Miễn phí vận chuyển cho đơn từ …", "Trả hàng trong N ngày" (đã có, lấy từ `storeSettings().policy`) |

Thuật ngữ thống nhất với PLP và giỏ: "Thêm vào giỏ", "kích cỡ" (nhãn nhóm) và "size" (nút, thông báo), "Hết hàng", "Yêu thích".

## 8. Thay đổi so với UI hiện tại

Visual không đổi. Chỉ các thay đổi cần cho API thật:

1. Tách lỗi: `not-found` → "Không tìm thấy sản phẩm"; mạng/500 → "Chưa thể tải sản phẩm" + "Thử lại". Hiện HTTP 404 rơi vào `catchError` nên hiện "Chưa thể tải sản phẩm"; chỉ mock (trả `undefined`) mới ra "Không tìm thấy sản phẩm".
2. Màu mặc định = màu đầu tiên còn hàng (hiện là `variants[0]`, có thể là màu đã hết).
3. Hết màu: dấu hết hàng trên chấm màu + `aria-label`; dòng "Màu này đã hết hàng" khi chọn.
4. Hết toàn bộ: nút "Hết hàng" thay "Thêm vào giỏ", ẩn "Mua ngay", sticky bar tương ứng (hiện không có, người dùng bị kẹt vì mọi size disabled).
5. Nút size hết hàng đổi từ `disabled` sang `aria-disabled` để focus và đọc được.
6. Ảnh lỗi: rơi về placeholder; 1 ảnh thì ẩn điều khiển gallery.
7. Bảng size lỗi: toast thay vì im lặng; loading của nút.
8. Chế độ HTTP: ẩn form viết đánh giá và không gọi `eligibility` (chờ Slice 3).
9. Tiêu đề tab theo tên sản phẩm; focus vào `h1` khi đổi sản phẩm.
10. A11y: bộ đếm gallery bỏ `aria-live` từng bước; mũi tên di chuyển giữa nút màu/size (tuỳ chọn); `.stock` đọc cả "Màu này đã hết hàng".
11. Dữ liệu dài: `h1` tối đa 4 dòng; breadcrumb cắt tên cuối.
12. Dòng "Đánh giá mẫu…" chỉ khi dữ liệu mock/sample.

## 9. Câu hỏi mở

1. **Giữ màu trên URL** (`?color=Đen`) để chia sẻ link đúng màu? Đề xuất không làm trong Slice 2 (mặc định màu đầu còn hàng); nếu PO muốn, thêm `color` với `replaceUrl`, giá trị lạ bị bỏ.
2. **Danh mục trong breadcrumb:** link tới `/shop/<category>` (như hiện tại). Giữ.
3. **Sản phẩm DRAFT/ARCHIVED** trả `not-found` (404) cho người xem công khai. Đề xuất đúng như vậy; BE xác nhận không lộ sự tồn tại.
4. **`description` và `fit.summary`:** đang ẩn. Đề xuất giữ ẩn; nếu BR-CAT yêu cầu hiển thị mô tả, thêm accordion "Mô tả" trên cùng, mặc định mở trên desktop, đóng trên mobile.
5. **Báo có hàng (`POST /stock-alerts`)** có thuộc Slice 2 không? Là ghi dữ liệu nên có thể không thuộc "chỉ đọc". Đề xuất: giữ UI, ẩn liên kết trong chế độ HTTP tới khi BE có endpoint; PO quyết định.
6. **Ngưỡng "sắp hết"** (≤5 hiện tại) cố định hay cấu hình theo sản phẩm (mục 31, 33 master plan có `LOW_STOCK`)? Đề xuất: BE trả `stockStatus` theo biến thể (`IN_STOCK|LOW_STOCK|OUT_OF_STOCK`) cùng `inventory`; FE hiện "Chỉ còn N" khi `LOW_STOCK`.
7. **Bộ đếm tồn kho chính xác** có nên công khai (BE có thể chỉ trả trạng thái, không trả số)? Đề xuất: trả số khi `LOW_STOCK`, ẩn số khi còn nhiều.
8. **Mã AC:** chờ PO viết BR-CAT/AC-CAT; Designer map lại cột AC.
