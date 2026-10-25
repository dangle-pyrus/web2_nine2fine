import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  applyStoreSettings,
  storeSettings,
  StoreSettingsValue,
} from '../../app/core/store-settings';
import type {
  AdminAuthApi,
  AdminCustomersApi,
  AdminDashboardApi,
  AdminInventoryApi,
  AdminOrdersApi,
  AdminProductsApi,
  AdminPromotionsApi,
  AdminReturnsApi,
  AdminSearchApi,
  AdminSettingsApi,
} from '../../app/admin/data-access/admin-apis';
import {
  AdminApiError,
  AdminCustomer,
  AdminCustomerSummary,
  AdminOrder,
  AdminOrderEvent,
  AdminOrderSummary,
  AdminProduct,
  AdminProductSummary,
  AdminUser,
  AuditQuery,
  CancelInput,
  ChangeItemInput,
  DeliveryFailureInput,
  ReturnToSenderInput,
  ShippingAddress,
  CustomerQuery,
  CustomerUpdate,
  DashboardRange,
  DashboardSummary,
  InventoryAdjustment,
  InventoryItem,
  InventoryMovement,
  InventoryQuery,
  OrderQuery,
  OrderView,
  ProductInput,
  ProductQuery,
  ProductStatus,
  Promotion,
  PromotionInput,
  PromotionQuery,
  ReturnCompletionInput,
  ReturnDecisionInput,
  ReturnQuery,
  ReturnSummary,
  SearchResults,
  ShipInput,
  StaffInput,
  StaffMember,
} from '../../app/admin/data-access/models';
import { fail, respond } from '../mock-latency';
import { paymentStateOf, refreshCustomerStats } from './admin-seed';
import {
  AdminMockDb,
  clone,
  invalid,
  matches,
  notFound,
  paginate,
  transition,
} from './admin-mock-db';
import { promotionState } from '../../app/admin/core/status';

const SESSION_KEY = 'n2f.admin.session';
const DAY = 86_400_000;
const money = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;

// ---------- Auth ----------

@Injectable({ providedIn: 'root' })
export class MockAdminAuthApi implements AdminAuthApi {
  private readonly db = inject(AdminMockDb);

  login(email: string, password: string): Observable<AdminUser> {
    const member = this.db.data.staff.find(
      (item) => item.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!member || member.password !== password) {
      return fail(
        new AdminApiError(
          'unauthenticated',
          'Email hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lại.',
        ),
      );
    }
    if (member.status === 'disabled') {
      return fail(
        new AdminApiError(
          'forbidden',
          'Tài khoản này đã bị khóa. Liên hệ quản trị viên để mở lại.',
        ),
      );
    }
    member.lastActiveAt = new Date().toISOString();
    const user = toUser(member);
    sessionStorage.setItem(SESSION_KEY, member.id);
    return respond(user);
  }

  me(): Observable<AdminUser> {
    const id = sessionStorage.getItem(SESSION_KEY);
    const member = this.db.data.staff.find((item) => item.id === id && item.status === 'active');
    return member
      ? respond(toUser(member))
      : fail(new AdminApiError('unauthenticated', 'Chưa đăng nhập.'));
  }

  logout(): Observable<void> {
    sessionStorage.removeItem(SESSION_KEY);
    return respond(undefined);
  }
}

function toUser(member: StaffMember): AdminUser {
  return { id: member.id, name: member.name, email: member.email, role: member.role };
}

// ---------- Dashboard ----------

@Injectable({ providedIn: 'root' })
export class MockAdminDashboardApi implements AdminDashboardApi {
  private readonly db = inject(AdminMockDb);

