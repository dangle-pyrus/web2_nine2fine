# nine2fine — Chia sẻ bản demo qua ngrok

Bản demo chạy trên máy của bạn, ngrok tạo một đường link `https://…` để nhóm mở từ máy khác. Máy của bạn phải bật và giữ hai cửa sổ terminal trong suốt thời gian nhóm xem.

## 1. Bạn cần chuẩn bị (làm một lần)

1. **Tài khoản ngrok miễn phí:** đăng ký tại ngrok.com.
2. **Cài ngrok trên Windows:** chọn một trong hai cách.
   - Mở PowerShell và chạy `winget install ngrok.ngrok`.
   - Hoặc tải bản Windows từ trang Download của ngrok, giải nén rồi để `ngrok.exe` ở nơi dễ tìm.
3. **Gắn authtoken:** vào ngrok Dashboard, mục "Your Authtoken", copy token rồi chạy trên máy bạn:

   ```bash
   ngrok config add-authtoken <TOKEN_CỦA_BẠN>
   ```

   Không gửi token vào chat, không đưa vào code hay file trong dự án. Token chỉ nằm trong cấu hình ngrok trên máy bạn.
4. *(Không bắt buộc)* Lấy **domain tĩnh miễn phí** ở mục Domains trên Dashboard, để mỗi lần chạy link không bị đổi.

## 2. Chạy demo

**Terminal 1**: chạy web ở chế độ chia sẻ (bản build production, cổng 4300, chỉ chấp nhận domain ngrok):

```bash
npm run share
```

Đợi đến khi thấy dòng `Local: http://127.0.0.1:4300/`.

**Terminal 2**: mở đường hầm ngrok:

```bash
ngrok http 4300
```

Nếu đã có domain tĩnh thì chạy `ngrok http --url=<domain-của-bạn> 4300`.

Copy link ở dòng **Forwarding** (dạng `https://xxxx.ngrok-free.app`) và gửi cho nhóm.

**Tắt demo:** nhấn `Ctrl + C` ở cả hai terminal.

> Chế độ `share` không ảnh hưởng `npm start` (cổng 4200), nên bạn vẫn có thể chạy bản dev song song.

## 3. Lưu ý gửi kèm cho nhóm

- **Trang cảnh báo ngrok:** lần đầu mở link sẽ có trang "You are about to visit…". Bấm **Visit Site** để vào web.
- **Tải lại trang (F5) sẽ mất đăng nhập.** Đây là dữ liệu giả lập lưu trong bộ nhớ, chưa có backend. Hãy di chuyển bằng menu và link trong web. Nếu lỡ tải lại thì đăng nhập lại.
- **Mỗi người có dữ liệu riêng:** thao tác của người này (đặt đơn, hủy đơn, sửa địa chỉ…) không ảnh hưởng người khác. Tải lại trang thì đơn và địa chỉ quay về như ban đầu.
- **Giỏ hàng có sẵn 5 sản phẩm** khi mở web lần đầu trên mỗi trình duyệt, để xem nhanh giỏ và checkout.
- **Mọi thứ đều là giả lập:** không có thanh toán, email hay giao hàng thật. Đừng nhập thông tin cá nhân thật.
- **Ảnh** là ảnh tạm, chưa phải ảnh sản phẩm nine2fine.

## 4. Tài khoản demo

**Cách đăng nhập:** bấm icon người ở góc phải → nhập email → **Tiếp tục** → nhập mã **`12345678`** → **Đăng nhập**.
Hoặc chọn "Sử dụng mật khẩu" và nhập **`Nine2fine1`**.

| Email | Hạng | Dữ liệu có sẵn | Dùng để xem |
|---|---|---|---|
| `demo@nine2fine.vn` | Silver (có thanh tiến độ lên hạng) | 19 đơn đủ 7 trạng thái, đơn từ 1 đến 5 món, 5 địa chỉ (1 địa chỉ rất dài), 6 voucher (1 voucher hết hạn hôm nay) | Lịch sử mua hàng theo từng tab, chi tiết đơn, hủy đơn, voucher, sổ địa chỉ, checkout với địa chỉ lưu sẵn |
| `gold.demo@nine2fine.vn` | Gold (hạng cao nhất) | 5 đơn, 2 địa chỉ, 2 voucher | Giao diện thẻ thành viên Gold |
| `new.demo@nine2fine.vn` | Bronze, tài khoản mới | Không có đơn, địa chỉ hay voucher | Các trạng thái trống (empty state) |
| Một email bất kỳ chưa có | Bronze | Trống | Luồng tạo tài khoản mới |

Số đơn của `demo@nine2fine.vn` theo trạng thái: Chờ thanh toán 3, Đang xử lý 2, Đang vận chuyển 3, Đang giao 2, Hoàn thành 4, Đã hủy 3, Trả hàng/Hoàn tiền 2. Tab "Vận chuyển" gộp Đang xử lý và Đang vận chuyển.

**Yêu thích chỉ dành cho thành viên:** nếu chưa đăng nhập mà bấm tim, web sẽ chuyển sang trang đăng nhập. Đăng nhập xong, sản phẩm được lưu tự động.

## 5. Tra cứu đơn không cần đăng nhập (`Tra cứu đơn hàng`)

Nhập mã đơn kèm số điện thoại (hoặc email) tương ứng:

| Mã đơn | Trạng thái | Số điện thoại | Email |
|---|---|---|---|
| `N2F261001101` | Chờ thanh toán | `0909000101` | `khach.cho.thanh.toan@example.com` |
| `N2F261001102` | Đang xử lý | `0909000102` | `khach.dang.xu.ly@example.com` |
| `N2F261001103` | Đang vận chuyển | `0909000103` | `khach.van.chuyen@example.com` |
| `N2F261001104` | Đang giao hàng | `0909000104` | `khach.dang.giao@example.com` |
| `N2F261001105` | Hoàn thành | `0909000105` | `khach.hoan.thanh@example.com` |
| `N2F261001106` | Đã hủy | `0909000106` | `khach.da.huy@example.com` |
| `N2F261001107` | Trả hàng/Hoàn tiền | `0909000107` | `khach.tra.hang@example.com` |

## 6. Gợi ý lộ trình xem (khoảng 10 phút)

1. **Trang chủ:** mở menu (hamburger trên mobile), thử ô tìm kiếm (gõ "đầm").
2. **Sản phẩm mới:** di chuột vào ảnh để đổi màu bằng ‹ ›, bấm **+** để thêm nhanh vào giỏ, bấm tim để lưu.
3. **Trang sản phẩm:** chọn size, xem bảng size và đánh giá, rồi thêm vào giỏ.
4. **Giỏ hàng:** tăng/giảm số lượng, đổi màu/size bằng icon bút, dùng icon checklist để chọn món cần xóa hoặc chỉ thanh toán một vài món.
5. **Checkout:** điền thông tin và đặt đơn trải nghiệm.
6. **Đăng nhập `demo@nine2fine.vn`:** xem Lịch sử mua hàng qua từng tab, mở chi tiết đơn, xem Phiếu giảm giá và Địa chỉ.
7. **Đăng nhập `new.demo@nine2fine.vn`:** xem các trang khi chưa có dữ liệu.
8. **Đăng xuất,** vào **Tra cứu đơn hàng** và thử các mã ở mục 5.
