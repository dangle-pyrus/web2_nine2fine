import { expect, test } from '@playwright/test';

const LABEL = 'Liên hệ CSKH qua Facebook';

test('CSKH Facebook button: round, bottom-right, opens the page in a new tab', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: LABEL });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://www.facebook.com/thang.pham.50014/');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const box = (await link.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.round(box.width)).toBe(Math.round(box.height));
  expect(viewport.width - (box.x + box.width)).toBeLessThanOrEqual(24);
  expect(viewport.height - (box.y + box.height)).toBeLessThanOrEqual(24);
});

test('CSKH button is not on admin pages', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expect(page.getByRole('link', { name: LABEL })).toHaveCount(0);
});

test('CSKH button stays above the PDP purchase bar on phones', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The purchase bar only exists on small screens.');
  await page.goto('/product/the-everyday-blazer');
  await page.mouse.wheel(0, 1500);
  const bar = page.getByRole('region', { name: 'Mua nhanh' });
  await expect(bar).toBeVisible();
  const link = page.getByRole('link', { name: LABEL });
  await expect
    .poll(async () => {
      const [b, l] = await Promise.all([bar.boundingBox(), link.boundingBox()]);
      return b && l ? l.y + l.height <= b.y : false;
    })
    .toBe(true);
});
