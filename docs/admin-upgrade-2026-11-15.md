# Nâng cấp Admin – 2026-11-15

Làm theo bản đề xuất nâng cấp Admin đã duyệt. Toàn bộ sửa trực tiếp trong working tree, **chưa commit**
(working tree đang có nhiều thay đổi chưa commit của thread khác). Danh sách file ở cuối để tách commit.

Không đổi Prisma schema, không migration, không đổi logic nghiệp vụ đơn / trả hàng / tồn kho.

## Đợt 1 – Sidebar

- Giữ đủ 12 mục ở cấp đầu, **không còn menu con** ở cả mock mode lẫn desk mode (trước đây mock mode
  lồng Trả hàng dưới Đơn hàng và Bộ sưu tập / Bảng size / Đánh giá dưới Sản phẩm). Vẫn lọc theo quyền và
  theo cờ `*Mode` như hàm `items()` cũ.
- 4 tiêu đề nhóm (chữ hoa, xám, nhỏ):
  - **Vận hành hằng ngày**: Tổng quan, Đơn hàng, Trả hàng, Tồn kho
  - **Sản phẩm**: Sản phẩm, Bộ sưu tập, Bảng size, Đánh giá
  - **Tăng trưởng**: Khách hàng, Khuyến mãi, Báo cáo
  - **Website**: Nội dung trang chủ
- Nhóm trống (do quyền/cờ) ẩn luôn tiêu đề. Bấm tiêu đề để thu/mở, nhớ trong localStorage
  (`n2f.admin.sidebar.groups`, có try/catch). Sidebar thu gọn chỉ icon: tiêu đề thành đường kẻ mảnh.
- Cài đặt, thông tin người dùng, Đăng xuất vẫn ghim cuối.
- Badge: Đơn hàng (như cũ), Trả hàng (desk: chờ duyệt + chờ nhận + chờ hoàn, đọc `counts` của
  `GET /admin/returns`; mock: như cũ), Tồn kho (số SKU hết hàng, `facets().counts.out`), Đánh giá (số chưa
  trả lời, `counts.unanswered` của API reviews). Chỉ gọi khi mục đó đang hiện trong menu. Cùng nguồn số với
  thẻ "Cần xử lý" ở Tổng quan.

## Đợt 2 – Tổng quan (desk mode, `adminInsightsMode = http`)

- Lời chào theo buổi theo giờ Việt Nam ("Chào buổi sáng/chiều/tối, <tên>") + 1 câu tóm tắt tạo từ số liệu
  (giao trễ, yêu cầu huỷ, đơn cần xác nhận, % doanh thu so với kỳ trước).
- 4 thẻ KPI: icon tròn, số lớn, chip % xanh/đỏ, sparkline (Doanh thu thuần từ `revenueSeries`; Đơn hoàn
  tất và Giá trị đơn TB từ `byDay` của báo cáo cùng khoảng; Khách mới không có chuỗi theo ngày nên không có
  sparkline). Nhân viên vẫn chỉ thấy "Đơn đặt hôm nay" như quyền cũ.
- Khối doanh thu: số lớn + chip Hôm nay / 7 ngày / 30 ngày. **Biểu đồ đi theo khoảng đã chọn** (7 hoặc 30
  điểm; "Hôm nay" vẽ 7 ngày gần nhất để có bối cảnh). Tooltip biểu đồ đổi sang nền tối, hiện kỳ này + kỳ
  trước (áp dụng chung cho `ui/chart.ts`).
- "Cần xử lý": ẩn dòng bằng 0, sắp theo mức gấp (giao trễ, yêu cầu huỷ lên đầu), số tô màu theo mức.
- "Tín hiệu" (tối đa 3, tính ở frontend): hết/sắp hết hàng (từ `todo`), sản phẩm bán chạy nhất, tỉ lệ huỷ
  tăng (từ báo cáo), hoặc doanh thu tăng/giảm mạnh, hoặc đơn giao trễ.
- "Đơn gần đây": 5 đơn mới nhất từ order desk (Nền tảng = Website, số thật) + 2 dòng Shopee / TikTok Shop
  gắn nhãn **"Mẫu"**, nền gạch chéo và ghi chú bên dưới.
- "Sản phẩm nổi bật": top 3 bán chạy, ảnh lớn.
- Nền xám rất nhạt, thẻ trắng bo 14px, ít viền, một màu nhấn (đen) – dùng token `--adm-*`.

