import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MediaImageComponent } from '../../shared/ui/media-image.component';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { MotionService } from '../../shared/motion/motion.service';
import { Analytics } from '../../core/analytics';
import { Product } from '../catalog/models/product';
import { HomeContent } from './home-content';

/**
 * Plan 8.2 signature story. Desktop: a full-bleed split where the image half is CSS-sticky (no
 * scroll hijack) and swaps with the active moment; mobile: each moment is an edge-to-edge block.
 */
@Component({
  selector: 'n2f-home-story',
  imports: [RouterLink, MediaImageComponent, PricePipe, IconComponent, RevealDirective],
  template: `
    @let story = content();
    <section class="story" id="story" aria-labelledby="story-title" tabindex="-1">
      <header class="container" n2fReveal="editorial-reveal">
        <p class="eyebrow" data-reveal-line>{{ story.eyebrow }}</p>
        <h2 id="story-title" data-reveal-line>{{ story.title }}</h2>
        <p class="intro" data-reveal-line>{{ story.intro }}</p>
        <nav class="story-nav" aria-label="Chọn khoảnh khắc trong ngày">
          @for (moment of story.moments; track moment.id; let index = $index) {
            <a
              routerLink="/"
              [fragment]="moment.id"
              [attr.aria-current]="index === active() ? 'step' : null"
            >
              <span>{{ moment.time }}</span>
              <span class="nav-label">{{ moment.label }}</span>
            </a>
          }
        </nav>
      </header>
      <!-- Full-bleed split: the photograph owns half the screen, edge to edge. -->
      <div class="layout">
        <div class="visual" aria-hidden="true">
          @for (moment of story.moments; track moment.time; let index = $index) {
            <n2f-media-image
              class="frame"
              [class.active]="index === active()"
              [mediaId]="moment.mediaId"
              sizes="(max-width: 900px) 100vw, 50vw"
              [decorative]="true"
            />
          }
          <div class="visual-caption">
            <p class="counter">
              <span>0{{ active() + 1 }}</span> / 0{{ story.moments.length }}
            </p>
            <p>From Nine to Fine.</p>
            <div class="story-progress"><span data-story-progress></span></div>
          </div>
        </div>
        <ol class="moments">
          @for (moment of story.moments; track moment.time; let index = $index) {
            <li
              #moment
              [id]="moment.id"
              [attr.data-index]="index"
              [class.active]="index === active()"
              tabindex="-1"
            >
              <n2f-media-image class="inline-frame" [mediaId]="moment.mediaId" sizes="100vw" />
              <div class="moment-copy">
                <p class="time">
                  <strong>{{ moment.time }}</strong
                  ><span>{{ moment.label }}</span>
                </p>
                <h3>{{ moment.title }}</h3>
                <p class="copy">{{ moment.copy }}</p>
                @if (products()[moment.productSlug]; as product) {
                  <a
                    class="worn"
                    [routerLink]="['/product', product.slug]"
                    (click)="
                      analytics.track('view_look', { moment: moment.time, product: product.slug })
                    "
                  >
                    <span class="worn-label">Gợi ý phối cùng</span>
                    <span class="worn-name">{{ product.name }}</span>
                    <span class="worn-price">{{ product.price | vnd }}</span>
                    <n2f-icon name="reiconArrowRight" size="18px" />
                  </a>
                }
              </div>
            </li>
          }
        </ol>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      /* Mirrors the store header height so the sticky photograph sits right under it. */
      --header-h: max(64px, min(90px, 4.6875vw));
    }
    .story {
      padding-top: clamp(56px, 6vw, 96px);
      scroll-margin-top: calc(var(--header-h) + 24px);
      outline: none;
    }
    header {
      max-width: 1100px;
      text-align: center;
    }
    .eyebrow {
      margin: 0 0 20px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.28em;
      text-transform: uppercase;
    }
    h2 {
      margin: 0;
      color: var(--heading);
      font-size: clamp(34px, 5vw, 72px);
      font-weight: 700;
      line-height: 1.05;
    }
    .intro {
      max-width: 560px;
      margin: 24px auto 0;
      color: var(--muted);
      font-family: 'Playfair Display', Georgia, serif;
      font-size: clamp(18px, 1.6vw, 22px);
      font-style: italic;
      line-height: 1.6;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      margin-top: clamp(40px, 5vw, 72px);
    }
    .story-nav {
      display: flex;
      justify-content: center;
      gap: clamp(24px, 5vw, 72px);
      margin-top: 36px;
    }
    .story-nav a {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 44px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
      font-size: 18px;
      font-weight: 700;
    }
    .story-nav a[aria-current='step'] {
      border-color: var(--brand);
    }
    .nav-label {
      color: var(--muted);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .visual {
      position: sticky;
      top: var(--header-h);
      height: calc(100svh - var(--header-h));
      overflow: hidden;
      background: var(--surface);
    }
    .frame {
      position: absolute;
      inset: 0;
      opacity: 0;
      transform: scale(1.06);
      transition:
        opacity 0.9s ease,
        transform 1.6s cubic-bezier(0.2, 0.7, 0.2, 1);
    }
    .frame.active {
      opacity: 1;
      transform: none;
    }
    .visual-caption {
      position: absolute;
      inset: auto 0 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 20px;
      padding: 56px clamp(20px, 3vw, 48px) 28px;
      background: linear-gradient(transparent, #0009);
      color: #fff;
    }
    .visual-caption p {
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.04em;
    }
    .visual-caption .counter {
      font-size: 13px;
      letter-spacing: 0.2em;
    }
    .story-progress {
      flex-basis: 100%;
      height: 2px;
      overflow: hidden;
      background: #ffffff4d;
    }
    .story-progress span {
      display: block;
      height: 100%;
      background: #fff;
      transform-origin: left;
    }
    .moments {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .moments li {
      min-height: max(560px, 80svh);
      display: flex;
      align-items: center;
      padding: 48px clamp(32px, 5vw, 96px);
      scroll-margin-top: calc(var(--header-h) + 20px);
    }
    .moment-copy {
      display: flex;
      flex-direction: column;
    }
    .inline-frame {
      display: none;
    }
    .time {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
    }
    .time strong {
      font-size: clamp(72px, 9vw, 144px);
      font-weight: 800;
      line-height: 0.9;
      letter-spacing: -0.03em;
    }
    .time span {
      order: -1;
      color: var(--brand);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.28em;
      text-transform: uppercase;
    }
    h3 {
      margin: 32px 0 12px;
      font-size: clamp(22px, 2vw, 28px);
      font-weight: 600;
    }
    .copy {
      max-width: 420px;
      margin: 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.8;
    }
    .worn {
      align-self: flex-start;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px 16px;
      margin-top: 36px;
      padding-block: 10px;
      border-bottom: 1px solid var(--ink);
      font-size: 14px;
    }
    .worn:hover {
      color: var(--brand);
      border-color: var(--brand);
    }
    .worn-label {
      grid-column: 1 / -1;
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .worn-name {
      font-weight: 700;
    }
    .worn-price {
      grid-column: 1;
    }
    .worn n2f-icon {
      grid-column: 2;
      grid-row: 2 / 4;
    }
    @media (max-width: 900px) {
      .layout {
        display: block;
        margin-top: 48px;
      }
      .visual {
        display: none;
      }
      .moments li {
        display: block;
        min-height: 0;
        padding: 0;
        margin-top: 56px;
        opacity: 1;
      }
      .inline-frame {
        display: block;
        aspect-ratio: 4/5;
        margin-bottom: 28px;
      }
      .moment-copy {
        padding-inline: 20px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .frame,
      .moments li {
        transition: none;
      }
      .story-progress {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeStory {
  readonly content = input.required<HomeContent['story']>();
  readonly products = input<Record<string, Product>>({});
  readonly active = signal(0);
  readonly analytics = inject(Analytics);
  private readonly items = viewChildren<ElementRef<HTMLElement>>('moment');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly motion = inject(MotionService);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      // The moment crossing the middle band of the viewport becomes active.
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              this.active.set(Number((entry.target as HTMLElement).dataset['index']));
            }
          }
        },
        { rootMargin: '-45% 0px -45% 0px' },
      );
      for (const item of this.items()) observer.observe(item.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
      this.motion.animate(this.host.nativeElement, destroyRef, ({ gsap }) => {
        const layout = this.host.nativeElement.querySelector('.layout');
        gsap.fromTo(
          '[data-story-progress]',
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: 'none',
            scrollTrigger: { trigger: layout, start: 'top 45%', end: 'bottom 55%', scrub: 0.3 },
          },
        );
        for (const item of this.items()) {
          const copy = item.nativeElement.querySelector('.moment-copy');
          gsap.from(copy, {
            y: 28,
            duration: 0.7,
            ease: 'power3.out',
            clearProps: 'transform',
            scrollTrigger: { trigger: item.nativeElement, start: 'top 80%', once: true },
          });
        }
      });
    });
  }
}
