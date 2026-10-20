import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MediaImageComponent } from '../../shared/ui/media-image.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { LandingEdit } from './landing-content';

@Component({
  selector: 'n2f-home-product-rail',
  imports: [RouterLink, MediaImageComponent, IconComponent],
  template: `
    <section [attr.aria-labelledby]="content().id + '-title'">
      <h2 class="rail-title" [id]="content().id + '-title'">{{ content().label }}</h2>
      <div class="product-rail">
        @for (card of content().cards; track card.mediaId) {
          <article>
            <a class="edit-link" [routerLink]="card.href">
              <div class="product-image">
                <n2f-media-image
                  [mediaId]="card.mediaId"
                  [decorative]="true"
                  sizes="(max-width: 959px) 44vw, 294px"
                />
              </div>
              <div class="product-details">
                <h3>{{ card.title }}</h3>
                <p>{{ card.caption }} <n2f-icon name="reiconArrowRight" size="16px" /></p>
              </div>
            </a>
          </article>
        }
      </div>
    </section>
  `,
  styleUrl: './home-product-rail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeProductRail {
  readonly content = input.required<LandingEdit>();
}
