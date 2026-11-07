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
| BR-AUTH-09 | **Gửi mã theo trạng thái email** (phản hồi luôn giống nhau, theo BR-AUTH-03). Mục đích đăng ký + email chưa có tài khoản → gửi mã. Đăng ký + email đã có tài khoản → gửi thư "Email này đã có tài khoản nine2fine, hãy đăng nhập", không có mã. Đăng nhập / đặt lại + tài khoản đang hoạt động → gửi mã. Đăng nhập / đặt lại + email không có tài khoản → không gửi gì. Đăng nhập / đặt lại + tài khoản bị vô hiệu → gửi thư báo tài khoản bị vô hiệu kèm email hỗ trợ phthang0872@gmail.com (chốt 2026-11-07), không có mã. Mọi trường hợp vẫn tính vào giới hạn BR-AUTH-06. |

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
| BR-AUTH-26 | **Phiên hết hạn giữa chừng.** Bất kỳ yêu cầu nào bị máy chủ từ chối vì chưa đăng nhập → FE xoá trạng thái đăng nhập, chuyển tới trang đăng nhập với returnUrl là trang hiện tại và thông báo "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." Giỏ hàng trên máy giữ nguyên. Trang công khai (catalog, giỏ) không chuyển hướng, chỉ chuyển sang trạng thái khách. |
| BR-AUTH-27 | **Đăng xuất.** Kết thúc **chỉ phiên hiện tại**; phiên trên thiết bị khác giữ nguyên. Máy chủ chỉ kết thúc phiên đã xác thực của chính người gọi. Gọi khi phiên đã hết hạn/không tồn tại → vẫn thành công. Mất mạng → FE vẫn xoá trạng thái đăng nhập trên máy (phiên máy chủ tự hết hạn theo BR-AUTH-24). Sau đăng xuất: về trang chủ `/` (đề xuất PO); dữ liệu tài khoản (tên, đơn, địa chỉ) không còn hiển thị, kể cả khi bấm Back. Nút đăng xuất không đặt cạnh thao tác thường dùng (master plan mục 20). |
| BR-AUTH-28 | **Nhiều thiết bị.** Một tài khoản có tối đa 10 phiên còn hạn cùng lúc (đề xuất PO). Đăng nhập lần thứ 11 → phiên có lần dùng cuối cũ nhất bị kết thúc. |
| BR-AUTH-29 | **Thay đổi trạng thái tài khoản.** Khi tài khoản bị vô hiệu, đổi vai trò, hoặc đặt lại mật khẩu → mọi phiên của tài khoản kết thúc ngay; yêu cầu kế tiếp từ các phiên đó bị từ chối như BR-AUTH-26. |
| BR-AUTH-30 | **Đã đăng nhập mà mở trang auth.** Người đã đăng nhập mở `/auth/login`, `/auth/register`, `/auth/forgot-password` → chuyển ngay tới returnUrl hợp lệ hoặc trang mặc định theo vai trò (BR-AUTH-31). |

#### 4.8 returnUrl

