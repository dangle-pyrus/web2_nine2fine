import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { catchError, map, Observable, shareReplay, tap, throwError } from 'rxjs';
import { API_CONFIG } from '../../core/api-config';
import { GUEST_ORDER_ACCESS } from '../../core/api-interceptor';
import { ApiErrorCode, readApiError, StockIssue } from '../../core/api-error';
import { Order, OrderInvoice, OrderPricing, OrderStatus } from '../orders/order-models';
import { OrderDto, toOrder } from '../orders/order-mapper';
import { Location } from '../account/data-access/account-models';
import { CheckoutQuote, PaymentMethodId, VoucherCheckResult } from './checkout-models';

export type { StockIssue } from '../../core/api-error';
export * from './checkout-models';

/** Payment methods offered at checkout. */
export type CheckoutPaymentMethod = PaymentMethodId;

export interface CheckoutContact {
  name: string;
  phone: string;
  /** Required of guests (the confirmation and the order lookup go there). */
  email: string;
}

export interface CheckoutAddress {
  provinceCode: string;
  wardCode: string;
  street: string;
}

export interface CheckoutItem {
  variantId: string;
  quantity: number;
}

/** Prices and totals sent along are ignored by the server (AC-CHK-10). */
export interface QuoteRequest {
  items: CheckoutItem[];
  /** At most 2: one discount code and one free-shipping code. */
  voucherCodes?: string[];
  address?: { provinceCode: string; wardCode: string };
  contact?: { email?: string; phone?: string };
  paymentMethod?: CheckoutPaymentMethod;
}

/** What the shopper saw when pressing "Đặt hàng"; a difference gives `price-changed`. */
export interface ExpectedTotals {
  lines: { variantId: string; unitPrice: number }[];
  pricing: OrderPricing;
}

export interface CheckoutRequest {
  items: CheckoutItem[];
  voucherCodes: string[];
  contact: CheckoutContact;
  address: CheckoutAddress;
  note: string;
  paymentMethod: CheckoutPaymentMethod;
  /** Company VAT invoice; null issues the e-invoice to the buyer. */
  invoice: OrderInvoice | null;
  /** The shopper ticked the terms, returns and privacy policies before ordering. */
  acceptedTerms: boolean;
  expected: ExpectedTotals;
  /** Should: set after the shopper confirmed a `possible-duplicate` warning. */
  confirmDuplicate?: boolean;
}

export interface BankTransferInstructions {
  bank: string;
  accountName: string;
  accountNumber: string;
  /** Transfer reference the shopper must include. */
  reference: string;
}

/** What the success page needs about the order just placed (kept in sessionStorage by code). */
export interface OrderReceipt {
  orderId: string;
  status: OrderStatus;
  total: number;
  customerName: string;
  paymentMethod: CheckoutPaymentMethod;
  /** ISO datetime; present when payment is still required. */
  paymentDueAt: string | null;
  bankTransfer: BankTransferInstructions | null;
  estimatedDelivery: { from: string; to: string };
  /** Buyer email the confirmation went to. */
  email?: string;
  /** COD order the shop will call to confirm within 2 working hours. */
  willCallToConfirm?: boolean;
}

/** Virtual account issued for one order; the amount must match exactly for auto-reconciliation. */
export interface VirtualAccount {
  bank: string;
  accountName: string;
  accountNumber: string;
}

/**
 * Payment by QR + per-order virtual account. The backend reconciles incoming transfers and
 * the page polls this resource: awaiting → paid (order confirmed) or expired (order cancelled).
 */
export interface PaymentSession {
  orderId: string;
  amount: number;
  status: 'awaiting' | 'paid' | 'expired';
  /** ISO datetime the hold ends; unpaid orders are cancelled then. */
  expiresAt: string;
  paidAt: string | null;
  account: VirtualAccount;
  /** Image URL of the VietQR code for this virtual account and amount. */
  qrImage: string;
  /** Transfer reference (= order code). */
  transferContent?: string;
  /** Amount still missing after a partial transfer. */
  shortfall?: number;
}

/** Demo-only controls for the mock payment flow; null with a real backend. */
export interface PaymentSimulator {
  simulatePayment(orderId: string, outcome: 'paid' | 'expired'): void;
}

export const PAYMENT_SIMULATOR = new InjectionToken<PaymentSimulator | null>('PAYMENT_SIMULATOR');

export interface LookupRequest {
  /** Typed by the shopper; the server trims, strips `#` and upper-cases it. */
  orderCode: string;
  email: string;
}