## Đợt 2b – Tồn kho đa kênh (demo)

- Banner: "Kết nối sàn đang ở chế độ demo…".
- 4 thẻ kênh: Website (thật) + Shopee, TikTok Shop, Lazada (mẫu): ô chữ viết tắt màu thương hiệu,
  "Đã kết nối · đồng bộ X phút trước", số SKU liên kết, số lỗi đồng bộ, nút "Đồng bộ ngay" (giả lập 1–2 giây,
  toast thành công, cập nhật thời gian, các SKU "đang chờ" của kênh đó thành "đã đồng bộ").
- Chọn kênh: Tất cả kênh · Website · Shopee · TikTok Shop · Lazada (đổi cột kênh trong bảng và 5 KPI).
- 5 KPI: Tồn khả dụng, SKU sắp hết (chưa có tốc độ bán nên dùng ngưỡng cảnh báo hiện có), Hết hàng, Giá trị
  tồn theo giá bán (số lượng × giá bán sản phẩm, đọc toàn bộ danh sách sản phẩm), SKU lệch tồn giữa các kênh.
  KPI tính trên toàn bộ SKU (đọc hết các trang 100 dòng), không chỉ trang đang xem.
- Bảng SKU: thêm 1 cột / sàn (số đã đẩy lên sàn + chấm trạng thái xanh/cam/đỏ, tooltip giải thích).
- Panel "Quy tắc phân bổ": Dùng chung / Chia theo % (kiểm tổng = 100%), tồn đệm mỗi kênh; lưu localStorage
  `n2f.admin.marketplace.rules`.
- Drawer "Nhật ký đồng bộ": 12 dòng mẫu (thời gian, kênh, SKU, thay đổi, kết quả) có 2 lỗi mẫu.
- Toàn bộ dữ liệu sàn nằm trong `frontend/src/app/admin/data-access/marketplace-demo.ts` (có chú thích DEMO).
  Không gọi API ngoài. Chức năng điều chỉnh tồn, ngưỡng, bộ lọc, hàng loạt, xuất CSV giữ nguyên.

## Đợt 3 – Báo cáo thành dashboard theo tab

Một URL `/admin/reports`, tab lưu ở `?tab=` (mặc định Bán hàng), dùng chung bộ chọn ngày; nút Xuất CSV giữ.

1. **Bán hàng**: KPI cũ, biểu đồ thác nước (Tiền hàng → Giảm giá → Phí ship thu → Hoàn tiền → Thực thu; tính
   từ `kpis` có sẵn, ghi rõ doanh thu thuần không gồm ship), doanh thu theo ngày, theo danh mục (vành khuyên
   SVG + bảng), theo phương thức thanh toán (thanh ngang + bảng).
2. **Sản phẩm & tồn kho**: top sản phẩm (sắp theo số lượng / doanh thu), top biến thể, hiệu quả theo màu và
   theo size (cộng từ top 10 biến thể).
3. **Khách hàng**, 4. **Vận hành & đổi trả**, 5. **Khuyến mãi**: số thật từ endpoint đọc mới
   `GET /api/admin/reports-extra?from&to` (chỉ quản trị viên, `dashboard.revenue`):
   - Khách: khách có đơn, khách mới vs quay lại (theo đơn đầu tiên), tỉ lệ mua lặp (≥ 2 đơn trong khoảng),
     thành viên vs vãng lai, số đơn và giá trị đơn mới vs quay lại, doanh số theo tỉnh (top 10).
   - Vận hành: trung vị đặt→xác nhận, xác nhận→bàn giao, bàn giao→giao xong; % giao đúng hẹn
     (ngày giao VN ≤ `estimated_to`); lý do huỷ (`cancel_reason_code`, huỷ do hệ thống tách riêng); lý do
     trả hàng × lỗi thuộc về (`reason`, `fault`); heatmap thứ × giờ đặt đơn (giờ VN).
   - Khuyến mãi: đơn dùng mã, tỉ lệ, tổng tiền giảm, giá trị đơn kèm mã, bảng từng mã (lượt dùng, tổng giảm,
     giá trị đơn kèm theo).
   - Ba tab này chỉ gọi API khi được mở. Lỗi → câu thông báo + "Thử lại", **không có số giả**.
   - Ghi chú định nghĩa: các khối này đếm theo đơn đặt trong khoảng (`created_at`), trạng thái khác
     `cancelled`, khác với định nghĩa doanh thu Slice 8 (đơn đã giao + đã thanh toán) – có ghi trên màn hình.
