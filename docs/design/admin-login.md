# Spec: Đăng nhập quản trị `/admin/login`

Phạm vi: Slice 1 Auth (BR-AUTH-33, 34; chốt 2026-11-07: staff/admin đăng nhập ở trang riêng). Trang này **không** thuộc nhóm Figma của storefront; dùng design system admin (`.adm`, `--adm-*`). Code hiện có: `frontend/src/app/admin/features/auth/login-page.ts`, `frontend/src/app/admin/core/admin-session.ts`; guideline: `frontend/document/admin/admin-design-guideline.md` (phụ lục A, mục 5.6 banner). Chung: `design-system.md`.

Lưu ý bản sao chỉ đọc không có `admin/ui/*`, `admin/layout/*`, `admin/styles/admin.scss`; tên class `.banner`, `.adm-btn`, `.input`, `.field` lấy từ template đang dùng, Frontend kiểm lại biến thể banner trung tính.

## 1. Luồng

```
Khách mở /admin hoặc /admin/... --> chuyển /admin/login?returnUrl=<đường dẫn đã mở>   [AC-AUTH-86]
Nhập email + mật khẩu --> "Đăng nhập"
  |-- thành công (staff/admin): tạo phiên (hết sau 8 giờ không hoạt động / tối đa 24 giờ) --> returnUrl hợp lệ hoặc /admin
  |-- thất bại: lỗi dạng banner trên form, ở lại trang
Member đã đăng nhập mở /admin --> về /new-in, không hiện gì của admin   [AC-AUTH-87]
Phiên staff hết hạn giữa chừng --> /admin/login?returnUrl=... + banner "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
```

Chỉ đăng nhập bằng mật khẩu (không có bước mã, không có đăng ký, không có "Quên mật khẩu" trên trang này). Tài khoản staff/admin do admin tạo/seed, mật khẩu theo BR-AUTH-20.

Dữ liệu màn hình cần: email, mật khẩu; hồ sơ phiên có `role` (staff/admin) sau đăng nhập; mã lỗi ổn định kèm số giây còn lại khi khoá (Backend chốt hợp đồng).

## 2. Bố cục (giữ nguyên)

Nền trang `--adm-sidebar` → panel 400px (`--adm-bg`, bo 20px, padding 32px) căn giữa, gồm: logo nine2fine (`/assets/brand/logo-typho.svg`, cao 22px) → `h1` "Đăng nhập quản trị" + `.secondary` "Dành cho nhân viên nine2fine." → (tuỳ) banner lỗi `banner--critical` có `AdmIcon reiconAlertCircle` → ô **Email** (nhãn nằm trên ô) → ô **Mật khẩu** → nút `.adm-btn--primary .adm-btn--lg` "Đăng nhập" (rộng 100%).

Một CTA duy nhất. Không dùng đỏ thương hiệu (guideline A.2).

## 3. Bảng trạng thái

| Trạng thái | Hiển thị | AC |
| --- | --- | --- |
| Mặc định | Hai ô trống; nút "Đăng nhập" bật (xem Thay đổi 3) | |
| Lỗi nhập (FE) | Dưới ô: "Nhập email." / "Nhập địa chỉ email hợp lệ." / "Nhập mật khẩu." Không gửi yêu cầu | BR-AUTH-17 |
| Loading | Nút `disabled` + `aria-busy="true"`, chữ "Đang đăng nhập…" (kèm `is-busy`); ô giữ nguyên; bấm/Enter lặp lại không gửi thêm | BR-AUTH-38 |
| Sai thông tin (email không tồn tại, chưa có mật khẩu, sai mật khẩu) | Banner critical: "Email hoặc mật khẩu chưa đúng." | AC-AUTH-42 |
| Khoá tạm (5 lần sai/15 phút) | Banner critical: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau N phút." (không nhắc "đăng nhập bằng mã xác thực" vì trang này không có lựa chọn đó; Câu hỏi 1) | AC-AUTH-44 |
| Quá nhiều lần thử từ một IP | Banner critical: "Bạn thao tác quá nhanh. Vui lòng thử lại sau N phút." | AC-AUTH-48 |
| Tài khoản bị vô hiệu (mật khẩu đúng) | Banner critical: "Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ nine2fine để được hỗ trợ." + "Email hỗ trợ: phthang0872@gmail.com" (link `mailto:`) | AC-AUTH-50 |
| Tài khoản member nhập đúng ở trang này | Hiện như "Email hoặc mật khẩu chưa đúng." (đề xuất, không gợi ý khu admin tồn tại cho member); Câu hỏi 2 | BR-AUTH-34 |
| Phiên hết hạn giữa chừng | Banner (trung tính/cảnh báo) phía trên form: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." | BR-AUTH-26 |
| Mất mạng / lỗi máy chủ | Banner critical: "Không thể kết nối. Vui lòng thử lại." Email giữ nguyên; mật khẩu giữ nguyên | AC-AUTH-94 |
| Success | Chuyển returnUrl hợp lệ hoặc `/admin`; staff mới đăng nhập vào `/admin` nhìn thấy đúng module theo quyền | AC-AUTH-79 |
| Đang khôi phục phiên (staff tải lại `/admin`) | Giữ nguyên trang đích, không nháy sang `/admin/login`; quá 10 giây hoặc lỗi mạng mới chuyển đăng nhập kèm returnUrl | AC-AUTH-65, 67 |
| Empty | Không có | |
| Disabled | Nút chỉ disabled khi loading | |

## 4. Responsive

Breakpoint admin: 1440 / 1024 / 768 (khác storefront). Trang là một panel đơn:

