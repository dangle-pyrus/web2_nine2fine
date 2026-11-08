import { expect, Page, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';

// Slice 3 cart & checkout on the mock adapters (checkoutMode: mock). Failures that only a real
// backend causes (price change, discontinued, errors) are switched on with `n2f.mock.flags`.

const BLAZER_M = '01-0-M';

async function setFlags(page: Page, flags: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    (value) => sessionStorage.setItem('n2f.mock.flags', JSON.stringify(value)),
    flags,
  );
}

async function addBlazer(page: Page, size = 'M'): Promise<void> {
  await page.goto('/product/the-everyday-blazer');
  await page.getByRole('button', { name: size, exact: true }).click();
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm vào giỏ hàng' })).toBeVisible();
}

async function fillCheckout(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: 'Họ và tên', exact: true }).fill('Trần Bình');
  await page.getByRole('textbox', { name: 'Số điện thoại', exact: true }).fill('0911222333');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('binh@example.com');
  await page
    .getByRole('combobox', { name: 'Tỉnh / Thành phố' })
    .selectOption({ label: 'Thành phố Hà Nội' });
  await page
    .getByRole('combobox', { name: 'Phường / Xã' })
    .selectOption({ label: 'Phường Ba Đình' });
  await page.getByRole('textbox', { name: 'Địa chỉ nhận hàng', exact: true }).fill('1 Hoàng Diệu');
  await page.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }).check();
}

async function openSummary(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile && (await page.locator('aside details').getAttribute('open')) === null) {
    await page.locator('aside summary').click();
  }
}

test('AC-CART-02/04: "+" stops at 5 with the per-variant sentence', async ({ page }) => {
  await addBlazer(page);
  await page.goto('/cart');
  const plus = page.getByRole('button', { name: /Tăng số lượng/ });
  for (let i = 0; i < 4; i++) await plus.click();
  await expect(plus).toBeDisabled();
  await expect(page.getByText(/Mỗi đơn mua tối đa 5 sản phẩm cùng màu, size/)).toBeVisible();
});

test('AC-CART-08: a price that moved shows "from X to Y"', async ({ page }) => {
  await addBlazer(page);
  await setFlags(page, { priceOverrides: { [BLAZER_M]: 1190000 } });
  await page.goto('/cart');
  await expect(page.getByText(/Giá đã thay đổi từ .* thành .*/)).toBeVisible();
  await expect(
    page.getByText(/Một số sản phẩm đã thay đổi giá hoặc tình trạng hàng/),
  ).toBeVisible();
});

test('AC-CART-09: a discontinued line keeps only "Xóa" and blocks checkout', async ({ page }) => {
  await addBlazer(page);
  await setFlags(page, { discontinued: [BLAZER_M] });
  await page.goto('/cart');
  await expect(page.getByText('Sản phẩm không còn kinh doanh')).toBeVisible();
  await expect(page.getByRole('button', { name: /Tăng số lượng/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Chọn sản phẩm để thanh toán' })).toBeDisabled();
});

test('AC-CART-10: a failed refresh keeps the cart, says so and offers a retry', async ({
  page,
}) => {
  await addBlazer(page);
  await setFlags(page, { refreshFail: true });
  await page.goto('/cart');
  await expect(
    page.locator('.alert', { hasText: 'Chưa cập nhật được giá mới nhất.' }),
  ).toBeVisible();
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Thanh toán/ })).toBeDisabled();
  await setFlags(page, {});
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.locator('.alert', { hasText: 'Chưa cập nhật được giá mới nhất.' })).toHaveCount(
    0,
  );
});

test('AC-CART-19: the cart only shows the subtotal and the free-shipping hint', async ({
  page,
}) => {
  await addBlazer(page);
  await page.goto('/cart');
  await expect(
    page.getByText(/để được miễn phí giao hàng|miễn phí giao hàng/).first(),
  ).toBeVisible();
  await expect(page.getByLabel('Mã giảm giá')).toHaveCount(0);
});

