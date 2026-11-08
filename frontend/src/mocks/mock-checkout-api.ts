import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CheckoutApi,
  CheckoutError,
  CheckoutErrorCode,
  CheckoutErrorDetails,
  CheckoutQuote,
  CheckoutRequest,
  LookupRequest,
  LookupVerifyRequest,
  OrderReceipt,
  PaymentSession,
  PaymentSimulator,
  QuoteRequest,
  StockIssue,
  VoucherApplied,
  VoucherCheckResult,
  VoucherRejection,
} from '../app/features/checkout/checkout-api';
import { Location } from '../app/features/account/data-access/account-models';
import { Order, OrderItem, OrderPricing } from '../app/features/orders/order-models';
import { withCancel } from '../app/features/account/data-access/orders-api';
import { AuthSession } from '../app/features/auth/auth-session';
import { PROVINCES, WARDS } from './locations';
import { DEMO_VERIFICATION_CODE } from './accounts';
import { MockAccountStore } from './mock-account-store';
import { MockPersistence } from './mock-persistence';
import { fail, respond } from './mock-latency';
import {
  countMockCall,
  mockFlags,
  mockPolicy,
  refreshMockLine,
  takePlaceError,
} from './mock-flags';
import { DEMO_SEED_VOUCHER_RULES } from './demo-seed'; // DEMO SEED (remove with src/mocks/demo-seed/)

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Demo reconciliation: the mock "receives" the transfer this long after the QR is first shown. */
const AUTO_PAID_AFTER_MS = 15_000;
const QR_PLACEHOLDER = '/assets/payment/qr-placeholder.jpg';
/** Wrong lookup codes allowed per email before the mock locks it (BR-AUTH-08 style). */
const MAX_LOOKUP_ATTEMPTS = 5;

interface VoucherRule {
  label: string;
  minSubtotal: number;
  discount: (subtotal: number) => number;
  shipping?: boolean;
}

