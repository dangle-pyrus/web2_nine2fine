> Nguồn: Claude Doc "nine2fine – Business Rules Giỏ hàng & Checkout" (https://claude.ai/artifact/GyH1CK4DXKTNJy3qAtvUeE), xuất nguyên văn 2026-11-07. Các nhóm COMMON-xx được tham chiếu nhưng không có trong tài liệu này.

# nine2fine – Business Rules Giỏ hàng & Checkout

Nov 4, 2026 · @Thắng

## Phạm vi và nguyên tắc

Bộ quy tắc này mô tả cách nine2fine bán hàng online khi vận hành thật: khách được làm gì, hệ thống chặn gì, và bộ phận nào xử lý ngoại lệ. Quy tắc chia theo 5 màn: CART, CHK, CHK-VC, CHK-PAY, CHK-CF. Mỗi quy tắc có mã riêng để dev, QA và CSKH cùng tham chiếu.

### Nguyên tắc chung

1. **Không bán quá số hàng có thật.** Tồn khả dụng = tồn trong kho – hàng đang giữ cho đơn chưa giao. Giỏ hàng không giữ hàng; chỉ đơn đã tạo mới giữ.
2. **Khách thấy đúng số tiền sẽ trả trước khi bấm Đặt hàng.** Giá, giảm giá, phí ship, tổng tiền chỉ do hệ thống tính. Mọi thay đổi sau khi khách đã xem phải báo lại và được khách xác nhận.
3. **Lỗi không làm mất công sức của khách.** Thanh toán lỗi, mã hết hạn, hết hàng: giữ nguyên thông tin đã nhập và giỏ hàng, nói rõ cần làm gì tiếp.
4. **Một lần bấm, một đơn.** Bấm lại, mạng chập, F5 không được sinh đơn trùng.
5. **Tiền và ưu đãi có chủ.** Chỉ Quản lý (admin) đổi giá, voucher, phí ship, hạn mức COD; Nhân viên vận hành (staff) xử lý đơn trong khung đó. Thay đổi chỉ áp cho đơn mới, không sửa đơn đã đặt.

Tài liệu này tuân theo nhóm BR COMMON: trạng thái đơn và bước chuyển theo COMMON-01 (to\_pay, to\_ship, to\_receive, completed, cancel\_requested, cancelled), trạng thái thanh toán theo COMMON-02 (pending, paid, failed, refunded, partially\_refunded), trừ và hoàn kho theo COMMON-03, cách hiển thị và tính tiền theo COMMON-05 (ví dụ 459.000₫, -50.000₫), quyền của khách vãng lai theo COMMON-06. Khi có khác biệt, COMMON là chuẩn.

### Tham số vận hành

Các con số dưới đây là giá trị khởi đầu; admin đổi được trong Cài đặt cửa hàng, không cần sửa code.

| Tham số | Giá trị khởi đầu | Lý do |
| --- | --- | --- |
| Số lượng tối đa mỗi phiên bản (màu + size) trong một đơn | 5 | Thời trang bán lẻ, chặn gom hàng bán lại; đơn sỉ đi qua CSKH |
| Tổng số sản phẩm tối đa mỗi đơn | 20 | Một kiện giao tiêu chuẩn, hạn chế rủi ro đơn ảo |
| Số dòng tối đa trong giỏ | 30 | Giỏ không phải danh sách yêu thích |
| Thời gian lưu giỏ của thành viên | 30 ngày kể từ lần sửa cuối | Giá và tồn sau 30 ngày thường đã khác |
| Phí giao hàng tiêu chuẩn | 30.000 ₫ mọi tỉnh thành | Đồng giá cho dễ hiểu, khớp chính sách giao hàng đã công bố |
| Ngưỡng miễn phí giao hàng | Giá trị hàng từ 1.000.000 ₫ | Khớp chính sách giao hàng; kích thích mua thêm |
| Thời gian giao dự kiến | 2–4 ngày từ khi đơn được xác nhận | Theo cam kết của đơn vị vận chuyển |
| Hạn mức COD | Tổng thanh toán tối đa 5.000.000 ₫ | Đơn giá trị cao bị bom hàng gây thiệt hại lớn; shipper không mang nhiều tiền mặt |
| Thời gian giữ đơn chờ chuyển khoản | 30 phút | Đủ cho khách mở app ngân hàng, không giữ hàng quá lâu |
| Số mã giảm giá mỗi đơn | 1 mã giảm tiền + 1 mã miễn phí giao hàng | Phổ biến ở thị trường Việt Nam, dễ kiểm soát ngân sách |
| Thời gian hoàn tiền | 1–3 ngày làm việc | Khớp chính sách đổi trả |
| Múi giờ hệ thống | Asia/Ho\_Chi\_Minh (GMT+7) | Voucher, mã đơn, hạn thanh toán tính theo giờ Việt Nam |

### Vai trò xử lý ngoại lệ

| Vai trò | Phụ trách trong luồng này |
| --- | --- |
| CSKH | Gọi xác nhận đơn COD, xử lý đơn sỉ, khách chuyển khoản sai số tiền hoặc trễ hạn |
| Kế toán | Đối soát chuyển khoản, hoàn tiền, xuất hóa đơn điện tử |
| Kho | Đóng gói đơn đã xác nhận, báo lệch tồn |
| Quản lý (admin) | Đặt tham số, voucher, duyệt ngoại lệ về tiền |

## CART – Giỏ hàng

| ID | Nội dung |
| --- | --- |
| CART-01 | Mỗi dòng giỏ là một phiên bản (sản phẩm + màu + size). Chỉ thêm vào giỏ khi đã chọn đủ màu và size; thêm lại phiên bản đã có thì cộng vào dòng cũ. |
| CART-02 | Số lượng mỗi dòng từ 1 đến số nhỏ hơn giữa 5 và tồn khả dụng. Giảm dưới 1 là xóa dòng (có Hoàn tác 5 giây). Chạm hạn mức thì khóa nút cộng và báo lý do: "Chỉ còn N sản phẩm cho màu, size này." hoặc "Mỗi đơn mua tối đa 5 sản phẩm cùng màu, size. Cần mua số lượng lớn, vui lòng gọi hotline." |
| CART-03 | Giỏ tối đa 30 dòng. Mỗi đơn tối đa 20 sản phẩm, tính trên các dòng được tick. Vượt mức thì chặn thao tác kèm thông báo. |
| CART-04 | Giỏ không giữ hàng và không trừ tồn (COMMON-03.1). Hai khách cùng có món cuối trong giỏ thì ai đặt đơn trước người đó có hàng. |
| CART-05 | Chỉ đổi được màu, size trong cùng sản phẩm; giá cập nhật theo phiên bản mới, phiên bản hết hàng bị khóa trong bộ chọn. |
| CART-06 | Đổi sang phiên bản đã có dòng riêng thì gộp hai dòng: số lượng = tổng hai dòng, cắt theo CART-02; dòng gộp được tick nếu một trong hai dòng đang tick. Báo "Đã gộp với sản phẩm cùng màu, size có sẵn trong giỏ.", bị cắt số lượng thì thêm "Số lượng được điều chỉnh còn N." |
| CART-07 | Mỗi dòng có ô tick, có "Chọn tất cả", dòng mới thêm được tick sẵn. Tạm tính, hạn mức CART-03 và thanh miễn phí giao hàng chỉ tính trên các dòng được tick (COMMON-05.3), và chỉ các dòng này sang checkout. Không tick dòng nào thì khóa nút Thanh toán. |
| CART-08 | Đặt đơn thành công chỉ xóa khỏi giỏ các dòng đã mua; dòng không tick vẫn ở lại. |
| CART-09 | Mỗi lần mở giỏ, hệ thống lấy lại giá, tồn và trạng thái bán mới nhất. Giá thay đổi (kể cả khuyến mãi kết thúc) thì tính theo giá mới và hiện "Giá đã thay đổi từ X₫ thành Y₫". |
| CART-10 | Tồn còn ít hơn số khách chọn: tự giảm về số còn lại và báo. Hết hàng: dòng mờ "Đã hết hàng", bỏ tick và không tick lại được, vẫn giữ trong giỏ để khách đổi size hoặc chờ hàng. Ngừng kinh doanh: "Sản phẩm không còn kinh doanh", chỉ còn nút Xóa. |
| CART-11 | Có dòng thay đổi giá hoặc tình trạng hàng thì đầu giỏ báo chung: "Một số sản phẩm đã thay đổi giá hoặc tình trạng hàng. Vui lòng kiểm tra trước khi thanh toán." |
| CART-12 | Khách vãng lai: giỏ lưu theo trình duyệt (COMMON-06.2). Thành viên: giỏ gắn với tài khoản, giống nhau trên mọi thiết bị. Cả hai giữ 30 ngày kể từ lần sửa cuối. |
| CART-13 | Đăng nhập khi đang có giỏ vãng lai: gộp vào giỏ tài khoản, không ghi đè. Cùng phiên bản thì cộng số lượng (cắt theo CART-02), khác thì thêm dòng; chỉ các dòng vừa mang sang được tick. Vượt 30 dòng thì các dòng sửa lâu nhất chuyển vào Yêu thích. Báo một lần: "Đã thêm N sản phẩm từ giỏ hàng trước khi đăng nhập." |
| CART-14 | Đăng nhập ngay tại checkout: chỉ đưa sang checkout các dòng khách đã chọn trước khi đăng nhập, không tự thêm dòng cũ của tài khoản. |
| CART-15 | Đăng xuất thì giỏ không còn hiển thị trên thiết bị (giỏ tài khoản vẫn còn), giỏ vãng lai mới bắt đầu rỗng. |
| CART-16 | Giỏ chỉ hiện Tạm tính và thanh "Mua thêm X₫ để được miễn phí giao hàng". Voucher, phí giao hàng và tổng thanh toán chốt ở checkout. Giá đã gồm VAT, định dạng theo COMMON-05.1, tính theo giá sau khuyến mãi (COMMON-05.2). |

## CHK – Thông tin người nhận

| ID | Nội dung |
| --- | --- |
| CHK-01 | Checkout là một trang theo thứ tự Liên hệ → Địa chỉ → Vận chuyển → Thanh toán, tóm tắt đơn luôn hiển thị. Chỉ nhận các dòng được tick ở giỏ; không có dòng nào thì đưa về giỏ. |
| CHK-02 | Không bắt buộc đăng nhập để mua. Đăng nhập giữa chừng giữ nguyên thông tin đã nhập. Thông tin đang nhập được lưu nháp trên thiết bị 24 giờ, xóa khi đặt đơn thành công hoặc đăng xuất. |
| CHK-03 | Trường bắt buộc: Họ tên người nhận (2–50 ký tự, có chữ cái); Số điện thoại (di động Việt Nam 10 số, đầu 03, 05, 07, 08, 09, chấp nhận +84); Tỉnh/Thành phố và Phường/Xã (chọn từ danh mục 2 cấp sau sáp nhập 2025, đổi tỉnh thì xóa phường); Địa chỉ cụ thể (5–200 ký tự). Ghi chú giao hàng không bắt buộc, tối đa 250 ký tự, chỉ dành cho shipper. |
| CHK-04 | Email bắt buộc với khách vãng lai, vì đây là kênh gửi xác nhận đơn, hóa đơn và tra cứu đơn bằng OTP (COMMON-06.3, COMMON-06.5). Thành viên được tự điền email tài khoản, sửa được. Đúng định dạng, tối đa 100 ký tự. |
| CHK-05 | Khách vãng lai nhập email đã có tài khoản: vẫn cho đặt, chỉ gợi ý đăng nhập. Đơn không tự gắn vào tài khoản đó và không tính chi tiêu xét hạng (COMMON-06.8). |
| CHK-06 | Người đặt và người nhận có thể khác nhau: email là của người đặt, tên và số điện thoại là của người nhận. |
| CHK-07 | Thành viên được tự điền địa chỉ mặc định (không có thì lấy địa chỉ dùng gần nhất), chọn địa chỉ khác trong sổ hoặc "Giao đến địa chỉ khác". Khách vãng lai không có sổ địa chỉ (COMMON-06.7). |
| CHK-08 | Địa chỉ đã lưu không còn hợp lệ (phường xã đã sáp nhập, thiếu trường) phải được sửa trước khi dùng. |
| CHK-09 | Địa chỉ mới của thành viên có ô "Lưu vào sổ địa chỉ" tick sẵn, sổ tối đa 10 địa chỉ, chỉ lưu khi đặt đơn thành công. Sửa địa chỉ đã lưu ngay tại checkout chỉ áp cho đơn này. |
| CHK-10 | Đổi địa chỉ thì phí giao hàng, ngày giao dự kiến và điều kiện COD được tính lại ngay. |
| CHK-11 | Mọi đơn được xuất hóa đơn điện tử, mặc định cho cá nhân. Tick "Xuất hóa đơn công ty" thì bắt buộc tên công ty, mã số thuế (10 số hoặc 10 số + "-" + 3 số), địa chỉ và email nhận hóa đơn; không sửa được sau khi đã xuất. |
| CHK-12 | Khách phải tick đồng ý Điều khoản mua bán, Chính sách đổi trả và Chính sách bảo mật trước khi đặt; ô này không tick sẵn. |
| CHK-13 | Lỗi hiện ngay dưới trường khi khách rời trường đó. Bấm Đặt hàng khi còn lỗi thì cuộn tới trường lỗi đầu tiên. Mọi trường được hệ thống kiểm lại khi đặt đơn. |

## CHK-VC – Voucher

| ID | Nội dung |
| --- | --- |
| CHK-VC-01 | Mỗi đơn dùng tối đa 1 mã giảm tiền hàng (theo % hoặc số tiền) và 1 mã miễn phí giao hàng. Áp mã giảm thứ hai thì thay mã cũ. Voucher cộng dồn với giá khuyến mãi trên sản phẩm, trừ khi mã được cài "Không áp dụng cho sản phẩm đang giảm giá". |
| CHK-VC-02 | Mã áp được khi đạt đủ các điều kiện sau, kiểm theo thứ tự: (1) mã tồn tại, không phân biệt hoa thường; (2) mã đang bật và trong thời gian hiệu lực theo giờ Việt Nam; (3) còn lượt dùng chung, lượt đang giữ cho đơn chờ thanh toán tính là đã dùng; (4) khách thuộc đối tượng của mã, mã theo hạng hoặc theo khách phải đăng nhập, khách vãng lai chỉ dùng mã công khai (COMMON-06.4); (5) khách còn lượt riêng (mặc định 1, khách vãng lai nhận diện theo số điện thoại và email); (6) mã đơn đầu tiên chỉ cho khách chưa có đơn còn hiệu lực; (7) đơn có sản phẩm thuộc danh mục của mã và không bị loại vì đang giảm giá; (8) giá trị sản phẩm đủ điều kiện đạt mức tối thiểu; (9) mã miễn phí giao hàng chỉ áp khi đơn đang phải trả phí ship. |
| CHK-VC-03 | Điều kiện đầu tiên không đạt quyết định thông báo, hiện ngay dưới ô nhập và giữ nguyên mã khách đã gõ. Mỗi lý do có câu riêng, không dùng chung "Mã không hợp lệ": "Mã giảm giá không tồn tại." / "Mã này áp dụng từ {ngày giờ}." / "Mã giảm giá đã hết hạn." / "Mã giảm giá đã hết lượt sử dụng." / "Đăng nhập để dùng mã này." / "Mã giảm giá không áp dụng cho tài khoản này." / "Bạn đã dùng mã này đủ số lần cho phép." / "Mã chỉ áp dụng cho đơn hàng đầu tiên." / "Mã chỉ áp dụng cho {danh mục}." / "Mã không áp dụng cho sản phẩm đang giảm giá." / "Mua thêm {X}₫ để dùng mã này (đơn tối thiểu {Y}₫)." / "Đơn của bạn đã được miễn phí giao hàng." |
| CHK-VC-04 | Tổng thanh toán = Tạm tính − Giảm giá + Phí vận chuyển (COMMON-05.5). Mã miễn phí giao hàng đưa phí vận chuyển về 0, không tạo dòng giảm giá. Ngưỡng miễn phí giao hàng xét trên tiền hàng trước voucher. |
| CHK-VC-05 | Mã %: tính trên các sản phẩm đủ điều kiện, làm tròn xuống, không vượt mức giảm tối đa (COMMON-05.4). Mã số tiền: không vượt giá trị các sản phẩm đủ điều kiện. Tiền hàng sau giảm không bao giờ âm. |
| CHK-VC-06 | Số tiền giảm được chia cho từng dòng theo tỷ lệ giá trị và lưu trên đơn, để xuất hóa đơn và tính tiền hoàn khi trả một phần (COMMON-05.8). |
| CHK-VC-07 | Tóm tắt đơn hiện: Tạm tính; Giảm giá kèm tên mã (dạng -50.000₫); Phí vận chuyển hoặc "Miễn phí" kèm lý do; Tổng thanh toán. |
| CHK-VC-08 | Thành viên thấy ví voucher: mã dùng được xếp trước, mã chưa đủ điều kiện hiện mờ kèm lý do. Hệ thống không tự áp mã, chỉ gợi ý mã có lợi nhất. |
| CHK-VC-09 | Mã đã áp được kiểm lại mỗi khi đơn thay đổi (số lượng, dòng chọn, địa chỉ, đăng nhập); không còn đủ điều kiện thì gỡ mã, tính lại tổng và báo lý do. |
| CHK-VC-10 | Nhập sai 10 lần trong 15 phút thì khóa ô nhập mã 15 phút để chống dò mã. |
| CHK-VC-11 | Mã được kiểm lại lúc bấm Đặt hàng, không có thời gian ân hạn. Mã hết hạn, hết lượt hoặc bị tắt giữa chừng (kể cả khi hai khách giành lượt cuối): không tạo đơn, gỡ mã, báo "Mã X vừa hết hiệu lực. Tổng thanh toán mới là Y₫. Bấm Đặt hàng để tiếp tục." và giữ nguyên thông tin đã nhập. |
| CHK-VC-12 | Đơn đã tạo trước giờ mã hết hạn thì giữ nguyên giảm giá, kể cả khi khách chuyển khoản sau giờ đó trong thời gian giữ đơn. |
| CHK-VC-13 | Lượt dùng bị trừ khi tạo đơn, kể cả đơn chờ chuyển khoản. Đơn hủy trước khi giao thì trả lượt nếu mã còn hạn. Đơn đã giao rồi trả hàng thì không trả lượt; tiền hoàn = giá trị dòng trả − phần giảm đã chia cho dòng đó (CHK-VC-06). |

## CHK-PAY – Vận chuyển và thanh toán

| ID | Nội dung |
| --- | --- |
| CHK-PAY-01 | Mở bán với Giao tiêu chuẩn và 2 cách trả tiền: COD và chuyển khoản QR (thanh toán online, COMMON-01.2). Thẻ và ví điện tử là giai đoạn sau, đi theo cùng luồng thanh toán online. |
| CHK-PAY-02 | Phí giao hàng 30.000₫ toàn quốc, miễn phí khi tiền hàng (trước voucher) từ 1.000.000₫. Chưa có địa chỉ thì ghi "Phí giao hàng: tính sau khi nhập địa chỉ". |
| CHK-PAY-03 | Ngày giao dự kiến hiển thị dạng khoảng ngày, đếm từ khi đơn vào to\_ship, không tính Chủ nhật và lễ, Tết. Đơn vào to\_ship sau 16:00 tính từ ngày làm việc kế tiếp; xã đảo, vùng sâu cộng thêm 2–3 ngày, không thu thêm phí. |
| CHK-PAY-04 | Mỗi đơn giao một kiện. Khách được xem hàng trước khi nhận (kiểm số lượng, mẫu, màu, size), không được thử. |
| CHK-PAY-05 | COD dùng được khi tổng thanh toán ≤ 5.000.000₫ và số điện thoại không có từ 2 đơn COD bị từ chối nhận trong 6 tháng, không đang có 3 đơn COD chưa giao. Phương thức không dùng được vẫn hiển thị, bị khóa kèm lý do. Mặc định chọn COD nếu đủ điều kiện; tổng thay đổi làm COD không còn hợp lệ thì tự chuyển sang chuyển khoản và báo khách. |
| CHK-PAY-06 | Đơn COD vào to\_ship ngay khi đặt. CSKH gọi xác nhận trong 2 giờ làm việc trước khi đóng gói; đây là bước vận hành, không phải trạng thái đơn. Thành viên đã từng nhận hàng thành công với đơn dưới 1.000.000₫ được bỏ qua bước gọi. Gọi 3 lần trong 24 giờ không liên lạc được thì admin/staff hủy đơn (to\_ship → cancelled, COMMON-01.7), trả tồn và lượt voucher. |
| CHK-PAY-07 | Khách từ chối nhận hàng không do lỗi shop: admin/staff chuyển to\_receive → cancelled (COMMON-01.10), hoàn kho khi hàng về kho (COMMON-03.4), ghi vào lịch sử số điện thoại cho CHK-PAY-05. |
| CHK-PAY-08 | Chuyển khoản QR: đơn vào to\_pay, trang thanh toán có mã QR, số tiền chính xác, nội dung chuyển khoản = mã đơn và đồng hồ đếm ngược 30 phút. Trong 30 phút hàng và lượt voucher được giữ, không gia hạn. Khách mở lại trang thanh toán từ email, Tra cứu đơn hoặc Đơn hàng của tôi. |
| CHK-PAY-09 | Nhận đủ tiền: hệ thống tự đối soát, thanh toán chuyển paid, đơn chuyển to\_pay → to\_ship (COMMON-01.3), gửi email "Đã nhận thanh toán". |
| CHK-PAY-10 | Chuyển thiếu: báo số còn thiếu để chuyển bù trong thời gian giữ; hết giờ vẫn thiếu thì hủy đơn và hoàn số đã chuyển. Chuyển thừa: xác nhận đơn bình thường, hoàn phần thừa. Tiền về sau khi đơn đã hủy: không khôi phục đơn (COMMON-01.11), hoàn 100%. Mọi khoản hoàn trong 1–3 ngày làm việc. |
| CHK-PAY-11 | Ở to\_pay khách tự hủy bất kỳ lúc nào, không cần duyệt (COMMON-01.4). Không đổi phương thức thanh toán trên đơn đã tạo; muốn đổi thì hủy và dùng "Đặt lại đơn này". |
| CHK-PAY-12 | Hết 30 phút chưa nhận đủ tiền: đơn to\_pay → cancelled, thanh toán giữ pending (hoặc failed nếu lần thử gần nhất thất bại), hoàn kho, trả lượt voucher, gửi email báo hủy. Trang thanh toán hiện nút "Đặt lại đơn này": đưa sản phẩm về giỏ, điền sẵn thông tin giao hàng; giá, tồn, voucher tính lại như đơn mới. |
| CHK-PAY-13 | Cổng thẻ báo thất bại (giai đoạn sau): đơn vẫn to\_pay, thanh toán failed (COMMON-02.3), khách thử lại tối đa 3 lần trong thời gian giữ; không hiển thị mã lỗi kỹ thuật cho khách. |
| CHK-PAY-14 | Trạng thái đơn và trạng thái thanh toán tách riêng, kết hợp như sau: vừa đặt COD là to\_ship + pending; COD giao thành công là completed + paid; vừa đặt online là to\_pay + pending; thanh toán thành công là to\_ship + paid; thanh toán lỗi còn hạn là to\_pay + failed; quá hạn hoặc khách tự hủy là cancelled + pending/failed; yêu cầu hủy khi to\_ship là cancel\_requested + giữ nguyên; đơn đã paid bị hủy là cancelled + refunded khi hoàn xong; giao thất bại là cancelled + pending (COD) hoặc refunded (online). Tồn kho trừ và hoàn theo COMMON-03. |

## CHK-CF – Xác nhận đơn

| ID | Nội dung |
| --- | --- |
| CHK-CF-01 | Bấm Đặt hàng, hệ thống kiểm lại một lần: còn bán, tồn khả dụng, giá, voucher (CHK-VC-11), phí giao hàng, điều kiện phương thức thanh toán, địa chỉ và hạn mức CART-02, CART-03. Có gì khác với số khách đang xem thì không tạo đơn, khách xem lại rồi bấm lại; thông tin đã nhập giữ nguyên. |
| CHK-CF-02 | Thiếu hàng ở bất kỳ dòng nào thì không tạo đơn, không tạo đơn thiếu. Đánh dấu từng dòng ("Chỉ còn N sản phẩm" / "Đã hết hàng") và cho nút "Cập nhật theo số còn lại". |
| CHK-CF-03 | Giá hoặc phí giao hàng thay đổi (kể cả giảm): hiện số cũ, số mới và tổng mới, báo "Giá một số sản phẩm vừa thay đổi. Vui lòng xem lại tổng thanh toán và bấm Đặt hàng để xác nhận." |
| CHK-CF-04 | Đơn tạo thành công thì trừ tồn ngay và chốt giá, giảm giá, phí giao hàng vào đơn; admin đổi giá hay cấu hình sau đó không ảnh hưởng đơn. Hai khách cùng đặt món cuối thì trừ tồn lần lượt, không để tồn âm, người sau nhận CHK-CF-02. |
| CHK-CF-05 | Chống đặt trùng: bấm Đặt hàng thì nút khóa đến khi có kết quả. Mỗi lượt checkout có một mã yêu cầu; gửi lại cùng mã trong 24 giờ trả về đúng đơn đã tạo. Mất kết nối thì không tự gửi lại mà cho nút Thử lại dùng cùng mã. Sau khi đặt, Back hoặc F5 đưa về trang đơn vừa đặt. |
| CHK-CF-06 | Cùng số điện thoại đặt đơn thứ hai giống hệt sản phẩm và số lượng trong 10 phút thì hỏi lại khách trước khi tạo đơn. |
| CHK-CF-07 | Mã đơn = N2F + YYMMDD (ngày đặt, giờ Việt Nam) + 4 chữ số ngẫu nhiên không trùng trong ngày, ví dụ #N2F2611040427. Chỉ gồm chữ in hoa và số; tra cứu không phân biệt hoa thường, có hoặc không có dấu #. Mã không đổi suốt vòng đời đơn và không tái sử dụng. |
| CHK-CF-08 | Chỉ có mã đơn thì không xem được đơn. Khách vãng lai tra cứu bằng mã đơn + email + OTP (COMMON-06.5); sai thông tin thì báo chung "Không tìm thấy đơn hàng phù hợp". |
| CHK-CF-09 | Trang đặt hàng thành công hiện mã đơn, tổng thanh toán, phương thức, ngày giao dự kiến, email đã nhận xác nhận, nút "Theo dõi đơn hàng" và "Tiếp tục mua sắm"; đơn COD cần gọi xác nhận thì ghi thêm sẽ gọi trong 2 giờ làm việc. Khách vãng lai được mời tạo tài khoản, nhưng đơn vừa đặt không tự gắn vào tài khoản mới (COMMON-06.8). |
| CHK-CF-10 | Email xác nhận gửi trong 5 phút sau khi tạo đơn, lỗi thì thử lại tối đa 3 lần, vẫn lỗi thì báo CSKH; đơn không bao giờ bị hủy vì email lỗi. Tiêu đề: "nine2fine – Xác nhận đơn hàng #{mã đơn}", đơn chờ chuyển khoản là "nine2fine – Đơn #{mã đơn} đang chờ thanh toán". |
| CHK-CF-11 | Email xác nhận gồm: mã đơn và trạng thái; sản phẩm (ảnh, tên, màu, size, số lượng, đơn giá); tạm tính, giảm giá kèm mã, phí giao hàng, tổng thanh toán; phương thức thanh toán; người nhận, số điện thoại, địa chỉ; ngày giao dự kiến; hóa đơn công ty nếu có; nút xem hoặc tra cứu đơn; cách hủy đơn và link chính sách đổi trả; hotline CSKH. |
| CHK-CF-12 | Email chờ thanh toán có thêm số tiền, hạn thanh toán và nút "Thanh toán ngay" mở lại trang QR; không in số tài khoản. Mọi email có câu chống lừa đảo: nine2fine không yêu cầu chuyển khoản ngoài trang thanh toán của đơn và không hỏi mật khẩu hay mã OTP. |
| CHK-CF-13 | Mỗi sự kiện sau gửi một email: đã nhận thanh toán; yêu cầu hủy được duyệt hoặc bị từ chối; đã bàn giao vận chuyển (kèm mã vận đơn); giao thành công; đơn đã hủy (kèm lý do và thông tin hoàn tiền). |
