import { expect, Page, test } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';
import { buildDeskOrders } from '../src/mocks/admin/order-desk-fixtures';

/**
 * Slice 4 lát 4.6 (Should) on the contract mock: internal notes (BR-ADM-38, AC-ADM-46), the print
 * view of the delivery slip (BR-ADM-39, AC-ADM-47), the overdue flags (BR-ADM-40, AC-ADM-48) and the
 * `429 rate-limited` answer (BR-ADM-41, AC-ADM-49 FE part; the counting itself is the backend's).
 * Names carry the AC ids of docs/product/PRD.md.
 *
 * Seeded orders (src/mocks/admin/order-desk-fixtures.ts):
 *  - N2F2611081801 COD, to confirm, placed Sunday 2026-11-08 00:30 (+07), customer note
 *  - N2F2611041777 COD in transit, estimated delivery to 2026-11-13, one internal note
 *  - N2F2611051006 bank transfer paid, being packed; N2F2611051013 cancel request; N2F2611051015 cancelled
 */
const MODE_KEY = 'n2f.e2e.adminOrdersMode';
const FLAG_KEY = 'n2f.e2e.orderDeskActionFail';
const FAIL_KEY = 'n2f.e2e.orderDeskFail';
const CLOCK_KEY = 'n2f.e2e.orderDeskNow';
const CALLS_KEY = 'n2f.e2e.orderDeskCalls';

const STAFF = ['staff@nine2fine.vn', 'Staff2026Mock'] as const;
const ADMIN = ['admin@nine2fine.vn', 'Admin2026Mock'] as const;

async function signIn(page: Page, who: readonly [string, string] = STAFF): Promise<void> {
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

const setKey = (page: Page, key: string, value: string) =>
  page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
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

const dialog = (page: Page) => page.getByRole('dialog');
const noteBox = (page: Page) => dialog(page).getByRole('textbox', { name: 'Ghi chú nội bộ' });
const notice = (page: Page) => page.getByTestId('order-notice');
const trigger = (page: Page, kind: string) => page.locator(`[data-action="${kind}"]`);
const timeline = (page: Page) => page.locator('.timeline li');

async function openNoteDialog(page: Page): Promise<void> {
  await trigger(page, 'add-note').click();
  await expect(dialog(page).getByRole('heading', { name: 'Thêm ghi chú nội bộ' })).toBeVisible();
}

test.describe('lát 4.6: internal notes', () => {
  test('AC-ADM-46: a 500-character note is one timeline event for staff only; the status does not move', async ({
    page,
  }) => {
    await signIn(page);
    await openOrder(page, 'N2F2611051006');
    const before = await timeline(page).count();
    const status = await page.locator('adm-badge').last().innerText();
    await openNoteDialog(page);
    await expect(dialog(page)).toContainText('khách không thấy');
    const text = 'N'.repeat(500);
    await noteBox(page).fill(text);
    await expect(dialog(page).getByTestId('note-count')).toHaveText('500/500');
    await dialog(page).getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(notice(page)).toContainText('Đã thêm ghi chú nội bộ');
    await expect(timeline(page)).toHaveCount(before + 1);
    const first = timeline(page).first();
    await expect(first).toContainText('Ghi chú nội bộ');
    await expect(first).toContainText(text);
    await expect(first).toContainText('Chỉ nhân viên thấy');
    await expect(first).toContainText('Trần Thu Hà');
    await expect(page.locator('adm-badge').last()).toHaveText(status);
    // The body is the note alone (AdminNoteRequest, no expectedStatus).
    const sent = (await calls(page)).filter((call) => call.action === 'add-note');
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ note: text });
  });

  test('AC-ADM-46: 501 characters and an empty note are refused before anything is sent', async ({
    page,
  }) => {
    await signIn(page);
    await openOrder(page, 'N2F2611051006');
    await openNoteDialog(page);
    const save = dialog(page).getByRole('button', { name: 'Lưu ghi chú', exact: true });
    await noteBox(page).fill('   ');
    await save.click();
    await expect(dialog(page).getByText('Nhập nội dung ghi chú.')).toBeVisible();
    await noteBox(page).fill('x'.repeat(501));
    await save.click();
    await expect(dialog(page).getByText('Ghi chú tối đa 500 ký tự.')).toBeVisible();
    await expect(noteBox(page)).toHaveAttribute('aria-invalid', 'true');
    expect((await calls(page)).filter((call) => call.action === 'add-note')).toHaveLength(0);
    // Fixing the text lets it through.
    await noteBox(page).fill('x'.repeat(500));
    await save.click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test('AC-ADM-46: a note fits every status (completed and cancelled orders too)', async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    for (const code of ['N2F2611051015', 'N2F2611051013']) {
      await openOrder(page, code);
      await openNoteDialog(page);
      await noteBox(page).fill(`Ghi chú cho ${code}`);
      await dialog(page).getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
      await expect(timeline(page).first()).toContainText(`Ghi chú cho ${code}`);
    }
    await page.goto('/admin/orders?view=completed');
    await page.locator('tbody a.cell-title').first().click();
    await openNoteDialog(page);
    await noteBox(page).fill('Đơn xong, ghi nhận thêm');
    await dialog(page).getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
    await expect(timeline(page).first()).toContainText('Đơn xong, ghi nhận thêm');
  });

  test('AC-ADM-46: after a lost answer "Thử lại" reuses the Idempotency-Key and the note is saved once', async ({
    page,
  }) => {
    await signIn(page);
    await openOrder(page, 'N2F2611051006');
    const before = await timeline(page).count();
    await openNoteDialog(page);
    await noteBox(page).fill('Khách hẹn nhận sau 18:00');
    await setKey(page, FLAG_KEY, 'network-after-once');
    const save = dialog(page).getByRole('button', { name: 'Lưu ghi chú', exact: true });
    await save.click();
    await expect(dialog(page).getByRole('alert')).toContainText('Không kết nối được máy chủ');
    // The input is kept.
    await expect(noteBox(page)).toHaveValue('Khách hẹn nhận sau 18:00');
    await dialog(page).getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    const sent = (await calls(page)).filter((call) => call.action === 'add-note');
    expect(sent).toHaveLength(2);
    expect(sent[1].key).toBe(sent[0].key);
    await expect(timeline(page)).toHaveCount(before + 1);
  });
});

