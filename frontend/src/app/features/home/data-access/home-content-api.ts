import { inject, Injectable, InjectionToken, Provider } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, shareReplay, throwError } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { LandingContent } from '../landing-content';
import { MockHomeContentApi } from '../../../../mocks/mock-home-content-api';

/** Home page content: the blocks, categories and moments shoppers see. */
export interface HomeContentApi {
  getHomeContent(): Observable<LandingContent>;
}

export const HOME_CONTENT_API = new InjectionToken<HomeContentApi>('HOME_CONTENT_API');

/** `GET /api/content/home` (Slice 10, locked): public, `max-age=60`, only the enabled blocks. */
@Injectable({ providedIn: 'root' })
export class HttpHomeContentApi implements HomeContentApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_CONFIG).baseUrl}/content/home`;

  /** One shared read per minute (the server's `max-age`): the home page and the menus ask the same thing. */
  private cached?: { at: number; request: Observable<LandingContent> };

  getHomeContent(): Observable<LandingContent> {
    const now = Date.now();
    if (!this.cached || now - this.cached.at > 60_000) {
      const entry = {
        at: now,
        request: this.http.get<LandingContent>(this.base).pipe(
          // A failure is never kept: the next ask (retry) goes to the server again.
          catchError((error: unknown) => {
            if (this.cached === entry) this.cached = undefined;
            return throwError(() => error);
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        ),
      };
      this.cached = entry;
    }
    return this.cached.request;
  }
}

/**
 * Provided by the lazy home page (not `app.config.ts`) so the content and its mock stay out of the
 * initial bundle; switched by `contentMode`.
 */
export const HOME_CONTENT_PROVIDERS: Provider[] = [
  {
    provide: HOME_CONTENT_API,
    useFactory: () =>
      inject(API_CONFIG).contentMode === 'mock'
        ? inject(MockHomeContentApi)
        : inject(HttpHomeContentApi),
  },
];
