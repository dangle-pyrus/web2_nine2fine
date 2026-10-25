# nine2fine — Website Master Plan

> **Project:** nine2fine  
> **Domain:** Fashion Ecommerce — Desk-to-Dinner  
> **Primary audience:** Gen Z interns / early-career professionals  
> **Primary channel:** D2C Website  
> **Secondary ecosystem:** Shopee / TikTok Shop / future omnichannel admin  
> **Motion stack:** GSAP  
> **Document purpose:** Product + UX/UI + Front-end implementation blueprint for Codex

> **Context version:** 2.1 — 2026-10-02
> **Implementation framework:** Angular + TypeScript
> **Current delivery:** Interactive frontend with mock data and backend integration boundaries
> **Temporary photography:** Curated Pexels assets after the user supplies API access
> **Current status:** First commerce slice + Figma token audit + auth onboarding implemented; verification in section 59

## 0. Persistent Project Context

Đây là tài liệu context chính cho các lần thực thi tiếp theo. Đọc phần này và phần liên quan đến task trước khi thay đổi code. Yêu cầu trực tiếp mới nhất của người dùng được ưu tiên; ghi lại quyết định đã thống nhất vào tài liệu để tránh mất context.

### 0.1. Decisions Confirmed With the User

- Xây frontend bằng **Angular**, thay cho đề xuất Next.js/React trước đây.
- Sản phẩm đợt này là website frontend có tương tác, responsive và dữ liệu mock. Chưa triển khai backend, thanh toán thật, đồng bộ sàn hoặc quản trị omnichannel.
- Chuẩn bị lớp API để kết nối backend về sau; không gọi HTTP trực tiếp trong visual component.
- Bám Figma và master plan. Giữ visual direction auth/onboarding/account hiện có; chỉ sửa khi cần cho usability/accessibility/responsive.
- Asset thương hiệu hiện có trong `asset/`. Người dùng sẽ tự thay asset chưa phù hợp sau.
- Người dùng bổ sung `svg/`: 1.379 illustration unDraw, được phép dùng khi phù hợp. Chỉ publish các file đang dùng; ưu tiên empty/error states, không coi illustration là ảnh sản phẩm thật.
- Được phép chọn lọc **ảnh Pexels tạm thời** cho các vị trí thiếu ảnh. Người dùng sẽ cung cấp API access; chưa có API key trong context hiện tại.
- Không chặn xây dựng toàn bộ frontend chỉ vì chưa có ảnh chính thức. Dùng media manifest và placeholder đúng tỷ lệ nếu việc lấy ảnh còn chờ API.
- Icon giao diện dùng **Reicon** qua `@ng-icons/core` + `@ng-icons/reicon`, import và đăng ký riêng từng icon. `reicon-angular@1.0.1` đã thử nhưng package npm thiếu generated components/entrypoint, nên đã gỡ. Đây là thay adapter, không đổi bộ icon.
- Quyết định cho Homepage (2026-10-02): ảnh lấy từ Pexels khi người dùng cấp `PEXELS_API_KEY` (đặt trong `.env` cục bộ, đã gitignore, chỉ script local đọc); typography Home dùng Nunito Sans đậm cho tiêu đề và Playfair Display Italic làm điểm nhấn câu cảm xúc (theo Brand Guidelines); section "Designed to Move With You" giữ nhưng đánh dấu nội dung tạm chờ xác nhận tính năng, không dùng ảnh làm bằng chứng; mốc thời gian chuẩn "One Look. Three Moments." là 09:00 / 17:30 / 20:00 (PDP "Mặc theo cách của bạn" phải đổi theo).
- Quyết định cho Homepage (2026-10-03): Home theo hướng **quiet luxury bằng hình ảnh**, không đổi font. Ảnh editorial tràn viền, cao gần bằng viewport, góc vuông (không radius), nhiều khoảng trắng; CTA brand dạng chữ in hoa tracking + gạch chân hairline; đỏ thương hiệu chỉ làm điểm nhấn/hover. Commerce (ProductCard, header, PLP/PDP/checkout/account) giữ nguyên.
- Quyết định cho Header (2026-10-11): theo Nike VN về **nội dung và animation** (utility bar, mega menu, promo strip, drawer mobile), giữ nguyên **design** nine2fine (logo, pill search, giỏ hàng + badge, nút tài khoản tròn, Nunito Sans). Mỗi menu xổ xuống có ảnh minh họa để dễ nhận biết danh mục. Thêm mục cấp 1 "Khoảnh khắc".
- Quyết định cho Homepage (2026-10-04): bắt đầu triển khai `document/nine2fine_HOME_REFERENCE_PLAN.md`, thêm **grid category sản phẩm ngay dưới hero**: Áo / Quần & chân váy / Đầm / Áo khoác, 4 cột desktop và 2×2 mobile. Story trong giai đoạn ảnh tạm dùng ba gợi ý phối đồ ở 09:00 / 17:30 / 20:00; product link là gợi ý liên quan, không claim đó là sản phẩm người mẫu đang mặc. “One Look” chỉ áp dụng khi có bộ ảnh cùng outfit thật.
- Yêu cầu mới nhất cho Home (2026-10-04): giữ bố cục bản nhập UNIQLO, chuyển content sang nine2fine và rút gọn category. Home hiện có 11 campaign theo nhịp đi làm / hẹn tối / cuối tuần, 4 danh mục (Áo, Quần & chân váy, Đầm, Áo khoác), 3 dải gợi ý phối đồ. CTA dùng route nội bộ, bỏ giá GBP/ưu đãi/logo copy nguồn. Ảnh tham khảo vẫn được giữ tạm, không gán thành SKU nine2fine; các ảnh campaign có thương hiệu/cửa hàng nổi bật được thay bằng stock sẵn có. Fixture hiện hành: `src/mocks/nine2fine-landing.ts`; bản nguồn `uniqlo-home.ts` và HTML gốc được giữ để đối chiếu. Header/footer không đổi.
- Tuân thủ quy chuẩn trong `G:\Obsidian\Thang's Workspace\03. Resources\Code\Rules\Clean-code.md`, đã đọc khi lập kế hoạch. Phần 56 ghi lại các nguyên tắc áp dụng để context có thể tiếp tục ở máy khác.

### 0.2. Source References and Known Limits

- Figma: https://www.figma.com/design/hVemXUpaUanU4ObWBHJT7d/Web2_nine2fine?node-id=0-1
- Reicon: https://reicon.dev/icons
- Workspace: `G:\UEL\nam4\webplus\project`.
- Figma được đọc qua plugin cục bộ `open-figma-mcp` (Figma Desktop, bridge `127.0.0.1:18765`) từ 2026-10-02, không còn phụ thuộc quota Starter. Export audit lưu ở `.open-figma-mcp/exports/` (tool chỉ cho ghi trong workspace). Đã audit Brand Guidelines `12:42` và 5 frame onboarding; các frame Heading, account-manage, order detail và trang `component` chưa đối chiếu với code. Không claim pixel parity cho phần chưa audit.
- Workspace đã có Angular app, lockfile, README, AGENTS.md và E2E tests. Chưa khởi tạo Git repository.
- Token đã trích từ Figma: đỏ logo `#F6090D` (`--brand-mark`, chỉ cho logo/monogram), đỏ CTA `#D9070C` (`--brand`), đỏ bắt buộc `#D9080D` (variable Figma), ink `#111111`, heading `#171717`, muted `#595959`, line `#D9D9D9`, canvas `#F7F6F3`, bo góc card 12px / nút 6px. Font: trang guideline ghi Manrope nhưng mọi frame thực tế dùng **Nunito Sans** → đang dùng Nunito Sans (Google Fonts); cần người dùng xác nhận.

### 0.3. Current Scope and Deferred Scope

Đợt frontend gồm các trang P0 trong phần 52, wishlist, Shop by Moment, component tái sử dụng và motion theo master plan. Reviews, recommendations, promotions và nội dung editorial dùng fixture khi cần; không ngụ ý đã có dịch vụ thật.

P2, loyalty thực tế, AI styling, quản trị tồn kho đa kênh, backend auth, payment gateway và triển khai production là phạm vi sau. Bản frontend mô phỏng trạng thái đơn/thanh toán; backend mới là nguồn xác nhận thực tế cho tiền, tồn kho, quyền truy cập và đơn hàng.

### 0.4. Resume Protocol

1. Đọc phần 0, 46, 56–59 và phần nghiệp vụ liên quan; kiểm tra file/code thực tế trước khi hành động.
2. Xác định task đang làm, kết quả đã xác minh và việc còn dở trong execution log. Không mặc định task hoàn thành vì có code.
3. Tiếp tục task có phạm vi rõ; giữ thay đổi của người dùng. Không cài lại, scaffold lại hoặc redesign phần đã hoàn thành nếu không có lý do.
4. Khi kết thúc mỗi task, cập nhật phần 59: trạng thái, file liên quan, kiểm thử thực sự đã chạy, quyết định mới, hạn chế và bước tiếp theo.
5. Không ghi API key, token, mật khẩu, dữ liệu khách hàng hoặc secret vào tài liệu/log/fixture.

---

## 1. Product Vision

nine2fine là thương hiệu thời trang công sở dành cho người trẻ mới đi làm, với định vị chính:

> **From Nine to Fine.**

Sản phẩm không chỉ phục vụ thời gian làm việc 9-to-5 mà cần có khả năng chuyển tiếp tự nhiên sang các hoạt động sau giờ làm như đi ăn tối, gặp bạn bè, tham dự sự kiện hoặc đi chơi.

Website phải truyền tải được hai giá trị song song:

1. **Brand experience**
   - Có cá tính thời trang rõ ràng.
   - Có storytelling.
   - Có motion.
   - Có visual identity riêng.

2. **Commerce experience**
   - Tìm sản phẩm nhanh.
   - Hiểu sản phẩm nhanh.
   - Chọn biến thể dễ dàng.
   - Thanh toán rõ ràng.
   - Theo dõi đơn hàng thuận tiện.

Không xây website theo hướng:

- Portfolio thời trang có gắn nút mua hàng.
- Landing page GSAP quá nặng.
- Clone Zara / H&M / Uniqlo.
- Mỗi trang dùng một style UI khác nhau.
- Animation làm chậm hành vi mua hàng.

---

# 2. Experience Principle

## 2.1. Core UX Formula

```text
Editorial Fashion
+
Ecommerce Clarity
+
Purposeful GSAP Motion
+
Desk-to-Dinner Storytelling
=
nine2fine
```

Nguyên tắc kiểm tra toàn website:

> **Motion tạo desire. UI tạo confidence. Commerce tạo conversion.**

---

## 2.2. Hai chế độ trải nghiệm

### Brand Mode

Áp dụng cho:

- Homepage
- Campaign
- Lookbook
- About
- Editorial content

Đặc điểm:

- Typography lớn
- Full-bleed imagery
- GSAP mạnh hơn
- Scroll storytelling
- Image reveal
- Parallax có kiểm soát
- Page transition

### Commerce Mode

Áp dụng cho:

- Collection / Product Listing
- Search
- Product Detail core area
- Cart
- Checkout
- Account
- Order tracking

Đặc điểm:

- Ưu tiên usability
- Motion ngắn
- Không scroll hijacking
- Không animation dài trước CTA
- Layout quen thuộc với ecommerce
- Trạng thái và giá tiền luôn rõ

---

# 3. Brand & Visual Direction

## 3.1. Visual Personality

nine2fine nên nằm giữa:

| Attribute | Direction |
|---|---|
| Fashion | Editorial |
| Gen Z | Contemporary |
| Office | Clean |
| After-work | Confident |
| Premium | Spacious |
| Affordable | Approachable |
| Motion | Choreographed |
| Commerce | Functional |

Tone tổng thể:

> **Editorial × Functional × Dynamic**

---

## 3.2. Core Colors

```text
White        #FFFFFF
Black        #0A0A0A
Brand Red    Use official brand red token
Gray 50      #F7F7F7
Gray 100     #F1F1F1
Gray 300     #D5D5D5
Gray 500     #8A8A8A
Gray 700     #444444
Success      semantic token
Warning      semantic token
Error        semantic token
```

### Color rule

Brand Red dùng cho:

- CTA chính
- Active states
- Sale
- Hover indicator
- Motion accent
- Signature typography

Không dùng Brand Red làm background chính cho quá nhiều section.

---

# 4. Typography Direction

Website cần tối thiểu hai vai trò typography.

## Display

Dùng cho:

- Hero
- Campaign title
- Large editorial section
- Numbers / timestamps
- Brand message

Phong cách:

- Bold
- Condensed hoặc neo-grotesk
- Strong personality

## UI Sans

Dùng cho:

- Product name
- Price
- Filter
- Navigation
- Input
- Checkout
- Order information
- Account

Ưu tiên:

- Dễ đọc
- Không quá stylized
- High legibility

---

# 5. Layout System

## Desktop

```text
Max content width: 1440px
Standard content width: 1280–1360px
Page horizontal padding: 48–64px
Section spacing: 96–160px
Header: 64–72px
```

## Tablet

```text
Horizontal padding: 32px
Section spacing: 72–112px
```

## Mobile

```text
Horizontal padding: 16–20px
Section spacing: 56–88px
Header: 56–64px
```

Không ép mọi section vào cùng một max-width.

Campaign / editorial có thể full viewport.

Commerce nên giữ grid ổn định.

---

# 6. Information Architecture

```text
nine2fine
│
├── Home
│
├── New In
│
├── Shop
│   ├── Tops
│   ├── Bottoms
│   ├── Dresses
│   ├── Outerwear
│   └── Accessories
│
├── Collections
│
├── Shop by Moment
│   ├── Work
│   ├── Dinner
│   ├── Event
│   └── Weekend
│
├── Product Detail
│
├── Search
│
├── Wishlist
│
├── Cart
├── Checkout
│
├── Order Success
│
├── Order Tracking
│
├── Account
│   ├── Profile
│   ├── Orders
│   ├── Addresses
│   └── Wishlist
│
├── Promotions
├── About nine2fine
├── Help
└── Policies
```

---

# 7. Header

Desktop structure (đã triển khai 2026-10-11 — nội dung/animation theo Nike VN, visual giữ Figma `header (1)`):

```text
From Nine to Fine.            Tra cứu đơn hàng | Yêu thích | Tham gia | Đăng nhập   ← utility bar 36px
nine2fine   Sản phẩm mới  Nam  Nữ  Khoảnh khắc      [ Bạn đang tìm gì đó? ]  BAG  ACCOUNT
            └ hover → mega menu: cột link (Nổi bật / Danh mục / Theo khoảnh khắc) + ảnh preview
Miễn phí giao hàng cho đơn từ 1.000.000 ₫ · Đổi trả trong 30 ngày   Tham gia ngay   ← promo strip
```

- Mega menu: hover-intent 150 ms (đổi menu tức thì khi đã mở), đóng sau 200 ms khi rời header; panel wipe bằng `clip-path` 250 ms, các cột rise-in so le 45 ms, scrim tối `#1111115c`. Ảnh preview đổi theo link đang hover/focus (danh mục/khoảnh khắc). Bàn phím: nút chevron ẩn hiện khi focus, Enter mở/đóng, Escape đóng và trả focus; luôn hiện trên màn cảm ứng.
- Mobile: drawer phải (Nike) với panel con trượt vào, ảnh lớn đầu panel và thumbnail cạnh link, khối thành viên (Tham gia / Đăng nhập), Giỏ hàng / Tra cứu đơn hàng / Yêu thích. Focus trap, Escape, khóa cuộn nền.
- Tìm kiếm (2026-10-11, theo Nike): bấm pill/icon → tấm trắng wipe xuống phủ header (logo · ô tìm kiếm · Hủy), nền tối. Chưa gõ: "Tìm kiếm gần đây" (lưu cục bộ `n2f.search.recent.v1`, tối đa 5, có nút xóa) + "Tìm kiếm phổ biến" (chip). Đang gõ: cột "Gợi ý hàng đầu" (danh mục/khoảnh khắc mở thẳng trang, từ khóa → `/search?q=`, phần khớp in đậm) + tối đa 5 thẻ sản phẩm và "Xem tất cả kết quả (n)". Combobox: ↑/↓, Enter, Escape; debounce 250 ms và hủy request cũ; mobile toàn màn hình. Chuyển động liền mạch (2026-10-11): ô pill trên header morph (FLIP vị trí + kích thước, 340 ms) thành ô tìm kiếm của panel, thanh nền/logo/Hủy fade, kết quả mở xuống; đóng chạy ngược 260 ms về đúng pill rồi mới gỡ panel. Như mega menu: khi tìm kiếm, cả header (kể cả utility bar) chuyển nền đặc và scrim chỉ phủ từ thanh chính trở xuống.
- Promo strip ẩn trên landing overlay và `/checkout`. "Tham gia" trỏ `/auth/login` vì đăng ký bắt đầu từ bước nhập email.

## Header behavior

### At top of editorial hero

- Transparent background
- Text màu tương phản với hero

### After scrolling

- Landing `/`: giữ header overlay trong suốt ở mọi vị trí cuộn, chữ/logo sáng và gradient nhẹ như đầu trang (quyết định 2026-10-04). Khi mega menu mở, header chuyển nền trắng.
- Desktop (>800px): utility bar trượt lên 36px (150 ms) ngay khi trang cuộn; thanh chính giữ sticky/fixed với chiều cao như cũ.
- Menu mobile mở: dùng nền đặc để đọc và thao tác; đóng menu trở lại overlay.
- Các trang commerce: nền trắng, chữ đen, divider mảnh như hiện tại.

### Requirements

- Sticky hoặc fixed
- Header height khoảng 64–72px desktop
- Mobile khoảng 56–64px
- Cart count luôn visible
- Search dễ truy cập
- Không nhồi quá nhiều menu level 1

---

# 8. Homepage Structure

> Active override (2026-10-04): Home retains the imported UNIQLO section geometry and order with nine2fine copy, four canonical categories and internal routes. The three rails are editorial suggestions, not purchasable reference SKUs. Sections 8.1–8.10 below preserve the earlier content specification; they are not the current rendered section sequence.

Homepage là nơi sử dụng GSAP mạnh nhất.

---

## 8.1. Hero — From Nine to Fine

Full viewport.

Primary message:

```text
FROM
NINE
TO FINE.
```

Secondary visual idea:

```text
09:00
WORK

↓

18:30
DINNER
```

CTA:

- Shop New Collection
- Explore the Look

### GSAP

Có thể dùng:

- Intro timeline
- Text reveal
- Image masking
- Transform
- Scroll-linked composition

Không trì hoãn CTA cho đến khi animation hoàn tất.

---

## 8.1a. Product Category Grid — 2026-10-04

Ngay dưới hero: grid Áo / Quần & chân váy / Đầm / Áo khoác. Dùng đúng `CATEGORIES` và route `/shop/:category`; desktop 4 cột, mobile 2×2, không chuyển thành carousel. Ảnh editorial lấy qua media manifest, nhãn ngoài ảnh, CTA xem tất cả `/shop`, GSAP stagger ngắn và hover/focus rõ. Đây là đường vào theo loại sản phẩm, khác Shop by Moment ở mục 8.3.

## 8.2. Signature Story — Three Moments

