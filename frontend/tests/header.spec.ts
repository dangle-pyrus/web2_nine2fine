import { expect, test } from '@playwright/test';

test('Figma header: Nam / Nữ navigation filters catalog and keeps gender with other filters', async ({
  page,
  isMobile,
}) => {
  await page.goto('/new-in');
  await expect(page.locator('.announcement')).toHaveCount(0);

  const openNav = async (label: string) => {
    if (isMobile) {
      // Nike-style drawer: the top-level item opens a sub-panel led by "Tất cả đồ …".
      await page.getByRole('button', { name: 'Mở menu' }).click();
      const drawer = page.getByRole('navigation', { name: 'Menu di động' });
      await drawer.getByRole('button', { name: label, exact: true }).click();
      await drawer.getByRole('link', { name: `Tất cả đồ ${label}`, exact: true }).click();
    } else {
      await page
        .getByRole('navigation', { name: 'Điều hướng chính' })
        .getByRole('link', { name: label, exact: true })
        .click();
    }
  };

  await openNav('Nam');
  await expect(page).toHaveURL(/\/shop\/nam$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Thời trang Nam.');
  await expect(page.locator('n2f-product-card')).toHaveCount(5);
  if (!isMobile) {
    await expect(
      page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Nam' }),
    ).toHaveAttribute('aria-current', 'page');
  }

  if (isMobile) await page.getByRole('button', { name: /Bộ lọc/ }).click();
  await page.getByRole('checkbox', { name: 'Weekend', exact: true }).check();
  await expect(page).toHaveURL(/gender=nam/);
  await expect(page).toHaveURL(/moment=weekend/);
  if (isMobile) await page.getByRole('button', { name: 'Xem sản phẩm', exact: true }).click();
  await expect(page.locator('n2f-product-card')).toHaveCount(2);

  await openNav('Nữ');
  await expect(page).toHaveURL(/\/shop\/nu$/);
  await expect(page.locator('n2f-product-card')).toHaveCount(6);

  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Tìm kiếm sản phẩm' })).toBeVisible();
});

test('Nike-style header: mega menu with preview photo, keyboard toggle, utility bar', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop mega menu');
  await page.goto('/new-in');
  const utility = page.getByRole('navigation', { name: 'Tiện ích' });
  await expect(utility).toBeVisible();
  await expect(utility.getByRole('link', { name: 'Membership' })).toHaveAttribute(
    'href',
    '/policies/membership',
  );
  const panel = page.locator('#mega-panel');

  await page
    .getByRole('navigation', { name: 'Điều hướng chính' })
    .getByRole('link', { name: 'Nữ', exact: true })
    .hover();
  await expect(panel).toHaveClass(/open/);
  await expect(page.locator('.mega-scrim')).toHaveClass(/open/);
  await panel.getByRole('link', { name: 'Đầm', exact: true }).hover();
  await expect(panel.locator('.feature-title')).toHaveText('Đầm');
  await panel.getByRole('link', { name: 'Đầm', exact: true }).click();
  await expect(page).toHaveURL(/\/shop\/nu\?category=dresses$/);
  await expect(panel).not.toHaveClass(/open/);

  const toggle = page.getByRole('button', { name: 'Danh mục Khoảnh khắc' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('mobile drawer: sub-panel with photos, back, account actions, closes on Escape', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile drawer');
  await page.goto('/new-in');
  await page.getByRole('button', { name: 'Mở menu' }).click();
  const drawer = page.getByRole('navigation', { name: 'Menu di động' });
  await expect(drawer.getByRole('link', { name: 'Membership' })).toHaveAttribute(
    'href',
    '/policies/membership',
  );
  await drawer.getByRole('button', { name: 'Khoảnh khắc', exact: true }).click();
  await expect(drawer.getByRole('heading', { name: 'Khoảnh khắc' })).toBeFocused();
  await expect(drawer.locator('.thumb')).toHaveCount(4);
  await drawer.getByRole('button', { name: 'Tất cả' }).click();
  await expect(drawer.getByRole('button', { name: 'Khoảnh khắc', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mở menu' })).toBeFocused();
});

test('Nike-style search: popular terms, accent-insensitive suggestions, keyboard, recent history', async ({
  page,
}) => {
  await page.goto('/new-in');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Tìm kiếm sản phẩm' });
  const input = panel.getByLabel('Tìm sản phẩm', { exact: true });
  await expect(input).toBeFocused();
  await expect(panel.getByRole('link', { name: 'Đầm midi' })).toBeVisible();

  await input.pressSequentially('dam');
  await expect(panel.getByRole('option', { name: 'Đầm', exact: true })).toBeVisible();
  await expect(panel.locator('.search-result')).toHaveCount(1);

  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'search-suggestion-0');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/shop\/dresses$/);
  await expect(panel).toHaveCount(0);

  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(panel.getByRole('link', { name: 'Đầm', exact: true })).toBeVisible();
  await panel.getByLabel('Tìm sản phẩm', { exact: true }).fill('blazer');
  await panel.getByLabel('Tìm sản phẩm', { exact: true }).press('Enter');
  await expect(page).toHaveURL(/\/search\?q=blazer$/);
  await expect(page.locator('n2f-product-card')).toHaveCount(1);
});