test.describe('lát 4.6: print the delivery slip', () => {
  async function stubPrint(page: Page): Promise<void> {
    await page.addInitScript(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed += 1;
      };
    });
  }
  const printed = (page: Page) =>
    page.evaluate(() => (window as unknown as { __printed: number }).__printed);

  test('AC-ADM-47: a COD order in transit prints exactly the PRD items and the amount to collect', async ({
    page,
  }) => {
    await stubPrint(page);
    await signIn(page);
    await openOrder(page, 'N2F2611041777');
    const total = (await page.locator('.grand dd').innerText()).trim();
    await trigger(page, 'print-slip').click();
    await expect(page).toHaveURL(/\/admin\/orders\/N2F2611041777\/slip$/);
    const slip = page.getByTestId('delivery-slip');
    await expect(slip).toBeVisible();
    await expect(slip).toContainText('#N2F2611041777');
    await expect(slip).toContainText('Phan Thị Cẩm');
    await expect(slip).toContainText('0933445566');
    await expect(slip).toContainText('12 Nguyễn Huệ, Phường Bến Nghé, TP. Hồ Chí Minh');
    const rows = slip.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      await expect(rows.nth(index).locator('td')).toHaveCount(4);
    }
    await expect(slip.getByTestId('slip-collect')).toHaveText(total);
    // Nothing from the staff side: no internal note, no history.
    await expect(slip).not.toContainText('Khách nhờ gọi lại');
    await expect(slip).not.toContainText('nội bộ');
    await expect(slip).not.toContainText('Lịch sử');
    await page.getByRole('button', { name: 'In phiếu', exact: true }).click();
    expect(await printed(page)).toBe(1);
    // On paper the toolbar goes away and the slip stays.
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'In phiếu', exact: true })).toBeHidden();
    await expect(slip).toBeVisible();
  });

  test('AC-ADM-47: the customer delivery note prints; a paid transfer collects 0; the back link returns', async ({
    page,
  }) => {
    await signIn(page);
    await openOrder(page, 'N2F2611081801');
    await trigger(page, 'print-slip').click();
    await expect(page.getByTestId('delivery-slip')).toContainText(
      'Ghi chú giao hàng: Giao giờ hành chính',
    );
    await expect(page.getByTestId('slip-collect')).not.toHaveText(/^0\s?₫$/);
    await page.getByRole('link', { name: 'Về đơn hàng' }).click();
    await expect(page.getByRole('heading', { name: '#N2F2611081801' })).toBeVisible();

    await openOrder(page, 'N2F2611051006');
    await trigger(page, 'print-slip').click();
    await expect(page.getByTestId('slip-collect')).toHaveText(/^0\s?₫$/);
  });

  test('AC-ADM-47: a cancelled order has no print button and no slip', async ({ page }) => {
    await signIn(page);
    await openOrder(page, 'N2F2611051015');
    await expect(trigger(page, 'print-slip')).toHaveCount(0);
    await page.goto('/admin/orders/N2F2611051015/slip');
    await expect(page.getByRole('alert')).toContainText('Đơn này không có phiếu giao');
    await expect(page.getByTestId('delivery-slip')).toHaveCount(0);
  });
});