Trong giai đoạn ảnh Pexels tạm: “Ba khoảnh khắc. Một nhịp sống.” và ba gợi ý phối đồ; link PDP ghi “Gợi ý phối cùng”. Chỉ quay về “One Look. Three Moments.” khi có bộ ảnh cùng outfit và mapping SKU được xác nhận.

Concept:

```text
09:00
At work

17:30
Off the clock

20:00
Dinner plans
```

Desktop:

- Model image pin một phía.
- Content scroll ở phía còn lại.
- Từng state thay đổi outfit/composition.
- Gợi ý sản phẩm liên quan; chỉ ghi “đang mặc” khi ảnh thực sự được map đúng SKU.
- Có link nhảy tới ba mốc thời gian và thanh tiến trình GSAP theo cuộn; text luôn đọc rõ, CSS sticky không khóa cuộn.

Mobile:

- Không pin quá dài.
- Chuyển thành vertical story.
- Mỗi moment là một block.

### Purpose

Section này phải giải thích:

> Gợi ý cách mặc từ giờ làm đến cuộc hẹn tối, trung thực với bộ ảnh đang dùng.

---

## 8.3. Shop by Moment

4 category chính:

```text
WORK
DINNER
EVENT
WEEKEND
```

Mỗi card gồm:

- Editorial image
- Moment name
- Một câu mô tả ngắn
- CTA

Ví dụ:

```text
WORK

Sharp enough for 9AM.
Easy enough for 9PM.

Explore →
```

---

## 8.4. New Drop

Visual:

- Asymmetrical editorial grid
- 1 ảnh lớn
- 2–3 product card nhỏ
- Large collection number

Ví dụ:

```text
NEW DROP / 02
```

GSAP:

- Clip reveal
- Subtle stagger
- Image translate

Không pin.

---

## 8.5. Best Sellers

Quay trở về pure commerce.

Product card phải cho thấy ngay:

- Product image
- Product name
- Price
- Color count/swatches
- Wishlist
- New / Bestseller / Sale badge nếu có

Desktop hover:

- Default image → styled image
- Quick add có thể xuất hiện

---

## 8.6. Designed to Move With You

Section giải thích USP.

Possible pillars:

```text
REVERSIBLE

One piece.
Two ways.
```

```text
REMOVABLE

Change the detail.
Change the mood.
```

```text
WRINKLE-RESISTANT

From commute
to dinner.
```

Motion chỉ dùng khi nó giúp giải thích feature.

---

## 8.7. Editorial Campaign

Có thể dùng:

- Full width imagery
- Large typography
- Horizontal composition
- GSAP reveal

CTA:

- View Collection
- Explore Campaign

---

## 8.8. Reviews / UGC

Hiển thị:

- Review
- Outfit photos
- Instagram/TikTok-style UGC nếu có quyền sử dụng
- Rating

Không biến section này thành carousel auto-play quá nhanh.

---

## 8.9. After Five Club

Newsletter / membership style CTA.

Possible message:

```text
AFTER FIVE CLUB

New drops.
Private offers.
After-hours inspiration.
```

Input:

```text
Email address
[ JOIN ]
```

---

## 8.10. Footer

Bao gồm:

### Shop

- New In
- Work
- Dinner
- Event
- Sale

### Help

- Shipping
- Returns
- Size Guide
- Track Order
- FAQ

### Company

- About
- Contact
- Careers nếu cần

### Legal

- Terms
- Privacy
- Return Policy

### Social

- Instagram
- TikTok
- Facebook nếu sử dụng

---

# 9. Product Listing Page

Ưu tiên tốc độ tìm sản phẩm.

Desktop:

```text
NEW IN                                    34 ITEMS

[Category] [Size] [Color] [Price]         Sort ↓

┌─────────┐ ┌─────────┐ ┌─────────┐
│ Product │ │ Product │ │ Product │
└─────────┘ └─────────┘ └─────────┘
```

## Required controls

- Category
- Size
- Color
- Price
- Availability
- Sort

## Sort

Minimum:

- Featured
- Newest
- Price: Low to High
- Price: High to Low
- Best Selling

## UX rules

- Filter không reset sau khi back từ PDP.
- Có clear all.
- Mobile filter mở bottom sheet / drawer.
- Filter state phản ánh lên URL nếu phù hợp.
- Skeleton loading.
- Empty state rõ ràng.

---

# 10. Product Card

Product Card là component cốt lõi.

## Content

```text
Image
Badge
Wishlist
Product Name
Price
Compare Price
Color Swatches
```

Optional:

- Quick Add
- Low stock
- Sold out

## Interaction

Desktop hover:

```text
Image 1
→
Image 2
```

Có thể show:

```text
QUICK ADD
S M L XL
```

Mobile:

- Không phụ thuộc hover.
- Tap vào sản phẩm để mở PDP.
- Quick add chỉ dùng nếu UX vẫn rõ.

---

# 11. Product Detail Page

PDP là trang quan trọng nhất về conversion.

Desktop:

```text
┌───────────────────────────┬─────────────────────┐
│                           │ PRODUCT NAME        │
│                           │ Rating              │
│                           │ Price               │
│                           │                     │
│ PRODUCT GALLERY           │ Color               │
│                           │ Size                │
│                           │                     │
│                           │ [ ADD TO BAG ]      │
│                           │                     │
└───────────────────────────┴─────────────────────┘
```

## Product Information

Phải có:

- Product name
- Price
- Discount / compare price
- Rating
- Color
- Size
- Stock state
- Add to bag
- Wishlist
- Size guide
- Description
- Fabric/material
- Care instructions
- Shipping / return summary

---

## 11.1. Sticky Product Info

Desktop:

- Product info sticky bên phải.
- Gallery scroll bên trái.

Không pin toàn màn hình bằng GSAP.

---

## 11.2. Size Selector

Requirements:

- Disabled state rõ
- Selected state rõ
- Out-of-stock rõ
- Size guide gần selector

Không dùng dropdown nếu số size ít.

---

## 11.3. Add to Bag

Button:

```text
ADD TO BAG
```

Nếu chưa chọn size:

- Không silently fail.
- Scroll/focus về size selector.
- Hiển thị message inline.

Sau khi add:

- Mở Cart Drawer hoặc toast + drawer.
- Không auto redirect sang Cart.

---

## 11.4. Wear It Your Way

Editorial section sau product core.

```text
LOOK 01
09:00 — WORK

LOOK 02
18:30 — DINNER

LOOK 03
21:00 — NIGHT OUT
```

Đây là khu vực có thể dùng GSAP mạnh hơn PDP core.

---

## 11.5. Recommendation

Minimum:

- You may also like
- Complete the look
- Recently viewed

---

# 12. Search

Search phải là feature chính.

Header Search mở overlay.

```text
Search nine2fine
────────────────────────

blaz|

Suggested
Blazer
Black blazer
Convertible blazer

TRENDING
Work Edit
Dinner Edit
New Drop

PRODUCTS
[Product] [Product] [Product]
```

## Search requirements

- Debounce
- Keyboard navigation desktop
- Clear button
- Empty result
- Loading state
- Search history optional
- Trending keywords optional

Không yêu cầu user submit mới thấy suggestion.

---

# 13. Wishlist

Wishlist dùng cho:

- Save product
- Compare later
- Return later

Support:

- Guest local wishlist nếu có thể.
- Merge khi user login.

Wishlist card sử dụng Product Card system.

---

# 14. Cart Drawer

Primary cart interaction.

```text
YOUR BAG                              ×

[img] Convertible Blazer
Black / M

−   1   +

1.290.000 ₫

──────────────────────────────────────

Subtotal                    1.290.000 ₫

[ CHECKOUT ]

Free shipping from 1.500.000 ₫
```

## Must have

- Change quantity
- Remove
- Variant summary
- Subtotal
- Promotion summary
- Checkout CTA
- Free shipping threshold nếu có

Không show quá nhiều cross-sell làm loãng CTA.

---

# 15. Cart Page

Cart Page vẫn cần tồn tại cho:

- Review nhiều sản phẩm
- Promotion
- Shipping estimate
- Quantity editing

Desktop:

```text
Cart items                       Summary
                                Subtotal
                                Shipping
                                Discount

                                [CHECKOUT]
```

---

# 16. Checkout

Checkout là transaction zone.

> Không dùng GSAP storytelling.

Flow:

```text
Information
↓
Shipping
↓
Payment
↓
Confirmation
```

Có thể dùng:

- Single-page checkout
hoặc
- Step checkout

Ưu tiên ít friction.

---

## 16.1. Vietnam Checkout Fields

Chuẩn bị cho:

```text
Full name
Phone
Email
Province / City
District
Ward
Street address
Note
```

---

## 16.2. Payment

Có thể support:

- COD
- Bank transfer
- QR
- Payment gateway

Payment state phải rõ:

```text
Pending
Paid
Failed
Expired
```

---

## 16.3. Checkout UX Rules

- Order Summary visible.
- Desktop sticky summary.
- Mobile collapsible summary.
- Coupon không chiếm quá nhiều attention.
- Validation inline.
- Preserve data khi lỗi thanh toán.
- Không xoá cart nếu payment fail.

---

# 17. Order Success

Sau thanh toán:

```text
ORDER CONFIRMED
#N2F102918

Thank you, Minh.

Estimated delivery:
Oct 5–7
```

CTA:

- Track Order
- Continue Shopping

Guest user:

- Có thể tra cứu bằng Order ID + Phone/Email.

---

# 18. Order Tracking

Flow:

```text
Order ID
Phone / Email

[ TRACK ORDER ]
```

Timeline:

```text
● Order placed
│
● Confirmed
│
● Packed
│
○ Shipping
│
○ Delivered
```

Cancelled:

```text
Placed
↓
Confirmed
↓
Cancelled
```

Return/refund phải là flow riêng, không ép vào delivery timeline.

---

# 19. Onboarding / Authentication

## Scope rule

**Design hiện tại được giữ nguyên.**

Không redesign nếu không cần.

Chỉ điều chỉnh nếu vi phạm các quy chuẩn ecommerce/web usability sau.

### Check list

- CTA primary rõ ràng.
- Không có quá nhiều CTA ngang cấp.
- Field label không chỉ dựa vào placeholder.
- Error nằm gần field gây lỗi.
- Password requirement hiển thị rõ.
- Loading state cho OTP/login.
- Back action không xoá dữ liệu vô lý.
- Mobile keyboard phù hợp loại input.
- Focus state đầy đủ.
- Tab navigation hoạt động.
- Contrast đạt mức đọc được.
- Không ép đăng ký trước khi người dùng có thể khám phá catalog, trừ use case bắt buộc.

Nếu design hiện tại đạt các yêu cầu trên thì **không thay đổi visual direction**.

---

# 20. Account / Profile / Settings

## Scope rule

**Giữ thiết kế đã có.**

Chỉ normalize để phù hợp website ecommerce.

Minimum ecommerce account structure:

```text
Account
├── Overview
├── Orders
├── Profile
├── Addresses
├── Wishlist
└── Security / Settings
```

### UX constraints

- Orders là feature ưu tiên cao.
- Logout không được đặt cạnh action thường xuyên gây accidental click.
- Editable field phải phân biệt rõ với read-only.
- Save feedback rõ.
- Unsaved changes warning nếu cần.
- Address có default state.
- Delete action cần confirm nếu irreversible.

Không redesign lại page chỉ để match homepage editorial style.

Account nên functional.

---

# 21. Motion System

Không viết GSAP tùy hứng trong từng component.

Define motion tokens.

```text
reveal-sm
reveal-md
editorial-reveal
image-mask
stagger-grid
scroll-story
page-transition
micro
```

---

# 22. GSAP Intensity

| Page | Intensity |
|---|---:|
| Home | 5/5 |
| Campaign | 5/5 |
| Lookbook | 5/5 |
| About | 4/5 |
| PDP editorial sections | 3/5 |
| Collection | 2/5 |
| Search | 2/5 |
| Cart | 1/5 |
| Account | 1/5 |
| Checkout | 0–1/5 |

Rule:

> **Càng gần hành vi thanh toán → càng ít animation.**

---

# 23. Allowed GSAP Patterns

Recommended:

- opacity
- transform
- translate
- scale
- clip-path
- masking
- stagger
- pinned editorial story
- ScrollTrigger
- subtle parallax

Avoid:

- Frequent width animation
- Frequent height animation
- Layout reflow-heavy animation
- Scroll hijacking
- Excessive pinned sections
- Animation blocking CTA
- 3D animation không phục vụ product story

---

# 24. Page Transition

Signature transition có thể dùng:

```text
09
↓
FINE
```

Hoặc brand-red panel / black typography sweep.

Duration target:

```text
~400–600ms
```

Use for:

- Home → Campaign
- Home → Collection
- Editorial transitions

Do not use for:

- Add to cart
- Filter
- Size select
- Checkout
- Account settings

---

# 25. Reduced Motion

Phải support:

```css
@media (prefers-reduced-motion: reduce)
```

Disable hoặc simplify:

- Parallax
- Scrub
- Long pinned stories
- Complex page transition
- Large scale transforms

Fallback:

- Instant state
- Small opacity fade
- No blocked content

---

# 26. Responsive Motion

Không copy nguyên choreography desktop sang mobile.

## Desktop

Có thể:

- Pin
- Scrub
- Split layout
- Large parallax

## Mobile

Ưu tiên:

- Vertical story
- Short reveal
- No long pin
- No horizontal scroll hijack
- Faster access to CTA

---

# 27. Tech Stack

Confirmed implementation stack:

```text
Angular — standalone components, lazy feature routes
TypeScript
Angular Router
Angular HttpClient
Signals for UI and feature state
RxJS for asynchronous flows and request cancellation
Reactive Forms
SCSS + CSS custom properties for design tokens
Angular CDK for accessible overlays and focus handling
GSAP
@ng-icons/core + @ng-icons/reicon
ESLint + Prettier
```

Chốt phiên bản Angular stable cùng Node/TypeScript và peer dependencies tương thích lúc khởi tạo, rồi giữ lockfile. Không cài React/Next.js, Zustand, React Hook Form hoặc `@gsap/react` theo bản đề xuất cũ.

Đã khởi tạo Angular 22.2.1 trên Node 24.15.0, TypeScript 6.0.x; xem `package-lock.json` cho phiên bản resolved. GSAP chưa cài vì chưa đến phase motion. Không dùng `@angular/animations` deprecated. Reicon được cung cấp qua Ng Icons do lỗi đóng gói của adapter chính thức đã nêu ở phần 0.

Verification and optional tools:

```text
Playwright
Angular-compatible unit test runner
Storybook — only if component documentation needs it
Monitoring adapter — production integration later
```

Ưu tiên state service nhỏ dùng Signals, không thêm global state framework khi chưa có nhu cầu. Dùng semantic HTML và style riêng; CDK không quyết định visual design. Route public cần SEO metadata; đánh giá prerender/SSR cho catalog khi có nguồn dữ liệu triển khai, không coi client-only metadata là đảm bảo SEO đầy đủ.

---

# 28. Front-end Architecture

```text
src/
│
├── app/
│   ├── app.config.ts
│   ├── app.routes.ts
│   ├── core/                 # HTTP config, errors, session, analytics
│   ├── layouts/              # Store, checkout, account shells
│   ├── shared/
│   │   ├── ui/
│   │   ├── commerce/
│   │   └── motion/
│   └── features/
│       ├── home/
│       ├── catalog/
│       ├── product/
│       ├── search/
│       ├── cart/
│       ├── checkout/
│       ├── auth/
│       ├── account/
│       ├── wishlist/
│       ├── orders/
│       └── editorial/
├── mocks/                   # Fixtures and mock adapters
├── media/                   # Typed manifest, not binary assets
└── styles/
```

Trong feature, tách `pages`, `components`, `data-access`, `models` và state service khi có nhu cầu thực tế. Không tạo thư mục/layer rỗng chỉ để đủ sơ đồ. Component trình bày nhận input và phát output; business logic thuộc feature, HTTP/DTO mapping thuộc data-access. Chỉ đưa code vào shared khi thực sự được dùng chung.

---

# 29. Motion Architecture

```text
shared/motion/
├── reveal.directive.ts
├── stagger-reveal.directive.ts
├── image-reveal.directive.ts
├── page-transition.service.ts
├── parallax-image.directive.ts
├── scroll-story.component.ts
└── motion-tokens.ts
```

Shared services, added as needed:

```text
reduced-motion.service.ts
scroll-direction.service.ts
viewport.service.ts
```

Không duplicate GSAP setup ở từng page. Cleanup GSAP context, ScrollTrigger, subscription và listener khi component bị hủy hoặc breakpoint thay đổi. Browser APIs phải được bảo vệ nếu bật prerender/SSR; nội dung và CTA vẫn dùng được khi animation bị tắt.

---

# 30. Design System Components

Build trước page.

## Foundation

```text
Container
Section
Stack
Grid
Divider
Typography
```

## Controls

```text
Button
IconButton
Input
Textarea
Select
Checkbox
Radio
Switch
```

## Overlay

```text
Drawer
Modal
Popover
Tooltip
Toast
```

## Commerce

```text
Price
Badge
ProductCard
ProductGrid
ColorSwatch
SizeSelector
QuantitySelector
Rating
WishlistButton
OrderStatus
```

## Feedback

```text
Skeleton
EmptyState
ErrorState
LoadingState
```

---

# 31. Product Data Model

```ts
Product {
  id
  slug
  name
  description

  price
  compareAtPrice

  category
  collection

  moments[]

  variants[]
  images[]
  features[]
  looks[]

  rating
  reviews

  status
}
```

Variant:

```ts
Variant {
  id
  sku

  size
  color

  price
  inventory

  image
}
```

---

# 32. "Moment" as Domain Concept

nine2fine không chỉ phân loại sản phẩm theo category.

Dùng:

```text
moments:
- work
- dinner
- event
- weekend
```

Example:

```json
{
  "name": "Convertible Blazer",
  "moments": ["work", "dinner"]
}
```

Ứng dụng cho:

- Shop by Moment
- Search
- Recommendation
- Campaign
- PDP styling
- Future personalization

---

# 33. Commerce State Model

Product:

```text
ACTIVE
DRAFT
ARCHIVED
```

