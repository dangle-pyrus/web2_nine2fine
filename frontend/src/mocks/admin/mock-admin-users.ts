/**
 * Mock of the Slice 7 contract (customers, staff, account history) for the earlier mock back
 * office. It reads the same in-memory data as the other admin mocks, but answers in the contract's
 * shapes and like the server does: staff get masked contact details and no `addresses` /
 * `birthDate`, the admin rules (`self-change`, `last-admin`) are enforced.
 */
import { inject, Injectable } from '@angular/core';
import { AdminSession } from '../../app/admin/core/admin-session';
import type { AdminCustomerAccountsApi } from '../../app/admin/data-access/customers-api';
import type { AdminStaffApi } from '../../app/admin/data-access/staff-api';
import {
  AdminApiError,
  type AdminCustomer,
  type AdminOrder,
} from '../../app/admin/data-access/models';
import type {
  DeskOrderStatus,
  DeskOrderSummary,
} from '../../app/admin/data-access/order-desk-models';
import type {
  AccountEvent,
  AccountRole,
  CustomerDetail,
  CustomerListQuery,
  CustomerRow,
  StaffAccount,
  StaffCreateInput,
} from '../../app/admin/data-access/users-models';
import { fail, respond } from '../mock-latency';
import { AdminMockDb, invalid, matches, notFound } from './admin-mock-db';

