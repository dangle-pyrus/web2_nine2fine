# Prompt triển khai Slice 3 Cart & Checkout

Dán nguyên phần dưới đây cho agent code.

---

Bạn triển khai Slice 3 — Giỏ hàng & Checkout cho website thời trang nine2fine. Repo ở `G:\UEL\nam4\webplus\web2_nine2fine`, nhánh `fullstack` (không tạo nhánh khác, không push). Backend: Express 5 + TypeScript + Prisma 6 + PostgreSQL (Supabase). Frontend: Angular 22 standalone. Slice 1 (Auth) và Slice 2 (Catalog: sản phẩm, biến thể, tồn kho) đã có API thật; giỏ, checkout và đơn hàng hiện còn chạy bằng mock ở frontend.

Mục tiêu: giỏ khách lưu trên trình duyệt và giỏ thành viên lưu máy chủ (gộp khi đăng nhập); báo giá tính ở máy chủ (voucher giảm tiền + voucher miễn phí vận chuyển, phí ship, ngưỡng free-ship); đặt đơn COD trừ tồn kho nguyên tử, chống tạo trùng bằng `Idempotency-Key`; email xác nhận/huỷ; xem đơn của thành viên; tra cứu đơn khách bằng mã đơn + email + OTP; huỷ đơn. Frontend chuyển các phần này sang API thật, phần còn lại giữ nguyên.

Điều kiện trước khi bắt đầu: Slice 2 phải đạt các điều kiện trong `docs/product/backlog.md` (2.15, 2.16 và danh sách kiểm tay K1–K12). Nếu chưa đạt, dừng và báo lại, không code Slice 3.

Đọc theo thứ tự trước khi viết code:
1. `docs/implementation/slice-3-cart-checkout.md`: trình tự làm, môi trường, lệnh kiểm tra, định nghĩa xong, danh sách KHÔNG làm. Đây là file điều phối chính.
2. `docs/decisions.md`: các quyết định đã chốt (đặc biệt các dòng 2026-11-07).
3. `docs/product/PRD.md` mục "Slice 3: Cart & Checkout": BR-CART, BR-CHK, BR-VOU và AC.
4. `docs/api/openapi.yaml`: các tag cart, checkout, voucher, order, locations (locked), `ErrorCode` và `ErrorResponse`.
5. `docs/api/cart-checkout-implementation-plan.md`: schema, migration, seed, giao dịch trừ tồn kho, idempotency, email, test map AC, FE phải đổi.
6. `docs/slice-3-cart-checkout/frontend-plan.md`: việc FE theo từng file.
7. `docs/product/cart-checkout-business-rules.md`: 69 quy tắc nghiệp vụ gốc và bảng tham số (dùng để tra con số khi cần).
8. `frontend/AGENTS.md` và code hiện có liên quan (`backend/src`, `frontend/src/app/features/{cart,checkout,orders,tracking,account}`, `frontend/src/mocks`).
Khi tài liệu mâu thuẫn: PRD > openapi.yaml > cart-checkout-implementation-plan.md > frontend-plan.md > cart-checkout-business-rules.md.

Các chỗ ghi "giả định chờ Thắng" trong tài liệu: làm theo giả định đó, nhưng gom vào một chỗ để dễ đổi (ví dụ cấu hình hoặc hằng số), và liệt kê trong báo cáo cuối.

Ràng buộc bắt buộc:
- `backend/.env` trỏ cơ sở dữ liệu Supabase THẬT và gửi Gmail thật. Mọi lệnh prisma, seed, test, chạy server phải ghi đè ngay trong lệnh: `DATABASE_URL=postgresql://postgres@127.0.0.1:54329/n2f_dev DIRECT_URL=postgresql://postgres@127.0.0.1:54329/n2f_dev MAIL_MODE=dev-outbox MAIL_OUTBOX_DIR=<thư mục tạm ngoài repo>`. Không sửa, không in, không commit `backend/.env`. Nếu Postgres cục bộ ở 54329 không chạy, dựng một Postgres cục bộ khác và báo lại.
- Migration chỉ cộng thêm: không DROP/RENAME bảng, cột, enum; không `prisma migrate reset`; không `prisma db push --accept-data-loss`. Bảng mới bật RLS như các migration trước. Tiền lưu số nguyên (đồng).
- Tính tiền và tồn kho chỉ ở máy chủ; không tin giá/tổng gửi từ trình duyệt ngoài việc so sánh để trả 409 `price-changed`.
- Không chạy migration hay seed lên Supabase. Khi xong, dừng và báo; Thắng sẽ xác nhận và có thể tự chạy lệnh.
- Không gửi email thật khi test (dùng `MAIL_MODE=dev-outbox`).
- Không đổi phần đã locked trong `openapi.yaml`. Nếu buộc phải lệch, ghi đề xuất vào `docs/handoff.md` mục "Đề xuất đổi contract" và hỏi.
- Không thêm thư viện mới. Không commit secret. Không log mã OTP, mật khẩu, token hay thông tin thanh toán.
- Không làm các mục trong phần "KHÔNG làm" của `docs/implementation/slice-3-cart-checkout.md`.
- Nếu gặp việc không thể hoàn tác (xoá dữ liệu, force push) thì dừng và hỏi.

Làm theo bảng "Thứ tự" trong `docs/implementation/slice-3-cart-checkout.md`. Sau mỗi bước chạy lệnh kiểm tra tương ứng; commit theo bước, message tiếng Việt.

Lệnh kiểm tra:
- `backend/`: `npm run typecheck`, `npm run build`, `npm test` (cần 3 lần pass liền; worker vitest có thể crash mã `0xC0000409` trên Windows, đó là lỗi môi trường đã biết, chạy lại). Test đồng thời (2 người mua món cuối, 2 đơn dùng lượt voucher cuối) bắt buộc pass.
- `frontend/`: `npm run lint`, `npm run format:check`, `npm run build`, Playwright cho các spec đã đổi (`npx playwright test <spec> --trace off`; Playwright tự dùng cấu hình mock).
- Kiểm thật: chạy BE (`npx tsx src/server.ts` trong `backend/`, kèm biến ghi đè) và FE (`npm run start:local` trong `frontend/`), mở `http://localhost:4200` (không dùng 127.0.0.1), đi qua luồng kiểm thật trong `frontend-plan.md`: thêm vào giỏ khi chưa đăng nhập, đăng nhập và gộp giỏ, báo giá với 2 voucher, đặt COD, bấm đặt 2 lần (không tạo đơn trùng), xem đơn, tra cứu đơn khách bằng OTP (đọc mã từ thư mục outbox), huỷ đơn và kiểm tồn kho được hoàn.

Xong khi: đạt "Định nghĩa xong" trong `docs/implementation/slice-3-cart-checkout.md`. Ghi tiến độ vào `docs/handoff.md`.

Báo cáo cuối (ngắn): commit đã tạo; kết quả thật của từng lệnh kiểm tra; bảng AC Must với Pass/Fail/Không kiểm được và bằng chứng; các giả định chờ Thắng đã dùng; điểm lệch tài liệu hoặc đề xuất; lệnh chính xác để áp migration và seed lên Supabase khi Thắng xác nhận.