  summary(range: DashboardRange = 'today'): Observable<DashboardSummary> {
    const { orders, products, thresholds } = this.db.data;
    const now = Date.now();
    const dayKey = (time: number) =>
      new Date(time).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const counted = orders.filter((order) => order.status !== 'cancelled');
    const revenueOn = (key: string) =>
      counted
        .filter((order) => dayKey(Date.parse(order.placedAt)) === key)
        .reduce((sum, order) => sum + order.pricing.total, 0);
    const ordersOn = (key: string) =>
      counted.filter((order) => dayKey(Date.parse(order.placedAt)) === key).length;
    const today = dayKey(now);
    const change = (current: number, previous: number) =>
      previous ? (current - previous) / previous : null;
    // Seeded history is sparse; a smooth baseline makes the trend read like a running shop. The
    // baseline also counts as orders (≈1,45 tr each) so the average order value stays believable.
    const SYNTHETIC_ORDER = 1_450_000;
    const days = Array.from({ length: 60 }, (_, index) => {
      const time = now - (59 - index) * DAY;
      const key = dayKey(time);
      const base =
        key === today
          ? 0
          : index >= 30
            ? 2_400_000 +
              Math.round(Math.sin((index - 30) / 3) * 600_000) +
              ((index - 30) % 7 === 5 ? 1_200_000 : 0)
            : Math.round(2_100_000 + Math.cos(index / 4) * 300_000);
      return {
        date: key,
        revenue: revenueOn(key) + base,
        orders: ordersOn(key) + Math.round(base / SYNTHETIC_ORDER),
      };
    });
    const series = days.slice(30).map((day, index) => ({
      date: day.date,
      revenue: day.revenue,
      previous: days[index].revenue,
    }));
    const sum = (from: number, to: number) =>
      days.slice(from, to).reduce(
        (total, day) => ({
          revenue: total.revenue + day.revenue,
          orders: total.orders + day.orders,
        }),
        { revenue: 0, orders: 0 },
      );
    // Current period and the one it is compared with, as [from, to) indexes into `days` (59 = today).
    const [current, previous] =
      range === '30d'
        ? [sum(30, 60), sum(0, 30)]
        : range === '7d'
          ? [sum(53, 60), sum(46, 53)]
          : [sum(59, 60), sum(52, 53)];
    const revenue = current.revenue;
    const count = current.orders;
    const aov = count ? Math.round(revenue / count) : 0;
    const aovPrev = previous.orders ? Math.round(previous.revenue / previous.orders) : 0;
    const week = orders.filter(
      (order) => Date.parse(order.placedAt) > now - 7 * DAY && order.status !== 'pending-payment',
    );
    const returned = week.filter(
      (order) => order.status === 'returned' || order.status === 'return-requested',
    ).length;
    const returnRate = week.length ? returned / week.length : 0;

    const sales = new Map<string, { units: number; revenue: number }>();
    for (const order of counted.filter((item) => Date.parse(item.placedAt) > now - 30 * DAY)) {
      for (const item of order.items) {
        const entry = sales.get(item.productId) ?? { units: 0, revenue: 0 };
        entry.units += item.quantity;
        entry.revenue += item.quantity * item.unitPrice;
        sales.set(item.productId, entry);
      }
    }
    const topProducts = [...sales.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([productId, value]) => {
        const product = products.find((item) => item.id === productId)!;
        return { productId, name: product.name, image: product.images[0]?.url ?? '', ...value };
      });

    const lowStock = products
      .filter((product) => product.status === 'active')
      .flatMap((product) => product.variants)
      .filter(
        (variant) =>
          variant.inventory - reservedFor(orders, variant.id) <= (thresholds[variant.id] ?? 5),
      ).length;

    return respond({
      generatedAt: new Date(now).toISOString(),
      range,
      kpis: {
        revenue: { value: revenue, change: change(revenue, previous.revenue) },
        orders: { value: count, change: change(count, previous.orders) },
        averageOrderValue: { value: aov, change: change(aov, aovPrev) },
        returnRate: { value: returnRate, change: null },
      },
      todo: {
        toConfirm: orders.filter((order) => order.status === 'pending-confirmation').length,
        pendingPayment: orders.filter((order) => order.status === 'pending-payment').length,
        toFulfil: orders.filter((order) => order.status === 'processing').length,
        inTransit: orders.filter(
          (order) => order.status === 'shipping' || order.status === 'delivering',
        ).length,
        lateDelivery: orders.filter((order) => isLate(order, now)).length,
        deliveryFailed: orders.filter((order) => order.status === 'delivery-failed').length,
        returnRequests: orders.filter(
          (order) => order.status === 'return-requested' && !order.returnRequest?.decision,
        ).length,
        lowStock,
      },
      revenueSeries: series,
      topProducts,
    });
  }
}

/** Statuses whose address and lines can still change: the parcel has not left the warehouse. */
const EDITABLE: AdminOrder['status'][] = ['pending-payment', 'pending-confirmation', 'processing'];

function formatAddress(address: ShippingAddress): string {
  return `${address.street}, ${address.ward}, ${address.province}`;
}

function reservedFor(orders: AdminOrder[], variantId: string): number {
  return orders
    .filter((order) => EDITABLE.includes(order.status))
    .flatMap((order) => order.items)
    .filter((item) => item.variantId === variantId)
    .reduce((sum, item) => sum + item.quantity, 0);
}

// ---------- Orders ----------

/** In transit and past the estimated delivery date (view `late`, dashboard "Đơn giao trễ"). */
function isLate(order: AdminOrder, now = Date.now()): boolean {
  return (
    (order.status === 'shipping' || order.status === 'delivering') &&
    !!order.delivery?.estimatedAt &&
    Date.parse(order.delivery.estimatedAt) < now
  );
}

const inStatus =
  (...statuses: AdminOrder['status'][]) =>
  (order: AdminOrder) =>
    statuses.includes(order.status);

const VIEW_FILTERS: Record<OrderView, (order: AdminOrder) => boolean> = {
  all: () => true,
  'to-confirm': inStatus('pending-confirmation'),
  'pending-payment': inStatus('pending-payment'),
  'to-fulfil': inStatus('processing'),
  'in-transit': inStatus('shipping', 'delivering'),
  late: (order) => isLate(order),
  failed: inStatus('delivery-failed'),
  completed: inStatus('completed'),
  cancelled: inStatus('cancelled'),
  returns: inStatus('return-requested', 'returned'),
};

export function toOrderSummary(order: AdminOrder): AdminOrderSummary {
  return {
    id: order.id,
    placedAt: order.placedAt,
    status: order.status,
    paymentState: order.paymentState,
    paymentMethod: order.payment.method,
    customerName: order.customer.name,
    total: order.pricing.total,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    returnPending: order.status === 'return-requested' && !order.returnRequest?.decision,
  };
}

@Injectable({ providedIn: 'root' })
export class MockAdminOrdersApi implements AdminOrdersApi {
  private readonly db = inject(AdminMockDb);

  list(query: OrderQuery) {
    const inView = VIEW_FILTERS[query.view] ?? VIEW_FILTERS.all;
    const items = this.db.data.orders
      .filter(inView)
      .filter((order) => !query.payment || order.payment.method === query.payment)
      .filter((order) => !query.from || order.placedAt.slice(0, 10) >= query.from)
      .filter((order) => !query.to || order.placedAt.slice(0, 10) <= query.to)
      .filter((order) =>
        matches(
          query.search,
          order.id,
          order.customer.name,
          order.customer.phone,
          order.customer.email,
          order.delivery?.trackingCode,
        ),
      )
      .map(toOrderSummary);
    return respond(
      paginate(
        items,
        query,
        {
          placedAt: (o) => o.placedAt,
          total: (o) => o.total,
          id: (o) => o.id,
          customer: (o) => o.customerName,
        },
        'placedAt',
      ),
    );
  }

  counts() {
    const result = {} as Record<OrderView, number>;
    for (const [view, inView] of Object.entries(VIEW_FILTERS) as [
      OrderView,
      (order: AdminOrder) => boolean,
    ][]) {
      result[view] = this.db.data.orders.filter(inView).length;
    }
    return respond(result);
  }

  get(id: string) {
    const order = this.find(id);
    return order ? respond(clone(order)) : fail(notFound(`đơn hàng #${id}`));
  }

