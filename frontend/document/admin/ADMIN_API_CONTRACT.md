# nine2fine Admin – API contract (v1)

Hợp đồng giữa giao diện admin (`src/app/admin`) và backend. Frontend đã gọi đúng các endpoint dưới đây trong
`src/app/admin/data-access/admin-apis.ts` (lớp `Http*Api`). Mock backend (`src/mocks/admin`) cài đặt đúng hành vi
này, nên khi backend xong chỉ cần đổi chế độ, không phải sửa màn hình.

- **Kiểu dữ liệu (nguồn chuẩn):** `src/app/admin/data-access/models.ts`. Tài liệu này chỉ nhắc tên kiểu.
- **Bật backend thật:** trong `src/app/core/api-config.ts` đặt `apiConfig = { mode: 'http', baseUrl: '/api' }`.
  Toàn bộ admin gọi dưới tiền tố `${baseUrl}/admin` (mặc định `/api/admin`).
- **Đổi một nhóm riêng lẻ:** `src/app/admin/data-access/admin-providers.ts` (hàm `bind(token, Mock, Http)`).

## 1. Quy ước chung

| Mục         | Quy ước                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Xác thực    | Cookie phiên `HttpOnly; Secure; SameSite=Lax` do `POST /auth/login` đặt. Cùng origin nên frontend không gửi header riêng. Tách hẳn với phiên của khách mua hàng.            |
| Phân quyền  | Backend **bắt buộc** kiểm tra quyền theo bảng ở mục 3. Frontend chỉ ẩn nút, không phải lớp bảo vệ.                                                                          |
| Định dạng   | JSON, `camelCase`. Thời gian: chuỗi ISO 8601 UTC (`2026-10-25T03:00:00.000Z`); frontend tự hiển thị theo GMT+7. Tiền: số nguyên VND.                                        |
| Ngày lọc    | `from`, `to` dạng `YYYY-MM-DD`, tính theo GMT+7, bao gồm cả hai đầu.                                                                                                        |
| Phân trang  | Query: `page` (từ 1), `pageSize` (20 · 50 · 100), `search`, `sort`, `dir` (`asc`/`desc`). Trả về `Page<T> = { items, total, page, pageSize }`. Tham số rỗng không được gửi. |
| Ghi nhật ký | Mọi thao tác ghi (POST/PUT/PATCH/DELETE) phải thêm một dòng `AuditEntry` (người làm, hành động, đối tượng, trước/sau nếu có).                                               |

### Lỗi

Mọi lỗi trả về body:

```json
{
  "code": "validation",
  "message": "Câu tiếng Việt hiển thị thẳng cho người dùng.",
  "fields": { "code": "Mã WELCOME10 đã tồn tại." }
}
```

| HTTP | `code`               | Khi nào                                      | Frontend xử lý                      |
| ---- | -------------------- | -------------------------------------------- | ----------------------------------- |
| 401  | `unauthenticated`    | Hết phiên                                    | Đưa về `/admin/login?returnUrl=…`   |
| 403  | `forbidden`          | Thiếu quyền                                  | Toast lỗi                           |
| 404  | `not-found`          | Không tồn tại                                | Trạng thái lỗi của trang            |
| 409  | `conflict`           | Dữ liệu bị người khác đổi, xóa mã đã dùng…   | Toast `message`                     |
| 409  | `invalid-transition` | Đơn không còn ở trạng thái cho phép thao tác | Toast + tải lại đơn                 |
| 422  | `validation`         | Trường không hợp lệ                          | Hiện `fields[tên]` dưới đúng ô nhập |
| 5xx  | `unavailable`        | Lỗi máy chủ                                  | Toast "Không kết nối được máy chủ"  |

`message` nên là câu tiếng Việt hoàn chỉnh; nếu thiếu, frontend dùng câu mặc định trong `http-support.ts`.

## 2. Endpoint

Tất cả đường dẫn dưới đây nằm sau `/api/admin`.

### Xác thực

| Method | Path           | Body                  | Trả về                   | Quyền        |
| ------ | -------------- | --------------------- | ------------------------ | ------------ |
| POST   | `/auth/login`  | `{ email, password }` | `AdminUser` + đặt cookie | công khai    |
| GET    | `/auth/me`     | –                     | `AdminUser` hoặc 401     | đã đăng nhập |
| POST   | `/auth/logout` | `{}`                  | 204                      | đã đăng nhập |

Đăng nhập sai trả 401 với `message` "Email hoặc mật khẩu không đúng." Tài khoản bị khóa trả 403.

### Tổng quan

