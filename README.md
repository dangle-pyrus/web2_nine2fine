# nine2fine

Website thương mại điện tử cho thương hiệu thời trang nine2fine (đồ án môn học, đủ để vận hành thử).

- `frontend/` — Angular 22: cửa hàng + trang quản trị `/admin`.
- `backend/` — Node.js + Express 5 + Prisma + PostgreSQL (API dưới `/api`).
- `docs/` — PRD, backlog, hợp đồng API (`docs/api/openapi.yaml`), thiết kế, báo cáo QA, nhật ký quyết định.

## Yêu cầu

| Công cụ | Phiên bản |
| --- | --- |
| Node.js | 24.15 trở lên (dòng 24) |
| npm | đi kèm Node 24 |
| PostgreSQL | 13 trở lên, chạy cục bộ (cổng mặc định 5432) |

Không cần tài khoản Supabase: dự án chạy hoàn toàn trên PostgreSQL cục bộ, ảnh lưu ra đĩa.

## Chạy nhanh bằng Docker (khuyến nghị)

Cần Docker Desktop (hoặc Docker Engine + Compose v2). Không cần cài Node hay PostgreSQL.

```bash
git clone https://github.com/dangle-pyrus/web2_nine2fine.git
cd web2_nine2fine
cp backend/.env.example backend/.env      # Windows PowerShell: Copy-Item backend/.env.example backend/.env
```

Điền `backend/.env` (hoặc dán file `.env` được gửi riêng). Với Docker chỉ cần các biến sau, còn `DATABASE_URL`, `DIRECT_URL`, `CORS_ALLOWED_ORIGINS` được compose tự ghi đè:

- `OTP_HMAC_SECRET` (từ 32 ký tự), `RETURN_ACCOUNT_KEY` (`openssl rand -base64 32`)
- `SEED_ADMIN_*`, `SEED_STAFF_*`, `SEED_MEMBER_*` (email + mật khẩu 8–64 ký tự, có chữ in hoa và chữ số)

```bash
docker compose up --build
```

Lần đầu mất vài phút. Container backend tự chạy `prisma migrate deploy` và các lệnh seed (an toàn khi chạy lại), rồi mở API. Khi thấy log `Server is running`, mở:

- Cửa hàng: http://localhost:4200
- Quản trị: http://localhost:4200/admin/login (đăng nhập bằng tài khoản `SEED_*`)
- API: http://localhost:4000/health

Ghi chú:

- PostgreSQL trong Docker mở ra máy bạn ở cổng `5433` (user `postgres`, mật khẩu `nine2fine_dev`, DB `nine2fine`), dữ liệu nằm trong volume `n2f_pgdata`. Đổi cổng khi bị trùng: `DB_PORT=5434 BACKEND_PORT=4001 FRONTEND_PORT=4201 docker compose up`.
- Mặc định thư được ghi thành file chứ không gửi thật; đọc mã OTP bằng `docker compose exec backend ls dev-outbox`. Muốn gửi thật: đặt `DOCKER_MAIL_MODE=smtp` và điền `SMTP_*` trong `backend/.env`.
- Frontend chạy dạng dev server trong container; sửa code xong chạy lại `docker compose up --build`.
- Nạp dữ liệu demo cho báo cáo: `docker compose exec backend npm run seed:demo`.
- Dừng: `docker compose down`; xoá luôn dữ liệu: `docker compose down -v`.

Nếu không dùng Docker, làm theo các bước 1–4 dưới đây.

## 1. Lấy mã nguồn

```bash
git clone https://github.com/dangle-pyrus/web2_nine2fine.git
cd web2_nine2fine
```

## 2. Tạo cơ sở dữ liệu

Tạo một database trống tên `nine2fine` (ví dụ bằng psql):

```bash
psql -U postgres -c "CREATE DATABASE nine2fine;"
```

## 3. Backend

```bash
cd backend
npm ci
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```

Mở `backend/.env` và điền giá trị (file `.env` không được commit). Các biến bắt buộc để khởi động:

- `DATABASE_URL` và `DIRECT_URL`: cùng một chuỗi, ví dụ `postgresql://postgres:<mật-khẩu>@localhost:5432/nine2fine?schema=public`.
- `OTP_HMAC_SECRET`: chuỗi ngẫu nhiên từ 32 ký tự trở lên.
- `CORS_ALLOWED_ORIGINS`: `http://localhost:4200` (bỏ trống cũng được, mặc định như vậy).
- `MAIL_MODE=dev-outbox`: thư được ghi thành file `.eml` vào `backend/dev-outbox` thay vì gửi thật (mã OTP, email đơn hàng đọc ở đó). Muốn gửi thật thì đặt `smtp` và điền `SMTP_*`.
- `SEED_ADMIN_EMAIL/PASSWORD`, `SEED_STAFF_EMAIL/PASSWORD`, `SEED_MEMBER_EMAIL/PASSWORD`: tài khoản sẽ được tạo ở bước seed. Mật khẩu 8–64 ký tự, có chữ in hoa và chữ số.
- `RETURN_ACCOUNT_KEY`: khoá mã hoá số tài khoản hoàn tiền, tạo bằng `openssl rand -base64 32`.

