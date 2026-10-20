import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CheckoutApi,
  CheckoutError,
  CheckoutErrorCode,
  CheckoutQuote,
  CheckoutRequest,
  OrderReceipt,
  PaymentSession,
  PaymentSimulator,
  QuoteRequest,
  StockIssue,
  TrackOrderRequest,
} from '../app/features/checkout/checkout-api';
import { Order, OrderItem, OrderPricing } from '../app/features/orders/order-models';
import { AuthSession } from '../app/features/auth/auth-session';
import { STORE_POLICY } from '../app/core/store-policy';
import { PRODUCTS } from './products';
import { PROVINCES, WARDS } from './locations';
import { MockAccountStore } from './mock-account-store';
import { MockPersistence } from './mock-persistence';
import { fail, respond } from './mock-latency';
import { DEMO_SEED_VOUCHER_RULES } from './demo-seed'; // DEMO SEED (remove with src/mocks/demo-seed/)

/** Demo pricing rules only; real shipping fees, promotions and limits come from the backend. */
const SHIPPING_FEE = STORE_POLICY.shippingFee;
const FREE_SHIPPING_FROM = STORE_POLICY.freeShippingFrom;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Unpaid bank-transfer orders are held this long, then cancelled. */
const PAYMENT_HOLD_MS = STORE_POLICY.paymentHoldMinutes * MINUTE;
/** Demo reconciliation: the mock "receives" the transfer this long after the QR is first shown. */
const AUTO_PAID_AFTER_MS = 15_000;
const QR_PLACEHOLDER = '/assets/payment/qr-placeholder.jpg';

interface VoucherRule {
  label: string;
  minSubtotal: number;
  discount: (subtotal: number) => number;
  shipping?: boolean;
}

const VOUCHER_RULES: Record<string, VoucherRule> = {
  N2FWELCOME15: {
    label: 'Giảm 15% đơn hàng đầu tiên',
    minSubtotal: 100000,
    discount: (subtotal) => Math.round((subtotal * 0.15) / 1000) * 1000,
  },
  N2FBDAY100: { label: 'Giảm 100K tháng sinh nhật', minSubtotal: 800000, discount: () => 100000 },
  N2FFREESHIP: {
    label: 'Miễn phí vận chuyển',
    minSubtotal: 300000,
    discount: () => 0,
    shipping: true,
  },
};

const DEMO_BANK = {
  bank: 'Ngân hàng Demo',
  accountName: 'NINE2FINE DEMO',
  accountNumber: '0000 1234 5678',
};

@Injectable({ providedIn: 'root' })
export class MockCheckoutApi implements CheckoutApi, PaymentSimulator {
  private readonly store = inject(MockAccountStore);
  private readonly session = inject(AuthSession);
  private readonly receipts = new Map<string, OrderReceipt>();
  /** When the payment page first showed each order's QR (start of the simulated transfer). */
  private readonly paymentStarted = new Map<string, number>();

  constructor() {
    const saved = inject(MockPersistence).register('checkout', () => ({
      receipts: [...this.receipts.entries()],
      paymentStarted: [...this.paymentStarted.entries()],
    }));
    for (const [key, receipt] of saved?.receipts ?? []) this.receipts.set(key, receipt);
    for (const [id, at] of saved?.paymentStarted ?? []) this.paymentStarted.set(id, at);
  }

  quote(request: QuoteRequest): Observable<CheckoutQuote> {
    const resolved = this.resolveItems(request.items);
    return 'issues' in resolved
      ? failWith('stock-changed', resolved.issues)
      : respond(this.price(resolved.items, request.voucherCode));
  }