| Method | Path         | Trả về                                                                        | Quyền        |
| ------ | ------------ | ----------------------------------------------------------------------------- | ------------ |
| GET    | `/dashboard` | `DashboardSummary` (query `range` ∈ `today` · `7d` · `30d`, mặc định `today`) | đã đăng nhập |

Nếu người dùng không có `dashboard.revenue`, trả `kpis.revenue`, `kpis.averageOrderValue`, `revenueSeries`,
`topProducts[].revenue` bằng `0`/rỗng (hoặc bỏ hẳn) – giao diện đã ẩn các phần này. `kpis.revenue/orders/averageOrderValue`
là tổng của kỳ `range`; `kpis.*.change` là tỉ lệ so với kỳ liền trước cùng độ dài (`today`: cùng thứ tuần trước;
`7d`/`30d`: 7/30 ngày trước đó; `0.12` = +12%), `null` khi không có số so sánh. `todo.lateDelivery` = số đơn đang
vận chuyển đã quá `delivery.estimatedAt`.

### Đơn hàng

| Method | Path                           | Body                    | Trả về                      | Quyền             |
| ------ | ------------------------------ | ----------------------- | --------------------------- | ----------------- |
| GET    | `/orders`                      | query `OrderQuery`      | `Page<AdminOrderSummary>`   | `orders.view`     |
| GET    | `/orders/counts`               | –                       | `Record<OrderView, number>` | `orders.view`     |
| GET    | `/orders/:id`                  | –                       | `AdminOrder`                | `orders.view`     |
| POST   | `/orders/:id/confirm-payment`  | `{}`                    | `AdminOrder`                | `orders.process`  |
| POST   | `/orders/:id/ship`             | `ShipInput`             | `AdminOrder`                | `orders.process`  |
| POST   | `/orders/:id/out-for-delivery` | `{}`                    | `AdminOrder`                | `orders.process`  |
| POST   | `/orders/:id/deliver`          | `{}`                    | `AdminOrder`                | `orders.process`  |
| POST   | `/orders/:id/cancel`           | `CancelInput`           | `AdminOrder`                | `orders.cancel`   |
| POST   | `/orders/:id/return/decision`  | `ReturnDecisionInput`   | `AdminOrder`                | `returns.process` |
| POST   | `/orders/:id/return/complete`  | `ReturnCompletionInput` | `AdminOrder`                | `returns.process` |
| POST   | `/orders/:id/comments`         | `{ text }`              | `AdminOrderEvent`           | `orders.view`     |
| PATCH  | `/orders/:id`                  | `{ tags: string[] }`    | `AdminOrder`                | `orders.process`  |

`OrderQuery`: `view`, `payment` (`cod` · `bank-transfer` · `card`), `from`, `to`, `search` (mã đơn, tên, email,
SĐT khách), `sort` ∈ `placedAt` · `total` · `id` · `customer`.

Saved view → trạng thái (dùng cho cả `view` và `/orders/counts`):

| `view`            | `status`                                                      |
| ----------------- | ------------------------------------------------------------- |
| `all`             | mọi trạng thái                                                |
| `pending-payment` | `pending-payment`                                             |
| `to-fulfil`       | `processing`                                                  |
| `in-transit`      | `shipping`, `delivering`                                      |
| `late`            | `shipping`, `delivering` và `delivery.estimatedAt` < hiện tại |
| `completed`       | `completed`                                                   |
| `cancelled`       | `cancelled`                                                   |
| `returns`         | `return-requested`, `returned`                                |

Chuyển trạng thái hợp lệ (ngoài bảng này trả 409 `invalid-transition`):

| Thao tác         | Từ                              | Sang                        | Ghi chú                                                               |
| ---------------- | ------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| confirm-payment  | `pending-payment`               | `processing`                | Đặt `paidAt`, bỏ `paymentDueAt`                                       |
| ship             | `processing`                    | `shipping`                  | Bắt buộc `trackingCode` (422 nếu trống)                               |
| out-for-delivery | `shipping`                      | `delivering`                |                                                                       |
| deliver          | `shipping`, `delivering`        | `completed`                 | Đặt `delivery.deliveredAt`                                            |
| cancel           | `pending-payment`, `processing` | `cancelled`                 | Hoàn hàng về kho; `refund: true` với đơn đã trả tiền thì tạo `refund` |
| return/decision  | `return-requested`              | giữ nguyên hoặc `completed` | `rejected` thì đơn về `completed`; `note` bắt buộc khi từ chối        |
| return/complete  | `return-requested` (đã duyệt)   | `returned`                  | `restock: true` cộng lại tồn kho có thể bán                           |

