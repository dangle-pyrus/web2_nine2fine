# Kế hoạch triển khai Gói P1 (Slice 10) - lát 10.1 xong, contract locked 2026-11-13

Hợp đồng: `docs/api/openapi.yaml` (phần "Slice 10", 32 operation, 9 tag mới, `x-status: locked`). BR/AC: `docs/product/PRD.md` Slice 10 (BR-P1, BR-RET-60..66, BR-REV, BR-WISH, BR-REC, BR-MOM, BR-PROMO, BR-CMS). Backlog: `docs/product/backlog.md` lát 10.1-10.11. Mặc định PO S10-Q1..Q12 (Thắng vắng). Quy ước module: `backend/src/modules/<module>/*.routes.ts` + service / schemas / mapper như các slice trước. Tham số gom ở `P1_ASSUMPTIONS` (`backend/src/config/assumptions.ts`), quyền ở `CONTENT_PERMISSIONS`.

## 0. Việc lát 10.1 đã làm (nền, không có endpoint)

| Việc | File |
| --- | --- |
| Contract locked | `docs/api/openapi.yaml` |
| Migration cộng thêm | `backend/prisma/migrations/20261113000100_p1_bundle/migration.sql`; `backend/prisma/schema.prisma` (5 model mới, 3 bảng mở rộng) |
| 3 mã lỗi mới + `error.current` | `backend/src/lib/errors.ts` (`not-eligible`, `already-reviewed`, `wishlist-full`, `Errors.notEligible/alreadyReviewed/wishlistFull/versionConflictWith`), `backend/src/middleware/error.ts` |
| Quyền `reviews.moderate`, `content.view`, `content.edit` | `backend/src/config/assumptions.ts` (`CONTENT_PERMISSIONS`), `backend/src/middleware/require-permission.ts` |
| Hằng số P1 (mọi giới hạn trong contract) | `backend/src/config/assumptions.ts` (`P1_ASSUMPTIONS`) |
| Giới hạn tần suất đánh giá, wishlist | `backend/src/middleware/rate-limit.ts` (`reviewCreateLimit`, `wishlistWriteLimit`) |
| KHUNG router rỗng đã gắn ở `app.ts` (để các lát song song KHÔNG sửa `app.ts`) | `modules/reviews/reviews.routes.ts`, `modules/wishlist/wishlist.routes.ts`, `modules/recommendations/recommendations.routes.ts`, `modules/content/content.routes.ts`, `modules/sales-admin/sales-admin.routes.ts`; `backend/src/app.ts` |
| Seed nội dung trang chủ mặc định (chưa chạy) | `backend/prisma/seed-home-content.ts` (`npm run seed:home`, idempotent, `createMany skipDuplicates`), `backend/scripts/export-home-seed.ts`, `backend/prisma/seed-data/home-content.json` (15 khối, 4 danh mục, 4 Moment), `backend/prisma/seed-data/media-ids.json` (102 id ảnh) |

Chưa áp migration lên DB nào (kể cả `n2f_dev` / `n2f_test`): lát đầu tiên chạy `npx prisma migrate dev` hoặc `migrate deploy` trên DB cục bộ. Prisma Client đã tạo lại (kiểu mới có), riêng `query_engine-windows.dll.node` bị tiến trình khác giữ nên rename EPERM: chạy lại `npm run prisma:generate` khi không còn tiến trình nào dùng.

## 1. Operation theo lát

| Lát | Operation (xem contract) | Quyền | Giới hạn |
| --- | --- | --- | --- |
| 10.2 A | `POST /orders/{orderCode}/return`, `/return/cancel`, `/return/estimate` (Should), `POST /orders/{orderCode}/return/photos`, `GET .../return/photos/{photoId}`; `Order.canReturn/returnDeadline/return` cho đơn xem bằng `n2f_oa`; `AdminReturn(Summary).source`, `AdminOrderSummary.returnPending` (Should) | `n2f_oa` đúng đơn | tạo 5/giờ/grant + 10/giờ/IP; ảnh 30/giờ/grant + 60/giờ/IP |
| 10.3 E+G | `GET /content/home`, `GET|PUT /admin/content/home`, `GET /admin/size-charts`, `PUT /admin/size-charts/{category}`; đổi `GET /size-charts/{category}` (60 s, `updatedAt`) | công khai; `content.view`; `content.edit` | catalog 120/60 s/IP; admin chung |
| 10.4 C | `GET /account/wishlist`, `PUT|DELETE /account/wishlist/{productId}`, `POST /account/wishlist/merge` | `n2f_sid` | ghi 60/phút/tài khoản |
| 10.5 B | `GET /products/{productId}/reviews` (đổi), `GET /reviews/eligibility`, `POST /reviews`, `GET /admin/reviews`, `POST /admin/reviews/{id}/hide|show`, `PUT /admin/reviews/{id}/reply`; `Product.rating` | công khai; `n2f_sid`; `reviews.moderate` | gửi 5/giờ/tài khoản |
| 10.6 D | `GET /recommendations` | công khai | catalog 120/60 s/IP, `max-age=30` |
| 10.7 F | `salePrice/saleStartsAt/saleEndsAt` ở `PUT /admin/products/{id}`; `Product.discountPercent/saleEndsAt`; `sale=true` (Should); `POST /admin/sales/bulk/preview|bulk` (Should) | `products.write` + `promotions.write` (admin) | ghi admin 60/60 s |
| 10.8 G (Should) | `GET /collections`, `GET /collections/{slug}`, `GET|POST /admin/collections`, `GET|PUT|DELETE /admin/collections/{id}`, `POST /admin/content/home/reset`, cảnh báo `warnings` | công khai; `content.view` / `content.edit` | như trên |

