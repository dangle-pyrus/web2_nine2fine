# Spec: Quên / đặt lại mật khẩu `/auth/forgot-password`

Phạm vi: Slice 1 Auth. Giữ nguyên visual Figma 50:53. Đây cũng là cách duy nhất để thành viên chưa có mật khẩu tạo mật khẩu lần đầu (Slice 1). Code hiện có: `frontend/src/app/features/auth/forgot-password-page.ts`, `ui/password-field.ts`, `ui/verification-code-field.ts`, `auth-messages.ts`, `ui/auth-form.scss`. Token và quy tắc chung: `design-system.md`.

## 1. Luồng

```
/auth/login bước mật khẩu --"Quên mật khẩu"--> /auth/forgot-password
  mở thẳng khi chưa có email trong bộ nhớ ---> chuyển /auth/login (bước email)
Trang hiện: tự gửi mã mục đích đặt lại (cho dù email không có tài khoản, phản hồi vẫn như thành công; BR-AUTH-03)
Điền: mã xác thực + mật khẩu mới + nhập lại --> "Đổi mật khẩu"
  |-- thành công: mật khẩu mới có hiệu lực, MỌI phiên cũ bị kết thúc, KHÔNG tự đăng nhập
  |      --> /auth/login bước mật khẩu + .notice "Đã cập nhật mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới."
  |-- "Hủy bỏ" --> /auth/login bước email, không đổi gì
  |-- "Chỉnh sửa Email" --> /auth/login bước email
```

Dữ liệu màn hình cần: email (từ bước 1), mã 8 số, mật khẩu mới, nhập lại, số giây chờ gửi lại; lỗi theo trường và lỗi ổn định. Mật khẩu chỉ gửi một lần khi nộp; không bao giờ hiển thị lại sau khi lưu.

## 2. Bố cục

`h1` (`tabindex="-1"`) "Xác nhận email và cập nhật mật khẩu mới cho tài khoản của bạn." → `.lead` "Chúng tôi đã gửi mã xác thực đến" → `.email-row` (email + "Chỉnh sửa Email") → form:

1. `n2f-verification-code-field` (id `reset-code`, purpose đặt lại mật khẩu)
2. `n2f-password-field` **Mật khẩu mới** (`new-password`, `showRules`) kèm danh sách quy tắc
3. `n2f-password-field` **Nhập lại mật khẩu mới** (`new-password`, lỗi "Mật khẩu nhập lại chưa khớp.")
4. `.form-error`
5. `.actions`: `.pill.outline` "Hủy bỏ" (link) + `.pill` "Đổi mật khẩu" (CTA primary, bên phải)

Nút "Đổi mật khẩu" **khoá cho đến khi form hợp lệ** (đúng Figma 50:53), vì danh sách quy tắc và lỗi khớp đã nói rõ lý do.

### Danh sách quy tắc mật khẩu (BR-AUTH-20), mỗi dòng có icon `reiconCheckCircle` (đạt) / `reiconXCircle` (chưa đạt)

1. "Từ 8 đến 64 ký tự."
2. "Có ít nhất 1 chữ in hoa (A–Z)."
3. "Có ít nhất 1 chữ số (0–9)."
4. "Không trùng với email của bạn." (so sánh không phân biệt hoa thường)

Mỗi dòng đọc kèm `.sr-only` " Đã đạt." / " Chưa đạt." (đã có).

