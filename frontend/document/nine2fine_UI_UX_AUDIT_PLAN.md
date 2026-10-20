# nine2fine — Rà soát UI/UX & kế hoạch chỉnh sửa

> **Ngày rà soát:** 2026-10-11
> **Trạng thái:** Đang triển khai. Đợt 1 xong 2026-10-11 (G1, G2, G3, G5, G8, D3, D5; kèm sửa empty state lệch trái). Mục 5 dùng phương án khuyến nghị cho đến khi người dùng chốt khác.
> Đợt 2 (phần mua hàng) xong 2026-10-11: L1, C1, C2, C3 + yêu cầu mới (thẻ sản phẩm kiểu UNIQLO, thêm nhanh, toast, chọn món trong giỏ, trang giỏ kiểu UNIQLO). Còn K1, K3, K4, A1, A2, D4.
> **Ghi chú G1:** chuẩn hóa sang nút **pill** (không phải bo 6 px) vì frame Figma auth/account dùng pill; đỏ chỉ cho hành động chốt mua, đen cho hành động chính khác.
> **Phạm vi:** toàn bộ route cửa hàng, auth, tài khoản; mobile 390 px và desktop 1440 px được ưu tiên ngang nhau. Mobile có nhiều mục hơn vì hiện đang kém tối ưu hơn, không phải vì desktop ít quan trọng hơn (desktop xem mục 3.8).
> **Bằng chứng:** ảnh chụp trong `.open-figma-mcp/exports/ui-audit/` (`mobile-*.png`, `desktop-*.png`, cắt nhỏ trong `tiles/`), số đo tự động trong `mobile-report.json` / `desktop-report.json`.

## 0. Cách đọc

- **P0** — lỗi thấy ngay hoặc làm khó thao tác mua hàng trên mobile. Nên sửa trước.
- **P1** — thiếu nhất quán, làm giao diện trông "chưa xong".
- **P2** — nâng cấp trải nghiệm, làm sau khi có ảnh thật hoặc khi còn thời gian.
- Ảnh sản phẩm hiện là illustration "Ảnh đang cập nhật" và ảnh campaign là ảnh tạm (UNIQLO/Pexels). Kế hoạch này **không** coi đó là lỗi UI, nhưng có ghi chỗ nào ảnh tạm làm lộ vấn đề.
- Theo quyết định cũ: giữ visual auth/onboarding/account, chỉ sửa khi ảnh hưởng usability/responsive.

## 1. Kết quả kiểm tra tự động

| Kiểm tra | Mobile 390 | Desktop 1440 |
|---|---|---|
| Tràn ngang (horizontal overflow) | 0 trang | 0 trang |
| Lỗi console / page error | 0 | 0 |
| Chữ < 12 px | Footer 9 px (`© 2026`, "Ảnh tạm: Pexels · VIETNAM"); nhãn stepper đơn hàng 11 px; nhãn danh mục Home 11 px; "2 màu" 10 px; "Ảnh đang cập nhật" 11 px | — |
| Vùng chạm < 32 px | Link footer cao 16 px; link tên sản phẩm 22 px; "Xem chi tiết lộ trình" 16 px; nút xóa ô tìm kiếm 21×24; "Tham gia ngay" 18 px; breadcrumb 18 px | — |

Nền tảng responsive ổn (không tràn, không lỗi). Vấn đề chủ yếu nằm ở **nhịp khoảng cách, tính nhất quán của component và mật độ thông tin trên mobile**.

## 2. Vấn đề xuyên suốt (toàn site)