## 2. Bảng, chỉ mục, ràng buộc (migration `20261113000100_p1_bundle`)

Chỉ cộng thêm (đã kiểm: không `DROP` / `TRUNCATE` / `RENAME` / đổi kiểu / sửa dữ liệu; không thêm giá trị enum nên chỉ MỘT tệp, khác Slice 9). Bảng mới bật RLS (không policy). Phần bảng / cột / chỉ mục / FK sinh bằng `prisma migrate diff` (từ schema HEAD), CHECK + RLS viết tay.

| Bảng / cột | Khoá, chỉ mục | CHECK / ràng buộc chính |
| --- | --- | --- |
| `product_reviews` (review_id PK, product_id FK CASCADE, user_id FK SET NULL, order_id FK SET NULL, author_display, rating, fit, size_bought, height, title, body, status, created_at, updated_at, hidden_at/by/by_name/reason, reply_body/at/by/by_name) | UNIQUE `uq_product_reviews_user_product (user_id, product_id)`; `idx_product_reviews_public (product_id, status, created_at DESC, review_id DESC)`; `idx_product_reviews_created (created_at DESC, review_id DESC)` | rating 1..5; fit in (-1,0,1); status in (visible, hidden); `btrim(title) >= 2`, `btrim(body) >= 20`, size_bought không rỗng; `(status='hidden') = (hidden_at IS NOT NULL)` và ẩn thì reason >= 5; `(reply_body IS NULL) = (reply_at IS NULL)` và reply >= 5 |
| `wishlist_items` (user_id FK CASCADE, product_id FK CASCADE, added_at) | PK `(user_id, product_id)`; `idx_wishlist_user_added (user_id, added_at DESC, product_id)`; `idx_wishlist_product (product_id)` | Giới hạn 100 mục `ACTIVE` do service giữ (mục 5.3), DB không CHECK được |
| `home_content` (content_id SMALLINT PK default 1, data JSONB, is_default, updated_at, updated_by FK SET NULL, updated_by_name) | PK | `content_id = 1`; `jsonb_typeof(data) = 'object'` |
| `collections` (collection_id PK, slug, name, description, status, published_at, created_at, updated_at, updated_by FK, updated_by_name) | UNIQUE `uq_collections_slug`; `idx_collections_status (status, updated_at DESC)` | slug `^[a-z0-9-]{2,50}$`; status in (active, draft); `status='active'` thì `published_at` có giá trị; name không rỗng |
| `collection_products` (collection_id FK CASCADE, product_id FK CASCADE, position SMALLINT) | PK `(collection_id, product_id)`; `idx_collection_products_pos (collection_id, position)`; `idx_collection_products_product` | position >= 0; <= 200 mục / bộ do service giữ |
| `products` + `sale_price NUMERIC(12,2)`, `sale_starts_at`, `sale_ends_at` (TIMESTAMP(6), UTC) | `idx_products_sale (sale_ends_at, sale_starts_at)` | `chk_products_sale_all_or_none`; `chk_products_sale_price` (>= 1000, < price, nguyên); `chk_products_sale_window` (`ends >= starts` và `ends < starts + 90 ngày`) |
| `size_charts` + `updated_by FK SET NULL`, `updated_by_name` (DEFAULT '') | (bảng cũ, PK category_id) | (không) |
| `return_photos` + `grant_hash CHAR(64)` | `idx_return_photos_grant (grant_hash)` | `grant_hash IS NULL` hoặc (`uploader_user_id IS NULL` và SHA-256 hex); KHÔNG FK (grant hết hạn không được làm mất ảnh) |

Chú ý khi sửa `price` (lát 10.7): CHECK `sale_price < price` là lưới an toàn; service phải kiểm trước và trả `422 salePrice` (BR-PROMO-05), không để lỗi `23514` thành `500`. Seed catalog `--force` ghi lại `price` nhưng không đụng cột `sale_*`.

## 3. Hàm giá hiệu lực dùng chung (chỉ ở TS, một nơi)

Quyết định kỹ thuật (ghi `docs/decisions.md`): MỘT hàm TypeScript `effectivePrice(product, now)` ở `backend/src/modules/pricing/effective-price.ts` (lát 10.7 tạo file); KHÔNG có biểu thức SQL thứ hai. Doanh thu, hạng, trả hàng đọc `order_items.unit_price` đã lưu nên không cần.

```ts
interface SaleFields { price: number; compareAtPrice: number | null; salePrice: number | null; saleStartsAt: Date | null; saleEndsAt: Date | null }
isSaleRunning(p, now)   // salePrice !== null && saleStartsAt <= now && now <= saleEndsAt  (cả hai đầu gồm)
effectivePrice(p, now)  // { price, compareAtPrice, discountPercent?, saleEndsAt? }
                        //  đang chạy: price = salePrice, compareAtPrice = price gốc, discountPercent = floor((price - sale) * 100 / price)
                        //  ngoài đợt: price gốc, compareAtPrice = giá gạch nhập tay nếu > price
isOnSale(p, now)        // isSaleRunning || (compareAtPrice !== null && compareAtPrice > price)   (BR-PROMO-04, một định nghĩa "đang giảm")
saleState(p, now)       // none | upcoming | running | ended (admin)
```