## 3. Bảng trạng thái

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Vào trang | Focus `h1`; tự gửi mã; hint "Đang gửi mã…" → "Gửi lại mã trong N giây"; nút "Đổi mật khẩu" khoá; các quy tắc ở trạng thái chưa đạt | AC-AUTH-57 |
| Chưa có email trong bộ nhớ | Không render form; chuyển `/auth/login` | |
| Lỗi mã (FE) | Dưới ô mã: "Nhập đủ 8 chữ số của mã xác thực." | AC-AUTH-23 |
| Quy tắc chưa đạt | Dòng quy tắc tương ứng ở trạng thái "Chưa đạt" khi gõ (ví dụ `Abc1234` 7 ký tự, `abcdefg1` thiếu in hoa, `ABCDEFGH` thiếu số, 65 ký tự, trùng email như `MINH1@EXAMPLE.COM`); nút "Đổi mật khẩu" khoá | AC-AUTH-51, 51b |
| Nhập lại không khớp | Dưới ô nhập lại: "Mật khẩu nhập lại chưa khớp."; nút khoá. Kiểm lại cả khi sửa ô mật khẩu mới (đã có) | AC-AUTH-52 |
| Hợp lệ | Mọi quy tắc "Đã đạt", khớp, mã đủ 8 số → nút bật. 64 ký tự đúng vẫn hợp lệ | AC-AUTH-54 |
| Loading | Nút "Đang cập nhật…" `disabled`; mọi ô giữ nguyên; bấm/Enter lặp lại không gửi thêm | BR-AUTH-38 |
| Mã sai / hết hạn / đã dùng (kể cả dùng lại mã vừa đặt lại) | Dưới ô mã, focus ô mã: "Mã xác thực không đúng hoặc đã hết hạn." | AC-AUTH-59 |
| Khoá mã (sai 5 lần) | Dưới ô mã: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau N phút." | AC-AUTH-20 |
| Gửi lại bị chặn | Dưới ô mã: "Bạn thao tác quá nhanh. Vui lòng thử lại sau N phút." | AC-AUTH-15 |
| Máy chủ từ chối mật khẩu (khi FE bị bỏ qua) | Dưới ô mật khẩu mới: "Mật khẩu chưa đạt yêu cầu. Xem các điều kiện bên dưới." Mã chưa bị dùng, nhập lại được | AC-AUTH-53 |
| Email có tài khoản bị vô hiệu | Mã không được gửi; nhập mã bất kỳ nhận "Mã xác thực không đúng hoặc đã hết hạn." (không lộ trạng thái). Thông báo "tạm khóa" chỉ hiện sau khi xác thực đúng, mà luồng đặt lại không có bước đó, nên không hiện ở trang này | BR-AUTH-03, 19 |
| Mất mạng / lỗi máy chủ | `.form-error`: "Không thể kết nối. Vui lòng thử lại." Mã và hai mật khẩu giữ nguyên; bấm lại để thử | AC-AUTH-94 |
| Success | Chuyển `/auth/login` bước mật khẩu với `.notice` "Đã cập nhật mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới." (`role="status"`); email điền sẵn; có thể đăng nhập ngay kể cả đang bị khoá mật khẩu | AC-AUTH-56, 58 |
| "Hủy bỏ" | Về bước email, không đổi mật khẩu | AC-AUTH-60 |
| Empty / disabled | Nút "Đổi mật khẩu" disabled khi chưa hợp lệ hoặc đang loading; nút gửi lại disabled khi đang đếm ngược | |

## 4. Responsive

| Khung | Hành vi |
| --- | --- |
| Desktop / tablet | Một cột; `.actions` căn phải, "Hủy bỏ" bên trái nút "Đổi mật khẩu" |
| Mobile (≤800px) | Lề 16px; hai nút trong `.actions` xuống hàng nếu không đủ chỗ (đã `flex-wrap`), mỗi nút cao ≥48px; danh sách quy tắc chữ ≥13px, không cắt dòng; nút hiện/ẩn mật khẩu vùng bấm ≥44px |
| 320px | Không cuộn ngang; `margin-top` lớn của `.actions` (64 × `--u`) không đẩy nút ra ngoài màn hình quá xa |

## 5. Accessibility

