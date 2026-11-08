import { expect, Page, test } from '@playwright/test';

/**
 * Slice 4, lát 4.3 (call attempts, confirm, cancel) and lát 4.4 (ship, deliver, refused /
 * undeliverable, returned stock) on the contract mock. Test names carry the AC ids of
 * docs/product/PRD.md; the parts that need the real database, mail or concurrency (stock under
 * race, e-mails, SQL) belong to the backend tests and the real acceptance of lát 4.7.
 *
 * Seeded orders (src/mocks/admin/order-desk-fixtures.ts):
 *  - N2F2611081801 COD, to confirm, 0 calls, blazer x2 (blazer stock starts at 3)
 *  - N2F2611051005 COD, to confirm, 0 calls; N2F2611051004 COD, to confirm, 3 calls in 4 hours
 *  - N2F2611072359 COD confirmed; N2F2611051006 bank transfer paid; N2F2611051008 COD confirmed
 *  - N2F2611041777 / N2F2611051010 COD in transit (GHTK-41777 / GHTK-51010)
 *  - N2F2611051015 / N2F2611051016 cancelled from transit, returned stock pending
 */
const MODE_KEY = 'n2f.e2e.adminOrdersMode';
const FLAG_KEY = 'n2f.e2e.orderDeskActionFail';
const CALLS_KEY = 'n2f.e2e.orderDeskCalls';
const STOCK_KEY = 'n2f.e2e.orderDeskStock';
const BLAZER = '11111111-1111-4111-8111-111111111111';
const TEE = '22222222-2222-4222-8222-222222222222';
const PANTS = '33333333-3333-4333-8333-333333333333';

const STAFF = ['staff@nine2fine.vn', 'Staff2026Mock'] as const;
const ADMIN = ['admin@nine2fine.vn', 'Admin2026Mock'] as const;

async function signIn(page: Page, who: readonly [string, string] = ADMIN): Promise<void> {
  await page.addInitScript((key) => localStorage.setItem(key, 'contract-mock'), MODE_KEY);
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(who[0]);
  await page.getByLabel('Mật khẩu').fill(who[1]);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/admin\/orders/);
}

async function openOrder(page: Page, code: string): Promise<void> {
  await page.goto(`/admin/orders/${code}`);
  await expect(page.getByRole('heading', { name: `#${code}` })).toBeVisible();
}

const flag = (page: Page, value: string) =>
  page.evaluate(([key, v]) => localStorage.setItem(key, v), [FLAG_KEY, value]);
const calls = (page: Page) =>
  page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) ?? '[]') as {
        code: string;
        action: string;
        key: string;
        body: Record<string, unknown>;
      }[],
    CALLS_KEY,
  );
const stock = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>,
    STOCK_KEY,
  );

const dialog = (page: Page) => page.getByRole('dialog');
const carrierIn = (page: Page) => page.locator('#desk-carrier');
const trackingIn = (page: Page) => page.locator('#desk-tracking');
const notice = (page: Page) => page.getByTestId('order-notice');
const trigger = (page: Page, kind: string) => page.locator(`[data-action="${kind}"]`);
const radio = (page: Page, name: RegExp) => dialog(page).getByRole('radio', { name });
const submitIn = (page: Page, name: string) =>
  dialog(page).getByRole('button', { name, exact: true });

async function expectNoNotice(page: Page): Promise<void> {
  await expect(notice(page)).toHaveCount(0);
}

/** Opens the picker and returns the visible reasons (radio labels). */
async function reasonsOf(page: Page): Promise<string[]> {
  await trigger(page, 'cancel').click();
  await expect(dialog(page)).toBeVisible();
  const names = await dialog(page)
    .getByRole('radio')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement).closest('label')?.textContent?.trim() ?? ''),
    );
  return names;
}

async function closeDialog(page: Page): Promise<void> {
  await dialog(page).getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}

/** Records one "không liên lạc được" at the fixed clock time `at`. */
async function recordCall(page: Page, at: string): Promise<void> {
  await page.clock.setFixedTime(new Date(at));
  await trigger(page, 'call-attempt').click();
  await submitIn(page, 'Ghi nhận').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(notice(page)).toContainText('Đã ghi nhận không liên lạc được');
}