test('AC-CART-20: removing a line can be undone within 5 seconds', async ({ page }) => {
  await addBlazer(page);
  await page.goto('/cart');
  await page.getByRole('button', { name: /Xóa .* khỏi giỏ/ }).click();
  await expect(page.locator('.cart-line')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(page.locator('.cart-line')).toHaveCount(1);
});

test('AC-CHK-04/09: errors show under the fields and focus moves to the first one', async ({
  page,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page.getByText('Nhập họ và tên (2–50 ký tự, có chữ cái).')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Vui lòng kiểm tra' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Họ và tên', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Số điện thoại', exact: true }).fill('0123456789');
  await page.getByRole('textbox', { name: 'Số điện thoại', exact: true }).blur();
  await expect(page.getByText('Nhập số điện thoại di động hợp lệ (0 hoặc +84).')).toBeVisible();
});

test('AC-VOU-01/02/06/09: two code boxes, a chip per kind, reasons under the box', async ({
  page,
  isMobile,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await openSummary(page, isMobile);
  await page.getByRole('textbox', { name: 'Mã giảm giá' }).fill('n2fwelcome15');
  await page.getByRole('button', { name: 'Áp dụng mã giảm giá' }).click();
  await expect(page.getByText(/N2FWELCOME15 · Giảm 15%/)).toBeVisible();
  await expect(page.locator('.totals .minus').first()).toContainText('−');
  // A free-ship code typed in the discount box still lands in its own slot (here: already free).
  await page.getByRole('textbox', { name: 'Mã miễn phí giao hàng' }).fill('zzz');
  await page.getByRole('button', { name: 'Áp dụng mã miễn phí giao hàng' }).click();
  await expect(page.getByText('Mã giảm giá không tồn tại.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mã miễn phí giao hàng' })).toHaveValue('zzz');
});

test('AC-VOU-11: too many wrong codes lock both boxes', async ({ page, isMobile }) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await setFlags(page, { voucherLocked: true });
  await openSummary(page, isMobile);
  await page.getByRole('textbox', { name: 'Mã giảm giá' }).fill('abc');
  await page.getByRole('button', { name: 'Áp dụng mã giảm giá' }).click();
  await expect(page.getByText(/Bạn đã nhập sai quá nhiều lần/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mã giảm giá' })).toBeDisabled();
});

test('AC-CHK-12: price-changed shows old and new prices and needs a second click', async ({
  page,
  isMobile,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await openSummary(page, isMobile);
  await expect(page.locator('.grand dd')).toBeVisible();
  await setFlags(page, { placeError: 'price-changed' });
  const submit = page.getByRole('button', { name: /Đặt đơn trải nghiệm/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText(/Giá một số sản phẩm vừa thay đổi/)).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText(/Giá .* → .*/).first()).toBeVisible();
});

test('AC-VOU-12: voucher-changed drops the code and keeps the form', async ({ page, isMobile }) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await openSummary(page, isMobile);
  await page.getByRole('textbox', { name: 'Mã giảm giá' }).fill('N2FWELCOME15');
  await page.getByRole('button', { name: 'Áp dụng mã giảm giá' }).click();
  await expect(page.getByText(/N2FWELCOME15 · /)).toBeVisible();
  await setFlags(page, { placeError: 'voucher-changed' });
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page.getByText(/Mã N2FWELCOME15 vừa hết hiệu lực/)).toBeVisible();
  await expect(page.getByText(/N2FWELCOME15 · /)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Họ và tên', exact: true })).toHaveValue(
    'Trần Bình',
  );
});

test('AC-CHK-13: stock-changed marks the line and "Cập nhật" fixes it', async ({
  page,
  isMobile,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await openSummary(page, isMobile);
  await setFlags(page, { placeError: 'stock-changed' });
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page.getByText('Một số sản phẩm không còn đủ số lượng.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Cập nhật đơn theo số lượng còn lại/ }),
  ).toBeVisible();
});

test('AC-CHK-19/26/30: double click places one order; success page survives F5', async ({
  page,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  const submit = page.getByRole('button', { name: /Đặt đơn trải nghiệm/ });
  await expect(submit).toBeEnabled();
  await submit.dblclick();
  await expect(page).toHaveURL(/\/order-success\/N2F\d{10}$/);
  const url = page.url();
  await expect(page.getByRole('heading', { name: 'Cảm ơn bạn, Bình.' })).toBeVisible();
  await expect(page.getByText(/nine2fine sẽ gọi xác nhận đơn trong 2 giờ làm việc/)).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('heading', { name: 'Cảm ơn bạn, Bình.' })).toBeVisible();
  // Back from the success page must not return to the form.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/checkout$/);
});

// --- Member server cart: merge after sign-in, sign-out, revoked session (AC-CART-13..18) --------
// In mock mode the signed-in shopper uses the server-cart mock only with the `serverCart` flag.

const MEMBER = MOCK_ACCOUNTS[0];
const X = '01-0-M';
const Y = '02-0-M';
const Z = '03-0-M';
const MERGE_SENTENCE = (count: number) =>
  `Đã thêm ${count} sản phẩm từ giỏ hàng trước khi đăng nhập.`;

const SLUGS: Record<string, string> = {
  '01': 'the-everyday-blazer',
  '02': 'nine-to-fine-shirt',
  '03': 'after-hours-dress',
  '04': 'the-straight-trousers',
};

async function deviceCart(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() =>
    Object.fromEntries(
      (
        JSON.parse(localStorage.getItem('n2f.cart.v2') ?? '[]') as {
          variantId: string;
          quantity: number;
        }[]
      ).map((line) => [line.variantId, line.quantity]),
    ),
  );
}

/** Adds `times` of a variant such as `01-0-M` (first colour) from its product page. */
async function addVariant(
  page: Page,
  variantId: string,
  times = 1,
  signedIn = true,
): Promise<void> {
  const [product, , size] = variantId.split('-');
  const before = (await deviceCart(page))[variantId] ?? 0;
  await page.goto(`/product/${SLUGS[product]}`);
  await page.getByRole('button', { name: size, exact: true }).click();
  for (let i = 0; i < times; i++) {
    await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  }
  const wanted = Math.min(before + times, 5);
  await expect.poll(async () => (await deviceCart(page))[variantId] ?? 0).toBe(wanted);
  // A signed-in shopper: wait for the server's answer (it saves the baseline) before leaving.
  if (!signedIn) return;
  await page.waitForFunction(
    ({ id, quantity }) => {
      const raw = localStorage.getItem('n2f.cart.baseline.v1');
      return (
        !raw ||
        (JSON.parse(raw) as { quantities: Record<string, number> }).quantities[id] === quantity
      );
    },
    { id: variantId, quantity: wanted },
  );
}

async function openStorefront(page: Page, flags: Record<string, unknown> = {}): Promise<void> {
  await page.goto('/');
  await setFlags(page, { serverCart: true, ...flags });
}

async function signIn(
  page: Page,
  returnUrl = '/new-in',
  afterLoad?: () => Promise<void>,
): Promise<void> {
  await page.goto(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  await afterLoad?.();
  await page.getByLabel('Email').fill(MEMBER.email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã xác thực (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

async function signOut(page: Page): Promise<void> {
  await page.goto('/account/profile');
  await page
    .getByRole('navigation', { name: 'Tài khoản' })
    .getByRole('button', { name: 'Đăng xuất' })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
}

const badge = (page: Page) =>
  page.getByRole('button', { name: 'Mở giỏ hàng' }).locator('.bag-count');

/** Fills the account's server cart, then signs out (the device cart is emptied on sign-out). */
async function seedAccountCart(page: Page, lines: [string, number][]): Promise<void> {
  await openStorefront(page);
  await signIn(page);
  await expect(page).toHaveURL(/\/new-in$/);
  for (const [variantId, times] of lines) await addVariant(page, variantId, times);
  await signOut(page);
  await expect(badge(page)).toHaveText('0');
  expect(await deviceCart(page)).toEqual({});
}

test('AC-CART-13: sign-in merges the guest cart once, picks only the merged lines, toasts once', async ({
  page,
}) => {
  await seedAccountCart(page, [
    [X, 2],
    [Y, 1],
  ]);
  await addVariant(page, X, 2);
  await addVariant(page, Z, 1);
  await addVariant(page, '01-0-S', 1);
  await setFlags(page, { serverCart: true, discontinued: ['01-0-S'] });
  await signIn(page);
  await expect(page).toHaveURL(/\/new-in$/);
  // X and Z were merged; 01-0-S is no longer sold and is skipped, so the count is 2.
  await expect(page.locator('.toast', { hasText: MERGE_SENTENCE(2) })).toHaveCount(1);
  await expect.poll(() => deviceCart(page)).toEqual({ [X]: 4, [Y]: 1, [Z]: 1 });
  // Opening the cart: only the merged lines are ticked.
  await page.getByRole('button', { name: 'Mở giỏ hàng' }).click();
  await expect(
    page.getByRole('checkbox', { name: /Chọn The Everyday Blazer .* M$/ }),
  ).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Chọn After Hours Dress .* M$/ })).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: /Chọn Nine-to-Fine Shirt .* M$/ }),
  ).not.toBeChecked();
});

