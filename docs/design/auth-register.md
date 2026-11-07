# Spec: Đăng ký `/auth/register`

Phạm vi: Slice 1 Auth. Giữ nguyên visual Figma 43:1058. Code hiện có: `frontend/src/app/features/auth/register-page.ts`, `ui/verification-code-field.ts`, `ui/auth-form.scss`, `auth-messages.ts`. Token và quy tắc chung: `design-system.md`.

## 1. Luồng

```
/auth/login (email chưa đăng ký) --> /auth/register   (email lấy từ bộ nhớ, không lên URL)
  mở thẳng khi chưa có email (tab mới / tải lại) ---> chuyển /auth/login, bước email   [AC-AUTH-30]
Tự gửi mã mục đích đăng ký khi trang hiện.
Điền: mã xác thực, Tên, Họ, (Ngày sinh), (tick marketing), tick điều khoản --> "Tạo tài khoản"
  |-- thành công: tạo member, đăng nhập luôn --> returnUrl hoặc /new-in (+ lưu yêu thích đang chờ nếu có)
  |-- "Chỉnh sửa Email" --> /auth/login bước email (email điền sẵn)
  |-- email đã có tài khoản (hai tab) --> lỗi "Email này đã có tài khoản…" + link Đăng nhập
Không thu mật khẩu khi đăng ký (tạo mật khẩu qua "Quên mật khẩu").
```

Dữ liệu màn hình cần: email (từ bước 1), mã 8 số, Tên, Họ, ngày sinh (ngày/tháng/năm, tuỳ chọn), cờ nhận email marketing, cờ đồng ý điều khoản; số giây chờ gửi lại; hồ sơ sau đăng ký; lỗi theo trường và lỗi ổn định (Backend chốt hợp đồng). Tên/Họ gửi dạng đã bỏ khoảng trắng thừa.

## 2. Bố cục

`h1` (`tabindex="-1"`) "Giờ hãy thực hiện một bước cuối để trở thành thành viên nine2fine." → `.lead` "Chúng tôi đã gửi mã xác thực đến" → `.email-row` (email + link "Chỉnh sửa Email") → form:

1. `n2f-verification-code-field` (id `register-code`, purpose đăng ký)
2. Hàng 2 cột `.name-row`: ô **Tên** (`given-name`), ô **Họ** (`family-name`), mỗi ô kèm `.field-error` bên dưới
3. `fieldset` **Ngày sinh**: `.date-row` 3 ô (Ngày, Tháng, Năm; `inputmode="numeric"`, `bday-day/month/year`), `.field-error`, `.hint` "Nhận ưu đãi thành viên khi đến ngày sinh nhật của bạn"
4. Checkbox marketing (mặc định **không tick**): "Đăng ký nhận email để nhận cập nhật từ nine2fine về sản phẩm, ưu đãi và các quyền lợi dành cho thành viên."
5. Checkbox điều khoản (bắt buộc): "Tôi đồng ý với Chính sách bảo mật và Điều khoản sử dụng của nine2fine." + `.field-error`
6. `.form-error` (lỗi chung)
7. `.actions`: 1 `.pill` "Tạo tài khoản" (CTA duy nhất)

Nút "Tạo tài khoản" luôn bật (không khoá theo hợp lệ); bấm khi chưa hợp lệ thì hiện lỗi từng trường và focus ô lỗi đầu tiên. Khác trang đặt lại mật khẩu (nút khoá theo Figma 50:53).