/** Percent codes round down to 1.000 ₫ (assumption Q1). */
const VOUCHER_RULES: Record<string, VoucherRule> = {
  N2FWELCOME15: {
    label: 'Giảm 15% đơn hàng đầu tiên',
    minSubtotal: 100000,
    discount: (subtotal) => Math.floor((subtotal * 0.15) / 1000) * 1000,
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
  /** Orders a guest proved with the lookup code (stands for the `n2f_oa` cookie). */
  private readonly verified = new Set<string>();
  private readonly lookupFailures = new Map<string, number>();

  constructor() {
    const saved = inject(MockPersistence).register('checkout', () => ({
      receipts: [...this.receipts.entries()],
      paymentStarted: [...this.paymentStarted.entries()],
    }));
    for (const [key, receipt] of saved?.receipts ?? []) this.receipts.set(key, receipt);
    for (const [id, at] of saved?.paymentStarted ?? []) this.paymentStarted.set(id, at);
  }

  quote(request: QuoteRequest): Observable<CheckoutQuote> {
    countMockCall('quote');
    if (mockFlags().refreshFail) return failWith('unavailable');
    try {
      return respond(this.buildQuote(request));
    } catch (error) {
      return fail(error as Error);
    }
  }

  checkVoucher(
    code: string,
    request: Pick<QuoteRequest, 'items' | 'voucherCodes' | 'address' | 'contact'>,
  ): Observable<VoucherCheckResult> {
    if (mockFlags().voucherLocked) return failWith('rate-limited', { retryAfterSeconds: 900 });
    if (mockFlags().refreshFail) return failWith('unavailable');
    const normalized = normalizeCode(code);
    try {
      const existing = (request.voucherCodes ?? []).map(normalizeCode);
      const withCode = this.buildQuote({ ...request, voucherCodes: [...existing, normalized] });
      const applied = withCode.vouchers.find((voucher) => voucher.code === normalized);
      if (applied) return respond({ result: applied, quote: withCode });
      const rejection = withCode.rejectedVouchers.find((voucher) => voucher.code === normalized);
      return respond({
        result: rejection ?? { applied: false, code: normalized, reason: 'not-found' },
        quote: this.buildQuote({ ...request, voucherCodes: existing }),
      });
    } catch (error) {
      return fail(error as Error);
    }
  }

  placeOrder(request: CheckoutRequest, idempotencyKey: string): Observable<OrderReceipt> {
    const replay = this.receipts.get(idempotencyKey);
    if (replay) return respond(replay);
    const injected = takePlaceError();
    if (injected) return this.injectedFailure(injected, request);
    try {
      return respond(this.create(request, idempotencyKey));
    } catch (error) {
      return fail(error as Error);
    }
  }

  provinces(): Observable<Location[]> {
    return respond([...PROVINCES]);
  }

  wards(provinceCode: string): Observable<Location[]> {
    const wards = WARDS[provinceCode];
    return wards ? respond([...wards]) : failWith('not-found');
  }

  /** Same answer whether or not the order exists (AC-CHK-31). */
  requestLookupCode(request: LookupRequest): Observable<{ resendAfterSeconds: number }> {
    void request;
    return respond({ resendAfterSeconds: 60 });
  }

  verifyLookup(request: LookupVerifyRequest): Observable<Order> {
    const email = request.email.trim().toLowerCase();
    const failures = this.lookupFailures.get(email) ?? 0;
    if (failures >= MAX_LOOKUP_ATTEMPTS) {
      return failWith('code-locked', { retryAfterSeconds: 60 });
    }
    const found = this.store.findOrder(normalizeOrderCode(request.orderCode));
    if (!found || found.contact.email !== email || request.code !== DEMO_VERIFICATION_CODE) {
      this.lookupFailures.set(email, failures + 1);
      return failWith('not-found');
    }
    this.lookupFailures.delete(email);
    this.verified.add(found.order.id);
    return respond(this.present(found.order, found.contact.email));
  }

  getOrder(orderCode: string): Observable<Order> {
    const id = normalizeOrderCode(orderCode);
    const found = this.store.findOrder(id);
    if (!found) return failWith('not-found');
    if (!this.verified.has(id)) return failWith('unauthenticated');
    return respond(this.present(found.order, found.contact.email));
  }

  cancel(orderCode: string): Observable<Order> {
    const id = normalizeOrderCode(orderCode);
    const found = this.store.findOrder(id);
    if (!found) return failWith('not-found');
    if (!this.verified.has(id)) return failWith('unauthenticated');
    const result = this.store.cancelOrder(id);
    return typeof result === 'string'
      ? failWith(result)
      : respond(this.present(result, found.contact.email));
  }

  private present(order: Order, email: string): Order {
    return withCancel({ ...order, email });
  }

  /** Simulates the backend reconciling the virtual account. */
  paymentSession(orderId: string): Observable<PaymentSession> {
    const id = normalizeOrderCode(orderId);
    const found = this.store.findOrder(id);
    if (!found || found.order.payment.method !== 'bank-transfer') return failWith('not-found');
    const now = Date.now();
    if (!this.paymentStarted.has(id)) this.paymentStarted.set(id, now);
    let order = found.order;
    if (order.status === 'pending-payment') {
      const due = order.paymentDueAt
        ? Date.parse(order.paymentDueAt)
        : now + mockPolicy().bankHoldMinutes * MINUTE;
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
        order.paymentDueAt ??
        new Date(Date.parse(order.placedAt) + mockPolicy().bankHoldMinutes * MINUTE).toISOString(),
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
      transferContent: order.id,
    };
  }

  /** `POST /orders` for real: checks in the server's order, then stores and returns the order. */
  private create(request: CheckoutRequest, idempotencyKey: string): OrderReceipt {
    const policy = mockPolicy();
    if (!request.acceptedTerms) {
      throw new CheckoutError('validation', { field: 'acceptedTerms' });
    }
    this.assertStructure(request.items.map((item) => item.quantity));
    const province = PROVINCES.find((candidate) => candidate.code === request.address.provinceCode);
    const ward = WARDS[request.address.provinceCode]?.find(
      (candidate) => candidate.code === request.address.wardCode,
    );
    if (!province || !ward) {
      throw new CheckoutError('invalid-address', { field: 'address.wardCode' });
    }
    const quote = this.buildQuote({
      items: request.items,
      voucherCodes: request.voucherCodes,
      address: request.address,
      contact: { email: request.contact.email, phone: request.contact.phone },
      paymentMethod: request.paymentMethod,
    });
    const issues: StockIssue[] = quote.lines
      .filter((line) => line.effectiveQuantity < line.requestedQuantity)
      .map((line) => ({ variantId: line.variantId, available: line.inventory }));
    if (issues.length) throw new CheckoutError('stock-changed', { stockIssues: issues, quote });
    const requested = new Set(request.voucherCodes.map(normalizeCode));
    const removed = quote.rejectedVouchers
      .map((voucher) => voucher.code)
      .filter((code) => requested.has(code));
    if (removed.length) {
      throw new CheckoutError('voucher-changed', { removedVoucherCodes: removed, quote });
    }
    if (!matchesExpected(request, quote)) throw new CheckoutError('price-changed', { quote });
    const option = quote.paymentMethods.find(
      (candidate) => candidate.method === request.paymentMethod,
    );
    if (!option?.available) throw new CheckoutError('validation', { field: 'paymentMethod' });

    const now = Date.now();
    const prepaid = request.paymentMethod === 'bank-transfer';
    const items: OrderItem[] = quote.lines.map((line) => ({
      variantId: line.variantId,
      productSlug: line.slug,
      name: line.name,
      color: line.color,
      size: line.size,
      quantity: line.effectiveQuantity,
      unitPrice: line.unitPrice,
      compareAtPrice: line.compareAtPrice,
      mediaId: line.mediaId,
      lineDiscount: quote.lineDiscounts?.find((entry) => entry.variantId === line.variantId)
        ?.amount,
    }));
    const email = request.contact.email.trim().toLowerCase();
    const order: Order = {
      id: `N2F${new Date(now).toISOString().slice(2, 10).replace(/-/g, '')}${String(
        1000 + Math.floor(Math.random() * 9000),
      )}`,
      placedAt: new Date(now).toISOString(),
      status: prepaid ? 'pending-payment' : 'processing',
      paymentDueAt: prepaid
        ? new Date(now + policy.bankHoldMinutes * MINUTE).toISOString()
        : undefined,
      items,
      pricing: quote.pricing,
      shippingAddress: {
        recipient: request.contact.name.trim(),
        phone: normalizePhone(request.contact.phone),
        street: request.address.street.trim(),
        ward: ward.name,
        province: province.name,
      },
      payment: prepaid
        ? { method: 'bank-transfer', label: 'Chưa thanh toán · Chuyển khoản QR', paid: false }
        : { method: 'cod', label: 'Thanh toán khi nhận hàng (COD)', paid: false },
      note: request.note.trim() || undefined,
      voucherCode: quote.vouchers.map((voucher) => voucher.code).join(', ') || undefined,
      invoice: request.invoice
        ? {
            companyName: request.invoice.companyName.trim(),
            taxCode: request.invoice.taxCode.trim(),
            address: request.invoice.address.trim(),
            email: request.invoice.email.trim().toLowerCase(),
          }
        : undefined,
      estimatedDelivery: quote.estimatedDelivery,
      email,
    };
    this.store.reserve(order);
    this.store.addOrder(
      order,
      { email, phone: normalizePhone(request.contact.phone) },
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
      email,
      willCallToConfirm: !prepaid && !(this.session.signedIn() && order.pricing.total < 1_000_000),
    };
    this.receipts.set(idempotencyKey, receipt);
    return receipt;
  }

  private injectedFailure(
    code: NonNullable<ReturnType<typeof takePlaceError>>,
    request: CheckoutRequest,
  ): Observable<never> {
    const quote = this.buildQuote({
      items: request.items,
      voucherCodes: code === 'voucher-changed' ? [] : request.voucherCodes,
    });
    switch (code) {
      case 'price-changed': {
        // The first line costs 10.000 ₫ more than the shopper saw.
        const first = quote.lines[0];
        const raised = first
          ? {
              ...quote,
              lines: [{ ...first, unitPrice: first.unitPrice + 10000 }, ...quote.lines.slice(1)],
            }
          : quote;
        const pricing = { ...raised.pricing };
        pricing.subtotal += first ? 10000 * first.effectiveQuantity : 0;
        pricing.total += first ? 10000 * first.effectiveQuantity : 0;
        return failWith(code, { quote: { ...raised, pricing } });
      }
      case 'voucher-changed':
        return failWith(code, {
          removedVoucherCodes: request.voucherCodes.map(normalizeCode),
          quote,
        });
      case 'stock-changed':
        return failWith(code, {
          quote,
          stockIssues: request.items.slice(0, 1).map((item) => ({
            variantId: item.variantId,
            available: Math.max(0, item.quantity - 1),
          })),
        });
      case 'rate-limited':
        return failWith(code, { retryAfterSeconds: 3 });
      case 'possible-duplicate':
        return failWith(code, { existingOrderCode: 'N2F2611040427' });
      case 'invalid-address':
        return failWith(code, { field: 'address.wardCode' });
      default:
        return failWith(code);
    }
  }

  private assertStructure(quantities: number[]): void {
    const policy = mockPolicy();
    if (
      quantities.length > policy.maxCartLines ||
      quantities.reduce((sum, quantity) => sum + quantity, 0) > policy.maxItemsPerOrder
    ) {
      throw new CheckoutError('validation', { field: 'items' });
    }
  }

  /** Server-side pricing: prices and stock from the catalog, never from the request. */
  private buildQuote(request: QuoteRequest): CheckoutQuote {
    const policy = mockPolicy();
    const lines = request.items.map((item) => refreshMockLine(item.variantId, item.quantity));
    this.assertStructure(lines.map((line) => line.effectiveQuantity));
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.effectiveQuantity, 0);

    const applied: VoucherApplied[] = [];
    const rejectedVouchers: VoucherRejection[] = [];
    let discount = 0;
    for (const code of (request.voucherCodes ?? []).map(normalizeCode)) {
      // DEMO SEED: `?? DEMO_SEED_VOUCHER_RULES[code]` (remove with src/mocks/demo-seed/).
      const rule = VOUCHER_RULES[code] ?? DEMO_SEED_VOUCHER_RULES[code];
      if (!rule) {
        rejectedVouchers.push({ applied: false, code, reason: 'not-found' });
      } else if (subtotal < rule.minSubtotal) {
        rejectedVouchers.push({
          applied: false,
          code,
          reason: 'min-spend',
          missingAmount: rule.minSubtotal - subtotal,
          minSubtotal: rule.minSubtotal,
        });
      } else if (rule.shipping && subtotal >= policy.freeShippingThreshold) {
        rejectedVouchers.push({ applied: false, code, reason: 'shipping-already-free' });
      } else {
        const kind = rule.shipping ? 'free-shipping' : 'discount';
        // A second code of the same kind replaces the first (BR-VOU-01).
        const index = applied.findIndex((voucher) => voucher.kind === kind);
        const voucher: VoucherApplied = {
          applied: true,
          code,
          kind,
          label: rule.label,
          amount: Math.min(rule.discount(subtotal), subtotal),
        };
        if (index >= 0) applied.splice(index, 1, voucher);
        else applied.push(voucher);
      }
    }
    discount = applied.reduce((sum, voucher) => sum + voucher.amount, 0);

    const fee = subtotal > 0 ? policy.shippingFee : 0;
    const freeReason: 'threshold' | 'voucher' | null =
      subtotal >= policy.freeShippingThreshold && fee > 0
        ? 'threshold'
        : applied.some((voucher) => voucher.kind === 'free-shipping') && fee > 0
          ? 'voucher'
          : null;
    const pricing: OrderPricing = {
      subtotal,
      discount,
      shippingFee: fee,
      shippingDiscount: freeReason ? fee : 0,
      total: subtotal - discount + fee - (freeReason ? fee : 0),
    };
    const now = Date.now();
    return {
      lines,
      lineDiscounts: shareDiscount(lines, discount),
      pricing,
      vouchers: applied,
      rejectedVouchers,
      shipping: { fee, freeReason, addressRequired: !request.address },
      estimatedDelivery: {
        from: new Date(now + 2 * DAY).toISOString().slice(0, 10),
        to: new Date(now + 4 * DAY).toISOString().slice(0, 10),
      },
      paymentMethods: [
        pricing.total > policy.codMaxTotal
          ? { method: 'cod', available: false, reason: 'over-limit' }
          : { method: 'cod', available: true },
        policy.bankTransferEnabled
          ? { method: 'bank-transfer', available: true }
          : { method: 'bank-transfer', available: false, reason: 'not-enabled' },
      ],
      policy,
    };
  }
}

