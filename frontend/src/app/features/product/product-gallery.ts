import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from '../../shared/ui/icon.component';
import { MediaAsset } from '../../../media/media-manifest';

/**
 * PDP gallery. Desktop: thumbnail rail + main stage with arrows (Nike pattern); no hover zoom
 * (removed per user feedback 2026-10-17). Mobile/touch: swipeable scroll-snap track with a counter.
 */
@Component({
  selector: 'n2f-product-gallery',
  imports: [IconComponent],
  // Arrow keys from any focused thumbnail or arrow button step through the images.
  host: { '(keydown.arrowLeft)': 'step(-1)', '(keydown.arrowRight)': 'step(1)' },
  template: `
    <div class="gallery">
      <div class="rail" role="tablist" aria-label="Chọn ảnh sản phẩm">
        @for (image of images(); track $index) {
          <button
            type="button"
            role="tab"
            class="thumb"
            [class.active]="$index === active()"
            [attr.aria-selected]="$index === active()"
            [attr.aria-label]="'Ảnh ' + ($index + 1) + ': ' + image.alt"
            (click)="show($index)"
            (mouseenter)="show($index)"
          >
            <img [src]="image.src" alt="" width="64" height="80" />
          </button>
        }
      </div>

      <div class="stage" [class.temporary]="current().temporary">
        <img
          class="main"
          [src]="current().src"
          [alt]="productName() + ' — ' + current().alt"
          width="640"
          height="800"
          fetchpriority="high"
        />
        @if (current().temporary) {
          <span class="note">{{ current().alt }}</span>
        }
        <div class="arrows">
          <button type="button" aria-label="Ảnh trước" (click)="step(-1)">
            <n2f-icon name="reiconArrowLeft" size="18px" />
          </button>
          <button type="button" aria-label="Ảnh tiếp theo" (click)="step(1)">
            <n2f-icon name="reiconArrowRight" size="18px" />
          </button>
        </div>
      </div>

      <div
        class="track"
        #track
        tabindex="0"
        aria-label="Ảnh sản phẩm, vuốt ngang để xem thêm"
        (scroll)="syncFromScroll()"
      >
        @for (image of images(); track $index) {
          <figure [class.temporary]="image.temporary">
            <img
              [src]="image.src"
              [alt]="productName() + ' — ' + image.alt"
              width="640"
              height="800"
              [attr.loading]="$index ? 'lazy' : null"
            />
            @if (image.temporary) {
              <figcaption>{{ image.alt }}</figcaption>
            }
          </figure>
        }
      </div>
      <p class="counter" aria-live="polite">{{ active() + 1 }} / {{ images().length }}</p>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .gallery {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 14px;
    }
    .rail {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .thumb {
      width: 72px;
      aspect-ratio: 4/5;
      padding: 0;
      overflow: hidden;
      border: 1px solid transparent;
      border-radius: 8px;
      background: var(--surface);
      opacity: 0.6;
      transition: opacity 0.2s ease;
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 6px;
    }
    .thumb.active,
    .thumb:hover {
      border-color: var(--ink);
      opacity: 1;
    }
    .stage {
      position: relative;
      aspect-ratio: 4/5;
      overflow: hidden;
      border-radius: var(--radius-card);
      background: var(--surface);
    }
    .main {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .stage.temporary .main {
      padding: 18%;
      object-fit: contain;
      opacity: 0.75;
    }
    .note,
    figcaption {
      position: absolute;
      bottom: 12%;
      inset-inline: 16px;
      color: var(--muted);
      font-size: 12px;
      text-align: center;
    }
    .arrows {
      position: absolute;
      right: 16px;
      bottom: 16px;
      display: flex;
      gap: 8px;
    }
    .arrows button {
      width: 40px;
      height: 40px;
      display: inline-grid;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 2px 8px #0002;
      color: var(--ink);
    }
    .arrows button:hover {
      background: var(--ink);
      color: #fff;
    }
    .track,
    .counter {
      display: none;
    }
    @media (max-width: 900px), (hover: none) {
      .gallery {
        display: block;
        position: relative;
      }
      .rail,
      .stage {
        display: none;
      }
      .track {
        display: flex;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        border-radius: var(--radius-card);
        outline-offset: 2px;
      }
      .track::-webkit-scrollbar {
        display: none;
      }
      figure {
        position: relative;
        flex: 0 0 100%;
        aspect-ratio: 4/5;
        margin: 0;
        scroll-snap-align: start;
        background: var(--surface);
      }
      figure img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      figure.temporary img {
        padding: 18%;
        object-fit: contain;
        opacity: 0.75;
      }
      .counter {
        display: block;
        position: absolute;
        right: 12px;
        bottom: 12px;
        margin: 0;
        padding: 4px 10px;
        border-radius: 999px;
        background: #fff;
        font-size: 12px;
        font-weight: 600;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .main {
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductGallery {
  readonly images = input.required<MediaAsset[]>();
  readonly productName = input.required<string>();
  readonly active = signal(0);
  readonly current = computed(() => this.images()[this.active()] ?? this.images()[0]);
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  show(index: number): void {
    this.active.set(index);
  }

  step(delta: number): void {
    const count = this.images().length;
    const next = (this.active() + delta + count) % count;
    this.active.set(next);
    const track = this.track()?.nativeElement;
    track?.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  }

  syncFromScroll(): void {
    const track = this.track()?.nativeElement;
    if (!track?.clientWidth) return;
    this.active.set(Math.round(track.scrollLeft / track.clientWidth));
  }
}