export interface LookupVerifyRequest extends LookupRequest {
  code: string;
}

export type CheckoutErrorCode = Extract<
  ApiErrorCode,
  | 'validation'
  | 'stock-changed'
  | 'price-changed'
  | 'voucher-changed'
  | 'idempotency-conflict'
  | 'possible-duplicate'
  | 'invalid-address'
  | 'rate-limited'
  | 'code-locked'
  | 'not-found'
  | 'not-cancellable'
  | 'unauthenticated'
  | 'unavailable'
>;

const CHECKOUT_ERROR_CODES: readonly string[] = [
  'validation',
  'stock-changed',
  'price-changed',
  'voucher-changed',
  'idempotency-conflict',
  'possible-duplicate',
  'invalid-address',
  'rate-limited',
  'code-locked',
  'not-found',
  'not-cancellable',
  'unauthenticated',
];

export interface CheckoutErrorDetails {
  field?: string;
  quote?: CheckoutQuote;
  stockIssues?: StockIssue[];
  removedVoucherCodes?: string[];
  existingOrderCode?: string;
  retryAfterSeconds?: number;
}

/** Failure of a cart/checkout/order call: `code` is the contract `error.code`. */
export class CheckoutError extends Error {
  readonly field?: string;
  readonly quote?: CheckoutQuote;
  /** Set with `stock-changed`: which lines to fix. */
  readonly stockIssues: StockIssue[];
  readonly removedVoucherCodes: string[];
  readonly existingOrderCode?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    readonly code: CheckoutErrorCode,
    details: CheckoutErrorDetails | StockIssue[] = {},
  ) {
    super(code);
    const extra: CheckoutErrorDetails = Array.isArray(details) ? { stockIssues: details } : details;
    this.field = extra.field;
    this.quote = extra.quote;
    this.stockIssues = extra.stockIssues ?? [];
    this.removedVoucherCodes = extra.removedVoucherCodes ?? [];
    this.existingOrderCode = extra.existingOrderCode;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}

export interface CheckoutApi {
  quote(request: QuoteRequest): Observable<CheckoutQuote>;
  /** A rejected code is a normal answer (`result.applied === false`), not an error. */
  checkVoucher(
    code: string,
    request: Pick<QuoteRequest, 'items' | 'voucherCodes' | 'address' | 'contact'>,
  ): Observable<VoucherCheckResult>;
  /** The same idempotency key must return the same receipt instead of a duplicate order. */
  placeOrder(request: CheckoutRequest, idempotencyKey: string): Observable<OrderReceipt>;
  provinces(): Observable<Location[]>;
  wards(provinceCode: string): Observable<Location[]>;
  /** Always answers the same way, matching order or not. */
  requestLookupCode(request: LookupRequest): Observable<{ resendAfterSeconds: number }>;
  /** Right code: the order, and the server starts a 30-minute view (cookie, never read here). */
  verifyLookup(request: LookupVerifyRequest): Observable<Order>;
  /** Guest view of an order after `verifyLookup` (cookie `n2f_oa`). */
  getOrder(orderCode: string): Observable<Order>;
  cancel(orderCode: string, reason?: string): Observable<Order>;
  paymentSession(orderCode: string): Observable<PaymentSession>;
}

export const CHECKOUT_API = new InjectionToken<CheckoutApi>('CHECKOUT_API');

/** The error of an HTTP call, as a `CheckoutError` with the contract details. */
export function toCheckoutError(error: unknown): Observable<never> {
  const detail = readApiError(error);
  const code: CheckoutErrorCode = CHECKOUT_ERROR_CODES.includes(detail.code)
    ? (detail.code as CheckoutErrorCode)
    : 'unavailable';
  return throwError(
    () =>
      new CheckoutError(code, {
        field: detail.field,
        quote: detail.quote,
        stockIssues: detail.stockIssues,
        removedVoucherCodes: detail.removedVoucherCodes,
        existingOrderCode: detail.existingOrderCode,
        retryAfterSeconds: detail.retryAfterSeconds,
      }),
  );
}

export function toReceipt(order: Order): OrderReceipt {
  const prepaid = order.payment.method === 'bank-transfer';
  return {
    orderId: order.id,
    status: order.status,
    total: order.pricing.total,
    customerName: order.shippingAddress.recipient,
    paymentMethod: prepaid ? 'bank-transfer' : 'cod',
    paymentDueAt: order.paymentDueAt ?? null,
    bankTransfer: null,
    estimatedDelivery: order.estimatedDelivery ?? { from: order.placedAt, to: order.placedAt },
    email: order.email,
    willCallToConfirm: order.willCallToConfirm,
  };
}