## 3. Bảng trạng thái

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Vào trang | Focus `h1`; tự gửi mã; hint "Đang gửi mã…" rồi "Gửi lại mã trong N giây"; checkbox marketing chưa tick | AC-AUTH-35 |
| Chưa có email trong bộ nhớ | Không render form; chuyển `/auth/login` | AC-AUTH-30 |
| Empty (mới vào) | Mọi ô trống; ngày sinh trống là hợp lệ | AC-AUTH-31 |
| Lỗi mã (FE) | Dưới ô mã: "Nhập đủ 8 chữ số của mã xác thực." | AC-AUTH-23 |
| Lỗi Tên trống/chỉ khoảng trắng | "Nhập tên của bạn." | AC-AUTH-27, 28 |
| Lỗi Họ trống/chỉ khoảng trắng | "Nhập họ của bạn." | AC-AUTH-27, 28 |
| Tên/Họ chứa ký tự không cho phép (số, `<`, `>`, ký hiệu) | "Tên chỉ gồm chữ cái, dấu cách, dấu ' và dấu -." / "Họ chỉ gồm chữ cái, dấu cách, dấu ' và dấu -." (đề xuất câu chữ, xem Câu hỏi 3) | AC-AUTH-28 |
| Tên/Họ quá 50 ký tự (sau khi gộp khoảng trắng) | "Tên tối đa 50 ký tự." / "Họ tối đa 50 ký tự." | AC-AUTH-28 |
| Ngày sinh điền thiếu, ngày không có thật (31/02/2000), năm <1900 (01/01/1899), ngày trong tương lai | Dưới nhóm ngày sinh: "Ngày sinh chưa hợp lệ." | AC-AUTH-32 |
| Ngày sinh thiếu 1 ngày đủ 13 tuổi (ví dụ 08/11/2013 khi hôm nay 07/11/2026) | Dưới nhóm ngày sinh: "Bạn cần đủ 13 tuổi để tạo tài khoản." Các trường khác giữ nguyên | AC-AUTH-32b |
| Ngày sinh đúng sinh nhật thứ 13 (07/11/2013) | Hợp lệ, tạo được tài khoản | AC-AUTH-32a |
| Năm sinh > năm hiện tại − 10 (2026 → năm lớn nhất là 2016) | Không chọn/nhập được năm lớn hơn 2016: nhập 2017 trở đi hiện "Bạn cần đủ 13 tuổi để tạo tài khoản." (năm 2016 vẫn bị chặn bởi quy tắc 13 tuổi). Xem Câu hỏi 1 về dạng điều khiển | AC-AUTH-32c |
| Chưa tick điều khoản | Dưới checkbox: "Bạn cần đồng ý để tạo tài khoản." (`aria-invalid`) | AC-AUTH-27 |
| Loading | Nút "Đang tạo tài khoản…" `disabled`, giữ trạng thái này đến khi điều hướng xong; bấm 3 lần hoặc Enter liên tục chỉ gửi 1 yêu cầu; mọi ô giữ nguyên | AC-AUTH-96 |
| Mã sai/hết hạn/đã dùng | Dưới ô mã, focus ô mã: "Mã xác thực không đúng hoặc đã hết hạn." | AC-AUTH-93 |
| Khoá mã (sai 5 lần) | Dưới ô mã: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau N phút." | AC-AUTH-20 |
| Gửi lại bị chặn | Dưới ô mã: "Bạn thao tác quá nhanh. Vui lòng thử lại sau N phút." | AC-AUTH-15 |
| Email đã có tài khoản (mã đúng, email có tài khoản) | `.form-error`: "Email này đã có tài khoản. Vui lòng đăng nhập." kèm link "Đăng nhập" tới `/auth/login` | AC-AUTH-37 |
| Mất mạng / lỗi máy chủ | `.form-error`: "Không thể kết nối. Vui lòng thử lại." Mã, Tên, Họ, ngày sinh, các ô tick còn nguyên; bật mạng bấm lại là được. Không tự thử lại | AC-AUTH-97, BR-AUTH-38 |
| Lỗi theo trường do máy chủ trả (khi FE bị bỏ qua) | Hiện dưới đúng trường bằng chính câu của trường đó ở trên | AC-AUTH-28, 32, 33 |
| Success | Chuyển returnUrl hợp lệ hoặc `/new-in`; header hiện trạng thái đăng nhập. Không toast, không trang trung gian | AC-AUTH-39, 80, 82 |
| Disabled | Chỉ nút "Tạo tài khoản" khi đang loading; nút gửi lại khi đang đếm ngược | |

Câu chữ hiển thị cho "tạm khóa" không áp dụng ở đăng ký (tài khoản mới luôn hoạt động).

## 4. Responsive

| Khung | Hành vi |
| --- | --- |
| Desktop / tablet | Hàng Tên–Họ 2 cột bằng nhau; hàng ngày sinh tỷ lệ 1 : 1 : 1,4 |
| Mobile (≤800px) | Giữ 2 cột Tên–Họ và 3 ô ngày sinh (nhãn ngắn, không bị cắt ở 320px); lề 16px; checkbox 20×20 kèm nhãn bấm được (cả dòng); nút "Tạo tài khoản" cao ≥48px |
| 320px | Không cuộn ngang; nhãn dài của checkbox xuống dòng; lỗi dưới ô không bị cắt |

## 5. Accessibility

