# Slice 3 Cart & Checkout: kế hoạch triển khai cho người code

Repo `nine2fine`, nhánh `fullstack`. Đây là trình tự làm; chi tiết nằm ở các file nguồn, không lặp lại ở đây.

**Điều kiện bắt đầu.** Chỉ code Slice 3 sau khi Slice 2 đạt điều kiện nghiệm thu (`docs/product/backlog.md`: 2.15, 2.16 và K1–K12 của Slice 2 đã đóng, `docs/qa/` có báo cáo đạt). Trước đó chỉ được đọc, không sửa code. Các bước 1–8 dưới đây đều giả định điều kiện này đã đạt.

## Tài liệu nguồn (đọc theo thứ tự)

1. `docs/product/PRD.md` mục "Slice 3: Cart & Checkout": K1–K24, BR-CART-01..14, BR-CHK-01..33, BR-VOU-01..13, AC-CART/CHK/VOU, định nghĩa xong, câu hỏi mở.
2. `docs/api/openapi.yaml` phần Slice 3 (giỏ, báo giá, đặt hàng, tra cứu OTP, huỷ, địa giới, đơn tài khoản, `ErrorCode` mới).
3. `docs/api/cart-checkout-implementation-plan.md`: schema, migration, seed, module BE, test map AC, hiệu năng, điểm FE phải đổi.
4. `docs/slice-3-cart-checkout/frontend-plan.md`: việc FE theo từng file.
5. `docs/product/cart-checkout-business-rules.md`: nguồn gốc của Thắng (CART/CHK/VC/PAY/CF), dùng khi PRD chưa rõ. Khi mâu thuẫn: PRD > contract > plan > nguồn gốc.
6. Tham khảo khi cần: `docs/decisions.md`, `docs/handoff.md`, `backend/src` (auth, catalog, mailer `backend/src/mail/mailer.ts`), `frontend/AGENTS.md`.

Giả định chờ Thắng (làm theo, đổi khi có trả lời; xem PRD mục 7): COMMON theo đề xuất PO (tên trạng thái, làm tròn xuống 1.000 ₫, OTP theo BR-AUTH-04..09), QR ẩn ở HTTP khi chưa có SePay, địa giới 34 tỉnh/thành tải từ API, khách tự huỷ thẳng ở `to_ship`.

## Thứ tự

| # | Việc | Xong khi |
| --- | --- | --- |
| 1 | BE: mã lỗi mới trong `errors.ts` (`invalid-address`, `stock-changed`, `price-changed`, `voucher-changed`, `idempotency-conflict`, `possible-duplicate`, `not-cancellable`, và mã còn thiếu so với contract), sửa test cũ | typecheck + test qua |
| 2 | BE: schema Prisma + migration chỉ cộng thêm (giỏ, đơn, dòng đơn, voucher, lượt voucher, địa giới, tham số vận hành, ngày nghỉ, khoá idempotency, OTP tra cứu), RLS bật cho bảng mới, áp trên DB cục bộ | `migrate diff` rỗng; không DROP/RENAME ngoài phạm vi |
| 3 | BE: seed idempotent (tham số, voucher `N2FWELCOME15` và `N2FFREESHIP`, địa giới 34 tỉnh/thành, ngày lễ 2026–2027) | chạy 2 lần cho cùng kết quả, lượt đã dùng không bị đặt lại |
| 4 | BE: module giỏ + báo giá + voucher (tính tiền do máy chủ, làm tròn, chia phần giảm theo dòng) | test T-CART/T-VOU pass |
| 5 | BE: đặt hàng (giao dịch trừ tồn + trừ lượt voucher + tạo đơn, `Idempotency-Key`, mã đơn, 409 theo mã lỗi), huỷ (hoàn tồn và lượt đúng một lần), tra cứu OTP, đơn tài khoản, email (mailer), rate limit riêng | test T-CHK pass, gồm đồng thời (AC-CHK-15, AC-VOU-13) |
| 6 | Rà `openapi.yaml` (đã locked) khớp code; lệch thì ghi đề xuất vào `docs/handoff.md`, không tự sửa | code khớp contract |
| 7 | FE: cấu hình `checkoutMode`, model, adapter, mock (frontend-plan §1–2, §10) | lint + build qua |
| 8 | FE: giỏ, checkout, thành công, tra cứu, đơn thành viên (frontend-plan §3–9, §11–12) | Playwright mock các spec liên quan pass, số pass không giảm (AC-CHK-40) |
| 9 | Tích hợp thật trên DB cục bộ: BE + FE `start:local`, đi qua luồng ở frontend-plan §14.2; AC-AUTH-68 qua AC-CHK-33 | không lỗi console, đúng AC |
| 10 | QR/SePay (lát 3.8) chỉ khi Thắng xác nhận câu hỏi 2 và cấp khoá; không làm mặc định | — |
| 11 | Dừng, viết `docs/qa/report-slice-3-checkout.md`, báo cáo. Áp lên Supabase chỉ khi Thắng xác nhận (xem dưới) | — |

