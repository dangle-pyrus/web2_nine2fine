import { inject, Injectable, InjectionToken, Provider } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { LandingContent } from '../landing-content';
import { MockHomeContentApi } from '../../../../mocks/mock-home-content-api';

/** Home page content: the blocks, categories and moments shoppers see. */
export interface HomeContentApi {
  getHomeContent(): Observable<LandingContent>;
}

export const HOME_CONTENT_API = new InjectionToken<HomeContentApi>('HOME_CONTENT_API');

/** Proposed contract only: `GET /api/content/home`. */
@Injectable({ providedIn: 'root' })
export class HttpHomeContentApi implements HomeContentApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_CONFIG).baseUrl}/content/home`;

  getHomeContent(): Observable<LandingContent> {
    return this.http.get<LandingContent>(this.base);
  }
}

/**
 * Provided by the lazy home page (not `app.config.ts`) so the content and its mock stay out of the
 * initial bundle; same `apiConfig.mode` switch as the other adapters.
 */
export const HOME_CONTENT_PROVIDERS: Provider[] = [
  {
    provide: HOME_CONTENT_API,
    useFactory: () =>
      inject(API_CONFIG).mode === 'mock' ? inject(MockHomeContentApi) : inject(HttpHomeContentApi),
  },
];
