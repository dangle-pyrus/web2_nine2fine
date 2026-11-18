import { expect, Page, Route, test } from '@playwright/test';

/**
 * Slice 9 admin (`/admin/returns`) on the HTTP adapter: `returnsMode = http` (the e2e build keeps
 * the earlier mock back office by default) and `/api/admin/returns*` answered here the way
 * docs/api/openapi.yaml says: tab counts, `allowedActions` by role and state, the full account
 * number only for an admin at `received`, `409 invalid-transition` on a lost race. The order desk
 * runs on its contract mock, so the return block inside an order is covered by the same
 * `ReturnPanel` on `/admin/returns/:id`. What needs the database (stock, payment status, races)
 * belongs to the backend tests.
 */
const ADMIN = ['admin@nine2fine.vn', 'Admin2026Mock'] as const;
const STAFF = ['staff@nine2fine.vn', 'Staff2026Mock'] as const;
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

type Json = Record<string, unknown>;
type State = 'requested' | 'approved' | 'received' | 'refunded' | 'rejected' | 'cancelled';

interface Row {
  id: string;
  code: string;
  state: State;
  name: string;
  reason: string;
  lines: { variantId: string; name: string; quantity: number; unit: number }[];
  accepted?: { variantId: string; acceptedQuantity: number; disposition?: string }[];
  note?: string;
  reference?: string;
}

class ReturnsFake {
  calls: { method: string; path: string; body: Json | null }[] = [];
  /** Next write of this action answers 409 (someone else was first), once. */
  loseRace: string | null = null;
  rows: Row[] = [
    {
      id: ID(1),
      code: 'N2F2611110001',
      state: 'requested',
      name: 'Nguyễn An',
      reason: 'wrong-size',
      lines: [{ variantId: V1, name: 'Áo blazer', quantity: 2, unit: 400_000 }],
    },
    {
      id: ID(2),
      code: 'N2F2611110002',
      state: 'approved',
      name: 'Trần Bình',
      reason: 'not-fit',
      lines: [{ variantId: V2, name: 'Áo thun', quantity: 1, unit: 200_000 }],
    },
    {
      id: ID(3),
      code: 'N2F2611110003',
      state: 'received',
      name: 'Lê Chi',
      reason: 'not-fit',
      lines: [{ variantId: V2, name: 'Áo thun', quantity: 1, unit: 200_000 }],
    },
  ];

  constructor(readonly role: 'admin' | 'staff') {}

  private amount(row: Row) {
    const goods = row.lines.reduce((sum, line) => sum + line.unit * line.quantity, 0);
    const fault = ['wrong-size', 'wrong-color', 'wrong-item', 'defective'].includes(row.reason);
    const fee = fault ? 0 : 30_000;
    return {
      goodsAmount: goods,
      shippingRefund: 0,
      returnShippingFee: fee,
      amount: goods - fee,
      final: row.state === 'received' || row.state === 'refunded',
    };
  }

  private detail(row: Row): Json {
    const fault = ['wrong-size', 'wrong-color', 'wrong-item', 'defective'].includes(row.reason);
    const allowed: string[] = [];
    if (row.state === 'requested') allowed.push('approve', 'reject');
    if (row.state === 'approved') allowed.push('receive', 'reject');
    if (row.state === 'received' && this.role === 'admin') allowed.push('refund');
    return {
      id: row.id,
      orderCode: row.code,
      state: row.state,
      reason: row.reason,
      fault: fault ? 'shop' : 'customer',
      detail: 'Đặt size M nhưng nhận size L.',
      conditionAck: !fault,
      requestedAt: '2026-11-10T03:00:00.000Z',
      recipient: { name: row.name, phone: '0987654321', email: 'khach@example.com' },
      paymentMethod: 'cod',
      lines: row.lines.map((line) => ({
        variantId: line.variantId,
        name: line.name,
        color: 'Đen',
        size: 'M',
        sku: 'SKU-1',
        mediaId: 'x',
        quantity: line.quantity,
        goodsAmount: line.unit * line.quantity,
        ...(row.accepted
          ? {
              acceptedQuantity: row.accepted.find((a) => a.variantId === line.variantId)
                ?.acceptedQuantity,
            }
          : {}),
      })),
      photos: [],
      amount: this.amount(row),
      ...(row.state === 'refunded'
        ? { refundedAmount: this.amount(row).amount, refundReference: row.reference }
        : {}),
      ...(row.note ? { rejectNote: row.note } : {}),
      refundTo: {
        type: 'account',
        bank: 'Vietcombank',
        last4: '6789',
        accountName: 'LE CHI',
        // Only an admin, only while `received`.
        ...(this.role === 'admin' && row.state === 'received'
          ? { accountNumber: '0123456789' }
          : {}),
      },
      history: [
        { at: '2026-11-10T03:00:00.000Z', kind: 'return_requested', actor: { type: 'customer' } },
      ],
      allowedActions: allowed,
      overdue: row.id === ID(1),
    };
  }

