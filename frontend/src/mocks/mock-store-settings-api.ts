import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  DEFAULT_STORE_SETTINGS,
  StoreSettingsApi,
  StoreSettingsValue,
} from '../app/core/store-settings';
import { respond } from './mock-latency';

/** `GET /api/store/settings`: the built-in values of the mock backend. */
@Injectable({ providedIn: 'root' })
export class MockStoreSettingsApi implements StoreSettingsApi {
  getStoreSettings(): Observable<StoreSettingsValue> {
    return respond(structuredClone(DEFAULT_STORE_SETTINGS));
  }
}