`now` là một giá trị cho cả yêu cầu (`lib/clock.ts::now()`, test dùng đồng hồ giả); mọi chỗ nhận `now` làm tham số thay vì gọi lại.

| Nơi dùng (ảnh hưởng) | Cách dùng | File |
| --- | --- | --- |
| Catalog: danh sách / chi tiết / tìm kiếm | `toProductDto(row, categorySlug, now, rating)` gọi `effectivePrice`; thêm `rating`, `discountPercent`, `saleEndsAt` | `catalog.mapper.ts`, `catalog.service.ts`, `catalog.types.ts` |
| Catalog: lọc `maxPrice`, sắp `price-asc/desc`, `sale=true` | Khi có `maxPrice`, `sale` hoặc sắp theo giá: `findMany` CHỈ cột (id, slug, price, compare, sale_*) của các sản phẩm khớp bộ lọc còn lại, lọc / sắp (hoà `slug`) / cắt trang bằng `effectivePrice` ở TS, rồi `findMany` theo id của trang (giữ thứ tự). Mọi trường hợp khác giữ đường Prisma hiện tại (sắp / phân trang ở DB). Catalog nhỏ (vài trăm sản phẩm) nên rẻ | `catalog.service.ts`, `catalog.schemas.ts` (`sale`) |
| Giỏ, báo giá, đặt đơn | `loadVariantRows` SELECT thêm `p.sale_price, p.sale_starts_at, p.sale_ends_at`; `VariantRow` thêm 3 trường; `refreshLine(req, row, settings, now)` tính `unitPrice`, `compareAtPrice`, `onSale` bằng hàm chung; `place-order.service.ts` lưu `unit_price` = giá hiệu lực, `compare_at_price` = giá gốc khi trong đợt | `checkout/lines.service.ts`, `checkout/quote.service.ts`, `cart/cart.service.ts`, `order/place-order.service.ts` |
| Voucher `excludeSaleItems` | `LineCtx.onSale` (đã có) nay từ `isOnSale`; lý do `excluded-sale-items` không đổi | `voucher/voucher.service.ts` (chỉ đọc), `lines.service.ts` |
| Gợi ý, wishlist, bộ sưu tập | Dùng `toProductDto` của catalog (không tính giá riêng) | `recommendations/*`, `content/collections.*` |
| Admin sản phẩm | Đọc / ghi 3 cột sale, kiểm BR-PROMO-01, 05; `AdminProduct.saleState`; sửa `price` kiểm `salePrice` | `catalog-admin/product.mapper.ts`, `product.rules.ts`, `product.write.ts`, `catalog-admin.schemas.ts`, `product.query.ts` |
| Không đổi | Doanh thu (`revenue.sql.ts`), hạng (`net-spent.sql.ts`), trả hàng (`return-amount.ts`) | đọc `unit_price` đã lưu |

Rủi ro chính của slice là mục này (chạm giá ở mọi nơi); vì vậy 10.7 làm SAU các lát Must khác và có bộ test "một số, mọi nơi" (mục 7, T-PROMO-10).

## 4. Seed

`npm run seed:home` (chưa chạy): `createMany({ skipDuplicates: true })` một dòng `home_content` từ `home-content.json`; chạy lại không đè bản admin đã sửa. Không bắt buộc: thiếu dòng thì `GET /content/home` dùng chính bản mặc định (đọc cùng JSON, `isDefault = true`, `updatedAt = null`), nên API chạy được trước khi seed. Bảng size: dùng `size_charts` đã seed bởi `seed-catalog`; `updated_by_name = ''` nghĩa là chưa tuỳ chỉnh. `media-ids.json` phục vụ kiểm `mediaId` (BR-CMS-02); tạo lại bằng `npx tsx scripts/export-home-seed.ts` khi fixture FE đổi.

## 5. Thiết kế từng lát (điểm cần cẩn thận)

### 5.1 Lát 10.2 - trả hàng vãng lai
- Khung đã có từ 9.x: `photo.service.ts` (`PhotoOwner kind guest`, `PhotoViewer kind guest`), `return.mapper.ts` (`PhotoAudience guest`), `requested_via = guest` ở CHECK, `error.ts` đã cho `orders/<code>/return/photos` trả `invalid-image size`. Việc còn lại: `Principal = member | guest` ở `create-return.service.ts`, 5 route trong `order.routes.ts` (hoặc `returns.routes.ts` mới `guestReturnsRouter` mount ở `/orders` TRƯỚC `/:orderCode`), nhánh `canReturn / returnDeadline / return` ở `order.service.ts` (`viewerIsOwner` hiện ép `canReturn = false`) và `lookup.service.ts` (dòng 122).
- Grant: đọc cookie `n2f_oa`, băm SHA-256 → `order_access_grants.token_hash`; còn hạn; gắn đúng đơn. Đơn có `user_id` (thành viên) → `404` (không phân biệt với đơn không tồn tại). Phiên `n2f_sid` không mở endpoint (khác bản draft 9.6).
- Ảnh: `return_photos.order_id` = đơn của grant, `grant_hash` = băm grant; gắn vào yêu cầu cần `grant_hash` KHỚP grant gọi, `created_at` trong 24 giờ, `return_id IS NULL`, cùng `order_id`. Xem ảnh: grant của chính đơn đó (mọi grant còn hạn của đơn, để khách tra cứu lại bằng OTP mới vẫn thấy ảnh mình đã gửi; chỉ người qua OTP đúng email đơn) hoặc staff / admin. Điểm diễn giải so với PRD "chỉ xem được bằng grant đó": xem mục 8, câu hỏi 3.
- Giới hạn: bộ đếm mới key = băm grant và key = IP (`createRateLimit` ở `rate-limit.ts`; hằng ở `P1_ASSUMPTIONS.guestReturn`). Đặt SAU xác thực grant, đếm mọi lần gọi tới được thân; ảnh `guestReturnPhotoLimit` cùng cách.
- Email "Đã nhận yêu cầu": dùng mẫu 9.x với `to = orders.email`; kiểm không chứa mã tra cứu / OTP / số tài khoản. Sự kiện đơn `return_requested` người = `customer`, `actor_user_id = NULL`.
- `AdminReturn.source`, `AdminReturnSummary.source` từ `requested_via`; `AdminOrderSummary.returnPending` (Should): `EXISTS (order_returns WHERE order_id = o.order_id AND state = 'requested')` trong `order-admin` list query. Chữ chính sách + trợ giúp là FE (BR-RET-66).

