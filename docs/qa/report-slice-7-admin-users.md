# QA Slice 7 — Admin khách hàng & nhân viên (2026-11-12, HEAD 3d65a24)

Người kiểm: qa-reviewer (độc lập, không sửa code). Báo cáo do Orchestrator ghi lại từ kết quả của qa-reviewer (công cụ ghi của agent bị chặn).

## Kết luận
Đạt có điều kiện. Blocker 0, Major 1 (đã sửa sau QA), Minor 5. AC (44): Pass 42, Fail 1 (AC-USR-43, Should — đóng cùng M-1), Chưa kiểm được 1 (AC-USR-09 phần Supabase, lát 7.7).

AC-AUTH-75 (AC-USR-26, 27, 29) và AC-AUTH-85 (AC-USR-02): đạt cục bộ (test BE + chạy thật 2 context). Ghi Đạt ở backlog G4 sau lát 7.7.

## Lệnh đã chạy (số thật)
- BE `tsc --noEmit` exit 0; `npm run build` exit 0.
- BE `npm test` toàn bộ: 32/36 file, 493/524 test; 4 file crash worker 0xC0000409 (Windows, đã biết). Chạy lại riêng 7 file (admin-media-hardening, users-*): đều pass (users-foundation crash lần đầu, lần hai 12/12).
- FE lint exit 0, `format:check` sạch, build exit 0, initial 545,83 kB (< 600 kB).
- Playwright toàn bộ `--trace off`: 460 pass, 6 fail, 8 skip (474). 6 fail ngoài slice, đã biết: home:56, operations:58, :103 (desktop + mobile), AC-CART-18 (mobile). `admin-users.spec.ts` pass hết.
- Chạy thật (BE :4000 + FE `start:local` :4200, DB `n2f_dev`, MAIL dev-outbox, Edge): 45/49 bước pass; 4 bước hỏng do lỗi kịch bản QA, chạy lại đúng. Đã kiểm: danh sách/chi tiết/đơn khách; khoá khách → 2 phiên 401, đăng nhập bị từ chối, mở khoá thì cookie cũ vẫn 401; tạo nhân viên → 1 thư, email chuẩn hoá, `passwordSet=false`; khoá + đổi vai trò nhân viên ở 2 context → cả hai 401, UI về `/admin/login`; staff gọi `/api/admin/staff` 403; staff thấy email đã che, không có `birthDate`/`addresses`; `q=%` và chuỗi LIKE injection ra 0 dòng. Dữ liệu test đã xoá khỏi n2f_dev. Không chạm Supabase.

## Lỗi
- **M-1 (Major, đã sửa 2026-11-12):** thư mời nhân viên hướng dẫn mở `/auth/forgot-password`; mở thẳng URL đó bị chuyển về `/auth/login` (trang cần email từ bước đăng nhập). Sửa: thư hướng dẫn `/auth/login` → nhập email → "Sử dụng mật khẩu" → "Quên mật khẩu" (khớp nhãn FE và hướng dẫn ở `/admin/login`); test T-USR trong `users-staff.test.ts` cập nhật; chữ AC-USR-43 sửa theo. Đóng luôn m-1.
- m-1: AC-USR-43 liên kết "Quên mật khẩu" ở `/admin/login` trỏ `/auth/login` (FE đã khai) — đóng cùng M-1.
- m-2: `409 last-admin` không đạt được qua API (bên đua sau luôn 401, BE đã khai); lưới an toàn vẫn có, test bằng spy. PO xác nhận chữ.
- m-3: chế độ mock đã gỡ Ghi chú, Tag, Xuất CSV…; port `ADMIN_CUSTOMERS_API` cũ còn dùng cho form Khuyến mãi (mock).
- m-4: `recipientName` đầy đủ trong đơn của khách khi staff xem; nhất quán với màn đơn Slice 4 (S4-Q9), PO xác nhận.
- m-5: rate limit đếm trong RAM, một tiến trình (kế thừa các slice trước).

## Bảo mật
Đạt: không lộ hash/token/ip trong phản hồi và log; che dữ liệu ở máy chủ; kiểm quyền trước 404; thu hồi phiên + nhật ký cùng giao dịch; advisory lock chống 0 admin (đua x20 pass); `account_events` chỉ INSERT/SELECT; LIKE có escape; migration chỉ cộng thêm, RLS bật.
