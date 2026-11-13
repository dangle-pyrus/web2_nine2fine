import { expect, Page, Route, test } from '@playwright/test';

/**
 * Slice 10 (lát 10.2) storefront: a guest returns goods from Tra cứu đơn (OTP grant) with the same
 * form as a member. `returnsMode = http` + `guestLookup = http` make the e2e build call
 * `/api/orders/**` for the lookup and the guest return (`/api/orders/{code}/return*`), all answered
 * here with bodies shaped like docs/api/openapi.yaml. AC-RET-60..66 FE parts; grant checks, rate
 * limits and amounts belong to the backend tests.
 */
const CODE = 'N2F2611120002';
const EMAIL = 'khach@example.com';
const V1 = '11111111-1111-4111-8111-111111111111';
const PHOTO = '33333333-3333-4333-8333-333333333333';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type Json = Record<string, unknown>;

function order(extra: Json = {}): Json {
  return {
    id: CODE,
    placedAt: '2026-10-20T03:00:00.000Z',
    status: 'completed',
    paymentStatus: 'paid',
    paymentMethod: 'cod',
    items: [
      {
        variantId: V1,
        productSlug: 'the-everyday-blazer',
        name: 'Áo blazer thường ngày',
        color: 'Đen',
        size: 'M',
        quantity: 1,
        unitPrice: 500_000,
        mediaId: 'editorial-home-hero',
      },
    ],
    pricing: {
      subtotal: 500_000,
      discount: 0,
      shippingFee: 0,
      shippingDiscount: 0,
      total: 500_000,
    },
    recipient: { name: 'Nguyễn An', phone: '0987654321', email: EMAIL },
    shippingAddress: {
      street: '1 Hoàng Diệu',
      ward: 'Phường Ba Đình',
      province: 'Thành phố Hà Nội',
    },
    canReturn: true,
    returnDeadline: '2026-12-31T16:59:59.000Z',
    ...extra,
  };
}

function returnCase(state: string, extra: Json = {}): Json {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    state,
    reason: 'wrong-size',
    fault: 'shop',
    detail: 'Đặt size M nhưng nhận size L.',
    conditionAck: false,
    requestedAt: '2026-11-12T03:00:00.000Z',
    lines: [
      {
        variantId: V1,
        name: 'Áo blazer thường ngày',
        color: 'Đen',
        size: 'M',
        sku: 'BLZ-B-M',
        mediaId: 'editorial-home-hero',
        quantity: 1,
        goodsAmount: 500_000,
      },
    ],
    photos: [],
    amount: {
      goodsAmount: 500_000,
      shippingRefund: 0,
      returnShippingFee: 0,
      amount: 500_000,
      final: false,
    },
    refundTo: { type: 'account', bank: 'Vietcombank', last4: '6789', accountName: 'NGUYEN AN' },
    canCancel: state === 'requested',
    ...extra,
  };
}

const fulfil = (
  route: Route,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store', ...headers },
    body: JSON.stringify(body),
  });
const apiError = (code: string, message = '', extra: Json = {}) => ({
  error: { code, message, ...extra },
});

async function useGuestReturns(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('n2f.e2e.returnsMode', 'http');
    localStorage.setItem('n2f.e2e.guestLookup', 'http');
  });
  await page.route('**/api/orders/lookup/codes', (route) =>
    fulfil(route, 200, { resendAfterSeconds: 60 }),
  );
}

async function lookUp(page: Page): Promise<void> {
  await page.goto('/track-order');
  await page.getByLabel('Mã đơn hàng').fill(CODE);
  await page.getByLabel('Email đặt hàng').fill(EMAIL);
  await page.getByRole('button', { name: 'Gửi mã xác minh' }).click();
  await page.getByLabel('Mã xác minh (8 số)').fill('12345678');
  await page.getByRole('button', { name: 'Xem đơn hàng' }).click();
  await expect(page.getByRole('heading', { name: `Đơn #${CODE}` })).toBeVisible();
}

