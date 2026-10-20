import { expect, test } from '@playwright/test';

test('PLP: Nike-style header, sidebar categories, colour swatches, hide filters persists', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop sidebar behaviour; mobile uses the filter dialog.');
  await page.goto('/shop');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('(8)');

  const sidebar = page.getByRole('complementary', { name: 'Bộ lọc sản phẩm' });
  await sidebar
    .getByRole('navigation', { name: 'Danh mục sản phẩm' })
    .getByRole('button', { name: 'Đầm' })
    .click();
  await expect(page).toHaveURL(/category=dresses/);
  await expect(page.locator('n2f-product-card')).toHaveCount(1);
  await sidebar.getByRole('button', { name: 'Tất cả sản phẩm' }).click();

  await sidebar.getByRole('button', { name: 'Đỏ', exact: true }).click();
  await expect(page).toHaveURL(/color=%C4%90%E1%BB%8F|color=Đỏ/);
  await expect(sidebar.getByText('Đang lọc (1)')).toBeVisible();
  await sidebar.getByRole('button', { name: 'Xóa tất cả' }).click();
  await expect(page.locator('n2f-product-card')).toHaveCount(8);

  await page.getByRole('button', { name: 'Ẩn bộ lọc' }).click();
  await expect(sidebar).toBeHidden();
  await expect(page.locator('.product-grid')).toHaveCSS('grid-template-columns', /^(\S+\s){3}\S+$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hiện bộ lọc' })).toBeVisible();
  await page.getByRole('button', { name: 'Hiện bộ lọc' }).click();
  await expect(sidebar).toBeVisible();
});

test('PDP: gallery, size error outline, size guide, reviews, related products', async ({
  page,
  isMobile,
}) => {
  await page.goto('/product/the-everyday-blazer');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Everyday Blazer');
  await expect(page.getByText('Áo blazer · Dáng suông').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mặc theo cách của bạn' })).toHaveCount(0);

  if (!isMobile) {
    const thumbs = page.getByRole('tab', { name: /Ảnh \d/ });
    await expect(thumbs).toHaveCount(4);
    await thumbs.nth(2).click();
    await expect(thumbs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Ảnh tiếp theo' }).click();
    await expect(thumbs.nth(3)).toHaveAttribute('aria-selected', 'true');
  } else {
    await expect(page.getByText('1 / 4')).toBeVisible();
  }

  await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
  await expect(page.locator('.sizes-field')).toHaveClass(/invalid/);
  await expect(page.getByRole('alert')).toContainText('chọn kích cỡ');

  await page.getByRole('button', { name: 'Hướng dẫn chọn size' }).click();
  const guide = page.getByRole('dialog', { name: 'Hướng dẫn chọn size' });
  await expect(guide.getByRole('columnheader', { name: 'Rộng vai (cm)' })).toBeVisible();
  await expect(guide.getByRole('tab')).toHaveCount(0);
  await guide.getByRole('button', { name: 'Đóng' }).click();

  const reviews = page.locator('#reviews');
  await expect(reviews.getByRole('heading', { name: 'Đánh giá (3)' })).toBeVisible();
  await expect(
    reviews.getByText('Đa số thấy hơi rộng, có thể chọn nhỏ hơn một size.'),
  ).toBeVisible();
  await expect(reviews.locator('li')).toHaveCount(2);
  await reviews.getByRole('button', { name: 'Xem tất cả 3 đánh giá' }).click();
  await expect(reviews.locator('li')).toHaveCount(3);
  await reviews.getByRole('button', { name: 'Size L' }).click();
  await expect(reviews.locator('li')).toHaveCount(1);
  await expect(reviews.getByText('Đánh giá mẫu', { exact: false })).toBeVisible();

  const related = page.getByRole('region', { name: 'Có thể bạn cũng thích' });
  await expect(related.locator('n2f-product-card')).toHaveCount(4);
  await expect(related.getByText('The Everyday Blazer')).toHaveCount(0);

  if (isMobile) {
    await page.getByRole('heading', { name: 'Đánh giá (3)' }).scrollIntoViewIfNeeded();
    const bar = page.getByRole('region', { name: 'Mua nhanh' });
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'Chọn kích cỡ' }).click();
    await expect(page.locator('.sizes-field')).toBeInViewport();
  }
});

test('PDP: buy now needs a size and checks out only that item; heart is an icon', async ({
  page,
}) => {
  await page.goto('/product/the-everyday-blazer');
  await expect(page.getByRole('button', { name: 'Yêu thích The Everyday Blazer' })).toBeVisible();
  await page.getByRole('button', { name: 'Mua ngay' }).click();
  await expect(page.getByRole('alert')).toContainText('chọn kích cỡ');
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'Mua ngay' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'Đơn hàng (1)' })).toBeVisible();
});