- Biểu đồ: `ui/chart.ts` (Chart.js) cho doanh thu theo ngày; thác nước, vành khuyên, thanh ngang, heatmap là
  SVG/HTML tự vẽ theo token. Admin hiện chưa có chế độ tối nên không có biến thể dark riêng.

### Endpoint mới (backend, chỉ đọc)

- `backend/src/modules/insights-extra/insights-extra.service.ts`, `insights-extra.routes.ts`; gắn ở
  `backend/src/app.ts` một dòng `api.use('/admin/reports-extra', ...adminInsights, adminReportsExtraRouter)`
  (cùng khuôn noStore → requireAuth('admin') → requireRole → adminRateLimit; `requirePermission` trước Zod).
- Quy tắc ngày giống `/admin/reports/sales` (422 kèm `field`, tối đa 366 ngày, không quá hôm nay).
- Chưa thêm vào `docs/api/openapi.yaml` (file đang có thay đổi chưa commit của thread khác); shape trả về
  được mô tả ở `frontend/src/app/admin/data-access/insights-extra-api.ts` (interface `ExtraReport`).
- Test: `backend/test/insights-extra.test.ts` (401 / 403 nhân viên / 422 / số liệu / khoảng rỗng không NaN).

## Đợt 4 – Đánh giá

- Trang chi tiết sản phẩm có khối **"Đánh giá"** (component mới `product-reviews-panel.ts`, chèn 1 thẻ vào
  `product-form-page.html`): điểm TB (chỉ đánh giá đang hiện), phân bố sao, độ vừa theo size đã mua
  (chật / vừa / rộng), 5 đánh giá mới nhất kèm nhãn "Chưa trả lời" / "Đã ẩn", liên kết sang màn Đánh giá.
  API reviews admin không lọc theo `productId` nên đọc từng trang 50 dòng rồi lọc phía client. Ở desk mode chỉ
  hiện khi `reviewsMode = http`.
- Trang Đánh giá: mở mặc định ở **"Chưa trả lời"** (hộp việc cần làm), tab sắp lại Chưa trả lời · 1–2 sao ·
  Tất cả · Đã ẩn, thêm hộp "Hộp việc cần làm" với 2 nút lọc nhanh (số chưa trả lời, số đánh giá 1–2 sao).
  Mỗi dòng vẫn có liên kết mở đúng sản phẩm.

## Dữ liệu demo / mẫu

- Mọi số Shopee / TikTok Shop / Lazada ở Tồn kho (thẻ kênh, cột kênh, lệch tồn, nhật ký đồng bộ) và 2 dòng đơn
  sàn ở Tổng quan. Đều gắn nhãn "Mẫu" / banner demo, sinh tất định từ SKU trong `marketplace-demo.ts`.
- Quy tắc phân bổ chỉ lưu trên trình duyệt (localStorage), không ảnh hưởng tồn kho thật.
- Mọi số khác (Website, Báo cáo, Tổng quan) là số thật từ API.

## Kiểm tra

Chạy ngày 2026-11-15:

- `ng build`: qua, không lỗi, không cảnh báo (initial 561,22 kB).
- `npm run lint` (eslint src): qua, 0 lỗi.
- Prettier: mọi file của đợt này đúng định dạng. `npm run format:check` toàn repo chỉ báo
  `src/app/features/checkout/checkout-page.html` – file của thread khác, đợt này không đụng.
- Playwright desktop (cấu hình e2e, cổng 4210): admin-catalog 28, admin-content 11, admin-insights 21
  (có 1 test mới cho các tab Báo cáo), admin-login 12, admin-users 20, admin-orders 13, admin-returns 10,
  admin-order-actions 31, admin-order-extras 14, admin.spec 15, operations 7 – **tất cả pass**.
- Playwright mobile: admin-insights + admin-content 32/32 pass.
- Backend (vitest, Postgres test cục bộ): insights-access, insights-foundation, insights-reports,
  insights-dashboard, insights-extra – 48/48 pass. `npm run typecheck` qua. Chưa chạy toàn bộ bộ test backend.