### 5.2 Lát 10.3 - nội dung trang chủ, Moment, bảng size
- `GET /content/home`: đọc `home_content` (hoặc JSON mặc định), lọc `enabled`, đếm `ACTIVE` theo Moment bằng MỘT truy vấn (`unnest(moments)` + `GROUP BY`), bỏ thẻ `count = 0`, `href = /shop?moment=<mã>`. Cache `public, max-age=60`; router public chặn phương thức ghi → `404` (như `store.routes.ts`).
- `PUT /admin/content/home`: `requirePermission('content.edit')` TRƯỚC khi đọc thân; parser JSON 64 KB riêng (như `/admin/products`; hiện toàn cục 16 KB, bản 15 khối ~ 8 KB nhưng 12 khối tối đa vẫn có thể > 16 KB: chọn parser riêng giống `catalog-admin`). Zod gom MỌI lỗi theo đường dẫn (dùng `Errors.validationMany`, bộ chuẩn hoá `lib/text.ts`). Kiểm `mediaId`: một truy vấn `SELECT media_id FROM media_assets WHERE media_id = ANY(...)` cho id `up-*`, id còn lại tra `media-ids.json` (nạp một lần). Ghi: `UPDATE home_content SET ... WHERE content_id = 1 AND updated_at = $token` (0 dòng → đọc lại, `Errors.versionConflictWith(adminDto)`); chưa có dòng: `INSERT ... ON CONFLICT DO NOTHING` khi `updatedAt = null`, 0 dòng → 409. `updated_at = max(now, cũ + 1 ms)` (mẫu `settings.service.ts`).
- Bảng size: `PUT` đọc `size_charts` theo `category_id`; so `updated_at` (hiện mặc định `now()` từ seed, nên `GET` trả `updatedAt` luôn có giá trị với bảng đã seed; `null` chỉ khi chưa có dòng); cập nhật `data`, `updated_at`, `updated_by`, `updated_by_name`. `catalog.service.getSizeChart` thêm `updatedAt` chỉ khi `updated_by_name <> ''`; đổi `max-age` 3600 → 60 ở `catalog.routes.ts` / `catalog.controller.ts`. Test cũ `catalog.test.ts` (dòng 355 `max-age=3600`) phải sửa theo.
- `moments` ở `GET /admin/content/home` không có `count` / `href` (chỉ chữ + ảnh).

### 5.3 Lát 10.4 - wishlist
- Mọi ghi trong MỘT giao dịch: `SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE` (khoá theo tài khoản, tuần tự hoá `PUT` / `merge`) → đếm `wishlist_items w JOIN products p WHERE p.status = 'ACTIVE'` → chèn `ON CONFLICT DO NOTHING`. 20 yêu cầu song song khi 99: đúng 1 chèn mới. Đọc không khoá.
- `merge`: bỏ trùng giữ thứ tự gửi, bỏ id không phải UUID / không `ACTIVE` (một truy vấn `ANY`), chèn theo thứ tự đến khi đủ `max - count`, `skipped = invalid + overflow`; `added_at` của các mục gộp tăng dần theo thứ tự gửi (cùng `now()` + offset 1 ms để thứ tự "mới thêm trước" xác định).
- `DELETE`: `deleteMany` không kiểm sản phẩm; luôn 204.
- FE: `GET /products?ids=` ≤ 48; BR-WISH-05 (đăng xuất xoá cache, danh sách chưa đồng bộ) là FE.