test.describe('lát 4.3: call attempts, confirm, cancel', () => {
  test('AC-ADM-18: call attempt keeps the order to confirm, note 250 ok and 251 refused, no button when not needed', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051005');
    await trigger(page, 'call-attempt').click();
    await dialog(page)
      .getByLabel(/Ghi chú nội bộ/)
      .fill('x'.repeat(251));
    await submitIn(page, 'Ghi nhận').click();
    await expect(dialog(page).getByText('Ghi chú tối đa 250 ký tự.')).toBeVisible();
    expect(await calls(page)).toHaveLength(0);
    await dialog(page)
      .getByLabel(/Ghi chú nội bộ/)
      .fill('x'.repeat(250));
    await submitIn(page, 'Ghi nhận').click();
    await expect(notice(page)).toContainText('(1 lần, 1/3 trong 24 giờ)');
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Chờ xác nhận”');
    await expect(page.locator('.timeline .title').first()).toHaveText(
      'Ghi nhận không liên lạc được',
    );
    await expect(page.getByText('Gọi khách xác nhận đơn COD')).toBeVisible();
    // No limit on the number of attempts.
    await trigger(page, 'call-attempt').click();
    await submitIn(page, 'Ghi nhận').click();
    await expect(notice(page)).toContainText('(2 lần, 2/3 trong 24 giờ)');
    const [first, second] = await calls(page);
    expect(first.action).toBe('call-attempt');
    expect(first.body).toMatchObject({ expectedStatus: 'to_ship' });
    expect(second.key).not.toBe(first.key);
    // Bank transfer (no call needed) and completed orders have no such button.
    await openOrder(page, 'N2F2611051006');
    await expect(trigger(page, 'call-attempt')).toHaveCount(0);
    await openOrder(page, 'N2F2611051020');
    await expect(trigger(page, 'call-attempt')).toHaveCount(0);
  });

  test('AC-ADM-19: confirm moves the order from "Chờ xác nhận" to "Đang chuẩn bị" and cannot be repeated', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051005');
    await trigger(page, 'confirm').click();
    await expect(
      dialog(page).getByRole('heading', { name: 'Khách đã xác nhận đơn?' }),
    ).toBeVisible();
    await submitIn(page, 'Xác nhận').click();
    await expect(notice(page)).toContainText('Đã ghi nhận khách xác nhận đơn.');
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Đang chuẩn bị” (6 đơn)');
    await expect(page.getByRole('heading', { name: 'Xác nhận', exact: true })).toBeVisible();
    await expect(trigger(page, 'confirm')).toHaveCount(0);
    await expect(trigger(page, 'call-attempt')).toHaveCount(0);
    await expect(trigger(page, 'ship')).toBeVisible();
    const [sent] = await calls(page);
    expect(sent).toMatchObject({ action: 'confirm', body: { expectedStatus: 'to_ship' } });
  });

  test('AC-ADM-20: unreachable opens only with 3 calls in a 24 h 00 m window (exact 24 h counts, 24 h 01 m does not, early gap does not block)', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    // 3 calls in 4 hours: open.
    await openOrder(page, 'N2F2611051004');
    expect(await reasonsOf(page)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Không liên lạc được/)]),
    );
    await closeDialog(page);
    // t, t+12 h, t+24 h 00 m: open (the 24 h mark counts).
    await openOrder(page, 'N2F2611051005');
    for (const at of [
      '2026-11-08T08:00:00+07:00',
      '2026-11-08T20:00:00+07:00',
      '2026-11-09T08:00:00+07:00',
    ])
      await recordCall(page, at);
    await expect(page.getByText('Cuộc gọi không liên lạc được trong 24 giờ: 3/3')).toBeVisible();
    await trigger(page, 'cancel').click();
    await expect(radio(page, /^Không liên lạc được/)).toBeVisible();
    await closeDialog(page);
    // t, t+12 h, t+24 h 01 m: closed, still 2/3.
    await openOrder(page, 'N2F2611081801');
    for (const at of [
      '2026-11-08T08:00:00+07:00',
      '2026-11-08T20:00:00+07:00',
      '2026-11-09T08:01:00+07:00',
    ])
      await recordCall(page, at);
    await expect(page.getByText('Cuộc gọi không liên lạc được trong 24 giờ: 2/3')).toBeVisible();
    await trigger(page, 'cancel').click();
    await expect(radio(page, /^Không liên lạc được/)).toHaveCount(0);
    await expect(radio(page, /^Khách từ chối khi gọi/)).toBeVisible();
    await closeDialog(page);
    // t, t+30 h, t+31 h, t+32 h: the first call is too far, the last three are inside a window.
    await openOrder(page, 'N2F2611051005');
    for (const at of [
      '2026-11-08T08:00:00+07:00',
      '2026-11-09T14:00:00+07:00',
      '2026-11-09T15:00:00+07:00',
      '2026-11-09T16:00:00+07:00',
    ])
      await recordCall(page, at);
    await expect(page.getByText('Cuộc gọi không liên lạc được trong 24 giờ: 3/3')).toBeVisible();
    await trigger(page, 'cancel').click();
    await expect(radio(page, /^Không liên lạc được/)).toBeVisible();
  });

  test('AC-ADM-21: cancel as unreachable restores stock, shows the standard sentence and "Cửa hàng"', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051004');
    await trigger(page, 'cancel').click();
    await expect(dialog(page).getByRole('heading', { name: 'Huỷ đơn' })).toBeVisible();
    // The reason must be picked first (the red button names the consequence).
    await submitIn(page, 'Huỷ đơn').click();
    await expect(dialog(page).getByText('Chọn lý do huỷ.')).toBeVisible();
    expect(await calls(page)).toHaveLength(0);
    await radio(page, /^Không liên lạc được/).check();
    await submitIn(page, 'Huỷ đơn').click();
    await expect(notice(page)).toContainText(
      'Đã huỷ đơn (Không liên lạc được). Tồn kho đã được cộng lại.',
    );
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Đã huỷ” (6 đơn)');
    await expect(
      page.getByText('Chúng tôi không liên lạc được với bạn để xác nhận đơn.').first(),
    ).toBeVisible();
    await expect(
      page.locator('dl').filter({ hasText: 'Người huỷ' }).getByText('Cửa hàng'),
    ).toBeVisible();
    await expect(page.getByText(/Đã cộng lại tồn kho lúc/)).toBeVisible();
    await expect(page.getByText('Từ chối nhận lúc')).toHaveCount(0);
    // pants x1 and tee x2 go back.
    const after = await stock(page);
    expect([after[PANTS], after[TEE]]).toEqual([11, 12]);
    await expect(trigger(page, 'cancel')).toHaveCount(0);
  });

  test('AC-ADM-22: declined on call only for an unconfirmed order that needs a call', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611072359');
    expect(await reasonsOf(page)).toHaveLength(1);
    await expect(radio(page, /^Khách từ chối khi gọi/)).toHaveCount(0);
    await closeDialog(page);
    await openOrder(page, 'N2F2611051006');
    await trigger(page, 'cancel').click();
    await expect(radio(page, /^Khách từ chối khi gọi/)).toHaveCount(0);
    await closeDialog(page);
    await openOrder(page, 'N2F2611051005');
    await trigger(page, 'cancel').click();
    await radio(page, /^Khách từ chối khi gọi/).check();
    await submitIn(page, 'Huỷ đơn').click();
    await expect(notice(page)).toContainText('Đã huỷ đơn (Khách từ chối khi gọi xác nhận)');
    await expect(page.getByText('Bạn đã báo không muốn nhận đơn.').first()).toBeVisible();
  });

  test('AC-ADM-50: customer_request needs a 5-250 character note, works for every to_ship order, never for in transit', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611081801');
    await trigger(page, 'cancel').click();
    await radio(page, /^Khách yêu cầu huỷ/).check();
    const note = dialog(page).getByLabel(/Ghi chú nội bộ/);
    for (const value of ['', 'abcd', 'x'.repeat(251)]) {
      await note.fill(value);
      await submitIn(page, 'Huỷ đơn').click();
      await expect(dialog(page).getByText('Nhập ghi chú từ 5 đến 250 ký tự.')).toBeVisible();
    }
    expect(await calls(page)).toHaveLength(0);
    await note.fill('Khách gọi hotline lúc 9h xin huỷ');
    await submitIn(page, 'Huỷ đơn').click();
    await expect(notice(page)).toContainText('Tồn kho đã được cộng lại.');
    await expect(
      page.locator('dl').filter({ hasText: 'Người huỷ' }).getByText('Khách', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Đơn đã được huỷ theo yêu cầu của bạn.').first()).toBeVisible();
    await expect(page.getByText('Khách gọi hotline lúc 9h xin huỷ').first()).toBeVisible();
    await expect(page.getByText('Từ chối nhận lúc')).toHaveCount(0);
    expect((await stock(page))[BLAZER]).toBe(5);
    // Confirmed COD and bank transfer to_ship orders accept it too (5 characters is enough).
    for (const code of ['N2F2611072359', 'N2F2611051006']) {
      await openOrder(page, code);
      await trigger(page, 'cancel').click();
      await radio(page, /^Khách yêu cầu huỷ/).check();
      await dialog(page)
        .getByLabel(/Ghi chú nội bộ/)
        .fill('abcde');
      await submitIn(page, 'Huỷ đơn').click();
      await expect(notice(page)).toContainText('Đã huỷ đơn (Khách yêu cầu huỷ');
    }
    // In transit: not offered. Cancel request: no cancel button at all.
    await openOrder(page, 'N2F2611051010');
    await trigger(page, 'cancel').click();
    await expect(radio(page, /^Khách yêu cầu huỷ/)).toHaveCount(0);
    await closeDialog(page);
    await openOrder(page, 'N2F2611051013');
    await expect(trigger(page, 'cancel')).toHaveCount(0);
  });

  test('AC-ADM-29: staff never sees "other"; refused / undeliverable only in transit, unreachable never in transit', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051010');
    await trigger(page, 'cancel').click();
    await expect(radio(page, /^Lý do khác/)).toHaveCount(0);
    await expect(radio(page, /^Không liên lạc được/)).toHaveCount(0);
    await expect(radio(page, /^Khách từ chối nhận hàng/)).toBeVisible();
    await expect(radio(page, /^Giao không thành/)).toBeVisible();
    await closeDialog(page);
    await openOrder(page, 'N2F2611081801');
    await trigger(page, 'cancel').click();
    await expect(radio(page, /^Khách từ chối nhận hàng/)).toHaveCount(0);
    await expect(radio(page, /^Giao không thành/)).toHaveCount(0);
    await closeDialog(page);
  });

  test('AC-ADM-29: admin cancels "other" with a 5 character note on to_ship and on to_receive', async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    for (const code of ['N2F2611081801', 'N2F2611051010']) {
      await openOrder(page, code);
      await trigger(page, 'cancel').click();
      await radio(page, /^Lý do khác/).check();
      const note = dialog(page).getByLabel(/Ghi chú nội bộ/);
      for (const value of ['', 'abcd', 'x'.repeat(251)]) {
        await note.fill(value);
        await submitIn(page, 'Huỷ đơn').click();
        await expect(dialog(page).getByText('Nhập ghi chú từ 5 đến 250 ký tự.')).toBeVisible();
      }
      await note.fill('Lệch kho');
      await submitIn(page, 'Huỷ đơn').click();
      await expect(notice(page)).toContainText('Đã huỷ đơn (Lý do khác)');
      await expect(page.getByText('nine2fine không thể thực hiện đơn này.').first()).toBeVisible();
    }
  });

  test('AC-ADM-04: a 403 on a write shows the message, closes the dialog and keeps the order', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051005');
    await flag(page, 'forbidden-once');
    await trigger(page, 'confirm').click();
    await submitIn(page, 'Xác nhận').click();
    await expect(page.getByRole('alert')).toContainText('không có quyền thực hiện thao tác này');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText('Gọi khách xác nhận đơn COD')).toBeVisible();
  });
});

