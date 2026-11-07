# Spec: Đăng nhập storefront `/auth/login`

Phạm vi: Slice 1 Auth. Giữ nguyên visual Figma (12:41 email, 43:1134 mã, 47:1197 mật khẩu), chỉ sửa chỗ vi phạm checklist master plan mục 19 hoặc chưa đạt AC-AUTH. Code hiện có: `frontend/src/app/features/auth/login-page.ts`, `ui/verification-code-field.ts`, `ui/password-field.ts`, `ui/auth-form.scss`, `auth-messages.ts`. Token và quy tắc chung: `design-system.md`.

## 1. Luồng

```
[Bước 1: email] --Tiếp tục--> tra cứu email
      |-- chưa đăng ký ------> /auth/register (email giữ trong bộ nhớ, không lên URL)
      |-- đã đăng ký --------> [Bước 2: mã xác thực]  (mặc định, tự gửi mã mục đích đăng nhập)
                                  |-- "Đăng nhập" đúng mã --> returnUrl (hoặc /new-in; staff/admin /admin)
                                  |-- "Sử dụng mật khẩu" ---> [Bước 3: mật khẩu]
                                  |-- "Chỉnh sửa Email" ----> Bước 1 (email điền sẵn)
[Bước 3: mật khẩu] --Đăng nhập đúng--> returnUrl
      |-- "Quên mật khẩu" --> /auth/forgot-password
      |-- "Sử dụng mã xác thực" --> Bước 2 (tự gửi lại; nếu còn trong 60 giây thì chỉ đếm ngược, không lỗi)
      |-- "Chỉnh sửa Email" --> Bước 1
```

Điểm vào khác: `returnUrl` trong query (giữ qua đăng ký, quên mật khẩu trong cùng tab; không hợp lệ thì về trang mặc định, BR-AUTH-31). Quay lại từ "Đặt lại mật khẩu" thành công: vào thẳng Bước 3 kèm thông báo (xem `auth-forgot-password.md`). Hết phiên giữa chừng (BR-AUTH-26): vào Bước 1 kèm `.notice` "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." Đã đăng nhập mà mở trang này: chuyển ngay (BR-AUTH-30), không hiện form.

Dữ liệu màn hình cần (Backend chốt hợp đồng): kết quả tra cứu "đã đăng ký / chưa"; số giây chờ gửi lại sau mỗi lần gửi mã; hồ sơ công khai sau đăng nhập (id, email, firstName, lastName, role); mã lỗi ổn định kèm số giây còn lại cho trường hợp khoá / chờ.

## 2. Bố cục (tham chiếu component có sẵn)

Mọi bước: `h1` (`tabindex="-1"`) → (tuỳ) `.notice` → nội dung bước. Không thêm thành phần mới.

| Bước | Thành phần từ trên xuống |
| --- | --- |
| Email | `h1` "Nhập email của bạn để tham gia hoặc đăng nhập." · `.field` Email (nhãn nổi, `*`) · `.field-error` · `.legal` (link Chính sách bảo mật, Điều khoản sử dụng) · `.form-error` · `.actions` với 1 `.pill` "Tiếp tục" |
| Mã xác thực | `h1` "Nhập mã 8 số chúng tôi vừa gửi qua email của bạn." · `.email-row` (email + link "Chỉnh sửa Email") · `n2f-verification-code-field` (ô mã + nút `reiconRefresh` + hint đếm ngược) · `.form-error` · `.stack`: `.pill.wide` "Đăng nhập" / `.divider` "hoặc" / `.pill.wide.outline` "Sử dụng mật khẩu" |
| Mật khẩu | `h1` "Nhập mật khẩu của bạn để đăng nhập vào tài khoản." · `.email-row` · `n2f-password-field` (`current-password`, nút hiện/ẩn) · link "Quên mật khẩu" (căn phải) · `.form-error` · `.stack`: `.pill.wide` "Đăng nhập" / "hoặc" / `.pill.wide.outline` "Sử dụng mã xác thực" |

