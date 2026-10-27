import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CATEGORIES } from '../../app/features/catalog/models/product';
import { RETURN_REASONS } from '../../app/admin/core/status';
import type { AdminReportsApi } from '../../app/admin/data-access/admin-apis';
import type {
  AbcClass,
  AdminOrder,
  AdminProduct,
  CustomerTier,
  ReportFigure,
  ReportRange,
  SalesReport,
} from '../../app/admin/data-access/models';
import { respond } from '../mock-latency';
import { AdminMockDb } from './admin-mock-db';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DAYS: Record<ReportRange, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
/** Statuses where the order was confirmed and goods left (or will leave) the shop. */
const SOLD = new Set([
  'processing',
  'shipping',
  'delivering',
  'delivery-failed',
  'returned-to-sender',
  'completed',
  'return-requested',
  'returned',
]);
const SHIPPED = new Set([
  'shipping',
  'delivering',
  'delivery-failed',
  'returned-to-sender',
  'completed',
  'return-requested',
  'returned',
]);
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const TIERS: { tier: CustomerTier; label: string }[] = [
  { tier: 'gold', label: 'Vàng' },
  { tier: 'silver', label: 'Bạc' },
  { tier: 'member', label: 'Đồng' },
];
const PAYMENT_LABELS: Record<string, string> = {
  cod: 'Thu tiền khi giao (COD)',
  'bank-transfer': 'Chuyển khoản',
  card: 'Thẻ',
};
const CANCEL_REASONS: Record<string, string> = {
  customer: 'Khách tự hủy',
  shop: 'Shop hủy (hết hàng)',
  system: 'Quá hạn thanh toán',
};

interface Totals {
  revenue: number;
  profit: number;
  orders: number;
  units: number;
  discount: number;
  refunds: number;
  customers: number;
}

/**
 * Báo cáo kinh doanh, computed from the mock orders, products and customers. Revenue is what the
 * shopper paid for goods (total minus shipping), refunds are subtracted, profit uses product cost.
 */
@Injectable({ providedIn: 'root' })
export class MockAdminReportsApi implements AdminReportsApi {
  private readonly db = inject(AdminMockDb);