/** Voucher discount split over the lines by value, rounded down; the rest goes to the biggest. */
function shareDiscount(
  lines: CheckoutQuote['lines'],
  discount: number,
): { variantId: string; amount: number }[] | undefined {
  const priced = lines.filter((line) => line.effectiveQuantity > 0);
  const total = priced.reduce((sum, line) => sum + line.unitPrice * line.effectiveQuantity, 0);
  if (!discount || !total) return undefined;
  const shares = priced.map((line) => ({
    variantId: line.variantId,
    value: line.unitPrice * line.effectiveQuantity,
    amount: Math.floor((discount * line.unitPrice * line.effectiveQuantity) / total),
  }));
  const rest = discount - shares.reduce((sum, share) => sum + share.amount, 0);
  const biggest = [...shares].sort(
    (a, b) => b.value - a.value || a.variantId.localeCompare(b.variantId),
  )[0];
  biggest.amount += rest;
  return shares
    .filter((share) => share.amount > 0)
    .map((share) => ({ variantId: share.variantId, amount: share.amount }));
}

function matchesExpected(request: CheckoutRequest, quote: CheckoutQuote): boolean {
  const { expected } = request;
  if (!expected) return true;
  const samePricing = (Object.keys(quote.pricing) as (keyof OrderPricing)[]).every(
    (key) => expected.pricing[key] === quote.pricing[key],
  );
  const sameLines = quote.lines.every(
    (line) =>
      expected.lines.find((candidate) => candidate.variantId === line.variantId)?.unitPrice ===
      line.unitPrice,
  );
  return samePricing && sameLines;
}

function failWith(
  code: CheckoutErrorCode,
  details: CheckoutErrorDetails | StockIssue[] = {},
): Observable<never> {
  return fail(new CheckoutError(code, details));
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeOrderCode(value: string): string {
  return value.trim().replace(/^#/, '').toUpperCase();
}

function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  return digits.startsWith('+84') ? `0${digits.slice(3)}` : digits;
}
