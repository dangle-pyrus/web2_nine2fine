# nine2fine frontend

Angular commerce frontend. The authoritative product context and task ledger live in [the master plan](document/nine2fine_MASTER_PLAN.md).

## Run

Requires Node 24.15+ within the Node 24 release line (or another version supported by Angular 22).

```sh
npm ci
npm start
```

Open http://127.0.0.1:4200. To use a different port: `npm start -- --port 4201`.

```sh
npm run build
npm run lint
npm run format:check
npm test
```

Playwright defaults to the installed Microsoft Edge on Windows, Chromium elsewhere. Set `PLAYWRIGHT_CHANNEL` to override. Install Chromium with `npx playwright install chromium` on machines without a browser. Tests start a dev server on port 4200 if one is not already running. Screenshots and failure traces are written to `test-results/`.

## Implemented Slice

- Store shell with the Figma `header (1)` (Sản phẩm mới / Nam / Nữ, pill search, cart, account), real local logo, selected Reicon icons. `/shop/nam` and `/shop/nu` filter by gender.
- Catalog with category, moment, size, color, availability, price and sort in URL state.
- Search dialog with debounce, cancellation, loading and empty results.
- Product detail with gallery (thumbnails, arrows, hover zoom, mobile swipe), fit line, size guide dialog, colour/size selection with inline error, delivery/returns summary, sample reviews with fit scale, "Mặc theo cách của bạn", related products and a mobile sticky add-to-bag bar.
- Listing with Nike-style sticky header, sidebar categories, accordion filters (gender, moment, size, colour swatches, price, availability) and a persisted "Ẩn bộ lọc" toggle.
- Guest wishlist persisted locally; cart drawer/page with stock-limited quantities.
- Cart persisted in localStorage (`n2f.cart.v1`). Single-page checkout with saved addresses/vouchers for members, province → ward selection, COD or bank transfer, idempotent order placement, `/order-success/:orderId`, and guest tracking at `/track-order` (demo guest order `N2F260928010` + `0909000111`).
- Operations (2026-10-18): policy pages `/policies/:slug` (trả hàng, giao hàng, thanh toán, bảo vệ dữ liệu, điều khoản, khiếu nại) and `/help`, seller identity in the footer (`src/app/core/store-info.ts`, placeholder values); checkout with optional email, order note, VAT invoice and required terms consent; out-of-stock lines named with a one-click fix; cancel while "Đang chuẩn bị hàng" (also for guests on `/track-order`); return requests at `/account/orders/:orderId/return`; reviews only from buyers of delivered orders; back-in-stock email alerts; mock data survives F5 in the same tab.
- Shared CDK dialogs with focus trap, Escape dismissal and focus restoration.
- Mobile filter drawer and local unDraw empty/error illustrations.
- Auth onboarding from Figma: `/auth/login` (email → 8-digit code or password), `/auth/register`, `/auth/forgot-password`, with mock adapter, safe `returnUrl` and header sign-in entry. Demo account and code live in `src/mocks/accounts.ts`.
- Account area from Figma section `account-manage`: `/account/profile` (inline birthday/phone edit, change/create password dialog, membership card + spend progress), `/account/addresses` (+ `/new`, `/:id/edit`, province → ward cascade, default/return flags), `/account/orders` (status tabs in `?status=`, cancel pending order), `/account/orders/:orderId` (progress, refund, payment summary) and `/account/vouchers` (copy code). Guarded by a UX-only `accountGuard`.

This is not yet the complete master plan. `/` is the editorial homepage (hero, story, shop by moment, new drop, best sellers, USP, campaign, reviews, After Five Club) with GSAP motion that is lazy-loaded and disabled under reduced motion. Page transitions, full design-system coverage, real payment and order tracking, recommendations, promotion rules, dedicated success route and production SEO remain outstanding. Figma is now read through the local open-figma-mcp plugin bridge. Tokens (Nunito Sans, `#D9070C` CTA red, `#F6090D` logo red, neutrals) and the auth screens were audited against frames; other pages were built before that audit and still need per-frame comparison.

Product images are deliberate placeholders, not product photography. Pexels access has not been configured. Prices, stock and merchandising data are fixtures. Checkout visibly identifies itself as a demonstration. Customer form data is kept in memory and is not written to localStorage. Cart and wishlist survive refresh; mock orders, accounts and sessions survive F5 in the same tab (sessionStorage) and reset when the tab closes. No live payment or order submission is enabled.

## Architecture

`Page / component -> feature state / service -> typed API interface -> mock or HTTP adapter`

- `src/app/core/api-config.ts`: API mode and base URL.
- `src/app/features/catalog/data-access/`: catalog boundary and proposed HTTP adapter.
- `src/app/features/checkout/checkout-api.ts`: quote / order / tracking boundary and HTTP adapter (mock in `src/mocks/mock-checkout-api.ts`).
- `src/app/features/orders/`: shared order models, status mapping and `OrderView`.
- `src/mocks/`: demo product data and catalog implementation.
- `src/media/media-manifest.ts`: media identity, paths, provenance and replacement metadata.
- `src/app/features/account/`: account layout, pages and `ACCOUNT_API` boundary; mock data in `src/mocks/account-fixtures.ts` via `MockAccountStore` (shared with mock auth).
- `src/app/features/auth/`: auth pages, shared field components, session/flow state and `AUTH_API` boundary.
- `src/styles.scss`: design tokens audited from Figma and global styles.

The existing HTTP adapters express a proposed contract, not a verified backend integration. Live checkout remains disabled until shipping quotes, authoritative totals, reservation and idempotency are integrated. See [backend contract notes](document/backend-integration.md).

## Assets and Icons

Original sources stay in `asset/` and `svg/`. Angular copies only the explicitly selected assets in `angular.json`; it does not publish the entire unDraw library. Product fixture media IDs are resolved through the manifest. For replacement photography, add a media entry with a local path, dimensions, alt text and provenance, then assign its ID to a fixture. Set `temporary: false` to remove placeholder treatment.

UI icons use `@ng-icons/core` and `@ng-icons/reicon`, registered individually in `app.config.ts`. `reicon-angular@1.0.1` was inspected but removed because the published package lacked generated components and a usable entrypoint. This is still the requested Reicon icon set, not a replacement icon family.

Pexels credentials must be supplied only to local tooling via `PEXELS_API_KEY` in the git-ignored `.env`. Never put API secrets in Angular environment files, the manifest or this documentation. Refresh editorial photos with `python scripts/pexels/search_candidates.py <out-dir>` (contact sheets for curation) and `python scripts/pexels/fetch_media.py` (downloads the chosen IDs, writes WebP sizes to `public/assets/editorial/` and credits to `src/media/pexels-media.json`); requires Python 3 + Pillow. Credits are listed on the homepage and Pexels is linked in the footer.

## Verification Scope

E2E tests cover account (guard, profile edit, password change/create, address CRUD with default/return rules, order tabs/cancel/detail, new-member empty states), auth (code/password login, register validation, reset password rules, open-redirect guard), filter/back navigation, sorting, wishlist reload, variant validation, rapid quantity changes, keyboard dismissal, mock checkout, search cancellation, loaded local assets and responsive overflow. Tests and builds must pass after changes. Visual comparison to Figma, real backend error contracts, production performance and screen-reader audits are still required for final release.
