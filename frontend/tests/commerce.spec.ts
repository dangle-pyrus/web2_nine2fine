import { expect, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';

test('catalog filters survive product navigation; guests sign in before saving a favourite', async ({
  page,
  isMobile,
}) => {
  await page.goto('/new-in');
  await expect(page.locator('n2f-product-card')).toHaveCount(8);
  if (isMobile) await page.getByRole('button', { name: /Bộ lọc/ }).click();
  await page.getByRole('checkbox', { name: 'Work', exact: true }).check();
  await expect(page).toHaveURL(/moment=work/);
  await expect(page.locator('n2f-product-card')).toHaveCount(5);
  if (isMobile) await page.getByRole('button', { name: 'Xem sản phẩm', exact: true }).click();
  await page.getByLabel('Sắp xếp sản phẩm').selectOption('price-asc');
  await expect(page.locator('n2f-product-card h2').first()).toHaveText('Nine-to-Fine Shirt');
  await page.locator('n2f-product-card h2 a').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nine-to-Fine Shirt');
  await page.goBack();
  await expect(page).toHaveURL(/moment=work/);
  await expect(page.locator('n2f-product-card')).toHaveCount(5);

  // A guest tapping the heart is sent to sign in; the product is saved on return.
  await page.getByRole('button', { name: 'Yêu thích Nine-to-Fine Shirt' }).click();
  await expect(page).toHaveURL(/\/auth\/login\?returnUrl=/);
  await page.getByLabel('Email').fill(MOCK_ACCOUNTS[0].email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã số (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/moment=work/);
  await expect(page.getByRole('button', { name: 'Bỏ yêu thích Nine-to-Fine Shirt' })).toBeVisible();
  await page.getByRole('link', { name: /^Yêu thích \(/ }).click();
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(page.locator('n2f-product-card')).toHaveCount(1);
});

test('variant validation, cart limits, drawer keyboard and mock checkout', async ({ page }) => {
  await page.goto('/product/the-everyday-blazer');
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(page.getByRole('alert')).toContainText('chọn kích cỡ');
  await expect(page.getByRole('button', { name: 'XL - hết hàng' })).toBeDisabled();
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm vào giỏ hàng' })).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Giỏ hàng' });
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Mở giỏ hàng' }).click();
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
    ).toBeTruthy();
  }
  await page
    .getByRole('button', { name: 'Tăng số lượng The Everyday Blazer' })
    .click({ clickCount: 4 });
  await expect(
    page.getByRole('button', { name: 'Tăng số lượng The Everyday Blazer' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở giỏ hàng' })).toBeFocused();
  await page.getByRole('button', { name: 'Mở giỏ hàng' }).click();
  await page.getByRole('link', { name: /^Thanh toán \(\d+\)$/ }).click();
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page.getByText('Nhập họ và tên của bạn.')).toBeVisible();
  await expect(page.getByText('Vui lòng đồng ý để đặt hàng.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Họ và tên', exact: true }).fill('Nguyen Van A');
  await page.getByRole('textbox', { name: 'Số điện thoại', exact: true }).fill('0901234567');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('demo@example.com');
  await page
    .getByRole('combobox', { name: 'Tỉnh / Thành phố' })
    .selectOption({ label: 'Thành phố Hồ Chí Minh' });
  await page
    .getByRole('combobox', { name: 'Phường / Xã' })
    .selectOption({ label: 'Phường Sài Gòn' });
  await page
    .getByRole('textbox', { name: 'Địa chỉ nhận hàng', exact: true })
    .fill('123 Nguyen Hue');
  await page.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }).check();
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page).toHaveURL(/\/order-success\/N2F/);
  await expect(page.getByRole('heading', { name: 'Cảm ơn bạn, A.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở giỏ hàng' }).locator('.bag-count')).toHaveText(
    '0',
  );
});

