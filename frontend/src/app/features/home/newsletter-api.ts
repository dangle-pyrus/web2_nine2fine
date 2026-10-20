import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../../core/api-config';

export interface NewsletterApi {
  /** Subscribes an email to After Five Club; resolves when the request is accepted. */
  subscribe(email: string): Observable<void>;
}

export const NEWSLETTER_API = new InjectionToken<NewsletterApi>('NEWSLETTER_API');

@Injectable({ providedIn: 'root' })
export class HttpNewsletterApi implements NewsletterApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_CONFIG).baseUrl;

  subscribe(email: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/newsletter`, { email, list: 'after-five-club' });
  }
}
