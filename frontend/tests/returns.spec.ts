import { expect, Page, Route, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';

/**
 * Slice 9 storefront (member returns) on the HTTP adapters: `returnsMode = http` makes the e2e build
 * read orders from `/api/orders*` and send `/api/account/**`, all answered here by `page.route`
 * with bodies shaped like docs/api/openapi.yaml. AC-RET-04 / 23 / 24 / 54 FE parts; what needs the
 * database (races, amounts, stock) belongs to the backend tests.
 */
const member = MOCK_ACCOUNTS[0];
const CODE = 'N2F2611120001';
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const PHOTO = '33333333-3333-4333-8333-333333333333';
// 1x1 would be refused by the real server (200 px minimum); the stand-in accepts any bytes.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type Json = Record<string, unknown>;

function reasonFault(reason: string): 'shop' | 'customer' {
  return ['wrong-size', 'wrong-color', 'wrong-item', 'defective'].includes(reason)
    ? 'shop'
    : 'customer';
}

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
        quantity: 2,
        unitPrice: 500_000,
        mediaId: 'editorial-home-hero',
        lineDiscount: 100_000,
      },
      {
        variantId: V2,
        productSlug: 'the-everyday-tee',
        name: 'Áo thun cơ bản',
        color: 'Trắng',
        size: 'L',
        quantity: 1,
        unitPrice: 200_000,
        mediaId: 'editorial-home-hero',
      },
    ],
    pricing: {
      subtotal: 1_200_000,
      discount: 100_000,
      shippingFee: 0,
      shippingDiscount: 0,
      total: 1_100_000,
    },
    recipient: { name: 'Nguyễn An', phone: '0987654321', email: member.email },
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
    reason: 'not-fit',
    fault: 'customer',
    detail: '',
    conditionAck: true,
    requestedAt: '2026-11-10T03:00:00.000Z',
    lines: [
      {
        variantId: V2,
        name: 'Áo thun cơ bản',
        color: 'Trắng',
        size: 'L',
        sku: 'TEE-W-L',
        mediaId: 'editorial-home-hero',
        quantity: 1,
        goodsAmount: 200_000,
      },
    ],
    photos: [],
    amount: {
      goodsAmount: 200_000,
      shippingRefund: 0,
      returnShippingFee: 30_000,
      amount: 170_000,
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

async function useReturns(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('n2f.e2e.returnsMode', 'http'));
}