### 5.4 Lát 10.5 - đánh giá
- Điều kiện đủ (`reviews/eligibility.ts`, một hàm cho eligibility và `POST /reviews`): đơn `completed`, `delivered_at >= now - 365 ngày`, chứa sản phẩm; `ordered = Σ oi.quantity`; `refunded = Σ ri.accepted_quantity` của `order_return_items` thuộc yêu cầu `state = 'refunded'` của các đơn đó, cùng `product_id`; đủ điều kiện khi `ordered > refunded`; `sizeBought` = `oi.size` của đơn có `delivered_at` MỚI NHẤT (hoà `order_id`).
- `POST /reviews`: trong giao dịch kiểm `already-reviewed` (tồn tại) → `not-eligible` → `INSERT` (UNIQUE là lưới an toàn: `23505` → `already-reviewed`). `author_display` = `lastName + ' ' + chữ cái đầu của firstName + '.'` (NFC, in hoa chữ cái đầu; ví dụ "Nguyễn V."), chụp lúc gửi. Chuẩn hoá chuỗi bằng `lib/text.ts`; `fieldErrors` đủ mọi lỗi. Không `Idempotency-Key`.
- Điểm trung bình (`reviews/rating.ts`, dùng cho PLP, PDP, `summary`): `SELECT product_id, count(*), sum(rating) FROM product_reviews WHERE status = 'visible' AND product_id = ANY($ids) GROUP BY product_id`; `average = floor((sum * 20 + count) / (2 * count)) / 10` (half-up 1 chữ số; 13/3 → 4,3; 16/4 → 4,0). Gắn vào `toProductDto` trong `catalog.service` (thêm một truy vấn cho cả trang, không N+1).
- Danh sách công khai: `idx_product_reviews_public` phủ lọc + sắp; `summary` (distribution, fit) một truy vấn `GROUP BY rating, fit`. Sản phẩm không `ACTIVE` → `404`.
- Admin: `updated_at` tăng ngặt; ẩn / hiện / trả lời dùng `UPDATE ... WHERE review_id = $1 AND updated_at = $token` (0 dòng → phân biệt 404 / 409); ghi `hidden_by_name`, `reply_by_name` chụp tên nhân viên lúc đó (AdminReview.hiddenBy/reply.author). Số đếm tab: `count(*) FILTER (WHERE ...)` một truy vấn.
- Đường dẫn `/reviews/*` đứng sau `originGuard` nên POST có CSRF; `GET /reviews/eligibility` dùng `optionalAuth`.

### 5.5 Lát 10.6 - gợi ý
- Một hàm `recommend(inputIds[], limit, now)` ở `recommendations/recommend.ts`: nạp MỘT lần mọi sản phẩm `ACTIVE` có tồn (cột: id, slug, category_id, moments, sales_rank + biến thể tồn) rồi lọc / xếp trong TS theo 4 bước; nhiều đầu vào = cộng điểm các danh sách 8 mục. Sắp ổn định `sales_rank`, `slug`. Còn hàng = `EXISTS biến thể inventory_qty > 0`. Trả `Product` đầy đủ bằng `toProductDto` (một `findMany` theo id kết quả).
- Should (REC-05): bước 0 "mua cùng" ≥ 3 đơn `completed` trong 365 ngày (một truy vấn tự nối `order_items`), "cùng bộ sưu tập" cần 10.8.
- Router public (`catalogRateLimit`, chặn ghi), `Cache-Control: public, max-age=30`.

### 5.6 Lát 10.7 - khuyến mãi
- Mục 3 là phần lõi. Zod `AdminProductInput`: thêm 3 trường (vắng = giữ, ba `null` = gỡ, ba giá trị = đặt); ngày `YYYY-MM-DD` hoặc ISO đúng biên 00:00:00 / 23:59:59 giờ VN (dùng `lib/vn-time.ts`); độ dài `ends <= starts + 89 ngày 23:59:59`; `salePrice` 1.000 ≤ x < `price` MỚI (nếu đổi giá). `requirePermission('promotions.write')` thêm khi thân có khoá `sale*`.
- Bulk (Should): `sales-admin/bulk-sale.service.ts`; tính `salePrice = floor(price * (100 - %) / 100 / 1000) * 1000`; apply trong một giao dịch `SELECT ... FOR UPDATE` các dòng sản phẩm của danh mục rồi tính lại.
- `GET /products?sale=true` (Should) dùng `isSaleRunning` ở đường TS của mục 3.
- Lát đụng nhiều file chung → làm SAU 10.2-10.6 (mục 6).

### 5.7 Lát 10.8 - bộ sưu tập (Should, cắt được)
- `content/collections.service.ts` + `collections.routes` (public) và admin. Slug khoá khi `published_at IS NOT NULL`; `status → active` lần đầu ghi `published_at = now`. `productIds` thay nguyên trong một giao dịch (`DELETE` rồi `INSERT` theo thứ tự, ≤ 200). `POST /admin/content/home/reset`. Cảnh báo `warnings`: quét `href` dạng `/product/<slug>` và `/collections/<slug>` so với `products.status` / `collections`.
- Nếu cắt: `contentPublicRouter` / `adminCollectionsRouter` giữ rỗng; FE ẩn ô / menu (contract đã đánh `x-priority: should`).

## 6. Thứ tự, song song, file theo lát (tránh xung đột)

Thứ tự: 10.1 (xong) → 10.2 ∥ 10.3 ∥ 10.4 ∥ 10.5 (đều chỉ cần 10.1) → 10.6 (sau 10.5 để có `rating` trong DTO, nhưng không bắt buộc) → 10.7 (cuối các lát Must) → 10.8 → 10.9 QA → 10.10 nghiệm thu thật. Cắt từ cuối: 10.8 + Should, 10.7, 10.6, 10.4, 10.5.

File SỞ HỮU bởi từng lát (chỉ lát đó sửa; mọi lát khác chỉ đọc):

