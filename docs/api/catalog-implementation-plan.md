# Kế hoạch triển khai Catalog (Slice 2) - draft

Hợp đồng: `docs/api/openapi.yaml` (phần catalog `status: draft`; auth vẫn locked). BR/AC: `docs/product/PRD.md` mục "Slice 2: Catalog" (BR-CAT-01..23, AC-CAT-01..53); khi mâu thuẫn, PRD thắng. Chỉ là tài liệu: agent triển khai làm theo mục 7 mà không cần hỏi lại; chỗ cần quyết định ở mục 9.

Phạm vi BE Slice 2 (chỉ đọc): `GET /api/products`, `GET /api/products/{slug}`, `GET /api/products/{productId}/reviews` (luôn `[]`), `GET /api/size-charts/{category}`, mã lỗi `not-found`, giới hạn tần suất catalog, seed. Ngoài phạm vi: đánh giá thật, `rating`, `/stock-alerts`, eligibility (BR-CAT-17: FE ẩn, không gọi), wishlist phía BE, giỏ/checkout, CRUD sản phẩm, giữ/trừ tồn kho.

## 1. Schema Prisma (chỉ cộng thêm, BR-CAT-23)

Đối chiếu hiện trạng: schema chỉ có `membership_tiers` (hạng thành viên, không liên quan), `users`, `addresses`, `auth_action_tokens`, `login_attempts`, `sessions`, `auth_rate_limits`. Không có bảng catalog nào để tái dùng hay trùng. Không đụng bảng cũ.

Quy ước theo schema hiện có: khoá chính `uuid default gen_random_uuid()`, cột DB `snake_case` (map từ field camelCase), thời gian `Timestamp(6)` (UTC), tiền `Decimal(12,2)`.

### Enum mới
`product_status` (ACTIVE, DRAFT, ARCHIVED, theo PRD / master plan 33); `product_gender` (nam, nu); `product_moment` (work, dinner, event, weekend). Danh mục là bảng (gắn bảng size, mở rộng được), giới tính / khoảnh khắc là enum vì tập cố định.

### `categories`
| Cột | Kiểu | Ràng buộc |
| --- | --- | --- |
| category_id | uuid | PK |
| slug | varchar(50) | UNIQUE, CHECK `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'` |
| name | varchar(100) | NOT NULL (Áo, Quần & chân váy, Đầm, Áo khoác) |
| sort_order | int | NOT NULL default 0 |

### `products` (BR-CAT-01, 02)
| Cột | Kiểu | Ràng buộc / ghi chú |
| --- | --- | --- |
| product_id | uuid | PK; cấp một lần, không đổi khi seed lại |
| category_id | uuid | NOT NULL, FK `categories` ON DELETE RESTRICT |
| slug | varchar(80) | UNIQUE, CHECK `char_length(slug) BETWEEN 3 AND 80` và `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'` |
| name | varchar(120) | NOT NULL, CHECK `char_length(btrim(name)) >= 1` |
| type_label | varchar(120) | NOT NULL, CHECK như `name` (trường `type` của FE) |
| price | decimal(12,2) | NOT NULL, CHECK `price BETWEEN 10000 AND 50000000 AND price = trunc(price)` |
| compare_at_price | decimal(12,2) | NULL, CHECK `compare_at_price IS NULL OR compare_at_price > price` |
| badge | varchar(20) | NULL |
| description, material | text | NOT NULL default '' |
| care | text[] | NOT NULL default '{}' |
| fit_summary, fit_model | text | NOT NULL default '' |
| looks | jsonb | NOT NULL default '[]', CHECK `jsonb_typeof(looks) = 'array'` |
| cover_media_id | varchar(100) | NOT NULL, CHECK `~ '^[a-z0-9-]+$'` (khoá media manifest, chưa cho URL) |
| gallery_media_ids | text[] | NOT NULL, CHECK `cardinality >= 1` |
| color_media | jsonb | NOT NULL default '{}', CHECK `jsonb_typeof = 'object'` |
| moments | product_moment[] | NOT NULL, CHECK `cardinality >= 1` |
| genders | product_gender[] | NOT NULL, CHECK `cardinality >= 1` |
| sales_rank | int | NOT NULL, CHECK `>= 1` |
| display_order | int | NOT NULL (thứ tự "Nổi bật", C2) |
| search_text | text | NOT NULL (mục 1.1) |
| status | product_status | NOT NULL default 'DRAFT' |
| created_at | date | NOT NULL default `current_date` (trả ra là `createdAt` dạng `YYYY-MM-DD`, C13; sắp xếp "Mới nhất" dùng cột này) |
| updated_at | timestamp(6) | default now(), `@updatedAt` |

Cột `created_at` kiểu `date` (không phải timestamp) có chủ ý để `createdAt` giữ nguyên định dạng FE hiện có; hai sản phẩm cùng ngày hoà bằng `slug`.

Index: `idx_products_category (category_id)`; `idx_products_status_order (status, display_order, slug)`; GIN `idx_products_moments (moments)`, GIN `idx_products_genders (genders)`. Không thêm index riêng cho price / created_at / sales_rank: vài trăm dòng thì quét tuần tự nhanh hơn; thêm khi đo thấy chậm (mục 6).

### `product_variants` (BR-CAT-03, 04)
| Cột | Kiểu | Ràng buộc |
| --- | --- | --- |
| variant_id | uuid | PK; ổn định qua seed |
| product_id | uuid | NOT NULL, FK `products` ON DELETE CASCADE |
| sku | varchar(64) | UNIQUE |
| size | varchar(10) | NOT NULL, CHECK `size IN ('S','M','L','XL')` |
| color_name | varchar(50) | NOT NULL |
| color_hex | char(7) | NOT NULL, CHECK `~ '^#[0-9a-fA-F]{6}$'` |
| inventory_qty | int | NOT NULL default 0, CHECK `>= 0` |
| sort_order | int | NOT NULL default 0 (màu theo thứ tự seed, rồi S, M, L, XL) |
| created_at, updated_at | timestamp(6) | |