  confirmPayment(id: string) {
    return this.mutate(id, ['pending-payment'], (order) => {
      order.payment.paid = true;
      order.paidAt = new Date().toISOString();
      order.status = 'processing';
      delete order.paymentDueAt;
      this.event(order, 'Xác nhận đã nhận chuyển khoản', money(order.pricing.total));
      return 'Xác nhận thanh toán';
    });
  }

  confirm(id: string) {
    return this.mutate(id, ['pending-confirmation'], (order) => {
      order.status = 'processing';
      this.event(order, 'Đơn hàng được xác nhận', 'Đã gọi xác nhận với khách');
      return 'Xác nhận đơn COD';
    });
  }

  updateAddress(id: string, address: ShippingAddress) {
    const fields: Record<string, string> = {};
    if (!address.recipient.trim()) fields['recipient'] = 'Nhập tên người nhận.';
    if (!/^0\d{9}$/.test(address.phone.replace(/\s/g, '')))
      fields['phone'] = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.';
    if (!address.street.trim()) fields['street'] = 'Nhập số nhà, tên đường.';
    if (!address.ward.trim()) fields['ward'] = 'Nhập phường/xã.';
    if (!address.province.trim()) fields['province'] = 'Nhập tỉnh/thành phố.';
    if (Object.keys(fields).length) return fail(invalid('Kiểm tra lại địa chỉ giao hàng.', fields));
    return this.mutate(id, EDITABLE, (order) => {
      const before = formatAddress(order.shippingAddress);
      order.shippingAddress = {
        recipient: address.recipient.trim(),
        phone: address.phone.replace(/\s/g, ''),
        street: address.street.trim(),
        ward: address.ward.trim(),
        province: address.province.trim(),
      };
      this.event(
        order,
        'Đổi địa chỉ giao hàng',
        `${before} → ${formatAddress(order.shippingAddress)}`,
      );
      return 'Đổi địa chỉ giao hàng';
    });
  }

  changeItem(id: string, input: ChangeItemInput) {
    return this.mutate(id, EDITABLE, (order) => {
      const item = order.items[input.index];
      if (!item) throw invalid('Không tìm thấy sản phẩm trong đơn.');
      const product = this.db.data.products.find((candidate) => candidate.id === item.productId);
      const variant = product?.variants.find((candidate) => candidate.id === input.variantId);
      if (!product || !variant) throw invalid('Biến thể này không còn tồn tại.');
      if (variant.id === item.variantId) throw invalid('Chọn một màu hoặc size khác.');
      if (order.items.some((other) => other.variantId === variant.id))
        throw invalid('Biến thể này đã có trong đơn.');
      const available = variant.inventory - reservedFor(this.db.data.orders, variant.id);
      if (available < item.quantity)
        throw invalid(`${variant.color.name} / ${variant.size} chỉ còn ${available} sản phẩm.`);
      const price = variant.price ?? product.price;
      const delta = (price - item.unitPrice) * item.quantity;
      if (delta > 0 && order.payment.paid)
        throw invalid('Đơn đã thanh toán: chỉ đổi sang biến thể cùng giá hoặc rẻ hơn.');
      const before = `${item.color} / ${item.size}`;
      Object.assign(item, {
        variantId: variant.id,
        sku: variant.sku,
        color: variant.color.name,
        size: variant.size,
        unitPrice: price,
      });
      order.pricing.subtotal += delta;
      order.pricing.total += delta;
      this.event(
        order,
        `Đổi ${item.name}`,
        `${before} → ${variant.color.name} / ${variant.size}${delta ? ` · ${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}` : ''}`,
      );
      return 'Đổi biến thể trong đơn';
    });
  }

  ship(id: string, input: ShipInput) {
    if (!input.trackingCode.trim())
      return fail(
        invalid('Nhập mã vận đơn của hãng vận chuyển.', { trackingCode: 'Nhập mã vận đơn.' }),
      );
    return this.mutate(id, ['processing'], (order) => {
      order.status = 'shipping';
      order.delivery = {
        carrier: input.carrier,
        trackingCode: input.trackingCode.trim(),
        estimatedAt: input.estimatedAt,
      };
      // Units leave the warehouse at hand-over: on hand drops, the reservation ends.
      this.moveStock(order, -1, 'order', `Xuất kho đơn #${order.id}`);
      this.event(
        order,
        `Đã bàn giao cho ${input.carrier}`,
        `Mã vận đơn ${order.delivery.trackingCode}`,
      );
      return 'Bàn giao vận chuyển';
    });
  }

  markDelivering(id: string) {
    return this.mutate(id, ['shipping'], (order) => {
      order.status = 'delivering';
      this.event(order, 'Shipper đang giao hàng');
      return 'Cập nhật đang giao';
    });
  }

  markDelivered(id: string) {
    return this.mutate(id, ['delivering', 'shipping'], (order) => {
      order.status = 'completed';
      const now = new Date().toISOString();
      if (order.delivery) order.delivery.deliveredAt = now;
      if (order.payment.method === 'cod') {
        order.payment.paid = true;
        this.event(order, 'Đã thu tiền COD', money(order.pricing.total));
      }
      this.event(order, 'Giao hàng thành công');
      return 'Xác nhận giao thành công';
    });
  }

  failDelivery(id: string, input: DeliveryFailureInput) {
    if (!input.reason.trim())
      return fail(invalid('Chọn lý do giao không thành công.', { reason: 'Chọn lý do.' }));
    return this.mutate(id, ['shipping', 'delivering'], (order) => {
      order.status = 'delivery-failed';
      order.deliveryFailure = {
        at: new Date().toISOString(),
        reason: input.reason.trim(),
        attempts: (order.deliveryFailure?.attempts ?? 0) + 1,
      };
      this.event(order, 'Giao hàng không thành công', `Lý do: ${input.reason.trim()}`);
      return 'Báo giao không thành công';
    });
  }

