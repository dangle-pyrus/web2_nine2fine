# QA Slice 8 — Admin tổng quan & cài đặt cửa hàng

- Người kiểm: qa-reviewer (độc lập), 2026-11-12. Orchestrator ghi file từ báo cáo của QA (agent QA không được ghi file).
- Phạm vi: HEAD 97eb453 (commit Slice 8: 9b583fb..97eb453).
- **Kết luận: ĐẠT DoD cục bộ.** Blocker 0, Major 0, Minor 4. AC (55): Pass 52, Fail 0, Pass một phần 3 (AC-SET-04, AC-SET-11, AC-SET-14).

## Lệnh đã chạy (số thật)
- BE `npx tsc --noEmit` exit 0; `tsc -p tsconfig.build.json --noEmit` exit 0.
- BE 6 file Slice 8 chạy riêng (DB `n2f_test`): foundation 10/10, dashboard 10/10, reports 19/19, settings 19/19, audit 7/7, access 5/5 = **70/70**.
- FE `npm run lint` exit 0; `format:check` sạch; `npm run build` exit 0, initial 546,46 kB (< 600). Playwright `tests/admin-insights.spec.ts --trace off`: 40 pass (20 desktop + 20 mobile), 0 fail.
- Chạy thật cục bộ (BE thật + curl, chưa chạy FE trình duyệt trên BE thật): BE cổng 4100, `DATABASE_URL`/`DIRECT_URL` trỏ `127.0.0.1:54329/n2f_dev`, mail dev-outbox; không dùng `.env` Supabase. Tạo tạm 2 tài khoản test admin/staff `@nine2fine.test` ở `n2f_dev`, đã xoá; `store_settings` về mặc định, `store_settings_events` 0 dòng sau khi dọn.

## Kết quả chạy thật
- Dashboard 7d: admin 200 đủ trường tiền (revenue 780.000); staff 200 chỉ `generatedAt`, `orders`, `todo`; `range=week` 422 `field: range`.
- Staff gọi reports/sales, export, settings/store (GET + PUT), audit-log: 403. Không cookie: 401 ×4.
- Báo cáo `2026-01-01..2026-11-12`: Σ byDay = Σ byCategory = Σ byPayment = Σ topProducts = Σ topVariants = KPI = 780.000. `from=abc` 422 `field: from`.
- CSV: 200, `text/csv; charset=utf-8`, BOM, `Content-Disposition` có tên tệp, `no-store`; ô đầu `= + - @ TAB CR` được chèn `'`.
- Rate limit báo cáo/CSV: 429 + `Retry-After` + `retryAfterSeconds` ở yêu cầu thứ 21 của cửa sổ.
- PUT settings: không đổi → 200, 0 dòng nhật ký; đổi `shippingFee` → 200, 1 dòng; `updatedAt` cũ + có đổi → 409 `version-conflict`, 0 dòng; sai 2 trường → 422 với `fieldErrors` đủ cả hai, 0 dòng; đổi hotline → `GET /store/settings` có ngay số mới.
- `GET /api/store/settings` không cookie: 200, `public, max-age=60`, chỉ `info` + `policy`, không có `codMaxTotal`/`updatedAt`.
- Audit: `limit=51`/`0` 422; trang vượt 200 rỗng; `targetType=product` 422; ngày sai 422; > 92 ngày 422 `field: to`; PUT/DELETE 404.

## Bảng AC
| Nhóm | Pass | Một phần | Fail | Bằng chứng |
| --- | --- | --- | --- | --- |
| INS-01..13 | 13 | 0 | 0 | T-INS-01..05, 14 (4 múi giờ phiên), 30, 31; FE; curl |
| DSH-01..10 | 10 | 0 | 0 | T-DSH-01..09; FE; curl staff 3 khoá |
| RPT-01..11 | 11 | 0 | 0 | T-RPT-01..10; FE; curl Σ = KPI, CSV |
| SET-01..16 | 13 | 3 | 0 | T-SET-01..12, 20, 30, 31; FE; curl |
| AUD-01..05 | 5 | 0 | 0 | T-AUD-01..06; FE; curl |

Pass một phần:
- AC-SET-04 (Should): kiểm URL MXH Pass; "rỗng = storefront ẩn biểu tượng" không kiểm được vì footer chưa có MXH.
- AC-SET-11: đơn cũ giữ phí/hạn, báo giá và đơn mới dùng giá trị mới, thư dùng hotline mới Pass; `payment_due_at` của đơn chuyển khoản mới chỉ kiểm gián tiếp qua `quote.policy`.
- AC-SET-14: BE Pass; FE đọc `/api/store/settings` + fallback Pass; MXH chưa hiện; chỉ đọc lúc tải trang.

## Lỗi
- Blocker: không có. Major: không có.
- **m-1** (frontend-dev / PO): footer storefront chưa hiện biểu tượng MXH (`StoreInfo` chưa có `social`) dù API trả `social.*`. Tái hiện: đặt `info.social.facebook` rồi mở chân trang. Ảnh hưởng AC-SET-04/14 (Should).
- **m-2** (backend-dev): chưa có test trực tiếp `payment_due_at` đơn chuyển khoản sau khi đổi `bankHoldMinutes` (`backend/test/insights-settings.test.ts` T-SET-20 kiểm qua `quote.policy`).
- **m-3** (kế thừa): rate limit đếm trong RAM một tiến trình (`backend/src/middleware/rate-limit.ts:56-74`).
- **m-4**: chưa chạy FE trình duyệt trên BE thật; nên chạy ở lát 8.7 trước go-live.

## Bảo mật / chất lượng: Đạt
- `requirePermission` trước Zod và mọi truy cập DB; vai trò / `is_active` đọc lại từ DB mỗi yêu cầu; staff không có khoá tiền (DTO hai nhánh ở `dashboard.service.ts`).
- SQL thô dùng `Prisma.sql` có tham số; `Prisma.raw` chỉ tên cột cố định; không `$queryRawUnsafe`. `audit.query.ts` liệt kê cột, không lộ ghi chú nội bộ / IP / UA. `GET /store/settings` dựng từng trường (whitelist).
- PUT settings: `FOR UPDATE` + kiểm `updatedAt` + 1 dòng nhật ký trong cùng giao dịch; lỗi nhật ký thì rollback.
- Migration `20261112000100_admin_insights_schema` chỉ cộng thêm, RLS bật cho `store_settings_events`.
- Tiền số nguyên, `unit_price::bigint * quantity`.