function maskEmail(email: string): string {
  const [local, domain = ''] = email.split('@');
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}***@${domain}`;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length < 8 ? phone : `${digits.slice(0, 4)} *** ${digits.slice(-3)}`;
}

function deskStatus(order: AdminOrder): DeskOrderStatus {
  switch (order.status) {
    case 'pending-payment':
      return 'to_pay';
    case 'pending-confirmation':
    case 'processing':
      return 'to_ship';
    case 'shipping':
    case 'delivering':
    case 'delivery-failed':
      return 'to_receive';
    case 'completed':
      return 'completed';
    case 'cancel-requested':
      return 'cancel_requested';
    default:
      return 'cancelled';
  }
}

function toDeskSummary(order: AdminOrder): DeskOrderSummary {
  const status = deskStatus(order);
  return {
    id: order.id,
    placedAt: order.placedAt,
    status,
    paymentStatus: order.paymentState === 'paid' ? 'paid' : 'pending',
    paymentMethod: order.payment.method === 'cod' ? 'cod' : 'bank-transfer',
    recipientName: order.customer.name,
    total: order.pricing.total,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    needsCall: order.status === 'pending-confirmation',
    hasCancelRequest: status === 'cancel_requested',
    tab:
      status === 'to_pay'
        ? 'pending-payment'
        : status === 'to_ship'
          ? order.status === 'pending-confirmation'
            ? 'to-confirm'
            : 'to-fulfil'
          : status === 'to_receive'
            ? 'in-transit'
            : status === 'cancel_requested'
              ? 'cancel-requests'
              : status,
    overdue: [],
  };
}

@Injectable({ providedIn: 'root' })
export class MockAdminCustomerAccountsApi implements AdminCustomerAccountsApi {
  private readonly db = inject(AdminMockDb);
  private readonly session = inject(AdminSession);
  /** Customers locked or unlocked in this session, with the reason. */
  readonly events = inject(MockAccountEvents);

  private isStaff(): boolean {
    return this.session.user()?.role !== 'admin';
  }

  private row(customer: AdminCustomer): CustomerRow {
    const masked = this.isStaff();
    return {
      id: customer.id,
      name: customer.name,
      email: masked ? maskEmail(customer.email) : customer.email,
      phone: masked ? maskPhone(customer.phone) : customer.phone,
      contactMasked: masked,
      tier: customer.tier === 'member' ? 'bronze' : customer.tier,
      orderCount: customer.orderCount,
      totalSpent: customer.totalSpent,
      lastOrderAt: customer.lastOrderAt,
      status: customer.status,
    };
  }

  private ordersOf(id: string): DeskOrderSummary[] {
    return this.db.data.orders.filter((order) => order.customer.id === id).map(toDeskSummary);
  }

  private detail(customer: AdminCustomer): CustomerDetail {
    const detail: CustomerDetail = {
      ...this.row(customer),
      createdAt: customer.createdAt,
      marketingOptIn: customer.marketingOptIn,
      spentThisYear: customer.totalSpent,
      recentOrders: this.ordersOf(customer.id).slice(0, 10),
    };
    if (!this.isStaff()) {
      detail.birthDate = customer.birthDate;
      detail.addresses = customer.addresses.map((address) => ({ ...address }));
    }
    return detail;
  }

  list(query: CustomerListQuery) {
    const base = this.db.data.customers
      .filter(
        (customer) =>
          !query.tier || (customer.tier === 'member' ? 'bronze' : customer.tier) === query.tier,
      )
      .filter((customer) => matches(query.q, customer.name, customer.email, customer.phone));
    const rows = base.filter((customer) => query.view === 'all' || customer.status === 'blocked');
    const sorters: Record<string, (c: AdminCustomer) => number | string> = {
      totalSpent: (c) => -c.totalSpent,
      orderCount: (c) => -c.orderCount,
      lastOrderAt: (c) => (c.lastOrderAt ? -Date.parse(c.lastOrderAt) : Number.MAX_SAFE_INTEGER),
      name: (c) => c.name,
    };
    const sort = sorters[query.sort] ?? sorters['lastOrderAt'];
    rows.sort((a, b) => {
      const x = sort(a);
      const y = sort(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    const start = (query.page - 1) * query.limit;
    return respond({
      items: rows.slice(start, start + query.limit).map((customer) => this.row(customer)),
      total: rows.length,
      page: query.page,
      limit: query.limit,
      counts: { all: base.length, blocked: base.filter((c) => c.status === 'blocked').length },
    });
  }

  get(id: string) {
    const customer = this.db.data.customers.find((item) => item.id === id);
    return customer ? respond(this.detail(customer)) : fail(notFound('khách hàng'));
  }

  orders(id: string, page: number, limit: number) {
    if (!this.db.data.customers.some((item) => item.id === id)) return fail(notFound('khách hàng'));
    const all = this.ordersOf(id);
    return respond({
      items: all.slice((page - 1) * limit, page * limit),
      total: all.length,
      page,
      limit,
    });
  }

  lock(id: string, reason: string) {
    return this.change(id, 'locked', reason);
  }

  unlock(id: string, reason?: string) {
    return this.change(id, 'unlocked', reason ?? '');
  }

  private change(id: string, action: 'locked' | 'unlocked', reason: string) {
    if (this.session.user()?.role !== 'admin')
      return fail(new AdminApiError('forbidden', 'Chỉ quản trị viên được khoá tài khoản.'));
    const customer = this.db.data.customers.find((item) => item.id === id);
    if (!customer) return fail(notFound('khách hàng'));
    const text = reason.trim();
    if (action === 'locked' && (text.length < 5 || text.length > 250))
      return fail(invalid('Lý do từ 5 đến 250 ký tự.', { reason: 'Lý do từ 5 đến 250 ký tự.' }));
    const next = action === 'locked' ? 'blocked' : 'active';
    if (customer.status !== next) {
      customer.status = next;
      this.events.add(action, customer.id, customer.email, customer.name, 'member', text);
    }
    return respond(this.detail(customer));
  }
}

/** The append-only account log of the mock (the server keeps `account_events`). */
@Injectable({ providedIn: 'root' })
export class MockAccountEvents {
  private readonly session = inject(AdminSession);
  private readonly rows: { accountId: string; event: AccountEvent }[] = [];

  add(
    action: AccountEvent['action'],
    accountId: string,
    email: string,
    name: string,
    role: 'member' | AccountRole,
    reason: string,
    roles: { before?: AccountRole; after?: AccountRole } = {},
  ): void {
    const user = this.session.user();
    this.rows.unshift({
      accountId,
      event: {
        id: `e${this.rows.length + 1}`,
        at: new Date().toISOString(),
        action,
        actor: {
          id: user?.id ?? null,
          name: user?.name ?? 'Hệ thống',
          role: user?.role ?? 'admin',
        },
        target: { id: accountId, email, name, role },
        roleBefore: roles.before ?? null,
        roleAfter: roles.after ?? null,
        reason,
        sessionsRevoked: 0,
      },
    });
  }

  of(accountId: string): AccountEvent[] {
    return this.rows
      .filter((row) => row.accountId === accountId)
      .slice(0, 20)
      .map((row) => row.event);
  }
}

@Injectable({ providedIn: 'root' })
export class MockAdminStaffApi implements AdminStaffApi {
  private readonly db = inject(AdminMockDb);
  private readonly session = inject(AdminSession);
  private readonly events = inject(MockAccountEvents);
  private readonly keys = new Map<string, StaffAccount>();

  private row(member: AdminMockDb['data']['staff'][number]): StaffAccount {
    return {
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      status: member.status,
      passwordSet: (member as { passwordSet?: boolean }).passwordSet ?? true,
      createdAt: member.createdAt,
      lastActiveAt: member.lastActiveAt ?? null,
    };
  }

  private guard(): AdminApiError | null {
    return this.session.user()?.role === 'admin'
      ? null
      : new AdminApiError('forbidden', 'Chỉ quản trị viên được quản lý nhân viên.');
  }

  list() {
    const denied = this.guard();
    return denied ? fail(denied) : respond(this.db.data.staff.map((member) => this.row(member)));
  }

  create(input: StaffCreateInput, idempotencyKey: string) {
    const denied = this.guard();
    if (denied) return fail(denied);
    const replay = this.keys.get(idempotencyKey);
    if (replay) return respond(replay);
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 100)
      return fail(invalid('Họ tên từ 2 đến 100 ký tự.', { name: 'Họ tên từ 2 đến 100 ký tự.' }));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254)
      return fail(invalid('Email chưa đúng định dạng.', { email: 'Email chưa đúng định dạng.' }));
    if (
      this.db.data.staff.some((item) => item.email === email) ||
      this.db.data.customers.some((item) => item.email.toLowerCase() === email)
    )
      return fail(
        new AdminApiError('duplicate', 'Email đã có tài khoản.', {
          email: 'Email đã có tài khoản.',
        }),
      );
    const member = {
      id: `s${Date.now().toString(36)}`,
      name,
      email,
      role: input.role,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      passwordSet: false,
      password: '',
    };
    this.db.data.staff.push(member as never);
    this.events.add('staff-created', member.id, email, name, input.role, '', { after: input.role });
    const result = this.row(member as never);
    this.keys.set(idempotencyKey, result);
    return respond(result);
  }

  private target(id: string) {
    const member = this.db.data.staff.find((item) => item.id === id);
    return member ?? null;
  }

  private activeAdmins(): number {
    return this.db.data.staff.filter((item) => item.role === 'admin' && item.status === 'active')
      .length;
  }

  lock(id: string, reason: string) {
    const denied = this.guard();
    if (denied) return fail(denied);
    const text = reason.trim();
    if (text.length < 5 || text.length > 250)
      return fail(invalid('Lý do từ 5 đến 250 ký tự.', { reason: 'Lý do từ 5 đến 250 ký tự.' }));
    const member = this.target(id);
    if (!member) return fail(notFound('nhân viên'));
    if (member.id === this.session.user()?.id)
      return fail(new AdminApiError('self-change', 'Không thể tự khoá mình.'));
    if (member.status === 'active') {
      if (member.role === 'admin' && this.activeAdmins() <= 1)
        return fail(new AdminApiError('last-admin', 'Cần ít nhất một quản trị viên.'));
      member.status = 'disabled';
      this.events.add('locked', member.id, member.email, member.name, member.role, text);
    }
    return respond(this.row(member));
  }

  unlock(id: string, reason?: string) {
    const denied = this.guard();
    if (denied) return fail(denied);
    const member = this.target(id);
    if (!member) return fail(notFound('nhân viên'));
    if (member.status === 'disabled') {
      member.status = 'active';
      this.events.add(
        'unlocked',
        member.id,
        member.email,
        member.name,
        member.role,
        reason?.trim() ?? '',
      );
    }
    return respond(this.row(member));
  }

  setRole(id: string, role: AccountRole, reason?: string) {
    const denied = this.guard();
    if (denied) return fail(denied);
    const member = this.target(id);
    if (!member) return fail(notFound('nhân viên'));
    if (member.id === this.session.user()?.id)
      return fail(new AdminApiError('self-change', 'Không thể tự đổi vai trò.'));
    if (member.role !== role) {
      if (role === 'staff' && member.status === 'active' && this.activeAdmins() <= 1)
        return fail(new AdminApiError('last-admin', 'Cần ít nhất một quản trị viên.'));
      const before = member.role;
      member.role = role;
      this.events.add(
        'role-changed',
        member.id,
        member.email,
        member.name,
        role,
        reason?.trim() ?? '',
        {
          before,
          after: role,
        },
      );
    }
    return respond(this.row(member));
  }

  history(accountId: string) {
    const denied = this.guard();
    if (denied) return fail(denied);
    const known =
      this.db.data.staff.some((item) => item.id === accountId) ||
      this.db.data.customers.some((item) => item.id === accountId);
    return known ? respond(this.events.of(accountId)) : fail(notFound('tài khoản'));
  }
}
