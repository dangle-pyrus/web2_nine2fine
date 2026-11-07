# Prompt triển khai Slice 2 Catalog

Dán nguyên phần dưới đây cho agent code.

---

Bạn triển khai Slice 2 — Catalog (chỉ đọc) cho website thời trang nine2fine. Repo ở `G:\UEL\nam4\webplus\web2_nine2fine`, nhánh `fullstack` (không tạo nhánh khác, không push). Backend: Express 5 + TypeScript + Prisma 6 + PostgreSQL (Supabase). Frontend: Angular 22 standalone. Slice 1 (Auth thật) đã xong; catalog hiện vẫn chạy bằng dữ liệu mock ở frontend.

Mục tiêu: backend có API catalog thật (danh sách có lọc/sắp xếp/phân trang, chi tiết theo slug, tìm kiếm không dấu, bảng size, tồn kho theo biến thể), seed từ dữ liệu mock hiện có; frontend chuyển catalog sang API thật, phần khác (giỏ, checkout, tài khoản, admin) vẫn mock.

Đọc theo thứ tự trước khi viết code:
1. `docs/implementation/slice-2-catalog.md`: trình tự làm, môi trường, lệnh kiểm tra, định nghĩa xong, danh sách KHÔNG làm. Đây là file điều phối chính.
2. `docs/decisions.md`: các quyết định đã chốt.
3. `docs/product/PRD.md` mục "Slice 2: Catalog": C1–C13, BR-CAT-01..23, AC-CAT-01..53.
4. `docs/api/openapi.yaml` tag `catalog` (locked) và `ErrorCode`.
5. `docs/api/catalog-implementation-plan.md`: schema, migration, seed, module, test T-CAT, FE phải đổi.
6. `docs/slice-2-catalog/frontend-plan.md`: việc FE theo từng file.
7. `frontend/AGENTS.md` và code hiện có liên quan (`backend/src`, `frontend/src/app/features/{catalog,product,search,home,wishlist}`).
Khi tài liệu mâu thuẫn: PRD > openapi.yaml > catalog-implementation-plan.md > frontend-plan.md > `docs/design/catalog-*.md`.

Ràng buộc bắt buộc:
- `backend/.env` trỏ cơ sở dữ liệu Supabase THẬT và gửi Gmail thật. Mọi lệnh prisma, seed, test, chạy server phải ghi đè ngay trong lệnh: `DATABASE_URL=postgresql://postgres@127.0.0.1:54329/n2f_dev DIRECT_URL=postgresql://postgres@127.0.0.1:54329/n2f_dev MAIL_MODE=dev-outbox MAIL_OUTBOX_DIR=<thư mục tạm ngoài repo>`. Không sửa, không in, không commit `backend/.env`.
- Migration chỉ cộng thêm: không DROP/RENAME bảng, cột, enum; không `prisma migrate reset`; không `prisma db push --accept-data-loss`. Bảng mới bật RLS như migration Slice 1.
- Không chạy migration hay seed lên Supabase. Khi xong, dừng và báo; Thắng sẽ xác nhận và có thể tự chạy lệnh.
- Không đổi phần đã locked trong `openapi.yaml`. Nếu buộc phải lệch, ghi đề xuất vào `docs/handoff.md` mục "Đề xuất đổi contract" và hỏi.
- Không thêm thư viện mới. Không commit secret.
- Không làm các mục trong phần "KHÔNG làm" của `docs/implementation/slice-2-catalog.md`.
- Nếu gặp việc không thể hoàn tác (xoá dữ liệu, force push) thì dừng và hỏi.

Làm theo bảng "Thứ tự" trong `docs/implementation/slice-2-catalog.md`. Sau mỗi bước chạy lệnh kiểm tra tương ứng; commit theo bước, message tiếng Việt.

Lệnh kiểm tra:
- `backend/`: `npm run typecheck`, `npm run build`, `npm test` (cần 3 lần pass liền; worker vitest có thể crash mã `0xC0000409` trên Windows, đó là lỗi môi trường đã biết, chạy lại).
- `frontend/`: `npm run lint`, `npm run format:check`, `npm run build`, Playwright cho các spec đã đổi (`npx playwright test <spec> --trace off`; Playwright tự dùng cấu hình mock).
- Kiểm thật: chạy BE (`npx tsx src/server.ts` trong `backend/`, kèm biến ghi đè) và FE (`npm run start:local` trong `frontend/`), mở `http://localhost:4200` (không dùng 127.0.0.1), đi qua luồng ở `frontend-plan.md` §5.

Xong khi: đạt "Định nghĩa xong" trong `docs/implementation/slice-2-catalog.md`. Ghi tiến độ vào `docs/handoff.md`.

Báo cáo cuối (ngắn): commit đã tạo; kết quả thật của từng lệnh kiểm tra; bảng AC-CAT Must với Pass/Fail/Không kiểm được và bằng chứng; điểm lệch tài liệu hoặc đề xuất; lệnh chính xác để áp migration và seed lên Supabase khi Thắng xác nhận.