| Lát | File mới | File sửa (của lát) |
| --- | --- | --- |
| 10.2 | `modules/returns/guest-grant.ts` (đọc / băm / kiểm grant), test `returns-guest.test.ts` | `modules/returns/create-return.service.ts`, `photo.service.ts`, `return.mapper.ts`, `returns.routes.ts` hoặc `modules/order/order.routes.ts` (5 route), `modules/order/order.service.ts` (`canReturn` vãng lai), `modules/order/lookup.service.ts` (dòng 122), `modules/order-admin/*` list query (`returnPending`), `return.query.ts` (`source`), bộ đếm guest ở `middleware/rate-limit.ts` (chỉ khối `guestReturn*` MỚI thêm cuối khối trả hàng) |
| 10.3 | `modules/content/home-content.service.ts`, `home-content.schemas.ts`, `home-content.default.ts` (đọc JSON), `size-chart-admin.service.ts`, test `content-home.test.ts`, `content-size-chart.test.ts` | `modules/content/content.routes.ts` (khung 10.1; lát 10.3 điền `contentPublicRouter`, `adminContentRouter`, `adminSizeChartsRouter`), `modules/catalog/catalog.service.ts` (`getSizeChart` + `updatedAt`) và `catalog.routes.ts` / `catalog.controller.ts` (`max-age`), `test/catalog.test.ts` (2 chỗ cache 3600) |
| 10.4 | `modules/wishlist/wishlist.service.ts`, `wishlist.schemas.ts`, test `wishlist.test.ts` | `modules/wishlist/wishlist.routes.ts` |
| 10.5 | `modules/reviews/{eligibility,review.service,review.mapper,review.schemas,rating,admin-review.service}.ts`, test `reviews-*.test.ts` | `modules/reviews/reviews.routes.ts`; `modules/catalog/catalog.routes.ts` + `catalog.controller.ts` (thay route `GET /products/:id/reviews` luôn `[]`), `catalog.mapper.ts` + `catalog.types.ts` (`rating`) và `catalog.service.ts` (nạp điểm cho trang) — **trùng với 10.7 / 10.6**; `test/catalog.test.ts` dòng 295-299 (reviews `[]`) |
| 10.6 | `modules/recommendations/{recommend,recommend.schemas}.ts`, test `recommendations.test.ts` | `modules/recommendations/recommendations.routes.ts` (đọc `catalog.mapper.toProductDto`) |
| 10.7 | `modules/pricing/effective-price.ts`, `modules/sales-admin/{bulk-sale.service,bulk-sale.schemas}.ts`, test `promo-*.test.ts` | `modules/catalog/catalog.{service,mapper,types,schemas}.ts`, `modules/checkout/{lines,quote}.service.ts`, `modules/cart/cart.service.ts`, `modules/order/place-order.service.ts`, `modules/catalog-admin/{product.mapper,product.rules,product.write,product.query,catalog-admin.schemas}.ts`, `modules/sales-admin/sales-admin.routes.ts`, `test/pricing.test.ts` + `quote-voucher.test.ts` + `catalog.test.ts` (chạy lại AC-PROMO-08) |
| 10.8 | `modules/content/{collections.service,collections.schemas}.ts`, test `collections.test.ts` | `modules/content/content.routes.ts` (phần public + `adminCollectionsRouter`), `modules/content/home-content.service.ts` (`reset`, `warnings`), `recommend.ts` (bước bộ sưu tập, nếu làm REC-05) |

File CHUNG nhiều lát cùng đụng (rủi ro xung đột) và cách giảm:
1. `modules/catalog/catalog.{service,mapper,types,routes,controller}.ts`: 10.3 (size chart + `max-age`), 10.5 (`rating`, danh sách đánh giá), 10.7 (giá hiệu lực, `sale`), 10.6 / 10.8 (đọc `toProductDto`). RỦI RO CAO NHẤT. Giảm: làm 10.5 trước 10.7; logic đánh giá nằm hết ở `modules/reviews/`, ở `catalog.routes.ts` chỉ đổi MỘT route (`GET /products/:productId/reviews` gọi `reviews/review.service`; không mount ở `reviewsRouter` vì `/products/**` thuộc `catalogRouter`, vùng công khai). `toProductDto` đổi chữ ký một lần ở 10.5 (`ctx: { now, ratings }`), 10.7 chỉ thêm tính giá bên trong.
2. `modules/checkout/lines.service.ts`: chỉ 10.7 (giá) — nhưng `refreshLine` chữ ký đổi kéo theo `cart.service`, `quote.service`, `place-order.service` (đều 10.7).
3. `modules/order/order.routes.ts` / `order.service.ts` / `lookup.service.ts`: 10.2; thay đổi song song của agent khác (SePay `payment.service.ts`, `order-email.service.ts`, `env.ts`) — kiểm `git status` trước khi sửa.
4. `backend/src/middleware/rate-limit.ts`, `config/assumptions.ts`, `lib/errors.ts`: 10.1 đã thêm mọi thứ cần; 10.2 chỉ thêm bộ đếm guest (khối riêng).
5. `backend/src/app.ts`: KHÔNG lát nào sửa (khung đã gắn). Ngoại lệ: nếu 10.2 chọn router riêng cho `/orders/:orderCode/return*` thì mount trước `orderRouter` (một dòng).
6. `docs/api/openapi.yaml`, `docs/handoff.md`, `docs/decisions.md`: mỗi lát thêm đoạn riêng; sửa contract locked đi qua đề xuất ở handoff.
7. `backend/prisma/schema.prisma`: sau 10.1 không lát nào sửa (một migration cho cả đợt). Cần cột mới = đề xuất handoff.