  sales(range: ReportRange): Observable<SalesReport> {
    const days = DAYS[range];
    const now = Date.now();
    const from = now - days * DAY;
    const previousFrom = from - days * DAY;
    const { orders, products, customers, promotions } = this.db.data;
    const productOf = new Map(products.map((product) => [product.id, product]));
    const placed = (order: AdminOrder) => Date.parse(order.placedAt);
    const placedIn = (start: number, end: number) =>
      orders.filter((order) => placed(order) >= start && placed(order) < end);
    const current = placedIn(from, now + 1);
    const previous = placedIn(previousFrom, from);
    const sold = current.filter((order) => SOLD.has(order.status));
    const soldBefore = previous.filter((order) => SOLD.has(order.status));
    const hasHistory = orders.some((order) => placed(order) < from);

    // ---- KPIs ----
    const totals = (list: AdminOrder[]): Totals => {
      const result: Totals = {
        revenue: 0,
        profit: 0,
        orders: list.length,
        units: 0,
        discount: 0,
        refunds: 0,
        customers: new Set(list.map((order) => order.customer.id ?? order.customer.phone)).size,
      };
      for (const order of list) {
        const goods = goodsValue(order);
        const refund = refundOf(order);
        result.revenue += goods - refund;
        result.discount += order.pricing.discount;
        result.refunds += refund;
        const share = goods / Math.max(1, order.pricing.subtotal);
        order.items.forEach((item, index) => {
          const back = returnedUnits(order, index);
          const kept = item.quantity - back;
          result.units += item.quantity;
          result.profit += (item.unitPrice * share - costOf(productOf.get(item.productId))) * kept;
        });
      }
      return result;
    };
    const now$ = totals(sold);
    const before = totals(soldBefore);
    const figure = (value: number, prior: number): ReportFigure => ({
      value,
      previous: hasHistory ? prior : null,
    });
    const ratio = (a: number, b: number) => (b ? a / b : 0);
    const cancelledNow = current.filter((order) => order.status === 'cancelled').length;
    const cancelledBefore = previous.filter((order) => order.status === 'cancelled').length;

    // ---- Trend ----
    const bucket: SalesReport['trend']['bucket'] =
      days <= 31 ? 'day' : days <= 90 ? 'week' : 'month';
    const step = bucket === 'day' ? DAY : bucket === 'week' ? 7 * DAY : 0;
    const points: SalesReport['trend']['points'] = [];
    if (bucket === 'month') {
      for (let i = 11; i >= 0; i--) {
        const start = monthStart(now, -i);
        const end = monthStart(now, -i + 1);
        const prevStart = monthStart(now, -i - 12);
        const prevEnd = monthStart(now, -i - 11);
        const here = totals(placedIn(start, end).filter((order) => SOLD.has(order.status)));
        const prior = totals(
          placedIn(prevStart, prevEnd).filter((order) => SOLD.has(order.status)),
        );
        points.push({
          label: `T${new Date(start + 7 * HOUR).getUTCMonth() + 1}`,
          revenue: here.revenue,
          previous: prior.revenue,
          orders: here.orders,
          profit: Math.round(here.profit),
        });
      }
    } else {
      const count = Math.ceil((days * DAY) / step);
      for (let i = 0; i < count; i++) {
        const start = from + i * step;
        const end = Math.min(start + step, now + 1);
        const here = totals(placedIn(start, end).filter((order) => SOLD.has(order.status)));
        const prior = totals(
          placedIn(start - days * DAY, end - days * DAY).filter((order) => SOLD.has(order.status)),
        );
        points.push({
          label: dayLabel(start),
          revenue: here.revenue,
          previous: prior.revenue,
          orders: here.orders,
          profit: Math.round(here.profit),
        });
      }
    }

    // ---- Products, categories, sizes, colours ----
    const byProduct = new Map<
      string,
      { units: number; revenue: number; profit: number; returned: number }
    >();
    const byCategory = new Map<string, { revenue: number; units: number; profit: number }>();
    const bySize = new Map<string, SalesReport['bySize'][number]>();
    const byColor = new Map<string, SalesReport['byColor'][number]>();
    const byVariant = new Map<string, number>();
    const returnsByProduct = new Map<string, SalesReport['returnsByProduct'][number]>();
    const returnReasons = new Map<string, number>();
    let returnOrders = 0;
    let returnUnits = 0;
    let returnValue = 0;
    for (const order of sold) {
      const share = goodsValue(order) / Math.max(1, order.pricing.subtotal);
      if (order.returnRequest && order.returnRequest.decision?.status !== 'rejected') {
        returnOrders += 1;
        returnValue += order.returnRequest.amount;
        const label = RETURN_REASONS[order.returnRequest.reason];
        returnReasons.set(label, (returnReasons.get(label) ?? 0) + 1);
      }
      order.items.forEach((item, index) => {
        const product = productOf.get(item.productId);
        const revenue = item.unitPrice * item.quantity * share;
        const back = returnedUnits(order, index);
        const profit = (item.unitPrice * share - costOf(product)) * (item.quantity - back);
        returnUnits += back;
        const row = byProduct.get(item.productId) ?? {
          units: 0,
          revenue: 0,
          profit: 0,
          returned: 0,
        };
        row.units += item.quantity;
        row.revenue += revenue;
        row.profit += profit;
        row.returned += back;
        byProduct.set(item.productId, row);
        const category = product?.category ?? 'other';
        const cat = byCategory.get(category) ?? { revenue: 0, units: 0, profit: 0 };
        cat.revenue += revenue;
        cat.units += item.quantity;
        cat.profit += profit;
        byCategory.set(category, cat);
        const size = bySize.get(item.size) ?? {
          size: item.size,
          units: 0,
          revenue: 0,
          returned: 0,
        };
        size.units += item.quantity;
        size.revenue += revenue;
        size.returned += back;
        bySize.set(item.size, size);
        const hex =
          product?.variants.find((variant) => variant.id === item.variantId)?.color.hex ??
          '#999999';
        const color = byColor.get(item.color) ?? { color: item.color, hex, units: 0, revenue: 0 };
        color.units += item.quantity;
        color.revenue += revenue;
        byColor.set(item.color, color);
        byVariant.set(item.variantId, (byVariant.get(item.variantId) ?? 0) + item.quantity);
        if (back && order.returnRequest) {
          const entry = returnsByProduct.get(item.productId) ?? {
            productId: item.productId,
            name: item.name,
            sold: 0,
            returned: 0,
            reasons: [],
          };
          entry.returned += back;
          const label = RETURN_REASONS[order.returnRequest.reason];
          const reason = entry.reasons.find((value) => value.reason === label);
          if (reason) reason.count += back;
          else entry.reasons.push({ reason: label, count: back });
          returnsByProduct.set(item.productId, entry);
        }
      });
    }
    for (const entry of returnsByProduct.values())
      entry.sold = byProduct.get(entry.productId)?.units ?? entry.returned;

    // Active products that sold nothing still belong in the ranking (group C, slow movers).
    for (const product of products)
      if (product.status === 'active' && !byProduct.has(product.id))
        byProduct.set(product.id, { units: 0, revenue: 0, profit: 0, returned: 0 });
    const revenueTotal = [...byProduct.values()].reduce((sum, row) => sum + row.revenue, 0);
    const ranked = [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
    let running = 0;
    const productRows: SalesReport['products'] = ranked.map(([productId, row]) => {
      const product = productOf.get(productId);
      const before = running / Math.max(1, revenueTotal);
      running += row.revenue;
      const abc: AbcClass = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C';
      const onHand = product?.variants.reduce((sum, variant) => sum + variant.inventory, 0) ?? 0;
      const perDay = row.units / days;
      return {
        productId,
        name: product?.name ?? productId,
        image: product?.images[0]?.url ?? '',
        category: CATEGORIES.find((item) => item.value === product?.category)?.label ?? '',
        units: row.units,
        revenue: Math.round(row.revenue),
        profit: Math.round(row.profit),
        margin: ratio(row.profit, row.revenue),
        returnRate: ratio(row.returned, row.units),
        onHand,
        daysOfCover: perDay ? Math.round(onHand / perDay) : null,
        sellThrough: ratio(row.units, row.units + onHand),
        abc,
      };
    });

    // ---- Customers ----
    const firstOrder = new Map<string, number>();
    const lifetime = new Map<string, number>();
    for (const order of orders.filter((item) => SOLD.has(item.status) && item.customer.id)) {
      const id = order.customer.id!;
      firstOrder.set(id, Math.min(firstOrder.get(id) ?? Infinity, placed(order)));
      lifetime.set(id, (lifetime.get(id) ?? 0) + goodsValue(order) - refundOf(order));
    }
    const buyers = new Map<string, { orders: number; revenue: number; last: number }>();
    let newRevenue = 0;
    let returningRevenue = 0;
    let guestOrders = 0;
    let guestRevenue = 0;
    for (const order of sold) {
      const value = goodsValue(order) - refundOf(order);
      const id = order.customer.id;
      if (!id) {
        guestOrders += 1;
        guestRevenue += value;
        continue;
      }
      const row = buyers.get(id) ?? { orders: 0, revenue: 0, last: 0 };
      row.orders += 1;
      row.revenue += value;
      row.last = Math.max(row.last, placed(order));
      buyers.set(id, row);
      if ((firstOrder.get(id) ?? 0) >= from) newRevenue += value;
      else returningRevenue += value;
    }
    const buyerIds = [...buyers.keys()];
    const newCustomers = buyerIds.filter((id) => (firstOrder.get(id) ?? 0) >= from).length;
    const everOrders = (id: string) =>
      orders.filter((order) => order.customer.id === id && SOLD.has(order.status)).length;
    const customerOf = new Map(customers.map((customer) => [customer.id, customer]));
    const byTier = TIERS.map(({ tier, label }) => {
      const ids = buyerIds.filter((id) => customerOf.get(id)?.tier === tier);
      const tierOrders = ids.reduce((sum, id) => sum + buyers.get(id)!.orders, 0);
      const revenue = ids.reduce((sum, id) => sum + buyers.get(id)!.revenue, 0);
      return {
        tier,
        label,
        customers: ids.length,
        orders: tierOrders,
        revenue: Math.round(revenue),
        averageOrder: Math.round(ratio(revenue, tierOrders)),
      };
    });
    const top = buyerIds
      .map((id) => ({ id, ...buyers.get(id)! }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        name: customerOf.get(row.id)?.name ?? row.id,
        tier: customerOf.get(row.id)?.tier ?? 'member',
        orders: row.orders,
        revenue: Math.round(row.revenue),
        lastOrderAt: new Date(row.last).toISOString(),
      }));

    // ---- Regions, time of day, payments ----
    const regions = new Map<string, { orders: number; revenue: number }>();
    const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => 0));
    const payments = new Map<
      string,
      { orders: number; revenue: number; shipped: number; failed: number }
    >();
    for (const order of sold) {
      const value = goodsValue(order) - refundOf(order);
      const region = regions.get(order.shippingAddress.province) ?? { orders: 0, revenue: 0 };
      region.orders += 1;
      region.revenue += value;
      regions.set(order.shippingAddress.province, region);
      const local = new Date(placed(order) + 7 * HOUR);
      heatmap[(local.getUTCDay() + 6) % 7][Math.floor(local.getUTCHours() / 4)] += 1;
      const pay = payments.get(order.payment.method) ?? {
        orders: 0,
        revenue: 0,
        shipped: 0,
        failed: 0,
      };
      pay.orders += 1;
      pay.revenue += value;
      if (SHIPPED.has(order.status)) pay.shipped += 1;
      if (order.deliveryFailure) pay.failed += 1;
      payments.set(order.payment.method, pay);
    }

    // ---- Operations ----
    const shipHours = sold
      .map((order) => {
        const handed = order.events.find((event) => event.title.startsWith('Đã bàn giao'));
        return handed ? (Date.parse(handed.at) - placed(order)) / HOUR : null;
      })
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const cancelReasons = new Map<string, number>();
    for (const order of current.filter((item) => item.status === 'cancelled')) {
      const label = CANCEL_REASONS[order.cancelledBy ?? 'customer'];
      cancelReasons.set(label, (cancelReasons.get(label) ?? 0) + 1);
    }

    // ---- Inventory ----
    const active = products.filter((product) => product.status === 'active');
    const variants = active.flatMap((product) =>
      product.variants.map((variant) => ({ product, variant })),
    );
    const lastSold = new Map<string, number>();
    for (const order of orders.filter((item) => SOLD.has(item.status)))
      for (const item of order.items)
        lastSold.set(item.variantId, Math.max(lastSold.get(item.variantId) ?? 0, placed(order)));
    const topProducts = new Set(
      productRows.filter((row) => row.abc === 'A').map((row) => row.productId),
    );
    const stockoutRisks = variants
      // Only sizes people actually buy: a variant with no sale in 90 days is not a lost sale.
      .filter(
        ({ product, variant }) =>
          topProducts.has(product.id) &&
          variant.inventory <= 3 &&
          (lastSold.get(variant.id) ?? 0) >= now - 90 * DAY,
      )
      .map(({ product, variant }) => ({
        productId: product.id,
        name: product.name,
        variant: `${variant.color.name} / ${variant.size}`,
        sku: variant.sku,
        available: variant.inventory,
        unitsSold: byVariant.get(variant.id) ?? 0,
      }))
      .sort((a, b) => a.available - b.available || b.unitsSold - a.unitsSold)
      .slice(0, 12);
    const agingStock = variants
      .filter(({ variant }) => variant.inventory > 0)
      .map(({ product, variant }) => {
        const last = lastSold.get(variant.id);
        return {
          variantId: variant.id,
          productId: product.id,
          sku: variant.sku,
          name: product.name,
          variant: `${variant.color.name} / ${variant.size}`,
          onHand: variant.inventory,
          lastSoldAt: last ? new Date(last).toISOString() : null,
          stockValue: variant.inventory * costOf(product),
        };
      })
      .filter((row) => !row.lastSoldAt || now - Date.parse(row.lastSoldAt) > 30 * DAY)
      .sort((a, b) => (a.lastSoldAt ?? '').localeCompare(b.lastSoldAt ?? '') || b.onHand - a.onHand)
      .slice(0, 15);

    // ---- Promotions ----
    const byCode = new Map<string, SalesReport['promotions'][number]>();
    let withCode = 0;
    let withoutCode = 0;
    let ordersWithCode = 0;
    for (const order of sold) {
      const value = goodsValue(order);
      if (!order.voucherCode) {
        withoutCode += value;
        continue;
      }
      withCode += value;
      ordersWithCode += 1;
      const row = byCode.get(order.voucherCode) ?? {
        code: order.voucherCode,
        title: promotions.find((promo) => promo.code === order.voucherCode)?.title ?? '',
        orders: 0,
        discount: 0,
        revenue: 0,
        averageOrder: 0,
        cost: 0,
      };
      row.orders += 1;
      row.discount += order.pricing.discount;
      row.revenue += value;
      row.averageOrder = Math.round(row.revenue / row.orders);
      row.cost = ratio(row.discount, row.revenue);
      byCode.set(order.voucherCode, row);
    }

    const share = (value: number, total: number) => ratio(value, total);
    const regionTotal = [...regions.values()].reduce((sum, row) => sum + row.revenue, 0);
    const payTotal = [...payments.values()].reduce((sum, row) => sum + row.revenue, 0);

    return respond({
      range,
      from: new Date(from).toISOString(),
      to: new Date(now).toISOString(),
      previousFrom: new Date(previousFrom).toISOString(),
      kpis: {
        netRevenue: figure(Math.round(now$.revenue), Math.round(before.revenue)),
        grossProfit: figure(Math.round(now$.profit), Math.round(before.profit)),
        grossMargin: figure(ratio(now$.profit, now$.revenue), ratio(before.profit, before.revenue)),
        orders: figure(now$.orders, before.orders),
        averageOrder: figure(
          Math.round(ratio(now$.revenue, now$.orders)),
          Math.round(ratio(before.revenue, before.orders)),
        ),
        unitsPerOrder: figure(ratio(now$.units, now$.orders), ratio(before.units, before.orders)),
        discountRate: figure(
          ratio(now$.discount, now$.revenue + now$.discount),
          ratio(before.discount, before.revenue + before.discount),
        ),
        refundRate: figure(
          ratio(now$.refunds, now$.revenue + now$.refunds),
          ratio(before.refunds, before.revenue + before.refunds),
        ),
        cancelRate: figure(
          ratio(cancelledNow, current.length),
          ratio(cancelledBefore, previous.length),
        ),
        customers: figure(now$.customers, before.customers),
      },
      trend: { bucket, points },
      categories: [...byCategory.entries()]
        .map(([category, row]) => ({
          category,
          label: CATEGORIES.find((item) => item.value === category)?.label ?? 'Khác',
          revenue: Math.round(row.revenue),
          units: row.units,
          profit: Math.round(row.profit),
          share: share(row.revenue, revenueTotal),
        }))
        .sort((a, b) => b.revenue - a.revenue),
      products: productRows,
      bySize: [...bySize.values()]
        .map((row) => ({ ...row, revenue: Math.round(row.revenue) }))
        .sort((a, b) => rank(a.size) - rank(b.size) || a.size.localeCompare(b.size)),
      byColor: [...byColor.values()]
        .map((row) => ({ ...row, revenue: Math.round(row.revenue) }))
        .sort((a, b) => b.units - a.units),
      customers: {
        newCustomers,
        returningCustomers: buyerIds.length - newCustomers,
        newRevenue: Math.round(newRevenue),
        returningRevenue: Math.round(returningRevenue),
        guestOrders,
        guestRevenue: Math.round(guestRevenue),
        repeatRate: ratio(buyerIds.filter((id) => everOrders(id) >= 2).length, buyerIds.length),
        lifetimeValue: Math.round(
          ratio(
            buyerIds.reduce((sum, id) => sum + (lifetime.get(id) ?? 0), 0),
            buyerIds.length,
          ),
        ),
        byTier,
        top,
      },
      regions: [...regions.entries()]
        .map(([province, row]) => ({
          province,
          orders: row.orders,
          revenue: Math.round(row.revenue),
          share: share(row.revenue, regionTotal),
        }))
        .sort((a, b) => b.revenue - a.revenue),
      heatmap,
      payments: [...payments.entries()]
        .map(([method, row]) => ({
          method,
          label: PAYMENT_LABELS[method] ?? method,
          orders: row.orders,
          revenue: Math.round(row.revenue),
          share: share(row.revenue, payTotal),
          failureRate: ratio(row.failed, row.shipped),
        }))
        .sort((a, b) => b.revenue - a.revenue),
      operations: {
        hoursToShip: shipHours.length
          ? Math.round(shipHours[Math.floor(shipHours.length / 2)])
          : null,
        shippedWithinDay: ratio(shipHours.filter((hours) => hours <= 24).length, shipHours.length),
        deliveryFailures: sold.filter((order) => order.deliveryFailure).length,
        returnedToSender: sold.filter((order) => order.status === 'returned-to-sender').length,
        cancelled: cancelledNow,
        cancelReasons: [...cancelReasons.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count),
      },
      returns: {
        orders: returnOrders,
        units: returnUnits,
        value: Math.round(returnValue),
        reasons: [...returnReasons.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count),
      },
      returnsByProduct: [...returnsByProduct.values()]
        .map((row) => ({ ...row, reasons: row.reasons.sort((a, b) => b.count - a.count) }))
        .sort((a, b) => b.returned / b.sold - a.returned / a.sold),
      inventory: {
        units: variants.reduce((sum, { variant }) => sum + variant.inventory, 0),
        value: variants.reduce(
          (sum, { product, variant }) => sum + variant.inventory * costOf(product),
          0,
        ),
        retailValue: variants.reduce(
          (sum, { product, variant }) => sum + variant.inventory * (variant.price ?? product.price),
          0,
        ),
        outOfStockSkus: variants.filter(({ variant }) => variant.inventory <= 0).length,
        stockoutRisks,
      },
      agingStock,
      promotions: [...byCode.values()].sort((a, b) => b.revenue - a.revenue),
      promotionLift: {
        withCode: Math.round(ratio(withCode, ordersWithCode)),
        withoutCode: Math.round(ratio(withoutCode, sold.length - ordersWithCode)),
        ordersWithCode,
      },
    });
  }
}

