# Slice 3 Cart & Checkout: kế hoạch frontend

Nguồn: `docs/product/PRD.md` (Slice 3: K1–K24, BR-CART, BR-CHK, BR-VOU, AC-CART/CHK/VOU), `docs/product/cart-checkout-business-rules.md`, `docs/api/openapi.yaml` (phần Slice 3) và `docs/api/cart-checkout-implementation-plan.md`. Khi mâu thuẫn: PRD > contract > file này > `docs/design/*` (chỉ tham khảo bố cục và microcopy).

Contract: `docs/api/openapi.yaml` (tag cart, checkout, voucher, order, locations; locked) và `docs/api/cart-checkout-implementation-plan.md` mục 8 (điểm FE phải đổi, không chép lại ở đây). Tên endpoint, trường, mã lỗi dưới đây là tên thật trong contract. Lệch plan cũ thì theo contract. Cần field/endpoint chưa có thì ghi đề xuất vào `docs/handoff.md` (mục "Đề xuất đổi contract"), không tự thêm. Mọi yêu cầu ghi gửi `X-Requested-With: n2f` và cookie phiên (đã do `core/api-interceptor.ts` thêm).

Quy ước code: `frontend/AGENTS.md`. Component không gọi HTTP; mọi thứ qua `CHECKOUT_API`, `CART_API` (mới), `ACCOUNT_API` (chỉ phần đơn). Dùng token trong `src/styles.scss` và component trong `src/app/shared/**`. Giữ visual hiện có (master plan 19–20). Không thêm thư viện.

## 0. Giả định chờ Thắng (làm theo, đổi khi có trả lời)

| # | Giả định | Hệ quả FE nếu Thắng trả lời khác |
| --- | --- | --- |
| Q1 | COMMON theo đề xuất PO: tên trạng thái `to_pay`/`to_ship`/`to_receive`/`completed`/`cancel_requested`/`cancelled`, thanh toán `pending`/`paid`/`failed`/`refunded`/`partially_refunded`; mã % làm tròn xuống 1.000 ₫ (máy chủ tính); OTP tra cứu như BR-AUTH-04..09, xem đơn 30 phút. | Chỉ đổi bảng ánh xạ trạng thái (§9) và thông số OTP (§8). |
| Q2 | Chưa có SePay: `policy.bankTransferEnabled = false` ở HTTP, nên **ẩn QR** (không hiện lựa chọn chuyển khoản, `/payment/:orderCode` báo chưa khả dụng). Đơn > `policy.codMaxTotal` (5.000.000 ₫) chưa đặt được online. | Khi bật: hiện lại lựa chọn và trang QR (lát 3.8), chỉ phụ thuộc cờ `policy.bankTransferEnabled`, không cần đổi mã FE. |
| Q3 | Địa giới 34 tỉnh/thành và phường/xã tải từ API công khai (không còn `mocks/locations.ts` ở HTTP). | Nếu chỉ 3 thành phố: danh mục API đã đủ, FE không đổi. |
| Q4 | Khách tự huỷ thẳng ở `to_ship`. | Khi có Admin: `to_ship` đổi thành "Yêu cầu huỷ" (`cancel_requested`), chỉ đổi nhãn nút và microcopy ở §9. |

## 1. Cấu hình

| File | Việc |
| --- | --- |
| `src/app/core/api-config.ts` | Thêm `checkoutMode: 'mock' \| 'http'` (mặc định `'http'`), doc comment: giỏ, báo giá, checkout, đặt hàng, địa giới, tra cứu đơn, phần đơn hàng của tài khoản. Không đổi `mode`, `authMode`, `catalogMode`. |
| `src/app/core/api-config.e2e.ts` | Thêm `checkoutMode: 'mock'` (Playwright giữ mock, AC-CHK-40). Hai file luôn cùng trường (interface lặp lại ở cả hai). |
| `src/app/app.config.ts` (quanh dòng 145–185) | `CHECKOUT_API`, `PAYMENT_SIMULATOR` chọn theo `checkoutMode`, không theo `mode`. Thêm provider `CART_API` theo `checkoutMode`. `ACCOUNT_API` đổi thành adapter ghép (§10): phần đơn theo `checkoutMode`, phần còn lại theo `mode`. |
| `HttpCheckoutApi` | Đổi thông báo lỗi và tên token sang `checkoutMode`; xoá `isMock = mode === 'mock'` ở `checkout-page.ts:69`, thay bằng `checkoutMode === 'mock'`. |

## 2. Model và adapter

Nguyên tắc: DTO API (tên COMMON, id UUID) tách khỏi model domain FE (master plan 34). Mapper nằm trong adapter; component chỉ thấy model FE.

