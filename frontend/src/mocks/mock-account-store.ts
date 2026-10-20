import { inject, Injectable } from '@angular/core';
import { Address, Membership, Voucher } from '../app/features/account/data-access/account-models';
import { Order, ReturnRequest } from '../app/features/orders/order-models';
import { canCancel } from '../app/features/orders/order-status';
import { canRequestReturn } from '../app/features/orders/order-returns';
import { STORE_POLICY } from '../app/core/store-policy';
import { MockInventory } from './mock-inventory';
import { MockPersistence } from './mock-persistence';
import { MOCK_ACCOUNTS, MockAccount } from './accounts';
import {
  demoAddresses,
  demoGuestOrders,
  demoMembership,
  demoOrders,
  demoVouchers,
  newMemberMembership,
} from './account-fixtures';
import { applyDemoSeed } from './demo-seed'; // DEMO SEED (remove with src/mocks/demo-seed/)

export interface OrderContact {
  email: string;
  phone: string;
}

export interface MockAccountData {
  addresses: Address[];
  orders: Order[];
  vouchers: Voucher[];
  membership: Membership;
}

interface StoreSnapshot {
  accounts: MockAccount[];
  data: [string, MockAccountData][];
  guestOrders: Order[];
  contacts: [string, OrderContact][];
  reserved: string[];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * In-memory "database" shared by the mock auth, account and checkout adapters. Survives reloads of
 * the same tab through `MockPersistence`; a new tab starts from the fixtures again.
 */
@Injectable({ providedIn: 'root' })
export class MockAccountStore {
  private readonly inventory = inject(MockInventory);
  /** Orders placed in this demo, whose pieces were taken out of stock (seed orders were not). */
  private readonly reserved = new Set<string>();
  readonly accounts = new Map<string, MockAccount>(
    MOCK_ACCOUNTS.map((account) => [account.email, { ...account }]),
  );
  private readonly data = new Map<string, MockAccountData>([
    [
      'demo-member',
      {
        addresses: demoAddresses(),
        orders: demoOrders(),
        vouchers: demoVouchers(),
        membership: demoMembership(),
      },
    ],
  ]);

  /** Orders placed without an account (guest checkout); tracked by order ID + phone/email. */
  private readonly guestOrders: Order[] = demoGuestOrders().map(({ order }) => order);
  /** Contact used at checkout per order, needed to verify guest tracking requests. */
  private readonly contacts = new Map<string, OrderContact>([
    ...demoGuestOrders().map(({ order, contact }) => [order.id, contact] as const),
    ...this.dataFor('demo-member').orders.map(
      (order) =>
        [order.id, { email: MOCK_ACCOUNTS[0].email, phone: order.shippingAddress.phone }] as const,
    ),
  ]);

  constructor() {
    applyDemoSeed(this); // DEMO SEED (remove with src/mocks/demo-seed/)
    const saved = inject(MockPersistence).register<StoreSnapshot>('store', () => ({
      accounts: [...this.accounts.values()],
      data: [...this.data.entries()],
      guestOrders: this.guestOrders,
      contacts: [...this.contacts.entries()],
      reserved: [...this.reserved],
    }));
    if (saved) this.restore(saved);
  }

  /**
   * Customer cancellation (member or verified guest): allowed until the order leaves the warehouse.
   * Stock goes back on sale and a paid transfer is refunded to the paying account.
   */
  cancelOrder(id: string): Order | 'not-found' | 'not-cancellable' {
    const found = this.findOrder(id);
    if (!found) return 'not-found';
    if (!canCancel(found.order)) return 'not-cancellable';
    const now = new Date();
    this.releaseStock(found.order);
    return this.updateOrder(id, (order) => ({
      ...order,
      status: 'cancelled',
      paymentDueAt: undefined,
      cancelledBy: 'customer',
      cancelledAt: now.toISOString(),
      refund: order.payment.paid
        ? {
            amount: order.pricing.total,
            destination:
              order.payment.method === 'bank-transfer'
                ? 'Tài khoản đã chuyển khoản'
                : 'Phương thức đã thanh toán',
            reason: 'Bạn đã hủy đơn',
            expectedBy: new Date(now.getTime() + 3 * DAY).toISOString(),
          }
        : undefined,
      timeline: order.timeline && [
        ...order.timeline,
        { at: now.toISOString(), title: 'Bạn đã hủy đơn hàng' },
      ],
    }))!;
  }