| Khung | Hành vi |
| --- | --- |
| Desktop / tablet | Panel `min(400px, 100%)` giữa màn hình; nền `--adm-sidebar` |
| Mobile (<768px) | Lề 16px (đã có `padding: 24px 16px`); panel rộng 100%; chữ trong ô nhập 16px để iOS không tự phóng to (guideline A.2 mục 12); nút cao ≥44px |
| 320px | Không cuộn ngang; banner xuống dòng, không cắt chữ |

## 5. Accessibility

- **Nhãn:** nhãn luôn nằm trên ô (không placeholder, không nhãn nổi), `<label for>`; `required` đã có.
- **autocomplete:** email `autocomplete="username"`, mật khẩu `autocomplete="current-password"` (đã đạt). Thêm `autocapitalize="off"` `spellcheck="false"` cho ô email.
- **Lỗi:** banner `role="alert"` (đã có), nội dung không chỉ dựa vào màu (có icon `reiconAlertCircle` + chữ). Lỗi theo ô (nhập thiếu) dưới ô, `aria-invalid`, `aria-describedby`.
- **Focus:** tải trang → focus vào `h1`? Không; trang chỉ có một form ngắn, để focus tự nhiên ở đầu tài liệu. Sau khi báo lỗi gửi: banner được đọc bằng `role="alert"`, focus giữ ở nút để thử lại. Khi FE chặn vì thiếu dữ liệu: focus ô lỗi đầu tiên.
- **Focus nhìn thấy:** vòng 2px đen, cách 2px (guideline A.2 mục 13); ô khi focus viền đen + bóng 1px.
- **Tương phản:** màu critical `#B91C1C` trên `#FEF2F2` ≈ 6:1 (đạt AA).
- **Nút disabled:** không dùng nút khoá vì thiếu dữ liệu (xem Thay đổi 3) để người dùng bàn phím không gặp nút không focus được mà không biết lý do.
- **Loading ban đầu:** host `opacity: 0` đến khi stylesheet admin tải xong; cần phương án dự phòng (hết thời gian chờ vẫn hiện nội dung) để không có trang trắng khi tải CSS lỗi (master plan mục 43).

## 6. Thay đổi so với UI hiện tại

Visual (panel, logo, banner, nút) **không đổi**. Chỉ:

1. **Bỏ khối "Tài khoản demo (chế độ mock)"** với `admin123` / `staff123`: mật khẩu vi phạm BR-AUTH-20 và là cửa hậu nếu lên môi trường thật (PRD D21, BR-AUTH-35: không có mật khẩu biết trước trong mock/fixture commit vào repo). Khi chạy mock, Frontend dùng dữ liệu mock tuân BR-AUTH-20 và không in mật khẩu ra giao diện.
2. Nút khi loading: `disabled` + chữ "Đang đăng nhập…" + `aria-busy` (hiện chỉ thêm class `is-busy`, nút vẫn bấm được; logic chặn gửi lặp đã có trong `submit()`), BR-AUTH-38.
3. Nút "Đăng nhập" luôn bật; thiếu email hoặc mật khẩu thì bấm hiện lỗi dưới ô (hiện nút khoá khi trống, không báo lý do, người dùng bàn phím không biết vì sao). Mức Should.
4. Thêm các thông báo: khoá tạm, quá nhanh, tài khoản tạm khóa kèm email hỗ trợ, phiên hết hạn (hiện mọi lỗi lấy từ `errorMessage()` chung, chưa có bảng chữ theo AC).
5. `returnUrl` dùng cùng quy tắc kiểm BR-AUTH-31 như storefront (hiện chỉ cần bắt đầu bằng `/admin`; còn cần loại `//`, `\`, `://`, `/admin/login`, >512 ký tự).
6. Đã đăng nhập staff/admin mở `/admin/login`: chuyển ngay (Câu hỏi 3).
7. Thêm `autocapitalize="off"` `spellcheck="false"` cho ô email.
8. Giữ nguyên: nhãn trên ô, `h1` "Đăng nhập quản trị", dòng "Dành cho nhân viên nine2fine.", logo `alt="nine2fine"`.

## 7. Câu hỏi

1. Trang này chỉ có mật khẩu. Khi staff bị khoá mật khẩu 15 phút (BR-AUTH-18) họ không có đường thay thế bằng mã xác thực như storefront. Chấp nhận (chờ 15 phút), hay thêm lựa chọn mã xác thực cho staff? Spec chọn chấp nhận và dùng câu khoá không nhắc mã.
2. Member (hoặc khách đã có tài khoản) nhập đúng email + mật khẩu ở `/admin/login`: PRD chưa nói. Đề xuất coi như sai thông tin (không đăng nhập, không lộ khu admin). PO/Backend xác nhận.
3. Staff/admin đã đăng nhập mở `/admin/login`: BR-AUTH-30 chỉ liệt kê `/auth/*`. Đề xuất chuyển ngay tới returnUrl hợp lệ hoặc `/admin`. PO xác nhận.
4. Banner "phiên hết hạn" dùng tone nào (Info `#EFF6FF` hay Warning `#FFFBEB`, hoặc critical)? Spec đề xuất Info (không phải lỗi người dùng gây ra); Frontend xác nhận class có sẵn.
5. returnUrl của staff có được trỏ ra ngoài `/admin` (ví dụ trang storefront) không? BR-AUTH-31 nói áp quy tắc chung; code hiện giới hạn `/admin`. Spec: theo BR-AUTH-31, PO xác nhận.