  placeOrder(request: CheckoutRequest, idempotencyKey: string): Observable<OrderReceipt> {
    const replay = this.receipts.get(idempotencyKey);
    if (replay) return respond(replay);
    const resolved = this.resolveItems(request.items);
    if ('issues' in resolved) return failWith('stock-changed', resolved.issues);
    const items = resolved.items;
    if (!request.acceptedTerms) return failWith('unavailable');
    const province = PROVINCES.find((candidate) => candidate.code === request.address.provinceCode);
    const ward = WARDS[request.address.provinceCode]?.find(
      (candidate) => candidate.code === request.address.wardCode,
    );
    if (!province || !ward) return failWith('invalid-address');
    const quote = this.price(items, request.voucherCode);
    if (request.voucherCode && !quote.voucher) return failWith('invalid-voucher');

    const now = Date.now();
    const prepaid = request.paymentMethod === 'bank-transfer';
    const order: Order = {
      id: `N2F${new Date(now).toISOString().slice(2, 10).replace(/-/g, '')}${String(now).slice(-3)}`,
      placedAt: new Date(now).toISOString(),
      status: prepaid ? 'pending-payment' : 'processing',
      paymentDueAt: prepaid ? new Date(now + PAYMENT_HOLD_MS).toISOString() : undefined,
      items,
      pricing: quote.pricing,
      shippingAddress: {
        recipient: request.contact.name.trim(),
        phone: request.contact.phone.trim(),
        street: request.address.street.trim(),
        ward: ward.name,
        province: province.name,
      },
      payment: prepaid
        ? { method: 'bank-transfer', label: 'Chưa thanh toán · Chuyển khoản QR', paid: false }
        : { method: 'cod', label: 'Thanh toán khi nhận hàng (COD)', paid: false },
      note: request.note.trim() || undefined,
      invoice: request.invoice
        ? {
            companyName: request.invoice.companyName.trim(),
            taxCode: request.invoice.taxCode.trim(),
            address: request.invoice.address.trim(),
            email: request.invoice.email.trim().toLowerCase(),
          }
        : undefined,
    };
    this.store.reserve(order);
    this.store.addOrder(
      order,
      {
        email: request.contact.email.trim().toLowerCase(),
        phone: normalizePhone(request.contact.phone),
      },
      this.session.user()?.id ?? null,
    );
    const receipt: OrderReceipt = {
      orderId: order.id,
      status: order.status,
      total: order.pricing.total,
      customerName: request.contact.name.trim(),
      paymentMethod: request.paymentMethod,
      paymentDueAt: order.paymentDueAt ?? null,
      bankTransfer: prepaid ? { ...DEMO_BANK, reference: order.id } : null,
      estimatedDelivery: quote.estimatedDelivery,
    };
    this.receipts.set(idempotencyKey, receipt);
    return respond(receipt);
  }

  trackOrder(request: TrackOrderRequest): Observable<Order> {
    const found = this.verify(request);
    // Same error for unknown IDs and wrong contacts, so order IDs cannot be probed.
    return found ? respond(found.order) : failWith('not-found');
  }

  private verify(request: TrackOrderRequest) {
    const found = this.store.findOrder(request.orderId.trim().toUpperCase());
    const contact = request.contact.trim().toLowerCase();
    const matches =
      !!found &&
      !!contact &&
      (found.contact.email === contact || found.contact.phone === normalizePhone(contact));
    return matches ? found : undefined;
  }

  cancelOrder(request: TrackOrderRequest): Observable<Order> {
    const found = this.verify(request);
    if (!found) return failWith('not-found');
    const result = this.store.cancelOrder(found.order.id);
    return typeof result === 'string' ? failWith(result) : respond(result);
  }

  /**
   * Simulates the backend reconciling the virtual account: the order is paid and confirmed
   * AUTO_PAID_AFTER_MS after the QR was first shown, or cancelled when the hold expires first.
   */
  paymentSession(orderId: string): Observable<PaymentSession> {
    const id = orderId.trim().toUpperCase();
    const found = this.store.findOrder(id);
    if (!found || found.order.payment.method !== 'bank-transfer') return failWith('not-found');
    const now = Date.now();
    if (!this.paymentStarted.has(id)) this.paymentStarted.set(id, now);
    let order = found.order;
    if (order.status === 'pending-payment') {
      const due = order.paymentDueAt ? Date.parse(order.paymentDueAt) : now + PAYMENT_HOLD_MS;
      const paidAt = this.paymentStarted.get(id)! + AUTO_PAID_AFTER_MS;
      if (paidAt <= now && paidAt < due) order = this.markPaid(id, paidAt) ?? order;
      else if (due <= now) order = this.markExpired(id) ?? order;
    }
    return respond(this.toSession(order));
  }

  /** Demo controls on the payment page: settle immediately instead of waiting. */
  simulatePayment(orderId: string, outcome: 'paid' | 'expired'): void {
    const found = this.store.findOrder(orderId);
    if (found?.order.status !== 'pending-payment') return;
    if (outcome === 'paid') this.markPaid(orderId, Date.now());
    else this.markExpired(orderId);
  }

  private markPaid(id: string, paidAt: number): Order | undefined {
    return this.store.updateOrder(id, (order) => ({
      ...order,
      status: 'processing',
      paymentDueAt: undefined,
      paidAt: new Date(paidAt).toISOString(),
      payment: { method: 'bank-transfer', label: 'Đã thanh toán · Chuyển khoản QR', paid: true },
    }));
  }