Variant:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
```

Order:

```text
PENDING
CONFIRMED
PACKING
SHIPPING
DELIVERED
CANCELLED
RETURN_REQUESTED
RETURNED
REFUNDED
```

Payment:

```text
PENDING
PAID
FAILED
REFUNDED
EXPIRED
```

Không reuse một status để biểu diễn nhiều domain khác nhau.

---

# 34. API Layer

UI không gọi fetch trực tiếp ở mọi component.

Structure:

```text
UI
↓
Feature State / Service
↓
Service
↓
API
```

Example:

```text
ProductGrid
↓
CatalogState
↓
productService.getProducts()
↓
API
```

Mock API và production API dùng cùng interface.

Dùng Angular DI token chọn mock adapter hoặc HTTP adapter theo cấu hình. Component không biết adapter nào đang chạy. Model domain tách khỏi backend DTO; mapper chuyển dữ liệu tại data-access boundary. Cấu hình endpoint/backend base URL không nằm trong template.

Hợp đồng cần chuẩn bị: pagination, filter/sort, variant identity, money/currency, field validation errors, out-of-stock, changed prices, auth expiry và payment states. Mock cần độ trễ và kịch bản lỗi có kiểm soát. Không auto-retry request tạo đơn/thanh toán khi chưa có hợp đồng idempotency.

Khi backend cung cấp route/API contract, cập nhật endpoint, DTO mapper, auth transport và kiểm thử tích hợp. Không hứa rằng chỉ đổi base URL là hoàn tất. Giá, promotion, phí vận chuyển, tồn kho và kết quả thanh toán cuối cùng do backend xác nhận.

---

# 35. Omnichannel Readiness

Future channels:

```text
Website
Shopee
TikTok Shop
```

Internal architecture phải có:

```text
Product
SKU
Inventory
Order
Channel
```

Channel-specific ID:

```text
ChannelListing {
  channel
  externalProductId
  externalVariantId
  internalProductId
  internalVariantId
}
```

Không dùng Shopee/TikTok ID làm internal primary key.

---

# 36. Inventory Principle

Nên chuẩn bị logical model:

```text
Available Stock
=
On Hand
-
Reserved
```

Checkout cần reserve inventory để tránh overselling nếu backend support.

---

# 37. Image System

Fashion ecommerce phụ thuộc mạnh vào ảnh.

Ảnh tạm sử dụng Pexels theo quy trình phần 57; người dùng có thể thay sau bằng media manifest. Asset thương hiệu trong `asset/` được ưu tiên giữ đúng thiết kế. Không coi ảnh thời trang stock là bằng chứng về sản phẩm, tính năng vật liệu hay review khách hàng thật.

## Image types

```text
Product Primary
Product Alternate
Product Detail
Lifestyle
Campaign
Lookbook
UGC
```

Product images:

```text
Recommended ratio: 4:5
```

Campaign:

```text
Flexible:
3:4
16:9
Full viewport
```

---

# 38. Image Performance

Rules:

- Responsive image.
- Lazy load non-critical images.
- Priority chỉ cho hero/LCP.
- Không preload toàn bộ PDP gallery.
- Size attributes rõ ràng.
- CDN nếu production.
- Skeleton / placeholder nếu cần.

Không animate layout dimension thường xuyên.

---

# 39. Accessibility

Minimum requirements:

- Semantic HTML
- Keyboard navigation
- Visible focus
- Form label
- Alt text
- Color contrast
- Accessible modals
- Escape closes overlays
- Focus trap đúng
- Reduced motion
- Buttons không giả bằng `div`

---

# 40. Performance Targets

Recommended targets:

```text
LCP < 2.5s
CLS < 0.1
INP < 200ms
```

Focus:

- Hero image
- Font loading
- GSAP bundle
- Third-party scripts
- Product images
- Analytics
- Reviews widget

---

# 41. SEO Foundation

Product page:

- Unique title
- Meta description
- Canonical
- Product structured data
- Breadcrumb
- Open Graph
- Share image

Collection:

- Indexable category pages
- Human-readable URLs

Example:

```text
/shop/blazers
/product/convertible-blazer-black
/shop-by-moment/work
```

---

# 42. Analytics Events

Prepare event taxonomy.

```text
view_item_list
select_item
view_item

search
filter_products

add_to_wishlist
add_to_cart
remove_from_cart

begin_checkout
add_shipping_info
add_payment_info

purchase

view_order
track_order
```

Custom:

```text
view_moment
view_look
campaign_click
```

---

# 43. Loading & Error States

Mỗi data-driven page cần có:

```text
loading
success
empty
error
```

Ví dụ Search:

```text
Loading results...
```

```text
No results for "..."
```

```text
Something went wrong.
Try again.
```

Không để blank page.

---

# 44. Ecommerce Microcopy Principle

Tone:

- Ngắn
- Tự tin
- Không quá corporate
- Không cute quá mức
- Không dùng jargon kỹ thuật

Examples:

Bad:

```text
The system has successfully added this item into your shopping cart.
```

Good:

```text
Added to your bag.
```

Bad:

```text
The selected SKU is currently unavailable.
```

Good:

```text
This size is currently sold out.
```

---

# 45. Homepage Final Flow

> Active flow (2026-10-04): From Nine to Fine hero → four-category grid → outerwear / everyday foundations → work edit → off the clock → colour story + edit → trousers → weekend story + edit → new arrivals → after hours → occasion wear → After Five Club → image credit. All shopping and account CTAs use existing local routes. Full-width campaigns, rail dimensions and section order remain from the imported layout.

```text
HEADER
↓
HERO
FROM NINE TO FINE
↓
CATEGORY GRID — ÁO / QUẦN & CHÂN VÁY / ĐẦM / ÁO KHOÁC
↓
THREE MOMENTS — 09:00 / 17:30 / 20:00
↓
SHOP BY MOMENT
↓
NEW DROP
↓
BEST SELLERS
↓
DESIGNED TO MOVE WITH YOU
↓
EDITORIAL CAMPAIGN
↓
REVIEWS / UGC
↓
AFTER FIVE CLUB
↓
FOOTER
```

Rhythm:

```text
Brand
↓
Product
↓
Brand
↓
Product
↓
Trust
↓
Conversion
```

---

# 46. Implementation Roadmap

## Phase 0 — Foundation

- Project setup
- TypeScript
- Angular standalone + Router + strict TypeScript
- SCSS + CSS custom properties
- Reicon Angular integration
- Font
- Design tokens
- Layout primitives
- Routing
- Data types

---

## Phase 1 — Design System

Build:

- Button
- Input
- Modal
- Drawer
- Tabs
- Badge
- Product Card
- Price
- Swatches
- Size selector
- Skeleton

---

## Phase 2 — Commerce Core

Build:

- PLP
- Filter
- Sorting
- Search
- PDP

Commerce phải usable trước motion-heavy homepage.

---

## Phase 3 — Cart & Checkout

Build:

- Cart store
- Cart Drawer
- Cart Page
- Checkout
- Payment state
- Order success

---

## Phase 4 — Order System

Build:

- Order history
- Order detail
- Guest tracking
- Status timeline

---

## Phase 5 — Existing Auth / Onboarding / Account Integration

Không redesign.

Tasks:

- Plug existing UI vào app architecture.
- Normalize tokens nếu cần.
- Fix accessibility.
- Fix responsive behavior.
- Fix ecommerce navigation consistency.

---

## Phase 6 — Homepage

Sau khi commerce core ổn định mới build:

- Hero
- Shop by Moment
- Best Sellers
- Campaign
- Feature storytelling

---

## Phase 7 — GSAP Motion System

Build reusable:

- Reveal
- Image mask
- Stagger
- Scroll story
- Page transition
- Reduced motion

Sau đó apply.

---

## Phase 8 — Responsive QA

Test:

```text
375
390
430
768
1024
1280
1440
1920
```

---

## Phase 9 — Accessibility

Audit:

- Keyboard
- Focus
- Dialog
- Form
- Contrast
- Reduced motion
- Screen reader basics

---

## Phase 10 — Performance

Optimize:

- Images
- Fonts
- JS
- GSAP
- API caching
- Rendering strategy

---

## Phase 11 — Backend Integration

Phạm vi sau đợt frontend. Ngay từ Phase 0 phải có interface, mock adapter và cấu hình API; phase này thay adapter và kiểm thử với backend thật khi có contract.

Integrate:

- Auth
- Product
- Inventory
- Cart
- Checkout
- Orders
- Payment

---

## Phase 12 — Omnichannel

Future:

- Shopee
- TikTok Shop
- Inventory sync
- Order sync
- Channel mapping

---

# 47. Codex Working Rules

Codex phải tuân thủ:

1. Không redesign tùy ý.
2. Không thay đổi design tokens nếu chưa cần.
3. Không duplicate component.
4. Không hard-code business data trong page.
5. Không fetch API trực tiếp từ visual component nếu có thể tránh.
6. GSAP phải cleanup.
7. Motion phải respect reduced motion.
8. Mobile UX không được là desktop thu nhỏ.
9. Commerce usability ưu tiên trước animation.
10. Existing onboarding/profile UI chỉ sửa khi vi phạm usability/accessibility/ecommerce consistency.
11. Mỗi feature phải có loading/error/empty state khi phù hợp.
12. Không xây toàn website trong một prompt/task.

---

# 48. Recommended Codex Task Size

Mỗi task nên ở mức:

```text
1 feature
hoặc
1 cohesive page
hoặc
1 reusable system
```

Good:

```text
Implement ProductCard with variants, wishlist state and responsive hover behavior.
```

Good:

```text
Implement PLP filters with URL search params and mobile filter drawer.
```

Good:

```text
Implement GSAP Reveal component with reduced-motion fallback.
```

Bad:

```text
Build the entire nine2fine ecommerce website.
```

---

# 49. Definition of Done — UI Feature

Một UI feature chỉ hoàn thành khi:

- Desktop đúng layout
- Mobile đúng layout
- Hover state
- Focus state
- Disabled state
- Loading state nếu có
- Error state nếu có
- Empty state nếu có
- Keyboard usable
- No obvious layout shift
- Không có console error
- Motion cleanup đúng
- Reduced motion fallback nếu animated

---

# 50. Definition of Done — Page

Page chỉ hoàn thành khi:

- Navigation đúng
- Responsive đúng
- Data flow không hard-coded sai architecture
- Empty/loading/error handled
- SEO basics
- Accessible heading hierarchy
- Commerce CTA rõ
- Analytics event placeholder nếu cần
- Motion không cản thao tác

---

# 51. Anti-patterns

Không làm:

```text
Scroll hijacking
```

```text
Mỗi section đều parallax
```

```text
Long intro loader mỗi lần vào website
```

```text
Ẩn giá sản phẩm vì aesthetic
```

```text
Ẩn Add to Bag quá sâu
```

```text
Checkout animation-heavy
```

```text
Desktop hover là cách duy nhất để truy cập action
```

```text
Infinite animation trên toàn bộ product grid
```

```text
Hard-code product data trong Angular templates
```

```text
Mỗi page một style button khác nhau
```

---

# 52. Priority Matrix

## P0 — Must Have

- Home
- PLP
- PDP
- Search
- Cart
- Checkout
- Order Success
- Authentication
- Account
- Order Tracking
- Responsive
- Basic SEO
- Basic accessibility

## P1 — Strongly Recommended

- Wishlist
- Shop by Moment
- Reviews
- Recommendations
- GSAP storytelling
- UGC
- Promotion system

## P2 — Later

- Personalization
- Recently viewed
- Advanced recommendation
- Loyalty
- Omnichannel inventory UI
- AI styling assistant

---

# 53. Product Success Principle

Website nine2fine thành công khi người dùng có thể:

```text
Discover
↓
Understand
↓
Desire
↓
Choose
↓
Trust
↓
Buy
↓
Track
↓
Return
```

mà không có bước nào bị motion, visual complexity hoặc navigation làm gián đoạn.

---

# 54. Final Design Rule

Khi phân vân giữa:

```text
"Trông cool hơn"
```

và

```text
"Dễ hiểu hơn khi mua hàng"
```

Commerce page chọn:

> **Dễ hiểu hơn.**

Editorial page có thể chọn:

> **Cool hơn, miễn không che CTA và nội dung chính.**

---

# 55. Project North Star

> **nine2fine không phải một website fashion có animation.**
>
> Nó là một ecommerce product đủ rõ để mua hàng thật, được bao bọc bởi một brand experience có chuyển động và storytelling riêng biệt.

Signature thought:

> **From Nine to Fine — the website should move the same way the clothes do: effortlessly from work into everything after.**

---

# 56. Engineering Rules and Integration Deliverables

Các nguyên tắc dưới đây chuyển quy chuẩn Clean Code đã đọc thành yêu cầu thực thi cho Angular:

- Tên file, class, function và variable mô tả mục đích. Function/component có một trách nhiệm rõ; ưu tiên KISS và tránh abstraction không cần thiết.
- Tách business logic khỏi UI và HTTP/storage; dùng DI, tránh circular dependencies. Áp dụng SOLID theo nhu cầu thực tế, không tạo hệ thống repository tổng quát cho mọi dữ liệu.
- Dùng strict typing; không lạm dụng `any`, không duplicate component hoặc copy logic giữa page. Fixture không nằm trong component/template.
- Định dạng thống nhất bằng ESLint/Prettier; refactor trong phạm vi task, không thay đổi phần không liên quan.
- Xử lý lỗi, edge cases và validation gần nơi sở hữu logic. Không log secret, thông tin thanh toán hoặc dữ liệu cá nhân.
- Document tối thiểu: README setup/run/build/test, cấu hình môi trường, danh sách route, media manifest và backend integration contract.
- Test theo rủi ro: variant selection, cart quantity/totals, checkout failure recovery, filters trong URL, search race conditions và state mapping. E2E cho luồng mua hàng chính; không viết test chỉ lặp lại implementation.
- Trước merge/deploy: lint, build, type checking và các test phù hợp phải đạt; báo rõ check nào chưa chạy. Cấu hình CI khi repository được thiết lập; không tự push, merge hoặc deploy ngoài phạm vi được yêu cầu.
- Commit có ý nghĩa theo Conventional Commits khi có yêu cầu commit; không tự tạo commit trên main. Review trước merge và ghi technical debt có chủ đích.

## Frontend Route Inventory

Đây là route phía trình duyệt, không phải endpoint backend. Chi tiết slug có thể điều chỉnh theo Figma và content model; phải cập nhật bảng khi thay đổi.

| Group | Planned routes |
|---|---|
| Discovery | `/`, `/new-in`, `/shop`, `/shop/nam`, `/shop/nu` (Figma header; `?gender=` when combined with other filters), `/shop/:category` |
| Collections / moments | `/collections`, `/collections/:slug`, `/shop-by-moment/:moment` |
| Product / search | `/product/:slug`, `/search?q=...` |
| Purchase | `/wishlist`, `/cart`, `/checkout`, `/order-success/:orderId` |
| Guest tracking | `/track-order` |
| Auth | `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/verify` |
| Account | `/account` → `/account/profile`, `/account/orders?status=`, `/account/orders/:orderId`, `/account/addresses`, `/account/addresses/new`, `/account/addresses/:id/edit`, `/account/vouchers`, `/account/wishlist` → `/wishlist` (implemented; `/account/settings` has no Figma frame and is dropped) |
| Editorial / help | `/campaigns/:slug`, `/about`, `/promotions`, `/help`, `/policies/:slug` |
| Fallback | `**` → not-found page |

Danh sách account/auth cụ thể phải đối chiếu frame hiện có trước khi triển khai. Catalog lưu filter/sort/page bằng query params và khôi phục khi back từ PDP. Không đặt email, số điện thoại hoặc token truy cập đơn hàng vào URL. Route guard chỉ hỗ trợ UX, không thay thế phân quyền backend.

## Backend Handoff Checklist

- API base URL và lựa chọn mock/live được cấu hình tập trung, không chứa secret frontend.
- Typed contracts cho catalog/search, product variants, cart, wishlist, auth/session, profile/addresses, checkout, orders/tracking và nội dung editorial khi cần.
- Danh sách operation cần có cùng request/response mẫu, pagination, validation error shape và status mapping. Endpoint cụ thể là đề xuất cho đến khi backend xác nhận.
- DTO mapper và HTTP adapter có ownership rõ theo feature; mock cùng interface.
- Auth cookie/token, CORS/CSRF và refresh strategy chốt theo backend contract; không mặc định lưu token nhạy cảm trong localStorage.
- Guest cart/wishlist có thể lưu local với versioned schema; address/payment data không lưu tùy tiện. Merge khi login được mô tả và test.
- Order, payment, inventory là các domain status riêng. Payment failure không xóa cart; tránh duplicate submit và duplicate order.
- Địa chỉ Việt Nam dùng danh mục từ adapter, không hard-code quan hệ hành chính trong UI. Form nhận cấu trúc backend hỗ trợ; field District trong blueprint không mặc định luôn bắt buộc.
- README chỉ rõ chức năng nào đang mock, cách đổi adapter và phần còn cần kiểm thử với backend thật.

---

# 57. Pexels Asset Workflow

## Authorization and Current State

Người dùng đã đồng ý cho chọn lọc ảnh Pexels tạm thời và sẽ tự thay ảnh sau nếu chưa phù hợp. Từ 2026-10-02 key nằm trong `.env` cục bộ (gitignored). Workflow: `scripts/pexels/search_candidates.py <thư-mục-ngoài-repo>` tạo contact sheet để chọn tay; `scripts/pexels/fetch_media.py` tải ảnh đã chọn, crop theo tỉ lệ/điểm lấy nét, xuất WebP nhiều kích thước vào `public/assets/editorial/` và ghi nguồn vào `src/media/pexels-media.json` (photographer, URL, ngày lấy). Cần Python 3 + Pillow. 11 slot editorial cho Home đã có ảnh; ảnh sản phẩm vẫn là placeholder.

Khi người dùng cấp API access, dùng credential qua environment của công cụ/script cục bộ. Tên biến đề xuất: `PEXELS_API_KEY`. Không đưa key vào Angular environment, client bundle, URL, repository, master plan hoặc log. Không cần gọi Pexels runtime từ trình duyệt người mua.

Trước khi lấy ảnh, kiểm tra tài liệu API và điều khoản sử dụng/ghi nguồn hiện hành của Pexels; tuân thủ rate limits. Lấy metadata và ảnh được chọn bằng workflow build-time/local, tránh tải hàng loạt thư viện không dùng.

## Selection Brief

| Slot | Visual criteria | Target presentation |
|---|---|---|
| Hero | Young professionals, contemporary office fashion, outfit visible, space for headline | Desktop landscape + mobile portrait crop |
| One look / moments | Cohesive office-to-evening styling, consistent visual direction | Vertical story; avoid implying unrelated outfits are one transformable product |
| Work | Clean tailoring, everyday office context | Portrait 3:4 or 4:5 |
| Dinner | Smart casual evening, readable clothes and faces | Portrait 3:4 or 4:5 |
| Event | Contemporary occasion wear, confident styling | Portrait 3:4 or 4:5 |
| Weekend | Relaxed styling consistent with the brand | Portrait 3:4 or 4:5 |
| Product fixtures | Garment clearly visible, minimal distraction | Stable 4:5 |
| Campaign / about | Cohesive fashion/editorial imagery | Wide desktop + intentional mobile crop |

Chọn bộ ảnh thống nhất về ánh sáng, màu sắc, phong cách và đối tượng Gen Z mới đi làm; không chọn ảnh chỉ vì đẹp nhưng lệch brand. Tránh logo thương hiệu khác nổi bật, ảnh mờ và crop mất phần trang phục cần nhìn. Kiểm tra trực quan từng ảnh đã chọn ở vị trí thực tế.

Ảnh Pexels không bảo đảm đủ nhiều góc của cùng một sản phẩm. Không ghép ảnh các trang phục khác nhau thành gallery/variant giả cho một sản phẩm. Nếu thiếu, dùng ít ảnh hơn hoặc placeholder rõ trong fixture; ghi lại slot cần người dùng thay. Không gắn ảnh stock với lời chứng thực người mua thật hay chứng minh tính năng reversible/wrinkle-resistant.

## Media Manifest and Replacement

Implementation hiện tại: `src/media/media-manifest.ts`, Angular asset allowlist trong `angular.json`. Fixture tham chiếu `catalog-placeholder`, là illustration tạm có nhãn ảnh đang cập nhật. Khi có ảnh thật, tạo media entry riêng theo sản phẩm với provenance và đặt `temporary: false`; không thay một placeholder toàn cục bằng ảnh duy nhất cho mọi sản phẩm.

Mỗi media entry cần có:

```text
id / semantic slot
source: local-brand | pexels | placeholder
local path(s) and responsive sources
width / height / aspect ratio
alt text
focal point or object position
Pexels photo ID and source page URL, when applicable
photographer name and credit URL, when applicable
retrieved date and usage/credit notes
temporary flag and replacement notes
```

Component/product fixture tham chiếu media ID, không rải URL Pexels trong HTML/SCSS. Ghi photographer credits theo yêu cầu hiện hành; metadata nguồn luôn được giữ để truy vết. Manifest chứa thông tin credit khác với alt text mô tả ảnh.

Giữ file gốc thương hiệu trong `asset/`; bản tối ưu phục vụ web được đặt trong thư mục public assets của Angular khi scaffold. Tên media mang ý nghĩa, không phụ thuộc tên file tải xuống. Khi thay ảnh chỉ cần cập nhật manifest hoặc giữ đường dẫn; kiểm tra lại crop, tỷ lệ, alt và kích thước, không sửa từng component.

Ảnh chụp nên có WebP/AVIF và fallback phù hợp khi pipeline hỗ trợ. Dùng `srcset`/`sizes`, dimensions rõ ràng, lazy-load dưới fold, chỉ ưu tiên ảnh LCP. Không tải toàn bộ ảnh hero/PDP trước. Đo chất lượng hình và network/bundle thay vì giả định dùng thư viện hoặc SVG luôn nhẹ.

---

# 58. Asset Inventory and Open Decisions

Inventory được kiểm tra ngày 2026-10-02:

| Existing asset | Intended role / observation |
|---|---|
| `asset/logo.svg` | Brand logo |
| `asset/logo-typho.svg`, `asset/logo-typho.png` | Brand wordmark variants |
| `asset/key-visual.svg` | Key visual, 817 × 1080; approximately 3.49 MB, 5 embedded images |
| `asset/key-visual.png` | Key visual @2x, 1634 × 2160, ~3.0 MB RGBA; source for the onboarding WebP set |
| `asset/card-member-bronze.svg` | Membership visual, approximately 1.06 MB, 1 embedded image |
| `asset/card-member-gold.svg`, `asset/card-member-silver.svg` | Membership visuals |
| `asset/add_to_cart 1.svg` | Commerce illustration |
| `asset/delivery_address 1.svg` | Address illustration |
| `asset/discount 1.svg` | Promotion illustration |
| `asset/truck-fast-outline-64x64.png` | Existing delivery graphic; ordinary UI icons use Reicon |

Chưa có bộ ảnh product/gallery/campaign/UGC riêng hoặc font file trong thư mục được kiểm tra. Những ảnh raster nhúng trong SVG không mặc định thay thế đủ các media slot của website. Giữ bản gốc, đánh giá tối ưu bản phục vụ web mà không làm sai visual.

Thư viện `svg/` bổ sung có 1.379 file. Bản build hiện chỉ copy 4 illustration: `shopping_bags.svg`, `empty_cart.svg`, `web_search.svg`, `page_not_found.svg`; logo/monogram lấy từ `asset/`. `key-visual.svg` không được publish; bản phục vụ web là `public/assets/onboarding/key-visual-{640,1024,1634}.webp` (q90, 58–195 KB, nền trắng) tạo từ `asset/key-visual.png` @2x và chọn qua `srcset`. Bản 1x cắt từ export Figma trước đó bị mờ trên màn hình DPR > 1 nên đã bỏ. Auth layout căn ảnh `object-position: right top` (giữ nhân vật và vùng fade sẵn có của PNG) và thêm `mask-image` gradient 72%→trong suốt ở mép phải để ảnh hòa vào nền trắng khi viewport cắt ảnh; viewport hẹp/cao sẽ cắt bớt sọc đỏ bên trái. Không chỉnh sửa asset nguồn.

Các điểm chưa chốt và cách tiếp tục:

- **Pexels API:** chờ người dùng cấp access; có thể làm foundation/component với placeholder trong lúc chờ.
- **Font và Brand Red:** đã trích từ Figma (xem 0.2). Còn mâu thuẫn Manrope (guideline) vs Nunito Sans (frame) chờ người dùng chốt.
- **Ngôn ngữ UI:** chưa chốt; dự kiến tiếng Việt cho commerce/form, giữ tagline tiếng Anh của thương hiệu. Tập trung copy để có thể thay sau.
- **Ảnh hàng thật, giá, SKU, tồn kho, review, chính sách, phí ship:** fixture tạm, tách khỏi UI; không coi giá trị ví dụ trong master plan là dữ liệu kinh doanh đã xác nhận.
- **Backend contract và deployment:** chưa cung cấp; chuẩn bị interface và ghi rõ giả định, chưa triển khai production hoặc payment thật.

---

# 59. Execution Ledger

## Current Verified State — 2026-10-02

| Work item | Status | Evidence / next action |
|---|---|---|
| Read product blueprint and Clean Code reference | Complete | Requirements reflected in this document |
| Confirm Angular frontend scope | Complete | Sections 0, 27–29, 34 and 56 |
| Inspect local assets | Complete | 11 files; inventory in section 58 |
| Figma per-frame audit | In progress | Tokens, onboarding, account/order, `component` page and `header (1)` implemented from exports; `header (2)` (hero overlay) waits for the homepage; catalog/PDP have no Figma frames yet |
| Pexels selection/download | Done for homepage | 10 photos / 11 slots curated, 33 WebP files (1.6 MB), credits in `pexels-media.json` + on-page attribution |
| Angular scaffold / dependencies | Implemented | Angular 22.2.1, strict TS, Router, SCSS, CDK, Reicon adapter, lint/format, lockfile |
| Store header (Nike-style) | Verified (mock) | Utility bar, 4 mega menus with preview photos, promo strip, mobile drawer; see 2026-10-11 entry |
| Design system | Partial | Price, icon, product card, empty state, dialog service, filters, global controls; remaining components not implemented |
| Catalog / search / PDP / wishlist | Upgraded (mock) | Nike-informed PLP (sticky header, sidebar categories, accordion filters, hide filters) and PDP (gallery + zoom, size guide, fit line, reviews with fit scale, looks, related, mobile sticky bar) |
| Cart / checkout / order success | Verified (mock) | Cart persisted (`n2f.cart.v1`); single-page checkout with saved addresses, vouchers, province → ward, COD / bank transfer, idempotency key; `/order-success/:orderId`; no real payment |
| Auth / onboarding | Verified (mock) | Login email/code/password, register, forgot password per Figma; 8 E2E cases pass |
| Account area | Verified (mock) | Profile, password dialogs, membership, addresses, vouchers, orders + detail per Figma `193:2522`; 8 E2E cases pass |
| Guest order tracking | Verified (mock) | `/track-order` with order ID + phone/email (body only), shared `OrderView` timeline |
| Homepage + motion foundation | Branded editorial Home | Imported layout with nine2fine copy, 4 categories, local navigation and editorial rails; reference/stock media remain temporary. Shared shell and video controls retained. See latest ledger for verification. |
| Returns / reviews submission / policy pages | Not started | P1 and content pages |
| Browser QA / tests / performance measurements | In progress for first slice | Initial 8 desktop/mobile E2E tests passed; final matrix/check results recorded below |
| Backend integration | Deferred | Contracts/interfaces belong to frontend work; live integration later |

## Next Implementation Task

Next: replace temporary editorial references with nine2fine photography and supply SKU-specific photos before turning the editorial rails into shoppable product cards. Current copy and category/moment destinations are adapted; add GSAP only as a separate motion pass on the accepted layout. Full-site responsive/performance QA and production catalog validation remain open.

## Implementation Entry — 2026-10-02 / First Commerce Slice

- **Scope:** Foundation plus initial usable catalog → PDP → cart → mock checkout flow; search, wishlist, mobile filters and 404. The overall frontend master plan is not yet complete.
- **Files:** `src/`, Angular/TypeScript/build config, `package.json`/lockfile, `tests/commerce.spec.ts`, `playwright.config.ts`, README, AGENTS.md, `.env.example`, `document/backend-integration.md`.
- **Current preview:** http://127.0.0.1:4200; `/` redirects to `/new-in` until homepage exists. A background Angular dev server was started for this workspace; check whether it is still alive on future runs.
- **Design:** Real local brand logo; temporary Arial/Helvetica UI font and `#a91e2c` brand token; visual interpretation based on blueprint, not a verified Figma reproduction. Placeholder illustration is deliberately labeled, not represented as product photography.
- **API:** `CATALOG_API` and `CHECKOUT_API` DI tokens select mock/HTTP adapters via `API_CONFIG`. Proposed DTOs documented; live checkout intentionally guarded until authoritative totals/reservation/idempotency are integrated.
- **QA finding fixed:** Rapid quantity clicks previously reused stale rendered quantities. Cart now adjusts from current state; regression tested through repeated clicks up to stock limit.
- **Known limits:** Cart resets after refresh; wishlist persists. Checkout receipt stays in-page and orders are not persisted. Only COD demo exists; shipping shown as mock 0 VND. Full payment status UI, dedicated order success route, tracking, size guide, reviews/recommendations, richer SEO and analytics are pending. No claim that all P0 screens are finished.
- **Missing input:** User confirmed Pexels API is not yet set up. Figma MCP quota is exhausted. Those blockers apply to photography/design audit, not to already completed foundation work.
- **Verification:** First production build passed (initial estimate 116.40 kB transfer); lint passed; first 8 E2E cases passed across desktop/mobile. Final post-refactor build, format check and viewport matrix are recorded in the next verification entry after completion.

