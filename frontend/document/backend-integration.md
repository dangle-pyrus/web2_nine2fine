# Backend Integration Contract (Proposed)

This is a proposal for integration, not an assertion that backend routes exist. Keep browser routes in `app.routes.ts` separate from endpoint URLs.

## Current Boundaries

| Operation   | Proposed endpoint                             | Request                                                                                                            | Response                                                                                 |
| ----------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Catalog     | `GET /api/products`                           | category, moment, size, color, maxPrice, available, search, sort                                                   | `ProductPage { items, total }`                                                           |
| Detail      | `GET /api/products/:slug`                     | product slug                                                                                                       | `Product` (incl. `type`, `gallery`, `fit`, `care`, `looks`)                              |
| Reviews     | `GET /api/products/:id/reviews`               | product id                                                                                                         | `ProductReview[]` (rating, fit -1/0/1, sizeBought, height)                               |
| Size chart  | `GET /api/size-charts/:category`              | category                                                                                                           | `SizeChart` (body + garment rows, cm)                                                    |
| Quote       | `POST /api/checkout/quote`                    | items, voucherCode                                                                                                 | `CheckoutQuote { pricing, voucher, voucherError, estimatedDelivery }`                    |
| Place order | `POST /api/orders` + `Idempotency-Key` header | contact, address (provinceCode/wardCode/street), note, items, paymentMethod (`cod` / `bank-transfer`), voucherCode | `OrderReceipt { orderId, status, total, paymentDueAt, bankTransfer, estimatedDelivery }` |
| Track order | `POST /api/orders/track`                      | `{ orderId, contact }` (phone or email, body only)                                                                 | `Order` (same 404 for unknown ID and wrong contact)                                      |

Types are defined in feature `models/` and `checkout-api.ts`. Transport response types currently mirror the domain for the proposed contract. Add explicit DTO types, runtime validation where needed and field/status mapping when the actual API contract arrives. Do not bypass that mapping from presentation components.

Before enabling HTTP mode, agree on pagination (`page/pageSize` or cursor), locale, money units (current fixtures use integer VND), validation errors, sorting keys, dates, nullable fields, and SKU/variant identity. Match products by internal IDs, not channel listing IDs.

## Auth / Onboarding (Proposed)

Defined in `src/app/features/auth/data-access/auth-api.ts`; the UI follows Figma frames 12:41, 43:1134, 47:1197, 43:1058 and 50:53. All requests use `withCredentials` because the backend is expected to own an HttpOnly session cookie. The client keeps only the public `AuthUser` profile in memory.

| Operation      | Proposed endpoint               | Request                                                                           | Response                    |
| -------------- | ------------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| Email lookup   | `POST /api/auth/lookup`         | `{ email }`                                                                       | `{ registered }`            |
| Send code      | `POST /api/auth/codes`          | `{ email, purpose: login \| register \| reset-password }`                         | `{ resendAfterSeconds }`    |
| Code login     | `POST /api/auth/login/code`     | `{ email, code }` (8 digits)                                                      | `AuthUser` + session cookie |
| Password login | `POST /api/auth/login/password` | `{ email, password }`                                                             | `AuthUser` + session cookie |
| Register       | `POST /api/auth/register`       | `{ email, code, firstName, lastName, birthDate?, marketingOptIn, acceptedTerms }` | `AuthUser` + session cookie |
| Reset password | `POST /api/auth/password/reset` | `{ email, code, newPassword }`                                                    | `204`                       |

Current HTTP status mapping: 401 → `invalid-credentials`, 409 → `email-registered`, 422 → `invalid-code`, 429 → `rate-limited`, anything else → `unavailable`. Replace with a structured error body once agreed. Open questions for the backend: the lookup step reveals whether an email is registered (Figma flow), so it needs rate limiting / bot protection; code expiry and attempt limits; CSRF strategy; session refresh/logout endpoint; whether registration should also set a password (Figma creates passwordless accounts; profile frame 102:1159 adds one later); guest cart/wishlist merge after login.

## Account (Proposed)

Defined in `src/app/features/account/data-access/account-api.ts` and `account-models.ts`; all calls use the session cookie (`withCredentials`).

| Area                  | Proposed endpoints                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Profile               | `GET/PATCH /api/account/profile` (`birthDate`, `phone`), `PUT /api/account/password` (`currentPassword` null for passwordless members) |
| Membership / vouchers | `GET /api/account/membership`, `GET /api/account/vouchers`                                                                             |
| Addresses             | `GET/POST /api/account/addresses`, `PUT/DELETE /api/account/addresses/:id`, `POST /api/account/addresses/:id/default`                  |
| Locations             | `GET /api/locations/provinces`, `GET /api/locations/provinces/:code/wards` (post-2025 province → ward model)                           |
| Orders                | `GET /api/account/orders`, `GET /api/account/orders/:id`, `POST /api/account/orders/:id/cancel`                                        |
| Returns               | `POST /api/account/orders/:id/returns` (`lines`, `reason`, `detail`, `photoCount`, `refundAccount`), photos to be uploaded separately  |