## Môi trường cục bộ

- Postgres cục bộ không mật khẩu ở `127.0.0.1:54329`, DB `n2f_dev` (dev) và `n2f_test` (test). Nếu không chạy, dựng bằng Postgres cục bộ hoặc Docker và báo lại.
- `backend/.env` trỏ Supabase THẬT và `MAIL_MODE=smtp`. Mọi lệnh prisma, seed, test, chạy server phải ghi đè trong cùng lệnh: `DATABASE_URL=postgresql://postgres@127.0.0.1:54329/n2f_dev DIRECT_URL=postgresql://postgres@127.0.0.1:54329/n2f_dev MAIL_MODE=dev-outbox MAIL_OUTBOX_DIR=<thư mục tạm ngoài repo>`. Test vitest có chốt chặn tự ép về `n2f_test`. Đọc OTP tra cứu và email xác nhận trong thư mục outbox này.
- Chạy BE: trong `backend/`, `npx tsx src/server.ts` (cổng 4000). Chạy FE: trong `frontend/`, `npm run start:local`, mở `http://localhost:4200` (không dùng 127.0.0.1).
- Thử các tình huống cần chỉnh dữ liệu (đổi giá, tồn, trạng thái đơn, `n2f_sid`, ngày hết hạn voucher, đồng hồ 30 ngày) bằng SQL trên DB cục bộ, không trên Supabase.

## Lệnh kiểm tra

- `backend/`: `npm run typecheck`, `npm run build`, `npm test` (3 lần liên tiếp; worker vitest có thể crash `0xC0000409` trên Windows, xem decisions M2: crash không phải fail logic, nhưng phải có 3 lần pass liền). Có test đồng thời cho AC-CHK-15 và AC-VOU-13 (lặp 10–20 lần).
- `frontend/`: `npm run lint`, `npm run format:check`, `npm run build`, Playwright các spec đã đổi (`checkout`, `account`, `operations`, `commerce`, `cart-checkout` mới), `npx playwright test <spec> --trace off`.

## Định nghĩa xong

- Mọi AC Must (73 AC) pass, có bằng chứng (tên test hoặc bước kiểm thật) trong `docs/qa/report-slice-3-checkout.md`; AC Should (AC-CART-20, AC-CHK-03, AC-CHK-20, AC-VOU-16) ghi rõ làm hay hoãn; AC chờ xác nhận (AC-CHK-27 và các AC phụ thuộc Q1–Q4) chạy theo câu trả lời của Thắng.
- Lệnh kiểm tra ở trên đều pass với số liệu thật.
- Tổng `subtotal − discount + shippingFee − shippingDiscount = total` do máy chủ tính, khớp ở checkout, trang thành công, email, chi tiết đơn.
- Backlog 2.14 đóng khi AC-CHK-13..16 đạt. AC-AUTH-68 kiểm bằng AC-CHK-33.
- `openapi.yaml` khớp code; nếu buộc phải lệch, ghi đề xuất vào `docs/handoff.md` (mục "Đề xuất đổi contract"), không tự sửa phần locked.
- FE chạy `checkoutMode: http` với BE thật; Account (trừ đơn) và Admin vẫn mock; Playwright mock pass nguyên.
- Ghi tiến độ vào `docs/handoff.md`, quyết định mới vào `docs/decisions.md`.
- Commit theo bước trên nhánh `fullstack`, message tiếng Việt. Không push.

## KHÔNG làm

- Việc Won't của PRD Slice 3: sổ địa chỉ, tự điền/lưu địa chỉ ở checkout; ví voucher, mã theo hạng/khách cụ thể; gọi xác nhận COD, huỷ do không liên lạc, từ chối nhận, duyệt yêu cầu huỷ, bàn giao vận chuyển, email vận chuyển/giao (Admin); thẻ/ví điện tử; xuất hoá đơn điện tử thật; cộng ngày xã đảo/vùng sâu; trả hàng/hoàn tiền; wishlist lưu server.
- Migration xoá/đổi tên bảng, cột, enum; `prisma migrate reset`; `prisma db push --accept-data-loss`; `DROP`/`TRUNCATE`/`DELETE` dữ liệu trong migration.
- Chạy `migrate deploy` hoặc seed lên Supabase khi Thắng chưa xác nhận. Khi được xác nhận: `npx prisma migrate deploy` (chạy 2 lần để kiểm AC-CHK-41), rồi seed bằng `DIRECT_URL` (pooler 5432); Thắng có thể phải tự chạy.
- Thêm thư viện mới (kể cả client SePay/QR; lát 3.8 cần quyết định riêng). Commit `.env`, mật khẩu, khoá, khoá API ngân hàng. In giá trị `.env` ra log; log không chứa email đầy đủ.
- Đổi phần auth hoặc catalog đã locked trong contract; đổi phần locked của Slice 3 sau khi Backend đã chốt `openapi.yaml`.
- Gửi email thật từ môi trường cục bộ (luôn `MAIL_MODE=dev-outbox`).
