import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { catchError, filter, map, Observable, throwError } from 'rxjs';
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
import { Order, ReturnPhoto, ReturnRequest } from '../../orders/order-models';

/** What the shopper submits; the server computes the refund amount and fees. */
export type ReturnRequestInput = Pick<
  ReturnRequest,
  'lines' | 'reason' | 'detail' | 'photoCount' | 'refundAccount'
> & {
  /** IDs from `uploadReturnPhoto` (at most `MAX_RETURN_PHOTOS`). */
  photoIds: string[];
};

/** Upload progress, then the stored photo. */
export type ReturnPhotoUpload =
  { kind: 'progress'; percent: number } | { kind: 'done'; photo: ReturnPhoto };

export const MAX_RETURN_PHOTOS = 5;
export const MAX_RETURN_PHOTO_BYTES = 5 * 1024 * 1024;

export type AccountErrorCode =
  | 'unauthorized'
  | 'not-found'
  | 'invalid-password'
  | 'not-cancellable'
  | 'not-returnable'
  | 'invalid-address'
  | 'file-too-large'
  | 'unsupported-type'
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
  /** Each photo is uploaded as soon as it is picked; the request then sends the photo IDs. */
  uploadReturnPhoto(file: File): Observable<ReturnPhotoUpload>;
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
  /** Proposed contract only: `POST /api/uploads/return-photos` (multipart `file`), 413 / 415. */
  uploadReturnPhoto(file: File): Observable<ReturnPhotoUpload> {
    const body = new FormData();
    body.append('file', file);
    return this.http
      .post<ReturnPhoto>(`${this.apiBase}/uploads/return-photos`, body, {
        ...this.options,
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        filter(
          (event) =>
            event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response,
        ),
        map((event): ReturnPhotoUpload => {
          if (event.type === HttpEventType.Response) return { kind: 'done', photo: event.body! };
          const total = event.type === HttpEventType.UploadProgress ? (event.total ?? 0) : 0;
          const loaded = event.type === HttpEventType.UploadProgress ? event.loaded : 0;
          return { kind: 'progress', percent: total ? Math.round((100 * loaded) / total) : 0 };
        }),
        catchError((error: unknown) => {
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          const code: AccountErrorCode =
            status === 413 ? 'file-too-large' : status === 415 ? 'unsupported-type' : 'unavailable';
          return throwError(() => new AccountError(code));
        }),
      );
  }
}
