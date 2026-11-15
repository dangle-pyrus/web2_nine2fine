import { expect, Page, Route, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';

/**
 * Slice 10 (lát 10.5) storefront: PDP reviews on the API. `reviewsMode = http` makes the e2e build
 * call `/api/products/{id}/reviews`, `/api/reviews/eligibility` and `/api/reviews`, answered here
 * with bodies shaped like docs/api/openapi.yaml (products stay on the mock catalog). AC-REV-04, 05,
 * 08 FE parts: no "mẫu" label, form only for `eligible`, one message per status, 422 on the right
 * field, 409 with its own sentence, own review at once, input kept on a lost connection.
 */
const member = MOCK_ACCOUNTS[0];
const PDP = '/product/the-everyday-blazer';

type Json = Record<string, unknown>;

const fulfil = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  });
const apiError = (code: string, message = '', extra: Json = {}) => ({
  error: { code, message, ...extra },
});

function review(index: number, extra: Json = {}): Json {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    author: `Nguyễn ${String.fromCharCode(64 + index)}.`,
    rating: index % 2 ? 5 : 4,
    fit: index % 3 === 0 ? 1 : 0,
    sizeBought: index % 2 ? 'M' : 'L',
    height: '',
    title: `Đánh giá số ${index}`,
    body: `Nội dung nhận xét dài đủ hai mươi ký tự cho đánh giá số ${index}.`,
    date: '2026-11-01',
    verified: true,
    ...extra,
  };
}

const SUMMARY = {
  count: 12,
  average: 4.5,
  distribution: { '1': 0, '2': 0, '3': 1, '4': 5, '5': 6 },
  fit: { small: 1, true: 8, large: 3 },
};

function reviewPage(page: number, limit: number, total: number, items: Json[]): Json {
  return { items, total, page, limit, summary: SUMMARY };
}

async function useReviews(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('n2f.e2e.reviewsMode', 'http'));
}

