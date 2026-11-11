import { Page, Route } from '@playwright/test';

/**
 * A small stand-in for `/api/admin/{customers,staff,accounts}` (docs/api/openapi.yaml, Slice 7) for
 * the Playwright specs. The e2e build keeps the earlier mock back office by default; `useUsersApi`
 * switches it to the real HTTP adapters (`adminUsersMode = http`) and answers the requests here, so
 * the specs exercise the adapters, the mapping and the error handling. Like the server, it masks
 * contact details for staff and leaves `birthDate` / `addresses` out of their answers.
 */
export const USERS_MODE_KEY = 'n2f.e2e.adminUsersMode';
export const ORDERS_MODE_KEY = 'n2f.e2e.adminOrdersMode';

type Json = Record<string, unknown>;

export interface Failure {
  status: number;
  code: string;
  message?: string;
  extra?: Json;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  tier: 'bronze' | 'silver' | 'gold';
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  status: 'active' | 'blocked';
  createdAt: string;
  marketingOptIn: boolean;
  spentThisYear: number;
  birthDate: string | null;
  addresses: { recipient: string; phone: string; line: string; isDefault: boolean }[];
  orders: Json[];
}

interface Account {
  id: string;
  name: string;
  email: string;
  role: 'staff' | 'admin';
  status: 'active' | 'disabled';
  passwordSet: boolean;
  createdAt: string;
  lastActiveAt: string | null;
}

const NOW = '2026-11-10T03:00:00.000Z';

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function order(code: string, daysAgo: number, status = 'completed'): Json {
  return {
    id: code,
    placedAt: new Date(Date.parse(NOW) - daysAgo * 86_400_000).toISOString(),
    status,
    paymentStatus: status === 'completed' ? 'paid' : 'pending',
    paymentMethod: 'cod',
    recipientName: 'Nguyễn Văn Minh',
    total: 500_000,
    itemCount: 2,
    needsCall: false,
    hasCancelRequest: false,
    tab: status === 'completed' ? 'completed' : 'to-fulfil',
    overdue: [],
  };
}

