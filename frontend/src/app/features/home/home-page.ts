import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { MediaImageComponent } from '../../shared/ui/media-image.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { storeSettings } from '../../core/store-settings';
import { AuthSession } from '../auth/auth-session';
import { HOME_CONTENT_API, HOME_CONTENT_PROVIDERS } from './data-access/home-content-api';
import { LandingContent } from './landing-content';
import { HomeCampaign } from './home-campaign';
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
    HomeProductRail,
    HomeShopRail,
  ],
  providers: HOME_CONTENT_PROVIDERS,
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly session = inject(AuthSession);
  /** Home page blocks; empty until the content arrives. */
  private readonly loaded = toSignal(
    inject(HOME_CONTENT_API)
      .getHomeContent()
      .pipe(catchError(() => of(null))),
    { initialValue: null },
  );
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