async function signIn(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page).toHaveURL(/\/auth\/login\?returnUrl=/);
  await page.getByLabel('Email').fill(member.email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã xác thực (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

test.describe('storefront returns on the API (Slice 9)', () => {
  test('AC-RET-23: button only when the server says canReturn, no client clock', async ({
    page,
  }) => {
    await useReturns(page);
    let body = order({ canReturn: false, returnDeadline: '2020-01-01T00:00:00.000Z' });
    await page.route(`**/api/orders/${CODE}`, (route) => fulfil(route, 200, body));
    await signIn(page, `/account/orders/${CODE}`);
    await expect(page.getByRole('heading', { name: `Đơn #${CODE}` })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Yêu cầu trả hàng' })).toHaveCount(0);
    // The server's flag, not the date, decides: a past deadline with canReturn = true still shows it.
    body = order({ canReturn: true, returnDeadline: '2020-01-01T00:00:00.000Z' });
    await page.reload();
    await expect(page.getByRole('heading', { name: `Đơn #${CODE}` })).toBeVisible();
  });

  test('AC-RET-24: form sends raw photo bytes and one idempotency key across a retry', async ({
    page,
  }) => {
    await useReturns(page);
    await page.route(`**/api/orders/${CODE}`, (route) => fulfil(route, 200, order()));
    const uploads: { type: string | undefined; size: number }[] = [];
    await page.route('**/api/account/return-photos', async (route) => {
      uploads.push({
        type: route.request().headers()['content-type'],
        size: route.request().postDataBuffer()?.length ?? 0,
      });
      await fulfil(route, 201, {
        id: PHOTO,
        url: `/api/account/return-photos/${PHOTO}`,
        width: 300,
        height: 300,
        size: PNG.length,
        contentType: 'image/png',
      });
    });
    await page.route(`**/api/account/orders/${CODE}/return/estimate`, (route) =>
      fulfil(route, 200, {
        goodsAmount: 400_000,
        shippingRefund: 0,
        returnShippingFee: 0,
        amount: 400_000,
        final: false,
      }),
    );
    const sent: { key: string | undefined; body: Json }[] = [];
    await page.route(`**/api/account/orders/${CODE}/return`, async (route) => {
      const body = route.request().postDataJSON() as Json;
      sent.push({ key: route.request().headers()['idempotency-key'], body });
      if (sent.length === 1) return route.abort('failed'); // connection lost: the answer never comes
      await fulfil(route, 200, returnCase('requested', { reason: 'defective', fault: 'shop' }), {
        'Idempotency-Replayed': 'true',
      });
    });

    await signIn(page, `/account/orders/${CODE}/return`);
    await expect(page.getByRole('heading', { name: 'Yêu cầu trả hàng' })).toBeVisible();
    await page.getByRole('checkbox', { name: /Áo blazer thường ngày/ }).check();
    await page.getByRole('radio', { name: /Giao sai size/ }).check();
    // Seller fault: photo and description are required.
    await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();
    await expect(page.getByText('Vui lòng thêm ít nhất 1 ảnh sản phẩm.')).toBeVisible();
    await page.getByLabel('Mô tả').fill('Đặt size M nhưng nhận size L.');
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'tem.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'tem.png' })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    expect(uploads).toEqual([{ type: 'image/png', size: PNG.length }]);
    // The server amount replaces the local one.
    await expect(
      page
        .getByText('Dự kiến hoàn')
        .locator('..')
        .getByText(/400\.000\s?₫/),
    ).toBeVisible();
    // COD: bank account is required.
    await page.getByLabel('Ngân hàng').fill('Vietcombank');
    await page.getByLabel('Số tài khoản').fill('0123 456 789');
    await page.getByLabel('Chủ tài khoản').fill('Nguyễn An');

    await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'thông tin bạn nhập vẫn được giữ' }),
    ).toBeVisible();
    // Nothing was lost: the same values are still there.
    await expect(page.getByLabel('Mô tả')).toHaveValue('Đặt size M nhưng nhận size L.');
    await expect(page.getByLabel('Số tài khoản')).toHaveValue('0123 456 789');
    await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${CODE}$`));
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã gửi yêu cầu trả hàng' }),
    ).toBeVisible();

    expect(sent).toHaveLength(2);
    expect(sent[0].key).toBeTruthy();
    expect(sent[1].key).toBe(sent[0].key);
    expect(sent[0].body).toEqual({
      lines: [{ variantId: V1, quantity: 2 }],
      reason: 'wrong-size',
      detail: 'Đặt size M nhưng nhận size L.',
      photos: [PHOTO],
      bank: 'Vietcombank',
      accountNumber: '0123456789',
      accountName: 'Nguyễn An',
    });
  });

  test('AC-RET-24: 422 puts each message on its own field', async ({ page }) => {
    await useReturns(page);
    await page.route(`**/api/orders/${CODE}`, (route) => fulfil(route, 200, order()));
    await page.route(`**/api/account/orders/${CODE}/return/estimate`, (route) =>
      fulfil(route, 500, {}),
    );
    await page.route(`**/api/account/orders/${CODE}/return`, (route) =>
      fulfil(
        route,
        422,
        apiError('validation', 'Số tài khoản gồm 6–19 chữ số.', {
          field: 'accountNumber',
          fieldErrors: [
            { field: 'accountNumber', message: 'Số tài khoản không hợp lệ theo ngân hàng.' },
            { field: 'bank', message: 'Ngân hàng chưa được hỗ trợ.' },
          ],
        }),
      ),
    );
    await signIn(page, `/account/orders/${CODE}/return`);
    await page.getByRole('checkbox', { name: /Áo thun cơ bản/ }).check();
    await page.getByRole('radio', { name: /Không vừa/ }).check();
    await page.getByLabel('Ngân hàng').fill('ABC');
    await page.getByLabel('Số tài khoản').fill('123456');
    await page.getByLabel('Chủ tài khoản').fill('Nguyễn An');
    await page.getByRole('checkbox', { name: /còn nguyên tem nhãn/ }).check();
    await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();
    await expect(page.getByText('Số tài khoản không hợp lệ theo ngân hàng.')).toBeVisible();
    await expect(page.getByText('Ngân hàng chưa được hỗ trợ.')).toBeVisible();
    // Editing a field clears the server's complaint about the whole form.
    await page.getByLabel('Số tài khoản').fill('1234567');
    await expect(page.getByText('Số tài khoản không hợp lệ theo ngân hàng.')).toHaveCount(0);
  });

  for (const [code, text] of [
    ['return-window-closed', 'quá thời hạn trả hàng'],
    ['not-returnable', 'chưa đủ điều kiện để trả hàng'],
    ['return-exists', 'đã có yêu cầu trả hàng'],
  ] as const) {
    test(`AC-RET-24: 409 ${code} has its own sentence and a link to the order`, async ({
      page,
    }) => {
      await useReturns(page);
      await page.route(`**/api/orders/${CODE}`, (route) => fulfil(route, 200, order()));
      await page.route(`**/api/account/orders/${CODE}/return/estimate`, (route) =>
        fulfil(route, 500, {}),
      );
      await page.route(`**/api/account/orders/${CODE}/return`, (route) =>
        fulfil(route, 409, apiError(code)),
      );
      await signIn(page, `/account/orders/${CODE}/return`);
      await page.getByRole('checkbox', { name: /Áo thun cơ bản/ }).check();
      await page.getByRole('radio', { name: /Không vừa/ }).check();
      await page.getByLabel('Ngân hàng').fill('Vietcombank');
      await page.getByLabel('Số tài khoản').fill('0123456789');
      await page.getByLabel('Chủ tài khoản').fill('Nguyễn An');
      await page.getByRole('checkbox', { name: /còn nguyên tem nhãn/ }).check();
      await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();
      const alert = page.getByRole('alert').filter({ hasText: text });
      await expect(alert).toBeVisible();
      await expect(alert.getByRole('link', { name: 'Xem chi tiết đơn' })).toBeVisible();
    });
  }

  test('AC-RET-20, 23: status block shows state, amount, masked account; cancel works', async ({
    page,
  }) => {
    await useReturns(page);
    let current = order({ canReturn: false, return: returnCase('requested') });
    await page.route(`**/api/orders/${CODE}`, (route) => fulfil(route, 200, current));
    await page.route(`**/api/account/orders/${CODE}/return/cancel`, (route) => {
      current = order({
        canReturn: true,
        return: returnCase('cancelled', {
          canCancel: false,
          cancelledAt: '2026-11-11T03:00:00.000Z',
        }),
      });
      return fulfil(route, 200, returnCase('cancelled', { canCancel: false }));
    });
    await signIn(page, `/account/orders/${CODE}`);
    const block = page.getByTestId('return-status');
    await expect(block.getByTestId('return-state')).toHaveText('Chờ nine2fine duyệt');
    await expect(page.getByText('Đang xử lý trả hàng').first()).toBeVisible();
    await expect(block.getByTestId('return-amount')).toContainText(/170\.000\s?₫/);
    await expect(block.getByTestId('return-amount')).toContainText(
      'Dự kiến, chốt sau khi nine2fine kiểm hàng',
    );
    await expect(block.getByTestId('return-refund-to')).toHaveText(
      /Vietcombank · \*{4}6789 · NGUYEN AN/,
    );
    await expect(page.getByRole('link', { name: 'Yêu cầu trả hàng' })).toHaveCount(0);
    await block.getByRole('button', { name: 'Huỷ yêu cầu' }).click();
    await block.getByRole('button', { name: 'Xác nhận huỷ' }).click();
    await expect(block.getByTestId('return-state')).toHaveText('Đã huỷ yêu cầu');
    await expect(page.getByRole('link', { name: 'Yêu cầu trả hàng' })).toBeVisible();
  });

  test('AC-RET-23: approved cannot be cancelled online; refunded shows the settled amount', async ({
    page,
  }) => {
    await useReturns(page);
    let current = order({
      canReturn: false,
      return: returnCase('approved', { instructions: 'Gửi về 1 Hoàng Diệu.', canCancel: false }),
    });
    await page.route(`**/api/orders/${CODE}`, (route) => fulfil(route, 200, current));
    await signIn(page, `/account/orders/${CODE}`);
    const block = page.getByTestId('return-status');
    await expect(block.getByTestId('return-state')).toHaveText('Đã duyệt, chờ bạn gửi hàng');
    await expect(block.getByText('Gửi về 1 Hoàng Diệu.')).toBeVisible();
    await expect(block.getByRole('button', { name: 'Huỷ yêu cầu' })).toHaveCount(0);
    current = order({
      canReturn: false,
      paymentStatus: 'partially_refunded',
      return: returnCase('refunded', {
        canCancel: false,
        refundedAt: '2026-11-12T03:00:00.000Z',
        refundedAmount: 170_000,
        amount: {
          goodsAmount: 200_000,
          shippingRefund: 0,
          returnShippingFee: 30_000,
          amount: 170_000,
          final: true,
        },
      }),
    });
    await page.reload();
    await expect(block.getByTestId('return-state')).toHaveText('Đã hoàn tiền');
    await expect(block.getByTestId('return-amount')).toContainText(/170\.000\s?₫/);
    await expect(page.getByText('Hoàn thành').first()).toBeVisible();
  });

  test('AC-RET-54: help page no longer says the shop bears all return shipping', async ({
    page,
  }) => {
    await page.goto('/help');
    await expect(
      page.getByText('nine2fine chịu toàn bộ phí gửi trả', { exact: false }),
    ).toHaveCount(0);
    await expect(page.getByText(/phí gửi trả 30\.000\s?₫ được trừ/).first()).toBeAttached();
    await page.goto('/policies/returns');
    await expect(page.getByText('đến hết ngày thứ 30', { exact: false })).toBeVisible();
    await expect(page.getByText('Dự kiến nine2fine xác nhận', { exact: false })).toBeVisible();
  });
});