| File | Việc | BR/K |
| --- | --- | --- |
| `src/app/core/api-error.ts` | Thêm vào `API_ERROR_CODES`: `invalid-address`, `stock-changed`, `price-changed`, `voucher-changed`, `idempotency-conflict`, `possible-duplicate`, `not-cancellable` (401 là `unauthenticated`, đã có; KHÔNG có `unauthorized`). Mở rộng `ApiErrorDetail` đúng `ErrorResponse`: `quote?: Quote`, `stockIssues?: {variantId, available}[]`, `removedVoucherCodes?: string[]`, `existingOrderCode?: string` (cùng `field`, `retryAfterSeconds` đã có); `readApiError` đọc có kiểm kiểu, bỏ qua phần sai dạng. Lưu ý interceptor hiện coi mọi 401 `unauthenticated` là hết phiên: với `/orders/{code}` và `/orders/{code}/cancel` của KHÔNG thành viên (cookie `n2f_oa` hết hạn) phải bỏ qua, không phát `SessionEvents.expired` (thêm đường dẫn vào danh sách loại trừ hoặc chỉ phát khi `AuthSession` đang đăng nhập). | K19, BR-CHK-31 |
| `src/app/features/checkout/checkout-api.ts` | Đổi `CheckoutApi` theo contract. `QuoteRequest` = `{ items:[{variantId, quantity}], voucherCodes?: string[] (≤ 2), address?: {provinceCode, wardCode}, contact?: {email?, phone?}, paymentMethod? }` (giá/tổng gửi lên bị bỏ qua). `CheckoutQuote` = `Quote`: `lines` (RefreshedLine: `unitPrice`, `requestedQuantity`, `maxQuantity`, `effectiveQuantity`, `availability` `available/low-stock/out-of-stock/discontinued`, `limitedBy` `stock/per-variant-limit`, `inventory`), `lineDiscounts`, `pricing` {subtotal, discount, shippingFee, shippingDiscount, total}, `vouchers` (VoucherApplied: `code`, `kind` `discount/free-shipping`, `label`, `amount`), `rejectedVouchers` (`code`, `reason`, `startsAt?`, `missingAmount?`, `minSubtotal?`, `categoryName?`), `shipping` {fee, freeReason `threshold/voucher/null`, addressRequired}, `estimatedDelivery` {from,to} (YYYY-MM-DD), `paymentMethods` ({method `cod/bank-transfer`, available, reason `over-limit/too-many-refusals/too-many-open-orders/not-enabled`}), `policy`. Thêm `checkVoucher(code, request)` -> `POST /vouchers/check` trả `{ result: VoucherApplied | VoucherRejection, quote }` (mã sai KHÔNG là lỗi HTTP). `placeOrder(request, idempotencyKey)` -> `POST /orders` với `PlaceOrderRequest` = `items` (quantity 1-5), `voucherCodes?`, `contact {name, phone, email}`, `address {provinceCode, wardCode, street}`, `note?`, `paymentMethod`, `invoice` (`null` = cá nhân), `acceptedTerms`, `expected {lines:[{variantId, unitPrice}], pricing}`, `confirmDuplicate?`; header `Idempotency-Key`; 201 (hoặc 200 khi gửi lại cùng khoá, header `Idempotency-Replayed`) trả `{ order }`. Bỏ `OrderReceipt` cũ, `trackOrder`, `cancelOrder` kiểu `contact`. `CheckoutError` mang `code`, `field?`, `quote?`, `stockIssues`, `removedVoucherCodes`, `existingOrderCode?`, `retryAfterSeconds?` lấy từ `readApiError`; xoá map theo status. | K6, K7, K19 |
| cùng file | `HttpCheckoutApi`: `provinces()` -> `GET /locations/provinces`, `wards(code)` -> `GET /locations/provinces/{provinceCode}/wards` (công khai, `Location {code, name}`, cache bộ nhớ). `requestLookupCode({orderCode, email})` -> `POST /orders/lookup/codes` (luôn 200 `{resendAfterSeconds}`); `verifyLookup({orderCode, email, code})` -> `POST /orders/lookup/verify` trả `Order` và máy chủ đặt cookie `n2f_oa` (HttpOnly, Path `/api/orders`, 30 phút; FE không đọc/giữ token); `getOrder(code)` -> `GET /orders/{orderCode}`; `cancel(code, reason?)` -> `POST /orders/{orderCode}/cancel`; `paymentSession(code)` -> `GET /orders/{orderCode}/payment` (chỉ khi QR bật). Mã đơn gõ tay gửi nguyên, máy chủ chuẩn hoá. Mapper `toOrder(dto)`: ánh xạ trạng thái (§9), `payment {method, label, paid}` từ `paymentStatus` + `paymentMethod`, `recipient` + `shippingAddress` -> `shippingAddress {recipient, phone, street, ward, province}`, `vouchers[0..]` -> `voucherCode`, `cancelledBy`, `timeline`, `canCancel`, `willCallToConfirm`. | K13, K16 |
| `src/app/features/cart/data-access/cart-api.ts` (mới) | `CartApi` + `CART_API` + `HttpCartApi` (chỉ cho thành viên, khách không gọi): `get()` -> `GET /cart` (`CartView {lines, policy, expiresAt}`); `addLine(variantId, quantity)` -> `POST /cart/lines`; `setQuantity(variantId, quantity)` -> `PUT /cart/lines/{variantId}`; `removeLine(variantId)` -> `DELETE /cart/lines/{variantId}`; `changeVariant(variantId, toVariantId)` -> `POST /cart/lines/{variantId}/change-variant`; `merge(lines)` -> `POST /cart/merge` kèm `Idempotency-Key`, trả `{cart, mergedVariantIds, skippedVariantIds, addedCount, evicted:[{variantId, productId, quantity}]}`. Các thao tác ghi trả `{cart, notice}` với `notice.code` `stock-limit/per-variant-limit/merged` (+ `variantId`, `adjustedTo`) để hiện câu BR-CART-02/05. Khách làm tươi giá/tồn bằng `POST /checkout/quote` (debounce 300 ms). | K1, K2 |
| `src/mocks/mock-cart-api.ts` (mới) | Mock `CartApi` đúng hình dạng `CartView`/`CartMutated`/merge ở trên; dùng `MockInventory` và `PRODUCTS`. Phải mô phỏng được giá đổi, tồn giảm, hết hàng, `discontinued` (Playwright mock kiểm AC-CART-08/09). | — |
| `src/mocks/mock-checkout-api.ts` | Nhận `voucherCodes` (mảng <= 2), trả `vouchers`/`rejectedVouchers` với `reason` đúng enum `VoucherReason`, `checkVoucher`, lỗi `CheckoutError` theo `code` mới (`price-changed`, `voucher-changed`, `stock-changed` kèm `quote`/`stockIssues`/`removedVoucherCodes`) bằng cờ lỗi cho test, `provinces()/wards()` đọc `mocks/locations.ts`, `requestLookupCode/verifyLookup` (OTP mock cố định, gợi ý "Bản trải nghiệm"). Hành vi mock hiện có (QR 15 giây, đơn mock) giữ nguyên để Playwright cũ không giảm số pass. | AC-CHK-40 |
| `src/app/features/orders/order-models.ts` | KHÔNG thêm `cancel-requested` ở Slice 3. `Order.id` = mã đơn `N2F…` (dùng cả cho đường dẫn API và URL FE, không có UUID đơn). `OrderItem` thêm `variantId?` (Mua lại/Đặt lại, BR-CHK-24 Should), `lineDiscount?`. Thêm `canCancel?: boolean`, `willCallToConfirm?: boolean`, `cancelReason?`. | K13 |
| `src/app/features/account/data-access/account-api.ts` | Tách `listOrders/getOrder/cancelOrder` ra `OrdersApi` (§10). `listOrders({page, limit: 10})` -> `GET /orders?page=&limit=` trả `OrderPage {items, total, page, limit}`; "Xem thêm" khi số đơn đã tải < `total`. | K20, BR-CHK-27 |

## 3. Giỏ hàng

Một `CartState` duy nhất (không đổi API công khai mà component dùng: `lines`, `count`, `subtotal`, `message`, `checkoutIds`, `checkoutLines`, `add`, `quantity`, `adjust`, `changeVariant`, `remove`, `removeMany`, `clearCheckedOut`), bên trong có hai nguồn lưu.

### 3.1 Model dòng (`src/app/features/cart/cart-state.ts`)

- `CartLine` giữ các trường hiện có, thêm: `saleStatus: 'ACTIVE' | 'SOLD_OUT' | 'UNAVAILABLE'` (mặc định `'ACTIVE'`), `priceChange?: {from: number; to: number}`, `maxQuantity` (= min(5, tồn)), `addedAt`/`updatedAt` (ISO, để gộp và chuyển Yêu thích dòng cũ nhất), `limitReason?: 'stock' | 'limit'`.
- Đổi khoá `CART_KEY` từ `n2f.cart.v1` lên `n2f.cart.v2`; `isCartLines` chấp nhận dòng v1 thiếu trường mới bằng giá trị mặc định (không bỏ dữ liệu). Id cũ `01-0-S` (không phải UUID, ở HTTP) → `saleStatus: 'UNAVAILABLE'` khi làm tươi, hiện "Sản phẩm không còn kinh doanh", chỉ còn nút Xoá (K23, AC-CART-09). Không viết mã tương thích.
- Hằng số hạn mức (5, 20, 30, 30 ngày, phí 30.000, ngưỡng 1.000.000, COD 5.000.000) KHÔNG hard-code ở component: ở HTTP đọc từ `policy` (`maxPerVariant`, `maxItemsPerOrder`, `maxCartLines`, `shippingFee`, `freeShippingThreshold`, `codMaxTotal`, `bankHoldMinutes`, `bankTransferEnabled`, `cartRetentionDays`) của `GET /cart` và `POST /checkout/quote`, thay `core/store-policy.ts`; ở mock lấy từ `core/store-policy.ts`. Giữ `policy` mới nhất trong `CartState.policy` (signal).