function customer(
  overrides: Partial<Customer> & Pick<Customer, 'id' | 'name' | 'email'>,
): Customer {
  return {
    phone: '0900000000',
    tier: 'bronze',
    orderCount: 0,
    totalSpent: 0,
    lastOrderAt: null,
    status: 'active',
    createdAt: '2026-01-05T03:00:00.000Z',
    marketingOptIn: false,
    spentThisYear: 0,
    birthDate: null,
    addresses: [],
    orders: [],
    ...overrides,
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, local.length <= 2 ? 1 : 2)}***@${domain}`;
}

function maskPhone(phone: string | null): string | null {
  return phone ? `${phone.slice(0, 4)} *** ${phone.slice(-3)}` : null;
}

export class UsersApi {
  /** Whoever signed in: the specs sign in with the seeded mock admin or staff account. */
  constructor(
    readonly role: 'admin' | 'staff' = 'admin',
    readonly meId = role === 'admin' ? 's1' : 's2',
  ) {}

  customers: Customer[] = [
    customer({
      id: 'c-minh',
      name: 'Nguyễn Văn Minh',
      email: 'minh.nguyen@gmail.com',
      phone: '0912345678',
      tier: 'silver',
      orderCount: 12,
      totalSpent: 6_000_000,
      spentThisYear: 20_000_000,
      lastOrderAt: '2026-11-09T03:00:00.000Z',
      birthDate: '1998-03-14',
      marketingOptIn: true,
      addresses: [
        {
          recipient: 'Nguyễn Văn Minh',
          phone: '0912345678',
          line: '12 Lê Lợi, Bến Nghé, TP HCM',
          isDefault: true,
        },
        {
          recipient: 'Nguyễn Thị Hoa',
          phone: '0988111222',
          line: '5 Trần Phú, Hải Châu, Đà Nẵng',
          isDefault: false,
        },
      ],
      orders: Array.from({ length: 12 }, (_, i) =>
        order(`N2F-${1000 + i}`, i + 1, i === 0 ? 'to_ship' : 'completed'),
      ),
    }),
    customer({
      id: 'c-lan',
      name: 'Trần Thị Lan',
      email: 'lan.tran@gmail.com',
      phone: '0933444555',
      tier: 'gold',
      orderCount: 3,
      totalSpent: 45_000_000,
      spentThisYear: 45_000_000,
      lastOrderAt: '2026-11-01T03:00:00.000Z',
      orders: [order('N2F-2001', 9), order('N2F-2002', 20), order('N2F-2003', 30)],
    }),
    customer({ id: 'c-new', name: 'Lê Mới Đăng Ký', email: 'moi.le@gmail.com', phone: null }),
    customer({
      id: 'c-blocked',
      name: 'Phạm Khoá Tài',
      email: 'khoa.pham@gmail.com',
      status: 'blocked',
      orderCount: 1,
      totalSpent: 300_000,
      lastOrderAt: '2026-10-01T03:00:00.000Z',
      orders: [order('N2F-3001', 40)],
    }),
    ...Array.from({ length: 21 }, (_, i) =>
      customer({
        id: `c-f${String(i + 1).padStart(2, '0')}`,
        name: `Khách Thứ ${String(i + 1).padStart(2, '0')}`,
        email: `khach${i + 1}@example.com`,
        phone: `091000${String(1000 + i)}`,
      }),
    ),
  ];

  staff: Account[] = [
    this.account('s1', 'Nguyễn Quản Trị', 'admin@nine2fine.vn', 'admin', 'active', true, NOW),
    this.account(
      's2',
      'Trần Thu Hà',
      'staff@nine2fine.vn',
      'staff',
      'active',
      true,
      '2026-11-09T03:00:00.000Z',
    ),
    this.account('s3', 'Lê Hai Admin', 'hai.admin@nine2fine.vn', 'admin', 'active', true, null),
    this.account('s4', 'Võ Chờ Mật Khẩu', 'cho.vo@nine2fine.vn', 'staff', 'active', false, null),
    this.account(
      's5',
      'Phạm Gia Hân',
      'han.pg@nine2fine.vn',
      'staff',
      'disabled',
      true,
      '2026-09-01T03:00:00.000Z',
    ),
  ];

  events: { accountId: string; event: Json }[] = [];
  private created = new Map<string, Account>();

  /** Every request the page sent, in order. */
  requests: { method: string; url: URL; body: unknown; headers: Record<string, string> }[] = [];
  /** Answer the next request for `METHOD pathname` (below `/api/admin`) with an error, once. */
  failures = new Map<string, Failure>();
  /** Breaks the next request for `METHOD pathname` like a dropped connection. */
  aborts = new Set<string>();
  /** Holds every answer back this long (a request stays "in flight"). */
  delayMs = 0;
  /** Staff list answers 500 until this is set false. */
  listDown = false;

  private account(
    id: string,
    name: string,
    email: string,
    role: 'staff' | 'admin',
    status: 'active' | 'disabled',
    passwordSet: boolean,
    lastActiveAt: string | null,
  ): Account {
    return {
      id,
      name,
      email,
      role,
      status,
      passwordSet,
      createdAt: '2026-02-01T03:00:00.000Z',
      lastActiveAt,
    };
  }

  find(method: string, pattern: RegExp) {
    return this.requests.filter((r) => r.method === method && pattern.test(r.url.pathname));
  }

  private reply(
    route: Route,
    status: number,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store', ...headers },
      body: body === undefined ? '' : JSON.stringify(body),
    });
  }

  private error(route: Route, status: number, code: string, message: string, extra: Json = {}) {
    return this.reply(route, status, { error: { code, message, ...extra } });
  }

  private row(c: Customer): Json {
    const staff = this.role === 'staff';
    return {
      id: c.id,
      name: c.name,
      email: staff ? maskEmail(c.email) : c.email,
      phone: staff ? maskPhone(c.phone) : c.phone,
      contactMasked: staff,
      tier: c.tier,
      orderCount: c.orderCount,
      totalSpent: c.totalSpent,
      lastOrderAt: c.lastOrderAt,
      status: c.status,
    };
  }

  private detail(c: Customer): Json {
    const body: Json = {
      ...this.row(c),
      createdAt: c.createdAt,
      marketingOptIn: c.marketingOptIn,
      spentThisYear: c.spentThisYear,
      recentOrders: c.orders.slice(0, 10),
    };
    if (this.role === 'admin') {
      body['birthDate'] = c.birthDate;
      body['addresses'] = c.addresses;
    }
    return body;
  }

  private listCustomers(route: Route, url: URL) {
    const p = url.searchParams;
    const q = fold((p.get('q') ?? '').trim());
    if ((p.get('q') ?? '').length > 100)
      return this.error(route, 422, 'validation', 'q', { field: 'q' });
    const tier = p.get('tier');
    const view = p.get('view') ?? 'all';
    const sort = p.get('sort') ?? 'lastOrderAt';
    const limit = Number(p.get('limit') ?? 20);
    const page = Number(p.get('page') ?? 1);
    if (!(limit >= 1 && limit <= 50))
      return this.error(route, 422, 'validation', 'limit', { field: 'limit' });
    const base = this.customers
      .filter((c) => !tier || c.tier === tier)
      .filter(
        (c) =>
          !q ||
          fold(c.name).includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone ?? '').includes(q),
      );
    const rows = base.filter((c) => view === 'all' || c.status === 'blocked');
    rows.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'vi');
      if (sort === 'totalSpent') return b.totalSpent - a.totalSpent;
      if (sort === 'orderCount') return b.orderCount - a.orderCount;
      return (b.lastOrderAt ?? '').localeCompare(a.lastOrderAt ?? '');
    });
    return this.reply(route, 200, {
      items: rows.slice((page - 1) * limit, page * limit).map((c) => this.row(c)),
      total: rows.length,
      page,
      limit,
      counts: { all: base.length, blocked: base.filter((c) => c.status === 'blocked').length },
    });
  }

  private reason(body: Json, required: boolean): string | null {
    const text = typeof body?.['reason'] === 'string' ? (body['reason'] as string).trim() : '';
    if (text.length > 250 || (required && text.length < 5)) return null;
    return text;
  }

  private log(
    accountId: string,
    action: string,
    target: { email: string; name: string; role: string },
    reason: string,
    roles: { before?: string; after?: string } = {},
    sessionsRevoked = 0,
  ) {
    const me = this.staff.find((s) => s.id === this.meId)!;
    this.events.unshift({
      accountId,
      event: {
        id: `ev-${this.events.length + 1}`,
        at: NOW,
        action,
        actor: { id: me.id, name: me.name, role: me.role },
        target: { id: accountId, ...target },
        roleBefore: roles.before ?? null,
        roleAfter: roles.after ?? null,
        reason,
        sessionsRevoked,
      },
    });
  }

  private customerWrite(route: Route, c: Customer, action: 'lock' | 'unlock', body: Json) {
    if (this.role !== 'admin') return this.error(route, 403, 'forbidden', 'Không đủ quyền');
    const reason = this.reason(body, action === 'lock');
    if (reason === null) return this.error(route, 422, 'validation', 'reason', { field: 'reason' });
    const next = action === 'lock' ? 'blocked' : 'active';
    if (c.status !== next) {
      c.status = next;
      this.log(
        c.id,
        action === 'lock' ? 'locked' : 'unlocked',
        { email: c.email, name: c.name, role: 'member' },
        reason,
        {},
        action === 'lock' ? 2 : 0,
      );
    }
    return this.reply(route, 200, this.detail(c));
  }

  private activeAdmins() {
    return this.staff.filter((s) => s.role === 'admin' && s.status === 'active').length;
  }

  private staffWrite(route: Route, a: Account, action: 'lock' | 'unlock' | 'role', body: Json) {
    if (a.id === this.meId && action !== 'unlock')
      return this.error(route, 409, 'self-change', 'Không thể tự thay đổi mình.');
    const reason = this.reason(body, action === 'lock');
    if (reason === null) return this.error(route, 422, 'validation', 'reason', { field: 'reason' });
    const target = { email: a.email, name: a.name, role: a.role };
    if (action === 'role') {
      const role = body?.['role'];
      if (role !== 'staff' && role !== 'admin')
        return this.error(route, 422, 'validation', 'role', { field: 'role' });
      if (a.role !== role) {
        if (role === 'staff' && a.status === 'active' && this.activeAdmins() <= 1)
          return this.error(route, 409, 'last-admin', 'Cần ít nhất một quản trị viên.');
        const before = a.role;
        a.role = role;
        this.log(a.id, 'role-changed', { ...target, role }, reason, { before, after: role }, 2);
      }
    } else if (action === 'lock' && a.status === 'active') {
      if (a.role === 'admin' && this.activeAdmins() <= 1)
        return this.error(route, 409, 'last-admin', 'Cần ít nhất một quản trị viên.');
      a.status = 'disabled';
      this.log(a.id, 'locked', target, reason, {}, 2);
    } else if (action === 'unlock' && a.status === 'disabled') {
      a.status = 'active';
      this.log(a.id, 'unlocked', target, reason);
    }
    return this.reply(route, 200, a);
  }

  private createStaff(route: Route, headers: Record<string, string>, body: Json) {
    const key = headers['idempotency-key'];
    if (!key || key.length < 16)
      return this.error(route, 422, 'validation', 'key', { field: 'Idempotency-Key' });
    const replay = this.created.get(key);
    if (replay) return this.reply(route, 200, replay, { 'Idempotency-Replayed': 'true' });
    const name = String(body?.['name'] ?? '').trim();
    const email = String(body?.['email'] ?? '')
      .trim()
      .toLowerCase();
    if (name.length < 2 || name.length > 100)
      return this.error(route, 422, 'validation', 'name', { field: 'name' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return this.error(route, 422, 'validation', 'email', { field: 'email' });
    if (body?.['role'] !== 'staff' && body?.['role'] !== 'admin')
      return this.error(route, 422, 'validation', 'role', { field: 'role' });
    if (
      this.staff.some((s) => s.email === email) ||
      this.customers.some((c) => c.email.toLowerCase() === email)
    )
      return this.error(route, 409, 'duplicate', 'Email đã có.', { field: 'email' });
    const member = this.account(
      `s-${this.staff.length + 1}`,
      name,
      email,
      body['role'],
      'active',
      false,
      null,
    );
    this.staff.push(member);
    this.created.set(key, member);
    this.log(member.id, 'staff-created', { email, name, role: member.role }, '', {
      after: member.role,
    });
    return this.reply(route, 201, member);
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname.replace(/^\/api\/admin/, '');
    const raw = request.postDataBuffer();
    let body: Json = {};
    try {
      body = raw ? (JSON.parse(raw.toString('utf-8')) as Json) : {};
    } catch {
      body = {};
    }
    this.requests.push({ method, url, body, headers: request.headers() });
    const key = `${method} ${path}`;
    if (this.aborts.delete(key)) return route.abort('connectionreset');
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const failure = this.failures.get(key);
    if (failure) {
      this.failures.delete(key);
      return this.error(
        route,
        failure.status,
        failure.code,
        failure.message ?? 'Lỗi',
        failure.extra,
      );
    }
    if (this.listDown && key === 'GET /staff') return this.error(route, 500, 'unavailable', 'Lỗi');

    let match: RegExpMatchArray | null;
    if (path === '/customers' && method === 'GET') return this.listCustomers(route, url);
    if ((match = path.match(/^\/customers\/([^/]+)(?:\/(orders|lock|unlock))?$/))) {
      const found = this.customers.find((c) => c.id === match![1]);
      if (!found) return this.error(route, 404, 'not-found', 'Không tìm thấy.');
      if (!match[2] && method === 'GET') return this.reply(route, 200, this.detail(found));
      if (match[2] === 'orders' && method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? 20);
        const page = Number(url.searchParams.get('page') ?? 1);
        return this.reply(route, 200, {
          items: found.orders.slice((page - 1) * limit, page * limit),
          total: found.orders.length,
          page,
          limit,
        });
      }
      if (match[2] === 'lock' || match[2] === 'unlock')
        return this.customerWrite(route, found, match[2], body);
    }
    if (this.role !== 'admin') return this.error(route, 403, 'forbidden', 'Không đủ quyền');
    if (path === '/staff' && method === 'GET') return this.reply(route, 200, this.staff);
    if (path === '/staff' && method === 'POST')
      return this.createStaff(route, request.headers(), body);
    if ((match = path.match(/^\/staff\/([^/]+)\/(lock|unlock|role)$/))) {
      const found = this.staff.find((s) => s.id === match![1]);
      if (!found) return this.error(route, 404, 'not-found', 'Không tìm thấy.');
      return this.staffWrite(route, found, match[2] as 'lock' | 'unlock' | 'role', body);
    }
    if ((match = path.match(/^\/accounts\/([^/]+)\/history$/)) && method === 'GET') {
      const id = match[1];
      if (!this.staff.some((s) => s.id === id) && !this.customers.some((c) => c.id === id))
        return this.error(route, 404, 'not-found', 'Không tìm thấy.');
      return this.reply(
        route,
        200,
        this.events
          .filter((e) => e.accountId === id)
          .slice(0, 20)
          .map((e) => e.event),
      );
    }
    return this.error(route, 404, 'not-found', 'Không tìm thấy.');
  }
}

/** Switches the e2e build to the HTTP adapters of Slice 7 and routes `/api/admin/**` to the fake. */
export async function useUsersApi(page: Page, api = new UsersApi()): Promise<UsersApi> {
  await page.addInitScript(
    ([usersKey, ordersKey]) => {
      localStorage.setItem(usersKey, 'http');
      localStorage.setItem(ordersKey, 'contract-mock');
    },
    [USERS_MODE_KEY, ORDERS_MODE_KEY],
  );
  await page.route(/\/api\/admin\/(customers|staff|accounts)/, (route) => api.handle(route));
  return api;
}