## Implementation Entry — 2026-10-02 / Figma Token Audit + Auth Onboarding

- **Date / task:** 2026-10-02 — Figma token alignment and auth/onboarding screens.
- **Status:** verified (mock adapter).
- **Scope and files changed:** `src/styles.scss` (Figma tokens, Nunito Sans), `src/index.html` (font, theme color); `src/app/features/auth/` (`data-access/auth-api.ts`, `auth-session.ts`, `auth-messages.ts`, `login-page.ts`, `register-page.ts`, `forgot-password-page.ts`, `ui/auth-form.scss`, `ui/verification-code-field.ts`, `ui/password-field.ts`); `src/app/layouts/auth-layout.ts`; `src/app/app.routes.ts`, `src/app/app.config.ts` (AUTH_API provider, icons); `src/app/layouts/store-layout.ts` (account entry); `src/mocks/accounts.ts`, `src/mocks/mock-auth-api.ts`; `public/assets/onboarding/*.webp` (từ `asset/key-visual.png`); `tests/auth.spec.ts`; README, `document/backend-integration.md`.
- **Decisions and assumptions:** `--brand` now means the accessible CTA red `#D9070C`; logo red is `--brand-mark`. Nunito Sans follows the actual frames over the Manrope guideline text. Auth is passwordless-first as in Figma (register has no password). Email travels between steps in memory (`AuthFlowState`), never in the URL; `returnUrl` accepts only same-origin paths. Session profile is memory-only (no token storage). Auth layout scales from the 1920px frame via `--u`; below 900px the key visual is hidden. Figma's disabled "Đổi mật khẩu" until valid is kept. Signed-in header icon temporarily signs out until the account area exists. Policy links point to planned `/policies/*` routes, which currently show the 404 page.
- **Verification actually run and result:** `npm run lint` passed; `npm run format:check` passed; `npm run build` passed (initial 120.65 kB transfer, auth chunks 2.6–3.8 kB, no budget warnings); `npx playwright test` 17 passed, 1 skipped (existing viewport-matrix test skipped on mobile), including 4 new auth cases × desktop/mobile. Desktop/mobile screenshots compared visually with Figma exports.
- **Remaining issues / temporary assets:** Not pixel-verified at 1920px; mock accepts one demo code; accounts and session reset on reload; no `/me` restore, logout endpoint or cart/wishlist merge; email lookup enables account enumeration and needs backend rate limiting; font choice awaits user confirmation.
- **Next concrete step:** Account area from Figma `193:2522` (see Next Implementation Task).

## Implementation Entry — 2026-10-02 / Account Area

- **Date / task:** 2026-10-02 — account area from Figma section `account-manage` (193:2522) and the `component` page.
- **Status:** verified (mock adapter).
- **Scope and files changed:** `src/app/features/account/` (`account-layout.ts`, `account-guard.ts`, `account-messages.ts`, `data-access/account-api.ts`, `data-access/account-models.ts`, `ui/account.scss`, `profile/profile-page.ts`, `profile/password-dialog.ts`, `addresses/addresses-page.ts`, `addresses/address-form-page.ts`, `vouchers/vouchers-page.ts`, `orders/order-status.ts`, `orders/order-status-badge.ts`, `orders/order-items.ts`, `orders/order-card.ts`, `orders/order-cancellation.ts`, `orders/orders-page.ts`, `orders/order-detail-page.ts`); `src/app/shared/ui/confirm-dialog.ts`, `overlay.service.ts` ('modal' panel), `src/styles.scss` (`.n2f-modal`); auth `ui/password-field.ts` (configurable rules, outline x icon), `auth-messages.ts` (`passwordPolicy`, `matches`), `forgot-password-page.ts`; `src/mocks/` (`accounts.ts` + birthDate/phone, `locations.ts`, `account-fixtures.ts`, `mock-account-store.ts`, `mock-account-api.ts`, `mock-latency.ts`; `mock-auth-api.ts` uses the shared store); `app.routes.ts`, `app.config.ts`, `layouts/store-layout.ts` (account link replaces the temporary sign-out); `angular.json` (publishes `asset/{add_to_cart 1,delivery_address 1,discount 1}.svg` to `assets/account/`), `src/media/media-manifest.ts`; `public/assets/membership/card-{bronze,silver,gold}.webp` (Figma 102:191/149/236 @2x, 12–36 KB); `tests/account.spec.ts`, `tests/auth.spec.ts`.
- **Decisions and assumptions:** Account pages render inside the existing store header (Figma `header (2)` restyle is a separate task). Sidebar follows component 116:3230 without "Đánh giá đã đăng" (reviews not built) and with "Đăng xuất"; "Chính sách" links to the planned `/policies/privacy`. Status labels/colours come from component 135:135. Card actions: pending → Hủy đơn (confirm dialog; mock cancels) / Thanh toán ngay (explains payment is unavailable); shipping/delivering → Theo dõi đơn hàng → detail. Completed-order "Yêu cầu Trả hàng/Hoàn tiền" and "Đánh giá" are omitted until those flows exist. The detail page uses ProgressStep states Done/Current/Upcoming; cancelled/returned orders show a refund block instead. "Sử dụng vị trí hiện tại" is omitted (needs a reverse-geocoding backend). Member card images bake in "Hiệu lực đến 31/12/2026" from Figma. Fixture names and phones are fictional; personal data visible in Figma is not copied. Mock services are provided eagerly, adding about 14 kB transfer to the initial bundle (135.20 kB).
- **Verification actually run and result:** `npm run format:check` passed; `npm run lint` passed; `npm run build` passed with no budget warnings; full `npx playwright test`: 23 passed, 1 skipped, 2 failed only because the old auth test used the removed header sign-out; after updating it, `tests/auth.spec.ts` 8/8 and `tests/account.spec.ts` 8/8 passed on desktop and mobile. Desktop/mobile screenshots were compared visually with Figma exports. Fixed during QA: mobile layout-viewport blow-up (`minmax(0, 1fr)`), switch hit area, Reicon glyph choices. The dev server was restarted to pick up the new `angular.json` assets.
- **Remaining issues / temporary assets:** Mock session/data reset on reload (no `/me`); product thumbnails are placeholders; no pagination; payment, returns, reviews and tracking timeline not implemented; `/policies/*` and `/help` still 404.
- **Next concrete step:** Store header per Figma `header (1/2)` (see Next Implementation Task).

## Implementation Entry — 2026-10-02 / Store Header + Nam/Nữ Catalog

- **Date / task:** 2026-10-02 — store header from Figma `header (1)` (61:341) and the gender navigation it requires.
- **Status:** verified (mock catalog).
- **Scope and files changed:** `src/app/layouts/store-layout.ts`, `store-layout.scss` (announcement bar removed; logo, Sản phẩm mới / Nam / Nữ, pill search trigger, trolley cart with count badge, circular account button; scales from the 1920px frame via `--u`; search collapses to an icon below 1100px, nav moves to the menu below 800px); `src/app/features/catalog/models/product.ts` (`Gender`, `genders`, `CatalogQuery.gender`, `GENDERS`), `catalog-page.ts` (gender from route data or `?gender=`, heading "Thời trang Nam./Nữ.", gender kept when other filters change), `catalog-filters.ts` ("Dành cho" filter), `src/mocks/products.ts` (gender assortment), `src/mocks/mock-catalog-api.ts`; `app.routes.ts` (`/shop/nam`, `/shop/nu`); `app.config.ts` (`reiconCartShop`); `tests/header.spec.ts`.
- **Decisions and assumptions:** Figma navigation (Sản phẩm mới / Nam / Nữ) replaces the blueprint's NEW IN / SHOP / WORK / AFTER HOURS; moments stay reachable through filters, search and the mobile menu ("Tất cả sản phẩm"). The full-width red announcement bar is removed (not in Figma, conflicts with the 5% red rule). The wishlist heart is no longer in the header (not in Figma); wishlist remains in the mobile menu, footer and account sidebar. The search pill opens the existing search dialog, keeping debounce/cancellation behaviour. Nam/Nữ assortment in fixtures is a placeholder pending merchandising. Figma plugin was disconnected this session, so the header was built from the earlier exports and text metrics; `header (2)` is deferred to the homepage hero.
- **Verification actually run and result:** `npm run lint` passed; `npm run format:check` passed; `npm run build` passed (initial 135.78 kB transfer, no budget warnings); full `npx playwright test`: 25 passed, 1 skipped, 2 failed only on a test locator matching the footer tagline; after fixing the locator `tests/header.spec.ts` 2/2 passed, and after the cart-icon swap `tests/commerce.spec.ts` + `tests/header.spec.ts` 11 passed, 1 skipped. Desktop 1440 and mobile header screenshots compared with Figma exports.
- **Remaining issues / temporary assets:** Header colours/sizes not re-measured live in Figma this session; no transparent hero header yet; catalog H1 remains large red text.
- **Next concrete step:** Cart persistence + checkout with saved addresses/vouchers (see Next Implementation Task).

## Implementation Entry — 2026-10-02 / Phase 3–4: Cart, Checkout, Order Success, Guest Tracking