test.describe('lát 4.4: ship, deliver, returned stock', () => {
  test('AC-ADM-23: carrier 2-50 and tracking 4-40 of letters, digits and "-" are checked before sending; a code used by another open order is refused', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611072359');
    await trigger(page, 'ship').click();
    const carrier = carrierIn(page);
    const tracking = trackingIn(page);
    const send = submitIn(page, 'Bàn giao');
    await carrier.fill('G');
    await tracking.fill('ghtk-12345');
    await send.click();
    await expect(dialog(page).getByText(/Đơn vị vận chuyển từ 2 đến 50 ký tự/)).toBeVisible();
    await carrier.fill('G'.repeat(51));
    await send.click();
    await expect(dialog(page).getByText(/Đơn vị vận chuyển từ 2 đến 50 ký tự/)).toBeVisible();
    await carrier.fill('GHTK');
    for (const bad of ['abc', 'ab c!', 'A'.repeat(41), '']) {
      await tracking.fill(bad);
      await send.click();
      await expect(dialog(page).getByText(/Mã vận đơn từ 4 đến 40 ký tự/)).toBeVisible();
    }
    expect(await calls(page)).toHaveLength(0);
    // The server also refuses a code another open order uses (case-insensitive); input is kept.
    await tracking.fill('ghtk-41777');
    await send.click();
    await expect(dialog(page).getByText('Mã vận đơn này đã dùng cho đơn khác.')).toBeVisible();
    await expect(tracking).toHaveValue('ghtk-41777');
    await expect(carrier).toHaveValue('GHTK');
    await expect(send).toBeEnabled();
  });

  test('AC-ADM-24: ship stores the upper-case code, keeps the estimate and COD payment; no ship button while a call is pending; recent carriers are suggested', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611081801');
    await expect(trigger(page, 'ship')).toHaveCount(0);
    await openOrder(page, 'N2F2611072359');
    await trigger(page, 'ship').click();
    const options = dialog(page).locator('#desk-carriers option');
    await expect(options).toHaveCount(4);
    expect(
      await options.evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value)),
    ).toEqual(['GHN', 'GHTK', 'Viettel Post', 'J&T']);
    await carrierIn(page).fill('Nhanh ABC');
    await trackingIn(page).fill('ghtk-12345');
    await submitIn(page, 'Bàn giao').click();
    await expect(notice(page)).toContainText('Đã bàn giao cho Nhanh ABC, mã vận đơn GHTK-12345.');
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Đang vận chuyển” (5 đơn)');
    await expect(page.locator('dl').filter({ hasText: 'Mã vận đơn' }).locator('.mono')).toHaveText(
      'GHTK-12345',
    );
    await expect(page.getByText('2026-11-10 đến 2026-11-13')).toBeVisible();
    await expect(page.getByText('Thu khi giao').first()).toBeVisible();
    await expect(page.locator('.timeline .title').first()).toHaveText('Bàn giao vận chuyển');
    await expect(page.locator('.timeline li').first()).toContainText('Nhanh ABC - GHTK-12345');
    await expect(trigger(page, 'ship')).toHaveCount(0);
    // Next time the used name comes first.
    await openOrder(page, 'N2F2611051008');
    await trigger(page, 'ship').click();
    const next = dialog(page).locator('#desk-carriers option');
    await expect(next).toHaveCount(5);
    expect(
      (await next.evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value)))[0],
    ).toBe('Nhanh ABC');
  });

  test('AC-ADM-24: a bank transfer order ships without a call; condition-not-met reloads the order with a clear message', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051006');
    await trigger(page, 'ship').click();
    await carrierIn(page).fill('GHN');
    await trackingIn(page).fill('GHN-0006');
    await submitIn(page, 'Bàn giao').click();
    await expect(notice(page)).toContainText('Đã bàn giao cho GHN');
    await openOrder(page, 'N2F2611072359');
    await flag(page, 'condition-once');
    await trigger(page, 'ship').click();
    await carrierIn(page).fill('GHN');
    await trackingIn(page).fill('GHN-7777');
    await submitIn(page, 'Bàn giao').click();
    await expect(page.getByRole('alert')).toContainText(
      'khách chưa xác nhận nên chưa thể bàn giao',
    );
    await expect(dialog(page)).toHaveCount(0);
  });

  test('AC-ADM-26: deliver completes the order, collects COD, and is final', async ({ page }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051010');
    await trigger(page, 'deliver').click();
    await expect(
      dialog(page).getByRole('heading', { name: 'Xác nhận giao thành công?' }),
    ).toBeVisible();
    await submitIn(page, 'Giao xong').click();
    await expect(notice(page)).toContainText('Đã giao thành công');
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Hoàn thành” (21 đơn)');
    await expect(page.getByText('Giao xong lúc')).toBeVisible();
    await expect(page.getByText('Đã thanh toán').first()).toBeVisible();
    await expect(page.locator('.timeline .title').first()).toHaveText('Giao hàng thành công');
    for (const kind of ['deliver', 'cancel', 'ship', 'confirm', 'call-attempt', 'restock'])
      await expect(trigger(page, kind)).toHaveCount(0);
  });

  test('AC-ADM-27: a completed or cancelled order offers no action', async ({ page }) => {
    await signIn(page, ADMIN);
    for (const code of ['N2F2611051020', 'N2F2611051040']) {
      await openOrder(page, code);
      for (const kind of [
        'cancel',
        'ship',
        'deliver',
        'confirm',
        'call-attempt',
        'restock',
        'write-off',
      ])
        await expect(trigger(page, kind)).toHaveCount(0);
    }
  });

  test('AC-ADM-31: refused from transit does not restore stock, records the refusal and moves to "Hàng hoàn"', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051010');
    await trigger(page, 'cancel').click();
    await radio(page, /^Khách từ chối nhận hàng/).check();
    await submitIn(page, 'Huỷ đơn').click();
    await expect(notice(page)).toContainText('Hàng chờ về kho: xử lý ở tab Hàng hoàn.');
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Hàng hoàn” (3 đơn)');
    await expect(page.getByText('Từ chối nhận lúc')).toBeVisible();
    await expect(page.getByText('Đơn không được nhận khi giao hàng.').first()).toBeVisible();
    await expect(page.getByText(/Đã cộng lại tồn kho lúc/)).toHaveCount(0);
    expect((await stock(page))[TEE]).toBe(10);
    await expect(trigger(page, 'restock')).toBeVisible();
    await expect(trigger(page, 'write-off')).toBeVisible();
  });

  test('AC-ADM-31: undeliverable is not a refusal (no refusal time)', async ({ page }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051011');
    await trigger(page, 'cancel').click();
    await radio(page, /^Giao không thành/).check();
    await submitIn(page, 'Huỷ đơn').click();
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Hàng hoàn” (3 đơn)');
    await expect(page.getByText('Từ chối nhận lúc')).toHaveCount(0);
    await expect(page.getByText('Giao hàng không thành công.').first()).toBeVisible();
  });

  test('AC-ADM-33: restocking returned goods adds the stock once and the order leaves "Hàng hoàn"', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051016');
    await trigger(page, 'restock').click();
    await expect(dialog(page).getByRole('heading', { name: 'Cộng lại tồn kho?' })).toBeVisible();
    await submitIn(page, 'Cộng lại tồn kho').click();
    await expect(notice(page)).toContainText('Đã cộng lại tồn kho cho hàng hoàn.');
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Đã huỷ” (6 đơn)');
    await expect(page.locator('section[aria-labelledby="return-title"]')).toContainText(
      'Đã cộng lại tồn kho.',
    );
    const after = await stock(page);
    expect([after[PANTS], after[TEE]]).toEqual([11, 12]);
    await expect(trigger(page, 'restock')).toHaveCount(0);
    await expect(trigger(page, 'write-off')).toHaveCount(0);
    await expect(page.locator('.timeline .title').first()).toHaveText('Hàng hoàn đã về kho');
  });

  test('AC-ADM-33: a colleague restocked first, the second write is refused and stock is added once', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051015');
    await flag(page, 'conflict-once');
    await trigger(page, 'restock').click();
    await submitIn(page, 'Cộng lại tồn kho').click();
    await expect(page.getByRole('alert')).toContainText('không còn hợp lệ');
    await expect(page.locator('section[aria-labelledby="return-title"]')).toContainText(
      'Đã cộng lại tồn kho.',
    );
    await expect(trigger(page, 'restock')).toHaveCount(0);
    expect((await stock(page))[TEE]).toBe(11);
  });

  test('AC-ADM-34: written off needs a 5-250 character note, adds no stock, leaves "Hàng hoàn"', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051015');
    await trigger(page, 'write-off').click();
    const note = dialog(page).getByLabel(/Lý do loại bỏ/);
    for (const value of ['', 'abcd']) {
      await note.fill(value);
      await submitIn(page, 'Loại bỏ hàng hoàn').click();
      await expect(dialog(page).getByText('Nhập ghi chú từ 5 đến 250 ký tự.')).toBeVisible();
    }
    expect(await calls(page)).toHaveLength(0);
    await note.fill('Hàng hỏng ướt');
    await submitIn(page, 'Loại bỏ hàng hoàn').click();
    await expect(notice(page)).toContainText('Đã loại bỏ hàng hoàn, không cộng tồn kho.');
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Đã huỷ” (6 đơn)');
    await expect(page.getByText(/Đã loại bỏ, không cộng tồn kho/)).toBeVisible();
    expect((await stock(page))[TEE]).toBe(10);
    await expect(trigger(page, 'restock')).toHaveCount(0);
  });

  test('AC-ADM-16: another staff member shipped first (409 order-state-changed): the server order is shown with the message, nothing is overwritten', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611072359');
    await flag(page, 'conflict-once');
    await trigger(page, 'ship').click();
    await carrierIn(page).fill('GHTK');
    await trackingIn(page).fill('GHTK-MINE1');
    await submitIn(page, 'Bàn giao').click();
    await expect(page.getByRole('alert')).toContainText('Đơn vừa được cập nhật bởi người khác.');
    await expect(page.getByRole('alert')).toContainText('chưa được thực hiện');
    await expect(dialog(page)).toHaveCount(0);
    // The colleague's hand-over is what is on screen; ours was not applied.
    await expect(page.locator('dl').filter({ hasText: 'Mã vận đơn' }).locator('.mono')).toHaveText(
      'GHN-RACE-2359',
    );
    await expect(trigger(page, 'ship')).toHaveCount(0);
    await expect(trigger(page, 'deliver')).toBeVisible();
    expect(await calls(page)).toHaveLength(1);
  });

  test('AC-ADM-16: the status did not move but the step is gone (invalid-transition): message, order reloaded', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051005');
    await flag(page, 'conflict-once');
    await trigger(page, 'confirm').click();
    await submitIn(page, 'Xác nhận').click();
    await expect(page.getByRole('alert')).toContainText('không còn hợp lệ');
    await expect(trigger(page, 'confirm')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Xác nhận', exact: true })).toBeVisible();
  });

  test('AC-ADM-16: a double click sends one request and the button shows busy', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051008');
    await trigger(page, 'ship').click();
    await carrierIn(page).fill('GHN');
    await trackingIn(page).fill('GHN-0008');
    const send = submitIn(page, 'Bàn giao');
    await send.dblclick();
    await expect(send).toBeDisabled();
    await expect(send).toHaveAttribute('aria-busy', 'true');
    await expect(notice(page)).toContainText('Đã bàn giao cho GHN');
    expect(await calls(page)).toHaveLength(1);
  });

  test('AC-ADM-17: network lost before the request: error, input kept, order unchanged, Thử lại sends the same Idempotency-Key', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611072359');
    await flag(page, 'network-before-once');
    await trigger(page, 'ship').click();
    await carrierIn(page).fill('GHTK');
    await trackingIn(page).fill('ghtk-12345');
    await submitIn(page, 'Bàn giao').click();
    await expect(dialog(page).getByRole('alert')).toContainText('Không kết nối được máy chủ');
    await expect(trackingIn(page)).toHaveValue('ghtk-12345');
    await expect(carrierIn(page)).toHaveValue('GHTK');
    await expectNoNotice(page);
    await expect(trigger(page, 'ship')).toBeVisible();
    await submitIn(page, 'Thử lại').click();
    await expect(notice(page)).toContainText('Đã bàn giao cho GHTK, mã vận đơn GHTK-12345.');
    const sent = await calls(page);
    expect(sent).toHaveLength(2);
    expect(sent[1].key).toBe(sent[0].key);
    expect(sent[1].key).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(sent[1].body).toEqual(sent[0].body);
  });

  test('AC-ADM-17: edited input after a failure is a new intention and gets a new key', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611072359');
    await flag(page, 'network-before-once');
    await trigger(page, 'ship').click();
    await carrierIn(page).fill('GHTK');
    await trackingIn(page).fill('GHTK-11111');
    await submitIn(page, 'Bàn giao').click();
    await expect(dialog(page).getByRole('alert')).toBeVisible();
    await trackingIn(page).fill('GHTK-22222');
    await submitIn(page, 'Thử lại').click();
    await expect(notice(page)).toContainText('GHTK-22222');
    const sent = await calls(page);
    expect(sent[1].key).not.toBe(sent[0].key);
  });

  test('AC-ADM-17: answer lost after the server did the work: Thử lại loads the order first and does not send again', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051008');
    await flag(page, 'network-after-once');
    await trigger(page, 'ship').click();
    await carrierIn(page).fill('GHN');
    await trackingIn(page).fill('GHN-0008');
    await submitIn(page, 'Bàn giao').click();
    await expect(dialog(page).getByRole('alert')).toContainText('Không kết nối được máy chủ');
    await submitIn(page, 'Thử lại').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('Đã tải lại đơn, không gửi lại');
    await expect(page.locator('dl').filter({ hasText: 'Mã vận đơn' }).locator('.mono')).toHaveText(
      'GHN-0008',
    );
    await expect(
      page.locator('.timeline .title').filter({ hasText: 'Bàn giao vận chuyển' }),
    ).toHaveCount(1);
    expect(await calls(page)).toHaveLength(1);
  });

  test('AC-ADM-17: a call attempt whose answer was lost is retried with the same key and recorded once', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051005');
    await flag(page, 'network-after-once');
    await trigger(page, 'call-attempt').click();
    await submitIn(page, 'Ghi nhận').click();
    await expect(dialog(page).getByRole('alert')).toBeVisible();
    await submitIn(page, 'Thử lại').click();
    await expect(notice(page)).toContainText('(1 lần, 1/3 trong 24 giờ)');
    const sent = await calls(page);
    expect(sent).toHaveLength(2);
    expect(sent[1].key).toBe(sent[0].key);
    await expect(
      page.locator('.timeline .title').filter({ hasText: 'Ghi nhận không liên lạc được' }),
    ).toHaveCount(1);
  });

  test('accessibility: focus goes into the dialog, Escape gives it back, the result is announced and focused', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, 'N2F2611051005');
    const button = trigger(page, 'call-attempt');
    await button.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(page.locator('.notice-live')).toHaveAttribute('aria-live', 'polite');
    await button.click();
    await submitIn(page, 'Ghi nhận').click();
    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toHaveAttribute('role', 'status');
    await expect(page.locator('.notice-live')).toBeFocused();
  });
});