Rules the mock implements and the backend should own: one default and one return address per account; the first address becomes default; the default cannot be unset without choosing another; deleting the default promotes another; `pending-payment` and `processing` (Đang chuẩn bị hàng) orders can be cancelled, releasing reserved stock and refunding a paid order; a return can be requested once per `completed` order within `STORE_POLICY.returnDays` of `deliveredAt`, refund = line totals minus the proportional discount, minus `returnShippingFee` for the shopper's own reasons (fit, change of mind), plus the original shipping fee when a seller-fault return covers the whole order; COD/unpaid orders must send a bank `refundAccount`; order pricing (`subtotal − discount + shippingFee − shippingDiscount = total`) is server-authoritative. Modelled error codes: `unauthorized`, `not-found`, `invalid-password`, `not-cancellable`, `not-returnable`, `invalid-address` (the HTTP adapter does not map statuses yet). Still needed: payment initiation for pending orders, return photo upload, tracking timeline and order-history pagination.

## Homepage Content and Newsletter (Proposed)

- The home page reads `LandingContent` (`src/app/features/home/landing-content.ts`, blocks with `enabled`) through `HOME_CONTENT_API` (`GET /api/content/home`). Content references media IDs and storefront paths, never image URLs. The older `HomeContent` shape (`home-content.ts`) is no longer provided.
- `POST /api/newsletter` with `{ email, list: 'after-five-club' }` (`NEWSLETTER_API`). Needs double opt-in, consent logging and rate limiting server-side; the client never logs the email.

## Checkout Requirements Before Going Live

The existing mock demonstrates the interaction only. The HTTP adapter is deliberately not enabled for order creation by the checkout page until these contracts exist:

1. Shipping quote and server-authoritative item prices, discounts and total.
2. Reservation / inventory validation and an explicit response when quantity or price changes.
3. Idempotency key and duplicate-submit behavior.
4. Address lookup schema and required fields for current supported shipping destinations.
5. Payment initiation, pending/paid/failed/expired/refunded states and verified return handling.
6. Guest order access proof and account authorization. A browser route guard is not access control.
7. Server validation errors mapped to individual fields; preserve cart/form on failures.

Never trust client totals or interpret a payment redirect as proof of payment. Do not automatically retry order creation or payment without agreed idempotency.

## Checkout, Tracking, Reviews and Stock Alerts (Proposed)

- `POST /api/orders` now carries `note`, `invoice` (`companyName`, `taxCode` = 10 digits or 10-3, `companyAddress`, `email`) or `null`, and `acceptedTerms: true`; the server must refuse orders without it and store the policy version accepted. Email is optional for guests.
- Quote and order creation answer `409` with `{ items: [{ variantId, available }] }` when stock changed; the client caps or removes those lines.
- `POST /api/orders/track/cancel` with `{ orderId, contact }` lets a guest cancel a pending-payment or processing order after the same verification as tracking.
- `GET /api/products/:id/reviews/eligibility` returns `sign-in | not-purchased | reviewed | eligible` (+ `sizeBought`); `POST /api/products/:id/reviews` only for shoppers with a delivered order containing the product, once per product; reviews carry `verified`.
- `POST /api/stock-alerts` with `{ productId, variantId, email }`; email used once when the variant is restocked.
- Seller identity shown in the footer/help/policies lives in `src/app/core/store-info.ts` and policy text in `src/app/features/policies/policy-content.ts`; both are placeholders to be replaced by real registered details (and a CMS) before launch.

## Store Settings, Return Photos and Order Fields (Proposed)

- `GET /api/store/settings` (`STORE_SETTINGS_API`, public, read once at start-up) returns `StoreSettingsValue` (`src/app/core/store-settings.ts`: `policy`, `info`, `membership`). The built-in values show at once and stay when the request fails; footer, policies, PDP, cart and checkout read `storeSettings()`.
- `POST /api/uploads/return-photos` (multipart `file`, `AccountApi.uploadReturnPhoto`) returns a `ReturnPhoto` `{ id, url, thumbUrl, width, height }`; 413 `file-too-large`, 415 `unsupported-type`. The return request body adds `photoIds[]` (at most 5).
- Fields the client reads when present: `Order.voucherCode`, `Order.returnDays` (return window fixed at delivery), `ReturnRequest.photos`, `ReturnRequest.decision { status, decidedAt, note }` (a rejected request keeps the order `completed` and shows the note), `ProductReview.reply { body, at }`.

## Other Contracts Still Needed

- Session refresh/expiry, logout and `GET /me` session restore (auth operations above are proposed).
- Guest cart/wishlist synchronization and merge policy after login.
- Recommendations, promotions, collections and editorial content.

Auth storage, cookie/CSRF behavior, CORS and errors should be chosen with the backend. No default assumption about storing sensitive bearer tokens in localStorage.

## Mock Limitations

- Catalog includes artificial latency; errors are handled by pages but deterministic error scenarios are not yet exposed.
- Mock checkout validates requested variants/quantities against `MockInventory` (placing takes stock, cancel/expiry releases it), returns a demonstration ID and does not contact a payment provider.
- Mock orders, accounts, session, inventory, reviews and stock alerts are saved to `sessionStorage` (`n2f.mock.v1`) by `MockPersistence`, so they survive F5 in the same tab and reset when the tab closes. Wishlist persists only product IDs.
- Mock account data (`src/mocks/account-fixtures.ts`) is fictional, uses relative dates so the pending order stays payable, and lives in `MockAccountStore` together with mock auth accounts.
- Mock auth keeps accounts in memory (fixture `src/mocks/accounts.ts`), accepts one demo code for every flow and loses new accounts on reload. The mock session survives reload via `MockPersistence`; a real `/me` restore is still needed.
- No backend integration tests have run. Switch adapters only after endpoint/DTO updates and contract tests.