Mỗi thao tác thêm một `AdminOrderEvent` loại `system` vào `events` (mới nhất trước) và cập nhật `paymentState`.

### Trả hàng

| Method | Path       | Trả về                                                                                            | Quyền         |
| ------ | ---------- | ------------------------------------------------------------------------------------------------- | ------------- |
| GET    | `/returns` | `Page<ReturnSummary>` (query `ReturnQuery`: `state`, `search`, `sort` ∈ `requestedAt` · `amount`) | `orders.view` |

### Sản phẩm

| Method | Path                      | Body                                 | Trả về                      | Quyền             |
| ------ | ------------------------- | ------------------------------------ | --------------------------- | ----------------- |
| GET    | `/products`               | query `ProductQuery`                 | `Page<AdminProductSummary>` | `products.view`   |
| GET    | `/products/:id`           | –                                    | `AdminProduct`              | `products.view`   |
| POST   | `/products`               | `ProductInput`                       | `AdminProduct`              | `products.edit`   |
| PUT    | `/products/:id`           | `ProductInput`                       | `AdminProduct`              | `products.edit`   |
| POST   | `/products/bulk-status`   | `{ ids: string[], status }`          | 204                         | `products.edit`   |
| DELETE | `/products/:id`           | –                                    | 204                         | `products.delete` |
| POST   | `/uploads/product-images` | `multipart/form-data`, trường `file` | `ProductImage`              | `products.edit`   |

- `ProductQuery`: `view` (`all` · `active` · `draft` · `hidden` · `out-of-stock`), `category`, `search` (tên, SKU,
  tag), `sort` ∈ `updatedAt` · `name` · `price` · `inventory`.
- `cost` chỉ trả về và chỉ được ghi khi có `products.cost`; nếu không, trả `null` và bỏ qua giá trị gửi lên.
- Validation 422: `name` trống, `price ≤ 0`, `compareAtPrice ≤ price`, SKU trùng (`fields["variants"]`), sản phẩm
  `active` không có ảnh (`fields["images"]`), `slug` trùng (`fields["slug"]`).
- `variants[].id` bắt đầu bằng `new-` là biến thể mới, backend cấp id thật. `variants[].price = null` nghĩa là dùng giá
  sản phẩm. Thay đổi `inventory` từ form sản phẩm ghi một `InventoryMovement` lý do `correction`.
- Ảnh: JPG, PNG, WEBP, tối đa 5 MB (422 nếu sai). Trả về URL đã lưu (CDN) để đặt thẳng vào `<img>`.

### Tồn kho

| Method | Path                                | Body                   | Trả về                                 | Quyền              |
| ------ | ----------------------------------- | ---------------------- | -------------------------------------- | ------------------ |
| GET    | `/inventory`                        | query `InventoryQuery` | `Page<InventoryItem>`                  | `inventory.view`   |
| POST   | `/inventory/:variantId/adjustments` | `InventoryAdjustment`  | `InventoryItem`                        | `inventory.adjust` |
| GET    | `/inventory/:variantId/movements`   | –                      | `InventoryMovement[]` (mới nhất trước) | `inventory.view`   |

- `view`: `low` = `0 < available ≤ lowStockThreshold`, `out` = `available ≤ 0`. `sort` ∈ `available` · `name` · `onHand`.
- `available = onHand − reserved`; `reserved` là số đang giữ cho đơn `pending-payment`/`processing`.
- `mode: 'delta'` cộng/trừ `quantity`; `mode: 'set'` đặt `onHand = quantity`. Kết quả nhỏ hơn `reserved` trả 422.

### Khách hàng

| Method | Path             | Body                  | Trả về                       | Quyền            |
| ------ | ---------------- | --------------------- | ---------------------------- | ---------------- |
| GET    | `/customers`     | query `CustomerQuery` | `Page<AdminCustomerSummary>` | `customers.view` |
| GET    | `/customers/:id` | –                     | `AdminCustomer`              | `customers.view` |
| PATCH  | `/customers/:id` | `CustomerUpdate`      | `AdminCustomer`              | `customers.edit` |

`CustomerQuery`: `tier`, `status`, `search` (tên, email, SĐT), `sort` ∈ `lastOrderAt` · `totalSpent` · `orderCount` · `name`.
Không có `customers.contact` thì nên che email/SĐT ngay ở backend (frontend cũng đã che). `recentOrders` tối đa 5 đơn.

### Khuyến mãi