### 3.2 Hai nguồn lưu và gộp

| Tình huống | Hành vi |
| --- | --- |
| Khách (chưa đăng nhập) | Giỏ trong `localStorage` `n2f.cart.v2` như hiện nay; không gọi API giỏ (`/cart*` cần phiên); làm tươi giá/tồn bằng `POST /checkout/quote` khi mở `/cart` và sau mỗi thay đổi (debounce 300 ms, BR-CART-08); `quote.lines[].unitPrice` so với bản chụp cục bộ để hiện "Giá đã thay đổi từ X₫ thành Y₫". |
| Thành viên | Nguồn thật là giỏ máy chủ. `CartState` giữ bản sao trong signal, KHÔNG đọc `localStorage` làm nguồn chính; mỗi thao tác gọi `CartApi` (`POST /cart/lines`, `PUT`/`DELETE /cart/lines/{variantId}`, `POST .../change-variant`), phản hồi `{cart, notice}` ghi đè bản sao; `GET /cart` khi mở app (sau `AuthSession.restore()`) và khi mở `/cart`. Hiện `notice` (`stock-limit`, `per-variant-limit`, `merged`). `baseline` = map `variantId -> quantity` của lần đồng bộ máy chủ gần nhất, ghi cùng bản sao vào `localStorage` `n2f.cart.v2` (làm bản lưu khi mất mạng: hiện bản lưu + "Chưa cập nhật được giá mới nhất"). |
| Đăng nhập/đăng ký khi đang có giỏ khách | Khi `AuthSession` chuyển sang đã đăng nhập và giỏ cục bộ có dòng chênh so với `baseline`: gọi `POST /cart/merge` **chỉ với phần chênh** `lines = max(0, local - baseline)` mỗi dòng (không gửi lại phần đã đồng bộ), kèm `Idempotency-Key` sinh trước khi gọi và lưu (`n2f.cart.merge.pending`) để Thử lại cùng khoá. Thành công: bản sao = `cart` trả về, `baseline` = giỏ máy chủ, chỉ `mergedVariantIds` được chọn (`checkoutIds`), báo một lần "Đã thêm {addedCount} sản phẩm từ giỏ hàng trước khi đăng nhập." (không báo khi `addedCount = 0`), `skippedVariantIds` (không còn kinh doanh) bỏ qua, `evicted` (`variantId`, `productId`, `quantity`; vượt 30 dòng) chuyển vào Yêu thích trên thiết bị qua `WishlistState` theo `productId`. Lỗi mạng/5xx: giữ giỏ khách + cờ pending, thử lại ở lần tải trang kế tiếp (cùng khoá, máy chủ trả lại kết quả cũ kèm `Idempotency-Replayed`, không nhân đôi). 409 `idempotency-conflict`: sinh khoá mới sau khi tính lại phần chênh (AC-CART-13..15). |
| Đăng nhập ngay tại checkout (BR-CART-11) | Trước khi chuyển sang đăng nhập, lưu `checkoutIds` + dữ liệu form vào `sessionStorage` (`n2f.checkout.resume`). Sau gộp, `checkoutIds` = các dòng khách đã chọn lúc đó (không thêm dòng cũ của tài khoản), quay lại `returnUrl=/checkout`, khôi phục form (AC-CART-16). |
| Đăng xuất chủ động (BR-CART-12, K3) | `AuthSession.logout()` thành công → `CartState.clearDeviceCart()`: `lines = []`, xoá `n2f.cart.v2`, xoá `checkoutIds`; badge về 0. Giỏ vẫn ở tài khoản. Sửa văn bản kế thừa BR-AUTH-32 chỉ ở đường đăng xuất chủ động. |
| Hết phiên / bị thu hồi (`SessionEvents.expired`) | Giữ giỏ đang hiện (bản sao + `baseline` ghi xuống `localStorage` `n2f.cart.v2`). Từ lúc đó hành xử như khách (không gọi `/cart*`); dòng khách thêm sau đó chỉ là phần chênh so với `baseline`. Đăng nhập lại: `POST /cart/merge` chỉ gửi phần chênh, nên phần đã có không nhân đôi (AC-CART-18). Đăng nhập tài khoản KHÁC: coi `baseline` = rỗng và gửi toàn bộ giỏ cục bộ như giỏ khách thường. |
| Cookie phiên hỏng khi gọi API giỏ | `401 unauthenticated` -> interceptor phát `SessionEvents.expired`; hiện bản lưu, không mất dòng (AC-AUTH-68). |
| Hết hạn 30 ngày | Khách: ghi `updatedAt`; khi đọc `localStorage`, nếu `updatedAt` > 30 ngày thì bỏ (AC-CART-12). Thành viên: máy chủ lo, FE hiển thị giỏ rỗng. |

### 3.3 `src/app/features/cart/cart-view.ts` (972 dòng)

| Việc | AC/BR |
| --- | --- |
| Làm tươi khi mở và sau thay đổi (debounce 300 ms, gộp nhiều thao tác thành 1 request; bấm "+" 5 lần/1 giây → 1 request). Trạng thái `refreshing` (skeleton nhẹ trên giá, không xoá bản lưu), `refreshError` (banner "Chưa cập nhật được giá mới nhất" + nút Thử lại, khoá Thanh toán). | AC-CART-10 |
| Dòng theo `saleStatus`: `SOLD_OUT` mờ, nhãn "Đã hết hàng", bỏ chọn, không chọn lại được, giữ trong giỏ, cho đổi size; `UNAVAILABLE` hiện "Sản phẩm không còn kinh doanh" + chỉ nút Xoá. Thay hành vi `applyStock` xoá dòng hết hàng. | AC-CART-09, K5 |
| Giá đổi: dòng hiện "Giá đã thay đổi từ X₫ thành Y₫"; banner đầu giỏ "Một số sản phẩm đã thay đổi giá hoặc tình trạng hàng. Vui lòng kiểm tra trước khi thanh toán." Tồn < số lượng: tự giảm + "Chỉ còn N sản phẩm cho màu, size này." | AC-CART-08, 09 |
| Nút "+" khoá khi đạt `maxQuantity`, câu theo `limitReason`: "Chỉ còn N sản phẩm cho màu, size này." / "Mỗi đơn mua tối đa 5 sản phẩm cùng màu, size. Cần mua số lượng lớn, vui lòng gọi hotline." Hotline lấy từ `store-info.ts`. | AC-CART-02 |
| Chặn dòng 31: "Giỏ hàng tối đa 30 sản phẩm khác nhau." (ở `CartState.add`, trả `false` + `message`). Đổi câu "Bạn đã chọn hết số lượng còn lại…" cho khớp BR-CART-02. | AC-CART-04 |
| Chọn dòng: giữ chế độ chọn. Tạm tính, thanh free-ship, hạn mức 20 sản phẩm và `checkoutIds` chỉ theo dòng chọn; vượt 20 → khoá Thanh toán + "Mỗi đơn tối đa 20 sản phẩm."; không chọn dòng nào hoặc chỉ chọn dòng hết hàng → khoá. | AC-CART-05, 07 |
| Đổi màu/size: gộp dòng theo BR-CART-05; câu "Đã gộp với sản phẩm cùng màu, size có sẵn trong giỏ." (+ "Số lượng được điều chỉnh còn N."); dòng gộp được chọn nếu một trong hai đang chọn; size hết hàng bị khoá (dùng `stockStatus` của catalog). Sửa `CartState.changeVariant` cho khớp (`selected`). | AC-CART-06 |
| Giỏ chỉ có Tạm tính + thanh free-ship: "Mua thêm X₫ để được miễn phí giao hàng" / "Đơn được miễn phí giao hàng"; ngưỡng từ máy chủ. Ẩn mọi ô voucher/phí/tổng nếu còn ở giỏ. | AC-CART-19 |
| "Hoàn tác" xoá dòng 5 giây (Should): snackbar có `aria-live`, giữ dòng cũ đúng số lượng và trạng thái chọn. | AC-CART-20 |
| Dải gợi ý ở `cart-view.ts:888`: giữ (đã có `limit` từ Slice 2). | — |
| Giỏ rỗng, đang tải giỏ máy chủ lần đầu (skeleton), lỗi tải giỏ máy chủ (banner + Thử lại, không hiện "giỏ rỗng" giả). | — |