  private markExpired(id: string): Order | undefined {
    const found = this.store.findOrder(id);
    if (found) this.store.releaseStock(found.order);
    return this.store.updateOrder(id, (order) => ({
      ...order,
      status: 'cancelled',
      cancelledBy: 'system',
      // Cancelled when the hold ended (or now, if the demo button forces it early).
      cancelledAt: new Date(
        Math.min(Date.now(), order.paymentDueAt ? Date.parse(order.paymentDueAt) : Date.now()),
      ).toISOString(),
      paymentDueAt: undefined,
      payment: { ...order.payment, label: 'Hết hạn thanh toán · Chuyển khoản QR' },
      refund: undefined,
    }));
  }

  private toSession(order: Order): PaymentSession {
    const status = order.payment.paid
      ? 'paid'
      : order.status === 'cancelled'
        ? 'expired'
        : 'awaiting';
    return {
      orderId: order.id,
      amount: order.pricing.total,
      status,
      expiresAt:
        order.paymentDueAt ?? new Date(Date.parse(order.placedAt) + PAYMENT_HOLD_MS).toISOString(),
      paidAt: order.paidAt ?? null,
      account: {
        bank: DEMO_BANK.bank,
        accountName: `NINE2FINE ${order.id}`,
        // One virtual account per order: fixed demo prefix + the order's digits.
        accountNumber: `9N2F ${order.id
          .replace(/\D/g, '')
          .slice(-9)
          .replace(/(\d{3})(?=\d)/g, '$1 ')}`,
      },
      qrImage: QR_PLACEHOLDER,
    };
  }

  /** Order lines at today's price, or every line the shop cannot fill and what is left of it. */
  private resolveItems(
    lines: QuoteRequest['items'],
  ): { items: OrderItem[] } | { issues: StockIssue[] } {
    if (!lines.length) return { issues: [] };
    const items: OrderItem[] = [];
    const issues: StockIssue[] = [];
    for (const line of lines) {
      const product = PRODUCTS.find((candidate) =>
        candidate.variants.some((variant) => variant.id === line.variantId),
      );
      const variant = product?.variants.find((candidate) => candidate.id === line.variantId);
      if (!product || !variant) {
        issues.push({ variantId: line.variantId, available: 0 });
        continue;
      }
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        issues.push({ variantId: line.variantId, available: variant.inventory });
        continue;
      }
      if (line.quantity > variant.inventory) {
        issues.push({ variantId: line.variantId, available: variant.inventory });
        continue;
      }
      items.push({
        productSlug: product.slug,
        name: product.name,
        color: variant.color.name,
        size: variant.size,
        quantity: line.quantity,
        unitPrice: product.price,
        compareAtPrice: product.compareAtPrice,
        mediaId: product.mediaId,
      });
    }
    return issues.length ? { issues } : { items };
  }

  private price(items: OrderItem[], voucherCode: string | null): CheckoutQuote {
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const code = voucherCode?.trim().toUpperCase() || null;
    // DEMO SEED: `?? DEMO_SEED_VOUCHER_RULES[code]` (remove with src/mocks/demo-seed/).
    const rule = code ? (VOUCHER_RULES[code] ?? DEMO_SEED_VOUCHER_RULES[code]) : undefined;
    let voucherError: string | null = null;
    if (code && !rule) voucherError = 'Mã giảm giá không tồn tại hoặc đã hết hạn.';
    else if (rule && subtotal < rule.minSubtotal) {
      voucherError = `Đơn hàng cần tối thiểu ${rule.minSubtotal.toLocaleString('vi-VN')} ₫ để dùng mã này.`;
    }
    const applied = rule && !voucherError ? rule : undefined;
    const shippingFee = SHIPPING_FEE;
    const shippingDiscount = subtotal >= FREE_SHIPPING_FROM || applied?.shipping ? SHIPPING_FEE : 0;
    const discount = applied ? Math.min(applied.discount(subtotal), subtotal) : 0;
    const pricing: OrderPricing = {
      subtotal,
      discount,
      shippingFee,
      shippingDiscount,
      total: subtotal - discount + shippingFee - shippingDiscount,
    };
    const now = Date.now();
    return {
      pricing,
      voucher: applied && code ? { code, label: applied.label } : null,
      voucherError,
      estimatedDelivery: {
        from: new Date(now + 2 * DAY).toISOString(),
        to: new Date(now + 4 * DAY).toISOString(),
      },
    };
  }
}

function failWith(code: CheckoutErrorCode, issues: StockIssue[] = []): Observable<never> {
  return fail(new CheckoutError(code, issues));
}

function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  return digits.startsWith('+84') ? `0${digits.slice(3)}` : digits;
}