| Method | Path              | Body                   | Trả về            | Quyền             |
| ------ | ----------------- | ---------------------- | ----------------- | ----------------- |
| GET    | `/promotions`     | query `PromotionQuery` | `Page<Promotion>` | `promotions.view` |
| GET    | `/promotions/:id` | –                      | `Promotion`       | `promotions.view` |
| POST   | `/promotions`     | `PromotionInput`       | `Promotion`       | `promotions.edit` |
| PUT    | `/promotions/:id` | `PromotionInput`       | `Promotion`       | `promotions.edit` |
| PATCH  | `/promotions/:id` | `{ enabled: boolean }` | `Promotion`       | `promotions.edit` |
| DELETE | `/promotions/:id` | –                      | 204               | `promotions.edit` |

- Trạng thái tính như `promotionState()` trong `src/app/admin/core/status.ts`: tắt → `disabled`; chưa tới
  `startsAt` → `scheduled`; quá `endsAt` hoặc hết lượt → `expired`; còn lại `running`. Lọc `state` phải theo đúng luật này.
- 422: `code` không khớp `^[A-Z0-9_-]{3,20}$` hoặc trùng; `value` ngoài 1–100 (percent) hoặc ≤ 0 (fixed);
  `endsAt ≤ startsAt`. Mã được lưu in hoa.
- Xóa mã có `used > 0` trả 409 `conflict` ("Mã đã được dùng nên không thể xóa. Hãy tắt mã thay vì xóa.").

### Cài đặt

| Method | Path              | Body                                                   | Trả về                        | Quyền            |
| ------ | ----------------- | ------------------------------------------------------ | ----------------------------- | ---------------- |
| GET    | `/settings/store` | –                                                      | `StoreSettingsValue`          | `settings.store` |
| PUT    | `/settings/store` | `StoreSettingsValue`                                   | `StoreSettingsValue`          | `settings.store` |
| GET    | `/staff`          | –                                                      | `StaffMember[]`               | `settings.staff` |
| POST   | `/staff`          | `StaffInput`                                           | `StaffMember` (gửi email mời) | `settings.staff` |
| PATCH  | `/staff/:id`      | `Partial<StaffInput> & { status? }`                    | `StaffMember`                 | `settings.staff` |
| GET    | `/audit-log`      | query `AuditQuery` (`targetType`, `search`, `sort=at`) | `Page<AuditEntry>`            | `settings.audit` |

- `StoreSettingsValue` là kiểu dùng chung với storefront (`src/app/core/store-settings.ts`); sau khi lưu, endpoint
  công khai `GET /api/store/settings` phải trả giá trị mới.
- Luôn phải còn ít nhất một quản trị viên đang hoạt động: hạ quyền hoặc khóa quản trị viên cuối cùng trả 409. Nên chặn
  thêm việc tự khóa hoặc tự hạ quyền chính mình (giao diện đã ẩn thao tác này).
- Email mời trùng trả 422 `fields["email"]`.

### Tìm kiếm toàn cục

| Method | Path          | Trả về                              | Quyền                                              |
| ------ | ------------- | ----------------------------------- | -------------------------------------------------- |
| GET    | `/search?q=…` | `SearchResults` (mỗi nhóm tối đa 5) | đã đăng nhập; chỉ trả nhóm người dùng có quyền xem |

## 3. Vai trò và quyền

Hai vai trò cố định (`admin`, `staff`), không chỉnh quyền theo từng người. Nguồn chuẩn: `src/app/admin/core/permissions.ts`.

| Quyền                                                  | admin | staff |
| ------------------------------------------------------ | :---: | :---: |
| `dashboard.revenue`                                    |   ✓   |       |
| `orders.view` · `orders.process` · `returns.process`   |   ✓   |   ✓   |
| `orders.cancel` · `orders.export`                      |   ✓   |       |
| `products.view`                                        |   ✓   |   ✓   |
| `products.edit` · `products.delete` · `products.cost`  |   ✓   |       |
| `inventory.view` · `inventory.adjust`                  |   ✓   |   ✓   |
| `customers.view`                                       |   ✓   |   ✓   |
| `customers.edit` · `customers.contact`                 |   ✓   |       |
| `promotions.view`                                      |   ✓   |   ✓   |
| `promotions.edit`                                      |   ✓   |       |
| `settings.store` · `settings.staff` · `settings.audit` |   ✓   |       |

## 4. Kiểm tra khi nối backend

1. Đặt `mode: 'http'`, chạy `npm start` với proxy `/api` tới backend.
2. Đăng nhập, mở lần lượt các mục trên sidebar: không có toast lỗi, số trên tab đơn hàng khớp danh sách.
3. Chạy `npx playwright test tests/admin.spec.ts` trên dữ liệu thử của backend (các test dùng tài khoản và id của mock;
   cần seed tương ứng hoặc sửa id).