## 7. Danh sách test (tên T-P1-xx ↔ AC; `backend/test/*.test.ts`, vitest + supertest, DB `n2f_test`)

| Nhóm / file | Mã test | AC |
| --- | --- | --- |
| `p1-migration.test.ts` (10.1) | T-P1-01 DB sạch có đủ bảng / CHECK / RLS; trùng đánh giá (user, product) và trùng wishlist bị DB từ chối; CHECK đợt giảm (thiếu một trong ba, `sale_price >= price`, `< 1000`, 91 ngày); `migrate` lần 2 rỗng, số dòng `products/orders/order_items/users/vouchers/order_returns` không đổi | AC-P1-01 |
| `p1-foundation.test.ts` (10.1/10.2) | T-P1-02 quyền: staff 403 `content.edit` / `promotions.write`, 200 `reviews.moderate`; hạ admin → 403 ngay; T-P1-03 giới hạn: đánh giá thứ 6 và ghi wishlist thứ 61 → 429 + `Retry-After`; mã lỗi ổn định, không stack trace | AC-P1-03, 04 |
| `returns-guest.test.ts` (10.2) | T-RET-60 (grant hết hạn / thiếu 401, grant R7 dùng cho đơn thành viên 404); T-RET-61 (hạn 30 ngày 23:59:59, `lines`, `reason`, 2 yêu cầu song song, `conditionAck`, số tiền 370.000); T-RET-62 (ảnh: 31 ảnh → 429, ảnh của grant khác 422, xem ảnh: không grant 401/404, grant đúng 200, staff 200, EXIF/GPS gỡ); T-RET-63 (6 yêu cầu → 429, thư không chứa mã tra cứu / OTP / số tài khoản, sự kiện người = khách); T-RET-64 (số tài khoản che; không có trong email / sự kiện / log; xoá ở trạng thái cuối); T-RET-65 (Should: `returnPending`, `source`) | AC-RET-60..65 |
| `content-home.test.ts` (10.3) | T-MOM-01..03 (4 thẻ, `count` đúng, thẻ 0 bị ẩn, `lines`, `href`), T-CMS-01 (bản mặc định, `public, max-age=60`, chỉ `enabled`, seed lần 2 không đè), T-CMS-02 (12/13 khối, 80/81, 200/201, 6/7 thẻ, `href` 4 loại, `mediaId` lạ, trùng `id`, `updatedAt` cũ → 409 kèm `current`, 2 admin đồng thời), T-CMS-03 (ảnh bị xoá vẫn trả), T-CMS-04 (bảng size 12/13 hàng, 8/9 cột, nhãn, ô, `updatedAt`, staff 403, `max-age=60`) | AC-MOM-01..03, AC-CMS-01..05 |
| `wishlist.test.ts` (10.4) | T-WISH-01 (401 `no-store`, N không thấy mục của M), T-WISH-02 (thêm lại, id lạ / `DRAFT` 404, xoá 204), T-WISH-03 (101 → 409, sản phẩm ẩn không tính, 20 đồng thời khi 99), T-WISH-05 (gộp: `{P3,P1,P2}` `skipped = 2`, lần hai, 101 id 422, 99 + 3) | AC-WISH-01..05 |
| `reviews-*.test.ts` (10.5) | T-REV-01 (eligibility 5 trường hợp, đồng hồ giả), T-REV-02 (biên 1/5, 2/80, 20/1000, `height` 21, `fit` 2, toàn khoảng trắng, nhiều lỗi một lần, `sizeBought` giả bị bỏ), T-REV-03 (lần hai 409, 10 song song = 1 × 201, SQL 1 hàng), T-REV-04 (công khai không cookie, `max-age=10`, `limit` 3/21, `DRAFT` 404, `author`), T-REV-05 (13/3 → 4,3; ẩn / hiện; 16/4 → 4,0; PLP = PDP), T-REV-06 (view / rating / counts, `limit` 51, lý do 4/5/250/251, trả lời 4/5/500/501, đồng thời 1 × 200, ghi người) | AC-REV-01..06 |
| `recommendations.test.ts` (10.6) | T-REC-01 (limit 4/2/8/9/0), T-REC-02 (20 lần cùng thứ tự, đổi `sales_rank`, hoà theo `slug`), T-REC-03 (hết hàng ≤ 30 s, `ARCHIVED` không bao giờ), T-REC-04 (giỏ [P1,P3] = [P2,P4,P5]; rỗng = bán chạy; 11 id 422; id lạ bỏ), T-REC-05 (ít hơn `limit`, `max-age=30`), T-REC-07 (Should) | AC-REC-01..05, 07 |
| `promo-*.test.ts` (10.7) | T-PROMO-01 (`salePrice` 500.000/499.000/999, ngày D-1/D/D+89/D+90, thiếu ngày, staff 403, ghi đè, gỡ), T-PROMO-02 (đồng hồ giả D-1 23:59:59 / D 00:00:00 / D+2 23:59:59 / D+3 00:00:00; `maxPrice`; `price-asc`), T-PROMO-03 (đặt đơn lưu `unit_price`, hết đợt giữa chừng → `price-changed`, đơn cũ không đổi), T-PROMO-04 (`excludeSaleItems`), T-PROMO-05 (đổi `price` → 422 `salePrice`, 409 đồng thời, `DRAFT` có đợt không hiển thị), T-PROMO-07 (Should: preview / apply / `sale=true`), **T-PROMO-10 một hàm: cùng một số ở `GET /products`, `/products/{slug}`, `/recommendations`, giỏ, quote, đơn**, T-PROMO-08 (chạy lại `quote-voucher.test.ts`, `pricing.test.ts`, AC-VOU / AC-INV-40..46) | AC-PROMO-01..08 |
| `collections.test.ts` (10.8) | T-CMS-06 (reset, cảnh báo), T-CMS-07 (slug hợp lệ / trùng 409 / khoá slug / 200-201 sản phẩm / xoá không xoá sản phẩm / `draft` 404) | AC-CMS-06, 07 |