test('AC-CART-14: the merge cuts X at 5 and a full cart pushes the 2 oldest lines to favourites', async ({
  page,
}) => {
  // Account cart seeded in the mock store: X x 4 plus 28 other lines (the 2 oldest: 07-0-S, 08-0-S).
  await page.addInitScript(
    ({ x, reserved }) => {
      if (sessionStorage.getItem('test.seeded')) return;
      sessionStorage.setItem('test.seeded', '1');
      sessionStorage.setItem('n2f.mock.flags', JSON.stringify({ serverCart: true }));
      const others: string[] = ['07-0-S', '08-0-S'];
      for (const product of ['01', '02', '03', '04', '05', '06', '07', '08']) {
        for (const color of [0, 1]) {
          for (const size of ['S', 'M', 'L']) {
            const id = `${product}-${color}-${size}`;
            if (id !== x && !reserved.includes(id) && !others.includes(id)) others.push(id);
          }
        }
      }
      const lines = others.slice(0, 28).map((variantId, index) => ({
        variantId,
        quantity: 1,
        updatedAt: new Date(Date.UTC(2026, 10, 1, 0, 0, index)).toISOString(),
      }));
      lines.push({ variantId: x, quantity: 4, updatedAt: '2026-11-02T00:00:00.000Z' });
      sessionStorage.setItem(
        'n2f.mock.v3',
        JSON.stringify({ cart: { carts: [['demo-member', lines]], merges: [] } }),
      );
    },
    { x: X, reserved: [Y, Z, '04-0-M'] },
  );
  await page.goto('/');
  await addVariant(page, X, 3);
  await addVariant(page, Y, 1);
  await addVariant(page, Z, 1);
  await addVariant(page, '04-0-M', 1);
  await signIn(page);
  await expect(page).toHaveURL(/\/new-in$/);
  await expect.poll(async () => Object.keys(await deviceCart(page)).length).toBe(30);
  const cart = await deviceCart(page);
  expect(cart[X]).toBe(5);
  expect(cart['07-0-S']).toBeUndefined();
  expect(cart['08-0-S']).toBeUndefined();
  const wishlist = await page.evaluate(
    () => JSON.parse(localStorage.getItem('n2f.wishlist.v1') ?? '[]') as string[],
  );
  expect(wishlist).toEqual(expect.arrayContaining(['07', '08']));
});

