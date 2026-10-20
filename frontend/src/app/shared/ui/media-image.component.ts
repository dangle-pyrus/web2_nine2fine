import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { getMedia } from '../../../media/media-manifest';

/**
 * Responsive image from the media manifest (plan 37–38): srcset/sizes, explicit dimensions,
 * focal point, lazy loading except for the LCP image.
 */
@Component({
  selector: 'n2f-media-image',
  template: `
    <img
      [src]="media().src"
      [attr.srcset]="media().srcset ?? null"
      [attr.sizes]="media().srcset ? sizes() : null"
      [alt]="decorative() ? '' : media().alt"
      [width]="media().width"
      [height]="media().height"
      [attr.loading]="priority() ? 'eager' : 'lazy'"
      [attr.fetchpriority]="priority() ? 'high' : null"
      decoding="async"
      [style.object-position]="media().objectPosition ?? null"
    />
  `,
  styles: `
    :host {
      display: block;
      overflow: hidden;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaImageComponent {
  readonly mediaId = input.required<string>();
  readonly sizes = input('100vw');
  readonly priority = input(false);
  readonly decorative = input(false);
  readonly media = computed(() => getMedia(this.mediaId()));
}
