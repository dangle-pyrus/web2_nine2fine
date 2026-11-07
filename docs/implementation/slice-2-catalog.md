# Slice 2 Catalog: kế hoạch triển khai cho người code

Repo `nine2fine`, nhánh `fullstack`. Đây là trình tự làm; chi tiết nằm ở các file nguồn, không lặp lại ở đây.

## Tài liệu nguồn (đọc theo thứ tự)

1. `docs/decisions.md`: quyết định đã chốt (đặc biệt các dòng 2026-11-07).
2. `docs/product/PRD.md` mục "Slice 2: Catalog": C1–C13, BR-CAT-01..23, AC-CAT-01..53, định nghĩa xong.
3. `docs/api/openapi.yaml` tag `catalog` (locked) và `ErrorCode` có `not-found`.
4. `docs/api/catalog-implementation-plan.md`: schema, migration, seed, module BE, test T-CAT map AC, hiệu năng, FE phải đổi (mục 8).
5. `docs/slice-2-catalog/frontend-plan.md`: việc FE theo từng file.
6. Tham khảo khi cần: `backend/src` (cấu trúc Slice 1), `frontend/AGENTS.md`, `docs/design/catalog-*.md` (chỉ bố cục/microcopy).

## Thứ tự

| # | Việc | Xong khi |
| --- | --- | --- |
| 1 | BE: mã `not-found` (errors.ts, middleware 404, sửa test cũ) | typecheck + test qua |
| 2 | BE: schema Prisma + migration `20261107000400_catalog_schema` (chỉ cộng thêm, RLS bật cho bảng mới), áp trên DB cục bộ | `migrate diff` rỗng; không có DROP/RENAME ngoài phạm vi |
| 3 | BE: `lib/text.ts` (`foldVi`), export JSON từ mock, `seed-catalog.ts` (một giao dịch, upsert theo slug/sku, không đặt lại tồn kho) | seed chạy 2 lần cho cùng kết quả |
| 4 | BE: module catalog (schemas zod, service, mapper, controller, routes) gắn vào `app.ts` theo plan §4 | test T-CAT pass |
| 5 | BE: rate limit 120/60s/IP, cache header, đếm truy vấn | T-CAT-47, 52, 61 pass |
| 6 | FE: cấu hình `catalogMode`, model, adapter (frontend-plan §1–2) | lint + build qua |
| 7 | FE: nơi gọi và UI (frontend-plan §3) | Playwright mock các spec liên quan pass |
| 8 | Tích hợp thật trên DB cục bộ: BE + FE `start:local`, đi qua luồng ở frontend-plan §5 | không lỗi console, đúng AC |
| 9 | Dừng, báo cáo. Áp lên Supabase chỉ khi Thắng xác nhận (xem dưới) | — |

## Môi trường cục bộ

- Postgres cục bộ không mật khẩu ở `127.0.0.1:54329`, DB `n2f_dev` (dev) và `n2f_test` (test). Nếu không chạy, dựng bằng Postgres cục bộ hoặc Docker và báo lại.
- `backend/.env` trỏ Supabase THẬT và `MAIL_MODE=smtp`. Mọi lệnh prisma, seed, test, chạy server phải ghi đè trong cùng lệnh: `DATABASE_URL=postgresql://postgres@127.0.0.1:54329/n2f_dev DIRECT_URL=postgresql://postgres@127.0.0.1:54329/n2f_dev MAIL_MODE=dev-outbox MAIL_OUTBOX_DIR=<thư mục tạm ngoài repo>`. Test vitest có chốt chặn tự ép về `n2f_test`.
- Chạy BE: trong `backend/`, `npx tsx src/server.ts` (cổng 4000). Chạy FE: trong `frontend/`, `npm run start:local`, mở `http://localhost:4200`.

## Lệnh kiểm tra

- `backend/`: `npm run typecheck`, `npm run build`, `npm test` (3 lần liên tiếp; worker vitest có thể crash `0xC0000409` trên Windows, xem decisions M2: crash không phải fail logic, nhưng phải có 3 lần pass liền).
- `frontend/`: `npm run lint`, `npm run format:check`, `npm run build`, Playwright các spec đã đổi.

## Định nghĩa xong

- Mọi AC-CAT Must pass, có bằng chứng (tên test hoặc bước kiểm thật). AC Should làm nếu kịp, ghi rõ cái nào chưa.
- Lệnh kiểm tra ở trên đều pass với số liệu thật.
- `openapi.yaml` khớp code; nếu buộc phải lệch, ghi đề xuất vào `docs/handoff.md` (mục "Đề xuất đổi contract"), không tự sửa phần locked.
- Ghi tiến độ vào `docs/handoff.md`, quyết định mới vào `docs/decisions.md`.
- Commit theo bước trên nhánh `fullstack`, message tiếng Việt. Không push.

## KHÔNG làm

- Admin CRUD sản phẩm, giỏ/checkout thật, đánh giá thật, "Báo khi có hàng", wishlist lưu server, redirect slug cũ, giá theo biến thể.
- Migration xoá/đổi tên bảng, cột, enum; `prisma migrate reset`; `prisma db push --accept-data-loss`.
- Chạy `migrate deploy` hoặc seed lên Supabase khi Thắng chưa xác nhận. Khi được xác nhận: `npx prisma migrate deploy`, rồi seed catalog bằng `DIRECT_URL` (pooler 5432); Thắng có thể phải tự chạy.
- Thêm thư viện mới. Commit `.env`, mật khẩu, khoá. In giá trị `.env` ra log.
- Đổi phần auth đã locked trong contract.