## 4. Checkout (`src/app/features/checkout/checkout-page.ts`, `.html`, `.scss`)

Một trang, 4 phần (Liên hệ → Địa chỉ → Vận chuyển → Thanh toán), tóm tắt đơn luôn hiện (BR-CHK-01). Không có dòng chọn → `Router` về `/cart`.

| Việc | AC/BR |
| --- | --- |
| Khởi tạo: `checkoutLines` từ `CartState` (sau đăng nhập tại checkout: khôi phục từ `sessionStorage`). Gọi `CartApi`/`quote` để làm tươi trước khi cho đặt. | AC-CHK-01, AC-CART-16 |
| Validation phía client (rời ô thì hiện lỗi, `aria-describedby`, vùng `aria-live`): tên 2–50 và có chữ cái; SĐT `0`/`+84` + 9 số, đầu số 03/05/07/08/09, chuẩn hoá lưu `0xxxxxxxxx`; email bắt buộc với khách, ≤ 100, đúng dạng; địa chỉ 5–200; ghi chú ≤ 250; hoá đơn công ty: tên 2–200, MST 10 số hoặc 10 số-3 số, địa chỉ 5–200, email hợp lệ; điều khoản chưa tick (không tick sẵn). Bấm Đặt hàng còn lỗi → cuộn và focus ô lỗi đầu tiên. Lỗi 422 `validation` có `field` → hiện đúng ô (bảng `field` → control). | AC-CHK-04..09 |
| Gợi ý đăng nhập khi email khách trùng tài khoản: contract không có mã riêng, nên chỉ hiện gợi ý tĩnh dưới ô email cho khách ("Đã có tài khoản với email này? Đăng nhập", link giữ form qua `n2f.checkout.resume`); không gọi API dò email. | AC-CHK-05 |
| Tỉnh/phường: `provinces()`/`wards()` từ `CheckoutApi`; đổi tỉnh xoá phường; tải phường có trạng thái loading/lỗi + Thử lại. Có địa chỉ đủ → quote lại (phí, ngày giao, COD). Chưa có: "Phí giao hàng: tính sau khi nhập địa chỉ". | AC-CHK-06 |
| Báo giá: `switchMap` (huỷ request cũ) mỗi khi đổi dòng/địa chỉ/mã/SĐT (SĐT ảnh hưởng COD)/đăng nhập-đăng xuất; debounce 300 ms; trong lúc tính: tóm tắt đơn mờ + nút Đặt hàng khoá. Lỗi báo giá: banner "Chưa tính được tổng thanh toán" + Thử lại, khoá Đặt hàng. | BR-CHK-10 |
| Tóm tắt: Tạm tính; "Giảm giá (MÃ) -X₫"; "Phí vận chuyển: Miễn phí" kèm lý do (đơn từ 1.000.000₫ / mã free-ship) hoặc số tiền; Tổng; ngày giao dự kiến "2–4 ngày làm việc" từ `estimatedDelivery`. Tổng luôn lấy từ máy chủ, không tự cộng trừ ở FE. | AC-VOU-09, BR-VOU-07 |
| Phương thức thanh toán: dựng từ `quote.paymentMethods`. COD khoá + lý do khi tổng > 5.000.000 ₫ hoặc SĐT vi phạm; mặc định COD nếu dùng được; tổng đổi làm COD hết hợp lệ → tự chuyển sang chuyển khoản (nếu bật) + báo; nếu QR tắt: không đặt được, báo lý do kèm hotline. Ở HTTP chưa có SePay: ẩn lựa chọn chuyển khoản (giả định Q2). | AC-CHK-23..25 |
| Nháp 24 giờ (Should): `localStorage` `n2f.checkout.draft.v1` (không lưu OTP/mật khẩu), `savedAt`; xoá khi đặt thành công hoặc đăng xuất; quá 24h bỏ. | AC-CHK-03 |
| Điền sẵn khi thành viên ở HTTP: họ tên, email từ `AuthSession` (sửa được). Ẩn "Địa chỉ đã lưu", "Mã của bạn" (không gọi `ACCOUNT_API.listAddresses/listVouchers` khi `checkoutMode === 'http'`). | K21, AC-CHK-39 |
| Nút Đặt hàng: khoá khi `placing()`; một cờ đồng bộ (không chỉ signal async) để bấm 2 lần trong 300 ms chỉ phát 1 POST. | AC-CHK-19 |
| Bỏ chặn `'Thanh toán hiện chưa khả dụng…'` (dòng ~291) khi `checkoutMode === 'http'`. | K22, AC-CHK-39 |

### 4.1 Voucher: 2 ô (giảm tiền + free-ship)