| # | Mức | Vấn đề (bằng chứng) | Đề xuất |
|---|---|---|---|
| G1 | P0 | **Nút CTA có 5 kiểu khác nhau**: đỏ vuông (giỏ trống, "Thanh toán" trong giỏ), đen bo tròn (Tra cứu, Đặt đơn, Thanh toán ngay), viền bo tròn (Home "Xem tất cả"), chữ gạch chân (Home), đỏ bo tròn nhỏ ("Dùng ngay" voucher). `mobile-cart-items`, `mobile-track-order`, `mobile-account-vouchers` | Chốt 3 cấp: **Primary** = đỏ thương hiệu bo 6 px (đúng token Figma) cho hành động mua (Thêm vào giỏ, Thanh toán, Đặt hàng); **Secondary** = viền đen; **Tertiary** = link gạch chân. Home editorial giữ CTA chữ gạch chân (quyết định quiet luxury). Áp đồng loạt qua class dùng chung trong `styles.scss`. |
| G2 | P0 | **Promo strip chiếm ~75 px** trên mọi trang mobile (2 dòng chữ + link), đẩy nội dung chính xuống. `mobile-new-in-00`, `mobile-pdp-first-viewport` | Mobile: 1 dòng, chữ 12–13 px, rút gọn "Freeship từ 1 triệu · Đổi trả 30 ngày"; có thể xoay vòng 2 thông điệp; ẩn khi cuộn xuống như utility bar. Ẩn trên checkout. |
| G3 | P0 | **Footer mobile**: khối "09:00 → FINE." chữ đỏ rất to, mũi tên nằm lơ lửng phía trên chữ FINE trông như vỡ layout; chữ bản quyền 9 px; link cao 16 px, khó bấm. `mobile-home-06` | Mobile: thu nhỏ hoặc xếp "09:00 → FINE." trên một hàng, giảm cỡ; link footer cao tối thiểu 40 px (padding dọc); chữ tối thiểu 12 px. Gom 4 cột thành accordion trên mobile để footer ngắn lại (hiện ~640 px). |
| G4 | P1 | **Ngôn ngữ lẫn lộn** cho "Khoảnh khắc": Home dùng "ĐI LÀM / HẸN TỐI / DỰ TIỆC / CUỐI TUẦN", còn footer, bộ lọc, PDP dùng "Work / Dinner / Event / Weekend". `mobile-filter-dialog`, `mobile-pdp-01` | Chọn một bộ nhãn tiếng Việt cho commerce (Đi làm / Hẹn tối / Dự tiệc / Cuối tuần), giữ tiếng Anh chỉ ở tagline/eyebrow thương hiệu. Sửa ở một nguồn dữ liệu `MOMENTS`. |
| G5 | P1 | **Khoảng cách lề không đồng nhất**: trang giỏ hàng mobile có padding lồng 2 lớp (tiêu đề lùi vào 45 px trong khi đường kẻ ở 20 px); Home có lề 12 px; các trang khác 16 px. `mobile-cart-items-00` | Một token lề trang mobile 16 px (`--page-gutter`), bỏ padding lồng trong cart. |
| G6 | P1 | **Empty state không nhất quán**: giỏ hàng trống có 2 bộ copy khác nhau ("Một khởi đầu mới" ở `/cart`, "Giỏ hàng còn trống" ở `/checkout`); trên desktop checkout, illustration lệch trái không thẳng hàng với chữ. `desktop-checkout-guest` | Dùng một `EmptyState` duy nhất, căn giữa; thêm 1 hàng gợi ý sản phẩm (bán chạy) dưới empty state giỏ hàng / yêu thích / tìm kiếm không có kết quả. |
| G8 | P0 | **Hamburger và drawer ngược hướng**: icon menu nằm bên trái header mobile nhưng drawer trượt ra từ bên phải, mắt người dùng phải nhảy sang phía đối diện và nút đóng nằm xa vị trí vừa bấm. `mobile-drawer` | Drawer phải xuất hiện cùng phía với nút mở. Khuyến nghị: giữ icon bên trái và cho drawer trượt từ trái (logo vẫn ở giữa/trái, giỏ hàng bên phải như hiện tại); nút đóng đặt cùng vị trí với icon hamburger. Phương án khác: dời hamburger sang phải như Nike. Desktop (≥ 800 px) giữ navbar ngang + mega menu, không dùng hamburger. |
| G7 | P2 | Header mobile: nút pause video của hero nằm sát nút tài khoản, dễ bấm nhầm. `mobile-home-00` | Dời nút pause xuống góc dưới phải hero. |

## 3. Theo từng trang

### 3.1. Home (`/`)