  redeliver(id: string) {
    return this.mutate(id, ['delivery-failed'], (order) => {
      order.status = 'delivering';
      this.event(
        order,
        'Hẹn giao lại',
        `Lần giao thứ ${(order.deliveryFailure?.attempts ?? 0) + 1}`,
      );
      return 'Giao lại';
    });
  }

  returnToSender(id: string, input: ReturnToSenderInput) {
    return this.mutate(id, ['delivery-failed'], (order) => {
      order.status = 'returned-to-sender';
      if (input.restock) this.moveStock(order, 1, 'return', `Hàng hoàn đơn #${order.id}`);
      this.event(
        order,
        'Đơn đã hoàn về shop',
        `${input.restock ? 'Nhập lại kho bán' : 'Chuyển kho hàng lỗi'}${order.payment.method === 'cod' ? ' · Không thu được tiền COD' : ''}`,
      );
      return 'Hoàn về kho';
    });
  }

  cancel(id: string, input: CancelInput) {
    if (!input.reason.trim())
      return fail(invalid('Chọn lý do hủy đơn.', { reason: 'Chọn lý do.' }));
    return this.mutate(id, ['pending-payment', 'pending-confirmation', 'processing'], (order) => {
      order.status = 'cancelled';
      order.cancelledBy = 'shop';
      order.cancelledAt = new Date().toISOString();
      order.refund = undefined;
      if (order.payment.paid && input.refund) {
        order.refund = {
          amount: order.pricing.total,
          destination: order.payment.label,
          reason: input.reason,
          expectedBy: new Date(Date.now() + 5 * DAY).toISOString(),
        };
      }
      this.restock(
        order,
        order.items.map((_, index) => ({ index, quantity: order.items[index].quantity })),
        'cancel',
      );
      this.event(
        order,
        'Shop hủy đơn',
        `Lý do: ${input.reason}${order.refund ? ` · Hoàn ${money(order.refund.amount)}` : ''}`,
      );
      return 'Hủy đơn hàng';
    });
  }

  decideReturn(id: string, input: ReturnDecisionInput) {
    if (input.decision === 'rejected' && !input.note.trim()) {
      return fail(
        invalid('Nhập lý do từ chối để khách hiểu vì sao.', { note: 'Nhập lý do từ chối.' }),
      );
    }
    return this.mutate(id, ['return-requested'], (order) => {
      if (!order.returnRequest || order.returnRequest.decision)
        throw transition('Yêu cầu trả hàng này đã được xử lý.');
      order.returnRequest.decision = {
        status: input.decision,
        decidedAt: new Date().toISOString(),
        note: input.note.trim(),
      };
      if (input.decision === 'rejected') {
        order.status = 'completed';
        this.event(order, 'Đã từ chối yêu cầu trả hàng', input.note.trim());
        return 'Từ chối trả hàng';
      }
      this.event(order, 'Đã duyệt yêu cầu trả hàng', input.note.trim() || 'Chờ khách gửi hàng về');
      return 'Duyệt trả hàng';
    });
  }

  completeReturn(id: string, input: ReturnCompletionInput) {
    return this.mutate(id, ['return-requested'], (order) => {
      const request = order.returnRequest;
      if (request?.decision?.status !== 'approved')
        throw transition('Cần duyệt yêu cầu trước khi hoàn tiền.');
      if (input.refundAmount < 0 || input.refundAmount > order.pricing.total)
        throw invalid('Số tiền hoàn phải từ 0 đến tổng giá trị đơn.', {
          refundAmount: 'Số tiền không hợp lệ.',
        });
      const now = new Date().toISOString();
      order.status = 'returned';
      order.refund = {
        amount: input.refundAmount,
        destination: request.refundAccount
          ? `${request.refundAccount.bank} •••• ${request.refundAccount.accountNumber.slice(-4)}`
          : order.payment.label,
        reason: 'Trả hàng',
        expectedBy: now,
        refundedAt: now,
        items: request.lines.reduce((sum, line) => sum + line.quantity, 0),
      };
      order.paymentState = 'refunded';
      if (input.restock) this.restock(order, request.lines, 'return');
      this.event(
        order,
        'Đã nhận hàng trả và hoàn tiền',
        `${money(input.refundAmount)} · ${input.restock ? 'Nhập lại kho bán' : 'Chuyển kho hàng lỗi'}`,
      );
      return 'Hoàn tất trả hàng';
    });
  }

