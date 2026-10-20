import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { MotionService } from './motion.service';
import { MOTION, REVEAL_START } from './motion-tokens';

/**
 * `image-mask` token: the frame opens with a clip-path wipe while the image settles from a slight
 * zoom. Optional subtle parallax on desktop (`n2fImageReveal="parallax"`), never on touch screens.
 */
@Directive({ selector: '[n2fImageReveal]' })
export class ImageRevealDirective {
  readonly mode = input<'mask' | 'parallax' | ''>('mask', { alias: 'n2fImageReveal' });
  readonly immediate = input(false, { alias: 'n2fImageRevealImmediate' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly motion = inject(MotionService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const frame = this.host.nativeElement;
      this.motion.animate(frame, this.destroyRef, ({ gsap }) => {
        const image = frame.querySelector('img');
        const trigger = this.immediate()
          ? undefined
          : { trigger: frame, start: REVEAL_START, once: true };
        gsap.from(frame, {
          clipPath: 'inset(100% 0% 0% 0%)',
          duration: MOTION.duration.slow,
          ease: MOTION.ease.editorial,
          clearProps: 'clipPath',
          scrollTrigger: trigger,
        });
        if (image) {
          gsap.from(image, {
            scale: 1.15,
            duration: MOTION.duration.slow + 0.4,
            ease: MOTION.ease.editorial,
            clearProps: 'transform',
            scrollTrigger: trigger,
          });
        }
        const desktop = globalThis.matchMedia?.('(min-width: 1024px) and (hover: hover)').matches;
        if (this.mode() === 'parallax' && image && desktop) {
          gsap.fromTo(
            image,
            { yPercent: -6 },
            {
              yPercent: 6,
              ease: 'none',
              scrollTrigger: {
                trigger: frame,
                start: 'top bottom',
                end: 'bottom top',
                scrub: true,
              },
            },
          );
        }
      });
    });
  }
}
