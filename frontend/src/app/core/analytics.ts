import { Injectable } from '@angular/core';

/** Event taxonomy from plan section 42 (custom events included). */
export type AnalyticsEvent =
  | 'view_item_list'
  | 'select_item'
  | 'view_item'
  | 'add_to_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'track_order'
  | 'view_moment'
  | 'view_category'
  | 'view_look'
  | 'campaign_click'
  | 'newsletter_signup';

/**
 * Placeholder analytics boundary. No vendor is configured, so events are dropped; wire a
 * consented provider here later. Never pass personal data (email, phone, address) in payloads.
 */
@Injectable({ providedIn: 'root' })
export class Analytics {
  track(event: AnalyticsEvent, payload: Record<string, string | number> = {}): void {
    void event;
    void payload;
  }
}