- **Nhãn:** mỗi ô có `<label for>`; `fieldset`+`legend` "Ngày sinh" nhóm ba ô; hint nối bằng `aria-describedby`. Dấu `*` chỉ trên ô bắt buộc (mã, Tên, Họ); ngày sinh và marketing không có.
- **Lỗi:** mỗi `.field-error` có id, ô tương ứng có `aria-invalid="true"` + `aria-describedby` trỏ id lỗi (ba ô ngày sinh đều trỏ id lỗi ngày sinh; hiện chỉ trỏ hint). Lỗi ngày sinh hiện ngay khi bấm gửi (không chờ chạm cả ba ô như hiện tại nếu người dùng bấm gửi). `role="alert"` cho lỗi ngày sinh (đã có), lỗi mã và `.form-error`.
- **Focus:** vào trang → `h1` (thêm `tabindex="-1"`, hiện chưa có). Bấm gửi khi có lỗi FE → focus ô lỗi đầu tiên theo thứ tự trang. Lỗi mã từ máy chủ → focus ô mã. Thành công → trang đích tự quản lý focus.
- **Bàn phím/điện thoại:** mã `inputmode="numeric"` `autocomplete="one-time-code"`; Tên `given-name`, Họ `family-name`; ngày/tháng/năm `inputmode="numeric"` `bday-*`, `maxlength` 2/2/4. Thêm `autocapitalize="words"` cho Tên và Họ.
- **Link pháp lý** trong nhãn checkbox mở tab mới (`target="_blank" rel="noopener"` + `.sr-only` " (mở tab mới)") để không mất dữ liệu đã điền; hiện đang điều hướng cùng tab và làm mất form.
- **Tương phản:** như `auth-login.md` mục 5.
- **Trình đọc màn hình:** đếm ngược và gửi lại như `auth-login.md` mục 5.

## 6. Thay đổi so với UI hiện tại

Visual **không đổi**. Chỉ:

1. Ràng buộc ngày sinh mới: tuổi tối thiểu 13 (câu "Bạn cần đủ 13 tuổi để tạo tài khoản."), năm tối đa = năm hiện tại − 10, tính theo ngày hiện tại giờ Việt Nam (hiện chỉ kiểm "trước hôm nay"). Tách hai loại lỗi ngày sinh: "chưa hợp lệ" và "chưa đủ 13 tuổi" (AC-AUTH-32, 32a–c).
2. Kiểm Tên/Họ: gộp khoảng trắng, ≤50 ký tự, chỉ chữ cái (kể cả có dấu), dấu cách, `'`, `-` (hiện chỉ kiểm không rỗng); thêm câu lỗi tương ứng (AC-AUTH-28, 29).
3. Lỗi liên quan mã đặt dưới ô mã thay vì `.form-error` cuối form (form dài, lỗi xa ô gây lỗi); thêm trạng thái khoá và gửi lại bị chặn (AC-AUTH-20).
4. "Email này đã có tài khoản. Vui lòng đăng nhập." kèm link "Đăng nhập" (AC-AUTH-37).
5. Giữ trạng thái "Đang tạo tài khoản…" đến khi điều hướng xong (hiện `finalize` mở nút lại ngay sau khi gọi API thành công, có thể bấm thêm lần nữa), AC-AUTH-96.
6. Thêm `tabindex="-1"` cho `h1` và focus khi vào trang; focus ô lỗi đầu tiên khi bấm gửi; `aria-describedby` nối id lỗi cho ô ngày sinh và mã.
7. Thuật ngữ: `.lead` "Chúng tôi đã gửi mã số đến" → "Chúng tôi đã gửi mã xác thực đến"; nhãn ô "Mã số (8 số)" → "Mã xác thực (8 số)" (ô dùng chung).
8. Link pháp lý trong checkbox mở tab mới.
9. Đếm ngược/aria-live như `auth-login.md`.

## 7. Câu hỏi

1. **Bộ chọn năm sinh:** Figma/UI hiện là 3 ô nhập số, không có dropdown. PRD (BR-AUTH-11, AC-AUTH-32c) nói "bộ chọn chỉ cho chọn năm ≤ năm hiện tại − 10". Spec giữ 3 ô nhập, và coi nhập năm > năm hiện tại − 10 là lỗi. Nếu PO muốn dropdown thật (đổi visual) thì cần xác nhận.
2. Nhãn "Họ" nên đổi thành "Họ và tên đệm" để người dùng không nhập "Văn Minh" vào Tên (BR-AUTH-10: Họ = "Nguyễn Văn", Tên = "Minh")? Spec giữ "Họ" theo Figma; đề nghị PO quyết.
3. PRD chưa có câu lỗi riêng cho Tên/Họ sai ký tự hoặc quá dài; spec đề xuất câu ở bảng 3 (PO xác nhận câu chữ).
4. Tên hiển thị đầy đủ ghép "Họ Tên" ("Nguyễn Văn Minh", AC-AUTH-29): FE hiển thị hay Backend trả? (Backend/Frontend chốt, không ảnh hưởng spec).
