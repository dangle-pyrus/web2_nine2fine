import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import {
  AccountProfile,
  Address,
  AddressInput,
  Location,
  Membership,
  ProfileUpdate,
  Voucher,
} from './account-models';
import { Order, ReturnRequest } from '../../orders/order-models';

/** What the shopper submits; the server computes the refund amount and fees. */
export type ReturnRequestInput = Pick<
  ReturnRequest,
  'lines' | 'reason' | 'detail' | 'photoCount' | 'refundAccount'
>;

export type AccountErrorCode =
  | 'unauthorized'
  | 'not-found'
  | 'invalid-password'
  | 'not-cancellable'
  | 'not-returnable'
  | 'invalid-address'
  | 'unavailable';

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(code);
  }
}

/** Signed-in shopper's data. Authorization comes from the backend session cookie. */
export interface AccountApi {
  getProfile(): Observable<AccountProfile>;
  updateProfile(update: ProfileUpdate): Observable<AccountProfile>;
  /** `currentPassword` is null when the account has no password yet (passwordless sign-up). */
  setPassword(currentPassword: string | null, newPassword: string): Observable<void>;
  getMembership(): Observable<Membership>;
  listVouchers(): Observable<Voucher[]>;

  listAddresses(): Observable<Address[]>;
  createAddress(input: AddressInput): Observable<Address>;
  updateAddress(id: string, input: AddressInput): Observable<Address>;
  deleteAddress(id: string): Observable<void>;
  setDefaultAddress(id: string): Observable<Address[]>;
  listProvinces(): Observable<Location[]>;
  listWards(provinceCode: string): Observable<Location[]>;

  listOrders(): Observable<Order[]>;
  getOrder(id: string): Observable<Order>;
  cancelOrder(id: string): Observable<Order>;
  /** Photos are uploaded separately once a storage endpoint exists; only their count is sent. */
  requestReturn(id: string, input: ReturnRequestInput): Observable<Order>;
}

export const ACCOUNT_API = new InjectionToken<AccountApi>('ACCOUNT_API');

@Injectable({ providedIn: 'root' })
export class HttpAccountApi implements AccountApi {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_CONFIG).baseUrl;
  private readonly base = `${this.apiBase}/account`;
  private readonly options = { withCredentials: true };

  getProfile(): Observable<AccountProfile> {
    return this.http.get<AccountProfile>(`${this.base}/profile`, this.options);
  }
  updateProfile(update: ProfileUpdate): Observable<AccountProfile> {
    return this.http.patch<AccountProfile>(`${this.base}/profile`, update, this.options);
  }
  setPassword(currentPassword: string | null, newPassword: string): Observable<void> {
    return this.http.put<void>(
      `${this.base}/password`,
      { currentPassword, newPassword },
      this.options,
    );
  }
  getMembership(): Observable<Membership> {
    return this.http.get<Membership>(`${this.base}/membership`, this.options);
  }
  listVouchers(): Observable<Voucher[]> {
    return this.http.get<Voucher[]>(`${this.base}/vouchers`, this.options);
  }
  listAddresses(): Observable<Address[]> {
    return this.http.get<Address[]>(`${this.base}/addresses`, this.options);
  }
  createAddress(input: AddressInput): Observable<Address> {
    return this.http.post<Address>(`${this.base}/addresses`, input, this.options);
  }
  updateAddress(id: string, input: AddressInput): Observable<Address> {
    return this.http.put<Address>(`${this.base}/addresses/${id}`, input, this.options);
  }
  deleteAddress(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/addresses/${id}`, this.options);
  }
  setDefaultAddress(id: string): Observable<Address[]> {
    return this.http.post<Address[]>(`${this.base}/addresses/${id}/default`, {}, this.options);
  }
  listProvinces(): Observable<Location[]> {
    return this.http.get<Location[]>(`${this.apiBase}/locations/provinces`);
  }
  listWards(provinceCode: string): Observable<Location[]> {
    return this.http.get<Location[]>(`${this.apiBase}/locations/provinces/${provinceCode}/wards`);
  }
  listOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.base}/orders`, this.options);
  }
  getOrder(id: string): Observable<Order> {
    return this.http.get<Order>(`${this.base}/orders/${id}`, this.options);
  }
  cancelOrder(id: string): Observable<Order> {
    return this.http.post<Order>(`${this.base}/orders/${id}/cancel`, {}, this.options);
  }
  requestReturn(id: string, input: ReturnRequestInput): Observable<Order> {
    return this.http.post<Order>(`${this.base}/orders/${id}/returns`, input, this.options);
  }
}
