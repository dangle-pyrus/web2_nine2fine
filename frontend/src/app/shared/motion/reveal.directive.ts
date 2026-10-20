import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { MotionService } from './motion.service';
import { REVEAL_PRESETS, REVEAL_START, RevealToken } from './motion-tokens';

/**
 * Scroll-triggered reveal using a motion token: `<section n2fReveal="stagger-grid">`.
 * Content is fully visible without JavaScript or with reduced motion; GSAP only animates *from*
 * an offset state once, so nothing stays hidden if a trigger never fires.
 */
@Directive({ selector: '[n2fReveal]' })
export class RevealDirective {
  readonly token = input<RevealToken | ''>('reveal-md', { alias: 'n2fReveal' });
  /** Animate immediately (above-the-fold content) instead of on scroll. */
  readonly immediate = input(false, { alias: 'n2fRevealImmediate' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly motion = inject(MotionService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const element = this.host.nativeElement;
      const preset = REVEAL_PRESETS[this.token() || 'reveal-md'];
      this.motion.animate(element, this.destroyRef, ({ gsap }) => {
        const targets = preset.children
          ? Array.from(element.querySelectorAll<HTMLElement>(preset.children))
          : [element];
        if (!targets.length) return;
        gsap.from(targets, {
          ...preset.from,
          duration: preset.duration,
          ease: preset.ease,
          stagger: preset.stagger,
          clearProps: 'transform,opacity',
          scrollTrigger: this.immediate()
            ? undefined
            : { trigger: element, start: REVEAL_START, once: true },
        });
      });
    });
  }
}
