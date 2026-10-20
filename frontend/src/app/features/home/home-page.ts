import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MediaImageComponent } from '../../shared/ui/media-image.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { STORE_POLICY } from '../../core/store-policy';
import { AuthSession } from '../auth/auth-session';
import { NINE2FINE_LANDING } from '../../../mocks/nine2fine-landing';
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
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  readonly content = NINE2FINE_LANDING;
  readonly policy = STORE_POLICY;
  private readonly session = inject(AuthSession);
  /** Signed-in shoppers see member copy instead of a sign-up invitation. */
  readonly blocks = computed(() => {
    const signedIn = this.session.signedIn();
    return this.content.blocks.map((block) =>
      signedIn && block.kind === 'campaign' && block.member ? { ...block, ...block.member } : block,
    );
  });
}