| # | Mức | Vấn đề | Đề xuất |
|---|---|---|---|
| H1 | P1 | Nhãn danh mục 11 px, "Quần & chân váy" xuống 2 dòng làm lưới 4 cột lệch. `mobile-home-00` | Nhãn 13 px; mobile dùng 2×2 (đã thống nhất trong master plan 0.1) hoặc rút "Quần & váy". |
| H2 | P1 | Link "Khám phá quần & chân váy →" trong rail xuống dòng, mũi tên rơi giữa. `mobile-home-01` | Giữ mũi tên dính chữ cuối (`white-space: nowrap` cho cụm cuối) hoặc rút ngắn copy. |
| H3 | P1 | Rail ngang không có dấu hiệu cuộn ngoài thẻ bị cắt; không có chỉ báo vị trí. | Hiện ~1,2 thẻ để lộ rõ thẻ tiếp theo + thanh tiến độ mảnh dưới rail. |
| H4 | P1 | Chữ trắng đặt trên ảnh sáng (campaign "The Everyday Wardrobe", "Thêm món cho tủ đồ") khó đọc. | Tăng gradient tối ở 40% dưới ảnh, hoặc đặt khối chữ dưới ảnh trên mobile. |
| H5 | P2 | Home mobile dài ~8.800 px với 11 campaign liên tiếp cùng một bố cục, dễ gây mỏi. | Xen nhịp: sau mỗi 2–3 campaign chèn 1 rail sản phẩm/khối danh mục; hoặc rút còn 6–7 campaign khi có ảnh thật. |
| H6 | P2 | Ảnh rail còn logo/thông số người mẫu của nguồn tham khảo. | Thay khi có ảnh nine2fine (không phải lỗi code). |

### 3.2. Danh sách sản phẩm (`/new-in`, `/shop/*`, `/search`, `/wishlist`)

| # | Mức | Vấn đề | Đề xuất |
|---|---|---|---|
| L1 | P0 | Trên mobile, thanh "Chọn phiên bản →" luôn hiện dưới mỗi ảnh (hành vi hover của desktop), chiếm ~45 px mỗi thẻ và lặp 8 lần. `mobile-new-in-00` | Mobile: ẩn thanh; chạm vào thẻ mở PDP. Có thể thay bằng nút "+" nhỏ ở góc ảnh mở quick-add sheet (P2). |
| L2 | P1 | Khoảng trống dọc giữa các hàng sản phẩm lớn (~60 px) trong khi khoảng ngang 10 px. | Gap dọc mobile 24–28 px. |
| L3 | P1 | Hàng "Bộ lọc / Nổi bật" mobile: hai control trông như chữ thường, không giống nút. | Hai nút viền bo tròn cùng chiều cao 40 px, dính (sticky) dưới header khi cuộn. |
| L4 | P1 | Dialog bộ lọc mobile: nút "Xem sản phẩm" nằm cuối danh sách (phải cuộn hết các nhóm), không hiện số kết quả, không có "Xóa tất cả" cạnh đó. `mobile-filter-dialog`, `filter-dialog.ts` | Footer cố định đáy sheet: "Xóa tất cả" + "Xem 8 sản phẩm". |
| L5 | P2 | Swatch màu 10 px + chữ "2 màu" 10 px quá nhỏ. | Swatch 14 px, chữ 12 px. |

### 3.3. Chi tiết sản phẩm (`/product/:slug`)

| # | Mức | Vấn đề | Đề xuất |
|---|---|---|---|
| P1 | P1 | Viewport đầu mobile: ảnh chiếm gần hết, giá nằm sát mép dưới, chưa thấy chọn size. `mobile-pdp-first-viewport` | Ảnh tỉ lệ 4:5 full-bleed (bỏ bo góc + lề), dạng swipe có chấm chỉ báo thay cho "1/4"; giữ thanh "Thêm vào giỏ" dính đáy (đã có). |
| P2 | P1 | Sao đánh giá ở đầu trang (4 sao) và ở mục Đánh giá (5 sao) cho cùng điểm 4.7 — hiển thị khác nhau. `mobile-pdp-01` | Dùng chung một component sao có nửa sao. |
| P3 | P2 | Lỗi "Vui lòng chọn kích cỡ" + viền đỏ quanh cả nhóm: rõ nhưng chữ đỏ sát nhóm, không có icon. | Thêm icon cảnh báo, cuộn nhẹ đến nhóm size khi bấm từ sticky bar. |
| P4 | P2 | Trang dài ~5.000 px trên mobile; Looks + Đánh giá + Liên quan đều mở. | Thu gọn đánh giá còn 2 bài + nút "Xem tất cả". |

### 3.4. Giỏ hàng (`/cart` + drawer)

| # | Mức | Vấn đề | Đề xuất |
|---|---|---|---|
| C1 | P0 | Không có tiến độ freeship dù chính sách "Miễn phí từ 1.000.000 ₫" được quảng bá ở promo strip. | Thanh tiến độ "Còn 120.000 ₫ để được miễn phí giao hàng" trong drawer và trang giỏ. |
| C2 | P1 | Desktop: giỏ hàng là một cột hẹp ~670 px giữa trang, nhiều khoảng trắng. `desktop-cart-items` | 2 cột: danh sách bên trái, tóm tắt + nút thanh toán dính bên phải (giống checkout). |
| C3 | P1 | Mobile: nút "Thanh toán" không dính đáy; phải cuộn qua danh sách mới thấy khi giỏ nhiều món. | Thanh tóm tắt dính đáy: tổng tiền + nút Thanh toán. |
| C4 | P2 | Chữ "Xóa" gạch chân nhỏ, tách xa sản phẩm. | Icon thùng rác 40×40 cạnh bộ đếm số lượng. |