test.describe('lát 4.6: overdue flags', () => {
  const placedRequest = Date.parse(
    buildDeskOrders().find((order) => order.id === 'N2F2611051013')!.cancelRequest!.requestedAt,
  );
  const iso = (ms: number) => new Date(ms).toISOString();

  async function rowOf(page: Page, code: string) {
    await page.goto(`/admin/orders?q=${code}`);
    const row = page.locator('tbody tr', { hasText: code });
    await expect(row).toHaveCount(1);
    return row;
  }

  async function atClock(page: Page, at: string): Promise<void> {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [CLOCK_KEY, at]);
  }

  test('AC-ADM-48: a call needed for 3 working hours is flagged, 1.5 hours and Sundays are not', async ({
    page,
  }) => {
    await signIn(page);
    // Placed Sunday 00:30: working time starts Monday 08:00.
    await atClock(page, '2026-11-08T20:00:00+07:00');
    await expect(await rowOf(page, 'N2F2611081801')).not.toContainText('Quá hạn');
    await atClock(page, '2026-11-09T09:30:00+07:00');
    await expect(await rowOf(page, 'N2F2611081801')).not.toContainText('Quá hạn');
    await openOrder(page, 'N2F2611081801');
    await expect(page.getByText('Quá hạn gọi xác nhận')).toHaveCount(0);
    await atClock(page, '2026-11-09T11:30:00+07:00');
    await expect(await rowOf(page, 'N2F2611081801')).toContainText('Quá hạn gọi xác nhận');
    await openOrder(page, 'N2F2611081801');
    await expect(page.getByText('Quá hạn gọi xác nhận')).toBeVisible();
    // Only a flag: the order is still to be confirmed and can still be worked.
    await expect(trigger(page, 'confirm')).toBeVisible();
  });

  test('AC-ADM-48: a cancel request after 25 hours and a delivery past the latest date are flagged', async ({
    page,
  }) => {
    await signIn(page);
    await atClock(page, iso(placedRequest + 23 * 3600_000));
    await expect(await rowOf(page, 'N2F2611051013')).not.toContainText('Quá hạn');
    await atClock(page, iso(placedRequest + 25 * 3600_000));
    const cancelRow = await rowOf(page, 'N2F2611051013');
    await expect(cancelRow).toContainText('Quá hạn duyệt huỷ');
    await expect(cancelRow).toContainText('Chờ duyệt huỷ');
    await openOrder(page, 'N2F2611051013');
    await expect(page.getByText('Quá hạn duyệt huỷ')).toBeVisible();
    // The decision buttons are still there: the flag never decides.
    await expect(trigger(page, 'approve-cancel')).toBeVisible();

    await atClock(page, '2026-11-13T23:00:00+07:00');
    await expect(await rowOf(page, 'N2F2611041777')).not.toContainText('Quá hạn');
    await atClock(page, '2026-11-14T00:30:00+07:00');
    const transit = await rowOf(page, 'N2F2611041777');
    await expect(transit).toContainText('Quá hạn giao');
    await expect(transit).toContainText('Đang vận chuyển');
    await openOrder(page, 'N2F2611041777');
    await expect(page.getByText('Quá hạn giao').first()).toBeVisible();
    await expect(trigger(page, 'deliver')).toBeVisible();
  });
});

