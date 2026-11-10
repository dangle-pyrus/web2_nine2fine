# Kế hoạch triển khai Admin kho & sản phẩm (Slice 6) - draft 2026-11-10

Hợp đồng: `docs/api/openapi.yaml` (phần Slice 6 `status: draft`, 20 operation, tag `admin-products`, `admin-inventory`, `admin-promotions`, `admin-media`, `media`; chuyển `locked` sau khi Orchestrator duyệt mục 15, trước khi FE nối). BR/AC: `docs/product/PRD.md` mục "Slice 6" (BR-INV-01..44, AC-INV-01..48, S6-Q1..Q9). Lát giao: `docs/product/backlog.md` mục "Slice 6" (6.1-6.9). Khi mâu thuẫn, PRD thắng. Chỉ là tài liệu: agent triển khai làm theo mục 14 không cần hỏi lại; các điểm lệch cần duyệt ở mục 15. Cùng khuôn với `docs/api/admin-orders-implementation-plan.md` (đọc mục 6, 9: `runAction`, khoá, `adminRateLimit`, `noStore`).

## 0. Câu hỏi S6-Q1..Q9 và điểm lật

S6-Q2..Q9 làm theo mặc định PO. Mọi tham số gom vào khối `CATALOG_ASSUMPTIONS` trong `backend/src/config/assumptions.ts` (cạnh `ADMIN_ASSUMPTIONS`) để đổi một câu trả lời = sửa đúng một chỗ + BR/contract theo quy trình.

| Q | Mặc định | Lật ở đâu | Hệ quả khi lật |
| --- | --- | --- | --- |
| S6-Q1 (**chờ Thắng**, chỉ chặn 6.8) | Lớp lưu trữ đổi được: `MEDIA_STORAGE=local` (dev/test), `supabase` (bản thật, bucket công khai `product-images`) | env `MEDIA_STORAGE`; thêm driver mới = thêm 1 file implement `ImageStorage` (mục 9) | Thắng chọn nơi khác (S3, Cloudinary...): viết driver, API không đổi. Ảnh đã tải ở driver cũ phải sao chép tay (id/tên giữ nguyên) |
| S6-Q2 | staff: mọi GET + điều chỉnh tồn; admin: còn lại | bảng `CATALOG_PERMISSIONS` (mục 10) | Đổi 1 dòng + `permissions.ts` FE |
| S6-Q3 | khoá slug sau lần công khai đầu | `CATALOG_ASSUMPTIONS.lockSlugAfterPublish: true` | `false`: bỏ kiểm khoá, `slugLocked` luôn false. Không làm chuyển hướng slug cũ |
| S6-Q4 | mã voucher không đổi; đã có lượt dùng thì khoá loại/giá trị/giảm tối đa; không xoá | `voucherLockWhenRedeemed: true` | Chỉ đổi điều kiện ở `promotion.rules.ts` |
| S6-Q5 | ảnh JPEG/PNG/WebP, 5 MB, cạnh ngắn >= 600, dài <= 6.000, <= 12 ảnh | `image: { maxBytes, minShort, maxLong, maxPerProduct, mimes }` | Tham số |
| S6-Q6 | \|delta\| <= 10.000; số đếm 0..100.000 là Trong kho; 5 lý do | `stock: { maxDelta, maxQty, reasons }` | Tham số; thêm lý do = thêm dòng ở `REASON_RULES` + enum contract |
| S6-Q7 | trường không có cột = Won't (ẩn ở HTTP) | - | Thêm cột/bảng ở slice sau |
| S6-Q8 | ngưỡng mặc định 5, sửa ngưỡng Should (lát 6.7) | `defaultLowStockThreshold: 5` (giá trị khởi tạo; giá trị chạy lưu DB, mục 2) | - |
| S6-Q9 | giá 1.000..100.000.000 | `price: { min, max }` | Tham số (và CHECK `NOT VALID` mục 2 phải đổi bằng migration mới) |

## 1. Phạm vi BE Slice 6

20 operation (19 admin + 1 công khai):

| Tag | Endpoint | Quyền |
| --- | --- | --- |
| admin-products | `GET /admin/categories` | staff, admin |
| admin-products | `GET /admin/products`, `GET /admin/products/{productId}` | staff, admin |
| admin-products | `POST /admin/products`, `PUT /admin/products/{productId}`, `DELETE /admin/products/{productId}`, `POST /admin/products/bulk-status` | admin |
| admin-media | `POST /admin/uploads/product-images` (thân là byte thô) | admin |
| media | `GET /media/{mediaId}` (công khai, không phiên) | - |
| admin-inventory | `GET /admin/inventory`, `GET /admin/inventory/facets`, `GET /admin/inventory/{variantId}/movements` | staff, admin |
| admin-inventory | `POST /admin/inventory/{variantId}/adjustments` | staff, admin |
| admin-inventory | `PUT /admin/inventory/thresholds` (Should) | admin |
| admin-promotions | `GET /admin/promotions`, `GET /admin/promotions/{promotionId}` | staff, admin |
| admin-promotions | `POST /admin/promotions`, `PUT`, `PATCH` (bật/tắt), `DELETE /admin/promotions/{promotionId}` | admin |

Mã lỗi mới (7, đều đã thêm vào `ErrorCode`): `publish-incomplete` 422, `invalid-image` 422, `duplicate` 409, `version-conflict` 409, `product-in-use` 409, `variant-in-use` 409, `voucher-in-use` 409. Dùng lại: `unauthenticated`, `forbidden`, `not-found`, `validation`, `stock-changed` (thêm `available`, `reserved`), `idempotency-conflict`, `rate-limited`, `unavailable`, `origin-not-allowed`. `ErrorResponse.error` thêm trường cộng thêm `missing`, `productId`, `reason`, `sku`, `available`, `reserved`.

Ngoài phạm vi: danh mục (tạo/sửa), bảng size, giá riêng biến thể, giá vốn, tags, SEO, bộ sưu tập, voucher theo hạng/khách/riêng tư/nhiều danh mục, xoá tệp ảnh, dọn ảnh mồ côi, khách hàng, báo cáo, nội dung, cài đặt, nhân viên, nhật ký toàn hệ thống, xuất/nhập file.

## 2. Schema Prisma và migration (chỉ cộng thêm, BR-INV-07)

Một migration `backend/prisma/migrations/<ts>_admin_catalog_schema/` (timestamp sau `20261109000100`). Không `DROP`, `RENAME`, `TRUNCATE`, `DELETE`, đổi kiểu cột. Cho phép: `CREATE TABLE`, `ADD COLUMN` (NULL hoặc DEFAULT hằng), `CREATE INDEX IF NOT EXISTS`, `ADD CONSTRAINT ... CHECK` (xem dưới), `ENABLE ROW LEVEL SECURITY`, và đúng **một** `UPDATE` điền `published_at` (không xoá dữ liệu, chạy lại không đổi gì). Idempotency tái dùng `idempotency_keys` với scope `admin-action` có sẵn (khoá khác nhau giữa các thao tác nên không cần nới CHECK scope lần nữa; `request_hash` gồm `{userId, method, path, body}` nên cùng khoá khác đường dẫn -> `idempotency-conflict`).

### Bảng mới

**`inventory_adjustments`** (nhật ký kho; BR-INV-34; chỉ INSERT)

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| adjustment_id | uuid PK default `gen_random_uuid()` | |
| variant_id | uuid NOT NULL FK `product_variants` **ON DELETE CASCADE** | xoá cứng sản phẩm chưa từng bán thì nhật ký đi theo (BR-INV-18) |
| at | timestamp(6) NOT NULL default `now()` | |
| delta | integer NOT NULL | thay đổi Có thể bán, có dấu |
| available_after | integer NOT NULL | Có thể bán sau thay đổi |
| reason | varchar(12) NOT NULL | `received`, `return`, `damaged`, `count`, `correction` |
| note | varchar(200) NOT NULL default `''` | |
| actor_user_id | uuid NULL FK `users` ON DELETE SET NULL | |
| actor_name | varchar(100) NOT NULL | **chụp** tên lúc làm (`first_name last_name`), đổi tên sau không đổi vết |
| actor_role | `user_role` NOT NULL | chụp vai trò |

CHECK: `reason IN ('received','return','damaged','count','correction')`; `delta <> 0`; `available_after >= 0`; `(reason = 'received' AND delta > 0) OR (reason = 'return' AND delta > 0) OR (reason = 'damaged' AND delta < 0) OR reason IN ('count','correction')` (khớp BR-INV-32; dòng tồn ban đầu dùng `received` với `delta > 0` nên qua). Index: `idx_inv_adj_variant_at (variant_id, at DESC, adjustment_id DESC)` (lịch sử 50 dòng). RLS bật, không policy.

**`media_assets`** (ảnh tải lên; BR-INV-24, 26, 27)

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| media_id | varchar(100) PK | `up-<32 hex>.<jpg\|png\|webp>` (<= 40 ký tự, vừa `order_items.media_id`) |
| storage | varchar(10) NOT NULL | `local` / `supabase` (driver đã ghi) |
| content_type | varchar(20) NOT NULL | CHECK `IN ('image/jpeg','image/png','image/webp')` |
| byte_size | integer NOT NULL | CHECK `BETWEEN 1 AND 5242880` |
| width, height | integer NOT NULL | CHECK `>= 600` cho cạnh ngắn không làm ở DB (tham số đổi được), chỉ `> 0` |
| created_by | uuid NULL FK users ON DELETE SET NULL | |
| created_at | timestamp(6) NOT NULL default `now()` | |