- **Date / task:** 2026-10-02 — remaining Phase 3 (cart store, checkout, payment state, order success) and Phase 4 (guest tracking, status timeline) before the homepage.
- **Status:** verified (mock adapters).
- **Scope and files changed:** `features/cart/cart-state.ts` (versioned localStorage with validation, `clear()`); `features/checkout/checkout-api.ts` (quote / placeOrder with `Idempotency-Key` / trackOrder, typed errors, HTTP adapter), `checkout-page.ts|html|scss` (rewritten), `checkout-session.ts`, `order-success-page.ts`; `features/tracking/track-order-page.ts`; new shared `features/orders/` (`order-models.ts` moved out of account models, `order-status.ts`, `order-status-badge.ts`, `order-items.ts`, new `order-view.ts` extracted from the account detail page); account `orders-page.ts` (tab groups), `order-detail-page.ts` (uses `OrderView`); mocks `mock-checkout-api.ts` (moved from the feature file; voucher/shipping rules), `mock-account-store.ts` (guest orders, order contacts, `addOrder`/`findOrder`), `account-fixtures.ts` (payment methods, guest demo order); `app.routes.ts`, `app.config.ts`, `layouts/store-layout.ts|scss` (tracking links, footer logo fix); tests `checkout.spec.ts` (new), `commerce.spec.ts` (checkout steps updated).
- **Decisions and assumptions:** Single-page checkout (plan 16) with numbered sections and a sticky summary that is collapsed by default on mobile; voucher entry is secondary inside the summary. Signed-in members get contact prefill, saved addresses (default preselected) and voucher chips; guests are offered sign-in. Provinces/wards reuse the account location endpoints. Payment methods: COD and bank transfer/QR (24 h hold, demo bank details clearly marked). New status `processing` ("Đang xử lý", not in Figma) for confirmed COD orders; it is grouped under the Figma "Vận chuyển" tab, and the second progress step reads "Xác nhận" for COD. Mock rules: shipping 30.000 ₫, free from 1.000.000 ₫ subtotal; vouchers N2FWELCOME15 / N2FBDAY100 / N2FFREESHIP with minimums. Guest tracking returns the same error for unknown IDs and wrong contacts; contact data travels only in the request body and order ID via router state. Success page shows the receipt only in the session that placed it and otherwise falls back to tracking. The cart stores display snapshots; prices/stock are re-validated by the quote/placeOrder calls.
- **Verification actually run and result:** `npm run format:check` passed; `npm run lint` passed; `npm run build` passed (initial 138.16 kB transfer, no budget warnings); full `npx playwright test`: 33 passed, 1 skipped (desktop-only viewport matrix). Desktop/mobile screenshots of checkout, success and tracking reviewed; found and fixed a missing footer logo (size token scoped to the header) and a wrapping voucher button.
- **Remaining issues / temporary assets:** No real payment, email/SMS confirmation or QR image; mock orders reset on reload (the demo guest order N2F260928010 / 0909000111 always exists); the success receipt is not recoverable after reload; returns/refund requests and reviews not implemented; `/policies/*`, `/help` still 404.
- **Next concrete step:** Stop here per the user's instruction; Phase 6 Homepage starts only after confirmation.

## Implementation Entry — 2026-10-02 / PLP + PDP Upgrade (Baymard + Nike Review)

- **Date / task:** 2026-10-02 — upgrade product listing and product detail after researching Baymard apparel PDP findings and reviewing nike.com/vn men's clothing PLP + a Nike PDP (desktop and mobile, via Playwright screenshots in `.open-figma-mcp/exports/ref/`).
- **Status:** verified (mock catalog).
- **Scope and files changed:** catalog `models/product.ts` (`type`, `gallery`, `fit`, `care`, `looks`, `ProductReview`, `SizeChart`), `data-access/catalog-api.ts` (`reviews`, `sizeChart`), `catalog-page.html|scss|ts` (sticky header with title + count, "Ẩn/Hiện bộ lọc" persisted in localStorage, sidebar category links, sticky independently scrolling sidebar, black H1), `catalog-filters.ts` (accordion groups with counts, colour swatch grid, size grid, price radios, availability, "Đang lọc (n) · Xóa tất cả"); `shared/commerce/product-card.component.ts` (accent line Mới về/Bán chạy/Giảm %, type line, hover crossfade to the second gallery image + subtle zoom, existing "Chọn phiên bản" hover bar kept); product `product-page.ts|html|scss` (rewritten), `product-gallery.ts`, `size-guide-dialog.ts`, `product-reviews.ts`; `core/store-policy.ts` (provisional delivery/returns values shared with mock checkout); mocks `products.ts` (merch copy), `reviews.ts` (sample reviews + size charts), `mock-catalog-api.ts`, `mock-checkout-api.ts`; `media/media-manifest.ts` + `angular.json` (3 more unDraw placeholders); `app.config.ts` (icons); tests `pdp-plp.spec.ts` (new), `header.spec.ts`.
- **Decisions and assumptions:** Kept from our design (user preference): the card hover bar; added image crossfade instead of Nike's near-static hover. Adopted from Nike: listing header layout, hide-filters toggle → 4 columns, sidebar categories + accordion filters with counts, thumbnail rail + arrows, size label + "Size guide" on one row, whole size group outlined red on missing size, full-width pill buttons, mobile pinned add-to-bag. Beyond Nike (Baymard): cursor-follow zoom, fit line and model measurements next to sizes, body/garment size-guide tabs in cm, inline delivery/returns trust row, aggregate fit scale and size-bought filter in reviews, "Mặc theo cách của bạn" (plan 11.4) and related products (11.5). Reviews, size charts, fit copy and policy values are fixtures labelled as samples/provisional; gallery uses labelled unDraw placeholders until photography exists. Catalog H1 changed from large red to heading black per the 5% red rule.
- **Verification actually run and result:** `npm run lint` passed; `npm run format:check` passed; `npm run build` passed (initial 141.58 kB transfer; first build attempt failed on a missing `MOMENTS` import, fixed); full `npx playwright test` after the fix: 36 passed, 2 skipped (desktop-only viewport matrix and desktop-only sidebar test on mobile). Desktop/mobile screenshots reviewed for PLP, hover, hidden filters, PDP error state, size guide and mobile sticky bar.
- **Remaining issues / temporary assets:** No real photography (zoom is demonstrated on illustrations); sample reviews and size charts need real data; no review submission or reviewer photos; related products use a simple same-moment rule; `/policies/*` and `/help` still 404.
- **Next concrete step:** Phase 6 Homepage only after the user confirms.

## Implementation Entry — 2026-10-02 / Homepage + Motion Foundation

- **Date / task:** 2026-10-02 — Phase 6 Homepage with the minimum Phase 7 motion system it depends on.
- **Status:** verified (mock content and adapters).
- **Scope and files changed:** `features/home/` (`home-page.ts|html|scss`, `home-hero.ts`, `home-story.ts`, `home-club.ts`, `home-content.ts` typed content + `HOME_CONTENT` token, `newsletter-api.ts`); `shared/motion/` (`motion-tokens.ts`, `motion.service.ts` lazy GSAP + ScrollTrigger, reduced-motion signal, context cleanup; `reveal.directive.ts`, `image-reveal.directive.ts`); `shared/ui/media-image.component.ts`; `core/analytics.ts` (event taxonomy placeholder); `media/media-manifest.ts` + `media/pexels-media.json`; `mocks/home-content.ts`, `mocks/mock-newsletter-api.ts`, `mocks/products.ts` (PDP looks now 09:00/17:30/20:00); `layouts/store-layout.ts|scss` (overlay/transparent header with inverse logo, footer Mua sắm/Khoảnh khắc columns, Pexels link), `layouts/auth-layout.ts` (logo → `/`); `app.routes.ts` (`/` = Home, `data.headerOverlay`), `app.config.ts`; `index.html` (Nunito 800, Playfair Display Italic); `tsconfig.json` (`resolveJsonModule`); `package.json` (`gsap ^3.15`); `public/assets/editorial/*.webp`, `public/assets/brand/logo-inverse.svg` (derived from `asset/logo.svg`, original untouched); `scripts/pexels/search_candidates.py`, `scripts/pexels/fetch_media.py`; `tests/home.spec.ts`.
- **Decisions and assumptions:** Section order follows plan 45 (hero → story → moments → new drop → best sellers → USP → campaign → reviews → club). Hero: full viewport, `<picture>` art direction (16:9 desktop / 4:5 mobile, only one downloads), intro timeline animates type and image only; CTAs usable from first frame. Story uses CSS sticky (no GSAP pin, no scroll hijack) with IntersectionObserver for the active moment and highlights the product worn; mobile is a vertical story. Motion: tokens reveal-sm / reveal-md / editorial-reveal / stagger-grid / image-mask (+ subtle desktop-only parallax on the campaign); GSAP loaded only on Home (separate lazy chunk), disabled entirely under `prefers-reduced-motion`. Reviews show sample text only — no stock photos as testimonials. USP marked provisional per user decision. Newsletter is a mock (nothing sent) behind `NEWSLETTER_API`. Pexels attribution: per-photo credits on Home plus a Pexels link in the footer. Image choice favours Asian Gen Z models; 09:00/17:30 use the same model for continuity.
- **Verification actually run and result:** `npm run format:check` passed; `npm run lint` passed; `npm run build` passed (initial 145.22 kB transfer; Home chunk 9.3 kB, ScrollTrigger 16.5 kB lazy; no budget warnings); full `npx playwright test`: 42 passed, 2 skipped (desktop-only cases on mobile), including 3 new Home cases × desktop/mobile (overlay header → solid on scroll, story/moments/best sellers/reviews/newsletter/credits, reduced motion keeps content visible and no horizontal overflow). Manual check: no element left hidden after scrolling with motion on; no console errors. Fixed during QA: header gradient seam (background repeating into the border), white search circle on the transparent mobile header, hero type over the face on mobile, wrapping section heading.
- **Remaining issues / temporary assets:** All editorial photos are temporary Pexels stock (credited); product thumbnails remain placeholders, so Best Sellers/New Drop cards look unfinished; no page transition yet; footer Help/Company/Legal/Social columns wait for content pages; Lighthouse/LCP not measured.
- **Next concrete step:** Phase 7 page transition + Phase 8 responsive QA (see Next Implementation Task).

## Implementation Entry — 2026-10-03 / Homepage Luxury Pass (Full-bleed Imagery)

- **Date / task:** 2026-10-03 — make Home feel more luxury through large imagery rather than typography (user request); branding content unchanged.
- **Status:** verified (mock content).
- **Scope and files changed:** only `src/app/features/home/` — `home-hero.ts` (lighter shade so the photo leads; hairline square primary CTA + underlined secondary, uppercase tracked), `home-story.ts` (full-bleed 50/50 split: sticky photo fills the viewport under the header, edge to edge, with a `01 / 03` counter; centred header; mobile moments are edge-to-edge 4:5 images), `home-page.html` (moment grid and New Drop moved out of `.container`; `.pill` → `.text-cta`; brand headings centred), `home-page.scss` (radius removed from editorial images; moments as an edge-to-edge row of tall portraits with 2px gaps; New Drop photo runs to the left edge at ~100svh; campaign 100svh; reviews use hairline tops instead of boxed cards; quieter grey eyebrows, larger section spacing). Screenshots in `.open-figma-mcp/exports/home-luxury/` (`before-*`, `after-*`, `d-*`, `m-*`).
- **Decisions and assumptions:** Fonts, copy, section order, content model and shared components (ProductCard, header, motion directives) untouched to avoid conflicts with commerce pages. Brand red stays on the "FINE." dot, New Drop number, moment labels and as the hover indicator — no red CTA blocks on Home. Fixed a pre-existing bug: campaign parallax exposed a grey band at the bottom; media layer is now oversized (`inset: -8% 0`). Story sticky offset mirrors the store header height locally (`--header-h`) instead of reading the layout-scoped `--u`.
- **Verification actually run and result:** `npm run lint` passed; `npm run format:check` passed (after Prettier on Home files); `npm run build` passed (initial 145.25 kB transfer, Home chunk 9.66 kB, no budget warnings); full `npx playwright test`: 42 passed, 2 skipped (existing desktop-only cases). Desktop 1440×900 and mobile 390×844 viewport screenshots reviewed (hero, story split while scrolling, moments, new drop, campaign, reviews).
- **Remaining issues / temporary assets:** The luxury feel is capped by temporary Pexels stock (mixed lighting/styling) and placeholder product images in New Drop / Best Sellers — those cards still look unfinished next to full-bleed photos. Moment images are 1200 px wide; fine for 25vw/50vw but a dedicated campaign shoot (consistent tone, landscape + portrait crops) would lift it most. No new photos fetched.
- **Next concrete step:** Real product photography (or curated product-like stock per SKU) for New Drop/Best Sellers; optionally a full-bleed image interlude/diptych once more cohesive photos exist; then Phase 7 page transition (see Next Implementation Task).

## Planning Entry — 2026-10-04 / UNIQLO × Nike Home Reference

- **Date / task:** 2026-10-04 — analyze the current UNIQLO UK and Nike VN homepages, then plan a nine2fine Home upgrade with purposeful GSAP.
- **Status:** planning complete; implementation not started.
- **Scope and files changed:** `document/nine2fine_HOME_REFERENCE_PLAN.md` (reference findings, proposed Home flow, motion sequence, asset dependencies, acceptance gates); this ledger entry only. No application code or assets changed.
- **Decisions and assumptions:** Preserve the desk-to-dinner positioning, current auth/account design and commerce flows. Prioritize matching real product photography to editorial looks before adding motion. Use a compact shopping gateway and links from looks to actual PDPs. Keep unconfirmed feature claims and sample reviews out of persuasive content. Reference sites are dynamic; UNIQLO's official service-update page provided additional evidence for its homepage navigation and shoppable-product changes.
- **Verification actually run and result:** Read master-plan sections 0, 8, 45, 56–59, Home/motion/product-card/media code and the latest Home desktop screenshot. Opened the live reference pages through web access and UNIQLO's official service-update page. No lint/build/E2E run because only planning documents changed. No pixel or motion parity claim for reference sites.
- **Remaining issues / temporary assets:** Pexels editorial imagery and product placeholders remain; a cohesive shoot, product-to-look mapping, confirmed USP claims and real reviews are still needed. Direct visual browser inspection of the reference pages was unavailable in this environment.
- **Next concrete step:** Confirm the story's photography/content model and supply or select SKU-specific imagery, then implement stage A/B of the plan and verify responsive/performance before stage C motion.

## Required Entry Format for Future Updates

```text
Date / task:
Status: not started | in progress | verified | blocked | deferred
Scope and files changed:
Decisions and assumptions:
Verification actually run and result:
Remaining issues / temporary assets:
Next concrete step:
```

## Implementation Entry — 2026-10-04 / Saved UNIQLO Landing Prototype

- **Date / task:** Read the user's complete UNIQLO HTML + asset folder and implement the main landing in Angular; defer nine2fine content adaptation.
- **Status:** verified local prototype.
- **Scope and files changed:** Home `home-page.ts|html|scss`, new `home-campaign.ts|scss`, `home-product-rail.ts|scss`, `reference-home-content.ts`; `mocks/uniqlo-home.ts`; `media/media-manifest.ts`, `media/uniqlo-reference.json`; 82 images and 4 videos in `public/assets/uniqlo-reference/`; extraction/import/measurement/QA scripts in `scripts/reference/`; extracted content/import reports and README in `reference/uniqlo/`; `tests/home.spec.ts`; both Home plan documents.
- **Decisions and assumptions:** Main body follows the supplied snapshot's 11 campaigns, immediate 18-category grid, and 3 rails / 12 products. Existing nine2fine header/footer and commerce remain. Source content, GBP prices, logos and external links are temporary; variant selection and reference favorites are local prototype state, not real inventory/cart/wishlist. Video loads in view, pauses offscreen or when hidden, respects reduced motion and provides manual controls. Original source files and assets preserved; previous Home backed up to `.open-figma-mcp/exports/uniqlo-import/nine2fine-before-import.zip`. No source trackers/scripts executed or shipped. No new GSAP choreography in this source-layout pass; previous motion foundation retained.
- **Verification actually run and result:** Final `npm.cmd run lint`, `npm.cmd run format:check`, `npm.cmd run build` passed; production initial transfer estimate 148.00 kB, Home 6.86 kB, no budget warning. Home E2E initially 7 passed / 1 failed: mobile department navigation intercepted the video pause button. Moved the hero control above the navigation; the affected mobile test then passed (1/1). All 8 Home cases therefore covered across desktop/mobile; whole suite not rerun. QA at 375/390/430/768/1024/1440/1920 found no overflow, broken rendered images or page errors; browser decoded all 82 source images. Desktop/mobile hero and product screenshots inspected; final mobile hero screenshot refreshed after the control fix. Evidence in `.open-figma-mcp/exports/uniqlo-import/`.
- **Remaining issues / temporary assets:** This is a local source-content prototype, not a published nine2fine campaign. Shared shell intentionally differs from UNIQLO; no pixel parity claim. Swatch selection does not yet change external product query parameters. No production LCP/CLS audit, real SKU mapping or content adaptation completed. Source export has four videos; responsive posters are used for other campaigns.
- **Next concrete step:** Review the local Home, replace the fixture/media with nine2fine campaigns and real SKU/category links, then layer GSAP onto the accepted structure.

Giữ nhật ký ngắn, có bằng chứng và phản ánh code thực tế. Cập nhật các phần đặc tả liên quan nếu có quyết định thay đổi; không chỉ thêm ghi chú mâu thuẫn ở cuối. Không ghi test passed hoặc feature complete khi chưa kiểm chứng.

## Implementation Entry — 2026-10-04 / Home Category Grid + Three Moments

- **Date / task:** 2026-10-04 — user requested a product-category grid immediately below the hero and authorized starting the reference plan.
- **Status:** verified (mock); first implementation stage only, broader Home upgrade remains in progress.
- **Scope and files changed:** `features/home/home-categories.ts|scss` (new component), `home-content.ts`, `home-page.ts|html`, `home-story.ts`; `mocks/home-content.ts`; `core/analytics.ts` (category event boundary); `tests/home.spec.ts`; both Home plan documents. QA script, screenshots and viewport report in `.open-figma-mcp/exports/home-category-grid/`.
- **Decisions and assumptions:** Four canonical categories (Áo, Quần & chân váy, Đầm, Áo khoác), 4-column desktop / 2×2 mobile, real catalog routes, existing Pexels editorial photos through the manifest, GSAP stagger and hover/focus with reduced-motion. Story is now explicitly three styling suggestions; related PDP links no longer claim a photographed SKU. Added time navigation, decorative GSAP scroll progress and copy reveals; shortened desktop story and kept all text fully readable. No new photos/dependencies, no commerce/auth/account visual changes.
- **Verification actually run and result:** `npm.cmd run lint`, `npm.cmd run format:check` and `npm.cmd run build` passed (initial estimated transfer 145.35 kB, Home 10.85 kB; no budget warning). `npx.cmd playwright test tests/home.spec.ts`: 10 passed across desktop/mobile, including all four category routes with correct product sets, browser back, keyboard entry, story navigation/PDP and reduced-motion. QA at 375/390/430/768/1024/1280/1440/1920: no horizontal overflow, no broken category images or page errors; desktop/mobile screenshots inspected.
- **Remaining issues / temporary assets:** Category photos reuse existing stock and are not SKU photos. New Drop/Best Sellers product placeholders, provisional USP and sample reviews remain as before; these are next stages, not completed work. Page transition and production LCP/CLS measurement remain unimplemented/unmeasured. Full-site E2E was not rerun; Home tests cover the affected routes.
- **Next concrete step:** Replace stock with cohesive category photography and supply real SKU photos for New Drop/Best Sellers; use the mapping/shot brief in the reference plan. Continue the remaining Home stages without representing stock as product evidence.