/**
 * Lát 4.5: approve / reject a customer's cancel request. Seeded `cancel_requested` orders:
 * N2F2611051013 and N2F2611051014 (one tee each, reason "Đặt nhầm size", tab "Chờ duyệt huỷ").
 */
test.describe('lát 4.5: duyệt / từ chối yêu cầu huỷ', () => {
  const REQUEST = 'N2F2611051013';
  const reasonIn = (page: Page) => dialog(page).getByLabel(/Lý do từ chối/);

  test('AC-ADM-36 (FE) / BR-ADM-33: the request shows time and reason; only approve and reject act on it', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, REQUEST);
    const section = page.locator('section[aria-labelledby="request-title"]');
    await expect(section).toContainText('Chờ duyệt');
    await expect(section).toContainText('Đặt nhầm size');
    await expect(section.getByText('Gửi lúc')).toBeVisible();
    await expect(trigger(page, 'approve-cancel')).toHaveText('Duyệt huỷ');
    await expect(trigger(page, 'reject-cancel')).toHaveText('Từ chối huỷ');
    // AC-ADM-40 (FE): nothing else is offered while the request waits.
    for (const kind of ['call-attempt', 'confirm', 'ship', 'deliver', 'cancel']) {
      await expect(trigger(page, kind)).toHaveCount(0);
    }
    // The tab "Chờ duyệt huỷ" lists it with its count.
    await page.goto('/admin/orders');
    await expect(
      page
        .getByRole('navigation', { name: 'Chế độ xem đơn hàng' })
        .getByRole('button', { name: /Chờ duyệt huỷ/ }),
    ).toContainText('2');
  });

  test('AC-ADM-38 (FE): approve cancels the order, adds the stock once and records the approver', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, REQUEST);
    await trigger(page, 'approve-cancel').click();
    await expect(dialog(page)).toContainText('cộng lại tồn kho');
    await submitIn(page, 'Duyệt huỷ').click();
    await expect(notice(page)).toContainText('Đã duyệt yêu cầu huỷ');
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Đã huỷ” (6 đơn)');
    await expect(page.locator('.timeline .title').first()).toHaveText('Duyệt yêu cầu huỷ');
    await expect(page.locator('section[aria-labelledby="request-title"]')).toContainText(
      'Đã duyệt',
    );
    await expect(trigger(page, 'approve-cancel')).toHaveCount(0);
    // The tee starts at 10 pieces; the approval puts the one piece back, once.
    expect((await stock(page))[TEE]).toBe(11);
    const [sent] = await calls(page);
    expect(sent).toMatchObject({
      code: REQUEST,
      action: 'approve-cancel',
      body: { expectedStatus: 'cancel_requested' },
    });
    expect(sent.key).toMatch(/^n2f-[a-z0-9]{24}$/);
    expect(await calls(page)).toHaveLength(1);
  });

  test('AC-ADM-39 (FE): reject needs a 5-250 character reason; the order goes back to "Đang chuẩn bị"', async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    await openOrder(page, REQUEST);
    await trigger(page, 'reject-cancel').click();
    await expect(dialog(page)).toContainText('Khách sẽ thấy lý do này');
    for (const bad of ['', 'abcd', 'x'.repeat(251)]) {
      await reasonIn(page).fill(bad);
      await submitIn(page, 'Từ chối huỷ').click();
      await expect(dialog(page).getByText('Nhập lý do từ 5 đến 250 ký tự.')).toBeVisible();
    }
    expect(await calls(page)).toHaveLength(0);
    await reasonIn(page).fill('Đơn đã đóng gói xong, sắp bàn giao');
    await submitIn(page, 'Từ chối huỷ').click();
    await expect(notice(page)).toContainText('Đã từ chối yêu cầu huỷ');
    await expect(notice(page)).toContainText('Đơn nằm ở tab “Đang chuẩn bị”');
    const section = page.locator('section[aria-labelledby="request-title"]');
    await expect(section).toContainText('Đã từ chối');
    await expect(section).toContainText('Đơn đã đóng gói xong, sắp bàn giao');
    await expect(page.locator('.timeline .title').first()).toHaveText('Từ chối yêu cầu huỷ');
    await expect(trigger(page, 'reject-cancel')).toHaveCount(0);
    // Rejecting touches no stock: the tee is still at its 10 pieces.
    expect((await stock(page))[TEE]).toBe(10);
    const [sent] = await calls(page);
    expect(sent).toMatchObject({
      action: 'reject-cancel',
      body: { expectedStatus: 'cancel_requested', reason: 'Đơn đã đóng gói xong, sắp bàn giao' },
    });
  });

  test('AC-ADM-38/40 (FE): a colleague decided first, so the order is refreshed and ours is not sent twice', async ({
    page,
  }) => {
    await signIn(page, STAFF);
    await openOrder(page, REQUEST);
    await flag(page, 'conflict-once');
    await trigger(page, 'approve-cancel').click();
    await submitIn(page, 'Duyệt huỷ').click();
    await expect(page.getByRole('alert')).toContainText('Đơn vừa được cập nhật bởi người khác.');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('section[aria-labelledby="request-title"]')).toContainText(
      'Đã duyệt',
    );
    await expect(trigger(page, 'approve-cancel')).toHaveCount(0);
    // The colleague's approval added the stock once; ours was not applied.
    expect((await stock(page))[TEE]).toBe(11);
  });
});
