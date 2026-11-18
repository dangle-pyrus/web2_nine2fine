import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  inject,
} from '@angular/core';

/** Facebook page of nine2fine customer care. */
export const SUPPORT_FACEBOOK_URL = 'https://www.facebook.com/thang.pham.50014/';

/** Elements pinned to the bottom of the screen that floating buttons must not cover. */
const AVOID_SELECTOR = '[data-float-avoid]';
/** CSS variable (on `<html>`) that lifts every floating button above such a bar. */
const LIFT_VAR = '--n2f-float-lift';

/**
 * Height of the bottom bar currently pinned to the viewport bottom (PDP "Mua nhanh" bar, mobile cart
 * summary), 0 when none. A sticky bar that has scrolled back into the flow does not count.
 */
export function bottomObstacle(doc: Document): number {
  const viewport = doc.defaultView?.innerHeight ?? 0;
  let lift = 0;
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(AVOID_SELECTOR))) {
    const rect = el.getBoundingClientRect();
    if (rect.height === 0 || rect.width === 0) continue; // display: none (desktop)
    if (Math.abs(rect.bottom - viewport) > 2) continue; // not pinned to the bottom right now
    lift = Math.max(lift, rect.height);
  }
  return Math.round(lift);
}

/**
 * Floating "contact customer care" button (storefront only): round, Facebook logo, bottom-right,
 * opens the shop's Facebook page in a new tab. Keeps itself (and the Messenger bubble, which reads
 * the same `--n2f-float-lift`) above bottom bars marked `data-float-avoid`.
 */
@Component({
  selector: 'n2f-support-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      class="support"
      data-testid="support-button"
      [href]="href"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Liên hệ CSKH qua Facebook"
      title="Liên hệ CSKH qua Facebook"
    >
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07Z"
        />
      </svg>
    </a>
  `,
  styles: `
    :host {
      position: fixed;
      right: 20px;
      bottom: calc(20px + var(--n2f-float-lift, 0px) + env(safe-area-inset-bottom, 0px));
      z-index: 40;
      transition: bottom 0.2s ease;
    }
    .support {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #1877f2;
      color: #fff;
      box-shadow: 0 6px 18px rgb(0 0 0 / 22%);
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease;
    }
    .support:hover,
    .support:focus-visible {
      transform: translateY(-2px);
      box-shadow: 0 10px 24px rgb(0 0 0 / 26%);
    }
    .support:focus-visible {
      outline: 3px solid #fff;
      outline-offset: 2px;
      box-shadow:
        0 0 0 6px #1877f2,
        0 10px 24px rgb(0 0 0 / 26%);
    }
    @media (max-width: 767px) {
      :host {
        right: 16px;
        bottom: calc(16px + var(--n2f-float-lift, 0px) + env(safe-area-inset-bottom, 0px));
      }
      .support {
        width: 52px;
        height: 52px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host,
      .support {
        transition: none;
      }
    }
  `,
})
export class SupportButton {
  readonly href = SUPPORT_FACEBOOK_URL;

  constructor() {
    const doc = inject(DOCUMENT);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const win = doc.defaultView;
      if (!win) return;
      let frame = 0;
      let current = -1;
      const update = (): void => {
        frame = 0;
        const lift = bottomObstacle(doc);
        if (lift === current) return;
        current = lift;
        doc.documentElement.style.setProperty(LIFT_VAR, `${lift}px`);
      };
      const schedule = (): void => {
        if (!frame) frame = win.requestAnimationFrame(update);
      };
      // Bars appear after data loads or on scroll (PDP), and stick or unstick while scrolling (cart).
      const observer = new MutationObserver(schedule);
      observer.observe(doc.body, { childList: true, subtree: true });
      win.addEventListener('scroll', schedule, { passive: true });
      win.addEventListener('resize', schedule, { passive: true });
      schedule();
      destroyRef.onDestroy(() => {
        observer.disconnect();
        win.removeEventListener('scroll', schedule);
        win.removeEventListener('resize', schedule);
        if (frame) win.cancelAnimationFrame(frame);
        doc.documentElement.style.removeProperty(LIFT_VAR);
      });
    });
  }
}