test.describe('lát 4.6: rate limit (429)', () => {
  test('AC-ADM-49: a 429 on a write shows a countdown, keeps the input and the retry reuses the key', async ({
    page,
  }) => {
    await signIn(page);
    await openOrder(page, 'N2F2611051006');
    const before = await timeline(page).count();
    await openNoteDialog(page);
    await noteBox(page).fill('Ghi chú khi bị giới hạn');
    await setKey(page, FLAG_KEY, 'rate-limited-once:3');
    const save = dialog(page).getByRole('button', { name: 'Lưu ghi chú', exact: true });
    await save.click();
    await expect(dialog(page).getByRole('alert')).toContainText('Bạn thao tác quá nhanh');
    const countdown = dialog(page).getByTestId('cooldown');
    await expect(countdown).toContainText('giây');
    await expect(dialog(page).getByRole('button', { name: 'Thử lại', exact: true })).toBeDisabled();
    await expect(noteBox(page)).toHaveValue('Ghi chú khi bị giới hạn');
    await expect(timeline(page)).toHaveCount(before);
    // The countdown ends and the same button works again.
    await expect(countdown).toHaveCount(0, { timeout: 6000 });
    const retry = dialog(page).getByRole('button', { name: 'Thử lại', exact: true });
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(timeline(page)).toHaveCount(before + 1);
    const sent = (await calls(page)).filter((call) => call.action === 'add-note');
    expect(sent).toHaveLength(2);
    expect(sent[1].key).toBe(sent[0].key);
  });

  test('AC-ADM-49: a 429 on another write (confirm) closes nothing and does not change the order', async ({
    page,
  }) => {
    await signIn(page);
    await openOrder(page, 'N2F2611081801');
    await setKey(page, FLAG_KEY, 'rate-limited-once:2');
    await trigger(page, 'confirm').click();
    await dialog(page).getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('Bạn thao tác quá nhanh');
    await expect(dialog(page).getByTestId('cooldown')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(trigger(page, 'confirm')).toBeVisible();
  });

  test('AC-ADM-49: a 429 on a read names the wait and "Thử lại" works afterwards', async ({
    page,
  }) => {
    await signIn(page);
    await setKey(page, FAIL_KEY, 'list-rate-limited-once');
    await page.goto('/admin/orders');
    await expect(page.getByText('Không tải được danh sách đơn hàng')).toBeVisible();
    await expect(page.getByText('Chờ 30 giây rồi thử lại')).toBeVisible();
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.locator('tbody a.cell-title').first()).toBeVisible();

    await setKey(page, FAIL_KEY, 'detail-rate-limited-once');
    await page.goto('/admin/orders/N2F2611081801');
    await expect(page.getByText('Không tải được đơn hàng')).toBeVisible();
    await expect(page.getByText('Chờ 30 giây rồi thử lại')).toBeVisible();
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByRole('heading', { name: '#N2F2611081801' })).toBeVisible();
  });
});

test.describe('lát 4.6: notes never reach the storefront', () => {
  test('AC-ADM-46 (storefront): order views of a member show no internal note or staff wording', async ({
    page,
  }) => {
    const member = MOCK_ACCOUNTS[0];
    await page.goto('/auth/login?returnUrl=%2Faccount%2Forders%2FN2F261002001');
    await page.getByLabel('Email').fill(member.email);
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await page.getByRole('textbox', { name: 'Mã xác thực (8 số)' }).fill(DEMO_VERIFICATION_CODE);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Đơn #N2F261002001' })).toBeVisible();
    for (const url of ['/account/orders/N2F261002001', '/account/orders']) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const body = (await page.locator('body').innerText()).toLowerCase();
      expect(body).not.toContain('nội bộ');
      expect(body).not.toContain('ghi chú của nhân viên');
    }
  });

  test('AC-ADM-46 (storefront): no storefront source reads a staff note or timeline', () => {
    const root = join(__dirname, '..', 'src', 'app');
    const skip = new Set(['admin']);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (!skip.has(name) || dir !== root) walk(path);
        } else if (/\.(ts|html)$/.test(name)) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((file) =>
      /internalNote|internal_note|DeskTimeline|Ghi chú nội bộ|admin-orders/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
