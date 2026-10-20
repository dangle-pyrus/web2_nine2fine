import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, Observable, throwError } from 'rxjs';
import { API_CONFIG } from '../../core/api-config';
import { Order, OrderInvoice, OrderPricing, OrderStatus } from '../orders/order-models';

/** Payment methods offered at checkout (plan 16.2). Card/QR gateways come with the backend. */
export type CheckoutPaymentMethod = 'cod' | 'bank-transfer';

export interface CheckoutContact {
  name: string;
  phone: string;
  /** Optional: confirmation is sent here; empty when the shopper left only a phone number. */
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

export interface QuoteRequest {
  items: CheckoutItem[];
  voucherCode: string | null;
}

export interface CheckoutQuote {
  pricing: OrderPricing;
  /** Applied voucher, or the reason it was rejected. */
  voucher: { code: string; label: string } | null;
  voucherError: string | null;
  /** ISO dates of the delivery window. */
  estimatedDelivery: { from: string; to: string };
}

export interface CheckoutRequest extends QuoteRequest {
  contact: CheckoutContact;
  address: CheckoutAddress;
  note: string;
  paymentMethod: CheckoutPaymentMethod;
  /** Company VAT invoice; null issues the e-invoice to the buyer. */
  invoice: OrderInvoice | null;
  /** The shopper ticked the terms, returns and privacy policies before ordering. */
  acceptedTerms: boolean;
}

export interface BankTransferInstructions {
  bank: string;
  accountName: string;
  accountNumber: string;
  /** Transfer reference the shopper must include. */
  reference: string;
}

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
}

/** Demo-only controls for the mock payment flow; null with a real backend. */
export interface PaymentSimulator {
  simulatePayment(orderId: string, outcome: 'paid' | 'expired'): void;
}

export const PAYMENT_SIMULATOR = new InjectionToken<PaymentSimulator | null>('PAYMENT_SIMULATOR');

export interface TrackOrderRequest {
  orderId: string;
  /** Phone or email used at checkout; never placed in the URL. */
  contact: string;
}

export type CheckoutErrorCode =
  | 'stock-changed'
  | 'invalid-address'
  | 'invalid-voucher'
  | 'not-found'
  | 'not-cancellable'
  | 'unavailable';

/** A cart line the shop cannot fill: `available` is what is left (0 = sold out or removed). */
export interface StockIssue {
  variantId: string;
  available: number;
}

export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    /** Set with `stock-changed`: which lines to fix. */
    readonly stockIssues: StockIssue[] = [],
  ) {
    super(code);
  }
}

export interface CheckoutApi {
  quote(request: QuoteRequest): Observable<CheckoutQuote>;
  /** The same idempotency key must return the same receipt instead of a duplicate order. */
  placeOrder(request: CheckoutRequest, idempotencyKey: string): Observable<OrderReceipt>;
  trackOrder(request: TrackOrderRequest): Observable<Order>;
  paymentSession(orderId: string): Observable<PaymentSession>;
  /** Guest cancellation, proven with the same order ID + phone/email as tracking. */
  cancelOrder(request: TrackOrderRequest): Observable<Order>;
}

export const CHECKOUT_API = new InjectionToken<CheckoutApi>('CHECKOUT_API');

const HTTP_ERRORS: Record<number, CheckoutErrorCode> = {
  404: 'not-found',
  409: 'stock-changed',
  422: 'invalid-address',
};

function toCheckoutError(error: unknown): Observable<never> {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  // Proposed 409 body: { items: StockIssue[] }.
  const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
  const items = (body as { items?: unknown } | null)?.items;
  const issues = Array.isArray(items)
    ? items.filter(
        (item): item is StockIssue =>
          typeof item?.variantId === 'string' && Number.isInteger(item?.available),
      )
    : [];
  return throwError(() => new CheckoutError(HTTP_ERRORS[status] ?? 'unavailable', issues));
}

@Injectable({ providedIn: 'root' })
export class HttpCheckoutApi implements CheckoutApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_CONFIG).baseUrl;

  quote(request: QuoteRequest): Observable<CheckoutQuote> {
    return this.http
      .post<CheckoutQuote>(`${this.baseUrl}/checkout/quote`, request, { withCredentials: true })
      .pipe(catchError(toCheckoutError));
  }
  placeOrder(request: CheckoutRequest, idempotencyKey: string): Observable<OrderReceipt> {
    return this.http
      .post<OrderReceipt>(`${this.baseUrl}/orders`, request, {
        withCredentials: true,
        headers: { 'Idempotency-Key': idempotencyKey },
      })
      .pipe(catchError(toCheckoutError));
  }
  trackOrder(request: TrackOrderRequest): Observable<Order> {
    return this.http
      .post<Order>(`${this.baseUrl}/orders/track`, request)
      .pipe(catchError(toCheckoutError));
  }
  paymentSession(orderId: string): Observable<PaymentSession> {
    return this.http
      .get<PaymentSession>(`${this.baseUrl}/orders/${encodeURIComponent(orderId)}/payment`, {
        withCredentials: true,
      })
      .pipe(catchError(toCheckoutError));
  }
  cancelOrder(request: TrackOrderRequest): Observable<Order> {
    return this.http
      .post<Order>(`${this.baseUrl}/orders/track/cancel`, request)
      .pipe(catchError(toCheckoutError));
  }
}