- Lần chạy Playwright gộp tất cả file một lượt bị treo ở admin-login (không có test hỏng); chạy lại theo
  từng file thì qua hết.

Test đã sửa cho khớp hành vi mới:

- Thứ tự menu (nhóm mới): admin-insights, admin-catalog, admin-users.
- Tổng quan: dòng "Cần xử lý" bằng 0 bị ẩn (`todo-returning`), thứ tự gấp; "Sản phẩm nổi bật" dùng `.featured-item`.
- Báo cáo: top sản phẩm nằm ở tab "Sản phẩm & tồn kho"; fake API thêm `/reports-extra`.
- Đánh giá: mở mặc định "Chưa trả lời"; tab "2 sao trở xuống" đổi tên "1–2 sao"; test 409 mở `?view=all`.
- admin.spec "a review reply appears…": sau khi trả lời, đánh giá rời tab "Chưa trả lời" khi danh sách tải
  lại, nên test bấm sang "Tất cả" rồi mới kiểm câu trả lời.

## Ảnh chụp

`docs/admin-upgrade-shots/` (Playwright, dữ liệu từ các fake API của bộ test e2e, 1440×900 và 390×844):

- `tong-quan-1440.png`, `tong-quan-390.png`
- `ton-kho-1440.png`, `ton-kho-390.png`
- `bao-cao-ban-hang-1440.png`, `bao-cao-ban-hang-390.png`, `bao-cao-van-hanh-1440.png`, `bao-cao-van-hanh-390.png`
- `sidebar-1440.png`, `sidebar-thu-gon-1440.png`, `sidebar-390.png`

Script chụp là spec Playwright tạm (đã xoá sau khi chụp). Ảnh dùng dữ liệu fake nên chưa có ảnh sản phẩm thật.

## Dữ liệu demo cho DB dev (bổ sung 2026-11-15 trưa)

DB dev `nine2fine` lúc đó chỉ có 2 đơn, 3 tài khoản, 0 đánh giá, 0 trả hàng. Vì vậy các trang admin trống: là thiếu
dữ liệu chứ không phải lỗi code. Các service Tổng quan, Báo cáo, `reports-extra` đã chạy thử trên dữ liệu mới, không lỗi.

- Script: `backend/scripts/seed-demo-analytics.ts`.
  - Seed lại (tự gỡ bản cũ trước): `cd backend && npm run seed:demo`.
  - Gỡ sạch: `npm run seed:demo:remove`.
  - Chỉ chạy khi `DATABASE_URL` trỏ localhost.
- Backup trước khi seed: `C:\Users\ADMIN\nine2fine-backups\dev-before-demo-seed-20261115.dump` (pg_dump `-Fc`).
  Khôi phục: `pg_restore --clean --no-owner -d <DATABASE_URL> <file>`.
- Đã tạo khoảng 90 ngày:
  - 95 khách thành viên (giới tính, ngày sinh, có / không đồng ý marketing) + khách vãng lai;
  - 450 đơn (354 hoàn tất, 60 huỷ, còn lại đang chờ xác nhận / chuẩn bị / đang giao / yêu cầu huỷ / chờ chuyển
    khoản), có COD + chuyển khoản, nhiều tỉnh, nhiều giờ trong ngày (tối và cuối tuần nhiều hơn), khoảng 13% giao
    trễ, vài đơn khách từ chối nhận COD;
  - 104 lượt dùng voucher (2 voucher thật + `DEMOSALE50K`, `DEMOMIDSEASON10`);
  - 25 yêu cầu trả hàng ở đủ trạng thái;
  - 66 đánh giá (khoảng 55% đã trả lời, 2 đã ẩn);
  - 119 wishlist, 11 giỏ bỏ dở;
  - 104 dòng lịch sử điều chỉnh tồn kho (nhập hàng, hàng lỗi, kiểm kê). Cuối kỳ có 4 SKU hết hàng, 7 SKU sắp hết.
- Đánh dấu để gỡ: email `@demo.nine2fine.local`, mã đơn `N2F99…`, voucher `DEMO*`, ghi chú tồn kho `[demo-seed]`.
  Tài khoản admin / nhân viên / khách thật và 2 đơn thật không bị đụng tới.
