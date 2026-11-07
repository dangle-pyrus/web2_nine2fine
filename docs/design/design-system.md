# Design system nine2fine (tóm tắt cho Slice 1 Auth)

Tổng hợp từ code hiện có, không thêm token hay component mới. Gốc đọc: `frontend/src/styles.scss`, `frontend/src/app/features/auth/ui/*`, `frontend/src/app/shared/ui/*`, `frontend/document/admin/admin-design-guideline.md` (phụ lục A), master plan mục 19, 39, 43, 44.

Lưu ý phạm vi bản sao: `AuthLayout` (khung ngoài đặt biến `--u`), `shared/commerce/*`, `admin/ui/*`, `admin/layout/*`, `admin/styles/admin.scss` không có trong bản sao chỉ đọc. Các spec không mô tả khung ngoài của AuthLayout; Frontend giữ nguyên.

## 1. Token storefront (`frontend/src/styles.scss`, `:root`)

| Token | Giá trị | Dùng cho trong auth |
| --- | --- | --- |
| `--ink` | `#111111` | Chữ chính, viền ô nhập, nền nút primary |
| `--heading` | `#171717` | `h1` |
| `--muted` | `#595959` | Nhãn nổi, hint, link phụ (tương phản ≈ 7:1 trên trắng) |
| `--line` | `#d9d9d9` | Viền nút outline, đường kẻ "hoặc" |
| `--surface` | `#f4f4f4` | Nền `.notice` |
| `--required` | `#d9080d` | Dấu `*`, viền và chữ lỗi |
| `--brand` | `#d9070c` | Vòng focus (`:focus-visible`: 2px, offset 4px) |
| `--radius-card` | 12px | Ô nhập |
| `--radius-button` | 6px | `.form-error`, `.notice` |
| `--font-sans` | Nunito Sans | Toàn bộ |
| `--page-gutter` | 48 / 32 (≤1100px) / 16 (≤800px) | Lề trang |
| `--u` | do AuthLayout đặt (thang theo khung Figma 1920px) | Mọi kích thước trong `auth-form.scss` |

Giá trị cứng trong `auth-form.scss` chưa là token: `#fdecec` (nền `.form-error`), `#a6a6a6` (nút disabled), `#333` (hover nút), `#9a9a9a` (quy tắc mật khẩu chưa đạt, xem "Thay đổi" ở `auth-forgot-password.md`). Không tạo token mới; chỉ đổi `#9a9a9a` sang `--muted`.

Breakpoint storefront: 1100px, 800px. Reduced motion đã được xử lý toàn cục.

## 2. Component dùng chung

| Thành phần | Đường dẫn | Ghi chú |
| --- | --- | --- |
| Kiểu form auth (`.field` nhãn nổi, `.field-error`, `.form-error`, `.notice`, `.hint`, `.legal`, `.pill`, `.pill.outline`, `.pill.wide`, `.actions`, `.stack`, `.divider`, `.email-row`, `.link`, `.lead`) | `frontend/src/app/features/auth/ui/auth-form.scss` | Đo từ Figma 12:41, 43:1134, 47:1197, 43:1058, 50:53 |
| Ô mã xác thực 8 số + gửi lại + đếm ngược | `features/auth/ui/verification-code-field.ts` (`n2f-verification-code-field`) | Tự gửi mã khi hiện; `autocomplete="one-time-code"`, `inputmode="numeric"` |
| Ô mật khẩu + nút hiện/ẩn + danh sách quy tắc | `features/auth/ui/password-field.ts` (`n2f-password-field`) | `autocomplete` `current-password` / `new-password` |
| Thông báo lỗi, quy tắc mật khẩu, mẫu kiểm tra | `features/auth/auth-messages.ts` | Bảng chữ lỗi tập trung một chỗ |
| Trạng thái luồng (email, returnUrl) | `features/auth/auth-session.ts` (`AuthFlowState`, `AuthSession`) | Email không lên URL |
| Icon | `shared/ui/icon.component.ts` (`n2f-icon`, bộ Reicon) | Dùng: `reiconRefresh`, `reiconEye`, `reiconEyeOff`, `reiconCheckCircle`, `reiconXCircle` |
| Lớp tiện ích | `styles.scss`: `.sr-only`, `.skeleton`, `.skip-link` | Văn bản chỉ cho trình đọc màn hình |
| Toast, empty-state, confirm-dialog, overlay | `shared/ui/*` | Slice 1 Auth không dùng (xem từng spec) |