CTA primary duy nhất mỗi bước (pill đen); hành động phụ là outline. Đạt checklist "không có quá nhiều CTA ngang cấp".

## 3. Bảng trạng thái

### 3.1 Bước email

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Mặc định | Ô trống (hoặc điền sẵn khi quay lại từ "Chỉnh sửa Email"); nút "Tiếp tục" bật | |
| Loading | Nút `disabled`, chữ "Đang kiểm tra…"; ô email giữ nguyên; Enter/bấm lặp lại không gửi thêm | BR-AUTH-38 |
| Lỗi nhập (FE, không gửi) | Dưới ô: "Nhập địa chỉ email hợp lệ." (`aria-invalid`, `aria-describedby`). Áp cho `minh@`, có khoảng trắng giữa, <6 hoặc >254 ký tự sau khi bỏ khoảng trắng hai đầu | AC-AUTH-02 |
| Nhập có khoảng trắng đầu/cuối, chữ hoa | Không lỗi: FE bỏ khoảng trắng hai đầu trước khi kiểm; chuyển sang bước mã | AC-AUTH-01 |
| Thao tác quá nhanh (tra cứu) | `.form-error`: "Bạn thao tác quá nhanh. Vui lòng thử lại sau N giây." (N theo máy chủ, định dạng N ở `design-system.md` mục 5.1) | AC-AUTH-05, 06 |
| Mất mạng / lỗi máy chủ | `.form-error`: "Không thể kết nối. Vui lòng thử lại." Email giữ nguyên; bấm "Tiếp tục" để thử lại | AC-AUTH-94 |
| Success | Chuyển bước (đã đăng ký) hoặc `/auth/register` (chưa); không hiển thị gì khác. URL không chứa email | AC-AUTH-03, 40 |
| Empty / disabled | Không có empty state. Nút chỉ disabled khi đang loading | |

### 3.2 Bước mã xác thực

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Vào bước | Focus vào `h1`; tự gửi mã. Hint: "Đang gửi mã…", rồi "Gửi lại mã trong N giây" đếm ngược từ số máy chủ trả. Nút gửi lại `disabled` trong lúc đếm | AC-AUTH-13, 40 |
| Vào lại bước khi đang trong thời gian chờ (đổi sang mật khẩu rồi quay lại sau 20 giây) | Không lỗi; hint đếm ngược phần còn lại (~40 giây); mã cũ vẫn dùng được | AC-AUTH-14 |
| Hết đếm ngược | Hint: "Chưa nhận được mã? Bấm biểu tượng để gửi lại." Nút gửi lại bật | AC-AUTH-13 |
| Gửi lại thành công | Đếm ngược mới; trình đọc màn hình nghe "Đã gửi mã xác thực." | |
| Gửi lại bị chặn (5 lần/30 phút/email hoặc 30 lần/giờ/IP) | Dưới ô mã: "Bạn thao tác quá nhanh. Vui lòng thử lại sau N phút." Nút gửi lại bật lại để thử sau | AC-AUTH-15, 16 |
| Gửi mã khi email bị khoá mã | Dưới ô mã: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau N phút." | AC-AUTH-20 |
| Lỗi nhập (FE, không gửi) | Dưới ô mã: "Nhập đủ 8 chữ số của mã xác thực." Áp cho <8 số hoặc có chữ. Không tính lần sai | AC-AUTH-23 |
| Loading đăng nhập | Nút "Đang đăng nhập…" `disabled`; ô mã giữ nguyên | BR-AUTH-38 |
| Sai / hết hạn / đã dùng / đã bị thay | Dưới ô mã (focus về ô mã): "Mã xác thực không đúng hoặc đã hết hạn." Cùng một câu cho mọi nguyên nhân; không hiện số lần còn lại. Lần 1–4 đều giống nhau | AC-AUTH-12, 17, 19, 21 |
| Sai lần 5 (khoá xác thực mã 15 phút) | Dưới ô mã: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau N phút." Mã đúng nhập sau đó vẫn nhận câu này. Nút "Sử dụng mật khẩu" vẫn dùng được (đường thay thế duy nhất đang mở) | AC-AUTH-20, 21, 22 |
| Tài khoản bị vô hiệu (chỉ sau khi nhập đúng mã) | `.form-error`: "Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ nine2fine để được hỗ trợ." + dòng "Email hỗ trợ: phthang0872@gmail.com" (link `mailto:`). Trước khi nhập đúng thì chỉ thấy câu "Mã xác thực không đúng…" | BR-AUTH-19 (AC-AUTH-50 cho mật khẩu) |
| Mất mạng / lỗi máy chủ | `.form-error`: "Không thể kết nối. Vui lòng thử lại." Mã đã gõ giữ nguyên | AC-AUTH-94 |
| Success | Chuyển tới returnUrl hợp lệ hoặc trang mặc định theo vai trò; header chuyển sang trạng thái đăng nhập | AC-AUTH-39, 77–80 |
| Chế độ mock | `.notice` "Chế độ trải nghiệm: dùng mã … " (chỉ khi mock) | |