Không FK từ `products` (sản phẩm tham chiếu ảnh bằng chuỗi id như cũ, id thư viện không nằm trong bảng này). RLS bật.

### Cột cộng thêm

| Bảng | Cột | Ghi chú |
| --- | --- | --- |
| products | `published_at timestamp(6) NULL` | lần đầu vào `ACTIVE` (K8). Backfill: `UPDATE products SET published_at = now() WHERE status = 'ACTIVE' AND published_at IS NULL` (câu duy nhất có thể chạy lại) |
| products | `updated_by uuid NULL` FK users ON DELETE SET NULL | BR-INV-23 (Should) |
| products | `image_meta jsonb NOT NULL DEFAULT '{}'` | `{ "<mediaId>": { "alt": "...", "color": "Đen" } }`: alt và màu từng ảnh (mục 6.5); storefront không đọc |
| product_variants | `low_stock_threshold smallint NULL` | ngưỡng riêng (BR-INV-36); NULL = theo mặc định. CHECK `low_stock_threshold IS NULL OR low_stock_threshold BETWEEN 0 AND 1000` |
| vouchers | `admin_updated_at timestamp(6) NULL`, `updated_by uuid NULL` FK users SET NULL | **xem lưu ý dưới** |
| store_settings | `low_stock_default smallint NOT NULL DEFAULT 5` | ngưỡng mặc định toàn shop (BR-INV-35/36); CHECK `BETWEEN 0 AND 1000`. Bảng một dòng `id = 1` đã có ở Slice 3, `ADD COLUMN ... DEFAULT 5` hằng nên không ghi lại bảng |