- **Nhãn:** "Mã xác thực (8 số)", "Mật khẩu mới", "Nhập lại mật khẩu mới"; mỗi ô `<label for>`; nút hiện/ẩn có `aria-label` + `aria-pressed`.
- **autocomplete:** mã `one-time-code`; cả hai ô mật khẩu `new-password` (trình quản lý mật khẩu đề xuất mật khẩu mạnh, không điền mật khẩu cũ).
- **Quy tắc mật khẩu:** danh sách `<ul>` nối vào ô bằng `aria-describedby`; trạng thái đạt/chưa đạt có chữ cho trình đọc màn hình, không chỉ icon/màu. Không dùng `aria-live` mỗi lần gõ (gây ồn); trình đọc đọc danh sách khi ô nhận focus.
- **Lỗi:** lỗi dưới ô có id nối `aria-describedby`; `aria-invalid="true"` khi có lỗi; lỗi mã `role="alert"`; `.form-error` `role="alert"`.
- **Nút khoá:** nút disabled không nhận focus; vì vậy lý do khoá phải luôn nhìn thấy được qua danh sách quy tắc và lỗi khớp (đã đảm bảo). Nếu thử nghiệm cho thấy người dùng bàn phím khó hiểu, chuyển sang `aria-disabled` + hiện lỗi khi bấm (xem Câu hỏi 2).
- **Focus:** vào trang → `h1` (`tabindex="-1"`, hiện chưa có); sai mã → focus ô mã; thành công → trang đăng nhập đặt focus `h1`.
- **Tương phản:** quy tắc "chưa đạt" hiện `#9a9a9a` trên trắng ≈ 2,8:1 (không đạt AA cho chữ 13px). Đổi sang `--muted` (`#595959`, ≈ 7:1); "đã đạt" dùng `--ink` + icon check, phân biệt bằng icon và chữ đọc được, không chỉ màu.
- Đếm ngược/gửi lại: như `auth-login.md` mục 5.

## 6. Thay đổi so với UI hiện tại

Visual **không đổi** (cùng bố cục, nút khoá theo Figma). Chỉ:

1. Quy tắc mật khẩu theo BR-AUTH-20: tách 4 dòng (độ dài 8–64, in hoa, chữ số, không trùng email); hiện chỉ có 2 dòng và gộp "in hoa và số" vào một dòng, không kiểm tối đa 64 và không kiểm trùng email (AC-AUTH-51, 51b). Quy tắc "không trùng email" cần email của luồng làm đầu vào.
2. Chữ quy tắc "Tối thiểu 8 ký tự." → "Từ 8 đến 64 ký tự."; "Cần ít nhất 1 ký tự in hoa, và 1 ký tự số." → hai dòng riêng như mục 2.
3. Màu quy tắc chưa đạt: `#9a9a9a` → `var(--muted)` (đạt tương phản).
4. Lỗi liên quan ô mã (sai, khoá, gửi lại bị chặn) hiện dưới ô mã; thêm thông báo khoá mã 15 phút và gửi lại bị chặn (AC-AUTH-20).
5. Thêm lỗi dưới ô mật khẩu mới khi máy chủ từ chối (AC-AUTH-53).
6. `h1` thêm `tabindex="-1"` và focus khi vào trang (khớp trang đăng nhập).
7. Thuật ngữ: "Chúng tôi đã gửi mã số đến" → "Chúng tôi đã gửi mã xác thực đến"; nhãn ô "Mã số (8 số)" → "Mã xác thực (8 số)".
8. Đếm ngược `aria-live` theo mốc (như `auth-login.md`).
9. Giữ nguyên: nút "Hủy bỏ", "Đổi mật khẩu", thông báo thành công, hành vi không tự đăng nhập, ô nhập lại và câu "Mật khẩu nhập lại chưa khớp.".

## 7. Câu hỏi

1. Câu lỗi cho trường hợp máy chủ từ chối mật khẩu ("Mật khẩu chưa đạt yêu cầu. Xem các điều kiện bên dưới.") là đề xuất; PO xác nhận câu chữ.
2. Giữ nút "Đổi mật khẩu" khoá theo Figma, hay chuyển sang cách luôn bật + hiện lỗi khi bấm như trang đăng ký (nhất quán hơn, thân thiện bàn phím hơn)? Spec giữ cách của Figma.
3. Có hiển thị tổng số ký tự hoặc ô "Hiện mật khẩu" cho ô nhập lại? Spec: không đổi (đã có nút hiện/ẩn ở cả hai ô).
