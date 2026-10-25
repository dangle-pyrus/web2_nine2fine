import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from './api-config';
import { STORE_INFO, StoreInfo } from './store-info';
import { MEMBERSHIP_POLICY, MembershipPolicy, STORE_POLICY, StorePolicy } from './store-policy';

/** What every shopper sees; the bank account for transfers is not part of it. */
export interface StoreSettingsValue {
  policy: StorePolicy;
  info: StoreInfo;
  membership: MembershipPolicy;
}

export const DEFAULT_STORE_SETTINGS: StoreSettingsValue = {
  policy: { ...STORE_POLICY },
  info: { ...STORE_INFO },
  membership: { ...MEMBERSHIP_POLICY },
};

const current = signal<StoreSettingsValue>(DEFAULT_STORE_SETTINGS);

/**
 * Live store settings. Starts with the built-in values (also the fallback when the request fails)
 * and is replaced once `GET /api/store/settings` answers, so the footer, policies, PDP, cart and
 * checkout update in the same tab without a reload. A signal: templates, computeds and
 * plain functions read it the same way.
 */
export const storeSettings = current.asReadonly();

export function applyStoreSettings(value: StoreSettingsValue): void {
  current.set({
    policy: { ...DEFAULT_STORE_SETTINGS.policy, ...value.policy },
    info: { ...DEFAULT_STORE_SETTINGS.info, ...value.info },
    membership: { ...DEFAULT_STORE_SETTINGS.membership, ...value.membership },
  });
}

/** Public, read at start-up. */
export interface StoreSettingsApi {
  getStoreSettings(): Observable<StoreSettingsValue>;
}

export const STORE_SETTINGS_API = new InjectionToken<StoreSettingsApi>('STORE_SETTINGS_API');

/** Proposed contract only: `GET /api/store/settings`. */
@Injectable({ providedIn: 'root' })
export class HttpStoreSettingsApi implements StoreSettingsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_CONFIG).baseUrl;

  getStoreSettings(): Observable<StoreSettingsValue> {
    return this.http.get<StoreSettingsValue>(`${this.base}/store/settings`);
  }
}
