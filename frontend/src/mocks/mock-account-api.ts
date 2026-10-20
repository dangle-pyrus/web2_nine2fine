import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AccountApi,
  AccountError,
  AccountErrorCode,
  ReturnRequestInput,
} from '../app/features/account/data-access/account-api';
import {
  AccountProfile,
  Address,
  AddressInput,
  Location,
  Membership,
  ProfileUpdate,
  Voucher,
} from '../app/features/account/data-access/account-models';
import { Order } from '../app/features/orders/order-models';
import { estimateRefund } from '../app/features/orders/order-returns';
import { AuthSession } from '../app/features/auth/auth-session';
import { MockAccount } from './accounts';
import { PROVINCES, WARDS } from './locations';
import { MockAccountData, MockAccountStore } from './mock-account-store';
import { fail, respond } from './mock-latency';

@Injectable({ providedIn: 'root' })
export class MockAccountApi implements AccountApi {
  private readonly store = inject(MockAccountStore);
  private readonly session = inject(AuthSession);

  getProfile(): Observable<AccountProfile> {
    return this.withAccount((account) => respond(toProfile(account)));
  }
  updateProfile(update: ProfileUpdate): Observable<AccountProfile> {
    return this.withAccount((account) => {
      if (update.birthDate !== undefined) account.birthDate = update.birthDate;
      if (update.phone !== undefined) account.phone = update.phone;
      return respond(toProfile(account));
    });
  }
  setPassword(currentPassword: string | null, newPassword: string): Observable<void> {
    return this.withAccount((account) => {
      if (account.password !== currentPassword) return failWith('invalid-password');
      account.password = newPassword;
      return respond(undefined);
    });
  }
  getMembership(): Observable<Membership> {
    return this.withData((data) => respond({ ...data.membership }));
  }
  listVouchers(): Observable<Voucher[]> {
    return this.withData((data) => respond([...data.vouchers]));
  }

  listAddresses(): Observable<Address[]> {
    return this.withData((data) => respond(sortAddresses(data.addresses)));
  }
  createAddress(input: AddressInput): Observable<Address> {
    return this.withData((data) => {
      const address = toAddress(`addr-${Date.now().toString(36)}`, input);
      if (!address) return failWith('invalid-address');
      // The first address always becomes the default one.
      if (!data.addresses.length) address.isDefault = true;
      data.addresses = applyFlags([...data.addresses, address], address);
      return respond(address);
    });
  }
  updateAddress(id: string, input: AddressInput): Observable<Address> {
    return this.withData((data) => {
      const current = data.addresses.find((address) => address.id === id);
      if (!current) return failWith('not-found');
      const address = toAddress(id, input);
      if (!address) return failWith('invalid-address');
      // The only default address cannot be unset; another one must be chosen instead.
      if (current.isDefault) address.isDefault = true;
      data.addresses = applyFlags(
        data.addresses.map((candidate) => (candidate.id === id ? address : candidate)),
        address,
      );
      return respond(address);
    });
  }
  deleteAddress(id: string): Observable<void> {
    return this.withData((data) => {
      const removed = data.addresses.find((address) => address.id === id);
      if (!removed) return failWith('not-found');
      data.addresses = data.addresses.filter((address) => address.id !== id);
      if (removed.isDefault && data.addresses[0]) data.addresses[0].isDefault = true;
      return respond(undefined);
    });
  }
  setDefaultAddress(id: string): Observable<Address[]> {
    return this.withData((data) => {
      const target = data.addresses.find((address) => address.id === id);
      if (!target) return failWith('not-found');
      data.addresses = applyFlags(data.addresses, { ...target, isDefault: true });
      return respond(sortAddresses(data.addresses));
    });
  }
  listProvinces(): Observable<Location[]> {
    return respond([...PROVINCES]);
  }
  listWards(provinceCode: string): Observable<Location[]> {
    return respond([...(WARDS[provinceCode] ?? [])]);
  }

  listOrders(): Observable<Order[]> {
    return this.withData((data) =>
      respond([...data.orders].sort((a, b) => b.placedAt.localeCompare(a.placedAt))),
    );
  }
  getOrder(id: string): Observable<Order> {
    return this.withData((data) => {
      const order = data.orders.find((candidate) => candidate.id === id);
      return order ? respond(order) : failWith('not-found');
    });
  }
  cancelOrder(id: string): Observable<Order> {
    return this.withData((data) => {
      if (!data.orders.some((candidate) => candidate.id === id)) return failWith('not-found');
      const result = this.store.cancelOrder(id);
      return typeof result === 'string' ? failWith(result) : respond(result);
    });
  }
  requestReturn(id: string, input: ReturnRequestInput): Observable<Order> {
    return this.withData((data) => {
      const order = data.orders.find((candidate) => candidate.id === id);
      if (!order) return failWith('not-found');
      const lines = input.lines.filter(
        (line) =>
          Number.isInteger(line.quantity) &&
          line.quantity > 0 &&
          line.quantity <= (order.items[line.index]?.quantity ?? 0),
      );
      if (!lines.length || lines.length !== input.lines.length) return failWith('not-returnable');
      const refund = estimateRefund(order, lines, input.reason);
      const result = this.store.requestReturn(id, {
        ...input,
        lines,
        detail: input.detail.trim(),
        refundAccount:
          order.payment.paid && order.payment.method !== 'cod' ? null : input.refundAccount,
        ...refund,
      });
      return typeof result === 'string' ? failWith(result) : respond(result);
    });
  }

  private withAccount<T>(run: (account: MockAccount) => Observable<T>): Observable<T> {
    const user = this.session.user();
    const account = user && this.store.findById(user.id);
    return account ? run(account) : failWith('unauthorized');
  }
  private withData<T>(run: (data: MockAccountData) => Observable<T>): Observable<T> {
    return this.withAccount((account) => run(this.store.dataFor(account.id)));
  }
}

function failWith(code: AccountErrorCode): Observable<never> {
  return fail(new AccountError(code));
}

function toProfile(account: MockAccount): AccountProfile {
  return {
    email: account.email,
    firstName: account.firstName,
    lastName: account.lastName,
    birthDate: account.birthDate,
    phone: account.phone,
    hasPassword: account.password !== null,
  };
}

function toAddress(id: string, input: AddressInput): Address | null {
  const province = PROVINCES.find((candidate) => candidate.code === input.provinceCode);
  const ward = WARDS[input.provinceCode]?.find((candidate) => candidate.code === input.wardCode);
  if (!province || !ward) return null;
  return {
    id,
    recipient: input.recipient.trim(),
    phone: input.phone.trim(),
    province,
    ward,
    street: input.street.trim(),
    isDefault: input.isDefault,
    isReturn: input.isReturn,
  };
}

/** Default and return flags are unique; the changed address takes them from the others. */
function applyFlags(addresses: Address[], changed: Address): Address[] {
  return addresses.map((address) => {
    if (address.id === changed.id) return changed;
    return {
      ...address,
      isDefault: changed.isDefault ? false : address.isDefault,
      isReturn: changed.isReturn ? false : address.isReturn,
    };
  });
}

function sortAddresses(addresses: Address[]): Address[] {
  return [...addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}