/** What the shopper paid for goods: total without the shipping they paid. */
function goodsValue(order: AdminOrder): number {
  return order.pricing.total - (order.pricing.shippingFee - order.pricing.shippingDiscount);
}

function refundOf(order: AdminOrder): number {
  return order.status === 'returned'
    ? (order.refund?.amount ?? order.returnRequest?.amount ?? 0)
    : 0;
}

function returnedUnits(order: AdminOrder, index: number): number {
  if (order.status !== 'returned' && order.status !== 'return-requested') return 0;
  return order.returnRequest?.lines.find((line) => line.index === index)?.quantity ?? 0;
}

function costOf(product: AdminProduct | undefined): number {
  if (!product) return 0;
  return product.cost ?? Math.round(product.price * 0.42);
}

function rank(size: string): number {
  const index = SIZE_ORDER.indexOf(size);
  return index < 0 ? SIZE_ORDER.length + Number(size) || 99 : index;
}

function dayLabel(time: number): string {
  const local = new Date(time + 7 * HOUR);
  return `${String(local.getUTCDate()).padStart(2, '0')}/${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Start (UTC ms) of the GMT+7 month `offset` months from the one containing `time`. */
function monthStart(time: number, offset: number): number {
  const local = new Date(time + 7 * HOUR);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 1) - 7 * HOUR;
}