Test cũ phải sửa theo hành vi mới: `catalog.test.ts` (dòng 295-299 `reviews` luôn `[]` + `eligibility` 404 vẫn đúng ở `/products/x/reviews/eligibility`; dòng 355 `max-age=3600` → 60), `returns-*.test.ts` (mọi chỗ khẳng định vãng lai `canReturn = false`), test dựng `Product` có `toEqual` đầy đủ (thêm `rating`, `discountPercent`).

## 8. Điểm lệch / câu hỏi cho Orchestrator và PO

1. **15 khối mặc định > 12 khối tối đa (BR-CMS-02).** Fixture trang chủ hiện có 15 khối; PRD giới hạn ≤ 12 (AC-CMS-02 kiểm 12 / 13). Seed vẫn đủ 15 (seed không qua kiểm), nhưng admin PUT lại nguyên bản mặc định sẽ bị `422 blocks`. Contract giữ 12 theo PRD. Đề xuất PO: nâng `maxBlocks` lên 16 (`P1_ASSUMPTIONS.content.maxBlocks`, đổi AC-CMS-02 thành 16 / 17), hoặc FE bỏ bớt 3 khối khỏi fixture trước khi seed. Mặc định hiện tại: giữ 12.
2. **`unanswered` (BR-REV-07):** contract định nghĩa = đang `visible` và chưa trả lời; `low` (≤ 2 sao) tính cả đánh giá ẩn; hai tab này chồng với `hidden`. AC-REV-06 ("6 chưa trả lời, 4 ≤ 2 sao, 3 ẩn") phụ thuộc cách QA dựng dữ liệu: PO xác nhận.
3. **Xem ảnh vãng lai (BR-RET-62):** PRD "ảnh chỉ xem được bằng grant đó"; contract cho mọi grant còn hạn của CHÍNH đơn đó xem (khách tra cứu lại bằng OTP mới vẫn thấy ảnh mình gửi, trạng thái yêu cầu có ảnh), còn GẮN ảnh thì phải đúng grant đã tải. Nếu PO muốn chặt theo nghĩa đen thì ảnh của yêu cầu đã gửi sẽ không xem lại được sau khi grant hết hạn (30 phút): không khuyến nghị.
4. **Eligibility ở `/reviews/eligibility`, gửi ở `POST /reviews`** (không ở `/products/**`): vì `/products/**` là vùng công khai không phụ thuộc người dùng (AC-CAT-44..46) và `catalog.test.ts` khẳng định `/products/x/reviews/eligibility` → 404. FE adapter ánh xạ `reviewEligibility(productId)` → `GET /reviews/eligibility?productId=`, `submitReview(productId, input)` → `POST /reviews` với `productId` trong thân.
5. **Dạng danh sách đánh giá:** `GET /products/{productId}/reviews` đổi từ mảng sang `{items, total, page, limit, summary}` (cần `total` cho AC-REV-04 và `summary` để điểm / thang độ vừa đúng khi có phân trang); FE `HttpCatalogApi.reviews()` map `.items`, `ProductReviewPage.summary` thay phép tính trung bình trên danh sách đã tải.
6. **Giá khuyến mãi ở `PUT /admin/products/{id}`** (không endpoint riêng): FE form sản phẩm gửi thêm 3 trường; khoá vắng = giữ đợt (nên FE ở `promotionsMode = mock` không xoá đợt khi lưu sản phẩm). Quyền `promotions.write` thêm khi thân có khoá `sale*` (cả hai quyền chỉ admin nên không đổi kết quả với staff).
7. **Duplicate slug bộ sưu tập:** PRD ghi "422 `duplicate`", contract dùng `409 duplicate` như Slice 6 / 7 (`duplicate` đã là 409 ở `ErrorCode`). QA ghi theo contract.
8. **Wishlist `DELETE` id lạ / sai dạng → 204** (không lộ thông tin); AC chỉ yêu cầu "xoá mục không có → 204".
9. **Migration chưa áp DB nào, chưa kiểm bằng Postgres thật** (máy này không có Postgres; SQL dựng từ `prisma migrate diff` + CHECK tay): lát đầu tiên áp lên `n2f_dev` / `n2f_test` phải chạy `prisma migrate dev` / `migrate deploy` rồi `migrate diff` (phải rỗng) và test T-P1-01 trước khi báo xong.
10. Máy có agent khác đang sửa `schema.prisma`, `openapi.yaml` (SePay, migration `20261113000900_sepay_payment_transactions`); migration P1 mang mốc `20261113000100` (trước) nên khi áp lần đầu Prisma sẽ áp P1 rồi SePay; hai migration độc lập nhau (không bảng chung), thứ tự không ảnh hưởng.
