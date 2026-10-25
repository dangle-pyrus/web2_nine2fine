import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { HomeContentApi } from '../app/features/home/data-access/home-content-api';
import type { LandingContent } from '../app/features/home/landing-content';
import { MockStorefrontContent } from './mock-storefront-content';
import { respond } from './mock-latency';

/** `GET /api/content/home`: the landing content of the mock backend. */
@Injectable({ providedIn: 'root' })
export class MockHomeContentApi implements HomeContentApi {
  /** Edited from the admin "Nội dung trang chủ" page in the same tab. */
  private readonly content = inject(MockStorefrontContent);

  getHomeContent(): Observable<LandingContent> {
    return respond(this.content.home());
  }
}