UNIQUE `(product_id, color_name, size)` (đồng thời là index cho join theo `product_id`). `stockStatus` KHÔNG lưu: tính ở mapper từ `inventory_qty` (0 OUT_OF_STOCK, 1..5 LOW_STOCK, >= 6 IN_STOCK). Không có cột `is_active`: biến thể hết hàng vẫn hiện với `inventory 0`. Trigger/ràng buộc "mỗi sản phẩm ACTIVE có >= 1 biến thể" (BR-CAT-03) kiểm bằng seed và test, không bằng DB (DEFERRABLE trigger quá nặng cho Slice 2); ghi nhận rủi ro R6.

### `size_charts`
`category_id uuid PK FK categories ON DELETE CASCADE`, `data jsonb NOT NULL` (đúng dạng `SizeChart` của contract), `updated_at timestamp(6)`. jsonb vì đọc nguyên khối, cột đo khác nhau theo danh mục.

### 1.1 Tìm kiếm tiếng Việt có dấu / không dấu (BR-CAT-13)
Quyết định: **cột `search_text` đã chuẩn hoá ở ứng dụng + chuỗi con**, không extension ở Slice 2 (chạy giống nhau trên Postgres 18 cục bộ và 17 Supabase).
- `foldVi(s)` duy nhất ở `backend/src/lib/text.ts`: NFC -> NFD, bỏ `̀-ͯ`, `toLowerCase()`, `đ -> d`, gộp khoảng trắng, trim (cùng thuật toán `normalize()` của `mock-catalog-api.ts`). Seed ghi `search_text = foldVi(name + ' ' + type_label)` (đúng "tên + loại" của BR-CAT-13). Truy vấn: `q` -> trim + gộp khoảng trắng + NFC; quá 100 ký tự -> 422 `field: q`; rỗng -> không lọc; `foldVi`; tách theo khoảng trắng; mỗi từ là một điều kiện "`search_text` chứa từ", AND các điều kiện.
- Ký tự đại diện: `%`, `_`, `\` phải là ký tự thường. Dùng `{ searchText: { contains: token } }` và **tự thoát** `\`, `%`, `_` bằng `\` trước khi truyền; có test sản phẩm T tên "100% cotton" (tìm `100%` ra, `1_0` không ra) để xác định Prisma có tự thoát chưa; nếu Prisma đã thoát thì bỏ bước tự thoát. Phương án dự phòng chắc chắn: truy vấn con `strpos(search_text, $token) > 0` bằng `Prisma.sql` (không có ký tự đại diện).
- Vì sao không dùng `unaccent`: STABLE nên không đặt trong index biểu thức nếu không bọc lại; cần kiểm riêng cách xử lý `đ`; từ điển có thể khác giữa PG 17 và 18. Không dùng `to_tsvector`: không khớp chuỗi con ("dam" trong "đầm") như FE.
- Mở rộng (Could, > ~5.000 sản phẩm hoặc đo chậm): migration riêng `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;` + `CREATE INDEX ... USING gin (search_text extensions.gin_trgm_ops)` (Supabase có sẵn pg_trgm). Khai báo bằng SQL tay; `migrate dev` có thể sinh `DROP INDEX` cho nó: luôn `--create-only` và xoá dòng đó. Không làm ở Slice 2.
- Khác mock: tìm theo từ độc lập thứ tự (C6): mock chỉ khớp cụm liền.

### Khối Prisma đề xuất
```prisma
enum product_status { ACTIVE  DRAFT  ARCHIVED }
enum product_gender { nam  nu }
enum product_moment { work  dinner  event  weekend }

model Category {
  category_id String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug        String  @unique @db.VarChar(50)
  name        String  @db.VarChar(100)
  sortOrder   Int     @default(0) @map("sort_order")
  products    Product[]
  sizeChart   SizeChart?
  @@map("categories")
}

