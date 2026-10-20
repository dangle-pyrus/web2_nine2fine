import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CATEGORIES } from '../catalog/models/product';
import { Analytics } from '../../core/analytics';
import { MediaImageComponent } from '../../shared/ui/media-image.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { HomeContent } from './home-content';

/** A category grid immediately below the hero, with the catalog's canonical labels/routes. */
@Component({
  selector: 'n2f-home-categories',
  imports: [RouterLink, MediaImageComponent, IconComponent, RevealDirective],
  template: `
    <section class="categories container" aria-labelledby="categories-title">
      <header class="category-heading">
        <div>
          <p class="eyebrow">{{ content().eyebrow }}</p>
          <h2 id="categories-title">{{ content().title }}</h2>
        </div>
        <a class="all-products" [routerLink]="content().cta.link">
          {{ content().cta.label }} <n2f-icon name="reiconArrowRight" size="18px" />
        </a>
      </header>
      <ul class="category-grid" n2fReveal="stagger-grid">
        @for (card of cards(); track card.category; let index = $index) {
          <li data-reveal-item>
            <a
              class="category-card"
              [routerLink]="['/shop', card.category]"
              [attr.aria-label]="card.label"
              (click)="
                analytics.track('view_category', { category: card.category, source: 'home' })
              "
            >
              <div class="category-image">
                <n2f-media-image
                  [mediaId]="card.mediaId"
                  sizes="(max-width: 700px) 46vw, 23vw"
                  [decorative]="true"
                />
                <span class="category-number" aria-hidden="true">0{{ index + 1 }}</span>
                <span class="category-action" aria-hidden="true">
                  <n2f-icon name="reiconArrowRight" size="22px" />
                </span>
              </div>
              <div class="category-copy">
                <h3>{{ card.label }}</h3>
                <p>{{ card.caption }}</p>
              </div>
            </a>
          </li>
        }
      </ul>
    </section>
  `,
  styleUrl: './home-categories.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeCategories {
  readonly content = input.required<HomeContent['categories']>();
  readonly analytics = inject(Analytics);
  readonly cards = computed(() =>
    this.content().cards.map((card) => ({
      ...card,
      label:
        CATEGORIES.find((category) => category.value === card.category)?.label ?? card.category,
    })),
  );
}