  private counts(q: string) {
    const rows = this.rows.filter((row) => this.matches(row, q));
    const count = (...s: State[]) => rows.filter((row) => s.includes(row.state)).length;
    return {
      all: rows.length,
      requested: count('requested'),
      approved: count('approved'),
      received: count('received'),
      refunded: count('refunded'),
      closed: count('rejected', 'cancelled'),
    };
  }
  private matches(row: Row, q: string) {
    const text = q.trim().toLowerCase().replace('#', '');
    return !text || row.code.toLowerCase().includes(text) || row.name.toLowerCase().includes(text);
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON() as Json | null;
    const path = url.pathname.replace(/^\/api\/admin\/returns/, '') || '/';
    this.calls.push({ method: request.method(), path, body });
    const json = (status: number, data: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify(data),
      });
    const error = (status: number, code: string, extra: Json = {}) =>
      json(status, { error: { code, message: '', ...extra } });

    if (request.method() === 'GET' && path === '/') {
      const state = url.searchParams.get('state') ?? '';
      const q = url.searchParams.get('q') ?? '';
      const items = this.rows
        .filter((row) => this.matches(row, q))
        .filter(
          (row) =>
            !state ||
            (state === 'closed'
              ? ['rejected', 'cancelled'].includes(row.state)
              : row.state === state),
        )
        .map((row) => ({
          id: row.id,
          orderCode: row.code,
          requestedAt: '2026-11-10T03:00:00.000Z',
          recipientName: row.name,
          reason: row.reason,
          fault: ['wrong-size'].includes(row.reason) ? 'shop' : 'customer',
          state: row.state,
          itemCount: row.lines.reduce((sum, line) => sum + line.quantity, 0),
          amount: this.amount(row).amount,
          overdue: row.id === ID(1),
        }));
      return json(200, { items, total: items.length, page: 1, limit: 20, counts: this.counts(q) });
    }
    const match = /^\/([^/]+)(?:\/(approve|reject|receive|refund))?$/.exec(path);
    const row = match && this.rows.find((r) => r.id === match[1]);
    if (!match || !row) return error(404, 'not-found');
    if (request.method() === 'GET') return json(200, this.detail(row));
    const action = match[2];
    if (action === 'refund' && this.role !== 'admin') return error(403, 'forbidden');
    if (this.loseRace === action) {
      this.loseRace = null;
      row.state = 'rejected';
      return error(409, 'invalid-transition', { currentReturnState: 'rejected' });
    }
    const from: Record<string, State[]> = {
      approve: ['requested'],
      reject: ['requested', 'approved'],
      receive: ['approved'],
      refund: ['received'],
    };
    if (!from[action].includes(row.state))
      return error(409, 'invalid-transition', { currentReturnState: row.state });
    if (action === 'reject') {
      const note = String(body?.['note'] ?? '').trim();
      if (note.length < 5) return error(422, 'validation', { field: 'note' });
      row.note = note;
      row.state = 'rejected';
    } else if (action === 'receive') {
      row.accepted = body!['lines'] as Row['accepted'];
      row.state = row.accepted!.every((l) => l.acceptedQuantity === 0) ? 'rejected' : 'received';
    } else if (action === 'refund') {
      if (body?.['amount'] !== this.amount(row).amount)
        return error(422, 'validation', { field: 'amount' });
      row.reference = String(body?.['refundReference']);
      row.state = 'refunded';
    } else row.state = 'approved';
    return json(200, this.detail(row));
  }
}

