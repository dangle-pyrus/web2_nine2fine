import { expect, test } from '@playwright/test';

test('brand Home preserves layout and opens only local shopping routes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('From Nine to Fine.');
  await expect(page.locator('n2f-home-campaign')).toHaveCount(9);
  await expect(page.locator('.hero-block + .service-strip + .reference-categories')).toBeAttached();
  await expect(page.locator('.service-strip li')).toHaveCount(3);
  await expect(page.locator('n2f-home-shop-rail n2f-product-card')).toHaveCount(8);
  await expect(page.locator('.category-grid li')).toHaveCount(4);
  await expect(page.locator('n2f-home-product-rail article')).toHaveCount(12);
  await expect(page.locator('n2f-home-page a[href^="http"]')).toHaveCount(0);
  await expect(page.locator('.campaign-cta, .reference-credit')).toHaveCount(0);
  await expect(page.locator('n2f-home-page')).not.toContainText(
    /Member Offers|HEATTECH|Cashmere|£|Cambridge/,
  );
  await expect(page.locator('.site-header')).toHaveClass(/transparent/);
  await page.locator('#categories').scrollIntoViewIfNeeded();
  await expect(page.locator('.site-header')).toHaveClass(/transparent/);
  await page.locator('n2f-home-product-rail').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.site-header')).toHaveClass(/transparent/);
  await page.locator('.site-footer').scrollIntoViewIfNeeded();
  await expect(page.locator('.site-header')).toHaveClass(/transparent/);
  await page.locator('.hero-block .campaign-link').click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.locator('.site-header')).not.toHaveClass(/transparent/);
  await expect(page.locator('n2f-product-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('four categories lead to the matching nine2fine catalog and support browser back', async ({
  page,
}) => {
  test.setTimeout(60000);
  const categories = [
    ['Áo', 'tops', 'Nine-to-Fine Shirt'],
    ['Quần & chân váy', 'bottoms', 'The Straight Trousers'],
    ['Đầm', 'dresses', 'After Hours Dress'],
    ['Áo khoác', 'outerwear', 'The Everyday Blazer'],
  ];
  await page.goto('/');
  for (const [label, slug, product] of categories) {
    const link = page.locator('.category-grid').getByRole('link', { name: label, exact: true });
    await link.scrollIntoViewIfNeeded();
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp('/shop/' + slug + '$'));
    await expect(page.locator('n2f-product-card').filter({ hasText: product })).toBeVisible();
    await page.goBack();
    await expect(page.locator('.category-grid li')).toHaveCount(4);
  }
});

test('editorial cards, moments and membership use working local destinations', async ({ page }) => {
  await page.goto('/');
  await page.locator('n2f-home-product-rail').first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/shop\/outerwear$/);
  await expect(page.locator('n2f-product-card').first()).toBeVisible();
  await page.goBack();
  await page.locator('.audience-nav').getByRole('link', { name: 'Hẹn tối' }).click();
  await expect(page).toHaveURL(/\/shop-by-moment\/dinner$/);
  await expect(page.locator('n2f-product-card').first()).toBeVisible();
  await page.goBack();
  await page.locator('n2f-home-campaign').last().getByRole('link').click();
  await expect(page).toHaveURL(/\/auth\/register$/);
  await expect(page.locator('form')).toBeVisible();
});

test('video controls remain usable and stop playback offscreen', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('n2f-home-campaign').first();
  const video = hero.locator('video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
  await hero.getByRole('button', { name: 'Tạm dừng video: From Nine to Fine.' }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await hero.getByRole('button', { name: 'Phát video: From Nine to Fine.' }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
  await page.locator('n2f-home-product-rail').first().scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

test('reduced motion uses complete posters with no automatic video downloads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const campaign of await page.locator('n2f-home-campaign').all()) {
    await campaign.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        campaign
          .locator('picture img')
          .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0),
      )
      .toBe(true);
  }
  for (const video of await page.locator('video').all())
    await expect(video).not.toHaveAttribute('src');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
