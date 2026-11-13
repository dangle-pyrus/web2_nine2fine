# QA Slice 9 — Trả hàng / hoàn tiền

Phạm vi HEAD a57f661 (BE 0b5d856..3c8e032, FE a57f661). Người kiểm: qa-reviewer (độc lập), 2026-11-13. **Kết luận: ĐẠT DoD cục bộ (Must). Blocker 0, Major 0, Minor 5.** Khách vãng lai (lát 9.6) hoãn = N/A. Chưa chạy FE trên BE thật (lát 9.8).

## Lệnh đã chạy (số thật)
- BE `npm run build`: exit 0.
- BE `npm test` (n2f_dev): 44/47 file, 684/699 test; 3 file chết worker Windows (exit 3221226505, lỗi có sẵn): `returns-admin`, `quote-voucher`, `admin-media-hardening`; chạy lại riêng 26/26, 15/15, 6/6 → 731/731 pass.
- FE `npm run lint` sạch, `npm run format:check` sạch, `npm run build` OK: initial 548,18 kB raw / 153,73 kB transfer (chunk `return-request-page` 25,86 kB, `admin-routes` 268,57 kB).
- Playwright full (msedge): 552 test, 540 pass, 8 skip, 4 fail = `operations.spec:58` và `:103` × desktop + mobile (lỗi cũ từ Slice 4.5); `home:56` không fail lần này.

## AC
Pass 45, Pass một phần 3 (AC-RET-03, AC-RET-13: cấu hình / mã đúng nhưng thiếu test gắn mã; AC-RET-07/34/38 Pass gián tiếp), Fail 0, N/A 6 (5 operation khách vãng lai, AC-RET-22, AC-RET-44 Should hoãn). Bằng chứng: BE `returns-foundation`, `returns-member`, `returns-admin`, `returns-metrics`, `returns-migration`; FE `returns.spec`, `admin-returns.spec` (page.route theo openapi).

## Bảo mật
- Số tài khoản: AES-256-GCM, AAD = `return_id` (`account-secret.ts`); cột bị omit khỏi truy vấn thường (`return.query.ts:13`); thư chỉ 4 số cuối (`return-mail-data.ts`); `order_events` không chứa; `request_hash` dùng HMAC (`returns-member:269`); xoá NULL ở `cancelled` / `rejected` / `refunded` / đóng thẳng (`process-return.service.ts:59,138,199,247`); log: spy console `returns-admin:397` + quét tĩnh `returns-metrics:254`. Số đầy đủ chỉ admin + `received` + COD (`return.mapper.ts:205`); `AdminOrder.return` luôn che.
- Ảnh: kho riêng khoá `rp-*`, không qua `/api/media`; kiểm quyền mỗi lần, sai quyền = 404; `private, no-store`, `nosniff`.
- IDOR: đơn người khác 404; staff/admin ở storefront tạo yêu cầu 403. `returns.refund` chỉ admin, `requirePermission` chạy trước Zod / DB.
- Đồng thời: `FOR UPDATE` + UPDATE có điều kiện trạng thái; nhập kho trong cùng giao dịch, khoá theo thứ tự `variant_id`; `payment_status` đổi đúng một lần ở bước hoàn.
- Tiền: `computeReturnAmount` (theo `line_discount`, trừ 30.000 khi lỗi khách, hoàn ship khi lỗi shop và trả đủ mọi dòng, `amount <= 0` bị từ chối).
- Migration: enum `ADD VALUE IF NOT EXISTS` + CREATE TABLE / ADD CONSTRAINT / RLS + 1 cột nullable `order_events.return_id`; không DROP / UPDATE / đổi kiểu.

## Lỗi
- Blocker / Major: không.
- m-1 (backend-dev): idempotency tạo yêu cầu dùng scope `admin-action` (`create-return.service.ts` ~125) vì CHECK `chk_idempotency_scope`; đã khai, rủi ro thấp (hash gồm path + user).
- m-2 (backend-dev): test đua tạo yêu cầu 10 thay 20; duyệt + từ chối đồng thời có thể cùng 200 (lệch chữ AC-RET-09/39 "đúng 1 × 200"), đã khai.
- m-3 (backend-dev): thiếu test gắn mã AC-RET-03 (429 ở lần 11/31/61) và AC-RET-13 (biên 9/10/500/501).
- m-4 (frontend-dev): mock trả hàng cũ `ADMIN_RETURNS_API` chưa xoá (chỉ dùng ở `returnsMode: mock`); chưa chạy FE với BE thật.
- m-5 (frontend-dev): `operations.spec:58/:103` lỗi cũ có từ trước Slice 9.

## Còn lại
- Lát 9.8 nghiệm thu thật: áp 2 migration lên Supabase, tải ảnh thật vào bucket `return-photos`, chạy một yêu cầu thật đủ vòng, đọc 4 email.
- Lát 9.6 khách vãng lai (Should) hoãn.