### 3.3 Bước mật khẩu

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Mặc định | Ô mật khẩu trống, nút hiện/ẩn (`aria-pressed`, nhãn "Hiện mật khẩu" / "Ẩn mật khẩu") | |
| Lỗi nhập (FE) | Dưới ô: "Nhập mật khẩu của bạn." (ô trống bị chặn, không gửi) | BR-AUTH-17 |
| Loading | Nút "Đang đăng nhập…" `disabled` | BR-AUTH-38 |
| Sai thông tin (email không tồn tại, chưa có mật khẩu, sai mật khẩu, có khoảng trắng đầu/cuối, sai hoa thường) | `.form-error`: "Email hoặc mật khẩu chưa đúng." Email vẫn hiển thị ở `.email-row` | AC-AUTH-42, 43, 49 |
| Khoá tạm đăng nhập mật khẩu (5 lần sai, kể cả mật khẩu đúng sau đó) | `.form-error`: "Bạn đã nhập sai quá nhiều lần. Thử lại sau N phút hoặc đăng nhập bằng mã xác thực." Nút "Sử dụng mã xác thực" ngay bên dưới là lối thoát; không thêm nút mới | AC-AUTH-44, 45, 47 |
| Quá nhiều lần sai từ cùng IP | `.form-error`: "Bạn thao tác quá nhanh. Vui lòng thử lại sau N phút." | AC-AUTH-48 |
| Tài khoản bị vô hiệu (mật khẩu đúng) | Như 3.2: "Tài khoản của bạn đang bị tạm khóa…" + email hỗ trợ; không tạo phiên. Mật khẩu sai thì vẫn là "Email hoặc mật khẩu chưa đúng." | AC-AUTH-49, 50 |
| Mất mạng / lỗi máy chủ | `.form-error`: "Không thể kết nối. Vui lòng thử lại." Mật khẩu giữ nguyên trong ô (không xoá) | AC-AUTH-94 |
| Success | Như 3.2 | |

### 3.4 Thông báo đưa vào trang (`.notice`, `role="status"`)

| Nguồn | Chữ | AC |
| --- | --- | --- |
| Đặt lại mật khẩu thành công (vào Bước 3) | "Đã cập nhật mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới." | AC-AUTH-56 |
| Phiên hết hạn (vào Bước 1, returnUrl = trang cũ) | "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." | AC-AUTH-68 |
| Đang khôi phục phiên (ứng dụng vừa khởi động, tối đa 10 giây) | Không hiện form đăng nhập tạm; hiện dòng `.notice` "Đang kiểm tra phiên đăng nhập…" để tránh nháy form rồi chuyển. Hết 10 giây hoặc lỗi mạng → hiện form như khách | BR-AUTH-25, AC-AUTH-65, 67 |

