import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { MediaImageComponent } from '../../shared/ui/media-image.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { storeSettings } from '../../core/store-settings';
import { AuthSession } from '../auth/auth-session';
import { HOME_CONTENT_API, HOME_CONTENT_PROVIDERS } from './data-access/home-content-api';
import { hrefFragment, hrefPath, hrefQuery } from './home-href';
import { LandingContent } from './landing-content';
import { HomeCampaign } from './home-campaign';
import { HomeMoments } from './home-moments';
import { HomeProductRail } from './home-product-rail';
import { HomeShopRail } from './home-shop-rail';

@Component({
  selector: 'n2f-home-page',
  imports: [
    RouterLink,
    MediaImageComponent,
    IconComponent,
    PricePipe,
    HomeCampaign,
    HomeMoments,
    HomeProductRail,
    HomeShopRail,
  ],
  providers: HOME_CONTENT_PROVIDERS,
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  readonly path = hrefPath;
  readonly query = hrefQuery;
  readonly fragment = hrefFragment;
  private readonly session = inject(AuthSession);
  /** Home page blocks; empty until the content arrives. */
  private readonly api = inject(HOME_CONTENT_API);
  private readonly reload$ = new Subject<void>();
  /** The content could not be read (offline / server error): a message and a retry, not a blank page. */
  readonly failed = signal(false);
  private readonly loaded = toSignal(
    this.reload$.pipe(
      startWith(undefined),
      tap(() => this.failed.set(false)),
      switchMap(() =>
        this.api.getHomeContent().pipe(
          catchError(() => {
            this.failed.set(true);
            return of(null);
          }),
        ),
      ),
    ),
    { initialValue: null },
  );
  retry(): void {
    this.reload$.next();
  }
  readonly content = computed<LandingContent>(
    () => this.loaded() ?? { categories: [], moments: [], blocks: [] },
  );
  get policy() {
    return storeSettings().policy;
  }
  /** Signed-in shoppers see member copy instead of a sign-up invitation; switched-off blocks hide. */
  readonly blocks = computed(() => {
    const signedIn = this.session.signedIn();
    return this.content()
      .blocks.filter((block) => block.enabled !== false)
      .map((block) =>
        signedIn && block.kind === 'campaign' && block.member
          ? { ...block, ...block.member }
          : block,
      );
  });
}
