import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from './icon.component';

export interface Toast {
  title: string;
  /** Item name or short explanation under the title. */
  detail?: string;
  /** Secondary line, e.g. colour / size. */
  meta?: string;
  image?: string;
  action?: { label: string; link: string };
}

const TOAST_DURATION_MS = 4000;

/** One toast at a time; a new toast replaces the current one and restarts its timer. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<(Toast & { id: number }) | null>(null);
  private nextId = 0;
  private timer?: ReturnType<typeof setTimeout>;

  show(toast: Toast): void {
    this.current.set({ ...toast, id: ++this.nextId });
    this.resume();
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.current.set(null);
  }

  /** Hover/focus keeps the toast open so it can be read or its link reached. */
  pause(): void {
    clearTimeout(this.timer);
  }

  resume(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.current.set(null), TOAST_DURATION_MS);
  }
}

/**
 * Feedback such as "added to bag" without opening the cart (user request 2026-10-11).
 * Top-right under the header on desktop, full width under the header on mobile. The live region stays in
 * the DOM so screen readers announce each new toast.
 */
@Component({
  selector: 'n2f-toast-host',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="region" aria-live="polite" role="status">
      @if (toasts.current(); as toast) {
        @for (item of [toast]; track item.id) {
          <div
            class="toast"
            (mouseenter)="toasts.pause()"
            (mouseleave)="toasts.resume()"
            (focusin)="toasts.pause()"
            (focusout)="toasts.resume()"
          >
            <p class="title"><n2f-icon name="reiconCheckCircle" size="20px" />{{ item.title }}</p>
            <div class="body">
              @if (item.image) {
                <img [src]="item.image" alt="" width="56" height="70" />
              }
              <div>
                @if (item.detail) {
                  <p class="detail">{{ item.detail }}</p>
                }
                @if (item.meta) {
                  <p class="meta">{{ item.meta }}</p>
                }
              </div>
            </div>
            @if (item.action; as action) {
              <a class="button dark" [routerLink]="action.link" (click)="toasts.dismiss()">{{
                action.label
              }}</a>
            }
            <button
              type="button"
              class="icon-button close"
              aria-label="Đóng thông báo"
              (click)="toasts.dismiss()"
            >
              <n2f-icon name="reiconX" size="18px" />
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .region {
      position: fixed;
      top: calc(var(--toast-top, 110px));
      right: var(--page-gutter);
      z-index: 70;
      width: min(360px, calc(100vw - 2 * var(--page-gutter)));
      pointer-events: none;
    }
    .toast {
      position: relative;
      display: grid;
      gap: 14px;
      padding: 18px 18px 18px;
      border-radius: var(--radius-card);
      background: #fff;
      box-shadow: 0 12px 40px #0000002b;
      pointer-events: auto;
      animation: toast-in 0.24s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }
    p {
      margin: 0;
    }
    .title {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-right: 32px;
      font-size: 15px;
      font-weight: 700;
    }
    .title n2f-icon {
      color: #1a7f37;
    }
    .body {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    img {
      width: 56px;
      height: 70px;
      object-fit: contain;
      padding: 6px;
      background: var(--surface);
    }
    .detail {
      font-size: 14px;
      font-weight: 600;
    }
    .meta {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
    }
    .button {
      width: 100%;
      min-height: 44px;
    }
    .close {
      position: absolute;
      top: 6px;
      right: 6px;
    }
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
    }
    /* Mobile: under the header, clear of the PDP sticky add-to-bag bar at the bottom. */
    @media (max-width: 800px) {
      .region {
        top: 72px;
        right: 16px;
        width: calc(100vw - 32px);
      }
    }
  `,
})
export class ToastHost {
  readonly toasts = inject(ToastService);
}