test('search handles rapid replacement and empty results', async ({ page }) => {
  await page.goto('/new-in');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page.getByLabel('Tìm sản phẩm', { exact: true }).fill('blazer');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await page.getByLabel('Tìm sản phẩm', { exact: true }).fill('no-such-product');
  await expect(page.locator('.search-result')).toHaveCount(0);
  await expect(page.getByText('Chưa tìm thấy sản phẩm cho “no-such-product”.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Tìm kiếm', exact: true })).toBeFocused();
});

test('assets render, layout fits and no browser errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/new-in');
  await expect(page.locator('n2f-product-card')).toHaveCount(8);
  await page.locator('n2f-product-card').last().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('catalog.png'), fullPage: true });
  await page.goto('/not-a-route');
  await expect(page.getByRole('heading', { name: 'Cuộc hẹn này chưa có ở đây.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('catalog fits every planned viewport width', async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, 'Viewport matrix runs once on the desktop browser.');
  await page.goto('/shop');
  await expect(page.locator('n2f-product-card')).toHaveCount(8);
  for (const width of [375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Overflow at ${width}px`,
    ).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`catalog-${width}.png`) });
  }
});

test('quick add from the listing, toast feedback and removing lines in selection mode', async ({
  page,
}) => {
  await page.goto('/new-in');
  const card = page.locator('n2f-product-card').first();
  await card.getByRole('button', { name: /^Chọn size để thêm/ }).click();
  // The pill stays inactive until a size is chosen; the sheet closes without opening the PDP.
  await expect(card.getByRole('button', { name: 'Thêm vào giỏ' })).toBeDisabled();
  await card.locator('.sheet-close').click();
  await expect(page).toHaveURL(/\/new-in$/);
  await card.getByRole('button', { name: /^Chọn size để thêm/ }).click();
  await card.getByRole('button', { name: 'Size M' }).click();
  await card.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm vào giỏ hàng' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Giỏ hàng' })).toHaveCount(0);

  const second = page.locator('n2f-product-card').nth(1);
  await second.getByRole('button', { name: /^Chọn size để thêm/ }).click();
  await second.getByRole('button', { name: 'Size S' }).click();
  await second.getByRole('button', { name: 'Thêm vào giỏ' }).click();

  await page.goto('/cart');
  await expect(page.getByRole('link', { name: 'Thanh toán (2)' })).toBeVisible();
  // Checkboxes appear only in selection mode, which removes the picked lines.
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chọn sản phẩm để xóa' }).click();
  await expect(page.getByRole('button', { name: 'Chọn sản phẩm để thanh toán' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /^Chọn Nine-to-Fine Shirt/ }).check();
  await expect(page.getByRole('link', { name: 'Thanh toán (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Xóa (1)' }).click();
  await expect(page.getByRole('link', { name: 'Thanh toán (1)' })).toBeVisible();
  await page.getByRole('link', { name: 'Thanh toán (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Đơn hàng (1)' })).toBeVisible();
});

test('selection mode summary follows the picked lines and checks out only those', async ({
  page,
}) => {
  await page.goto('/new-in');
  for (const [index, size] of [
    [0, 'M'],
    [1, 'S'],
  ] as const) {
    const card = page.locator('n2f-product-card').nth(index);
    await card.getByRole('button', { name: /^Chọn size để thêm/ }).click();
    await card.getByRole('button', { name: `Size ${size}` }).click();
    await card.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  }
  await page.goto('/cart');
  const summary = page.getByRole('complementary', { name: 'Tóm tắt đơn hàng' });
  await expect(summary).toContainText('1.880.000');
  await page.getByRole('button', { name: 'Chọn sản phẩm để xóa' }).click();
  await expect(summary).toContainText('0 sản phẩm');
  await page.getByRole('checkbox', { name: /^Chọn The Everyday Blazer/ }).check();
  await expect(summary).toContainText('1.290.000');
  await page.getByRole('link', { name: 'Thanh toán (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Đơn hàng (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở giỏ hàng' }).locator('.bag-count')).toHaveText(
    '2',
  );
});
