import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { getMedia } from '../../../media/media-manifest';
import { IconComponent } from '../../shared/ui/icon.component';
import { MotionService } from '../../shared/motion/motion.service';
import { MOTION } from '../../shared/motion/motion-tokens';
import { HomeContent } from './home-content';

/**
 * Plan 8.1 hero. Full viewport under the transparent header; intro timeline animates the type
 * and image only — CTAs are interactive and visible from the first frame.
 */
@Component({
  selector: 'n2f-home-hero',
  imports: [RouterLink, IconComponent],
  template: `
    @let hero = content();
    <section class="hero" aria-labelledby="hero-title">
      <div class="media" data-hero-media>
        <!-- One <picture> so phones download only the portrait crop (plan 38: LCP priority). -->
        <picture>
          <source
            media="(max-width: 800px)"
            [attr.srcset]="mobile().srcset"
            sizes="100vw"
            [attr.width]="mobile().width"
            [attr.height]="mobile().height"
          />
          <img
            [src]="desktop().src"
            [attr.srcset]="desktop().srcset"
            sizes="100vw"
            [width]="desktop().width"
            [height]="desktop().height"
            [style.object-position]="desktop().objectPosition"
            alt=""
            fetchpriority="high"
          />
        </picture>
      </div>
      <div class="shade" aria-hidden="true"></div>
      <div class="container inner">
        <h1 id="hero-title">
          @for (line of hero.lines; track line; let last = $last) {
            <span class="line" data-hero-line
              ><span>{{ last ? line.slice(0, -1) : line }}</span>
              @if (last) {
                <span class="dot">{{ line.slice(-1) }}</span>
              }
            </span>
          }
        </h1>
        <p class="accent" data-hero-line>{{ hero.accent }}</p>
        <ol class="timeline" aria-label="Một ngày cùng nine2fine" data-hero-line>
          @for (step of hero.timeline; track step.time; let last = $last) {
            <li>
              <strong>{{ step.time }}</strong> {{ step.label }}
            </li>
            @if (!last) {
              <li class="arrow" aria-hidden="true">
                <n2f-icon name="reiconArrowRight" size="20px" />
              </li>
            }
          }
        </ol>
        <div class="ctas">
          <a class="cta primary" [routerLink]="hero.primary.link">{{ hero.primary.label }}</a>
          <a
            class="cta ghost"
            [routerLink]="hero.secondary.link"
            [fragment]="hero.secondary.fragment"
            >{{ hero.secondary.label }}</a
          >
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .hero {
      position: relative;
      min-height: 100svh;
      display: flex;
      align-items: flex-end;
      overflow: hidden;
      background: #1a1a1a;
      color: #fff;
    }
    .media,
    .shade {
      position: absolute;
      inset: 0;
    }
    picture,
    img {
      display: block;
      width: 100%;
      height: 100%;
    }
    img {
      object-fit: cover;
    }
    /* Light touch: the photograph carries the hero; shade only protects the header and type. */
    .shade {
      background:
        linear-gradient(180deg, #00000066 0%, #0000 18%),
        linear-gradient(90deg, #00000073 0%, #00000026 34%, #0000 58%),
        linear-gradient(0deg, #00000066 0%, #0000 32%);
    }
    .inner {
      position: relative;
      padding-block: 140px clamp(48px, 9vh, 96px);
    }
    h1 {
      margin: 0;
      font-size: clamp(64px, 11vw, 176px);
      font-weight: 800;
      line-height: 0.88;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    .line {
      display: block;
    }
    .dot {
      color: var(--brand-mark);
    }
    .accent {
      margin: 28px 0 0;
      font-family: 'Playfair Display', Georgia, serif;
      font-size: clamp(20px, 2.2vw, 30px);
      font-style: italic;
    }
    .timeline {
      display: flex;
      align-items: center;
      gap: 14px;
      margin: 18px 0 0;
      padding: 0;
      list-style: none;
      font-size: 15px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .timeline strong {
      font-size: 20px;
      letter-spacing: 0;
    }
    .ctas {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 32px;
      margin-top: 40px;
    }
    .cta {
      min-height: 52px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .cta.primary {
      padding: 0 36px;
      border: 1px solid #fff;
      background: #ffffff14;
      backdrop-filter: blur(4px);
      transition:
        background 0.3s ease,
        color 0.3s ease;
    }
    .cta.primary:hover {
      background: #fff;
      color: var(--ink);
    }
    .cta.ghost {
      padding: 0;
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 8px;
      transition: text-decoration-color 0.3s ease;
    }
    .cta.ghost:hover {
      color: #fff;
      text-decoration-color: var(--brand-mark);
    }
    @media (max-width: 800px) {
      .shade {
        background:
          linear-gradient(180deg, #00000066 0%, #0000 22%),
          linear-gradient(0deg, #000000a6 0%, #00000040 42%, #0000 64%);
      }
      .inner {
        padding-block: 120px 40px;
      }
      h1 {
        font-size: clamp(48px, 14vw, 72px);
      }
      .timeline {
        font-size: 13px;
      }
      .cta.primary {
        flex: 1 1 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeHero {
  readonly content = input.required<HomeContent['hero']>();
  readonly desktop = computed(() => getMedia(this.content().mediaId));
  readonly mobile = computed(() => getMedia(this.content().mobileMediaId));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly motion = inject(MotionService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const element = this.host.nativeElement;
      this.motion.animate(element, this.destroyRef, ({ gsap }) => {
        gsap
          .timeline({ defaults: { ease: MOTION.ease.editorial } })
          .from('[data-hero-media]', { scale: 1.12, duration: MOTION.duration.slow + 0.6 }, 0)
          .from(
            '[data-hero-line]',
            {
              yPercent: 40,
              opacity: 0,
              duration: MOTION.duration.slow,
              stagger: MOTION.stagger.text,
            },
            0.1,
          );
      });
    });
  }
}
