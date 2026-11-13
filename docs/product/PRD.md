# PRD nine2fine

Chủ sở hữu: product-owner. Nguồn bối cảnh: `frontend/document/nine2fine_MASTER_PLAN.md` (mục 0, 19, 20, 33, 34, 39, 44, 52), `frontend/document/backend-integration.md`, code FE `frontend/src/app/features/auth/**`, code BE `backend/src/modules/auth/*`, `backend/prisma/schema.prisma`.

Quy ước: "(đề xuất PO)" = con số PO tự đề xuất, không có trong tài liệu gốc. "(chờ xác nhận)" = chưa triển khai cho đến khi câu hỏi mở tương ứng được trả lời. "(chốt 2026-11-07)" = Thắng đã trả lời câu hỏi mở, ghi trong `docs/decisions.md`.

---

## Slice 1: Auth

### 1. Vấn đề và mục tiêu

**Vấn đề.** Màn hình đăng ký / đăng nhập / quên mật khẩu đã có (đúng Figma) nhưng chạy bằng mock: một mã demo dùng cho mọi luồng, tài khoản mất khi tải lại, không có phiên thật, không đăng xuất phía máy chủ. Backend đã có module auth nhưng khác FE về tên endpoint, tên trường, hình thức phiên và một số quy tắc. Người mua chưa thể có tài khoản thật để xem đơn, lưu yêu thích, quản lý địa chỉ.

**Mục tiêu.**
1. Người mua tạo tài khoản và đăng nhập bằng email trong ≤ 2 bước sau khi nhập email (mã 8 số hoặc mật khẩu), giữ nguyên giao diện hiện có.
2. Phiên thật, tồn tại qua tải lại trang và mở lại trình duyệt; đăng xuất thật.
3. Đủ an toàn để vận hành: giới hạn tần suất, khoá tạm, không lộ mật khẩu/mã, không dùng được để dò hàng loạt email ngoài bước tra cứu đã chấp nhận.
4. Một bộ quy tắc duy nhất mà FE, BE và QA cùng kiểm.

**Không phải mục tiêu.** Thiết kế lại giao diện auth (master plan mục 19 giữ nguyên visual), chọn công nghệ phiên/token (việc của Backend).

### 2. Phạm vi

| Hạng mục | Mức | Lý do |
| --- | --- | --- |
| Tra cứu email → rẽ nhánh đăng nhập / đăng ký | Must | Luồng Figma bắt đầu từ bước nhập email. |
| Gửi / gửi lại mã 8 số theo mục đích (đăng nhập, đăng ký, đặt lại mật khẩu) | Must | Cả 3 luồng phụ thuộc mã. |
| Đăng ký không mật khẩu (passwordless) | Must | Figma 43:1058 không có ô mật khẩu; BE cũng tạo tài khoản không mật khẩu. |
| Đăng nhập bằng mã và bằng mật khẩu | Must | Cả 2 bước đã có trên UI. |
| Quên / đặt lại mật khẩu (cũng là cách tạo mật khẩu lần đầu) | Must | Đường duy nhất để thành viên passwordless có mật khẩu trong Slice 1. |
| Phiên: tạo, khôi phục khi tải lại, hết hạn, đăng xuất | Must | Không có thì không vận hành được tài khoản. |
| Khoá tạm, giới hạn tần suất, chống dò email | Must | Yêu cầu vận hành thực tế; bước gửi email tốn chi phí và dễ bị lạm dụng. |
| Gửi email thật trong môi trường triển khai | Must | Mã chỉ in ra console thì không ai đăng nhập được. |
| Phân quyền member / staff / admin ở mức "ai vào được đâu" | Must | Admin workspace đã có trên FE; phiên phải mang vai trò. |
| Giữ giỏ hàng khách và mục yêu thích đang chờ khi đăng nhập | Must | Hành vi hiện có, không được hỏng khi đổi sang API thật. |
| Bảo vệ dữ liệu (không log mã/mật khẩu, che email trong log) | Must | Master plan 0.4 mục 5; yêu cầu Thắng. |
| Email thông báo "mật khẩu vừa thay đổi" | Should | Giúp chủ tài khoản phát hiện bị chiếm quyền; không chặn luồng chính. |
| Chuẩn hoá mã khi dán (bỏ khoảng trắng, gạch nối) | Should | Giảm lỗi khi dán mã từ email; không đổi visual. |
| Gộp giỏ hàng khách vào giỏ tài khoản trên máy chủ | Won't (Slice 1) | Chưa có giỏ phía máy chủ; quy tắc gộp chốt ở Slice 3. |
| Đồng bộ wishlist lên máy chủ | Won't (Slice 1) | Chưa có API wishlist; làm cùng nhóm P1 Wishlist. |
| Tuỳ chọn "Ghi nhớ đăng nhập" | Won't | UI không có ô này; mọi phiên đều bền theo BR-AUTH-24. |
| "Đăng xuất khỏi mọi thiết bị" do người dùng bấm | Won't (Slice 1) | Không có UI; máy chủ vẫn thu hồi toàn bộ khi đặt lại mật khẩu. |
| Đăng nhập mạng xã hội, 2FA cho admin, CAPTCHA | Won't | Ngoài phạm vi đồ án lần này; giới hạn tần suất thay cho CAPTCHA. |
| Tạo / đổi mật khẩu trong trang Profile nối API thật | Won't (Slice 1) | Dời sang slice Account (chốt 2026-11-07); dùng chung BR-AUTH-20 và hợp đồng `PUT /api/account/password`. |
| Lưu phiên bản điều khoản, bắt đồng ý lại khi điều khoản đổi | Won't | Chỉ lưu thời điểm đồng ý (chốt 2026-11-07). |
| Đổi email, xoá tài khoản | Won't (Slice 1) | Thuộc Account; cần quy trình xác minh riêng. |
| Tạo/quản lý tài khoản staff bằng giao diện admin | Won't (Slice 1) | Thuộc slice Admin; Slice 1 chỉ cần tài khoản staff/admin được tạo sẵn. |

### 3. Hiện trạng FE và BE khác nhau — hành vi được chọn

Tên endpoint và tên trường do Backend chốt trong `docs/api/openapi.yaml`; FE sửa adapter theo. PO chỉ chốt **hành vi**.

| # | Điểm khác | FE hiện tại | BE hiện tại | Chọn | Lý do |
| --- | --- | --- | --- | --- | --- |
| D1 | Tên endpoint / kiểu tên trường | `/lookup`, `/codes`, `/login/code`, `/login/password`, `/password/reset`; camelCase | `/check-email`, `/send-otp`, `/login-otp`, `/login`, `/forgot-password`, `/reset-password`, `/logout`; snake_case | Một hợp đồng duy nhất, BE quyết tên, FE theo | Quyết định đã chốt: BE được đổi tên endpoint. |
| D2 | Kết quả tra cứu email | chỉ `registered` | `is_registered` + `has_password` | Chỉ trả "đã đăng ký / chưa" (BR-AUTH-02) | `has_password` lộ thêm thông tin, UI không dùng. |
| D3 | Gửi mã đặt lại mật khẩu | `purpose: reset-password` qua cùng thao tác gửi mã | `send-otp` từ chối purpose khác register/login; có `forgot-password` riêng | Thao tác gửi mã phải nhận cả 3 mục đích, cùng quy tắc BR-AUTH-04..09 | UI dùng một ô mã chung, tự gửi khi hiện. |
| D4 | Hạn mã | không giới hạn (mock) | 5 phút | 10 phút (BR-AUTH-05) | Thư có thể đến chậm; mã 8 số đủ mạnh. |
| D5 | Thời gian chờ gửi lại | 30 giây (mock) | 60 giây | 60 giây, FE hiển thị theo số máy chủ trả (BR-AUTH-06) | Giảm spam email. |
| D6 | Gửi mã đăng ký cho email đã có tài khoản | lỗi `email-registered` | 409 | Phản hồi giống thành công, gửi thư báo "đã có tài khoản" thay vì mã (BR-AUTH-09) | Không để endpoint gửi mã thành công cụ dò email. |
| D7 | Nhập sai mã | 1 thông báo chung | Thông báo "còn N lần thử" chỉ khi email có mã; email không có mã nhận thông báo khác | Một thông báo chung cho mọi trường hợp sai (BR-AUTH-08) | Thông báo khác nhau lộ email có tồn tại. |
| D8 | Mã HTTP lỗi | 422 = sai mã, 400 → "không thể kết nối" | sai mã trả 400 | Mọi lỗi có mã lỗi ổn định trong nội dung phản hồi (BR-AUTH-36) | Hiện FE sẽ báo "Không thể kết nối" khi nhập sai mã. |
| D9 | Hình thức phiên | phiên do máy chủ giữ, FE chỉ giữ hồ sơ công khai trong bộ nhớ | trả `access_token` trong body, hạn 7 ngày | Bí mật phiên không đọc được bởi script trang, không lưu trong storage trình duyệt (BR-AUTH-35); cơ chế do BE chọn | Master plan mục 34 + Backend Handoff Checklist. |
| D10 | Tạo bản ghi phiên | — | chỉ khi đăng nhập mật khẩu; đăng nhập mã và đăng ký không tạo | Mọi đăng nhập thành công tạo phiên (BR-AUTH-23) | Không thì không đăng xuất / thu hồi được. |
| D11 | Đăng xuất | chỉ xoá trạng thái trong bộ nhớ | thu hồi **mọi** phiên của user; đọc user từ token không kiểm chữ ký | Chỉ kết thúc phiên hiện tại, phải xác thực phiên (BR-AUTH-27) | Đăng xuất máy này không được đá máy khác; không được đăng xuất hộ người khác. |
| D12 | Khôi phục phiên khi tải lại | chưa có (mock dùng sessionStorage) | chưa có endpoint "phiên hiện tại" | Must có thao tác lấy phiên hiện tại (BR-AUTH-25) | backend-integration.md "Other Contracts Still Needed". |
| D13 | Khoá đăng nhập mật khẩu | không khoá | 5 lần sai / (email + device_id), FE không gửi device_id nên mọi máy dùng chung "default-device" | Đếm theo email, khoá 15 phút, vẫn cho đăng nhập bằng mã (BR-AUTH-18) | Đơn giản, đúng; đường mã giảm rủi ro kẻ xấu khoá tài khoản người khác. |
| D14 | Nghĩa firstName / lastName | firstName = "Tên", lastName = "Họ" | first_name báo lỗi "Họ và tên đệm", last_name báo "Tên" | firstName = Tên (tên gọi), lastName = Họ và tên đệm (BR-AUTH-10) | Theo UI và dữ liệu mock (Minh / Nguyễn). |
| D15 | Thứ tự kiểm đăng ký | — | kiểm email trùng trước khi kiểm mã | Kiểm mã trước, rồi mới báo email trùng (BR-AUTH-14) | Chỉ người sở hữu email mới biết email đã có tài khoản. |
| D16 | Quy tắc mật khẩu | ≥ 8 ký tự, ≥ 1 in hoa, ≥ 1 số | đặt lại: chỉ ≥ 8 ký tự | Theo FE + giới hạn trên 64 (BR-AUTH-20), kiểm ở cả hai phía | UI đã hiển thị quy tắc này. |
| D17 | Đặt lại mật khẩu | về bước mật khẩu, không tự đăng nhập | không thu hồi phiên cũ | Thu hồi mọi phiên, không tự đăng nhập (BR-AUTH-22) | Kẻ chiếm phiên bị đẩy ra khi chủ đổi mật khẩu. |
| D18 | Vai trò trong hồ sơ trả về | `AuthUser` không có role | có `role` | Hồ sơ phiên có vai trò (BR-AUTH-25) | Cần cho điều hướng admin. |
| D19 | Cooldown gửi lại khi vào lại bước mã | 429 hiện "Bạn thao tác quá nhanh" | 429 kèm số giây trong câu chữ | Phản hồi kèm số giây còn lại; FE hiện đếm ngược, không hiện lỗi (BR-AUTH-06) | FE tự gửi mã mỗi lần vào bước mã. |
| D20 | Nguồn ngẫu nhiên của mã, log mã, secret mặc định, CORS mở | — | `Math.random`, in mã ra console, secret JWT mặc định trong code, CORS mọi nguồn | Theo BR-AUTH-04, BR-AUTH-35, BR-AUTH-37 | Không đạt mức vận hành thực tế. |
| D21 | Tài khoản demo admin trong mock | `admin123`, `staff123` | — | Mọi tài khoản (kể cả seed) tuân BR-AUTH-20; seed production không có mật khẩu biết trước | Mật khẩu demo vi phạm quy tắc và là cửa hậu nếu lên Supabase. Seed thật phải dùng mật khẩu hợp lệ theo BR-AUTH-20, truyền qua cấu hình/biến môi trường; không ghi mật khẩu vào tài liệu hay repo. |
| D22 | Đồng ý marketing | gửi boolean | lưu boolean | Lưu cả thời điểm đồng ý (BR-AUTH-13) | Cần bằng chứng đồng ý khi gửi email quảng cáo. |

Ghi chú cho BE (không phải quyết định PO): schema có hai enum vai trò (`Role`, `user_role`), chỉ một cái được dùng.

### 4. Business Rules

#### 4.1 Email và tra cứu

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-01 | **Chuẩn hoá email.** Email được bỏ khoảng trắng hai đầu và chuyển toàn bộ sang chữ thường trước khi kiểm tra, lưu, so sánh, giới hạn tần suất. Không bỏ dấu chấm hay phần `+…`. Hợp lệ khi: 6–254 ký tự sau chuẩn hoá (đề xuất PO), đúng dạng `phần-trước@tên-miền.đuôi`, không chứa khoảng trắng. FE và BE đều kiểm; BE là nguồn quyết định. |
| BR-AUTH-02 | **Tra cứu email.** Chỉ trả "đã đăng ký" hoặc "chưa đăng ký"; không trả tên, trạng thái, có mật khẩu hay không. Tài khoản bị vô hiệu vẫn tính là "đã đăng ký". Đã đăng ký → bước nhập mã đăng nhập; chưa → trang đăng ký. Giới hạn: 20 lần / 15 phút / địa chỉ IP và 10 lần / 15 phút / email (đề xuất PO); vượt → lỗi "thao tác quá nhanh" kèm số giây chờ. Việc bước này lộ email đã đăng ký là rủi ro **chấp nhận** vì luồng Figma cần rẽ nhánh; giới hạn tần suất là biện pháp giảm thiểu. |
| BR-AUTH-03 | **Không có đường dò email thứ hai.** Ngoài BR-AUTH-02, mọi thao tác gửi mã, đăng nhập mã, đăng nhập mật khẩu, quên/đặt lại mật khẩu trả cùng mã trạng thái, cùng cấu trúc, cùng thông báo cho email tồn tại và không tồn tại. Chênh lệch thời gian phản hồi giữa hai trường hợp không quá 300 ms ở trung vị (đề xuất PO). |

#### 4.2 Mã xác thực (OTP)

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-04 | **Định dạng mã.** Đúng 8 chữ số `0–9` (có thể bắt đầu bằng 0). Sinh từ nguồn ngẫu nhiên an toàn mật mã. Mỗi mã gắn với đúng 1 email và 1 mục đích (`đăng nhập`, `đăng ký`, `đặt lại mật khẩu`); mã mục đích này không dùng được cho mục đích khác. Dùng được 1 lần. Máy chủ chỉ lưu dạng băm một chiều. |
| BR-AUTH-05 | **Hạn mã.** 10 phút kể từ lúc tạo (đề xuất PO). Hết hạn → coi như sai mã (thông báo chung BR-AUTH-08), không tính vào số lần sai. Email chứa mã ghi rõ "hiệu lực 10 phút" và "không chia sẻ mã". |
| BR-AUTH-06 | **Gửi lại.** (a) Chờ 60 giây giữa hai lần gửi cho cùng email + mục đích. (b) Tối đa 5 lần gửi / 30 phút / email / mục đích. (c) Tối đa 30 lần gửi / giờ / địa chỉ IP, mọi email cộng dồn (đề xuất PO). Phản hồi thành công luôn kèm số giây phải chờ trước lần gửi kế tiếp. Bị chặn bởi (a): không tạo mã mới, mã cũ vẫn hiệu lực, phản hồi kèm số giây còn lại để FE hiện đếm ngược, không hiện lỗi. Bị chặn bởi (b)/(c): báo "thao tác quá nhanh" kèm số phút chờ. |
| BR-AUTH-07 | **Vô hiệu mã cũ.** Khi tạo mã mới cho email + mục đích, mọi mã chưa dùng của cùng email + mục đích hết hiệu lực ngay. Mã của mục đích khác không bị ảnh hưởng. |
| BR-AUTH-08 | **Nhập sai mã.** Mọi trường hợp không qua (sai, hết hạn, đã dùng, đã bị thay, email không có mã) trả cùng thông báo "Mã xác thực không đúng hoặc đã hết hạn.", không nói còn mấy lần. Sai 5 lần với cùng email + mục đích (đếm cả khi email không tồn tại) → mã hiện tại bị huỷ và email bị **khoá xác thực bằng mã 15 phút** cho mọi mục đích, gồm cả việc gửi mã mới. Trong thời gian khoá: báo "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau N phút." Đăng nhập bằng mật khẩu không bị ảnh hưởng. Nhập đúng → bộ đếm về 0. Dạng mã sai (không đủ 8 số) bị FE chặn, không gửi lên, không tính lần sai. |
| BR-AUTH-09 | **Gửi mã theo trạng thái email** (phản hồi luôn giống nhau, theo BR-AUTH-03). Mục đích đăng ký + email chưa có tài khoản → gửi mã. Đăng ký + email đã có tài khoản → gửi thư "Email này đã có tài khoản nine2fine, hãy đăng nhập", không có mã. Đăng nhập / đặt lại + tài khoản đang hoạt động → gửi mã. Đăng nhập / đặt lại + email không có tài khoản → không gửi gì. Đăng nhập / đặt lại + tài khoản bị vô hiệu → gửi thư báo tài khoản bị vô hiệu kèm email hỗ trợ phthang0872@gmail.com (chốt 2026-11-07), không có mã. Mọi trường hợp vẫn tính vào giới hạn BR-AUTH-06. Thêm giới hạn theo IP: tối đa 30 lần nhập sai mã trong 15 phút cho mỗi IP, vượt → `rate-limited` kèm số giây còn lại (chốt 2026-11-07, giá trị do BE đề xuất; phải có test riêng). Triển khai sau reverse proxy phải bật `TRUST_PROXY`, nếu không mọi khách dùng chung một IP. |

#### 4.3 Đăng ký

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-10 | **Trường bắt buộc.** Email (từ bước 1, không sửa trên trang đăng ký, có link "Chỉnh sửa Email" về bước 1), mã 8 số, Tên, Họ. `firstName` = **Tên** (tên gọi, ví dụ "Minh"); `lastName` = **Họ và tên đệm** (ví dụ "Nguyễn Văn"). Tên và Họ: bỏ khoảng trắng hai đầu, gộp nhiều khoảng trắng liên tiếp thành một, dài 1–50 ký tự (đề xuất PO), chỉ gồm chữ cái (kể cả tiếng Việt có dấu), khoảng trắng, dấu nháy `'` và gạch nối `-` (đề xuất PO). Mở trang đăng ký khi chưa có email từ bước 1 → chuyển về bước nhập email. |
| BR-AUTH-11 | **Ngày sinh (không bắt buộc).** Hoặc bỏ trống cả ngày, tháng, năm; hoặc là ngày có thật, từ 01/01/1900 đến trước ngày hiện tại (giờ Việt Nam). Điền thiếu một phần → lỗi "Ngày sinh chưa hợp lệ." **Tuổi tối thiểu (chốt 2026-11-07): nếu có ngày sinh thì phải đủ 13 tuổi tính đến hôm nay (giờ Việt Nam); đúng sinh nhật thứ 13 là đủ, thiếu 1 ngày là chưa đủ → lỗi "Bạn cần đủ 13 tuổi để tạo tài khoản." hiện cạnh trường ngày sinh. Bộ chọn ngày sinh chỉ cho chọn năm ≤ năm hiện tại − 10.** Máy chủ kiểm lại quy tắc 13 tuổi dù FE bị bỏ qua. Bỏ trống ngày sinh vẫn được đăng ký. |
| BR-AUTH-12 | **Đồng ý điều khoản.** Bắt buộc tick "Tôi đồng ý với Chính sách bảo mật và Điều khoản sử dụng". Không tick → không tạo tài khoản, lỗi "Bạn cần đồng ý để tạo tài khoản." Máy chủ từ chối yêu cầu thiếu đồng ý dù FE bị bỏ qua. Chỉ lưu thời điểm đồng ý (log); không lưu phiên bản điều khoản và không bắt đồng ý lại khi điều khoản đổi (chốt 2026-11-07). |
| BR-AUTH-13 | **Nhận email marketing.** Không bắt buộc, mặc định **không** tick. Lưu giá trị và thời điểm đồng ý (nếu tick). Không tick → không gửi email quảng cáo; email giao dịch (mã, thông báo bảo mật, đơn hàng) vẫn gửi. |
| BR-AUTH-14 | **Một email một tài khoản.** Máy chủ kiểm mã trước; mã hợp lệ mà email đã có tài khoản (ví dụ hai tab cùng đăng ký) → lỗi "Email này đã có tài khoản. Vui lòng đăng nhập.", không tạo bản ghi thứ hai. Hai yêu cầu đăng ký đồng thời cho cùng email → đúng 1 tài khoản được tạo. |
| BR-AUTH-15 | **Kết quả đăng ký.** Tạo tài khoản vai trò `member`, đang hoạt động, chưa có mật khẩu; mã đăng ký đã dùng bị huỷ; người dùng được đăng nhập ngay (tạo phiên theo BR-AUTH-23) và chuyển tới returnUrl (BR-AUTH-31). Không thu mật khẩu khi đăng ký; tạo mật khẩu qua "Quên mật khẩu" (BR-AUTH-22) hoặc Profile (dời sang slice Account, chốt 2026-11-07). |

#### 4.4 Đăng nhập

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-16 | **Đăng nhập bằng mã.** Là bước mặc định sau tra cứu "đã đăng ký". Vào bước mã → tự gửi mã mục đích đăng nhập (theo BR-AUTH-06). Mã đúng + tài khoản hoạt động → tạo phiên, chuyển tới returnUrl. Có nút chuyển sang mật khẩu và ngược lại; chuyển bước giữ email, xoá giá trị mã/mật khẩu đã gõ. |
| BR-AUTH-17 | **Đăng nhập bằng mật khẩu.** Mọi thất bại (email không tồn tại, tài khoản chưa có mật khẩu, sai mật khẩu) trả cùng thông báo "Email hoặc mật khẩu chưa đúng." Mật khẩu được so nguyên văn (không bỏ khoảng trắng, phân biệt hoa thường). Ô mật khẩu trống bị FE chặn. |
| BR-AUTH-18 | **Khoá tạm đăng nhập mật khẩu.** 5 lần sai liên tiếp cho cùng email, mỗi lần cách lần trước ≤ 15 phút → khoá đăng nhập mật khẩu của email đó 15 phút (đếm cả email không tồn tại để không lộ). Đang khoá: mọi lần thử (kể cả mật khẩu đúng) bị từ chối với "Bạn đã nhập sai quá nhiều lần. Thử lại sau N phút hoặc đăng nhập bằng mã xác thực." Đăng nhập bằng mã vẫn dùng được. Bộ đếm về 0 khi: đăng nhập thành công (mã hoặc mật khẩu), đặt lại mật khẩu thành công, hoặc 15 phút không có lần sai mới. Thêm giới hạn 20 lần sai / 15 phút / địa chỉ IP (đề xuất PO). |
| BR-AUTH-19 | **Tài khoản bị vô hiệu.** Không đăng nhập được bằng bất kỳ cách nào. Thông báo "Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ nine2fine để được hỗ trợ." kèm email liên hệ phthang0872@gmail.com (chốt 2026-11-07) chỉ hiện **sau khi** người dùng đã xác thực đúng (mã đúng hoặc mật khẩu đúng); trước đó áp dụng thông báo chung BR-AUTH-08 / BR-AUTH-17. |

#### 4.5 Mật khẩu

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-20 | **Quy tắc mật khẩu** (dùng chung cho đặt lại, tạo, đổi mật khẩu và tài khoản seed). Dài 8–64 ký tự (giới hạn 64: đề xuất PO); ≥ 1 chữ in hoa A–Z; ≥ 1 chữ số 0–9; không bỏ khoảng trắng; không được trùng email (không phân biệt hoa thường) (đề xuất PO). Ô nhập lại phải khớp từng ký tự. FE hiển thị từng điều kiện và trạng thái đạt/chưa đạt; máy chủ kiểm lại và từ chối nếu không đạt. |
| BR-AUTH-21 | **Lưu mật khẩu.** Chỉ lưu dạng băm một chiều có salt; không bao giờ trả về mật khẩu hay bản băm trong bất kỳ phản hồi nào. |

#### 4.6 Quên / đặt lại mật khẩu

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-22 | **Đặt lại mật khẩu.** Vào từ link "Quên mật khẩu" ở bước mật khẩu; dùng email của bước 1; tự gửi mã mục đích đặt lại (BR-AUTH-06, BR-AUTH-09). Nhập mã + mật khẩu mới đạt BR-AUTH-20 + nhập lại khớp. Thành công → (1) lưu mật khẩu mới (cũng là cách tạo mật khẩu lần đầu cho tài khoản passwordless); (2) huỷ mọi mã đặt lại còn lại của email; (3) mở khoá và đặt lại bộ đếm BR-AUTH-18; (4) **kết thúc mọi phiên** của tài khoản trên mọi thiết bị; (5) **không** tự đăng nhập, chuyển về bước mật khẩu với thông báo "Đã cập nhật mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới."; (6) gửi thư "Mật khẩu vừa được thay đổi" (Should). Mật khẩu mới được phép trùng mật khẩu cũ. Nút "Hủy bỏ" về bước nhập email, không đổi gì. |

#### 4.7 Phiên

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-23 | **Tạo phiên.** Mọi lần xác thực thành công (mã, mật khẩu, đăng ký) tạo một phiên phía máy chủ gắn với tài khoản, ghi phương thức, thời điểm tạo, lần dùng cuối, thông tin thiết bị (trình duyệt). Không có phiên nào được tạo khi thất bại. |
| BR-AUTH-24 | **Thời hạn phiên.** Member: hết hạn sau 30 ngày không hoạt động, tối đa 90 ngày kể từ lúc đăng nhập. Staff / admin: hết hạn sau 8 giờ không hoạt động, tối đa 24 giờ (chốt 2026-11-07). "Hoạt động" = có yêu cầu có xác thực tới máy chủ. Không có tuỳ chọn "ghi nhớ đăng nhập". |
| BR-AUTH-25 | **Khôi phục phiên.** Tải lại trang, mở tab mới hoặc mở lại trình duyệt khi phiên còn hạn → vẫn đăng nhập, không phải nhập lại. Khi ứng dụng khởi động, FE hỏi máy chủ "phiên hiện tại"; máy chủ trả hồ sơ công khai `id, email, firstName, lastName, role` hoặc "chưa đăng nhập" (không phải lỗi). Trong lúc chờ (tối đa 10 giây, đề xuất PO), trang cần đăng nhập không chuyển hướng sang trang đăng nhập; hết 10 giây hoặc lỗi mạng → coi như khách và cho phép thử lại. |
| BR-AUTH-26 | **Phiên hết hạn giữa chừng.** Bất kỳ yêu cầu nào bị máy chủ từ chối vì chưa đăng nhập → FE xoá trạng thái đăng nhập, chuyển tới trang đăng nhập với returnUrl là trang hiện tại và thông báo "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." Giỏ hàng trên máy giữ nguyên. Trang công khai (catalog, giỏ) không chuyển hướng, chỉ chuyển sang trạng thái khách. Tải lại trang khi phiên đã bị thu hồi: về đăng nhập kèm returnUrl, không cần thông báo hết hạn (FE không biết trước đó đã đăng nhập; chốt 2026-11-07). |
| BR-AUTH-27 | **Đăng xuất.** Kết thúc **chỉ phiên hiện tại**; phiên trên thiết bị khác giữ nguyên. Máy chủ chỉ kết thúc phiên đã xác thực của chính người gọi. Gọi khi phiên đã hết hạn/không tồn tại → vẫn thành công. Mất mạng → FE vẫn xoá trạng thái đăng nhập trên máy (phiên máy chủ tự hết hạn theo BR-AUTH-24). Sau đăng xuất: về trang chủ `/` (đề xuất PO); dữ liệu tài khoản (tên, đơn, địa chỉ) không còn hiển thị, kể cả khi bấm Back. Nút đăng xuất không đặt cạnh thao tác thường dùng (master plan mục 20). |
| BR-AUTH-28 | **Nhiều thiết bị.** Một tài khoản có tối đa 10 phiên còn hạn cùng lúc (đề xuất PO). Đăng nhập lần thứ 11 → phiên có lần dùng cuối cũ nhất bị kết thúc. |
| BR-AUTH-29 | **Thay đổi trạng thái tài khoản.** Khi tài khoản bị vô hiệu, đổi vai trò, hoặc đặt lại mật khẩu → mọi phiên của tài khoản kết thúc ngay; yêu cầu kế tiếp từ các phiên đó bị từ chối như BR-AUTH-26. |
| BR-AUTH-30 | **Đã đăng nhập mà mở trang auth.** Người đã đăng nhập mở `/auth/login`, `/auth/register`, `/auth/forgot-password` → chuyển ngay tới returnUrl hợp lệ hoặc trang mặc định theo vai trò (BR-AUTH-31). |

#### 4.8 returnUrl

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-31 | **returnUrl an toàn.** Chỉ chấp nhận đường dẫn nội bộ: bắt đầu bằng đúng một `/`, không bắt đầu `//` hay `/\`, không chứa `\`, không chứa `://`, không trỏ vào `/auth/…` hay `/admin/login`, dài ≤ 512 ký tự (đề xuất PO). Không hợp lệ hoặc không có → trang mặc định: member `/new-in`; staff/admin đăng nhập ở `/admin/login` → `/admin`. Staff/admin đăng nhập ở trang storefront `/auth/login` được đối xử như member: về returnUrl hợp lệ hoặc `/new-in`, không tự vào `/admin`; muốn quản trị phải đăng nhập ở `/admin/login` vì phiên admin tách cookie (decisions 2026-11-07). Staff/admin ở `/admin/login` cũng nhận returnUrl theo quy tắc này, chỉ nhận đường dẫn bắt đầu bằng `/admin`; khách mở `/admin` không kèm returnUrl vẫn vào `/admin` sau đăng nhập (chấp nhận 2026-11-07). returnUrl trỏ vào khu vực vai trò không được vào (member → `/admin/…`) → trang mặc định của vai trò. returnUrl được giữ xuyên suốt khi rẽ sang đăng ký hoặc quên mật khẩu trong cùng tab. Email không bao giờ nằm trên URL. |

#### 4.9 Giỏ hàng và yêu thích khi đăng nhập

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-32 | **Không mất giỏ / mục yêu thích đang chờ.** Đăng nhập, đăng ký, đăng xuất, hết phiên không xoá hay thay đổi giỏ hàng đang lưu trên thiết bị. Khách bấm tim → sau khi đăng nhập hoặc đăng ký thành công trong cùng tab, sản phẩm đó được lưu vào yêu thích và người dùng quay lại trang cũ (giữ hành vi hiện tại). Gộp giỏ khách vào giỏ tài khoản trên máy chủ: **Won't trong Slice 1**, quy tắc chốt ở Slice 3. |

#### 4.10 Phân quyền vai trò

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-33 | **Ai vào được đâu.** Xem bảng 4.10a. Đăng ký luôn tạo `member`; không có cách tự nâng vai trò. Staff/admin chỉ được tạo bởi admin (Slice 1: tạo sẵn bằng dữ liệu seed, mật khẩu theo BR-AUTH-20, không công khai và không ghi trong tài liệu). Staff/admin đăng nhập ở trang riêng `/admin/login`; storefront dùng `/auth/login` (chốt 2026-11-07). Một tài khoản có đúng 1 vai trò. Máy chủ kiểm quyền ở **mọi** yêu cầu; ẩn nút trên FE chỉ là trải nghiệm, không phải bảo vệ. |
| BR-AUTH-34 | **Truy cập trái phép.** Khách mở trang cần đăng nhập → chuyển tới đăng nhập với returnUrl (khu `/admin` → `/admin/login`, còn lại → `/auth/login`; chốt 2026-11-07). Đã đăng nhập nhưng sai vai trò (member mở `/admin`) → về trang mặc định của vai trò, không hiện nội dung admin, không gợi ý khu admin tồn tại. Máy chủ phân biệt "chưa đăng nhập" và "không đủ quyền" bằng mã lỗi riêng. |

**4.10a Bảng truy cập**

| Khu vực | Khách | Member | Staff | Admin |
| --- | --- | --- | --- | --- |
| Storefront: Home, PLP, PDP, Search, chính sách, trợ giúp | Có | Có | Có | Có |
| Giỏ hàng, checkout khách, tra cứu đơn bằng mã đơn + liên hệ | Có | Có | Có | Có |
| `/auth/*` | Có | Chuyển đi (BR-AUTH-30) | Chuyển đi | Chuyển đi |
| `/account/**`, `/wishlist` | Chuyển đăng nhập | Có (dữ liệu của chính mình) | Có (của chính mình) | Có (của chính mình) |
| `/admin` (vận hành: đơn, trả hàng, sản phẩm, tồn kho, khách hàng, khuyến mãi) | Chuyển `/admin/login` | Không | Có, trong giới hạn quyền nhân viên (chi tiết ở slice Admin) | Có |
| `/admin` cài đặt cửa hàng, nhân viên, nhật ký | Chuyển `/admin/login` | Không | Không | Có |

#### 4.11 Bảo vệ dữ liệu và độ tin cậy

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-35 | **Bí mật không rò rỉ.** Mật khẩu, mã xác thực, bí mật phiên không xuất hiện trong: log máy chủ, log trình duyệt, thông báo lỗi, URL, công cụ phân tích, dữ liệu mock/fixture commit vào repo (ngoại lệ có thời hạn: mật khẩu và mã demo giả của chế độ `mock`, không đăng nhập được với backend thật và không trùng `SEED_*`, được phép trong repo và bundle cho đến khi Catalog, Account, Admin có API thật; bản production trước go-live không được chứa chúng, xem backlog "Dọn mock"). Email trong log được che (ví dụ `d***@nine2fine.vn`) (đề xuất PO). Bí mật phiên không đọc được bởi script của trang và không lưu trong storage trình duyệt. Máy chủ không khởi động nếu thiếu cấu hình bí mật (không có giá trị mặc định trong code). Chỉ nguồn web của nine2fine được gọi API có xác thực. Ở môi trường phát triển cục bộ, mã được xem qua hộp thư thử nghiệm, không in ra console; ở môi trường triển khai, tuyệt đối không. |
| BR-AUTH-36 | **Lỗi có mã ổn định.** Mỗi lỗi trả về một mã máy đọc được (tối thiểu: dữ liệu không hợp lệ theo từng trường, sai mã, sai thông tin đăng nhập, email đã có tài khoản, đang bị khoá + số giây còn lại, chờ gửi lại + số giây còn lại, tài khoản bị vô hiệu, chưa đăng nhập, không đủ quyền, không tìm thấy `not-found` cho route/tài nguyên không tồn tại, lỗi máy chủ). Route không tồn tại không được dùng mã `validation` (chốt 2026-11-07; BE thêm vào contract trước Slice 2). Không trả stack trace, câu SQL, tên bảng. Lỗi máy chủ/mạng → FE hiện "Không thể kết nối. Vui lòng thử lại." |
| BR-AUTH-37 | **Thư thật.** Thư gửi qua Gmail SMTP của nhóm; thông tin đăng nhập SMTP chỉ nằm trong `backend/.env` (chốt 2026-11-07). Ở môi trường triển khai, thư mã đến hộp thư thật trong ≤ 60 giây ở 95% trường hợp (đề xuất PO), người gửi hiển thị "nine2fine". Thư chứa mã, mục đích, hạn 10 phút, cảnh báo không chia sẻ; không chứa mật khẩu, không chứa link đăng nhập trực tiếp. |
| BR-AUTH-38 | **Chống gửi trùng, giữ dữ liệu.** Khi một thao tác đang chờ phản hồi, nút gửi bị khoá và hiện trạng thái đang xử lý; bấm/Enter lặp lại không tạo yêu cầu mới. Lỗi hoặc mất mạng → giữ nguyên email, họ tên, ngày sinh, các ô đã tick; người dùng thử lại không phải nhập lại (trừ mật khẩu nếu FE chủ động xoá). Không tự thử lại yêu cầu tạo tài khoản. |

### 5. Acceptance criteria

Email demo trong AC là ví dụ; "A" = tài khoản member đang hoạt động `minh@example.com` có mật khẩu `Nine2fine1`; "P" = tài khoản passwordless `lan@example.com`; "X" = tài khoản bị vô hiệu `x@example.com`; "N" = email chưa đăng ký `new@example.com`.

#### 5.1 Email và tra cứu

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-AUTH-01 | 01 | Ở bước nhập email | Nhập `  Minh@Example.COM ` rồi Tiếp tục | Máy chủ nhận/so sánh `minh@example.com`; chuyển sang bước mã của A. |
| AC-AUTH-02 | 01 | Ở bước nhập email | Nhập `minh@`, `minh example.com`, hoặc chuỗi 255 ký tự | Không gửi yêu cầu; hiện "Nhập địa chỉ email hợp lệ." dưới ô email. Gọi thẳng API với giá trị đó → lỗi dữ liệu không hợp lệ cho trường email. |
| AC-AUTH-03 | 02 | — | Tra cứu N | Phản hồi chỉ có "chưa đăng ký"; FE chuyển `/auth/register`, URL không chứa email. |
| AC-AUTH-04 | 02 | — | Tra cứu X (bị vô hiệu) | Phản hồi "đã đăng ký"; không có trường nào khác (không tên, không trạng thái, không "có mật khẩu"). |
| AC-AUTH-05 | 02 | Cùng IP đã tra cứu 20 lần trong 15 phút | Tra cứu lần 21 | Lỗi "thao tác quá nhanh" kèm số giây chờ; sau khi hết thời gian chờ, tra cứu hoạt động lại. |
| AC-AUTH-06 | 02 | Email N đã được tra cứu 10 lần trong 15 phút từ nhiều IP | Tra cứu N lần 11 | Lỗi "thao tác quá nhanh". |
| AC-AUTH-07 | 03 | — | Gửi mã đăng nhập, đăng nhập mật khẩu sai, gửi mã đặt lại lần lượt cho A và N | Mỗi cặp phản hồi giống nhau về mã trạng thái, cấu trúc và thông báo; chênh trung vị thời gian phản hồi (20 lần đo) ≤ 300 ms. |

#### 5.2 Mã xác thực

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-AUTH-08 | 04 | A yêu cầu mã đăng nhập | Kiểm hộp thư và cơ sở dữ liệu | Thư chứa đúng 8 chữ số; cơ sở dữ liệu không có mã dạng rõ. 1.000 mã sinh liên tiếp không trùng mẫu đoán được (không tăng dần, có mã bắt đầu bằng 0). |
| AC-AUTH-09 | 04 | A có mã đăng nhập hợp lệ | Dùng mã đó ở trang đặt lại mật khẩu của A | Sai mã (thông báo chung). |
| AC-AUTH-10 | 04 | A đã đăng nhập thành công bằng mã M | Đăng xuất rồi nhập lại M | Sai mã. |
| AC-AUTH-11 | 05 | A nhận mã lúc T | Nhập đúng mã lúc T + 9 phút 50 giây | Đăng nhập thành công. |
| AC-AUTH-12 | 05 | A nhận mã lúc T | Nhập đúng mã lúc T + 10 phút 1 giây | "Mã xác thực không đúng hoặc đã hết hạn."; bộ đếm sai không tăng. |
| AC-AUTH-13 | 06 | A vừa nhận mã | Trong 60 giây bấm gửi lại | Nút gửi lại bị khoá, hiện "Gửi lại mã trong N giây" (N theo máy chủ). Gọi thẳng API → không tạo mã mới, phản hồi kèm số giây còn lại; mã cũ vẫn đăng nhập được. |
| AC-AUTH-14 | 06 | A vào bước mã (mã đã gửi), chuyển sang mật khẩu rồi quay lại bước mã sau 20 giây | Ô mã hiện lại và tự gửi | Không hiện lỗi; hiện đếm ngược khoảng 40 giây; mã cũ vẫn dùng được. |
| AC-AUTH-15 | 06 | A đã được gửi 5 mã đăng nhập trong 30 phút (mỗi lần cách ≥ 60 giây) | Yêu cầu lần 6 | "Bạn thao tác quá nhanh…" kèm số phút chờ; không có thư mới. Mã đặt lại mật khẩu cho A vẫn gửi được. |
| AC-AUTH-16 | 06 | Một IP đã yêu cầu 30 mã trong 1 giờ cho 30 email khác nhau | Yêu cầu mã cho email thứ 31 | Bị từ chối "thao tác quá nhanh"; không có thư gửi đi. |
| AC-AUTH-17 | 07 | A nhận mã M1, đợi 60 giây, nhận mã M2 | Nhập M1 | Sai mã. Nhập M2 → thành công. |
| AC-AUTH-18 | 07 | A có mã đăng nhập M1 còn hạn | Yêu cầu mã đặt lại mật khẩu M2 | M1 vẫn đăng nhập được. |
| AC-AUTH-19 | 08 | A có mã hợp lệ | Nhập sai 4 lần | Cả 4 lần đều "Mã xác thực không đúng hoặc đã hết hạn.", không có số lần còn lại. |
| AC-AUTH-20 | 08 | A đã sai 4 lần | Nhập sai lần 5, rồi nhập mã đúng | Lần 5: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút."; mã đúng sau đó vẫn bị từ chối; yêu cầu mã mới (mọi mục đích) bị từ chối trong 15 phút; đăng nhập mật khẩu của A vẫn hoạt động. |
| AC-AUTH-21 | 08 | Email N không có mã nào | Gọi đăng nhập mã với N, 5 lần | Lần 1–4 cùng thông báo như AC-AUTH-19; lần 5 cùng thông báo khoá như AC-AUTH-20. |
| AC-AUTH-22 | 08 | A bị khoá xác thực mã lúc T | Lúc T + 15 phút 1 giây yêu cầu mã mới và nhập đúng | Đăng nhập thành công. |
| AC-AUTH-23 | 08 | Ở bước mã | Nhập `1234567` (7 số) hoặc `1234abcd` | FE hiện "Nhập đủ 8 chữ số của mã xác thực.", không gửi yêu cầu, bộ đếm không tăng. |
| AC-AUTH-24 | 09 | A đã có tài khoản | Gọi gửi mã mục đích đăng ký cho A | Phản hồi giống hệt khi gửi cho N; hộp thư A nhận thư "đã có tài khoản", không có mã. |
| AC-AUTH-25 | 09 | — | Gửi mã đăng nhập cho N | Phản hồi thành công kèm thời gian chờ; không có thư nào được gửi. |
| AC-AUTH-26 | 09 | X bị vô hiệu | Gửi mã đăng nhập cho X | Phản hồi giống AC-AUTH-25; X nhận thư báo tài khoản bị vô hiệu + kênh liên hệ, không có mã. |

#### 5.3 Đăng ký

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-AUTH-27 | 10 | Trên trang đăng ký của N, đã có mã đúng | Bấm "Tạo tài khoản" với Tên, Họ trống, chưa tick điều khoản | Hiện "Nhập tên của bạn.", "Nhập họ của bạn.", "Bạn cần đồng ý để tạo tài khoản." cạnh từng trường; không gửi yêu cầu. |
| AC-AUTH-28 | 10 | Trang đăng ký của N | Tên = `   `, hoặc Tên 51 ký tự, hoặc Tên = `Minh2`, hoặc `<b>` | Bị từ chối ở FE và ở máy chủ (gọi thẳng API) với lỗi trường tương ứng. |
| AC-AUTH-29 | 10 | Trang đăng ký của N | Tên = `  Minh `, Họ = `Nguyễn   Văn`, tạo tài khoản | Hồ sơ lưu `firstName = "Minh"`, `lastName = "Nguyễn Văn"` (kiểm ở DB/API). Giao diện chỉ hiện tên ("Minh"); hiển thị họ tên đầy đủ dời sang slice Account (PO sửa AC 2026-11-07). |
| AC-AUTH-30 | 10 | Chưa qua bước nhập email (tab mới) | Mở `/auth/register` | Chuyển về `/auth/login` bước nhập email. |
| AC-AUTH-31 | 11 | Trang đăng ký | Ngày sinh để trống cả 3 ô | Tạo tài khoản thành công, ngày sinh trống. |
| AC-AUTH-32 | 11 | Trang đăng ký | Ngày sinh `31/02/2000`, `01/01/1899`, ngày mai, hoặc chỉ điền năm | "Ngày sinh chưa hợp lệ."; không tạo tài khoản; máy chủ cũng từ chối khi gọi thẳng. |
| AC-AUTH-32a | 11 | Hôm nay là 07/11/2026; trang đăng ký | Ngày sinh = `07/11/2013` (đúng 13 tuổi hôm nay) | Tạo tài khoản thành công. |
| AC-AUTH-32b | 11 | Hôm nay là 07/11/2026; trang đăng ký | Ngày sinh = `08/11/2013` (thiếu 1 ngày đủ 13 tuổi) | Không tạo tài khoản; hiện "Bạn cần đủ 13 tuổi để tạo tài khoản." cạnh trường ngày sinh; các trường khác giữ nguyên. Gọi thẳng API với cùng giá trị → máy chủ từ chối, không có tài khoản. |
| AC-AUTH-32c | 11 | Năm hiện tại 2026; trang đăng ký, ngày sinh là 3 ô nhập ngày / tháng / năm (decisions 2026-11-07, không dùng dropdown) | Nhập năm 2017 (lớn hơn năm hiện tại − 10) | Báo lỗi ở ô ngày sinh, không gửi yêu cầu; năm 2016 được nhận ở ô nhập nhưng vẫn bị chặn bởi AC-AUTH-32b (tuổi < 13). |
| AC-AUTH-33 | 12 | Trang đăng ký | Gọi thẳng API đăng ký với đồng ý điều khoản = false hoặc thiếu | Lỗi dữ liệu không hợp lệ; không có tài khoản nào được tạo. |
| AC-AUTH-34 | 12 | N đăng ký thành công | Kiểm bản ghi | Có thời điểm đồng ý điều khoản = thời điểm tạo tài khoản (±5 giây); không có trường phiên bản điều khoản. |
| AC-AUTH-35 | 13 | Trang đăng ký | Mở trang | Ô nhận email marketing chưa tick. |
| AC-AUTH-36 | 13 | N đăng ký có tick marketing; N2 đăng ký không tick | Kiểm bản ghi | N: đồng ý = có, có thời điểm đồng ý. N2: đồng ý = không, không có thời điểm. |
| AC-AUTH-37 | 14 | N có mã đăng ký đúng M | Gửi đồng thời 2 yêu cầu đăng ký cho N cùng dùng M | Đúng 1 tài khoản được tạo; yêu cầu còn lại nhận "Email này đã có tài khoản. Vui lòng đăng nhập." hoặc sai mã, không lỗi máy chủ. Số bản ghi của N = 1. |
| AC-AUTH-38 | 14 | A đã tồn tại | Gọi API đăng ký cho A với mã bất kỳ | Nhận sai mã (không nhận "email đã có tài khoản" vì không có mã hợp lệ). |
| AC-AUTH-39 | 15 | N đăng ký thành công từ `/auth/login?returnUrl=%2Fshop` | — | Chuyển tới `/shop`; header hiện trạng thái đăng nhập; vai trò = member; tải lại trang vẫn đăng nhập; đăng nhập mật khẩu với N bất kỳ mật khẩu → "Email hoặc mật khẩu chưa đúng." |

#### 5.4 Đăng nhập

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-AUTH-40 | 16 | A ở bước nhập email | Tiếp tục | Hiện bước mã, tiêu đề được focus, có thư mã trong hộp thư A. Nhập đúng → chuyển returnUrl. |
| AC-AUTH-41 | 16 | A ở bước mã, đã gõ 4 số | Bấm "Sử dụng mật khẩu" rồi "Chỉnh sửa Email" | Ô mã bị xoá khi chuyển bước; ô email điền sẵn email A. |
| AC-AUTH-42 | 17 | — | Đăng nhập mật khẩu với A + `nine2fine1` (sai hoa thường), với N + bất kỳ, với P + bất kỳ | Cả 3: "Email hoặc mật khẩu chưa đúng."; email vẫn hiển thị. |
| AC-AUTH-43 | 17 | — | Đăng nhập A + ` Nine2fine1` (có khoảng trắng đầu) | Sai thông tin đăng nhập. |
| AC-AUTH-44 | 18 | A đã sai mật khẩu 4 lần trong 15 phút | Sai lần 5, rồi nhập đúng `Nine2fine1` | Lần 5 và lần nhập đúng đều nhận thông báo khoá kèm số phút; không tạo phiên. |
| AC-AUTH-45 | 18 | A đang bị khoá mật khẩu | Đăng nhập bằng mã đúng | Thành công; bộ đếm sai mật khẩu về 0, khoá được gỡ. |
| AC-AUTH-46 | 18 | A sai 4 lần | Chờ 16 phút, sai thêm 1 lần | Không khoá (bộ đếm đã về 0 trước đó, giờ là 1). |
| AC-AUTH-47 | 18 | N (không tồn tại) | Sai mật khẩu 5 lần | Lần 5 nhận cùng thông báo khoá như AC-AUTH-44. |
| AC-AUTH-48 | 18 | Một IP đã sai 20 lần trong 15 phút với 20 email khác nhau | Thử email thứ 21 | Bị từ chối "thao tác quá nhanh". |
| AC-AUTH-49 | 19 | X bị vô hiệu, có mật khẩu đúng | Đăng nhập X với mật khẩu sai | "Email hoặc mật khẩu chưa đúng." |
| AC-AUTH-50 | 19 | X bị vô hiệu | Đăng nhập X với mật khẩu đúng | "Tài khoản của bạn đang bị tạm khóa…"; không tạo phiên. |

#### 5.5 Mật khẩu và đặt lại

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-AUTH-51 | 20 | Trang đặt lại của A | Nhập lần lượt `Abc1234` (7 ký tự), `abcdefg1` (thiếu in hoa), `ABCDEFGH` (thiếu số), chuỗi 65 ký tự có in hoa và số | Mỗi trường hợp: điều kiện tương ứng hiện "Chưa đạt", nút "Đổi mật khẩu" khoá; gọi thẳng API cũng bị từ chối. |
| AC-AUTH-51b | 20 | Tài khoản có email `minh1@example.com` | Đặt lại với mật khẩu `MINH1@EXAMPLE.COM` (đạt in hoa + số nhưng trùng email khi bỏ qua hoa thường) | Bị từ chối với lỗi trường mật khẩu; mật khẩu cũ không đổi. |
| AC-AUTH-52 | 20 | Trang đặt lại của A | Nhập `Nine2fine9` và nhập lại `Nine2fine8` | "Mật khẩu nhập lại chưa khớp.", nút khoá. |
| AC-AUTH-53 | 20 | — | Gọi thẳng API đặt lại với mật khẩu `abcdefgh` và mã đúng | Máy chủ từ chối với lỗi trường mật khẩu; mật khẩu cũ vẫn dùng được; mã chưa bị tiêu (đề xuất PO: kiểm quy tắc trước khi tiêu mã). |
| AC-AUTH-54 | 20 | Đúng 64 ký tự có in hoa và số | Đặt lại | Thành công, đăng nhập được bằng mật khẩu đó. |
| AC-AUTH-55 | 21 | Bất kỳ phản hồi auth / account | Kiểm nội dung phản hồi và bảng dữ liệu | Không phản hồi nào chứa mật khẩu hay bản băm; cột mật khẩu không chứa dạng rõ. |
| AC-AUTH-56 | 22 | A đăng nhập trên máy 1 và máy 2 | Trên máy 3 đặt lại mật khẩu thành công | Máy 3 về bước mật khẩu với "Đã cập nhật mật khẩu…", chưa đăng nhập; yêu cầu kế tiếp của máy 1 và máy 2 bị coi là chưa đăng nhập (BR-AUTH-26); mật khẩu cũ bị từ chối, mật khẩu mới thành công. |
| AC-AUTH-57 | 22 | P (chưa có mật khẩu) | Vào bước mật khẩu → "Quên mật khẩu" → đặt `Lan2026ok` | Thành công; P đăng nhập được bằng mật khẩu `Lan2026ok`. |
| AC-AUTH-58 | 22 | A đang bị khoá mật khẩu (BR-AUTH-18) | Đặt lại mật khẩu thành công | Đăng nhập mật khẩu mới ngay được, không phải chờ. |
| AC-AUTH-59 | 22 | A có mã đặt lại M | Đặt lại thành công bằng M rồi dùng M lần nữa | Lần 2: sai mã. |
| AC-AUTH-60 | 22 | Trang đặt lại | Bấm "Hủy bỏ" | Về bước nhập email; mật khẩu không đổi. |

#### 5.6 Phiên

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-AUTH-61 | 23 | — | A đăng nhập bằng mã; B đăng nhập mật khẩu; N đăng ký | Mỗi trường hợp có đúng 1 phiên mới với phương thức tương ứng. Đăng nhập thất bại không tạo phiên. |
| AC-AUTH-62 | 24 | A (member) đăng nhập, không hoạt động | Mở site sau 29 ngày | Vẫn đăng nhập. Sau 30 ngày 1 phút không hoạt động → khách. |
| AC-AUTH-63 | 24 | A hoạt động mỗi ngày | Ngày thứ 90 + 1 phút kể từ đăng nhập | Phiên hết hạn, phải đăng nhập lại. |
| AC-AUTH-64 | 24 | Staff đăng nhập | 8 giờ 1 phút không hoạt động, hoặc 24 giờ 1 phút kể từ đăng nhập | Yêu cầu kế tiếp bị coi là chưa đăng nhập. |
| AC-AUTH-65 | 25 | A đã đăng nhập | F5, mở tab mới, đóng mở lại trình duyệt | Vẫn đăng nhập; header hiện trạng thái thành viên; vào `/account/profile` không bị chuyển sang đăng nhập dù chỉ thoáng qua. |
| AC-AUTH-66 | 25 | Khách | Mở site | Hỏi phiên hiện tại trả "chưa đăng nhập", không hiện lỗi, không ghi lỗi console. |
| AC-AUTH-67 | 25 | A mở trực tiếp `/account/orders` khi máy chủ phản hồi chậm 3 giây | — | Không chuyển sang trang đăng nhập; hiển thị trang sau khi phiên được xác nhận. Máy chủ không phản hồi sau 10 giây → chuyển sang đăng nhập với returnUrl, có thể thử lại. |
| AC-AUTH-68 | 26 | A đang ở `/account/addresses`, có 2 món trong giỏ; phiên bị thu hồi | Lưu địa chỉ | Chuyển `/auth/login?returnUrl=%2Faccount%2Faddresses` với "Phiên đăng nhập đã hết hạn…"; giỏ vẫn 2 món. |
| AC-AUTH-69 | 26 | A ở PLP, phiên hết hạn | Có yêu cầu bị từ chối vì chưa đăng nhập | Ở lại PLP, header chuyển sang khách. |
| AC-AUTH-70 | 27 | A đăng nhập trên máy 1 và máy 2 | Đăng xuất ở máy 1 | Máy 1 về `/`, là khách; máy 2 vẫn đăng nhập. Bấm Back trên máy 1 không thấy dữ liệu tài khoản. |
| AC-AUTH-71 | 27 | Phiên của A đã hết hạn | A bấm đăng xuất | Thành công, không hiện lỗi. |
| AC-AUTH-72 | 27 | A tắt mạng | Bấm đăng xuất | FE vẫn chuyển sang khách. |
| AC-AUTH-73 | 27 | Có phiên của A | Gửi yêu cầu đăng xuất mang thông tin phiên giả / của người khác không hợp lệ | Không phiên nào của A bị kết thúc. |
| AC-AUTH-74 | 28 | A có 10 phiên còn hạn | Đăng nhập thiết bị thứ 11 | Phiên có lần dùng cuối cũ nhất bị kết thúc; còn đúng 10 phiên. |
| AC-AUTH-75 | 29 | A đang đăng nhập 2 máy | Admin vô hiệu tài khoản A (hoặc đổi vai trò) | Yêu cầu kế tiếp ở cả 2 máy bị coi là chưa đăng nhập. |
| AC-AUTH-76 | 30 | A đã đăng nhập | Mở `/auth/login?returnUrl=%2Fcart` | Chuyển ngay `/cart`. Mở `/auth/register` → `/new-in`. |

#### 5.7 returnUrl

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-AUTH-77 | 31 | — | Đăng nhập A với returnUrl lần lượt `https://evil.com`, `//evil.com`, `/\evil.com`, `/%5Cevil.com`, `javascript:alert(1)`, `/auth/login`, chuỗi 513 ký tự | Luôn về `/new-in`. |
| AC-AUTH-78 | 31 | — | Đăng nhập A với `returnUrl=%2Fproducts%2Fao-so-mi%3Fsize%3DM` | Về `/products/ao-so-mi?size=M`. |
| AC-AUTH-79 | 31 | — | Đăng nhập staff ở `/admin/login` không có returnUrl; đăng nhập staff ở `/auth/login` không có returnUrl; đăng nhập A (member) với returnUrl `/admin/orders` | Staff ở `/admin/login` về `/admin`; staff ở `/auth/login` về `/new-in` (không vòng chuyển trang, phiên admin chưa có); A về `/new-in`. |
| AC-AUTH-80 | 31 | Khách ở `/shop` bấm đăng nhập, email N | Đăng ký xong | Về `/shop`. Tương tự A → quên mật khẩu → đăng nhập mật khẩu mới → về `/shop`. |

#### 5.8 Giỏ, yêu thích, phân quyền

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-AUTH-81 | 32 | Khách có 3 món trong giỏ | Đăng nhập A, rồi đăng xuất, rồi đăng ký N | Sau mỗi bước giỏ vẫn đúng 3 món, cùng biến thể và số lượng. |
| AC-AUTH-82 | 32 | Khách ở PDP bấm tim | Chuyển tới đăng nhập, đăng ký N thành công | Quay lại PDP; sản phẩm đã lưu; `/wishlist` có 1 sản phẩm. |
| AC-AUTH-83 | 33 | — | Gọi API đăng ký kèm trường vai trò = admin | Tài khoản tạo ra có vai trò member. |
| AC-AUTH-84 | 33 | A (member) đã đăng nhập | Gọi trực tiếp một API dưới khu admin | Lỗi "không đủ quyền"; không có dữ liệu admin trong phản hồi. |
| AC-AUTH-85 | 33 | Staff đăng nhập | Gọi API cài đặt nhân viên | "Không đủ quyền". Admin gọi cùng API → được phép. |
| AC-AUTH-86 | 34 | Khách | Mở `/account/profile`, `/wishlist`, `/admin` | Chuyển đăng nhập kèm returnUrl đúng đường dẫn đã mở: `/account/profile`, `/wishlist` → `/auth/login?returnUrl=…`; `/admin` → `/admin/login?returnUrl=…` (chốt 2026-11-07). |
| AC-AUTH-87 | 34 | A (member) | Mở `/admin` | Về `/new-in`; không hiện khung, menu hay chữ nào của admin. |
| AC-AUTH-88 | 34 | — | Gọi API account không có phiên; gọi API admin bằng phiên member | Hai mã lỗi khác nhau: "chưa đăng nhập" và "không đủ quyền". |

#### 5.9 Bảo vệ dữ liệu và độ tin cậy

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-AUTH-89 | 35 | Chạy toàn bộ luồng đăng ký, đăng nhập mã, đăng nhập mật khẩu, đặt lại trên môi trường triển khai | Tìm trong log máy chủ, console trình duyệt, URL lịch sử, sự kiện analytics | Không thấy mã 8 số đã gửi, mật khẩu đã nhập, bí mật phiên; email trong log máy chủ ở dạng che. |
| AC-AUTH-90 | 35 | A đã đăng nhập | Trong console trình duyệt đọc `document.cookie`, `localStorage`, `sessionStorage` | Không có bí mật phiên nào đọc được. |
| AC-AUTH-91 | 35 | Thiếu cấu hình bí mật phiên | Khởi động máy chủ | Máy chủ dừng với thông báo thiếu cấu hình (không lộ giá trị). |
| AC-AUTH-92 | 35 | Trang web từ một nguồn khác nine2fine | Gửi yêu cầu có xác thực tới API auth/account bằng trình duyệt của A | Bị chặn; không đọc được dữ liệu của A. |
| AC-AUTH-93 | 36 | — | Gây từng loại lỗi trong BR-AUTH-36 | Mỗi loại có mã lỗi riêng, ổn định; FE hiện đúng câu tiếng Việt tương ứng; không phản hồi nào có stack trace/SQL. Sai mã hiển thị "Mã xác thực không đúng…", không phải "Không thể kết nối". |
| AC-AUTH-94 | 36 | Máy chủ trả lỗi 500 hoặc mất mạng | Bất kỳ thao tác auth | "Không thể kết nối. Vui lòng thử lại." |
| AC-AUTH-95 | 37 | Backend thật + Gmail SMTP của nhóm (Supabase) | **95a (Must, điều kiện đóng Slice 1):** Thắng yêu cầu mã 10 lần cho một hộp thư Gmail thật | ≥ 9/10 thư vào hộp thư chính trong 60 giây; người gửi hiện "nine2fine"; thư có mã, hạn 10 phút, cảnh báo không chia sẻ; không có link đăng nhập. **95b (Should, trước go-live):** như trên cho hộp thư Outlook, 10 lần. |
| AC-AUTH-96 | 38 | Trang đăng ký đã điền đủ | Bấm "Tạo tài khoản" 3 lần nhanh / nhấn Enter liên tục | Chỉ 1 yêu cầu được gửi; nút hiện "Đang tạo tài khoản…" và bị khoá. |
| AC-AUTH-97 | 38 | Trang đăng ký đã điền đủ, mạng bị ngắt | Bấm "Tạo tài khoản" | "Không thể kết nối. Vui lòng thử lại."; Tên, Họ, ngày sinh, các ô tick và mã vẫn còn; bật mạng bấm lại thành công. |

Tổng: 38 BR, 101 AC (AC-AUTH-01..97, 32a–32c và 51b).

### 6. Định nghĩa xong của Slice 1

Theo `docs/README.md` và master plan mục 49–50:
- Mọi AC-AUTH Must đạt trong `docs/qa/report-slice-1-auth.md` (không còn AC chờ xác nhận), trừ các AC hoãn có chủ đích (chốt 2026-11-07, không treo vô thời hạn): AC-68, 69 → kiểm khi slice Catalog hoặc Account có API thật đầu tiên (Slice 1 chấp nhận bằng interceptor với 401 giả và test BE thu hồi phiên); AC-75, 84, 85 → slice Admin; AC-88 → slice Account (Slice 1 chấp nhận bằng test middleware/service BE); AC-89 → checklist một lần trên môi trường triển khai trước go-live, QA phụ trách; AC-95b → trước go-live. Slice kế tiếp không được đóng nếu AC hoãn được giao cho nó chưa kiểm.
- AC-95a do Thắng chạy tay và ghi kết quả vào báo cáo QA.
- `docs/api/openapi.yaml` mô tả đủ các thao tác auth + phiên hiện tại + đăng xuất, kèm mã lỗi BR-AUTH-36.
- FE chạy chế độ HTTP với BE thật trên Supabase; mock vẫn chạy cùng interface; Playwright `auth.spec.ts` cập nhật theo AC và pass.
- Không đổi visual auth (master plan 19); checklist usability/a11y mục 19 và 39 vẫn đạt.
- Quyết định mới ghi `docs/decisions.md`, bàn giao ghi `docs/handoff.md`.

### 7. Câu hỏi mở

| # | Câu hỏi | Ảnh hưởng | Cần ai trả lời / trạng thái |
| --- | --- | --- | --- |
| 1 | Có áp tuổi tối thiểu khi đăng ký không? PO đề xuất 16 tuổi nếu người dùng nhập ngày sinh; nhưng ngày sinh không bắt buộc nên quy tắc này chỉ chặn được người tự khai. | BR-AUTH-11 | Thắng — **Đã trả lời 2026-11-07: tối thiểu 13 tuổi nếu có ngày sinh; bộ chọn năm ≤ năm hiện tại − 10 (BR-AUTH-11, AC-AUTH-32a–32c).** |
| 2 | Địa chỉ và tên người gửi email (ví dụ `no-reply@…`), có tên miền riêng chưa, ai cấp tài khoản dịch vụ gửi thư? Nếu chưa có, Slice 1 chỉ đạt BR-AUTH-37 ở môi trường thử. | BR-AUTH-37, AC-AUTH-95 | Thắng (BE chọn dịch vụ) — **Đã trả lời 2026-11-07: gửi qua Gmail SMTP của nhóm; thông tin SMTP chỉ trong `backend/.env` (BR-AUTH-37).** |
| 3 | Staff/admin đăng nhập qua cùng trang `/auth/login` của storefront hay có trang đăng nhập riêng cho `/admin`? FE admin hiện có phiên mock riêng. | BR-AUTH-31, BR-AUTH-33/34 | Thắng — **Đã trả lời 2026-11-07: staff/admin dùng trang riêng `/admin/login` (BR-AUTH-31, 33, 34).** |
| 4 | Điều khoản sử dụng / Chính sách bảo mật có số phiên bản không? Khi điều khoản đổi có bắt người dùng cũ đồng ý lại không? | BR-AUTH-12 | Thắng — **Đã trả lời 2026-11-07: chỉ lưu thời điểm đồng ý, không phiên bản, không bắt đồng ý lại (BR-AUTH-12).** |
| 5 | Thời hạn phiên đề xuất (member 30 ngày không hoạt động / tối đa 90 ngày; staff/admin 8 giờ / 24 giờ) có phù hợp? | BR-AUTH-24 | Thắng — **Đã trả lời 2026-11-07: giữ đề xuất (BR-AUTH-24).** |
| 6 | Kênh liên hệ ghi trong thông báo "tài khoản bị tạm khóa" là gì? `store-info.ts` hiện toàn giá trị giả định. | BR-AUTH-09, BR-AUTH-19 | Thắng — **Đã trả lời 2026-11-07: phthang0872@gmail.com (BR-AUTH-09, 19).** |
| 7 | Bảng `users` trên Supabase đã có dữ liệu thật chưa? Danh sách email staff/admin cần seed? | BR-AUTH-33, migration của BE | Thắng / Backend — **Chuyển Orchestrator xử lý**: tự kiểm tra Supabase ở bước triển khai, trước khi chạy migration (decisions 2026-11-07); vẫn mở. Seed dùng mật khẩu hợp lệ BR-AUTH-20, không ghi vào tài liệu. |
| 8 | Tạo/đổi mật khẩu ở Profile làm trong Slice 1 (Should) hay dời sang slice Account? Nếu làm: đổi mật khẩu có kết thúc phiên trên thiết bị khác không (PO đề xuất: có, trừ phiên hiện tại)? | Phạm vi Slice 1 | Thắng — **Đã trả lời 2026-11-07: Won't ở Slice 1, dời sang slice Account.** |

---

## Slice 2: Catalog (chỉ đọc)

Nguồn: master plan mục 0, 31, 33, 52; FE `features/{catalog,product,search,home}`, `mocks/{products,mock-inventory,mock-catalog-api,reviews}.ts`, interface `CATALOG_API`; BE chưa có module catalog, `schema.prisma` chưa có bảng sản phẩm. Quy ước dấu như Slice 1. Tên endpoint và tên trường do Backend chốt trong `docs/api/openapi.yaml`; PO chỉ chốt hành vi. Mức Must/Should áp dụng cho từng BR; AC kế thừa mức của BR.

### 1. Vấn đề và mục tiêu

**Vấn đề.** PLP, PDP, tìm kiếm và các dải sản phẩm ở Home/giỏ đang đọc 8 sản phẩm cố định trong `products.ts`; giá, tồn kho, trạng thái không đổi được ngoài code và không có nguồn thật để Slice 3 (giỏ, đặt hàng) dựa vào.

**Mục tiêu.**
1. Mọi màn hình xem sản phẩm đọc từ BE: giá, biến thể, tồn kho hiển thị lấy từ cơ sở dữ liệu, khớp URL state hiện có (`/shop`, `/shop/nam|nu`, `/shop/:category`, `/shop-by-moment/:moment`, `/search?q=`, `/product/:slug`).
2. Seed từ dữ liệu mock để FE chạy HTTP mà không mất tính năng đang có (trừ mục Won't).
3. Chuẩn bị nguồn sự thật cho Slice 3: id sản phẩm/biến thể ổn định, tồn kho không âm.

**Không phải mục tiêu.** Đổi giao diện PLP/PDP/search (giữ visual), chọn công nghệ tìm kiếm/cache.

### 2. Phạm vi

| Hạng mục | Mức | Lý do |
| --- | --- | --- |
| Sản phẩm, biến thể màu/size, trạng thái ACTIVE/DRAFT/ARCHIVED, tồn kho hiển thị | Must | Nền cho mọi màn hình và Slice 3. |
| Danh sách: lọc, sắp xếp, phân trang theo URL state hiện có | Must | PLP là cửa vào chính; không có phân trang thì không mở rộng được. |
| Chi tiết theo slug, bảng size theo danh mục | Must | PDP và hướng dẫn chọn size đang có. |
| Tìm kiếm trang `/search` và panel gợi ý nhanh | Must | FE đang có cả hai. |
| Seed từ `products.ts` + bảng size trong `reviews.ts` | Must | Không có nội dung thì FE trống. |
| Giới hạn tần suất, mã lỗi ổn định, cấu hình bật catalog thật độc lập | Must | Vận hành thực tế; tránh kéo Cart/Account sang HTTP. |
| Nút "Xem thêm" khi tổng > số đã tải | Should | Seed chỉ 8 sản phẩm; cần khi danh mục > 24. |
| Lọc theo danh sách id (trang Yêu thích) | Should | Trang Yêu thích lọc phía FE trên kết quả danh sách; hỏng khi > 1 trang. |
| Chỉ tiêu thời gian phản hồi | Should | Chưa có số liệu nền. |
| Quản lý sản phẩm, tồn kho, ảnh trong admin | Won't | Slice Admin. Slice 2 thay đổi dữ liệu bằng seed/SQL. |
| Đọc/gửi đánh giá thật, điểm sao trên thẻ, đánh giá mẫu | Won't | Gửi đánh giá cần đơn đã nhận (sau Slice 3). Không đưa đánh giá mẫu vào dữ liệu thật. Xem BR-CAT-17. |
| "Báo khi có hàng" (`/stock-alerts`) | Won't | Cần lưu email và gửi thư theo sự kiện; FE ẩn ở chế độ HTTP. |
| Wishlist lưu server, giỏ hàng, báo giá, giữ/trừ tồn kho, voucher | Won't | Slice 3 / P1. |
| Giá theo biến thể, xếp hạng theo độ liên quan, gợi ý từ khoá động, chuyển hướng slug cũ | Won't | FE không có; không đủ giá trị cho lần này. |
| Upload/xử lý ảnh | Won't | `mediaId` là id trong media manifest của FE, không phải URL. |

### 3. Hiện trạng FE và hành vi được chọn

| # | Điểm | FE mock hiện tại | Chọn | Lý do |
| --- | --- | --- | --- | --- |
| C1 | Phân trang | `list` trả toàn bộ, `total = items.length`; panel và dải Home/giỏ tự `slice` phía FE; tiêu đề đếm `items.length` | BE phân trang (BR-CAT-08). FE gửi `limit` nhỏ cho panel (5) và dải (≤ 12); tiêu đề PLP đếm theo `total`; URL **không** thêm `page` (Xem thêm giữ trong bộ nhớ) | Giữ URL state hiện có; mở rộng được khi > 24 sản phẩm. |
| C2 | `featured` | Thứ tự mảng mock | Thứ tự hiển thị cố định `displayOrder` (seed = thứ tự mock 01..08) | Ổn định, không cần quy tắc phức tạp. |
| C3 | Giá trị lạ của `category/moment/gender/size/color` | Trả danh sách rỗng, không lỗi | Giữ: 200 rỗng. `sort`, `maxPrice`, `page`, `limit`, `q` sai dạng → 422 `validation` | `/shop/xyz` đang cho trạng thái rỗng; FE đã chuẩn hoá `sort`, `maxPrice`. |
| C4 | `size` + `color` + `available` | Cùng khớp trên **một** biến thể | Giữ | Tránh "có size M" ở màu A nhưng "còn hàng" ở màu B. |
| C5 | `get(slug)` không tồn tại | Mock trả `undefined` → trang không tìm thấy; HTTP adapter hiện coi mọi 4xx là lỗi → "không tải được" | BE trả 404 `not-found`; **FE adapter chuyển `not-found` thành `undefined`** | Dùng mã `not-found` đã chốt 2026-11-07. |
| C6 | Tìm kiếm | Chuỗi con liền mạch trên "tên + loại", bỏ dấu | Tách từ, mọi từ phải có trong "tên + loại", bỏ dấu, `đ` = `d` | Rộng hơn nhưng không đổi kết quả cho truy vấn một từ. |
| C7 | Đánh giá, điểm sao, đủ điều kiện đánh giá, báo hàng về | Dữ liệu mẫu trong `reviews.ts`, lưu trong bộ nhớ | HTTP: `reviews` trả `[]`; FE ẩn form đánh giá, khối điểm sao, "Báo khi có hàng"; không gọi `/stock-alerts` hay `/reviews/eligibility` | Không có dữ liệu thật; tránh đánh giá giả lên môi trường thật (chờ xác nhận, câu hỏi 2). |
| C8 | Id | Sản phẩm `01..08`, biến thể `01-0-S` | Id mới do BE cấp, ổn định qua mọi lần seed; giỏ/yêu thích cũ trong trình duyệt tham chiếu id không còn → bỏ qua êm, không lỗi | Dữ liệu demo; không viết mã tương thích. |
| C9 | Cấu hình | `apiConfig` chỉ có `mode` và `authMode` | Thêm cờ riêng cho catalog (như `authMode`); đặt `mode: 'http'` toàn cục không phải cách bật catalog | Cart/Account/Admin chưa có API. |
| C10 | Đặt hàng mock | `MockInventory` trừ kho trong bộ nhớ trên `PRODUCTS` | Giữ nguyên đến Slice 3. Đơn mock **không** làm đổi tồn kho trong DB; giá/tồn kho hiển thị lấy từ DB | Chấp nhận lệch tạm thời; Slice 3 thay checkout. |
| C11 | Bảng size lỗi | `sizeChart(...).subscribe` không xử lý lỗi, nút im lặng | FE hiện thông báo lỗi + cho thử lại | Mất mạng không được làm nút "chết". |
| C12 | Trang Yêu thích | Lọc phía FE theo id đã lưu trên kết quả danh sách | Thêm lọc theo danh sách id (BR-CAT-16, Should) | Không thì chỉ thấy mục nằm trong trang đầu. |
| C13 | Ngày tạo | Chuỗi `YYYY-MM-DD` | Giữ định dạng ngày ISO; sắp xếp "Mới nhất" so sánh được | Tương thích `createdAt` hiện có. |

### 4. Business Rules

#### 4.1 Dữ liệu

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-CAT-01 | Must | **Sản phẩm.** Trường bắt buộc: `slug` (chữ thường a-z, số, dấu `-`; 3–80 ký tự; duy nhất), `name` (1–120), `type` (1–120), `category` ∈ {tops, bottoms, dresses, outerwear}, `moments` ⊆ {work, dinner, event, weekend} (≥ 1), `genders` ⊆ {nam, nu} (≥ 1), `price` (số nguyên đồng, 10.000 – 50.000.000; đề xuất PO), `mediaId`, `createdAt`, `salesRank` (số nguyên ≥ 1), `displayOrder`. Tuỳ chọn: `compareAtPrice` (nếu có phải > `price`), `badge` (≤ 20 ký tự), `colorMedia`. Nội dung: `description`, `material`, `care[]`, `fit{summary, model}`, `looks[]`, `gallery[]` (≥ 1 `mediaId`). Ràng buộc nằm ở cơ sở dữ liệu, không chỉ ở seed. |
| BR-CAT-02 | Must | **Trạng thái hiển thị.** `ACTIVE` / `DRAFT` / `ARCHIVED` (master plan 33). API công khai chỉ thấy `ACTIVE`: `DRAFT` và `ARCHIVED` không xuất hiện trong danh sách, tổng số, tìm kiếm, lọc theo id; xem chi tiết → 404 `not-found`. Seed: toàn bộ `ACTIVE`. |
| BR-CAT-03 | Must | **Biến thể.** Mỗi sản phẩm `ACTIVE` có ≥ 1 biến thể. Biến thể có `id`, `sku` (duy nhất toàn hệ thống), `size` ∈ {S, M, L, XL}, `color{name, hex}` (hex dạng `#RRGGBB`), `inventory` (số nguyên ≥ 0). Cặp (màu, size) duy nhất trong một sản phẩm. Màu lọc được: Đen, Trắng, Xám, Đỏ. |
| BR-CAT-04 | Must | **Trạng thái tồn kho hiển thị.** Suy ra từ `inventory`: 0 → `OUT_OF_STOCK`; 1–5 → `LOW_STOCK`; ≥ 6 → `IN_STOCK` (ngưỡng 5 khớp FE hiện có; đề xuất PO). API trả `inventory` và `stockStatus`. PDP: `LOW_STOCK` hiện "Chỉ còn N"; `OUT_OF_STOCK` làm nút size bị vô hiệu, ghi "Size X - hết hàng". |
| BR-CAT-05 | Must | **Seed.** Từ `products.ts` (8 sản phẩm × 2 màu × 4 size = 64 biến thể; mọi trường nội dung, `mediaId`, `gallery` giữ nguyên) và 4 bảng size trong `reviews.ts`. Idempotent theo `slug` và `sku`: chạy lại không tạo bản ghi trùng và **không đặt lại `inventory`** của biến thể đã có. Chạy trong một giao dịch: lỗi giữa chừng thì không để lại dữ liệu nửa vời. Không seed đánh giá. |

#### 4.2 Danh sách

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-CAT-06 | Must | **Bộ lọc** (tham số rỗng hoặc vắng = không lọc, kết hợp bằng AND): `gender` ∈ {nam, nu} (sản phẩm có giá trị đó trong `genders`); `category`; `moment` (có trong `moments`); `size`, `color` (so tên màu đúng chữ, ví dụ `Đỏ`), `available=true`: **cùng khớp trên ít nhất một biến thể** (BR chọn C4); `maxPrice` (số nguyên ≥ 0; `price` ≤ `maxPrice`, bằng là đạt; 0 = không lọc). Giá trị lạ của gender/category/moment/size/color → 200, danh sách rỗng. `maxPrice` không phải số nguyên ≥ 0 → 422 `validation`, `field: maxPrice`. `/shop/nam`, `/shop/nu`, `/shop/:category`, `/shop-by-moment/:moment` tương đương tham số lọc tương ứng. |
| BR-CAT-07 | Must | **Sắp xếp.** `featured` (mặc định khi vắng; `displayOrder` tăng), `newest` (`createdAt` giảm), `price-asc`, `price-desc`, `bestselling` (`salesRank` tăng). Mọi kiểu hoà phân định bằng `slug` tăng dần để thứ tự lặp lại được giữa các lần gọi và các trang. Giá trị khác → 422 `validation`, `field: sort`. |
| BR-CAT-08 | Must | **Phân trang.** `page` ≥ 1 (mặc định 1), `limit` 1–48 (mặc định 24; đề xuất PO), đều là số nguyên. Phản hồi: `items` của trang và `total` = số sản phẩm khớp bộ lọc trên **toàn bộ** (không phải số trong trang). `page` vượt quá trang cuối → 200, `items: []`, `total` đúng. Sai dạng hoặc ngoài khoảng → 422 `validation`. Ghép mọi trang cùng bộ lọc và sắp xếp ra đúng `total` sản phẩm, không trùng, không thiếu. |
| BR-CAT-15 | Should | **Xem thêm (FE).** Khi số đã tải < `total`, PLP hiện nút "Xem thêm" tải trang kế và **nối** vào danh sách; hết thì ẩn nút; URL không đổi; tiêu đề đếm theo `total`. Đổi bộ lọc/sắp xếp → quay về trang 1. Lỗi khi tải thêm: giữ nguyên các sản phẩm đã hiện, báo lỗi và cho thử lại. |
| BR-CAT-16 | Should | **Lọc theo id.** Tham số `ids` (tối đa 48 id, phân tách bằng dấu phẩy) giới hạn kết quả vào các sản phẩm có id đó; id không tồn tại hoặc không `ACTIVE` bị bỏ qua; > 48 id → 422 `validation`. Dùng cho trang Yêu thích (kết hợp được với mọi bộ lọc khác). |

#### 4.3 Chi tiết, bảng size, đánh giá

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-CAT-09 | Must | **Chi tiết theo slug.** Slug trong đường dẫn được bỏ khoảng trắng hai đầu và hạ chữ thường trước khi tìm; phản hồi mang slug chuẩn, FE đổi URL bằng `replaceUrl` (hành vi hiện có). Không có, `DRAFT`, `ARCHIVED`, quá 80 ký tự hoặc chứa ký tự ngoài `a-z 0-9 -` → 404 `not-found` (không phải 422, không phải 500). FE hiện trang "không tìm thấy sản phẩm" có đường về `/shop`; lỗi mạng/5xx hiện trạng thái lỗi có nút thử lại — hai trạng thái này khác nhau. |
| BR-CAT-10 | Must | **Đủ nội dung PDP.** Phản hồi chi tiết có đủ `gallery`, `description`, `material`, `care`, `fit`, `looks`, `variants` (kèm `inventory`, `stockStatus`). Nội dung thiếu là chuỗi rỗng hoặc mảng rỗng, không `null`. |
| BR-CAT-11 | Must | **Độ tươi và ý nghĩa của giá/tồn kho.** Giá và tồn kho hiển thị phản ánh thay đổi trong DB sau ≤ 30 giây (đề xuất PO). Tồn kho trên PDP chỉ để tham khảo, **không phải giữ hàng**; Slice 3 kiểm lại khi đặt hàng. |
| BR-CAT-12 | Must | **Bảng size theo danh mục.** Mỗi danh mục trong BR-CAT-01 có đúng 1 bảng gồm `body`, `garment`, `bodyColumns`, `garmentColumns`, mỗi hàng ứng với S, M, L, XL (nội dung seed theo `SIZE_CHARTS`). Danh mục không có → 404 `not-found`. FE mở hộp thoại size ở PDP theo danh mục của sản phẩm; lỗi tải → thông báo lỗi và mở lại được. |
| BR-CAT-17 | Must | **Đánh giá và báo hàng về ở chế độ HTTP (Thắng chốt 2026-11-07).** Danh sách đánh giá của sản phẩm trả `[]` (200); thẻ sản phẩm không có điểm sao; FE không hiện đánh giá mẫu, form viết đánh giá và "Báo khi có hàng", không gọi `/stock-alerts` hay kiểm tra đủ điều kiện đánh giá. Chế độ mock giữ nguyên hành vi cũ. |

#### 4.4 Tìm kiếm

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-CAT-13 | Must | **Tìm kiếm.** Tham số `q`: bỏ khoảng trắng hai đầu, gộp khoảng trắng liên tiếp; rỗng sau chuẩn hoá = không tìm (như không có `q`); tối đa 100 ký tự (vượt → 422 `validation`, `field: q`). Không phân biệt hoa thường và dấu, `đ` = `d`. Tách thành từ; sản phẩm khớp khi **mọi** từ nằm trong "tên + loại" (`type`). `%`, `_`, `\`, `'`, `"` là ký tự thường: không thành ký tự đại diện, không gây lỗi. Không khớp → 200, `total: 0`. Kết hợp được với mọi bộ lọc, sắp xếp, phân trang. Không xếp hạng theo độ liên quan: thứ tự theo `sort` (BR-CAT-07). |
| BR-CAT-14 | Must | **Panel gợi ý nhanh (hành vi FE hiện có, giữ).** Chờ 250 ms sau lần gõ cuối rồi gọi tìm kiếm với `limit=5`; hiện tối đa 5 sản phẩm và "Xem tất cả (`total`)" dẫn tới `/search?q=`; gõ tiếp thì huỷ yêu cầu trước, kết quả cũ không hiện đè; lỗi → trạng thái lỗi + thử lại, giữ nguyên từ khoá; FE giới hạn ô nhập 100 ký tự. |

#### 4.5 Vận hành

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-CAT-18 | Must | **Công khai, chỉ đọc.** Mọi thao tác catalog dùng được không cần đăng nhập. Cookie phiên sai, đã thu hồi hoặc hết hạn gửi kèm **không** làm yêu cầu bị từ chối (vẫn 200). Chỉ phương thức đọc; `POST/PUT/PATCH/DELETE` trên đường dẫn catalog không đổi dữ liệu (404 hoặc 405). Phản hồi không chứa dữ liệu cá nhân. |
| BR-CAT-19 | Must | **Giới hạn tần suất.** Tối đa 120 yêu cầu catalog / 60 giây / địa chỉ IP (đề xuất PO), tách khỏi bộ đếm auth. Vượt → 429 `rate-limited` kèm `retryAfterSeconds` (1–60). Duyệt bình thường (PLP → PDP → quay lại, gõ tìm kiếm) không chạm giới hạn. |
| BR-CAT-20 | Must | **Lỗi có mã ổn định.** Lỗi catalog theo BR-AUTH-36: `validation` (kèm `field`), `not-found`, `rate-limited`, lỗi máy chủ; không stack trace, SQL, tên bảng. PLP lỗi mạng/5xx/429: trạng thái lỗi có nút thử lại, thử lại giữ nguyên bộ lọc đang có trên URL. |
| BR-CAT-21 | Must | **Bật catalog thật độc lập.** Cờ cấu hình riêng cho catalog (C9). Cờ = http: PLP, PDP, Search, panel, dải Home/giỏ, bảng size đều gọi API và **không còn hiển thị dữ liệu từ `products.ts`**; Cart/Checkout/Account/Admin vẫn chạy mock. Cờ = mock: hành vi và bộ test mock như trước Slice 2. |
| BR-CAT-22 | Should | **Hiệu năng.** Trên DB Supabase với 100 sản phẩm thử, đo tại máy chủ: danh sách p95 ≤ 500 ms, chi tiết p95 ≤ 300 ms (đề xuất PO; không tính thời gian mạng). |
| BR-CAT-23 | Must | **Migration chỉ cộng thêm.** Chỉ tạo bảng/cột/chỉ mục mới cho catalog; không xoá, đổi tên hay đổi kiểu bảng/cột có sẵn (kể cả phần auth cũ chờ "Dọn schema auth"). Chạy lại `migrate deploy` không lỗi. |

### 5. Acceptance criteria

Dữ liệu tham chiếu: 8 sản phẩm seed (giá đồng): the-everyday-blazer 1.290.000 (outerwear), nine-to-fine-shirt 590.000 (tops, `salesRank` 1), after-hours-dress 890.000 (dresses, chỉ `nu`, `compareAtPrice` 1.090.000), the-straight-trousers 690.000, off-duty-top 390.000, the-midi-skirt 650.000, weekend-shirt 550.000, city-vest 790.000. Mỗi sản phẩm 2 màu × 4 size; size XL `inventory` 0; S/M/L = 5 ở màu thứ nhất, 6 ở màu thứ hai. "T" = sản phẩm thử do test tạo thêm. AC ở BR Should (15, 16, 22) là Should.

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-CAT-01 | 01 | DB đã seed | Gọi chi tiết từng slug trong 8 slug | 200; `price` là số nguyên đúng bảng giá trên; `category`, `moments` (≥ 1), `genders` (≥ 1) hợp lệ; after-hours-dress có `compareAtPrice` 1.090.000 > `price`. |
| AC-CAT-02 | 01 | Ghi trực tiếp vào DB | Thêm sản phẩm với slug trùng / slug có chữ hoa / `price` 0 / `compareAtPrice` ≤ `price` / `moments` rỗng | Mỗi lần bị DB từ chối, 0 bản ghi mới. |
| AC-CAT-03 | 02 | T1 `DRAFT`, T2 `ARCHIVED` cùng khớp từ khoá "thu" | Gọi danh sách, tìm kiếm `q=thu`, lọc `ids` chứa T1, chi tiết T1 và T2 | T1, T2 không có trong `items` và không được tính vào `total`; chi tiết cả hai → 404 `not-found`. |
| AC-CAT-04 | 03 | DB đã seed | Đếm biến thể | 64 biến thể, 8 mỗi sản phẩm; `sku` không trùng; mọi `size` ∈ {S, M, L, XL}; mọi `hex` đúng dạng `#RRGGBB`. |
| AC-CAT-05 | 03 | Ghi trực tiếp vào DB | Thêm biến thể trùng (sản phẩm, màu, size) / `sku` trùng / `inventory` = -1 | Cả ba bị DB từ chối. |
| AC-CAT-06 | 04 | T có biến thể `inventory` 0, 1, 5, 6 | Gọi chi tiết T | `stockStatus` lần lượt `OUT_OF_STOCK`, `LOW_STOCK`, `LOW_STOCK`, `IN_STOCK`. |
| AC-CAT-07 | 04 | PDP the-everyday-blazer, màu Đen (S=5, XL=0), màu Xám (S=6) | Chọn Đen → size S; chọn Xám → size S; xem size XL | Đen S hiện "Chỉ còn 5"; Xám S không hiện; XL bị vô hiệu, nhãn "Size XL - hết hàng", không thêm được vào giỏ. |
| AC-CAT-08 | 05 | DB trống phần catalog | Chạy seed | 8 sản phẩm, 64 biến thể, 4 bảng size (tops, bottoms, dresses, outerwear), 0 đánh giá; tên, mô tả, `gallery`, `fit`, `care`, `looks` bằng với `products.ts`. |
| AC-CAT-09 | 05 | Đã seed; một biến thể bị hạ `inventory` xuống 2 bằng SQL | Chạy seed lần hai | Vẫn 8 sản phẩm, 64 biến thể; biến thể đó vẫn `inventory` 2; không bản ghi trùng. |
| AC-CAT-10 | 05 | Seed bị ngắt (mất kết nối) giữa chừng trên DB trống | Kiểm DB | Có 0 sản phẩm hoặc đủ 8, không ở giữa; chạy lại seed thành công. |
| AC-CAT-11 | 06 | DB đã seed | `gender=nam`; `gender=nu` | `nam`: không có after-hours-dress, mọi item có `nam`; `nu`: có after-hours-dress. |
| AC-CAT-12 | 06 | DB đã seed | `category=dresses`; truy cập `/shop/dresses` | Đúng 1 sản phẩm (after-hours-dress), `total` 1; trang `/shop/dresses` hiện đúng 1 thẻ và tiêu đề đúng danh mục. |
| AC-CAT-13 | 06 | DB đã seed | `moment=event`; truy cập `/shop-by-moment/event` | Mọi item có `event` trong `moments` (gồm after-hours-dress); không item nào thiếu `event`. |
| AC-CAT-14 | 06 | DB đã seed | `size=XL`; `size=XL&available=true`; `available=true` | `size=XL`: `total` 8; `size=XL&available=true`: `total` 0, `items: []`, FE hiện trạng thái rỗng (không phải lỗi); `available=true`: 8 (mỗi sản phẩm còn S/M/L). |
| AC-CAT-15 | 06 | DB đã seed | `maxPrice=589999`; `maxPrice=590000`; `maxPrice=500000`; `maxPrice=0` | 2 (390.000, 550.000); 3 (thêm nine-to-fine-shirt 590.000, mốc bằng được tính); 1 (off-duty-top); 8. |
| AC-CAT-16 | 06 | T có: Đen/S=0 và Trắng/S=3 | `color=Đen&size=S&available=true`; `color=Trắng&size=S&available=true` | Lần một **không** trả T (biến thể Đen/S hết hàng, dù T còn S ở màu khác); lần hai trả T. |
| AC-CAT-17 | 06 | DB đã seed | `category=xyz`; `maxPrice=-5`; `maxPrice=abc`; `maxPrice=1.5` | `category=xyz`: 200, `total` 0; ba trường hợp `maxPrice`: 422 `validation`, `field: maxPrice`. |
| AC-CAT-18 | 06 | Mở `/shop/nu?color=Đỏ&maxPrice=1000000&sort=price-asc` | Quan sát, tải lại, bấm Back sau khi đổi bộ lọc | Yêu cầu API mang đủ lọc `gender=nu`, `color=Đỏ`, `maxPrice`, `sort`; hiện "Đang lọc (3)" và đúng 2 sản phẩm theo thứ tự: off-duty-top (390.000), rồi after-hours-dress (890.000); `total` 2; tải lại giữ nguyên; Back về đúng trạng thái trước; "Xóa tất cả" về `/shop`. |
| AC-CAT-19 | 07 | DB đã seed | `sort=price-asc`; `sort=price-desc` | Asc: đầu off-duty-top 390.000, cuối the-everyday-blazer 1.290.000; Desc: ngược lại hoàn toàn. |
| AC-CAT-20 | 07 | DB đã seed; T1 và T2 cùng `price` | `sort=bestselling`; `sort=newest`; `sort=price-asc` | `bestselling`: đầu là nine-to-fine-shirt; `newest`: đầu là sản phẩm có `createdAt` lớn nhất; T1, T2 luôn theo `slug` tăng dần và gọi 2 lần ra cùng thứ tự. |
| AC-CAT-21 | 07 | DB đã seed | Không có `sort`; `sort=featured`; `sort=hot` | Hai lần đầu: thứ tự `displayOrder` (the-everyday-blazer đầu), giống nhau; `sort=hot`: 422 `validation`, `field: sort`. Mở `/shop?sort=hot` trên FE vẫn hiện danh sách `featured` (FE chuẩn hoá trước khi gọi). |
| AC-CAT-22 | 08 | DB đã seed | `sort=price-asc&limit=3` với `page=1,2,3` | Lần lượt 3, 3, 2 item; `total` luôn 8; ghép 8 item không trùng, không thiếu, đúng thứ tự giá tăng. |
| AC-CAT-23 | 08 | DB đã seed | `page=4&limit=3`; không tham số phân trang | `page=4`: 200, `items: []`, `total` 8; không tham số: 8 item (mặc định `limit` 24). |
| AC-CAT-24 | 08 | — | `limit=0`; `limit=49`; `page=0`; `page=1.5`; `limit=abc` | Mỗi lần 422 `validation` với `field` tương ứng (`limit` hoặc `page`); `limit=48` hợp lệ. |
| AC-CAT-25 | 09 | DB đã seed | Chi tiết với `The-Everyday-Blazer ` (chữ hoa, có khoảng trắng cuối) | 200; `slug` trả về `the-everyday-blazer`. Mở `/product/The-Everyday-Blazer` trên FE: URL đổi sang slug chuẩn, không thêm mục lịch sử (Back không quay lại URL chữ hoa). |
| AC-CAT-26 | 09 | — | Mở `/product/khong-co-san-pham` | API 404 `not-found`; FE hiện trang không tìm thấy sản phẩm có đường về `/shop`; không hiện "Không thể tải" hay nút thử lại. |
| AC-CAT-27 | 09 | — | Chi tiết với slug 300 ký tự; `../etc`; `a'b`; `%00` | Mỗi lần 404 `not-found`; không 500, không stack trace/SQL. |
| AC-CAT-28 | 09 | Đang mở PDP, ngắt mạng | Tải lại PDP | Trạng thái lỗi có nút thử lại (không phải trang không tìm thấy); bật mạng, bấm thử lại → PDP hiện đúng sản phẩm. |
| AC-CAT-29 | 10 | DB đã seed | Chi tiết từng sản phẩm | `gallery` ≥ 1 phần tử; `description`, `material`, `care`, `fit.summary`, `fit.model`, `looks` hiện diện; không trường nào `null`; trường thiếu là `""` hoặc `[]`. |
| AC-CAT-30 | 11 | PDP weekend-shirt hiện 550.000 ₫ | Đổi `price` trong DB thành 520.000, chờ 30 giây, tải lại PDP và PLP | Cả hai hiện 520.000 ₫; hạ một biến thể xuống `inventory` 0 thì size đó hiện "hết hàng" sau cùng khoảng thời gian. |
| AC-CAT-31 | 12 | DB đã seed | Gọi bảng size của 4 danh mục | Mỗi bảng 200, có `body`, `garment`, 2 mảng cột; mỗi mảng hàng đủ S, M, L, XL; giá trị bằng `SIZE_CHARTS`. |
| AC-CAT-32 | 12 | PDP; ngắt mạng; sau đó danh mục `shoes` | Bấm "Hướng dẫn chọn size"; gọi bảng size `shoes` | Mạng tắt: có thông báo lỗi, nút bấm lại được, bật mạng bấm lại mở được hộp thoại. `shoes`: 404 `not-found`. |
| AC-CAT-33 | 13 | DB đã seed | `q=BLAZER`; `q=blazer`; `q=%20%20blazer%20%20` | Ba lần cùng kết quả, `total` bằng nhau, đều có the-everyday-blazer. |
| AC-CAT-34 | 13 | DB đã seed | `q=dam`; `q=đầm`; `q=blazer everyday` | `dam` và `đầm` cùng kết quả, có after-hours-dress (`type` đầm); `blazer everyday` có the-everyday-blazer dù hai từ không liền kề. |
| AC-CAT-35 | 13 | DB đã seed | `q=%`; `q=_`; `q=\`; `q='`; `q=a'; DROP TABLE products;--` | Mỗi lần 200, `total` 0 (không khớp tất cả), không 500; bảng sản phẩm còn nguyên. |
| AC-CAT-36 | 13 | — | `q` rỗng; `q` toàn khoảng trắng; `q` đúng 100 ký tự; `q` 101 ký tự | Rỗng và khoảng trắng: như không có `q` (8 item); 100 ký tự: 200; 101 ký tự: 422 `validation`, `field: q`. |
| AC-CAT-37 | 13 | DB đã seed | `q=blazer&maxPrice=1000000`; `q=blazer&maxPrice=1300000&sort=price-asc&limit=1` | Lần một `total` 0 (blazer 1.290.000 vượt mốc); lần hai: the-everyday-blazer, `total` 1. |
| AC-CAT-38 | 13 | Mở `/search?q=zzzz` | Quan sát | Tiêu đề "Tìm kiếm.", trạng thái rỗng có đường xóa tìm kiếm / về `/shop`; không hiện lỗi; số kết quả "0". |
| AC-CAT-39 | 14 | Panel tìm kiếm mở | Gõ "bl" rồi dừng 250 ms | Đúng 1 yêu cầu có `q=bl&limit=5`; hiện ≤ 5 sản phẩm và "Xem tất cả (`total`)"; bấm → `/search?q=bl`. |
| AC-CAT-40 | 14 | Panel mở; kết nối chậm 2 giây; sau đó ngắt mạng | Gõ "bl" rồi ngay "blazer"; sau đó gõ thêm khi mất mạng | Chỉ kết quả "blazer" hiện, không bị "bl" ghi đè; mất mạng: trạng thái lỗi + nút thử lại, từ khoá còn nguyên; bật mạng bấm thử lại ra kết quả. |
| AC-CAT-41 | 15 | T tạo đủ 30 sản phẩm `ACTIVE`; PLP `/shop` (Should) | Quan sát; bấm "Xem thêm"; thử lại khi mất mạng | Ban đầu 24 thẻ, tiêu đề "30 sản phẩm", có "Xem thêm"; bấm → 30 thẻ không trùng, nút ẩn, URL không đổi. Mất mạng: 24 thẻ cũ còn, báo lỗi, bật mạng bấm lại được. Ở 8 sản phẩm seed không có nút. |
| AC-CAT-42 | 16 | Đã lưu yêu thích 3 sản phẩm, trong đó 1 sản phẩm T ở ngoài 24 đầu (Should) | Mở `/wishlist` | Hiện đủ 3 thẻ; gọi `ids` với 3 id; với 49 id → 422 `validation`; id không tồn tại hoặc `DRAFT` bị bỏ qua, không lỗi. |
| AC-CAT-43 | 17 | Cờ catalog = http | Mở PDP, PLP, kiểm Network và giao diện | `reviews` 200 `[]`; không có đánh giá mẫu (nhãn "mẫu"), không điểm sao trên thẻ, không form viết đánh giá, không "Báo khi có hàng" ở size hết hàng; không có yêu cầu tới `/stock-alerts` hay `/reviews/eligibility`. Cờ = mock: các phần này hiển thị như cũ. |
| AC-CAT-44 | 18 | Phiên của A bị thu hồi (AC-AUTH-69), A đang ở `/shop` | PLP gọi API; tải lại trang | Danh sách vẫn tải 200 (không 401); ở lại PLP, header chuyển sang khách, không chuyển hướng. Cookie `n2f_sid` và `n2f_asid` bị xoá/sai/hết hạn đều cho kết quả này. |
| AC-CAT-45 | 18 | Khách chưa đăng nhập | Xem PLP, PDP, tìm kiếm, bảng size | Đủ chức năng, không bị chuyển sang `/auth/login`; phản hồi không có trường thuộc về người dùng. |
| AC-CAT-46 | 18 | — | `POST /api/products`, `PUT /api/products/{slug}`, `DELETE /api/products/{slug}` | 404 hoặc 405; số sản phẩm và giá không đổi. |
| AC-CAT-47 | 19 | Một IP | Gửi 120 yêu cầu catalog trong 60 giây; gửi yêu cầu thứ 121 trong cùng khoảng; chờ hết `retryAfterSeconds` | 120 yêu cầu đầu: 200; yêu cầu 121: 429 `rate-limited` với `retryAfterSeconds` trong 1–60; PLP hiện trạng thái lỗi có thử lại; sau khoảng chờ: 200. Bộ đếm auth không bị ảnh hưởng. Duyệt tay 30 thao tác trong 1 phút không bị chặn. |
| AC-CAT-48 | 20 | — | Gây từng lỗi: `sort=hot`, `limit=0`, slug lạ, bảng size lạ, vượt tần suất, tắt DB | Mỗi loại có `code` riêng, ổn định (`validation` kèm `field`, `not-found`, `rate-limited`, lỗi máy chủ); không có stack trace, SQL, tên bảng trong phản hồi. |
| AC-CAT-49 | 20 | Đang xem `/shop/nu?color=Đỏ&sort=price-asc`, ngắt mạng | Tải lại; bật mạng; bấm "Thử lại" | Có trạng thái lỗi và nút thử lại; sau khi bấm, danh sách ra đúng theo bộ lọc trên URL (không bị reset). |
| AC-CAT-50 | 21 | Cờ catalog = http, `mode` = mock; đổi `price` the-straight-trousers trong DB thành 700.000 | Duyệt PLP → PDP, thêm vào giỏ, xem giỏ, đăng nhập bằng tài khoản thật | PLP/PDP hiện 700.000 ₫ (không còn 690.000 từ `products.ts`); thêm giỏ hoạt động bằng mock; đăng nhập thật vẫn chạy; không có yêu cầu `/api/cart`, `/api/orders`, `/api/account/...`. |
| AC-CAT-51 | 21 | Cờ catalog = mock | Chạy bộ test Playwright mock hiện có | Số test pass không giảm so với trước Slice 2; không có yêu cầu `/api/products`. |
| AC-CAT-52 | 22 | 100 sản phẩm T trên DB Supabase (Should) | Gọi danh sách mặc định và chi tiết 50 lần mỗi loại | p95 danh sách ≤ 500 ms; p95 chi tiết ≤ 300 ms, đo ở máy chủ. |
| AC-CAT-53 | 23 | DB Supabase đang ở schema Slice 1 và có dữ liệu `users`, `sessions` | Chạy `migrate deploy` hai lần | Lần một chỉ thêm đối tượng catalog; số dòng `users`, `sessions`, `auth_action_tokens` không đổi; file migration không chứa `DROP`, `TRUNCATE`, `DELETE`, đổi kiểu cột; lần hai không lỗi, không thay đổi. |

Tổng: 23 BR (20 Must, 3 Should; không đánh số BR cho mục Won't), 53 AC (50 Must, 3 Should: AC-CAT-41, 42, 52). Mục Won't: 8 hạng mục ở bảng phạm vi.

Sửa sau QA (2026-11-07, PO): AC-CAT-18 phần Then trước ghi "chỉ after-hours-dress", sai so với seed vì off-duty-top cũng có màu Đỏ và bán cho nữ (báo cáo QA m1). API đúng BR-CAT-06; chỉ chữ AC đổi.

### 6. Định nghĩa xong của Slice 2

- Mọi AC-CAT Must đạt trong `docs/qa/report-slice-2-catalog.md`; AC Should ghi rõ làm hay hoãn.
- AC hoãn từ Slice 1 được giao cho Slice 2: **AC-AUTH-69** kiểm bằng AC-CAT-44 (đây là slice đầu có API thật ở trang công khai). **AC-AUTH-68** vẫn hoãn sang slice Account vì Catalog không có trang đòi đăng nhập; Slice 2 chấp nhận bằng interceptor và test hiện có. AC-AUTH-75, 84, 85 → Admin; AC-AUTH-88 → Account; AC-AUTH-89, 95a, 95b, QA vòng 2 Slice 1 → trước go-live (xem backlog).
- `docs/api/openapi.yaml` có catalog (danh sách, chi tiết, bảng size, đánh giá `[]`) kèm mã lỗi `validation`, `not-found`, `rate-limited`.
- `docs/design/` có spec cho trạng thái mới: "Xem thêm" (Should), không tìm thấy sản phẩm, lỗi tải bảng size, khối đánh giá trống ở chế độ HTTP.
- FE chạy cờ catalog = http với BE thật trên Supabase; Cart/Checkout/Account vẫn mock; mock vẫn cùng interface; Playwright mock pass nguyên; không còn fixture `products.ts` hiển thị ở chế độ HTTP.
- Migration chỉ cộng thêm; quyết định ghi `docs/decisions.md`; bàn giao ghi `docs/handoff.md`.

### 7. Câu hỏi mở

| # | Câu hỏi | Ảnh hưởng | Cần ai / trạng thái |
| --- | --- | --- | --- |
| 1 | Nội dung catalog hiện là dữ liệu demo (`material` là "Thông tin chất liệu sẽ được cập nhật.", giá và phân Nam/Nữ "cần xác nhận kinh doanh", ảnh là placeholder). Chấp nhận dùng để nghiệm thu Slice 2 và chặn go-live đến khi có nội dung thật? **Đề xuất PO:** chấp nhận cho Slice 2; thêm vào backlog "Nội dung catalog thật" (Thắng cung cấp giá, chất liệu, ảnh; nhập bằng file seed cho đến khi có Admin). | BR-CAT-05, go-live | Thắng | **Thắng: đồng ý (2026-11-07).**
| 2 | Ở chế độ HTTP, ẩn đánh giá mẫu, điểm sao, form viết đánh giá và "Báo khi có hàng" (FE mất các phần này so với bản mock). **Đề xuất PO:** đồng ý ẩn; đánh giá thật làm sau Slice 3, "Báo khi có hàng" cùng slice thông báo. BR-CAT-17 **chờ xác nhận**. | BR-CAT-17, AC-CAT-43 | Thắng | **Thắng: đồng ý (2026-11-07).**

---

## Slice 3: Cart & Checkout

Nguồn chính: `docs/product/cart-checkout-business-rules.md` (Thắng, 2026-11-04; 69 quy tắc CART-01..16, CHK-01..13, CHK-VC-01..13, CHK-PAY-01..14, CHK-CF-01..13 và bảng tham số vận hành). Mỗi BR dưới đây ghi "nguồn" = mã gốc; con số giữ theo nguồn; chỗ chọn khác nguồn ghi ở mục 3 kèm lý do. Nguồn tham chiếu nhóm **COMMON-01..06 nhưng không có nội dung**: PO không suy diễn; chỗ phụ thuộc COMMON ghi "giả định tạm, chờ xác nhận" và gom vào câu hỏi 1. Bổ sung: master plan mục 14–18, 33, 34, 36; FE `features/{cart,checkout,orders,tracking}`, `mocks/mock-checkout-api.ts`, `core/store-policy.ts`, `CHECKOUT_API`; BE hiện có auth + catalog (`Product.price`, `ProductVariant.inventory_qty`), mailer `backend/src/mail/mailer.ts`; quyết định 2026-11-07 giữ voucher free-ship. Mã BR: `BR-CART` (giỏ), `BR-CHK` (checkout, vận chuyển, thanh toán, xác nhận), `BR-VOU` (voucher). Tên endpoint/trường do Backend chốt trong `openapi.yaml`. Tiền là số nguyên đồng; múi giờ Asia/Ho_Chi_Minh. AC kế thừa mức của BR.

### 1. Vấn đề và mục tiêu

**Vấn đề.** Giỏ và đặt hàng chỉ chạy mock: giá, tồn kho, voucher, phí vận chuyển tính trong trình duyệt; đơn không lưu ở máy chủ, không trừ tồn kho trong DB (backlog 2.14), khách không nhận xác nhận; checkout ở chế độ HTTP chặn đặt hàng ("Thanh toán hiện chưa khả dụng").

**Mục tiêu (theo 5 nguyên tắc chung của nguồn).**
1. Không bán quá số hàng có thật: tồn trừ khi tạo đơn, nguyên tử.
2. Khách thấy đúng số tiền sẽ trả trước khi bấm Đặt hàng; mọi thay đổi phải báo lại và khách bấm lại.
3. Lỗi không làm mất thông tin đã nhập và giỏ.
4. Một lần bấm, một đơn (bấm lại, mạng chập, F5).
5. Giá, voucher, phí ship, hạn mức COD là tham số máy chủ; thay đổi chỉ áp cho đơn mới.

**Không phải mục tiêu.** Đổi giao diện giỏ/checkout (giữ visual), cổng thẻ/ví, xử lý đơn phía shop (slice Admin).

### 2. Phạm vi

| Hạng mục | Mức | Nguồn | Lý do |
| --- | --- | --- | --- |
| Giỏ khách (trình duyệt) + giỏ thành viên (máy chủ), gộp khi đăng nhập, lưu 30 ngày | Must | CART-12..15 | Thắng đã chốt giỏ theo tài khoản. |
| Hạn mức 5/phiên bản, 20 sản phẩm/đơn, 30 dòng; làm tươi giá/tồn mỗi lần mở giỏ | Must | CART-02, 03, 09..11 | Chặn gom hàng, khách thấy giá đúng. |
| Báo giá máy chủ, phí 30.000 ₫, miễn phí từ 1.000.000 ₫, ngày giao dự kiến | Must | CHK-PAY-02, 03 | Không tin tổng từ trình duyệt. |
| Voucher: 1 mã giảm tiền + 1 mã free-ship, điều kiện, lượt, chống dò | Must | CHK-VC-01..07, 09..13 | Free-ship giữ (chốt 2026-11-07). |
| Đặt hàng COD: kiểm lại, trừ tồn nguyên tử, chống trùng, mã đơn, hạn mức COD | Must | CHK-CF-01..05, 07; CHK-PAY-05, 06 | Cốt lõi bán hàng thật. |
| Chuyển khoản QR tự đối soát, giữ đơn 30 phút | Must (chờ xác nhận) | CHK-PAY-01, 08..12 | Nguồn yêu cầu khi mở bán; cần dịch vụ đối soát thật (câu hỏi 2). |
| Địa giới 2 cấp sau 2025 | Must (phạm vi chờ xác nhận) | CHK-03 | Máy chủ phải kiểm địa chỉ (câu hỏi 3). |
| Trang đặt hàng thành công; tra cứu đơn khách bằng mã + email + OTP; huỷ đơn | Must | CHK-CF-05, 08, 09; CHK-PAY-11 | Khách không có tài khoản vẫn theo dõi được đơn. |
| Đơn của thành viên: danh sách, chi tiết, huỷ | Must | — | `/account/orders` đang đọc mock; đơn thật phải thấy được. |
| Email xác nhận / chờ thanh toán / đã nhận thanh toán / đã huỷ | Must | CHK-CF-10..12, phần CF-13 | Bằng chứng đặt hàng; mailer đã có. |
| Nháp checkout 24 giờ; hỏi lại khi đơn trùng trong 10 phút; Hoàn tác xoá dòng 5 giây; voucher theo danh mục / loại trừ hàng đang giảm; "Đặt lại đơn này" | Should | CHK-02, CHK-CF-06, CART-02, CHK-VC-01/02(7), CHK-PAY-12 | Có ích nhưng không chặn mua đúng; FE chưa có. |
| Sổ địa chỉ, tự điền/lưu địa chỉ ở checkout | Won't | CHK-07..09 | Slice Account (CRUD địa chỉ). |
| Ví voucher, mã theo hạng / theo khách cụ thể | Won't | CHK-VC-08, VC-02(4) phần hạng | Slice Account (hạng thành viên). |
| Gọi xác nhận COD, huỷ do không liên lạc, từ chối nhận, duyệt yêu cầu huỷ, bàn giao vận chuyển, email vận chuyển/giao | Won't | CHK-PAY-06 (phần vận hành), 07; CF-13 (phần còn lại) | Slice Admin. Slice 3 thử bằng SQL. |
| Thẻ/ví điện tử; xuất hoá đơn điện tử thật; cộng ngày cho xã đảo/vùng sâu; trả hàng/hoàn tiền | Won't | CHK-PAY-13, CHK-11, PAY-03, VC-13 phần trả hàng | Giai đoạn sau / chưa có dữ liệu đánh dấu xã / cần Admin. |

### 3. Hiện trạng FE, nguồn BR và hành vi được chọn

| # | Điểm | FE hiện tại | Nguồn | Chọn | Lý do |
| --- | --- | --- | --- | --- | --- |
| K1 | Giỏ khách vs thành viên | Một giỏ `localStorage` chung | CART-12 | Theo nguồn: khách lưu trình duyệt, thành viên lưu máy chủ | — |
| K2 | Gộp khi đăng nhập | Không có | CART-13 cộng, cắt theo hạn mức; vượt 30 dòng → Yêu thích | Theo nguồn; "Yêu thích" = danh sách yêu thích trên thiết bị (wishlist máy chủ là P1) | Không mất dòng. |
| K3 | Đăng xuất / hết phiên | BR-AUTH-32: không xoá giỏ | CART-15: đăng xuất thì giỏ biến khỏi thiết bị | Đăng xuất chủ động theo nguồn (thay BR-AUTH-32 phần đăng xuất; giỏ còn ở tài khoản). Hết phiên/bị thu hồi giữ BR-AUTH-32 (giỏ vẫn hiện) | Hết phiên không do khách chọn; AC-AUTH-68 đòi giỏ còn. |
| K4 | Chọn dòng | "Chế độ chọn": mặc định cả giỏ, chọn chỉ trong phiên | CART-07 ô tick mỗi dòng, dòng mới tick sẵn | **Khác nguồn về giao diện:** giữ chế độ chọn của FE; kết quả nghiệp vụ như nguồn (mặc định mọi dòng được tính; tạm tính, hạn mức, thanh free-ship và checkout chỉ theo dòng chọn) | Giữ visual (master plan 19–20). |
| K5 | Dòng hết hàng | `applyStock` xoá dòng hết | CART-10 giữ dòng mờ | Theo nguồn | Khách đổi size được. |
| K6 | Giá đổi | Bản chụp lúc thêm | CART-09, CF-03 | Theo nguồn; đặt hàng gửi giá/tổng đã thấy, lệch → không tạo đơn | **FE đổi contract.** |
| K7 | Voucher | 1 mã; 3 mã cứng; "Mã của bạn" mock | VC-01 1 mã giảm + 1 mã free-ship; VC-08 ví | 2 ô mã theo nguồn; ví Won't; seed `N2FWELCOME15` (đơn đầu tiên), `N2FFREESHIP`; `N2FBDAY100` không seed (cần ngày sinh, slice Account) | **FE đổi contract** (`voucherCodes`). |
| K8 | Làm tròn mã % | Làm tròn gần nhất 1.000 ₫ | VC-05 làm tròn xuống (COMMON-05.4) | Làm tròn **xuống** tới 1.000 ₫ (giả định tạm, câu hỏi 1) | COMMON-05 chưa có. |
| K9 | Email ở checkout | Không bắt buộc | CHK-04 bắt buộc với khách, ≤ 100 | Theo nguồn | Kênh xác nhận và tra cứu OTP. |
| K10 | Họ tên / SĐT / ghi chú | Tên ≥ 2; SĐT `0`/`+84` + 9 số; ghi chú không giới hạn | CHK-03 | Theo nguồn (2–50, đầu số 03/05/07/08/09, ghi chú ≤ 250) | — |
| K11 | Thanh toán | COD + QR mô phỏng (tiền về sau 15 giây) | CHK-PAY-01, 08..12 | COD Must; QR Must nhưng chờ dịch vụ đối soát (câu hỏi 2); chưa có thì ẩn ở HTTP | Không có webhook ngân hàng thì "tự xác nhận" là giả. |
| K12 | Hạn mức COD | Không có | CHK-PAY-05 | Theo nguồn; lịch sử "từ chối nhận" = 0 tới khi Admin ghi được | — |
| K13 | Trạng thái đơn | 12 trạng thái FE (`processing`, `pending-payment`...) | CHK-PAY-14, COMMON-01/02 (`to_pay`, `to_ship`...) | API/DB dùng tên COMMON; FE mapper đổi sang `OrderStatus` hiện có (bảng BR-CHK-22). Chờ xác nhận nội dung COMMON-01 | Master plan 34 tách DTO khỏi domain. |
| K14 | Huỷ ở `to_ship` | Khách huỷ thẳng (quyết định 2026-10-18) | PAY-14: `cancel_requested`, shop duyệt | Chờ câu hỏi 4; đề xuất huỷ thẳng tới khi có Admin | Chưa có ai duyệt yêu cầu. |
| K15 | Mã đơn | `N2F` + YYMMDD + 3 số từ mili giây | CF-07 | Theo nguồn (4 số ngẫu nhiên, không trùng trong ngày) | — |
| K16 | Tra cứu khách | Mã + SĐT/email, không OTP | CF-08 mã + email + OTP | Theo nguồn (FE thêm bước OTP); thông số OTP theo BR-AUTH-04..09 (giả định tạm vì COMMON-06.5 chưa có) | Mã 4 số đoán được, OTP chặn xem trộm. |
| K17 | Trang thành công sau F5 / Back | Biên nhận trong bộ nhớ; F5 mất | CF-05 Back/F5 về đơn vừa đặt | Lưu biên nhận trong `sessionStorage` của tab; Back không mở lại form đặt | Không cần API công khai đọc đơn. |
| K18 | Email | Không gửi | CF-10..13 | Theo nguồn phần xác nhận, chờ thanh toán, đã nhận tiền, đã huỷ; email vận chuyển → Admin | — |
| K19 | Mã lỗi | Map theo HTTP status (422 → `invalid-address`) | — | Map theo `code` trong body | 422 có nhiều nghĩa. **FE đổi adapter.** |
| K20 | Đơn thành viên | `ACCOUNT_API` mock | — | Phần đơn hàng theo cờ checkout, gọi API thật; phần còn lại Account vẫn mock | **FE tách adapter.** |
| K21 | Điền sẵn thành viên | Profile/địa chỉ/voucher từ Account mock | CHK-04, 07 | Ở HTTP: họ tên, email lấy từ phiên; ẩn địa chỉ đã lưu và "Mã của bạn" | Account mock không có dữ liệu user thật. |
| K22 | Cờ cấu hình | `mode`, `authMode`, `catalogMode`; chặn đặt khi không mock | — | Thêm `checkoutMode`; bỏ chặn khi = http | Bật độc lập như Slice 2. |
| K23 | Id cũ trong giỏ (`01-0-S`) | — | CART-10 ngừng kinh doanh | Hiện "Sản phẩm không còn kinh doanh", chỉ còn nút Xoá | Không viết mã tương thích. |
| K24 | Tồn kho (backlog 2.14) | `MockInventory` trong bộ nhớ | Nguyên tắc 1, CART-04, CF-04 | Trừ `inventory_qty` khi tạo đơn (kể cả đơn chờ chuyển khoản) = "hàng đang giữ"; `inventory` hiển thị = tồn khả dụng; hoàn khi huỷ | Không cần bảng giữ chỗ riêng. |

### 4. Business Rules

#### 4.1 Tham số vận hành (nguồn: bảng tham số)

Lưu ở máy chủ, đổi bằng SQL cho tới khi có Cài đặt cửa hàng ở slice Admin; đổi chỉ áp cho đơn mới: tối đa **5** mỗi phiên bản/đơn; **20** sản phẩm/đơn; **30** dòng/giỏ; giỏ lưu **30 ngày** từ lần sửa cuối; phí giao **30.000 ₫** toàn quốc; miễn phí khi tiền hàng ≥ **1.000.000 ₫**; giao **2–4 ngày làm việc**; COD khi tổng ≤ **5.000.000 ₫**; giữ đơn chuyển khoản **30 phút**; **1** mã giảm tiền + **1** mã free-ship mỗi đơn; hoàn tiền **1–3 ngày làm việc**; múi giờ GMT+7.

#### 4.2 Giỏ hàng

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-CART-01 | Must | CART-01 | Mỗi dòng là một phiên bản (sản phẩm + màu + size). Chỉ thêm khi đã chọn đủ màu và size; thêm lại phiên bản đã có thì cộng vào dòng cũ (cắt theo BR-CART-02). |
| BR-CART-02 | Must | CART-02 | Số lượng mỗi dòng 1 đến min(5, tồn khả dụng). Giảm dưới 1 = xoá dòng. Chạm mức: khoá nút cộng và báo "Chỉ còn N sản phẩm cho màu, size này." (do tồn) hoặc "Mỗi đơn mua tối đa 5 sản phẩm cùng màu, size. Cần mua số lượng lớn, vui lòng gọi hotline." (do hạn mức). |
| BR-CART-03 | Must | CART-03 | Giỏ tối đa 30 dòng; thêm dòng 31 bị chặn, báo "Giỏ hàng tối đa 30 sản phẩm khác nhau." (câu PO đề xuất, nguồn không ghi chữ). Mỗi đơn tối đa 20 sản phẩm tính trên dòng được chọn; vượt thì khoá Thanh toán, báo "Mỗi đơn tối đa 20 sản phẩm." (câu PO). Máy chủ kiểm lại cả hai mức khi báo giá/đặt (422 `validation`). |
| BR-CART-04 | Must | CART-04 | Giỏ không giữ hàng, không trừ tồn. Hai khách cùng có món cuối trong giỏ: ai tạo đơn trước có hàng (BR-CHK-14). |
| BR-CART-05 | Must | CART-05, 06 | Chỉ đổi màu/size trong cùng sản phẩm; phiên bản hết hàng bị khoá trong bộ chọn; giá theo phiên bản mới. Đổi sang phiên bản đã có dòng riêng: gộp, số lượng = tổng hai dòng cắt theo BR-CART-02; dòng gộp được chọn nếu một trong hai dòng đang chọn; báo "Đã gộp với sản phẩm cùng màu, size có sẵn trong giỏ.", bị cắt thì thêm "Số lượng được điều chỉnh còn N." |
| BR-CART-06 | Must | CART-07 (khác giao diện, K4) | Mặc định mọi dòng được tính; khách chọn một phần bằng chế độ chọn hiện có. Tạm tính, hạn mức BR-CART-03, thanh free-ship chỉ tính trên dòng được chọn, và chỉ các dòng này sang checkout. Không dòng nào được chọn → khoá Thanh toán. |
| BR-CART-07 | Must | CART-08 | Đặt đơn thành công chỉ xoá khỏi giỏ các dòng đã mua. |
| BR-CART-08 | Must | CART-09..11 | Mỗi lần mở giỏ/checkout và sau mỗi thay đổi (chờ 300 ms sau thao tác cuối, đề xuất PO), lấy lại giá, tồn, trạng thái bán từ máy chủ. Giá đổi: tính giá mới, hiện "Giá đã thay đổi từ X₫ thành Y₫". Tồn < số đã chọn: tự giảm về số còn lại và báo "Chỉ còn N sản phẩm cho màu, size này.". Hết hàng: dòng mờ "Đã hết hàng", bỏ chọn, không chọn lại được, vẫn giữ trong giỏ. Ngừng kinh doanh (không `ACTIVE`, id không tồn tại): "Sản phẩm không còn kinh doanh", chỉ còn nút Xoá. Có dòng đổi giá/tình trạng: đầu giỏ báo "Một số sản phẩm đã thay đổi giá hoặc tình trạng hàng. Vui lòng kiểm tra trước khi thanh toán.". Lỗi mạng/5xx/429: hiện bản lưu, báo "Chưa cập nhật được giá mới nhất" (câu PO) + nút Thử lại, khoá Thanh toán. |
| BR-CART-09 | Must | CART-12 | Khách: giỏ lưu trên trình duyệt. Thành viên: giỏ lưu máy chủ theo tài khoản, giống nhau trên mọi thiết bị (thấy thay đổi ở lần tải trang kế tiếp). Cả hai tự xoá sau 30 ngày kể từ lần sửa cuối. Khách chưa đăng nhập không gọi API giỏ. |
| BR-CART-10 | Must | CART-13 | Đăng nhập/đăng ký khi đang có giỏ khách: gộp vào giỏ tài khoản, không ghi đè. Cùng phiên bản → cộng số lượng, cắt theo BR-CART-02; khác → thêm dòng. Chỉ các dòng vừa mang sang được chọn. Vượt 30 dòng → các dòng sửa lâu nhất chuyển vào Yêu thích trên thiết bị (không mất). Báo một lần "Đã thêm N sản phẩm từ giỏ hàng trước khi đăng nhập.". Dòng ngừng kinh doanh không mang sang. Gộp lỗi mạng: giữ giỏ khách, thử lại ở lần tải trang kế tiếp, không nhân đôi. |
| BR-CART-11 | Must | CART-14 | Đăng nhập ngay tại checkout: chỉ các dòng khách đã chọn trước khi đăng nhập sang checkout; không tự thêm dòng cũ của tài khoản. |
| BR-CART-12 | Must | CART-15 (+ BR-AUTH-32, K3) | Đăng xuất chủ động: giỏ không còn hiện trên thiết bị (vẫn ở tài khoản), giỏ khách mới rỗng. Hết phiên/bị thu hồi: giỏ trên thiết bị vẫn hiện; đăng nhập lại cùng tài khoản → giỏ = giỏ tài khoản + phần khách thêm sau khi hết phiên (không nhân đôi phần đã có). |
| BR-CART-13 | Must | CART-16 | Giỏ chỉ hiện Tạm tính (giá sau khuyến mãi, đã gồm VAT) và thanh "Mua thêm X₫ để được miễn phí giao hàng" (X = ngưỡng − tạm tính dòng chọn, ngưỡng lấy từ máy chủ) hoặc "Đơn được miễn phí giao hàng" (câu PO). Voucher, phí giao, tổng chỉ ở checkout. |
| BR-CART-14 | Should | CART-02 | Xoá dòng có "Hoàn tác" trong 5 giây; bấm thì dòng trở lại đúng số lượng và trạng thái chọn. |

#### 4.3 Thông tin người nhận

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-CHK-01 | Must | CHK-01 | Checkout một trang: Liên hệ → Địa chỉ → Vận chuyển → Thanh toán, tóm tắt đơn luôn hiện. Chỉ nhận dòng được chọn ở giỏ; không có dòng → về `/cart`. |
| BR-CHK-02 | Must | CHK-02 | Không bắt buộc đăng nhập. Đăng nhập giữa chừng giữ thông tin đã nhập. Cookie phiên sai/thu hồi/hết hạn lúc đặt: không 401, đơn tạo như đơn khách. Phiên staff/admin không gắn đơn. |
| BR-CHK-03 | Should | CHK-02 | Lưu nháp thông tin đang nhập trên thiết bị 24 giờ; xoá khi đặt thành công hoặc đăng xuất. |
| BR-CHK-04 | Must | CHK-03, 06 | Bỏ khoảng trắng hai đầu trước khi kiểm. Họ tên người nhận 2–50 ký tự, có ít nhất 1 chữ cái. SĐT người nhận: di động 10 số đầu 03/05/07/08/09, nhận dạng `+84` (lưu `0xxxxxxxxx`). Địa chỉ cụ thể 5–200 ký tự. Ghi chú không bắt buộc, ≤ 250 ký tự, chỉ cho shipper. Tên, SĐT là của người nhận; email là của người đặt. |
| BR-CHK-05 | Must | CHK-04, 05 | Email bắt buộc với khách, ≤ 100 ký tự, đúng dạng, lưu chữ thường. Thành viên được điền sẵn email tài khoản, sửa được. Khách nhập email đã có tài khoản: vẫn đặt được, gợi ý đăng nhập; đơn không tự gắn vào tài khoản đó. |
| BR-CHK-06 | Must (phạm vi chờ xác nhận) | CHK-03, CHK-10, PAY-02 | Tỉnh/Thành và Phường/Xã chọn từ danh mục 2 cấp sau sáp nhập 2025 do máy chủ cung cấp (công khai); đổi tỉnh xoá phường. Máy chủ kiểm `wardCode` thuộc `provinceCode`, sai → 422 `invalid-address`. Đổi địa chỉ thì phí giao, ngày giao, điều kiện COD tính lại ngay. Chưa có địa chỉ: "Phí giao hàng: tính sau khi nhập địa chỉ". Phạm vi danh mục theo câu hỏi 3. |
| BR-CHK-07 | Must | CHK-11 | Mặc định hoá đơn cá nhân. Chọn "Xuất hóa đơn công ty" thì bắt buộc tên công ty (2–200 ký tự, đề xuất PO), mã số thuế (10 số hoặc 10 số + `-` + 3 số), địa chỉ (5–200), email nhận hoá đơn; không sửa sau khi đặt. Slice 3 chỉ lưu; xuất hoá đơn điện tử thật là Won't. |
| BR-CHK-08 | Must | CHK-12 | Ô đồng ý Điều khoản mua bán, Chính sách đổi trả, Chính sách bảo mật không tick sẵn; chưa tick → không đặt được (máy chủ 422 `validation`, `field: acceptedTerms`); lưu thời điểm đồng ý. |
| BR-CHK-09 | Must | CHK-13 | Lỗi hiện dưới trường khi rời trường; bấm Đặt hàng khi còn lỗi → cuộn tới trường lỗi đầu tiên. Máy chủ kiểm lại mọi trường, sai → 422 `validation` kèm `field`, FE hiện tại đúng ô. |

#### 4.4 Voucher

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-VOU-01 | Must | CHK-VC-01 | Mỗi đơn tối đa 1 mã giảm tiền hàng (% hoặc số tiền) và 1 mã miễn phí giao hàng. Áp mã giảm thứ hai thay mã giảm cũ; áp mã free-ship thứ hai thay mã free-ship cũ. Voucher cộng dồn với giá khuyến mãi trên sản phẩm (trừ BR-VOU-13). |
| BR-VOU-02 | Must | CHK-VC-01, 02, 05 | Thuộc tính mã: `code` (A–Z, 0–9, 4–20 ký tự, duy nhất, so không phân biệt hoa thường); loại `percent` (1–90 %, tuỳ chọn mức giảm tối đa) / `fixed` (số tiền > 0) / `free-shipping`; đơn tối thiểu; bật/tắt; `startsAt`–`endsAt` giờ Việt Nam; tổng lượt (trống = không giới hạn); lượt mỗi khách (mặc định 1); chỉ thành viên (có/không); chỉ đơn đầu tiên (có/không). Seed (đề xuất PO): `N2FWELCOME15` percent 15, đơn đầu tiên, tối thiểu 100.000; `N2FFREESHIP` free-shipping, tối thiểu 300.000; cả hai công khai, hiệu lực tới 31/12/2027 23:59:59, không giới hạn tổng, 1 lượt/khách. |
| BR-VOU-03 | Must | CHK-VC-02 | Kiểm theo thứ tự, dừng ở điều kiện đầu tiên không đạt: (1) mã tồn tại; (2) đang bật và trong hiệu lực; (3) còn lượt chung (lượt đang giữ cho đơn chờ thanh toán tính là đã dùng); (4) mã "chỉ thành viên" cần đăng nhập; (5) khách còn lượt riêng — khách = tài khoản, hoặc với khách vãng lai: SĐT **hoặc** email trùng là cùng khách; (6) mã đơn đầu tiên chỉ cho khách chưa có đơn còn hiệu lực (đơn không ở `cancelled`); (7) danh mục / hàng đang giảm (Should, BR-VOU-13); (8) tiền hàng đủ điều kiện ≥ mức tối thiểu (bằng là đạt); (9) mã free-ship chỉ áp khi đơn đang phải trả phí giao. |
| BR-VOU-04 | Must | CHK-VC-03 | Lý do hiện ngay dưới ô nhập, giữ nguyên mã khách gõ; mỗi lý do một câu, đúng chữ: "Mã giảm giá không tồn tại." / "Mã này áp dụng từ {ngày giờ}." / "Mã giảm giá đã hết hạn." / "Mã giảm giá đã hết lượt sử dụng." / "Đăng nhập để dùng mã này." / "Bạn đã dùng mã này đủ số lần cho phép." / "Mã chỉ áp dụng cho đơn hàng đầu tiên." / "Mua thêm {X}₫ để dùng mã này (đơn tối thiểu {Y}₫)." / "Đơn của bạn đã được miễn phí giao hàng." (thêm "Mã chỉ áp dụng cho {danh mục}." / "Mã không áp dụng cho sản phẩm đang giảm giá." khi làm BR-VOU-13). Máy chủ trả mã lý do ổn định; FE ghép câu. Mã bị từ chối không tính lượt. |
| BR-VOU-05 | Must | CHK-VC-04, 05; PAY-02 | Tổng thanh toán = Tạm tính − Giảm giá + Phí vận chuyển. Mã free-ship đưa phí vận chuyển về 0, không tạo dòng giảm giá (API vẫn trả `shippingFee` và `shippingDiscount` như model FE). Ngưỡng miễn phí xét trên tiền hàng trước voucher. Mã %: tính trên tiền hàng đủ điều kiện, làm tròn xuống tới 1.000 ₫ (giả định tạm, K8), không vượt mức giảm tối đa. Mã số tiền: không vượt tiền hàng đủ điều kiện. Tiền hàng sau giảm không âm. |
| BR-VOU-06 | Must | CHK-VC-06 | Số tiền giảm chia cho từng dòng theo tỷ lệ giá trị dòng, làm tròn xuống tới đồng, phần dư cộng vào dòng giá trị lớn nhất (giá × số lượng; hoà thì dòng có mã biến thể nhỏ nhất; đề xuất PO, khớp BE `allocateByWeight`); phần dư = 0 thì không dòng nào được cộng thêm; tổng phần chia = Giảm giá; lưu trên đơn. |
| BR-VOU-07 | Must | CHK-VC-07 | Tóm tắt đơn hiện: Tạm tính; Giảm giá kèm tên mã (dạng -58.000₫); Phí vận chuyển hoặc "Miễn phí" kèm lý do (đơn từ 1.000.000₫ / mã free-ship); Tổng thanh toán. |
| BR-VOU-08 | Must | CHK-VC-09 | Mã đã áp được kiểm lại khi đơn thay đổi (số lượng, dòng chọn, địa chỉ, đăng nhập/đăng xuất); không còn đủ điều kiện → gỡ mã, tính lại tổng, báo lý do (BR-VOU-04). |
| BR-VOU-09 | Must | CHK-VC-10 | Nhập mã không tồn tại 10 lần trong 15 phút (theo IP) → khoá kiểm mã 15 phút: 429 `rate-limited` kèm `retryAfterSeconds`; FE khoá ô nhập, báo "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút." (câu PO). |
| BR-VOU-10 | Must | CHK-VC-11 | Kiểm lại mã lúc bấm Đặt hàng, không ân hạn. Mã hết hạn, hết lượt, bị tắt giữa chừng (kể cả hai khách giành lượt cuối): không tạo đơn, gỡ mã, trả 409 `voucher-changed` kèm báo giá mới; FE báo "Mã X vừa hết hiệu lực. Tổng thanh toán mới là Y₫. Bấm Đặt hàng để tiếp tục.", giữ thông tin đã nhập. |
| BR-VOU-11 | Must | CHK-VC-12 | Đơn tạo trước giờ mã hết hạn giữ nguyên giảm giá, kể cả khi khách chuyển khoản sau giờ đó trong thời gian giữ đơn. |
| BR-VOU-12 | Must | CHK-VC-13 | Lượt bị trừ khi tạo đơn (kể cả đơn chờ chuyển khoản), trong cùng giao dịch tạo đơn; đồng thời không vượt tổng lượt. Đơn huỷ trước khi giao → trả lượt nếu mã còn hạn; mã đã hết hạn thì không trả. Trả hàng sau giao không trả lượt (slice sau). |
| BR-VOU-13 | Should | CHK-VC-01, 02(7) | Mã giới hạn theo danh mục và tuỳ chọn "Không áp dụng cho sản phẩm đang giảm giá" (sản phẩm có `compareAtPrice` > `price`); tiền hàng đủ điều kiện chỉ tính các dòng hợp lệ. |

#### 4.5 Vận chuyển, đặt hàng, tồn kho

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-CHK-10 | Must | CHK-PAY-02 | Phí giao 30.000 ₫ mọi tỉnh; miễn phí khi tiền hàng (dòng chọn, trước voucher) ≥ 1.000.000 ₫. Báo giá máy chủ trả tạm tính, giảm giá, phí, giảm phí, tổng, ngưỡng; giá gửi từ trình duyệt bị bỏ qua. |
| BR-CHK-11 | Must | CHK-PAY-03 | Ngày giao dự kiến = khoảng 2–4 ngày làm việc tính từ khi đơn vào `to_ship`; không tính Chủ nhật và ngày lễ, Tết (danh sách ngày nghỉ là tham số máy chủ, seed lễ chính thức 2026–2027); vào `to_ship` sau 16:00 thì đếm từ ngày làm việc kế tiếp. Trước khi đặt, hiển thị theo giả định vào `to_ship` ngay lúc đó. Xã đảo/vùng sâu: Won't. |
| BR-CHK-12 | Must | CHK-CF-01, 03 | Bấm Đặt hàng: máy chủ kiểm lại một lần còn bán, tồn, giá, voucher, phí giao, điều kiện phương thức thanh toán, địa chỉ, hạn mức BR-CART-02/03. Yêu cầu mang đơn giá từng dòng, phí giao và tổng khách đang thấy; có số khác (kể cả giảm) → 409 `price-changed` kèm báo giá mới, không tạo đơn; FE hiện số cũ, số mới, tổng mới và "Giá một số sản phẩm vừa thay đổi. Vui lòng xem lại tổng thanh toán và bấm Đặt hàng để xác nhận.", giữ thông tin. |
| BR-CHK-13 | Must | CHK-CF-02 | Thiếu hàng ở bất kỳ dòng nào → không tạo đơn, không tạo đơn thiếu; 409 `stock-changed` kèm mọi dòng `{variantId, available}`; FE đánh dấu "Chỉ còn N sản phẩm" / "Đã hết hàng" và nút "Cập nhật theo số còn lại". |
| BR-CHK-14 | Must | CHK-CF-04, CART-04, nguyên tắc 1, backlog 2.14 | Tạo đơn, trừ `inventory_qty` mọi dòng, trừ lượt voucher nằm trong **một** giao dịch; dòng chỉ trừ khi còn đủ; tồn không bao giờ âm kể cả khi đồng thời; người sau nhận BR-CHK-13. Huỷ/hết hạn cộng lại đúng số đã trừ, đúng một lần. Tồn mới hiện ở PLP/PDP theo BR-CAT-11. |
| BR-CHK-15 | Must | CHK-CF-05 | Nút Đặt hàng khoá tới khi có kết quả. Mỗi lượt checkout có một khoá `Idempotency-Key` (16–64 ký tự `A-Za-z0-9-`; thiếu/sai → 422); gửi lại cùng khoá + cùng nội dung trong 24 giờ trả đúng đơn đã tạo (không trừ kho, không trừ lượt, không gửi thư lần nữa); cùng khoá khác nội dung → 409 `idempotency-conflict`; hai yêu cầu cùng khoá đồng thời → 1 đơn. Mất kết nối: không tự gửi lại, hiện nút Thử lại dùng cùng khoá. Sau khi đặt, Back hoặc F5 về trang đơn vừa đặt (K17), không mở lại form. |
| BR-CHK-16 | Should | CHK-CF-06 | Cùng SĐT đặt đơn thứ hai giống hệt sản phẩm và số lượng trong 10 phút: máy chủ trả 409 `possible-duplicate` (kèm mã đơn trước), FE hỏi lại; khách xác nhận thì tạo đơn. |
| BR-CHK-17 | Must | CHK-CF-07 | Mã đơn = `N2F` + YYMMDD (ngày đặt, giờ Việt Nam) + 4 chữ số ngẫu nhiên không trùng trong ngày (vd. `N2F2611040427`); không đổi, không tái sử dụng; tra cứu không phân biệt hoa thường, có hoặc không dấu `#`. |
| BR-CHK-18 | Must | CHK-CF-04 | Đơn chốt bản chụp từng dòng (slug, tên, màu, size, SKU, đơn giá, giá gốc, `mediaId`, số lượng, phần giảm đã chia), tạm tính, giảm giá kèm mã, phí giao, tổng, người nhận, địa chỉ (tên tỉnh/phường), ghi chú, phương thức, hoá đơn; đổi giá/cấu hình sau đó không đổi đơn. |

#### 4.6 Thanh toán và trạng thái

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-CHK-19 | Must | CHK-PAY-01, 05 | Phương thức: COD và chuyển khoản QR (QR theo BR-CHK-21). COD dùng được khi tổng ≤ 5.000.000 ₫, SĐT không có ≥ 2 đơn COD bị từ chối nhận trong 6 tháng và không đang có 3 đơn COD chưa giao. Phương thức không dùng được vẫn hiện, bị khoá kèm lý do. Mặc định chọn COD nếu đủ điều kiện; tổng đổi làm COD không còn hợp lệ → tự chuyển sang chuyển khoản và báo khách. Máy chủ kiểm lại (422 `validation`, `field: paymentMethod`). |
| BR-CHK-20 | Must | CHK-PAY-06, 14 | Đơn COD tạo ở `to_ship` + thanh toán `pending`. Trang thành công và email ghi "nine2fine sẽ gọi xác nhận trong 2 giờ làm việc" trừ thành viên đã có ≥ 1 đơn `completed` và đơn này < 1.000.000 ₫. Gọi xác nhận và huỷ do không liên lạc được làm ở slice Admin. |
| BR-CHK-21 | Must (chờ xác nhận, câu hỏi 2) | CHK-PAY-08..12, CF-12 | Chuyển khoản QR: đơn vào `to_pay` + `pending`; trang thanh toán có QR, số tiền chính xác, nội dung = mã đơn, đếm ngược 30 phút, không gia hạn; hàng và lượt voucher được giữ. Mở lại trang từ email, tra cứu đơn hoặc Đơn hàng của tôi (chỉ chủ đơn hoặc khách đã xác minh OTP). Nhận đủ tiền (dịch vụ đối soát báo) → `paid`, `to_pay` → `to_ship`, email "Đã nhận thanh toán". Thiếu: báo số còn thiếu; hết giờ vẫn thiếu → huỷ, hoàn số đã chuyển. Thừa: xác nhận bình thường, hoàn phần thừa. Tiền về sau khi huỷ: không khôi phục, hoàn 100%. Hoàn trong 1–3 ngày làm việc (kế toán làm tay). Hết 30 phút chưa đủ tiền → `cancelled`, hoàn kho, trả lượt, email báo huỷ, trong ≤ 2 phút sau hạn (đề xuất PO). Chưa có dịch vụ đối soát: ẩn QR ở HTTP. |
| BR-CHK-22 | Must (tên trạng thái chờ xác nhận, câu hỏi 1) | CHK-PAY-14, COMMON-01/02 | Trạng thái đơn và thanh toán là hai trường riêng. Ánh xạ sang FE: `to_pay` → `pending-payment`; `to_ship` → `processing`; `to_receive` → `shipping`/`delivering`; `completed` → `completed`; `cancel_requested` → (FE chưa có, thêm khi làm); `cancelled` → `cancelled`. Thanh toán: `pending`, `paid`, `failed`, `refunded`, `partially_refunded`. Slice 3 chỉ phát sinh: COD `to_ship`+`pending`; QR `to_pay`+`pending` → `to_ship`+`paid` hoặc `cancelled`; huỷ → `cancelled`. Mọi chuyển khác qua slice Admin (thử bằng SQL). Mỗi lần đổi lưu thời điểm và người đổi (`customer`/`shop`/`system`); DB từ chối giá trị ngoài tập. |
| BR-CHK-23 | Must (phần `to_ship` đã xác nhận 2026-11-08: Slice 3 huỷ thẳng, từ Slice 4 gửi yêu cầu) | CHK-PAY-11, 14 | Ở `to_pay` khách tự huỷ bất kỳ lúc nào, không cần duyệt. Ở `to_ship`: đề xuất PO huỷ thẳng như FE hiện tại cho tới khi có Admin. Khác → 409 `not-cancellable`. Huỷ: `cancelled`, `cancelledBy = customer`, hoàn kho và trả lượt (BR-VOU-12) trong cùng giao dịch, gửi email "đơn đã huỷ". Huỷ lần hai → 409, không hoàn thêm. Không đổi phương thức thanh toán trên đơn đã tạo. **Từ Slice 4 (Thắng xác nhận 2026-11-08, Q1 của Slice 4):** khách ở `to_ship` chỉ gửi yêu cầu huỷ (`cancel_requested`, BR-ADM-29); phần `to_pay` giữ nguyên. |
| BR-CHK-24 | Should | CHK-PAY-11, 12 | "Đặt lại đơn này" ở đơn đã huỷ: đưa sản phẩm về giỏ, điền sẵn thông tin giao hàng; giá, tồn, voucher tính lại như đơn mới. |

#### 4.7 Xác nhận, theo dõi, thông báo

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-CHK-25 | Must | CHK-CF-09 | Trang thành công hiện mã đơn, tổng thanh toán, phương thức, ngày giao dự kiến, email đã nhận xác nhận, "Theo dõi đơn hàng" (thành viên → `/account/orders/:id`; khách → `/track-order` điền sẵn mã) và "Tiếp tục mua sắm"; câu gọi xác nhận theo BR-CHK-20. Khách vãng lai được mời tạo tài khoản; đơn vừa đặt không tự gắn vào tài khoản mới. |
| BR-CHK-26 | Must | CHK-CF-08 (+ COMMON-06.5 chờ) | Chỉ có mã đơn thì không xem được đơn. Khách tra cứu bằng mã đơn + email đặt hàng: máy chủ luôn trả cùng phản hồi "đã gửi mã" và chỉ gửi OTP khi khớp; nhập OTP đúng → xem chi tiết, huỷ, mở trang thanh toán của đơn đó trong 30 phút (đề xuất PO). Sai mã đơn/email/OTP → "Không tìm thấy đơn hàng phù hợp". Thông số OTP (độ dài, hạn, gửi lại, khoá sai) dùng như BR-AUTH-04..09 (giả định tạm). Mã, email, OTP gửi trong body, không đặt vào URL; phản hồi không có `userId`. |
| BR-CHK-27 | Must | — (AC-AUTH-68) | Thành viên xem danh sách đơn của mình (mới nhất trước, 10 đơn mỗi lần "Xem thêm"), chi tiết, huỷ. Phiên hỏng → 401 `unauthenticated`, FE chuyển `/auth/login?returnUrl=…` với "Phiên đăng nhập đã hết hạn…", giỏ còn nguyên. Đơn người khác hoặc không tồn tại → 404. Đơn khách trùng email/SĐT không tự gắn. |
| BR-CHK-28 | Must | CHK-CF-10..12 | Gửi email trong 5 phút sau khi tạo đơn; lỗi thì thử lại tối đa 3 lần; vẫn lỗi → báo CSKH qua email hỗ trợ (phthang0872@gmail.com, chốt 2026-11-07); đơn không bao giờ bị huỷ vì email lỗi; log không chứa email đầy đủ. Tiêu đề "nine2fine – Xác nhận đơn hàng #{mã}" / "nine2fine – Đơn #{mã} đang chờ thanh toán". Nội dung: mã và trạng thái; sản phẩm (ảnh, tên, màu, size, số lượng, đơn giá); tạm tính, giảm giá kèm mã, phí giao, tổng; phương thức; người nhận, SĐT, địa chỉ; ngày giao dự kiến; hoá đơn công ty nếu có; nút tra cứu/xem đơn; cách huỷ và link chính sách đổi trả; hotline CSKH. Email chờ thanh toán thêm số tiền, hạn, nút "Thanh toán ngay", không in số tài khoản. Mọi email có câu: "nine2fine không yêu cầu chuyển khoản ngoài trang thanh toán của đơn và không hỏi mật khẩu hay mã OTP." |
| BR-CHK-29 | Must | CHK-CF-13 (phần Slice 3) | Gửi 1 email cho mỗi sự kiện: đơn đã huỷ (kèm lý do, thông tin hoàn tiền nếu đã trả); đã nhận thanh toán (khi có QR). Email yêu cầu huỷ, bàn giao vận chuyển, giao thành công → slice Admin. |

#### 4.8 Vận hành

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-CHK-30 | Must | — (đề xuất PO) | Giới hạn theo IP, tách bộ đếm catalog/auth: báo giá + API giỏ 120 yêu cầu/60 giây; đặt hàng 10/10 phút; tra cứu đơn khách (gửi mã + nhập OTP) 10/15 phút. Vượt → 429 `rate-limited` + `retryAfterSeconds`. Thao tác bình thường (đổi số lượng 20 lần, áp 3 mã, đặt 1 đơn) không chạm. |
| BR-CHK-31 | Must | nguyên tắc 3 | Lỗi theo BR-AUTH-36 với mã ổn định: `validation` (+`field`), `invalid-address`, `stock-changed`, `price-changed`, `voucher-changed`, `idempotency-conflict`, `possible-duplicate` (nếu làm), `not-found`, `not-cancellable`, `unauthenticated`, `rate-limited`, lỗi máy chủ; không stack trace/SQL. FE map theo `code` trong body. Mọi lỗi kể cả mất mạng: giữ form, giỏ, mã voucher; báo rõ việc cần làm. |
| BR-CHK-32 | Must | — | Cờ `checkoutMode`. = http: giỏ (máy chủ + báo giá), checkout, trang thành công, `/track-order`, `/payment/:id` (nếu QR), địa giới, phần đơn hàng của tài khoản gọi API; phần còn lại Account và Admin vẫn mock; điền họ tên/email từ phiên, ẩn "Địa chỉ đã lưu", "Mã của bạn", ghi chú "Bản trải nghiệm". = mock: như trước Slice 3. |
| BR-CHK-33 | Must | nguyên tắc 5 | Migration chỉ cộng thêm (như BR-CAT-23); bảng mới bật RLS; seed tham số, voucher, địa giới, ngày nghỉ idempotent (chạy lại không trùng, không đặt lại lượt đã dùng). |

### 5. Acceptance criteria

Dữ liệu tham chiếu: giá seed Slice 2 (off-duty-top 390.000, weekend-shirt 550.000, city-vest 790.000, after-hours-dress 890.000, the-everyday-blazer 1.290.000); blazer Đen/S tồn 5. Voucher seed theo BR-VOU-02. "T" = dữ liệu thử do test tạo. SĐT thử `0912345678`, email `a@x.vn`. AC của BR Should là Should.

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-CART-01 | CART-01 | PDP blazer chưa chọn size | Bấm Thêm vào giỏ; chọn Đen/S rồi thêm 2 lần | Lần 1 không thêm, nhắc chọn size; sau đó giỏ có 1 dòng Đen/S số lượng 2. |
| AC-CART-02 | CART-02 | Dòng off-duty-top số lượng 5 (tồn 6); dòng blazer Đen/S số lượng 3 nhưng DB tồn 3 | Bấm "+" ở từng dòng | Dòng 1 giữ 5, nút "+" khoá, câu "Mỗi đơn mua tối đa 5 sản phẩm cùng màu, size..."; dòng 2 giữ 3, câu "Chỉ còn 3 sản phẩm cho màu, size này.". |
| AC-CART-03 | CART-02 | Dòng số lượng 1 | Bấm "−" | Dòng bị xoá. |
| AC-CART-04 | CART-03 | Giỏ 30 dòng | Thêm phiên bản thứ 31 | Bị chặn, giỏ vẫn 30, câu "Giỏ hàng tối đa 30 sản phẩm khác nhau.". |
| AC-CART-05 | CART-03 | 5 dòng × 5 = 25 sản phẩm | Chọn cả 5; bỏ chọn 1 dòng; gọi API báo giá 25 sản phẩm | Chọn 5: Thanh toán khoá, "Mỗi đơn tối đa 20 sản phẩm."; còn 20: mở; API 422 `validation`. |
| AC-CART-06 | CART-05 | Giỏ: blazer Đen/S × 4 (chọn) và Đen/M × 3 (không chọn); tồn đủ | Đổi Đen/M sang Đen/S | 1 dòng Đen/S số lượng 5, được chọn; câu "Đã gộp..." và "Số lượng được điều chỉnh còn 5.". Size hết hàng trong bộ chọn bị khoá. |
| AC-CART-07 | CART-06, 07 | Giỏ 3 dòng | Chọn 2 dòng, Thanh toán, đặt COD thành công | Tạm tính và thanh free-ship chỉ theo 2 dòng; checkout có 2 dòng; sau đặt giỏ còn 1 dòng. Bỏ chọn hết → Thanh toán khoá. |
| AC-CART-08 | CART-08 | Giỏ off-duty-top (lưu 390.000); DB đổi 420.000 | Mở `/cart` | Dòng 420.000₫, "Giá đã thay đổi từ 390.000₫ thành 420.000₫", thông báo chung ở đầu giỏ. |
| AC-CART-09 | CART-08 | Dòng A số lượng 4, DB tồn 2; dòng B tồn 0; dòng C sản phẩm chuyển `DRAFT`; dòng id `01-0-S` | Mở `/cart` | A tự giảm 2 kèm câu "Chỉ còn 2..."; B mờ "Đã hết hàng", bỏ chọn, không chọn lại được, vẫn trong giỏ; C và `01-0-S` hiện "Sản phẩm không còn kinh doanh", chỉ có nút Xoá. |
| AC-CART-10 | CART-08 | Giỏ 2 dòng; chặn `*/api/*` | Mở `/cart`; bỏ chặn, bấm Thử lại | Khi chặn: giỏ hiện bản lưu, "Chưa cập nhật được giá mới nhất", Thanh toán khoá. Bỏ chặn: giá máy chủ, mở Thanh toán. Bấm "+" 5 lần trong 1 giây → 1 request báo giá. |
| AC-CART-11 | CART-09 | Thành viên A thêm 2 dòng trên trình duyệt 1 | Đăng nhập A trên trình duyệt 2, tải lại | Có đủ 2 dòng. Khách chưa đăng nhập: không có request API giỏ. |
| AC-CART-12 | CART-09 | Giỏ khách và giỏ của A sửa lần cuối 31 ngày trước (chỉnh thời gian bằng SQL/đồng hồ thử) | Mở giỏ | Cả hai rỗng. Mốc 29 ngày: còn nguyên. |
| AC-CART-13 | CART-10 | Tài khoản: X × 2, Y × 1; khách: X × 2, Z × 1, dòng `01-0-S` | Đăng nhập | X = 4, Y = 1, Z = 1; chỉ X, Z được chọn; không có `01-0-S`; báo đúng 1 lần "Đã thêm 2 sản phẩm từ giỏ hàng trước khi đăng nhập.". |
| AC-CART-14 | CART-10 | Tài khoản X × 4, khách X × 3, tồn 10; tài khoản 29 dòng, khách 3 dòng mới | Đăng nhập | X = 5 (cắt hạn mức). Giỏ 30 dòng; 2 dòng sửa lâu nhất nằm trong Yêu thích trên thiết bị. |
| AC-CART-15 | CART-10 | Khách 2 dòng; chặn `*/api/*` khi đăng nhập xong | Bỏ chặn, tải lại 2 lần | Sau tải lại lần 1 giỏ gộp đúng; lần 2 không đổi (không nhân đôi). |
| AC-CART-16 | CART-11 | Tài khoản có dòng Y; khách chọn X ở giỏ, vào checkout, đăng nhập tại đó | Quay lại checkout | Checkout chỉ có X; thông tin đã nhập còn nguyên. |
| AC-CART-17 | CART-12 | A đăng nhập, giỏ 2 dòng | Đăng xuất; đăng nhập lại | Sau đăng xuất giỏ trống (badge 0); đăng nhập lại thấy 2 dòng, không nhân đôi. |
| AC-CART-18 | CART-12 | A giỏ 2 dòng; phiên A bị thu hồi | Tải lại, thêm dòng Z, đăng nhập lại A | Sau thu hồi giỏ vẫn 2 dòng; sau đăng nhập: 3 dòng, số lượng 2 dòng cũ không đổi. |
| AC-CART-19 | CART-13 | Giỏ off-duty-top × 1 rồi thêm blazer | Xem `/cart` | Không có phí giao/voucher/tổng; lần 1 "Mua thêm 610.000₫ để được miễn phí giao hàng"; lần 2 "Đơn được miễn phí giao hàng". |
| AC-CART-20 | CART-14 | Giỏ 2 dòng | Xoá 1 dòng; bấm Hoàn tác trong 5 giây; xoá lại, chờ 6 giây | Lần 1 dòng trở lại đúng số lượng; lần 2 mất hẳn. |
| AC-CHK-01 | 01, 02 | Khách chưa đăng nhập, chưa chọn dòng nào / có 1 dòng | Mở `/checkout` | Không dòng: về `/cart`. Có dòng: một trang đủ 4 phần, tóm tắt hiện; đặt COD thành công không bị đòi đăng nhập. |
| AC-CHK-02 | 02 | A đăng nhập, sửa cookie `n2f_sid` thành `xxx` trước khi bấm đặt | Đặt hàng | 201 (không 401); đơn không có trong lịch sử A; tra cứu được bằng mã + email + OTP. |
| AC-CHK-03 | 03 | Khách điền nửa form | Tải lại; sau 25 giờ mở lại; đặt thành công rồi mở checkout | Lần 1 còn dữ liệu; sau 25 giờ trống; sau khi đặt trống. |
| AC-CHK-04 | 04 | Checkout | Họ tên "A", "12345", 51 ký tự; SĐT `0212345678`, `091234567`, `84912345678`; địa chỉ 4 ký tự, 201 ký tự; ghi chú 251 ký tự | Mỗi lần lỗi tại đúng ô (FE) và 422 `validation` đúng `field` (API); 0 đơn. `+84912345678` hợp lệ, lưu `0912345678`; tên 2 và 50 ký tự hợp lệ. |
| AC-CHK-05 | 05 | Khách | Để trống email; email 101 ký tự; `a@`; email đã có tài khoản | 3 lần đầu lỗi `email`, 0 đơn. Email đã có tài khoản: có gợi ý đăng nhập, đặt thành công, đơn không vào lịch sử tài khoản đó. Thành viên: email điền sẵn, sửa được. |
| AC-CHK-06 | 06 | Danh mục đã seed | Chọn tỉnh rồi phường, đổi tỉnh; API đặt với `provinceCode` lạ; `wardCode` của tỉnh khác | Đổi tỉnh xoá phường. API: 422 `invalid-address` kèm `field`; 0 đơn. Chưa nhập địa chỉ: "Phí giao hàng: tính sau khi nhập địa chỉ". |
| AC-CHK-07 | 07 | Chọn hoá đơn công ty | MST `0123456789-001`; `012345678`; bỏ trống email nhận | Lần 1 lưu vào đơn; 2 lần sau lỗi đúng trường, 0 đơn. |
| AC-CHK-08 | 08 | Ô điều khoản lúc mở trang | Bấm đặt khi chưa tick; gửi API `acceptedTerms: false` | Ô không tick sẵn; không đặt được; API 422 `field: acceptedTerms`. Đơn hợp lệ lưu thời điểm đồng ý. |
| AC-CHK-09 | 09 | Form có lỗi ở SĐT và địa chỉ | Rời ô SĐT; bấm Đặt hàng | Lỗi hiện dưới SĐT khi rời ô; bấm đặt → cuộn tới SĐT (lỗi đầu tiên). |
| AC-VOU-01 | VOU-01 | off-duty-top × 1 | Áp `N2FWELCOME15`, rồi `N2FFREESHIP`, rồi mã giảm T `T50K` | Sau 2 mã: giảm 58.000, phí "Miễn phí" (mã), tổng 332.000. Áp `T50K` thay `N2FWELCOME15`: giảm 50.000, tổng 340.000; free-ship vẫn còn. |
| AC-VOU-02 | VOU-03, 04 | T: `TFUT` bắt đầu ngày mai 08:00; `TEXP` hết hạn 1 giây trước; `TOFF` bị tắt; `TOUT` tổng 1 đã dùng 1; `TMEM` chỉ thành viên | Khách áp `KHONGCO`, `TFUT`, `TEXP`, `TOFF`, `TOUT`, `TMEM` | Lần lượt: "Mã giảm giá không tồn tại."; "Mã này áp dụng từ 08:00 {ngày mai}."; "Mã giảm giá đã hết hạn." (`TEXP`, `TOFF`); "Mã giảm giá đã hết lượt sử dụng."; "Đăng nhập để dùng mã này."; ô vẫn giữ mã đã gõ; tổng không đổi. |
| AC-VOU-03 | VOU-03 | Mã `TOUT` vừa hết hạn **và** hết lượt | Áp | Chỉ hiện lý do của điều kiện đầu (hết hạn). |
| AC-VOU-04 | VOU-03 | Đơn D1 của khách (`0912345678`, `a@x.vn`) dùng `N2FWELCOME15`, chưa huỷ | Khách khác trình duyệt dùng cùng SĐT, email khác; rồi email `a@x.vn`, SĐT khác; huỷ D1 rồi áp lại | Hai lần đầu: "Bạn đã dùng mã này đủ số lần cho phép." (hoặc "Mã chỉ áp dụng cho đơn hàng đầu tiên."); sau huỷ D1: áp được. |
| AC-VOU-05 | VOU-03 | Khách có 1 đơn COD còn hiệu lực không dùng mã | Áp `N2FWELCOME15` | "Mã chỉ áp dụng cho đơn hàng đầu tiên.". Khách có đơn duy nhất đã huỷ: áp được. |
| AC-VOU-06 | VOU-03, 04 | — | `N2FFREESHIP` với T giá 290.000; với off-duty-top 390.000; với blazer | 290.000: "Mua thêm 10.000₫ để dùng mã này (đơn tối thiểu 300.000₫)."; 390.000: phí về 0, không có dòng giảm giá; blazer: "Đơn của bạn đã được miễn phí giao hàng.", lượt không tăng. |
| AC-VOU-07 | VOU-05 | — | Báo giá T 999.000; T 1.000.000; blazer + `N2FWELCOME15`; T % 50 trần 100.000 trên 390.000; T số tiền 500.000 trên 390.000 | 999.000: phí 30.000, tổng 1.029.000. 1.000.000: miễn phí, tổng 1.000.000. Blazer: giảm 193.000 (làm tròn xuống), vẫn miễn phí (ngưỡng trước voucher), tổng 1.097.000. Trần: giảm 100.000. Số tiền: giảm 390.000, tạm tính sau giảm 0, tổng 30.000. |
| AC-VOU-08 | VOU-06 | Đơn mỗi dòng SL 1: off-duty-top 390.000 + weekend-shirt 550.000 + city-vest 790.000 (tạm tính 1.730.000), `N2FWELCOME15`: 15% × 1.730.000 = 259.500, làm tròn xuống 1.000 ₫ → giảm 259.000 | Đặt, xem DB (phần giảm từng dòng) | Phần giảm lưu trên đơn: off-duty-top 58.387; weekend-shirt 82.341; city-vest 118.272. Tổng = 259.000. Mỗi dòng trước tiên được chia làm tròn xuống tới đồng (58.387 + 82.341 + 118.271 = 258.999), phần dư 1 ₫ cộng vào dòng giá trị lớn nhất là city-vest (118.271 + 1). Trường hợp chia hết (390.000 + 550.000, giảm 141.000 → 58.500 + 82.500, dư 0): không dòng nào được cộng thêm. |
| AC-VOU-09 | VOU-07 | Đơn có mã giảm và free-ship | Xem tóm tắt | Có Tạm tính; "Giảm giá (N2FWELCOME15) -58.000₫"; "Phí vận chuyển: Miễn phí" kèm lý do; Tổng. |
| AC-VOU-10 | VOU-08 | Áp `N2FFREESHIP` cho off-duty-top × 1 | Thêm blazer vào đơn; sau đó bỏ blazer | Thêm: mã bị gỡ, báo "Đơn của bạn đã được miễn phí giao hàng.", tổng tính lại. Đăng xuất khi đang áp `TMEM`: mã bị gỡ, báo "Đăng nhập để dùng mã này.". |
| AC-VOU-11 | VOU-09 | Một IP | Nhập 10 mã không tồn tại trong 15 phút, rồi mã thứ 11 (kể cả mã đúng) | Lần 11: 429, ô nhập khoá, câu "Bạn đã nhập sai quá nhiều lần..."; sau 15 phút nhập lại được. 9 lần sai: chưa khoá. |
| AC-VOU-12 | VOU-10 | off-duty-top × 1, đã áp mã giảm T `TEXP2` (hết hạn sau 1 phút), khách ở checkout | Chờ hết hạn, bấm Đặt hàng | 409 `voucher-changed`, 0 đơn, mã bị gỡ, câu "Mã TEXP2 vừa hết hiệu lực. Tổng thanh toán mới là 420.000₫. Bấm Đặt hàng để tiếp tục.", form giữ nguyên; bấm lại → 201. |
| AC-VOU-13 | VOU-10, 12 | Mã T tổng 1 lượt | 2 khách đặt cùng lúc với mã (lặp 10 lần với mã mới) | Mỗi lần đúng 1 đơn có mã; người kia 409 `voucher-changed`, không có đơn, tồn không đổi. |
| AC-VOU-14 | VOU-11 | Đơn D tạo lúc mã còn hạn | Mã hết hạn; xem đơn D | D giữ nguyên giảm giá và tổng. |
| AC-VOU-15 | VOU-12 | Đơn D dùng mã T còn hạn; đơn E dùng mã T2 đã hết hạn sau khi đặt | Huỷ D; huỷ E | Lượt T của khách được trả (áp lại được); lượt T2 không trả. |
| AC-VOU-16 | VOU-13 | Mã chỉ `tops`, loại trừ hàng giảm (Should) | Áp cho after-hours-dress | "Mã chỉ áp dụng cho Áo." hoặc "Mã không áp dụng cho sản phẩm đang giảm giá." theo thứ tự kiểm. |
| AC-CHK-10 | 10 | off-duty-top × 1; body kèm `price: 1000` | Báo giá | Tạm tính 390.000, phí 30.000, tổng 420.000 (giá giả bị bỏ qua); ngưỡng 1.000.000. |
| AC-CHK-11 | 11 | COD | Đặt thứ Hai 10:00; thứ Hai 16:30; thứ Sáu 10:00; thứ Sáu trước ngày lễ seed | Thứ Hai 10:00 → thứ Tư–thứ Sáu; 16:30 → thứ Năm–thứ Bảy; thứ Sáu 10:00 → thứ Hai–thứ Tư (bỏ Chủ nhật); trước lễ → lùi thêm đúng số ngày lễ. |
| AC-CHK-12 | 12 | Checkout hiện tổng 420.000; DB đổi off-duty-top thành 420.000 (tổng 450.000); lần khác hạ còn 380.000 | Bấm Đặt hàng | Cả hai: 409 `price-changed`, 0 đơn; FE hiện giá cũ, giá mới, tổng mới và câu "Giá một số sản phẩm vừa thay đổi..."; form giữ; bấm lại → 201 với tổng mới. |
| AC-CHK-13 | 13 | Đơn: off-duty-top × 1 (đủ), blazer Đen/S × 5 (DB còn 2) | Đặt; bấm "Cập nhật theo số còn lại"; đặt lại | 409 chỉ dòng blazer `available: 2`, tồn off-duty-top không đổi, 0 đơn; sau cập nhật blazer × 2; đặt lại → 201. |
| AC-CHK-14 | 14 | Blazer Đen/S tồn 5 | Đặt 3 | DB tồn 2; PDP hiện "Chỉ còn 2" sau ≤ 30 giây. |
| AC-CHK-15 | 14 | T biến thể tồn 1, hai khách cùng có trong giỏ | Gửi đồng thời 2 đơn × 1 (khác khoá), lặp 20 lần (đặt lại tồn 1) | Mỗi lần đúng 1 đơn 201 và 1 lần 409 `stock-changed`; tồn 0; không lần nào âm. |
| AC-CHK-16 | 14, 23 | Đơn D blazer Đen/S × 2 (tồn sau đặt 3) | Huỷ D; huỷ D lần hai | Lần 1 `cancelled`, tồn 5, email "đơn đã huỷ". Lần 2 409 `not-cancellable`, tồn vẫn 5. |
| AC-CHK-17 | 15 | Đặt hàng; chặn mạng ngay khi request đi (máy chủ đã tạo đơn) | Bỏ chặn, bấm Thử lại | Cùng mã đơn; DB 1 đơn; tồn trừ 1 lần; 1 email; không có request tự gửi lại trước khi bấm. |
| AC-CHK-18 | 15 | — | Cùng khoá khác nội dung; không khoá; khoá 10 ký tự; 2 request cùng khoá cùng lúc; cùng khoá sau 25 giờ | 409 `idempotency-conflict`; 422; 422; 1 đơn, hai phản hồi cùng mã; sau 25 giờ coi là lượt mới (kiểm lại toàn bộ). |
| AC-CHK-19 | 15 | Checkout hợp lệ | Bấm Đặt hàng 2 lần trong 300 ms; sau khi thành công bấm Back, F5 | 1 request `POST`; Back/F5 vẫn ở trang đơn vừa đặt, không mở lại form đặt. |
| AC-CHK-20 | 16 | Khách vừa đặt đơn (SĐT `0912345678`, off-duty-top × 1) 5 phút trước | Đặt lại y hệt; xác nhận | Lần 1 hỏi lại kèm mã đơn trước, 0 đơn mới; xác nhận → 201. Sau 11 phút: không hỏi. |
| AC-CHK-21 | 17 | 1.000 đơn thử trong một ngày | Kiểm mã; tra cứu với `n2f…` chữ thường và có `#` | Mọi mã khớp `^N2F\d{10}$`, 6 số đầu = ngày giờ Việt Nam, không trùng; tra cứu tìm đúng đơn. |
| AC-CHK-22 | 18 | Đơn D đã đặt | Đổi tên, giá sản phẩm và phí giao trong DB, xem D | D giữ tên, đơn giá, phí giao, tổng cũ. |
| AC-CHK-23 | 19 | T giá 5.000.000; T giá 5.001.000 | Vào checkout | 5.000.000: COD được chọn sẵn. 5.001.000: COD hiện nhưng khoá, có lý do; chọn được chuyển khoản (nếu bật); API gửi `cod` → 422 `field: paymentMethod`. |
| AC-CHK-24 | 19 | SĐT có 3 đơn COD chưa giao; SĐT khác có 2 đơn COD đánh dấu từ chối nhận trong 6 tháng (SQL) | Vào checkout từng SĐT | Cả hai: COD khoá kèm lý do. Đổi sang SĐT sạch: COD mở. |
| AC-CHK-25 | 19 | Đang chọn COD, tổng 4.900.000 | Tăng số lượng làm tổng > 5.000.000 | Tự chuyển sang chuyển khoản và báo khách (khi QR bật); khi QR chưa bật: không đặt được, báo lý do kèm hotline. |
| AC-CHK-26 | 20, 22 | Khách đặt COD 390.000 | Xem DB và trang thành công | Đơn `to_ship` + `pending`; FE hiện "Đang chuẩn bị hàng"; có câu gọi xác nhận 2 giờ làm việc. Thành viên có 1 đơn `completed` (SQL), đơn mới 390.000: không có câu này. |
| AC-CHK-27 | 21 (chờ xác nhận) | QR bật | Đặt chuyển khoản; giả lập đối soát báo đủ / thiếu / thừa; để quá 30 phút | Vào `to_pay`+`pending`, trang QR có số tiền, nội dung = mã đơn, đếm ngược 30:00. Đủ: `to_ship`+`paid`, email "Đã nhận thanh toán". Thiếu: hiện số còn thiếu. Thừa: `to_ship`, ghi cần hoàn phần thừa. Quá hạn: `cancelled` trong ≤ 2 phút, tồn và lượt được trả, email báo huỷ. QR chưa bật: lựa chọn không hiện, API 422. |
| AC-CHK-28 | 22 | — | SQL ghi trạng thái `abc` | DB từ chối. Đơn `to_receive` hiện ở FE là "Đang vận chuyển". |
| AC-CHK-29 | 23 | Đơn `to_pay`; đơn `to_ship`; đơn `to_receive` (SQL) | Khách huỷ từng đơn | `to_pay`: huỷ ngay. `to_ship`: theo câu hỏi 4 (đề xuất: huỷ ngay). `to_receive`: 409 `not-cancellable`, tồn không đổi. |
| AC-CHK-30 | 25 | Khách đặt COD xong | Xem trang thành công | Có mã đơn, tổng, phương thức, ngày giao dự kiến, email đã gửi xác nhận, 2 nút, lời mời tạo tài khoản; tạo tài khoản bằng email đó → đơn không có trong lịch sử. |
| AC-CHK-31 | 26 | Đơn D (`a@x.vn`) | Nhập mã D + `A@X.VN`, nhập OTP đúng; mã D + email sai; mã sai + email đúng; mã D + email đúng + OTP sai | Đúng: xem được chi tiết, huỷ được trong 30 phút. Ba trường hợp sai: bước 1 cùng phản hồi "đã gửi mã" (không có thư khi không khớp), cuối cùng "Không tìm thấy đơn hàng phù hợp". URL không chứa email/OTP; phản hồi không có `userId`. |
| AC-CHK-32 | 27 | A có 12 đơn | Mở `/account/orders`, bấm "Xem thêm"; mở chi tiết đơn của B | 10 đơn mới nhất trước, rồi 12; đơn của B: 404. |
| AC-CHK-33 | 27 (AC-AUTH-68) | A ở `/account/orders/<id>`, giỏ 2 món; phiên A bị thu hồi | Bấm Huỷ đơn | 401; FE chuyển `/auth/login?returnUrl=%2Faccount%2Forders%2F<id>` với "Phiên đăng nhập đã hết hạn…"; giỏ còn 2 món; đơn không đổi. |
| AC-CHK-34 | 28 | Đơn có email Gmail thật | Đặt COD | Thư trong ≤ 5 phút, tiêu đề "nine2fine – Xác nhận đơn hàng #{mã}", đủ mục BR-CHK-28, có câu chống lừa đảo, tổng khớp đơn. |
| AC-CHK-35 | 28 | SMTP lỗi | Đặt đơn | 201; hệ thống thử lại 3 lần; sau đó có thư báo CSKH tới email hỗ trợ (hoặc log nếu SMTP vẫn hỏng); đơn không bị huỷ; log không có email đầy đủ. |
| AC-CHK-36 | 30 | Một IP | 121 báo giá/60 giây; 11 lần đặt/10 phút; 11 lần tra cứu/15 phút | Yêu cầu vượt: 429 + `retryAfterSeconds`; FE báo lỗi có thử lại, giữ dữ liệu; bộ đếm catalog/auth không đổi. |
| AC-CHK-37 | 31 | Gây từng lỗi ở AC-CHK-04, 06, 12, 13, 18, 29, AC-VOU-12 và tắt DB | Xem phản hồi, FE | Mỗi lỗi `code` đúng BR-CHK-31, không stack trace/SQL; FE hiện đúng câu (không còn "Địa chỉ giao hàng chưa hợp lệ" cho lỗi khác). |
| AC-CHK-38 | 31 | Checkout điền đủ, có 2 mã; chặn `*/api/*` | Bấm Đặt hàng; bỏ chặn, Thử lại | Khi chặn: báo lỗi, form/giỏ/mã còn nguyên. Thử lại dùng cùng `Idempotency-Key`, 201. |
| AC-CHK-39 | 32 | `checkoutMode: http`, `mode: mock`, A đăng nhập | Mở `/cart`, `/checkout`, đặt, `/account/orders`, `/account/profile` | Có request API giỏ/báo giá/đơn; không còn "Thanh toán hiện chưa khả dụng"; họ tên/email từ phiên; không có "Địa chỉ đã lưu", "Mã của bạn", "Bản trải nghiệm"; Profile vẫn mock. |
| AC-CHK-40 | 32 | `checkoutMode: mock` | Chạy Playwright `checkout`, `account`, `operations`, `commerce` | Số test pass không giảm so với trước Slice 3; không có request `/api/cart`, `/api/checkout`, `/api/orders`. |
| AC-CHK-41 | 33 | DB Supabase ở schema Slice 2 | `migrate deploy` 2 lần; seed 2 lần sau khi có 1 đơn dùng `N2FFREESHIP` | Chỉ thêm đối tượng mới, không `DROP`/`TRUNCATE`/`DELETE`/đổi kiểu; lần 2 không đổi; voucher, địa giới, ngày nghỉ không trùng, lượt đã dùng giữ nguyên; bảng mới bật RLS. |

Tổng: **60 BR** — BR-CART 14 (13 Must, 1 Should: 14), BR-CHK 33 (30 Must, 3 Should: 03, 16, 24), BR-VOU 13 (12 Must, 1 Should: 13); tức 55 Must, 5 Should. Must có phần chờ xác nhận: BR-CHK-06, 21, 22, 23, 26, BR-VOU-05. **77 AC** — AC-CART 20 (19 Must, 1 Should: 20), AC-CHK 41 (39 Must, 2 Should: 03, 20; AC-CHK-27 chạy khi câu hỏi 2 được trả lời), AC-VOU 16 (15 Must, 1 Should: 16); tức 73 Must, 4 Should. Nguồn không dùng thành BR: CHK-PAY-04 (quy tắc vận hành giao nhận, ghi ở chính sách), các mục Won't ở bảng phạm vi.

### 6. Định nghĩa xong của Slice 3

- Mọi AC Must đạt trong `docs/qa/report-slice-3-checkout.md`; AC Should ghi rõ làm hay hoãn; AC chờ xác nhận chạy theo câu trả lời của Thắng.
- **AC-AUTH-68** kiểm bằng AC-CHK-33 (trang đòi đăng nhập đầu tiên có API thật). AC-AUTH-88 → Account; 75, 84, 85 → Admin.
- Backlog 2.14 đóng khi AC-CHK-13..16 đạt.
- `openapi.yaml` có giỏ, báo giá, đặt hàng (`Idempotency-Key`, giá/tổng đã thấy, `voucherCodes`), tra cứu OTP, huỷ, địa giới, đơn tài khoản, mã lỗi BR-CHK-31.
- Tổng `subtotal − discount + shippingFee − shippingDiscount = total` do máy chủ tính, khớp ở checkout, trang thành công, email, chi tiết đơn.
- FE chạy `checkoutMode: http` với BE thật trên Supabase; Account (trừ đơn) và Admin vẫn mock; Playwright mock pass nguyên.
- Migration chỉ cộng thêm; quyết định ghi `decisions.md`; bàn giao ghi `handoff.md`.

### 7. Câu hỏi mở

| # | Câu hỏi | Ảnh hưởng | Trạng thái |
| --- | --- | --- | --- |
| 1 | Nguồn BR tham chiếu COMMON-01 (trạng thái và bước chuyển), 02 (trạng thái thanh toán), 03 (trừ/hoàn kho), 05 (hiển thị và tính tiền, làm tròn), 06 (quyền khách vãng lai, tra cứu OTP) nhưng file không có. **Đề xuất PO:** Thắng gửi nội dung COMMON; tới lúc đó dùng giả định tạm: (a) API/DB dùng tên trạng thái COMMON và ánh xạ BR-CHK-22; (b) mã % làm tròn xuống tới 1.000 ₫; (c) tồn trừ khi tạo đơn, hoàn khi huỷ (BR-CHK-14); (d) OTP tra cứu dùng thông số BR-AUTH-04..09, hiệu lực xem đơn 30 phút. | BR-CHK-22, 23, 26; BR-VOU-05 | Thắng — chờ xác nhận |
| 2 | Chuyển khoản QR tự đối soát (CHK-PAY-08..12) cần tài khoản ngân hàng nhận và dịch vụ báo tiền về (webhook). **Đề xuất PO:** dùng SePay (gói miễn phí, webhook theo nội dung chuyển khoản), Thắng mở tài khoản và cấp khoá; làm ở lát 3.8 sau COD. Chưa có thì ẩn QR ở HTTP; hệ quả: đơn > 5.000.000 ₫ chưa đặt được online (báo hotline). Không đề xuất xác nhận tay vì không kịp hạn 30 phút. | BR-CHK-19, 21; AC-CHK-25, 27 | Thắng — chờ xác nhận |
| 3 | Phạm vi giao hàng và danh mục địa giới: toàn quốc hay 3 thành phố như mock? **Đề xuất PO:** toàn quốc, 34 tỉnh/thành và phường/xã sau 01/07/2025, BE seed từ file công khai và ghi nguồn. | BR-CHK-06, AC-CHK-06 | Thắng — chờ xác nhận |
| 4 | Nguồn (CHK-PAY-14) cho khách ở `to_ship` chỉ gửi yêu cầu huỷ, shop duyệt; quyết định 2026-10-18 và FE cho huỷ thẳng. Chưa có Admin để duyệt. **Đề xuất PO:** Slice 3 huỷ thẳng ở `to_ship`; khi có slice Admin chuyển sang `cancel_requested`. | BR-CHK-23, AC-CHK-29 | Thắng — **đã xác nhận (2026-11-08)**: Slice 3 huỷ thẳng; từ Slice 4 chuyển sang `cancel_requested` (Slice 4 câu hỏi 1) |

---

## Slice 4: Admin đơn hàng

Nguồn chính: `docs/product/cart-checkout-business-rules.md` (CHK-PAY-05, 06, 07, 11, 14; CHK-CF-13; bảng "Vai trò xử lý ngoại lệ"; nguyên tắc 1 và 5), Slice 3 (BR-CHK-14, 19, 20, 22, 23, 28, 29; BR-VOU-12), Slice 1 (BR-AUTH-33, 34; AC-AUTH-75, 84, 85). Thắng chốt Slice 4 = Admin đơn hàng (decisions 2026-11-08). Hiện trạng đã đọc: BE `backend/prisma/schema.prisma` (`orders`, `order_items`, `order_events`, `product_variants`, `store_settings`), `backend/src/modules/order/{cancel-order.service,expiry.job,order.mapper}.ts`, `backend/src/config/assumptions.ts`, `backend/src/modules/auth/*` (đã có `/admin/auth`, cookie `n2f_asid`, vai trò `staff`/`admin`); FE `frontend/src/app/admin/**` (mock, commit 181ea57) và `frontend/src/app/features/orders/**`. **Nguồn tham chiếu COMMON-01..03 (bước chuyển trạng thái, hoàn kho) vẫn chưa có nội dung** (Slice 3 câu hỏi 1): mọi bước chuyển dưới đây là đề xuất PO bám CHK-PAY-14 và đánh dấu ở câu hỏi 8. Mã BR: `BR-ADM`. Tên endpoint/trường/cột do Backend chốt trong `openapi.yaml`; BR chỉ nêu dữ liệu phải lưu và hành vi quan sát được. Tiền là số nguyên đồng; múi giờ Asia/Ho_Chi_Minh. AC kế thừa mức của BR.

### 1. Vấn đề và mục tiêu

**Vấn đề.** Đơn thật được tạo ở `to_ship` rồi dừng: không ai xác nhận, bàn giao, đánh dấu giao xong hay huỷ; khách không có đường biết đơn đi đâu; "từ chối nhận hàng" chưa ghi nhận được nên giới hạn COD (BR-CHK-19) chưa có dữ liệu; khách huỷ thẳng ở `to_ship` (giả định tạm S3-Q4, tức câu hỏi 4 của Slice 3) trái nguồn; Admin FE chỉ chạy mock với 11 trạng thái khác DB (6 trạng thái).

**Mục tiêu.**
1. Mọi đơn COD đi hết vòng đời tới `completed` hoặc `cancelled` bằng thao tác của nhân viên, qua giao diện admin hiện có.
2. Mỗi thay đổi có người làm, giờ làm, từ trạng thái nào sang trạng thái nào; không sửa, không xoá được.
3. Tồn kho và lượt voucher được hoàn đúng một lần, bất kể đường huỷ nào (khách, shop, hết hạn).
4. Hai nhân viên cùng thao tác một đơn không để lại trạng thái sai, không gửi thư hay hoàn kho hai lần.
5. Khách biết đơn đang ở đâu (timeline, mã vận đơn, email) và yêu cầu huỷ ở `to_ship` được shop quyết định.

**Không phải mục tiêu.** Đổi giao diện admin (giữ visual guideline admin v1.3); quản lý sản phẩm, tồn kho thủ công, khách hàng, khuyến mãi, báo cáo, nhân viên; hoàn tiền; chuyển khoản QR; trả hàng sau giao.

### 2. Phạm vi

| Hạng mục | Mức | Nguồn | Lý do |
| --- | --- | --- | --- |
| Quyền truy cập API admin (phiên `n2f_asid`, staff vs admin, kiểm lại vai trò mỗi yêu cầu) | Must | BR-AUTH-33, 34; AC-AUTH-84, 85 | API admin đầu tiên; không có thì mọi thao tác dưới đây không an toàn. |
| Danh sách đơn: tab theo việc cần làm, đếm, tìm theo mã/SĐT/email/tên, lọc phương thức và ngày | Must | — | Staff phải tìm đúng đơn cần xử lý. |
| Chi tiết đơn + timeline (ai, giờ nào, từ đâu sang đâu) | Must | CHK-PAY-14 | Vết kiểm toán; khách và CSKH cùng hỏi "đơn đang ở đâu". |
| Ghi nhận cuộc gọi xác nhận COD; xác nhận; huỷ do không liên lạc / khách báo không nhận trên điện thoại | Must | CHK-PAY-06 | Nguồn giao bước này cho Admin ở Slice 3. |
| Bàn giao vận chuyển (đơn vị + mã vận đơn) → `to_receive`; giao xong → `completed` + đã thu tiền | Must | CHK-PAY-14, CF-13 | Hoàn tất vòng đời; mở khoá Reviews (P1). |
| Giao không thành / khách từ chối nhận → `cancelled`; ghi `delivery_refused_at`; xử lý hàng hoàn về kho | Must | CHK-PAY-07, CHK-PAY-05 | Cấp dữ liệu cho giới hạn COD; hoàn kho đúng lúc hàng về. |
| Huỷ do shop (lý do cố định; lý do "khác" chỉ admin); hoàn kho + lượt voucher đúng một lần | Must | CHK-PAY-06, nguyên tắc 1 | Một quy tắc hoàn kho cho mọi đường huỷ. |
| Duyệt / từ chối yêu cầu huỷ; đổi S3-Q4: khách ở `to_ship` chỉ gửi yêu cầu | Must | CHK-PAY-14, CF-13 | Trả đúng nguồn; cần người duyệt nên đi cùng Slice 4. |
| Email: đã bàn giao (kèm mã vận đơn), giao thành công, yêu cầu huỷ được duyệt / bị từ chối, huỷ do shop | Must | CHK-CF-13 | Đúng danh sách sự kiện của nguồn (phần còn lại sau Slice 3). |
| Chống hai người cùng thao tác: kiểm trạng thái hiện tại, một hiệu ứng phụ mỗi lần chuyển | Must | nguyên tắc 4 (tinh thần) | Yêu cầu của Thắng. |
| Timeline phía khách: mã vận đơn, "chờ duyệt huỷ", hoàn thành (không lộ tên nhân viên) | Must | — | Order Tracking là P0. |
| Cờ `adminOrdersMode`; menu admin ở HTTP chỉ còn "Đơn hàng" | Must | — | Không để màn hình mock lẫn dữ liệu thật. |
| Ghi chú nội bộ; in phiếu giao; cờ quá hạn (gọi, duyệt huỷ, giao); giới hạn tần suất | Should | CHK-PAY-06 (2 giờ) | Có ích, không chặn vòng đời. |
| Sửa địa chỉ / đổi dòng hàng của đơn | Won't | — | Đụng giá, tồn, phí giao, voucher; CSKH huỷ và hướng dẫn đặt lại. |
| Hoàn tiền, đơn `to_pay` / chuyển khoản QR, `partially_refunded` | Won't | CHK-PAY-10, 12 | QR chưa bật (Slice 3 câu hỏi 2): chưa có đơn đã thu tiền để hoàn. |
| Trả hàng / đổi hàng sau giao (`returns`), `delivering`, `delivery-failed`, `returned-to-sender` làm trạng thái riêng | Won't | VC-13 | Slice sau; DB chỉ có 6 trạng thái, không thêm. |
| Điều chỉnh tồn kho thủ công, lịch sử kho, ngưỡng sắp hết | Won't | — | Slice Admin kho & sản phẩm; Slice 4 chỉ đụng tồn qua đơn. Hệ quả: `search_text` (backlog 2.19) chưa thành Must. |
| Sản phẩm, bộ sưu tập, bảng size, nội dung, đánh giá, khuyến mãi, khách hàng, báo cáo, tổng quan, tham số cửa hàng, quản lý nhân viên, nhật ký hoạt động toàn hệ thống, xuất file | Won't | — | Slice sau; ở HTTP các màn này bị ẩn. Nhật ký đơn nằm ở timeline. |
| Vô hiệu hoá / đổi vai trò tài khoản bằng giao diện | Won't | AC-AUTH-75 | Slice Admin người dùng; xem mục 6. |

### 3. Hiện trạng và hành vi được chọn

| # | Điểm | Hiện trạng | Chọn | Lý do |
| --- | --- | --- | --- | --- |
| K1 | Trạng thái | DB: 6 (`to_pay`, `to_ship`, `to_receive`, `completed`, `cancel_requested`, `cancelled`). Admin FE mock: 11 (`pending-confirmation`, `processing`, `shipping`, `delivering`, `delivery-failed`, `returned-to-sender`, `return-requested`, `returned`...). | API và DB giữ 6 trạng thái. Admin FE ánh xạ: `to_ship` + cần gọi + chưa xác nhận → "Chờ xác nhận" (`pending-confirmation`); `to_ship` còn lại → "Đang chuẩn bị" (`processing`); `to_receive` → "Đang vận chuyển" (`shipping`); thêm nhãn "Chờ duyệt huỷ" cho `cancel_requested`. Các trạng thái mock còn lại bỏ ở HTTP. | Master plan 34: DTO tách domain; không migration đổi enum. |
| K2 | Trạng thái thanh toán | Admin FE `PaymentState`: `paid/unpaid/cod/refunded/void`. DB: `pending/paid/failed/refunded/partially_refunded`. | FE ánh xạ: COD + `pending` → "Thu khi giao" (`cod`); `paid` → "Đã thanh toán"; `cancelled` + COD → "Không thu tiền" (`void`). | Giữ nhãn FE. |
| K3 | Dữ liệu chưa có | `order_events` không có người thực hiện (chỉ `actor` = customer/shop/system); không có thời điểm xác nhận, đơn vị vận chuyển, mã vận đơn, thời điểm giao, đếm lần gọi, thời điểm yêu cầu huỷ; không có cờ chống ghi chồng. | Backend thêm bằng migration **cộng thêm** (BR-ADM-37); BR dưới đây chỉ nêu dữ liệu cần lưu. | Không chọn công nghệ, không phá dữ liệu. |
| K4 | Quyền | FE `permissions.ts`: staff không có `orders.cancel`; admin có tất cả. Nguồn (CHK-PAY-06, 07): "admin/staff huỷ". | Staff huỷ được với 5 lý do cố định (`customer_request` thêm 2026-11-08, BR-ADM-24) và duyệt/từ chối yêu cầu huỷ; chỉ admin huỷ với lý do "khác" (BR-ADM-24). FE đổi ma trận cho khớp. | Đúng nguồn, vẫn giữ một quyền chỉ của admin. |
| K5 | Gửi vận chuyển | FE mock `ShipInput`: đơn vị, mã vận đơn, `estimatedAt`. | Chỉ đơn vị + mã vận đơn; ngày giao dự kiến giữ giá trị đã chốt khi đặt (BR-CHK-11). | Không để staff hứa ngày khác với khách đã thấy. |
| K6 | Huỷ ở `to_ship` | `ASSUMPTIONS.customerCancellableFrom = ['to_pay','to_ship']`; `cancel-order.service` dùng `allowedFrom`, `stock_restored_at`. | Bỏ `to_ship` khỏi danh sách (BR-ADM-29) cùng lúc với màn duyệt (lát 4.5). Dùng một quy tắc hoàn kho cho mọi đường huỷ. | Slice 3 BR-CHK-23, S3-Q4. |
| K7 | Giới hạn COD | `quote.service` đã đọc `delivery_refused_at` nhưng chưa có nơi nào ghi. | Slice 4 ghi cột này khi khách từ chối nhận (BR-ADM-26); AC-CHK-24 lần đầu kiểm được dữ liệu thật. | Đóng vòng Slice 3. |
| K8 | Màn hình admin khác | Tổng quan, Sản phẩm, Tồn kho, Khách hàng, Khuyến mãi, Báo cáo, Nội dung, Cài đặt chỉ có mock. | Ở HTTP chỉ hiện "Đơn hàng"; `/admin` → `/admin/orders`; route khác → trang "Chưa khả dụng", không chứa dữ liệu mock. | Doanh thu/tồn giả cạnh đơn thật gây nhầm. |
| K9 | Tài khoản | Mock dùng `@nine2fine.vn`; BE seed `admin@nine2fine.test`, `staff@nine2fine.test`. | Dùng tài khoản seed BE. | decisions 2026-11-07. |
| K10 | Mã lỗi `unauthorized` | PRD Slice 3 BR-CHK-27 ghi `unauthorized`; contract đã chốt `unauthenticated`, `forbidden`. | Dùng `unauthenticated` (401), `forbidden` (403). Đã sửa chữ `unauthorized` thành `unauthenticated` ở BR-CHK-27, BR-CHK-31 (2026-11-08). | Bám contract. |
| K11 | Đơn cũ (Slice 3) | Đơn tạo trước migration Slice 4 không có người xử lý. | Hiển thị đúng, người = "Khách" / "Hệ thống" theo `actor` (BR-ADM-37). | Không backfill. |

### 4. Business Rules

Trạng thái "cần gọi" = đơn COD `to_ship`, `needs_confirm_call` = true, chưa được xác nhận (BR-ADM-17). "Hàng hoàn chờ xử lý" = đơn `cancelled` từ `to_receive` mà hàng chưa được xử lý (BR-ADM-27).

#### 4.1 Truy cập và quyền

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-ADM-01 | Must | BR-AUTH-33, 34; AC-AUTH-84 | Mọi API admin đơn hàng chỉ nhận phiên admin (`n2f_asid`). Không có cookie, hết hạn, bị thu hồi, hoặc chỉ có cookie storefront `n2f_sid` → 401 `unauthenticated`, không có dữ liệu đơn trong phản hồi. Phản hồi `Cache-Control: no-store`. |
| BR-ADM-02 | Must | BR-AUTH-33; AC-AUTH-85; K4 | Máy chủ kiểm quyền ở **mọi** yêu cầu theo bảng: **staff**: xem; ghi cuộc gọi; xác nhận; bàn giao; giao xong; huỷ với lý do `unreachable`, `declined_on_call`, `customer_request`, `refused`, `undeliverable`; xử lý hàng hoàn; duyệt/từ chối yêu cầu huỷ; ghi chú. **admin**: mọi việc của staff + huỷ với lý do `other`. Phiên hợp lệ nhưng thiếu quyền → 403 `forbidden`; đơn không đổi, không có sự kiện. |
| BR-ADM-03 | Must | BR-AUTH-29, AC-AUTH-75 (một phần) | Vai trò và trạng thái hoạt động của tài khoản đọc từ DB ở mỗi yêu cầu, không tin cookie hay FE. Tài khoản bị vô hiệu hoặc hạ vai trò (qua SQL cho tới khi có giao diện) có hiệu lực ở yêu cầu kế tiếp, không chờ phiên hết hạn (admin/staff: 8 giờ không hoạt động, tối đa 24 giờ — chốt 2026-11-07). Hạ vai trò → quyền mới áp dụng ngay (hành động chỉ admin → 403 `forbidden`, hành động xem vẫn được); `is_active = false` → 401 `unauthenticated`. Slice 4 **không** yêu cầu thu hồi dòng `sessions` hay xoá cookie (việc đó thuộc slice Admin người dùng cùng AC-AUTH-75). |
| BR-ADM-04 | Must | BR-AUTH-33 | FE ẩn nút/hành động không đủ quyền (trải nghiệm, không phải bảo vệ). Danh sách hành động hợp lệ (`allowedActions`) do máy chủ tính theo vai trò và trạng thái; FE chỉ hiện các hành động trong danh sách. |

#### 4.2 Danh sách và tìm kiếm

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-ADM-05 | Must | — | Danh sách đơn mới nhất trước (`createdAt` giảm dần, hoà thì mã đơn giảm dần). `page` ≥ 1 mặc định 1; `limit` mặc định 20, từ 1 đến 50 (cùng tên tham số với Slice 3, không dùng `pageSize`); ngoài khoảng → 422 `validation` (`field: limit`); trang quá cuối → `items` rỗng, `total` đúng. Mỗi dòng: mã, thời điểm đặt, trạng thái, thanh toán, phương thức, tên người nhận, tổng tiền, số sản phẩm, cờ "cần gọi", cờ "có yêu cầu huỷ". |
| BR-ADM-06 | Must | — | Ô tìm `q` (cắt khoảng trắng hai đầu, ≤ 100 ký tự, dài hơn → 422): khớp mã đơn (không phân biệt hoa thường, có hoặc không `#`, tiền tố ≥ 6 ký tự), SĐT người nhận (chuẩn hoá `+84`/`84` → `0`, chứa ≥ 4 chữ số liên tiếp), email đặt hàng (chứa, không phân biệt hoa thường), tên người nhận (chứa, không phân biệt hoa thường và dấu). `%` và `_` được hiểu là ký tự thường. `q` rỗng = không lọc. |
| BR-ADM-07 | Must | — | Tab (view): `all`; `pending-payment` (`to_pay`); `to-confirm` (cần gọi); `to-fulfil` (`to_ship` còn lại); `in-transit` (`to_receive`); `cancel-requests` (`cancel_requested`); `returning` (hàng hoàn chờ xử lý); `completed`; `cancelled` (còn lại). Mỗi đơn thuộc đúng 1 tab (trừ `all`), tổng số các tab = số của `all`. API đếm trả đủ số của mọi tab, khớp danh sách. |
| BR-ADM-08 | Must | — | Bộ lọc: phương thức (`payment=cod`/`bank-transfer`, đúng enum contract); khoảng ngày đặt `from`–`to` (YYYY-MM-DD, GMT+7, gồm cả hai đầu); `from` > `to` → 422 `validation`. Kết hợp với tab và `q` theo AND. |

#### 4.3 Chi tiết, timeline, kiểm toán

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-ADM-09 | Must | BR-CHK-18 | Chi tiết đơn (theo mã, không phân biệt hoa thường/`#`): bản chụp từng dòng, số tiền, voucher, người nhận, địa chỉ, ghi chú giao hàng, phương thức, trạng thái đơn + thanh toán, đơn vị vận chuyển + mã vận đơn (nếu có), thời điểm/người xác nhận (nếu có), `allowedActions`. Mã không có → 404 `not-found`. SĐT và email hiện đầy đủ cho cả staff và admin (cần để gọi và đối chiếu). |
| BR-ADM-10 | Must | CHK-PAY-14 | Timeline lấy từ sự kiện đơn: mỗi dòng có thời điểm (GMT+7), trạng thái trước → sau, trạng thái thanh toán, người thực hiện (tên và vai trò staff/admin, hoặc "Khách", "Hệ thống"), lý do/ghi chú; mới nhất trước (timeline admin); timeline khách (BR-ADM-12) cũ nhất trước như Slice 3 — khác thứ tự là chủ ý. Sự kiện không sửa, không xoá được qua API. |
| BR-ADM-11 | Must | nguyên tắc 4 | Một thao tác thành công = đúng 1 sự kiện (kể cả thao tác không đổi trạng thái như ghi cuộc gọi, ghi chú), ghi **cùng giao dịch** với thay đổi dữ liệu liên quan (trạng thái, tồn kho, lượt voucher). Thao tác thất bại giữa chừng → không đổi dữ liệu nào, không có sự kiện. |
| BR-ADM-12 | Must | nguyên tắc 2 (quyền riêng tư) | Timeline khách thấy (đơn của tôi, tra cứu OTP) chỉ gồm các lần đổi trạng thái và, khi có, mã vận đơn; người thực hiện hiện là "nine2fine", không có tên nhân viên, ghi chú nội bộ, lần gọi, lý do nội bộ. Phản hồi không có mã người dùng của nhân viên. |

#### 4.4 Chuyển trạng thái và đồng thời

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-ADM-13 | Must | CHK-PAY-14 | Chỉ các bước chuyển sau hợp lệ; bước khác → 409 `invalid-transition` kèm trạng thái hiện tại, không đổi dữ liệu, không sự kiện, không thư. `to_ship`: ghi cuộc gọi, xác nhận (giữ `to_ship`); bàn giao → `to_receive`; huỷ → `cancelled`. `to_receive`: giao xong → `completed`; huỷ (giao không thành) → `cancelled`. `cancel_requested`: duyệt → `cancelled`; từ chối → `to_ship`. `cancelled` từ `to_receive`: xử lý hàng hoàn (không đổi trạng thái). `to_pay`, `completed`, các `cancelled` còn lại: chỉ xem. |
| BR-ADM-14 | Must | Yêu cầu Thắng | Mỗi hành động mang trạng thái đơn mà người thao tác đang thấy; khác trạng thái hiện tại → 409 `order-state-changed` kèm đơn hiện tại. Khi hai yêu cầu cùng đơn chạy đồng thời, đúng một yêu cầu thành công, yêu cầu kia nhận 409; mỗi hiệu ứng phụ (cộng tồn, trả lượt voucher, gửi thư) xảy ra tối đa 1 lần cho mỗi lần chuyển trạng thái. Khách yêu cầu huỷ và nhân viên bàn giao cùng lúc: một bên thắng, bên kia 409. |
| BR-ADM-15 | Must | nguyên tắc 3 | FE không cập nhật trạng thái "lạc quan": chỉ đổi sau khi máy chủ trả 2xx. Nút hành động khoá tới khi có kết quả (một lần bấm, một yêu cầu). Mất mạng/5xx: giữ dữ liệu đã nhập (lý do, mã vận đơn), báo lỗi; "Thử lại" luôn tải lại đơn trước và chỉ hiện hành động còn hợp lệ. Nhận 409 `order-state-changed`: tải lại đơn, báo "Đơn vừa được cập nhật bởi người khác." |

#### 4.5 Gọi xác nhận COD

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-ADM-16 | Must | CHK-PAY-06 | "Ghi nhận không liên lạc được" chỉ cho đơn cần gọi: ghi 1 sự kiện (thời điểm, người) kèm ghi chú tuỳ chọn ≤ 250 ký tự; trạng thái không đổi. Số lần ghi không giới hạn. Đơn không cần gọi hoặc đã xác nhận → 409 `invalid-transition`. |
| BR-ADM-17 | Must | CHK-PAY-06 | "Khách xác nhận" chỉ cho đơn cần gọi: lưu thời điểm và người xác nhận; trạng thái vẫn `to_ship`; đơn sang tab `to-fulfil`. Lần hai → 409 `invalid-transition`. |
| BR-ADM-18 | Must | CHK-PAY-06 | Huỷ lý do `unreachable` chỉ khi đơn cần gọi và có ≥ 3 lần "không liên lạc được" nằm trong **một cửa sổ 24 giờ bất kỳ** (3 lần liên tiếp bất kỳ có lần cuối − lần đầu ≤ 24 giờ 00 phút, gồm cả mốc đúng 24 giờ; không bắt buộc cách nhau bao lâu); chưa đủ → 409 `condition-not-met`. Đủ điều kiện chỉ **mở** lý do này (`allowedActions`), không tự huỷ, không đổi cờ; đơn gọi rải rác (không có 3 lần trong 24 giờ) không dùng được `unreachable` — nhân viên tiếp tục gọi, hoặc admin huỷ `other`. Kết quả: `cancelled`, `cancelledBy = shop`, hoàn kho và lượt voucher (BR-ADM-25). |
| BR-ADM-19 | Must | PO bổ sung (nguồn không nêu) | Huỷ lý do `declined_on_call` (khách báo trên điện thoại không muốn nhận) chỉ khi đơn cần gọi; đơn đã xác nhận → 409 `invalid-transition`. Kết quả như BR-ADM-18. |

#### 4.6 Bàn giao và giao xong

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-ADM-20 | Must | CHK-PAY-14 | Bàn giao chỉ cho đơn `to_ship` và, nếu đơn cần gọi, đã xác nhận (chưa → 409 `condition-not-met`). Đầu vào: đơn vị vận chuyển 2–50 ký tự; mã vận đơn 4–40 ký tự gồm chữ, số, `-` (lưu chữ hoa), không trùng mã vận đơn của đơn khác chưa huỷ; sai → 422 `validation` kèm `field`. Kết quả: `to_receive`, lưu thời điểm bàn giao, đơn vị, mã; tồn không đổi (đã trừ từ lúc đặt); thanh toán giữ `pending`. Ngày giao dự kiến giữ nguyên. |
| BR-ADM-21 | Must | CHK-CF-13 | Gửi email "đã bàn giao vận chuyển", tiêu đề "nine2fine – Đơn #{mã} đã được giao cho đơn vị vận chuyển"; nội dung: mã đơn, đơn vị, mã vận đơn, ngày giao dự kiến, tổng thanh toán (COD: số tiền shipper thu), người nhận và địa chỉ, nút xem/tra cứu đơn, hotline CSKH, câu chống lừa đảo của BR-CHK-28 (đề xuất PO). |
| BR-ADM-22 | Must | CHK-PAY-14 | "Giao thành công" chỉ cho đơn `to_receive`: `completed`, thanh toán `paid`, lưu thời điểm thu tiền; không hoàn tác. `completed` là trạng thái cuối: mọi hành động admin và hành động huỷ của khách đều bị từ chối (409). |
| BR-ADM-23 | Must | CHK-CF-13 | Gửi email "giao thành công", tiêu đề "nine2fine – Đơn #{mã} đã giao thành công" (đề xuất PO): mã đơn, ngày giao, sản phẩm, tổng; link chính sách đổi trả; hotline. Không có lời mời đánh giá (Reviews là P1). |

#### 4.7 Huỷ do shop và tồn kho

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-ADM-24 | Must | CHK-PAY-06, 07; K4 | Lý do huỷ là mã cố định, đặt ở trạng thái cho phép: `unreachable` (`to_ship`, BR-ADM-18); `declined_on_call` (`to_ship`, BR-ADM-19); `customer_request` (`to_ship`, staff và admin, đơn COD cần gọi hay không, đã xác nhận hay chưa: khách gọi hotline xin huỷ trước khi bàn giao; **ghi chú bắt buộc 5–250 ký tự** ghi ai gọi/thế nào; kết quả `cancelled`, `cancelledBy = customer`, hoàn kho + voucher theo BR-ADM-25; email dùng câu "Đơn đã được huỷ theo yêu cầu của bạn."; không tính vào giới hạn COD); `refused` khách từ chối nhận, `undeliverable` giao không thành (`to_receive`); `other` (`to_ship` hoặc `to_receive`, **chỉ admin**, ghi chú bắt buộc 5–250 ký tự). Ghi chú nội bộ tuỳ chọn ≤ 250 ký tự cho các lý do còn lại. Tổ hợp sai trạng thái/lý do → 409 `invalid-transition`; thiếu ghi chú → 422. Huỷ do shop (các lý do khác `customer_request`) lưu `cancelledBy = shop`. Đơn `cancel_requested` không huỷ bằng lý do nào ở đây (dùng duyệt/từ chối). |
| BR-ADM-25 | Must | BR-CHK-14, 23; BR-VOU-12; nguyên tắc 1 | Mọi đường huỷ từ `to_ship`, `cancel_requested` (và `to_pay` do khách/hết hạn) dùng **một** quy tắc: trong cùng giao dịch cộng lại đúng số lượng đã trừ của từng dòng, đúng **một lần**; trả lượt voucher nếu mã còn hạn (mã đã hết hạn không trả); thanh toán COD giữ `pending`. Huỷ lần hai (từ bất kỳ đường nào) không hoàn thêm. |
| BR-ADM-26 | Must | CHK-PAY-07, CHK-PAY-05 | Huỷ từ `to_receive` (`refused`, `undeliverable`, `other`) chuyển `cancelled` ngay và trả lượt voucher như BR-ADM-25, **chưa** cộng tồn: hàng chưa về kho. Lý do `refused` lưu thêm thời điểm từ chối vào `delivery_refused_at` (tính vào giới hạn COD 2 lần / 6 tháng theo SĐT, BR-CHK-19); `undeliverable` và `other` không tính. Đơn vào tab `returning`. |
| BR-ADM-27 | Must | CHK-PAY-07; COMMON-03.4 | Với đơn `returning`, nhân viên xử lý đúng một lần: `restocked` (hàng về kho, cộng lại đúng số lượng từng dòng, lưu thời điểm hoàn kho) hoặc `written_off` (hàng hỏng/mất, không cộng tồn, ghi chú bắt buộc 5–250 ký tự). Xử lý lần hai → 409 `invalid-transition`. Đơn không ở `returning` (kể cả đã hoàn kho do BR-ADM-25) → 409. Trạng thái đơn không đổi. |
| BR-ADM-28 | Must | CHK-CF-13 | Huỷ do shop gửi email "đơn đã huỷ" (cùng khuôn BR-CHK-29) kèm lý do cho khách bằng câu chuẩn, không lộ ghi chú nội bộ: `unreachable` → "Chúng tôi không liên lạc được với bạn để xác nhận đơn."; `declined_on_call` → "Bạn đã báo không muốn nhận đơn."; `refused` → "Đơn không được nhận khi giao hàng."; `undeliverable` → "Giao hàng không thành công."; `customer_request` → "Đơn đã được huỷ theo yêu cầu của bạn."; `other` → "nine2fine không thể thực hiện đơn này." (câu do PO đề xuất). COD: không có thông tin hoàn tiền. |

#### 4.8 Yêu cầu huỷ của khách

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-ADM-29 | Must | CHK-PAY-14; thay BR-CHK-23 | Khách (thành viên hoặc khách đã qua OTP) bấm Huỷ ở `to_ship` → đơn sang `cancel_requested`, **không** huỷ ngay: lưu thời điểm và lý do tuỳ chọn ≤ 250 ký tự (dài hơn → 422); tồn, lượt voucher, thanh toán giữ nguyên. Đang `cancel_requested` yêu cầu lần nữa → 409 `not-cancellable`. Ở `to_pay` khách vẫn huỷ thẳng; ở `to_receive`, `completed`, `cancelled` → 409 `not-cancellable` (BR-CHK-23). Việc đổi chỉ có hiệu lực cùng lúc màn duyệt phát hành. |
| BR-ADM-30 | Must | CHK-CF-13 | Duyệt: `cancelled`, `cancelledBy = customer`, sự kiện ghi nhân viên duyệt; hoàn kho + voucher theo BR-ADM-25; gửi email tiêu đề "nine2fine – Yêu cầu huỷ đơn #{mã} đã được duyệt" (đề xuất PO). |
| BR-ADM-31 | Must | CHK-CF-13 | Từ chối: lý do bắt buộc 5–250 ký tự (thiếu/ngắn → 422), đơn trở về `to_ship` giữ nguyên trạng thái xác nhận; gửi email "nine2fine – Yêu cầu huỷ đơn #{mã} chưa được chấp nhận" kèm lý do và hotline (đề xuất PO). Mỗi đơn khách chỉ gửi **một** yêu cầu: sau khi bị từ chối, yêu cầu mới → 409 `not-cancellable` và FE hướng dẫn gọi hotline. |
| BR-ADM-32 | Must | nguyên tắc 4 | Khi `cancel_requested`, chỉ có duyệt và từ chối; ghi cuộc gọi, xác nhận, bàn giao, giao xong, huỷ lý do khác → 409 `invalid-transition`. Tồn không đổi trong thời gian chờ. |
| BR-ADM-33 | Must | BR-CHK-22 | Storefront FE (đơn của tôi, tra cứu): `cancel_requested` → "Đang chờ duyệt huỷ", ẩn nút Huỷ và hiện "Đã gửi yêu cầu huỷ"; `to_receive` → "Đang vận chuyển" kèm đơn vị và mã vận đơn; `completed` → "Hoàn thành"; câu hướng dẫn huỷ ở `to_ship` đổi thành "gửi yêu cầu huỷ". Timeline theo BR-ADM-12. |

#### 4.9 Vận hành

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-ADM-34 | Must | BR-AUTH-36 | Mã lỗi ổn định: `unauthenticated` 401, `forbidden` 403, `not-found` 404, `validation` 422 (+`field`), `invalid-transition` 409, `order-state-changed` 409, `condition-not-met` 409, `not-cancellable` 409 (phía khách), `rate-limited` 429, lỗi máy chủ; không stack trace, SQL. FE map theo `code` trong body. |
| BR-ADM-35 | Must | BR-CHK-28 | Email của Slice 4 gửi trong 5 phút sau thao tác, lỗi thử lại tối đa 3 lần, vẫn lỗi → báo CSKH (phthang0872@gmail.com); thao tác nghiệp vụ không bao giờ bị huỷ vì email lỗi; mỗi sự kiện gửi tối đa 1 thư (hai nhân viên bấm cùng lúc vẫn 1 thư); log không chứa email đầy đủ. Mọi thư có câu chống lừa đảo của BR-CHK-28. |
| BR-ADM-36 | Must | — | Cờ `adminOrdersMode` (`http`/`mock`), độc lập các cờ khác. `http`: đăng nhập admin thật, danh sách, chi tiết, hành động qua API; menu chỉ "Đơn hàng"; route admin khác → trang "Chưa khả dụng" không chứa dữ liệu mock; `/admin` → `/admin/orders`. `mock`: như trước Slice 4. |
| BR-ADM-37 | Must | BR-CHK-33 | Migration chỉ cộng thêm (không `DROP`/`TRUNCATE`/đổi kiểu); bảng mới bật RLS. Cần lưu thêm: người thực hiện sự kiện (nhân viên), thời điểm/người xác nhận, số lần/thời điểm gọi, đơn vị + mã vận đơn + thời điểm bàn giao, thời điểm giao/thu tiền, thời điểm + lý do yêu cầu huỷ, quyết định xử lý hàng hoàn, dấu chống ghi chồng. Đơn và sự kiện Slice 3 sẵn có vẫn hiển thị đúng ("Khách"/"Hệ thống") và xử lý được theo BR-ADM-13. |
| BR-ADM-38 | Should | — | Ghi chú nội bộ ≤ 500 ký tự trên đơn: 1 sự kiện, hiện trong timeline admin, không hiện cho khách. |
| BR-ADM-39 | Should | — | In phiếu giao từ chi tiết đơn `to_ship`/`to_receive`: mã, người nhận, SĐT, địa chỉ, dòng hàng (tên, màu, size, số lượng), ghi chú giao hàng, số tiền shipper thu (COD = tổng thanh toán). |
| BR-ADM-40 | Should | CHK-PAY-06 (2 giờ) | Cờ "quá hạn": cần gọi quá 2 giờ làm việc kể từ lúc đặt; `cancel_requested` quá 24 giờ chưa quyết định; `to_receive` quá ngày giao dự kiến muộn nhất. Giờ làm việc 08:00–18:00, thứ Hai đến thứ Bảy (đề xuất PO, câu hỏi 3). Chỉ là cờ, không tự đổi trạng thái. |
| BR-ADM-41 | Should | BR-AUTH-35 | Giới hạn theo tài khoản admin: đọc 120 yêu cầu/60 giây, ghi 60 yêu cầu/60 giây; vượt → 429 `rate-limited` + `retryAfterSeconds`. Thao tác bình thường (duyệt 20 đơn liên tiếp) không chạm. |

### 5. Acceptance criteria

Dữ liệu tham chiếu: tài khoản seed `admin@nine2fine.test` (AD), `staff@nine2fine.test` (NV), `member@nine2fine.test` (M). **Đơn A**: khách `a@x.vn`, SĐT `0912345678`, COD, blazer Đen/S × 2 (tổng 2.580.000, tồn trước đặt 5, sau đặt 3), `to_ship`, cần gọi. **Đơn B**: M đã có 1 đơn `completed` (SQL), COD off-duty-top × 1 (tổng 420.000), `to_ship`, không cần gọi. "T" = dữ liệu thử. Giả mất mạng bằng "Block request URL" `*/api/*`. Sửa thời gian bằng SQL.

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-ADM-01 | 01 | Không cookie; cookie `n2f_asid` hết hạn / bị thu hồi; chỉ có `n2f_sid` của M | `GET` danh sách, `GET` chi tiết, `POST` một hành động | Cả ba trường hợp: 401 `unauthenticated`, không có dữ liệu đơn, `Cache-Control: no-store`; đơn không đổi (AC-AUTH-84). |
| AC-ADM-02 | 02 | NV đăng nhập; đơn T ở `to_ship` | NV huỷ lý do `other`; NV bàn giao; AD huỷ `other` đơn T khác | NV `other`: 403 `forbidden`, đơn không đổi, không sự kiện. NV bàn giao: 200. AD `other`: 200 (AC-AUTH-85, diễn đạt lại theo mục 6). |
| AC-ADM-03 | 03 | AD đăng nhập (cookie còn hạn) | (1) SQL hạ AD thành staff, rồi AD (cùng cookie, không đăng nhập lại) gọi huỷ `other` đơn T và `GET` danh sách; (2) SQL đặt `is_active = false` cho tài khoản đó, AD gọi `GET` danh sách | (1) huỷ `other`: 403 `forbidden`, đơn không đổi, không sự kiện; danh sách: 200. (2) 401 `unauthenticated`, không có dữ liệu đơn. Cả hai có hiệu lực ngay ở yêu cầu kế tiếp, không chờ hết phiên, không cần giao diện. Không kiểm việc xoá dòng `sessions`/cookie (→ slice Admin người dùng, AC-AUTH-75). |
| AC-ADM-04 | 04 | `adminOrdersMode: http`; NV ở chi tiết đơn `to_ship` đã xác nhận | Xem hành động; mở menu; mở `/admin/products`; đăng nhập AD xem cùng đơn | NV không thấy "Huỷ với lý do khác"; AD thấy. Menu chỉ "Đơn hàng"; `/admin/products` hiện "Chưa khả dụng", không có dữ liệu mock, không request tới API khác ngoài đơn/đăng nhập. FE chỉ hiện hành động có trong `allowedActions`. |
| AC-ADM-05 | 05 | 45 đơn T | Danh sách mặc định; `page=3`; `page=9`; `limit=51`; `limit=0` | 20 đơn mới nhất trước, `total` 45; trang 3: 5 đơn; trang 9: `items` rỗng, `total` 45; hai lần sau: 422 `validation` `field: limit`. |
| AC-ADM-06 | 06 | Đơn A (mã `N2F2611081801`, người nhận "Nguyễn Văn A") và các đơn khác | `q` = `n2f2611081801`, `#N2F2611081801`, `N2F26110`; `0912345678`, `+84912345678`, `5678`; `A@X.VN`; `nguyen van`; `%`; chuỗi 101 ký tự; rỗng | Mã (đủ và có `#`): đơn A; `N2F26110` (8 ký tự): các đơn đầu mã đó; SĐT: đơn A; `5678`: đơn A (≥ 4 số); email, tên không dấu: đơn A; `%`: 0 đơn (không phải tất cả); 101 ký tự: 422; rỗng: tất cả. |
| AC-ADM-07 | 07 | 10 đơn T: 1 `to_pay`, 2 cần gọi, 1 `to_ship` đã xác nhận + 1 không cần gọi, 1 `to_receive`, 1 `cancel_requested`, 1 `returning`, 1 `completed`, 1 `cancelled` thường | Gọi đếm; mở từng tab; xác nhận một đơn cần gọi | Đếm: `all` 10, `pending-payment` 1, `to-confirm` 2, `to-fulfil` 2, `in-transit` 1, `cancel-requests` 1, `returning` 1, `completed` 1, `cancelled` 1 (tổng 8 tab con = 10); mỗi tab liệt kê đúng đơn của nó. Sau xác nhận: `to-confirm` 1, `to-fulfil` 3. |
| AC-ADM-08 | 08 | Đơn lúc 2026-11-08 00:30 (GMT+7) và đơn lúc 2026-11-07 23:59 (GMT+7); đơn COD và `bank-transfer` (SQL) | `from=to=2026-11-08`; `payment=cod`; `from=2026-11-09&to=2026-11-08`; kết hợp tab + `q` | Lần 1 chỉ đơn 00:30; `payment=cod` loại đơn chuyển khoản; lần 3: 422 `validation`; kết hợp theo AND. |
| AC-ADM-09 | 09 | Đơn A; NV rồi AD | Mở chi tiết theo mã `n2f2611081801` và `#N2F2611081801`; mã lạ | Đủ: 2 dòng blazer Đen/S (tên, SKU, đơn giá, số lượng), tổng 2.580.000, địa chỉ, ghi chú giao hàng, `to_ship` + `pending`, voucher (nếu có), cần gọi; `allowedActions` NV không có `cancel-other`, AD có; SĐT, email đầy đủ. Mã lạ: 404 `not-found`. |
| AC-ADM-10 | 10 | Đơn A; NV ghi cuộc gọi, xác nhận, bàn giao | Xem timeline; thử `PUT`/`DELETE` một sự kiện | Mỗi thao tác đúng 1 dòng, mới nhất trước: giờ GMT+7, `to_ship` → `to_ship`/`to_receive`, người "tên NV (Nhân viên)", dòng đặt hàng đầu tiên là "Khách"; `PUT`/`DELETE` không tồn tại (404/405), số sự kiện không đổi. |
| AC-ADM-11 | 11 | Đơn A đã xác nhận; chèn lỗi giữa bước cộng tồn khi huỷ `declined_on_call`/`other` | AD huỷ | Lỗi 5xx; trạng thái vẫn `to_ship`, tồn blazer Đen/S vẫn 3, lượt voucher không đổi, không có sự kiện, không có thư. Bỏ lỗi, huỷ lại: thành công, đủ 1 sự kiện. |
| AC-ADM-12 | 12 | Đơn A có cuộc gọi, ghi chú nội bộ, xác nhận, bàn giao (mã `GHTK-12345`) | Khách mở tra cứu OTP; thành viên mở `/account/orders/<id>` (đơn B tương tự) | Timeline khách có: đặt hàng, đang vận chuyển kèm đơn vị + `GHTK-12345`; không có lần gọi, ghi chú, tên nhân viên; người = "nine2fine"; JSON không có mã người dùng nhân viên. |
| AC-ADM-13 | 13 | Đơn `completed`, `cancelled`, `to_receive`, `to_ship`, `to_pay` | `completed` → huỷ `other`; `cancelled` → bàn giao; `to_receive` → xác nhận; `to_ship` → giao xong; `to_pay` → bàn giao | Cả 5: 409 `invalid-transition` kèm trạng thái hiện tại; DB, tồn, voucher không đổi; không sự kiện, không thư. |
| AC-ADM-14 | 14 | Đơn T `cancel_requested`, tồn biến thể 3 (đã trừ 2) | Hai NV bấm Duyệt cùng lúc; lặp 20 lần (đơn mới mỗi lần) | Mỗi lần đúng 1 yêu cầu 200 và 1 yêu cầu 409 `order-state-changed`; tồn 5, không bao giờ 7; 1 sự kiện duyệt; 1 email; lượt voucher trả 1 lần. |
| AC-ADM-15 | 14 | Đơn T `cancel_requested` | NV1 Duyệt và NV2 Từ chối cùng lúc; lặp 20 lần | Mỗi lần đúng 1 bên thắng; trạng thái cuối khớp bên thắng (`cancelled` + tồn cộng, hoặc `to_ship` + tồn không đổi), không lẫn; đúng 1 email, đúng loại. |
| AC-ADM-16 | 15 | NV1 mở đơn A `to_ship` đã xác nhận; NV2 đã bàn giao đơn đó | NV1 bấm Bàn giao; NV1 bấm đúp trong 300 ms trên đơn khác | NV1: 409 `order-state-changed`, FE tải lại hiện `to_receive` và "Đơn vừa được cập nhật bởi người khác."; không sự kiện trùng, không thư thứ hai. Bấm đúp: 1 request `POST`. |
| AC-ADM-17 | 15 | NV bấm Bàn giao, đã nhập `GHTK-12345` | (a) chặn mạng trước khi gửi; (b) chặn mạng ngay sau khi gửi (máy chủ đã xử lý); bỏ chặn, bấm Thử lại | (a) báo lỗi, giữ dữ liệu nhập, trạng thái vẫn `to_ship`. (b) báo lỗi; "Thử lại" tải lại đơn trước, hiện `to_receive`, không gửi bàn giao lần hai, 1 sự kiện, 1 thư. |
| AC-ADM-18 | 16 | Đơn A (cần gọi); đơn B (không cần gọi); đơn `completed` | Ghi "không liên lạc được" cho A (ghi chú 250 và 251 ký tự); cho B; cho `completed` | A: 1 sự kiện mỗi lần hợp lệ, vẫn `to_ship`, vẫn tab `to-confirm`; 251 ký tự: 422. B và `completed`: 409 `invalid-transition`. |
| AC-ADM-19 | 17 | Đơn A | "Khách xác nhận"; lần hai; kiểm tab | Lần 1: lưu giờ + người, vẫn `to_ship`, sang `to-fulfil`; lần 2: 409 `invalid-transition`. |
| AC-ADM-20 | 18 | Đơn A có 2 lần "không liên lạc được"; đơn A2 có lần 1 lúc t, lần 2 lúc t+23 giờ, lần 3 lúc t+25 giờ (SQL); đơn A3 có 3 lần trong 2 giờ; đơn A4 có lần lúc t, t+30 giờ, t+31 giờ, t+32 giờ; đơn A5 có lần lúc t, t+12 giờ, t+24 giờ; đơn A6 có lần lúc t, t+12 giờ, t+24 giờ 01 phút | Huỷ `unreachable` từng đơn | A: 409 `condition-not-met`. A2: 409 (không có 3 lần nào trong 24 giờ). A3: 200. A4: 200 (cửa sổ bất kỳ, lần đầu quá xa không cản). A5: 200 (đúng 24 giờ vẫn tính). A6: 409. Sau 409, `allowedActions` không có `unreachable`; đơn vẫn `to_ship`, không đổi cờ. |
| AC-ADM-21 | 18, 25, 28 | Đơn A3 (blazer × 2, tồn 3, dùng `N2FWELCOME15` còn hạn) | Huỷ `unreachable` thành công | `cancelled`, `cancelledBy = shop`, thanh toán `pending`, tồn 5, lượt voucher được trả; email chứa "Chúng tôi không liên lạc được với bạn để xác nhận đơn."; `delivery_refused_at` rỗng. |
| AC-ADM-22 | 19 | Đơn A chưa xác nhận; đơn A đã xác nhận; đơn B | Huỷ `declined_on_call` từng đơn | Chưa xác nhận: 200 `cancelled`, tồn hoàn, email "Bạn đã báo không muốn nhận đơn."; đã xác nhận: 409 `invalid-transition`; B (không cần gọi): 409. |
| AC-ADM-23 | 20 | Đơn B `to_ship` | Bàn giao: đơn vị 1 / 51 ký tự; mã `abc` (3), `ab c!`, 41 ký tự; mã trùng đơn T khác chưa huỷ | Mỗi lần 422 `validation` đúng `field`; đơn không đổi. Mã trùng đơn **đã huỷ**: hợp lệ. |
| AC-ADM-24 | 20 | Đơn A chưa xác nhận; đơn A đã xác nhận; đơn B | Bàn giao đơn vị `GHTK`, mã `ghtk-12345` | Chưa xác nhận: 409 `condition-not-met`. Đã xác nhận và B: 200 `to_receive`, mã lưu `GHTK-12345`, có giờ bàn giao, tồn không đổi (3), thanh toán `pending`, ngày giao dự kiến không đổi; bàn giao lần hai: 409. |
| AC-ADM-25 | 21, 35 | Đơn B có email Gmail thật | Bàn giao | Thư trong ≤ 5 phút, tiêu đề "nine2fine – Đơn #{mã} đã được giao cho đơn vị vận chuyển", có đơn vị, mã vận đơn, ngày giao dự kiến, tổng, địa chỉ, câu chống lừa đảo. Hai NV bàn giao cùng lúc: 1 thư. |
| AC-ADM-26 | 22 | Đơn `to_receive`; đơn `to_ship` | Giao thành công; lần hai; giao đơn `to_ship` | `completed` + `paid`, có giờ thu tiền (GMT+7), 1 sự kiện; lần hai: 409; `to_ship`: 409 `invalid-transition`. |
| AC-ADM-27 | 22 | Đơn `completed` | NV/AD huỷ `other`, bàn giao, duyệt; khách huỷ qua API khách | Admin: 409 `invalid-transition`; khách: 409 `not-cancellable`; không đổi gì. |
| AC-ADM-28 | 23, 35 | Đơn COD có email Gmail thật | Giao thành công | Thư trong ≤ 5 phút, tiêu đề "nine2fine – Đơn #{mã} đã giao thành công", đủ mục BR-ADM-23, không có lời mời đánh giá. |
| AC-ADM-29 | 24 | Đơn `to_ship` cần gọi; đơn `to_receive` | NV: `refused`, `undeliverable`, `unreachable` ở trạng thái sai; AD: `other` với ghi chú rỗng / 4 / 5 / 251 ký tự | `refused`/`undeliverable` ở `to_ship` và `unreachable` ở `to_receive`: 409 `invalid-transition`. `other`: 422 với rỗng, 4, 251; 200 với 5 ký tự, ở cả `to_ship` và `to_receive`; `cancelledBy = shop`. |
| AC-ADM-30 | 25 | Đơn 3 dòng (blazer Đen/S × 2, off-duty-top × 1, weekend-shirt × 1) dùng mã T còn hạn; đơn khác dùng mã `TEXP` hết hạn sau khi đặt | AD huỷ từng đơn; huỷ lần hai (bất kỳ đường nào) | Mỗi biến thể được cộng đúng số lượng đã trừ (blazer Đen/S +2, off-duty-top +1, weekend-shirt +1; đơn `TEXP` cộng đúng số đã trừ của nó); `stock_restored_at` có; lượt mã T trả, lượt `TEXP` không trả; lần hai 409, tồn không đổi. |
| AC-ADM-31 | 26 | Đơn A đã bàn giao (`to_receive`), voucher còn hạn; SĐT `0912345678` chưa có từ chối | Huỷ `refused` | `cancelled`, `delivery_refused_at` có, tồn vẫn 3 (chưa hoàn), lượt voucher trả, vào tab `returning`, email "Đơn không được nhận khi giao hàng.". |
| AC-ADM-32 | 26 | Hai đơn của SĐT `0912345678` bị `refused` trong 6 tháng; đơn thứ ba của SĐT khác bị `undeliverable` và `other` | Vào checkout bằng `0912345678`; bằng SĐT thứ hai | `0912345678`: COD khoá kèm lý do (AC-CHK-24, dữ liệu thật). SĐT thứ hai: COD mở, `delivery_refused_at` rỗng. |
| AC-ADM-33 | 27 | Đơn `returning` (blazer × 2, tồn 3) | `restocked`; lần hai; đồng thời 2 NV (lặp 20 lần) | Tồn 5, có giờ hoàn kho, 1 sự kiện, trạng thái vẫn `cancelled`; lần hai 409; đồng thời: đúng 1 thành công, tồn không bao giờ 7. |
| AC-ADM-34 | 27 | Đơn `returning` A; đơn đã hoàn kho do huỷ từ `to_ship` | `written_off` với ghi chú rỗng / 4 / 5 ký tự; `restocked` đơn đã hoàn kho | Rỗng/4: 422; 5: 200, tồn không đổi, 1 sự kiện, rời tab `returning` sang `cancelled`; đơn đã hoàn kho: 409 `invalid-transition`; `written_off` xong thì `restocked`: 409. |
| AC-ADM-35 | 28, 35 | Đơn có email Gmail thật huỷ do shop lý do `other` ghi chú "nội bộ: lệch kho" | AD huỷ | Thư "đơn đã huỷ" trong ≤ 5 phút, lý do "nine2fine không thể thực hiện đơn này.", không chứa "lệch kho"; không có thông tin hoàn tiền. |
| AC-ADM-36 | 29 | M có đơn B `to_ship` (đã xác nhận) | M bấm Huỷ (lý do 250 ký tự; 251 ký tự); bấm Huỷ lần hai | 251: 422. 250: đơn `cancel_requested` (không `cancelled`), tồn và lượt voucher không đổi, thanh toán `pending`, lưu giờ + lý do; lần hai: 409 `not-cancellable`; tab `cancel-requests` có đơn. |
| AC-ADM-37 | 29 | Đơn `to_pay` (SQL); đơn `to_receive`; khách vãng lai đơn A qua OTP | Huỷ từng đơn | `to_pay`: huỷ ngay (BR-CHK-23); `to_receive`: 409 `not-cancellable`; đơn A qua OTP: `cancel_requested`. Cập nhật AC-CHK-29 dòng `to_ship`. |
| AC-ADM-38 | 30 | Đơn `cancel_requested` của M, dùng mã còn hạn | NV duyệt | `cancelled`, `cancelledBy = customer`, sự kiện ghi tên NV duyệt, tồn cộng, lượt voucher trả, thanh toán không đổi, email "nine2fine – Yêu cầu huỷ đơn #{mã} đã được duyệt". Duyệt lần hai: 409. |
| AC-ADM-39 | 31 | Đơn `cancel_requested` (B đã xác nhận) | NV từ chối với lý do rỗng, 4, 5 ký tự; khách gửi yêu cầu mới | 422, 422, 200: `to_ship`, vẫn đã xác nhận, tồn không đổi, email có lý do và hotline. Yêu cầu mới: 409 `not-cancellable`, FE hiện hướng dẫn gọi hotline. |
| AC-ADM-40 | 32, 14 | Đơn `cancel_requested`; đơn `to_ship` | NV ghi cuộc gọi, xác nhận, bàn giao, giao xong, huỷ `other` trên đơn đầu; đồng thời khách yêu cầu huỷ và NV bàn giao đơn sau (lặp 20 lần) | 5 thao tác đầu: 409 `invalid-transition`. Đồng thời: mỗi lần đúng 1 bên thắng (`to_receive` và yêu cầu huỷ 409, hoặc `cancel_requested` và bàn giao 409), không có đơn vừa `to_receive` vừa có yêu cầu huỷ. |
| AC-ADM-41 | 33 | Đơn M ở `cancel_requested`, `to_receive` (mã `GHTK-12345`), `completed`, `to_ship` | Xem `/account/orders/<id>` và trang tra cứu từng đơn | "Đang chờ duyệt huỷ" + "Đã gửi yêu cầu huỷ" không có nút Huỷ; "Đang vận chuyển" + đơn vị + mã vận đơn; "Hoàn thành"; `to_ship`: nút Huỷ ghi "gửi yêu cầu huỷ". |
| AC-ADM-42 | 34 | Gây từng lỗi của AC-ADM-01, 02, 05, 09, 13, 14, 20, 23, 36 và tắt DB | Xem phản hồi và FE | Mỗi lỗi đúng `code` và HTTP của BR-ADM-34; không stack trace/SQL; FE hiện đúng câu, không trang trắng. |
| AC-ADM-43 | 35 | SMTP lỗi | Bàn giao một đơn | 200 `to_receive`; hệ thống thử lại 3 lần, sau đó có thư báo CSKH (hoặc log nếu SMTP vẫn hỏng); đơn không bị đổi lại; log không có email đầy đủ. |
| AC-ADM-44 | 36 | `adminOrdersMode: http`, `mode: mock`; rồi `adminOrdersMode: mock` | Đăng nhập admin, mở `/admin`, `/admin/orders`, một đơn; chạy Playwright `admin` | `http`: có request `/api/admin/...`, `/admin` → `/admin/orders`, không còn menu mock. `mock`: không có request `/api/admin/orders`; số test pass của `admin.spec.ts` không giảm so với trước Slice 4. |
| AC-ADM-45 | 37 | DB Supabase ở schema Slice 3 có đơn thật (vd. N2F2611082686 đã huỷ) | `migrate deploy` 2 lần; mở đơn cũ trong admin; thử huỷ lại | Chỉ thêm đối tượng, không `DROP`/`TRUNCATE`/`DELETE`/đổi kiểu; lần 2 không đổi; bảng mới bật RLS; đơn cũ hiện timeline "Khách"/"Hệ thống"; huỷ lại đơn đã `cancelled`: 409. |
| AC-ADM-46 | 38 (Should) | Đơn A | NV ghi chú 500 và 501 ký tự | 500: 1 sự kiện trong timeline admin, không hiện cho khách; 501: 422. |
| AC-ADM-47 | 39 (Should) | Đơn `to_receive` COD | Bấm In phiếu giao | Phiếu có đủ mục BR-ADM-39, số tiền thu = tổng thanh toán; đơn `cancelled`: không có nút. |
| AC-ADM-48 | 40 (Should) | Đơn cần gọi tạo cách đây 3 giờ làm việc; `cancel_requested` 25 giờ; `to_receive` quá ngày dự kiến | Mở danh sách | Cả ba có cờ "quá hạn"; đơn trong hạn không có cờ; trạng thái không tự đổi. |
| AC-ADM-49 | 41 (Should) | Một tài khoản admin | 121 yêu cầu đọc/60 giây; 61 yêu cầu ghi/60 giây; duyệt 20 đơn liên tiếp | Yêu cầu thứ 121 / 61: 429 `rate-limited` + `retryAfterSeconds`; 20 lần duyệt không bị chặn. (Cơ chế đếm theo tài khoản là chi tiết BE.) |
| AC-ADM-50 | 24 | Đơn A chưa xác nhận; đơn B; đơn A2 đã xác nhận (đều `to_ship`, dùng mã T còn hạn); đơn `to_receive`; đơn `cancel_requested` | NV huỷ `customer_request` với ghi chú rỗng / 4 / 5 / 251 ký tự; NV huỷ `customer_request` A, A2, B; thử đơn `to_receive` và `cancel_requested` | Rỗng, 4, 251: 422. 5 ký tự: 200 cho A, A2, B: `cancelled`, `cancelledBy = customer`, tồn hoàn đúng 1 lần, lượt voucher trả, thanh toán `pending`, 1 sự kiện ghi tên NV, email "Đơn đã được huỷ theo yêu cầu của bạn.", không chứa ghi chú nội bộ, `delivery_refused_at` rỗng; `to_receive` và `cancel_requested`: 409 `invalid-transition`; lần hai: 409. |

Tổng: **41 BR** — 37 Must, 4 Should (BR-ADM-38..41); Không còn BR chờ xác nhận (Thắng nhận mặc định Q1–Q7 ngày 2026-11-08; Q8 mở nhưng không chặn). **50 AC** — 46 Must (AC-ADM-50 thêm 2026-11-08 cho `customer_request`), 4 Should (AC-ADM-46..49). Nguồn không dùng thành BR: CHK-PAY-04 (xem hàng khi nhận, chính sách giao nhận), hoàn tiền (CHK-PAY-10, 12; QR chưa bật), COMMON-01..03 (không có nội dung).

### 6. Định nghĩa xong của Slice 4

- Mọi AC Must đạt trong `docs/qa/report-slice-4-admin-orders.md`; AC Should ghi rõ làm hay hoãn; không còn AC chờ xác nhận.
- **AC hoãn từ Slice 1 (decisions 2026-11-07: slice được giao không đóng nếu chưa kiểm):**
  - **AC-AUTH-84 → Slice 4**, kiểm bằng AC-ADM-01 (đây là API admin đầu tiên).
  - **AC-AUTH-85 → Slice 4 theo tinh thần, diễn đạt lại:** Slice 4 chưa có API "cài đặt nhân viên", nên kiểm bằng AC-ADM-02 (staff gọi hành động chỉ admin → `forbidden`, admin → được). Phần chữ nguyên văn "API cài đặt nhân viên" chuyển sang slice Admin người dùng cùng AC-AUTH-75.
  - **AC-AUTH-75 → slice Admin người dùng** (cần giao diện vô hiệu hoá / đổi vai trò, Slice 4 không có). Slice 4 chỉ kiểm phần cốt lõi bằng SQL ở AC-ADM-03 (vai trò/trạng thái đọc lại mỗi yêu cầu). Backlog G4 cập nhật tương ứng; **cần Orchestrator ghi `decisions.md`** vì đổi nơi nhận AC đã chốt ngày 2026-11-07.
- AC-AUTH-88 vẫn → Account; AC-AUTH-89, 95a, 95b → trước go-live (xem backlog).
- Một đơn COD thật trên Supabase chạy đủ hai nhánh (đặt → gọi xác nhận → bàn giao → giao xong; đặt → khách yêu cầu huỷ → duyệt), mỗi nhánh có thư Gmail thật khớp nội dung (như AC-CHK-34 của Slice 3).
- `openapi.yaml` có API admin đơn hàng (danh sách, đếm, chi tiết, mọi hành động, mã lỗi BR-ADM-34) và thay đổi huỷ phía khách (`cancel_requested`); `assumptions.ts` bỏ `to_ship` khỏi `customerCancellableFrom`.
- FE chạy `adminOrdersMode: http` với BE thật; Playwright mock pass nguyên (AC-ADM-44); phần storefront đổi (BR-ADM-33) có test.
- Migration chỉ cộng thêm; quyết định ghi `decisions.md`; bàn giao ghi `handoff.md`. M-1 (vitest crash, Slice 3) vẫn là điều kiện chung của DoD.

### 7. Câu hỏi mở

Mỗi câu có mặc định để làm trước; trả lời khác thì sửa BR liên quan. Ngày 2026-11-08 Thắng nhận mặc định của Q1–Q7 (ghi `decisions.md`); Q8 còn mở (cần nội dung tài liệu, không phải có/không); Q9 nhận mặc định ngày 2026-11-08 (Thắng được báo, không phản đối). Để khỏi nhầm với "Q4" của Slice 3, câu hỏi của Slice 4 gọi là **S4-Q1..S4-Q9** (số cột `#` dưới đây), câu của Slice 3 gọi là S3-Q#.

| # | Câu hỏi | Ảnh hưởng | Cần ai / trạng thái |
| --- | --- | --- | --- |
| 1 | Chuyển S3-Q4 (câu hỏi 4 của Slice 3): từ khi Slice 4 phát hành, khách ở `to_ship` chỉ **gửi yêu cầu huỷ** (shop duyệt) thay vì huỷ thẳng? **Mặc định PO: có**, đổi cùng lát có màn duyệt (4.5) để không có yêu cầu mồ côi; hệ quả: tồn của đơn bị yêu cầu huỷ giữ cho tới khi shop quyết định. | BR-ADM-29..33, BR-CHK-23, AC-CHK-29 | Thắng: nhận mặc định (2026-11-08); không còn chặn lát 4.5 |
| 2 | Đơn bị từ chối nhận/giao không thành: tồn cộng ngay khi huỷ, hay chỉ khi nhân viên xác nhận hàng đã về kho? **Mặc định PO: hai bước** (huỷ ngay, cộng tồn khi hàng về, có tuỳ chọn "hàng hỏng/mất, không cộng") vì CHK-PAY-07 nói "hoàn kho khi hàng về kho"; phương án một bước đơn giản hơn nhưng có thể bán hàng chưa về. | BR-ADM-26, 27; AC-ADM-31, 33, 34 | Thắng: nhận mặc định (2026-11-08); không còn chặn lát 4.4 |
| 3 | Giờ làm việc và hạn cho cờ quá hạn (Should): "2 giờ làm việc" gọi xác nhận tính trong khung nào; hạn duyệt yêu cầu huỷ? **Mặc định PO:** 08:00–18:00, thứ Hai đến thứ Bảy; duyệt huỷ trong 24 giờ; chỉ cờ, không tự đổi trạng thái, không tự duyệt. | BR-ADM-40 | Thắng: nhận mặc định (2026-11-08); chỉ lát 4.6 |
| 4 (S4-Q4) | Phân quyền: staff huỷ được các lý do cố định và duyệt/từ chối yêu cầu huỷ; chỉ admin huỷ lý do "khác". Đúng ý? **Mặc định PO:** như BR-ADM-02 (nguồn CHK-PAY-06, 07 cho "admin/staff"; FE hiện đang cấm staff huỷ). Từ 2026-11-08 staff có 5 lý do (thêm `customer_request`, khách gọi hotline xin huỷ đơn `to_ship`), PO quyết để không buộc admin xử lý ca thường ngày; cách khác (khách chỉ dùng yêu cầu huỷ trên web) bị loại vì khách gọi điện sẽ không có người huỷ được. | BR-ADM-02, 24; AC-ADM-50; ma trận FE | Thắng: nhận mặc định (2026-11-08); `customer_request` do PO bổ sung cùng ngày |
| 5 | Đơn vị vận chuyển: nhập tự do (2–50 ký tự) hay chọn từ danh mục cố định (GHN, GHTK, Viettel Post, J&T...)? **Mặc định PO:** nhập tự do, FE gợi ý các tên hay dùng. | BR-ADM-20 | Thắng: nhận mặc định (2026-11-08) |
| 6 | Khách bị từ chối yêu cầu huỷ có được gửi yêu cầu thứ hai? **Mặc định PO: không** (1 yêu cầu/đơn, sau đó gọi hotline) để tránh vòng lặp; đơn vẫn giao bình thường. | BR-ADM-31; AC-ADM-39 | Thắng: nhận mặc định (2026-11-08) |
| 7 | Nội dung email mới (4 loại: bàn giao, giao xong, yêu cầu huỷ duyệt/từ chối) và 5 câu lý do huỷ do shop (BR-ADM-28): đúng giọng nine2fine? **Mặc định PO:** dùng chữ ở BR; Thắng sửa chữ khi đọc thư thật ở bước nghiệm thu. | BR-ADM-21, 23, 28, 30, 31 | Thắng: nhận mặc định (2026-11-08); PO soạn chữ, Thắng sửa sau khi đọc thư thật |
| 8 | Nội dung COMMON-01 (bước chuyển trạng thái), COMMON-03 (trừ/hoàn kho) vẫn chưa có (Slice 3 câu hỏi 1). Slice 4 xây trên bảng chuyển của BR-ADM-13 do PO suy ra từ CHK-PAY-14. **Mặc định PO:** dùng bảng này; Thắng gửi COMMON nếu có điểm khác thì PO sửa. | BR-ADM-13, 25..27 | Thắng — **còn mở** (cần Thắng gửi nội dung COMMON-01..03; không chặn làm, dùng bảng BR-ADM-13) |
| 9 | Hạng mục PO tự bổ sung ngoài nguồn: huỷ `declined_on_call`; kiểm "3 lần trong 24 giờ" (cửa sổ 24 giờ bất kỳ, BR-ADM-18); mã vận đơn không trùng; staff thấy SĐT/email đầy đủ. Đồng ý? **Mặc định PO: đồng ý.** | BR-ADM-09, 18, 19, 20 | Thắng — **nhận mặc định 2026-11-08** (được báo, không phản đối) |



---

## Slice 5: Account

Nguồn chính: master plan mục 20 (cấu trúc Account, ràng buộc UX), Slice 1 (BR-AUTH-11, 20, 21, 26, 29, 35, 36; AC-AUTH-29, 68, 88; backlog 1.16), Slice 3 (BR-CHK-04, 06, 27; backlog 3.10 "sổ địa chỉ ở checkout"), Slice 4 (đơn `completed` là nguồn chi tiêu). Thắng chốt Slice 5 = Account (decisions 2026-11-08) và giao toàn quyền tự quyết giả định trong slice này (không hỏi lại); mọi giả định PO tự chốt ghi ở mục 7 và `decisions.md`. Hiện trạng đã đọc: FE `frontend/src/app/features/account/**` (Figma `193:2522`, chạy mock; `HttpAccountApi` gọi `/api/account/*` chưa có ở BE), `features/checkout/checkout-page.ts` (đã có ô "Địa chỉ đã lưu" nhưng chỉ bật ở mock, K21); BE: chưa có module account; bảng `addresses` (baseline: `district`, `city` NOT NULL, không có mã tỉnh/phường, 0 dòng trên Supabase), `membership_tiers` (0 dòng), `users.phone_number`, `date_of_birth`, `password_hash`. Mã BR: `BR-ACC`. Tên endpoint/trường do Backend chốt trong `openapi.yaml`. Tiền là số nguyên đồng; múi giờ Asia/Ho_Chi_Minh.

### 1. Vấn đề và mục tiêu

**Vấn đề.** Khu `/account` ở bản thật (HTTP) chỉ có phần đơn hàng (Slice 3); hồ sơ hiện câu "chưa thể chỉnh sửa", không tạo/đổi được mật khẩu (thành viên đăng ký bằng mã không có cách đặt mật khẩu ngoài "quên mật khẩu"), sổ địa chỉ, hạng thành viên và ưu đãi chỉ chạy dữ liệu mock; checkout bắt thành viên gõ lại địa chỉ mỗi lần.

**Mục tiêu.**
1. Thành viên xem họ tên đầy đủ, sửa ngày sinh và số điện thoại trên dữ liệu thật.
2. Thành viên tạo mật khẩu (nếu chưa có) hoặc đổi mật khẩu; thiết bị khác bị đăng xuất; có thư báo.
3. Sổ địa chỉ thật (tối đa 10, đúng một mặc định) và checkout dùng được địa chỉ đã lưu.
4. Hạng thành viên và ưu đãi hiển thị từ dữ liệu thật thay vì mock.
5. Ở HTTP không còn dữ liệu mock trong Account; đóng AC hoãn AUTH-88 (và AUTH-29 phần hiển thị).

**Không phải mục tiêu.** Đổi giao diện Account (master plan 20: giữ thiết kế); đổi email; xoá tài khoản; đăng xuất mọi thiết bị theo yêu cầu; trả hàng/hoàn tiền; ví voucher cá nhân / voucher theo hạng; tích điểm; đồng bộ wishlist (P1 riêng).

### 2. Phạm vi

| Hạng mục | Mức | Nguồn | Lý do |
| --- | --- | --- | --- |
| API account chỉ nhận phiên storefront; 401 khác 403 | Must | BR-AUTH-26, 34; AC-AUTH-88 | AC hoãn từ Slice 1. |
| Hồ sơ: xem (email, họ tên đầy đủ, ngày sinh, SĐT, có mật khẩu chưa), sửa ngày sinh + SĐT | Must | master plan 20; AC-AUTH-29 | Thiết kế hiện có chỉ cho sửa 2 trường này. |
| Tạo / đổi mật khẩu ở Profile | Must | backlog 1.16; BR-AUTH-20, 21, 29 | Dời từ Slice 1. |
| Sổ địa chỉ: thêm, sửa, xoá, đặt mặc định; tỉnh/phường theo danh mục Slice 3 | Must | master plan 20; BR-CHK-06 | Một nửa màn Account. |
| Checkout thành viên chọn địa chỉ đã lưu, tự điền địa chỉ mặc định + hồ sơ | Must | backlog 3.10 | Sổ địa chỉ không dùng ở checkout thì vô ích. |
| Cờ `accountMode` (http bản thường / mock e2e); không mock ở HTTP | Must | backlog "Dọn mock" | Điều kiện go-live G5. |
| Hạng thành viên từ chi tiêu đơn `completed` trong năm | Should | master plan 20 (khối membership đã thiết kế) | Có dữ liệu thật từ Slice 4; ngưỡng do PO chốt (mục 7). |
| Ưu đãi: danh sách mã công khai đang dùng được | Should | — | Thay mock; ví cá nhân chưa có bảng. |
| Thư "mật khẩu đã thay đổi" sau tạo/đổi | Should | BR-AUTH-22 (cùng thư) | Cảnh báo bảo mật. |
| "Lưu địa chỉ này vào sổ" ở checkout | Won't | — | Thêm bước vào luồng đặt hàng; làm sau. |
| Sửa họ tên, đổi email, xoá tài khoản, đăng xuất mọi thiết bị | Won't | Slice 1 Won't | Cần xác minh / quy trình riêng. |
| Địa chỉ trả hàng (`isReturn`), yêu cầu trả hàng, ảnh trả hàng | Won't | VC-13 | Chưa có quy trình trả hàng (Slice 4 4.8). Ở HTTP ẩn. |
| Voucher theo hạng / ví cá nhân / tích điểm | Won't | CHK-VC-08 | Chưa có bảng gán voucher cho người. |

### 3. Hiện trạng và hành vi được chọn

| # | Điểm | Hiện trạng | Chọn | Lý do |
| --- | --- | --- | --- | --- |
| K1 | Bảng `addresses` | `district`, `city` NOT NULL, chữ tự do, không mã. | Migration cộng thêm: `province_code`, `ward_code` (FK danh mục), `updated_at`; `district`, `city` cho phép NULL (được phép theo decisions 2026-11-07); index duy nhất một mặc định mỗi người; index `user_id`. Không xoá cột. | Danh mục địa giới Slice 3 là nguồn duy nhất; Supabase 0 dòng. |
| K2 | Hồ sơ HTTP | `accountLive` chỉ hiện email + họ tên, câu "chưa thể chỉnh sửa". | Ở HTTP hiện email, "Họ và tên" (Họ + Tên, AC-AUTH-29), Mật khẩu, Sinh nhật, SĐT; bỏ câu "chưa thể chỉnh sửa". | Thiết kế mock đã có đủ. |
| K3 | Hạng thành viên | Mock: Bronze → Silver 18.000.000 → Gold 40.000.000, "cập nhật sau" ngày xét. `membership_tiers` trống. | Ngưỡng ở `ASSUMPTIONS` BE (không seed bảng); chi tiêu = tổng `total` đơn `completed` của thành viên, `delivered_at` (hoặc `created_at` nếu thiếu) trong năm dương lịch hiện tại (giờ VN); ngày xét = 31/12. Không lưu hạng vào `users`. | Không cần job; số đúng ngay khi đơn hoàn thành. |
| K4 | Ưu đãi | Mock: ví cá nhân có `expiresAt` bắt buộc. | HTTP: mã `is_active`, trong thời gian, còn lượt chung và lượt riêng của thành viên, không phải `first_order_only` khi đã có đơn. `expiresAt` có thể null ("Không thời hạn"). | Không có bảng gán. |
| K5 | Trả hàng | Nút "Yêu cầu trả hàng" + màn trả hàng (mock). | Ở HTTP ẩn nút và route trả về "Chưa khả dụng" (đã ẩn sẵn ở Slice 3 theo `checkoutMode`; giữ). | Won't. |
| K6 | Checkout | Ô "Địa chỉ đã lưu" chỉ bật ở mock. | Bật theo `accountMode`; chọn địa chỉ điền người nhận, SĐT, tỉnh, phường, số nhà; mặc định chọn sẵn địa chỉ mặc định nếu khách chưa gõ gì. SĐT hồ sơ điền ô SĐT nếu trống. | K21 Slice 3. |

### 4. Business Rules

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-ACC-01 | Must | BR-AUTH-26, 34; AC-AUTH-88 | Mọi API `/account/*` chỉ nhận phiên storefront (`n2f_sid`) còn hạn của tài khoản đang hoạt động (mọi vai trò đăng nhập storefront đều dùng được, dữ liệu là của chính người đó). Không có / hết hạn / bị thu hồi / chỉ có `n2f_asid` → 401 `unauthenticated`. Phản hồi `Cache-Control: no-store`. FE gặp 401 → về `/auth/login?returnUrl=<trang hiện tại>` (BR-AUTH-26), giỏ còn nguyên. 401 (chưa đăng nhập) và 403 `forbidden` (staff gọi hành động chỉ admin, BR-ADM-02) là hai mã khác nhau. |
| BR-ACC-02 | Must | — | Giới hạn tần suất theo tài khoản: đọc 120 / 60 giây, ghi 30 / 60 giây → 429 `rate-limited` + `retryAfterSeconds` + `Retry-After`. |
| BR-ACC-03 | Must | AC-AUTH-29 | Hồ sơ trả: email, `firstName`, `lastName`, `birthDate` (YYYY-MM-DD hoặc null), `phone` (hoặc null), `hasPassword`. Không bao giờ trả băm mật khẩu (BR-AUTH-21). FE hiện "Họ và tên" = `lastName + " " + firstName`. |
| BR-ACC-04 | Must | BR-AUTH-11; decisions 2026-11-07 (13 tuổi) | Sửa hồ sơ chỉ nhận `birthDate`, `phone` (trường khác bị bỏ qua; gửi không trường nào → 422 `validation`). `birthDate`: null (xoá) hoặc ngày có thật 01/01/1900 – trước hôm nay (giờ VN), sai → 422 `validation` `field: birthDate`; chưa đủ 13 tuổi → 422 `underage`. `phone`: null (xoá) hoặc SĐT di động VN theo BR-CHK-04 (chuẩn hoá `+84` → `0`, khoảng trắng bỏ), sai → 422 `validation` `field: phone`. Trả hồ sơ mới. |
| BR-ACC-05 | Must | BR-AUTH-20, 21; backlog 1.16 | Đặt mật khẩu: `newPassword` theo BR-AUTH-20 (8–64 ký tự, ≥ 1 chữ hoa, ≥ 1 chữ số, không trùng email không phân biệt hoa thường) → sai 422 `validation` `field: newPassword`. Tài khoản chưa có mật khẩu: `currentPassword` phải null/không gửi (tạo). Đã có: `currentPassword` bắt buộc (thiếu → 422 `validation` `field: currentPassword`), sai → 422 `invalid-password` `field: currentPassword`; mật khẩu mới trùng mật khẩu hiện tại → 422 `validation` `field: newPassword` ("Mật khẩu mới phải khác mật khẩu hiện tại."). |
| BR-ACC-06 | Must | BR-AUTH-18 (tinh thần) | Sai mật khẩu hiện tại 5 lần liên tiếp (mỗi lần cách ≤ 15 phút) → khoá đổi mật khẩu 15 phút: 429 `password-locked` + `retryAfterSeconds`, kể cả khi lần sau nhập đúng. Đổi thành công xoá bộ đếm này và bộ đếm sai mật khẩu đăng nhập của email. |
| BR-ACC-07 | Must | BR-AUTH-29 | Tạo/đổi thành công: lưu băm mới; **mọi phiên khác** của tài khoản (storefront và admin) kết thúc ngay; phiên hiện tại giữ (khách không bị đăng xuất). Phản hồi 204. |
| BR-ACC-08 | Should | BR-AUTH-22 | Sau tạo/đổi thành công gửi thư "mật khẩu đã thay đổi" (cùng mẫu với đặt lại mật khẩu), gửi nền, lỗi thư không làm hỏng thao tác. |
| BR-ACC-09 | Must | BR-CHK-04, 06 | Địa chỉ gồm: người nhận (NFC, cắt khoảng trắng, gộp khoảng trắng, 1–100 ký tự), SĐT (BR-CHK-04), tỉnh/thành + phường/xã theo danh mục Slice 3 (phường phải thuộc tỉnh, sai → 422 `invalid-address`), số nhà/đường (5–200 ký tự sau cắt, gộp khoảng trắng, cùng quy tắc ô số nhà của checkout), cờ mặc định. Trả kèm tên tỉnh/phường hiện tại từ danh mục. |
| BR-ACC-10 | Must | master plan 20 | Tối đa 10 địa chỉ mỗi tài khoản; thêm cái thứ 11 → 422 `validation` `field: addresses` ("Bạn chỉ lưu được tối đa 10 địa chỉ."). |
| BR-ACC-11 | Must | master plan 20 ("Address có default state") | Có ít nhất 1 địa chỉ thì có **đúng 1** mặc định (DB bảo đảm). Địa chỉ đầu tiên luôn là mặc định. Thêm/sửa với `isDefault: true` hoặc "Đặt làm mặc định" → địa chỉ đó mặc định, cái cũ bỏ cờ, trong một giao dịch. Sửa địa chỉ mặc định với `isDefault: false` → vẫn mặc định (phải chọn cái khác làm mặc định). Xoá địa chỉ mặc định → địa chỉ tạo gần nhất còn lại thành mặc định. |
| BR-ACC-12 | Must | master plan 20 ("Delete action cần confirm") | Xoá cần hộp thoại xác nhận ở FE; xoá là vĩnh viễn; đơn đã đặt không bị ảnh hưởng (đơn chụp địa chỉ riêng). Địa chỉ của người khác hoặc không tồn tại → 404 `not-found` (sửa, xoá, đặt mặc định). |
| BR-ACC-13 | Must | — | Danh sách địa chỉ: mặc định trước, còn lại mới tạo trước. |
| BR-ACC-14 | Must | backlog 3.10; K6 | Checkout thành viên (HTTP): tải hồ sơ + sổ địa chỉ; ô "Địa chỉ đã lưu" có các địa chỉ và "Địa chỉ mới"; khách chưa gõ ô người nhận/SĐT/số nhà/tỉnh thì chọn sẵn địa chỉ mặc định và điền các ô; ô trống họ tên/email/SĐT lấy từ hồ sơ. Lỗi tải hồ sơ/sổ địa chỉ không chặn checkout (form trống như khách). Đơn vẫn chụp địa chỉ vào đơn như Slice 3. |
| BR-ACC-15 | Should | K3 | Hạng: `bronze` (0), `silver` (≥ 18.000.000), `gold` (≥ 40.000.000) theo chi tiêu năm hiện tại (K3); trả `tier`, `spent`, `nextTierAt` (null ở Gold), `reviewDate` (31/12 năm hiện tại). Đơn khách vãng lai trùng email không tính (CHK-05). |
| BR-ACC-16 | Should | K4 | Ưu đãi: mã công khai đang dùng được với thành viên (K4), mới hết hạn trước (không hạn sau cùng); mỗi mã: mã, tiêu đề (vd. "Giảm 15%", "Miễn phí giao hàng", "Giảm 50.000 ₫"), dòng phụ (giảm tối đa / tên mã), điều kiện (đơn tối thiểu, chỉ thành viên, đơn đầu, danh mục), hạn (`expiresAt` hoặc null). Không có → trạng thái trống hiện có. |
| BR-ACC-17 | Must | backlog "Dọn mock" | Cờ FE `accountMode`: `http` ở bản thường, `mock` ở e2e. Ở `http` không đọc/ghi mock Account, không hiện tài khoản demo; `isReturn` và trả hàng ẩn (K5). |
| BR-ACC-18 | Must | BR-AUTH-38 | Nút lưu khoá khi đang gửi, lỗi giữ nội dung đã nhập, thông báo lưu thành công rõ (master plan 20 "Save feedback rõ"). |

### 5. Acceptance criteria

Dữ liệu tham chiếu: thành viên M (`member@nine2fine.test`, có mật khẩu), thành viên N (đăng ký bằng mã, chưa có mật khẩu). Tỉnh `79` (TP.HCM) và một phường của nó; tỉnh `01` (Hà Nội) và một phường của nó.

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-ACC-01 | 01 | Không cookie; cookie `n2f_sid` bị thu hồi; chỉ có `n2f_asid` của staff | `GET /account/profile`, `PATCH /account/profile`, `GET /account/addresses` | 401 `unauthenticated`, `Cache-Control: no-store`, không dữ liệu hồ sơ. |
| AC-ACC-02 | 01 | (AC-AUTH-88) | Gọi API account không phiên; staff gọi hành động chỉ admin | 401 `unauthenticated` và 403 `forbidden`: hai mã khác nhau. |
| AC-ACC-03 | 01 | M ở `/account/addresses`, giỏ 2 món; phiên bị thu hồi | Lưu địa chỉ | Chuyển `/auth/login?returnUrl=%2Faccount%2Faddresses` + "Phiên đăng nhập đã hết hạn…"; giỏ còn 2 món. |
| AC-ACC-04 | 02 | M đăng nhập | 31 lần `PATCH /account/profile` trong 60 giây | Lần 31: 429 `rate-limited`, có `retryAfterSeconds`, `Retry-After`. |
| AC-ACC-05 | 03 | M (Họ "Nguyễn Văn", Tên "Minh") | `GET /account/profile`; mở `/account/profile` | JSON có đủ 6 trường, không có `passwordHash`; trang hiện "Nguyễn Văn Minh" (AC-AUTH-29). |
| AC-ACC-06 | 04 | M | PATCH `phone: "+84 912 345 678"`; `phone: "0123"`; `phone: null` | `0912345678`; 422 `validation` `field: phone`; null. |
| AC-ACC-07 | 04 | M; hôm nay (VN) D | PATCH `birthDate` = D; = D − 12 năm; = `2000-02-30`; = `1999-05-01`; = null | 422 `validation`; 422 `underage`; 422 `validation`; 200 lưu; 200 xoá. |
| AC-ACC-08 | 04 | M | PATCH `{}`; PATCH `{ email: "x@y.vn" }` | Cả hai 422 `validation`; email không đổi. |
| AC-ACC-09 | 05, 07 | N (chưa mật khẩu), đăng nhập trên 2 trình duyệt | Trình duyệt 1 tạo mật khẩu `Abcdef12` | 204; `hasPassword` true; trình duyệt 1 vẫn đăng nhập; trình duyệt 2 yêu cầu kế tiếp 401; đăng nhập mật khẩu `Abcdef12` được. |
| AC-ACC-10 | 05 | M | PUT với `newPassword` `abcdefgh`; `ABCDEFGH`; email của M; mật khẩu hiện tại; không gửi `currentPassword` | 422 `validation` `field: newPassword` ×4; 422 `validation` `field: currentPassword`. |
| AC-ACC-11 | 05, 06 | M | Sai mật khẩu hiện tại 5 lần; lần 6 nhập đúng | Lần 1–5: 422 `invalid-password`; lần 6: 429 `password-locked`, mật khẩu không đổi. Sau 15 phút (sửa giờ) đổi được. |
| AC-ACC-12 | 07, 08 | M có phiên storefront + phiên admin khác (staff dùng thử bằng SQL không cần) | Đổi mật khẩu đúng | 204; phiên khác bị thu hồi; thư "mật khẩu đã thay đổi" trong outbox (Should). |
| AC-ACC-13 | 09, 11, 13 | M chưa có địa chỉ | Thêm A (TP.HCM, `isDefault: false`); thêm B (`isDefault: true`); `GET` | A mặc định sau lần 1; sau lần 2 B mặc định, A không; danh sách: B, A; mỗi dòng có tên tỉnh/phường. |
| AC-ACC-14 | 09 | M | Thêm địa chỉ với phường Hà Nội + tỉnh TP.HCM; SĐT `0123`; số nhà `abc`; người nhận rỗng | 422 `invalid-address`; 422 `validation` `phone`; 422 `validation` `street`; 422 `validation` `recipient`. |
| AC-ACC-15 | 10 | M có 10 địa chỉ | Thêm cái thứ 11 | 422 `validation` `field: addresses`; vẫn 10. |
| AC-ACC-16 | 11, 12 | M có A (mặc định), B, C (C mới nhất) | Sửa A `isDefault: false`; xoá A; xoá địa chỉ của người khác; đặt mặc định id lạ | A vẫn mặc định; sau xoá: C mặc định, còn B, C; 404 `not-found`; 404. |
| AC-ACC-17 | 11 | M có A (mặc định), B | Hai yêu cầu đặt mặc định A và B cùng lúc (×20) | Luôn đúng 1 mặc định, không lỗi 500. |
| AC-ACC-18 | 12, 18 | `accountMode: http`; M ở `/account/addresses` | Bấm Xoá; Huỷ; Xoá → Xác nhận | Hộp thoại xác nhận; Huỷ không gọi API; Xác nhận xoá, danh sách cập nhật, thông báo. |
| AC-ACC-19 | 14 | M có địa chỉ mặc định A, hồ sơ có SĐT; giỏ 1 món | Mở `/checkout` | Ô "Địa chỉ đã lưu" chọn A; người nhận/SĐT/tỉnh/phường/số nhà theo A; email theo hồ sơ. Chọn B → điền theo B; chọn "Địa chỉ mới" → ô để khách nhập. Đặt COD → đơn có địa chỉ B. |
| AC-ACC-20 | 14 | Như 19 nhưng khách đã gõ người nhận trước khi đăng nhập | Đăng nhập, quay lại checkout | Không ghi đè chữ khách gõ; ô "Địa chỉ đã lưu" ở "Địa chỉ mới". |
| AC-ACC-21 | 14 | API sổ địa chỉ lỗi 500 | Mở checkout | Checkout vẫn đặt được (form trống), không vỡ trang. |
| AC-ACC-22 | 15 | M có 2 đơn `completed` năm nay tổng 20.000.000, 1 đơn `completed` năm ngoái 30.000.000, 1 đơn `cancelled` 5.000.000 | `GET /account/membership` | `silver`, `spent` 20.000.000, `nextTierAt` 40.000.000, `reviewDate` 31/12 năm nay. |
| AC-ACC-23 | 16 | Mã A công khai còn hạn; mã B hết hạn; mã C tắt; mã D hết lượt; mã E M đã dùng hết lượt riêng | `GET /account/vouchers` | Chỉ A. |
| AC-ACC-24 | 17 | Build thường | Mở mọi trang Account, checkout thành viên | Không request nào tới mock; bundle không có dữ liệu demo Account (`demo@nine2fine.vn`) trong chunk initial; Playwright mock (`accountMode: mock`) pass nguyên. |
| AC-ACC-25 | 18 | M ở Profile, mất mạng | Lưu SĐT | Nút khoá khi gửi; lỗi hiện, ô giữ giá trị đã nhập. |
| AC-ACC-26 | K1 | DB có dữ liệu Slice 1–4 | `migrate deploy` 2 lần | Lần 2 không có migration mới; migration không DROP bảng/cột, không xoá dữ liệu (chỉ `DROP NOT NULL`). |

### 6. Định nghĩa xong của Slice 5

- AC Must đạt (test BE/E2E ghi mã AC), AC Should ghi làm hay hoãn.
- AC-AUTH-88 kiểm bằng AC-ACC-02; AC-AUTH-29 phần hiển thị kiểm bằng AC-ACC-05; AC-AUTH-68 đã đóng ở Slice 3 (AC-CHK-33), AC-ACC-03 kiểm lại trên trang địa chỉ.
- `openapi.yaml` có tag `account`; migration chỉ cộng thêm; `decisions.md`, `handoff.md` cập nhật.
- FE chạy `accountMode: http` với BE thật; Playwright mock pass nguyên.

### 7. Câu hỏi mở (PO tự chốt theo uỷ quyền của Thắng 2026-11-08)

| # | Câu hỏi | Ảnh hưởng | Chốt |
| --- | --- | --- | --- |
| S5-Q1 | Ngưỡng hạng và cách tính chi tiêu | BR-ACC-15 | Theo mock: Silver 18.000.000, Gold 40.000.000; năm dương lịch; chỉ đơn `completed`. Thắng sửa được ở `ASSUMPTIONS`. |
| S5-Q2 | Cho sửa họ tên ở Profile? | BR-ACC-04 | Không (thiết kế không có); Won't. |
| S5-Q3 | Đổi mật khẩu có đăng xuất thiết bị khác? | BR-ACC-07 | Có, giữ phiên hiện tại. |
| S5-Q4 | Số địa chỉ tối đa | BR-ACC-10 | 10. |
| S5-Q5 | Địa chỉ trả hàng (`isReturn`) | K5 | Won't; ẩn ở HTTP. |
| S5-Q6 | Ưu đãi khi chưa có ví cá nhân | BR-ACC-16 | Danh sách mã công khai dùng được. |

---

## Slice 6: Admin kho & sản phẩm

Nguồn: backlog 4.9 (phần sản phẩm, tồn kho thủ công, khuyến mãi), backlog 2.19 (`search_text` thành Must), Slice 2 (BR-CAT-02..05, 09..11), Slice 3 (BR-CART-08 dòng ngừng kinh doanh, BR-VOU-01..13), Slice 4 (BR-ADM-01..04, 34, 36, 37, 41). Thắng yêu cầu 2026-11-10: sản phẩm, tồn kho, ảnh, khuyến mãi; nối FE admin hiện có (đang mock) với BE thật; phạm vi khác giữ Won't. Hiện trạng đã đọc: `schema.prisma` (Category, Product: `status` ACTIVE/DRAFT/ARCHIVED, `price` Decimal, `cover_media_id`, `gallery_media_ids`, `color_media` = {tên màu: id ảnh}, `search_text`; ProductVariant: `inventory_qty`, `sku` unique, unique sản phẩm+màu+size, `cart_lines` xoá theo biến thể, `order_items` chặn xoá; Voucher; VoucherRedemption có `released_at`; OrderItem snapshot `media_id` VarChar(100)); FE `admin/features/{products,inventory,promotions}`, `admin-apis.ts`, `models.ts`, `core/permissions.ts`; ảnh storefront tra `media-manifest` tĩnh. Mã BR: `BR-INV` (cả slice: sản phẩm, ảnh, tồn kho, khuyến mãi). Tên endpoint/trường do Backend chốt trong `openapi.yaml`. Tiền là số nguyên đồng; múi giờ Asia/Ho_Chi_Minh. Mọi mặc định PO ghi ở mục 7 (S6-Q#).

### 1. Vấn đề và mục tiêu

**Vấn đề.** Ở bản thật, sản phẩm chỉ vào DB qua file seed (backlog 2.13); đổi giá, ẩn sản phẩm, nhập hàng, tạo mã giảm giá đều phải sửa SQL. Màn admin Sản phẩm, Tồn kho, Khuyến mãi đã thiết kế nhưng chạy mock và hiện "Chưa khả dụng" ở HTTP. Tồn kho chỉ đổi qua đơn, không có cách ghi nhận nhập hàng, hư hỏng, kiểm kho; sửa tên bằng SQL làm lệch tìm kiếm (QA Slice 2 m2).

**Mục tiêu.**
1. Admin tạo, sửa, công khai, ẩn sản phẩm và biến thể trên dữ liệu thật; storefront thấy thay đổi trong ≤ 30 giây; đơn cũ không đổi.
2. Admin tải ảnh sản phẩm lên, chọn ảnh bìa và ảnh theo màu.
3. Staff/admin điều chỉnh tồn kho có lý do, không âm, không mất cập nhật khi đua với đơn; mỗi lần có người/giờ/lý do.
4. Admin quản lý mã giảm giá dùng chung bảng `vouchers` checkout đang chạy.
5. Ở HTTP, ba màn này không còn dữ liệu mock; tìm kiếm luôn khớp tên mới (đóng 2.19).

**Không phải mục tiêu.** Khách hàng, báo cáo/tổng quan, nội dung trang chủ, bộ sưu tập, bảng size, đánh giá, cài đặt, nhân viên, trả hàng, nhật ký toàn hệ thống, xuất/nhập file; đổi giao diện admin.

### 2. Phạm vi

| Hạng mục | Mức | Lý do |
| --- | --- | --- |
| Quyền API (phiên `n2f_asid`, ma trận staff/admin), cờ FE `adminCatalogMode`, migration cộng thêm | Must | Nền an toàn, giống Slice 4. |
| Sản phẩm: danh sách, chi tiết, tạo, sửa, đổi trạng thái (đơn lẻ + hàng loạt), xoá nháp chưa từng bán | Must | Lý do chính của slice. |
| Biến thể: màu × size, SKU, tồn ban đầu; không xoá biến thể đã có đơn | Must | Gắn với sản phẩm. |
| `search_text` đồng bộ mọi đường ghi | Must | Backlog 2.19. |
| Ảnh: tải lên, ảnh bìa, thứ tự, ảnh theo màu; giữ ảnh thư viện cũ | Must | Không có ảnh thì không công khai được. Nơi lưu thật: S6-Q1. |
| Tồn kho: danh sách, điều chỉnh có lý do, nhật ký, chống ghi chồng, ngưỡng mặc định 5 | Must | Mục tiêu 3. |
| Khuyến mãi = voucher: danh sách + trạng thái, tạo, sửa, bật/tắt, xoá mã chưa dùng | Must | Mục tiêu 4. |
| Sửa ngưỡng sắp hết (mặc định + riêng SKU); lịch sử kho gộp biến động do đơn; "cập nhật bởi" trên sản phẩm/voucher | Should | Hữu ích, không chặn vận hành. |
| Giá riêng từng biến thể, giá vốn, thẻ (tags), SEO title/description, bộ sưu tập | Won't | Không có cột/bảng; checkout tính giá theo sản phẩm. Ẩn ở HTTP. |
| Đối tượng voucher theo hạng / danh sách khách / mã riêng tư; nhiều danh mục cho một mã | Won't | BE chưa có (S5-Q6, CHK-VC-08); `vouchers.category_id` chỉ một danh mục. |
| Tạo/sửa danh mục, bảng size, dọn ảnh mồ côi, xoá tệp ảnh | Won't | Ngoài phạm vi; ảnh còn được đơn cũ tham chiếu. |

### 3. Hiện trạng và hành vi được chọn

| # | Điểm | Hiện trạng | Chọn | Lý do |
| --- | --- | --- | --- | --- |
| K1 | Trạng thái | FE `active/draft/hidden`; DB `ACTIVE/DRAFT/ARCHIVED`. | `hidden` ↔ `ARCHIVED`, chữ FE giữ "Đã ẩn". | Không đổi enum. |
| K2 | Trường FE có, DB không | Giá biến thể, giá vốn, tags, SEO, bộ sưu tập. | Won't; ở HTTP ẩn các ô này, BE bỏ qua nếu gửi. | Không thêm cột cho tính năng chưa dùng. |
| K3 | Trường DB có, FE không | `badge`, `fit_model`, `looks`, `sales_rank`, `display_order`. | Sửa sản phẩm giữ nguyên; tạo mới theo BR-INV-12. | Không mất nội dung seed. |
| K4 | Ba con số tồn | FE: Trong kho / Đang giữ / Có thể bán. DB chỉ `inventory_qty`, đã trừ lúc đặt. | `inventory_qty` = Có thể bán; Đang giữ = tổng số lượng dòng đơn `to_pay`, `to_ship`, `cancel_requested`; Trong kho = cộng hai số (BR-INV-29). | Khớp cách Slice 3/4 trừ và hoàn kho, không đổi checkout. |
| K5 | Ảnh | Storefront tra `media-manifest` tĩnh; FE admin gọi `uploads/product-images`. | Ảnh tải lên có id ≤ 100 ký tự (vừa `order_items.media_id`) và URL; storefront hiện được cả id thư viện lẫn ảnh tải lên. Nơi lưu: S6-Q1. | Đơn cũ giữ ảnh cũ. |
| K6 | Voucher FE ↔ DB | FE: `categories[]`, `audience`, `tiers`, `customerIds`, mã 3–20 có `-`/`_`, % 1–100. DB: một `category_id`, `members_only`, `first_order_only`, `exclude_sale_items`; checkout chỉ nhận `^[A-Z0-9]{4,20}$`, % 1–90. | Theo DB và BR-VOU-02. Ở HTTP: tối đa 1 danh mục; đối tượng chỉ "Mọi khách" / "Chỉ thành viên"; thêm 2 tuỳ chọn "Chỉ đơn đầu tiên", "Không áp dụng hàng đang giảm". | Mã tạo ở admin phải dùng được ở checkout. |
| K7 | Cờ FE | `adminOrdersMode: http` chỉ mở Đơn hàng (BR-ADM-36). | Cờ mới `adminCatalogMode` (`http`/`mock`), độc lập; `http` mở thêm Sản phẩm, Tồn kho, Khuyến mãi. | Phát hành tách khỏi Slice 4. |
| K8 | Slug sau công khai | Không có dấu "đã từng công khai". | Cột cộng thêm `published_at`; migration điền cho sản phẩm đang `ACTIVE`. | Khoá slug (S6-Q3), quyết định được xoá cứng (BR-INV-18). |

### 4. Business Rules

**Chung**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-INV-01 | Must | BR-ADM-01, 03 | Mọi API admin sản phẩm, danh mục, ảnh, tồn kho, khuyến mãi chỉ nhận phiên `n2f_asid` còn hạn của tài khoản staff/admin đang hoạt động; vai trò đọc từ DB mỗi yêu cầu. Không phiên / hết hạn / thu hồi / chỉ có `n2f_sid` / `is_active = false` → 401 `unauthenticated`. `Cache-Control: no-store`. |
| BR-INV-02 | Must | BR-ADM-02; S6-Q2 | Ma trận quyền, kiểm ở mọi yêu cầu. **staff**: xem sản phẩm, danh mục, tồn kho, lịch sử kho, khuyến mãi; điều chỉnh tồn kho. **admin**: mọi việc của staff + tạo/sửa sản phẩm, biến thể, giá, ảnh (tải lên); đổi trạng thái; xoá sản phẩm; tạo/sửa/bật-tắt/xoá khuyến mãi; sửa ngưỡng sắp hết. Thiếu quyền → 403 `forbidden`, dữ liệu không đổi, không có dòng nhật ký. |
| BR-INV-03 | Must | BR-ADM-04; BR-ACC-18 | FE ẩn nút/route không đủ quyền theo `permissions.ts` (khớp BR-INV-02): staff không thấy "Thêm sản phẩm", "Tạo mã", nút lưu/xoá/đổi trạng thái; trang sản phẩm và mã giảm giá ở chế độ chỉ xem. Nút lưu khoá khi đang gửi; lỗi (kể cả mất mạng) hiện thông báo, form giữ nguyên dữ liệu đã nhập. |
| BR-INV-04 | Must | BR-ADM-41 | Giới hạn theo tài khoản, dùng chung bộ đếm admin: đọc 120 / 60 giây, ghi 60 / 60 giây; tải ảnh 30 tệp / 10 phút. Vượt → 429 `rate-limited` + `retryAfterSeconds` + `Retry-After`. |
| BR-INV-05 | Must | — | Chống ghi chồng khi sửa sản phẩm và voucher: yêu cầu ghi gửi `updatedAt` đã đọc; khác giá trị hiện tại → 409 `version-conflict`, không ghi gì. FE: "Dữ liệu vừa được người khác cập nhật. Tải lại để xem bản mới; thay đổi của bạn chưa được lưu." (giữ form để chép lại). |
| BR-INV-06 | Must | BR-ADM-36; K7 | Cờ `adminCatalogMode` (`http` bản thường / `mock` e2e). `http`: Sản phẩm, Tồn kho, Khuyến mãi gọi API thật, không đọc/ghi mock; menu gồm Đơn hàng + ba mục này; các route admin khác vẫn "Chưa khả dụng"; ô thuộc Won't (K2, K6) ẩn. `mock`: như hiện tại, Playwright mock pass nguyên. |
| BR-INV-07 | Must | BR-ADM-37 | Migration chỉ cộng thêm (không `DROP`/`TRUNCATE`/đổi kiểu, không xoá dữ liệu); bảng mới bật RLS; chạy `migrate deploy` 2 lần thì lần 2 không có gì. Cần lưu thêm: nhật ký điều chỉnh kho; `products.published_at` (điền cho sản phẩm đang `ACTIVE`); (Should) ngưỡng sắp hết mặc định và riêng SKU, người sửa cuối của sản phẩm/voucher. |
| BR-INV-08 | Must | BR-ADM-34 | Mã lỗi ổn định (FE map theo `code`): `unauthenticated` 401, `forbidden` 403, `not-found` 404, `validation` 422 (+`field`), `publish-incomplete` 422 (+`missing[]`), `invalid-image` 422 (+`reason`), `duplicate` 409 (+`field`), `version-conflict` 409, `stock-changed` 409 (+ số hiện tại), `product-in-use` 409, `variant-in-use` 409 (+`sku`), `voucher-in-use` 409, `rate-limited` 429, lỗi máy chủ; không stack trace, SQL. |

**Sản phẩm và biến thể**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-INV-09 | Must | FE product-list | Danh sách gồm mọi trạng thái. Tìm theo tên, loại, SKU (chuẩn hoá `foldVi`, ≤ 100 ký tự, quá → 422 `field: q`); tab `all` / `active` / `draft` / `hidden` / `out-of-stock` (≥ 1 biến thể có thể bán = 0) kèm số đếm; lọc danh mục; sắp `updatedAt` giảm, hoà theo id; `limit` 1–100 (mặc định 20). Mỗi dòng: ảnh bìa, tên, trạng thái, danh mục, giá, giá gốc, tổng có thể bán, số biến thể, `updatedAt`. |
| BR-INV-10 | Must | — | Chi tiết trả mọi trường form (trừ K2), ảnh (BR-INV-26), biến thể kèm `inventory` (= có thể bán), `hasOrders`; `published` (có `published_at`), `slugLocked`; danh mục chọn từ bảng `categories` (API danh sách danh mục, staff/admin đọc được). Id lạ → 404. |
| BR-INV-11 | Must | BR-CAT-03; S6-Q9 | Kiểm dữ liệu (chuỗi: NFC, cắt hai đầu, gộp khoảng trắng): tên 1–120 ký tự; loại (`typeLabel`) 1–120; mô tả ≤ 5.000; chất liệu ≤ 500; bảo quản ≤ 10 dòng, mỗi dòng 1–200; dáng (`fitSummary`) ≤ 500; danh mục phải tồn tại; `genders` ⊆ {nam, nu}; `moments` ⊆ {work, dinner, event, weekend}; giá số nguyên 1.000–100.000.000; giá gốc null hoặc số nguyên > giá và ≤ 100.000.000. Sai → 422 `validation` + `field`. |
| BR-INV-12 | Must | K3 | Sửa sản phẩm không đổi `badge`, `fit_model`, `looks`, `sales_rank`, `display_order`. Tạo mới: `badge` null, `fit_model` "", `looks` [], `display_order` và `sales_rank` = giá trị lớn nhất hiện có + 1 (đứng cuối "Nổi bật" và "Bán chạy"). |
| BR-INV-13 | Must | BR-CAT-09; S6-Q3 | Slug: `a-z 0-9 -`, 3–80 ký tự, không bắt đầu/kết thúc bằng `-`, sai → 422 `field: slug`. Bỏ trống → sinh từ tên (bỏ dấu); trùng thì thêm `-2`, `-3`… Admin tự gõ slug đã có → 409 `duplicate` `field: slug`. Sau lần công khai đầu (`published_at` có giá trị) slug bị khoá: gửi slug khác → 422 `validation` `field: slug` ("Không đổi đường dẫn của sản phẩm đã từng hiển thị."). |
| BR-INV-14 | Must | BR-CAT-02, 03 | Chuyển tự do giữa `DRAFT` / `ACTIVE` / `ARCHIVED`. Vào `ACTIVE` cần đủ: ≥ 1 ảnh, ≥ 1 biến thể, giá hợp lệ, tên, loại, danh mục; thiếu → 422 `publish-incomplete` + `missing[]` (`images`, `variants`, …), không đổi gì. Không yêu cầu tồn > 0. Lần đầu vào `ACTIVE` ghi `published_at`. |
| BR-INV-15 | Must | FE bulk | Đổi trạng thái hàng loạt: 1–50 id (ngoài khoảng → 422); tất cả hoặc không: một id không tồn tại → 404, một sản phẩm không đủ điều kiện `ACTIVE` → 422 `publish-incomplete` kèm id đó; không sản phẩm nào đổi. |
| BR-INV-16 | Must | BR-CAT-02, 11; BR-CART-08 | Sản phẩm rời `ACTIVE`: trong ≤ 30 giây không còn trong danh sách, tìm kiếm, tổng số; PDP 404. Dòng giỏ chứa nó thành "Sản phẩm không còn kinh doanh" (`discontinued`, Slice 3), không đặt được. Đơn đã đặt giữ nguyên (snapshot), khách và admin vẫn xem đủ. |
| BR-INV-17 | Must | BR-CAT-11; BR-CHK (giá đổi khi đặt) | Đổi giá/giá gốc: giỏ và báo giá dùng giá mới ở lần làm tươi kế tiếp; khách đang checkout gặp giá đổi lúc đặt → hành vi Slice 3 hiện có; đơn đã đặt giữ `unit_price`, `compare_at_price` đã chụp. Không gửi thư cho khách. |
| BR-INV-18 | Must | — | Xoá cứng (chỉ admin) chỉ khi sản phẩm chưa từng công khai (`published_at` trống) **và** không biến thể nào có dòng đơn → 204, xoá kèm biến thể và nhật ký kho của chúng. Ngược lại → 409 `product-in-use` ("Sản phẩm đã từng hiển thị hoặc đã có đơn; hãy Ẩn thay vì xoá."). |
| BR-INV-19 | Must | BR-CAT-03 | Biến thể = tổ hợp màu × size admin bật. Size ⊆ {S, M, L, XL}; 1–8 màu, tên màu 1–50 ký tự, không trùng trong sản phẩm (không phân biệt hoa thường, có dấu), hex `#RRGGBB`; tối đa 32 biến thể. SKU 3–64 ký tự `A-Z 0-9 -` (chuyển chữ hoa), duy nhất toàn hệ thống → trùng 409 `duplicate` `field: variants[i].sku`. Biến thể mới có tồn ban đầu 0–100.000, ghi 1 dòng nhật ký kho lý do `received`, ghi chú "Tồn ban đầu", người tạo (bỏ qua nếu 0). |
| BR-INV-20 | Must | FE `stockLocked` | Lưu sản phẩm không đổi tồn của biến thể đã có (giá trị gửi lên bị bỏ qua; chỉ đổi qua BR-INV-31). SKU khoá khi biến thể đã có dòng đơn → 422 `field: variants[i].sku`. Đổi tên/hex màu áp cho mọi biến thể màu đó và khoá `color_media`; dòng đơn cũ giữ tên màu đã chụp. |
| BR-INV-21 | Must | — | Bỏ biến thể (tắt màu/size): biến thể không có dòng đơn → xoá (dòng giỏ thành viên của nó bị xoá theo; giỏ khách thấy "không còn kinh doanh"); có dòng đơn → 409 `variant-in-use` kèm SKU, không đổi gì; FE gợi ý "Đặt tồn về 0 để ngừng bán size này". Sản phẩm `ACTIVE` không được còn 0 biến thể (422 `publish-incomplete`). |
| BR-INV-22 | Must | backlog 2.19; BR-CAT-13 | Mọi đường ghi sản phẩm (tạo, sửa) cập nhật `search_text = foldVi(tên + ' ' + loại)` trong cùng giao dịch; lỗi giữa chừng thì không để lại thay đổi nửa vời. Đóng 2.19. |
| BR-INV-23 | Should | — | Lưu người sửa cuối + thời điểm trên sản phẩm và voucher; form hiện "Cập nhật bởi {tên} lúc {giờ}". |

**Ảnh**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-INV-24 | Must | S6-Q5 | Tải ảnh (chỉ admin), 1 tệp / yêu cầu: JPEG, PNG hoặc WebP xác định theo nội dung tệp (không theo đuôi); ≤ 5 MB; cạnh ngắn ≥ 600 px, cạnh dài ≤ 6.000 px. Sai → 422 `invalid-image` `reason` ∈ {`format`, `size`, `dimensions`}. Tên lưu do máy chủ sinh (không dùng tên gốc). Trả `id` (≤ 100 ký tự) và `url` công khai. |
| BR-INV-25 | Must (chờ xác nhận nơi lưu) | S6-Q1 | Lưu ảnh qua lớp lưu trữ đổi được bằng cấu hình. Dev/test: đĩa cục bộ. Bản thật: S6-Q1 (mặc định PO: Supabase Storage, bucket công khai). Không chặn lát khác; chặn 6.8. |
| BR-INV-26 | Must | BR-CAT-10; K5 | Sản phẩm có 0–12 ảnh (`ACTIVE` cần ≥ 1; > 12 → 422 `field: images`), thứ tự do admin sắp; ảnh đầu = ảnh bìa (`cover_media_id`), toàn bộ theo thứ tự = gallery. Mỗi ảnh gắn 0 hoặc 1 màu của sản phẩm (màu không có → 422); `color_media[màu]` = ảnh đầu tiên gắn màu đó. Alt ≤ 125 ký tự (trống = tên sản phẩm). Id ảnh không phải ảnh đã tải lên hay id thư viện có sẵn → 422 `field: images`. |
| BR-INV-27 | Must | K5 | Ảnh thư viện của sản phẩm seed hiện trong form admin và giữ nguyên id khi lưu. Storefront (thẻ sản phẩm, PDP, giỏ, checkout, đơn) hiện đúng cả ảnh tải lên lẫn ảnh thư viện; dòng đơn cũ giữ ảnh đã chụp. |
| BR-INV-28 | Must | — | Không xoá tệp ảnh trong slice này: bỏ ảnh khỏi sản phẩm chỉ gỡ tham chiếu (đơn cũ vẫn hiện ảnh). Dọn ảnh mồ côi: Won't. |

**Tồn kho**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-INV-29 | Must | K4; BR-CAT-04 | Có thể bán = `inventory_qty`. Đang giữ = tổng số lượng các dòng đơn ở `to_pay`, `to_ship`, `cancel_requested` của biến thể. Trong kho = Có thể bán + Đang giữ. Trạng thái admin: `out` khi có thể bán = 0; `low` khi 1..ngưỡng (BR-INV-35); `in` khi > ngưỡng. |
| BR-INV-30 | Must | FE inventory | Danh sách: 1 dòng / biến thể (mọi trạng thái sản phẩm, ghi rõ trạng thái), tìm theo SKU/tên (≤ 100 ký tự), tab `all`/`in`/`low`/`out` + đếm, lọc danh mục/màu/size, sắp có thể bán tăng rồi SKU; `limit` 1–100 (mặc định 20). Facets: danh mục, màu, size, số đếm từng tab, ngưỡng mặc định, số SKU có ngưỡng riêng. |
| BR-INV-31 | Must | S6-Q6 | Điều chỉnh (staff + admin), hai cách: **Thêm/bớt** `delta` nguyên, ≠ 0, \|delta\| ≤ 10.000, cộng vào Có thể bán; **Đặt số đếm được** `set` = số Trong kho đếm thực tế 0–100.000 → Có thể bán mới = số đếm − Đang giữ (tính trong giao dịch). Kết quả Có thể bán phải 0–100.000. Delta làm âm → 422 `field: quantity` ("Chỉ còn N có thể bán."); số đếm < Đang giữ → 422 ("Không thể thấp hơn N đang giữ cho đơn chưa giao."); không đổi gì → 422 ("Số lượng không thay đổi."). |
| BR-INV-32 | Must | FE `REASONS` | Lý do cố định: `received` Nhập hàng (chỉ delta > 0), `return` Hàng trả về nhập lại (chỉ delta > 0), `damaged` Hư hỏng (chỉ delta < 0), `count` Kiểm kho (chỉ `set`), `correction` Sửa sai (± hoặc `set`, ghi chú bắt buộc ≥ 5 ký tự). Sai cặp → 422 `field: reason`. Ghi chú ≤ 200 ký tự (NFC, cắt). |
| BR-INV-33 | Must | BR-CHK-15 (tinh thần) | Không mất cập nhật, không âm (DB bảo đảm): delta là phép cộng nguyên tử có điều kiện ≥ 0, đua với đặt hàng/huỷ đơn vẫn đúng tổng. `set` gửi kèm `expectedAvailable` (số đang thấy); khác hiện tại → 409 `stock-changed` + Có thể bán, Đang giữ hiện tại, không ghi; FE hiện số mới, giữ ô nhập. Mỗi điều chỉnh có `Idempotency-Key`: gửi lại cùng khoá trong 24 giờ → trả kết quả lần đầu, không áp lần hai. |
| BR-INV-34 | Must | — | Nhật ký: mỗi điều chỉnh (và tồn ban đầu BR-INV-19) ghi đúng 1 dòng trong cùng giao dịch: thời điểm, biến thể, thay đổi (±), Có thể bán sau, lý do, ghi chú, người (id, tên, vai trò). Không sửa/xoá qua API. Lịch sử biến thể: 50 dòng mới nhất, mới trước; staff xem được. |
| BR-INV-35 | Must | BR-CAT-04; S6-Q8 | Ngưỡng sắp hết mặc định toàn shop = 5 (khớp storefront). Ngưỡng admin chỉ ảnh hưởng màn admin; storefront luôn theo BR-CAT-04. |
| BR-INV-36 | Should | FE threshold-dialogs | Admin sửa ngưỡng mặc định (0–1.000) kèm tuỳ chọn "bỏ mọi ngưỡng riêng", và ngưỡng riêng cho 1–100 SKU (0–1.000, hoặc null = theo mặc định). Ngoài khoảng → 422. |
| BR-INV-37 | Should | FE `InventoryMovement` | Lịch sử gộp biến động do đơn: đặt hàng (−, "Bán theo đơn {mã}"), huỷ/hàng hoàn nhập lại (+, "Đơn huỷ, hoàn kho {mã}"). Không làm đổi kết quả hay tăng lỗi của đặt hàng/huỷ đơn. |

**Khuyến mãi (voucher)**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-INV-38 | Must | BR-VOU-02; K6 | Khuyến mãi = bảng `vouchers` checkout dùng; thay đổi áp ở lần báo giá kế tiếp (không chờ cache). Trường sửa được: mã, tên (1–100), loại, giá trị, giảm tối đa, đơn tối thiểu (0–100.000.000), bắt đầu, kết thúc, tổng lượt (null hoặc 1–1.000.000), lượt mỗi khách (1–10), chỉ thành viên, chỉ đơn đầu tiên, danh mục (null hoặc đúng 1), không áp dụng hàng đang giảm, bật/tắt. |
| BR-INV-39 | Must | BR-VOU-02 | Mã chuẩn hoá (bỏ khoảng trắng, chữ hoa) phải khớp `^[A-Z0-9]{4,20}$` → sai 422 `field: code`; trùng (không phân biệt hoa thường) → 409 `duplicate` `field: code`. `percent`: giá trị 1–90, giảm tối đa null hoặc 1.000–10.000.000. `fixed`: giá trị 1.000–10.000.000, giảm tối đa null. `free_shipping`: giá trị và giảm tối đa null. Bắt đầu trống = lúc tạo; kết thúc null hoặc > bắt đầu; tạo mới với kết thúc ≤ bây giờ → 422. Giờ VN. |
| BR-INV-40 | Must | S6-Q4 | Mã không đổi sau khi tạo (422 `field: code`). Khi voucher đã có ≥ 1 bản ghi lượt dùng (kể cả đã trả lượt): loại, giá trị, giảm tối đa không đổi được → 409 `voucher-in-use` ("Mã đã được dùng; hãy tạo mã mới."). Tổng lượt không được < số đã dùng → 422 `field: totalLimit`. Trường khác sửa được, áp từ báo giá kế tiếp; đơn đã đặt giữ số tiền giảm. |
| BR-INV-41 | Must | BR-VOU-08, 10 | Tắt mã: báo giá kế tiếp gỡ mã kèm lý do; khách bấm Đặt hàng với mã vừa tắt → 409 `voucher-changed` (Slice 3); đơn đã tạo không đổi. Bật lại dùng được ngay nếu còn hạn, còn lượt. |
| BR-INV-42 | Must | — | Xoá cứng (chỉ admin) chỉ khi chưa có bản ghi lượt dùng nào → 204; ngược lại 409 `voucher-in-use` ("Mã đã được dùng; hãy tắt thay vì xoá."). |
| BR-INV-43 | Must | FE `PromotionState` | Trạng thái tính lúc đọc (giờ VN), theo thứ tự: `disabled` (đang tắt) → `scheduled` (bắt đầu > bây giờ) → `expired` (kết thúc ≤ bây giờ, hoặc tổng lượt có giá trị và đã dùng ≥ tổng lượt) → `running`. Danh sách: tab theo trạng thái + đếm, tìm theo mã/tên, sắp ngày tạo giảm; `used` = `used_count`. Voucher cũ có bắt đầu null coi như đã bắt đầu. |
| BR-INV-44 | Must | K6 | Ở HTTP chỉ hỗ trợ đối tượng "Mọi khách" / "Chỉ thành viên" và ≤ 1 danh mục; gửi `audience` khác hoặc > 1 danh mục → 422. Tiers / khách cụ thể / riêng tư: Won't. |

### 5. Acceptance criteria

Dữ liệu tham chiếu: admin A, A2; staff S. Sản phẩm P (seed, `ACTIVE`, đã có đơn), biến thể V của P: Có thể bán 10, có 2 trong 1 đơn `to_ship` và 1 trong 1 đơn `to_pay`. Sản phẩm D (`DRAFT`, mới tạo, chưa có đơn). Voucher W = `N2FWELCOME15` (đã có lượt dùng), voucher X mới tạo chưa dùng.

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-INV-01 | 01 | Không cookie; chỉ `n2f_sid` của thành viên; `n2f_asid` của S sau khi `is_active = false` (SQL) | `GET /admin/products`, `POST` điều chỉnh kho, `POST` khuyến mãi | 401 `unauthenticated`, `Cache-Control: no-store`, không dữ liệu. |
| AC-INV-02 | 02 | S đăng nhập admin | Xem danh sách SP, chi tiết P, tồn kho, lịch sử V, khuyến mãi; điều chỉnh V; sửa P; đổi trạng thái; xoá D; tải ảnh; tạo/sửa/tắt/xoá voucher; sửa ngưỡng | Xem + điều chỉnh: 200. Còn lại: 403 `forbidden`; DB không đổi, không có dòng nhật ký. |
| AC-INV-03 | 03 | `adminCatalogMode: http`; S đăng nhập | Mở Sản phẩm, `/admin/products/new`, P, Khuyến mãi, Tồn kho | Không có nút Thêm/Tạo/Lưu/Xoá/đổi trạng thái; `/new` bị chặn; P và voucher chỉ xem; ngăn điều chỉnh kho có form. |
| AC-INV-04 | 02 | A bị hạ thành staff qua SQL | Lưu P | 403 `forbidden` ngay yêu cầu kế tiếp. |
| AC-INV-05 | 04 | A | 61 yêu cầu ghi trong 60 giây; 31 lần tải ảnh trong 10 phút | Lần 61 và lần tải 31: 429 `rate-limited` + `retryAfterSeconds`, `Retry-After`. |
| AC-INV-06 | 05 | A và A2 cùng mở P (và cùng mở X) | A lưu giá mới; A2 lưu tên mới với `updatedAt` cũ (tương tự với X) | A2: 409 `version-conflict`, tên không đổi, giá là của A; FE A2 hiện câu BR-INV-05, form còn nguyên. |
| AC-INV-07 | 06 | Build thường | Mở admin với A | Menu: Đơn hàng, Sản phẩm, Tồn kho, Khuyến mãi; `/admin/customers` → "Chưa khả dụng"; không request nào tới mock ở ba màn; Playwright `adminCatalogMode: mock` pass nguyên. |
| AC-INV-08 | 06, 44 | `http`; A mở form SP và form voucher | Xem các ô | Không có Giá vốn, SEO, Thẻ, Bộ sưu tập, giá riêng biến thể; voucher không có Hạng/Khách cụ thể/Riêng tư, chọn tối đa 1 danh mục, có "Chỉ đơn đầu tiên", "Không áp dụng hàng đang giảm". |
| AC-INV-09 | 07 | DB có dữ liệu Slice 1–5 | `migrate deploy` 2 lần | Lần 2 không có migration mới; không DROP/TRUNCATE/đổi kiểu; bảng mới bật RLS; mọi SP `ACTIVE` có `published_at`. |
| AC-INV-10 | 09 | Có "Áo Sơ Mi Lụa" và SP có 1 biến thể Có thể bán 0 | Tìm `ao so mi`; tìm SKU của V; mở tab `draft`, `out-of-stock` | Ra đúng SP; ra P; số đếm tab khớp số dòng; SP có biến thể 0 nằm trong `out-of-stock`. |
| AC-INV-11 | 09 | A | `q` 101 ký tự; `limit=101`; `limit=0` | 422 `validation` `field: q`; 422; 422. |
| AC-INV-12 | 11 | A tạo SP | Giá 999; giá 100.000.001; giá gốc = giá; tên 121 ký tự; danh mục id lạ; `genders: ["kid"]` | Mỗi trường 422 `validation` đúng `field`; không tạo gì. |
| AC-INV-13 | 12 | P có `badge`, `looks`, `fit_model` | A sửa mô tả P; tạo SP mới rồi công khai | `badge`, `looks`, `fit_model`, `sales_rank`, `display_order` của P không đổi; SP mới đứng cuối "Nổi bật" trên PLP. |
| AC-INV-14 | 13 | A | Tạo "Áo Len Cổ Lọ" slug trống; tạo SP cùng tên; tạo với slug gõ tay = slug của P; slug `Ao_Len` | `ao-len-co-lo`; `ao-len-co-lo-2`; 409 `duplicate` `field: slug`; 422 `field: slug`. |
| AC-INV-15 | 13 | P (đã công khai), D (chưa) | Đổi slug P; đổi slug D | P: 422 `field: slug`, slug cũ giữ; D: 200 slug mới. |
| AC-INV-16 | 14 | D chưa có ảnh, có 2 biến thể tồn 0 | Chuyển `ACTIVE`; thêm 1 ảnh rồi chuyển `ACTIVE` | 422 `publish-incomplete` `missing: ["images"]`; sau đó 200, `published_at` được ghi, PLP thấy D (hết hàng) trong ≤ 30 giây. |
| AC-INV-17 | 15 | P, D (không ảnh), E (`DRAFT` đủ điều kiện) | Hàng loạt `ACTIVE` [P, D, E]; 51 id; [P, id lạ] | 422 kèm id D, cả ba không đổi; 422; 404, P không đổi. |
| AC-INV-18 | 16 | Thành viên M có P trong giỏ; đơn cũ O của P | A ẩn P | ≤ 30 giây: P không còn ở PLP/tìm kiếm/tổng số, PDP 404; giỏ M: P "Sản phẩm không còn kinh doanh", đặt hàng bị chặn đúng lỗi Slice 3; O ở trang khách và admin hiển thị đủ như trước. |
| AC-INV-19 | 17 | P giá 500.000; đơn O1 đặt trước | A đổi giá 450.000 | Giỏ hiện 450.000 sau làm tươi; báo giá dùng 450.000; O1 vẫn 500.000 ở chi tiết đơn. |
| AC-INV-20 | 18 | D; P; F đã từng `ACTIVE` rồi về `DRAFT`, chưa có đơn | Xoá D; xoá P; xoá F | D: 204, `GET` 404; P: 409 `product-in-use`; F: 409 `product-in-use`. |
| AC-INV-21 | 19 | A sửa D | Thêm màu "Be" `#F5F5DC` × S, M tồn ban đầu 5; SKU trùng SKU của P; 9 màu; size `XXL`; hex `#FFF`; màu "Đen" và "đen" | 2 biến thể, 2 dòng nhật ký `received` "Tồn ban đầu" người A; 409 `duplicate` `field: variants[i].sku`; 422 ×4. |
| AC-INV-22 | 20 | V có đơn | Lưu P với `inventory: 999` cho V; đổi SKU V; đổi tên màu "Đen" → "Đen tuyền" | V vẫn 10; 422 `field: variants[i].sku`; các biến thể màu đó đổi tên, `color_media` theo tên mới, đơn cũ vẫn ghi "Đen". |
| AC-INV-23 | 21 | P: size XL có đơn ở 1 màu; size M màu Trắng không có đơn, nằm trong giỏ thành viên M và giỏ khách G | Bỏ size XL; bỏ biến thể M-Trắng | XL: 409 `variant-in-use` kèm SKU, không đổi gì; M-Trắng bị xoá, dòng giỏ M biến mất, giỏ G hiện "không còn kinh doanh". |
| AC-INV-24 | 22 | P tên "Áo Thun Basic" | A đổi tên "Áo Phông Trơn"; đổi loại "Áo thun cổ tròn" | ≤ 30 giây: `q=phong tron` ra P, `q=thun basic` không ra (trừ khi loại chứa); `search_text` = `foldVi(tên + ' ' + loại)`. |
| AC-INV-25 | 24 | A | Tải JPG 6 MB; tệp `.exe` đổi đuôi `.jpg`; PNG 400×500; WebP 1200×1600; S tải WebP | 422 `invalid-image` `size`; `format`; `dimensions`; 201 có `id` ≤ 100 ký tự và `url` mở được; S: 403. |
| AC-INV-26 | 26 | A sửa P (màu Đen, Trắng) | Lưu 13 ảnh; lưu [i1 Đen, i2, i3 Trắng, i4 Đen]; gắn ảnh màu "Xanh"; id ảnh bịa | 422 `field: images`; bìa i1, gallery i1–i4 đúng thứ tự, `color_media` {Đen: i1, Trắng: i3}; 422; 422. |
| AC-INV-27 | 27 | P (ảnh thư viện); SP Q có ảnh tải lên, đã có đơn O với ảnh cũ | Mở P, lưu không đổi; xem Q ở PLP, PDP, giỏ, checkout; đổi ảnh bìa Q | Id ảnh P giữ nguyên; Q hiện ảnh tải lên ở mọi nơi; O vẫn hiện ảnh cũ. |
| AC-INV-28 | 28 | Ảnh i1 của Q nằm trong đơn O | A bỏ i1 khỏi Q | O vẫn hiện i1; URL i1 vẫn mở được. |
| AC-INV-29 | 29, 35 | V như dữ liệu tham chiếu | Xem dòng V; đặt Có thể bán 5; đặt 0 | Trong kho 13, Đang giữ 3, Có thể bán 10, `in`; `low`; `out`. |
| AC-INV-30 | 30 | Có 4 biến thể Có thể bán 1–5 | Mở tab `low`; lọc màu Đen + size M; tìm SKU V | Tab `low` đếm 4 và hiện 4 dòng; lọc đúng; ra V. |
| AC-INV-31 | 31 | V Có thể bán 10, Đang giữ 3 | Delta +5 `received`; delta −16 `damaged` (khi 15); set 18 `count`; set 2; set 20; delta 10.001; delta 0 | 15; 422 "Chỉ còn 15…"; 422 "không thay đổi"; 422 "thấp hơn 3…"; Có thể bán 17; 422; 422. |
| AC-INV-32 | 32 | V | `received` −2; `damaged` +2; `count` với delta; `correction` không ghi chú; ghi chú 201 ký tự | 422 `field: reason` ×3; 422 `field: note` ×2. |
| AC-INV-33 | 33 | V Có thể bán 3 | 20 lần chạy song song: 3 khách đặt mỗi người 1 cùng lúc S điều chỉnh −1 `damaged` ×3 | Không lần nào âm; Có thể bán cuối = 3 − (số đơn tạo được) − (số điều chỉnh thành công) ≥ 0; mỗi điều chỉnh thành công có đúng 1 dòng nhật ký; không lỗi 500. |
| AC-INV-34 | 33 | S mở V thấy 10 | Một đơn trừ 1 (còn 9); S gửi set 13 với `expectedAvailable: 10` | 409 `stock-changed` kèm Có thể bán 9, Đang giữ 4; không ghi, không có dòng nhật ký; FE hiện số mới, ô nhập còn 13. |
| AC-INV-35 | 33 | S, mất mạng sau khi gửi delta +5 | FE gửi lại cùng `Idempotency-Key` | Có thể bán chỉ tăng 5; đúng 1 dòng nhật ký. |
| AC-INV-36 | 34 | V có 3 điều chỉnh, rồi 60 điều chỉnh | Xem lịch sử; `PUT`/`DELETE` một dòng nhật ký | 3 dòng mới trước, đủ người/vai trò/lý do/ghi chú/thay đổi/sau; khi 63 dòng: trả 50; `PUT`/`DELETE` → 404 hoặc 405. |
| AC-INV-37 | 36 | A | Ngưỡng mặc định 8; V Có thể bán 7; ngưỡng riêng V = 2; đặt null; ngưỡng 1.001; S sửa ngưỡng | V `low` ở admin, PDP vẫn `IN_STOCK`; V `in`; V về 8; 422; 403. (Should) |
| AC-INV-38 | 37 | V | Khách đặt 2 V (đơn O); huỷ O | Lịch sử có "Bán theo đơn O" −2 và "Đơn huỷ, hoàn kho O" +2. (Should) |
| AC-INV-39 | 23 | A sửa P | S mở P | Hiện "Cập nhật bởi A lúc {giờ}". (Should) |
| AC-INV-40 | 38 | Giỏ 400.000 ở checkout | A tạo `SALE50K` fixed 50.000, tối thiểu 300.000; khách áp mã | Báo giá −50.000 ngay; `/account/vouchers` có `SALE50K` (BR-ACC-16). |
| AC-INV-41 | 39 | A tạo voucher | Mã `sale-10`; `AB1`; ` sale 10 `; `n2ffreeship`; percent 95; free-ship có giá trị 10; kết thúc ≤ bắt đầu; kết thúc hôm qua | 422 `code`; 422 `code`; lưu `SALE10`; 409 `duplicate` `field: code`; 422 ×4. |
| AC-INV-42 | 40 | W đã dùng; đơn O1 đã giảm 15% | Đổi giá trị 15 → 20; đổi mã; tổng lượt < đã dùng; đổi đơn tối thiểu | 409 `voucher-in-use`; 422 `code`; 422 `totalLimit`; 200, báo giá kế tiếp theo mức mới; O1 giữ số tiền giảm. |
| AC-INV-43 | 41 | Khách đang ở checkout có X đã áp | A tắt X; khách đổi số lượng; khách bấm Đặt hàng; A bật lại | Báo giá gỡ X kèm lý do; đặt hàng 409 `voucher-changed`; bật lại áp được. |
| AC-INV-44 | 42 | X chưa dùng; W; Y dùng 1 lần rồi đơn huỷ (đã trả lượt) | Xoá X; xoá W; xoá Y | 204; 409 `voucher-in-use`; 409 `voucher-in-use`. |
| AC-INV-45 | 43 | Mã tắt; mã bắt đầu ngày mai; kết thúc hôm qua; tổng lượt 5 đã dùng 5; mã kết thúc đúng bây giờ; mã bình thường | Mở danh sách | `disabled`; `scheduled`; `expired`; `expired`; `expired`; `running`; số đếm tab khớp. |
| AC-INV-46 | 44 | A | Lưu voucher với 2 danh mục; `audience: "tiers"` | 422 ×2, không lưu. |
| AC-INV-47 | 08 | Mọi lỗi ở trên | Đọc body | Có `code` ổn định theo BR-INV-08; không stack trace, không SQL. |
| AC-INV-48 | 03 | A ở form P, mất mạng | Bấm Lưu | Nút khoá khi gửi; lỗi hiện; form giữ dữ liệu; có mạng lại bấm Lưu được. |

### 6. Định nghĩa xong của Slice 6

- AC Must đạt (test BE/E2E ghi mã AC), AC Should ghi làm hay hoãn.
- `openapi.yaml` có tag cho sản phẩm, tồn kho, ảnh, khuyến mãi (locked trước khi FE nối); migration chỉ cộng thêm; `decisions.md`, `handoff.md` cập nhật.
- Ở `adminCatalogMode: http` ba màn không có dữ liệu mock; Playwright mock pass nguyên; backlog 2.19 đóng (AC-INV-24).
- Tồn kho không bao giờ âm và mỗi thay đổi tay có đúng 1 dòng nhật ký (AC-INV-33..36); mã tạo ở admin dùng được ở checkout (AC-INV-40).

### 7. Câu hỏi mở

Mặc định PO, làm trước theo mặc định; Thắng đổi được bằng cách trả lời. Chỉ S6-Q1 chờ Thắng và chỉ chặn lát 6.8.

| # | Câu hỏi | Ảnh hưởng | Mặc định PO | Trạng thái |
| --- | --- | --- | --- | --- |
| S6-Q1 | Lưu ảnh ở đâu (bản thật)? | BR-INV-25; lát 6.4 (phần bản thật), 6.8 | Supabase Storage, bucket công khai `product-images`; dev/test đĩa cục bộ qua lớp lưu trữ đổi được. | Chờ Thắng (không chặn 6.1–6.7) |
| S6-Q2 | Ma trận quyền staff/admin | BR-INV-02 | Staff: xem + điều chỉnh tồn; admin: mọi việc còn lại. | Mặc định PO |
| S6-Q3 | Slug có được đổi sau khi công khai? | BR-INV-13 | Không (khoá sau lần công khai đầu; không làm chuyển hướng slug cũ). | Mặc định PO |
| S6-Q4 | Sửa voucher đã có lượt dùng | BR-INV-40, 42 | Mã không bao giờ đổi; loại/giá trị/giảm tối đa khoá khi đã có lượt; không xoá mã đã dùng (tắt thay vì xoá). | Mặc định PO |
| S6-Q5 | Giới hạn ảnh | BR-INV-24, 26 | JPEG/PNG/WebP, ≤ 5 MB, cạnh ngắn ≥ 600 px, cạnh dài ≤ 6.000 px, ≤ 12 ảnh/SP. | Mặc định PO |
| S6-Q6 | Điều chỉnh kho: giới hạn, lý do, ý nghĩa "đặt số đếm" | BR-INV-31, 32 | \|delta\| ≤ 10.000; số đếm 0–100.000 là Trong kho (gồm hàng đang giữ); 5 lý do cố định; ghi chú bắt buộc với "Sửa sai". | Mặc định PO |
| S6-Q7 | Giá biến thể, giá vốn, tags, SEO, bộ sưu tập, đối tượng voucher theo hạng/khách/riêng tư, nhiều danh mục | K2, K6, BR-INV-44 | Won't; ẩn ở HTTP. | Mặc định PO |
| S6-Q8 | Ngưỡng sắp hết | BR-INV-35, 36 | Mặc định 5 (Must); sửa ngưỡng: Should; storefront không đổi. | Mặc định PO |
| S6-Q9 | Khoảng giá | BR-INV-11 | Số nguyên 1.000–100.000.000 đồng; giá gốc > giá. | Mặc định PO |

---

## Slice 7: Admin khách hàng & nhân viên

Nguồn: backlog 4.9 (khách hàng, nhân viên; vô hiệu hoá / đổi vai trò bằng giao diện), backlog G4 (AC-AUTH-75, AC-AUTH-85), decisions 2026-11-08 (AC hoãn), Slice 1 (BR-AUTH-19, 20, 22, 29, 33, 34, 35, 37; AC-AUTH-75, 85), Slice 4 (BR-ADM-01..04, 06, 41; S4-Q9), Slice 5 (BR-ACC-15 hạng), Slice 6 (BR-INV-01..08 làm mẫu nền quyền). Thắng giao 2026-11-11: khách hàng (admin + staff đọc; khoá/mở khoá), nhân viên (chỉ admin; tạo, khoá/mở, đổi vai trò, thu hồi mọi phiên), đóng AC-AUTH-75 và phần còn lại của AC-AUTH-85, thay hai màn admin đang mock. Hiện trạng đã đọc: `schema.prisma` (`User`: `role` member/admin/staff, `is_active`, `password_hash` null được, `date_of_birth`, `phone_number`, `marketing_opt_in`, `terms_accepted_at` NOT NULL, không có cột ghi chú/tag/khoá-bởi; `Session`: `audience`, `revoked_at`, `revoke_reason`, `last_used_at`; `AuthActionToken` mục đích `reset_password`; `Address`; `Order.user_id`); `auth.service.ts` (đăng nhập từ chối tài khoản `is_active = false` kèm thư "tài khoản bị khoá"; đặt lại mật khẩu chỉ cho tài khoản đang hoạt động, mã OTP 10 phút, thu hồi mọi phiên); `session.service.ts` (`revokeAllUserSessions`; vai trò và `is_active` đọc lại mỗi yêu cầu); FE `admin/features/customers/*`, `settings/staff-page.ts`, `core/permissions.ts`, `data-access/models.ts`. Mã BR: `BR-USR`, AC: `AC-USR`. Tên endpoint, bảng, cột, mã lỗi do Backend chốt trong `openapi.yaml`; PRD chỉ nêu dữ liệu phải lưu và hành vi. Tiền là số nguyên đồng; múi giờ Asia/Ho_Chi_Minh. Mặc định PO ghi ở mục 7 (S7-Q#).

### 1. Vấn đề và mục tiêu

**Vấn đề.** Ở bản thật không có cách nào để biết ai là khách, khoá một tài khoản gian lận, hay thêm/bớt nhân viên: tài khoản staff/admin chỉ vào DB qua seed, khoá và đổi vai trò phải sửa SQL, và SQL không thu hồi phiên đang mở (AC-AUTH-75 và phần "API cài đặt nhân viên" của AC-AUTH-85 còn hoãn từ Slice 1). Hai màn admin Khách hàng và Nhân viên đã thiết kế nhưng chạy mock, hiện "Chưa khả dụng" ở HTTP.

**Mục tiêu.**
1. Staff/admin tra khách (tìm, lọc, phân trang), xem hồ sơ, hạng và đơn của khách, rồi nhảy sang màn đơn Slice 4; dữ liệu cá nhân che theo vai trò.
2. Admin khoá / mở khoá tài khoản khách; khoá thì khách mất mọi phiên ngay.
3. Admin tạo tài khoản nhân viên **mà không biết mật khẩu của họ**, khoá / mở, đổi vai trò staff ↔ admin; khoá hoặc đổi vai trò thì mọi phiên của tài khoản đó bị thu hồi ngay.
4. Không bao giờ để hệ thống còn 0 admin hoạt động; admin không tự khoá / tự hạ mình.
5. Mỗi lần tạo / khoá / mở / đổi vai trò có dòng nhật ký ai làm, lúc nào, vì sao.
6. Đóng AC-AUTH-75 và AC-AUTH-85; ở HTTP hai màn không còn dữ liệu mock.

**Không phải mục tiêu.** Báo cáo, nội dung, cài đặt cửa hàng, nhật ký toàn hệ thống, xuất file, ghi chú / tag khách, gộp khách, xoá tài khoản cứng, đổi giao diện admin.

### 2. Phạm vi

| Hạng mục | Mức | Lý do |
| --- | --- | --- |
| Quyền API (phiên `n2f_asid`, ma trận staff/admin), giới hạn tần suất, mã lỗi, cờ FE `adminUsersMode`, migration cộng thêm | Must | Nền an toàn, giống Slice 4 và 6. |
| Khách hàng: danh sách (tìm, tab, lọc hạng, sắp, phân trang), chi tiết (hồ sơ, hạng, số đơn, tổng chi, đơn gần nhất, 10 đơn mới nhất + liên kết sang màn đơn) | Must | Mục tiêu 1. |
| Che email / SĐT, ẩn ngày sinh và sổ địa chỉ với staff, ở phía máy chủ | Must | Dữ liệu cá nhân; ẩn bằng FE không phải bảo vệ. |
| Khoá / mở khoá khách (chỉ admin), lý do, thu hồi mọi phiên | Must | Mục tiêu 2. |
| Nhân viên: danh sách, tạo (họ tên, email, vai trò; không mật khẩu), khoá / mở, đổi vai trò, thu hồi phiên | Must | Mục tiêu 3. |
| Ràng buộc: không tự khoá / tự hạ, luôn ≥ 1 admin hoạt động (kể cả khi hai admin thao tác đồng thời) | Must | Mục tiêu 4. |
| Nhật ký thao tác tài khoản (bảng riêng, không sửa / xoá) | Must | Mục tiêu 5. |
| Sổ địa chỉ của khách (chỉ admin); xem lịch sử thao tác của một tài khoản; nhãn "Chờ đặt mật khẩu" + "Hoạt động gần nhất"; liên kết "Quên mật khẩu" ở `/admin/login` | Should | Hữu ích, không chặn vận hành. |
| Ghi chú nội bộ, tag, "Đã trả hàng", "Size hay mua", "Giá trị TB/đơn"; Xuất CSV khách | Won't | DB không có cột / chưa có trả hàng / định nghĩa chưa chốt / ngoài phạm vi. Ẩn ở HTTP. |
| Gộp khách, xoá tài khoản cứng, nâng khách thành nhân viên, tạo nhân viên bằng mật khẩu admin đặt, gửi lại thư mời, link mời một lần riêng, tự đổi họ tên nhân viên, thư báo khoá cho khách | Won't | Rủi ro dữ liệu / lộ mật khẩu / chưa cần. |
| Báo cáo, nội dung, cài đặt cửa hàng, nhật ký toàn hệ thống | Won't | Ngoài phạm vi Thắng giao; các mục này vẫn "Chưa khả dụng". |

### 3. Hiện trạng và hành vi được chọn

| # | Điểm | Hiện trạng | Chọn | Lý do |
| --- | --- | --- | --- | --- |
| K1 | "Khách" | `users.role = member`. Đơn khách vãng lai (không `user_id`) không thuộc tài khoản nào. | Danh sách / chi tiết chỉ gồm `member`; id của staff/admin ở API khách → 404. Số đơn, tổng chi, đơn gần nhất chỉ tính đơn có `user_id` của khách (khớp BR-ACC-15, CHK-05). | Không lẫn nhân viên vào khách; cùng cách tính với màn Hạng của khách. |
| K2 | Trường FE có, DB không | `note`, `tags`, `returnCount`, `usualSizes`, `averageOrderValue`; nút Xuất CSV. | Won't, ẩn ở HTTP; BE bỏ qua nếu gửi. `CustomerUpdate` ở HTTP chỉ còn đổi `status`. | Không thêm cột cho tính năng chưa dùng; trả hàng chưa có. |
| K3 | Hạng | FE `member/silver/gold` (Đồng / Bạc / Vàng); BE Slice 5 `bronze/silver/gold` tính theo chi tiêu năm dương lịch, không lưu vào `users`. | Dùng đúng BR-ACC-15; `bronze` hiển thị "Đồng". Lọc theo hạng tính tại lúc đọc. | Một nguồn sự thật với trang Hạng của khách. |
| K4 | Khoá khách | FE chữ "Khách không đăng nhập và đặt hàng được". Khoá = `is_active = false`; checkout vãng lai không cần tài khoản. | Khoá chặn đăng nhập / phiên / đặt lại mật khẩu; **không** chặn đặt hàng vãng lai bằng cùng email; sửa chữ FE: "Khách không đăng nhập được cho đến khi bạn mở khoá. Đơn đang xử lý không bị ảnh hưởng." | Chữ cũ hứa điều hệ thống không làm được. |
| K5 | Khoá nhân viên | FE chữ "bị đăng xuất"; hiện chỉ đọc lại `is_active` mỗi yêu cầu, không ghi `revoked_at`. | Thu hồi thật mọi dòng `sessions` (cả `admin` và `storefront`) trong cùng giao dịch (BR-AUTH-29). | Nếu không, mở khoá lại sẽ "sống lại" phiên cũ; đổi vai trò không làm phiên hết hiệu lực. |
| K6 | Tạo nhân viên | FE "Mời nhân viên" (họ tên, email, vai trò) và thư mời. BE có đặt lại mật khẩu bằng mã 8 chữ số, 10 phút, dùng cho mọi tài khoản đang hoạt động; `password_hash` cho phép null; `/auth/forgot-password` có ở storefront, `/admin/login` chưa có liên kết. | Mặc định S7-Q1: tạo tài khoản đang hoạt động, **chưa có mật khẩu**, gửi thư hướng dẫn nhân viên tự dùng "Quên mật khẩu" với chính email đó; thư không chứa mật khẩu hay mã. Admin không bao giờ biết hay đặt mật khẩu. | Dùng lại cơ chế đã kiểm thử, không bảng token mới, không trang mới. |
| K7 | Vai trò | `Role` enum cũ (không dùng) và `user_role` member/admin/staff; BR-AUTH-33: một tài khoản một vai trò. | Chỉ đổi giữa staff ↔ admin; không đổi từ / sang member. | Giữ ranh giới khách / nhân viên. |
| K8 | Cờ FE | `adminOrdersMode`, `adminCatalogMode` độc lập. | Cờ mới `adminUsersMode` (`http`/`mock`); `http` mở thêm "Khách hàng" và "Cài đặt › Nhân viên" (admin). | Phát hành tách khỏi các slice trước. |
| K9 | Dữ liệu cá nhân ở staff | S4-Q9: staff thấy SĐT/email người nhận ở màn đơn (cần để gọi). `permissions.ts`: `customers.contact` chỉ admin. | Màn Khách hàng: staff chỉ thấy email / SĐT đã che, không thấy ngày sinh và sổ địa chỉ (S7-Q3). | Màn đơn đã đủ cho việc gọi khách; danh bạ toàn bộ khách là dữ liệu rộng hơn. |

### 4. Business Rules

**Chung**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-USR-01 | Must | BR-INV-01 | Mọi API admin khách hàng và nhân viên chỉ nhận phiên `n2f_asid` còn hạn của tài khoản staff/admin đang hoạt động; vai trò và `is_active` đọc từ DB mỗi yêu cầu. Không phiên / hết hạn / thu hồi / chỉ có `n2f_sid` / `is_active = false` → 401 `unauthenticated`, `Cache-Control: no-store`, không dữ liệu. |
| BR-USR-02 | Must | BR-AUTH-33; AC-AUTH-85 | Ma trận quyền, kiểm ở mọi yêu cầu, trước khi đọc thân yêu cầu. **staff**: xem danh sách và chi tiết khách (dữ liệu đã che, BR-USR-11). **admin**: mọi việc của staff + xem đầy đủ liên hệ, khoá / mở khách, toàn bộ API nhân viên (danh sách, tạo, khoá / mở, đổi vai trò, xem lịch sử). Thiếu quyền → 403 `forbidden` ("Không đủ quyền"); dữ liệu không đổi, không có dòng nhật ký, không thư. |
| BR-USR-03 | Must | BR-ADM-04; BR-INV-03 | FE ẩn nút / route / menu không đủ quyền theo `permissions.ts` (khớp BR-USR-02): staff không thấy mục Cài đặt, nút Khoá / Mở khoá; `/admin/settings/staff` bị chặn. Nút gửi khoá khi đang gửi; lỗi (kể cả mất mạng) hiện thông báo, giữ nguyên dữ liệu đã nhập; sau khi có mạng bấm lại không tạo bản ghi thứ hai (BR-USR-19, 21 idempotent). Phiên bị thu hồi khi đang xem → yêu cầu kế tiếp 401 → về `/admin/login`. |
| BR-USR-04 | Must | BR-INV-04 | Giới hạn theo tài khoản, dùng chung bộ đếm admin: đọc 120 / 60 giây, ghi 60 / 60 giây; tạo nhân viên thêm giới hạn 10 lần / 60 phút / admin. Vượt → 429 `rate-limited` + `retryAfterSeconds` + `Retry-After`. |
| BR-USR-05 | Must | BR-INV-06 | Cờ `adminUsersMode` (`http` bản thường / `mock` e2e). `http`: Khách hàng và Cài đặt › Nhân viên gọi API thật, không đọc / ghi mock; menu của admin gồm Đơn hàng, Sản phẩm, Tồn kho, Khuyến mãi, Khách hàng, Cài đặt (chỉ gồm "Nhân viên"); các route admin khác vẫn "Chưa khả dụng"; ô Won't (K2) và các dòng quyền thuộc tính năng Won't (xuất file, trả hàng, doanh thu, giá vốn, nhật ký, cài đặt cửa hàng) ẩn. `mock`: như hiện tại, Playwright mock pass nguyên. |
| BR-USR-06 | Must | BR-INV-07 | Migration chỉ cộng thêm (không `DROP`/`TRUNCATE`/đổi kiểu, không xoá dữ liệu); bảng mới bật RLS; chạy `migrate deploy` 2 lần thì lần 2 không có gì. Cần lưu thêm: nhật ký thao tác tài khoản (BR-USR-24). Không đổi bảng `users`, `sessions` (nếu BE cần cột mới phải là cộng thêm và nêu trong plan). |
| BR-USR-07 | Must | BR-INV-08 | Mã lỗi ổn định (FE map theo `code`): `unauthenticated` 401, `forbidden` 403, `not-found` 404, `validation` 422 (+`field`), `duplicate` 409 (+`field: email`), `self-change` 409, `last-admin` 409, `rate-limited` 429, lỗi máy chủ; không stack trace, SQL. Tên `self-change`, `last-admin` do BE chốt. FE hiện câu tiếng Việt riêng cho từng mã, không trang trắng. |

**Khách hàng**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-USR-08 | Must | K1, K3 | Danh sách chỉ gồm `member`, cả đang hoạt động và bị khoá. Tìm `q` (cắt khoảng trắng, ≤ 100 ký tự, dài hơn → 422 `field: q`): tên (chứa, không phân biệt hoa thường và dấu), email (chứa, không phân biệt hoa thường), SĐT (chuẩn hoá `+84` / `84` → `0`, chứa ≥ 4 chữ số liên tiếp); `%` và `_` là ký tự thường. Tab `all` / `blocked` kèm số đếm; lọc `tier` ∈ {`bronze`, `silver`, `gold`}; sắp `lastOrderAt` giảm (khách chưa có đơn ở cuối), `totalSpent` giảm, `orderCount` giảm, tên A–Z; hoà theo id; `page` ≥ 1, `limit` 1–50 (mặc định 20), ngoài khoảng → 422; trang quá cuối → `items` rỗng, `total` đúng. Mỗi dòng: tên, email, SĐT, hạng, số đơn, tổng chi, đơn gần nhất, trạng thái. |
| BR-USR-09 | Must | BR-ACC-15; CHK-05 | Số liệu mỗi khách: `orderCount` = số đơn có `user_id` của khách, trừ `cancelled`; `totalSpent` = tổng `total` các đơn `completed` của khách (đồng, số nguyên); `lastOrderAt` = thời điểm đặt gần nhất trong các đơn tính ở `orderCount` (null nếu 0); hạng theo BR-ACC-15 (chi tiêu năm dương lịch hiện tại, giờ VN: Đồng < 18.000.000 ≤ Bạc < 40.000.000 ≤ Vàng). Đơn khách vãng lai trùng email không tính. Số liệu đọc tại thời điểm gọi, không cache. |
| BR-USR-10 | Must | — | Chi tiết khách gồm: tên, email, SĐT, hạng và chi tiêu năm nay, `createdAt`, `marketingOptIn`, trạng thái (`active` / `blocked`), `orderCount`, `totalSpent`, `lastOrderAt`, 10 đơn mới nhất (cùng trường dòng của BR-ADM-05, mỗi đơn dẫn sang chi tiết ở màn Đơn hàng Slice 4), và (admin) ngày sinh. Nút "Xem tất cả đơn" mở màn Đơn hàng với `q` = email khách (hiển thị cả đơn vãng lai cùng email; chữ ghi rõ "theo email"). Id không tồn tại hoặc là staff/admin → 404. |
| BR-USR-11 | Must | K9; BR-AUTH-35 | Che ở **phía máy chủ**, theo vai trò của người gọi: staff nhận email dạng `mi***@gmail.com` (giữ 2 ký tự đầu, che phần còn lại của tên) và SĐT dạng `0912 *** 678` (giữ 4 chữ số đầu, 3 cuối); phản hồi cho staff **không chứa** ngày sinh, sổ địa chỉ và giá trị đầy đủ của email / SĐT (kể cả trong mảng đơn). Admin nhận đầy đủ. Tìm kiếm khớp theo giá trị đầy đủ ở cả hai vai trò. Chữ FE khi che: "Liên hệ được ẩn bớt theo quyền của bạn." |
| BR-USR-12 | Should | K9 | Sổ địa chỉ của khách (chỉ admin; mỗi địa chỉ: người nhận, SĐT, số nhà + phường/xã + tỉnh/thành, đánh dấu mặc định; mặc định đứng đầu, rồi mới tạo trước). Staff không thấy mục này. Chỉ đọc. |
| BR-USR-13 | Must | BR-AUTH-35 | Không phản hồi nào (kể cả lỗi, log) chứa `password_hash`, mã OTP / băm token, nội dung phiên, `ip_address`, `user_agent`, `refresh_token_hash`. |
| BR-USR-14 | Must | BR-AUTH-19, 29; BR-AUTH-37 | Khoá khách (chỉ admin): lý do bắt buộc 5–250 ký tự (NFC, cắt hai đầu). Trong **một giao dịch**: `is_active = false`, thu hồi mọi phiên (BR-USR-16), ghi 1 dòng nhật ký (BR-USR-24). Khách đã khoá: không đăng nhập bằng mã / mật khẩu (nhận lỗi tài khoản bị khoá và thư "tài khoản bị khoá" theo BR-AUTH-19, 37), không đặt lại mật khẩu được. Đơn đang xử lý của khách không đổi; đặt hàng vãng lai bằng cùng email vẫn được (K4). Không gửi thư cho khách lúc bị khoá. Khoá khách đã khoá → 200, không đổi gì, không dòng nhật ký mới. |
| BR-USR-15 | Must | — | Mở khoá khách (chỉ admin): lý do tuỳ chọn ≤ 250 ký tự; `is_active = true`, 1 dòng nhật ký; **không** khôi phục phiên đã thu hồi (khách đăng nhập lại như bình thường); mở khoá khách đang hoạt động → 200, không đổi, không nhật ký. |
| BR-USR-16 | Must | BR-AUTH-29; AC-AUTH-75 | Thu hồi phiên: khi khoá tài khoản (khách hoặc nhân viên) hoặc đổi vai trò, mọi dòng `sessions` còn hiệu lực của tài khoản đó (cả `admin` và `storefront`) được đặt `revoked_at` và `revoke_reason` (`account-disabled` hoặc `role-changed`) trong cùng giao dịch với thay đổi; lỗi giữa chừng thì không đổi gì. Yêu cầu kế tiếp từ **mọi** máy đang đăng nhập → 401 `unauthenticated` như BR-AUTH-26, không chờ hết hạn phiên. Mở khoá không thu hồi gì. |
| BR-USR-17 | Should | — | Lịch sử thao tác của một tài khoản (khách hoặc nhân viên): 20 dòng mới nhất, mới trước, chỉ admin xem; trường theo BR-USR-24. |

**Nhân viên**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-USR-18 | Must | BR-AUTH-33 | Danh sách nhân viên (chỉ admin): mọi tài khoản `staff` / `admin`, cả đã khoá, tối đa 200 dòng, không phân trang, sắp `createdAt` tăng, hoà theo id. Mỗi dòng: id, họ tên, email, vai trò, trạng thái (`active` / `disabled`), `createdAt`, `lastActiveAt` (`last_used_at` lớn nhất trong các phiên; null nếu chưa đăng nhập). Không chứa `member`. |
| BR-USR-19 | Must | K6, K7 | Tạo nhân viên (chỉ admin): họ tên 2–100 ký tự (NFC, gộp khoảng trắng; BE chốt cách tách họ / tên, hiển thị lại đúng chuỗi đã nhập), email hợp lệ ≤ 254 ký tự (cắt hai đầu, chuyển chữ thường), vai trò ∈ {`staff`, `admin`}. Email đã tồn tại ở **bất kỳ** tài khoản nào (không phân biệt hoa thường, kể cả khách) → 409 `duplicate` `field: email`, không tạo gì. Thành công: tài khoản `is_active = true`, chưa có mật khẩu, `marketing_opt_in = false`, 1 dòng nhật ký, 201 (không chứa mật khẩu), 1 thư hướng dẫn (BR-USR-20). Lỗi gửi thư không làm hỏng việc tạo (vẫn 201; tài khoản dùng được qua "Quên mật khẩu"). |
| BR-USR-20 | Must | BR-AUTH-20, 22 | Đặt mật khẩu nhân viên: thư gửi tới email nhân viên nêu vai trò và hướng dẫn mở trang "Quên mật khẩu", nhập đúng email này, nhập mã 8 chữ số nhận bằng thư (hiệu lực 10 phút, một lần; mã mới yêu cầu lại được bất cứ lúc nào theo giới hạn BR-AUTH-04..09), đặt mật khẩu theo BR-AUTH-20. Thư mời **không chứa mã hay mật khẩu**. Không ai khác (kể cả admin tạo) biết hay đặt được mật khẩu; không mật khẩu nào xuất hiện trong phản hồi, log, thư, nhật ký. Chưa đặt mật khẩu thì không đăng nhập mật khẩu được (lỗi như sai thông tin, BR-AUTH-17). Tài khoản bị khoá không nhận mã đặt mật khẩu (BR-AUTH-19). |
| BR-USR-21 | Must | BR-AUTH-29 | Khoá / mở nhân viên (chỉ admin): khoá cần lý do 5–250 ký tự, theo cách BR-USR-14 (một giao dịch: `is_active`, thu hồi phiên, nhật ký); mở: lý do tuỳ chọn, theo BR-USR-15. Khoá tài khoản đã khoá / mở tài khoản đang hoạt động → 200 không đổi, không nhật ký. Nhân viên bị khoá giữ nguyên lịch sử thao tác (đơn, tồn kho, nhật ký). |
| BR-USR-22 | Must | BR-AUTH-29, 33 | Đổi vai trò (chỉ admin) giữa `staff` ↔ `admin`: một giao dịch gồm đổi `role`, thu hồi mọi phiên (BR-USR-16, `role-changed`), 1 dòng nhật ký (vai trò trước / sau); lý do tuỳ chọn ≤ 250 ký tự. Đặt đúng vai trò hiện tại → 200 không đổi, không nhật ký. Không đổi từ / sang `member`. Nhân viên phải đăng nhập lại để có quyền mới. |
| BR-USR-23 | Must | — | Ràng buộc an toàn, kiểm trong giao dịch và có khoá chống đua: (a) admin không tự khoá và không tự đổi vai trò của chính mình → 409 `self-change`, không đổi gì; (b) sau mọi thao tác khoá hoặc hạ vai trò, số admin `is_active = true` phải ≥ 1, ngược lại → 409 `last-admin`, không đổi gì; (c) hai admin thao tác đồng thời (vd. mỗi người hạ người kia) không bao giờ để lại 0 admin hoạt động: nhiều nhất một thao tác thành công, thao tác còn lại nhận 409 `last-admin` hoặc 401 (phiên đã bị thu hồi). FE không hiện menu thao tác ở dòng "(bạn)". |
| BR-USR-24 | Must | BR-INV-34 | Nhật ký thao tác tài khoản: mỗi lần tạo nhân viên, khoá, mở khoá, đổi vai trò ghi đúng 1 dòng trong cùng giao dịch: thời điểm, hành động (`staff-created`, `locked`, `unlocked`, `role-changed`), người thực hiện (id, họ tên, vai trò lúc đó), tài khoản bị tác động (id, email và họ tên lúc đó), vai trò trước / sau (khi đổi vai trò hoặc tạo), lý do, số phiên đã thu hồi. Không có API sửa / xoá; không có API xoá tài khoản; dòng giữ khi tài khoản bị tác động bị khoá. Chỉ admin đọc (BR-USR-17). Thao tác bị từ chối (403, 409, 422) không để lại dòng. |
| BR-USR-25 | Should | K6 | Màn Nhân viên: tài khoản chưa có mật khẩu hiện "Chờ đặt mật khẩu" (thay "Chưa đăng nhập"); đã khoá hiện "Đã khóa"; còn lại "Hoạt động {tương đối}". `/admin/login` có liên kết "Quên mật khẩu" tới trang Quên mật khẩu của storefront. |

### 5. Acceptance criteria

Dữ liệu tham chiếu: admin A, A2; staff S; nhân viên N (staff, mới tạo); khách M (`minh.nguyen@gmail.com`, SĐT `0912345678`, ngày sinh 14/03/1998, 2 địa chỉ: 1 mặc định; đơn O1 `completed` 2.000.000 đồng, O2 `to_ship` 500.000, O3 `cancelled` 300.000, đều đặt năm nay); khách M2 đã bị khoá; khách vãng lai G. Mỗi AC ghi BR; AC đóng AC hoãn của Slice 1 được **in đậm**.

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-USR-01 | 01 | Không cookie; chỉ `n2f_sid` của M; `n2f_asid` của S sau khi `is_active = false` (SQL) | `GET` danh sách khách, `GET` danh sách nhân viên, `POST` khoá khách, `POST` tạo nhân viên | Cả bốn: 401 `unauthenticated`, `Cache-Control: no-store`, không dữ liệu; DB không đổi. |
| **AC-USR-02** (**đóng AC-AUTH-85**) | 02 | S đăng nhập admin; A đăng nhập admin | S gọi: danh sách nhân viên, tạo nhân viên, đổi vai trò N, khoá N, khoá khách M, xem lịch sử tài khoản. Sau đó A gọi cùng các API | S: 403 `forbidden` (FE "Không đủ quyền") cho cả sáu; DB không đổi, không dòng nhật ký, không thư. A: 200 / 201 cho cùng các API. S vẫn xem được danh sách khách và chi tiết M (200). |
| AC-USR-03 | 02 | A bị hạ thành staff bằng SQL; S được nâng thành admin bằng SQL, cả hai đang có phiên | A gọi danh sách nhân viên; S gọi danh sách nhân viên (yêu cầu kế tiếp) | A: 403 `forbidden`. S: 200. Không cần đăng nhập lại (vai trò đọc từ DB). |
| AC-USR-04 | 03 | `adminUsersMode: http` | S mở admin; mở `/admin/customers`, chi tiết M, `/admin/settings/staff`. A mở cùng các trang | S: menu có Khách hàng, không có Cài đặt; chi tiết M không có nút Khoá / Mở khoá; `/admin/settings/staff` bị chặn (không hiện nội dung). A: có Khách hàng, Cài đặt › Nhân viên, nút Khoá / Mở khoá. |
| AC-USR-05 | 03 | A ở màn Nhân viên, mất mạng | Bấm "Khoá tài khoản" cho N, xác nhận | Nút khoá khi đang gửi; lỗi mất mạng hiện thông báo; trạng thái hàng N không đổi; có mạng lại bấm khoá lần nữa: đúng 1 dòng nhật ký `locked` cho N. |
| AC-USR-06 | 04 | A | 61 yêu cầu ghi trong 60 giây; 11 lần tạo nhân viên trong 60 phút | Yêu cầu ghi 61 và lần tạo 11: 429 `rate-limited` + `retryAfterSeconds`, `Retry-After`; 10 lần tạo trước đó vẫn thành công. |
| AC-USR-07 | 05 | Build thường (`http` cả ba cờ) | A mở admin | Menu: Đơn hàng, Sản phẩm, Tồn kho, Khuyến mãi, Khách hàng, Cài đặt; Cài đặt chỉ có "Nhân viên"; `/admin/settings/store`, `/admin/settings/audit`, trang tổng quan → "Chưa khả dụng"; không request nào tới mock ở hai màn; Playwright `adminUsersMode: mock` pass nguyên. |
| AC-USR-08 | 05 | `http`; A mở danh sách + chi tiết khách và màn Nhân viên | Xem các ô | Không có Xuất CSV, Ghi chú, Tag, "Đã trả hàng", "Size hay mua", "Giá trị TB/đơn"; bảng quyền không có dòng xuất file, trả hàng, doanh thu, giá vốn, nhật ký, cài đặt cửa hàng; chữ khoá khách là "Khách không đăng nhập được cho đến khi bạn mở khoá. Đơn đang xử lý không bị ảnh hưởng." |
| AC-USR-09 | 06 | DB có dữ liệu Slice 1–6 | `migrate deploy` 2 lần | Lần 2 không có migration mới; không DROP/TRUNCATE/đổi kiểu; bảng mới bật RLS; số dòng `users`, `sessions`, `orders` không đổi. |
| AC-USR-10 | 07, 13 | Gây từng lỗi của AC-USR-01, 02, 23, 33, 37, 41 | Đọc thân phản hồi và FE | Có `code` ổn định theo BR-USR-07 và HTTP đúng; không stack trace, SQL; không có khoá `password_hash`, `refresh_token_hash`, `ip_address`, `user_agent`, mã OTP; FE hiện đúng câu cho `self-change`, `last-admin`, `duplicate`, không trang trắng. |
| AC-USR-11 | 08 | 25 khách, M có đơn gần nhất, 5 khách chưa có đơn | Mở danh sách mặc định; trang 2; `limit=51`; `limit=0`; `page=99` | Trang 1: 20 dòng, M trước khách có đơn cũ hơn, 5 khách chưa có đơn ở cuối; trang 2: 5 dòng; `total` 25; 422; 422; `items` rỗng, `total` 25. |
| AC-USR-12 | 08 | Có khách "Nguyễn Văn Minh" | `q` = `nguyen van minh`; `minh.ng`; `0912`; `+84912345`; `q` 101 ký tự; `q` = `%` | Mỗi cách tìm của 4 giá trị đầu ra M (khớp tên bỏ dấu, email, SĐT chuẩn hoá); 422 `validation` `field: q`; `%` chỉ khớp khách có ký tự `%`. |
| AC-USR-13 | 08 | M2 bị khoá; 2 khách Vàng, 5 Bạc | Mở tab "Đã khóa"; lọc hạng Vàng; lọc Vàng + tab Đã khóa | Tab `blocked` đếm đúng và liệt kê M2; lọc Vàng ra đúng 2; kết hợp ra giao đúng; số đếm tab khớp số dòng. |
| AC-USR-14 | 08, 10 | Có A, S, N trong `users` | Xem toàn bộ danh sách khách; `GET` chi tiết với id của S; id không tồn tại | Không dòng nào là A / S / N; id của S → 404 `not-found`; id lạ → 404. |
| AC-USR-15 | 09 | M như dữ liệu tham chiếu | Xem dòng và chi tiết M | `orderCount` 2 (O1, O2; O3 huỷ không tính); `totalSpent` 2.000.000; `lastOrderAt` = giờ đặt O2; số nguyên đồng; giờ hiển thị Asia/Ho_Chi_Minh; đơn G (vãng lai, cùng email M) không được tính. |
| AC-USR-16 | 09 | Khách K1 chi tiêu năm nay (đơn `completed`) 17.999.999; K2 18.000.000; K3 40.000.000; K4 có đơn `completed` năm ngoái 50.000.000, năm nay 0 | Xem hạng ở danh sách và chi tiết | Đồng; Bạc; Vàng; Đồng; chi tiết hiện chi tiêu năm nay và khớp `GET /account/membership` của chính khách. |
| AC-USR-17 | 10 | M có 12 đơn | Mở chi tiết M; bấm một đơn; bấm "Xem tất cả đơn" | Đúng 10 đơn mới nhất, mới trước; đơn mở ra màn chi tiết Slice 4 đúng đơn; "Xem tất cả đơn" mở màn Đơn hàng với `q` = email M (có chữ "theo email"). |
| AC-USR-18 | 11 | S và A cùng xem M (danh sách và chi tiết) | Đọc phản hồi JSON và giao diện | S: email `mi***@gmail.com`, SĐT `0912 *** 678`; JSON không chứa chuỗi `minh.nguyen`, `0912345678`, ngày sinh, địa chỉ; chữ "Liên hệ được ẩn bớt theo quyền của bạn." A: email, SĐT, ngày sinh đầy đủ. |
| AC-USR-19 | 11 | S | Tìm `q` = `minh.nguyen@gmail.com` và `0912345678` | Ra M (tìm theo giá trị đầy đủ); hiển thị vẫn che. |
| AC-USR-20 (Should) | 12 | M có 2 địa chỉ, 1 mặc định | A xem chi tiết M; S xem chi tiết M | A: 2 địa chỉ, mặc định đứng đầu, đủ người nhận / SĐT / số nhà + phường + tỉnh. S: không có mục Sổ địa chỉ, JSON không có địa chỉ. |
| AC-USR-21 | 13 | Mọi API Slice 7, cả thành công và lỗi | Quét thân phản hồi và log máy chủ trong lúc chạy AC-USR-01..43 | Không có `password_hash`, băm token, mã OTP, mật khẩu, `ip_address`, `user_agent`. |
| AC-USR-22 | 14 | M đang đăng nhập ở 2 trình duyệt (2 phiên `n2f_sid`), có O2 `to_ship` | A khoá M với lý do "Hoàn hàng gian lận lặp lại"; M gọi `GET /account/profile` ở cả hai trình duyệt | 200; `is_active = false`; 2 dòng `sessions` có `revoked_at` và `revoke_reason = account-disabled`; 1 dòng nhật ký `locked` kèm lý do và số phiên 2; cả hai yêu cầu của M: 401 `unauthenticated`. |
| AC-USR-23 | 14 | A | Khoá M với lý do 4 ký tự; 251 ký tự; thiếu; khoá lần hai M đã khoá; id lạ | 422 `validation` `field: reason` ×3; khoá lần hai: 200, không dòng nhật ký mới; 404. |
| AC-USR-24 | 14 | M bị khoá | M đăng nhập bằng mã và bằng mật khẩu; M yêu cầu đặt lại mật khẩu; khách vãng lai đặt COD bằng email của M; kiểm O2 | Đăng nhập: lỗi tài khoản bị khoá (BR-AUTH-19) và nhận thư "tài khoản bị khoá"; không nhận mã đặt lại, không đổi mật khẩu; đơn vãng lai tạo được; O2 vẫn `to_ship`, không đổi. |
| AC-USR-25 | 15 | M bị khoá; cookie `n2f_sid` cũ của M lưu trước khi khoá | A mở khoá M (có / không lý do); M đăng nhập; M dùng cookie cũ; A mở khoá M đang hoạt động | `is_active = true`, 1 dòng nhật ký `unlocked`; M đăng nhập được; cookie cũ vẫn 401 (không "sống lại"); mở khoá lần hai: 200 không đổi, không dòng nhật ký mới. |
| **AC-USR-26** (**đóng AC-AUTH-75**) | 16, 21 | N (staff) đăng nhập admin ở 2 máy (2 phiên `n2f_asid`) | A khoá N; N gọi `GET /admin/customers` ở máy 1 rồi máy 2 | Cả hai: 401 `unauthenticated`, FE về `/admin/login`; 2 dòng `sessions` `revoked_at` có, `revoke_reason = account-disabled`; trong cùng giao dịch nhật ký `locked` ghi số phiên 2. Máy 1 đang mở màn khi bị khoá: yêu cầu kế tiếp cũng 401. |
| **AC-USR-27** (**đóng AC-AUTH-75**) | 16, 22 | A2 (admin) đăng nhập 2 máy | A hạ A2 thành staff; A2 gọi API nhân viên ở cả 2 máy; A2 đăng nhập lại | Hai yêu cầu: 401 `unauthenticated` (không phải 403: phiên đã bị thu hồi); `revoke_reason = role-changed`; đăng nhập lại được, API nhân viên 403 (vai trò mới), khách / đơn 200. |
| AC-USR-28 | 16 | Giao dịch khoá N gặp lỗi giữa chừng (giả lập lỗi ở bước thu hồi / nhật ký) | A khoá N | 5xx hoặc lỗi; `is_active` của N vẫn `true`, không dòng nhật ký, phiên của N không bị thu hồi. |
| AC-USR-29 | 16, 21 | N khoá rồi mở khoá | N dùng cookie cũ; N đăng nhập lại | Cookie cũ 401; đăng nhập lại thành công, phiên mới dùng được. |
| AC-USR-30 (Should) | 17 | M có 3 thao tác (khoá, mở, khoá) | A xem lịch sử M; S xem | A: 3 dòng mới trước, đủ người / vai trò / hành động / lý do; S: 403. |
| AC-USR-31 | 18 | Có A, A2, S, N bị khoá, nhiều khách | A mở danh sách nhân viên | Chỉ A, A2, S, N (kể cả N bị khoá, đánh dấu `disabled`); không khách; mỗi dòng đủ trường BR-USR-18; `lastActiveAt` = `last_used_at` lớn nhất của phiên, null nếu chưa đăng nhập; không `password_hash`. |
| AC-USR-32 | 19, 20 | A | Tạo "Trần Thu Hà", `ha.tran@nine2fine.test` (có khoảng trắng và chữ hoa), vai trò `staff` | 201 kèm id, vai trò `staff`, `active`, email lưu chữ thường đã cắt; `password_hash` NULL (SQL); 1 dòng nhật ký `staff-created` người A; 1 thư tới email đó nêu vai trò và hướng dẫn "Quên mật khẩu", không chứa mật khẩu hay mã; phản hồi không có mật khẩu. |
| AC-USR-33 | 19 | A | Tạo với email sai định dạng; 255 ký tự; họ tên 1 ký tự và 101 ký tự; vai trò `member`, `owner`; email của S (đổi hoa thường); email của khách M | Các trường sai: 422 `validation` đúng `field`; email của S và của M: 409 `duplicate` `field: email`; không tạo gì, không nhật ký, không thư. |
| AC-USR-34 | 19 | SMTP lỗi | A tạo nhân viên | 201, tài khoản tạo, 1 dòng nhật ký; không 500; nhân viên vẫn đặt được mật khẩu qua "Quên mật khẩu" khi hết lỗi. |
| AC-USR-35 | 20 | N mới tạo, chưa đặt mật khẩu | N đăng nhập `/admin/login` với mật khẩu bịa; N vào "Quên mật khẩu", nhập email, nhập mã trong thư, đặt mật khẩu yếu rồi mật khẩu hợp lệ; N đăng nhập `/admin/login`; nhập mã sau 11 phút | Đăng nhập bịa: lỗi sai thông tin, không lộ "chưa đặt mật khẩu"; mật khẩu yếu: lỗi theo BR-AUTH-20; hợp lệ: vào `/admin` đúng vai trò; mã quá 10 phút: lỗi hết hạn, yêu cầu mã mới được. |
| AC-USR-36 | 20 | N bị khoá trước khi đặt mật khẩu | N yêu cầu mã ở "Quên mật khẩu" | Không đặt lại được; nhận thư "tài khoản bị khoá" (BR-AUTH-19, 37). |
| AC-USR-37 | 21, 23 | A, S | A khoá S với lý do 5 ký tự; lý do rỗng; A mở khoá S; A khoá chính A; A mở menu ở dòng của A | Khoá thành công; 422 `field: reason`; mở khoá thành công; 409 `self-change`, A vẫn hoạt động; dòng "(bạn)" không có menu thao tác. Mỗi thao tác thành công 1 dòng nhật ký. |
| AC-USR-38 | 22, 23 | A, S | A đổi S thành admin; S đăng nhập lại và mở Cài đặt; A đổi S về staff; A đổi chính A thành staff; A đặt S thành staff khi S đã staff | Đổi thành công, S thấy "Cài đặt"; đổi về staff được; 409 `self-change`, vai trò A không đổi; 200 không đổi, không dòng nhật ký mới. |
| AC-USR-39 | 22 | Khách M | A gọi API đổi vai trò với id của M, hoặc đổi sang `member` | 404 `not-found` (M không thuộc nhân viên); 422 `field: role`; M vẫn `member`. |
| AC-USR-40 | 23 | Chỉ A và A2 là admin hoạt động; chạy 20 lần: A hạ A2 và A2 hạ A (hoặc khoá nhau) cùng lúc | Hai yêu cầu song song | Sau mỗi lần: số admin `is_active` ≥ 1; nhiều nhất một thao tác thành công (200), bên còn lại 409 `last-admin` hoặc 401; không 500; mỗi thao tác thành công đúng 1 dòng nhật ký. |
| AC-USR-41 | 23 | A là admin hoạt động duy nhất, A3 là admin đã bị khoá | A khoá A; A hạ A; A hạ A3 xuống staff; A mở khoá A3 | 409 `self-change`; 409 `self-change`; 200; 200; luôn còn ≥ 1 admin hoạt động. |
| AC-USR-42 | 24 | Sau AC-USR-32, 37, 38 | A đọc lịch sử qua API lịch sử (BR-USR-17); thử `PUT` / `DELETE` một dòng; `DELETE` tài khoản khách và nhân viên | Dòng đủ thời điểm, hành động, người thực hiện + vai trò, tài khoản đích (id, email, họ tên lúc đó), vai trò trước / sau, lý do, số phiên thu hồi; thao tác bị từ chối (AC-USR-23, 33, 37) không có dòng; `PUT` / `DELETE` → 404 hoặc 405; không có API xoá tài khoản. |
| AC-USR-43 (Should) | 25 | N chưa đặt mật khẩu; N2 đã đăng nhập hôm qua; N3 bị khoá | A mở màn Nhân viên; mở `/admin/login` | N "Chờ đặt mật khẩu"; N2 "Hoạt động … trước"; N3 "Đã khóa"; `/admin/login` có liên kết "Quên mật khẩu" mở trang đăng nhập storefront kèm hướng dẫn "nhập email → Sử dụng mật khẩu → Quên mật khẩu" (trang quên mật khẩu cần email từ bước đăng nhập, theo Slice 1); thư mời nhân viên hướng dẫn cùng đường đi. |
| AC-USR-44 | 08 | `http`; A mở danh sách khách; chặn mạng; DB không có khách; lọc không khớp | Tải lại; bỏ chặn bấm "Thử lại"; xem trạng thái rỗng | Lỗi + nút "Thử lại", bộ lọc trên URL giữ nguyên; sau thử lại ra đúng danh sách; "Chưa có khách hàng" (DB rỗng) khác "Không tìm thấy khách hàng phù hợp" (có lọc). |

### 6. Định nghĩa xong của Slice 7

- AC Must đạt (test BE/E2E ghi mã AC), AC Should ghi làm hay hoãn.
- `openapi.yaml` có tag cho khách hàng admin và nhân viên (locked trước khi FE nối); migration chỉ cộng thêm; `decisions.md`, `handoff.md` cập nhật.
- Ở `adminUsersMode: http` hai màn không có dữ liệu mock; Playwright mock pass nguyên.
- **Đóng AC hoãn:** AC-AUTH-75 bằng AC-USR-26, 27 (và 29); AC-AUTH-85 bằng AC-USR-02 (staff 403 / admin được trên API nhân viên). Ghi kết quả vào backlog G4.
- Khoá hoặc đổi vai trò luôn thu hồi mọi phiên và có đúng 1 dòng nhật ký (AC-USR-22, 26, 27, 42); không bao giờ 0 admin hoạt động (AC-USR-40, 41); admin không biết mật khẩu nhân viên (AC-USR-32, 35).
- Lát nghiệm thu thật trên Supabase (7.7) cần Thắng duyệt áp migration.

### 7. Câu hỏi mở

Mặc định PO, làm trước theo mặc định; Thắng đổi được bằng cách trả lời. Không câu nào chặn lát 7.1–7.6; chỉ lát 7.7 cần Thắng duyệt áp migration và gửi thư thật.

| # | Câu hỏi | Ảnh hưởng | Mặc định PO | Trạng thái |
| --- | --- | --- | --- | --- |
| S7-Q1 | Cách tạo tài khoản nhân viên mà admin không biết mật khẩu | BR-USR-19, 20; K6 | Admin nhập họ tên, email, vai trò; hệ thống tạo tài khoản chưa có mật khẩu và gửi thư hướng dẫn dùng "Quên mật khẩu" với email đó (mã 10 phút, yêu cầu lại được). Không bảng token mới, không trang đặt mật khẩu admin. Phương án thay thế (liên kết mời một lần 24 giờ + trang đặt mật khẩu riêng) = Won't lần này; phương án admin đặt mật khẩu tạm bị loại. | Mặc định PO |
| S7-Q2 | Staff có được khoá / mở khoá khách? | BR-USR-02, 14, 15 | Không; chỉ admin (khoá làm khách mất phiên ngay). Staff chỉ xem. Cho staff = đổi `customers.edit` và BR-USR-02. | Mặc định PO |
| S7-Q3 | Staff thấy email / SĐT khách đầy đủ? | BR-USR-11, 12; K9 | Không: email và SĐT che, không thấy ngày sinh và sổ địa chỉ; đã đủ thông tin người nhận ở màn đơn (S4-Q9). Cho thấy đầy đủ = cấp `customers.contact` cho staff. | Mặc định PO (Thắng đổi được) |
| S7-Q4 | Quy tắc khoá khách | BR-USR-14 | Lý do bắt buộc 5–250 ký tự; không gửi thư lúc khoá; chỉ chặn đăng nhập, không chặn đặt hàng vãng lai bằng cùng email. | Mặc định PO |
| S7-Q5 | Email đã là khách có thể được nâng thành nhân viên? | BR-USR-19, 22 | Không: 409 `duplicate`; nhân viên dùng email riêng. Không đổi từ / sang `member`. | Mặc định PO |
| S7-Q6 | Hạng hiển thị | BR-USR-09 | Theo BR-ACC-15 (Đồng / Bạc / Vàng, chi tiêu năm dương lịch hiện tại, ngưỡng 18.000.000 và 40.000.000). | Mặc định PO |
| S7-Q7 | Trường FE không có dữ liệu | K2 | Ghi chú, tag, đã trả hàng, size hay mua, giá trị TB, Xuất CSV: Won't, ẩn ở HTTP. | Mặc định PO |
| S7-Q8 | Xoá tài khoản | BR-USR-24 | Không xoá cứng; "ngừng dùng" = khoá; nhật ký giữ vĩnh viễn. | Mặc định PO |
| S7-Q9 | Giới hạn | BR-USR-04, 08, 18, 19 | Tạo nhân viên 10 lần / 60 phút / admin; danh sách khách `limit` ≤ 50; nhân viên ≤ 200 dòng; lý do 5–250 ký tự; họ tên 2–100 ký tự. | Mặc định PO |

## Slice 8: Admin tổng quan & cài đặt cửa hàng

Nguồn: master plan mục 52 (P0 admin vận hành), Slice 4 (BR-ADM-07 tab đếm, BR-ADM-10 sự kiện đơn), Slice 5 (BR-ACC-15), Slice 6 (BR-INV tồn kho: ba con số, ngưỡng sắp hết, `inventory_adjustments`), Slice 7 (BR-USR-24 `account_events`, ma trận quyền admin / staff), Slice 3 (`store_settings`, `pricing.ts`). Thắng giao 2026-11-12: Tổng quan chạy số thật, Báo cáo bán hàng, Cài đặt cửa hàng, Nhật ký hệ thống (PO quyết); không gồm nội dung (collections, bảng size, đánh giá, trang chủ) và trả hàng. Thắng đang vắng: mọi câu hỏi mở chốt theo mặc định PO (mục 7), Thắng đổi được khi quay lại. Mã BR: `BR-INS` (chung), `BR-DSH` (tổng quan), `BR-RPT` (báo cáo), `BR-SET` (cài đặt), `BR-AUD` (nhật ký); AC: `AC-INS`, `AC-DSH`, `AC-RPT`, `AC-SET`, `AC-AUD`. Tên endpoint, bảng, cột, mã lỗi do Backend chốt trong `openapi.yaml`; PRD chỉ nêu dữ liệu phải có và hành vi. Tiền là số nguyên đồng; múi giờ Asia/Ho_Chi_Minh (GMT+7).

Hiện trạng đã đọc: FE `dashboard-page.ts` / `reports-page.ts` / `store-settings-page.ts` / `audit-log-page.ts` chạy mock (`ADMIN_DASHBOARD_API`, `ADMIN_REPORTS_API`, `ADMIN_SETTINGS_API`), `DashboardSummary` / `SalesReport` / `AuditEntry` ở `models.ts`; ở `adminOrdersMode !== 'mock'` các route này rơi vào "Chưa khả dụng" (`admin.routes.ts`). BE: chưa có API tổng quan / báo cáo / nhật ký hợp nhất; `store_settings` (1 dòng) đã có phí ship, ngưỡng free-ship, `cod_max_total`, giữ chuyển khoản, số ngày giao, giờ chốt, giới hạn giỏ, quy tắc COD, `low_stock_default` (đã sửa được ở màn Tồn kho, Slice 6); `getSettings()` đọc DB mỗi yêu cầu nên đổi là có hiệu lực ngay ở giỏ / checkout; `GET /api/store/settings` mới là "đề xuất" ở FE (`HttpStoreSettingsApi`), **BE chưa có**; thông tin cửa hàng (tên pháp lý, hotline, địa chỉ...) **chưa có cột nào**, footer / chính sách đang dùng hằng số `STORE_INFO` (giá trị mẫu "thay trước khi ra mắt"). Dữ liệu có thể làm báo cáo: `orders` (`status`, `payment_status`, `payment_method`, `created_at`, `delivered_at`, `subtotal`, `discount`, `shipping_fee`, `shipping_discount`, `total`), `order_items` (`unit_price`, `quantity`, `line_discount` đã chia đều voucher cấp đơn theo `pricing.ts`), `products.category_id`, `users.created_at`. **Không có:** giá vốn (nên không có lãi gộp), trả hàng (nên không có tỉ lệ trả), `order_events` không có chỉ mục theo `at`.

### 1. Vấn đề và mục tiêu

**Vấn đề.** Sau Slice 7 admin đã làm được đơn, hàng, mã giảm giá, khách, nhân viên, nhưng vào `/admin` không có chỗ nhìn một màn để biết hôm nay cần làm gì và bán được bao nhiêu; không có số liệu tuần / tháng; thông tin liên hệ và phí vận chuyển phải sửa DB / code; và không có nơi xem "ai đã đổi gì". Ba màn đã thiết kế nhưng chạy mock, đầy số bịa và các ô không có dữ liệu thật (lãi gộp, tỉ lệ trả hàng).

**Mục tiêu.**
1. Tổng quan: staff và admin thấy ngay việc cần xử lý (đơn chờ gọi, chờ thanh toán, chờ giao, đang giao, hàng sắp hết) và bấm vào là tới đúng danh sách; admin thấy thêm doanh thu, số đơn, khách mới, biểu đồ 30 ngày, top sản phẩm, theo khoảng thời gian.
2. Báo cáo bán hàng (admin): theo ngày, top sản phẩm / biến thể, theo danh mục, theo phương thức thanh toán, so với kỳ trước; mọi con số cùng một định nghĩa với Tổng quan.
3. Cài đặt cửa hàng (admin): sửa thông tin hiển thị với khách (tên pháp lý, hotline, email, địa chỉ, giờ làm việc, MXH) và tham số vận hành đang nằm trong `store_settings` (phí ship, ngưỡng free-ship, ...) bằng giao diện, có kiểm tra giá trị, có nhật ký; storefront đọc phần công khai.
4. Nhật ký hoạt động (admin): một danh sách đọc hợp nhất từ các nhật ký có sẵn, không thêm hệ thống ghi nhật ký mới ngoài nhật ký đổi cài đặt.
5. Ở HTTP ba màn + nhật ký không còn dữ liệu mock và không còn ô "bịa" (lãi gộp, trả hàng).

**Không phải mục tiêu.** Nội dung (collections, bảng size, đánh giá, trang chủ), trả hàng / hoàn tiền, giá vốn và lãi gộp, dự báo, phân tích khách (cohort, LTV), heatmap, báo cáo theo vùng, nhật ký sửa sản phẩm / voucher, cấu hình tài khoản ngân hàng nhận tiền, đổi chính sách hạng thành viên, đổi giao diện admin.

### 2. Phạm vi

| Hạng mục | Mức | Lý do |
| --- | --- | --- |
| Nền: quyền API (phiên `n2f_asid`, staff / admin), giới hạn tần suất, mã lỗi, định nghĩa "đơn tính doanh thu" dùng chung, múi giờ, migration cộng thêm (cột thông tin cửa hàng, bảng nhật ký cài đặt, chỉ mục `at`), cờ FE `adminInsightsMode` | Must | Giống Slice 4, 6, 7; một định nghĩa số liệu cho mọi màn. |
| Tổng quan: doanh thu, đơn đặt, đơn hoàn tất, giá trị TB/đơn, khách mới (theo khoảng hôm nay / 7 ngày / 30 ngày, so kỳ trước); việc cần làm theo tab đơn; sắp hết / hết hàng; biểu đồ doanh thu 30 ngày; top 5 sản phẩm | Must | Mục tiêu 1; mọi dữ liệu có sẵn. |
| Staff chỉ thấy việc cần làm, tồn kho, số đơn đặt (không tiền, không khách mới); lọc ở máy chủ | Must | Quyền xem doanh thu chỉ admin (`dashboard.revenue`). |
| Báo cáo: KPI, theo ngày (≤ 366 ngày), top 10 sản phẩm, top 10 biến thể, theo danh mục, theo phương thức thanh toán, so kỳ trước | Must | Mục tiêu 2. |
| Xuất CSV báo cáo (admin) | Should | Rẻ (cùng truy vấn), nhưng không chặn vận hành. |
| Cài đặt cửa hàng: thông tin (tên pháp lý, MST / số ĐKKD, nơi và ngày cấp, địa chỉ, hotline, giờ làm việc, email CSKH, email dữ liệu cá nhân) và tham số vận hành (phí ship, ngưỡng free-ship, giữ chuyển khoản, trần COD, số ngày giao, giờ chốt); chỉ admin; kiểm giá trị; chống ghi chồng; nhật ký đổi | Must | Mục tiêu 3; luật TMĐT bắt buộc hiện thông tin người bán. |
| `GET /api/store/settings` công khai (chỉ phần công khai) + footer / trợ giúp / chính sách đọc giá trị thật | Must | Không có thì sửa ở admin là vô nghĩa. |
| Liên kết MXH (Facebook, Instagram, TikTok, YouTube), liên kết thông báo Bộ Công Thương | Should | Có chỗ hiển thị sẵn nhưng chưa bắt buộc. |
| Tham số giỏ và COD (giới hạn mỗi biến thể / đơn / dòng, ngày giữ giỏ, quy tắc từ chối COD) sửa ở admin | Should | Đang hardcode ở DB, ít khi đổi; an toàn nếu có khoảng giá trị. |
| Nhật ký hoạt động: danh sách hợp nhất của thao tác đơn (nhân viên), điều chỉnh tồn kho, thao tác tài khoản, đổi cài đặt; chỉ admin; đọc, không sửa | Should | Dữ liệu đã có ở 4 bảng; chỉ thêm chỉ mục. Không chặn go-live. |
| Lãi gộp / giá vốn / biên lợi nhuận, tỉ lệ trả hàng, đơn giao thất bại, yêu cầu trả hàng, ABC, ngày tồn, tồn lâu, theo vùng, heatmap, theo size / màu, báo cáo khách (mới / quay lại / hạng), báo cáo voucher | Won't | DB không có dữ liệu / chưa có trả hàng / ngoài phạm vi lần này. Ẩn ở HTTP. |
| Thời hạn trả hàng, phí gửi trả, thời gian hoàn tiền, ngưỡng hạng, ưu đãi thành viên, `bank_transfer_enabled` và tài khoản ngân hàng, `low_stock_default` | Won't (ở màn Cài đặt) | Trả hàng chưa có; hạng đã chốt ở BR-ACC-15 và code; chuyển khoản phụ thuộc biến môi trường; ngưỡng sắp hết đã sửa ở Tồn kho (không sửa hai nơi). Giữ giá trị mặc định hiện hành. |
| Nhật ký sửa sản phẩm / voucher / kho ngoài điều chỉnh tay, xuất nhật ký, tìm kiếm toàn văn nhật ký, thông báo đẩy / thư cảnh báo hết hàng | Won't | Không có bảng sự kiện; ngoài phạm vi. |

### 3. Hiện trạng và hành vi được chọn

| # | Điểm | Hiện trạng | Chọn | Lý do |
| --- | --- | --- | --- | --- |
| D1 | "Đơn tính doanh thu" | FE mock: "xác nhận, chưa huỷ". BE: `completed` đặt `payment_status = paid`, `delivered_at`; COD chỉ thu tiền lúc giao; chưa có hoàn tiền một phần. | Đơn `status = completed` **và** `payment_status = paid`, tính ở ngày `delivered_at` (giờ VN). Doanh thu = Σ `unit_price × quantity − line_discount` của dòng đơn (hàng sau giảm, **không gồm phí vận chuyển**). Huỷ / đang xử lý / `refunded` / `partially_refunded` không tính (S8-Q1). | Chỉ tiền thật đã thu; cùng cơ sở với màn Hạng khách (đơn `completed`); `line_discount` đã chia đều voucher nên tổng dòng khớp tổng đơn; ship không phải doanh thu hàng. |
| D2 | "Số đơn" | FE gộp một số. | Hai con số: **Đơn đặt** = đơn tạo trong kỳ (`created_at`), trừ `cancelled`; **Đơn hoàn tất** = đơn tính doanh thu trong kỳ (D1). Giá trị TB/đơn = doanh thu / đơn hoàn tất, làm tròn half-up tới đồng. | Hai mốc thời gian khác nhau; gộp sẽ làm sai khi COD giao trễ. |
| D3 | Kỳ so sánh | FE: hôm nay vs cùng thứ tuần trước. | `today`: từ 00:00 hôm nay tới giờ hiện tại, so với **cùng khoảng giờ** của cùng thứ tuần trước; `7d` / `30d`: 7 / 30 ngày VN gồm hôm nay, so với 7 / 30 ngày liền trước. `change` = (kỳ này − kỳ trước) / kỳ trước, làm tròn 4 chữ số thập phân; kỳ trước = 0 → `null`. | Không so sáng hôm nay nửa ngày với cả ngày. |
| D4 | Trường FE không có dữ liệu | `returnRate`, `deliveryFailed`, `returnRequests`; lãi gộp, biên, tồn lâu, ABC... ở báo cáo. | Won't, BE không gửi, FE ẩn ở HTTP. | Không bịa số. |
| D5 | Staff ở Tổng quan | Mock không phân quyền; `permissions.ts`: staff không có `dashboard.revenue`. | Staff xem việc cần làm + tồn kho + số đơn đặt; máy chủ **không gửi** tiền / khách mới / biểu đồ / top sản phẩm cho staff (S8-Q2). | Ẩn ở FE không phải bảo vệ. |
| D6 | Phí ship / ngưỡng free-ship | FE ghi "Giá trị đơn sau giảm giá"; `pricing.ts`: so `subtotal` **trước** voucher. | Giữ hành vi BE; sửa chữ FE: "Giá trị hàng trước mã giảm giá." | Chữ cũ hứa điều hệ thống không làm. |
| D7 | Thông tin cửa hàng | Hằng số FE `STORE_INFO` (mẫu); BE không có. | Thêm cột / bảng cộng thêm, seed bằng đúng giá trị `STORE_INFO` hiện có; `GET /api/store/settings` công khai trả phần whitelist; FE `applyStoreSettings` đã có. Giá trị thật Thắng nhập qua màn này trước go-live (G9). | Không đổi hành vi cho tới khi admin sửa. |
| D8 | Tham số vận hành | `store_settings` có CHECK (>0, số ngày min ≤ max, giờ chốt 0–23) nhưng không có API sửa; `low_stock_default` đã có API ở Slice 6. | API sửa nhóm Must; thêm khoảng giá trị chặt hơn trong tầng ứng dụng; `low_stock_default` không nhân đôi (S8-Q4). | Tránh hai nguồn sửa cùng một giá trị. |
| D9 | `deliveryWindow` | FE: chuỗi tự do "2–4 ngày". | Suy ra từ `delivery_days_min`–`max` ("{min}–{max} ngày"), không nhập tay. | Một nguồn sự thật với tính ngày giao dự kiến của checkout. |
| D10 | Nhật ký | FE `AuditEntry` có sản phẩm, voucher. | Hợp nhất 4 nguồn có sẵn (S8-Q3); mục sản phẩm / voucher Won't (không có bảng sự kiện; đã có "Cập nhật bởi" ở màn tương ứng). | Rẻ, không thêm ghi nhật ký mới trừ cài đặt. |
| D11 | Cờ FE | `adminOrdersMode`, `adminCatalogMode`, `adminUsersMode`. | Cờ mới `adminInsightsMode` (`http` / `mock`, e2e chọn bằng `localStorage['n2f.e2e.adminInsightsMode']`); `http` mở Tổng quan (làm trang đầu), Báo cáo (admin), Cài đặt › Thông tin cửa hàng + Nhật ký hoạt động (admin). | Phát hành tách khỏi các slice trước. |
| D12 | Chuyển đổi trang đầu | Ở HTTP `/admin` chuyển sang `/admin/orders`. | Khi `adminInsightsMode = http`, `/admin` là Tổng quan (staff và admin). | Mục tiêu 1. |

### 4. Business Rules

**Chung (quyền, nền, định nghĩa số liệu)**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-INS-01 | Must | BR-USR-01 | Mọi API tổng quan, báo cáo, cài đặt cửa hàng (admin), nhật ký chỉ nhận phiên `n2f_asid` còn hạn của staff / admin đang hoạt động; vai trò và `is_active` đọc từ DB mỗi yêu cầu. Không phiên / hết hạn / thu hồi / chỉ có `n2f_sid` → 401 `unauthenticated`, `Cache-Control: no-store`, không dữ liệu. `GET /api/store/settings` (công khai) là ngoại lệ duy nhất: không cần phiên. |
| BR-INS-02 | Must | BR-USR-02 | Ma trận quyền, kiểm ở máy chủ trước khi đọc thân yêu cầu. **staff**: Tổng quan phần việc cần làm (BR-DSH-03, 04, 07). **admin**: mọi việc của staff + toàn bộ Tổng quan, Báo cáo, đọc / sửa Cài đặt cửa hàng, Nhật ký, xuất CSV. Thiếu quyền → 403 `forbidden` ("Không đủ quyền"), dữ liệu không đổi, không dòng nhật ký. |
| BR-INS-03 | Must | BR-USR-03 | FE ẩn menu / route / nút theo `permissions.ts` khớp BR-INS-02: staff không thấy Báo cáo, Cài đặt; `/admin/reports`, `/admin/settings/*` bị chặn. Nút Lưu khoá khi đang gửi; lỗi (kể cả mất mạng) hiện thông báo và giữ nguyên giá trị đang nhập; phiên bị thu hồi khi đang xem → 401 → về `/admin/login`. Mọi màn có đủ trạng thái đang tải / lỗi kèm "Thử lại" / rỗng. |
| BR-INS-04 | Must | BR-USR-04 | Giới hạn theo tài khoản, dùng chung bộ đếm admin: đọc 120 / 60 giây, ghi 60 / 60 giây; riêng Báo cáo và CSV 20 / 60 giây. `GET /api/store/settings` dùng giới hạn catalog (120 / 60 giây / IP). Vượt → 429 `rate-limited` + `retryAfterSeconds` + `Retry-After`. |
| BR-INS-05 | Must | BR-USR-05 | Cờ `adminInsightsMode` (`http` bản thường, `mock` e2e). `http`: Tổng quan, Báo cáo, Cài đặt cửa hàng, Nhật ký gọi API thật, không đọc / ghi mock; menu gồm Tổng quan, Đơn hàng, Sản phẩm, Tồn kho, Khuyến mãi, Khách hàng, Báo cáo (admin), Cài đặt (admin: Thông tin cửa hàng, Nhật ký hoạt động, Nhân viên); mọi route khác vẫn "Chưa khả dụng"; ô thuộc Won't (mục 2) và dòng quyền của tính năng Won't ẩn. `mock`: như hiện tại, Playwright mock pass nguyên. |
| BR-INS-06 | Must | BR-USR-06 | Migration chỉ cộng thêm (không `DROP`/`TRUNCATE`/đổi kiểu, không xoá dữ liệu): cột / bảng thông tin cửa hàng (seed bằng giá trị `STORE_INFO` hiện có), bảng nhật ký đổi cài đặt (BR-SET-10, bật RLS), chỉ mục `at` giảm dần cho `order_events`, `inventory_adjustments`, `account_events`, chỉ mục phục vụ truy vấn theo `delivered_at` của đơn `completed`. Chạy `migrate deploy` 2 lần thì lần 2 không có gì; số dòng `orders`, `users`, `store_settings` không đổi. |
| BR-INS-07 | Must | BR-USR-07 | Mã lỗi ổn định (FE map theo `code`): `unauthenticated` 401, `forbidden` 403, `validation` 422 (+`field`), `version-conflict` 409, `rate-limited` 429, lỗi máy chủ; không stack trace, SQL; FE hiện câu tiếng Việt riêng cho từng mã. |
| BR-INS-08 | Must | D1..D3 | Quy ước chung: ngày = [00:00, 24:00) giờ VN (GMT+7); tham số ngày dạng `YYYY-MM-DD` là ngày VN; thời điểm trả về là ISO 8601 UTC; tiền là số nguyên đồng; tỉ lệ là số thực 0..1 làm tròn half-up 4 chữ số; không cache (`no-store`); số liệu tính tại thời điểm gọi, kèm `generatedAt`. |
| BR-INS-09 | Must | D1, D2 | **Đơn tính doanh thu** = `status = completed` và `payment_status = paid`, tính vào ngày `delivered_at` (VN). Doanh thu = Σ (`unit_price × quantity − line_discount`) của dòng đơn; không gồm phí vận chuyển (`shipping_fee`, `shipping_discount`). Đơn huỷ, đang xử lý, `refunded`, `partially_refunded`, `completed` thiếu `delivered_at` không tính. **Đơn đặt** = đơn có `created_at` trong kỳ, trừ `cancelled`. **Đơn huỷ** = đơn `cancelled` có `created_at` trong kỳ. Mọi màn dùng đúng các định nghĩa này: tổng doanh thu theo ngày = tổng theo sản phẩm = tổng theo danh mục = tổng theo phương thức = KPI doanh thu. |

**Tổng quan**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-DSH-01 | Must | D3 | Tham số `range` ∈ {`today`, `7d`, `30d`}, mặc định `today`; giá trị khác → 422 `field: range`. Khoảng và kỳ so sánh theo D3. FE giữ `range` trên URL; đổi khoảng gọi lại API. |
| BR-DSH-02 | Must | D1, D2 | KPI (admin): `revenue` (BR-INS-09), `completedOrders`, `averageOrderValue` (doanh thu / đơn hoàn tất, half-up tới đồng; 0 đơn → 0), `orders` (đơn đặt), `newCustomers` (tài khoản `member` có `created_at` trong kỳ). Mỗi KPI kèm `change` so kỳ trước (D3), `null` khi kỳ trước bằng 0. |
| BR-DSH-03 | Must | BR-ADM-07 | Việc cần làm (admin và staff), tính tại thời điểm gọi, không phụ thuộc `range`, **bằng đúng số đếm tab Đơn hàng**: `toConfirm` (cần gọi), `pendingPayment`, `toFulfil`, `inTransit`, `cancelRequests`, `returning` (hàng hoàn chờ xử lý). Mỗi số bấm được, mở màn Đơn hàng đúng tab; tổng hiển thị khớp số trên tab. |
| BR-DSH-04 | Must | BR-INV | `lowStock` (sắp hết) và `outOfStock` (hết hàng) bằng đúng số của tab "Sắp hết" và "Hết hàng" ở màn Tồn kho (cùng hàm đếm, ngưỡng riêng SKU hoặc mặc định `low_stock_default`); bấm mở Tồn kho đúng tab. |
| BR-DSH-05 | Should | BR-ADM-03 | `lateDelivery` = đơn `to_receive` có ngày giao dự kiến cuối (`estimated_to`) sớm hơn hôm nay (VN); bấm mở tab "Đang giao". |
| BR-DSH-06 | Must | D1 | (Admin) `revenueSeries`: 30 ngày VN gồm hôm nay, cũ trước, **đủ 30 điểm** (ngày không có doanh thu = 0); mỗi điểm có `revenue` và `previous` (cùng vị trí của 30 ngày liền trước). `topProducts`: 5 sản phẩm bán nhiều nhất trong `range` theo `units` giảm (Σ `quantity` của đơn tính doanh thu), hoà theo `revenue` giảm rồi `product_id` tăng; mỗi dòng: id, tên, ảnh, `units`, `revenue`. Không có đơn → mảng rỗng. |
| BR-DSH-07 | Must | D5 | Quyền theo vai trò **ở máy chủ**: admin nhận đủ; staff chỉ nhận `todo` (BR-DSH-03..05), `orders` (số đơn đặt, không kèm tiền) và `generatedAt`; phản hồi cho staff **không chứa** `revenue`, `averageOrderValue`, `newCustomers`, `revenueSeries`, `topProducts`. Máy chủ không gửi trường Won't (`returnRate`, `deliveryFailed`, `returnRequests`). |
| BR-DSH-08 | Must | BR-INS-03 | FE: hiện `generatedAt` ("Cập nhật lúc HH:mm"), nút "Làm mới" (không tự làm mới); khoảng không có đơn hiện 0 đồng và "Chưa có đơn trong khoảng này", không hiện NaN / vô cực; `change` null hiện "—"; kỳ so sánh ghi rõ ("so với cùng giờ thứ X tuần trước" cho `today`; "so với 7 ngày trước" / "so với 30 ngày trước"). Mất mạng: lỗi + "Thử lại", giữ `range`. |

**Báo cáo bán hàng**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-RPT-01 | Must | S8-Q5 | Tham số `from`, `to` (`YYYY-MM-DD`, ngày VN, gồm cả hai đầu), `to` thiếu = hôm nay (VN), `from` thiếu = `to` − 29 ngày (mặc định 30 ngày kết thúc hôm nay). Sai định dạng / ngày không có thật, `from` > `to`, `to` sau hôm nay, hoặc khoảng > **366 ngày** → 422 `validation` (`field` = `from` hoặc `to`). Kỳ so sánh = khoảng liền trước có cùng số ngày. |
| BR-RPT-02 | Must | BR-INS-09 | KPI: `revenue`, `completedOrders`, `units` (Σ `quantity`), `averageOrderValue`, `discountTotal` (Σ `line_discount` của đơn tính doanh thu), `shippingCollected` (Σ `shipping_fee − shipping_discount` của đơn tính doanh thu, chỉ để tham khảo, không nằm trong doanh thu), `placedOrders`, `cancelledOrders`, `cancelRate` = `cancelledOrders / (placedOrders + cancelledOrders)` (0 khi mẫu 0). Mỗi KPI kèm giá trị kỳ trước (`null` nếu kỳ trước không có đơn nào). |
| BR-RPT-03 | Must | BR-INS-08 | `byDay`: **mỗi ngày VN** trong khoảng một điểm (ngày trống = 0, đủ số ngày), cũ trước: `date`, `revenue`, `completedOrders`, `units`. Tổng `revenue` của `byDay` = KPI `revenue`. |
| BR-RPT-04 | Must | BR-DSH-06 | `topProducts` 10 dòng theo `sort` ∈ {`units` (mặc định), `revenue`} giảm, hoà theo chỉ tiêu còn lại giảm rồi `product_id` tăng: id, tên, ảnh, danh mục, `units`, `revenue`. `topVariants` 10 dòng cùng quy tắc: SKU, tên sản phẩm, màu, size, `units`, `revenue`. Sản phẩm / biến thể đã ẩn hoặc lưu trữ vẫn tính (dữ liệu chụp trên dòng đơn). `sort` khác → 422 `field: sort`. |
| BR-RPT-05 | Must | BR-INS-09 | `byCategory`: danh mục **hiện tại** của sản phẩm trong dòng đơn: tên, `revenue`, `units`, `share` (doanh thu / tổng, 4 chữ số); sắp `revenue` giảm; Σ `revenue` = KPI `revenue`. Ghi rõ trên FE "Theo danh mục hiện tại của sản phẩm". |
| BR-RPT-06 | Must | BR-INS-09 | `byPayment`: mỗi phương thức (`cod`, `bank_transfer`, luôn đủ hai dòng, 0 nếu không có): `completedOrders`, `revenue`, `share`. Σ `revenue` = KPI `revenue`. |
| BR-RPT-07 | Must | D4 | Máy chủ không gửi và FE ẩn ở HTTP mọi khối Won't (lãi gộp, biên, trả hàng, ABC, ngày tồn, tồn lâu, theo vùng, heatmap, size / màu, khách, voucher). Chọn khoảng nhanh của FE `7d / 30d / 90d / 365d` + chọn ngày tự do (≤ 366 ngày); khoảng có `from`, `to` rõ trên URL. |
| BR-RPT-08 | Must | BR-INS-02 | Chỉ admin (`dashboard.revenue`); staff → 403, menu không có "Báo cáo". Khoảng không có đơn: các bảng rỗng "Chưa có đơn trong khoảng này", biểu đồ phẳng 0, không NaN. Mất mạng: lỗi + "Thử lại", giữ khoảng ngày. |
| BR-RPT-09 | Should | S8-Q6 | Xuất CSV (admin): cùng `from`, `to`; một tệp UTF-8 có BOM, dấu phân cách `,`, tiền số nguyên không có dấu chấm, ngày `YYYY-MM-DD`, tên tệp `nine2fine-bao-cao-<from>_<to>.csv`; gồm: KPI, `byDay`, `topProducts`, `byCategory`, `byPayment` (mỗi khối một đoạn có dòng tiêu đề). Ô văn bản bắt đầu bằng `=`, `+`, `-`, `@` được chèn `'` đầu để không bị chạy như công thức. Số liệu trong tệp bằng đúng số trên màn cùng khoảng. Quy tắc 422 giống BR-RPT-01. |

**Cài đặt cửa hàng**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-SET-01 | Must | BR-INS-02 | Đọc và sửa cài đặt cửa hàng chỉ admin (staff → 403, không thấy mục trong menu). |
| BR-SET-02 | Must | D7 | Thông tin cửa hàng, mỗi trường cắt khoảng trắng hai đầu, NFC, không ký tự điều khiển: `legalName` 2–120 ký tự (bắt buộc); `registrationNumber` 10 hoặc 13 chữ số (bắt buộc); `registrationIssuer` ≤ 100; `registrationDate` ngày thật, không sau hôm nay (VN), tuỳ chọn; `address` 10–200 (bắt buộc); `hours` ≤ 100. Sai → 422 `validation` đúng `field`; mọi lỗi trả cùng lúc theo trường. |
| BR-SET-03 | Must | D7 | `hotline` (bắt buộc): sau khi bỏ khoảng trắng, dấu chấm và gạch ngang còn 8–11 chữ số, bắt đầu bằng `0`, `1800` hoặc `1900`; lưu dạng đã nhập, `tel:` link suy ra từ chữ số. `email` (CSKH, bắt buộc) và `privacyEmail` (tuỳ chọn): email hợp lệ ≤ 254 ký tự, lưu chữ thường. |
| BR-SET-04 | Should | D7 | `social.facebook`, `instagram`, `tiktok`, `youtube`, `notificationUrl` (thông báo Bộ Công Thương): rỗng hoặc URL `https://` ≤ 300 ký tự; không chấp nhận `javascript:`, `data:`, `http:`; rỗng = ẩn ở storefront. |
| BR-SET-05 | Must | D8 | Tham số vận hành (số nguyên, đơn vị đồng / phút / ngày / giờ): `shippingFee` 0–500.000 (bội số của 1.000); `freeShippingThreshold` 0–50.000.000 (bội số của 1.000; `0` nghĩa là mọi đơn miễn phí ship, FE hiện cảnh báo trước khi lưu); `bankHoldMinutes` 10–1.440; `codMaxTotal` 100.000–50.000.000; `deliveryDaysMin` và `deliveryDaysMax` 1–30 và min ≤ max; `cutoffHour` 0–23. Ngoài khoảng, không nguyên, âm → 422 `validation` đúng `field`. `deliveryWindow` hiển thị suy ra từ min–max (D9). |
| BR-SET-06 | Should | D8 | Tham số giỏ và COD: `maxPerVariant` 1–20, `maxItemsPerOrder` 1–100, `maxCartLines` 1–100, `cartRetentionDays` 1–180, `codRefusalLimit` 1–10, `codRefusalMonths` 1–24, `codOpenOrderLimit` 1–10. Đổi **không** cắt giỏ hay đơn đang có; chỉ áp cho thao tác mới. |
| BR-SET-07 | Must | BR-INV-05 | Lưu là **một yêu cầu nguyên tử** (một lô thông tin + tham số): lỗi một trường thì không lưu trường nào. Yêu cầu mang `updatedAt` đã đọc; khác `updatedAt` hiện tại → 409 `version-conflict`, không ghi, FE tải lại và giữ bản đang nhập để so. Lưu không có thay đổi nào → 200, không đổi `updatedAt`, không nhật ký. |
| BR-SET-08 | Must | D8 | Hiệu lực: giỏ / checkout đọc `store_settings` mỗi yêu cầu nên giá trị mới áp dụng cho báo giá và đơn **tạo sau** lúc lưu; đơn đã tạo giữ nguyên phí ship, tổng tiền, hạn giữ chuyển khoản đã chụp; không đơn nào đổi. |
| BR-SET-09 | Must | BR-USR-24 | Mỗi lần lưu có thay đổi ghi đúng **1 dòng** nhật ký đổi cài đặt cùng giao dịch: thời điểm, người (id, họ tên, vai trò lúc đó), danh sách trường đã đổi kèm giá trị trước / sau (văn bản ≤ 300 ký tự mỗi giá trị). Không có API sửa / xoá; thao tác bị từ chối (403, 409, 422) không để lại dòng; không giá trị bí mật nào (chỉ có các trường ở BR-SET-02..06). |
| BR-SET-10 | Must | D7 | `GET /api/store/settings` (công khai, không cần phiên): chỉ gồm whitelist: `info` (`legalName`, `registrationNumber`, `registrationIssuer`, `registrationDate`, `address`, `hotline`, `hotlineHref`, `email`, `privacyEmail`, `hours`, `notificationUrl`, `social`) và `policy` (`freeShippingFrom`, `shippingFee`, `deliveryWindow`, `paymentHoldMinutes`). Không có `codMaxTotal`, tham số giỏ / COD, thông tin tài khoản, thời điểm sửa, người sửa. `Cache-Control: public, max-age=60`. Thiếu dữ liệu → trả giá trị mặc định seed, không 500. |
| BR-SET-11 | Must | D7 | Storefront (chân trang, trợ giúp, chính sách, PDP, giỏ, thanh toán) dùng `storeSettings()` từ API; lỗi / chậm → dùng giá trị dựng sẵn, không trang trắng, không treo màn hình đầu. Thay đổi ở admin hiện ở storefront trong ≤ 60 giây (không cần xoá cache tay). |
| BR-SET-12 | Must | D4 | Màn Cài đặt ở HTTP chỉ có nhóm: Thông tin cửa hàng, Liên hệ, Vận chuyển và thanh toán (BR-SET-05; kèm tham số Should khi có), "Tham số giỏ và COD" (Should). Nhóm Đổi trả, Hạng thành viên, tài khoản ngân hàng, ngưỡng sắp hết ẩn / chỉ đọc kèm liên kết "Sửa ở Tồn kho" cho ngưỡng. Chữ ngưỡng free-ship: "Giá trị hàng trước mã giảm giá." (D6). |
| BR-SET-13 | Must | BR-INS-03 | FE: cảnh báo rời trang khi có thay đổi chưa lưu (`unsavedChangesGuard`); hiện lỗi cạnh từng ô; nút Lưu chỉ bật khi có thay đổi; lưu thành công hiện "Đã lưu" và giữ giá trị server trả về; mất mạng giữ nguyên giá trị đang nhập; bấm lưu hai lần liên tiếp không tạo hai dòng nhật ký (nút khoá khi đang gửi, `updatedAt` chặn gửi lại). |

**Nhật ký hoạt động**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-AUD-01 | Should | S8-Q3 | Danh sách hợp nhất, chỉ đọc, chỉ admin, từ 4 nguồn có sẵn: (a) sự kiện đơn có người thao tác là nhân viên (`actor = shop`; không gồm sự kiện khách / hệ thống tự sinh), (b) điều chỉnh tồn kho (`inventory_adjustments`), (c) thao tác tài khoản (`account_events`: khách khoá / mở; nhân viên tạo / khoá / mở / đổi vai trò), (d) đổi cài đặt (BR-SET-09). Không nhật ký sản phẩm / voucher (Won't). |
| BR-AUD-02 | Should | models.ts | Mỗi dòng: `id` (kèm nguồn, duy nhất), `at`, `actor` (họ tên + vai trò lúc đó), `action` (mã ổn định + nhãn tiếng Việt), `target` {`type` ∈ `order` / `inventory` / `customer` / `staff` / `settings`, `id`, `label`}, và khi có: lý do, `before` / `after` (chỉ nguồn d, và vai trò trước / sau của nguồn c). Không chứa ghi chú nội bộ của đơn, nội dung cuộc gọi, mật khẩu, băm token, IP, user agent. |
| BR-AUD-03 | Should | BR-ADM-05 | Tham số: `from`, `to` (ngày VN, mặc định 30 ngày gần nhất, khoảng ≤ 92 ngày, sai → 422), `targetType` (một trong 5 giá trị trên; khác → 422), `page` ≥ 1, `limit` 1–50 (mặc định 20); mới trước (`at` giảm, hoà theo `id` giảm); trang quá cuối → `items` rỗng, `total` đúng. Hai thao tác trong cùng giây vẫn có thứ tự ổn định giữa các lần gọi. |
| BR-AUD-04 | Should | BR-INS-06 | Nhật ký là dữ liệu đọc: không API sửa / xoá, không dòng mới được tạo khi mở màn này; thao tác bị từ chối ở các màn khác (403, 409, 422) không xuất hiện. Số dòng một nguồn = số dòng khi lọc đúng `targetType` của nguồn đó. |
| BR-AUD-05 | Should | BR-INS-03 | FE: bộ lọc loại đối tượng + khoảng ngày trên URL; chọn dòng thuộc `order` / `customer` mở đúng đơn / khách (nếu còn quyền); trạng thái rỗng "Chưa có hoạt động trong khoảng này"; lỗi + "Thử lại"; bỏ ô lọc sản phẩm / voucher và ô tìm văn bản ở HTTP. |

### 5. Acceptance criteria

Dữ liệu tham chiếu (hôm nay = ngày D theo giờ VN; 00:00 VN = 17:00 UTC ngày D−1): admin A, staff S, khách M. Đơn tính doanh thu (tiền hàng sau giảm = Σ `unit_price × quantity − line_discount`; đều đặt trước D): **O1** `completed` COD, giao D 10:00, hàng 900.000 (áo 500.000 + quần 500.000 − giảm 100.000), ship 30.000, total 930.000; **O2** `completed` chuyển khoản, giao D−1 23:30, hàng 1.000.000, ship 0; **O3** `completed` COD, giao D 00:00:00, hàng 300.000, ship 30.000; **O8** `completed`, giao D−8, hàng 2.000.000, ship 0. Đơn khác: **O4** `to_ship` COD cần gọi, đặt D; **O5** `cancelled`, đặt D; **O6** `to_pay` chuyển khoản, đặt D; **O7** `to_receive`, `estimated_to` = D−1, đặt D−3; **O9** `completed` nhưng `payment_status = refunded`, giao D. Sản phẩm P1 (5 sản phẩm bán, 2.000.000), P2 (5, 2.500.000), P3 (3, 600.000) trong 30 ngày; P1, P2 thuộc danh mục "Áo", P3 "Quần". Mỗi AC ghi BR.

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-INS-01 | INS-01 | Không cookie; chỉ `n2f_sid` của M; `n2f_asid` của S sau khi `is_active = false` | `GET` tổng quan, báo cáo, cài đặt cửa hàng, nhật ký; `PUT` cài đặt cửa hàng; `GET /api/store/settings` không cookie | Năm yêu cầu đầu: 401 `unauthenticated`, `no-store`, không dữ liệu, DB không đổi; yêu cầu công khai: 200 chỉ gồm whitelist. |
| AC-INS-02 | INS-02 | S đăng nhập admin; A đăng nhập admin | S gọi: báo cáo, CSV, `GET` / `PUT` cài đặt cửa hàng, nhật ký, tổng quan; sau đó A gọi cùng các API | S: 403 `forbidden` cho báo cáo, CSV, cài đặt (cả đọc và ghi), nhật ký; 200 cho tổng quan (phần staff, AC-DSH-09); DB không đổi, không dòng nhật ký. A: 200 cho tất cả. |
| AC-INS-03 | INS-02 | A bị hạ thành staff bằng SQL, có phiên | A gọi báo cáo ngay sau đó | 403 (vai trò đọc từ DB, không cần đăng nhập lại). |
| AC-INS-04 | INS-03 | `adminInsightsMode: http`, S và A mở admin | Mở `/admin`, `/admin/reports`, `/admin/settings/store`, `/admin/settings/audit` | S: có Tổng quan; không có Báo cáo, Cài đặt; ba route sau bị chặn (không hiện nội dung). A: thấy đủ. |
| AC-INS-05 | INS-03 | A ở màn Cài đặt, mất mạng | Bấm Lưu; có mạng lại bấm Lưu | Nút khoá khi đang gửi; lỗi mất mạng hiện thông báo, các ô giữ nguyên giá trị đã nhập; lần lưu sau thành công tạo đúng 1 dòng nhật ký. |
| AC-INS-06 | INS-04 | A | 21 yêu cầu báo cáo trong 60 giây; 61 yêu cầu ghi trong 60 giây | Yêu cầu báo cáo thứ 21 và yêu cầu ghi 61: 429 `rate-limited` + `retryAfterSeconds` + `Retry-After`; các yêu cầu trước vẫn 200. |
| AC-INS-07 | INS-05 | Build thường (`http` cả bốn cờ) | A mở admin | Menu: Tổng quan, Đơn hàng, Sản phẩm, Tồn kho, Khuyến mãi, Khách hàng, Báo cáo, Cài đặt (Thông tin cửa hàng, Nhật ký hoạt động, Nhân viên); `/admin/collections`, `/admin/reviews`, `/admin/content`, `/admin/returns` → "Chưa khả dụng"; không request nào tới mock ở các màn Slice 8; Playwright `adminInsightsMode: mock` pass nguyên. |
| AC-INS-08 | INS-05 | `http`; A mở Tổng quan, Báo cáo, Cài đặt | Xem các ô | Không có tỉ lệ trả hàng, đơn giao thất bại, yêu cầu trả hàng, lãi gộp, biên, ABC, heatmap, khối Đổi trả / Hạng thành viên ở Cài đặt; bảng quyền không có dòng của tính năng Won't. |
| AC-INS-09 | INS-06 | DB có dữ liệu Slice 1–7 | `migrate deploy` 2 lần | Lần 2 không có migration mới; không DROP/TRUNCATE/đổi kiểu; bảng mới bật RLS; số dòng `orders`, `users`, `store_settings` không đổi; thông tin cửa hàng ban đầu bằng `STORE_INFO`. |
| AC-INS-10 | INS-07 | Gây từng lỗi AC-INS-01, 02, 06; AC-RPT-02; AC-SET-04, 12 | Đọc thân phản hồi và FE | `code` ổn định và HTTP đúng; không stack trace, SQL; FE hiện câu riêng cho `forbidden`, `validation`, `version-conflict`, `rate-limited`, không trang trắng. |
| AC-INS-11 | INS-08 | Đơn giao đúng 2026-11-11 16:59:59 UTC và 17:00:00 UTC (= 23:59:59 ngày 11 và 00:00:00 ngày 12 giờ VN) | Báo cáo `from = to = 2026-11-12` rồi `from = to = 2026-11-11` | Đơn 17:00:00 UTC chỉ ở ngày 12; đơn 16:59:59 UTC chỉ ở ngày 11; thời điểm trả về là ISO UTC; mọi tiền là số nguyên. |
| AC-INS-12 | INS-09 | O1..O9 | Báo cáo khoảng bao D−8..D | Doanh thu tính O1, O2, O3, O8 = 900.000 + 1.000.000 + 300.000 + 2.000.000 = 4.200.000; O9 (refunded), O4..O7 (chưa hoàn tất / huỷ) không tính; ship không nằm trong doanh thu (`shippingCollected` = 60.000 từ O1, O3). |
| AC-INS-13 | INS-09 | O1..O9 | Báo cáo khoảng D..D, rồi đối chiếu `byDay`, `byCategory`, `byPayment`, `topProducts` (cộng hết) | Mỗi tổng bằng KPI `revenue` (1.200.000 cho ngày D: O1 + O3); cả bốn khớp tuyệt đối từng đồng. |
| AC-DSH-01 | DSH-01 | Đơn như dữ liệu tham chiếu | `GET` tổng quan với `range` = `today`, `7d`, `30d`; `range = week`; không `range` | Ba lần đầu 200 đúng khoảng (hôm nay 00:00 VN tới giờ gọi; 7 ngày VN D−6..D; 30 ngày D−29..D); `week` → 422 `field: range`; không `range` = `today`. |
| AC-DSH-02 | DSH-02 | Như trên | A xem `today` và `7d` | `today`: `revenue` 1.200.000 (O1 + O3; O2 giao hôm qua, O9 refunded không tính), `completedOrders` 2, `averageOrderValue` 600.000, `orders` (đặt hôm nay trừ huỷ: O4, O6) 2. `7d`: `revenue` 2.200.000 (O1 + O2 + O3), `completedOrders` 3, `averageOrderValue` 733.333 (733.333,33 làm tròn), kỳ trước (D−13..D−7) = 2.000.000 (O8) nên `change` = 0,1. |
| AC-DSH-03 | DSH-02 | Kỳ trước không có đơn nào; không có đơn hoàn tất nào trong kỳ | A xem `30d` ở DB mới; xem `today` khi chưa có đơn | `change` = `null` (FE "—"); `averageOrderValue` 0; không NaN, không chia 0, không 500. |
| AC-DSH-04 | DSH-02 | Hôm nay có 2 khách `member` đăng ký, hôm qua 1 | A xem `today` | `newCustomers` = 2 (tài khoản staff / admin tạo hôm nay không tính). |
| AC-DSH-05 | DSH-03 | O4 (cần gọi), O6 (`to_pay`), O7 (`to_receive`), thêm 1 đơn `to_ship` đã gọi, 1 đơn yêu cầu huỷ | A và S xem việc cần làm; mở tab Đơn hàng tương ứng | `toConfirm` 1, `pendingPayment` 1, `toFulfil` 1, `inTransit` 1, `cancelRequests` 1; mỗi số bằng số đếm trên tab Đơn hàng cùng lúc; bấm số mở đúng tab. |
| AC-DSH-06 | DSH-04 | 2 biến thể sắp hết (available ≤ ngưỡng), 1 biến thể hết hàng | A / S xem; mở Tồn kho | `lowStock` 2, `outOfStock` 1 bằng số tab "Sắp hết", "Hết hàng"; đổi ngưỡng SKU ở Tồn kho rồi tải lại Tổng quan: số đổi theo. |
| AC-DSH-07 (Should) | DSH-05 | O7 `to_receive` có `estimated_to` D−1; một đơn `to_receive` có `estimated_to` D | A xem | `lateDelivery` = 1 (chỉ O7; đơn hạn D chưa trễ). |
| AC-DSH-08 | DSH-06 | 30 ngày có đơn vào 3 ngày; P1, P2, P3 như dữ liệu | A xem `30d` | `revenueSeries` đúng 30 điểm, cũ trước, ngày không đơn = 0, tổng = KPI `revenue`; `previous` là cùng vị trí 30 ngày trước đó; `topProducts` theo thứ tự P2 (5 sp, 2.500.000), P1 (5 sp, 2.000.000), P3 (3 sp): hoà `units` phân theo `revenue`; không quá 5 dòng. |
| AC-DSH-09 | DSH-07 | S, A | S và A `GET` tổng quan `7d` | A: đủ trường. S: JSON chỉ có `todo`, `orders`, `generatedAt`; **không có** khoá `revenue`, `averageOrderValue`, `newCustomers`, `revenueSeries`, `topProducts`; không có `returnRate`, `deliveryFailed`, `returnRequests` ở cả hai. |
| AC-DSH-10 | DSH-08 | `http`; A mở Tổng quan; chặn mạng; DB không có đơn | Tải lại; bỏ chặn bấm "Thử lại"; xem trạng thái rỗng; đổi `range` | Lỗi + "Thử lại", `range` trên URL giữ nguyên; sau thử lại đúng số; DB rỗng: 0 đồng + "Chưa có đơn trong khoảng này", không NaN; đổi `range` gọi lại API, có "Cập nhật lúc HH:mm". |
| AC-RPT-01 | RPT-01 | A | Báo cáo mặc định; `from = to = D`; khoảng 366 ngày; 367 ngày; `from > to`; `to` = D+1; `from = 2026-02-30`; chỉ có `from` (không `to`) | Mặc định: 30 ngày kết thúc D; 200; 200; 422 `field: to` (hoặc `from`) ×4; chỉ `from`: `to` = D, 200. Kỳ trước có cùng số ngày liền trước. |
| AC-RPT-02 | RPT-01 | A | `from = 2026-13-01`; `from = abc` | 422 `validation` đúng `field`; không 500. |
| AC-RPT-03 | RPT-02 | O1..O9 (thêm O5 huỷ đặt D, O4, O6 đặt D) khoảng D..D | A xem KPI | `revenue` 1.200.000; `completedOrders` 2; `units` đúng Σ `quantity` của O1 + O3; `averageOrderValue` 600.000; `discountTotal` 100.000; `shippingCollected` 60.000; `placedOrders` 2 (O4, O6); `cancelledOrders` 1 (O5); `cancelRate` = 1 / 3 = 0,3333. Mỗi KPI có giá trị kỳ trước (null nếu kỳ trước trống). |
| AC-RPT-04 | RPT-03 | Khoảng D−2..D, đơn chỉ ở D−2 và D | A xem `byDay` | Đúng 3 điểm cũ trước, D−1 = 0 mọi chỉ tiêu; ngày VN (đơn 17:00 UTC rơi sang ngày sau); Σ `revenue` = KPI. |
| AC-RPT-05 | RPT-04 | P1, P2, P3 như dữ liệu | `topProducts` mặc định; `sort = revenue`; `sort = profit`; có 12 sản phẩm bán được | Mặc định: P2, P1, P3 (hoà `units` 5 phân theo doanh thu); `revenue`: P2, P1, P3; `profit`: 422 `field: sort`; chỉ 10 dòng; hoà hoàn toàn thì `product_id` tăng. |
| AC-RPT-06 | RPT-04 | Sản phẩm P3 đã chuyển ARCHIVED sau khi bán | `topProducts`, `topVariants` | P3 vẫn có mặt với tên / màu / size / SKU như đã chụp trên dòng đơn; `topVariants` ≤ 10 dòng; Σ `units` các biến thể của một sản phẩm = `units` sản phẩm đó. |
| AC-RPT-07 | RPT-05 | P1, P2 "Áo", P3 "Quần"; P1 chuyển sang danh mục "Quần" sau khi bán | `byCategory` | Tính theo danh mục **hiện tại**: "Quần" gồm P1, P3, "Áo" chỉ P2; `share` từng dòng = doanh thu / tổng (4 chữ số); sắp doanh thu giảm; Σ `revenue` = KPI; FE ghi "Theo danh mục hiện tại của sản phẩm". |
| AC-RPT-08 | RPT-06 | Chỉ có đơn COD trong khoảng | `byPayment` | Có đủ 2 dòng: `cod` đủ số; `bank_transfer` `completedOrders` 0, `revenue` 0, `share` 0; `share` `cod` = 1. |
| AC-RPT-09 | RPT-07 | `http`; A mở Báo cáo | Xem các khối; đổi khoảng nhanh 7 / 30 / 90 / 365; chọn ngày tự do 400 ngày | Chỉ có KPI, theo ngày, top sản phẩm / biến thể, theo danh mục, theo phương thức; không lãi gộp, trả hàng, ABC, tồn, vùng, heatmap, size / màu, khách, voucher; mỗi lần đổi khoảng URL có `from`, `to`; 400 ngày: lỗi trường `to` hiện cạnh ô (không gọi API). |
| AC-RPT-10 | RPT-08 | S; A với khoảng không có đơn; chặn mạng | S mở `/admin/reports`; A xem khoảng rỗng; A tải lại khi mất mạng | S: 403, chặn route. Khoảng rỗng: các bảng "Chưa có đơn trong khoảng này", biểu đồ 0, không NaN. Lỗi mạng: thông báo + "Thử lại" giữ `from`, `to`. |
| AC-RPT-11 (Should) | RPT-09 | O1..O3 | A tải CSV khoảng D−1..D; S tải; khoảng 367 ngày | Tệp UTF-8 BOM, tên `nine2fine-bao-cao-<from>_<to>.csv`, 5 khối, số bằng màn; sản phẩm tên `=HYPERLINK(...)` có `'` đầu; S: 403; 367 ngày: 422; vượt 20 yêu cầu / 60 giây: 429. |
| AC-SET-01 | SET-01, 02 | A; S | A `GET` cài đặt cửa hàng; S gọi `GET` và `PUT` | A: 200, đủ trường thông tin + tham số + `updatedAt`; S: 403 cả hai; DB không đổi. |
| AC-SET-02 | SET-02 | A | Lưu `legalName` 1 và 121 ký tự; `registrationNumber` `12345`; 9 chữ số; `0319245768` và 13 chữ số; `address` 9 ký tự; `registrationDate` = ngày mai; ngày không có thật; `hours` 101 ký tự | Các giá trị sai: 422 `validation` đúng `field`, trả đủ mọi lỗi một lần, không lưu trường nào, không nhật ký; `0319245768` (10) và 13 chữ số hợp lệ. |
| AC-SET-03 | SET-03 | A | Lưu `hotline` = `1900 6868 29`, `0912.345.678`, `1800-1234`, `123`, `abc`, `1900`; `email` = `CSKH@Nine2Fine.vn `, `a@b`, 255 ký tự; `privacyEmail` rỗng | `1900 6868 29`, `0912.345.678`, `1800-1234`: lưu; `tel:` link chỉ gồm chữ số (`tel:1900686829`); `123`, `abc`, `1900` (thiếu chữ số): 422 `field: hotline`; email chữ hoa lưu `cskh@nine2fine.vn`; `a@b` và 255 ký tự: 422; `privacyEmail` rỗng hợp lệ. |
| AC-SET-04 (Should) | SET-04 | A | Lưu `social.facebook` = `https://facebook.com/nine2fine`; `http://x.com`; `javascript:alert(1)`; 301 ký tự; rỗng | Hợp lệ lưu; `http:` và `javascript:` và quá 300: 422 `field: social.facebook`; rỗng = storefront ẩn biểu tượng đó. |
| AC-SET-05 | SET-05 | A | Lưu `shippingFee` = 500.000 / 500.001 / -1 / 30.500 / 25.5; `freeShippingThreshold` = 0 / 50.000.000 / 50.001.000; `bankHoldMinutes` 9 / 10 / 1.440 / 1.441; `codMaxTotal` 99.000 / 100.000 / 50.000.001 | 500.000 hợp lệ; 500.001, -1, 30.500 (không bội 1.000), 25,5 → 422 đúng `field`; ngưỡng 0 và 50.000.000 hợp lệ, 50.001.000 → 422; 10 và 1.440 hợp lệ, 9 và 1.441 → 422; 100.000 hợp lệ, 99.000 và 50.000.001 → 422. FE hiện cảnh báo trước khi lưu ngưỡng 0. |
| AC-SET-06 | SET-05 | A | Lưu `deliveryDaysMin`/`Max` = 4/2; 2/4; 0/3; 3/31; `cutoffHour` = 24, -1, 16 | 4/2: 422 `field: deliveryDaysMax` (hoặc `Min`); 2/4 hợp lệ, `deliveryWindow` = "2–4 ngày"; 0/3 và 3/31 → 422; `cutoffHour` 24, -1 → 422, 16 hợp lệ. |
| AC-SET-07 (Should) | SET-06 | Một giỏ có 10 dòng | A đặt `maxCartLines` = 5; lưu `maxPerVariant` 21 / 0 | Lưu 5 hợp lệ; giỏ cũ giữ 10 dòng (không bị cắt); thêm dòng thứ 11 bị từ chối theo hành vi hiện có; 21 và 0 → 422 `field: maxPerVariant`. |
| AC-SET-08 | SET-07 | A1 và A2 cùng mở màn, cùng `updatedAt` T | A1 lưu `shippingFee` 40.000; A2 lưu `hotline` mới với `updatedAt` T | A1: 200, `updatedAt` mới; A2: 409 `version-conflict`, không ghi; FE tải lại giá trị mới, giữ giá trị A2 đang nhập để so; chỉ 1 dòng nhật ký. |
| AC-SET-09 | SET-07 | A | Lưu cùng lúc `shippingFee` hợp lệ và `bankHoldMinutes` = 5 (sai) | 422 `field: bankHoldMinutes`; `shippingFee` **không** đổi (SQL); không dòng nhật ký. |
| AC-SET-10 | SET-07, 09 | A | Lưu đúng giá trị hiện có (không thay đổi) | 200, `updatedAt` không đổi, không dòng nhật ký. |
| AC-SET-11 | SET-08 | Một đơn O đã tạo với phí ship 30.000, giữ chuyển khoản tới 14:30; giỏ khách M có tổng 600.000 | A đổi `shippingFee` 45.000 và `bankHoldMinutes` 60; M tải lại báo giá; M đặt đơn mới | O giữ nguyên ship 30.000, hạn 14:30; báo giá của M hiện ship 45.000; đơn mới ship 45.000, hạn giữ 60 phút; giỏ đã chụp trước không bị sửa. |
| AC-SET-12 | SET-09 | A | Lưu đổi `shippingFee` 30.000 → 40.000 và `hotline`; sau đó một lần bị 422; một lần bị 403 (S) | 2 trường đổi: đúng **1** dòng nhật ký có người A, thời điểm, hai mục (trường, trước, sau); 422 và 403 không để lại dòng; không `PUT` / `DELETE` nhật ký (404 / 405). |
| AC-SET-13 | SET-10 | Khách chưa đăng nhập | `GET /api/store/settings` | 200, `Cache-Control: public, max-age=60`; JSON chỉ có `info` và `policy` theo whitelist; **không** có `codMaxTotal`, tham số giỏ / COD, `updatedAt`, người sửa; `policy.deliveryWindow` = "2–4 ngày" theo min–max. DB thiếu dòng thông tin: trả mặc định seed, không 500. |
| AC-SET-14 | SET-11 | A đổi `hotline` và `address` | Mở chân trang storefront chờ ≤ 60 giây; chặn mạng tới `/api/store/settings` rồi tải lại | Chân trang, trợ giúp và chính sách hiện hotline / địa chỉ mới trong ≤ 60 giây; khi chặn mạng hiện giá trị dựng sẵn, không trang trắng, màn hình đầu không bị treo. |
| AC-SET-15 | SET-12 | `http`; A mở `/admin/settings/store` | Xem các nhóm và ô chữ | Có Thông tin cửa hàng, Liên hệ, Vận chuyển và thanh toán; không có nhóm Đổi trả, Hạng thành viên, tài khoản ngân hàng; ngưỡng sắp hết chỉ có liên kết "Sửa ở Tồn kho"; ô free-ship ghi "Giá trị hàng trước mã giảm giá." |
| AC-SET-16 | SET-13 | A sửa 2 ô chưa lưu | Rời trang; bấm hai lần Lưu liên tiếp | Có hộp thoại cảnh báo rời trang; Lưu bật khi có thay đổi, mỗi ô lỗi hiện cạnh ô; hai lần bấm: 1 yêu cầu (nút khoá), đúng 1 dòng nhật ký; thành công hiện "Đã lưu". |
| AC-AUD-01 (Should) | AUD-01, 02 | Có: 1 xác nhận đơn do S, 1 điều chỉnh tồn do S, 1 khoá khách do A, 1 tạo nhân viên do A, 1 đổi cài đặt do A, 1 sự kiện đơn do khách / hệ thống | A mở nhật ký | Đúng 5 dòng (sự kiện khách / hệ thống tự sinh không có); mỗi dòng đủ `id`, `at`, người + vai trò lúc đó, mã + nhãn hành động, đối tượng; dòng cài đặt có `before`/`after`; dòng vai trò có vai trò trước / sau; không có ghi chú nội bộ, nội dung cuộc gọi, IP, user agent. |
| AC-AUD-02 (Should) | AUD-03 | 60 dòng trong 30 ngày, 5 dòng cách đây 100 ngày | Mặc định; trang 2; `limit = 51`; `limit = 0`; `page = 99`; khoảng 93 ngày; `targetType = product` | Trang 1 20 dòng mới trước; trang 2 20 dòng; 422; 422; `items` rỗng, `total` 60; 422 `field: to` hoặc `from`; 422 `field: targetType`; 5 dòng cũ không có. |
| AC-AUD-03 (Should) | AUD-03 | Hai thao tác trong cùng một giây | Gọi hai lần liền nhau | Thứ tự hai dòng giống nhau cả hai lần; không trùng / sót khi sang trang. |
| AC-AUD-04 (Should) | AUD-01, 04 | S, A | S gọi nhật ký; A lọc `targetType = inventory`; thử `PUT` / `DELETE` một dòng; một thao tác bị 403 / 409 / 422 | S: 403; A: chỉ dòng điều chỉnh tồn, số dòng = số dòng `inventory_adjustments` trong khoảng; `PUT` / `DELETE` → 404 / 405; thao tác bị từ chối không có dòng. |
| AC-AUD-05 (Should) | AUD-05 | `http`; A mở `/admin/settings/audit`; DB trống nhật ký; chặn mạng | Lọc loại + khoảng; chọn dòng `order`; chọn dòng `customer`; tải lại khi mất mạng | Bộ lọc trên URL; dòng đơn mở đúng đơn, dòng khách mở đúng khách; DB trống "Chưa có hoạt động trong khoảng này"; lỗi + "Thử lại"; không có ô lọc sản phẩm / voucher / tìm văn bản. |

### 6. Định nghĩa xong của Slice 8

- AC Must đạt (test BE / E2E ghi mã AC), AC Should ghi làm hay hoãn.
- `openapi.yaml` có tag cho tổng quan, báo cáo, cài đặt cửa hàng, nhật ký, cài đặt công khai (locked trước khi FE nối); migration chỉ cộng thêm; `decisions.md`, `handoff.md` cập nhật.
- Ở `adminInsightsMode: http` bốn màn không có dữ liệu mock và không còn số bịa; Playwright mock pass nguyên.
- Một định nghĩa số liệu: tổng theo ngày = theo sản phẩm = theo danh mục = theo phương thức = KPI (AC-INS-13); số việc cần làm và tồn kho bằng số ở màn Đơn hàng / Tồn kho (AC-DSH-05, 06); staff không nhận số tiền ở Tổng quan (AC-DSH-09).
- Mỗi lần lưu cài đặt có thay đổi đúng 1 dòng nhật ký, lỗi / từ chối không để lại dòng (AC-SET-12); đổi cài đặt không đổi đơn đã tạo (AC-SET-11); API công khai chỉ gồm whitelist (AC-SET-13).
- Lát nghiệm thu thật trên Supabase (8.7) cần Thắng duyệt áp migration và nhập thông tin pháp lý thật (G9).

### 7. Câu hỏi mở

Mặc định PO (Thắng đang vắng), làm trước theo mặc định; Thắng đổi được khi quay lại bằng cách trả lời. Không câu nào chặn lát 8.1–8.6; chỉ lát 8.7 cần Thắng duyệt áp migration và nhập thông tin pháp lý thật.

| # | Câu hỏi | Ảnh hưởng | Mặc định PO | Trạng thái |
| --- | --- | --- | --- | --- |
| S8-Q1 | Doanh thu tính khi nào, gồm gì? | BR-INS-09; D1 | Đơn `completed` + `paid`, ngày `delivered_at` (VN), tiền hàng sau giảm, không gồm ship; huỷ / đang xử lý / hoàn không tính. Phương án thay thế (tính theo ngày đặt, trừ huỷ) làm doanh thu COD đứng sớm hơn tiền thật: Won't lần này. | Mặc định PO |
| S8-Q2 | Staff thấy gì ở Tổng quan? | BR-DSH-07; D5 | Việc cần làm, tồn kho, số đơn đặt; không tiền, không khách mới, không biểu đồ, không top sản phẩm. Cho staff xem doanh thu = cấp `dashboard.revenue` cho staff + sửa BR-INS-02. | Mặc định PO (Thắng đổi được) |
| S8-Q3 | Nhật ký hệ thống: làm hay Won't? | BR-AUD-01..05 | Làm ở mức Should, đọc hợp nhất 4 nguồn có sẵn, chỉ admin, ≤ 92 ngày; không nhật ký sản phẩm / voucher. Nếu hết thời gian thì hoãn mà không ảnh hưởng go-live. | Mặc định PO |
| S8-Q4 | Tham số vận hành nào sửa được? | BR-SET-05, 06, 12 | Must: phí ship, ngưỡng free-ship, giữ chuyển khoản, trần COD, số ngày giao, giờ chốt. Should: giới hạn giỏ, quy tắc COD. Không sửa ở màn này: `low_stock_default` (sửa ở Tồn kho), `bank_transfer_enabled` và tài khoản ngân hàng (phụ thuộc môi trường), nhóm Đổi trả và Hạng thành viên (chưa có trả hàng; hạng theo BR-ACC-15). | Mặc định PO |
| S8-Q5 | Giới hạn khoảng thời gian | BR-RPT-01, AUD-03 | Báo cáo ≤ 366 ngày; nhật ký ≤ 92 ngày; biểu đồ Tổng quan 30 ngày cố định. | Mặc định PO |
| S8-Q6 | Xuất CSV báo cáo | BR-RPT-09 | Should, một tệp 5 khối, UTF-8 BOM, chống công thức. Không xuất nhật ký, không xuất khách. | Mặc định PO |
| S8-Q7 | Thông tin cửa hàng nào hiển thị / sửa được? | BR-SET-02..04 | Tên pháp lý (không có "tên thương hiệu" riêng), MST, nơi / ngày cấp, địa chỉ, hotline, giờ làm việc, email CSKH, email dữ liệu, thông báo Bộ Công Thương, MXH (Should). Giá trị ban đầu = `STORE_INFO` mẫu; Thắng nhập thông tin thật trước go-live (G9). | Mặc định PO |
| S8-Q8 | Trường FE không có dữ liệu | D4; BR-RPT-07 | Lãi gộp, biên, trả hàng, đơn giao thất bại, ABC, tồn lâu, vùng, heatmap, size / màu, báo cáo khách / voucher: Won't, ẩn ở HTTP. | Mặc định PO |
| S8-Q9 | Độ tươi của dữ liệu công khai | BR-SET-10, 11 | `max-age=60`: đổi ở admin hiện ở storefront trong ≤ 60 giây; không xoá cache tay. | Mặc định PO |
| S8-Q10 | Giới hạn giá trị tham số | BR-SET-05, 06 | Như BR-SET-05, 06 (phí ship ≤ 500.000; ngưỡng free-ship ≤ 50.000.000, `0` = miễn phí mọi đơn kèm cảnh báo; giữ chuyển khoản 10–1.440 phút; trần COD 100.000–50.000.000; ngày giao 1–30; giờ chốt 0–23). Đổi khoảng = đổi tầng ứng dụng, không cần migration (CHECK DB hiện có rộng hơn). | Mặc định PO |

---

## Slice 9: Trả hàng / hoàn tiền

Nguồn: master plan mục 0 và nhật ký quyết định (Thắng chốt: **chỉ trả hàng và hoàn tiền, kể cả giao sai size / sai màu; không đổi hàng**), mục "Return/refund phải là flow riêng, không ép vào delivery timeline"; Slice 3 (`line_discount`, `shipping_discount`, `store_policy`), Slice 4 (BR-ADM-25..27 hàng hoàn sau giao thất bại, BR-ADM-29 khách vãng lai qua OTP, email đơn), Slice 5 (BR-ACC-15 hạng, K5 / S5-Q5 từng là Won't), Slice 6 (BR-INV-24 ảnh, BR-INV-32 lý do `return`), Slice 7 (ma trận quyền, `account_events`), Slice 8 (BR-INS-09 định nghĩa doanh thu, BR-DSH-03 việc cần làm, BR-AUD nhật ký, BR-SET-12 nhóm Đổi trả ẩn). Thắng giao 2026-11-12: trả hàng / hoàn tiền end to end (BE API + migration cộng thêm + thay mock FE ở màn khách `account/orders/:orderId/return` và màn admin `/admin/returns`). Thắng đang vắng: mọi câu hỏi mở chốt theo mặc định PO (mục 7), Thắng đổi được khi quay lại. Mã BR: `BR-RET`; AC: `AC-RET`. Tên endpoint, bảng, cột, mã lỗi do Backend chốt trong `openapi.yaml`; PRD chỉ nêu dữ liệu và hành vi. Tiền là số nguyên đồng; múi giờ Asia/Ho_Chi_Minh (GMT+7); hoàn tiền **thủ công** (nhân viên chuyển khoản rồi ghi nhận), không tích hợp cổng thanh toán.

Hiện trạng đã đọc:
- FE khách (`return-request-page.ts`, `features/orders/order-returns.ts`, `order-models.ts`, `order-status.ts`, `order-view.ts`, `account-api.ts`): form chọn dòng + số lượng, 6 lý do (`wrong-size`, `wrong-color`, `wrong-item`, `defective` = lỗi của shop; `not-fit`, `changed-mind` = lỗi của khách), ảnh ≤ 5 (≤ 5 MB, tải ngay, có tiến độ), tài khoản nhận hoàn cho đơn COD (ngân hàng, số 6–19 chữ số, chủ tài khoản), "Dự kiến hoàn" tính ở FE, một yêu cầu mỗi đơn, hạn `delivered_at + returnDays` (30). Chạy mock; ở HTTP nút và route bị ẩn (K5 Slice 5).
- FE admin (`return-list-page.ts`, `admin-apis`, `models.ts` `ReturnSummary` / `ReturnDecisionInput` / `ReturnCompletionInput`, `order-detail-page`): danh sách 4 trạng thái (`pending` / `approved` / `rejected` / `completed`), duyệt / từ chối ở đơn gốc, "hoàn tất" nhập `refundAmount` tay + `restock` một cờ cho cả yêu cầu. Ở HTTP `/admin/returns` là "Chưa khả dụng" (AC-INS-07).
- BE: **chưa có** bảng, API hay email trả hàng. `order_status` chỉ có `to_pay`, `to_ship`, `to_receive`, `completed`, `cancel_requested`, `cancelled` (không có "đã trả"); `payment_status` đã có `refunded` / `partially_refunded` nhưng **không đường nào ghi**; `orders.returned_from_transit` + `return_*` là luồng hàng hoàn sau giao thất bại (BR-ADM-26, 27), **khác** trả hàng sau giao; `order_items.line_discount` đã chia đều voucher theo `pricing.ts`; `inventory_adjustments` có lý do `return` (delta > 0); `order_access_grants` cho khách vãng lai sau OTP; lưu ảnh có driver (Slice 6, `media_assets`, gỡ metadata ảnh); `delivered_at` có ở đơn `completed`. Thanh toán thực tế chủ yếu COD (`bank_transfer_enabled = false`).
- Chính sách công khai (`policy-content.ts`, `store-policy.ts`): 30 ngày kể từ ngày nhận; lý do sai size / màu / sản phẩm, lỗi, không vừa / không còn nhu cầu; lỗi shop: shop chịu phí gửi trả và hoàn cả phí giao ban đầu **nếu trả toàn bộ đơn**; lý do của khách: trừ 30.000 phí gửi trả; hoàn "bằng số tiền thực trả" (đã trừ phần voucher phân bổ); xác nhận ≤ 24 giờ làm việc, kiểm hàng ≤ 2 ngày làm việc, hoàn 1–3 ngày làm việc; khách vãng lai gọi hotline / gửi email. Trang trợ giúp (`help-page.ts`) đang ghi "nine2fine chịu toàn bộ phí gửi trả", **mâu thuẫn** với chính sách (lý do của khách chịu 30.000): phải sửa chữ trợ giúp (BR-RET-54).

### 1. Vấn đề và mục tiêu

**Vấn đề.** Khách nhận sai size / màu hoặc hàng lỗi chỉ có cách gọi hotline; shop không có chỗ ghi nhận, duyệt, nhận hàng về, hoàn kho và hoàn tiền; tiền hoàn, tồn kho, `payment_status`, doanh thu và hạng thành viên có nguy cơ lệch nhau nếu xử lý bằng tay. Chính sách công khai đã hứa quy trình này; hai màn đã thiết kế nhưng chạy mock và gồm các ô không có dữ liệu thật.

**Mục tiêu.**
1. Thành viên gửi yêu cầu trả hàng cho đơn đã nhận trong 30 ngày: chọn dòng và số lượng, lý do, ảnh, tài khoản nhận hoàn (COD); theo dõi trạng thái; huỷ khi chưa được duyệt.
2. Nhân viên duyệt / từ chối, ghi nhận đã nhận hàng và kiểm từng dòng (nhập lại kho hay loại bỏ); admin xác nhận đã hoàn tiền; mỗi bước có nhật ký và email cho khách.
3. Số tiền hoàn tính một công thức duy nhất (sau voucher, trừ phí gửi trả theo lý do, hoàn phí giao khi shop lỗi và trả toàn bộ đơn); khách thấy dự kiến, shop thấy số chốt.
4. Số liệu nhất quán: tồn kho đúng, `payment_status` đúng, doanh thu / báo cáo trừ tiền hàng đã hoàn, hạng thành viên trừ phần hoàn (đúng như chính sách công khai).
5. Dữ liệu nhạy cảm (số tài khoản, ảnh) được che, không rò ra email / nhật ký / người không có quyền.

**Không phải mục tiêu.** Đổi hàng (Thắng đã chốt không làm), cổng hoàn tiền tự động, tự tạo vận đơn trả, nhân viên tạo hộ yêu cầu, sửa tay số tiền hoàn, hoàn nhiều đợt cho một đơn, hoàn lượt voucher, thay đổi chính sách 30 ngày / 30.000 / thời gian hoàn, bù trừ khuyến mãi, đánh giá sản phẩm.

### 2. Phạm vi

| Hạng mục | Mức | Lý do |
| --- | --- | --- |
| Nền: quyền (khách / staff / admin, quyền mới "xác nhận hoàn tiền" chỉ admin), giới hạn tần suất, mã lỗi, máy trạng thái, migration cộng thêm, cờ FE `returnsMode` | Must | Giống Slice 4, 6, 7, 8; tiền và dữ liệu nhạy cảm cần ranh giới rõ. |
| Thành viên gửi yêu cầu cho đơn của mình: điều kiện đơn + hạn 30 ngày, dòng / số lượng (trả một phần), 6 lý do, mô tả, ảnh, tài khoản nhận hoàn đơn COD, idempotent, một yêu cầu mỗi đơn | Must | Mục tiêu 1; chính sách công khai đã hứa. |
| Khách huỷ yêu cầu khi chưa được duyệt; xem trạng thái, số tiền, lý do từ chối trong chi tiết đơn | Must | Mục tiêu 1. |
| Admin / staff: danh sách + tab đếm + tìm, chi tiết, duyệt, từ chối, nhận hàng + kiểm từng dòng (nhập kho / loại bỏ), xác nhận hoàn tiền (admin), cập nhật `payment_status`, nhật ký sự kiện đơn | Must | Mục tiêu 2, 3. |
| Email cho khách: đã nhận yêu cầu, được duyệt, bị từ chối, đã hoàn tiền | Must | Chính sách hứa "xác nhận trong 24 giờ" và thông báo hoàn tiền; cùng cơ chế thư đơn Slice 4. |
| Số liệu: việc cần làm ở Tổng quan, doanh thu thuần + KPI tiền hoàn ở Báo cáo, hạng thành viên trừ tiền hoàn, nhật ký hợp nhất có thao tác trả hàng | Must | Mục tiêu 4; không làm thì số liệu sai. |
| Sửa chữ chính sách / trợ giúp / thông báo cho khớp hành vi | Must | Chính sách công khai là cam kết với khách. |
| Khách vãng lai (mã đơn + email + OTP) gửi / xem / huỷ yêu cầu | Should | Dùng lại cơ chế `order_access_grants` (như huỷ đơn vãng lai); nếu cắt thì chính sách vẫn nói "gọi hotline" (đúng hiện trạng). |
| Email "đã nhận hàng trả về"; cờ "quá 24 giờ chưa xử lý"; `returnPending` ở danh sách đơn; thông tin lấy hàng (đơn vị, mã vận đơn tuỳ chọn); KPI `returnRate` ở Báo cáo | Should | Tiện, không chặn vận hành. |
| Đổi hàng; lý do "khác" / "không như mô tả"; nhân viên tạo hộ yêu cầu; sửa tay số tiền hoàn; hoàn nhiều đợt / yêu cầu lần hai sau khi bị từ chối; hoàn lượt voucher; cổng hoàn tiền; tự tạo vận đơn / lấy hàng; tự xoá ảnh theo lịch; sửa số ngày / phí gửi trả ở Cài đặt; `returnRate` ở Tổng quan; "Đã trả hàng" ở khách hàng; địa chỉ trả (`isReturn`) | Won't | Ngoài phạm vi Thắng giao / chưa có dữ liệu hoặc nhu cầu; ẩn ở HTTP. |

### 3. Hiện trạng và hành vi được chọn

| # | Điểm | Hiện trạng | Chọn | Lý do |
| --- | --- | --- | --- | --- |
| D1 | Trạng thái đơn | FE có `return-requested`, `returned`; DB `order_status` không có. | **Không thêm giá trị `order_status`.** Đơn giữ `completed`; yêu cầu trả hàng là thực thể riêng gắn với đơn (flow riêng, đúng master plan); FE suy ra nhãn "Đang xử lý trả hàng" / "Đã trả hàng" từ trạng thái yêu cầu. | Thêm trạng thái đơn kéo theo mọi truy vấn doanh thu, hạng, tab; tách riêng thì doanh thu / hạng chỉ cần trừ phần hoàn. |
| D2 | Máy trạng thái | FE mock 4 trạng thái; hoàn tất nhập tay số tiền. | 6 trạng thái: `requested` → `approved` → `received` → `refunded`; `requested` / `approved` → `rejected`; `requested` → `cancelled` (khách). Không có trạng thái "đã nhận nhưng chưa kiểm". | Mỗi bước có người chịu trách nhiệm và một hành động kiểm được (BR-RET-08). |
| D3 | Hạn trả | `delivered_at + returnDays × 24 giờ` so giờ máy khách. | Hạn = **hết ngày (23:59:59 giờ VN) của ngày thứ 30 kể từ ngày giao** (ngày giao VN = ngày 0); máy chủ tính, FE nhận cờ `canReturn` + `deadline`. 30 là hằng số, không sửa ở Cài đặt. | Khớp chữ "hết ngày …" FE đã hiển thị; không phụ thuộc đồng hồ máy khách. |
| D4 | Số tiền hoàn | FE: chia voucher theo tỉ lệ `subtotal`; `unitPrice × qty`. | Theo `order_items.line_discount` (đã chia sẵn): hoàn tiền hàng của dòng = `unit_price × qty − line_discount` (trả một phần: theo tỉ lệ số lượng, làm tròn half-up); + phí giao thực trả nếu lỗi shop và hoàn toàn bộ đơn; − 30.000 phí gửi trả nếu lỗi của khách. | Một nguồn sự thật với tổng đơn; đúng chính sách công khai. |
| D5 | Hoàn tiền | FE mock: nhân viên nhập số tiền. | Số tiền do máy chủ tính và chốt lúc nhận hàng; admin chỉ **xác nhận đã chuyển** (kèm mã giao dịch ngân hàng), không sửa số. | Giảm sai sót / gian lận nội bộ; khác biệt thực tế xử lý bằng kiểm từng dòng. |
| D6 | Tồn kho khi nhận hàng | FE mock: một cờ `restock` cho cả yêu cầu. | Kiểm **từng dòng**: số lượng đạt + hướng xử lý nhập lại kho / loại bỏ; nhập lại ghi `inventory_adjustments` lý do `return` (BR-INV-32). | Hàng trả một phần có cái đạt cái hỏng. |
| D7 | `payment_status` | `refunded` / `partially_refunded` có trong enum, chưa có đường ghi. | Ghi khi admin xác nhận hoàn tiền: `refunded` nếu mọi dòng đã hoàn đủ số lượng, ngược lại `partially_refunded`; đơn vẫn `completed`. | Dùng đúng enum đã có. |
| D8 | Doanh thu | BR-INS-09: `completed` + `paid`, `refunded` / `partially_refunded` không tính. | Đơn tính doanh thu = `completed` + (`paid` **hoặc `partially_refunded`**); doanh thu = Σ dòng đơn **trừ tiền hàng đã hoàn của dòng**; số lượng trừ số lượng đã hoàn; ghi vào ngày `delivered_at` của đơn gốc (không dịch sang ngày hoàn). `refunded` vẫn không tính (đã hoàn hết). Một hàm dùng chung cho mọi khối (S9-Q8). | Trả một phần không được làm mất cả đơn khỏi doanh thu; mọi khối vẫn khớp nhau. |
| D9 | Hạng thành viên | `getMembership`: Σ `total` đơn `completed` trong năm; chính sách công khai nói "phần giá trị đã hoàn tiền khi trả hàng không được tính". | Chi tiêu = Σ (`total` − tiền hàng đã hoàn − phí giao đã hoàn) của đơn `completed` trong năm; **không** trừ phí gửi trả. | Code phải đúng chính sách đã công bố. |
| D10 | Hàng hoàn Slice 4 | `returning` (hàng về sau giao thất bại / từ chối nhận). | Giữ nguyên, tách riêng khỏi trả hàng sau giao; không dùng chung bảng, tab, đếm. | Quy trình và dữ liệu khác nhau (BR-ADM-26, 27). |
| D11 | Đơn chuyển khoản | `bank_transfer_enabled = false`; chưa có đơn thật. | Hỗ trợ đúng nhánh: không thu tài khoản nhận hoàn (hoàn về tài khoản đã trả), admin vẫn xác nhận bằng mã giao dịch. Kiểm bằng dữ liệu seed. | Khi bật chuyển khoản không phải làm lại. |
| D12 | Cờ FE | `accountMode` ẩn trả hàng (K5); `ADMIN_RETURNS_API` mock. | Cờ mới `returnsMode` (`http` bản thường, `mock` e2e; e2e chọn `http` bằng `localStorage['n2f.e2e.returnsMode']`) điều khiển cả màn khách và `/admin/returns`; `http` hiện nút / route / menu. | Phát hành tách khỏi slice trước. |
| D13 | Quyền | `returns.process` có ở staff và admin (FE `permissions.ts`). | Giữ `returns.process` (xem, duyệt, từ chối, nhận hàng: staff + admin); thêm `returns.refund` (xác nhận hoàn tiền, xem số tài khoản đầy đủ: chỉ admin). | Người động vào tiền khác người nhận hàng (S9-Q7). |

### 4. Business Rules

**Chung (quyền, nền, trạng thái)**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-RET-01 | Must | BR-ADM-29 | API khách chỉ nhận phiên khách `n2f_sid` còn hạn; chỉ thao tác trên đơn **của chính tài khoản** (`user_id`). Đơn không tồn tại hoặc của người khác → 404 `not-found` (không phân biệt, không lộ). Không phiên / hết hạn → 401 `unauthenticated`, `Cache-Control: no-store`. Khách vãng lai: BR-RET-22. |
| BR-RET-02 | Must | BR-INS-02 | API admin chỉ nhận phiên `n2f_asid` của staff / admin đang hoạt động; vai trò và `is_active` đọc từ DB mỗi yêu cầu. **staff**: xem danh sách / chi tiết, duyệt, từ chối, nhận hàng (`returns.process`). **admin**: thêm xác nhận hoàn tiền và xem số tài khoản đầy đủ (`returns.refund`). Thiếu quyền → 403 `forbidden`, dữ liệu không đổi, không dòng sự kiện. Kiểm ở máy chủ trước khi đọc thân yêu cầu. |
| BR-RET-03 | Must | BR-INS-04 | Giới hạn: khách tạo yêu cầu 10 / giờ / tài khoản; tải ảnh 30 / giờ / tài khoản; khách đọc dùng giới hạn đơn hiện có; admin dùng bộ đếm BR-INS-04 (đọc 120, ghi 60 / 60 giây). Vượt → 429 `rate-limited` + `retryAfterSeconds` + `Retry-After`. |
| BR-RET-04 | Must | D12 | Cờ FE `returnsMode`. `http`: màn khách và `/admin/returns` gọi API thật, không đọc / ghi mock; menu admin có "Trả hàng" (staff + admin); mọi ô Won't (mục 2) ẩn. `mock`: như hiện tại, Playwright mock pass nguyên. |
| BR-RET-05 | Must | BR-INS-06 | Migration chỉ cộng thêm (không `DROP` / `TRUNCATE` / đổi kiểu): bảng yêu cầu, bảng dòng trả, bảng / cột ảnh trả hàng (bật RLS), giá trị sự kiện đơn mới (`ADD VALUE`), chỉ mục (trạng thái + thời điểm; **duy nhất một yêu cầu không-`cancelled` mỗi đơn**). Không đổi `order_status`. Chạy `migrate deploy` 2 lần thì lần 2 không có gì; số dòng `orders`, `order_items`, `users`, `inventory_adjustments` không đổi. |
| BR-RET-06 | Must | BR-INS-07 | Mã lỗi ổn định (FE map theo `code`): `unauthenticated` 401, `forbidden` 403, `not-found` 404, `validation` 422 (+`field`, nhiều lỗi trả cùng lúc theo trường), `invalid-image` 422 (+`reason` ∈ `format` / `size` / `dimensions`), `not-returnable` 409 (đơn chưa `completed`, thiếu `delivered_at`, hoặc `payment_status` ≠ `paid`), `return-window-closed` 409, `return-exists` 409, `invalid-transition` 409, `idempotency-conflict` 409, `rate-limited` 429, lỗi máy chủ; không stack trace, SQL; FE hiện câu tiếng Việt riêng cho từng mã. |
| BR-RET-07 | Must | BR-INS-08 | Quy ước: thời điểm trả về ISO 8601 UTC; ngày hiển thị theo giờ VN; tiền số nguyên đồng; API khách và admin `no-store`; không bao giờ trả số tài khoản đầy đủ cho khách hay staff (BR-RET-17). |
| BR-RET-08 | Must | D2 | Máy trạng thái (ngoài bảng → 409 `invalid-transition`, dữ liệu không đổi): `requested` → `approved` (nhân viên duyệt) hoặc `rejected` (từ chối) hoặc `cancelled` (khách huỷ); `approved` → `received` (nhận hàng, kiểm xong) hoặc `rejected` (đóng không hoàn: khách không gửi hàng / hàng không đạt); `received` → `refunded` (admin xác nhận đã hoàn tiền). `rejected`, `cancelled`, `refunded` là cuối. Mỗi chuyển ghi thời điểm và người; chuyển lần hai cùng đích → 409. |
| BR-RET-09 | Must | S9-Q10 | Mỗi đơn có **tối đa 1 yêu cầu không-`cancelled`** (đang xử lý, đã hoàn hoặc đã bị từ chối). Yêu cầu `cancelled` cho phép tạo lại khi còn hạn. Đã `rejected` / `refunded` → tạo mới 409 `return-exists` (khách gọi hotline). Hai yêu cầu đồng thời cho cùng đơn: đúng một thành công, còn lại 409 `return-exists` (ràng buộc ở DB, không chỉ ở mã). |

**Khách gửi và theo dõi yêu cầu**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-RET-10 | Must | D3 | Đơn đủ điều kiện = `status = completed`, `delivered_at` có giá trị, `payment_status = paid`. Hạn = 23:59:59 giờ VN của ngày (ngày giao VN + 30). Gửi sau hạn → 409 `return-window-closed`; đơn chưa đủ điều kiện (kể cả `to_receive`, `cancelled`, `refunded`, đã `partially_refunded`) → 409 `not-returnable`. Chi tiết đơn của khách trả `canReturn` (máy chủ tính), `returnDeadline`; hết hạn thì nút ẩn và hiện thông báo kèm liên kết trợ giúp. |
| BR-RET-11 | Must | FE `ReturnLine` | Chọn ≥ 1 dòng; mỗi dòng chọn số lượng nguyên 1…số lượng đã mua của dòng; dòng phải thuộc đơn; trùng dòng, 0, âm, vượt số đã mua, dòng lạ → 422 `validation` `field: lines`. Trả một phần (không phải mọi dòng / mọi số lượng) được phép. Đơn một dòng: FE chọn sẵn dòng đó. |
| BR-RET-12 | Must | FE `RETURN_REASONS` | Đúng 1 lý do cho cả yêu cầu, một trong 6 mã cố định: lỗi của shop = `wrong-size` (Giao sai size), `wrong-color` (Giao sai màu), `wrong-item` (Giao sai sản phẩm), `defective` (Sản phẩm lỗi hoặc hư hỏng); lỗi của khách = `not-fit` (Không vừa), `changed-mind` (Không còn nhu cầu). Mã khác / thiếu → 422 `field: reason`. Không có lý do "khác" và "không như mô tả" (Won't). |
| BR-RET-13 | Must | FE form | Mô tả (NFC, cắt khoảng trắng hai đầu, không ký tự điều khiển ngoài xuống dòng): lỗi shop bắt buộc **10–500 ký tự**; lỗi khách tuỳ chọn ≤ 500. Lý do lỗi khách bắt buộc `conditionAck = true` ("còn nguyên tem nhãn, chưa qua sử dụng, chưa giặt"), thiếu → 422 `field: conditionAck`. Lý do lỗi shop không cần xác nhận này. |
| BR-RET-14 | Must | BR-INV-24; FE | Ảnh minh chứng: **lỗi shop bắt buộc ≥ 1**; lỗi khách tuỳ chọn; tối đa **5** ảnh mỗi yêu cầu. Tải từng ảnh ngay khi chọn (1 tệp / yêu cầu tải): JPEG, PNG hoặc WebP xác định theo nội dung (không theo đuôi), ≤ **5 MB**, cạnh ngắn ≥ 200 px, cạnh dài ≤ 8.000 px; sai → 422 `invalid-image` `reason`. Gỡ metadata (EXIF / GPS) trước khi lưu, tên do máy chủ sinh. Ảnh gắn vào yêu cầu phải do **chính tài khoản đó** tải trong 24 giờ qua và chưa gắn yêu cầu nào; ảnh lạ / của người khác / quá hạn → 422 `field: photos`. Thiếu ảnh khi bắt buộc → 422 `field: photos`; > 5 → 422. |
| BR-RET-15 | Must | S9-Q5 | Ảnh trả hàng **không công khai**: chỉ chủ yêu cầu, staff và admin xem được, mỗi lần đều kiểm quyền (không có URL mở được khi không đăng nhập, không đoán được từ id). Ảnh không thuộc yêu cầu nào quá 24 giờ không còn gắn được. Không tự xoá ảnh của yêu cầu theo lịch (Won't, rủi ro R4). |
| BR-RET-16 | Must | FE; chính sách | Tài khoản nhận hoàn: đơn **COD bắt buộc** `bank` (2–60 ký tự), `accountNumber` (bỏ khoảng trắng còn **6–19 chữ số**), `accountName` (2–50 ký tự, chữ cái và khoảng trắng; lưu in hoa); đơn chuyển khoản **không thu** (nếu gửi thì bỏ qua, hoàn về tài khoản đã thanh toán). Sai → 422 đúng `field` (`bank`, `accountNumber`, `accountName`), trả đủ mọi lỗi một lần. |
| BR-RET-17 | Must | S9-Q6 | Bảo vệ số tài khoản: (a) mọi phản hồi cho khách và staff chỉ có ngân hàng, **4 số cuối**, tên chủ tài khoản; (b) admin (`returns.refund`) xem số đầy đủ **chỉ khi yêu cầu ở `received`** (lúc cần chuyển), ở trạng thái khác chỉ bản che; (c) số đầy đủ **không** xuất hiện trong email, sự kiện đơn, nhật ký hoạt động, log máy chủ, tên tệp, CSV; (d) khi yêu cầu sang trạng thái cuối (`refunded`, `rejected`, `cancelled`) máy chủ **xoá số đầy đủ** (giữ ngân hàng, 4 số cuối, tên chủ) trong cùng giao dịch. |
| BR-RET-18 | Must | BR-CHK idempotency | `POST` tạo yêu cầu bắt buộc `Idempotency-Key`; gửi lại cùng khoá + cùng nội dung → `200` kèm `Idempotency-Replayed`, **không** tạo thêm; cùng khoá khác nội dung → 409 `idempotency-conflict`; thiếu khoá → 422. FE giữ một khoá cho mỗi lần bấm "Gửi" của một nội dung (thử lại sau mất mạng dùng lại khoá). |
| BR-RET-19 | Must | D2 | Khách huỷ yêu cầu: chỉ khi `requested` → `cancelled`, không lý do, trong cùng giao dịch xoá số tài khoản đầy đủ. Đã `approved` trở đi → 409 `invalid-transition` (FE chỉ hướng dẫn gọi hotline). Sau khi huỷ, đơn tạo lại được nếu còn hạn (BR-RET-09). Không gửi email. |
| BR-RET-20 | Must | BR-ACC | Chi tiết đơn của khách (API đơn hiện có) thêm: `canReturn`, `returnDeadline`, và `return` (nếu có yêu cầu mới nhất không-`cancelled`, hoặc `cancelled` mới nhất khi chỉ có yêu cầu huỷ): trạng thái, thời điểm từng bước, dòng + số lượng (+ số lượng được chấp nhận sau kiểm), lý do, mô tả, ảnh của mình (có quyền), số tiền (dự kiến khi `requested` / `approved`, **chốt** từ `received`), `returnShippingFee`, `refundedAmount` + dự kiến ngày hoàn (≤ 3 ngày làm việc sau `received`, cùng hàm ngày làm việc của ngày giao dự kiến), lý do từ chối (nếu `rejected`), hướng dẫn gửi hàng (nếu `approved`), tài khoản che (BR-RET-17). Dòng thời gian đơn có thêm các sự kiện trả hàng (BR-RET-40). |
| BR-RET-21 | Must | D4 | Phản hồi tạo yêu cầu và chi tiết đơn trả `amount` đã tính theo BR-RET-30 trên số lượng đã chọn, cùng cấu phần (`goodsAmount`, `shippingRefund`, `returnShippingFee`); FE hiện "Dự kiến hoàn" lấy từ máy chủ (hoặc cùng công thức dùng `lineDiscount` của đơn), nhãn "dự kiến, chốt sau khi nine2fine kiểm hàng". Nếu tiền hàng − phí gửi trả ≤ 0 (chỉ xảy ra với lý do lỗi khách): 422 `validation` `field: lines` ("Giá trị hàng trả không đủ bù phí gửi trả 30.000 ₫"), không tạo. |
| BR-RET-22 | Should | BR-ADM-29 | Khách vãng lai (đã qua tra cứu mã đơn + email + OTP, có `order_access_grants` còn hạn) gửi / xem / huỷ yêu cầu **chỉ cho đơn của grant đó** với đúng các quy tắc BR-RET-10…21 (ảnh gắn theo grant thay vì tài khoản; tải ảnh 30 / giờ / grant và giới hạn IP hiện có). Grant hết hạn → 401; đơn khác → 404. Khi làm xong: sửa chữ chính sách mục "Cách gửi yêu cầu" (BR-RET-54). |
| BR-RET-23 | Must | FE | FE khách (`returnsMode = http`): nút "Yêu cầu trả hàng" ở chi tiết đơn **chỉ khi** `canReturn`; khi đã có yêu cầu hiện khối trạng thái thay nút; trang `/account/orders/:orderId/return` bám `canReturn` của máy chủ (không tính hạn bằng đồng hồ máy khách). Nhãn trạng thái: `requested` "Chờ nine2fine duyệt", `approved` "Đã duyệt, chờ bạn gửi hàng", `received` "Đã nhận hàng, đang hoàn tiền", `refunded` "Đã hoàn tiền", `rejected` "Không được chấp nhận", `cancelled` "Đã huỷ yêu cầu". Nhãn đơn "Đang xử lý trả hàng" khi `requested` / `approved` / `received`; "Đã trả hàng" khi `refunded` và mọi dòng đã hoàn đủ; hoàn một phần: đơn vẫn "Hoàn thành" kèm ghi chú "Đã hoàn tiền một phần". |
| BR-RET-24 | Must | BR-INS-03 | FE khách: nút Gửi khoá khi đang gửi hoặc còn ảnh đang tải; tải ảnh có tiến độ, lỗi hiện **trên từng ảnh** (không chặn ảnh khác), xoá được; lỗi 422 gắn vào đúng ô (`lines`, `reason`, `detail`, `photos`, `conditionAck`, `bank`, `accountNumber`, `accountName`); mất mạng / 5xx: thông báo, **giữ nguyên** mọi giá trị và ảnh đã tải, "Thử lại" dùng lại khoá; 401 → đăng nhập rồi quay lại trang; `return-window-closed`, `not-returnable`, `return-exists` hiện câu riêng và liên kết tới chi tiết đơn; thành công → về chi tiết đơn + thông báo "Đã gửi yêu cầu trả hàng". Đủ trạng thái đang tải / lỗi / rỗng. |

**Nhân viên và admin xử lý**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-RET-30 | Must | D4, D9 | Công thức tiền (một nơi dùng chung cho dự kiến và chốt): với mỗi dòng đơn, `lineNet = unit_price × quantity − line_discount`; hoàn tiền hàng của dòng với `q` đơn vị đạt = `lineNet` nếu `q` = số lượng mua, ngược lại `round half-up(lineNet × q / quantity)`. `goodsAmount` = Σ các dòng. `shippingRefund` = `shipping_fee − shipping_discount` **chỉ khi** lý do lỗi shop **và** mọi dòng đơn được hoàn đủ số lượng; ngược lại 0. `returnShippingFee` = 30.000 khi lý do lỗi khách, ngược lại 0 (hằng số `store-policy`, không sửa ở Cài đặt). `amount = goodsAmount + shippingRefund − returnShippingFee` (≥ 0). Voucher không được hoàn lượt. |
| BR-RET-31 | Must | FE `ReturnQuery` | Danh sách admin (`/admin/returns`): bộ lọc `state` ∈ {tất cả, `requested`, `approved`, `received`, `refunded`, `closed` (= `rejected` + `cancelled`)}, tìm `q` ≤ 100 ký tự theo mã đơn / tên người nhận / SĐT, `sort` ∈ `requestedAt` (mặc định, mới trước) · `amount`, phân trang `page` ≥ 1, `limit` 20 / 50 (khác → 422), số đếm mỗi tab. Mỗi dòng: mã đơn, `requestedAt`, tên người nhận, lý do, trạng thái, số sản phẩm (Σ số lượng), số tiền, người xử lý gần nhất. Thứ tự ổn định khi trùng thời điểm; trang quá cuối → `items` rỗng, `total` đúng. Mở dòng → đơn gốc. |
| BR-RET-32 | Must | BR-RET-17 | Chi tiết yêu cầu cho staff / admin (nằm trong chi tiết đơn gốc hoặc API riêng): dữ liệu BR-RET-20 + ảnh đầy đủ + tên người nhận / SĐT / email như đơn; tài khoản nhận hoàn che (admin ở `received`: số đầy đủ); lịch sử xử lý (ai, lúc nào, ghi chú). Không hiện ghi chú nội bộ của đơn khác. Id lạ → 404. |
| BR-RET-33 | Must | D2 | Duyệt (`returns.process`): `requested` → `approved`; ghi người, thời điểm; ghi chú hướng dẫn tuỳ chọn ≤ 250 ký tự hiện cho khách ("hẹn ĐVVC lấy hàng…"). Không đổi tồn, tiền, `payment_status`. Gửi email BR-RET-41. |
| BR-RET-34 | Must | D2 | Từ chối / đóng (`returns.process`): `requested` hoặc `approved` → `rejected`, **ghi chú bắt buộc 5–250 ký tự** (hiện cho khách và vào email); thiếu / ngoài khoảng → 422 `field: note`. Không đổi tồn, tiền, `payment_status`; xoá số tài khoản đầy đủ (BR-RET-17d). Đơn vẫn `completed`. Không tạo lại (BR-RET-09). |
| BR-RET-35 | Must | D6 | Nhận hàng & kiểm (`returns.process`): `approved` → `received`. Với **mỗi dòng đã yêu cầu** nhân viên nhập `acceptedQuantity` (0…số lượng yêu cầu) và với số lượng đạt > 0 chọn `disposition` ∈ `restock` (nhập lại kho bán) / `writeoff` (hỏng, không nhập). Có dòng đạt < yêu cầu thì **ghi chú bắt buộc 5–250 ký tự**. Thiếu dòng, số ngoài khoảng → 422 `field: lines`. Số tiền chốt = BR-RET-30 trên số lượng **đạt**. Nếu tổng đạt = 0 hoặc `amount` chốt ≤ 0 → yêu cầu chuyển thẳng `rejected` (BR-RET-34, hàng gửi lại khách miễn phí do nhân viên tự sắp xếp, ngoài hệ thống). Số lượng không đạt không tính tiền. Hai cách nhập (tiền, hướng xử lý) không có ô sửa số tiền tay. |
| BR-RET-36 | Must | BR-INV-32 | Tồn kho (cùng giao dịch với BR-RET-35): mỗi dòng `restock` với `q` > 0 cộng đúng `q` vào tồn có thể bán của biến thể và ghi **đúng 1** dòng `inventory_adjustments` (lý do `return`, delta = `+q`, ghi chú "Trả hàng #<mã đơn>", người = nhân viên, vai trò lúc đó); dòng `writeoff` không đổi tồn và không có dòng điều chỉnh (lưu `disposition` trên dòng trả). Cộng đúng **một lần**: nhận hàng lần hai → 409 `invalid-transition`. Biến thể đã ẩn / sản phẩm lưu trữ vẫn cộng được. |
| BR-RET-37 | Must | D5, D7 | Xác nhận hoàn tiền (`returns.refund`, chỉ admin): `received` → `refunded`; bắt buộc `refundReference` (mã giao dịch / nội dung chuyển khoản, 4–60 ký tự) và `amount` bằng đúng số tiền đã chốt (khác → 422 `field: amount`, FE tải lại); staff gọi → 403. Cùng giao dịch: ghi `refunded_at`, người, mã; cập nhật `payment_status` (BR-RET-38); xoá số tài khoản đầy đủ (BR-RET-17d). Hoàn tiền thực tế do admin chuyển khoản ngoài hệ thống trước khi bấm. |
| BR-RET-38 | Must | D7 | `payment_status` của đơn đổi **chỉ** ở bước `refunded`: `refunded` khi Σ số lượng đạt của yêu cầu = Σ số lượng mua của mọi dòng đơn; ngược lại `partially_refunded`. `status` đơn giữ `completed`. Các bước khác (kể cả `rejected` sau nhận) không đổi `payment_status`. Đơn đã `refunded` không còn trả được (BR-RET-10). |
| BR-RET-39 | Must | BR-ADM concurrency | Mỗi chuyển trạng thái là một thao tác nguyên tử so-sánh-rồi-đổi trên trạng thái hiện tại: hai nhân viên cùng duyệt / từ chối / nhận hàng, hoặc hai admin cùng xác nhận hoàn tiền → đúng một thành công, còn lại 409 `invalid-transition`; tồn kho, dòng điều chỉnh, `payment_status`, sự kiện, email chỉ phát sinh một lần. Một thao tác bị từ chối (403, 409, 422) không để lại thay đổi hay dòng sự kiện. |
| BR-RET-40 | Must | BR-ADM-10, BR-AUD-01 | Mỗi chuyển trạng thái (kể cả khách gửi / huỷ) thêm **đúng 1** sự kiện đơn (loại mới, người = khách hoặc nhân viên với tên + vai trò lúc đó); dòng thời gian của khách hiện "nine2fine" cho cả nhân viên và hệ thống (như Slice 4), của admin hiện tên nhân viên. Sự kiện **không** chứa số tài khoản, ghi chú nội bộ. Nhật ký hoạt động Slice 8 hiện sự kiện do nhân viên làm (duyệt, từ chối, nhận hàng, hoàn tiền) với `target.type = order`; sự kiện do khách không hiện (BR-AUD-01); lọc `targetType = order` có các dòng này. |
| BR-RET-41 | Must | BR-CHK-29; BR-ADM-21 | Email tới địa chỉ của đơn, 1 thư mỗi sự kiện, dùng hotline từ cài đặt: (a) khách gửi yêu cầu: "nine2fine – Đã nhận yêu cầu trả hàng đơn #{mã}" (tóm tắt dòng, lý do, dự kiến hoàn, cam kết xác nhận trong 24 giờ làm việc); (b) duyệt: "… yêu cầu trả hàng đơn #{mã} đã được duyệt" (hướng dẫn gửi hàng, ghi chú nhân viên); (c) từ chối: "… không được chấp nhận" (lý do); (d) hoàn tiền: "nine2fine – Đã hoàn tiền đơn #{mã}" (số tiền, hình thức, ngân hàng + 4 số cuối hoặc "tài khoản đã thanh toán", mã giao dịch). Lỗi gửi thư **không** chặn chuyển trạng thái (thử lại theo cơ chế thư đơn hiện có, đếm lần gửi). Thư không chứa số tài khoản đầy đủ. Chữ do PO đề xuất, Thắng sửa khi đọc thư thật. |
| BR-RET-42 | Must | admin-design | FE admin (`returnsMode = http`): `/admin/returns` theo BR-RET-31 (tab đếm, tìm, phân trang, URL giữ bộ lọc); mở dòng → đơn gốc có khối "Yêu cầu trả hàng" với nút theo trạng thái và quyền: `requested` Duyệt / Từ chối; `approved` Nhận hàng & kiểm (bảng từng dòng: số lượng đạt, hướng xử lý, ghi chú) / Đóng không hoàn; `received` Xác nhận đã hoàn tiền (admin; hiện số tiền, số tài khoản đầy đủ, ô mã giao dịch, hộp xác nhận). Hộp thoại lý do bắt buộc khi từ chối / đóng; nút khoá khi đang gửi; 409 `invalid-transition` → tải lại bản mới + thông báo "yêu cầu đã được xử lý bởi người khác"; mất mạng giữ hộp thoại và giá trị. |
| BR-RET-43 | Must | BR-INS-03 | FE admin: staff không thấy nút / hộp "Xác nhận đã hoàn tiền" và không thấy số tài khoản đầy đủ (chỉ bản che + dòng "Chỉ quản trị viên chuyển tiền"); ma trận quyền ở Cài đặt › Nhân viên có dòng "Duyệt, nhận hàng trả" (`returns.process`) và "Xác nhận hoàn tiền" (`returns.refund`, chỉ admin). Ở HTTP ẩn: tab đơn `returns` cũ (`return-requested` / `returned` của mock), cột / ô không có dữ liệu (Won't). |
| BR-RET-44 | Should | S9-Q12 | (a) Yêu cầu `requested` quá 24 giờ kể từ `requestedAt` hiện cờ "Quá hạn xử lý" ở danh sách và Tổng quan (tính khi đọc, không tác vụ nền); (b) danh sách đơn Slice 4 có `returnPending` = có yêu cầu `requested`; (c) duyệt kèm đơn vị vận chuyển (≤ 50) và mã vận đơn (≤ 40) tuỳ chọn, hiện cho khách; (d) email "đã nhận hàng trả về" ở bước `received` ("nine2fine – Đã nhận hàng trả đơn #{mã}", số tiền chốt). |

**Ảnh hưởng tới số liệu và nội dung công khai**

| Mã | Mức | Nguồn | Quy tắc |
| --- | --- | --- | --- |
| BR-RET-50 | Must | BR-DSH-03 | Tổng quan (staff và admin) thêm việc cần làm: số yêu cầu `requested` (mở `/admin/returns` tab Chờ duyệt), `approved` (Chờ nhận hàng), `received` (Chờ hoàn tiền); bằng đúng số đếm tab trong BR-RET-31, tính tại thời điểm gọi không phụ thuộc `range`. Các trường Won't `returnRate`, `deliveryFailed` vẫn không có; `returnRequests` nay là số `requested`. Staff vẫn không nhận trường tiền (BR-DSH-07). |
| BR-RET-51 | Must | D8 | Sửa BR-INS-09: **đơn tính doanh thu** = `completed` và `payment_status` ∈ {`paid`, `partially_refunded`}, ngày `delivered_at` (VN); doanh thu = Σ (`unit_price × quantity − line_discount`) **trừ tiền hàng đã hoàn** (BR-RET-30 phần dòng, chỉ yêu cầu `refunded`); `units` trừ số lượng đã hoàn; `refunded` hoàn toàn bị loại. Mọi khối (KPI, `byDay`, `topProducts`, `topVariants`, `byCategory`, `byPayment`, CSV, Tổng quan) dùng **cùng một hàm**; tổng các khối vẫn bằng KPI `revenue` (AC-INS-13). Hoàn tiền ghi vào ngày bán gốc, **không** vào ngày hoàn (kỳ cũ có thể giảm sau khi hoàn: ghi chú trên màn). Dòng `topProducts` / `topVariants` / `byCategory` có `units` = 0 và `revenue` = 0 sau trừ thì không hiện. Phí giao và phí gửi trả không nằm trong doanh thu. |
| BR-RET-52 | Must | D8; BR-RPT-02 | Báo cáo thêm KPI: `refundedAmount` (Σ tiền hàng đã hoàn của đơn giao trong kỳ), `refundedUnits`, `returnedOrders` (số đơn có yêu cầu `refunded`), kèm kỳ trước; hiện ở Báo cáo (admin). Should: `returnRate` = `refundedUnits` / (`units` + `refundedUnits`) (4 chữ số; mẫu 0 → 0). Ghi rõ trên màn "Doanh thu đã trừ hàng trả". |
| BR-RET-53 | Must | D9 | `getMembership`: chi tiêu = Σ (`total` − `goodsAmount` hoàn − `shippingRefund` hoàn) của đơn `completed` trong năm dương lịch VN (cách chọn năm giữ như hiện tại); không trừ phí gửi trả; hạng tính lại ở lần gọi sau (hạ hạng nếu dưới ngưỡng). Đơn `rejected` / `cancelled` không đổi gì. |
| BR-RET-54 | Must | chính sách công khai | Nội dung công khai khớp hành vi: (a) `help-page` bỏ câu "nine2fine chịu toàn bộ phí gửi trả", thay bằng "miễn phí khi giao sai / lỗi; trừ 30.000 ₫ khi không vừa / không còn nhu cầu" (lấy từ `store-policy`); (b) chính sách nêu hạn "kể từ ngày nhận (hết ngày thứ 30)"; (c) "xác nhận ≤ 24 giờ làm việc", "kiểm hàng ≤ 2 ngày làm việc", "hoàn 1–3 ngày làm việc" ghi là **dự kiến** (hệ thống không ép); (d) mục "Cách gửi yêu cầu" dùng chữ "Tài khoản → Lịch sử mua hàng → chọn đơn → Yêu cầu trả hàng" (đã đúng) và, chỉ khi BR-RET-22 phát hành, thêm "hoặc Tra cứu đơn hàng"; nếu chưa thì giữ "gọi hotline / gửi email". |
| BR-RET-55 | Must | D10; BR-INV-32 | Không đổi hành vi hàng hoàn Slice 4 (`returning`, BR-ADM-26, 27) và lý do điều chỉnh `return` ở Tồn kho: yêu cầu trả hàng không làm đơn vào tab `returning`; nhật ký tồn kho hiển thị dòng `return` do trả hàng cùng định dạng dòng `return` nhập tay. |

### 5. Acceptance criteria

Dữ liệu tham chiếu (hôm nay = ngày D theo giờ VN; mỗi AC chạy trên DB sạch với dữ liệu sau, trừ khi nói khác): admin A, staff S, thành viên M, thành viên N, khách vãng lai G. Biến thể V1 (áo, tồn có thể bán 7), V2 (quần, tồn 4), V3 (tồn 10). Đơn (đều `completed`, `paid`, COD, trừ khi ghi): **R1** (M) dòng L1 = V1 500.000 × 2, `line_discount` 100.000 (lineNet 900.000); L2 = V2 300.000 × 1 (lineNet 300.000); `subtotal` 1.300.000, `discount` 100.000, ship 0, total 1.200.000; giao D−5 10:00. **R2** (M) 1 dòng áo 400.000 × 1, ship 30.000, total 430.000; giao D−30 08:00 (hạn hết D 23:59:59). **R3** (M) như R2, giao D−31 10:00. **R4** (M) trạng thái `to_receive`. **R5** (M) 1 dòng V3 400.000 × 3, `line_discount` 200.000 (lineNet 1.000.000), ship 0; giao D−2. **R6** (M) 1 dòng 25.000 × 1, ship 30.000; giao D−1. **R7** (G, g@x.vn) như R2, giao D−3. **R8** (M) như R2 nhưng `bank_transfer`, giao D−3. Mỗi AC ghi BR.

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-RET-01 | RET-01 | Không cookie; `n2f_sid` hết hạn; chỉ `n2f_asid` của S; N đăng nhập | Gọi tạo / xem / huỷ yêu cầu cho R1; N gọi cho R1 | Ba lần đầu: 401 `unauthenticated`, `no-store`, DB không đổi; N: 404 `not-found` (giống đơn không tồn tại), không lộ thông tin đơn. |
| AC-RET-02 | RET-02 | S, A, yêu cầu ở `received` | S gọi duyệt, từ chối, nhận hàng, xác nhận hoàn tiền; A gọi xác nhận hoàn tiền; `is_active` của S đặt `false` rồi S gọi danh sách | S: 200 cho duyệt / từ chối / nhận hàng (đúng trạng thái), 403 `forbidden` cho xác nhận hoàn tiền (DB không đổi, không sự kiện); A: 200; S bị khoá: 401. Vai trò đọc từ DB (A hạ xuống staff bằng SQL → 403 ngay). |
| AC-RET-03 | RET-03 | M | 11 yêu cầu tạo trong 1 giờ (dữ liệu hợp lệ, các đơn khác nhau / huỷ lại); 31 lần tải ảnh trong 1 giờ; 61 yêu cầu ghi admin trong 60 giây | Yêu cầu tạo thứ 11, ảnh thứ 31, ghi admin thứ 61: 429 `rate-limited` + `retryAfterSeconds` + `Retry-After`; các lần trước vẫn thành công. |
| AC-RET-04 | RET-04 | Bản thường (`returnsMode = http`) | M mở chi tiết R1; A mở menu admin; chạy Playwright `returnsMode = mock` | Có nút "Yêu cầu trả hàng" và menu "Trả hàng"; không request nào tới mock ở hai màn; bản `mock` pass nguyên. |
| AC-RET-05 | RET-05 | DB có dữ liệu Slice 1–8 | `migrate deploy` 2 lần | Lần 2 không có migration mới; không DROP / TRUNCATE / đổi kiểu; bảng mới bật RLS; `order_status` không đổi; số dòng `orders`, `order_items`, `users`, `inventory_adjustments` không đổi; thêm yêu cầu thứ hai không-`cancelled` cho cùng đơn bằng SQL bị DB từ chối. |
| AC-RET-06 | RET-06 | Gây từng lỗi AC-RET-01, 02, 03, 10, 11, 13, 14, 18, 21, 31 | Đọc thân phản hồi và FE | `code` ổn định + HTTP đúng; không stack trace, SQL; FE hiện câu riêng cho `forbidden`, `validation`, `invalid-image`, `return-window-closed`, `not-returnable`, `return-exists`, `invalid-transition`, `rate-limited`, không trang trắng. |
| AC-RET-07 | RET-07 | R1 có yêu cầu `received` với tài khoản nhận hoàn | M, S, A đọc yêu cầu | Thời điểm ISO UTC; tiền số nguyên; `Cache-Control: no-store`; số tài khoản đầy đủ chỉ A ở `received` (AC-RET-17). |
| AC-RET-08 | RET-08 | Mỗi trạng thái | Thử mọi chuyển ngoài bảng: `requested` → `received` / `refunded`; `approved` → `refunded` / `cancelled` (khách); `received` → `approved` / `rejected`; trạng thái cuối → bất kỳ; lặp lại cùng chuyển | Mọi chuyển ngoài bảng và lặp lại: 409 `invalid-transition`, DB không đổi (SQL: trạng thái, tồn, `payment_status`, số sự kiện); các chuyển trong bảng: 200. |
| AC-RET-09 | RET-09 | R1 chưa có yêu cầu; R2 có yêu cầu `cancelled`; R5 có yêu cầu `rejected` | 20 yêu cầu tạo đồng thời cho R1 (khoá idempotency khác nhau); tạo lại cho R2; tạo cho R5 | R1: đúng 1 thành công, 19 × 409 `return-exists`, SQL: 1 dòng yêu cầu; R2: 201 (còn hạn, tạo lại được); R5: 409 `return-exists`. |
| AC-RET-10 | RET-10 | R1, R2, R3, R4, R8; đồng hồ giả | M gửi cho R2 lúc D 23:59:59 và D+1 00:00:00 (đơn mới); gửi cho R3; R4; một đơn `refunded`; đơn `partially_refunded` | R2 lúc 23:59:59: 201; lúc 00:00:00 ngày sau: 409 `return-window-closed`; R3: 409 `return-window-closed`; R4: 409 `not-returnable`; đơn `refunded`, `partially_refunded`: 409 `not-returnable`; `canReturn` / `returnDeadline` (R2 = D 23:59:59 giờ VN) đúng trong chi tiết đơn, `canReturn = false` sau hạn. |
| AC-RET-11 | RET-11 | R1 | Gửi dòng: L1 × 2 + L2 × 1; L1 × 3; L1 × 0; L1 × -1; L1 × 1 hai lần; chỉ dòng lạ; mảng rỗng; L1 × 1 (một phần) | Hợp lệ: 201 cho (L1 × 2 + L2 × 1) và (L1 × 1); còn lại 422 `field: lines`, không tạo yêu cầu; FE khoá số lượng ở mức mua. |
| AC-RET-12 | RET-12 | R1 | Lý do = `wrong-size`, `wrong-color`, `wrong-item`, `defective`, `not-fit`, `changed-mind`; `other`; `not-as-described`; thiếu | Sáu mã hợp lệ: 201 (kèm điều kiện ảnh / mô tả theo AC-RET-13, 14); `other`, `not-as-described`, thiếu: 422 `field: reason`. |
| AC-RET-13 | RET-13 | R1 | `defective` mô tả 9 / 10 / 500 / 501 ký tự; `not-fit` không mô tả với `conditionAck = false` / `true`; mô tả toàn khoảng trắng; có ký tự điều khiển | `defective`: 9 và 501 → 422 `field: detail`; 10, 500 hợp lệ. `not-fit` không mô tả + `true`: hợp lệ; `false` / thiếu: 422 `field: conditionAck`. Khoảng trắng → coi 0 ký tự (422 với lý do lỗi shop); ký tự điều khiển → 422. |
| AC-RET-14 | RET-14 | R1; ảnh JPEG 3 MB; JPG 6 MB; `.exe` đổi đuôi `.jpg`; PNG 150×150; JPEG có EXIF GPS | Tải từng ảnh; gửi `defective` không ảnh, 1 ảnh, 5 ảnh, 6 ảnh; gửi ảnh do N tải; gửi ảnh đã gắn yêu cầu khác; gửi ảnh tải cách 25 giờ | JPEG 3 MB: 201 có `id`; 6 MB: 422 `invalid-image` `size`; `.exe`: `format`; PNG 150×150: `dimensions`; ảnh lưu **không** còn EXIF GPS. `defective` không ảnh: 422 `field: photos`; 1 và 5 ảnh: 201; 6: 422; ảnh của N / đã gắn / quá 24 giờ: 422 `field: photos`; `changed-mind` không ảnh: 201. |
| AC-RET-15 | RET-15 | Yêu cầu của M có 2 ảnh | Mở URL ảnh khi không đăng nhập; N; M; S; A; đoán id ảnh khác | Không đăng nhập và N: 401 / 404 (không có nội dung ảnh); M, S, A: 200 ảnh đúng; id đoán trúng ảnh lạ khi không quyền: không trả ảnh; không URL ảnh nào trong phản hồi mở được không cookie. |
| AC-RET-16 | RET-16 | R1 (COD), R8 (chuyển khoản) | R1: bỏ `bank`; số `12345` / `123456` / 19 chữ số / 20 chữ số / `1234 5678 90` / `12ab56`; tên 1 / 2 / 51 ký tự, `nguyen van a`; R8 gửi kèm tài khoản; R8 không tài khoản | `bank` thiếu: 422 `field: bank`; số 5 chữ số, 20 chữ số, `12ab56`: 422 `field: accountNumber`; `123456`, 19 chữ số, `1234 5678 90` (lưu `1234567890`): hợp lệ; tên 1 và 51 ký tự: 422 `field: accountName`; `nguyen van a` lưu `NGUYEN VAN A`; R8 không tài khoản: 201; R8 có tài khoản: bỏ qua (không lưu). Nhiều lỗi trả cùng lúc theo trường. |
| AC-RET-17 | RET-17 | Yêu cầu COD của M qua đủ trạng thái, số `1234567890`, ngân hàng Vietcombank | M, S, A đọc ở `requested`, `approved`, `received`, `refunded`; grep email, sự kiện đơn, nhật ký hoạt động, log | M và S: chỉ "Vietcombank … 7890", tên chủ; A: số đầy đủ **chỉ ở `received`** (các trạng thái khác bản che); chuỗi `1234567890` không có trong mọi email, sự kiện đơn, nhật ký, log; sau `refunded` / `rejected` / `cancelled`: SQL cho thấy số đầy đủ đã xoá, vẫn còn ngân hàng + 4 số cuối + tên. |
| AC-RET-18 | RET-18 | R1, khoá K | Gửi hợp lệ với K hai lần; K với nội dung khác; thiếu khoá; 2 lần song song cùng K | Lần 2: 200 + `Idempotency-Replayed`, SQL 1 yêu cầu, 1 sự kiện, 1 email; nội dung khác: 409 `idempotency-conflict`; thiếu khoá: 422; song song: 1 yêu cầu. |
| AC-RET-19 | RET-19 | Yêu cầu của M ở `requested`; một yêu cầu `approved` | M huỷ yêu cầu `requested`; M huỷ yêu cầu `approved`; huỷ lại yêu cầu đã huỷ | `requested`: 200, trạng thái `cancelled`, số tài khoản đầy đủ đã xoá, không email, đúng 1 sự kiện; `approved` và huỷ lại: 409 `invalid-transition`; sau huỷ M tạo lại được khi còn hạn. |
| AC-RET-20 | RET-20 | Yêu cầu của M ở các trạng thái; đơn không có yêu cầu | M mở chi tiết đơn | Có `canReturn`, `returnDeadline`, `return` đủ trạng thái, từng thời điểm, dòng + số lượng đạt, lý do, mô tả, ảnh, số tiền (dự kiến khi `requested` / `approved`, chốt từ `received`), phí gửi trả, ngày dự kiến hoàn (≤ 3 ngày làm việc sau `received`), lý do từ chối (khi `rejected`), tài khoản che; đơn không có yêu cầu: không có khối `return`. |
| AC-RET-21 | RET-21, 30 | R1 | Tính dự kiến cho: (a) L1 × 1 + `not-fit`; (b) L1 × 2 + L2 × 1 + `wrong-size`; (c) R2 toàn đơn + `defective`; (d) R2 toàn đơn + `changed-mind`; (e) R5 × 1, × 2, × 3 + `defective`; (f) R6 + `not-fit`; (g) R8 toàn đơn + `wrong-item` | (a) goods 450.000 − 30.000 = **420.000**; (b) 900.000 + 300.000 = **1.200.000** (ship 0); (c) 400.000 + ship 30.000 = **430.000**; (d) 400.000 − 30.000 = **370.000** (không hoàn ship); (e) **333.333**, **666.667**, **1.000.000**; (f) 25.000 − 30.000 ≤ 0 → 422 `field: lines`, không tạo; (g) 430.000. Phản hồi có `goodsAmount`, `shippingRefund`, `returnShippingFee`, `amount`; FE hiện đúng số này. |
| AC-RET-22 (Should) | RET-22 | R7 có grant còn hạn của G; grant hết hạn; grant của đơn R2 | G tạo / xem / huỷ yêu cầu cho R7; G dùng grant hết hạn; G dùng grant R7 cho R2 | R7: như AC-RET-10..21 (ảnh gắn theo grant); grant hết hạn: 401; R2: 404; chính sách có "hoặc Tra cứu đơn hàng" (AC-RET-54). |
| AC-RET-23 | RET-23 | `http`; R1 chưa có yêu cầu / có yêu cầu từng trạng thái; R2 quá hạn | M xem chi tiết đơn, danh sách đơn tab trả hàng | Nút chỉ khi `canReturn`; quá hạn: không nút + câu giải thích; nhãn đúng 6 trạng thái; hoàn một phần: đơn "Hoàn thành" + "Đã hoàn tiền một phần"; `refunded` toàn bộ: "Đã trả hàng"; không dùng đồng hồ máy khách (đổi giờ máy không đổi nút). |
| AC-RET-24 | RET-24 | `http`; M ở form | Chọn ảnh lỗi + ảnh tốt; bấm Gửi khi còn ảnh đang tải; chặn mạng rồi Gửi, bỏ chặn bấm Thử lại; 422 từng trường; 409 hết hạn | Ảnh lỗi hiện lỗi riêng, ảnh tốt vẫn dùng được; nút khoá khi đang tải / gửi; mất mạng: thông báo, giữ mọi giá trị + ảnh đã tải, Thử lại dùng lại khoá → đúng 1 yêu cầu; 422 gắn cạnh đúng ô; 409: câu riêng + liên kết chi tiết đơn; thành công: về chi tiết đơn + "Đã gửi yêu cầu trả hàng". |
| AC-RET-30 | RET-30 | R1, R5 | Nhận hàng và chốt: (a) R1 L1 × 2 + L2 × 1 `wrong-size` đạt hết; (b) R1 `defective` L1 × 2 chỉ đạt 1; (c) R5 `not-fit` × 3 đạt 2 | (a) **1.200.000**; (b) 450.000, ship 0 vì chưa hoàn đủ mọi dòng → **450.000**; (c) round(1.000.000 × 2 / 3) = 666.667 − 30.000 = **636.667**. Số chốt không đổi khi `store_settings` / `line_discount` đổi sau đó. |
| AC-RET-31 | RET-31 | 25 yêu cầu: 8 `requested`, 5 `approved`, 4 `received`, 5 `refunded`, 2 `rejected`, 1 `cancelled`; tên người nhận Nguyễn Văn A | A và S mở danh sách: mặc định; `state = requested`; `closed`; `q = N2F…` (mã đơn), `q = Nguyễn Văn A`, `q = 09…` (SĐT); `limit = 50` / `0` / `51`; `page = 99`; `sort = amount`; `sort = reason` | Mặc định 20 dòng mới trước + số đếm 8 / 5 / 4 / 5 / 3 (đóng = 2 + 1) / tổng 25; `closed` 3 dòng; `q` đúng đơn; `limit` 50 hợp lệ, 0 và 51: 422; `page = 99`: `items` rỗng, `total` 25; `sort = amount` giảm; `sort = reason`: 422; hai yêu cầu cùng giây có thứ tự giống nhau qua các lần gọi và trang. |
| AC-RET-32 | RET-32 | Yêu cầu ở `approved` và `received` | S và A mở chi tiết; id lạ | Đủ dữ liệu BR-RET-20 + ảnh + lịch sử; tên / SĐT / email người nhận như đơn; tài khoản che (A đầy đủ ở `received`); id lạ: 404. |
| AC-RET-33 | RET-33 | Yêu cầu `requested` của M | S duyệt kèm ghi chú 251 ký tự; ghi chú 250; không ghi chú | 251: 422 `field: note`; 250 và không ghi chú: 200, `approved`; tồn, `payment_status` không đổi; đúng 1 sự kiện; 1 email (b). |
| AC-RET-34 | RET-34 | Yêu cầu `requested`; yêu cầu `approved` | S từ chối với ghi chú 4 / 5 / 250 / 251 ký tự, không ghi chú; từ chối yêu cầu `approved` | 4, 251, thiếu: 422 `field: note`; 5 và 250: 200, `rejected`; tồn, tiền, `payment_status` không đổi, đơn vẫn `completed`; số tài khoản đầy đủ xoá; email (c) có lý do; khách thấy lý do ở chi tiết đơn; `approved` → `rejected` cũng 200; tạo lại: 409 `return-exists`. |
| AC-RET-35 | RET-35 | Yêu cầu `approved` của R1 gồm L1 × 2 + L2 × 1 | S nhận hàng: (a) L1 đạt 2 `restock`, L2 đạt 1 `writeoff`; (b) L1 đạt 1, L2 đạt 1, không ghi chú; (c) như (b) có ghi chú 5 ký tự; (d) đạt 0 mọi dòng; (e) thiếu dòng L2; (f) đạt 3 cho L1 | (a) 200, `received`, số chốt 1.200.000; (b) 422 `field: note`; (c) 200, số chốt 450.000 + 300.000 = 750.000; (d) yêu cầu chuyển `rejected`, `payment_status` không đổi, email (c); (e), (f): 422 `field: lines`; không ô sửa tay số tiền. |
| AC-RET-36 | RET-36 | V1 tồn 7, V2 tồn 4; kịch bản (a) AC-RET-35 | Nhận hàng; gọi nhận hàng lần hai và 20 lần song song; xem nhật ký tồn kho V1, V2 | V1 7 → **9**, đúng 1 dòng điều chỉnh (lý do `return`, delta +2, "Trả hàng #<mã>", người S); V2 vẫn 4 và **không** có dòng điều chỉnh (writeoff, lưu `disposition`); song song: 1 thành công, 19 × 409, V1 = 9; kiểm BR-INV-32: dòng `return` hiện như nhập tay. |
| AC-RET-37 | RET-37 | Yêu cầu `received` số chốt 1.200.000 | S xác nhận; A xác nhận với `amount` 1.199.999; thiếu mã; mã 3 / 4 / 60 / 61 ký tự; A xác nhận đúng; A xác nhận lần hai | S: 403; `amount` sai: 422 `field: amount`; thiếu / 3 / 61 ký tự: 422 `field: refundReference`; 4 và 60: hợp lệ; A đúng: 200, `refunded`, `refunded_at`, người, mã lưu; lần hai: 409 `invalid-transition`; số tài khoản đầy đủ đã xoá; email (d) đúng số tiền, ngân hàng + 4 số cuối, mã giao dịch. |
| AC-RET-38 | RET-38 | (i) R1 trả hết (a); (ii) R1 trả L1 × 1; (iii) yêu cầu bị `rejected` sau nhận (đạt 0) | Hoàn tiền xong (i), (ii); kiểm (iii) | (i) `payment_status = refunded`; (ii) `partially_refunded`; đơn vẫn `completed` cả hai; (iii) vẫn `paid`; đơn đã `refunded` thì khách gửi lại: 409 `not-returnable`. Cập nhật diễn ra trong cùng giao dịch với `refunded` (không có trạng thái nửa vời khi lỗi giữa chừng). |
| AC-RET-39 | RET-39 | Yêu cầu `requested`; yêu cầu `received` | S1 duyệt đồng thời S2 từ chối (20 lần lặp); A1, A2 xác nhận hoàn tiền đồng thời; một thao tác bị 422 | Mỗi cặp: đúng 1 × 200, còn lại 409; trạng thái cuối khớp thao tác thắng; sự kiện, email, `payment_status` đúng 1 lần; thao tác 422 không để lại sự kiện / thay đổi. |
| AC-RET-40 | RET-40, AUD-01 | Một yêu cầu đi hết: M gửi, S duyệt, S nhận hàng, A hoàn tiền | Xem dòng thời gian đơn của M, của A; nhật ký hoạt động (lọc `targetType = order`) | Mỗi bước đúng 1 sự kiện; khách thấy "nine2fine" cho bước của nhân viên; admin thấy tên + vai trò; không số tài khoản / ghi chú nội bộ trong sự kiện; nhật ký hiện 3 dòng của nhân viên (duyệt, nhận hàng, hoàn tiền), **không** dòng gửi yêu cầu của khách. |
| AC-RET-41 | RET-41 | SMTP giả bắt thư; một lần SMTP lỗi | Chạy cả quy trình; làm SMTP lỗi ở bước duyệt | 4 thư (đã nhận, duyệt, từ chối, hoàn tiền) tới địa chỉ của đơn, tiêu đề như BR; hotline lấy từ cài đặt; không chứa số tài khoản đầy đủ; SMTP lỗi: trạng thái vẫn `approved`, thư được thử lại, `email_attempts` tăng, không thư trùng. |
| AC-RET-42 | RET-42 | `http`; A và S mở `/admin/returns` | Tab, tìm, đổi trang; mở dòng; thao tác từng nút; hai trình duyệt cùng thao tác | Tab / URL giữ bộ lọc; nút đúng trạng thái; từ chối / đóng bắt lý do; hoàn tiền hiện số tiền + số đầy đủ (A) + ô mã giao dịch + hộp xác nhận; 409: tải lại + thông báo "đã được xử lý bởi người khác"; mất mạng giữ hộp thoại. |
| AC-RET-43 | RET-43 | S, A | S mở chi tiết yêu cầu `received`; mở Cài đặt › Nhân viên; xem tab đơn | S không có nút / hộp "Xác nhận đã hoàn tiền", không có số đầy đủ, có dòng "Chỉ quản trị viên chuyển tiền"; ma trận quyền có "Duyệt, nhận hàng trả" (staff + admin) và "Xác nhận hoàn tiền" (admin); không có tab đơn `returns` cũ, không ô Won't. |
| AC-RET-44 (Should) | RET-44 | Yêu cầu `requested` từ 25 giờ trước; một yêu cầu 1 giờ trước | A xem danh sách, Tổng quan; danh sách đơn; duyệt kèm đơn vị / mã vận đơn; yêu cầu `received` | Chỉ yêu cầu 25 giờ có cờ "Quá hạn xử lý" (tính khi đọc); danh sách đơn có `returnPending` đúng 2 đơn; đơn vị / mã hiện cho khách; email "đã nhận hàng trả về" gửi ở `received`. |
| AC-RET-50 | RET-50 | 2 `requested`, 1 `approved`, 1 `received` | A và S xem Tổng quan; bấm từng số; đổi `range` | `requested` 2, `approved` 1, `received` 1, bằng số tab `/admin/returns`; bấm mở đúng tab; không đổi theo `range`; S vẫn không nhận trường tiền; không có `returnRate`, `deliveryFailed`. |
| AC-RET-51 | RET-51; INS-12, 13 | R1 (giao D−5) khoảng D−8..D, có thêm đơn S8 (O1..O9) | A xem Báo cáo: (a) trước trả hàng; (b) sau khi hoàn R1 L1 × 1; (c) sau khi hoàn toàn bộ R1 | (a) `revenue` gồm 1.200.000; (b) `partially_refunded`: doanh thu R1 = 1.200.000 − 450.000 = **750.000**, `units` R1 = 3 − 1 = 2, `completedOrders` vẫn đếm R1; (c) `refunded`: R1 **không** tính (0). Ở (b): Σ `byDay` = Σ `byCategory` = Σ `byPayment` = Σ `topProducts` = KPI `revenue` từng đồng; doanh thu thuộc ngày D−5 (không ngày hoàn); dòng có `units` và `revenue` = 0 không hiện; phí giao / phí gửi trả không nằm trong doanh thu; kỳ D−5 trong báo cáo cũ giảm tương ứng. |
| AC-RET-52 | RET-52 | Như AC-RET-51 (b) | A xem KPI Báo cáo | `refundedAmount` 450.000, `refundedUnits` 1, `returnedOrders` 1, kèm kỳ trước (null nếu kỳ trước không có đơn); (Should) `returnRate` = 1 / (2 + 1) = 0,3333; mẫu 0 → 0, không NaN. |
| AC-RET-53 | RET-53 | M chi tiêu năm 18.000.000 (đúng ngưỡng Silver) gồm R1 (1.200.000) | Ba lần chạy riêng: (a) R1 L1 × 1 lý do `not-fit` hoàn xong (tiền hàng 450.000, phí gửi trả 30.000); (b) R1 trả hết lý do `wrong-size` hoàn xong; (c) yêu cầu `rejected` hoặc `cancelled`; sau mỗi lần gọi hạng | (a) chi tiêu 17.550.000 (trừ đúng 450.000, **không** trừ phí gửi trả) → Bronze, `nextTierAt` 18.000.000; (b) chi tiêu giảm 1.200.000 (tiền hàng; phí giao 0) → 16.800.000; (c) 18.000.000, vẫn Silver. |
| AC-RET-54 | RET-54 | `http`; chính sách trả hàng, trợ giúp | Đọc `/policies/returns`, `/help` | Trợ giúp không còn "chịu toàn bộ phí gửi trả" mà nêu 30.000 ₫ khi lý do của khách (lấy từ `store-policy`); chính sách có "hết ngày thứ 30", mốc 24 giờ / 2 ngày / 1–3 ngày ghi "dự kiến"; mục "Cách gửi yêu cầu" đúng với hiện trạng (có / không "Tra cứu đơn hàng" tuỳ BR-RET-22). |
| AC-RET-55 | RET-55 | Đơn `to_receive` bị huỷ có `returning`; yêu cầu trả hàng | Xem tab `returning`; nhập tay điều chỉnh `return` ở Tồn kho; xem lịch sử tồn kho | Yêu cầu trả hàng **không** làm đơn vào `returning`; BR-ADM-26, 27 và test cũ giữ nguyên; điều chỉnh `return` nhập tay vẫn hợp lệ (delta > 0), hiển thị cùng định dạng với dòng từ trả hàng. |

### 6. Định nghĩa xong của Slice 9

- AC Must đạt (test BE / E2E ghi mã AC), AC Should (AC-RET-22, 44; phần Should của AC-RET-52) ghi làm hay hoãn.
- `openapi.yaml` có tag cho trả hàng của khách, trả hàng admin, tải ảnh trả hàng (locked trước khi FE nối); migration chỉ cộng thêm; `decisions.md`, `handoff.md` cập nhật.
- Ở `returnsMode: http` hai màn (khách, admin) không dùng mock và không còn ô Won't; Playwright mock pass nguyên.
- Tiền / kho / trạng thái nhất quán: hoàn tiền và nhập kho **đúng một lần** dưới đua x20 (AC-RET-36, 39), số tiền theo một công thức (AC-RET-21, 30), `payment_status` chỉ đổi ở `refunded` (AC-RET-38).
- Dữ liệu nhạy cảm: số tài khoản không có trong phản hồi cho khách / staff, email, sự kiện, nhật ký, log; xoá khi trạng thái cuối (AC-RET-17); ảnh không công khai (AC-RET-15).
- Số liệu: doanh thu thuần và các khối vẫn khớp (AC-RET-51 + AC-INS-13), hạng thành viên theo chính sách công bố (AC-RET-53), chữ chính sách / trợ giúp khớp hành vi (AC-RET-54).
- Cần cập nhật tài liệu cũ: AC-INS-07 (`/admin/returns` không còn "Chưa khả dụng" ở HTTP), BR-INS-09 (theo BR-RET-51), BR-DSH-07 (`returnRequests` có dữ liệu), K5 Slice 5 và S5-Q5 (trả hàng không còn Won't; địa chỉ trả `isReturn` vẫn Won't).
- Lát nghiệm thu thật trên Supabase (9.8) cần Thắng duyệt áp migration và chạy thử một yêu cầu trả hàng thật (nhận email, nhập kho, hoàn tiền).

### 7. Câu hỏi mở

Mặc định PO (Thắng đang vắng), làm trước theo mặc định; Thắng đổi được khi quay lại bằng cách trả lời. Không câu nào chặn lát 9.1–9.7; chỉ lát 9.8 cần Thắng duyệt áp migration và kiểm quy trình thật.

| # | Câu hỏi | Ảnh hưởng | Mặc định PO | Trạng thái |
| --- | --- | --- | --- | --- |
| S9-Q1 | Ai được yêu cầu trả hàng? | BR-RET-01, 22 | Thành viên với đơn của mình (Must); khách vãng lai qua tra cứu mã đơn + email + OTP (Should, lát 9.6, dùng lại grant như huỷ đơn). Nếu cắt: chính sách giữ "gọi hotline / gửi email". Nhân viên tạo hộ: Won't. | Mặc định PO |
| S9-Q2 | Cửa sổ thời gian | BR-RET-10 | 30 ngày, tính đến hết 23:59:59 giờ VN của ngày thứ 30 kể từ ngày giao (`delivered_at`); hằng số, không sửa ở Cài đặt; đơn thiếu `delivered_at` không trả được. | Mặc định PO |
| S9-Q3 | Trả một phần, lý do, phí gửi trả | BR-RET-11, 12, 30 | Một phần theo dòng và số lượng (Must); 6 lý do như FE (không "khác", không "không như mô tả"); lỗi shop: miễn phí gửi trả, hoàn phí giao nếu trả toàn bộ đơn; lỗi khách: trừ 30.000. | Mặc định PO |
| S9-Q4 | Ảnh minh chứng | BR-RET-14, 15 | Lỗi shop bắt buộc ≥ 1; ≤ 5 ảnh, ≤ 5 MB, JPEG / PNG / WebP, cạnh ngắn ≥ 200 px; riêng tư (không URL công khai); không tự xoá theo lịch. Hạ tầng: Thắng xác nhận nơi lưu không công khai khi áp 9.8 (rủi ro R4). | Mặc định PO |
| S9-Q5 | Tài khoản nhận hoàn | BR-RET-16, 17 | COD bắt buộc (ngân hàng, 6–19 chữ số, chủ tài khoản); che 4 số cuối với khách / staff; admin xem đủ ở `received`; xoá số đầy đủ khi trạng thái cuối; không vào email / nhật ký / log. Chuyển khoản: không thu. | Mặc định PO |
| S9-Q6 | Máy trạng thái và đóng yêu cầu | BR-RET-08, 34 | 6 trạng thái; khách chỉ huỷ ở `requested`; nhân viên đóng được ở `approved` (khách không gửi hàng) bằng "từ chối" kèm lý do; không hết hạn tự động (không tác vụ nền). | Mặc định PO |
| S9-Q7 | Quyền staff / admin | BR-RET-02, 37, 43 | Staff: xem, duyệt, từ chối, nhận hàng (`returns.process` sẵn có). Chỉ admin: xác nhận đã hoàn tiền + xem số tài khoản đầy đủ (quyền mới `returns.refund`). Cho staff hoàn tiền = cấp `returns.refund` cho staff + sửa BR-RET-02, 17. | Mặc định PO (Thắng đổi được) |
| S9-Q8 | Doanh thu / báo cáo / hạng | BR-RET-51..53 | Doanh thu thuần: trừ tiền hàng đã hoàn khỏi **ngày bán gốc** (không phải ngày hoàn), `partially_refunded` vẫn tính phần còn lại, `refunded` loại hẳn; Báo cáo thêm `refundedAmount`, `refundedUnits`, `returnedOrders`; hạng thành viên trừ tiền hàng + phí giao đã hoàn (không trừ phí gửi trả). Phương án thay thế (trừ vào ngày hoàn) làm các khối khó khớp nhau và đổi số hôm nay vì đơn cũ: Won't lần này. Hệ quả: báo cáo kỳ cũ có thể giảm sau khi hoàn. | Mặc định PO |
| S9-Q9 | Hoàn tiền thủ công | BR-RET-35, 37 | Không cổng thanh toán; số tiền do máy chủ chốt lúc nhận hàng, admin chỉ xác nhận đã chuyển kèm mã giao dịch; không sửa tay số tiền, không hoàn nhiều đợt. Chênh lệch thực tế xử lý bằng kiểm từng dòng (số lượng đạt). | Mặc định PO |
| S9-Q10 | Số yêu cầu mỗi đơn, đồng thời | BR-RET-09, 18, 39 | 1 yêu cầu không-`cancelled` mỗi đơn (ràng buộc DB); huỷ rồi tạo lại được; bị từ chối / đã hoàn thì không tạo lại (gọi hotline); `Idempotency-Key` bắt buộc ở tạo; chuyển trạng thái so-sánh-rồi-đổi. | Mặc định PO |
| S9-Q11 | Email | BR-RET-41, 44 | Must: đã nhận yêu cầu, được duyệt, bị từ chối, đã hoàn tiền (tiêu đề đề xuất ở BR); Should: đã nhận hàng trả về. Chữ do PO soạn, Thắng sửa khi đọc thư thật. Không email khi khách tự huỷ. | Mặc định PO |
| S9-Q12 | Mốc thời gian cam kết với khách | BR-RET-44, 54 | "Xác nhận ≤ 24 giờ làm việc", "kiểm hàng ≤ 2 ngày làm việc", "hoàn 1–3 ngày làm việc" là mục tiêu hiển thị ("dự kiến"), hệ thống không ép; có cờ "Quá hạn xử lý" ở mức Should. | Mặc định PO |
| S9-Q13 | Nhánh chuyển khoản | D11; BR-RET-16 | Xây và kiểm bằng dữ liệu seed dù `bank_transfer_enabled = false`; hoàn về tài khoản đã thanh toán, admin xác nhận bằng mã giao dịch. | Mặc định PO |
| S9-Q14 | Trường FE không có dữ liệu | BR-RET-04, 43 | `returnRate` ở Tổng quan, `returnCount` ở khách hàng, tab đơn `returns` mock, `ReturnCompletionInput.refundAmount`, địa chỉ trả `isReturn`, `order.returnDays` theo đơn: Won't, ẩn / bỏ ở HTTP. | Mặc định PO |

### 8. Khác biệt FE mock và DB / API thật

| Trường / hành vi FE mock | Thực tế DB / API | Xử lý ở HTTP |
| --- | --- | --- |
| `Order.status` = `return-requested` / `returned` | `order_status` giữ `completed`; trạng thái nằm ở yêu cầu | FE suy nhãn từ `return` (BR-RET-23); bỏ hai giá trị khỏi trạng thái đơn HTTP |
| `ReturnRequest.decision` {`approved` / `rejected`, `decidedAt`, `note`} | 6 trạng thái + từng mốc thời gian + người xử lý | FE đọc `state`; `decision` suy ra từ `state` / `note` |
| `ReturnSummary.state` `pending` / `approved` / `rejected` / `completed` | `requested` / `approved` / `received` / `refunded` / `rejected` / `cancelled`; bộ lọc `closed` | Tab mới: Tất cả, Chờ duyệt, Chờ nhận hàng, Chờ hoàn tiền, Đã hoàn tiền, Đã đóng |
| `ReturnCompletionInput` {`refundAmount`, `restock`} | Tách thành nhận hàng (từng dòng: số lượng đạt + `restock` / `writeoff`) và xác nhận hoàn tiền (`amount` chốt + mã giao dịch) | Bỏ ô nhập tiền tay và cờ `restock` chung |
| `estimateRefund` (chia voucher theo `subtotal`) | Theo `line_discount` (BR-RET-30) | FE dùng số từ máy chủ hoặc công thức mới; có thể lệch vài đồng so mock cũ |
| `ReturnRequest.refundAccount` số đầy đủ | Chỉ ngân hàng + 4 số cuối + tên; số đầy đủ xoá khi cuối | Form vẫn gửi số đầy đủ; mọi màn hiện bản che |
| `photoCount` / `photos[].url`, `thumbUrl` | Ảnh riêng tư, có quyền; `width`, `height` từ `media_assets` | FE bỏ `photoCount`; dùng URL máy chủ trả (kiểm quyền) |
| `Order.returnDays` theo đơn; `canRequestReturn` bằng `Date.now()` | Hằng số 30; `canReturn` + `returnDeadline` do máy chủ tính | Bỏ `returnDays` ở HTTP; không tính hạn ở máy khách |
| `OrderRefund` {`amount`, `destination`, `reason`, `expectedBy`, `refundedAt`} | `refundedAmount`, hình thức che, dự kiến (≤ 3 ngày làm việc sau `received`), `refunded_at` | Ánh xạ từ yêu cầu `refunded` |
| `dashboard.todo.returnRequests` / `returnRate`; `customer.returnCount`; `returnPending` | `returnRequests` = số `requested` (+ `approved`, `received`); `returnRate`, `returnCount` không có; `returnPending` (Should) | Ẩn `returnRate`, `returnCount`; `returnPending` chỉ khi làm BR-RET-44 |
| Ma trận quyền chỉ `returns.process` | Thêm `returns.refund` (admin) | Cập nhật `permissions.ts`, ma trận ở Cài đặt › Nhân viên |
| Nhóm "Đổi trả" ở Cài đặt (`returnDays`, phí gửi trả) | Hằng số trong `store-policy`, không có cột | Vẫn ẩn (BR-SET-12); không sửa được lần này |
| Tab đơn `returns` (`return-requested` / `returned`) | Không có ở `order_status`; hàng hoàn Slice 4 là `returning` | Ẩn ở HTTP; xem trả hàng ở `/admin/returns` |

---

## Slice 10: Gói P1 (trả hàng vãng lai, đánh giá, wishlist, gợi ý, Moment, khuyến mãi, nội dung)

Nguồn: master plan mục 0, 8.3 (Shop by Moment), 8.8 (Reviews), 13 (Wishlist), 32 (Moment), 52 (P1); Slice 1 (BR-AUTH-32), Slice 2 (BR-CAT-16, 17, 18; `ids`), Slice 3 (voucher, `line_discount`, `excludeSaleItems`), Slice 4 (BR-ADM-23, 29 grant vãng lai), Slice 6 (sản phẩm, `compareAtPrice`, ảnh `media_assets`, quyền), Slice 8 (nhóm Đổi trả), Slice 9 (BR-RET-22, 44, 54(d), lát 9.6 hoãn). Thắng giao 2026-11-13: gom 7 hạng mục P1 vào MỘT đợt; Thắng đang vắng, mọi câu hỏi mở chốt theo mặc định PO (mục 7). Mã BR: `BR-P1` (nền chung), `BR-RET-60..66` (A), `BR-REV` (B), `BR-WISH` (C), `BR-REC` (D), `BR-MOM` (E), `BR-PROMO` (F), `BR-CMS` (G); AC cùng tiền tố `AC-`. Tên endpoint, bảng, cột, mã lỗi do Backend chốt trong `openapi.yaml`; PRD chỉ nêu dữ liệu và hành vi. Tiền là số nguyên đồng; múi giờ Asia/Ho_Chi_Minh (GMT+7); thời điểm API là ISO 8601 UTC. Không đổi hàng, không ML, không thanh toán mới.

Hiện trạng đã đọc (quyết định phạm vi bám các điểm này):
- **Trả hàng vãng lai (A):** 9.2 đã làm cho thành viên; đơn do vãng lai xem (OTP) hiện trả `canReturn = false`, không có khối `return`. Đã có sẵn từ 9.3/9.4: cờ `overdue` ("Quá hạn xử lý"), thông tin lấy hàng (đơn vị, mã vận đơn), email "đã nhận hàng trả về", KPI `returnRate`. Còn thiếu: 5 operation vãng lai, `AdminOrderSummary.returnPending`, chữ chính sách. `order_access_grants` (token băm, theo đơn) có sẵn.
- **Đánh giá (B):** BE chưa có bảng; `GET /products/{id}/reviews` luôn `200 []` (BR-CAT-17); FE có `review-form` (sao, fit, size, chiều cao, tiêu đề ≤ 80, nội dung ≥ 20 / ≤ 1000), `product-reviews`, trang admin `reviews` (xem, trả lời, ẩn) chạy mock; `ProductReview.sample` chỉ là dữ liệu mẫu.
- **Wishlist (C):** chỉ ở `localStorage` (`n2f.wishlist.v1`), bắt đăng nhập (quyết định 2026-10-11); BE chỉ có lọc `ids` ≤ 48 (BR-CAT-16).
- **Gợi ý (D):** PDP "Có thể bạn cũng thích" = FE gọi danh sách theo `moment` đầu tiên, `limit` 5; giỏ = bán chạy chưa có trong giỏ, 4 thẻ. Cột `sales_rank` có ở `products`.
- **Moment (E):** `product_moment` (`work`, `dinner`, `event`, `weekend`) và lọc `moment` **đã chạy thật** ở catalog (BE + FE). Phần còn fixture: thẻ Moment ở trang chủ (chữ, ảnh) và `LandingContent` đến từ `MockHomeContentApi` (`apiConfig.mode = 'mock'`); `GET /api/content/home` mới là đề xuất FE, BE chưa có.
- **Khuyến mãi (F):** voucher `percent` / `fixed` / `free_shipping` + điều kiện + admin CRUD đã xong (Slice 3, 6). **Câu hỏi "voucher free-ship" đã chốt từ 2026-11-07 (Thắng: giữ) và đã chạy; không làm lại.** Sản phẩm có `price` + `compare_at_price` nhập tay (giá gạch), chưa có giá giảm theo hạn; `excludeSaleItems` coi "đang giảm" = `compare_at_price` > `price`.
- **Nội dung (G):** trang admin `collections`, `size-chart`, `home-content`, `reviews` chạy mock, ở HTTP là "Chưa khả dụng" (AC-INS-07). BE có `size_charts` (theo danh mục, JSON, chỉ đọc, `max-age=3600`). **Không có bảng bộ sưu tập, không có trang bộ sưu tập ở storefront** (chỉ admin mock); `product-form` ẩn ô bộ sưu tập ở HTTP.

### 1. Vấn đề và mục tiêu

**Vấn đề.** Bảy khu còn mock hoặc hoãn: khách vãng lai không tự trả hàng được; không có bằng chứng xã hội thật; yêu thích mất khi đổi máy; gợi ý chỉ là danh sách thô; trang chủ phụ thuộc fixture nên không sửa được nội dung thật; không có cách khuyến mãi theo thời hạn ngoài voucher; bảng size và nội dung không chỉnh được mà không sửa mã.

**Mục tiêu.** (1) Khách vãng lai trả hàng cùng quy tắc với thành viên qua Tra cứu đơn. (2) Người đã nhận hàng viết đúng một đánh giá cho mỗi sản phẩm; shop kiểm duyệt sau; điểm trung bình đúng từng review đang hiển thị. (3) Yêu thích đồng bộ theo tài khoản, gộp an toàn khi đăng nhập, không hồi sinh mục đã xoá. (4) Gợi ý do quy tắc xác định, cùng đầu vào cho cùng đầu ra. (5) Trang chủ, thẻ Moment, bảng size đọc từ DB và admin sửa được, có kiểm giá trị. (6) Khuyến mãi theo thời hạn không làm lệch giá giữa danh sách, giỏ, checkout, đơn. (7) Mỗi khu bật / tắt riêng bằng cờ FE, migration chỉ cộng thêm.

**Không phải mục tiêu.** Đổi hàng; ảnh / video / bình chọn "hữu ích" cho đánh giá; thư mời đánh giá tự động; Moment mới do admin tạo; cá nhân hoá, "xem gần đây", học máy, theo dõi click; nháp / lịch đăng nội dung; mua X tặng Y, flash sale đếm ngược, mã tự áp; giá theo biến thể; UGC mạng xã hội; GSAP (chỉ FE).

### 2. Phạm vi

| Hạng mục | Mức | Lý do |
| --- | --- | --- |
| Nền: migration cộng thêm, 5 cờ FE riêng, quyền mới, mã lỗi, giới hạn tần suất | Must | Mỗi khu phát hành / hoàn tác độc lập (mẫu `returnsMode`). |
| A. Vãng lai gửi / xem / huỷ yêu cầu trả hàng qua OTP, chữ chính sách | Must | Chính sách hiện bắt khách vãng lai gọi hotline; đóng nợ hoãn của 9.6. |
| A. `returnPending` ở danh sách đơn; nhãn nguồn "Khách vãng lai" ở admin | Should | Tiện, không chặn vận hành (cờ quá hạn, email, `returnRate` đã có). |
| B. Gửi đánh giá (đã nhận hàng, 1 lần), hiển thị, điểm trung bình, admin ẩn / hiện / trả lời | Must | Đủ để tin cậy và kiểm soát nội dung; bỏ BR-CAT-17 cho khu này. |
| B. Lọc đánh giá theo sao; "Viết đánh giá" từ chi tiết đơn | Should | Thêm lối vào, không chặn. |
| B. Sửa / xoá đánh giá của khách, ảnh, bình chọn hữu ích, thư mời, duyệt trước khi hiện | Won't | Tốn công, lượng đánh giá thấp; hậu kiểm là đủ. |
| C. Đồng bộ wishlist theo tài khoản, gộp khi đăng nhập, tối đa 100 mục | Must | Bỏ mất dữ liệu khi đổi máy. |
| C. Thống kê "được yêu thích" cho admin; chia sẻ wishlist | Won't | Không có nhu cầu vận hành. |
| D. Gợi ý PDP và giỏ theo quy tắc cùng danh mục / Moment / bán chạy, một hàm dùng chung | Must | Thay logic FE thô bằng quy tắc kiểm được. |
| D. Gợi ý "cùng bộ sưu tập", "mua cùng" (≥ 3 đơn) | Should | "Mua cùng" tốn truy vấn đơn; bộ sưu tập chưa có dữ liệu. |
| E. Thẻ Moment trang chủ từ DB (chữ, ảnh, số sản phẩm thật, ẩn khi 0 sản phẩm) | Must | Phần còn lại của Moment đã thật; đi cùng G. |
| E. Thêm / xoá / đổi tên Moment | Won't | Moment là enum cố định; đổi cần migration. |
| F. Giá khuyến mãi có hạn theo sản phẩm (giá hiệu lực một hàm), admin sửa, nhãn "-X%" | Must | Khuyến mãi theo thời gian thực tế; voucher đã có. |
| F. Giảm hàng loạt theo danh mục (xem trước); lọc `sale=true`; nhãn "đến dd/MM" | Should | Tiện, có thể thay bằng sửa từng sản phẩm. |
| F. Mua X tặng Y, bậc số lượng, flash sale, mã tự áp, ví voucher, nhiều đợt / sản phẩm, giá theo biến thể | Won't | Không có dữ liệu / ngoài phạm vi; giữ giá nhất quán. |
| G. Trang chủ: `GET /content/home` công khai + admin sửa khối (kiểm giá trị, chống ghi chồng) | Must | Hiện trang chủ chạy fixture; không sửa được nội dung thật. |
| G. Bảng size: admin sửa theo danh mục; storefront đọc bản mới ≤ 60 giây | Must | Bảng size ảnh hưởng đổi trả. |
| G. Bộ sưu tập (CRUD + trang `/collections/:slug`); "Khôi phục mặc định" trang chủ | Should | Storefront chưa có trang bộ sưu tập; cắt không ảnh hưởng vận hành. |
| G. Nháp / xem trước / lịch đăng; nhật ký đổi nội dung hợp nhất | Won't | Bản lưu = bản công khai; chỉ ghi "cập nhật bởi / lúc". |

### 3. Hiện trạng và hành vi được chọn

| # | Điểm | Chọn | Lý do |
| --- | --- | --- | --- |
| D1 | Cờ FE | 5 cờ mới: `reviewsMode`, `wishlistMode`, `recommendationsMode`, `contentMode` (trang chủ + Moment + bảng size + bộ sưu tập, cả storefront và admin), `promotionsMode` (giá khuyến mãi ở admin; storefront đọc giá qua catalog). A dùng `returnsMode` sẵn có, máy chủ quyết định `canReturn`. `http` ở bản thường; e2e chọn bằng `localStorage['n2f.e2e.<tên>']` | Mỗi khu bật / tắt riêng; sai một khu không kéo khu khác. |
| D2 | Đánh giá và BR-CAT-17 | Khi `reviewsMode = http`, BR-CAT-17 thôi áp cho đánh giá (đọc, điểm sao, form); "Báo khi có hàng" vẫn ẩn | Cờ riêng thay quyết định "ẩn tạm". |
| D3 | Danh tính người đánh giá | Hiển thị "Họ + chữ cái đầu của tên" (ví dụ "Nguyễn V."); không email / SĐT / id | Riêng tư; vẫn nhận ra là người thật. |
| D4 | Giá hiệu lực | Một hàm `giá hiệu lực(T)`: trong đợt giảm = `sale_price`, ngoài đợt = `price`; tính khi đọc bằng giờ máy chủ, không tác vụ nền; đơn lưu giá hiệu lực lúc đặt | Hết hạn đúng giờ không cần job; đơn cũ không đổi. |
| D5 | Gộp wishlist | Máy chủ là nguồn sự thật; chỉ gộp các mục thêm khi chưa đồng bộ (khách / offline), không gộp cả bản local cũ | Tránh hồi sinh mục đã xoá ở thiết bị khác. |
| D6 | Bộ sưu tập | Should: BE + FE chỉ làm khi hai lát còn lại xong | Chưa có nơi hiển thị ở storefront. |
| D7 | Nội dung trang chủ | Một bản ghi duy nhất (khối có thứ tự, `enabled`), seed từ fixture hiện tại, không đè bản admin đã sửa | Idempotent như seed catalog. |

### 4. Business Rules

**Nền chung**

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-P1-01 | Must | Migration chỉ cộng thêm (không `DROP` / `TRUNCATE` / đổi kiểu): bảng đánh giá (duy nhất theo tài khoản + sản phẩm), mục yêu thích (khoá chính tài khoản + sản phẩm), nội dung trang chủ (một dòng), bộ sưu tập + sản phẩm trong bộ sưu tập, cột giá giảm + thời điểm đầu / cuối đợt ở sản phẩm (CHECK nhất quán), cột nguồn / grant cho ảnh trả hàng vãng lai; bảng mới bật RLS. `migrate deploy` 2 lần: lần 2 không có gì; số dòng `products`, `orders`, `order_items`, `users`, `vouchers`, `order_returns` không đổi. |
| BR-P1-02 | Must | Cờ FE theo D1. `mock`: hành vi cũ, Playwright mock pass nguyên. `http`: khu đó gọi API thật, không đọc / ghi mock, ẩn mọi ô Won't. Tắt một cờ (đặt `mock` hoặc ẩn) không làm lỗi khu khác. |
| BR-P1-03 | Must | Quyền (kiểm ở máy chủ, đọc lại vai trò mỗi yêu cầu, thiếu quyền → 403 `forbidden`, dữ liệu không đổi): `reviews.moderate` staff + admin; `content.edit` chỉ admin (staff xem được nội dung nhưng không sửa); giá khuyến mãi dùng `promotions.edit` sẵn có (chỉ admin). Thêm dòng vào ma trận quyền ở Cài đặt › Nhân viên. |
| BR-P1-04 | Must | Mã lỗi ổn định, FE map theo `code`: dùng lại `unauthenticated`, `forbidden`, `not-found`, `validation` (+`fieldErrors`), `version-conflict`, `rate-limited` (+`retryAfterSeconds`); thêm `not-eligible` 409, `already-reviewed` 409, `wishlist-full` 409. Không stack trace / SQL. |
| BR-P1-05 | Must | Giới hạn tần suất (vượt → 429 `rate-limited`): gửi đánh giá 5 / giờ / tài khoản; ghi wishlist 60 / phút / tài khoản; admin ghi dùng bộ đếm sẵn có (60 / 60 giây); đọc công khai dùng 120 / 60 giây / IP của catalog. |

**A. Trả hàng cho khách vãng lai (BR-RET-60..66)**

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-RET-60 | Must | Khách vãng lai đã qua Tra cứu đơn (mã đơn + email + OTP, có `order_access_grants` còn hạn) gửi / xem / huỷ yêu cầu **chỉ cho đơn của grant đó**. Grant hết hạn hoặc thiếu → 401 `unauthenticated`; đơn khác hoặc đơn thuộc tài khoản thành viên → 404 `not-found`. Thời hạn grant giữ như hiện có (không đổi). |
| BR-RET-61 | Must | Áp đúng BR-RET-09..21 và 30 (điều kiện đơn + hạn 30 ngày hết 23:59:59 giờ VN, dòng / số lượng, 6 lý do, mô tả, ảnh, tài khoản nhận hoàn COD, `Idempotency-Key`, huỷ khi `requested`, một yêu cầu không-`cancelled` mỗi đơn, công thức tiền). Chi tiết đơn vãng lai trả `canReturn`, `returnDeadline`, `return` (thay `canReturn = false` hiện tại). |
| BR-RET-62 | Must | Ảnh vãng lai: tải 30 / giờ / grant và 60 / giờ / IP; gắn vào yêu cầu phải do **chính grant đó** tải trong 24 giờ qua và chưa gắn; ảnh chỉ xem được bằng grant đó hoặc staff / admin, mỗi lần kiểm quyền, không đoán được từ id; cùng quy tắc định dạng / dung lượng / gỡ metadata BR-RET-14, 15. |
| BR-RET-63 | Must | Tạo yêu cầu vãng lai: 5 / giờ / grant và 10 / giờ / IP (chặt hơn thành viên vì không có định danh). Sự kiện đơn ghi người = khách (không tên). Thư gửi tới email của đơn theo BR-RET-41, **không** chứa mã tra cứu, OTP hay số tài khoản đầy đủ. |
| BR-RET-64 | Must | Số tài khoản nhận hoàn, che 4 số cuối, xoá ở trạng thái cuối, chỉ admin xem đủ ở `received`: giữ nguyên BR-RET-17 cho yêu cầu vãng lai; không có đường nào trả số đầy đủ cho vãng lai. |
| BR-RET-65 | Should | `AdminOrderSummary.returnPending` = đơn có yêu cầu `requested`; danh sách / chi tiết admin hiện nhãn nguồn "Khách vãng lai" hoặc "Thành viên". Nhãn "Quá hạn xử lý", email "đã nhận hàng trả về", `returnRate` (BR-RET-44, 52) đã có: chỉ kiểm lại, không làm mới. |
| BR-RET-66 | Must | Chữ chính sách trả hàng / trợ giúp mục "Cách gửi yêu cầu" thêm "hoặc Tra cứu đơn hàng" khi A phát hành; vẫn giữ hotline cho đơn quá hạn / lỗi. |

**B. Đánh giá sản phẩm (BR-REV)**

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-REV-01 | Must | Đủ điều kiện đánh giá sản phẩm X khi tài khoản có ≥ 1 đơn `completed` có `delivered_at` trong **365 ngày** qua chứa X **và** không phải trường hợp mọi số lượng X của các đơn đó đã hoàn (yêu cầu trả hàng `refunded` hết dòng X). Chưa mua, mua chưa nhận (`to_receive`), đơn huỷ, quá 365 ngày, đã trả hết: không đủ (409 `not-eligible`). Khách vãng lai không đánh giá (Won't). |
| BR-REV-02 | Must | `GET` đủ điều kiện (cần cookie): `status` ∈ `sign-in` (không phiên; vẫn 200), `not-purchased`, `reviewed`, `eligible` (+`sizeBought`). `sizeBought` do máy chủ lấy từ đơn đủ điều kiện **mới giao nhất**; FE không quyết định. |
| BR-REV-03 | Must | Dữ liệu gửi (NFC, cắt khoảng trắng hai đầu, không ký tự điều khiển ngoài xuống dòng): `rating` nguyên 1–5; `fit` ∈ {-1, 0, 1}; `height` tuỳ chọn ≤ 20 ký tự; `title` 2–80 ký tự, có ≥ 1 ký tự không phải khoảng trắng; `body` 20–1000 ký tự. Sai → 422 `fieldErrors` theo trường, trả đủ mọi lỗi một lần. `sizeBought`, tác giả, ngày, `verified` do máy chủ đặt (bỏ qua nếu FE gửi). |
| BR-REV-04 | Must | Mỗi (tài khoản, sản phẩm) **một** đánh giá, ràng buộc ở DB. Gửi lần hai → 409 `already-reviewed`; 10 yêu cầu đồng thời: đúng 1 thành công. Hiện ngay sau khi gửi (hậu kiểm). Khách không sửa / xoá được (Won't). |
| BR-REV-05 | Must | Danh sách công khai `GET /products/{id}/reviews`: chỉ đánh giá `visible` của sản phẩm `ACTIVE`, mới nhất trước, `limit` mặc định 10 (≤ 20), phân trang; mỗi mục: `rating`, `fit`, `sizeBought`, `height`, `title`, `body`, `date` (ngày VN), `author` (D3), `verified = true`, `reply` (nếu có). Không `sample`. Công khai, không cần cookie, `public, max-age=10`. |
| BR-REV-06 | Must | Điểm trung bình: sản phẩm có `rating = {average, count}` (PDP, thẻ PLP) chỉ tính đánh giá `visible`; `average` = Σ sao / `count` làm tròn **1 chữ số thập phân half-up**; `count` = 0 thì không có `rating` (FE ẩn sao). Phản ánh ẩn / hiện / gửi mới trong ≤ 30 giây (BR-CAT-11). |
| BR-REV-07 | Must | Kiểm duyệt (`reviews.moderate`): danh sách admin lọc `view` ∈ tất cả / chưa trả lời / sao thấp (≤ 2) / đã ẩn, lọc `rating` 1–5, `limit` 20 / 50, phân trang, số đếm mỗi tab. Ẩn (lý do bắt buộc 5–250 ký tự) và hiện lại; trả lời công khai 5–500 ký tự (sửa / xoá được); ghi người + thời điểm; `updatedAt` chống ghi chồng → 409 `version-conflict`. Đánh giá ẩn không hiện công khai và không vào điểm trung bình. Sản phẩm không `ACTIVE`: ẩn khỏi công khai nhưng giữ dữ liệu. |
| BR-REV-08 | Must | FE `reviewsMode = http`: PDP hiện đánh giá thật, không nhãn "mẫu"; form chỉ khi `eligible`; theo `status` hiện "Đăng nhập để đánh giá" / "Chỉ người đã nhận hàng mới đánh giá" / "Bạn đã đánh giá"; nút Gửi khoá khi đang gửi; 422 gắn đúng ô; mất mạng / 5xx giữ nguyên nội dung nhập; 409 `already-reviewed` / `not-eligible` có câu riêng; thành công hiện đánh giá của mình ngay. |
| BR-REV-09 | Should | Lọc công khai theo sao (`rating` 1–5); trong chi tiết đơn `completed` mỗi dòng đủ điều kiện có liên kết "Viết đánh giá". |

**C. Wishlist (BR-WISH)**

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-WISH-01 | Must | API wishlist chỉ nhận phiên `n2f_sid`; không phiên → 401, `no-store`. Dữ liệu riêng tư theo tài khoản; admin không xem (Won't). Khách chưa đăng nhập giữ BR-AUTH-32 (bấm tim → đăng nhập → quay lại → sản phẩm được lưu). |
| BR-WISH-02 | Must | Lưu theo **sản phẩm** (không theo biến thể), tối đa **100** mục `ACTIVE` mỗi tài khoản; thêm mục 101 → 409 `wishlist-full`. Thêm mục đã có → 200 không đổi; xoá mục không có → 204; id không tồn tại hoặc không `ACTIVE` → 404 `not-found` (xoá mục của sản phẩm vừa bị ẩn vẫn 204). |
| BR-WISH-03 | Must | Đọc: danh sách id sản phẩm `ACTIVE`, mới thêm trước, kèm `addedAt`; mục của sản phẩm đã ẩn giữ trong DB nhưng không trả và không tính vào 100, trở lại nếu sản phẩm công khai lại. FE lấy thẻ bằng lọc `ids` (≤ 48 mỗi lượt, BR-CAT-16). |
| BR-WISH-04 | Must | Gộp khi đăng nhập / đăng ký: FE gửi các id **chưa đồng bộ** (≤ 100 id; > 100 → 422); máy chủ hợp với mục đã có, bỏ id không hợp lệ, thêm theo thứ tự gửi tới khi đủ 100, trả danh sách cuối + `skipped` (số id bị bỏ vì không hợp lệ hoặc vượt 100). Idempotent (gọi lại không nhân đôi). Lỗi mạng: giữ nguyên danh sách chưa đồng bộ trên thiết bị và thử lại lần mở trang sau (BR-AUTH-32: không mất mục chờ). |
| BR-WISH-05 | Must | Sau khi đã đồng bộ, máy chủ là nguồn sự thật: bản trên thiết bị chỉ là cache, không gửi lên lại; mục xoá ở thiết bị A không quay lại khi thiết bị B (cache cũ) đăng nhập. Thiết bị khác thấy thay đổi khi tải lại trang (không thời gian thực). Đăng xuất chủ động xoá cache wishlist của thiết bị; hết phiên thì giữ, đăng nhập lại cùng tài khoản không nhân đôi. |
| BR-WISH-06 | Must | FE `wishlistMode = http`: tim đổi ngay (lạc quan), lỗi thì hoàn lại + thông báo; 409 `wishlist-full` có câu riêng ("Danh sách yêu thích đã đủ 100 sản phẩm"); 429 nêu số giây; mất mạng thì giữ ở danh sách chưa đồng bộ. Trang Yêu thích chia `ids` ≤ 48 mỗi request. |

**D. Gợi ý sản phẩm (BR-REC)**

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-REC-01 | Must | Gợi ý cho một sản phẩm X do **một hàm xác định**: loại X, loại sản phẩm không `ACTIVE`, loại sản phẩm hết hàng ở mọi biến thể; lấy lần lượt đến đủ `limit` (mặc định 4, ≤ 8), không trùng: (1) cùng danh mục **và** ≥ 1 Moment chung, xếp số Moment chung giảm; (2) cùng danh mục còn lại; (3) cùng Moment khác danh mục; (4) bán chạy toàn shop. Trong mỗi bước xếp `sales_rank` tăng, rồi `slug`. Cùng dữ liệu + cùng tham số → cùng kết quả và thứ tự. |
| BR-REC-02 | Must | Gợi ý cho giỏ (≤ 10 sản phẩm): mỗi sản phẩm trong giỏ sinh danh sách BR-REC-01 (8 mục); điểm = số danh sách chứa sản phẩm đó; xếp điểm giảm, rồi `sales_rank` tăng, rồi `slug`; loại mọi sản phẩm đang trong giỏ; `limit` mặc định 4. Cùng một endpoint công khai với PDP (đầu vào: một hoặc nhiều id / slug). Giỏ rỗng → bán chạy. |
| BR-REC-03 | Must | Kết quả ít hơn `limit` thì trả ít hơn (không bù sản phẩm sai điều kiện); rỗng thì FE ẩn cả khối (không tiêu đề trống). Phần tử gợi ý dùng cùng DTO thẻ sản phẩm của catalog (giá hiệu lực, nhãn). `Cache-Control: public, max-age=30`; đầu vào > 10 id → 422; id lạ bị bỏ qua. |
| BR-REC-04 | Must | FE `recommendationsMode = http`: PDP và giỏ gọi endpoint này thay logic FE; lỗi / mất mạng thì ẩn khối, không chặn trang; không dùng dữ liệu người dùng (cùng kết quả cho khách và thành viên). |
| BR-REC-05 | Should | Thêm bước 0 "mua cùng": sản phẩm có ≥ **3** đơn `completed` chung với X trong 365 ngày, xếp số đơn chung giảm; thêm bước "cùng bộ sưu tập" trước bước (1) khi có bộ sưu tập (BR-CMS-07). |

**E. Shop by Moment (BR-MOM)**

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-MOM-01 | Must | Có đúng 4 Moment cố định: `work`, `dinner`, `event`, `weekend` (thứ tự này); admin gán 1–4 Moment cho sản phẩm (đã có, Slice 6); không thêm / xoá / đổi mã (Won't). Moment lạ ở lọc → danh sách rỗng, không lỗi (hành vi catalog hiện có). |
| BR-MOM-02 | Must | `GET /content/home` trả `moments[]`: `moment`, `label`, `lines` (≤ 2 dòng, mỗi dòng ≤ 60 ký tự), `mediaId`, `href` (`/shop?moment=<mã>`), `count` = số sản phẩm `ACTIVE` thuộc Moment đó (tính khi đọc). Thẻ có `count` = 0 không được trả / không hiện (không liên kết tới danh sách rỗng). |
| BR-MOM-03 | Must | FE `contentMode = http`: thẻ Moment trang chủ và menu Moment đọc từ API; không còn `MOMENTS`/fixture làm nguồn chữ; bấm thẻ mở danh sách lọc đúng Moment, số sản phẩm khớp `count`. Lỗi tải nội dung → trang chủ vẫn dựng các khối còn lại, thẻ Moment ẩn. |

**F. Khuyến mãi (BR-PROMO)**

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-PROMO-01 | Must | Mỗi sản phẩm có tối đa **một** đợt giảm: `salePrice` (nguyên đồng, 1.000 ≤ `salePrice` < `price`), `saleStartsAt` = 00:00:00 giờ VN của ngày bắt đầu, `saleEndsAt` = 23:59:59 giờ VN của ngày kết thúc (gồm cả ngày đó), độ dài ≤ **90 ngày**, `saleEndsAt` ≥ `saleStartsAt`. Thiếu một trong ba, hoặc sai khoảng → 422 theo trường (`salePrice`, `saleStartsAt`, `saleEndsAt`). Đặt đợt mới ghi đè đợt cũ; gỡ đợt = để trống ba trường. Chỉ admin (`promotions.edit`). |
| BR-PROMO-02 | Must | Giá hiệu lực (D4): `saleStartsAt` ≤ T ≤ `saleEndsAt` thì `price_hiệu_lực = salePrice` và `compareAtPrice` hiển thị = `price` gốc (đè giá gạch nhập tay trong đợt); ngoài đợt = `price` và `compareAtPrice` nhập tay như cũ. **Một hàm duy nhất** dùng ở danh sách, tìm kiếm, chi tiết, giỏ, báo giá, đặt đơn, gợi ý, trang Yêu thích; lọc `maxPrice` và sắp xếp theo giá dùng giá hiệu lực. |
| BR-PROMO-03 | Must | Đơn lưu `unit_price` = giá hiệu lực tại lúc đặt (giữ cơ chế kiểm lại giá Slice 3: giá đổi giữa báo giá và đặt → báo thay đổi giá, không đặt ngầm); `compare_at_price` của dòng = giá gốc khi trong đợt. Hết đợt không đổi đơn đã đặt, doanh thu, trả hàng (BR-RET-30 dùng `unit_price` đã lưu). Giỏ cũ khi giá đổi theo cơ chế làm tươi giá sẵn có. |
| BR-PROMO-04 | Must | "Đang giảm" = trong đợt giảm **hoặc** `compare_at_price` > `price` (hiện trạng), cùng một hàm; voucher có `excludeSaleItems` loại dòng đang giảm; voucher không loại thì tính trên giá hiệu lực (cộng dồn). Free-ship (voucher và ngưỡng miễn phí) tính trên tiền hàng sau giảm đợt như hiện nay; không đổi quy tắc Slice 3. |
| BR-PROMO-05 | Must | Sửa `price` khi có đợt: nếu `salePrice` ≥ `price` mới → 422 `salePrice`. Chống ghi chồng bằng `updatedAt` sản phẩm sẵn có (409 `version-conflict`). Sản phẩm `DRAFT` / `ARCHIVED` có thể có đợt nhưng không hiển thị. |
| BR-PROMO-06 | Must | FE `promotionsMode = http`: form sản phẩm admin thêm khối "Giảm giá có hạn" (giá giảm, ngày bắt đầu / kết thúc, gỡ đợt, hiển thị "Đang chạy / Sắp tới / Đã kết thúc" tính từ giờ máy chủ); storefront hiện giá hiệu lực, giá gạch. Thẻ và PDP có nhãn "-X%" với X = làm tròn **xuống** của (1 − giá giảm / giá gốc) × 100, do máy chủ trả (`discountPercent`) để không lệch làm tròn. |
| BR-PROMO-07 | Should | Giảm hàng loạt: admin chọn danh mục + % (5–70) + khoảng ngày (≤ 90) → máy chủ tính `salePrice` = giá gốc × (100 − %) / 100 làm tròn **xuống** bội số 1.000 (≥ 1.000), có bước **xem trước** (số sản phẩm áp / bỏ qua, danh sách); sản phẩm đang có đợt chạy hoặc `salePrice` tính ra ≥ `price` bị bỏ qua và liệt kê; áp trong một giao dịch (tất cả hoặc không). Lọc công khai `sale=true` (danh sách các sản phẩm trong đợt); nhãn "Giảm giá đến dd/MM" từ `saleEndsAt`. |
| BR-PROMO-08 | Must | Free-ship voucher, voucher phần trăm / cố định, điều kiện, admin CRUD voucher: **giữ nguyên Slice 3 / 6**, không làm lại; câu hỏi "voucher free-ship" của master plan đóng (Thắng 2026-11-07). |

**G. Quản lý nội dung (BR-CMS)**

| Mã | Mức | Quy tắc |
| --- | --- | --- |
| BR-CMS-01 | Must | `GET /content/home` công khai, `public, max-age=60`: `categories[]`, `moments[]` (BR-MOM-02), `blocks[]` chỉ gồm khối `enabled`, đúng cấu trúc FE `LandingContent` (khối `campaign`, `products`, `shop`, `categories`). Chưa có bản lưu → bản mặc định seed từ fixture hiện tại; seed idempotent, không đè bản admin đã sửa. Admin đọc được cả khối tắt. |
| BR-CMS-02 | Must | Admin lưu trang chủ (`content.edit`, chỉ admin) bằng **một lần ghi nguyên văn bản** kèm `updatedAt`; lệch → 409 `version-conflict` (kèm bản hiện tại), không ghi chồng. Giới hạn: ≤ **16** khối; `id` khối duy nhất; `eyebrow` ≤ 40, `title` ≤ 80, `description` ≤ 200 ký tự; khối `products` ≤ **6** thẻ; `href` chỉ là đường dẫn nội bộ bắt đầu `/` (không `//`, không có `:` trước dấu `/` đầu, tức không `javascript:` / `http:`); `mediaId` phải tồn tại ở thư viện ảnh hoặc là id seed hợp lệ; bật / tắt `enabled`; thứ tự = thứ tự mảng. Sai → 422 `fieldErrors` có đường dẫn đầy đủ (`blocks[2].title`). Lưu ghi `updated_by` / `updated_at`; hiển thị "Cập nhật bởi … lúc …". |
| BR-CMS-03 | Must | Bảng size: admin sửa theo **danh mục** (`categories`, hiện 4) qua một lần ghi nguyên bảng kèm `updatedAt`: `body` và `garment` mỗi bảng ≤ **12** hàng, ≤ **8** cột; nhãn size 1–10 ký tự và duy nhất trong bảng; mỗi ô không rỗng, ≤ 20 ký tự; thiếu / thừa cột so với `bodyColumns` / `garmentColumns` → 422 theo đường dẫn; lệch `updatedAt` → 409. Chỉ admin. Đổi `Cache-Control` của `GET /size-charts/{category}` từ 3600 giây xuống **60 giây** để khách thấy bản mới trong ≤ 60 giây. |
| BR-CMS-04 | Must | FE `contentMode = http`: trang chủ đọc `GET /content/home` (không `MockHomeContentApi`); admin có mục "Nội dung" (Trang chủ, Bảng size) chạy API thật, 409 hiện giá trị máy chủ và giữ bản đang nhập, 422 gắn đúng ô, mất mạng giữ form; ô Won't (nháp, xem trước, lịch) ẩn; `/admin/content`, `/admin/size-charts` không còn "Chưa khả dụng" (sửa AC-INS-07). Staff thấy nội dung nhưng nút lưu bị ẩn / khoá (403 ở máy chủ). |
| BR-CMS-05 | Must | Ảnh khối / thẻ chọn từ thư viện ảnh admin đã có (Slice 6); nội dung chỉ lưu `mediaId`. Xoá ảnh đang được trang chủ dùng không được làm hỏng trang: nếu `mediaId` không còn thì khối vẫn trả nhưng FE dùng ảnh thay thế, không lỗi trang trắng. |
| BR-CMS-06 | Should | Nút "Khôi phục mặc định" trang chủ (hộp xác nhận, chỉ admin, ghi `updated_by`); cảnh báo (không chặn) khi `href` trỏ sản phẩm không còn `ACTIVE`. |
| BR-CMS-07 | Should | Bộ sưu tập: `name` ≤ 80, `slug` 2–50 ký tự `[a-z0-9-]` duy nhất, `description` ≤ 300, `status` `active` / `draft`, ≤ 200 sản phẩm, thứ tự; công khai chỉ `active` (`GET /collections`, `GET /collections/{slug}` kèm danh sách sản phẩm `ACTIVE`), trang storefront `/collections/:slug`; admin CRUD (`content.edit`), xoá bộ sưu tập không xoá sản phẩm; slug đã `active` không đổi. Làm sau cùng của G; nếu cắt, ô / menu bộ sưu tập ẩn ở HTTP. |

### 5. Acceptance criteria

Dữ liệu tham chiếu (mỗi AC chạy trên DB sạch với dữ liệu sau trừ khi nói khác; hôm nay = D giờ VN): admin A, staff S, thành viên M, N, khách vãng lai G (g@x.vn). Sản phẩm: **P1** Áo (Moment work + dinner, `sales_rank` 1, còn hàng, giá 500.000), **P2** Áo (work, 2, giá 500.000), **P3** Quần (work, 3), **P4** Đầm (event, 4), **P5** Áo khoác (weekend, 5), **P6** Áo hết hàng mọi biến thể (work, 6), **P7** `DRAFT`. Đơn: **R1** (M) `completed`, `paid`, giao D−5, 2 dòng P1 và P3; **R2** (M) `completed`, giao D−400, 1 dòng P2; **R3** (N) `to_receive`, 1 dòng P1; **R7** (G) như R7 của Slice 9 (COD, `completed`, `paid`, giao D−3, 1 dòng áo 400.000, ship 30.000), có grant OTP còn hạn; **R9** (M) `completed`, giao D−10, 1 dòng P4 đã được trả hết (`refunded`).

**Nền chung**

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-P1-01 | P1-01 | DB có dữ liệu Slice 1–9 | `migrate deploy` 2 lần; chèn bằng SQL đánh giá thứ hai cho cùng (M, P1); chèn mục yêu thích trùng | Lần 2 không có migration; không DROP / TRUNCATE / đổi kiểu; bảng mới có RLS; số dòng `products`, `orders`, `order_items`, `users`, `vouchers`, `order_returns` không đổi; hai lần chèn trùng bị DB từ chối. |
| AC-P1-02 | P1-02 | Bản thường (cả 5 cờ `http`) rồi từng cờ đổi sang `mock` | Mở PDP, trang Yêu thích, trang chủ, admin sản phẩm; chạy Playwright mock | Mỗi cờ `http` không gọi mock ở khu của nó; đổi một cờ sang `mock` chỉ đổi khu đó, khu khác chạy bình thường không lỗi console; bản `mock` pass nguyên. |
| AC-P1-03 | P1-03 | S, A | S gọi ghi nội dung trang chủ, ghi bảng size, đặt giá giảm; S trả lời / ẩn đánh giá; A gọi cả ba; hạ A xuống staff bằng SQL rồi gọi lại | S: 403 `forbidden` cho ba thao tác nội dung / giá (DB không đổi), 200 cho đánh giá; A: 200; sau khi hạ vai trò: 403 ngay (đọc từ DB mỗi lần). |
| AC-P1-04 | P1-04, 05 | M | Gửi 6 đánh giá hợp lệ trong 1 giờ (6 sản phẩm đủ điều kiện); 61 yêu cầu ghi wishlist trong 1 phút; gây từng lỗi AC trong slice | Đánh giá thứ 6 và ghi thứ 61: 429 `rate-limited` + `retryAfterSeconds` + `Retry-After`; năm đánh giá đầu thành công; mọi lỗi có `code` ổn định + HTTP đúng, không stack trace / SQL; FE có câu riêng cho `not-eligible`, `already-reviewed`, `wishlist-full`, `version-conflict`, `rate-limited`. |

**A. Trả hàng vãng lai**

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-RET-60 | RET-60 | R7 và grant của G còn hạn; grant hết hạn; grant của R7 dùng cho R2 (M) | G tạo / xem / huỷ yêu cầu cho R7; dùng grant hết hạn; dùng grant R7 cho R2; không grant | R7: 2xx; grant hết hạn / không grant: 401 `unauthenticated`, `no-store`, DB không đổi; R2: 404 `not-found` (giống đơn không tồn tại). |
| AC-RET-61 | RET-61 | R7; đồng hồ giả | G gửi `wrong-size` 1 dòng lúc D+27 23:59:59 (ngày thứ 30 kể từ giao D−3) và lúc ngày kế sau 00:00:00; gửi dòng lạ; gửi lý do `other`; gửi 2 yêu cầu song song với 2 khoá; gửi `changed-mind` với `conditionAck = false` | Trong hạn: 201; sau hạn: 409 `return-window-closed`; dòng lạ: 422 `field: lines`; `other`: 422 `field: reason`; song song: đúng 1 × 201, còn lại 409 `return-exists`; `conditionAck` sai: 422; chi tiết đơn của G có `canReturn`, `returnDeadline`, `return`; số tiền dự kiến đúng BR-RET-30 (R7 toàn đơn + `changed-mind` = 400.000 − 30.000 = 370.000). |
| AC-RET-62 | RET-62 | Grant G, grant H (đơn khác) | G tải ảnh JPEG 3 MB (201), tải ảnh thứ 31 trong 1 giờ; gắn ảnh do H tải vào yêu cầu của G; mở URL ảnh không grant, bằng grant G, bằng S | Ảnh thứ 31: 429; ảnh của H: 422 `field: photos`; URL ảnh: không grant → 401 / 404 không có nội dung; grant G và S: 200 ảnh đúng; không URL nào trong phản hồi mở được khi thiếu grant; EXIF GPS không còn trong ảnh lưu. |
| AC-RET-63 | RET-63 | Grant G; SMTP giả bắt thư | G tạo 6 yêu cầu trong 1 giờ (đơn / lần huỷ lặp lại); G gửi yêu cầu hợp lệ rồi đọc thư và sự kiện đơn | Yêu cầu thứ 6: 429 `rate-limited`; thư "Đã nhận yêu cầu trả hàng" tới `g@x.vn`, không chứa mã tra cứu, OTP hay số tài khoản đầy đủ; sự kiện đơn người = khách, không tên. |
| AC-RET-64 | RET-64 | Yêu cầu vãng lai COD số `1234567890` qua đủ trạng thái | G, S, A đọc; grep email, sự kiện, nhật ký, log | G và S: chỉ ngân hàng + "7890" + tên; A: đầy đủ chỉ ở `received`; chuỗi số đầy đủ không có trong email / sự kiện / nhật ký / log; sau trạng thái cuối SQL cho thấy đã xoá. |
| AC-RET-65 (Should) | RET-65 | Yêu cầu `requested` của G và của M; một đơn không có yêu cầu | A xem danh sách đơn và danh sách trả hàng; kiểm lại AC-RET-44, AC-RET-52 | `returnPending` = 2 đơn đúng; nhãn nguồn "Khách vãng lai" / "Thành viên" đúng; "Quá hạn xử lý", email "đã nhận hàng trả về", `returnRate` vẫn đạt như AC-RET-44, 52. |
| AC-RET-66 | RET-66 | A phát hành | Đọc chính sách trả hàng và trợ giúp | Có "hoặc Tra cứu đơn hàng" ở mục "Cách gửi yêu cầu"; còn hotline; mốc thời gian vẫn ghi "dự kiến". |

**B. Đánh giá**

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-REV-01 | REV-01, 02 | M (R1, R2, R9), N (R3), G, khách không phiên; đồng hồ giả | Gọi trạng thái đủ điều kiện: M cho P1, M cho P2, M cho P4, N cho P1, G / không phiên cho P1; M gửi đánh giá P4 và P2 | M-P1 `eligible` kèm `sizeBought` từ R1; M-P2 (giao D−400, quá 365 ngày), M-P4 (đã trả hết), N-P1 (`to_receive`): `not-purchased`; không phiên: 200 `sign-in`; gửi P4 / P2: 409 `not-eligible`, không tạo bản ghi; vãng lai không có đường gửi. |
| AC-REV-02 | REV-03 | M đủ điều kiện P1 | Gửi: `rating` 0 / 1 / 5 / 6; tiêu đề 1 / 2 / 80 / 81 ký tự; nội dung 19 / 20 / 1000 / 1001; `height` 21 ký tự; `fit` 2; tiêu đề toàn khoảng trắng; ký tự điều khiển; gửi kèm `sizeBought` giả và `verified` | Hợp lệ chỉ khi 1, 5; 2, 80; 20, 1000; còn lại 422 `fieldErrors` đúng trường, nhiều lỗi trả cùng lúc; `sizeBought` lưu theo đơn thật, `verified` bỏ qua giá trị FE; NFC và cắt khoảng trắng. |
| AC-REV-03 | REV-04 | M đủ điều kiện P1; đã có đánh giá | Gửi lần hai; 10 yêu cầu song song (khoá khác nhau) cho M-P1 mới; gửi lúc SQL đã có hàng trùng | Lần hai: 409 `already-reviewed`; song song: đúng 1 × 201, 9 × 409, SQL 1 hàng; trạng thái eligibility → `reviewed`; đánh giá hiện ngay ở danh sách công khai. |
| AC-REV-04 | REV-05 | P1 có 5 đánh giá `visible`, 1 đã ẩn, 1 của P7 (`DRAFT`) | Không cookie gọi danh sách P1 (`limit` mặc định, 3, 21); P7 | Không cookie vẫn 200, `public, max-age=10`; mặc định 5 mục (không có mục ẩn), mới nhất trước; `limit = 3` có phân trang đúng `total`; `limit = 21`: 422; P7: 404 hoặc `[]` (không lộ); mỗi mục có `author` "Nguyễn V." không email / id, `verified = true`, không `sample`. |
| AC-REV-05 | REV-06 | P1 có đánh giá visible 5, 4, 4 và một đánh giá 1 sao đã ẩn | Đọc sản phẩm; ẩn một đánh giá 4; hiện lại; ẩn hết; gửi đánh giá mới 3 sao (chờ ≤ 30 giây) | `rating` = `average` 4,3, `count` 3 (13/3 = 4,333 → 4,3); sau ẩn một đánh giá 4: 4,5 / 2; hiện lại: 4,3 / 3; ẩn hết: không có `rating` (FE ẩn sao); với 5, 4, 4 hiện, thêm 3 sao: 16/4 = 4,0 / 4; thẻ PLP và PDP cùng số; sau ≤ 30 giây phản ánh. |
| AC-REV-06 | REV-07 | 25 đánh giá: 6 chưa trả lời, 4 ≤ 2 sao, 3 ẩn; S, A | Mở danh sách theo từng `view`, lọc `rating`, `limit` 20 / 50 / 51; ẩn với lý do 4 / 5 / 250 / 251 ký tự; trả lời 4 / 5 / 500 / 501; hai nhân viên ẩn / hiện đồng thời; `updatedAt` cũ | Số đếm đúng; `limit` 51: 422; lý do 4, 251 và trả lời 4, 501: 422; 5, 250, 5, 500 hợp lệ; đánh giá ẩn biến khỏi công khai; trả lời hiện "Phản hồi từ nine2fine"; `updatedAt` cũ: 409 `version-conflict`; đồng thời: 1 × 200, còn lại 409; ghi người + thời điểm. |
| AC-REV-07 | REV-08 | `reviewsMode = http`; M ở PDP P1 và P4; khách | Xem từng trạng thái; gửi hợp lệ; chặn mạng rồi Gửi, bỏ chặn bấm Thử lại; 422; 409 | Không nhãn "mẫu"; form chỉ ở `eligible`; câu riêng cho `sign-in` / `not-purchased` / `reviewed`; mất mạng giữ nguyên nội dung nhập, Thử lại không tạo hai đánh giá; 422 cạnh đúng ô; nút khoá khi đang gửi; thành công hiện đánh giá của mình ngay. |
| AC-REV-08 (Should) | REV-09 | P1 có đánh giá 5, 4, 3 sao; R1 đủ điều kiện | Lọc `rating = 4`; mở chi tiết R1 | Chỉ đánh giá 4 sao, `total` đúng; chi tiết R1 có "Viết đánh giá" cho dòng P1 (và P3 nếu đủ điều kiện), không có cho dòng đã đánh giá. |

**C. Wishlist**

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-WISH-01 | WISH-01 | M, N, khách | Gọi đọc / thêm / xoá không cookie; M thêm P1; N đọc | Không cookie: 401 `unauthenticated`, `no-store`, DB không đổi; N không thấy P1 của M; không có API admin xem wishlist. |
| AC-WISH-02 | WISH-02, 03 | M có P1 | Thêm P1 lần hai; thêm P2; xoá P5 (không có); thêm id lạ; thêm P7 (`DRAFT`); xoá mục của sản phẩm vừa bị ẩn | Thêm lại: 200 không đổi, 1 hàng; P2: 200; xoá P5: 204; id lạ và P7: 404 `not-found`; xoá mục sản phẩm đã ẩn: 204; đọc: mới thêm trước, có `addedAt`. |
| AC-WISH-03 | WISH-02 | M có 100 mục `ACTIVE`; 1 mục thuộc sản phẩm đã ẩn | Thêm mục thứ 101; ẩn 1 sản phẩm trong danh sách rồi thêm; xoá 1 mục rồi thêm lại; 20 yêu cầu thêm song song khi M có 99 | Mục 101: 409 `wishlist-full`, DB không đổi; sản phẩm ẩn không tính nên thêm được; song song: tổng không vượt 100, số 200 = số chỗ trống, còn lại 409. |
| AC-WISH-04 | WISH-03 | M có 60 mục | FE mở trang Yêu thích | Đủ 60 thẻ; mỗi request lọc `ids` ≤ 48; mục sản phẩm đã ẩn không hiện. |
| AC-WISH-05 | WISH-04 | Server của M: [P3]; local khách: [P1, P2, id lạ, P7] | Đăng nhập (gộp); gọi gộp lần hai; gửi 101 id; server 99 mục + gộp 3 id mới hợp lệ | Kết quả {P3, P1, P2}, `skipped` = 2; lần hai: không nhân đôi, `skipped` giữ logic; 101 id: 422; 99 + 3: thêm 1 mục đủ 100, `skipped` ≥ 2, mục server không bị bỏ; sau gộp FE local = server. |
| AC-WISH-06 | WISH-04, 05 | Thiết bị A và B cùng M; sau đồng bộ cả hai có {P1, P2} | Ở A xoá P1; ở B (cache cũ có P1) đăng xuất rồi đăng nhập / tải lại; ở B chặn mạng khi thêm P4 rồi bỏ chặn | P1 **không** quay lại; B thấy {P2} sau tải lại; P4 nằm ở danh sách chưa đồng bộ khi mất mạng, tự gộp lần mở sau, không mất; đăng xuất chủ động xoá cache wishlist thiết bị. |
| AC-WISH-07 | WISH-06 | `wishlistMode = http`; khách ở PLP | Bấm tim P1 → đăng nhập; M bấm tim P2 khi chặn mạng; 429; 409 | Sau đăng nhập về đúng trang cũ, P1 đã lưu (1 hàng, 1 lần gộp); lỗi mạng: tim hoàn lại + thông báo, không lưu nửa vời; 409: "đủ 100 sản phẩm"; 429 nêu số giây. |

**D. Gợi ý**

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-REC-01 | REC-01 | Dữ liệu tham chiếu | Gọi gợi ý cho P1 với `limit` = 4, 2, 8, 9, 0 | `limit` 4: [P2, P3, P4, P5] (P2 cùng danh mục + Moment work; P3 cùng Moment khác danh mục; P4, P5 bán chạy; P6 hết hàng và P7 `DRAFT` bị loại; không P1); `limit` 2: [P2, P3]; `limit` 8: đủ 4 phần tử hợp lệ (không bù sai điều kiện); 9, 0: 422. |
| AC-REC-02 | REC-01 | Gọi lặp 20 lần, 2 tiến trình; đổi `sales_rank` P4 ↔ P5 | Gọi lại | 20 lần cùng thứ tự; sau đổi `sales_rank`, P5 đứng trước P4 ở bước (4); hai sản phẩm cùng `sales_rank` xếp theo `slug`. |
| AC-REC-03 | REC-01 | P2 đặt hết hàng; P6 nhập lại hàng | Gọi gợi ý cho P1 | P2 biến khỏi danh sách (≤ 30 giây), P6 xuất hiện ở bước (1) / theo bậc đúng quy tắc; sản phẩm `ARCHIVED` không bao giờ xuất hiện. |
| AC-REC-04 | REC-02 | Giỏ [P1, P3] | Gọi gợi ý giỏ `limit` 4; giỏ [P1]; giỏ rỗng; 11 id; id lạ | [P2, P4, P5] (P2 xuất hiện trong cả hai danh sách nên điểm cao nhất; P1, P3 bị loại; chỉ 3 phần tử hợp lệ nên trả 3); giỏ [P1] = như PDP P1 trừ P1; giỏ rỗng: bán chạy [P1, P2, P3, P4]; 11 id: 422; id lạ bị bỏ qua. |
| AC-REC-05 | REC-03 | Mọi sản phẩm cùng danh mục đã hết hàng | Gọi; FE hiển thị | Trả ít hơn `limit` hoặc `[]`; FE ẩn cả khối khi rỗng (không tiêu đề trống); DTO có giá hiệu lực và nhãn như thẻ catalog; `public, max-age=30`. |
| AC-REC-06 | REC-04 | `recommendationsMode = http`; chặn `*/api/*` | Mở PDP và giỏ; bỏ chặn tải lại; khách và thành viên | Lỗi: ẩn khối, trang vẫn dùng được; có API: PDP và giỏ không còn logic `moment`/bán chạy ở FE; kết quả giống nhau cho khách và thành viên. |
| AC-REC-07 (Should) | REC-05 | P1 và P3 có chung 3 đơn `completed` trong 365 ngày; P1 và P5 chung 2 đơn | Gợi ý cho P1 | P3 đứng đầu (bước 0); P5 không vào bước 0 (2 < 3); bỏ 1 đơn chung của P3 → P3 rời bước 0. |

**E. Moment**

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-MOM-01 | MOM-01 | Dữ liệu tham chiếu | Lọc `moment` = `work`, `weekend`, `party`; tạo sản phẩm với `moments = []` | `work`: P1, P2, P3, P6 (danh sách catalog liệt kê cả sản phẩm hết hàng như hiện nay; P7 `DRAFT` không có), `weekend`: P5; `party`: danh sách rỗng 200; `[]`: 422 (hành vi Slice 6 giữ nguyên); admin không có thao tác thêm / xoá Moment. |
| AC-MOM-02 | MOM-02 | `moment` `dinner` chỉ có P1; `event` chỉ có P4; đặt P4 về `DRAFT` | Gọi `GET /content/home` trước / sau | Trước: 4 thẻ theo thứ tự work, dinner, event, weekend, `count` đúng theo sản phẩm `ACTIVE` (work 4: P1, P2, P3, P6; dinner 1; event 1; weekend 1); sau: thẻ `event` có `count` 0 **không được trả**; `lines` ≤ 2 dòng ≤ 60 ký tự; `href` `/shop?moment=<mã>`. |
| AC-MOM-03 | MOM-03 | `contentMode = http` | Mở trang chủ, bấm thẻ `weekend`; chặn `*/api/content/*` rồi tải lại | Số hiển thị khớp `count` và danh sách lọc; thẻ ẩn khi `count` 0; lỗi tải nội dung: các khối khác vẫn dựng, thẻ Moment ẩn, không trang trắng, không lỗi console. |

**F. Khuyến mãi**

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-PROMO-01 | PROMO-01 | P2 giá 500.000; A, S | A đặt đợt: `salePrice` 500.000 / 499.000 / 999 / 350.000; ngày bắt đầu D, kết thúc D−1 / D / D+89 / D+90; thiếu `saleEndsAt`; S đặt đợt | 500.000 và 999: 422 `salePrice`; 499.000 hợp lệ (< `price`, ≥ 1.000); kết thúc D−1: 422 `saleEndsAt`; D và D+89 hợp lệ; D+90 (91 ngày): 422; thiếu ngày: 422 theo trường; S: 403; đặt đợt mới ghi đè cũ; để trống ba trường gỡ đợt. |
| AC-PROMO-02 | PROMO-02 | P2 `salePrice` 350.000 bắt đầu D 00:00:00, kết thúc D+2 23:59:59 giờ VN; đồng hồ giả | Đọc danh sách / chi tiết / tìm kiếm / giỏ / báo giá ở D−1 23:59:59, D 00:00:00, D+2 23:59:59, D+3 00:00:00; `maxPrice` = 400.000; `sort = price-asc` với P3 giá 380.000 | Trước và từ D+3: giá 500.000, `compareAtPrice` như cũ; từ D 00:00:00 đến D+2 23:59:59: 350.000, `compareAtPrice` 500.000, `discountPercent` 30; `maxPrice` 400.000 chọn P2 trong đợt và loại ngoài đợt; `price-asc` xếp P2 (350.000) trước P3 (380.000) chỉ trong đợt; mọi nơi cùng một số. |
| AC-PROMO-03 | PROMO-03 | Giỏ có P2 trong đợt; checkout | Đặt đơn COD lúc đợt đang chạy; hết đợt giữa báo giá và đặt; xem đơn cũ sau khi hết đợt; trả hàng đơn cũ | Đơn lưu `unit_price` 350.000, `compare_at_price` 500.000, `line_discount`, tổng đúng `subtotal − discount + ship − shipDiscount`; đặt sau khi hết đợt giữa chừng: báo giá thay đổi (không đặt ngầm giá cũ); đơn cũ và tiền hoàn dùng 350.000, không đổi; doanh thu theo `unit_price` đã lưu. |
| AC-PROMO-04 | PROMO-04 | Voucher V1 `excludeSaleItems`, V2 không loại; giỏ [P2 trong đợt, P3 không giảm] | Áp V1, V2; P3 có `compare_at_price` > `price` (không đợt); free-ship ngưỡng | V1 loại dòng P2 (và P3 nếu có giá gạch) khỏi cơ sở tính; V2 tính trên 350.000 + giá P3; "đang giảm" nhất quán giữa lý do `excluded-sale-items`, nhãn thẻ, báo giá; ngưỡng free-ship tính trên tiền hàng sau giảm đợt. |
| AC-PROMO-05 | PROMO-05 | P2 đợt `salePrice` 350.000 | A sửa `price` P2 thành 300.000 / 360.000; hai admin sửa đồng thời; P7 có đợt | 300.000: 422 `salePrice` (≥ giá mới), không ghi; 360.000: hợp lệ; `updatedAt` cũ: 409 `version-conflict`; P7 không hiển thị ở storefront dù có đợt. |
| AC-PROMO-06 | PROMO-06 | `promotionsMode = http`; A mở form P2; khách mở PLP / PDP | Đặt đợt bắt đầu ngày mai; sửa đợt đang chạy; gỡ đợt; chặn mạng khi lưu | Trạng thái "Sắp tới / Đang chạy / Đã kết thúc" theo giờ máy chủ; khách chỉ thấy giá giảm khi Đang chạy; nhãn "-30%" từ `discountPercent` (floor: 499.000/500.000 → 0, 350.000 → 30); mất mạng giữ form; 422 gắn đúng ô. |
| AC-PROMO-07 (Should) | PROMO-07 | Danh mục Áo có P1 (500.000), P2 (đang có đợt chạy), P6 (hết hàng, giá 500.000); một sản phẩm Áo giá 1.100.000 | Xem trước và áp 30% từ D đến D+6; % = 4, 5, 70, 71; áp lúc 1 sản phẩm bị lỗi giữa chừng; mở `sale=true` | Xem trước: áp P1 (350.000), P6 (350.000) và sản phẩm 1.100.000 (770.000), bỏ qua P2 (đang có đợt) và liệt kê; giá 1.100.000 × 70% = 770.000 đã là bội 1.000; 4 và 71: 422, 5 và 70 hợp lệ; `salePrice` làm tròn xuống bội 1.000 (ví dụ 333.333 → 333.000); giao dịch tất cả hoặc không; `sale=true` chỉ trả sản phẩm trong đợt; nhãn "Giảm giá đến dd/MM". |
| AC-PROMO-08 | PROMO-08 | Voucher free-ship, % và cố định như Slice 3 | Chạy lại AC-VOU của Slice 3 và AC-INV-40..46 | Mọi AC đó vẫn Đạt, không đổi hành vi; không có chức năng free-ship mới. |

**G. Nội dung**

| Mã | BR | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-CMS-01 | CMS-01 | DB chưa có bản trang chủ; sau đó A đã sửa | Không cookie gọi `GET /content/home`; chạy seed lần hai | Lần đầu: bản mặc định đủ khối + 4 thẻ Moment, `public, max-age=60`; chỉ khối `enabled`; admin đọc thấy cả khối tắt; seed lần hai không đè bản A đã sửa. |
| AC-CMS-02 | CMS-02 | A có bản `updatedAt` U | Lưu với: 16 / 17 khối; `title` 80 / 81; `description` 200 / 201; khối `products` 6 / 7 thẻ; `href` `/shop`, `//evil.com`, `https://x`, `javascript:alert(1)`; `mediaId` lạ; `id` khối trùng; `updatedAt` cũ; hai admin lưu đồng thời | 12, 80, 200, 6 và `/shop` hợp lệ; 13, 81, 201, 7, các `href` còn lại, `mediaId` lạ, trùng `id`: 422 `fieldErrors` đường dẫn `blocks[i]...`; `updatedAt` cũ: 409 kèm bản hiện tại; đồng thời: 1 × 200, còn lại 409; sau lưu có "cập nhật bởi / lúc"; thứ tự mảng = thứ tự trang. |
| AC-CMS-03 | CMS-02, 05 | Khối dùng `mediaId` ảnh tải lên U1 | A xoá / làm mất U1 rồi khách mở trang chủ | Trang dựng đủ, khối dùng ảnh thay thế, không trang trắng, không lỗi console. |
| AC-CMS-04 | CMS-03 | `size_charts` danh mục Áo; A, S | Lưu bảng: 12 / 13 hàng; 8 / 9 cột; nhãn size 11 ký tự; trùng nhãn; ô rỗng; ô 21 ký tự; thiếu cột; `updatedAt` cũ; S lưu | 12 hàng, 8 cột hợp lệ; 13, 9, các lỗi còn lại: 422 theo đường dẫn; `updatedAt` cũ: 409; S: 403; thành công: bảng mới hiện ở PDP trong ≤ 60 giây (`max-age=60`, không còn 3600). |
| AC-CMS-05 | CMS-04 | `contentMode = http`; A, S | Mở `/admin/content`, `/admin/size-charts` ; 409; 422; chặn mạng khi lưu; staff mở | Không còn "Chưa khả dụng"; 409 giữ bản đang nhập + hiện giá trị máy chủ; 422 gắn đúng ô; mất mạng giữ form; staff thấy nội dung, nút lưu ẩn / khoá; không ô nháp / xem trước / lịch; không request tới mock. |
| AC-CMS-06 (Should) | CMS-06 | A đã sửa trang chủ; một khối trỏ `/product/<slug>` của sản phẩm đã `DRAFT` | "Khôi phục mặc định"; xem cảnh báo | Hộp xác nhận; sau khôi phục bản mặc định, `updated_by` = A; cảnh báo (không chặn) khi `href` trỏ sản phẩm không `ACTIVE`; staff không thấy nút. |
| AC-CMS-07 (Should) | CMS-07 | A | Tạo bộ sưu tập: `slug` `Hè 2027`, `he-2027`, trùng, 1 / 2 ký tự; 200 / 201 sản phẩm; đổi slug sau khi `active`; xoá; khách mở `/collections/he-2027` (`active` / `draft`) | `Hè 2027`, 1 ký tự: 422; `he-2027` hợp lệ, trùng: 422 `duplicate`; 200 hợp lệ, 201: 422; đổi slug khi `active`: 422; xoá không xoá sản phẩm; `draft`: 404 công khai; `active`: trang + chỉ sản phẩm `ACTIVE`. |

### 6. Định nghĩa xong của Slice 10

- AC Must đạt (test BE / E2E ghi mã AC); AC Should (AC-RET-65, AC-REV-08, AC-REC-07, AC-PROMO-07, AC-CMS-06, 07) ghi làm hay hoãn theo thứ tự cắt giảm ở backlog.
- `openapi.yaml` có tag cho từng khu (locked trước khi FE nối); migration chỉ cộng thêm; `decisions.md`, `handoff.md` cập nhật.
- Ở mỗi cờ `http`: khu đó không dùng mock, không còn ô Won't; Playwright mock pass nguyên.
- Giá nhất quán: một hàm giá hiệu lực (AC-PROMO-02, 03); không lệch giữa danh sách, giỏ, báo giá, đơn.
- Đánh giá: điểm trung bình khớp từng review đang hiển thị (AC-REV-05); một đánh giá mỗi (tài khoản, sản phẩm) dưới đua x10 (AC-REV-03).
- Wishlist: không mất mục chờ, không hồi sinh mục đã xoá (AC-WISH-05, 06); không vượt 100 dưới đua (AC-WISH-03).
- Trả hàng vãng lai: số tài khoản không rò ra (AC-RET-64); ảnh không công khai (AC-RET-62).
- Cần cập nhật tài liệu cũ: AC-INS-07 (menu admin: các mục Nội dung, Đánh giá, Bộ sưu tập theo cờ), BR-CAT-17 / AC-CAT-43 (không áp khi `reviewsMode = http`), BR-AUTH-32 (wishlist đồng bộ sau gộp), BR-RET-54(d) (khi A phát hành), BR-ADM-23 (không đổi; liên kết "Viết đánh giá" ở chi tiết đơn là Should), `Cache-Control` size chart (openapi: 3600 → 60).
- Lát nghiệm thu thật trên Supabase (10.9) cần Thắng duyệt áp migration và kiểm tay các luồng thật (gửi đánh giá bằng đơn đã giao, trả hàng vãng lai có thư thật, wishlist hai trình duyệt, nội dung trang chủ, giá giảm đặt đơn thật).

### 7. Câu hỏi mở

Mặc định PO (Thắng vắng), làm trước theo mặc định; Thắng đổi được khi quay lại. **Không câu nào chặn code 10.1–10.8**; chỉ lát 10.9 cần Thắng duyệt áp migration và kiểm quy trình thật.

| # | Câu hỏi | Ảnh hưởng | Mặc định PO | Trạng thái |
| --- | --- | --- | --- | --- |
| S10-Q1 | Đánh giá hiện ngay hay duyệt trước? | BR-REV-04, 07 | Hiện ngay, shop hậu kiểm (ẩn / trả lời); đủ điều kiện mua thật đã chặn spam | Mặc định PO |
| S10-Q2 | Ai được đánh giá, hạn, số lần | BR-REV-01 | Chỉ người đã nhận hàng (đơn `completed`), 365 ngày, 1 lần / sản phẩm; loại sản phẩm đã trả hết; vãng lai không | Mặc định PO |
| S10-Q3 | Tên hiển thị người đánh giá | BR-REV-05, D3 | "Họ + chữ cái đầu của tên" | Mặc định PO |
| S10-Q4 | Giới hạn và quy tắc gộp wishlist | BR-WISH-02, 04, 05 | 100 mục, theo sản phẩm, máy chủ là nguồn sự thật, chỉ gộp mục chưa đồng bộ | Mặc định PO |
| S10-Q5 | Quy tắc gợi ý | BR-REC-01, 02 | Cùng danh mục + Moment → cùng danh mục → cùng Moment → bán chạy; không ML; "mua cùng" (≥ 3 đơn) và "cùng bộ sưu tập" là Should | Mặc định PO |
| S10-Q6 | Phạm vi khuyến mãi mở rộng | BR-PROMO | Giá giảm có hạn theo sản phẩm (1 đợt, ≤ 90 ngày, không theo biến thể); hàng loạt theo danh mục là Should; free-ship voucher đã có và giữ (Thắng 2026-11-07); mua X tặng Y, flash sale, mã tự áp: Won't | Mặc định PO |
| S10-Q7 | Giá giảm đè giá gạch nhập tay | BR-PROMO-02 | Trong đợt, giá gạch = giá gốc; hết đợt trở lại giá gạch nhập tay | Mặc định PO |
| S10-Q8 | Bộ sưu tập | BR-CMS-07, REC-05 | Should, làm sau cùng; chưa có trang storefront nên cắt được; nếu cắt thì ẩn ô / menu ở HTTP | Mặc định PO |
| S10-Q9 | Nội dung trang chủ: nháp / lịch | BR-CMS-02 | Không; lưu là công khai (≤ 60 giây); có khôi phục mặc định (Should) | Mặc định PO |
| S10-Q10 | Phân quyền | BR-P1-03 | Staff kiểm duyệt đánh giá; chỉ admin sửa nội dung, bảng size, giá khuyến mãi | Mặc định PO |
| S10-Q11 | Giới hạn trả hàng vãng lai | BR-RET-62, 63 | 5 yêu cầu / giờ / grant, 10 / giờ / IP; ảnh 30 / giờ / grant, 60 / giờ / IP | Mặc định PO |
| S10-Q12 | Cache công khai | BR-CMS-01, 03, REC-03 | Nội dung 60 giây, bảng size 60 giây (đổi từ 3600), gợi ý 30 giây, đánh giá 10 giây | Mặc định PO |

### 8. Khác biệt FE mock và DB / API thật

| Trường / hành vi FE mock | Thực tế DB / API | Xử lý ở HTTP |
| --- | --- | --- |
| `ProductReview.sample`, đánh giá mẫu `reviews.ts` | Không có dữ liệu mẫu trong DB | Bỏ nhãn "mẫu"; mock giữ |
| `ProductReview.author` đầy đủ | "Họ + chữ cái đầu của tên" từ máy chủ | FE hiển thị nguyên chuỗi |
| `ReviewInput.sizeBought` do FE gửi | Máy chủ lấy từ đơn đủ điều kiện | FE hiện sẵn, không gửi / gửi cũng bị bỏ qua |
| `AdminReview.sample`, `status` (`visible` / `hidden`), `reply.author` | Có `status`, người + lúc ẩn / trả lời; không `sample` | Ẩn cột `sample` |
| `Product.rating` | Có từ `reviewsMode = http`, chỉ khi `count` ≥ 1 | FE ẩn sao khi thiếu |
| Wishlist `localStorage` là nguồn | Máy chủ là nguồn sau đồng bộ; local = cache + danh sách chưa đồng bộ | `WishlistState` đọc / ghi API; giữ cache offline |
| `WishlistState.pendingId` chờ đăng nhập | Thêm bằng PUT sau đăng nhập, rồi gộp | Giữ hành vi (BR-AUTH-32) |
| PDP gợi ý = lọc `moment` đầu, `limit` 5 | Endpoint gợi ý (BR-REC-01) | FE bỏ logic cũ ở HTTP |
| Giỏ gợi ý = bán chạy chưa có trong giỏ | BR-REC-02 (điểm theo sản phẩm trong giỏ) | Gọi endpoint, bỏ `bestSellers` ở HTTP |
| `MOMENTS`, `home-content.ts` `moments.cards` làm nguồn chữ | `moments[]` từ `GET /content/home` | FE đọc API; copy hero / story (`home-story`) vẫn trong bundle (Won't) |
| `MockHomeContentApi` (`apiConfig.mode = mock`) | `GET /content/home` | Đổi chọn adapter theo `contentMode` thay `apiConfig.mode` toàn cục |
| `LandingBlock` `member` (nội dung khác khi đăng nhập) | Lưu trong khối, server trả nguyên | Giữ; FE chọn theo phiên |
| Admin `AdminCollection.productIds` (`p01`) | Id sản phẩm thật (uuid) | Ánh xạ id; Should |
| Admin `AdminSizeChart` (category, label, rows) | `size_charts.data` JSON theo danh mục + `updatedAt` | Thêm `updatedAt` cho khoá ghi chồng |
| `Product.compareAtPrice` nhập tay; không có đợt | Thêm `salePrice`, `saleStartsAt`, `saleEndsAt`, `discountPercent` (chỉ đọc) | Form admin thêm khối "Giảm giá có hạn"; storefront đọc giá hiệu lực |
| `Order.canReturn = false` với vãng lai | `canReturn` / `return` theo grant (A) | FE vãng lai hiện nút / khối trạng thái ở Tra cứu đơn |
| Menu admin: Bộ sưu tập, Đánh giá, Nội dung = "Chưa khả dụng" (AC-INS-07) | Mở theo cờ `reviewsMode` / `contentMode` | Cập nhật AC-INS-07 khi phát hành |