- Tồn kho: script lưu ảnh chụp tồn trước / sau ở `C:\Users\ADMIN\nine2fine-backups\demo-seed-inventory.json`.
  Khi gỡ, tồn = trước + (hiện tại − sau), nên giữ được mọi thay đổi thật xảy ra sau khi seed. Đã thử gỡ rồi so từng
  SKU với bản backup: khớp 64/64.
- Ảnh chụp trên dữ liệu seed chưa có: tôi không đăng nhập bằng tài khoản admin thật của người dùng.

## Chưa làm / giới hạn

- "SKU sắp hết (< 7 ngày bán)": chưa có tốc độ bán theo SKU nên dùng ngưỡng cảnh báo hiện có.
- Sparkline "Khách mới": API dashboard không có chuỗi theo ngày nên bỏ.
- Tổng quan mới chỉ áp cho desk mode (`InsightsDashboardPage`); Tổng quan / Báo cáo của mock back office cũ
  (`features/dashboard`, `features/reports`) giữ nguyên.
- Chưa cập nhật `docs/api/openapi.yaml` cho `/admin/reports-extra` (tránh đụng file đang sửa dở của thread khác).
- Kết nối sàn thật: chưa có; khi có chỉ cần thay `marketplace-demo.ts` bằng adapter thật cùng kiểu dữ liệu.

## File đã sửa / thêm (để tự commit tách khỏi code của thread khác)

Thêm mới:

- `backend/src/modules/insights-extra/insights-extra.service.ts`
- `backend/src/modules/insights-extra/insights-extra.routes.ts`
- `backend/test/insights-extra.test.ts`
- `frontend/src/app/admin/data-access/marketplace-demo.ts`
- `frontend/src/app/admin/data-access/insights-extra-api.ts`
- `frontend/src/app/admin/features/insights/insights-dashboard-page.scss`
- `frontend/src/app/admin/features/insights/insights-reports-page.scss`
- `frontend/src/app/admin/features/products/product-reviews-panel.ts`
- `frontend/src/app/admin/ui/sparkline.ts`
- `backend/scripts/seed-demo-analytics.ts` (+ 2 script `seed:demo`, `seed:demo:remove` trong `backend/package.json`)
- `frontend/playwright.port4210.config.ts` (tiện ích chạy Playwright ở cổng 4210, có thể xoá)
- `docs/admin-upgrade-2026-11-15.md`, `docs/admin-upgrade-shots/*.png`

Sửa – file chỉ có thay đổi của đợt này (commit cả file được):

- `backend/src/app.ts` (+3 dòng: import + mount `/admin/reports-extra`)
- `frontend/src/app/admin/layout/admin-shell.ts`, `.html`, `.scss`
- `frontend/src/app/admin/features/insights/insights-dashboard-page.ts`, `.html`
- `frontend/src/app/admin/features/insights/insights-reports-page.ts`, `.html`
- `frontend/src/app/admin/features/inventory/inventory-page.ts`
- `frontend/src/app/admin/features/content/review-list-page.ts`
- `frontend/src/app/admin/ui/chart.ts` (tooltip nền tối)
- `frontend/tests/admin-insights.spec.ts`, `frontend/tests/admin-insights-fake.ts`,
  `frontend/tests/admin-content.spec.ts`, `frontend/tests/admin-users.spec.ts`, `frontend/tests/admin.spec.ts`

Sửa – file **đã có thay đổi của thread khác** (chỉ commit phần của đợt này, dùng `git add -p`):

- `frontend/src/app/admin/features/products/product-form-page.ts`: 1 dòng import
  `AdmProductReviews` + 1 dòng trong mảng `imports`.
- `frontend/src/app/admin/features/products/product-form-page.html`: 3 dòng
  `@if (!isNew() && id()) { <adm-product-reviews … /> }` trước khối "danger-zone".
- `frontend/tests/admin-catalog.spec.ts`: thứ tự menu trong test AC-INV-07
  (`[Đơn hàng, Tồn kho, Sản phẩm, Khuyến mãi]` + 1 dòng chú thích).

Ghi chú khi kiểm: Postgres test cục bộ cổng 54329 (cụm `C:/Users/ADMIN/AppData/Local/Temp/n2f-pg18`) đã được
bật lại để chạy test backend. Cổng 4200 đang có một `ng serve` thường (không phải cấu hình e2e) nên Playwright
chạy qua `playwright.port4210.config.ts` với `npm run start:e2e -- --port 4210`.