  addComment(id: string, text: string) {
    const order = this.find(id);
    if (!order) return fail(notFound(`đơn hàng #${id}`));
    const entry: AdminOrderEvent = {
      id: `c${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      kind: 'comment',
      title: text.trim(),
      author: this.db.actor(),
    };
    order.events.unshift(entry);
    return respond(clone(entry));
  }

  updateTags(id: string, tags: string[]) {
    const order = this.find(id);
    if (!order) return fail(notFound(`đơn hàng #${id}`));
    order.tags = [...tags];
    return respond(clone(order));
  }

  private find(id: string) {
    return this.db.data.orders.find((order) => order.id === id);
  }

  private event(order: AdminOrder, title: string, detail?: string) {
    order.events.unshift({
      id: `e${Date.now().toString(36)}${order.events.length}`,
      at: new Date().toISOString(),
      kind: 'system',
      title,
      detail,
      author: this.db.actor(),
    });
  }

  /** Every line of the order in or out of on-hand stock, with a movement entry per SKU. */
  private moveStock(
    order: AdminOrder,
    direction: 1 | -1,
    reason: InventoryMovement['reason'],
    note: string,
  ) {
    order.items.forEach((item, index) => {
      const variant = this.db.data.products
        .flatMap((product) => product.variants)
        .find((candidate) => candidate.id === item.variantId);
      if (!variant) return;
      variant.inventory += direction * item.quantity;
      this.db.data.movements[variant.id] ??= [];
      this.db.data.movements[variant.id].unshift({
        id: `m${Date.now().toString(36)}${index}`,
        at: new Date().toISOString(),
        change: direction * item.quantity,
        after: variant.inventory,
        reason,
        note,
        author: this.db.actor(),
      });
    });
  }

  private restock(
    order: AdminOrder,
    lines: { index: number; quantity: number }[],
    reason: 'cancel' | 'return',
  ) {
    for (const line of lines) {
      const item = order.items[line.index];
      const variant = this.db.data.products
        .flatMap((product) => product.variants)
        .find((candidate) => candidate.id === item?.variantId);
      if (!variant) continue;
      // Pending orders never left the warehouse: cancelling only releases the reservation.
      if (reason === 'cancel' && order.status !== 'cancelled') continue;
      if (reason === 'return') variant.inventory += line.quantity;
      this.db.data.movements[variant.id]?.unshift({
        id: `m${Date.now().toString(36)}${line.index}`,
        at: new Date().toISOString(),
        change: reason === 'return' ? line.quantity : 0,
        after: variant.inventory,
        reason,
        note: `Đơn #${order.id}`,
        author: this.db.actor(),
      });
    }
  }

  private mutate(
    id: string,
    from: AdminOrder['status'][],
    change: (order: AdminOrder) => string,
  ): Observable<AdminOrder> {
    const order = this.find(id);
    if (!order) return fail(notFound(`đơn hàng #${id}`));
    if (!from.includes(order.status))
      return fail(
        transition('Đơn hàng đã chuyển sang trạng thái khác. Tải lại trang để xem trạng thái mới.'),
      );
    try {
      const before = order.status;
      const action = change(order);
      order.paymentState = paymentStateOf(order);
      refreshCustomerStats(this.db.data.customers, this.db.data.orders);
      this.db.log({
        action,
        target: { type: 'order', id: order.id, label: `#${order.id}` },
        before: before,
        after: order.status,
      });
      return respond(clone(order));
    } catch (error) {
      return fail(error instanceof AdminApiError ? error : invalid(''));
    }
  }
}

// ---------- Returns ----------

@Injectable({ providedIn: 'root' })
export class MockAdminReturnsApi implements AdminReturnsApi {
  private readonly db = inject(AdminMockDb);

  list(query: ReturnQuery) {
    const items: ReturnSummary[] = this.db.data.orders
      .filter((order) => order.returnRequest)
      .map((order) => {
        const request = order.returnRequest!;
        const state: ReturnSummary['state'] =
          order.status === 'returned'
            ? 'completed'
            : request.decision?.status === 'rejected'
              ? 'rejected'
              : request.decision
                ? 'approved'
                : 'pending';
        return {
          orderId: order.id,
          requestedAt: request.requestedAt,
          customerName: order.customer.name,
          reason: request.reason,
          itemCount: request.lines.reduce((sum, line) => sum + line.quantity, 0),
          amount: request.amount,
          state,
        };
      })
      .filter((item) => !query.state || item.state === query.state)
      .filter((item) => matches(query.search, item.orderId, item.customerName));
    return respond(
      paginate(
        items,
        query,
        { requestedAt: (r) => r.requestedAt, amount: (r) => r.amount },
        'requestedAt',
      ),
    );
  }
}

// ---------- Products ----------

export function toProductSummary(product: AdminProduct): AdminProductSummary {
  return {
    id: product.id,
    name: product.name,
    image: product.images[0]?.url ?? '',
    status: product.status,
    category: product.category,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    inventory: product.variants.reduce((sum, variant) => sum + variant.inventory, 0),
    variantCount: product.variants.length,
    updatedAt: product.updatedAt,
  };
}

@Injectable({ providedIn: 'root' })
export class MockAdminProductsApi implements AdminProductsApi {
  private readonly db = inject(AdminMockDb);

  list(query: ProductQuery) {
    const items = this.db.data.products
      .filter((product) => {
        if (query.view === 'out-of-stock')
          return (
            product.status !== 'draft' && product.variants.some((variant) => variant.inventory <= 0)
          );
        return query.view === 'all' || product.status === query.view;
      })
      .filter((product) => !query.category || product.category === query.category)
      .filter((product) =>
        matches(
          query.search,
          product.name,
          ...product.variants.map((variant) => variant.sku),
          ...product.tags,
        ),
      )
      .map(toProductSummary);
    return respond(
      paginate(
        items,
        query,
        {
          updatedAt: (p) => p.updatedAt,
          name: (p) => p.name,
          price: (p) => p.price,
          inventory: (p) => p.inventory,
        },
        'updatedAt',
      ),
    );
  }

  get(id: string) {
    const product = this.db.data.products.find((item) => item.id === id);
    return product ? respond(clone(product)) : fail(notFound('sản phẩm'));
  }

  create(input: ProductInput) {
    const error = this.validate(input);
    if (error) return fail(error);
    const now = new Date().toISOString();
    const product: AdminProduct = {
      ...clone(input),
      id: `p${Date.now().toString(36)}`,
      createdAt: now,
      updatedAt: now,
    };
    this.db.data.products.unshift(product);
    this.trackStock(product);
    this.db.log({
      action: 'Tạo sản phẩm',
      target: { type: 'product', id: product.id, label: product.name },
    });
    return respond(clone(product));
  }

