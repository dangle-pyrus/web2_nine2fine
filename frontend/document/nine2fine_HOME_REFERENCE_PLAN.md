# Kế hoạch nâng cấp Home nine2fine từ UNIQLO × Nike

**Ngày phân tích:** 2026-10-04  
**Trạng thái:** Đã giữ bố cục Angular theo bản UNIQLO và chuyển copy sang nine2fine: 11 campaign, 4 danh mục catalog, 3 dải gợi ý phối đồ, toàn bộ CTA thương mại dùng route nội bộ. Ảnh tham khảo vẫn tạm thời; không gán ảnh UNIQLO thành SKU nine2fine. Nội dung nguồn và Home cũ được giữ để đối chiếu. Các đề xuất phía dưới là tài liệu lịch sử cho những bước tiếp theo.  
**Phạm vi:** Chỉ Home, các điểm vào danh mục/sản phẩm và motion của Home. Giữ nhận diện auth/account và các luồng commerce hiện có.

## 1. Điều quan sát được và bài học áp dụng

Nguồn chính: [UNIQLO UK](https://www.uniqlo.com/uk/en/), [ghi chú cập nhật trải nghiệm của UNIQLO](https://www.uniqlo.com/uk/en/special-feature/service-update), [Nike Việt Nam](https://www.nike.com/vn/). Nội dung campaign thay đổi theo thời gian. Trang UNIQLO trả về phần Home hạn chế qua trình đọc web; phần nhận xét về cấu trúc dựa thêm vào trang cập nhật chính thức của họ. Không coi đây là bản audit pixel hoặc motion trực tiếp của hai website.

| | Điểm mạnh quan sát được | Bài học cho nine2fine |
|---|---|---|
| UNIQLO | LifeWear là trục thương hiệu; category, tìm kiếm, New Arrivals và sản phẩm liên quan trên Home giúp khách đi thẳng đến món đồ. UNIQLO công bố bản cập nhật Home tháng 4 và 7/2026 nhằm tăng khả năng tìm kiếm và nối nội dung với PDP. | Giữ câu chuyện sống cùng trang phục, nhưng đặt lối vào mua sắm rõ ràng ngay sau hero và gắn SKU thật với mỗi editorial look. |
| Nike | Trang chủ tổ chức theo các lớp campaign hero, Featured/Trending, The Latest, dải sản phẩm và Shop by Sport. Headline ngắn, ảnh lớn, CTA rõ và nhiều điểm vào theo nhu cầu. | Dùng nhịp hình ảnh lớn → sản phẩm cụ thể → khoảnh khắc sử dụng. Chỉ chọn 1 campaign chủ đạo mỗi lần; không chất nhiều thông điệp ngang cấp. |

**Định vị nine2fine:** Premium đến từ ảnh cùng một art direction, trang phục nhìn rõ, crop có chủ ý, khoảng trống và nhịp chữ; năng động đến từ chuyển cảnh ngày–đêm và tương tác nhanh. Không sao chép bố cục, copy, hình ảnh hoặc nhịp motion của thương hiệu tham chiếu.

## 2. Hiện trạng đã đối chiếu với code và ảnh chụp

- Home hiện có 9 khối: hero, story 09:00/17:30/20:00, Shop by Moment, New Drop, Best Sellers, USP, campaign, reviews và After Five Club. Thứ tự theo master plan mục 45.
- Hero đã có ảnh riêng desktop/mobile, intro GSAP, CTA hiện ngay; story desktop dùng CSS sticky + IntersectionObserver và mobile thành các khối dọc; reveal, image mask, stagger và parallax campaign dùng GSAP tải lười, có reduced-motion.
- Ảnh Pexels editorial là tạm thời và ánh sáng/styling chưa thật đồng nhất. Ảnh sản phẩm New Drop/Best Sellers vẫn là unDraw placeholder. Trong ảnh chụp Home ngày 2026-10-03, sự chênh lệch giữa ảnh editorial và placeholder là điểm làm giảm cảm giác cao cấp rõ nhất.
- Story nối mỗi mốc với một product slug nhưng ba mốc hiện tham chiếu ba sản phẩm khác nhau. Copy “một outfit” cần được thể hiện bằng cùng một look hoặc diễn đạt lại chính xác; không dùng ảnh stock khác nhau để ngụ ý đó là một bộ đồ biến đổi.
- USP Reversible/Removable/Wrinkle-resistant đang đánh dấu provisional; sample reviews không phải nhận xét thật. Hai khối này chưa thể đóng vai trò bằng chứng chất lượng.
- Không có page transition; chưa có số đo Lighthouse/LCP. Ledger gần nhất ghi 42 E2E pass, 2 skip và build/lint/format pass cho lần sửa 2026-10-03; đó không phải kết quả kiểm thử của kế hoạch này.

## 3. Home đề xuất: một đường đi từ cảm xúc đến sản phẩm

| Vị trí | Vai trò và nội dung | Thay đổi so với hiện tại |
|---|---|---|
| 1. Hero “From Nine to Fine” | Một key visual hoặc video rất ngắn nếu có asset chuẩn; trang phục phải thấy rõ. Một câu định vị, CTA “Khám phá bộ sưu tập” và CTA “Xem một ngày cùng nine2fine”. | Giữ nền tảng hiện có, chỉnh art direction/crop và phân cấp chữ; CTA luôn dùng được, không chờ intro. |
| 2. Grid danh mục sản phẩm | Áo, Quần & chân váy, Đầm, Áo khoác. 4 cột desktop, 2×2 mobile; ảnh editorial, tên danh mục, link đến `/shop/:category` và link xem tất cả. | Người dùng xác nhận grid ngay dưới hero ngày 2026-10-04. Nhãn và route lấy theo catalog hiện có; phân biệt với Shop by Moment ở phía dưới. |
| 3. Signature story | Cùng một look 09:00 → 17:30 → 20:00; ở từng mốc thấy cách styling thay đổi, có tên sản phẩm và link PDP. | Rút copy, làm rõ tính liên tục và giảm chiều dài cảm giác “cuộn mãi”; nếu chưa có ảnh cùng look, dùng concept “3 cách mặc cho 3 khoảnh khắc” trung thực hơn. |
| 4. Shop by Moment | Bốn ảnh Work/Dinner/Event/Weekend, hình ảnh là lối chọn chủ đề. | Giữ, nhưng bảo đảm ảnh cùng tông và nhãn/CTA dễ đọc trên mobile. |
| 5. New Drop + shoppable look | Ảnh editorial lớn cạnh 2–3 món thực sự có trong look; ảnh sản phẩm thật, tên, giá, link PDP và link collection. | Ưu tiên thay placeholder, map look ↔ SKU cụ thể. Đây là điểm chuyển đổi quan trọng nhất. |
| 6. Best Sellers | Dải sản phẩm gọn, đầy đủ ảnh trước/sau, màu, giá và hành động rõ. | Chỉ hiện khi có ảnh đúng SKU; nếu chưa có thì dùng một dải editorial có link collection thay vì card giả. |
| 7. After Hours campaign | Một chương hình ảnh đậm chất thành phố lúc tối, dẫn đến Dinner/Evening collection. | Giữ làm cao trào thứ hai; tránh lặp hero và giữ chữ/CTA trong vùng đọc tốt. |
| 8. Chất lượng & niềm tin | 2–3 điều có chứng cứ (chất liệu, phom, chăm sóc, chính sách); review thật khi có nguồn. | USP provisional và sample reviews không được trình bày như lời hứa/chứng thực. Có thể thu gọn hoặc ẩn cho đến khi xác nhận. |
| 9. After Five Club | Kết trang gọn, một lợi ích cụ thể và form rõ trạng thái mock/live. | Giữ, không làm cạnh tranh thị giác với campaign. |

**Nhịp trang:** Brand → Category grid → Story → Product → Campaign → Trust → Club. Mỗi khối trả lời một câu hỏi: “Đây là ai?”, “Mua ở đâu?”, “Mặc trong hoàn cảnh nào?”, “Món nào?”, “Vì sao tin?”.

## 4. GSAP là lợi thế riêng, có giới hạn rõ

1. **Hero:** ảnh hiện ngay; chữ và đường thời gian 09:00 → 20:00 vào theo một timeline ngắn. Chỉ transform/opacity, CTA luôn tương tác được.
2. **Story:** khi mốc vào vùng đọc, chuyển ảnh và nhãn thời gian đồng bộ; có thể animate đường nối thời gian. Desktop giữ CSS sticky, không khóa scroll. Mobile chuyển thành từng cảnh dọc, không pin dài.
3. **New Drop:** image mask mở ảnh, sau đó hiện đúng 2–3 product cards liên quan; animation dừng ở nội dung, không cản link hay hover/focus.
4. **Campaign:** parallax rất nhẹ trên desktop có hover; không áp dụng trên touch. Một chuyển sắc ngày → đêm đủ tạo nhận diện, tránh hiệu ứng trên mọi ảnh.
5. **Điều hướng Home → collection/campaign:** thử transition “09 → FINE” tối đa khoảng 0,5–0,7 giây, có thể bỏ qua và không chờ asset mạng. Chỉ triển khai sau khi các phần trên và navigation ổn định.

Tất cả motion cần có trạng thái cuối hiển thị nếu JS lỗi, hỗ trợ `prefers-reduced-motion`, cleanup khi route đổi, không animate giá/CTA/điều khiển kích thước. Không thêm scroll hijacking hoặc nhiều layer parallax cùng lúc.

## 5. Thứ tự thực hiện và điều kiện hoàn thành

### Giai đoạn A — Nền hình ảnh và nội dung (ưu tiên cao nhất)

- Chốt 1 art direction cho bộ ảnh: ánh sáng, bảng màu, người mẫu, chất liệu, tỷ lệ ảnh, vị trí chữ và crop desktop/mobile.
- Cần ảnh sản phẩm theo SKU cho New Drop/Best Sellers, ảnh look có trang phục rõ, và nếu muốn kể “một outfit”, cần ba khung hình cùng một look. Ghi provenance trong media manifest; không gắn stock khác trang phục vào cùng SKU.
- Chốt copy hero/story, tên campaign, 2–3 chứng cứ chất lượng và trạng thái review. Nếu chưa có chứng cứ, loại khối USP/review khỏi vai trò thuyết phục.
- Deliverable: shot list + mapping media slot ↔ SKU/CTA + wireframe desktop/mobile. Đây là điều kiện trước khi tăng motion.

### Giai đoạn B — Bố cục và đường mua

- Thêm shopping gateway sau hero; nối editorial look đến PDP; sắp lại story và các cụm sản phẩm theo nhịp trên.
- Gateway đã được cụ thể hóa thành **grid danh mục sản phẩm** theo yêu cầu mới, không thay bằng danh sách moment/campaign. Dùng ảnh Pexels đã có cho category; không biểu diễn chúng như ảnh hàng thật theo SKU.
- Giữ thông tin giá, màu, trạng thái tải/lỗi và đường quay lại danh mục. Không thay đổi auth/account hay refactor commerce ngoài nhu cầu Home.
- Deliverable: bản Home responsive với mọi CTA có đích hợp lệ và ảnh sản phẩm thật hoặc trạng thái tạm được trình bày trung thực.

### Giai đoạn C — Motion, đo lường và tinh chỉnh

- Áp dụng 3–4 choreography chính; đo chi phí ảnh và animation trước khi thêm page transition.
- Kiểm thử viewport 375, 390, 430, 768, 1024, 1280, 1440, 1920; keyboard, reduced-motion, touch, route back và trạng thái mạng chậm/lỗi.
- Gate kỹ thuật: lint/format/build/E2E liên quan pass; không tràn ngang; CTA không bị che; LCP và CLS được đo trên mobile/desktop và so với baseline trước sửa. Mục tiêu ban đầu: LCP ≤ 2,5 giây, CLS ≤ 0,1 ở điều kiện đo đã ghi lại, không coi là lời hứa trên mọi thiết bị.
- Gate sản phẩm: người xem nhận ra đề xuất desk-to-dinner trong hero, đến được New In/Work/Dinner trong tối đa 1–2 thao tác từ đầu trang, và mỗi ảnh look có đường tới sản phẩm tương ứng.

## 6. Quyết định cần có trước khi code

1. Story có dùng **một outfit thật xuyên ba mốc** hay đổi thông điệp thành **ba cách phối cho ba khoảnh khắc** trong giai đoạn ảnh tạm?
2. Có ảnh sản phẩm chính thức hoặc lịch chụp không? Nếu chưa, ưu tiên thiết kế gateway/story/campaign, còn dải card sản phẩm đợi ảnh đúng SKU.
3. Các USP nào đã được xác nhận cho từng sản phẩm? Review thật có nguồn hay chưa?

Đề xuất mặc định: giữ một campaign chính “From Nine to Fine”; dùng “ba cách phối” nếu chưa có bộ ảnh một outfit; không đưa claim/review mẫu vào khu vực thuyết phục chính.

## 7. Triển khai đợt đầu — 2026-10-04

- User đã yêu cầu bắt đầu thực thi và thêm grid category ngay dưới hero. Đã thực hiện grid typed content dùng bốn category chuẩn của catalog, 4 cột desktop và 2×2 mobile, GSAP stagger, hover/focus và reduced-motion.
- Story dùng thông điệp ba gợi ý phối đồ; nhãn PDP là “Gợi ý phối cùng”, không còn tuyên bố người mẫu đang mặc SKU fixture. Thêm điều hướng ba mốc, tiến trình GSAP theo cuộn, giảm chiều dài desktop và giữ text luôn rõ.
- Chưa thay ảnh sản phẩm, chưa loại/biên tập lại USP/reviews và chưa làm page transition. Đây là các đợt tiếp theo; không coi toàn bộ bảng đề xuất mục 3 đã được triển khai.
- Kết quả kiểm thử của đợt đầu ghi ở master-plan ledger mục 59; ảnh QA và viewport report ở `.open-figma-mcp/exports/home-category-grid/`.

### Mapping ảnh cho đợt đầu và brief ảnh thay thế

| Slot | Media hiện tại | Đích | Ảnh cần thay sau |
|---|---|---|---|
| Áo | `editorial-home-hero-mobile` | `/shop/tops` | Người mẫu với áo là chủ thể, phông sáng, crop dọc 3:4 |
| Quần & chân váy | `editorial-new-drop` | `/shop/bottoms` | Toàn thân, nhìn rõ phom quần/chân váy, chuyển động nhẹ |
| Đầm | `editorial-moment-event` | `/shop/dresses` | Đầm nhìn trọn phom, ánh sáng và khoảng cách máy đồng nhất với các category khác |
| Áo khoác | `editorial-story-0900` | `/shop/outerwear` | Blazer/áo khoác nhìn rõ cấu trúc, phông ít chi tiết |
| Story 09:00/17:30/20:00 | `editorial-story-*` | Ba PDP gợi ý hiện có | Cùng người mẫu/outfit nếu muốn claim “One Look”; ảnh dọc 4:5 và vùng trống cho crop |
| New Drop / Best Sellers | Product fixtures vẫn dùng placeholder | PDP từng SKU | Ảnh sản phẩm thật 4:5, cùng nền/ánh sáng; ảnh trước và góc thứ hai phải cùng sản phẩm |

Ảnh trong grid là cảm hứng danh mục, dùng lại asset đã có qua manifest nên không phát sinh file tải mới. Giữ metadata nguồn/credit. Với buổi chụp mới, ưu tiên nền trắng ngà/xám ấm, trang phục đen–kem–xám, dùng ánh sáng mềm nhất quán; ảnh buổi tối có thể ấm hơn nhưng vẫn thấy rõ chất liệu.