async function setup(page: Page, role: 'admin' | 'staff'): Promise<ReturnsFake> {
  const fake = new ReturnsFake(role);
  await page.addInitScript(() => {
    localStorage.setItem('n2f.e2e.returnsMode', 'http');
    localStorage.setItem('n2f.e2e.adminOrdersMode', 'contract-mock');
  });
  await page.route(/\/api\/admin\/returns/, (route) => fake.handle(route));
  return fake;
}

async function signIn(page: Page, [email, password]: readonly [string, string]): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(
    (url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'),
  );
}

const money = (value: string) => new RegExp(value.replace(/\./g, '\\.') + '\\s?₫');
const dialog = (page: Page) => page.getByTestId('return-dialog');

test.describe('admin returns on the API (Slice 9)', () => {
  test('AC-RET-31, 42: menu entry, tabs with counts, search and URL', async ({ page }) => {
    const fake = await setup(page, 'staff');
    await signIn(page, STAFF);
    await expect(
      page.locator('nav.sidebar .menu-list a').filter({ hasText: 'Trả hàng' }),
    ).toHaveCount(1);
    await page.goto('/admin/returns');
    await expect(page.getByRole('heading', { name: 'Trả hàng' })).toBeVisible();
    for (const [tab, n] of [
      ['all', '3'],
      ['requested', '1'],
      ['approved', '1'],
      ['received', '1'],
      ['refunded', '0'],
      ['closed', '0'],
    ])
      await expect(page.locator(`[data-count="${tab}"]`)).toHaveText(n);
    await expect(page.getByText('Quá hạn xử lý')).toBeVisible();
    await page.locator('[data-tab="approved"]').click();
    await expect(page).toHaveURL(/state=approved/);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Trần Bình');
    expect(fake.calls.at(-1)?.path).toBe('/');
    await page.locator('[data-tab="all"]').click();
    await page.getByLabel('Tìm yêu cầu trả hàng').fill('lê chi');
    await expect(page).toHaveURL(/q=l%C3%AA\+chi|q=l%C3%AA%20chi/);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    // Counts follow the search but not the tab.
    await expect(page.locator('[data-count="all"]')).toHaveText('1');
  });

  test('AC-RET-33, 34: approve, then reject needs a note of 5+ characters', async ({ page }) => {
    const fake = await setup(page, 'staff');
    await signIn(page, STAFF);
    await page.goto(`/admin/returns/${ID(1)}`);
    await expect(page.getByTestId('return-badge')).toHaveText('Chờ duyệt');
    await page.locator('[data-action="approve"]').click();
    await dialog(page).getByLabel('Hướng dẫn cho khách').fill('Gửi về kho Q1.');
    await dialog(page).getByLabel('Mã vận đơn').fill('GHN123');
    await dialog(page).getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(page.getByTestId('return-badge')).toHaveText('Chờ nhận hàng');
    await expect(page.getByTestId('return-notice')).toContainText('Đã duyệt yêu cầu');
    expect(fake.calls.find((c) => c.path.endsWith('/approve'))?.body).toEqual({
      note: 'Gửi về kho Q1.',
      trackingNumber: 'GHN123',
    });

    await page.locator('[data-action="reject"]').click();
    await dialog(page).getByRole('button', { name: 'Từ chối', exact: true }).click();
    await expect(dialog(page).getByText('Nhập ghi chú từ 5 ký tự.')).toBeVisible();
    expect(fake.calls.filter((c) => c.path.endsWith('/reject'))).toHaveLength(0);
    await dialog(page).getByLabel('Lý do').fill('Hàng đã giặt');
    await dialog(page).getByRole('button', { name: 'Từ chối', exact: true }).click();
    await expect(page.getByTestId('return-badge')).toHaveText('Đã từ chối / đóng');
    await expect(page.getByTestId('return-actions')).toHaveCount(0);
  });

  test('AC-RET-35, 36: receive checks every line; a short quantity needs a note and a disposition', async ({
    page,
  }) => {
    const fake = await setup(page, 'staff');
    await signIn(page, STAFF);
    await page.goto(`/admin/returns/${ID(2)}`);
    await page.locator('[data-action="receive"]').click();
    const accepted = dialog(page).getByLabel('Số lượng đạt: Áo thun (Đen / M)');
    await expect(accepted).toHaveValue('1');
    await dialog(page).getByLabel('Hướng xử lý: Áo thun (Đen / M)').selectOption('');
    await dialog(page).getByRole('button', { name: 'Xác nhận đã nhận hàng' }).click();
    await expect(dialog(page).getByText('Chọn hướng xử lý cho')).toBeVisible();
    await dialog(page).getByLabel('Hướng xử lý: Áo thun (Đen / M)').selectOption('writeoff');
    await dialog(page).getByRole('button', { name: 'Xác nhận đã nhận hàng' }).click();
    await expect(page.getByTestId('return-badge')).toHaveText('Chờ hoàn tiền');
    expect(fake.calls.find((c) => c.path.endsWith('/receive'))?.body).toEqual({
      lines: [{ variantId: V2, acceptedQuantity: 1, disposition: 'writeoff' }],
    });
    // Staff: no refund button, the masked account and the admin-only line.
    await expect(page.locator('[data-action="refund"]')).toHaveCount(0);
    await expect(page.getByTestId('admin-only-note')).toHaveText('Chỉ quản trị viên xem số đầy đủ và chuyển tiền.');
    await expect(page.getByTestId('return-refund-to')).toContainText('****6789');
    await expect(page.getByTestId('return-refund-to')).not.toContainText('0123456789');
  });

  test('AC-RET-36: nothing accepted closes the request (note required)', async ({ page }) => {
    const fake = await setup(page, 'staff');
    await signIn(page, STAFF);
    await page.goto(`/admin/returns/${ID(2)}`);
    await page.locator('[data-action="receive"]').click();
    await dialog(page).getByLabel('Số lượng đạt: Áo thun (Đen / M)').fill('0');
    await expect(dialog(page).getByText('Không có hàng đạt: yêu cầu sẽ được đóng')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Xác nhận đã nhận hàng' }).click();
    await expect(dialog(page).getByText('Nhập ghi chú từ 5 ký tự.')).toBeVisible();
    await dialog(page).getByLabel('Ghi chú kiểm hàng').fill('Hàng đã qua sử dụng');
    await dialog(page).getByRole('button', { name: 'Xác nhận đã nhận hàng' }).click();
    await expect(page.getByTestId('return-notice')).toContainText('yêu cầu đã được đóng');
    expect(fake.calls.find((c) => c.path.endsWith('/receive'))?.body).toEqual({
      lines: [{ variantId: V2, acceptedQuantity: 0 }],
      note: 'Hàng đã qua sử dụng',
    });
  });

  test('AC-RET-37, 17: admin sees the full number at received and confirms with a reference', async ({
    page,
  }) => {
    const fake = await setup(page, 'admin');
    await signIn(page, ADMIN);
    await page.goto(`/admin/returns/${ID(3)}`);
    await expect(page.getByTestId('return-account-number')).toHaveText('0123456789');
    await page.locator('[data-action="refund"]').click();
    await expect(page.getByTestId('refund-amount')).toContainText(money('170.000'));
    await expect(page.getByTestId('refund-account-number')).toHaveText('0123456789');
    await dialog(page).getByRole('button', { name: 'Xác nhận đã hoàn tiền' }).click();
    await expect(dialog(page).getByText('Mã giao dịch từ 4 đến 60 ký tự.')).toBeVisible();
    await dialog(page).getByLabel('Mã giao dịch').fill('FT26111200123');
    await dialog(page).getByRole('button', { name: 'Xác nhận đã hoàn tiền' }).click();
    await expect(dialog(page).getByText('Xác nhận bạn đã chuyển khoản.')).toBeVisible();
    await dialog(page).getByRole('checkbox').check();
    await dialog(page).getByRole('button', { name: 'Xác nhận đã hoàn tiền' }).click();
    await expect(page.getByTestId('return-badge')).toHaveText('Đã hoàn tiền');
    // Once refunded the full number is gone.
    await expect(page.getByTestId('return-account-number')).toHaveCount(0);
    expect(fake.calls.find((c) => c.path.endsWith('/refund'))?.body).toEqual({
      amount: 170_000,
      refundReference: 'FT26111200123',
    });
  });

  test('AC-RET-38: a refund the server refuses (403) for staff keeps the dialog out of reach', async ({
    page,
  }) => {
    await setup(page, 'staff');
    await signIn(page, STAFF);
    await page.goto(`/admin/returns/${ID(3)}`);
    await expect(page.getByTestId('return-actions')).toHaveCount(0);
  });

  test('AC-RET-42: lost race (409 invalid-transition) reloads the request with a notice', async ({
    page,
  }) => {
    const fake = await setup(page, 'staff');
    await signIn(page, STAFF);
    await page.goto(`/admin/returns/${ID(1)}`);
    fake.loseRace = 'approve';
    await page.locator('[data-action="approve"]').click();
    await dialog(page).getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(page.getByTestId('return-notice')).toContainText('xử lý bởi người khác');
    await expect(page.getByTestId('return-badge')).toHaveText('Đã từ chối / đóng');
  });

  test('AC-RET-42: a lost connection keeps the dialog and what was typed', async ({ page }) => {
    await setup(page, 'staff');
    await signIn(page, STAFF);
    await page.goto(`/admin/returns/${ID(1)}`);
    await page.route(/\/api\/admin\/returns\/[^/]+\/reject/, (route) => route.abort('failed'));
    await page.locator('[data-action="reject"]').click();
    await dialog(page).getByLabel('Lý do').fill('Quá hạn đổi trả');
    await dialog(page).getByRole('button', { name: 'Từ chối', exact: true }).click();
    await expect(page.getByTestId('return-failure')).not.toBeEmpty();
    await expect(dialog(page).getByLabel('Lý do')).toHaveValue('Quá hạn đổi trả');
  });

  test('AC-RET-50: Tổng quan shows the three return counts and each opens its tab', async ({
    page,
  }) => {
    await setup(page, 'staff');
    await page.addInitScript(() => localStorage.setItem('n2f.e2e.adminInsightsMode', 'http'));
    await page.route(/\/api\/admin\/dashboard/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          orders: { value: 1, change: null },
          todo: {
            toConfirm: 0,
            pendingPayment: 0,
            toFulfil: 0,
            inTransit: 0,
            cancelRequests: 0,
            returning: 0,
            lateDelivery: 0,
            lowStock: 0,
            outOfStock: 0,
            returnRequested: 4,
            returnApproved: 2,
            returnReceived: 1,
          },
        }),
      }),
    );
    await page.route(/\/api\/admin\/(returns|orders)/, (route) => route.fallback());
    await signIn(page, STAFF);
    await expect(page.getByTestId('todo-returnRequested')).toContainText('4');
    await expect(page.getByTestId('todo-returnApproved')).toContainText('2');
    await expect(page.getByTestId('todo-returnReceived')).toContainText('1');
    await page.getByTestId('todo-returnApproved').click();
    await expect(page).toHaveURL(/\/admin\/returns\?state=approved/);
  });

  test('AC-RET-43: mock mode keeps the desk entry out ("Chưa khả dụng")', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('n2f.e2e.adminOrdersMode', 'contract-mock'),
    );
    await signIn(page, STAFF);
    await page.goto('/admin/returns');
    await expect(page.getByRole('heading', { name: 'Chưa khả dụng' })).toBeVisible();
  });
});
