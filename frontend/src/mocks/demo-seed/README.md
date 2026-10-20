# Demo seed — dữ liệu mẫu để xem giao diện

Thư mục này chứa **dữ liệu hư cấu** (không phải khách hàng, đơn hàng hay giá thật) để xem UI với nội
dung phong phú: nhiều đơn hàng đủ mọi trạng thái, nhiều địa chỉ, phiếu giảm giá, hạng thành viên,
giỏ hàng và danh sách yêu thích có sẵn. Tất cả nằm trong bộ nhớ của mock adapter (tải lại trang là
dữ liệu tài khoản trở về trạng thái ban đầu, phiên đăng nhập cũng mất).

Ngày giờ được tính **tương đối so với thời điểm mở trang** (ví dụ "đặt 40 phút trước", "hạn thanh
toán còn 3 giờ"), nên dữ liệu không bao giờ trông cũ.

## Đăng nhập

| Tài khoản                | Nội dung                                                                        |
| ------------------------ | ------------------------------------------------------------------------------- |
| `demo@nine2fine.vn`      | Hạng **Silver**, 19 đơn hàng, 5 địa chỉ, 6 phiếu giảm giá                       |
| `gold.demo@nine2fine.vn` | Hạng **Gold** (không có thanh tiến độ), 5 đơn, 2 địa chỉ, 2 phiếu               |
| `new.demo@nine2fine.vn`  | Hạng **Bronze**, không có đơn/địa chỉ/phiếu (xem empty state không cần đăng ký) |
| Email bất kỳ chưa có     | Đăng ký mới → tài khoản trống, hạng **Bronze** (xem empty state)                |

Cách đăng nhập: vào **Đăng nhập** → nhập email → **Tiếp tục** → nhập mã `12345678` (mã demo
`DEMO_VERIFICATION_CODE` trong `src/mocks/accounts.ts`), hoặc bấm **Sử dụng mật khẩu** và nhập
`Nine2fine1`. Đây chỉ là giá trị demo của mock, không phải mật khẩu thật.

## Đã seed những gì

**`demo@nine2fine.vn`** (cộng thêm vào 6 đơn / 3 địa chỉ / 3 phiếu gốc trong `account-fixtures.ts`):

- 19 đơn hàng, mọi trạng thái đều có ít nhất 2 đơn: Chờ thanh toán 3 · Đang xử lý 2 + Đang vận
  chuyển 3 (tab "Vận chuyển" = 5) · Đang giao 2 · Hoàn thành 4 · Đã hủy 3 · Trả hàng/Hoàn tiền 2.
- Từ 1 đến 5 sản phẩm mỗi đơn; có đơn dùng voucher (giảm giá), đơn miễn phí ship và đơn trả phí
  ship 30K (đơn dưới 1.000.000 ₫); thanh toán COD, chuyển khoản, Visa, Mastercard (số thẻ giả).
- Đơn chờ thanh toán có hạn sắp tới (còn ~3 giờ và ~23 giờ). Đơn hoàn thành có ngày giao. Đơn hủy
  có/không có hoàn tiền; đơn trả hàng có hoàn tiền một phần hoặc toàn bộ.
- 2 sản phẩm trong đơn có **tên rất dài** (giả lập tên đã lưu lúc mua) để kiểm tra xuống dòng; link
  vẫn mở đúng trang sản phẩm vì dùng slug thật.
- Thêm 2 địa chỉ: một địa chỉ **rất dài** (tên người nhận và số nhà dài), một ở Đà Nẵng. Địa chỉ
  mặc định vẫn là địa chỉ gốc "Nguyễn Minh – Ký túc xá Khu B".
- Thêm 3 phiếu: `N2FAUTUMN20` (hết hạn sau 2 ngày), `N2FSHIPTODAY` (hết hạn hôm nay),
  `N2FSILVER200` (điều kiện rất dài). Các mã này áp dụng được ở trang thanh toán.
- Hạng Silver: đã chi 23.450.000 ₫ / 40.000.000 ₫.

**Giỏ hàng và Yêu thích** (lưu trong localStorage của trình duyệt): giỏ có 4 dòng (5 sản phẩm), danh
sách yêu thích có 5 sản phẩm. Chỉ được ghi **khi trình duyệt chưa từng có** khóa `n2f.cart.v1` /
`n2f.wishlist.v1`. Nếu bạn đã xóa hết giỏ, giỏ sẽ không tự đầy lại. Muốn lấy lại dữ liệu mẫu: DevTools
→ Application → Local Storage → xóa hai khóa trên rồi tải lại trang.

## Tra cứu đơn khách vãng lai (`/track-order`)

Nhập mã đơn và **số điện thoại hoặc email** tương ứng:

| Mã đơn         | Trạng thái         | Số điện thoại | Email                              |
| -------------- | ------------------ | ------------- | ---------------------------------- |
| `N2F261001101` | Chờ thanh toán     | `0909000101`  | `khach.cho.thanh.toan@example.com` |
| `N2F261001102` | Đang xử lý         | `0909000102`  | `khach.dang.xu.ly@example.com`     |
| `N2F261001103` | Đang vận chuyển    | `0909000103`  | `khach.van.chuyen@example.com`     |
| `N2F261001104` | Đang giao hàng     | `0909000104`  | `khach.dang.giao@example.com`      |
| `N2F261001105` | Hoàn thành         | `0909000105`  | `khach.hoan.thanh@example.com`     |
| `N2F261001106` | Đã hủy             | `0909000106`  | `khach.da.huy@example.com`         |
| `N2F261001107` | Trả hàng/Hoàn tiền | `0909000107`  | `khach.tra.hang@example.com`       |
| `N2F260928010` | Đang vận chuyển    | `0909000111`  | `khach.demo@example.com` (đơn gốc) |

Đơn của tài khoản cũng tra cứu được bằng email tài khoản (ví dụ `demo@nine2fine.vn`).

## Tắt hoặc gỡ bỏ

**Cách 1 — tắt nhanh (giữ thư mục):** trong `src/mocks/demo-seed/index.ts` đổi

```ts
export const DEMO_SEED_ENABLED = false;
```

App trở về đúng dữ liệu mock gốc. Chỉ muốn tắt giỏ hàng/yêu thích mẫu: đặt
`DEMO_SEED_BROWSER_STATE = false`. (Dữ liệu giỏ/yêu thích đã ghi vào trình duyệt trước đó vẫn còn,
xóa hai khóa localStorage nếu cần.)

**Cách 2 — xóa hẳn:** xóa thư mục `src/mocks/demo-seed/` và xóa các dòng có chú thích
`// DEMO SEED` sau đây:

1. `src/main.ts`
   - `import { seedDemoBrowserState } from './mocks/demo-seed'; // DEMO SEED ...`
   - `seedDemoBrowserState(); // DEMO SEED ...`
2. `src/mocks/mock-account-store.ts`
   - `import { applyDemoSeed } from './demo-seed'; // DEMO SEED ...`
   - khối `constructor() { applyDemoSeed(this); // DEMO SEED ... }`
3. `src/mocks/mock-checkout-api.ts`
   - `import { DEMO_SEED_VOUCHER_RULES } from './demo-seed'; // DEMO SEED ...`
   - dòng chú thích `// DEMO SEED: ...` và sửa
     `(VOUCHER_RULES[code] ?? DEMO_SEED_VOUCHER_RULES[code])` thành `VOUCHER_RULES[code]`.

Tìm nhanh: `grep -rn "DEMO SEED" src`. Không cần sửa test: `playwright.config.ts` chỉ đặt sẵn giỏ /
yêu thích rỗng cho test, và `tests/account.spec.ts` đọc số lượng từ giao diện nên chạy được cả khi
có hoặc không có seed.

## Giới hạn

- Model `Voucher` chưa có trạng thái "đã dùng/hết hạn", nên chỉ seed phiếu còn hạn (có phiếu sắp hết
  hạn). Model đơn hàng không lưu mã voucher, chỉ lưu số tiền giảm.
- Ảnh sản phẩm vẫn là ảnh tạm (`catalog-placeholder`) như catalogue mock.
- Thao tác (hủy đơn, sửa địa chỉ…) chỉ tồn tại đến khi tải lại trang.