interface PaymentSessionDto {
  orderId: string;
  amount: number;
  status: 'awaiting' | 'paid' | 'expired';
  expiresAt: string;
  paidAt?: string;
  transferContent: string;
  account: VirtualAccount;
  qrImageUrl: string;
  shortfall?: number;
}

@Injectable({ providedIn: 'root' })
export class HttpCheckoutApi implements CheckoutApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_CONFIG).baseUrl;
  private provinceCache?: Observable<Location[]>;
  private readonly wardCache = new Map<string, Observable<Location[]>>();
  private readonly guest = new HttpContext().set(GUEST_ORDER_ACCESS, true);

  quote(request: QuoteRequest): Observable<CheckoutQuote> {
    return this.http
      .post<CheckoutQuote>(`${this.baseUrl}/checkout/quote`, request)
      .pipe(catchError(toCheckoutError));
  }

  checkVoucher(
    code: string,
    request: Pick<QuoteRequest, 'items' | 'voucherCodes' | 'address' | 'contact'>,
  ): Observable<VoucherCheckResult> {
    return this.http
      .post<VoucherCheckResult>(`${this.baseUrl}/vouchers/check`, { code, ...request })
      .pipe(catchError(toCheckoutError));
  }

  placeOrder(request: CheckoutRequest, idempotencyKey: string): Observable<OrderReceipt> {
    return this.http
      .post<{ order: OrderDto }>(`${this.baseUrl}/orders`, request, {
        headers: { 'Idempotency-Key': idempotencyKey },
      })
      .pipe(
        map((body) => toReceipt(toOrder(body.order))),
        catchError(toCheckoutError),
      );
  }

  provinces(): Observable<Location[]> {
    this.provinceCache ??= this.http
      .get<Location[]>(`${this.baseUrl}/locations/provinces`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.provinceCache.pipe(
      tap({ error: () => (this.provinceCache = undefined) }),
      catchError(toCheckoutError),
    );
  }

  wards(provinceCode: string): Observable<Location[]> {
    let cached = this.wardCache.get(provinceCode);
    if (!cached) {
      cached = this.http
        .get<Location[]>(
          `${this.baseUrl}/locations/provinces/${encodeURIComponent(provinceCode)}/wards`,
        )
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.wardCache.set(provinceCode, cached);
    }
    return cached.pipe(
      tap({ error: () => this.wardCache.delete(provinceCode) }),
      catchError(toCheckoutError),
    );
  }

  requestLookupCode(request: LookupRequest): Observable<{ resendAfterSeconds: number }> {
    return this.http
      .post<{ resendAfterSeconds: number }>(`${this.baseUrl}/orders/lookup/codes`, request)
      .pipe(catchError(toCheckoutError));
  }

  verifyLookup(request: LookupVerifyRequest): Observable<Order> {
    return this.http
      .post<OrderDto>(`${this.baseUrl}/orders/lookup/verify`, request, { context: this.guest })
      .pipe(map(toOrder), catchError(toCheckoutError));
  }

  getOrder(orderCode: string): Observable<Order> {
    return this.http
      .get<OrderDto>(`${this.baseUrl}/orders/${encodeURIComponent(orderCode)}`, {
        context: this.guest,
      })
      .pipe(map(toOrder), catchError(toCheckoutError));
  }

  cancel(orderCode: string, reason?: string): Observable<Order> {
    return this.http
      .post<OrderDto>(
        `${this.baseUrl}/orders/${encodeURIComponent(orderCode)}/cancel`,
        reason ? { reason } : {},
        { context: this.guest },
      )
      .pipe(map(toOrder), catchError(toCheckoutError));
  }

  paymentSession(orderCode: string): Observable<PaymentSession> {
    return this.http
      .get<PaymentSessionDto>(`${this.baseUrl}/orders/${encodeURIComponent(orderCode)}/payment`, {
        context: this.guest,
      })
      .pipe(
        map((dto): PaymentSession => ({
          orderId: dto.orderId,
          amount: dto.amount,
          status: dto.status,
          expiresAt: dto.expiresAt,
          paidAt: dto.paidAt ?? null,
          account: dto.account,
          qrImage: dto.qrImageUrl,
          transferContent: dto.transferContent,
          shortfall: dto.shortfall,
        })),
        catchError(toCheckoutError),
      );
  }
}