Quy tắc: `.notice` biến mất khi người dùng chuyển bước (đã có trong `goTo`).

## 4. Responsive

Kích thước theo `--u` từ AuthLayout (Figma 1920px) với sàn tối thiểu đã có trong `auth-form.scss`, nên không cần breakpoint mới.

| Khung | Hành vi |
| --- | --- |
| Desktop (>1100px) | Theo Figma; cột form do AuthLayout quyết định |
| Tablet (801–1100px) | Cùng bố cục; lề `--page-gutter` 32px |
| Mobile (≤800px) | Lề 16px; ô nhập cao tối thiểu 56px, chữ ≥16px (iOS không tự phóng to); nút pill cao ≥48px, `.stack` nút rộng 100%; nút gửi lại và nút hiện/ẩn mật khẩu vùng bấm ≥44px; `.email-row` xuống dòng khi email dài (`overflow-wrap: anywhere`); hint đếm ngược và lỗi không bị cắt |

Kiểm tra bắt buộc: 320px không cuộn ngang; bàn phím ảo không che nút chính (trang cuộn được).

## 5. Accessibility

- **Nhãn:** mọi ô có `<label for>`; nhãn nổi không thay thế bằng placeholder (placeholder là khoảng trắng chỉ để CSS dò `:placeholder-shown`). `*` là `aria-hidden`; ô có `aria-required="true"`.
- **Focus khi chuyển bước:** sau `goTo`, focus vào `h1` (đã có). Sau khi báo sai mã ở bước mã, focus về ô mã. Khi bấm gửi mà FE chặn, focus vào ô lỗi đầu tiên. Không tự focus ô nhập khi vừa vào bước để tránh trình đọc màn hình bỏ qua tiêu đề.
- **Lỗi:** `.form-error` giữ `role="alert"`. Lỗi dưới ô (`.field-error`) nối với ô qua `aria-describedby` (ô mã hiện chỉ nối với hint, thêm id lỗi vào danh sách) và `aria-invalid="true"`. Lỗi thuộc ô mã (sai mã, khoá, gửi lại bị chặn) dùng `role="alert"` để được đọc ngay.
- **Đếm ngược:** không dùng `aria-live` cho dòng đếm từng giây (hiện `aria-live="polite"` trên hint sẽ đọc mỗi giây). Dòng nhìn thấy đặt `aria-hidden`; thêm một vùng `.sr-only` `aria-live="polite"` chỉ đổi nội dung khi: bắt đầu ("Đã gửi mã xác thực. Có thể gửi lại sau N giây."), kết thúc ("Có thể gửi lại mã xác thực.") và khi lỗi gửi.
- **Nút gửi lại:** `aria-label` "Gửi lại mã xác thực" (khi đang chờ: "Gửi lại mã sau N giây", cập nhật theo mốc chứ không từng giây); `disabled` trong lúc chờ.
- **Bàn phím/điện thoại:** email `type="email"` `autocomplete="email"`, thêm `autocapitalize="off"` `spellcheck="false"`; mã `inputmode="numeric"` `autocomplete="one-time-code"`; mật khẩu `autocomplete="current-password"`. Tab theo thứ tự: ô → nút phụ trong ô → nút chính → nút phụ → link.
- **Focus nhìn thấy:** dùng `:focus-visible` toàn cục (2px `--brand`) và viền đậm cho ô; không `outline: none` ngoài `h1` (focus lập trình, không phải tab stop).
- **Tương phản:** chữ trên trắng dùng `--ink`/`--muted` (≥7:1); lỗi `--required` `#d9080d` trên trắng ≈ 5.2:1, trên `#fdecec` ≈ 4.6:1 (đạt AA). Nút disabled xám là ngoại lệ trạng thái vô hiệu.
- **Link pháp lý** (Chính sách bảo mật, Điều khoản) mở tab mới (`target="_blank" rel="noopener"`, thêm `.sr-only` " (mở tab mới)") để không mất email đang gõ.
- `prefers-reduced-motion` đã tắt chuyển động toàn cục.