**Lưu ý voucher (phát hiện khi đọc code):** `place-order.service.ts:227` và `cancel-order.service.ts:79` đặt `vouchers.updated_at` mỗi khi tăng/giảm `used_count`. Dùng `updated_at` làm phiên bản (BR-INV-05) thì một khách đặt hàng giữa lúc admin mở form sẽ gây `version-conflict` giả. Vì vậy `AdminPromotion.updatedAt` = `COALESCE(admin_updated_at, created_at)`, chỉ đổi bằng thao tác admin (tạo, sửa, bật/tắt). Không sửa code checkout. Sản phẩm dùng thẳng `products.updated_at` (không đường ghi nào khác đụng cột này; seed là ngoại lệ, xem mục 15 #8).

### CHECK thêm cho sản phẩm (`NOT VALID`)

Dữ liệu seed cũ không bị kiểm lại, nhưng mọi ghi mới phải thoả: `chk_products_price_range` (`price BETWEEN 1000 AND 100000000`), `chk_products_compare_price` (`compare_at_price IS NULL OR (compare_at_price > price AND compare_at_price <= 100000000)`), `chk_products_gallery_max` (`cardinality(gallery_media_ids) <= 12`). `NOT VALID` để migration không thất bại nếu seed vi phạm; test migration kiểm `convalidated = false` có chủ đích. Biến thể: `chk_variants_inventory (>= 0)` đã có; thêm `chk_variants_inventory_max (inventory_qty <= 1000000) NOT VALID` làm lưới cuối (giới hạn nghiệp vụ 100.000 kiểm ở dịch vụ, vì hàng huỷ hoàn kho có thể làm vượt nhẹ).

### Index thêm
`CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items (variant_id)` (tính "Đang giữ" và kiểm "có đơn"; hiện chỉ có unique `(order_id, variant_id)`). `idx_products_updated (updated_at DESC, product_id DESC)`. **Mọi `CREATE INDEX` dùng `IF NOT EXISTS`** (bài học Slice 5: Supabase có sẵn index tạo ngoài migration).

### Quy trình
`npx prisma migrate dev --create-only --name admin_catalog_schema` trên DB cục bộ `n2f_dev`; mở SQL, thêm tay CHECK, `ENABLE ROW LEVEL SECURITY` cho 2 bảng mới, câu `UPDATE` backfill; grep `DROP|TRUNCATE|DELETE|RENAME|ALTER COLUMN .* TYPE`: có thì dừng. Test: `migrate deploy` hai lần (lần 2 không có gì; AC-INV-09), `migrate diff --from-migrations --to-schema-datamodel` rỗng, mọi bảng `public` còn RLS (mở rộng T-ADM-90), mọi sản phẩm `ACTIVE` có `published_at`. **Áp lên Supabase chỉ khi Thắng duyệt** (decisions 2026-11-10): Orchestrator chạy `migrate deploy` (`DIRECT_URL`) sau khi test xanh. Không `migrate dev`/`reset`/`db push` trên Supabase.

## 3. Module backend

```
backend/src/lib/errors.ts                 + 7 ErrorCode; AppErrorExtras { missing?, productId?, reason?, sku?, available?, reserved? }; Errors.publishIncomplete(missing, productId?), .invalidImage(reason), .duplicate(field), .versionConflict(), .productInUse(), .variantInUse(sku), .voucherInUse(msg); Errors.stockChangedAdmin(available, reserved)
backend/src/middleware/error.ts           đưa các trường mới vào error.{...}; map lỗi body-parser 'entity.too.large' trên route upload -> invalid-image size
backend/src/middleware/rate-limit.ts      + adminUploadLimit (30 / 10 phút / tài khoản, theo byAdminUser, đặt trước handler upload)
backend/src/middleware/require-permission.ts   requirePermission('products.write' | ...) đọc CATALOG_PERMISSIONS[role]; 403 forbidden trước khi đọc body/DB
backend/src/config/assumptions.ts         + CATALOG_ASSUMPTIONS (mục 0), CATALOG_PERMISSIONS (mục 10)
backend/src/config/env.ts                 + MEDIA_STORAGE, MEDIA_LOCAL_DIR, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET (mục 9)
backend/src/lib/image-info.ts             sniffImage(buf) -> { type, width, height } | null (JPEG/PNG/WebP, không thư viện; mục 9)
backend/src/lib/storage/{types,local,supabase,index}.ts   ImageStorage + 2 driver + factory theo env
backend/src/lib/slug.ts                   slugify(name) (bỏ dấu qua foldVi, đ->d, ký tự khác -> '-'), nextFreeSlug(tx, base)
backend/src/lib/search-text.ts            buildSearchText(name, typeLabel) = foldVi(`${name} ${typeLabel}`)  (ĐÚNG công thức seed-catalog.ts:109)
backend/src/modules/catalog-admin/
  catalog-admin.routes.ts      3 router con (products, inventory, promotions) + upload; schemas Zod gắn ở đây
  catalog-admin.schemas.ts     zod: query list x3, body product, bulk-status, adjustment, thresholds, promotion
  product.query.ts             list + counts + detail (SQL tham số hoá, mục 11)
  product.write.ts             createProduct, updateProduct, setStatusBulk, deleteProduct: ĐƯỜNG GHI DUY NHẤT vào products/product_variants (mục 5, 6)
  product.rules.ts             publishMissing(product, variants, images), validateVariants, validateImages
  product.mapper.ts            toAdminProduct, toAdminSummary, imageRef(id)
  inventory.query.ts           list, facets, movements (UNION điều chỉnh + biến động do đơn)
  inventory.service.ts         adjustStock(), setThresholds()
  promotion.query.ts           list + counts + detail; computeState()
  promotion.service.ts         create, update, setEnabled, remove; promotion.rules.ts (BR-INV-39, 40)
  media.service.ts             uploadProductImage(), resolveMedia(id) cho GET /media/:id
backend/src/modules/media/media.routes.ts   GET /media/:mediaId (công khai)
backend/src/app.ts
  api.use('/media', mediaRouter)                                   TRƯỚC originGuard (GET công khai, như catalogRouter)
  api.use('/admin/categories' | '/admin/products' | '/admin/inventory' | '/admin/promotions' | '/admin/uploads',
          noStore, requireAuth('admin'), requireRole('staff','admin'), adminRateLimit, router)   SAU originGuard, cạnh '/admin/orders'
  express.json({limit:'16kb'}) toàn cục bỏ qua '/admin/products' (POST/PUT); router đó dùng express.json({limit:'64kb'}) (mục 15 #6)
backend/test/helpers.ts       + makeProduct({ status, variants, publishedAt, hasOrders }), makeVoucher({...}), makePng(w,h) / makeJpeg / makeWebp (buffer tối thiểu hợp lệ)
```

`requireAuth('admin')` hiện có đọc `role`/`is_active` mỗi yêu cầu (BR-INV-01, AC-INV-04) và xoá cookie khi hỏng. Quyền theo hành động kiểm bằng `requirePermission` ở route, **trước** Zod và trước khi đọc DB (staff gửi body sai vẫn nhận 403, không rò thông tin). `adminRateLimit` đặt sau `requireAuth` (401 không đốt bộ đếm); tải ảnh đếm thêm ở `adminUploadLimit`.

## 4. Quy ước chung

- **Chuẩn hoá chuỗi** (BR-INV-11): `normalize('NFC')`, trim, gộp khoảng trắng liên tiếp thành 1 (riêng `description` và `care[]` giữ xuống dòng nhưng gộp khoảng trắng ngang; `care` mỗi dòng chuẩn hoá riêng, dòng rỗng sau chuẩn hoá bị loại rồi mới đếm <= 10). Helper `cleanText()` dùng chung product, voucher, ghi chú kho.
- **Tiền:** Prisma `Decimal(12,2)` ở `products.price`; API trả/nhận số nguyên; map `Number(price)`; ghi `price` nguyên (không phần lẻ).
- **Phiên bản (BR-INV-05):** trong giao dịch, sau `SELECT ... FOR UPDATE` đọc `date_trunc('milliseconds', updated_at)` (sản phẩm) hoặc `COALESCE(admin_updated_at, created_at)` cắt ms (voucher) và so với `updatedAt` gửi lên cắt ms; JS `Date` chỉ có ms nên mọi giá trị ghi bằng `new Date()` (không `now()` của DB) để ghi-đọc-so khớp nhau. Khác -> `Errors.versionConflict()` trước mọi kiểm khác.
- **Mã lỗi `field`:** đường dẫn có chỉ số `variants[2].sku`, `images`, `items[0].threshold`. Zod `issue.path` -> chuỗi bằng một hàm; lỗi nghiệp vụ tự đặt `field`.
- **Thứ tự kiểm một yêu cầu ghi:** `noStore` -> `requireAuth` 401 -> `originGuard` 403 -> rate limit 429 -> `requirePermission` 403 -> Zod 422 -> (giao dịch) khoá + đọc 404 -> phiên bản 409 -> quy tắc nghiệp vụ 422/409 -> ghi.
- **Log:** không ghi `note`, tên sản phẩm lẫn mô tả dài, token, byte ảnh; chỉ id, hành động, `userId`.

## 5. `search_text` (BR-INV-22, đóng backlog 2.19)

- **Một đường ghi duy nhất:** mọi `INSERT`/`UPDATE` cột `name`, `type_label`, `search_text` của `products` nằm trong `product.write.ts`, qua `buildSearchText(name, typeLabel)` trong **cùng** giao dịch với việc ghi tên/loại (tạo và sửa; chỉ gán lại khi `name` hoặc `type` đổi, nhưng tính lại vô điều kiện cũng chấp nhận được vì rẻ). Lỗi giữa chừng (bất kỳ bước nào sau, ví dụ ghi biến thể) -> exception -> rollback nên không có nửa vời.
- **Chống lệch lâu dài (hai lưới, không trigger):**
  1. T-INV-32: với DB test có mọi sản phẩm seed + sản phẩm tạo/sửa bằng API, khẳng định `search_text === foldVi(name + ' ' + type_label)` cho **mọi dòng**.
  2. T-INV-33 (tĩnh): quét `backend/src` (trừ `seed*.ts`, `product.write.ts`) tìm `product.update(`, `product.updateMany(`, `INSERT INTO "products"`, `UPDATE "products"` -> phải rỗng; ai thêm đường ghi mới phải đi qua `product.write.ts`.
  Không dùng trigger Postgres vì `foldVi` (NFD, bỏ dấu, `đ -> d`) không có sẵn trong Postgres nếu không bật extension `unaccent` (decisions 2026-11-07: không dùng extension).
- Seed (`prisma/seed-catalog.ts`) vẫn tự tính; xem rủi ro seed đè dữ liệu admin ở mục 15 #8.

## 6. Ghi sản phẩm (`product.write.ts`)

### 6.1 Thứ tự khoá toàn hệ thống (mở rộng Slice 3 mục 4.4 và Slice 4 mục 6.3)
`orders` -> `vouchers` (tăng dần id) -> `products` -> `product_variants` (tăng dần `variant_id`) -> `order_events`/`inventory_adjustments`/`idempotency_keys` (chỉ INSERT). Mọi hành động Slice 6 khoá theo thứ tự này nên không có chu trình với `placeOrder` (khoá `product_variants` bằng `UPDATE`, không khoá `products`) và `cancelOrderTx`. Một thao tác Slice 6 chạm tối đa 1 voucher hoặc 1 sản phẩm (bulk-status khoá 1..50 sản phẩm theo `product_id` tăng dần).

### 6.2 `updateProduct` (PUT) - một giao dịch
```
prisma.$transaction(async (tx) => {
  1. SELECT ... FROM products WHERE product_id = $id FOR UPDATE            -- không thấy -> 404
  2. so updatedAt (mục 4) -> version-conflict
  3. SELECT ... FROM product_variants WHERE product_id = $id ORDER BY variant_id FOR UPDATE
     + hasOrders = EXISTS (SELECT 1 FROM order_items WHERE variant_id = v.variant_id) cho từng biến thể
  4. Kiểm payload với trạng thái hiện tại (product.rules.ts), theo thứ tự field của form:
     - cleanText + khoảng giá; category tồn tại (slug -> id)
     - slug: nếu gửi và khác hiện tại: định dạng; nếu published_at != NULL (và lockSlugAfterPublish) -> 422 slug; trùng người khác -> 409 duplicate slug
     - variants (mục 6.3), images (mục 6.5)
     - status: nếu đích ACTIVE -> publishMissing() (mục 6.4) trên dữ liệu SAU khi áp payload
  5. Ghi: UPDATE products SET ... (name, type_label, search_text, price, compare_at_price, description, material, care, fit_summary,
        genders, moments, category_id, slug, status, cover_media_id, gallery_media_ids, color_media,
        published_at = COALESCE(published_at, CASE WHEN đích = ACTIVE THEN $now END), updated_at = $now, updated_by = $uid)
        -- KHÔNG đụng badge, fit_model, looks, sales_rank, display_order (BR-INV-12)
  6. Biến thể (mục 6.3): tạo mới, sửa, xoá; INSERT inventory_adjustments cho biến thể mới có tồn > 0
  7. Đọc lại AdminProduct (cùng tx) làm kết quả
}, { timeout: 10_000, maxWait: 5_000 })
```
Tái thử `P2034`/`40P01` tối đa 3 lần. Bắt `P2002` (unique): trên `slug` -> `duplicate slug` (đua hai admin cùng tạo slug); trên `sku` -> `duplicate variants[i].sku` (tìm `i` bằng so sánh); trên `(product,color,size)` không xảy ra vì đã kiểm payload.

### 6.3 Biến thể (BR-INV-19..21)
Payload là **trạng thái cuối mong muốn**. Kiểm thuần (không DB): <= 32 biến thể; size ∈ {S,M,L,XL}; màu: tên 1-50 (cleanText), hex `^#[0-9A-Fa-f]{6}$` (lưu chữ hoa), **<= 8 màu**, tên màu không trùng không phân biệt hoa thường/dấu (so `foldVi`) giữa các màu khác nhau; mọi biến thể cùng một màu phải gửi cùng hex (khác -> 422 `variants[i].color.hex`); (màu, size) không trùng; SKU `^[A-Z0-9-]{3,64}$` sau `toUpperCase`, không trùng nhau trong payload (422 `variants[i].sku`); `id` (nếu có) phải thuộc sản phẩm (không -> 422 `variants[i].id`); `inventory` 0..100.000 (chỉ biến thể mới). Có DB, sau khoá:
- **Sửa** (có `id`): SKU đổi mà `hasOrders` -> 422 `variants[i].sku` ("SKU đã có đơn, không đổi được"); SKU đổi sang SKU của biến thể khác ngoài sản phẩm (kiểm `SELECT ... WHERE sku = ANY($skus) AND product_id <> $id`) -> 409 `duplicate`. Đổi `size`: cho phép khi chưa có đơn, ngược lại 422 `variants[i].size`. Tên/hex màu đổi: áp cho mọi biến thể màu đó (ngay cả có đơn - dòng đơn giữ chuỗi đã chụp ở `order_items`); khoá `color_media` (mục 6.5 dựng lại theo tên mới). Hai bước khi có hoán đổi tên màu (đặt tạm `__tmp_<uuid>` rồi tên cuối) để không vướng unique `(product,color,size)` giữa chừng.
- **Tạo** (không `id`): `INSERT` + nếu `inventory > 0` thì 1 dòng `inventory_adjustments` (`reason = received`, `note = 'Tồn ban đầu'`, `delta = available_after = inventory`, người = admin).
- **Bỏ** (có trong DB, không có trong payload): nếu `hasOrders` -> `409 variant-in-use` kèm `sku` của biến thể đầu tiên (theo `sort_order`), toàn bộ giao dịch rollback; ngược lại `DELETE` (cascade `cart_lines`, `inventory_adjustments`). Race với `placeOrder`: ta đã giữ khoá dòng biến thể nên `placeOrder` chờ rồi thấy dòng mất -> `stock-changed` (available 0); FK `order_items -> variant` `RESTRICT` là đai cuối, bắt `23503` -> `variant-in-use`.
- `sort_order` = chỉ số trong payload.
- Tồn của biến thể đã có: **không bao giờ** đọc `inventory` từ payload (BR-INV-20, AC-INV-22).

### 6.4 Điều kiện công khai (BR-INV-14, 21)
`publishMissing(final)` trả mảng thiếu theo thứ tự `name`, `type`, `category`, `price`, `images`, `variants`: ≥ 1 ảnh, ≥ 1 biến thể, giá hợp lệ (đã kiểm), tên, loại, danh mục. Không yêu cầu tồn > 0. Mảng khác rỗng -> `422 publish-incomplete` + `missing`. Dùng chung cho PUT, POST (`status: active`), `bulk-status` (kèm `productId`). Lần đầu `ACTIVE`: `published_at = $now` (không bao giờ xoá về NULL; `ARCHIVED`/`DRAFT` giữ nguyên).

### 6.5 Ảnh (BR-INV-26..28)
`images[]` <= 12 (else 422 `images`); id trùng nhau trong payload -> 422 `images`. Mỗi id hợp lệ khi: (a) có trong `media_assets`; hoặc (b) là id thư viện đã được dùng ở nơi khác: `EXISTS (SELECT 1 FROM products WHERE cover_media_id = $id OR $id = ANY(gallery_media_ids))` hoặc đã nằm trong chính sản phẩm này (kiểm trước khi ghi đè). Một truy vấn gộp theo mảng id. Không thoả -> 422 `images` (ảnh bịa; AC-INV-26). `color` rỗng hoặc ∈ tên màu của payload (so đúng chuỗi sau cleanText, không phân biệt hoa thường rồi chuẩn về tên chuẩn) -> else 422 `images`. Dựng: `cover_media_id = images[0].id` (rỗng -> `''`; cột NOT NULL, `''` hợp lệ cho nháp chưa có ảnh; `ACTIVE` bắt buộc ≥ 1 ảnh nên không bao giờ công khai với `''`), `gallery_media_ids = images.map(id)`, `color_media = { [màu]: id ảnh đầu tiên gắn màu đó }`. `alt` và `color` của từng ảnh cần chỗ lưu: **cột `products.color_media` và `gallery_media_ids` không chứa `alt`**. Giải pháp không thêm bảng: lưu `alt` trong cột JSON mới `products.image_meta jsonb NOT NULL DEFAULT '{}'` = `{ "<mediaId>": { "alt": "...", "color": "Đen" } }` (thêm vào mục 2 cột cộng thêm của `products`; `color` ở đây là nguồn thứ tự "ảnh nào gắn màu nào" khi một ảnh gắn màu mà không phải ảnh đầu tiên của màu). Đọc: `images = gallery.map(id => ({ id, alt: meta[id]?.alt ?? '', color: meta[id]?.color ?? '' }))`; sản phẩm seed chưa có `image_meta`: suy `color` từ `color_media` ngược (id -> màu). Storefront không đọc `image_meta`.
Không xoá tệp ở bất kỳ đường nào (BR-INV-28): bỏ ảnh chỉ đổi mảng.

### 6.6 Tạo (POST)
Như PUT nhưng: không `updatedAt`; slug trống -> `nextFreeSlug` (`slugify(name)`, thêm `-2`, `-3` trong cùng giao dịch, bắt `P2002` thử lại tối đa 5 lần); `display_order`, `sales_rank` = `COALESCE(MAX(...),0) + 1` (không khoá bảng; hai sản phẩm tạo đồng thời có thể trùng thứ hạng vì cột không UNIQUE, storefront hoà theo slug - mục 15 #10); `badge` NULL, `fit_model` `''`, `looks` `[]`; trạng thái mặc định `DRAFT`. 201 + AdminProduct.

### 6.7 Đổi trạng thái hàng loạt (BR-INV-15)
`ids` gộp trùng; 1..50 (422 `ids`); `SELECT ... WHERE product_id = ANY($ids) ORDER BY product_id FOR UPDATE`: thiếu -> 404; nếu đích `ACTIVE`: với từng sản phẩm tính `publishMissing` (cần đếm ảnh = `cardinality(gallery_media_ids)`, biến thể = `count`), sản phẩm đầu tiên thiếu (theo thứ tự `ids` gửi) -> 422 `publish-incomplete` + `productId` + `missing`; không `UPDATE` nào đã chạy (kiểm hết trước khi ghi). Sau đó một `UPDATE ... SET status, published_at = COALESCE(...), updated_at, updated_by WHERE product_id = ANY AND status <> $đích`; trả `updated` = số dòng thực sự đổi.

### 6.8 Xoá (BR-INV-18)
Giao dịch: khoá sản phẩm + biến thể; nếu `published_at IS NOT NULL` hoặc `EXISTS order_items` của biến thể nào -> `409 product-in-use`; `DELETE FROM products` (cascade biến thể, `cart_lines`, `inventory_adjustments`). Race với `placeOrder` được chặn bởi khoá dòng biến thể; `23503` (order_items RESTRICT) -> `product-in-use`.

### 6.9 Hiệu lực với storefront (BR-INV-16, 17)
Không thêm cache BE cho sản phẩm (cache trong `catalog.cache.ts` chỉ là bảng danh mục, không đổi). `catalogRouter` đã lọc `status = 'ACTIVE'` ở mọi truy vấn (PLP, tìm kiếm, tổng, PDP 404) và trả `Cache-Control: public, max-age=10` nên độ trễ <= 10 giây + trình duyệt < 30 giây (AC-INV-16/18). `refreshLine`/`placeOrder` đã coi sản phẩm không `ACTIVE` là `discontinued` (không cần sửa). Giá: giỏ/báo giá đọc `products.price` mỗi lần (Slice 3) nên giá mới có hiệu lực ở lần làm tươi kế tiếp; `order_items.unit_price` đã chụp. Test T-INV-26/27 gọi API catalog và cart thật sau khi admin đổi để chứng minh, không mock.

## 7. Điều chỉnh tồn an toàn khi đua với đặt hàng (BR-INV-31..34)

Khoá và cập nhật **trên chính dòng `product_variants`** — cùng dòng mà `placeOrder` (`UPDATE ... SET inventory_qty = inventory_qty - n WHERE inventory_qty >= n`) và `cancelOrderTx`/`restockReturnedTx` (cộng lại) cập nhật, nên Postgres tuần tự hoá ba bên bằng khoá dòng.

```
prisma.$transaction(async (tx) => {
  0. (Idempotency-Key bắt buộc) SELECT FROM idempotency_keys WHERE scope='admin-action' AND key=$k FOR UPDATE:
       có + request_hash khớp + chưa hết hạn -> trả response_snapshot (200, Idempotency-Replayed: true) NGAY
       có + hash khác                       -> 409 idempotency-conflict
     (chưa có: sẽ INSERT ở bước 5; hai yêu cầu đua cùng khoá chưa có -> UNIQUE (scope,key) của một bên lỗi P2002 -> tx đó rollback và thử lại từ bước 0 để thấy bản của bên kia)
  1. validate cặp (mode, reason, dấu quantity, note) -> 422 reason/quantity/note (thuần, trước khi khoá)
  2. mode = 'delta':
       UPDATE product_variants SET inventory_qty = inventory_qty + $d, updated_at = $now
         WHERE variant_id = $id AND inventory_qty + $d BETWEEN 0 AND 100000
         RETURNING inventory_qty                                   -- phép cộng NGUYÊN TỬ có điều kiện (BR-INV-33)
       0 dòng: SELECT inventory_qty (nếu variant không có -> 404); nếu $d < 0 và inventory_qty + $d < 0 -> 422 quantity "Chỉ còn N có thể bán."
               nếu vượt 100.000 -> 422 quantity "Tối đa 100.000."
     mode = 'set':
       SELECT inventory_qty FROM product_variants WHERE variant_id = $id FOR UPDATE      -- 404 nếu không thấy
       reserved = COALESCE(SUM(oi.quantity),0) FROM order_items oi JOIN orders o USING(order_id)
                  WHERE oi.variant_id = $id AND o.status IN ('to_pay','to_ship','cancel_requested')
       expectedAvailable != inventory_qty -> 409 stock-changed { available: inventory_qty, reserved }   -- không ghi
       newAvail = $quantity - reserved ; < 0 -> 422 quantity "Không thể thấp hơn {reserved} đang giữ cho đơn chưa giao."
       newAvail == inventory_qty -> 422 quantity "Số lượng không thay đổi."
       UPDATE product_variants SET inventory_qty = $newAvail ... WHERE variant_id = $id
  3. INSERT inventory_adjustments (variant_id, at=$now, delta = after - before, available_after = after, reason, note, actor_*)   -- đúng 1 dòng
  4. đọc lại AdminInventoryItem (cùng tx; reserved tính lại) làm kết quả
  5. INSERT idempotency_keys (scope='admin-action', key, request_hash, response_snapshot = item JSON, expires_at = now + 24h)
}, { timeout: 10_000, maxWait: 5_000 })
```
Vì sao đúng:
- **delta:** một câu `UPDATE` có điều kiện, không có khoảng "đọc rồi ghi" nên không mất cập nhật: đua với `placeOrder` -3 thì hai bên tuần tự; bên nào chạy sau thấy giá trị bên kia đã commit (READ COMMITTED + khoá dòng, Postgres đánh giá lại `WHERE` trên bản mới). `CHECK inventory_qty >= 0` là đai thứ hai: không thể âm dù code sai.
- **set:** đọc `reserved` sau khi đã giữ khoá biến thể. Mọi thay đổi đồng thời làm đổi `reserved` đều đi cùng đổi `inventory_qty` trong **một** giao dịch khác phải lấy khoá biến thể sau ta (đặt hàng: tăng reserved + giảm qty; huỷ/hoàn: giảm reserved + tăng qty), nên cặp (inventory_qty, reserved) ta đọc luôn nhất quán. Ngoại lệ không đổi `inventory_qty`: `ship` (to_ship -> to_receive, reserved giảm, qty giữ): hàng đã rời kho nên Trong kho giảm đúng; nếu bàn giao commit giữa `FOR UPDATE` và đọc `reserved`, `set` dùng `reserved` mới: kết quả vẫn đúng ngữ nghĩa "đếm thực tế gồm hàng đang giữ" vì người đếm kho không đếm hàng đã giao. Chấp nhận, ghi ở mục 15.
- **Nhật ký:** INSERT cùng giao dịch với UPDATE, nên "mỗi điều chỉnh thành công có đúng 1 dòng, thất bại không có dòng" (AC-INV-33). Không có API sửa/xoá dòng nhật ký (`PUT/DELETE` -> `404` do không có route; test).
- **Idempotency:** phát lại trả đúng response lần đầu (kể cả khi tồn đã đổi sau đó), không tăng tồn lần hai, không thêm dòng nhật ký (AC-INV-35).
- **Lỗi giữa chừng:** exception trước commit -> rollback cả UPDATE tồn lẫn nhật ký.
- Khoá: chỉ một dòng `product_variants` + INSERT, nên không chu trình với thứ tự khoá mục 6.1.

### Lịch sử và biến động do đơn (BR-INV-34, 37)
`GET .../movements`: 50 dòng mới nhất, mới trước. Nguồn 1: `inventory_adjustments` của biến thể (kể cả "Tồn ban đầu"). Nguồn 2 (Should, 6.7), **suy từ dữ liệu có sẵn, không ghi thêm gì ở checkout**: mỗi `order_items` của biến thể cho một dòng `order` (`at = orders.created_at`, `change = -quantity`, `note = 'Bán theo đơn {code}'`, `author = 'Khách'`) và, nếu `orders.stock_restored_at IS NOT NULL`, một dòng `cancel` (`at = stock_restored_at`, `change = +quantity`, `note = 'Đơn huỷ, hoàn kho {code}'`, `author = 'Hệ thống'`). `after = null` cho nguồn 2. Hợp bằng `UNION ALL ... ORDER BY at DESC, id DESC LIMIT 50`; id dòng suy ra = `o-<order_id>-<variant_id>` / `c-...`. Cách này không thêm truy vấn hay lỗi vào đặt hàng/huỷ đơn (AC-INV-38). Phiên bản Must (6.5) chỉ trả nguồn 1.

### Ngưỡng (BR-INV-35, 36)
`status` trong danh sách = `out` nếu `available = 0`; `low` nếu `1..t`; `in` nếu `> t` với `t = COALESCE(v.low_stock_threshold, store_settings.low_stock_default)`. Storefront vẫn dùng `catalog.mapper.ts` (`<= 5`); **không đổi** (AC-INV-37: V `low` ở admin, PDP vẫn `IN_STOCK`). `PUT /admin/inventory/thresholds`: một giao dịch, `UPDATE store_settings SET low_stock_default` / `UPDATE product_variants SET low_stock_threshold = NULL` (clearCustom) / từng `items`; biến thể lạ -> 422 `items[i].variantId`, toàn bộ rollback. Không bump `updated_at` sản phẩm.

## 8. Khuyến mãi / voucher (`promotion.*`)

- **Ánh xạ:** `title` <-> `name`; `type`: `percent`/`fixed`/`free-shipping` <-> enum DB `percent`/`fixed`/`free_shipping`; `usageLimit` <-> `total_limit`; `perCustomerLimit` <-> `per_user_limit`; `audience: members` <-> `members_only = true`; `categories[0]` (slug) <-> `category_id`; `enabled` <-> `is_active`; `used` <-> `used_count`; `hasRedemptions` = `EXISTS voucher_redemptions` (bất kể `released_at`).
- **Kiểm (BR-INV-39):** mã `cleanCode = input.replace(/\s+/g,'').toUpperCase()` rồi regex `^[A-Z0-9]{4,20}$` (khớp CHECK DB `chk_vouchers_code`); trùng: `UNIQUE(code)` + kiểm trước (`P2002` -> `duplicate code`, so không phân biệt hoa thường vì mã lưu chữ hoa). `percent`: value 1-90 (khớp BR-VOU-02), `maxDiscount` null hoặc 1.000..10.000.000; `fixed`: 1.000..10.000.000, `maxDiscount` null; `free-shipping`: cả hai null (khớp `chk_vouchers_value`, `chk_vouchers_max_discount`). `endsAt` > `startsAt` (nếu cả hai); tạo mới `endsAt <= now` -> 422 `endsAt`. `startsAt` trống khi tạo = `now`. `categories` > 1 -> 422 `categories`; slug không tồn tại -> 422. `audience` ngoài {everyone, members} -> 422 `audience` (AC-INV-46). Số: `minSubtotal` 0..100.000.000, `usageLimit` null hoặc 1..1.000.000, `perCustomerLimit` 1..10.
- **Sửa (PUT):** `SELECT ... FROM vouchers WHERE voucher_id = $id FOR UPDATE` (khoá đầu tiên trong thứ tự mục 6.1; `placeOrder` cũng khoá voucher nên tuần tự hoá việc tăng `used_count` với sửa `usageLimit`) -> phiên bản -> `code` khác hiện tại -> 422 `code` -> nếu `hasRedemptions`: đổi `type`/`value`/`maxDiscount` -> `409 voucher-in-use` -> `usageLimit` != null và < `used_count` -> 422 `totalLimit` -> ghi (`admin_updated_at = $now`, `updated_by`). Không bump `updated_at` bằng tay (Prisma `@updatedAt` sẽ tự bump; chấp nhận, cột này không còn là phiên bản).
- **Bật/tắt (PATCH):** `UPDATE ... SET is_active, admin_updated_at, updated_by`. Báo giá/checkout đọc `is_active` mỗi lần (Slice 3) nên hiệu lực ngay (BR-INV-41, AC-INV-43); không cache. Đặt đúng giá trị hiện có: vẫn 200, không bump `admin_updated_at`.
- **Xoá:** khoá voucher; `EXISTS voucher_redemptions` -> `409 voucher-in-use`; ngược lại `DELETE`. FK `voucher_redemptions -> vouchers` `RESTRICT` là đai cuối (`23503` -> `voucher-in-use`).
- **Trạng thái (BR-INV-43):** tính trong SQL cho `counts`/`state` và lặp lại ở `computeState(row, now)` cho mapper (một hàm thuần có test bảng; SQL dùng `CASE` cùng thứ tự): `disabled` nếu `NOT is_active`; `scheduled` nếu `starts_at > now`; `expired` nếu `ends_at <= now` hoặc `(total_limit IS NOT NULL AND used_count >= total_limit)`; còn lại `running`. Mốc "bây giờ" lấy từ `lib/clock` (test đặt giờ được). `starts_at` NULL = đã bắt đầu. Danh sách sắp `created_at DESC, voucher_id DESC`.
- **Dùng được ở checkout (BR-INV-38, AC-INV-40):** không có ánh xạ riêng - cùng bảng; test tích hợp tạo `SALE50K` qua API admin rồi `POST /checkout/quote` và `GET /account/vouchers` của thành viên.

## 9. Lưu trữ ảnh (BR-INV-24..28; S6-Q1)

### Giao diện
```ts
// lib/storage/types.ts
export interface ImageStorage {
  readonly name: 'local' | 'supabase';
  put(key: string, data: Buffer, contentType: string): Promise<void>;   // key = media_id; không ghi đè (tên ngẫu nhiên)
  publicUrl(key: string): string;                                        // URL tuyệt đối (supabase) hoặc /api/media/{key} (local)
  read(key: string): Promise<{ data: Buffer; contentType: string } | null>;  // chỉ driver local cần (GET /media)
}
```
- **`local`** (dev/test): ghi vào `MEDIA_LOCAL_DIR` (mặc định `backend/.media/`, thêm vào `.gitignore`; test dùng thư mục tạm riêng mỗi lần chạy). `key` đã kiểm regex nên không có `..`. `GET /api/media/:id` đọc tệp (`read`) và trả byte.
- **`supabase`** (bản thật, khi Thắng chốt S6-Q1): dùng `fetch` của Node (không thêm `@supabase/supabase-js`): `POST {SUPABASE_URL}/storage/v1/object/{bucket}/{key}` với `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`, `Content-Type`, `x-upsert: false`; URL công khai `{SUPABASE_URL}/storage/v1/object/public/{bucket}/{key}`. Service role key là **bí mật**, chỉ nằm trong `backend/.env` và biến môi trường deploy; không log; không trả cho FE. Bucket `product-images` do Thắng tạo, đặt Public (hướng dẫn trong lát 6.8). `GET /api/media/:id` -> `302 Location: publicUrl`.
- Chọn bằng `MEDIA_STORAGE` (mặc định `local`). Khi `NODE_ENV=production` mà `local` hoặc thiếu biến `supabase` -> khởi động in cảnh báo; tải ảnh trả `unavailable` thay vì ghi sai chỗ (chưa chặn các API khác).
- Test driver supabase bằng `fetch` giả (kiểm URL, header, không lộ key); không gọi mạng thật trong test.

### Kiểm tệp (`lib/image-info.ts`, không thư viện)
1. `express.raw({ type: () => true, limit: 5 * 1024 * 1024 + 1 })` chỉ trên route này; thân > 5 MB hoặc `Content-Length` > giới hạn -> `invalid-image size` (bắt lỗi `entity.too.large`); thân rỗng -> `format`.
2. Magic bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF....WEBP`. Không khớp -> `format` (kể cả `.exe` đổi đuôi, AC-INV-25).
3. Kích thước: PNG đọc IHDR (byte 16-23); JPEG quét marker tới SOF0-SOF15 (trừ DHT `C4`, JPG `C8`, DAC `CC`), chiều cao rồi rộng; WebP: `VP8 ` (khung 14 bit sau `9D 01 2A`), `VP8L` (14 bit sau `2F`, cộng 1), `VP8X` (24 bit + 1 ở offset 24, 27). Đọc thiếu byte/cấu trúc hỏng -> `format`. Cạnh ngắn < 600 hoặc cạnh dài > 6.000 -> `dimensions`. Không tôn trọng EXIF xoay (ghi chú giả định).
4. Thứ tự lỗi khi nhiều lỗi: `size` -> `format` -> `dimensions`.
5. Tên: `up-` + 16 byte `randomBytes` hex + `.jpg|.png|.webp` theo **loại phát hiện**, không theo đuôi/`Content-Type` do client gửi.
6. Ghi: `storage.put` rồi `INSERT media_assets`. Nếu INSERT lỗi sau khi put thành công: tệp mồ côi (chấp nhận, log `mediaId`); nếu put lỗi: `unavailable`, không có dòng. Trả 201 `{ id, url, alt:'', color:'', width, height, size, contentType }`.

### Hiển thị (BR-INV-27)
- Quy tắc duy nhất cho storefront: `mediaId` có trong media manifest -> ảnh tĩnh như cũ; không có -> `/api/media/{mediaId}`. Catalog, cart, order **không đổi contract** (vẫn trả `mediaId`); `order_items.media_id` đã chụp id (tối đa 100 ký tự, id upload 40) nên đơn cũ giữ đúng ảnh kể cả khi sản phẩm đổi bìa (AC-INV-27/28). Việc của FE (mục 13).
- API admin trả `url: '/api/media/{id}'` cho ảnh tải lên, `url: null` cho ảnh thư viện (FE tra manifest). Lý do: mọi `url` đi qua cùng một cổng nên đổi nơi lưu (S6-Q1) không làm vỡ dữ liệu đã lưu.

## 10. Quyền và giới hạn tần suất (BR-INV-01..04)

`CATALOG_PERMISSIONS` (một nguồn, `requirePermission(name)`):

| Quyền | staff | admin | Endpoint |
| --- | --- | --- | --- |
| `catalog.read` | có | có | mọi `GET /admin/{categories,products,inventory,promotions}/**` |
| `stock.adjust` | có | có | `POST /admin/inventory/{variantId}/adjustments` |
| `products.write` | - | có | `POST/PUT/DELETE /admin/products`, `POST .../bulk-status` |
| `media.upload` | - | có | `POST /admin/uploads/product-images` |
| `stock.thresholds` | - | có | `PUT /admin/inventory/thresholds` |
| `promotions.write` | - | có | `POST/PUT/PATCH/DELETE /admin/promotions` |

- Không phiên / hết hạn / `n2f_sid` / `is_active = false` -> `401 unauthenticated` (`requireAuth('admin')` hiện có, vai trò đọc từ DB mỗi yêu cầu nên hạ vai trò có hiệu lực ngay, AC-INV-04). `Cache-Control: no-store` từ `noStore` đặt trước `requireAuth` (cả 401/403).
- Thiếu quyền -> `403 forbidden`; kiểm **trước** Zod và trước khi mở giao dịch nên không đổi dữ liệu, không dòng nhật ký (AC-INV-02).
- Rate limit: dùng lại `adminRateLimit` (đọc 120/60 giây GET, ghi 60/60 giây còn lại, theo `user_id`, chung bộ đếm với Slice 4); upload thêm `adminUploadLimit` 30/10 phút. Vượt -> `429 rate-limited` + `retryAfterSeconds` + `Retry-After`. Mỗi lượt tải đếm cả ở bộ ghi chung lẫn bộ upload (AC-INV-05 kiểm riêng từng bộ).
- `GET /media/:id` công khai, không auth, dùng `catalogRateLimit` hiện có (120/phút/IP) để không bị quét.

## 11. Danh sách và đếm (SQL tham số hoá bằng `Prisma.sql`)

- **Sản phẩm:** một hàm dựng `WHERE` dùng chung cho `list` và `counts`: `q` -> `foldVi(q)` tách token; mỗi token khớp `p.search_text LIKE '%tok%'` (có `ESCAPE`, thoát `%_\`) HOẶC tồn tại biến thể `sku ILIKE '%tok%'` (escape); `category` (slug -> `category_id`). `counts`: `COUNT(*) FILTER (WHERE status='ACTIVE')`..., `out-of-stock` = `EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.product_id AND v.inventory_qty = 0)`. `view` không vào `counts`. `inventory` (tổng có thể bán) và `variantCount` bằng subquery tương quan hoặc `LEFT JOIN LATERAL`; ảnh bìa = `cover_media_id` (`''` -> `coverImage: null`). Sắp `updated_at DESC, product_id DESC`. `q` > 100 ký tự sau trim -> 422 `q`; `limit` ngoài 1..100 -> 422 `limit`; `page` < 1 -> 422 `page`.
- **Tồn kho:** 1 dòng / biến thể, join `products`, `categories`; `reserved` bằng subquery tương quan (mục 7, dùng `idx_order_items_variant` + index `orders`); `t` ngưỡng (mục 7); `view` = `status`; `q` khớp `v.sku ILIKE` hoặc `foldVi` tên; `color` so `lower(color_name)`; sắp `inventory_qty ASC, sku ASC`. `facets`: `categories` từ bảng `categories`; `colors` = `SELECT DISTINCT ON (lower(color_name))`; `sizes` cố định S/M/L/XL theo thứ tự; `counts` một truy vấn `COUNT(*) FILTER` trên cùng `WHERE` (không `view`); `defaultThreshold`, `customCount = COUNT(low_stock_threshold)`.
- **Khuyến mãi:** `state` tính bằng `CASE` (mục 8) trong `WHERE`/`counts`.
- Không tải mảng lớn không cần thiết; `limit` tối đa 100. Quy mô đồ án chấp nhận quét tuần tự (cảnh báo như R2 của Slice 4).

## 12. Seed và dữ liệu thử

Không đổi seed Slice 3/4 trừ: `store_settings.low_stock_default` mặc định 5 tự có nhờ DEFAULT. Test không phụ thuộc seed: `createUser({ role })` + `loginAdmin()`/`loginStaff()` (có sẵn) + `makeProduct`, `makeVoucher` mới. Ảnh thư viện trong test: dùng id mà sản phẩm seed của test đang có. Buffer ảnh test dựng bằng hàm sinh PNG/JPEG/WebP tối thiểu (đủ header và kích thước khai báo, không cần giải mã) trong `helpers.ts`.

## 13. Điểm FE phải đổi (FE admin đang mock, chỉ đọc code FE; việc của frontend-dev)

1. **Cờ `adminCatalogMode`** (`'mock' | 'http'`) trong `ApiConfig`, độc lập `adminOrdersMode` (`api-config.e2e.ts` giữ `mock`). `http` cần `authMode: 'http'` (cookie `n2f_asid`); cấu hình sai thì cảnh báo/chặn như `adminOrdersMode`. Menu ở HTTP: Đơn hàng, Sản phẩm, Tồn kho, Khuyến mãi; route admin khác "Chưa khả dụng" (BR-INV-06, AC-INV-07).
2. **`HttpAdminProductsApi` / `HttpAdminInventoryApi` / `HttpAdminPromotionsApi`** đối chiếu contract (mọi ghi mang `X-Requested-With: n2f`, `withCredentials` qua interceptor có sẵn):
   - Tham số danh sách: FE `search` -> `q`, `pageSize` -> `limit`, bỏ `sort`/`dir` (sắp cố định). Phản hồi `Page` dùng `limit` (không `pageSize`), kèm `counts`.
   - Sản phẩm: `ProductSummary.image: string` -> `coverImage: {id, url|null}`; `AdminProduct`: bỏ `tags`, `cost`, `seoTitle`, `seoDescription`, `AdminVariant.price` (ẩn ô ở HTTP, K2); `colors`/`sizes` chỉ đọc (suy ra), form sửa `variants[]`; `status` giữ `active/draft/hidden`; thêm `published`, `slugLocked` (khoá ô slug), `updatedAt` gửi lại ở PUT, `hasOrders` thay `stockLocked`; `setStatus` -> `POST /admin/products/bulk-status` (trả `{updated}`); ô tồn của biến thể đã có chỉ đọc (đổi ở Tồn kho). `category` là slug (khớp `Category`), danh sách chọn từ `GET /admin/categories`.
   - Ảnh: `uploadImage(file)` gửi **`file` làm thân yêu cầu** (không `FormData`) tới `POST /admin/uploads/product-images`; phản hồi `UploadedImage`. Hiển thị: `url` có -> dùng; `null` -> tra `media-manifest`.
   - Tồn kho: `adjust` -> `{mode, quantity, reason, note, expectedAvailable?}` (khớp `InventoryAdjustment` hiện có, thêm `expectedAvailable` khi `set`) + header `Idempotency-Key` sinh một lần cho mỗi ý định, dùng lại khi Thử lại; `facets()` gọi `GET /admin/inventory/facets` (hiện `frontendOnly`); `setThreshold`/`setDefaultThreshold` -> `PUT /admin/inventory/thresholds`; `InventoryItem` thêm `productStatus`; `history` -> `movements` (`authorRole` mới, `after` có thể null: hiển thị "—").
   - Khuyến mãi: `Promotion.type` giữ `free-shipping`; `value` null cho free-ship (hiện FE coi "unused"); `categories` tối đa 1 (chọn một); `audience` chỉ "Mọi khách"/"Chỉ thành viên" (mới), ẩn `tiers`, `customerIds`, private; thêm 2 công tắc `firstOrderOnly`, `excludeSaleItems`; `used`, `hasRedemptions` (khoá ô loại/giá trị/giảm tối đa/mã; nút Xoá ẩn khi `hasRedemptions`), `state` do BE trả (FE không tự tính ở HTTP), `setEnabled` -> `PATCH`.
3. **Xử lý lỗi theo `error.code`:** `version-conflict` -> câu BR-INV-05, giữ form (người dùng tải lại thủ công); `stock-changed` (kèm `available`, `reserved`) -> cập nhật số hiển thị, giữ ô nhập; `publish-incomplete` -> liệt kê `missing`; `invalid-image` -> câu theo `reason`; `duplicate` -> gắn lỗi vào `field`; `variant-in-use` -> gợi ý "Đặt tồn về 0 để ngừng bán size này"; `product-in-use`, `voucher-in-use` -> thông điệp BR; `forbidden` -> ẩn nút; `rate-limited` -> `retryAfterSeconds`; mất mạng/5xx -> giữ dữ liệu, nút Lưu mở lại (AC-INV-48). Khoá nút khi đang gửi.
4. **`permissions.ts`** khớp mục 10: staff thêm `inventory.adjust`, chỉ xem sản phẩm/khuyến mãi; admin: `products.write`, `promotions.write`, `stock.thresholds`, `media.upload`. Ẩn nút/route "Thêm sản phẩm", "Tạo mã", Lưu/Xoá/đổi trạng thái với staff; `/admin/products/new` chặn (AC-INV-03).
5. **Storefront ảnh:** hàm tra ảnh dùng chung (thẻ sản phẩm, PDP, giỏ, checkout, đơn, wishlist, so sánh...): không có trong `media-manifest` -> `/api/media/{mediaId}` (cùng site, proxy `/api` đã có). Không cần `mode` mới, chỉ chạy khi dữ liệu từ BE.
6. **Giữ nguyên `mode: mock`** và Playwright mock pass nguyên (BR-INV-06). Thêm spec HTTP-mô-phỏng (`contract-mock` như Slice 4) cho form lỗi `version-conflict`, `stock-changed`.
7. Tài khoản demo: seed BE (`admin@nine2fine.test`, `staff@nine2fine.test`).

## 14. Thứ tự làm và test (T-INV ↔ AC-INV theo lát)

Mỗi lát: `tsc --noEmit` và test của lát pass (từng file chạy 2 lần; M2 vitest crash trên Windows xem handoff).

**6.1 Nền** (migration, `CATALOG_PERMISSIONS`, `requirePermission`, 7 mã lỗi, `noStore`+mount các router rỗng, `adminUploadLimit`, `CATALOG_ASSUMPTIONS`, `GET /admin/categories`, `env`):

| Test | AC | Kiểm |
| --- | --- | --- |
| T-INV-01 | AC-INV-01 | Không cookie / chỉ `n2f_sid` / staff `is_active=false`: `GET /admin/products`, `POST adjustments`, `POST promotions` -> 401, `no-store`, không dữ liệu |
| T-INV-02 | AC-INV-02 | Staff: GET + adjust 200; mọi ghi khác 403, DB không đổi, không dòng `inventory_adjustments` (bảng ma trận mục 10, mỗi hàng một ca) |
| T-INV-03 | AC-INV-04 | Admin hạ staff bằng SQL -> `PUT` kế tiếp 403 |
| T-INV-04 | AC-INV-05 | 61 ghi/60 giây -> 429 + `retryAfterSeconds` + `Retry-After`; 31 upload/10 phút -> 429 (clock giả) |
| T-INV-05 | AC-INV-09 | `migrate deploy` x2; không DROP/TRUNCATE/RENAME/đổi kiểu; 2 bảng mới bật RLS; mọi `ACTIVE` có `published_at`; CHECK `NOT VALID` đúng |
| T-INV-06 | AC-INV-47 | Mỗi lỗi chính: body `{error:{code,message,...}}`, `code` đúng BR-INV-08, không stack/SQL (quét chuỗi `at `, `SELECT`, `prisma`) |

**6.2 Sản phẩm đọc:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-INV-10 | AC-INV-10 | `q=ao so mi` ra "Áo Sơ Mi Lụa"; tìm SKU của V ra P; tab `draft`, `out-of-stock`; `counts` mỗi tab = số dòng của tab |
| T-INV-11 | AC-INV-11 | `q` 101 ký tự, `limit=101`, `limit=0` -> 422 đúng `field` |
| T-INV-12 | BR-INV-10 | Chi tiết đủ trường (không có `tags/cost/seo`), `hasOrders`, `published`, `slugLocked`; id lạ/sai dạng 404; sắp `updatedAt` giảm hoà `id` |

**6.3 Sản phẩm ghi** (+ **đóng 2.19**):

| Test | AC | Kiểm |
| --- | --- | --- |
| T-INV-20 | AC-INV-12 | Giá 999 / 100.000.001 / giá gốc = giá / tên 121 / danh mục lạ / `genders:["kid"]` -> 422 đúng `field`, không tạo gì (đếm bảng) |
| T-INV-21 | AC-INV-13 | Sửa mô tả P giữ `badge/looks/fit_model/sales_rank/display_order`; sản phẩm mới đứng cuối "Nổi bật" |
| T-INV-22 | AC-INV-14 | Slug trống -> `ao-len-co-lo`, lần hai `-2`; slug trùng P -> 409 `duplicate slug`; `Ao_Len` -> 422 `slug` |
| T-INV-23 | AC-INV-15 | Đổi slug P (đã công khai) 422 giữ slug cũ; D chưa công khai 200 |
| T-INV-24 | AC-INV-16 | D không ảnh -> 422 `publish-incomplete` `missing:["images"]`; thêm ảnh -> 200, `published_at` ghi, PLP thấy D hết hàng |
| T-INV-25 | AC-INV-17 | Bulk `ACTIVE` [P,D,E]: 422 kèm D, cả ba không đổi; 51 id 422; [P, id lạ] 404 P không đổi |
| T-INV-26 | AC-INV-18 (BE) | Ẩn P: catalog (list/search/total/PDP 404) và cart thành viên `discontinued`, đặt hàng chặn đúng lỗi Slice 3; đơn cũ O đọc đủ ở API khách và admin |
| T-INV-27 | AC-INV-19 | Đổi giá 500k -> 450k: `GET /cart` và quote dùng 450k; đơn O1 vẫn 500k |
| T-INV-28 | AC-INV-20 | Xoá D 204 (+ biến thể, nhật ký đi theo), P 409, F 409 `product-in-use` |
| T-INV-29 | AC-INV-21 | Thêm màu Be x S,M tồn 5: 2 biến thể + 2 dòng `received` "Tồn ban đầu"; SKU trùng 409; 9 màu, size XXL, hex `#FFF`, "Đen"/"đen" 422 x4 |
| T-INV-30 | AC-INV-22 | Gửi `inventory:999` cho V vẫn 10; đổi SKU V 422; đổi tên màu áp mọi biến thể màu, `color_media` theo tên mới, `order_items.color_name` cũ nguyên |
| T-INV-31 | AC-INV-23 | Bỏ XL có đơn 409 `variant-in-use` + `sku` (không đổi gì); bỏ M-Trắng xoá, dòng giỏ thành viên mất, giỏ khách `discontinued` |
| T-INV-32 | AC-INV-24 | Đổi tên/loại -> `q=phong tron` ra, `q=thun basic` không; mọi dòng `search_text = foldVi(name + ' ' + type_label)` |
| T-INV-33 | BR-INV-22 | Quét tĩnh không có đường ghi `products` ngoài `product.write.ts` (trừ seed); lỗi chèn giữa chừng (spy khiến ghi biến thể throw) -> `name`, `search_text`, biến thể đều không đổi |
| T-INV-34 | AC-INV-06 (SP) | A, A2 cùng đọc P; A lưu giá; A2 lưu tên với `updatedAt` cũ -> 409 `version-conflict`, tên không đổi |

**6.4 Ảnh:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-INV-40 | AC-INV-25 | JPG 6 MB `size`; `.exe` đổi đuôi `format`; PNG 400x500 `dimensions`; WebP 1200x1600 201 (`id` <= 100, `url` mở được 200 đúng `Content-Type`); staff 403 |
| T-INV-41 | AC-INV-26 | 13 ảnh 422 `images`; [i1 Đen, i2, i3 Trắng, i4 Đen] bìa i1, gallery đúng thứ tự, `color_media` {Đen:i1, Trắng:i3}; màu "Xanh" 422; id bịa 422 |
| T-INV-42 | AC-INV-27 | Lưu P không đổi giữ id thư viện; Q (ảnh tải lên) qua catalog PLP/PDP, cart, quote trả `mediaId` upload; đổi bìa Q, `order_items.media_id` cũ nguyên |
| T-INV-43 | AC-INV-28 | Bỏ i1 khỏi Q: `GET /media/i1` vẫn 200; đơn O vẫn `mediaId` i1 |
| T-INV-44 | BR-INV-25 | Hợp đồng `ImageStorage`: `local` ghi/đọc/không ghi đè/`..` bị chặn; `supabase` (fetch giả) gọi đúng URL + header, `GET /media` trả 302 `Location`; đổi `MEDIA_STORAGE` không đổi API |
| T-INV-45 | BR-INV-24 | Tên lưu không chứa tên gốc/đuôi client; loại theo nội dung; JPEG/PNG/WebP hợp lệ đo đúng kích thước (bảng mẫu byte) |

**6.5 Tồn kho:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-INV-50 | AC-INV-29 | V (qty 10, to_ship 2, to_pay 1): onHand 13, reserved 3, available 10, `in`; đặt 5 `low`; 0 `out` |
| T-INV-51 | AC-INV-30 | 4 biến thể 1-5: tab `low` đếm 4; lọc màu Đen + size M; tìm SKU V; `counts` = số dòng |
| T-INV-52 | AC-INV-31 | Bắt đầu available 10, đang giữ 3: +5 `received` -> 15; -16 `damaged` -> 422 "Chỉ còn 15"; `set 18` `count` -> 422 "Số lượng không thay đổi" (18 - 3 = 15); `set 2` -> 422 "thấp hơn 3"; `set 20` -> available 17; delta 10.001 và 0 -> 422 |
| T-INV-53 | AC-INV-32 | received -2, damaged +2, count có delta -> 422 `reason`; correction không note, note 201 ký tự -> 422 `note` |
| T-INV-54 | AC-INV-33 | V qty 3: 20 lần song song (3 khách đặt 1 + 3 điều chỉnh -1 damaged + nhiễu): không âm; qty cuối = 3 - đơn tạo được - điều chỉnh thành công >= 0; mỗi điều chỉnh thành công đúng 1 dòng nhật ký, thất bại 0 dòng; không 500. Lặp x20 |
| T-INV-55 | AC-INV-34 | S thấy 10; một đơn trừ 1 -> 9; `set 13` `expectedAvailable:10` -> 409 `stock-changed` `available:9, reserved:4`; không đổi, không dòng nhật ký |
| T-INV-56 | AC-INV-35 | Gửi lại cùng `Idempotency-Key` +5 -> available chỉ tăng 5, 1 dòng, header `Idempotency-Replayed`; cùng khoá khác body 409 `idempotency-conflict`; thiếu khoá 422 |
| T-INV-57 | AC-INV-36 | 3 điều chỉnh -> 3 dòng mới trước đủ trường; 63 dòng -> trả 50; `PUT`/`DELETE` dòng -> 404 |
| T-INV-58 | BR-INV-30 | Facets: `counts` tổng; `customCount`; `colors` distinct không phân biệt hoa thường |

**6.6 Khuyến mãi:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-INV-60 | AC-INV-40 | Tạo `SALE50K` fixed 50.000 min 300.000; checkout 400.000 áp mã -> giảm 50.000 ngay; `/account/vouchers` có mã |
| T-INV-61 | AC-INV-41 | `sale-10` 422 `code`; `AB1` 422; ` sale 10 ` lưu `SALE10`; `n2ffreeship` trùng 409; percent 95, free-ship có value, kết thúc <= bắt đầu, kết thúc hôm qua: 422 x4 |
| T-INV-62 | AC-INV-42 | W đã dùng: 15->20 `voucher-in-use`; đổi mã 422; `usageLimit` < đã dùng 422 `totalLimit`; đổi `minSubtotal` 200, báo giá kế tiếp mức mới, O1 giữ số tiền giảm |
| T-INV-63 | AC-INV-43 | Tắt X khi khách ở checkout: quote gỡ kèm lý do; đặt hàng 409 `voucher-changed`; bật lại áp được |
| T-INV-64 | AC-INV-44 | Xoá X 204; W 409; Y (dùng rồi huỷ, đã trả lượt) 409 |
| T-INV-65 | AC-INV-45 | 6 voucher (tắt, mai bắt đầu, hôm qua hết, 5/5, kết thúc đúng `now`, bình thường): `disabled`, `scheduled`, `expired` x3, `running`; `counts` khớp; bảng test `computeState` |
| T-INV-66 | AC-INV-46 | 2 danh mục, `audience:"tiers"` -> 422 x2, không lưu |
| T-INV-67 | AC-INV-06 (voucher) | A, A2 cùng đọc X; A sửa; A2 `updatedAt` cũ 409; **một đơn dùng X giữa chừng không gây conflict giả** (kiểm cột `admin_updated_at`) |

**6.7 Should:**

| Test | AC | Kiểm |
| --- | --- | --- |
| T-INV-70 | AC-INV-37 | Ngưỡng mặc định 8, V qty 7 `low` ở admin, PDP `IN_STOCK`; ngưỡng riêng 2 -> `in`; null -> `low`; về 8; ngưỡng 1.001 422; staff 403 |
| T-INV-71 | AC-INV-38 | Khách đặt 2 V rồi huỷ: lịch sử có "Bán theo đơn O" -2 và "Đơn huỷ, hoàn kho O" +2; không thêm truy vấn/lỗi ở `placeOrder` |
| T-INV-72 | AC-INV-39 | A sửa P; S mở P: `updatedBy.name` = tên A |

**6.8 Nghiệm thu thật** (Thắng/Orchestrator, cần duyệt): áp migration lên Supabase, tạo bucket `product-images` công khai + `MEDIA_STORAGE=supabase`; SP mới có ảnh tải lên -> công khai -> khách đặt COD -> staff điều chỉnh tồn; voucher tạo ở admin dùng trong đơn thật; `migrate deploy` lần 2 không có gì (AC-INV-09, 16, 24, 27, 33, 40).

**Chỉ FE/E2E (không có T-INV):** AC-INV-03, 07, 08, 48 (Playwright `adminCatalogMode`), AC-INV-18 phần giao diện giỏ, AC-INV-27 phần hiển thị ảnh.

## 15. Phát hiện, lệch PRD/FE và giả định (cần Orchestrator duyệt trước khi `locked`)

1. **Phiên bản voucher (lệch BR-INV-05):** `updatedAt` của voucher = `COALESCE(admin_updated_at, created_at)` chứ không phải `vouchers.updated_at`, vì checkout đặt cột đó mỗi lần dùng/trả mã (xem mục 2). Hợp đồng vẫn gọi `updatedAt`.
2. **Tải ảnh bằng thân byte thô, không multipart:** multer/busboy chưa nằm trong decisions.md (không thêm thư viện). FE đổi `FormData` -> gửi `File` làm thân. Cùng đường dẫn `/admin/uploads/product-images` như FE hiện có.
3. **Ảnh thư viện `url: null`:** BE không giữ tệp thư viện; FE tra `media-manifest`. `mediaId` không có trong manifest -> `/api/media/{id}` (quy tắc FE thống nhất, contract catalog/cart/order không đổi). Hiệu lực của id thư viện hợp lệ = đã có trên sản phẩm nào đó trong DB.
4. **Cột cộng thêm ngoài PRD:** `products.image_meta` (alt + màu từng ảnh — PRD yêu cầu alt ≤ 125 và ảnh gắn màu mà DB không có chỗ lưu), `store_settings.low_stock_default`, `product_variants.low_stock_threshold`, `vouchers.admin_updated_at/updated_by`, `products.updated_by`, bảng `media_assets`. (PRD BR-INV-07 chỉ liệt kê loại; số cột cụ thể do BE chốt.)
5. **Tham số/trường khác FE hiện tại:** `q`/`limit` (PRD) thay `search`/`pageSize`; `Page` trả `limit`; `coverImage` thay `image`; `audience` enum `everyone|members` (FE cũ có thêm `tiers/customers/private`); `categories` <= 1; ProductInput bỏ `tags/cost/seo/colors/sizes` và giá biến thể. `PATCH` bật/tắt nhận `updatedAt` tuỳ chọn (không bắt buộc, vì FE `setEnabled(id, enabled)` không có bản đọc kèm).
6. **Giới hạn thân JSON:** `express.json` toàn cục 16 KB không đủ cho `description` 5.000 ký tự tiếng Việt (tới ~15 KB UTF-8) cộng 32 biến thể + 12 ảnh. Đề xuất 64 KB riêng cho `POST/PUT /admin/products` (đã ghi vào tiêu đề tóm tắt contract), các route khác giữ 16 KB. Đổi `app.ts` (tham số parser), không đổi hành vi route cũ.
7. **Idempotency scope:** dùng lại `admin-action` (không nới CHECK nữa, tránh `DROP CONSTRAINT` mà BR-INV-07 cấm).
8. **Seed đè dữ liệu admin:** `prisma/seed-catalog.ts` upsert sản phẩm theo slug và tính lại `search_text`. Sau khi admin sửa sản phẩm trên Supabase, **không chạy lại seed catalog** (sẽ ghi đè tên/giá/ảnh/biến thể). Đề xuất: seed catalog chỉ chạy trên DB rỗng hoặc có cờ `--force`; việc nhỏ ở lát 6.1. Cần Orchestrator xác nhận.
9. **`set` và `ship`:** đã giải thích ở mục 7: bàn giao đồng thời làm Đang giữ giảm; kết quả `set` vẫn đúng nghĩa đếm thực tế; không có `stock-changed` trong trường hợp này vì `inventory_qty` không đổi (người đếm vẫn thấy `expectedAvailable` khớp). Chấp nhận.
10. **`display_order`/`sales_rank` khi tạo đồng thời:** có thể trùng; PLP hoà theo slug (hành vi sẵn có).
11. **Ngưỡng `NOT VALID`:** CHECK giá/gallery chỉ áp ghi mới; nếu seed có giá < 1.000 thì lần sửa đầu sản phẩm đó phải sửa giá (422 `price`). Test T-INV-05 đối chiếu dữ liệu seed.
12. **Chất lượng ảnh:** không xử lý EXIF xoay, không tạo thumbnail, không nén; kích thước kiểm theo header tệp. Mồ côi sau lỗi giữa put và INSERT chấp nhận (BR-INV-28 không dọn).
13. **Xoá đường dẫn media sau đổi driver:** id vẫn giống, URL là `/api/media/{id}` nên không đổi; chuyển driver cần sao chép tệp bằng tay (Won't có công cụ).
14. **Giả định về giờ:** `startsAt/endsAt` nhập ở FE theo giờ Việt Nam, đổi sang ISO có múi giờ trước khi gửi; BE lưu UTC (`timestamp` không múi giờ, như cột sẵn có) và hiển thị trạng thái theo `lib/clock`.