## Crawl Attempt — 2026-10-04 / Full UNIQLO UK Landing

- **Date / task:** 2026-10-04 — user changed direction to crawling the full UNIQLO landing first and adapting content later.
- **Status:** blocked by source HTTP 403; no full landing captured and no application changes made in this turn.
- **Scope and files changed:** `scripts/reference/crawl-uniqlo.mjs`, `reference/uniqlo/README.md`, plan status/next-task entries; diagnostic HTML, screenshot, resource list and `crawl-report.json` in `.open-figma-mcp/exports/uniqlo-reference/`.
- **Decisions and assumptions:** No guessed reconstruction from incomplete data. No login/session export is needed. A saved HTML with assets or MHTML from a browser that can normally open the public page is the next input.
- **Verification actually run and result:** Playwright Edge navigation to the requested URL returned 403 Access Denied; a direct HTTP fetch also returned 403. A public alternate-page probe initially returned a small HTTP 200 response, but follow-up inspection returned Access Denied and yielded no usable page. Web access exposed navigation only, not the rendered campaign landing. `node --check scripts/reference/crawl-uniqlo.mjs` passed. No application lint/build/E2E rerun because application files were unchanged.
- **Remaining issues / temporary assets:** Existing nine2fine Home remains at the verified category-grid/story version. The diagnostic `source.html`/`rendered.html` from the first probe contain an error page; they must not be mistaken for the requested landing.
- **Next concrete step:** User saves the accessible page as complete HTML + assets or MHTML into `reference/uniqlo/`; inspect and implement from that source.

## Implementation Entry — 2026-10-04 / nine2fine Content on Imported Layout

- **Date / task:** User approved the imported layout and requested nine2fine content plus a smaller category section.
- **Status:** verified (editorial content, mock catalog destinations).
- **Scope and files changed:** new `features/home/landing-content.ts`, `mocks/nine2fine-landing.ts`; updated `home-page.ts|html|scss`, `home-campaign.ts|scss`, `home-product-rail.ts|scss`; `tests/home.spec.ts`; optional output-directory argument in `scripts/reference/qa-uniqlo-home.mjs`; master plan sections 0/8/45/current state/next task and Home reference plan.
- **Decisions and assumptions:** Kept all 11 campaign slots and 3 four-card rails, full-width dimensions, typography scale and responsive scrolling. Reduced category grid from 18 to the catalog's four canonical categories: Áo, Quần & chân váy, Đầm, Áo khoác. Hero becomes From Nine to Fine; department links become work/dinner/event/weekend. All shopping/account links use Angular RouterLink and existing routes. Removed GBP prices, reference promotions, source logo overlays and source-only material claims. Rails are explicitly styling suggestions linked to categories/moments; no fabricated SKU mapping, color variants or local-only wishlist controls. Replaced collaboration/store/news campaign imagery with existing Pexels editorial assets; other reference media remain temporary and attributed. Source fixture/assets are preserved. No GSAP or shared shell changes.
- **Verification actually run and result:** `npm.cmd run lint`, `npm.cmd run format:check`, `npm.cmd run build` passed (initial transfer estimate 147.40 kB, Home 5.88 kB, no budget warning). `npx.cmd playwright test tests/home.spec.ts`: 10 passed across desktop/mobile, including all four category routes with expected catalog products, keyboard activation/browser back, hero/edit/moment/registration links, video controls/offscreen pause and reduced motion. QA widths 375/390/430/768/1024/1440/1920: no overflow, broken rendered images or page errors. Desktop/mobile hero and mobile rail screenshots inspected. Evidence: `.open-figma-mcp/exports/home-nine2fine-content/`.
- **Remaining issues / temporary assets:** Reference/stock imagery is not nine2fine product photography; the page states this. Editorial rails intentionally do not display SKU prices or claim depicted outfits are available products. Real product photography, catalog validation and a separate GSAP pass remain. No full-site E2E or production LCP/CLS audit in this task.
- **Next concrete step:** Review the adapted copy; replace temporary photos with brand assets and map actual SKU photography before adding shoppable product cards.

## Implementation Entry — 2026-10-04 / Persistent Transparent Landing Header

- **Status:** verified.
- **Scope and files changed:** `src/app/layouts/store-layout.ts|scss`, existing Home navigation E2E case in `tests/home.spec.ts`, header behavior specification and this ledger.
- **Decision:** Landing header stays fixed with its existing transparent gradient/white foreground at every scroll position. Removed the scroll threshold signal and listener. Open mobile menu retains its solid readable panel; other routes retain the standard white header.
- **Verification:** lint, format:check and production build passed; targeted existing Home E2E passed on desktop and mobile (2 cases), checking transparency at categories, final rail and footer, and standard header after navigating to shop.
- **Limitations / next work:** Existing gradient retained for contrast over light sections; no new visual treatment or full-site regression run. Continue photography/content work separately.

## Implementation Entry — 2026-10-11 / Nike-style Header (Content + Motion)

- **Date / task:** 2026-10-11 — header theo Nike VN về nội dung và animation; danh mục xổ xuống có ảnh minh họa; design nine2fine giữ nguyên.
- **Status:** verified (mock routes/data).
- **Scope and files changed:** new `src/app/layouts/navigation/` — `top-navigation.ts` (top-level items + utility links, eager, small), `store-navigation.ts` (menu columns/photos built from `CATEGORIES`/`MOMENTS`, lazy), `mega-menu.ts|scss` (desktop panel + preview photo crossfade), `mobile-drawer.ts|scss` (drawer + sub-panels, CdkTrapFocus); `layouts/store-layout.ts|scss` (utility bar, compact-on-scroll, hover intent, scrim, promo strip, `@defer` for menu/drawer, search pill may shrink to fit a 4th nav item); `app.config.ts` (chevron left/right icons); tests `header.spec.ts` (drawer flow + 2 new cases), `auth.spec.ts` (scoped "Đăng nhập" locator). Reference probes/screenshots: `.open-figma-mcp/exports/nike-header/` (Nike) and `.open-figma-mcp/exports/header-nike/` (nine2fine QA).
- **Decisions and assumptions:** Measured Nike VN: 36px utility bar + 60px bar, utility bar slides away on scroll (transform 150 ms), mega menu `max-height` 250 ms with page scrim, mobile right drawer with sliding sub-panels and member block. Adapted: Nike's Help/Store links have no nine2fine routes, so utility = Tra cứu đơn hàng / Yêu thích / Tham gia / Đăng nhập (or "Xin chào, …"). No Sale menu (no sale filter); added "Khoảnh khắc". Menus only list categories with products (Nam has no Đầm). Images reuse the temporary Pexels slots used by the Home category grid; Nam links keep the one menswear photo instead of showing womenswear. Panel uses `clip-path` instead of height animation (plan 23). Promo values come from provisional `STORE_POLICY`. Heart icon still not in the main bar (Figma); wishlist is in the utility bar/drawer.
- **Verification actually run and result:** `npm run lint`, `npm run format:check` pass; `npm run build` pass, initial 598.27 kB / 155.16 kB transfer (first attempt warned 612 kB → fixed by `@defer` and splitting nav config; drawer chunk 3.1 kB). Playwright QA: hover open/switch/close, preview swap, keyboard Enter/Escape focus return, drawer open/sub-panel/back/close, scroll unlocked, no console errors; no horizontal overflow at 801–1920 px (fixed a 52px overflow at 1920). Full `npx playwright test`: 47 passed, 4 skipped, 1 failed — mobile PDP case, not reproduced in 6 repeated runs (intermittent). Separately `home.spec.ts:53` is flaky from before this task: `/auth/register` redirects to `/auth/login` without a login-step email, so the Home campaign CTA to register bounces; not changed here.
- **Remaining issues / temporary assets:** Menu photos are temporary stock, not category/SKU photography; only one menswear photo. Utility/promo copy and policy values are provisional. No Figma frame for the mega menu/drawer (visuals derived from existing tokens).
- **Next concrete step:** Fix the Home "register" CTA destination (point to `/auth/login`) and its test; supply category photography (incl. menswear) for menu previews.

## Implementation Entry — 2026-10-11 / Nike-style Search Panel

- **Date / task:** 2026-10-11 — người dùng thấy thanh tìm kiếm "chưa ok"; thay modal bằng search panel kiểu Nike, giữ design nine2fine.
- **Status:** verified (mock catalog).
- **Scope and files changed:** new `features/search/search-panel.ts|html|scss`, `features/search/search-suggestions.ts` (popular terms, suggestion builder, match highlight, `SearchHistory`); removed `features/search/search-dialog.ts`; `layouts/store-layout.ts` (`searchOpen`, `@defer` panel, focus return, `aria-expanded`); `shared/ui/overlay.service.ts` and `styles.scss` (removed the unused `search` panel variant); `mocks/mock-catalog-api.ts` (search matches name + type); `tests/header.spec.ts` (new search case). Nike probe: `.open-figma-mcp/exports/nike-header/search-*`; nine2fine QA: `.open-figma-mcp/exports/header-nike/new-search-*`.
- **Decisions and assumptions:** Problems found in the old modal: it opened detached from the header pill and autofocus landed on "Đóng", so typing did nothing; only name search (Vietnamese terms like "đầm" found nothing). Nike pattern adopted: sheet over the header with centred field and Hủy, page scrim, popular-term chips, suggestions column + product cards, full-screen on mobile. Kept nine2fine pill/chip/card styling. Popular terms are provisional merchandising, each verified to return mock products. History stays on the device (try/catch around storage). Panel is lazy (5.6 kB); initial bundle fell to 538.98 kB / 143.40 kB because the CDK dialog is no longer pulled in by the header.
- **Verification actually run and result:** lint and format:check pass; build pass (no budget warning). Full `npx playwright test`: 49 passed, 4 skipped, 1 failed — the known pre-existing `home.spec.ts:53` register-redirect flake (see previous entry). New search case passes on desktop and mobile (input focused on open, chips, "dam" → "Đầm" suggestion and 1 result, ↓ + Enter opens `/shop/dresses`, history chip, Enter submits `/search?q=blazer`); existing rapid-replacement/empty-result/Escape-focus test passes. Screenshots reviewed at 1440 (PLP and Home) and 390; no page errors.
- **Remaining issues / temporary assets:** Result cards show placeholder product art until SKU photos exist. Suggestions are built client-side from the mock catalog; a backend search/suggest endpoint should replace this. Popular terms need real analytics.
- **Next concrete step:** Backend contract for search suggestions/popular terms; product photography.

## Implementation Entry — 2026-10-11 / Search Open–Close Continuity