test.describe('guest returns from Tra cứu đơn (Slice 10)', () => {
  test('AC-RET-61: the button follows the server canReturn, no sign-in asked', async ({ page }) => {
    await useGuestReturns(page);
    let body = order({ canReturn: false });
    await page.route('**/api/orders/lookup/verify', (route) => fulfil(route, 200, body));
    await lookUp(page);
    await expect(page.getByRole('link', { name: 'Yêu cầu trả hàng' })).toHaveCount(0);

    body = order({ canReturn: true });
    await lookUp(page);
    await expect(page.getByRole('link', { name: 'Yêu cầu trả hàng' })).toBeVisible();
    await expect(page.getByText('Hạn gửi yêu cầu: hết ngày')).toBeVisible();
  });

  test('AC-RET-61/62: same form, guest endpoints, one key across a retry, then cancel', async ({
    page,
  }) => {
    await useGuestReturns(page);
    let current = order();
    await page.route('**/api/orders/lookup/verify', (route) => fulfil(route, 200, current));
    await page.route(`**/api/orders/${CODE}`, (route) => fulfil(route, 200, current));
    const uploads: { type: string | undefined; size: number }[] = [];
    await page.route(`**/api/orders/${CODE}/return/photos`, async (route) => {
      uploads.push({
        type: route.request().headers()['content-type'],
        size: route.request().postDataBuffer()?.length ?? 0,
      });
      await fulfil(route, 201, {
        id: PHOTO,
        url: `/api/orders/${CODE}/return/photos/${PHOTO}`,
        width: 300,
        height: 300,
        size: PNG.length,
        contentType: 'image/png',
      });
    });
    await page.route(`**/api/orders/${CODE}/return/estimate`, (route) =>
      fulfil(route, 200, {
        goodsAmount: 500_000,
        shippingRefund: 0,
        returnShippingFee: 0,
        amount: 500_000,
        final: false,
      }),
    );
    const sent: { key: string | undefined; body: Json }[] = [];
    await page.route(`**/api/orders/${CODE}/return`, async (route) => {
      sent.push({
        key: route.request().headers()['idempotency-key'],
        body: route.request().postDataJSON() as Json,
      });
      if (sent.length === 1) return route.abort('failed');
      current = order({ canReturn: false, return: returnCase('requested') });
      await fulfil(route, 200, returnCase('requested'), { 'Idempotency-Replayed': 'true' });
    });
    let cancelled = 0;
    await page.route(`**/api/orders/${CODE}/return/cancel`, async (route) => {
      cancelled++;
      current = order({ canReturn: true });
      await fulfil(route, 200, returnCase('cancelled', { canCancel: false }));
    });

    await lookUp(page);
    await page.getByRole('link', { name: 'Yêu cầu trả hàng' }).click();
    await expect(page).toHaveURL(new RegExp(`/track-order/${CODE}/return$`));
    await expect(page.getByRole('heading', { name: 'Yêu cầu trả hàng' })).toBeVisible();
    await page.getByRole('checkbox', { name: /Áo blazer thường ngày/ }).check();
    await page.getByRole('radio', { name: /Giao sai size/ }).check();
    await page.getByLabel('Mô tả').fill('Đặt size M nhưng nhận size L.');
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'tem.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'tem.png' })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    expect(uploads).toEqual([{ type: 'image/png', size: PNG.length }]);
    await page.getByLabel('Ngân hàng').fill('Vietcombank');
    await page.getByLabel('Số tài khoản').fill('0123 456 789');
    await page.getByLabel('Chủ tài khoản').fill('Nguyễn An');

    await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'thông tin bạn nhập vẫn được giữ' }),
    ).toBeVisible();
    await expect(page.getByLabel('Mô tả')).toHaveValue('Đặt size M nhưng nhận size L.');
    await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();

    // Back on Tra cứu đơn with the order read again: the request shows, no second code needed.
    await expect(page).toHaveURL(/\/track-order\?orderCode=/);
    const status = page.getByTestId('return-status');
    await expect(status.getByTestId('return-state')).toHaveText('Chờ nine2fine duyệt');
    expect(sent).toHaveLength(2);
    expect(sent[1].key).toBe(sent[0].key);
    expect(sent[0].body).toMatchObject({
      lines: [{ variantId: V1, quantity: 1 }],
      reason: 'wrong-size',
      photos: [PHOTO],
      bank: 'Vietcombank',
      accountNumber: '0123456789',
    });

    await status.getByRole('button', { name: 'Huỷ yêu cầu' }).click();
    await status.getByRole('button', { name: 'Xác nhận huỷ' }).click();
    await expect.poll(() => cancelled).toBe(1);
    await expect(page.getByRole('link', { name: 'Yêu cầu trả hàng' })).toBeVisible();
  });

  test('AC-RET-60: a lapsed view says so and points back to the lookup', async ({ page }) => {
    await useGuestReturns(page);
    await page.route('**/api/orders/lookup/verify', (route) => fulfil(route, 200, order()));
    await page.route(`**/api/orders/${CODE}`, (route) => fulfil(route, 200, order()));
    await page.route(`**/api/orders/${CODE}/return/estimate`, (route) =>
      fulfil(route, 401, apiError('unauthenticated')),
    );
    await page.route(`**/api/orders/${CODE}/return`, (route) =>
      fulfil(route, 401, apiError('unauthenticated')),
    );
    await lookUp(page);
    await page.getByRole('link', { name: 'Yêu cầu trả hàng' }).click();
    await page.getByRole('checkbox', { name: /Áo blazer thường ngày/ }).check();
    await page.getByRole('radio', { name: /Không vừa/ }).check();
    await page.getByLabel('Sản phẩm còn nguyên tem nhãn').check();
    await page.getByLabel('Ngân hàng').fill('Vietcombank');
    await page.getByLabel('Số tài khoản').fill('0123456789');
    await page.getByLabel('Chủ tài khoản').fill('Nguyễn An');
    await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Phiên xem đơn đã hết hạn' }),
    ).toBeVisible();
  });

  test('AC-RET-66: policy and help name the order lookup as a way to send the request', async ({
    page,
  }) => {
    await useGuestReturns(page);
    await page.goto('/policies/returns');
    await expect(
      page.getByText(/vào Tra cứu đơn hàng, nhập mã đơn và email đặt hàng/),
    ).toBeVisible();
    await expect(page.getByText(/gọi .* \/ gửi email/)).toBeVisible();
  });
});
