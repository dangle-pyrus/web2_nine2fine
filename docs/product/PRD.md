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