Các biến còn lại (SMTP, ngân hàng/SePay, lưu ảnh) có chú thích ngay trong `.env.example`.

Áp migration, sinh Prisma Client và nạp dữ liệu:

```bash
npx prisma migrate deploy   # tạo toàn bộ bảng
npx prisma generate         # nếu lỗi EPERM trên Windows: tắt backend đang chạy rồi chạy lại
npm run seed                # tạo 3 tài khoản admin / staff / member từ biến SEED_*
npm run seed:catalog        # danh mục + sản phẩm + biến thể + bảng size
npm run seed:checkout       # tham số checkout, voucher, địa giới VN (34 tỉnh, ~3.300 phường/xã), ngày nghỉ
npm run seed:home           # nội dung trang chủ mặc định
```

Dữ liệu demo cho báo cáo admin (tuỳ chọn, chỉ dùng trên DB dev): khoảng 90 ngày đơn hàng, khách, voucher, trả hàng, đánh giá.

```bash
npm run seed:demo           # nạp (chạy lại sẽ gỡ bản cũ rồi nạp mới)
npm run seed:demo:remove    # gỡ sạch dữ liệu demo
```

Chạy backend (cổng 4000):

```bash
npm run dev
```

Kiểm tra nhanh: http://localhost:4000/health.

### Thanh toán chuyển khoản QR (tuỳ chọn)

Trong `backend/.env` đặt `PAYMENT_SIMULATOR=true` (không liên kết ngân hàng, trang QR có nút "Giả lập đã nhận tiền") hoặc điền `BANK_*` + `SEPAY_WEBHOOK_KEY` để nhận tiền thật qua SePay. Sau đó bật cờ cửa hàng và khởi động lại backend:

```bash
npx tsx scripts/enable-bank-transfer.ts        # bật
npx tsx scripts/enable-bank-transfer.ts off    # tắt
```

## 4. Frontend

Mở terminal thứ hai:

```bash
cd frontend
npm ci
npm run start:local
```

Mở http://localhost:4200 (dùng `localhost`, không dùng `127.0.0.1`, vì backend chỉ cho phép origin `localhost`). `/api` được proxy tới `http://localhost:4000` (`frontend/proxy.conf.json`), nên backend phải đang chạy.

- Cửa hàng: http://localhost:4200
- Quản trị: http://localhost:4200/admin/login

Frontend không cần file `.env` để chạy. `frontend/.env.example` chỉ có `PEXELS_API_KEY` cho script tải ảnh tham khảo cục bộ (tuỳ chọn, không dùng bởi Angular).

## Tài khoản đăng nhập

Không có mật khẩu mặc định trong mã nguồn. Sau `npm run seed`, đăng nhập bằng email và mật khẩu bạn đã đặt trong `SEED_*`:

| Vai trò | Biến | Dùng ở |
| --- | --- | --- |
| Admin | `SEED_ADMIN_*` | `/admin/login`, toàn quyền |
| Nhân viên | `SEED_STAFF_*` | `/admin/login`, quyền hạn chế (đơn hàng) |
| Thành viên | `SEED_MEMBER_*` | cửa hàng |

`npm run seed:demo` thêm khách mẫu với email `@demo.nine2fine.local` (chỉ để có số liệu cho báo cáo).

## Kiểm thử

Backend (cần DB test riêng `n2f_test`; test từ chối chạy nếu trỏ vào DB khác, xem `N2F_TEST_DB_URL` trong `.env.example`):

```bash
cd backend
npm run typecheck
npm test
```

Frontend (Playwright chạy trên dữ liệu mock, không cần backend):

```bash
cd frontend
npx playwright install chromium   # lần đầu, nếu máy chưa có trình duyệt
npm run lint
npm run build
npm test
```

## Build production

```bash
cd backend && npm run build && npm start      # chạy dist/server.js
cd frontend && npm run build                  # kết quả ở frontend/dist
```

Khi triển khai thật: `NODE_ENV=production`, `COOKIE_SAMESITE`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY` theo hạ tầng, `PAYMENT_SIMULATOR=false`, và không bao giờ commit `.env`.

## Tài liệu

Xem [`docs/README.md`](docs/README.md) và [`docs/handoff.md`](docs/handoff.md) để biết trạng thái từng slice, quyết định thiết kế và các điểm còn mở.