- **Date / task:** 2026-10-11 — người dùng thấy trạng thái active/inactive của thanh tìm kiếm "tách rời hoàn toàn".
- **Status:** verified.
- **Scope and files changed:** `features/search/search-panel.ts|html|scss` (scripted open/close with Web Animations: FLIP morph of the field from the header pill's rect, border, background and shadow; bar background, logo and Hủy fade; results unfold by `clip-path`; reverse on every close path before `closed` fires; icon-only origin starts as a centred icon and reveals the text while widening; field now mirrors the header pill: text left, icon right, same padding/type); new `features/search/search-origin.ts` (type-only, keeps the panel in its lazy chunk); `layouts/store-layout.ts|scss` (measure the trigger and main-bar top on open, `searching` hides the original pill so only one copy is visible, focus returns after it reappears).
- **Decisions and assumptions:** The sheet starts at the header's main bar (below the utility bar when shown), so the logo and bar do not jump. Removed the previous whole-sheet wipe (that wipe caused the detached feeling). Width/height are animated only on this one element during a single 260–340 ms transition. Reduced motion skips all scripted motion.
- **Verification actually run and result:** lint, format:check pass; build pass (initial 539.62 kB, search chunk 6.3 kB transfer; a mixed type import briefly pulled the panel into the initial bundle and was fixed). Frame-by-frame QA at 0.1× playback (CDP) on `/new-in` 1440, Home 1440 (transparent header) and 390 mobile: field travels/expands from the pill and returns to it; panel removed after close; focus back on the trigger; no page errors. Full `npx playwright test`: 48 passed, 4 skipped, 2 failed — only the known `home.spec.ts:53` register-redirect flake.
- **Remaining issues / temporary assets:** Same as the search-panel entry. On Home the logo cross-fades from white to dark as the bar turns white (intended).
- **Next concrete step:** Fix the Home register CTA flake (separate task); backend search suggestions.
- **Follow-up (2026-10-11):** At the top of the page the utility bar was dimmed by the search scrim and stayed in its transparent style, which looked like a missing strip. Search now behaves like an open mega menu: `transparent` is false while searching (utility bar + bar solid), the scrim starts at the main bar, and the panel host is click-through above it. Verified: lint, format:check, build (539.64 kB), header/commerce/home E2E 24 passed, 3 skipped, 1 failed (known `home.spec.ts:53` register flake); screenshots `top-search.png` (Home and `/new-in` at scroll 0).

## Implementation Entry — 2026-10-11 / Removable Demo Seed Data

- **Date / task:** 2026-10-11 — người dùng (UI/UX designer) cần dữ liệu mẫu phong phú để xem UI với nội dung thực tế, dễ gỡ bỏ.
- **Status:** verified (mock mode only).
- **Scope and files changed:** new `src/mocks/demo-seed/` (`index.ts` with `DEMO_SEED_ENABLED` + `DEMO_SEED_BROWSER_STATE` flags, `applyDemoSeed`, `DEMO_SEED_VOUCHER_RULES`, `seedDemoBrowserState`; `seed-helpers.ts`, `seed-account-data.ts`, `seed-orders.ts`, `seed-browser-state.ts`, `README.md` in Vietnamese). Hook lines marked `// DEMO SEED` in `src/main.ts`, `src/mocks/mock-account-store.ts` (constructor) and `src/mocks/mock-checkout-api.ts` (seed voucher rules fallback). `playwright.config.ts` (`storageState` presets empty cart/wishlist so tests start empty); `tests/account.spec.ts` (counts read from tab badges / initial rows, fixture order IDs targeted, tier regex). Original fixtures in `account-fixtures.ts` untouched.
- **Decisions and assumptions:** Seed merges at the store level: `demo@nine2fine.vn` gets +13 orders (19 total; pending 3, processing 2, shipping 3, delivering 2, completed 4, cancelled 3, returned 2), +2 addresses (one very long, default unchanged), +3 vouchers (expires today / in 2 days / long terms; codes work in checkout), Silver tier. New account `gold.demo@nine2fine.vn` (Gold, 5 orders). 7 guest orders `N2F261001101`–`107` (one per status, contacts `0909000101`–`107` / `*@example.com`). All dates relative to `Date.now()`. Two order lines use long snapshot names over real slugs. Cart (4 lines) and wishlist (5) are written to localStorage only when the keys are missing, respecting `n2f.cart.v1` / `n2f.wishlist.v1` schemas. New members stay empty (Bronze) for empty states.
- **Verification actually run and result:** `npm run lint` pass; `prettier --check` pass; `npm run build` pass (initial 553.37 kB / 146.68 kB, no budget warning); `tsc -p tsconfig.app.json --noEmit` with the flag set to `false` pass. `npx playwright test tests/account.spec.ts tests/checkout.spec.ts`: 14 passed. `tests/commerce.spec.ts tests/header.spec.ts`: 15 passed, 3 skipped. Scratch Playwright check against the running dev server: fresh browser bag count 5; demo orders tabs 3/5/2/4/3/2 (19 total); 5 addresses; 6 vouchers; "Silver Member"; gold account 5 orders "Gold Member"; all 8 guest IDs found on `/track-order`; no page errors.
- **Remaining issues / temporary assets:** `Voucher` has no used/expired state, so no expired vouchers are seeded; orders store discount amounts, not voucher codes. Seed data is in the initial bundle (mock adapter is too). Product imagery stays placeholder.
- **Next concrete step:** Remove the seed before backend integration (flag `false` or delete folder + `// DEMO SEED` lines, see `src/mocks/demo-seed/README.md`).

## Implementation Entry — 2026-10-11 / UI/UX Audit Batch 1 (Consistency Foundation)

- **Date / task:** 2026-10-11 — đợt 1 của `document/nine2fine_UI_UX_AUDIT_PLAN.md` (G8, G1, G2, G3/D5, G5/D3), mobile và desktop ưu tiên ngang nhau.
- **Status:** verified.
- **Scope and files changed:** `layouts/navigation/mobile-drawer.scss|ts` (drawer trượt từ trái, nút đóng ở vị trí hamburger trên panel gốc); `styles.scss` (hệ nút pill: `.button` outline, `.button.dark`, `.button.primary` đỏ chỉ cho hành động chốt mua; token `--page-gutter` 48/32/16 px thay padding container riêng); `features/cart/cart-view.ts` (bỏ padding lồng ở trang giỏ, CTA giỏ trống → dark); `features/checkout/checkout-page.html|scss` (nút đặt đơn → đỏ, CTA giỏ trống → dark); `features/catalog/catalog-page.html`, `filter-dialog.ts`, `features/product/product-page.html`, `shared/ui/not-found-page.ts` (CTA không phải mua → dark); `layouts/store-layout.ts|scss` (promo strip 1 dòng rút gọn trên ≤800 px, footer: "09:00 → FINE." một dòng, link footer cao 40 px mobile, chữ tối thiểu 11–12 px, lưới 4 cột ở 801–1100 px); `features/home/home-page.scss`, `home-product-rail.scss`, `home-campaign.scss` (chiều rộng/lề theo `--page-width`/`--page-gutter`); `shared/ui/empty-state.component.ts` (illustration căn giữa — trước đó lệch trái do `img { display: block }`).
- **Decisions and assumptions:** Người dùng yêu cầu triển khai theo plan; các câu ở mục 5 chưa chốt dùng phương án khuyến nghị. Plan ghi "bo 6 px" cho nút chính, nhưng frame Figma auth/account và hầu hết nút hiện có dùng pill, nên chuẩn hóa sang pill để giữ visual auth/account. Nút trong account/auth (Figma) không đổi.
- **Verification actually run and result:** `npm run lint` pass; `npm run format:check` pass; `npm run build` pass (initial 555.08 kB / 146.92 kB transfer, không cảnh báo budget); `npx playwright test` 50 passed, 4 skipped, 0 failed. Ảnh trước/sau ở 390/900/1440 px: `.open-figma-mcp/exports/ui-audit/` (trước) và `ui-audit/after-batch1/` (sau); không tràn ngang, không page error.
- **Remaining issues / temporary assets:** Promo strip chưa ẩn khi cuộn; footer mobile chưa thành accordion; nhãn khoảnh khắc vẫn tiếng Anh (G4, đợt 3).
- **Next concrete step:** Đợt 2 — luồng mua (L1, C1, C2, C3, K1, K3, K4, A1, A2, D4).

## Implementation Entry — 2026-10-11 / UI/UX Batch 2 (Shopping Experience)

- **Date / task:** 2026-10-11 — đợt 2 của audit plan gộp với yêu cầu người dùng: thẻ sản phẩm kiểu UNIQLO, thêm nhanh từ PLP, thông báo thêm giỏ (không tự mở giỏ), chọn món cần mua trong giỏ, trang giỏ theo UNIQLO (tham khảo trực tiếp uniqlo.com/uk cart và nike.com/vn cart).
- **Status:** verified (mock).
- **Scope and files changed:** `shared/commerce/product-card.component.ts` (viết lại: nhãn Mới về/Bán chạy/-% trong ảnh góc dưới trái, nút ‹ › đổi màu khi hover (ẩn trên thiết bị cảm ứng, dùng swatch thay thế), swatch 28 px chọn được + tim ngay dưới ảnh, dòng loại, tên, giá 18 px đậm (đỏ khi giảm giá), sao + số đánh giá; bỏ zoom/crossfade khi hover; nút + mở hàng size để thêm nhanh); `shared/ui/toast.ts` (mới: `ToastService` + `ToastHost`, aria-live, tự ẩn 4 s, dừng khi hover/focus); `layouts/store-layout.ts` (gắn toast host); `features/product/product-page.ts` (toast thay vì mở drawer); `features/cart/cart-state.ts` (`selected?` trên dòng giỏ, `selectedLines/Count/Subtotal`, `toggleSelected`, `selectAll`, `clearSelected`); `features/cart/cart-view.ts` (viết lại: thanh tiến độ freeship, chọn tất cả + checkbox từng dòng, tim, stepper bo tròn, Xóa có icon, thành tiền; trang /cart 2 cột với khung tóm tắt xám dính, mobile thành thanh tổng tiền + Thanh toán dính đáy); `features/checkout/checkout-page.ts|html` (chỉ dùng dòng đã chọn, sau đặt hàng chỉ xóa dòng đã mua, empty state riêng khi chưa chọn món); `features/catalog/models/product.ts` (`colorMedia?`, `rating?`), `mocks/mock-catalog-api.ts` (tính rating từ sample reviews); tests `commerce.spec.ts` (cập nhật + 1 case mới), `checkout.spec.ts`.
- **Decisions and assumptions:** Ảnh sản phẩm vẫn là placeholder nên khi đổi màu, nền ảnh được phủ nhẹ màu đang chọn để thấy phản hồi; khi có ảnh thật, khai báo `colorMedia` theo tên màu là ảnh đổi đúng màu. Ngưỡng freeship tính theo các món đã chọn. Dòng giỏ cũ không có `selected` được coi là đã chọn (tương thích schema `n2f.cart.v1`).
- **Verification actually run and result:** lint, format:check pass; build pass (initial 569.28 kB / 149.97 kB transfer, không cảnh báo budget); `npx playwright test` 52 passed, 4 skipped, 0 failed. Case mới bắt được lỗi số lượng ở checkout vẫn đếm món chưa chọn, đã sửa. Ảnh desktop/mobile: `.open-figma-mcp/exports/ui-audit/batch2/`; không tràn ngang, không lỗi console.
- **Remaining issues / temporary assets:** Chưa có ảnh theo màu; rating chỉ có cho 3 sản phẩm có sample review. Các mục đợt 2 còn lại của plan: K1, K3, K4 (checkout), A1, A2 (menu/tab tài khoản mobile), D4 (PDP desktop).
- **Next concrete step:** Hoàn tất phần checkout + tài khoản mobile của đợt 2.

## Implementation Entry — 2026-10-11 / Feedback: Home Copy, Cart, Product Card, Header Wishlist

- **Date / task:** 2026-10-11 — phản hồi của người dùng sau đợt 2.
- **Status:** verified (mock), trừ ghi chú test bên dưới.
- **Scope and files changed:** Home: `features/home/home-campaign.ts|scss`, `landing-content.ts`, `home-page.html|scss`, `mocks/nine2fine-landing.ts`, `tests/home.spec.ts` (bỏ dòng CTA gạch chân, cả section là link; bỏ dòng nguồn ảnh UNIQLO/Pexels; viết lại toàn bộ copy Home ngắn hơn hoặc bằng bản cũ, giữ "From Nine to Fine." và "After Five Club"). Giỏ: `features/cart/cart-state.ts` (`changeVariant` gộp dòng trùng), `features/cart/cart-view.ts` (bỏ thanh freeship; dòng bỏ chọn không còn mờ; CTA thanh toán màu đen; "Đổi màu/size" mở bộ chọn ngay trong dòng; mục "Có thể bạn cũng thích" 4 sản phẩm bán chạy chưa có trong giỏ, cuộn ngang trên mobile). Thẻ sản phẩm: `shared/commerce/product-card.component.ts` (tim fill đỏ khi đã lưu + toast lưu/bỏ yêu thích; ‹ › không nền tròn; ảnh trượt theo hướng mũi tên/swatch bằng `animate.enter/leave`). Header: `layouts/store-layout.ts|scss` (icon tim + badge số lượng trước giỏ hàng, mọi breakpoint), `layouts/navigation/top-navigation.ts` (bỏ "Yêu thích" khỏi utility bar và drawer). `app.config.ts` (đăng ký `reiconHeartFill` từ `@ng-icons/reicon/fill`). Tests `commerce.spec.ts`, `checkout.spec.ts` (badge giỏ hàng định vị theo nút giỏ).
- **Decisions and assumptions:** Người dùng yêu cầu CTA thanh toán màu đen → áp dụng cho giỏ (drawer + trang); nút "Đặt đơn" ở checkout vẫn đỏ, chờ xác nhận. Icon tim header dùng nét viền (giống icon giỏ), số lượng hiện bằng badge.
- **Verification actually run and result:** lint, format:check pass; build pass (initial 589.89 kB / 155.27 kB transfer, không cảnh báo budget; tăng ~20 kB vì drawer giỏ nạp sẵn ProductCard cho mục gợi ý). Lần chạy full `npx playwright test` sau thay đổi giỏ/thẻ: 49 passed, 4 skipped, 3 failed khi subagent Home chạy test song song trên cùng dev server; chạy lại riêng commerce/checkout desktop 9/9 pass, lần full kế tiếp chỉ còn 1 failed là flake cũ `home.spec.ts` register-redirect. Sau thay đổi header: `header/home/commerce/checkout` specs pass sau khi sửa locator `.bag-count` (2 badge). Lần chạy full cuối bị người dùng dừng giữa chừng. Ảnh: `.open-figma-mcp/exports/ui-audit/batch3/`, `ui-audit/home-copy/`.
- **Remaining issues / temporary assets:** Flake `home.spec.ts` register CTA vẫn tồn tại từ trước. Chưa có ảnh theo màu nên hiệu ứng trượt chủ yếu thấy qua nền tint.
- **Next concrete step:** Phần còn lại đợt 2: K1, K3, K4, A1, A2, D4.

## Implementation Entry — 2026-10-11 / Cart Line Redesign + Surface Token

- **Date / task:** 2026-10-11 — người dùng yêu cầu chỉnh thẻ sản phẩm trong giỏ (tham khảo dòng giỏ Nike) và đổi màu nền `#F7F6F3` → `#F4F4F4`.
- **Status:** verified (mock).
- **Scope and files changed:** `features/cart/cart-view.ts` (nút giảm số lượng thành icon thùng rác khi số lượng = 1 và bỏ nút "Xóa"; nút tim tròn viền nằm bên phải pill số lượng; giá duy nhất mỗi dòng = thành tiền, đặt góc phải trên chỗ tim cũ; bỏ dòng đơn giá + "Thành tiền"; icon bút cạnh "Màu · Size" mở bộ chọn màu/size thay cho nút chữ); `styles.scss` (`--surface: #f4f4f4`, ảnh hưởng mọi nền xám dùng token).
- **Verification actually run and result:** lint, format:check pass; build pass (initial 590.16 kB / 155.25 kB); `npx playwright test tests/commerce.spec.ts tests/checkout.spec.ts tests/account.spec.ts` 25 passed. Ảnh: `.open-figma-mcp/exports/ui-audit/batch4/`.
- **Remaining issues / temporary assets:** Full suite chưa chạy lại cho thay đổi này (phạm vi chỉ giỏ hàng + token màu).
- **Next concrete step:** Chờ phản hồi; phần còn lại đợt 2 (K1, K3, K4, A1, A2, D4).

## Implementation Entry — 2026-10-11 / Cart Selection Mode

- **Date / task:** 2026-10-11 — người dùng: bỏ "Tiếp tục mua sắm"; giỏ luôn tính tổng toàn bộ, ẩn checkbox; icon checklist cạnh nút X bật chế độ chọn với "Chọn tất cả" và "Xóa"; ở chế độ chọn ẩn nút xóa và chỉnh sửa trên thẻ.
- **Status:** verified (mock).
- **Scope and files changed:** `features/cart/cart-state.ts` (bỏ `selected` và API chọn để thanh toán; thêm `removeMany`), `features/cart/cart-view.ts` (nút `reiconListCheck` trong header giỏ (drawer: trái nút X; trang: góc phải tiêu đề); thanh "Chọn tất cả (n)" + "Xóa (k)" nền xám khi bật; checkbox từng dòng chỉ hiện khi bật; thùng rác trong pill và icon bút ẩn khi đang chọn; tổng/nút "Thanh toán (n)" luôn theo cả giỏ; bỏ "Tiếp tục mua sắm"), `features/checkout/checkout-page.ts|html` (quay lại dùng toàn bộ giỏ, bỏ empty state "chưa chọn"), `app.config.ts` (`reiconListCheck`), `tests/commerce.spec.ts` (case mới: chế độ chọn xóa dòng).
- **Verification actually run and result:** lint, format:check pass; build pass (initial 593.11 kB / 155.85 kB, không cảnh báo budget); `commerce/checkout/account` specs 25 passed. Ảnh: `.open-figma-mcp/exports/ui-audit/batch5/`.
- **Remaining issues / temporary assets:** Full suite chưa chạy lại cho thay đổi này.
- **Next concrete step:** Chờ phản hồi; còn K1, K3, K4, A1, A2, D4.

## Implementation Entry — 2026-10-11 / Cart Page Alignment + Typography

- **Date / task:** 2026-10-11 — trang /cart: bỏ gạch ngang dưới tiêu đề, nút checklist thẳng cột với giá; dòng "Mua thêm … để được miễn phí giao hàng" thay ghi chú mã giảm giá dưới nút Thanh toán; tăng cỡ chữ nội dung.
- **Status:** verified (mock).
- **Scope and files changed:** `features/cart/cart-view.ts` — trang giỏ thành lưới 2 cột (tiêu đề chỉ chiếm cột danh sách; nút checklist 36 px sát mép phải cột), freeship tính theo `STORE_POLICY.freeShippingFrom` và tổng giỏ (hiện cả trong thanh dính đáy trên mobile), cỡ chữ: tên sản phẩm 16 (trang 18), giá dòng 16, màu/size 14, số lượng 15, chọn tất cả 15, tóm tắt 15/19, ghi chú 14, nhãn bộ chọn 14.
- **Verification actually run and result:** lint, format:check pass; build pass (initial 593.78 kB / 156.04 kB); `commerce/checkout` specs 17 passed. Ảnh: `.open-figma-mcp/exports/ui-audit/batch5/batch6-*.png`.
- **Next concrete step:** Chờ phản hồi.

## Fix — 2026-10-11 / Cart Summary Follows Selection Mode

- **Issue (user):** ở chế độ checklist, khung tóm tắt không reset và không đổi theo các món đang chọn.
- **Fix:** `features/cart/cart-view.ts` — `summaryLines/Count/Subtotal` theo các món được tick khi đang ở chế độ chọn (vào chế độ = 0 món, nút đổi thành "Chọn sản phẩm để thanh toán" bị khóa), freeship tính theo tổng đó; `startCheckout()` ghi lựa chọn vào `CartState.checkoutIds`. `features/cart/cart-state.ts` — `checkoutIds`, `checkoutLines`, `checkoutCount`, `clearCheckedOut()` (sau đặt hàng chỉ xóa các món đã mua). `features/checkout/checkout-page.ts|html` dùng `checkoutLines`. Lựa chọn chỉ giữ trong phiên; tải lại trang thì checkout quay về cả giỏ.
- **Verification:** lint, format:check pass; build pass (initial 594.93 kB / 156.16 kB); `commerce/checkout` specs 19 passed, gồm case mới: tổng về 0 khi vào chế độ chọn, đổi theo món được tick, checkout chỉ 1 món, giỏ còn đủ 2 món.

## Fix — 2026-10-11 / Wishlist Requires Sign-in

- **Issue (user):** khách (guest) vẫn thêm được vào Yêu thích.
- **Fix:** `features/wishlist/wishlist-state.ts` — `toggle()` khi chưa đăng nhập ghi nhớ sản phẩm, chuyển tới `/auth/login?returnUrl=<trang hiện tại>` và trả `false`; sau khi đăng nhập (cùng phiên) sản phẩm được lưu tự động. `savedIds` rỗng với guest (tim không hiện đã lưu, badge header ẩn). Mọi nơi đọc wishlist (thẻ sản phẩm, giỏ, PDP, header, trang danh sách) dùng `savedIds`; thẻ sản phẩm chỉ hiện toast khi lưu thật. `app.routes.ts` — `/wishlist` dùng `accountGuard`. Test `commerce.spec.ts` case đầu đổi thành: guest bấm tim → trang đăng nhập → đăng nhập → quay lại, sản phẩm đã lưu, mở `/wishlist` thấy 1 sản phẩm.
- **Limit:** phiên mock chỉ trong bộ nhớ, tải lại trang sẽ mất đăng nhập nên Yêu thích cũng ẩn cho tới khi đăng nhập lại; dữ liệu wishlist vẫn nằm ở localStorage của trình duyệt cho đến khi có backend.
- **Verification:** lint, format:check pass; build pass (initial 595.52 kB / 156.76 kB); `commerce/checkout/pdp-plp/header` specs 28 passed.

## Implementation Entry — 2026-10-17 / Share Demo via ngrok

- **Date / task:** 2026-10-17 — người dùng muốn chia sẻ web cho nhóm qua ngrok kèm tài khoản demo đầy đủ.
- **Status:** verified locally (chưa chạy ngrok thật: máy chưa cài ngrok, cần authtoken của người dùng).
- **Scope and files changed:** `angular.json` (serve configuration `share`: build production, `allowedHosts` cho `.ngrok-free.app/.ngrok-free.dev/.ngrok.app/.ngrok.dev`, tắt HMR/live reload); `package.json` (`npm run share` → cổng 4300, không đụng `npm start` 4200); `src/mocks/demo-seed/seed-account-data.ts`, `index.ts`, `README.md` (tài khoản trống `new.demo@nine2fine.vn`, Bronze); `document/demo-share-guide.md` (hướng dẫn ngrok + tài khoản + mã tra cứu + lộ trình xem).
- **Decisions and assumptions:** Không cài thêm package; authtoken chỉ cấu hình trên máy người dùng, không vào repo/chat. Dùng dev-server cấu hình production thay vì static server để giữ SPA fallback.
- **Verification actually run and result:** lint, format:check pass. `npm run share` khởi động; `curl` với `Host: abc-123.ngrok-free.app` → 200 (cả deep link `/account/orders`), host lạ → 403. Playwright trên :4300 đăng nhập 3 tài khoản: demo 19 đơn Silver, gold 5 đơn Gold, new.demo 0 đơn Bronze, không page error.
- **Remaining issues:** Phiên mock mất khi tải lại trang; mỗi người xem có dữ liệu riêng trong trình duyệt.

## Implementation Entry — 2026-10-18 / PLP Size Sheet + PDP Buy Now

- **Date / task:** 2026-10-17/18 — người dùng: PLP dùng icon giỏ thay "+", bấm mở bottom sheet chọn size, nút chuyển từ tròn sang pill "Thêm vào giỏ" chỉ active khi đã chọn size, đóng sheet bằng 2 mũi tên hướng xuống hoặc chạm vùng trên thẻ (không điều hướng); PDP bỏ zoom theo chuột, "Lưu yêu thích" → "Mua ngay", tim thành icon, xử lý khoảng trống dưới ảnh.
- **Status:** verified (mock).
- **Scope and files changed:** `shared/commerce/product-card.component.ts` (nút `reiconCartShop` tròn → pill full-width khi mở; sheet trượt lên/xuống bằng `animate.enter/leave`; chọn size có trạng thái active; nút trong suốt phủ ảnh để đóng sheet; đổi màu reset size; Escape đóng); `features/product/product-gallery.ts` (bỏ zoom theo con trỏ); `features/product/product-page.html|scss|ts` (icon tim tròn cạnh tên sản phẩm; nút "Mua ngay" viền đen dưới "Thêm vào giỏ": cần size, thêm vào giỏ nếu chưa có, `checkoutIds` chỉ phiên bản đó rồi tới `/checkout`; gallery dính theo khi cuộn thay vì cột thông tin, nên không còn khoảng trống dưới ảnh; mobile không dính); tests `commerce.spec.ts` (luồng sheet mới), `pdp-plp.spec.ts` (case Mua ngay).
- **Verification actually run and result:** lint, format:check pass; build pass (initial 598.65 kB / 157.30 kB). `commerce/pdp-plp/checkout` specs: 23 passed, 1 failed (mobile: test bấm vùng đóng phía trên bị sheet che vì thẻ mobile nhỏ) → đổi test sang nút mũi tên, chạy lại 2/2 pass. Kiểm tra tay bằng Playwright: chạm vùng trên ảnh đóng sheet và URL giữ nguyên trên desktop và mobile. Ảnh: `.open-figma-mcp/exports/ui-audit/batch7/`.
- **Remaining issues:** Trên thẻ mobile (~175 px) sheet chiếm phần lớn ảnh, vùng chạm phía trên chỉ còn ~40 px; nút mũi tên vẫn là cách đóng chính. Có một server node khác của người dùng đang chạy ở `localhost:4200` (IPv6); preview của mình chạy ở 4201.

## Implementation Entry — 2026-10-18 / PDP Content Trim

- **Date / task:** người dùng duyệt bản rà soát nội dung PDP; chốt ẩn "Mặc theo cách của bạn" và đưa phí ship/điều kiện đổi trả sau "Xem chính sách".
- **Status:** verified (mock).
- **Scope and files changed:** `features/product/product-page.html|scss|ts` — bỏ hộp fit (gộp vào dòng dưới chọn size: "Đúng size · … . Người mẫu cao … , mặc size …"), bỏ dòng nhắc chọn size cố định (chỉ hiện khi sắp hết hàng), danh sách giao hàng 3 dòng → 1 dòng "Giao 2–4 ngày · Đổi trả trong 30 ngày" + `details` "Xem chính sách" (phí ship, freeship, điều kiện tem nhãn), bỏ khối gạch đầu dòng (màu/dành cho/khoảnh khắc), bỏ accordion "Kích cỡ & độ vừa" và "Giao hàng & đổi trả" cùng ghi chú "Chính sách mô phỏng"; accordion còn lại "Chi tiết sản phẩm" (chất liệu, bảo quản, mã sản phẩm); ẩn mục Looks (giữ dữ liệu `looks` trong model); bỏ `genderLabel/momentLabel` không còn dùng. `features/product/product-reviews.ts` — hiện 2 đánh giá + nút "Xem tất cả n đánh giá". `tests/pdp-plp.spec.ts` cập nhật.
- **Verification actually run and result:** lint, format:check pass; build pass (initial 598.65 kB / 157.35 kB); `pdp-plp/commerce/checkout` specs 24 passed. Chiều cao trang PDP: desktop 3.999 → 2.881 px, mobile 4.981 → 4.050 px. Ảnh: `.open-figma-mcp/exports/ui-audit/batch8/`.
- **Remaining issues:** Mục Looks bật lại khi có ảnh phối thật (khôi phục section trong template).

## Implementation Entry — 2026-10-18 / PDP Info Column Follow-up

- **Date / task:** người dùng chỉnh tiếp PDP: bỏ sao + số đánh giá dưới tên; tim chỉ còn icon (không viền tròn); bỏ dòng thông tin dưới chọn size; dưới 2 nút mua lấy lại danh sách 3 icon (giao dự kiến, miễn phí vận chuyển, đổi trả) và accordion "Chất liệu & chăm sóc" như bản cũ.
- **Status:** verified (mock).
- **Scope and files changed:** `features/product/product-page.html|scss|ts` — bỏ link rating (+ `average`, `scrollToReviews`, style `.rating/.stars`), bỏ `.model-note` (fit + người mẫu; `aria-describedby` chỉ trỏ lỗi size), bỏ mô tả + "Xem chính sách" + mã sản phẩm, khôi phục `ul.trust` 3 icon, accordion duy nhất "Chất liệu & chăm sóc"; tim `.favorite` không viền, hover đỏ. `tests/pdp-plp.spec.ts` bỏ assertion dòng fit.
- **Verification actually run and result:** lint, format:check pass; build pass (initial 598.65 kB / 157.30 kB); `pdp-plp/commerce` specs 18 passed. Chiều cao PDP: desktop 2.838 px, mobile 3.957 px.
- **Note:** Mô tả sản phẩm và gợi ý độ vừa/người mẫu hiện không còn hiển thị trên PDP (dữ liệu vẫn trong model); thang độ vừa vẫn có trong phần Đánh giá.

## Implementation Entry — 2026-10-18 / Visual Size Guide

- **Date / task:** người dùng muốn modal hướng dẫn chọn size trực quan hơn.
- **Status:** verified (mock).
- **Scope and files changed:** `features/product/size-guide-dialog.ts` — khối "tìm size": hình người SVG đánh số vị trí đo theo cột số đo cơ thể của danh mục (Ngực/Eo/Vai, Eo/Mông/Dài chân trong, Ngực/Eo/Mông), ô nhập cm cho từng số đo, đang nhập ô nào thì vạch tương ứng đổi đỏ và hiện cách đo; gợi ý size = size nhỏ nhất phủ mọi số đo đã nhập (giữa hai size lấy size lớn hơn), báo khi vượt size lớn nhất; hàng size gợi ý được tô trong bảng; nút "Chọn size X" đóng modal và chọn size đó trên PDP (ẩn nếu size hết hàng ở màu đang xem). Giữ tab Số đo cơ thể / Số đo sản phẩm. `features/product/product-page.ts` — truyền size còn hàng, nhận size trả về từ modal.
- **Verification actually run and result:** lint, format:check pass; build pass (initial 598.78 kB / 157.38 kB); `pdp-plp.spec.ts` 5 passed. Playwright tay: blazer và đầm, nhập Ngực 88 + Eo 73 → gợi ý L, bấm "Chọn size L" → nút L được chọn trên PDP; không page error. Ảnh: `.open-figma-mcp/exports/ui-audit/batch9/`.
- **Remaining issues:** Bảng size là dữ liệu mẫu; hình người là minh họa đơn giản tự vẽ.

## Fix — 2026-10-18 / Size Guide Copy + Default Tab

- **Change (user):** `features/product/size-guide-dialog.ts` — bỏ dòng fit/người mẫu trong modal, thay bằng hướng dẫn "Đo sát cơ thể… chọn size lớn hơn để thoải mái." (hiện khi chưa có gợi ý); bỏ "chỉ cần một số là đủ để gợi ý."; bảng mặc định tab "Số đo sản phẩm" (đứng trước "Số đo cơ thể"), ghi chú ±1–2 cm chỉ hiện ở tab sản phẩm. `tests/pdp-plp.spec.ts` đổi thứ tự kiểm tra tab.
- **Verification:** lint, format:check pass; build pass; `pdp-plp.spec.ts` pass; Playwright tay gợi ý + chọn size vẫn đúng (L) trên desktop/mobile.

## Fix — 2026-10-18 / Size Guide: Garment Table Only

- **Change (user):** `features/product/size-guide-dialog.ts` — bỏ thanh tab Số đo sản phẩm / Số đo cơ thể; bên dưới chỉ còn bảng số đo sản phẩm (hàng size gợi ý vẫn được tô) và ghi chú ±1–2 cm. Bảng số đo cơ thể vẫn dùng ngầm để tính gợi ý từ số đo người dùng nhập. `tests/pdp-plp.spec.ts` kiểm tra không còn tab.
- **Verification:** lint, format:check pass; build pass; `pdp-plp.spec.ts` 5 passed; Playwright tay gợi ý L + chọn size đúng trên desktop/mobile.

## Implementation Entry — 2026-10-18 / Bank Transfer via QR + Per-order Virtual Account (simulated)

- **Date / task:** người dùng: chuyển khoản bằng mã QR với tài khoản ảo (VA) riêng từng đơn, tự đối soát → xác nhận nhận tiền + xác nhận đơn; quá 30' chưa trả thì tự hủy. Chưa có VA thật: dùng ảnh QR người dùng gửi; giả lập tiền về sau 15'.
- **Status:** verified (mock).
- **Scope and files changed:** `public/assets/payment/qr-placeholder.jpg` (từ `Downloads/QR.jpg` của người dùng); `features/checkout/checkout-api.ts` (`VirtualAccount`, `PaymentSession` awaiting/paid/expired, `PAYMENT_SIMULATOR` token, `paymentSession()` + HTTP `GET /orders/:id/payment`); `features/checkout/payment-page.ts` (mới, route `/payment/:orderId`: QR, số tiền, VA + sao chép, chủ TK, đếm ngược đến hạn, trạng thái chờ có polling 5s; màn "Đã nhận …" và "Hết thời gian thanh toán"; khối "Bản trải nghiệm" với nút giả lập nhận tiền/hết hạn chỉ ở mock); `features/checkout/checkout-page.ts` (chuyển khoản → `/payment/:id`, nhãn "Chuyển khoản qua mã QR", giữ 30'); `mocks/mock-checkout-api.ts` (giữ đơn 30'; tiền về 15' sau lần đầu mở QR; quá hạn → hủy; `simulatePayment`); `mocks/mock-account-store.ts` (`updateOrder`); `orders/order-models.ts` (`paidAt?`); `app.config.ts` (provider `PAYMENT_SIMULATOR`); `app.routes.ts`; account `orders-page.ts`, `order-detail-page.ts`, `order-cancellation.ts` ("Thanh toán ngay" mở trang QR, bỏ thông báo "chưa khả dụng"); `layouts/store-layout.ts` (drawer giỏ nạp lười để initial bundle về dưới budget); `tests/checkout.spec.ts`.
- **Verification actually run and result:** lint, format:check pass; build pass (initial 529.01 kB / 143.78 kB; lần build trước khi nạp lười giỏ hàng vượt budget 600 kB 1,04 kB). `checkout/account` specs 14 passed. Playwright với `page.clock`: đứng ở trang QR, 14:50 vẫn chờ, 15:10 chuyển "Đã nhận 3.650.000 ₫". Ảnh: `.open-figma-mcp/exports/ui-audit/batch10/`.
- **Remaining issues:** Đối soát/hủy giả lập chỉ chạy khi trang thanh toán (hoặc API phiên thanh toán) được gọi; đơn chưa từng mở trang QR sẽ không tự đổi trạng thái trong lịch sử. Seed đơn chờ thanh toán cũ vẫn có hạn 3h/23h. Backend thật cần: tạo VA/VietQR, webhook đối soát, job hủy đơn quá hạn, xác thực quyền xem `/payment/:id`.

- **Follow-up (2026-10-18):** người dùng đổi thời gian giả lập tiền về thành **15 giây** (`AUTO_PAID_AFTER_MS = 15_000` trong `mocks/mock-checkout-api.ts`), polling trang thanh toán 3s; hạn giữ đơn vẫn 30 phút.
- **Follow-up (2026-10-18):** đơn hết hạn đặt `cancelledBy: 'system'` và `cancelledAt` (field do thread lịch sử mua hàng thêm vào model) để lịch sử hiển thị đơn tự hủy do quá hạn.

## Implementation Entry — 2026-10-18 / Order History & Tracking Fixes

- **Date / task:** người dùng: rà soát rồi sửa trang Lịch sử mua hàng / theo dõi đơn của thành viên (đề xuất: `order-history-review.md` trong thư mục dự án chung).
- **Status:** verified (mock).
- **Scope and files changed:** `orders/order-models.ts` (thêm `cancelledBy`, `cancelledAt`, `refund.refundedAt`, `timeline: OrderEvent[]`, đều optional); `orders/order-status.ts` (tab trùng tên huy hiệu, tách tab "Đang chuẩn bị"; huy hiệu `processing` = "Đang chuẩn bị hàng"; ghi chú hủy theo người hủy; tiền hoàn "đã hoàn"/"đang hoàn" theo ngày; đếm ngược hạn thanh toán, quá hạn ẩn thanh toán; câu trả hàng thống nhất; stepper "Chuẩn bị hàng"; `orderTimeline`, `carrierTrackingUrl`, nhãn phương thức/trạng thái thanh toán tách riêng); `orders/order-view.ts` (Lịch sử đơn hàng dạng timeline, sao chép mã vận đơn + link tra cứu hãng, stepper dọc trên mobile, "Miễn phí" vận chuyển, trạng thái hoàn tiền); `orders/order-items.ts` (đơn giá × SL, cắt tên 2 dòng, `limit` + "và N sản phẩm khác", link "Viết đánh giá" cho đơn hoàn thành); account `order-card.ts` (hiện mã đơn + giờ đặt, bỏ link "Xem chi tiết lộ trình", nút Mua lại), `orders-page.ts` (tìm theo mã/tên không dấu, "Xem thêm" mỗi 10 đơn, empty state theo tab, số đếm chỉ trên tab đang xử lý, tự cuộn tab đang chọn + fade, toast khi hủy, skeleton), `order-detail-page.ts` (tiêu đề "Đơn #…", thông báo khi hủy, Mua lại), `buy-again.ts` (mới); mocks `mock-account-api.ts` (hủy đặt `cancelledBy: 'customer'`), `demo-seed/seed-helpers.ts` (`demoTimeline`), `seed-orders.ts`, `demo-seed/index.ts`; `tests/account.spec.ts`, `tests/checkout.spec.ts` (nhãn mới).
- **Verification actually run and result:** ngc strictTemplates pass; eslint + prettier pass trên các file đổi; Playwright `account.spec.ts` + `checkout.spec.ts` 14/14 passed (desktop + mobile, chạy trên bản sao trong môi trường cloud với Chromium 1194). Chụp tay danh sách, chi tiết đơn vận chuyển/hủy/trả hàng, Mua lại (giỏ 5 → 8).
- **Remaining issues:** link "Liên hệ nine2fine" trỏ `/help` nhưng chưa có route này (404); chưa cho hủy đơn "Đang chuẩn bị" và chưa hỏi lý do hủy (cần quy tắc nghiệp vụ); "Viết đánh giá" chỉ dẫn tới khu đánh giá trên PDP; timeline vận chuyển là dữ liệu giả lập trong demo seed, backend thật cần trả `timeline`.

## Fix — 2026-10-18 / Order History & Detail UI Pass

- **Change (user: "xem kỹ lại UI"):** chụp cả 7 trạng thái đơn trên desktop 1440 và mobile 390 rồi sửa. `order-view.ts`: nút Thanh toán/Hủy/Mua lại nằm ngay dưới tiêu đề trạng thái (slot `[actions]`) thay vì cuối trang; danh sách sản phẩm hiện 3 dòng + "Xem thêm N sản phẩm"; hai cột Sản phẩm/Tóm tắt cùng đường kẻ đầu; stepper mobile gọn hơn (32px); icon bước rõ nghĩa (thẻ, hóa đơn cho COD, hộp hàng, giao hàng) qua `provideIcons` cục bộ. `order-card.ts`: mã đơn và huy hiệu cùng hàng, ghi chú trạng thái full width có icon theo trạng thái; mobile padding 16px, nút hành động chia đều full width, "Chi tiết đơn" dùng mũi tên phải. `order-items.ts`: mobile giá xuống dưới tên để tên không gãy dòng; "Viết đánh giá" sau giá. `orders-page.ts`: icon tìm kiếm; fade mép tab chỉ trên màn hẹp. `account-layout.ts` + `shared/ui/center-active.ts` (mới): menu tài khoản và thanh tab trên mobile tự cuộn mục đang chọn vào giữa (chỉ đổi `scrollLeft`, trang không nhảy). `order-detail-page.ts`: Mua lại là nút phụ với đơn hủy/trả.
- **Verification:** ngc strictTemplates, eslint, prettier pass; Playwright `account.spec.ts` + `checkout.spec.ts` 14/14 passed (bản sao trên cloud); ảnh trước/sau desktop + mobile đã so sánh.

## Implementation Entry — 2026-10-18 / Operational Readiness (P0 + P1 + F5)

- **Date / task:** người dùng: sửa các mục P0, P1 và lỗi F5 trong `product-readiness-review.md`. Quyết định của người dùng: thông tin doanh nghiệp giả định nhưng không ghi "giả lập"; chính sách viết theo luật Việt Nam hiện hành và đồng bộ với nội dung trên site; đơn COD hủy được khi "Đang chuẩn bị hàng", khách vãng lai hủy trên trang tra cứu; chỉ trả hàng và hoàn tiền (gồm giao sai size, sai màu), không đổi hàng; chỉ người đã nhận hàng mới được đánh giá.
- **Status:** verified (mock).
- **Scope and files changed:** mới `core/store-info.ts` (thông tin doanh nghiệp, giá trị giữ chỗ), `features/policies/` (`policy-content.ts`, `policy-page.ts`, `help-page.ts`; route `/policies/:slug`, `/help`), `orders/order-returns.ts`, `account/orders/return-request-page.ts` (`/account/orders/:orderId/return`), `product/review-form.ts`, `product/stock-alert.ts`, `mocks/mock-persistence.ts` (sessionStorage `n2f.mock.v1`), `mocks/mock-inventory.ts`, `tests/operations.spec.ts`. Sửa `store-policy.ts` (phí gửi trả, thời gian hoàn, giữ đơn chuyển khoản), `app.routes.ts`, `app.config.ts` (khôi phục phiên + biên nhận sau F5), footer `store-layout.*` (cột Hỗ trợ + thông tin pháp lý; "Đổi trả" → "Trả hàng"), checkout (email không bắt buộc, ghi chú, hóa đơn VAT, đồng ý điều khoản bắt buộc, báo dòng hết hàng + nút cập nhật, "Giá đã bao gồm VAT"), `cart-state.ts` (`applyStock`), `checkout-api.ts` (`invoice`, `acceptedTerms`, 409 `items`, `cancelOrder` cho khách), `track-order-page.ts` (hủy đơn, thanh toán, hướng dẫn trả hàng), đơn hàng (`order-models/status/view`, trạng thái `return-requested`, `canCancel`), tài khoản (`order-card`, `order-detail-page`, `order-cancellation`, `account-api`, `account-messages`), PDP (`product-page.*`, `product-reviews.ts` nhãn "Đã mua hàng"), catalog API (`reviewEligibility`, `submitReview`, `notifyBackInStock`), mocks (`mock-account-api/store`, `mock-catalog-api`, `mock-checkout-api`), `tests/checkout.spec.ts`, `tests/commerce.spec.ts`, `README.md`, `document/backend-integration.md`.
- **Verification actually run and result:** eslint + prettier pass; `ng build` production pass, không cảnh báo budget; Playwright toàn bộ 68 passed, 4 skipped, 2 failed (đều là test video ở `home.spec.ts`, đã fail trước thay đổi do codec của môi trường cloud); `operations.spec.ts` 14/14 sau lần đổi chữ cuối. Chụp desktop 1440 + mobile 390 cho checkout, trả hàng, PDP, chính sách, footer.
- **Remaining issues:** mọi giá trị trong `store-info.ts` là giả định, phải thay bằng thông tin đăng ký thật; chưa gắn link/huy hiệu thông báo Bộ Công Thương (đặt `notificationUrl` sau khi thông báo); nội dung chính sách cần luật sư rà lại trước khi vận hành; ảnh trả hàng chỉ gửi số lượng, backend cần API tải ảnh; dữ liệu giả lập chỉ giữ trong tab hiện tại.

## Implementation Entry — 2026-10-25 / Admin Workspace (frontend + mock)

- **Date / task:** người dùng: code lại phân hệ admin theo `document/admin/admin-design-guideline.md` (v1.3, phụ lục A ghi các quyết định đã chốt); tách bạch admin và client; chỉ frontend với dữ liệu giả lập, sẵn sàng nối API; giao diện modern, clean, minimal, không bắt buộc đồng bộ với storefront (ảnh tham chiếu `document/admin/reference-style.png`).
- **Status:** verified (mock).
- **Scope and files changed:** mới `src/app/admin/` (route `/admin` nạp lười với `provideAdmin()` ở cấp route; `styles/admin.scss` là bundle CSS riêng `admin.css` không inject vào storefront, mọi lớp nằm dưới `.adm` với token `--adm-*`; `core/` định dạng, nhãn trạng thái, quyền theo vai trò, phiên; `data-access/` model + port + adapter HTTP dưới `/api/admin`; `ui/` thành phần dùng chung; `layout/` shell, sidebar, Ctrl K; `features/` Tổng quan, Đơn hàng + chi tiết, Trả hàng, Sản phẩm + form, Tồn kho + drawer điều chỉnh, Khách hàng + chi tiết, Khuyến mãi + form, Cài đặt cửa hàng/nhân viên/nhật ký), mới `src/mocks/admin/` (seed có PRNG cố định, lưu sessionStorage key `admin`), `tests/admin.spec.ts`, `document/admin/` (guideline v1.3, ảnh tham chiếu, `ADMIN_API_CONTRACT.md`). Sửa ngoài thư mục admin: `app.routes.ts` (thêm route `admin`), `angular.json` (bundle `admin.css`), `package.json`/`package-lock.json` (`chart.js`).
- **Verification actually run and result:** eslint (toàn `src`) + prettier pass; `ng build` production pass, initial 563,51 kB (trước 559,11 kB; icon admin chép SVG vào `admin/ui/icon-svgs.ts` để không kéo thêm reicon vào chunk dùng chung); `admin.css` tên cố định. Playwright `admin.spec.ts` 10/10 (desktop + mobile); chụp tay desktop 1440 + mobile 390 mọi màn hình, drawer, dialog, save bar, vai trò Nhân viên.
- **Remaining issues:** chưa có backend; tài khoản demo `admin@nine2fine.vn / admin123`, `staff@nine2fine.vn / staff123` chỉ có ở mock. Chưa có điều hướng bản ghi trước/sau trên trang chi tiết, in phiếu giao dùng `window.print`, upload ảnh trong mock lưu data URL vào sessionStorage (ảnh lớn có thể vượt dung lượng). `admin.css` không hash nên cần cấu hình cache phù hợp khi deploy.