## 6. Thay đổi so với UI hiện tại

Visual (bố cục, màu, kích thước, thứ tự thành phần) **không đổi**. Chỉ các thay đổi sau để đạt AC hoặc checklist:

1. Bước email: bỏ khoảng trắng hai đầu **trước** khi kiểm hợp lệ (hiện `Validators.email` làm `"  Minh@Example.COM "` thành lỗi); kiểm thêm độ dài 6–254 (AC-AUTH-01, 02).
2. Thông báo "thao tác quá nhanh" có số N (giây hoặc phút) thay cho "ít phút" (AC-AUTH-05, 15).
3. Thêm thông báo khoá tạm mã (15 phút) và khoá tạm mật khẩu (15 phút, kèm gợi ý đăng nhập bằng mã xác thực), AC-AUTH-20, 44.
4. Thêm thông báo tài khoản tạm khóa kèm email hỗ trợ dạng link `mailto:` (cần `.form-error` chứa liên kết, hiện chỉ là chuỗi thuần); BR-AUTH-19.
5. Lỗi liên quan ô mã (sai/hết hạn/khoá/gửi lại bị chặn) hiện **dưới ô mã** thay vì `.form-error` cuối form; sau khi báo lỗi focus về ô mã (checklist "error nằm gần field").
6. Đếm ngược: bỏ `aria-live` cho từng giây; thêm vùng `.sr-only` thông báo theo mốc. Phản hồi "chờ gửi lại" từ máy chủ xử lý như thành công (đếm ngược), không phải lỗi (AC-AUTH-14).
7. Đổi chữ cho thống nhất thuật ngữ: nhãn ô "Mã số (8 số)" → "Mã xác thực (8 số)"; nút "Sử dụng mã xác thực 1 lần" → "Sử dụng mã xác thực".
8. `aria-describedby` của ô mã nối thêm id lỗi; thêm `autocapitalize="off"` `spellcheck="false"` cho ô email.
9. Link pháp lý mở tab mới.
10. Trạng thái "đang khôi phục phiên" (xem 3.4) và chuyển ngay nếu đã đăng nhập (BR-AUTH-25, 30).
11. Nên (Should, BR Should "chuẩn hoá mã khi dán"): ô mã bỏ `maxlength="8"` cứng, lọc chỉ giữ chữ số rồi cắt còn 8, để dán "1234 5678" hoặc "1234-5678" vẫn nhận (hiện bị cắt thành "1234 567").
12. Ghi chú logic cho Frontend (không phải visual): `AuthFlowState.setReturnUrl` hiện chỉ kiểm `/` và `//`; cần đủ quy tắc BR-AUTH-31 (không `\`, không `://`, không `/auth/…`, không `/admin/login`, ≤512 ký tự).
13. Đóng băng nút khi đang xử lý đã đạt; giữ nguyên.

## 7. Câu hỏi

1. Khi bị khoá mã 15 phút ở bước mã, có muốn tự chuyển người dùng sang bước mật khẩu không, hay chỉ hiện thông báo (spec đề xuất: chỉ thông báo, nút "Sử dụng mật khẩu" làm lối thoát; không tự chuyển)?
2. Thông báo khi gửi lại bị chặn bởi giới hạn 5 lần/30 phút: PRD cho "kèm số phút chờ" nhưng chưa có câu chữ riêng; spec dùng "Bạn thao tác quá nhanh. Vui lòng thử lại sau N phút." (PO xác nhận).
3. Email hỗ trợ hiện dạng link `mailto:` hay chỉ chữ? Spec dùng `mailto:` (Backend/PO không cần quyết định gì thêm nếu đồng ý).