- UI: hai ô nhập riêng, nhãn "Mã giảm giá" và "Mã miễn phí giao hàng" (hai `FormControl`). Kiểm mã bằng `POST /vouchers/check {code, items, voucherCodes, address?, contact?}` -> `{result, quote}`: `result.applied === true` (VoucherApplied: `code`, `kind` `discount`/`free-shipping`, `label`, `amount`) hoặc `applied === false` (VoucherRejection: `reason`, tham số). Mã bị từ chối KHÔNG phải lỗi HTTP. Mã đã áp hiện dạng chip (`code`, `label`, `amount`/"Miễn phí giao hàng") với nút gỡ; FE xếp chip vào ô theo `kind` (nhập mã free-ship vào ô giảm tiền vẫn áp được và chip hiện ở slot free-ship). `voucherCodes` gửi ở `quote` và `placeOrder` là mảng <= 2 mã đã áp (1 `discount` + 1 `free-shipping`); áp mã cùng `kind` thay mã cũ (BR-VOU-01); quá 2 mã -> `422 validation` `field: voucherCodes` (FE không gửi). Sau `check` thành công, dùng `quote` trả về làm báo giá hiện hành.
- Chuẩn hoá mã: `trim` + viết hoa, giữ nguyên chuỗi người dùng gõ hiển thị trong ô khi bị từ chối.
- Lý do từ chối: enum `VoucherReason` của contract; FE ghép câu trong `src/app/features/checkout/voucher-messages.ts` (file mới, bảng `reason -> (rejection) => string`). Đúng chữ BR-VOU-04: `not-found`->"Mã giảm giá không tồn tại."; `not-started`->"Mã này áp dụng từ {startsAt}." (định dạng giờ VN); `expired`->"Mã giảm giá đã hết hạn." (gồm cả mã bị tắt); `exhausted`->"Mã giảm giá đã hết lượt sử dụng."; `login-required`->"Đăng nhập để dùng mã này."; `per-user-limit`->"Bạn đã dùng mã này đủ số lần cho phép."; `first-order-only`->"Mã chỉ áp dụng cho đơn hàng đầu tiên."; `min-spend`->"Mua thêm {missingAmount}₫ để dùng mã này (đơn tối thiểu {minSubtotal}₫)."; `shipping-already-free`->"Đơn của bạn đã được miễn phí giao hàng."; Should: `category-mismatch`->"Mã chỉ áp dụng cho {categoryName}.", `excluded-sale-items`->"Mã không áp dụng cho sản phẩm đang giảm giá."
- Lý do hiện ngay dưới ô, `role="alert"` hoặc `aria-live="polite"`; ô giữ nguyên mã gõ; tổng không đổi.
- Mã đã áp bị gỡ vì đơn đổi (BR-VOU-08): `quote.rejectedVouchers` trả `code` + `reason` của mã đó -> gỡ chip, hiện lý do dưới ô tương ứng (kể cả khi `quote` được gọi lại sau đổi số lượng/địa chỉ/đăng nhập).
- 429 `rate-limited` (có `retryAfterSeconds` <= 900) khi `check` mã: khoá cả hai ô, hiện "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút." (số phút từ `retryAfterSeconds`), tự mở khoá khi hết đếm ngược; nút Đặt hàng không bị khoá vì lý do này.
- Ở HTTP: không hiện "Mã của bạn" (ví voucher là Won't); mock giữ nguyên.

### 4.2 `Idempotency-Key` và xử lý lỗi đặt hàng

- Khoá sinh **một lần mỗi lượt đặt** (đã có `createKey()` ở `checkout-page.ts:124`; đúng định dạng contract 16-64 ký tự `A-Za-z0-9-`, ví dụ UUID v4). Gửi trong header `Idempotency-Key` của `POST /orders`. Lưu thêm vào `sessionStorage` `n2f.checkout.idem` cùng chữ ký nội dung (băm của body) để F5 giữa chừng không sinh khoá mới cho cùng nội dung. Gửi lại cùng khoá + cùng nội dung trả `200` (header `Idempotency-Replayed`) đúng đơn cũ: FE xử lý như 201.
- Giữ khoá qua mọi lần Thử lại khi nội dung KHÔNG đổi (mạng lỗi/5xx/429/timeout). Sau 409 `price-changed`, `voucher-changed`, `stock-changed` khách xem lại/sửa nên nội dung request đổi (`expected`, `items`, `voucherCodes`) -> sinh khoá mới (cùng khoá khác nội dung = `idempotency-conflict`).
- Chỉ đổi khoá khi: đặt thành công, hoặc nội dung request đổi sau khi khách sửa. Không bao giờ tự gửi lại; hiện nút "Thử lại" (AC-CHK-17, 38).
- Bảng xử lý theo `error.code`:

| `code` | Hành vi FE | Microcopy |
| --- | --- | --- |
| `price-changed` | Không tạo đơn. Lấy `error.quote` (báo giá mới), cập nhật tóm tắt; hiện từng dòng đổi "giá cũ -> giá mới" (so `expected.lines[].unitPrice` với `quote.lines[].unitPrice`), tổng cũ/mới; giữ form. Khách bấm Đặt hàng lại (khoá mới, `expected` = số mới) để xác nhận. Không tự đặt. | "Giá một số sản phẩm vừa thay đổi. Vui lòng xem lại tổng thanh toán và bấm Đặt hàng để xác nhận." |
| `voucher-changed` | Gỡ các mã trong `error.removedVoucherCodes`, cập nhật tóm tắt từ `error.quote`, giữ form. | "Mã {X} vừa hết hiệu lực. Tổng thanh toán mới là {Y}₫. Bấm Đặt hàng để tiếp tục." (Y = `quote.pricing.total`) |
| `stock-changed` | Đánh dấu từng dòng theo `error.stockIssues[{variantId, available}]` ("Chỉ còn N sản phẩm" / "Đã hết hàng" khi 0) ở tóm tắt, cập nhật từ `error.quote` nếu có; nút "Cập nhật theo số còn lại" -> đặt số lượng giỏ = `available` (qua `CartState`; `available = 0` thì bỏ chọn dòng, không xoá) rồi báo giá lại. | "Một số sản phẩm không còn đủ số lượng." |
| `idempotency-conflict` | Sinh khoá mới, báo lỗi chung, cho khách bấm lại sau khi kiểm tra. Không nên xảy ra nếu giữ khoá đúng. | "Đơn hàng đã thay đổi, vui lòng kiểm tra và bấm Đặt hàng lại." |
| `possible-duplicate` (Should) | Hộp thoại kèm `error.existingOrderCode`; "Vẫn đặt đơn mới" gửi lại với `confirmDuplicate: true` (khoá mới); "Xem đơn trước" mở tra cứu/đơn. | "Bạn vừa đặt đơn giống hệt ({mã}). Bạn vẫn muốn đặt thêm?" |
| `validation` (+`field`) | Hiện lỗi ở ô `field`, cuộn + focus. `field: acceptedTerms` → lỗi ở ô điều khoản. `field: paymentMethod` → làm tươi báo giá. | theo ô |
| `invalid-address` | Lỗi ở ô tỉnh/phường, xoá phường. Không dùng câu này cho lỗi khác (AC-CHK-37). | "Địa chỉ giao hàng chưa hợp lệ. Vui lòng chọn lại tỉnh/thành và phường/xã." |
| `rate-limited` | Khoá nút theo `retryAfterSeconds` (đếm ngược), giữ form + khoá. | "Bạn thao tác quá nhanh. Vui lòng thử lại sau {N} giây." |
| `unavailable`/mất mạng/5xx | Giữ form, giỏ, mã; nút "Thử lại" cùng khoá. | "Chưa đặt được hàng do lỗi kết nối. Đơn của bạn chưa bị mất, hãy thử lại." |
| 401/phiên hỏng | KHÔNG xảy ra ở đặt hàng (đặt như khách, AC-CHK-02). Nếu gặp ở giỏ máy chủ: giữ bản lưu. | — |

## 5. Trang đặt hàng thành công (`order-success-page.ts`, `checkout-session.ts`)

| Việc | AC/BR |
| --- | --- |
| Biên nhận lưu `sessionStorage` `n2f.checkout.receipt.<orderCode>` = `OrderReceipt.order` (mã đơn `id`, `pricing.total`, `paymentMethod`, `estimatedDelivery`, `recipient.email`, `willCallToConfirm`, `status`) ngay khi nhận 201/200; `CheckoutSession` đọc/ghi qua đó (K17). Xoá khi đóng tab (đặc tính sessionStorage). | AC-CHK-19, K17 |
| Back/F5 từ trang thành công: ở lại trang đơn vừa đặt. Guard `checkout` : nếu có biên nhận đang mở trong tab và giỏ đã mua hết → `replaceUrl` về `/order-success/:id` thay vì mở form; sau đặt dùng `router.navigate([...], { replaceUrl: true })` để Back không về form. Không có biên nhận (tab mới/hết) → khách: chuyển `/track-order?orderCode=…` điền sẵn mã; thành viên: `/account/orders/:id`. | AC-CHK-19 |
| Nội dung: mã đơn, tổng, phương thức, ngày giao dự kiến (`estimatedDelivery.from/to`), "Chúng tôi đã gửi email xác nhận tới {email}" (che một phần email), nút "Theo dõi đơn hàng" (thành viên -> `/account/orders/:id`; khách -> `/track-order?orderCode=` điền sẵn mã), "Tiếp tục mua sắm", lời mời tạo tài khoản cho khách (đơn không tự gắn). Câu COD "nine2fine sẽ gọi xác nhận trong 2 giờ làm việc" chỉ hiện khi `willCallToConfirm === true`. | AC-CHK-26, 30 |
| Sau 201: `CartState.clearCheckedOut()` (chỉ xoá dòng đã mua), xoá nháp checkout, xoá khoá idempotency. Thành viên: giỏ máy chủ cũng xoá các dòng đó (đã làm khi đặt, FE chỉ đồng bộ lại). | BR-CART-07 |
| Ở HTTP bỏ ghi chú "Bản trải nghiệm không gửi email…" (dòng 77); mock giữ. | K21 |
| Trạng thái: biên nhận mất và không tra được → trang "Không tìm thấy đơn" với link `/track-order`. | — |

## 6. Trang thanh toán QR (`payment-page.ts`)

Giả định Q2: **ẩn ở HTTP khi `policy.bankTransferEnabled === false`**. Route `payment/:orderCode` hiện "Thanh toán chuyển khoản chưa khả dụng" + link về đơn/`/track-order`; không gọi `GET /orders/{orderCode}/payment`. `PAYMENT_SIMULATOR` = `null` ở HTTP (đã có), bỏ khối "Bản trải nghiệm". Khi bật (lát 3.8): poll `PaymentSession` 5 giây (`orderId`=mã đơn, `amount`, `status` `awaiting/paid/expired`, `expiresAt`, `paidAt?`, `transferContent`, `account {bank, accountName, accountNumber}`, `qrImageUrl`, `shortfall?`), đếm ngược theo `expiresAt` của máy chủ, hiện số còn thiếu khi có `shortfall`; chỉ chủ đơn hoặc khách có cookie `n2f_oa`. Route đổi tham số `:orderId` thành `:orderCode` (đơn dùng mã đơn làm id).

## 7. Tra cứu đơn khách (`src/app/features/tracking/track-order-page.ts`)

Luồng 3 bước, một trang `/track-order` (mock giữ cách cũ; HTTP dùng luồng dưới):

1. Nhập **mã đơn** (gửi nguyên, máy chủ trim/bỏ `#`/viết hoa; cho phép `n2f…` thường và `#`) và **email đặt hàng**. Nút "Gửi mã xác minh" -> `POST /orders/lookup/codes {orderCode, email}`, luôn `200 {resendAfterSeconds}` và cùng một thông báo "Nếu thông tin khớp, chúng tôi đã gửi mã xác minh tới email của đơn hàng." Mã đơn lấy sẵn từ query `?orderCode=` (KHÔNG email/OTP trên URL).
2. Nhập **OTP** 8 số (dùng lại component/validation OTP của `features/auth/ui` và `auth-validation.ts` nếu chung được; đếm ngược gửi lại theo `resendAfterSeconds` (<= 60); hạn 10 phút) -> `POST /orders/lookup/verify {orderCode, email, code}`.
3. Đúng -> `200` trả `Order` và máy chủ đặt cookie `n2f_oa` (HttpOnly, `Path=/api/orders`, 30 phút); xem chi tiết (dùng `OrderView`), huỷ (khi `canCancel`), mở trang thanh toán (nếu QR bật). Các lần gọi sau (`GET /orders/{orderCode}`, `POST /orders/{orderCode}/cancel`) tự mang cookie, FE không giữ token. Cookie hết hạn -> `401 unauthenticated` -> quay bước 1, hiện "Phiên xem đơn đã hết hạn, vui lòng xác minh lại" (và không coi là hết phiên thành viên, xem §2 `api-error.ts`).

Sai mã/email/OTP ở bước xác minh -> `404 not-found` duy nhất -> "Không tìm thấy đơn hàng phù hợp." (không phân biệt). Nhập sai OTP quá số lần -> `code-locked`/`rate-limited` + `retryAfterSeconds`, khoá ô và đếm ngược. Bỏ cách tra bằng SĐT ở HTTP (mock giữ). `429 rate-limited` (10/15 phút) -> thông báo có thử lại, giữ dữ liệu đã nhập. Trạng thái: đang gửi (nút khoá, spinner), đang xác minh, lỗi mạng (Thử lại), thành công. Phản hồi không có `userId`.

Huỷ cho khách: nút "Huỷ đơn hàng" với `to_pay` bất kỳ lúc nào; `to_ship` theo Q4 (huỷ thẳng, có hộp xác nhận); trạng thái khác ẩn nút. Lỗi `not-cancellable` → "Đơn hàng này không thể huỷ nữa. Vui lòng liên hệ CSKH." Sau huỷ: cập nhật `Order`, hiện thông tin hoàn kho/hoàn tiền ngắn.

## 8. Đơn của thành viên

| File | Việc | AC/BR |
| --- | --- | --- |
| `src/app/features/account/orders/orders-page.ts` | Ở HTTP: `GET /orders?page=&limit=10`, nút "Xem thêm" (tải `page + 1`, nối, ẩn khi đã đủ `total`; mới nhất trước), loading/empty/error + Thử lại. Tab lọc theo `ORDER_STATUS` dùng phía client trên các trang đã tải. Không hiện phần chỉ có ở mock (trả hàng) nếu trạng thái chưa phát sinh. | AC-CHK-32 |
| `order-detail-page.ts` | `GET /orders/{orderCode}`; 404 `not-found` (đơn người khác/không tồn tại) -> trang "Không tìm thấy đơn hàng"; `401 unauthenticated` -> interceptor chuyển `/auth/login?returnUrl=%2Faccount%2Forders%2F<id>` với "Phiên đăng nhập đã hết hạn…", giỏ còn nguyên (AC-CHK-33). Nút Huỷ chỉ khi `canCancel`: hộp xác nhận -> `POST /orders/{orderCode}/cancel`; `409 not-cancellable` có câu riêng; huỷ lần hai không hoàn thêm. | AC-CHK-16, 33 |
| `order-cancellation.ts`, `order-card.ts`, `buy-again.ts` | Điều kiện huỷ lấy từ `Order.canCancel` (thay luật cục bộ ở chế độ HTTP); "Mua lại"/"Đặt lại đơn này" (Should) đưa dòng về giỏ qua `CartState.add` theo `items[].variantId`, bỏ qua sản phẩm không còn bán. | BR-CHK-24 |
| `return-request-page.ts` | Giữ mock (trả hàng thuộc slice sau); ở HTTP ẩn lối vào "Yêu cầu trả hàng" vì chưa có API. | Won't |
| `order-view.ts`, `order-items.ts`, `order-status.ts` | Hiển thị `pricing` do máy chủ trả (`subtotal − discount + shippingFee − shippingDiscount = total`), phần giảm từng dòng nếu có, nhãn voucher, địa chỉ (tên tỉnh/phường đã chốt trên đơn). Timeline dùng `timeline` của API nếu có, bỏ phần suy diễn nếu API đủ. | AC-CHK-22 |

## 9. Ánh xạ trạng thái COMMON → FE (giả định Q1)

Mapper `src/app/features/orders/order-status-map.ts` (file mới), thuần hàm, có unit test nếu hạ tầng có, không thì kiểm trong Playwright mock bằng dữ liệu mẫu.

| API `status` (+ `paymentStatus`) | `OrderStatus` FE | Nhãn | Huỷ được (khách) |
| --- | --- | --- | --- |
| `to_pay` + `pending` | `pending-payment` | Chờ thanh toán | Có (bất kỳ lúc) |
| `to_ship` + `pending` (COD) | `processing` | Đang chuẩn bị hàng; câu gọi xác nhận khi `willCallToConfirm` | Có (Q4: huỷ thẳng; `canCancel` = true) |
| `to_ship` + `paid` | `processing` | Đang chuẩn bị hàng | Có (Q4); đơn đã trả tiền hiện thêm thông tin hoàn tiền |
| `to_receive` | `shipping` ("Đang vận chuyển"); `delivering` chỉ khi API có dấu hiệu giao tới nơi (contract Slice 3 chưa có trường này, dùng `shipping`) | Đang vận chuyển | Không (`canCancel` = false; `not-cancellable`) |
| `completed` | `completed` | Hoàn tất | Không |
| `cancel_requested` | chưa có ở FE: Slice 3 KHÔNG phát sinh; nếu gặp, hiển thị như `processing` kèm nhãn "Đang chờ shop duyệt huỷ" (thêm giá trị `OrderStatus` khi làm Admin) | — | Không |
| `cancelled` | `cancelled` (+ `cancelledBy` `customer`/`shop`/`system`) | Đã huỷ | Không |
| giá trị lạ | `processing` + log cảnh báo (không vỡ trang) | — | Không |

`pending-confirmation` (COD chờ gọi xác nhận) không phát sinh ở API Slice 3: đơn COD vào thẳng `to_ship` (BR-CHK-20). Tab/nhãn trong `order-status.ts` giữ nguyên.

## 10. Tách adapter đơn hàng khỏi Account mock (K20)

- Tạo `OrdersApi` (`src/app/features/account/data-access/orders-api.ts`, mới): `list({page, limit})` -> `GET /orders`, `get(orderCode)` -> `GET /orders/{orderCode}`, `cancel(orderCode, reason?)` -> `POST /orders/{orderCode}/cancel` + `ORDERS_API` token + `HttpOrdersApi` + `MockOrdersApi` (bọc phần đơn của `MockAccountApi`). `HttpOrdersApi` dùng chung mapper `toOrder` của `checkout-api.ts` (đặt ở `features/orders/order-mapper.ts` nếu cả hai cần).
- `ACCOUNT_API` giữ cho profile/địa chỉ/voucher/hạng/trả hàng (theo `mode`). Component đơn hàng (`orders-page`, `order-detail-page`, `order-card`, `order-cancellation`, `buy-again`, `track` tab trong header nếu có) đổi từ `ACCOUNT_API` sang `ORDERS_API`. Provider `ORDERS_API` chọn theo `checkoutMode`.
- Lý do: `checkoutMode: http` + `mode: mock` phải chạy (AC-CHK-39): Profile vẫn mock, đơn là thật.

## 11. Những gì ẩn / đổi ở HTTP (`checkoutMode: http`)

- Ẩn: lựa chọn chuyển khoản/QR và `/payment/:orderCode` (Q2), "Địa chỉ đã lưu", "Mã của bạn" (ví voucher), ghi chú "Bản trải nghiệm…" (success, payment, home-club giữ nguyên vì thuộc Newsletter), tra cứu bằng SĐT, lối vào trả hàng, nút mô phỏng thanh toán.
- Đổi: họ tên + email điền từ phiên; địa giới từ API; giỏ thành viên từ máy chủ; mã đơn dạng `N2F` + 10 số.
- Không đổi: Profile, địa chỉ, hạng thành viên, Admin vẫn mock.

## 12. Trạng thái UI và microcopy

| Màn hình | Loading | Empty | Error | Disabled |
| --- | --- | --- | --- | --- |
| `/cart` | Skeleton khi tải giỏ máy chủ lần đầu; giá mờ khi làm tươi | "Giỏ hàng của bạn đang trống" + "Tiếp tục mua sắm" | Banner "Chưa cập nhật được giá mới nhất" + Thử lại; lỗi tải giỏ máy chủ riêng | Thanh toán: lỗi làm tươi, không dòng chọn, > 20 sản phẩm, có dòng chọn hết hàng/ngừng bán; "+" khi chạm mức |
| `/checkout` | Tóm tắt mờ khi báo giá; tải tỉnh/phường | Không dòng → về `/cart` | Lỗi báo giá + Thử lại; lỗi đặt theo §4.2 | Đặt hàng: đang đặt, đang báo giá, còn lỗi báo giá, `rate-limited` (đếm ngược); COD/QR không dùng được kèm lý do |
| Voucher | Nút "Áp dụng" có spinner | — | Lý do dưới ô (§4.1) | Cả hai ô khi 429 |
| `/order-success/:id` | — | Không có biên nhận → chuyển tra cứu | "Không tìm thấy đơn" | — |
| `/track-order` | Nút gửi mã/xác minh có spinner | — | "Không tìm thấy đơn hàng phù hợp."; rate-limit; lỗi mạng + Thử lại | Gửi lại OTP trong thời gian chờ |
| `/account/orders` | Skeleton, "Xem thêm" đang tải | "Bạn chưa có đơn hàng nào" | Lỗi + Thử lại; 401 → đăng nhập lại | "Xem thêm" khi đã hết |

Microcopy chính chép đúng chữ PRD (BR-CART-02/03/05/08/13/10, BR-VOU-04/09/10, BR-CHK-12). Mọi thông báo động có `aria-live` ("polite" cho thông tin, "assertive"/`role="alert"` cho lỗi chặn), nhãn `label` cho mọi ô, focus chuyển tới lỗi đầu tiên, nút khoá dùng `aria-disabled` cùng lý do đọc được khi cần (tránh `disabled` thuần cho nút Thanh toán/Đặt hàng để vẫn đọc được lý do).

## 13. Bảng file → việc → AC

| File | Việc | AC |
| --- | --- | --- |
| `core/api-config.ts`, `.e2e.ts`, `app/app.config.ts` | `checkoutMode`, provider `CART_API`/`CHECKOUT_API`/`ORDERS_API` | AC-CHK-39, 40 |
| `core/api-error.ts` | mã lỗi mới, `details` | AC-CHK-37 |
| `features/cart/data-access/cart-api.ts` (mới), `mocks/mock-cart-api.ts` (mới) | adapter giỏ | AC-CART-08..15 |
| `features/cart/cart-state.ts` | hai nguồn lưu, gộp, đăng xuất/hết phiên, v2, hạn mức, 30 ngày | AC-CART-01..04, 11..18 |
| `features/cart/cart-view.ts` | làm tươi, trạng thái dòng, thông báo, chọn dòng, Hoàn tác | AC-CART-02..10, 19, 20 |
| `features/product/product-page.ts`, `shared/commerce/product-card.component.ts` | gọi `CartState.add` có chặn hạn mức 30 dòng/5, nhắc chọn size | AC-CART-01, 04 |
| `features/checkout/checkout-api.ts` | model + HTTP adapter theo contract, địa giới, OTP, lỗi theo `code` | AC-CHK-04..13, 31, 37 |
| `features/checkout/checkout-page.ts/.html/.scss` | form, validation, báo giá, voucher 2 ô, phương thức, idempotency, lỗi 409 | AC-CHK-01..13, 17..25, 38, AC-VOU-01..12 |
| `features/checkout/voucher-messages.ts` (mới) | ghép câu lý do | AC-VOU-02..06, 09, 10 |
| `features/checkout/order-success-page.ts`, `checkout-session.ts` | biên nhận sessionStorage, Back/F5 | AC-CHK-19, 26, 30 |
| `features/checkout/payment-page.ts` | ẩn ở HTTP đến khi có QR | AC-CHK-27 (chờ Q2) |
| `features/tracking/track-order-page.ts` | mã + email + OTP, huỷ | AC-CHK-29, 31 |
| `features/account/orders/*`, `features/account/data-access/orders-api.ts` (mới) | đơn thật, phân trang, huỷ, 401/404 | AC-CHK-16, 32, 33 |
| `features/orders/order-status-map.ts` (mới), `order-models.ts`, `order-view.ts` | ánh xạ trạng thái, pricing | AC-CHK-22, 26, 28 |
| `features/auth/auth-session.ts` | hook gộp giỏ sau đăng nhập, xoá giỏ khi đăng xuất chủ động | AC-CART-13..18 |
| `features/wishlist/wishlist-state.ts` | nhận dòng tràn khi gộp > 30 dòng | AC-CART-14 |
| `mocks/mock-checkout-api.ts` | voucherCodes 2 slot, lỗi theo code, địa giới, OTP mock | AC-CHK-40 |

## 14. Test

### 14.1 Playwright (e2e build, mock)

- Giữ nguyên số pass của `tests/checkout.spec.ts`, `account.spec.ts`, `operations.spec.ts`, `commerce.spec.ts` (AC-CHK-40); cập nhật chỗ test phụ thuộc câu chữ đã đổi (giỏ hết hàng nay giữ dòng thay vì xoá, 2 ô voucher, tra cứu thêm OTP).
- Thêm `tests/cart-checkout.spec.ts` (tên test có mã AC): AC-CART-01 (chọn size), 02 (chạm mức), 03, 04 (30 dòng), 05 (20 sản phẩm), 06 (gộp khi đổi size), 07 (chọn một phần), 08/09/10 (giá đổi, hết hàng, ngừng bán, lỗi làm tươi bằng `page.route('**/api/**', abort)` nếu mock có đường gọi mạng, nếu không thì bằng cờ lỗi của `MockCartApi`), 19 (thanh free-ship), 20 (Hoàn tác); AC-CHK-04/09 (validation, cuộn tới lỗi đầu), 19 (bấm đôi = 1 đơn; Back/F5 ở trang thành công), 26, 30; AC-VOU-01, 02, 06, 09, 10, 12 (mock `voucher-changed`), 11 (khoá ô sau 10 lần sai, cờ lỗi mock); xử lý `price-changed`/`stock-changed`/`voucher-changed` bằng cờ lỗi của `MockCheckoutApi`; tra cứu mã + email + OTP đúng/sai (AC-CHK-31).
- Kiểm adapter HTTP (không có route mock): test Playwright dùng `page.route` hoặc unit test của `HttpCheckoutApi`/`readApiError`/mapper trạng thái với phản hồi mẫu theo contract (`price-changed`, `stock-changed`, `rate-limited`, trạng thái lạ). Nêu rõ cách đã kiểm trong báo cáo.

### 14.2 Kiểm thật trên backend cục bộ

Chạy BE cục bộ (`docs/implementation/slice-3-cart-checkout.md`), FE `npm run start:local`, mở `http://localhost:4200` (không dùng 127.0.0.1), `checkoutMode: 'http'`. Đi qua:

1. Khách: thêm blazer Đen/S + off-duty-top, `/cart` không gọi API giỏ máy chủ; đổi giá bằng SQL → thấy "Giá đã thay đổi" (AC-CART-08); tồn 0 → dòng mờ (AC-CART-09); chặn mạng → "Chưa cập nhật được giá mới nhất" (AC-CART-10).
2. Đăng nhập với giỏ khách → gộp, thông báo 1 lần, tải lại 2 lần không nhân đôi (AC-CART-13, 15); đăng xuất → badge 0, đăng nhập lại có 2 dòng (AC-CART-17); thu hồi phiên bằng SQL → giỏ còn (AC-CART-18).
3. Checkout khách: lỗi validation (AC-CHK-04..09), địa giới (AC-CHK-06), voucher `N2FWELCOME15` + `N2FFREESHIP` (AC-VOU-01, 06, 09), lỗi mã (AC-VOU-02), đặt COD → thành công, mã đơn `N2F` + 10 số, tồn giảm (AC-CHK-14), email trong outbox (AC-CHK-34).
4. Idempotency: chặn mạng sau khi request đi, bỏ chặn, Thử lại → cùng mã đơn (AC-CHK-17, 38); bấm đôi (AC-CHK-19); F5/Back ở trang thành công.
5. Đổi giá bằng SQL trước khi bấm Đặt → `price-changed` (AC-CHK-12); tồn giảm → `stock-changed` + "Cập nhật theo số còn lại" (AC-CHK-13); mã hết hạn → `voucher-changed` (AC-VOU-12).
6. Tra cứu `/track-order` bằng mã + email + OTP (đọc OTP trong outbox), huỷ đơn (AC-CHK-16, 29, 31); `to_receive` đặt bằng SQL → `not-cancellable`.
7. Thành viên: đặt đơn, `/account/orders` (Xem thêm), chi tiết đơn người khác 404, thu hồi phiên rồi huỷ → `/auth/login?returnUrl=…` (AC-CHK-32, 33); `/account/profile` vẫn mock (AC-CHK-39).
8. DevTools: không lỗi console, không có request `/api/cart|checkout|orders` khi `checkoutMode: mock`.

## 15. Lệnh kiểm tra (trong `frontend/`)

`npm run lint`, `npm run format:check`, `npm run build`, Playwright các spec đã đổi (`npx playwright test <spec> --trace off`); chạy riêng `checkout`, `account`, `operations`, `commerce` để đối chiếu số pass trước/sau (AC-CHK-40). Không bắt buộc chạy toàn bộ suite.