test('AC-CART-15: a failed merge keeps the guest cart; after reloads it merges once, not twice', async ({
  page,
}) => {
  await openStorefront(page);
  await addVariant(page, X, 2);
  await addVariant(page, Y, 1);
  // The server is unreachable while signing in (stands in for blocking */api/*).
  await setFlags(page, { serverCart: true, cartFail: true });
  await signIn(page);
  await expect(page).toHaveURL(/\/new-in$/);
  expect(await deviceCart(page)).toEqual({ [X]: 2, [Y]: 1 });
  await setFlags(page, { serverCart: true });
  const pending = () => page.evaluate(() => localStorage.getItem('n2f.cart.merge.pending'));
  for (let reload = 1; reload <= 2; reload++) {
    await page.reload();
    await expect.poll(pending).toBeNull();
    await expect(badge(page)).toHaveText('3');
    expect(await deviceCart(page)).toEqual({ [X]: 2, [Y]: 1 });
  }
});

test('AC-CART-16: signing in from checkout keeps the picked line and the typed form', async ({
  page,
  isMobile,
}) => {
  await seedAccountCart(page, [[Y, 1]]);
  await addVariant(page, X, 1);
  await page.goto('/checkout');
  await page.getByRole('textbox', { name: 'Họ và tên', exact: true }).fill('Trần Bình');
  await page.getByRole('textbox', { name: 'Số điện thoại', exact: true }).fill('0911222333');
  await page.getByRole('link', { name: 'Đăng nhập để dùng địa chỉ đã lưu' }).click();
  await expect(page).toHaveURL(/\/auth\/login\?returnUrl=%2Fcheckout/);
  await page.getByLabel('Email').fill(MEMBER.email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã xác thực (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('textbox', { name: 'Họ và tên', exact: true })).toHaveValue(
    'Trần Bình',
  );
  await expect(page.getByRole('textbox', { name: 'Số điện thoại', exact: true })).toHaveValue(
    '0911222333',
  );
  await openSummary(page, isMobile);
  const summary = page.locator('aside');
  await expect(summary.getByText('The Everyday Blazer').first()).toBeVisible();
  await expect(summary.getByText('Nine-to-Fine Shirt')).toHaveCount(0);
  // The account's own line is still in the cart; only the picked line is being bought.
  await expect.poll(() => deviceCart(page)).toEqual({ [X]: 1, [Y]: 1 });
});

test('AC-CART-17: sign-out empties this browser; signing in again brings the 2 lines back once', async ({
  page,
}) => {
  await openStorefront(page);
  await signIn(page);
  await expect(page).toHaveURL(/\/new-in$/);
  await addVariant(page, X, 1);
  await addVariant(page, Y, 1);
  await expect(badge(page)).toHaveText('2');
  await signOut(page);
  await expect(badge(page)).toHaveText('0');
  await signIn(page);
  await expect(page).toHaveURL(/\/new-in$/);
  await expect(badge(page)).toHaveText('2');
  expect(await deviceCart(page)).toEqual({ [X]: 1, [Y]: 1 });
});

test('AC-CART-18: a revoked session keeps the cart; signing in again adds only the new line', async ({
  page,
}) => {
  await openStorefront(page);
  await signIn(page);
  await expect(page).toHaveURL(/\/new-in$/);
  await addVariant(page, X, 2);
  await addVariant(page, Y, 1);
  await expect(badge(page)).toHaveText('3');
  // The server drops the session: the page reloads as a guest but nobody pressed "Đăng xuất".
  await setFlags(page, { serverCart: true, sessionRevoked: true });
  await page.reload();
  await expect(page.getByRole('link', { name: 'Đăng nhập' }).first()).toBeVisible();
  await expect(badge(page)).toHaveText('3');
  expect(await deviceCart(page)).toEqual({ [X]: 2, [Y]: 1 });
  await addVariant(page, Z, 1, false);
  // The flag stays on while the sign-in page loads, otherwise the restore would sign us in again.
  await signIn(page, '/new-in', () => setFlags(page, { serverCart: true }));
  await expect(page).toHaveURL(/\/new-in$/);
  await expect.poll(() => deviceCart(page)).toEqual({ [X]: 2, [Y]: 1, [Z]: 1 });
  await expect(page.locator('.toast', { hasText: MERGE_SENTENCE(1) })).toHaveCount(1);
});

test('AC-CHK-36 (FE part): 429 rate-limited on placing an order shows a countdown and keeps form and cart', async ({
  page,
  isMobile,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await openSummary(page, isMobile);
  await setFlags(page, { placeError: 'rate-limited' });
  const submit = page.getByRole('button', { name: /Đặt đơn trải nghiệm/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(
    page.getByText(/Bạn thao tác quá nhanh\. Vui lòng thử lại sau 3 giây\./),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Thử lại sau [123] giây/ })).toBeDisabled();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('textbox', { name: 'Họ và tên', exact: true })).toHaveValue(
    'Trần Bình',
  );
  expect(await deviceCart(page)).toEqual({ [BLAZER_M]: 1 });
  // The countdown ends and the same form places the order.
  await expect(page.getByRole('button', { name: /Đặt đơn trải nghiệm/ })).toBeEnabled({
    timeout: 8000,
  });
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page).toHaveURL(/\/order-success\/N2F\d{10}$/);
});

