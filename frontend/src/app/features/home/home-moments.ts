import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MediaImageComponent } from '../../shared/ui/media-image.component';
import { hrefFragment, hrefPath, hrefQuery } from './home-href';
import { LandingContent } from './landing-content';

/**
 * "Shop by Moment" cards from `GET /content/home` (BR-MOM-02, 03): picture, the card's lines and
 * how many products it opens. A moment with no products never arrives, so no card leads to an
 * empty list. Without the API's picture and lines (the mock fixture) the block stays hidden.
 */
@Component({
  selector: 'n2f-home-moments',
  imports: [RouterLink, MediaImageComponent],
  template: `
    @if (cards().length) {
      <section class="moments" aria-labelledby="home-moments-title">
        <h2 id="home-moments-title">Shop by Moment</h2>
        <ul>
          @for (card of cards(); track card.href) {
            <li>
              <a
                [routerLink]="path(card.href)"
                [queryParams]="query(card.href)"
                [fragment]="fragment(card.href)"
              >
                <n2f-media-image
                  [mediaId]="card.mediaId!"
                  sizes="(max-width: 700px) 50vw, 25vw"
                  [decorative]="true"
                />
                <span class="text">
                  <strong>{{ card.label }}</strong>
                  @for (line of card.lines ?? []; track $index) {
                    <span class="line">{{ line }}</span>
                  }
                  @if (card.count !== undefined) {
                    <span class="count">{{ card.count }} sản phẩm</span>
                  }
                </span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    .moments {
      max-width: var(--page-width);
      margin: 0 auto;
      padding: 48px var(--page-gutter) 0;
    }
    h2 {
      margin: 0 0 24px;
      font-size: 22px;
      font-weight: 500;
    }
    ul {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    a {
      position: relative;
      display: block;
      overflow: hidden;
      border-radius: var(--radius-card);
      color: #fff;
      aspect-ratio: 4 / 5;
    }
    n2f-media-image {
      position: absolute;
      inset: 0;
    }
    .text {
      position: absolute;
      inset: auto 0 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 40px 16px 16px;
      background: linear-gradient(transparent, #0008);
    }
    strong {
      font-size: 18px;
      font-weight: 600;
    }
    .line {
      font-size: 14px;
    }
    .count {
      margin-top: 4px;
      font-size: 13px;
      opacity: 0.85;
    }
    a:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    @media (max-width: 800px) {
      ul {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeMoments {
  readonly moments = input.required<LandingContent['moments']>();
  readonly cards = computed(() => this.moments().filter((moment) => !!moment.mediaId));
  readonly path = hrefPath;
  readonly query = hrefQuery;
  readonly fragment = hrefFragment;
}