  update(id: string, input: ProductInput) {
    const index = this.db.data.products.findIndex((item) => item.id === id);
    if (index < 0) return fail(notFound('sản phẩm'));
    const error = this.validate(input, id);
    if (error) return fail(error);
    const before = this.db.data.products[index];
    const product: AdminProduct = {
      ...clone(input),
      id,
      createdAt: before.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.db.data.products[index] = product;
    this.trackStock(product, before);
    this.db.log({
      action: 'Sửa sản phẩm',
      target: { type: 'product', id, label: product.name },
      ...(before.price !== product.price
        ? { before: money(before.price), after: money(product.price) }
        : {}),
    });
    return respond(clone(product));
  }

  setStatus(ids: string[], status: ProductStatus) {
    for (const product of this.db.data.products.filter((item) => ids.includes(item.id))) {
      product.status = status;
      product.updatedAt = new Date().toISOString();
    }
    this.db.log({
      action: `Đổi trạng thái ${ids.length} sản phẩm`,
      target: { type: 'product', id: ids.join(','), label: `${ids.length} sản phẩm` },
      after: status,
    });
    return respond(undefined);
  }

  remove(id: string) {
    const product = this.db.data.products.find((item) => item.id === id);
    if (!product) return fail(notFound('sản phẩm'));
    if (this.db.data.orders.some((order) => order.items.some((item) => item.productId === id))) {
      return fail(
        new AdminApiError(
          'conflict',
          'Không thể xóa vì sản phẩm đã có trong đơn hàng. Hãy chuyển sang "Đã ẩn" thay vì xóa.',
        ),
      );
    }
    this.db.data.products = this.db.data.products.filter((item) => item.id !== id);
    this.db.log({ action: 'Xóa sản phẩm', target: { type: 'product', id, label: product.name } });
    return respond(undefined);
  }

  uploadImage(file: File) {
    if (!file.type.startsWith('image/'))
      return fail(invalid('Chỉ tải lên được file ảnh (JPG, PNG, WebP).'));
    if (file.size > 5 * 1024 * 1024)
      return fail(invalid('Ảnh lớn hơn 5 MB. Giảm kích thước ảnh rồi tải lại.'));
    // Data URL so the preview survives reloads within the demo tab.
    return new Observable<{
      id: string;
      url: string;
      alt: string;
      color: string;
    }>((subscriber) => {
      const reader = new FileReader();
      reader.onload = () => {
        setTimeout(() => {
          subscriber.next({
            id: `img${Date.now().toString(36)}`,
            url: String(reader.result),
            alt: file.name.replace(/\.[^.]+$/, ''),
            color: '',
          });
          subscriber.complete();
        }, 300);
      };
      reader.onerror = () =>
        subscriber.error(invalid('Không đọc được file ảnh. Thử chọn lại file.'));
      reader.readAsDataURL(file);
    });
  }

  private validate(input: ProductInput, id?: string): AdminApiError | null {
    const fields: Record<string, string> = {};
    if (!input.name.trim()) fields['name'] = 'Nhập tên sản phẩm.';
    if (!(input.price > 0)) fields['price'] = 'Giá bán phải lớn hơn 0.';
    if (input.compareAtPrice !== null && input.compareAtPrice <= input.price)
      fields['compareAtPrice'] = 'Giá gốc phải cao hơn giá bán.';
    if (input.status === 'active' && !input.images.length)
      fields['images'] = 'Sản phẩm đang bán cần ít nhất một ảnh.';
    if (
      input.slug &&
      this.db.data.products.some((item) => item.id !== id && item.slug === input.slug)
    )
      fields['slug'] = `Đường dẫn /product/${input.slug} đã được dùng.`;
    const skus = new Set<string>();
    for (const variant of input.variants) {
      const sku = variant.sku.trim().toUpperCase();
      if (!sku) continue;
      const owner = this.db.data.products.find(
        (product) =>
          product.id !== id && product.variants.some((item) => item.sku.toUpperCase() === sku),
      );
      if (owner) fields['variants'] = `SKU ${variant.sku} đã được dùng cho sản phẩm ${owner.name}.`;
      if (skus.has(sku)) fields['variants'] = `SKU ${variant.sku} bị trùng trong bảng biến thể.`;
      skus.add(sku);
    }
    return Object.keys(fields).length ? invalid(Object.values(fields)[0], fields) : null;
  }

  private trackStock(product: AdminProduct, before?: AdminProduct) {
    for (const variant of product.variants) {
      this.db.data.thresholds[variant.id] ??= 5;
      const old = before?.variants.find((item) => item.id === variant.id);
      const list = (this.db.data.movements[variant.id] ??= []);
      const change = variant.inventory - (old?.inventory ?? 0);
      if (change !== 0)
        list.unshift({
          id: `m${Date.now().toString(36)}${variant.id}`,
          at: new Date().toISOString(),
          change,
          after: variant.inventory,
          reason: 'correction',
          note: 'Sửa trên trang sản phẩm',
          author: this.db.actor(),
        });
    }
  }
}

// ---------- Inventory ----------

@Injectable({ providedIn: 'root' })
export class MockAdminInventoryApi implements AdminInventoryApi {
  private readonly db = inject(AdminMockDb);

  list(query: InventoryQuery) {
    const items = this.all()
      .filter((item) =>
        query.view === 'low'
          ? item.available > 0 && item.available <= item.lowStockThreshold
          : query.view === 'out'
            ? item.available <= 0
            : true,
      )
      .filter((item) =>
        matches(query.search, item.productName, item.sku, item.color.name, item.size),
      );
    return respond(
      paginate(
        items,
        query,
        {
          available: (i) => i.available,
          name: (i) => `${i.productName} ${i.color.name} ${i.size}`,
          onHand: (i) => i.onHand,
        },
        'name',
      ),
    );
  }