model Product {
  product_id      String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  categoryId      String           @map("category_id") @db.Uuid
  slug            String           @unique @db.VarChar(80)
  name            String           @db.VarChar(120)
  typeLabel       String           @map("type_label") @db.VarChar(120)
  price           Decimal          @db.Decimal(12, 2)
  compareAtPrice  Decimal?         @map("compare_at_price") @db.Decimal(12, 2)
  badge           String?          @db.VarChar(20)
  description     String           @default("")
  material        String           @default("")
  care            String[]
  fitSummary      String           @default("") @map("fit_summary")
  fitModel        String           @default("") @map("fit_model")
  looks           Json             @default("[]")
  coverMediaId    String           @map("cover_media_id") @db.VarChar(100)
  galleryMediaIds String[]         @map("gallery_media_ids")
  colorMedia      Json             @default("{}") @map("color_media")
  moments         product_moment[]
  genders         product_gender[]
  salesRank       Int              @map("sales_rank")
  displayOrder    Int              @map("display_order")
  searchText      String           @map("search_text")
  status          product_status   @default(DRAFT)
  createdAt       DateTime         @default(dbgenerated("CURRENT_DATE")) @map("created_at") @db.Date
  updatedAt       DateTime         @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  category        Category         @relation(fields: [categoryId], references: [category_id], onDelete: Restrict)
  variants        ProductVariant[]
  @@index([categoryId], map: "idx_products_category")
  @@index([status, displayOrder, slug], map: "idx_products_status_order")
  @@index([moments], map: "idx_products_moments", type: Gin)
  @@index([genders], map: "idx_products_genders", type: Gin)
  @@map("products")
}
// ProductVariant, SizeChart theo bảng trên; ProductVariant có @@unique([productId, colorName, size], map: "uq_variants_product_color_size").
```
CHECK constraint không biểu diễn được trong Prisma: thêm tay vào SQL migration; `migrate dev` không báo lệch vì CHECK nằm ngoài mô hình.

## 2. Migration (chỉ cộng thêm, BR-CAT-23, AC-CAT-53)

- Một migration `backend/prisma/migrations/20261107000400_catalog_schema/`: `CREATE TYPE` x3, `CREATE TABLE` x4, FK, index, `ALTER TABLE ... ADD CONSTRAINT ... CHECK` (thêm tay), cuối file `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` cho cả 4 bảng (theo decisions 2026-11-07 với `auth_rate_limits`: không policy; BE kết nối bằng owner nên không bị ảnh hưởng; Supabase advisor có thể nhắc "RLS bật, chưa policy": chấp nhận). Không có `DROP`, `TRUNCATE`, `DELETE`, `RENAME`, `ALTER` bảng / enum cũ.
- Cách làm: `npx prisma migrate dev --create-only --name catalog_schema` trên **DB cục bộ** (không phải Supabase), mở SQL, bổ sung CHECK + RLS, rồi áp. Đọc SQL tìm từ khoá `DROP|TRUNCATE|DELETE|RENAME` và `ALTER` ngoài 4 bảng mới: có thì dừng.
- Kiểm cục bộ trước: (1) tạo DB `n2f_dev` riêng ở Postgres `127.0.0.1:54329` cho `migrate dev` (không dùng `n2f_test`); (2) `npm test` chạy `migrate deploy` lên `n2f_test` qua `global-setup.ts`: phải áp được từ DB sạch lẫn từ DB đã có 4 migration cũ và có dữ liệu `users`, `sessions`; (3) `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <n2f_shadow>` phải rỗng; (4) chạy `migrate deploy` lần hai: không lỗi, không đổi gì.
- Lên Supabase: chỉ `prisma migrate deploy` (qua `DIRECT_URL` cổng 5432) do Orchestrator / Thắng chạy sau khi test cục bộ xanh. Không `migrate dev`, `migrate reset`, `db push`. Seed lên Supabase là bước riêng.

## 3. Seed idempotent (BR-CAT-05)

Nguồn: `frontend/src/mocks/products.ts` (8 sản phẩm x 2 màu x 4 size = 64 biến thể), `SIZE_CHARTS` trong `frontend/src/mocks/reviews.ts`, danh mục từ `CATEGORIES` trong `catalog/models/product.ts`. `mock-inventory.ts` không có dữ liệu riêng: tồn kho lấy từ `variant.inventory` trong `products.ts` (XL = 0; S/M/L = 5 ở màu thứ nhất, 6 ở màu thứ hai; khớp dữ liệu tham chiếu của PRD).

Cách làm (BE không phụ thuộc Angular lúc chạy):
1. Script một lần `backend/scripts/export-catalog-seed.ts` (chạy bằng `tsx`, import `products.ts` và `reviews.ts`, chỉ có import kiểu nên không kéo Angular) ghi `backend/prisma/seed-data/catalog.json` (commit). Chạy lại khi mock đổi; review bằng diff JSON. Không seed đánh giá.
2. `backend/prisma/seed-catalog.ts` đọc JSON, export `seedCatalog(prisma)` (test gọi được), chạy khi là entry (`require.main === module`). Script `"seed:catalog": "tsx prisma/seed-catalog.ts"`. Không gắn vào `prisma db seed` (seed auth) để khỏi chạy lại mỗi lần.

Map trường:
| FE | DB | Ghi chú |
| --- | --- | --- |
| `id` ('01'..) | không lưu | chỉ dựng `sku`; UUID mới cấp khi tạo |
| `slug` | `slug` | khoá upsert; giữ slug mock (kể cả `weekend-shirt`) |
| `name`, `type` (từ MERCH) | `name`, `type_label` | |
| `category` | `category_id` | tra theo slug |
| `moments`, `genders` | mảng enum | |
| `price`, `compareAtPrice` | decimal | seed kiểm số nguyên và `compareAtPrice > price` |
| `badge` | `badge` | |
| `mediaId` | `cover_media_id` | giữ khoá manifest (`catalog-placeholder`); không tạo URL; seed từ chối giá trị không khớp `^[a-z0-9-]+$` |
| `gallery` | `gallery_media_ids` | |
| `colorMedia` | `color_media` | mock chưa dùng -> `{}` |
| `description`, `material`, `care`, `fit.*`, `looks` | tương ứng | |
| `createdAt` ('2026-10-01') | `created_at` (date) | |
| `salesRank` | `sales_rank` | |
| thứ tự trong `BASE_PRODUCTS` | `display_order` | 1..8 |
| `variants[]` | `product_variants` | `sku`, `size`, `color.name/hex`, `inventory` -> `inventory_qty`; `sort_order` = chỉ số màu x 10 + chỉ số size |
| (không có) | `status` | `ACTIVE` khi tạo |
| (tính) | `search_text` | `foldVi(name + ' ' + type_label)` |
| `rating` | bỏ | không có đánh giá |

Hành vi: **toàn bộ seed chạy trong một `prisma.$transaction(async tx => ...)`** (timeout 60 giây) nên lỗi giữa chừng không để lại dữ liệu nửa vời (AC-CAT-10). `categories` upsert theo `slug`; `products` upsert theo `slug`; `product_variants` upsert theo `sku`; `size_charts` upsert theo `category_id`. Bản ghi đã có: cập nhật nội dung, `display_order`, `search_text`; **không** ghi đè `inventory_qty` (BR-CAT-05, AC-CAT-09) và không ghi đè `status`. `product_id`, `variant_id` chỉ được cấp khi tạo nên ổn định qua mọi lần chạy lại. Không xoá bản ghi vắng trong JSON (chỉ in số lượng "thừa"). Nếu `NODE_ENV=production` cần `CATALOG_SEED_ALLOW_PRODUCTION=1`.

## 4. Module backend

```
backend/src/lib/text.ts                            foldVi(), parseSearchTokens()
backend/src/modules/catalog/catalog.routes.ts      catalogRouter
backend/src/modules/catalog/catalog.schemas.ts     zod: listQuerySchema
backend/src/modules/catalog/catalog.controller.ts  parse -> service -> header cache -> res.json
backend/src/modules/catalog/catalog.service.ts     listProducts, getProductBySlug, getSizeChart
backend/src/modules/catalog/catalog.mapper.ts      toProductDto, stockStatusOf, toSizeChartDto
backend/src/modules/catalog/catalog.types.ts
backend/src/modules/catalog/catalog.cache.ts       categoryCache (slug <-> id, TTL 300 s)
backend/src/middleware/catalog-rate-limit.ts       120 / 60 s / IP, bộ đếm RAM
```
Việc ngoài module (làm đầu tiên):
- `lib/errors.ts`: thêm `'not-found'` vào `ErrorCode`, `STATUS['not-found'] = 404`, `Errors.notFound(message = 'Không tìm thấy tài nguyên.')`.
- `middleware/error.ts`: `notFound` trả `404` với `code: 'not-found'` (hiện là `validation`); sửa test cũ đang assert mã cũ. Mọi phản hồi lỗi `Cache-Control: no-store`.
- `app.ts`: gắn `catalogRouter` ở `api` **trước** `originGuard` (để `POST/PUT/DELETE /api/products` không Origin vẫn trả 404 `not-found`, không 403: AC-CAT-46). Trong `catalogRouter`, đầu tiên `router.use(['/products', '/size-charts'], rateLimit, methodGate)`; `methodGate` chuyển `next(Errors.notFound())` nếu method không phải GET/HEAD/OPTIONS. Không `requireAuth`, không đọc cookie (nên cookie sai không gây 401, AC-CAT-44; `cookieParser` đặt sau cũng không sao).
- `config/prisma.ts`: khi `NODE_ENV === 'test'` tạo client có `log: [{ emit: 'event', level: 'query' }]` để test đếm truy vấn.

### Validate (zod, `catalog.schemas.ts`)
Express 5 dùng query parser đơn giản: tham số lặp thành mảng nên chuỗi fail -> 422. Tiền xử lý mỗi chuỗi: trim; `''` -> `undefined`. Lỗi: `Errors.validation(msg, field)` với `field` = tên tham số (`issues[0].path[0]`).
- `gender`, `category`, `moment`, `size`, `color`: chuỗi <= 50, KHÔNG kiểm tập giá trị bằng zod. Service: `gender` ngoài `nam|nu` -> trang rỗng; `moment` ngoài 4 giá trị -> trang rỗng (tránh lỗi cast enum ở DB); `category` không có trong `categoryCache` -> trang rỗng; `size` -> `toUpperCase()`; `color` -> NFC, so không phân biệt hoa thường. Trang rỗng nghĩa là `{ items: [], total: 0, page, limit }` không truy vấn.
- `maxPrice`: `/^\d{1,12}$/` -> number; `0` -> `undefined`; khác (`-5`, `abc`, `1.5`) -> 422 `maxPrice`. `available`: `'true'` | `'false'` (khác -> 422); `false` -> `undefined`.
- `q`: trim + gộp khoảng trắng + NFC; > 100 ký tự -> 422 `q`; rỗng -> `undefined`; `foldVi`; tách từ.
- `sort`: enum, mặc định `featured`, sai -> 422 `sort`. `page`: `^\d+$`, 1..10000, mặc định 1. `limit`: `^\d+$`, 1..48, mặc định 24 (`0`, `49`, `1.5`, `abc`, `1e1` -> 422 đúng `field`).
- `ids`: tách `,`; > 48 phần tử (đếm trước khi loại) -> 422 `ids`; phần tử không phải UUID bị bỏ êm; nếu `ids` có mặt mà không còn id hợp lệ -> trang rỗng.
- Đường dẫn: `slug` -> `decodeURIComponent` an toàn (lỗi giải mã -> 404), trim, `toLowerCase()`; không khớp `^[a-z0-9]+(-[a-z0-9]+)*$` hoặc dài quá 80 hoặc ngắn hơn 3 -> `404 not-found` (không 422, không truy vấn). `category` bảng size ngoài 4 slug -> 404. `productId` đánh giá: không kiểm, trả `[]`.

### Truy vấn và sắp xếp
```ts
const variantCond = { ...(size && { size }), ...(color && { colorName: { equals: color, mode: 'insensitive' } }), ...(available && { inventoryQty: { gt: 0 } }) };
const where = {
  status: 'ACTIVE',
  ...(categoryId && { categoryId }), ...(gender && { genders: { has: gender } }), ...(moment && { moments: { has: moment } }),
  ...(maxPrice && { price: { lte: maxPrice } }), ...(ids && { product_id: { in: ids } }),
  AND: tokens.map((t) => ({ searchText: { contains: escapeLike(t) } })),
  ...(Object.keys(variantCond).length && { variants: { some: variantCond } }),
};
const ORDER = {
  featured:    [{ displayOrder: 'asc' }],
  newest:      [{ createdAt: 'desc' }],
  'price-asc': [{ price: 'asc' }], 'price-desc': [{ price: 'desc' }],
  bestselling: [{ salesRank: 'asc' }],
};
orderBy: [...ORDER[sort], { slug: 'asc' }]   // BR-CAT-07: hoà bằng slug, slug unique nên thứ tự toàn phần
const [total, rows] = await prisma.$transaction([
  prisma.product.count({ where }),
  prisma.product.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit,
    include: { variants: { orderBy: { sortOrder: 'asc' } } } }),
]);
```
`getProductBySlug`: `findFirst({ where: { slug, status: 'ACTIVE' }, include: { variants } })`; null -> `Errors.notFound()`. Slug danh mục lấy từ `categoryCache` (một truy vấn mỗi 300 giây hoặc khi gặp `category_id` lạ), không `include` quan hệ. `getSizeChart`: slug -> id qua cache, rồi `sizeChart.findUnique`; thiếu -> 404.

### Mapper và header
- `price` = `Number(decimal)`; `compareAtPrice` chỉ khi có và > `price`; bỏ `badge` / `colorMedia` khi null / rỗng (contract `additionalProperties: false`, không trả `null`); `createdAt` = `YYYY-MM-DD` (từ cột `date`, cắt `toISOString().slice(0,10)`); `type` = `typeLabel`; `category` = slug; `mediaId` = `coverMediaId`; `gallery` = `galleryMediaIds`; `fit = { summary, model }`; `variants[]`: `inventory = inventoryQty`, `color = { name, hex }`, `stockStatus` = 0 OUT_OF_STOCK / 1..5 LOW_STOCK / >= 6 IN_STOCK. Phản hồi `page` / `limit` echo.
- Controller đặt `Cache-Control` theo contract (`public, max-age=10` danh sách / chi tiết / đánh giá; `public, max-age=3600` size chart). ETag do Express tạo; `If-None-Match` khớp -> 304. Không `Set-Cookie`.
- Không log tham số `q` hay slug thô.

### Giới hạn tần suất (BR-CAT-19)
`catalog-rate-limit.ts`: Map<ip, {count, windowStart}> trong RAM, cửa sổ cố định 60 giây, 120 yêu cầu (đếm mọi yêu cầu vào `/products*`, `/size-charts*`, kể cả lỗi 404); vượt -> `Errors.rateLimited(secondsLeft)` với `secondsLeft` trong 1..60 (đã có `Retry-After`). Bộ đếm riêng, không dùng bảng `auth_rate_limits`, không ảnh hưởng bộ đếm auth. Dọn Map định kỳ (> 5 phút không dùng). Hạn chế: mỗi instance đếm riêng (chấp nhận). `/health` không tính. IP lấy từ `req.ip` (đã có `trust proxy`).

## 5. Test (vitest + supertest, DB cục bộ)

Chốt chặn như Slice 1: `test/setup.ts` gọi `forceTestEnv()`; mọi thao tác xoá gọi `assertLocalTestDb()` trước. Thêm `resetCatalog()` ở `test/helpers.ts`: `assertLocalTestDb()` -> `TRUNCATE "product_variants","products","size_charts","categories" RESTART IDENTITY CASCADE` -> `seedCatalog(prisma)`. Không thêm các bảng này vào `resetState()` auth. Test chỉ đọc seed một lần ở `beforeAll`; test sửa dữ liệu (nháp, tồn kho, sản phẩm T) gọi `resetCatalog()` ở `beforeEach`. Đồng hồ giả (`useClock`) cho giới hạn tần suất.

Dữ liệu kỳ vọng suy từ seed (khớp PRD mục 5): nam = {the-everyday-blazer, nine-to-fine-shirt, the-straight-trousers, weekend-shirt, city-vest}; nữ có after-hours-dress; dresses = 1; maxPrice 589999 = 2, 590000 = 3, 500000 = 1.

Test phía BE ánh xạ AC-CAT (AC chỉ có phần FE/E2E ghi ở dưới bảng):
| Mã test | Nội dung | AC-CAT |
| --- | --- | --- |
| T-CAT-01 | 8 slug: chi tiết 200, `price` số nguyên đúng bảng giá, `category`/`moments`/`genders` hợp lệ, after-hours-dress có `compareAtPrice` 1.090.000 | 01 |
| T-CAT-02 | Ràng buộc DB: slug trùng / chữ hoa / `price` 0 / `compareAtPrice <= price` / `moments` rỗng bị từ chối, 0 bản ghi mới | 02 |
| T-CAT-03 | T1 DRAFT, T2 ARCHIVED khớp "thu": không có trong danh sách, `total`, `q`, `ids`; chi tiết cả hai 404 `not-found` | 03 |
| T-CAT-04 | 64 biến thể, 8 mỗi sản phẩm, `sku` duy nhất, `size` hợp lệ, `hex` đúng dạng | 04 |
| T-CAT-05 | Biến thể trùng (sản phẩm, màu, size) / `sku` trùng / `inventory_qty = -1` bị từ chối | 05 |
| T-CAT-06 | `stockStatus` với tồn 0, 1, 5, 6 = OUT_OF_STOCK, LOW_STOCK, LOW_STOCK, IN_STOCK | 06 |
| T-CAT-08 | Seed vào DB trống: 8 sản phẩm, 64 biến thể, 4 bảng size, nội dung bằng JSON nguồn (cũng bằng `products.ts` khi chạy script export), 0 đánh giá | 08 |
| T-CAT-09 | Hạ tồn một biến thể về 2 rồi seed lại: vẫn 2; vẫn 8 / 64; `product_id` / `variant_id` không đổi giữa hai lần seed; đổi `status` sang DRAFT rồi seed lại vẫn DRAFT | 09 |
| T-CAT-10 | Seed bị ngắt (inject lỗi ở sản phẩm thứ 5, ví dụ slug vi phạm CHECK) trên DB trống: 0 dòng ở cả 4 bảng; chạy lại sau khi bỏ lỗi: đủ 8 | 10 |
| T-CAT-11 | `gender=nam` (không có after-hours-dress, mọi item có `nam`); `nu` (có after-hours-dress) | 11 |
| T-CAT-12 | `category=dresses` -> 1 sản phẩm, `total` 1 | 12 (API) |
| T-CAT-13 | `moment=event` -> mọi item có `event`, gồm after-hours-dress | 13 (API) |
| T-CAT-14 | `size=XL` -> 8; `size=XL&available=true` -> `items: []`, `total` 0; `available=true` -> 8 | 14 (API) |
| T-CAT-15 | `maxPrice` 589999 / 590000 / 500000 / 0 -> 2 / 3 / 1 / 8 | 15 |
| T-CAT-16 | T có Đen/S=0 và Trắng/S=3: `color=Đen&size=S&available=true` không trả T; `color=Trắng&...` trả T | 16 |
| T-CAT-17 | `category=xyz` -> 200 `total` 0; `maxPrice=-5`, `abc`, `1.5` -> 422 `field: maxPrice`; thêm `gender=x`, `moment=x`, `size=x`, `color=x` -> 200 rỗng, không 500 | 17 |
| T-CAT-19 | `sort=price-asc` đầu off-duty-top 390.000, cuối the-everyday-blazer; `price-desc` ngược lại | 19 |
| T-CAT-20 | T1, T2 cùng giá: thứ tự theo `slug` tăng, hai lần gọi giống nhau; `bestselling` đầu là nine-to-fine-shirt; `newest` đầu là sản phẩm `createdAt` lớn nhất | 20 |
| T-CAT-21 | Không `sort` và `sort=featured` giống nhau theo `displayOrder` (the-everyday-blazer đầu); `sort=hot` -> 422 `field: sort` | 21 (API) |
| T-CAT-22 | `sort=price-asc&limit=3`, `page=1,2,3` -> 3, 3, 2 item, `total` 8, ghép đủ 8 không trùng | 22 |
| T-CAT-23 | `page=4&limit=3` -> 200 `items: []`, `total` 8; không tham số -> 8 item, `limit` 24 | 23 |
| T-CAT-24 | `limit=0`, `49`, `abc`, `page=0`, `1.5` -> 422 đúng `field`; `limit=48` hợp lệ; tham số lặp `limit=1&limit=2` -> 422 | 24 |
| T-CAT-25 | Chi tiết `The-Everyday-Blazer%20` -> 200 với `slug` = `the-everyday-blazer` | 25 (API) |
| T-CAT-26 | Slug không có -> 404 `not-found`, body `{error:{code,message}}` | 26 (API) |
| T-CAT-27 | Slug 300 ký tự, `..%2Fetc`, `a'b`, `%00`, `%` (giải mã lỗi) -> 404 `not-found`, không 500 / stack / SQL | 27 |
| T-CAT-29 | Mọi sản phẩm: `gallery` >= 1; `description`, `material`, `care`, `fit.summary`, `fit.model`, `looks` có mặt; không `null` ở bất kỳ đâu trong JSON (duyệt đệ quy) | 29 |
| T-CAT-30 | Đổi `price` / `inventory_qty` bằng SQL, đồng hồ giả +11 giây, gọi lại -> giá trị mới (không phụ thuộc cache máy chủ); header `max-age=10` | 30 (API) |
| T-CAT-31 | 4 bảng size 200, có `body`, `garment`, 2 mảng cột, đủ S, M, L, XL, giá trị bằng nguồn | 31 |
| T-CAT-32 | `GET /api/size-charts/shoes` -> 404 `not-found` | 32 (API) |
| T-CAT-33 | `q=BLAZER`, `q=blazer`, `q=%20%20blazer%20%20` cùng kết quả, `total` bằng nhau, có the-everyday-blazer | 33 |
| T-CAT-34 | `q=dam` = `q=đầm` (NFC) = `q=đầm` (NFD), có after-hours-dress; `q=blazer everyday` có the-everyday-blazer; `q=midi dam` (đảo thứ tự) | 34 |
| T-CAT-35 | `q` = `%`, `_`, `\`, `'`, `a'; DROP TABLE products;--` -> 200, `total` 0, bảng còn nguyên; sản phẩm T "100% cotton": `q=100%` ra T, `q=1_0` không ra | 35 |
| T-CAT-36 | `q` rỗng / toàn khoảng trắng -> 8; 100 ký tự -> 200; 101 -> 422 `field: q` | 36 |
| T-CAT-37 | `q=blazer&maxPrice=1000000` -> 0; `q=blazer&maxPrice=1300000&sort=price-asc&limit=1` -> the-everyday-blazer, `total` 1 | 37 |
| T-CAT-39 | `q=bl&limit=5` -> <= 5 item và `total` đúng (phần API của panel) | 39 (API) |
| T-CAT-41 | 30 sản phẩm ACTIVE: trang 1 có 24 item, `total` 30; trang 2 có 6, ghép đủ 30 không trùng | 41 (API, Should) |
| T-CAT-42 | `ids` 3 id (một id ngoài 24 đầu) -> 3 item; 49 id -> 422 `field: ids`; id không tồn tại, DRAFT, sai định dạng bị bỏ qua không lỗi; `ids` kết hợp `category` | 42 (Should) |
| T-CAT-43 | `GET /api/products/{id}/reviews` -> 200 `[]` (không truy vấn DB); không có `rating` trong bất kỳ sản phẩm nào; `/api/products/x/reviews/eligibility` và `/api/stock-alerts` -> 404 `not-found` | 43 (API) |
| T-CAT-44 | Cookie `n2f_sid` / `n2f_asid` giả, đã thu hồi (tạo phiên rồi thu hồi), hết hạn (đồng hồ giả) gửi kèm -> mọi endpoint catalog vẫn 200; không `Set-Cookie` | 44 (API) |
| T-CAT-45 | Không cookie: đủ 4 endpoint 200; phản hồi không chứa trường người dùng (duyệt khoá) | 45 (API) |
| T-CAT-46 | `POST /api/products`, `PUT /api/products/{slug}`, `DELETE /api/products/{slug}` (có và không `Origin`) -> 404 `not-found`; số sản phẩm và giá không đổi | 46 |
| T-CAT-47 | Đồng hồ giả: 120 yêu cầu cùng IP -> 200; thứ 121 -> 429 `rate-limited`, `Retry-After` = `retryAfterSeconds` trong 1..60; IP khác không bị ảnh hưởng; sau cửa sổ -> 200; bộ đếm auth (ví dụ `/auth/lookup`) không đổi | 47 |
| T-CAT-48 | Từng loại lỗi (`sort=hot`, `limit=0`, slug lạ, bảng size lạ, vượt tần suất, mô phỏng lỗi DB bằng `vi.spyOn(prisma.product,'findMany')` ném lỗi) có `code` riêng đúng; body không chứa stack / SQL / tên bảng; 4xx/5xx `Cache-Control: no-store` | 48 |
| T-CAT-52 | Đếm truy vấn (mục 6) | 52 (nền tảng cho đo p95) |
| T-CAT-53 | Có dữ liệu `users`, `sessions`, `auth_action_tokens` trên DB test; `migrate deploy` hai lần; số dòng các bảng đó không đổi; quét mọi file trong `prisma/migrations/20261107000400_*` không có `DROP`, `TRUNCATE`, `DELETE`, `RENAME`, `ALTER COLUMN ... TYPE`; bốn bảng catalog có `relrowsecurity = true` | 53 |
| T-CAT-60 | `foldVi` đơn vị: `Đầm`->`dam`, `ĐÀ NẴNG`->`da nang`, NFD = NFC, `'  Áo   sơ  mi '`->`ao so mi`; `search_text` mọi sản phẩm seed = `foldVi(name + ' ' + type)` | hỗ trợ 33, 34 |
| T-CAT-61 | Headers: danh sách / chi tiết / đánh giá `public, max-age=10`; size chart `public, max-age=3600`; có `ETag`, `If-None-Match` -> 304; route lạ `/api/khong-co` -> 404 `not-found` (thay test cũ chờ `validation`) | 30, 48 |

AC không thuộc test BE (FE / Playwright / thủ công, ghi để QA không thiếu): 07 (PDP "Chỉ còn N"), 12/13/14 phần trang, 18 (URL state), 21 phần FE chuẩn hoá, 25 phần `replaceUrl`, 26/28/32 phần hiển thị, 38, 39 (phần debounce / hủy yêu cầu cũ), 40, 41/42 phần giao diện, 43 phần giao diện, 44 phần header / không chuyển hướng, 49, 50, 51; AC-CAT-52 đo p95 trên Supabase bằng script tay (mục 6).

## 6. Hiệu năng (BR-CAT-22, AC-CAT-52)

- Danh sách: `count` + `findMany` sản phẩm + 1 truy vấn biến thể (Prisma tải `include` bằng `WHERE product_id IN (...)`) = **3 truy vấn**, độc lập với số sản phẩm trong trang (không N+1); slug danh mục từ cache RAM (1 truy vấn thêm mỗi 300 giây). Chi tiết: 2 truy vấn. Size chart: 1. Đánh giá: 0.
- T-CAT-52 (cần client test ghi truy vấn): danh sách <= 3 truy vấn khi cache danh mục nóng (<= 4 khi nguội); chi tiết <= 2; size chart <= 1; số truy vấn với `limit=1` bằng với `limit=8`.
- Pooler Supabase cổng 6543 (pgbouncer transaction mode): `$transaction([...])` dạng mảng dùng được. Transaction tương tác của seed nên chạy qua `DIRECT_URL` (5432) hoặc chấp nhận pooler; nếu pooler báo lỗi prepared statement thì dùng `DIRECT_URL` cho seed.
- Cache HTTP 10 giây + ETag; payload tối đa 48 sản phẩm x 8 biến thể (< ~120 KB, nén nếu proxy bật).
- Đo AC-CAT-52 (Should): script tay `backend/scripts/bench-catalog.ts` (không chạy trong CI) sinh 100 sản phẩm T trên Supabase (đặt tên slug `bench-*`, dọn sau), gọi danh sách mặc định và chi tiết 50 lần, in p95 đo ở máy chủ (log thời gian xử lý). Nếu tìm kiếm chậm thì thêm `pg_trgm` (1.1); nếu sắp xếp chậm thì thêm index `(status, price, slug)` / `(status, created_at, slug)`.

## 7. Thứ tự làm

1. Orchestrator duyệt hợp đồng catalog và các câu hỏi mục 9.
2. `not-found`: `errors.ts`, `error.ts`, sửa test 404 cũ (T-CAT-61). `npm run typecheck`, `npm test`.
3. Schema Prisma + migration `20261107000400_catalog_schema` trên DB cục bộ (mục 2); `migrate diff` rỗng; `npm test` áp được migration.
4. `lib/text.ts` + T-CAT-60.
5. Export JSON + `seed-catalog.ts` + T-CAT-02, 04, 05, 08, 09, 10.
6. Module catalog: schemas, mapper, service, controller, routes, gắn vào `app.ts`; thứ tự `size-charts` -> `products/:slug` -> reviews `[]` -> `products` (lọc, sắp xếp, phân trang, `q`, `ids`); test T-CAT đi cùng.
7. Rate limit, header cache, đếm truy vấn: T-CAT-47, 52, 61.
8. `npm run typecheck`, `npm run build`, `npm test` (3 lần liên tiếp do M2). Báo kết quả thật. Cập nhật `openapi.yaml` nếu lệch; đề xuất `locked` trong `docs/handoff.md`.
9. `migrate deploy` + `seed:catalog` lên Supabase theo yêu cầu của Orchestrator / Thắng; kiểm bằng `curl` 4 endpoint; chạy bench (AC-CAT-52).
10. Giao danh sách việc FE (mục 8).

## 8. Điểm FE phải đổi để khớp hợp đồng

1. **Tham số `search` -> `q`:** `HttpCatalogApi.list` đang gửi `{...query}` nên key là `search`; ánh xạ sang `q`.
2. **Phân trang:** `CatalogQuery` thêm `page` (nội bộ, không vào URL) và `limit`; `ProductPage` thêm `page`, `limit`; `mapProductPage` giữ các trường mới. Panel tìm kiếm gửi `limit=5`; dải Home / giỏ gửi `limit` <= 12 (hiện lấy hết rồi tự `slice`); tiêu đề PLP đếm theo `total` (hiện `items.length`); "Xem thêm" (Should, BR-CAT-15) nối trang kế, đổi bộ lọc về trang 1.
3. **Bỏ tham số rỗng / `false` / `0`** khi dựng `HttpParams` (BE dung sai nhưng URL sạch hơn).
4. **`get(slug)`:** `404 not-found` -> `undefined` (trang "không tìm thấy"), lỗi khác (mạng, 5xx, 429) -> lỗi (C5, AC-CAT-26, 28). Slug gửi nguyên, BE chuẩn hoá chữ hoa / khoảng trắng; FE đã chuyển hướng `replaceUrl` khi slug khác.
5. **Wishlist:** gọi `list({ ids })` (<= 48) thay vì lọc client trên trang đầu (BR-CAT-16, Should).
6. **Chế độ HTTP ẩn đánh giá (BR-CAT-17):** không gọi `reviewEligibility`, `submitReview`, `notifyBackInStock`; `reviews()` gọi `GET /products/{id}/reviews` (trả `[]`) hoặc bỏ gọi; ẩn khối điểm sao, đánh giá mẫu, form đánh giá, "Báo khi có hàng". `rating` vắng nên thẻ không có số sao.
7. **Id:** `Product.id` và `ProductVariant.id` thành UUID. `SAMPLE_REVIEWS`, đồng thời wishlist (`n2f.wishlist.v1`) và giỏ lưu local dùng id cũ: bỏ qua êm id không còn (C8). Checkout mock vẫn tra `PRODUCTS` theo `slug + color + size` (C10); đơn mock không đổi tồn kho DB.
8. **`stockStatus`:** `ProductVariant` thêm trường; PDP có thể dùng thay cho ngưỡng 5 tự tính (`lowStock` hiện `inventory <= 5`, đã khớp).
9. **Cờ cấu hình:** thêm `catalogMode: 'mock' | 'http'` vào `ApiConfig` (như `authMode`, BR-CAT-21); `CATALOG_API` chọn adapter theo cờ này, không theo `mode`. Ở `http`, mọi chỗ đọc `PRODUCTS` trực tiếp (dải Home, giỏ, mock inventory dùng cho hiển thị, `admin-seed`) không được dùng làm nguồn hiển thị catalog.
10. **Lỗi bảng size** (C11): `sizeChart(...).subscribe` cần xử lý lỗi và cho thử lại.
11. **429 / lỗi mạng ở PLP:** trạng thái lỗi có nút thử lại giữ nguyên bộ lọc trên URL (đã có `retry$`).
12. `createdAt` giữ `YYYY-MM-DD`; `salesRank` vẫn có. Không đổi kiểu.
13. Tìm kiếm theo từ độc lập thứ tự (C6): kiểm lại số kết quả của các từ gợi ý trong `search-suggestions.ts` và test Playwright có đếm kết quả tìm kiếm.

## 9. Rủi ro và câu hỏi mở (kèm phương án đề xuất)

PRD đã chốt: dữ liệu demo cho Slice 2, ẩn đánh giá ở chế độ HTTP, `limit` 24 / 48, rate limit 120 / 60 giây. Còn lại:
| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| Q1 | `created_at` kiểu `date` làm "Mới nhất" chỉ chính xác đến ngày | Chấp nhận (C13 giữ định dạng ngày; hoà bằng slug). Khi có Admin cần giờ chính xác thì thêm cột `published_at` timestamp ở slice sau. |
| Q2 | Cache `max-age=10`: PRD cho trễ <= 30 giây. Nếu CDN / proxy đặt trước thêm lớp cache cần ngắn hơn | Giữ 10 giây ở BE; ghi vào triển khai: không đặt cache proxy > 20 giây. |
| Q3 | Bộ đếm tần suất trong RAM (mỗi instance riêng) | Chấp nhận; bản thật nên chặn thêm ở proxy. 120 yêu cầu / 60 giây nhiều hơn mức duyệt bình thường (AC-CAT-47). |
| Q4 | "Mỗi sản phẩm ACTIVE có >= 1 biến thể" (BR-CAT-03) không có ràng buộc DB | Kiểm trong seed + test T-CAT-04; Slice Admin thêm kiểm khi chuyển trạng thái sang ACTIVE. |
| Q5 | `salesRank` là số lưu sẵn, không tính từ đơn | Chấp nhận; Slice 3 thay bằng thống kê bán. |
| Q6 | Seed lên Supabase: dữ liệu demo (giá, phân Nam / Nữ cần xác nhận kinh doanh) | Thắng đã đồng ý dùng cho Slice 2; chạy bằng lệnh riêng do Thắng chạy; thay bằng nội dung thật trước go-live (backlog "Nội dung catalog thật"). |
| Q7 | Ảnh: chỉ khoá media manifest (ảnh unDraw tạm); URL ảnh thật cần quyết nơi lưu (Supabase Storage / CDN) | Hoãn tới slice Admin / nội dung thật; khi đó mở rộng bằng trường `images[]` thêm vào (không phá FE). |
| Q8 | Thêm danh mục / khoảnh khắc mới là đổi contract (enum) | Chấp nhận ở Slice 2. |
| Q9 | Slug cũ sau khi đổi tên: không hỗ trợ (Won't trong PRD) | Hoãn tới slice Admin. |
| R1 | `migrate dev` đòi `DROP INDEX` cho index SQL tay (nếu sau này thêm `pg_trgm`) | Luôn `--create-only`, đọc SQL, xoá DROP ngoài ý muốn. |
| R2 | Postgres cục bộ 18 vs Supabase 17 | SQL chỉ dùng tính năng chung; kiểm sau `migrate deploy` bằng `curl` ở bước 9. |
| R3 | vitest crash ngẫu nhiên trên Windows (M2) | Chạy 3 lần liên tiếp hoặc trên Linux / CI theo decisions 2026-11-07. |
| R4 | Mock FE và DB có thể lệch dữ liệu (giá, tồn) khi cờ `mock` còn dùng | Mock chỉ dùng khi `catalogMode=mock`; chạy lại script export khi mock đổi. |
| R5 | `search_text` lệch khi sửa tên mà quên tính lại | T-CAT-60; mọi đường ghi (seed, Admin sau này) gọi `foldVi`. |
| R6 | `contains` của Prisma xử lý `%` / `_` khác kỳ vọng | Test T-CAT-35 (sản phẩm "100% cotton") phát hiện; có phương án `strpos` dự phòng (1.1). |
| R7 | Seed trong transaction tương tác qua pgbouncer 6543 có thể lỗi | Chạy seed bằng `DIRECT_URL`; ghi trong hướng dẫn chạy. |
| R8 | Thư viện mới | Không thêm. Dùng `zod`, `@prisma/client` đã có. `pg_trgm` (extension DB) chỉ khi cần mở rộng. |
