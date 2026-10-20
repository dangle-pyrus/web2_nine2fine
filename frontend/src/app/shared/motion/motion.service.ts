import { DestroyRef, Injectable, signal } from '@angular/core';

type Gsap = typeof import('gsap').gsap;
type ScrollTriggerType = typeof import('gsap/ScrollTrigger').ScrollTrigger;

export interface MotionRuntime {
  gsap: Gsap;
  ScrollTrigger: ScrollTriggerType;
}

/**
 * Single GSAP entry point (plan section 29). GSAP is loaded lazily so commerce pages without
 * motion never pay for it, and nothing animates when the user prefers reduced motion.
 */
@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  readonly reducedMotion = signal(this.query?.matches ?? true);
  private runtime?: Promise<MotionRuntime>;

  constructor() {
    this.query?.addEventListener('change', (event) => this.reducedMotion.set(event.matches));
  }

  load(): Promise<MotionRuntime> {
    this.runtime ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([gsapModule, scrollModule]) => {
        gsapModule.gsap.registerPlugin(scrollModule.ScrollTrigger);
        return { gsap: gsapModule.gsap, ScrollTrigger: scrollModule.ScrollTrigger };
      },
    );
    return this.runtime;
  }

  /**
   * Runs `setup` inside a GSAP context scoped to `scope` and reverts every tween and
   * ScrollTrigger it created when the owner is destroyed.
   */
  animate(scope: Element, destroyRef: DestroyRef, setup: (runtime: MotionRuntime) => void): void {
    if (this.reducedMotion()) return;
    let revert: (() => void) | undefined;
    let destroyed = false;
    destroyRef.onDestroy(() => {
      destroyed = true;
      revert?.();
    });
    void this.load().then((runtime) => {
      if (destroyed) return;
      const context = runtime.gsap.context(() => setup(runtime), scope);
      revert = () => context.revert();
    });
  }
}