### 3.5. Thanh toán (`/checkout`)

| # | Mức | Vấn đề | Đề xuất |
|---|---|---|---|
| K1 | P0 | Link "Đăng nhập để dùng địa chỉ đã lưu" dính sát nhãn "Họ và tên" phía dưới, trông như lỗi. `mobile-checkout-items-00` | Đưa thành một khối gợi ý riêng (nền nhạt, có nút) phía trên form, cách 16 px. |
| K2 | P1 | Checkout vẫn hiện full header (menu, tìm kiếm) và footer dài → dễ rời luồng. | Header rút gọn: logo + "Thanh toán an toàn" + link về giỏ; ẩn footer marketing, chỉ giữ dòng chính sách. |
| K3 | P1 | Tóm tắt "Đơn hàng (2) 2.180.000 ₫" trên mobile thu gọn nhưng không có icon mũi tên → không biết bấm được. | Thêm chevron + "Xem chi tiết". |
| K4 | P1 | Nút "Đặt đơn trải nghiệm" nằm cuối trang mobile, sau 3 section. | Thanh dính đáy với tổng tiền + nút đặt hàng (màu primary theo G1). |

### 3.6. Tài khoản (`/account/*`)

Giữ visual theo Figma; chỉ đề xuất các điểm ảnh hưởng mobile.

| # | Mức | Vấn đề | Đề xuất |
|---|---|---|---|
| A1 | P0 | Menu tài khoản mobile là hàng cuộn ngang bị cắt ("Lịch sử mua hà…"), không có gợi ý còn mục; mục đang chọn có thể nằm ngoài màn hình. `mobile-account-orders-00` | Tự cuộn mục đang chọn vào giữa; thêm fade mép phải; hoặc đổi thành trang menu tài khoản dạng danh sách (kiểu app) với nút quay lại trên trang con. |
| A2 | P0 | Tab trạng thái đơn (7 tab) cũng bị cắt trên mobile ("Chờ g…"). | Cùng cách xử lý A1: tự cuộn tab đang chọn, fade mép, chip bo tròn dễ bấm. |
| A3 | P1 | Stepper 5 bước trong chi tiết đơn: nhãn 11 px, chen chúc. `mobile-account-order-detail-00` | Mobile: stepper dọc (timeline) với thời gian từng mốc; nhãn 13 px. |
| A4 | P1 | Thẻ voucher mobile: cột logo bên trái chiếm ~30% chiều rộng, nội dung bị ép xuống 3–4 dòng. `mobile-account-vouchers-00` | Mobile: thu cột logo còn dải 64 px hoặc đưa logo lên trên; nút "Dùng ngay" theo G1. |
| A5 | P2 | Tiêu đề hồ sơ "@Minh" — dạng handle không có trong dữ liệu. | Hiện "Xin chào, Minh" + hạng thành viên dạng badge. |
| A6 | P2 | Thẻ đơn hàng hiển thị mọi sản phẩm; đơn 4–5 món sẽ rất dài (sẽ thấy rõ khi có dữ liệu giả lập). | Hiện tối đa 2 sản phẩm + "và 3 sản phẩm khác". |

### 3.7. Auth, tra cứu đơn, 404

- Auth (`/auth/*`): không có lỗi responsive; chỉ có link "Điều khoản sử dụng" cao 20 px (P2, tăng vùng chạm). Giữ nguyên visual.
- Tra cứu đơn (`/track-order`): ổn. P2: thêm ví dụ định dạng mã đơn và gợi ý "Mã đơn có trong email/SMS xác nhận".
- 404: ổn; P2: thêm ô tìm kiếm + link danh mục.

### 3.8. Riêng desktop (1440 px)

Các mục G1, G4, G6, C1, C2, K2 ở trên áp dụng cho cả desktop. Ngoài ra:

| # | Mức | Vấn đề (bằng chứng) | Đề xuất |
|---|---|---|---|
| D1 | P1 | **Hero Home desktop**: tiêu đề "From Nine to Fine." chỉ ~30 px trên màn 1440, yếu so với ảnh tràn viền; khối chữ và dải "ĐI LÀM / HẸN TỐI…" không cùng trục căn. `desktop-home-00` | Tiêu đề 56–64 px (vẫn Nunito Sans), mô tả 18 px; căn dải khoảnh khắc theo lề trái cùng khối chữ hoặc đưa thành tab dưới hero. |
| D2 | P1 | **Lưới danh mục Home desktop**: 4 ảnh nhỏ ~50 px rải trên hàng rộng 1.300 px, rất thưa, nhãn 11 px. `desktop-home-00` | Thẻ danh mục lớn (ảnh 4:5 ~280 px, nhãn 16 px) hoặc giới hạn hàng ở ~900 px căn giữa. |
| D3 | P1 | **Chiều rộng nội dung không thống nhất**: campaign tràn viền, rail gợi ý giới hạn ~1.180 px, PLP/checkout dùng lề 48 px, giỏ hàng chỉ ~670 px. `desktop-home-01`, `desktop-cart-items` | Chốt 2 mức: full-bleed (editorial) và container 1.344 px lề 48 px (commerce). Rail Home dùng container commerce. |
| D4 | P1 | **PDP desktop**: cột thông tin kết thúc cách mép phải ~90 px trong khi lề trái 48 px, bố cục lệch; ảnh không chiếm hết chiều cao viewport. `desktop-pdp-00` | Lưới 7/5 cột trong container chuẩn; gallery dính (sticky) khi cuộn phần mô tả; ảnh cao ~calc(100vh − header). |
| D5 | P2 | **Footer desktop**: khối "09:00 → FINE." treo ở cột phải, mũi tên lệch phải so với chữ; không thẳng hàng với 3 cột link. | Đưa thành dải chữ lớn chạy ngang cuối footer, hoặc bỏ mũi tên rời và dùng "09:00 → FINE." trên một dòng. |
| D6 | P2 | **Voucher desktop**: lưới 2 cột với 3 thẻ để lại ô trống, chiều cao thẻ không đều. `desktop-account-vouchers-00` | 1 cột thẻ ngang rộng (giống Figma account) hoặc 3 cột đều chiều cao. |
| D7 | P2 | **Search panel desktop**: ô tìm kiếm căn giữa (bắt đầu ~380 px) nhưng chip "Tìm kiếm phổ biến" căn lề trái 48 px, hai khối không cùng trục. `desktop-search-panel` | Căn chip theo mép trái ô tìm kiếm. |
| D8 | P2 | Utility bar dùng chữ serif nghiêng "From Nine to Fine." cỡ nhỏ, khác hẳn font còn lại của header. | Giữ Playfair Italic nhưng tăng lên 13 px, hoặc dùng Nunito Sans cho đồng bộ. |

## 4. Thứ tự đề xuất triển khai

1. **Đợt 1 — Nền tảng nhất quán (P0 xuyên suốt, cả 2 nền tảng):** G8 hướng drawer, G1 hệ nút, G2 promo strip, G3 footer, G5 lề trang + D3 chiều rộng nội dung. Ảnh hưởng mọi trang nên làm trước.
2. **Đợt 2 — Luồng mua (mobile + desktop):** L1, C1, C2, C3, K1, K3, K4, A1, A2, D4.
3. **Đợt 3 — Hoàn thiện (P1):** G4, G6, H1–H4, D1, D2, L2–L4, P1–P2, K2, A3, A4.
4. **Đợt 4 — P2** khi có ảnh thật hoặc còn thời gian.

Mỗi đợt: chụp lại ảnh trước/sau ở 390/768/1440, chạy lint/build/E2E, cập nhật ledger mục 59 của master plan.

## 5. Cần người dùng quyết định

1. **Màu nút chính (G1):** đỏ thương hiệu cho hành động mua (khuyến nghị, đúng Figma) hay đen cho mọi nút chính?
2. **Menu tài khoản mobile (A1):** giữ thanh cuộn ngang có cải tiến (ít thay đổi) hay đổi sang trang danh sách kiểu app (khuyến nghị cho mobile)?
3. **Header checkout (K2):** rút gọn (khuyến nghị) hay giữ header đầy đủ?
4. **Nhãn khoảnh khắc (G4):** tiếng Việt cho commerce (khuyến nghị) hay giữ tiếng Anh?
5. **Hướng drawer (G8):** hamburger trái + drawer từ trái (khuyến nghị) hay hamburger phải + drawer từ phải?