  requestReturn(
    id: string,
    request: Omit<ReturnRequest, 'requestedAt'>,
  ): Order | 'not-found' | 'not-returnable' {
    const found = this.findOrder(id);
    if (!found) return 'not-found';
    if (!canRequestReturn(found.order)) return 'not-returnable';
    const requestedAt = new Date().toISOString();
    return this.updateOrder(id, (order) => ({
      ...order,
      status: 'return-requested',
      returnRequest: { ...request, requestedAt },
      timeline: order.timeline && [
        ...order.timeline,
        {
          at: requestedAt,
          title: 'Đã gửi yêu cầu trả hàng',
          detail: `nine2fine sẽ liên hệ trong 24 giờ làm việc · trả hàng trong ${STORE_POLICY.returnDays} ngày`,
        },
      ],
    }))!;
  }

  private restore(saved: StoreSnapshot): void {
    if (!Array.isArray(saved.accounts) || !Array.isArray(saved.data)) return;
    this.accounts.clear();
    for (const account of saved.accounts) this.accounts.set(account.email, account);
    this.data.clear();
    for (const [key, value] of saved.data) this.data.set(key, value);
    this.guestOrders.splice(0, this.guestOrders.length, ...(saved.guestOrders ?? []));
    this.contacts.clear();
    for (const [key, value] of saved.contacts ?? []) this.contacts.set(key, value);
    this.reserved.clear();
    for (const id of saved.reserved ?? []) this.reserved.add(id);
  }

  /** Takes a newly placed order's pieces out of stock. */
  reserve(order: Order): void {
    this.inventory.take(order.items);
    this.reserved.add(order.id);
  }

  /** Puts a cancelled order's pieces back on sale (only orders that took stock). */
  releaseStock(order: Order): void {
    if (this.reserved.delete(order.id)) this.inventory.release(order.items);
  }

  addOrder(order: Order, contact: OrderContact, accountId: string | null): void {
    if (accountId) this.dataFor(accountId).orders.unshift(order);
    else this.guestOrders.unshift(order);
    this.contacts.set(order.id, contact);
  }

  findOrder(id: string): { order: Order; contact: OrderContact } | undefined {
    const all = [...this.guestOrders, ...[...this.data.values()].flatMap((entry) => entry.orders)];
    const order = all.find((candidate) => candidate.id === id);
    const contact = this.contacts.get(id);
    return order && contact ? { order, contact } : undefined;
  }

  /** Replaces an order wherever it lives (guest list or a member's history). */
  updateOrder(id: string, update: (order: Order) => Order): Order | undefined {
    let updated: Order | undefined;
    const apply = (order: Order) => {
      if (order.id !== id) return order;
      updated = update(order);
      return updated;
    };
    this.guestOrders.splice(0, this.guestOrders.length, ...this.guestOrders.map(apply));
    for (const entry of this.data.values()) entry.orders = entry.orders.map(apply);
    return updated;
  }

  findById(id: string): MockAccount | undefined {
    return [...this.accounts.values()].find((account) => account.id === id);
  }

  dataFor(accountId: string): MockAccountData {
    let entry = this.data.get(accountId);
    if (!entry) {
      // New members start empty, which exercises the Figma empty states.
      entry = { addresses: [], orders: [], vouchers: [], membership: newMemberMembership() };
      this.data.set(accountId, entry);
    }
    return entry;
  }
}