  adjust(variantId: string, input: InventoryAdjustment) {
    const product = this.db.data.products.find((item) =>
      item.variants.some((variant) => variant.id === variantId),
    );
    const variant = product?.variants.find((item) => item.id === variantId);
    if (!product || !variant) return fail(notFound('biến thể'));
    if (!Number.isInteger(input.quantity))
      return fail(invalid('Số lượng phải là số nguyên.', { quantity: 'Nhập số nguyên.' }));
    const next = input.mode === 'set' ? input.quantity : variant.inventory + input.quantity;
    if (next < 0)
      return fail(
        invalid('Tồn kho sau điều chỉnh không được âm.', { quantity: 'Tồn kho không được âm.' }),
      );
    const reserved = reservedFor(this.db.data.orders, variantId);
    if (next < reserved)
      return fail(
        invalid(`Không thể thấp hơn ${reserved} đang giữ cho đơn chưa giao.`, {
          quantity: `Tối thiểu ${reserved}.`,
        }),
      );
    const before = variant.inventory;
    variant.inventory = next;
    (this.db.data.movements[variantId] ??= []).unshift({
      id: `m${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      change: next - before,
      after: next,
      reason: input.reason,
      note: input.note.trim(),
      author: this.db.actor(),
    });
    this.db.log({
      action: 'Điều chỉnh tồn kho',
      target: {
        type: 'inventory',
        id: variantId,
        label: `${product.name} – ${variant.color.name} / ${variant.size}`,
      },
      before: String(before),
      after: String(next),
    });
    return respond(this.all().find((item) => item.variantId === variantId)!);
  }

  history(variantId: string) {
    return respond(clone(this.db.data.movements[variantId] ?? []));
  }

  private all(): InventoryItem[] {
    const { products, orders, thresholds } = this.db.data;
    return products
      .filter((product) => product.status !== 'draft')
      .flatMap((product) =>
        product.variants.map((variant) => {
          const reserved = reservedFor(orders, variant.id);
          return {
            variantId: variant.id,
            productId: product.id,
            productName: product.name,
            image:
              product.images.find((image) => image.color === variant.color.name)?.url ??
              product.images[0]?.url ??
              '',
            color: variant.color,
            size: variant.size,
            sku: variant.sku,
            onHand: variant.inventory,
            reserved,
            available: variant.inventory - reserved,
            lowStockThreshold: thresholds[variant.id] ?? 5,
          };
        }),
      );
  }
}

// ---------- Customers ----------

function toCustomerSummary(customer: AdminCustomer): AdminCustomerSummary {
  const { id, name, email, phone, tier, orderCount, totalSpent, lastOrderAt, status } = customer;
  return { id, name, email, phone, tier, orderCount, totalSpent, lastOrderAt, status };
}

@Injectable({ providedIn: 'root' })
export class MockAdminCustomersApi implements AdminCustomersApi {
  private readonly db = inject(AdminMockDb);

  list(query: CustomerQuery) {
    const items = this.db.data.customers
      .filter((customer) => !query.tier || customer.tier === query.tier)
      .filter((customer) => !query.status || customer.status === query.status)
      .filter((customer) => matches(query.search, customer.name, customer.email, customer.phone))
      .map(toCustomerSummary);
    return respond(
      paginate(
        items,
        query,
        {
          totalSpent: (c) => c.totalSpent,
          orderCount: (c) => c.orderCount,
          lastOrderAt: (c) => c.lastOrderAt ?? '',
          name: (c) => c.name,
        },
        'lastOrderAt',
      ),
    );
  }

  get(id: string) {
    const customer = this.db.data.customers.find((item) => item.id === id);
    if (!customer) return fail(notFound('khách hàng'));
    const recentOrders = this.db.data.orders
      .filter((order) => order.customer.id === id)
      .slice(0, 10)
      .map(toOrderSummary);
    return respond({ ...clone(customer), recentOrders });
  }

  update(id: string, input: CustomerUpdate) {
    const customer = this.db.data.customers.find((item) => item.id === id);
    if (!customer) return fail(notFound('khách hàng'));
    const before = customer.status;
    Object.assign(customer, clone(input));
    if (input.status && input.status !== before) {
      this.db.log({
        action: input.status === 'blocked' ? 'Khóa tài khoản khách' : 'Mở khóa tài khoản khách',
        target: { type: 'customer', id, label: customer.name },
      });
    }
    return this.get(id);
  }
}

// ---------- Promotions ----------

@Injectable({ providedIn: 'root' })
export class MockAdminPromotionsApi implements AdminPromotionsApi {
  private readonly db = inject(AdminMockDb);

  list(query: PromotionQuery) {
    const items = this.db.data.promotions
      .filter((promotion) => !query.state || promotionState(promotion) === query.state)
      .filter((promotion) => matches(query.search, promotion.code, promotion.title));
    return respond(
      paginate(
        items,
        query,
        { createdAt: (p) => p.createdAt, used: (p) => p.used, startsAt: (p) => p.startsAt },
        'createdAt',
      ),
    );
  }

  get(id: string) {
    const promotion = this.db.data.promotions.find((item) => item.id === id);
    return promotion ? respond(clone(promotion)) : fail(notFound('mã giảm giá'));
  }

  create(input: PromotionInput) {
    const error = this.validate(input);
    if (error) return fail(error);
    const promotion: Promotion = {
      ...clone(input),
      code: input.code.trim().toUpperCase(),
      id: `promo${Date.now().toString(36)}`,
      used: 0,
      createdAt: new Date().toISOString(),
    };
    this.db.data.promotions.unshift(promotion);
    this.db.log({
      action: 'Tạo mã giảm giá',
      target: { type: 'promotion', id: promotion.id, label: promotion.code },
    });
    return respond(clone(promotion));
  }

  update(id: string, input: PromotionInput) {
    const index = this.db.data.promotions.findIndex((item) => item.id === id);
    if (index < 0) return fail(notFound('mã giảm giá'));
    const error = this.validate(input, id);
    if (error) return fail(error);
    const current = this.db.data.promotions[index];
    this.db.data.promotions[index] = {
      ...current,
      ...clone(input),
      code: input.code.trim().toUpperCase(),
    };
    this.db.log({
      action: 'Sửa mã giảm giá',
      target: { type: 'promotion', id, label: input.code },
    });
    return respond(clone(this.db.data.promotions[index]));
  }

  setEnabled(id: string, enabled: boolean) {
    const promotion = this.db.data.promotions.find((item) => item.id === id);
    if (!promotion) return fail(notFound('mã giảm giá'));
    promotion.enabled = enabled;
    this.db.log({
      action: enabled ? 'Bật mã giảm giá' : 'Tắt mã giảm giá',
      target: { type: 'promotion', id, label: promotion.code },
    });
    return respond(clone(promotion));
  }

  remove(id: string) {
    const promotion = this.db.data.promotions.find((item) => item.id === id);
    if (!promotion) return fail(notFound('mã giảm giá'));
    if (promotion.used > 0)
      return fail(
        new AdminApiError('conflict', 'Mã đã được dùng nên không thể xóa. Hãy tắt mã thay vì xóa.'),
      );
    this.db.data.promotions = this.db.data.promotions.filter((item) => item.id !== id);
    this.db.log({
      action: 'Xóa mã giảm giá',
      target: { type: 'promotion', id, label: promotion.code },
    });
    return respond(undefined);
  }

  private validate(input: PromotionInput, id?: string): AdminApiError | null {
    const fields: Record<string, string> = {};
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code))
      fields['code'] = 'Mã gồm 3–20 ký tự: chữ không dấu, số, gạch ngang.';
    else if (this.db.data.promotions.some((item) => item.id !== id && item.code === code))
      fields['code'] = `Mã ${code} đã tồn tại. Chọn mã khác.`;
    if (input.type === 'percent' && !(input.value >= 1 && input.value <= 100))
      fields['value'] = 'Phần trăm giảm từ 1 đến 100.';
    if (input.type === 'fixed' && !(input.value > 0)) fields['value'] = 'Nhập số tiền giảm.';
    if (input.endsAt && input.endsAt <= input.startsAt)
      fields['endsAt'] = 'Ngày kết thúc phải sau ngày bắt đầu.';
    return Object.keys(fields).length ? invalid(Object.values(fields)[0], fields) : null;
  }
}

// ---------- Settings ----------

@Injectable({ providedIn: 'root' })
export class MockAdminSettingsApi implements AdminSettingsApi {
  private readonly db = inject(AdminMockDb);

  getStore() {
    return respond(clone(storeSettings()));
  }

  updateStore(value: StoreSettingsValue) {
    const before = storeSettings();
    // Same tab: the storefront reads `storeSettings()`, so it updates at once.
    applyStoreSettings(value);
    if (before.policy.shippingFee !== value.policy.shippingFee) {
      this.db.log({
        action: 'Sửa chính sách cửa hàng',
        target: { type: 'settings', id: 'store', label: 'Phí vận chuyển' },
        before: money(before.policy.shippingFee),
        after: money(value.policy.shippingFee),
      });
    } else {
      this.db.log({
        action: 'Sửa cài đặt cửa hàng',
        target: { type: 'settings', id: 'store', label: 'Thông tin & chính sách' },
      });
    }
    return respond(clone(storeSettings()));
  }

  listStaff() {
    return respond(this.db.data.staff.map((member) => withoutPassword(member)));
  }

  inviteStaff(input: StaffInput) {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return fail(invalid('Email chưa đúng định dạng.', { email: 'Nhập email hợp lệ.' }));
    if (this.db.data.staff.some((item) => item.email === email))
      return fail(
        invalid(`Email ${email} đã thuộc về một nhân viên khác.`, { email: 'Email đã tồn tại.' }),
      );
    const member = {
      id: `s${Date.now().toString(36)}`,
      name: input.name.trim(),
      email,
      role: input.role,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      password: 'staff123',
    };
    this.db.data.staff.push(member);
    this.db.log({
      action: 'Thêm nhân viên',
      target: { type: 'staff', id: member.id, label: member.name },
    });
    const result = withoutPassword(member);
    return respond(result);
  }

  updateStaff(id: string, input: Partial<StaffInput> & { status?: StaffMember['status'] }) {
    const member = this.db.data.staff.find((item) => item.id === id);
    if (!member) return fail(notFound('nhân viên'));
    const admins = this.db.data.staff.filter(
      (item) => item.role === 'admin' && item.status === 'active',
    );
    if (
      member.role === 'admin' &&
      admins.length === 1 &&
      (input.role === 'staff' || input.status === 'disabled')
    ) {
      return fail(
        new AdminApiError('conflict', 'Cửa hàng cần ít nhất một quản trị viên đang hoạt động.'),
      );
    }
    const before = `${member.role}/${member.status}`;
    Object.assign(member, input);
    this.db.log({
      action: 'Sửa quyền nhân viên',
      target: { type: 'staff', id, label: member.name },
      before,
      after: `${member.role}/${member.status}`,
    });
    const result = withoutPassword(member);
    return respond(clone(result));
  }

  audit(query: AuditQuery) {
    const items = this.db.data.audit
      .filter((entry) => !query.targetType || entry.target.type === query.targetType)
      .filter((entry) => matches(query.search, entry.actor, entry.action, entry.target.label));
    return respond(paginate(items, query, { at: (e) => e.at }, 'at'));
  }
}

// ---------- Search ----------

@Injectable({ providedIn: 'root' })
export class MockAdminSearchApi implements AdminSearchApi {
  private readonly db = inject(AdminMockDb);

  search(term: string): Observable<SearchResults> {
    const { orders, products, customers } = this.db.data;
    if (!term.trim()) return respond({ orders: [], products: [], customers: [] });
    return respond({
      orders: orders
        .filter((order) =>
          matches(
            term,
            order.id,
            order.customer.name,
            order.customer.phone,
            order.delivery?.trackingCode,
          ),
        )
        .slice(0, 5)
        .map((order) => ({
          id: order.id,
          customerName: order.customer.name,
          total: order.pricing.total,
          status: order.status,
        })),
      products: products
        .filter((product) =>
          matches(term, product.name, ...product.variants.map((variant) => variant.sku)),
        )
        .slice(0, 5)
        .map((product) => ({
          id: product.id,
          name: product.name,
          image: product.images[0]?.url ?? '',
          sku: product.variants.find((variant) => matches(term, variant.sku) && term.length > 3)
            ?.sku,
        })),
      customers: customers
        .filter((customer) => matches(term, customer.name, customer.phone, customer.email))
        .slice(0, 5)
        .map(({ id, name, email, phone }) => ({ id, name, email, phone })),
    });
  }
}

function withoutPassword<T extends { password?: string }>(member: T): Omit<T, 'password'> {
  const copy = clone(member);
  delete copy.password;
  return copy;
}