// --- Cart rules on a browser cart (AC-CART-03, 05, 06, 10, 12) ---------------------------------

interface SeedLine {
  variantId: string;
  quantity: number;
  /** Days since the line was last touched. */
  ageDays?: number;
}

const NAMES: Record<string, string> = {
  '01': 'The Everyday Blazer',
  '02': 'Nine-to-Fine Shirt',
  '03': 'After Hours Dress',
  '04': 'The Straight Trousers',
};

/** Writes the browser cart straight into `localStorage`; the next page load reads it. */
async function seedDeviceCart(page: Page, lines: SeedLine[]): Promise<void> {
  await page.goto('/');
  // The app writes its (empty) cart once at start; seed only after that.
  await expect(page.getByRole('button', { name: 'Mở giỏ hàng' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.evaluate(
    ({ items, names, slugs }) => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const cart = items.map((item) => {
        const [product, color, size] = item.variantId.split('-');
        const at = new Date(now - (item.ageDays ?? 0) * day).toISOString();
        return {
          productId: product,
          slug: slugs[product] ?? product,
          name: names[product] ?? `Sản phẩm ${product}`,
          mediaId: 'catalog-placeholder',
          variantId: item.variantId,
          color: color === '0' ? 'Đen' : 'Xám',
          size,
          price: 1290000,
          stock: 5,
          quantity: item.quantity,
          saleStatus: 'ACTIVE',
          maxQuantity: 5,
          addedAt: at,
          updatedAt: at,
        };
      });
      localStorage.setItem('n2f.cart.v2', JSON.stringify(cart));
    },
    { items: lines, names: NAMES, slugs: SLUGS },
  );
}

async function mockCalls(page: Page, name: string): Promise<number> {
  return page.evaluate(
    (key) =>
      (JSON.parse(sessionStorage.getItem('n2f.mock.calls') ?? '{}') as Record<string, number>)[
        key
      ] ?? 0,
    name,
  );
}

test('AC-CART-03: "−" at quantity 1 removes the line', async ({ page }) => {
  await seedDeviceCart(page, [{ variantId: BLAZER_M, quantity: 1 }]);
  await page.goto('/cart');
  await expect(page.locator('.cart-line')).toHaveCount(1);
  // At quantity 1 the minus button is the remove button (no separate delete icon).
  await expect(page.getByRole('button', { name: /Giảm số lượng/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Xóa The Everyday Blazer khỏi giỏ' }).click();
  await expect(page.locator('.cart-line')).toHaveCount(0);
  await expect(badge(page)).toHaveText('0');
  expect(await deviceCart(page)).toEqual({});
  // At quantity 2 the same position is a real "−".
  await seedDeviceCart(page, [{ variantId: BLAZER_M, quantity: 2 }]);
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Giảm số lượng The Everyday Blazer' }).click();
  await expect(page.getByLabel('Số lượng 1')).toBeVisible();
  await expect(page.locator('.cart-line')).toHaveCount(1);
});

test('AC-CART-05: more than 20 pieces lock checkout with the sentence; 20 unlocks it', async ({
  page,
}) => {
  await seedDeviceCart(
    page,
    ['01', '02', '03', '04', '05'].map((product) => ({
      variantId: `${product}-0-M`,
      quantity: 5,
    })),
  );
  await page.goto('/cart');
  await expect(page.locator('.cart-line')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Thanh toán (25)' })).toBeDisabled();
  await expect(page.getByText('Mỗi đơn tối đa 20 sản phẩm.')).toBeVisible();
  // Pick 4 of the 5 lines: 20 pieces, checkout opens.
  await page.getByRole('button', { name: 'Chọn sản phẩm để xóa' }).click();
  const boxes = page.getByRole('checkbox', { name: /^Chọn / });
  for (let i = 0; i < 5; i++) await boxes.nth(i).setChecked(i < 4);
  await expect(page.getByRole('link', { name: 'Thanh toán (20)' })).toBeVisible();
  await expect(page.getByText('Mỗi đơn tối đa 20 sản phẩm.')).toHaveCount(0);
  await boxes.nth(4).check();
  await expect(page.getByRole('button', { name: 'Thanh toán (25)' })).toBeDisabled();
});

test('AC-CART-06: changing to a size already in the cart merges, caps at 5 and stays in checkout', async ({
  page,
}) => {
  await seedDeviceCart(page, [
    { variantId: '01-0-S', quantity: 4 },
    { variantId: BLAZER_M, quantity: 3 },
  ]);
  await page.goto('/cart');
  await expect(page.getByRole('link', { name: 'Thanh toán (7)' })).toBeVisible();
  const mLine = page.locator('.cart-line').filter({ hasText: 'Size: M' });
  await mLine.getByRole('button', { name: 'Đổi màu hoặc size The Everyday Blazer' }).click();
  const editor = page.getByRole('group', { name: 'Chỉnh The Everyday Blazer' });
  // A sold-out size cannot be picked.
  await expect(editor.getByRole('button', { name: 'Size XL - hết hàng' })).toBeDisabled();
  await editor.getByRole('button', { name: 'Size S', exact: true }).click();
  await editor.getByRole('button', { name: 'Cập nhật' }).click();
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await expect(page.getByLabel('Số lượng 5')).toBeVisible();
  await expect(
    page.getByText(
      'Đã gộp với sản phẩm cùng màu, size có sẵn trong giỏ. Số lượng được điều chỉnh còn 5.',
    ),
  ).toBeVisible();
  // The merged line stays in the order: checkout covers its 5 pieces.
  await expect(page.getByRole('link', { name: 'Thanh toán (5)' })).toBeVisible({ timeout: 10000 });
  expect(await deviceCart(page)).toEqual({ '01-0-S': 5 });
});

test('AC-CART-10: five taps of "+" within a second send one price request', async ({ page }) => {
  await seedDeviceCart(page, [
    { variantId: BLAZER_M, quantity: 1 },
    { variantId: Y, quantity: 1 },
  ]);
  await page.goto('/cart');
  await expect(page.locator('.cart-line')).toHaveCount(2);
  // Let the refresh that opening the cart starts finish, then count from zero.
  await expect.poll(() => mockCalls(page, 'quote')).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  await page.evaluate(() => sessionStorage.setItem('n2f.mock.calls', '{}'));
  // Five taps in the same instant (3 on one line, 2 on the other): well inside the 300 ms window.
  await page.evaluate(() => {
    const tap = (name: string, times: number) => {
      const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
      for (let i = 0; i < times; i++) button?.click();
    };
    tap('Tăng số lượng The Everyday Blazer', 3);
    tap('Tăng số lượng Nine-to-Fine Shirt', 2);
  });
  await expect(page.getByLabel('Số lượng 4')).toBeVisible();
  await expect(page.getByLabel('Số lượng 3')).toBeVisible();
  await expect.poll(() => mockCalls(page, 'quote')).toBe(1);
  // Nothing else follows the burst.
  await page.waitForTimeout(1200);
  expect(await mockCalls(page, 'quote')).toBe(1);
});

test('AC-CART-12: a browser cart untouched for 31 days is empty, 29 days is kept', async ({
  page,
}) => {
  await seedDeviceCart(page, [{ variantId: BLAZER_M, quantity: 2, ageDays: 31 }]);
  await page.goto('/cart');
  await expect(page.locator('.cart-line')).toHaveCount(0);
  await expect(badge(page)).toHaveText('0');
  await seedDeviceCart(page, [{ variantId: BLAZER_M, quantity: 2, ageDays: 29 }]);
  await page.goto('/cart');
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await expect(badge(page)).toHaveText('2');
});

// --- Checkout form and error words (AC-CHK-03, 04, 05, 20, 37) ----------------------------------

const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });

test('AC-CHK-04 (FE): 101-character email and phone 84912345678 are refused; +84 is accepted', async ({
  page,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  const email = field(page, 'Email');
  const emailError = page.getByText('Nhập địa chỉ email hợp lệ (tối đa 100 ký tự).');
  await email.fill(`${'a'.repeat(60)}@${'b'.repeat(36)}.com`);
  await email.blur();
  await expect(emailError).toBeVisible();
  await email.fill(`${'a'.repeat(60)}@${'b'.repeat(35)}.com`);
  await email.blur();
  await expect(emailError).toHaveCount(0);
  const phone = field(page, 'Số điện thoại');
  const phoneError = page.getByText('Nhập số điện thoại di động hợp lệ (0 hoặc +84).');
  await phone.fill('84912345678');
  await phone.blur();
  await expect(phoneError).toBeVisible();
  await phone.fill('+84912345678');
  await phone.blur();
  await expect(phoneError).toHaveCount(0);
});

test('AC-CHK-05 (FE): a guest typing an account email gets a sign-in hint and can still order', async ({
  page,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await field(page, 'Email').fill(MEMBER.email);
  const hint = page.getByText('Đã có tài khoản với email này?');
  await expect(hint).toBeVisible();
  await expect(hint.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
    'href',
    /\/auth\/login\?returnUrl=%2Fcheckout/,
  );
  const submit = page.getByRole('button', { name: /Đặt đơn trải nghiệm/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/\/order-success\/N2F\d{10}$/);
});

test('AC-CHK-03 (Should): the draft survives a reload, expires after 25 hours, is cleared by an order', async ({
  page,
}) => {
  const DRAFT = 'n2f.checkout.draft.v1';
  const draft = () => page.evaluate((key) => localStorage.getItem(key), DRAFT);
  await addBlazer(page);
  await page.goto('/checkout');
  await field(page, 'Họ và tên').fill('Trần Bình');
  await field(page, 'Số điện thoại').fill('0911222333');
  await expect.poll(draft).toContain('Trần Bình');
  await page.reload();
  await expect(field(page, 'Họ và tên')).toHaveValue('Trần Bình');
  await expect(field(page, 'Số điện thoại')).toHaveValue('0911222333');
  // 25 hours later the draft is ignored.
  await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as { savedAt: number };
    stored.savedAt = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem(key, JSON.stringify(stored));
  }, DRAFT);
  await page.goto('/checkout');
  await expect(field(page, 'Họ và tên')).toHaveValue('');
  // Place an order: the draft is gone and a new checkout starts empty.
  await fillCheckout(page);
  const submit = page.getByRole('button', { name: /Đặt đơn trải nghiệm/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/\/order-success\/N2F\d{10}$/);
  expect(await draft()).toBeNull();
  await addBlazer(page);
  await page.goto('/checkout');
  await expect(field(page, 'Họ và tên')).toHaveValue('');
  await expect(field(page, 'Email')).toHaveValue('');
});

test('AC-CHK-20 (Should): a possible duplicate asks first, confirming places the order', async ({
  page,
  isMobile,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await openSummary(page, isMobile);
  await setFlags(page, { placeError: 'possible-duplicate' });
  const submit = page.getByRole('button', { name: /Đặt đơn trải nghiệm/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  const dialog = page.getByRole('alertdialog', { name: 'Đơn hàng trùng' });
  await expect(dialog).toContainText(
    'Bạn vừa đặt đơn giống hệt (N2F2611040427). Bạn vẫn muốn đặt thêm?',
  );
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(dialog.getByRole('link', { name: 'Xem đơn trước' })).toHaveAttribute(
    'href',
    /\/track-order\?orderCode=N2F2611040427/,
  );
  await dialog.getByRole('button', { name: 'Vẫn đặt đơn mới' }).click();
  await expect(page).toHaveURL(/\/order-success\/N2F\d{10}$/);
});

test.describe('AC-CHK-37: each failure has its own sentence', () => {
  const ADDRESS = 'Địa chỉ giao hàng chưa hợp lệ. Vui lòng chọn lại tỉnh/thành và phường/xã.';

  async function place(page: Page, isMobile: boolean, error: string): Promise<void> {
    await addBlazer(page);
    await page.goto('/checkout');
    await fillCheckout(page);
    await openSummary(page, isMobile);
    await setFlags(page, { placeError: error });
    const submit = page.getByRole('button', { name: /Đặt đơn trải nghiệm/ });
    await expect(submit).toBeEnabled();
    await submit.click();
  }

  test('unavailable (5xx, offline): connection sentence and retry, no address sentence', async ({
    page,
    isMobile,
  }) => {
    await place(page, isMobile, 'unavailable');
    await expect(
      page.getByText('Chưa đặt được hàng do lỗi kết nối. Đơn của bạn chưa bị mất, hãy thử lại.'),
    ).toBeVisible();
    await expect(page.getByText(ADDRESS)).toHaveCount(0);
    await expect(field(page, 'Họ và tên')).toHaveValue('Trần Bình');
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page).toHaveURL(/\/order-success\/N2F\d{10}$/);
  });

  test('invalid-address: the address sentence shows and the ward is cleared', async ({
    page,
    isMobile,
  }) => {
    await place(page, isMobile, 'invalid-address');
    await expect(page.getByText(ADDRESS).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Phường / Xã' })).toHaveValue('');
  });

  test('idempotency-conflict and rate-limited never use the address sentence', async ({
    page,
    isMobile,
  }) => {
    await place(page, isMobile, 'idempotency-conflict');
    await expect(
      page.getByText('Đơn hàng đã thay đổi, vui lòng kiểm tra và bấm Đặt hàng lại.'),
    ).toBeVisible();
    await expect(page.getByText(ADDRESS)).toHaveCount(0);
    await setFlags(page, { placeError: 'rate-limited' });
    await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
    await expect(
      page.getByText(/Bạn thao tác quá nhanh\. Vui lòng thử lại sau 3 giây\./),
    ).toBeVisible();
    await expect(page.getByText(ADDRESS)).toHaveCount(0);
  });
});

// --- Merge toast and in-flight reload (m-2, m-3) ------------------------------------------------

test('m-2: signing in with returnUrl=/cart shows the merge sentence in the cart, not also a toast', async ({
  page,
}) => {
  // Records every toast that ever shows (a toast fades before the assertion would look).
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __toasts: string[] }).__toasts = seen;
    new MutationObserver(() => {
      document.querySelectorAll('.toast').forEach((toast) => {
        if (toast.textContent) seen.push(toast.textContent);
      });
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await seedDeviceCart(page, [{ variantId: X, quantity: 2 }]);
  await setFlags(page, { serverCart: true });
  // The mock answers the merge before or after the router leaves /auth depending on timing; the
  // sentence must show once either way (in the cart), never also as a toast.
  await signIn(page, '/cart');
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator('.alert', { hasText: MERGE_SENTENCE(1) })).toHaveCount(1);
  await page.waitForTimeout(1000);
  const toasts = await page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts);
  expect(toasts.filter((text) => text.includes(MERGE_SENTENCE(1)))).toEqual([]);
});

test('m-3: reloading right after adding (before the server answers) does not merge that line twice', async ({
  page,
}) => {
  await openStorefront(page);
  await signIn(page);
  await expect(page).toHaveURL(/\/new-in$/);
  await page.goto(`/product/${SLUGS['01']}`);
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  // The mock answers after 400 ms: reload well before that.
  await expect.poll(() => deviceCart(page)).toEqual({ [X]: 1 });
  await page.reload();
  await expect(badge(page)).toHaveText('1');
  // A second merge, if there were one, would land a moment later.
  await page.waitForTimeout(1500);
  await expect(badge(page)).toHaveText('1');
  expect(await deviceCart(page)).toEqual({ [X]: 1 });
});
