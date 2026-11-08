import { Injector } from '@angular/core';
import { from, Observable, switchMap } from 'rxjs';
import type {
  AccountApi,
  ReturnPhotoUpload,
  ReturnRequestInput,
} from '../app/features/account/data-access/account-api';
import type {
  AccountProfile,
  Address,
  AddressInput,
  Location,
  Membership,
  ProfileUpdate,
  Voucher,
} from '../app/features/account/data-access/account-models';
import type { Order } from '../app/features/orders/order-models';

/**
 * Account stays on the mock until its backend slice, but the mock (and its demo accounts) is loaded
 * on first use, so it is not part of the initial chunk of the normal build.
 */
export class LazyMockAccountApi implements AccountApi {
  constructor(private readonly injector: Injector) {}

  private call<T>(run: (api: AccountApi) => Observable<T>): Observable<T> {
    return from(import('./mock-account-api')).pipe(
      switchMap(({ MockAccountApi }) => run(this.injector.get(MockAccountApi))),
    );
  }

  getProfile(): Observable<AccountProfile> {
    return this.call((api) => api.getProfile());
  }
  updateProfile(update: ProfileUpdate): Observable<AccountProfile> {
    return this.call((api) => api.updateProfile(update));
  }
  setPassword(currentPassword: string | null, newPassword: string): Observable<void> {
    return this.call((api) => api.setPassword(currentPassword, newPassword));
  }
  getMembership(): Observable<Membership> {
    return this.call((api) => api.getMembership());
  }
  listVouchers(): Observable<Voucher[]> {
    return this.call((api) => api.listVouchers());
  }
  listAddresses(): Observable<Address[]> {
    return this.call((api) => api.listAddresses());
  }
  createAddress(input: AddressInput): Observable<Address> {
    return this.call((api) => api.createAddress(input));
  }
  updateAddress(id: string, input: AddressInput): Observable<Address> {
    return this.call((api) => api.updateAddress(id, input));
  }
  deleteAddress(id: string): Observable<void> {
    return this.call((api) => api.deleteAddress(id));
  }
  setDefaultAddress(id: string): Observable<Address[]> {
    return this.call((api) => api.setDefaultAddress(id));
  }
  listProvinces(): Observable<Location[]> {
    return this.call((api) => api.listProvinces());
  }
  listWards(provinceCode: string): Observable<Location[]> {
    return this.call((api) => api.listWards(provinceCode));
  }
  listOrders(): Observable<Order[]> {
    return this.call((api) => api.listOrders());
  }
  getOrder(id: string): Observable<Order> {
    return this.call((api) => api.getOrder(id));
  }
  cancelOrder(id: string, reason?: string): Observable<Order> {
    return this.call((api) => api.cancelOrder(id, reason));
  }
  uploadReturnPhoto(file: File): Observable<ReturnPhotoUpload> {
    return this.call((api) => api.uploadReturnPhoto(file));
  }
  requestReturn(id: string, input: ReturnRequestInput): Observable<Order> {
    return this.call((api) => api.requestReturn(id, input));
  }
}