| Mã | Quy tắc |
| --- | --- |
| BR-AUTH-31 | **returnUrl an toàn.** Chỉ chấp nhận đường dẫn nội bộ: bắt đầu bằng đúng một `/`, không bắt đầu `//` hay `/\`, không chứa `\`, không chứa `://`, không trỏ vào `/auth/…` hay `/admin/login`, dài ≤ 512 ký tự (đề xuất PO). Không hợp lệ hoặc không có → trang mặc định: member `/new-in`; staff/admin `/admin` (đề xuất PO). Staff/admin đăng nhập ở `/admin/login` và cũng nhận returnUrl theo quy tắc này (chốt 2026-11-07). returnUrl trỏ vào khu vực vai trò không được vào (member → `/admin/…`) → trang mặc định của vai trò. returnUrl được giữ xuyên suốt khi rẽ sang đăng ký hoặc quên mật khẩu trong cùng tab. Email không bao giờ nằm trên URL. |

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
| BR-AUTH-35 | **Bí mật không rò rỉ.** Mật khẩu, mã xác thực, bí mật phiên không xuất hiện trong: log máy chủ, log trình duyệt, thông báo lỗi, URL, công cụ phân tích, dữ liệu mock/fixture commit vào repo. Email trong log được che (ví dụ `d***@nine2fine.vn`) (đề xuất PO). Bí mật phiên không đọc được bởi script của trang và không lưu trong storage trình duyệt. Máy chủ không khởi động nếu thiếu cấu hình bí mật (không có giá trị mặc định trong code). Chỉ nguồn web của nine2fine được gọi API có xác thực. Ở môi trường phát triển cục bộ, mã được xem qua hộp thư thử nghiệm, không in ra console; ở môi trường triển khai, tuyệt đối không. |
| BR-AUTH-36 | **Lỗi có mã ổn định.** Mỗi lỗi trả về một mã máy đọc được (tối thiểu: dữ liệu không hợp lệ theo từng trường, sai mã, sai thông tin đăng nhập, email đã có tài khoản, đang bị khoá + số giây còn lại, chờ gửi lại + số giây còn lại, tài khoản bị vô hiệu, chưa đăng nhập, không đủ quyền, lỗi máy chủ). Không trả stack trace, câu SQL, tên bảng. Lỗi máy chủ/mạng → FE hiện "Không thể kết nối. Vui lòng thử lại." |
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
| AC-AUTH-29 | 10 | Trang đăng ký của N | Tên = `  Minh `, Họ = `Nguyễn   Văn`, tạo tài khoản | Hồ sơ lưu `firstName = "Minh"`, `lastName = "Nguyễn Văn"`; tên hiển thị đầy đủ "Nguyễn Văn Minh". |
| AC-AUTH-30 | 10 | Chưa qua bước nhập email (tab mới) | Mở `/auth/register` | Chuyển về `/auth/login` bước nhập email. |
| AC-AUTH-31 | 11 | Trang đăng ký | Ngày sinh để trống cả 3 ô | Tạo tài khoản thành công, ngày sinh trống. |
| AC-AUTH-32 | 11 | Trang đăng ký | Ngày sinh `31/02/2000`, `01/01/1899`, ngày mai, hoặc chỉ điền năm | "Ngày sinh chưa hợp lệ."; không tạo tài khoản; máy chủ cũng từ chối khi gọi thẳng. |
| AC-AUTH-32a | 11 | Hôm nay là 07/11/2026; trang đăng ký | Ngày sinh = `07/11/2013` (đúng 13 tuổi hôm nay) | Tạo tài khoản thành công. |
| AC-AUTH-32b | 11 | Hôm nay là 07/11/2026; trang đăng ký | Ngày sinh = `08/11/2013` (thiếu 1 ngày đủ 13 tuổi) | Không tạo tài khoản; hiện "Bạn cần đủ 13 tuổi để tạo tài khoản." cạnh trường ngày sinh; các trường khác giữ nguyên. Gọi thẳng API với cùng giá trị → máy chủ từ chối, không có tài khoản. |
| AC-AUTH-32c | 11 | Năm hiện tại 2026; trang đăng ký | Mở bộ chọn năm sinh | Năm lớn nhất chọn được là 2016 (năm hiện tại − 10); không có 2017 trở đi. Chọn năm 2016 vẫn bị chặn bởi AC-AUTH-32b (tuổi < 13). |
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
| AC-AUTH-79 | 31 | — | Đăng nhập staff không có returnUrl; đăng nhập A với returnUrl `/admin/orders` | Staff về `/admin`; A về `/new-in`. |
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
| AC-AUTH-95 | 37 | Môi trường triển khai | Yêu cầu mã (gửi qua Gmail SMTP của nhóm) cho hộp thư Gmail và Outlook thật, 20 lần | ≥ 19/20 thư đến trong 60 giây; người gửi hiện "nine2fine"; thư có mã, hạn 10 phút, cảnh báo không chia sẻ; không có link đăng nhập. |
| AC-AUTH-96 | 38 | Trang đăng ký đã điền đủ | Bấm "Tạo tài khoản" 3 lần nhanh / nhấn Enter liên tục | Chỉ 1 yêu cầu được gửi; nút hiện "Đang tạo tài khoản…" và bị khoá. |
| AC-AUTH-97 | 38 | Trang đăng ký đã điền đủ, mạng bị ngắt | Bấm "Tạo tài khoản" | "Không thể kết nối. Vui lòng thử lại."; Tên, Họ, ngày sinh, các ô tick và mã vẫn còn; bật mạng bấm lại thành công. |

Tổng: 38 BR, 101 AC (AC-AUTH-01..97, 32a–32c và 51b).

### 6. Định nghĩa xong của Slice 1

Theo `docs/README.md` và master plan mục 49–50:
- Mọi AC-AUTH Must đạt trong `docs/qa/report-slice-1.md` (không còn AC chờ xác nhận).
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