## 3. Admin (`/admin/login`)

Admin là bundle riêng, mọi rule dưới `.adm`, token tiền tố `--adm-` (guideline phụ lục A). Dùng ở trang đăng nhập admin: `--adm-sidebar` (nền trang), `--adm-bg` (panel), `--adm-divider`, `--adm-text*`, `--adm-primary` `#111111`, focus vòng 2px đen offset 2px; nút `.adm-btn--primary .adm-btn--lg`; ô nhập `.input` với nhãn luôn nằm trên; banner `.banner .banner--critical` (+ `AdmIcon reiconAlertCircle`). Màu trạng thái chỉ 5 tone semantic (Critical `#FEF2F2` / `#B91C1C`, Info `#EFF6FF` / `#1D4ED8`, Warning `#FFFBEB` / `#B45309`…). Không dùng đỏ thương hiệu trong admin.

## 4. Thuật ngữ thống nhất cho auth (áp dụng mọi màn hình)

| Dùng | Không dùng | Ghi chú |
| --- | --- | --- |
| **mã xác thực** | OTP, mã số, mã 1 lần, mã xác minh | Nhãn ô: "Mã xác thực (8 số)". PRD cũng dùng "mã xác thực" trong thông báo lỗi. |
| **đăng nhập** / **đăng ký** | login, sign in, tham gia (trừ tiêu đề bước email đã có từ Figma) | |
| **mật khẩu** | pass, password | |
| **Tên** (tên gọi) / **Họ** (họ và tên đệm) | | Nhãn giữ "Tên", "Họ" (Figma); xem câu hỏi trong `auth-register.md`. |
| **gửi lại mã** | gửi lại OTP | |
| **tạm khóa** (thông báo) / **khoá** (nội bộ) | | Theo PRD BR-AUTH-19, câu hiển thị viết "tạm khóa". |
| **email** (viết thường) | e-mail, Email trong câu | Nhãn ô giữ "Email"; link "Chỉnh sửa Email" giữ nguyên theo PRD. |

## 5. Quy tắc dùng chung

1. **Định dạng thời gian chờ N** (mọi thông báo có số): N < 60 giây → "N giây"; còn lại làm tròn lên → "N phút". Ví dụ 40 → "40 giây", 61 → "2 phút", 900 → "15 phút". Số lấy từ máy chủ (BR-AUTH-06, 08, 18), FE không tự đếm.
2. **Vị trí lỗi:** lỗi thuộc một ô hiện ngay dưới ô (`.field-error`, `aria-describedby`, `aria-invalid="true"`). Lỗi chung của cả form hiện ở `.form-error` ngay trên hàng nút (`role="alert"`). Lỗi liên quan mã xác thực (sai, hết hạn, khoá) đặt dưới ô mã vì form đăng ký dài.
3. **Thông báo tình trạng (không phải lỗi)** dùng `.notice` với `role="status"` (ví dụ "Đã cập nhật mật khẩu…", "Phiên đăng nhập đã hết hạn…").
4. **Nút đang xử lý:** nút `disabled`, đổi chữ sang dạng "Đang … …" (có dấu "…"), bấm hay Enter lặp lại không gửi thêm (BR-AUTH-38).
5. **Chuyển bước:** focus vào `h1` (`tabindex="-1"`) sau khi bước mới hiển thị; xoá mã/mật khẩu đã gõ, giữ email (BR-AUTH-16).
6. **Mất mạng / lỗi máy chủ:** luôn "Không thể kết nối. Vui lòng thử lại." (BR-AUTH-36, AC-AUTH-94), giữ nguyên dữ liệu đã nhập.
7. **Không lộ thông tin:** sai mã dùng đúng một câu cho mọi nguyên nhân; sai đăng nhập dùng đúng một câu (BR-AUTH-03, 08, 17). FE không thêm "còn N lần thử".
8. **Chế độ mock:** dòng "Chế độ trải nghiệm: dùng mã …" chỉ hiện khi `API_CONFIG.mode === 'mock'`, không bao giờ trong chế độ HTTP.

## 6. Component mới đề xuất

Không có.