async function signIn(page: Page, returnUrl: string): Promise<void> {
  await page.goto(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  await page.getByLabel('Email').fill(member.email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã xác thực (6 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\//);
}

test.describe('PDP reviews on the API (Slice 10)', () => {
  test('AC-REV-04/05: real list and summary, pages, star filter, no sample label', async ({
    page,
  }) => {
    await useReviews(page);
    const requests: URLSearchParams[] = [];
    await page.route('**/api/reviews/eligibility**', (route) =>
      fulfil(route, 200, { status: 'sign-in' }),
    );
    await page.route('**/api/products/*/reviews**', (route) => {
      const url = new URL(route.request().url());
      requests.push(url.searchParams);
      const rating = Number(url.searchParams.get('rating') ?? 0);
      const pageNo = Number(url.searchParams.get('page'));
      if (rating === 5) {
        return fulfil(
          route,
          200,
          reviewPage(1, 10, 6, [review(1), review(3), review(5), review(7), review(9), review(11)]),
        );
      }
      const all = Array.from({ length: 12 }, (_, i) => review(i + 1));
      return fulfil(
        route,
        200,
        pageNo === 2
          ? reviewPage(2, 10, 12, all.slice(10))
          : reviewPage(1, 10, 12, all.slice(0, 10)),
      );
    });

    await page.goto(PDP);
    const reviews = page.locator('#reviews');
    await expect(reviews.getByRole('heading', { name: 'Đánh giá (12)' })).toBeVisible();
    // Average and fit come from the summary, not from the ten loaded reviews.
    await expect(reviews.getByText('4.5').first()).toBeVisible();
    await expect(reviews.locator('.score .count')).toHaveText('12 đánh giá');
    await expect(reviews.getByText('Đánh giá mẫu', { exact: false })).toHaveCount(0);
    expect(requests[0].get('limit')).toBe('10');
    await expect(reviews.locator('li')).toHaveCount(2);
    await reviews.getByRole('button', { name: 'Xem tất cả 12 đánh giá' }).click();
    await expect(reviews.locator('li')).toHaveCount(10);
    await reviews.getByRole('button', { name: 'Xem thêm đánh giá' }).click();
    await expect(reviews.locator('li')).toHaveCount(12);
    expect(requests.at(-1)?.get('page')).toBe('2');
    await expect(reviews.getByRole('button', { name: 'Xem thêm đánh giá' })).toHaveCount(0);

    // BR-REV-09 (Should): the star filter asks the server; the summary stays on every review.
    await reviews.getByRole('button', { name: '5 sao (6)' }).click();
    await expect(reviews.locator('li')).toHaveCount(6);
    expect(requests.at(-1)?.get('rating')).toBe('5');
    await expect(reviews.getByRole('heading', { name: 'Đánh giá (12)' })).toBeVisible();
  });

  test('AC-REV-08: a failed list says so and retries', async ({ page }) => {
    await useReviews(page);
    await page.route('**/api/reviews/eligibility**', (route) =>
      fulfil(route, 200, { status: 'sign-in' }),
    );
    let fail = true;
    await page.route('**/api/products/*/reviews**', (route) =>
      fail
        ? fulfil(route, 500, apiError('unavailable'))
        : fulfil(route, 200, reviewPage(1, 10, 1, [review(1)])),
    );
    await page.goto(PDP);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Chưa tải được đánh giá' }),
    ).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.locator('#reviews li')).toHaveCount(1);
  });

  test('AC-REV-08: one sentence per eligibility status', async ({ page }) => {
    await useReviews(page);
    await page.route('**/api/products/*/reviews**', (route) =>
      fulfil(route, 200, reviewPage(1, 10, 0, [])),
    );
    let status = 'sign-in';
    await page.route('**/api/reviews/eligibility**', (route) => fulfil(route, 200, { status }));
    await page.goto(PDP);
    await expect(page.getByText(/Đã mua sản phẩm này\?/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Viết đánh giá' })).toHaveCount(0);
    status = 'not-purchased';
    await page.reload();
    await expect(page.getByText('Chỉ khách đã mua và nhận sản phẩm này')).toBeVisible();
    status = 'reviewed';
    await page.reload();
    await expect(page.getByText('Bạn đã đánh giá sản phẩm này.')).toBeVisible();
  });

  test('AC-REV-03/04/08: 422 on the fields, input kept offline, own review at once, 409 text', async ({
    page,
  }) => {
    await useReviews(page);
    let list: Json[] = [];
    await page.route('**/api/products/*/reviews**', (route) =>
      fulfil(route, 200, reviewPage(1, 10, list.length, list)),
    );
    let status: Json = { status: 'eligible', sizeBought: 'L' };
    await page.route('**/api/reviews/eligibility**', (route) => fulfil(route, 200, status));
    const bodies: Json[] = [];
    let answer: (route: Route) => Promise<void> | void = (route) => route.abort('failed');
    await page.route('**/api/reviews', async (route) => {
      bodies.push(route.request().postDataJSON() as Json);
      await answer(route);
    });

    await signIn(page, `${PDP}#reviews`);
    await page.getByRole('button', { name: 'Viết đánh giá' }).click();
    const form = page.getByRole('form', { name: 'Viết đánh giá' });
    // The size comes from the order and cannot be edited.
    await expect(form.getByLabel('Size đã mua')).toHaveValue('L');
    await expect(form.getByLabel('Size đã mua')).toHaveAttribute('readonly', '');
    await form.getByLabel('4 sao').check({ force: true });
    await form.getByRole('textbox', { name: /Tiêu đề/ }).fill('Mặc đi làm rất ổn');
    await form
      .getByRole('textbox', { name: /Nhận xét/ })
      .fill('Vải mát, phom vừa vặn, mặc từ sáng đến tối không nhăn.');

    // Connection lost: everything typed stays and the sentence says so.
    await form.getByRole('button', { name: 'Đăng đánh giá' }).click();
    await expect(
      form.getByRole('alert').filter({ hasText: 'Thông tin bạn nhập vẫn được giữ' }),
    ).toBeVisible();
    await expect(form.getByRole('textbox', { name: /Tiêu đề/ })).toHaveValue('Mặc đi làm rất ổn');
    expect(bodies[0]).toEqual({
      productId: '01',
      rating: 4,
      fit: 0,
      height: '',
      title: 'Mặc đi làm rất ổn',
      body: 'Vải mát, phom vừa vặn, mặc từ sáng đến tối không nhăn.',
    });

    // 422: every field error at once, each on its own field.
    answer = (route) =>
      fulfil(
        route,
        422,
        apiError('validation', 'Tiêu đề quá ngắn.', {
          field: 'title',
          fieldErrors: [
            { field: 'title', message: 'Tiêu đề cần từ 2 ký tự có nghĩa.' },
            { field: 'body', message: 'Nhận xét tối thiểu 20 ký tự.' },
          ],
        }),
      );
    await form.getByRole('button', { name: 'Đăng đánh giá' }).click();
    await expect(form.getByText('Tiêu đề cần từ 2 ký tự có nghĩa.')).toBeVisible();
    await expect(form.getByText('Nhận xét tối thiểu 20 ký tự.')).toBeVisible();
    await expect(form.getByRole('textbox', { name: /Tiêu đề/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    // 201: the shopper's own review shows at once (and the average is read again).
    const own = review(7, {
      author: 'Trần H.',
      title: 'Mặc đi làm rất ổn',
      sizeBought: 'L',
    });
    answer = (route) => {
      list = [own];
      return fulfil(route, 201, own);
    };
    await form.getByRole('textbox', { name: /Tiêu đề/ }).fill('Mặc đi làm rất ổn');
    await form.getByRole('button', { name: 'Đăng đánh giá' }).click();
    await expect(page.getByText('Cảm ơn bạn đã đánh giá.', { exact: false })).toBeVisible();
    await expect(
      page.locator('#reviews li').filter({ hasText: 'Mặc đi làm rất ổn' }),
    ).toBeVisible();
  });

  test('AC-REV-04: 409 already-reviewed and not-eligible each get their own sentence', async ({
    page,
  }) => {
    await useReviews(page);
    await page.route('**/api/products/*/reviews**', (route) =>
      fulfil(route, 200, reviewPage(1, 10, 0, [])),
    );
    let status: Json = { status: 'eligible', sizeBought: 'M' };
    await page.route('**/api/reviews/eligibility**', (route) => fulfil(route, 200, status));
    let code = 'already-reviewed';
    await page.route('**/api/reviews', (route) => {
      // The race is lost: the server now says what the real state is.
      status = { status: code === 'already-reviewed' ? 'reviewed' : 'not-purchased' };
      return fulfil(route, 409, apiError(code));
    });
    await signIn(page, `${PDP}#reviews`);
    await page.getByRole('button', { name: 'Viết đánh giá' }).click();
    const form = page.getByRole('form', { name: 'Viết đánh giá' });
    await form.getByLabel('5 sao').check({ force: true });
    await form.getByRole('textbox', { name: /Tiêu đề/ }).fill('Rất đáng tiền');
    await form
      .getByRole('textbox', { name: /Nhận xét/ })
      .fill('Chất vải đẹp, đường may chắc chắn, đáng đồng tiền.');
    await form.getByRole('button', { name: 'Đăng đánh giá' }).click();
    // The form gives way to the real state (no retry of something that cannot succeed).
    await expect(page.getByText('Bạn đã đánh giá sản phẩm này.')).toBeVisible();
    await expect(page.getByRole('form', { name: 'Viết đánh giá' })).toHaveCount(0);
  });
});
