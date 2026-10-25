import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';
import { AdmIcon } from './icon';

export interface AdminToast {
  message: string;
  tone?: 'default' | 'error';
  /** Shows "Hoàn tác" (5.6); the toast closes after the callback runs. */
  undo?: () => void;
  /** A next step other than undo, e.g. "Đơn tiếp theo"; the toast closes after it runs. */
  action?: { label: string; run: () => void };
}

const DURATION_MS = 4500;

/**
 * Admin-only toasts (Phụ lục A.3): black, bottom-right, one at a time. Error toasts stay until
 * closed (5.6).
 */
@Injectable({ providedIn: 'root' })
export class AdminToastService {
  readonly current = signal<(AdminToast & { id: number }) | null>(null);
  private nextId = 0;
  private timer?: ReturnType<typeof setTimeout>;

  show(message: string, options: Omit<AdminToast, 'message'> = {}): void {
    clearTimeout(this.timer);
    const toast = { message, ...options, id: ++this.nextId };
    this.current.set(toast);
    if (toast.tone !== 'error') this.resume();
  }

  error(message: string): void {
    this.show(message, { tone: 'error' });
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.current.set(null);
  }

  pause(): void {
    clearTimeout(this.timer);
  }

  resume(): void {
    if (this.current()?.tone === 'error') return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.current.set(null), DURATION_MS);
  }
}

@Component({
  selector: 'adm-toast-host',
  imports: [AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="region" aria-live="polite" role="status">
      @if (toasts.current(); as toast) {
        @for (item of [toast]; track item.id) {
          <div
            class="toast"
            [class.error]="item.tone === 'error'"
            (mouseenter)="toasts.pause()"
            (mouseleave)="toasts.resume()"
            (focusin)="toasts.pause()"
            (focusout)="toasts.resume()"
          >
            @if (item.tone === 'error') {
              <adm-icon name="reiconAlertCircle" [size]="18" class="err-icon" />
            }
            <p>{{ item.message }}</p>
            @if (item.undo) {
              <button type="button" class="undo" (click)="item.undo(); toasts.dismiss()">
                Hoàn tác
              </button>
            }
            @if (item.action; as action) {
              <button type="button" class="undo" (click)="action.run(); toasts.dismiss()">
                {{ action.label }}
              </button>
            }
            <button
              type="button"
              class="close"
              aria-label="Đóng thông báo"
              (click)="toasts.dismiss()"
            >
              <adm-icon name="reiconX" [size]="16" />
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .region {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 1100;
      width: min(400px, calc(100vw - 32px));
      pointer-events: none;
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 8px 12px 16px;
      border-radius: 16px;
      background: var(--adm-primary);
      color: #fff;
      box-shadow: var(--adm-shadow-md);
      pointer-events: auto;
      animation: in 150ms ease-out both;
    }
    p {
      flex: 1;
      margin: 0;
    }
    .err-icon {
      color: #fca5a5;
    }
    button {
      border: 0;
      background: transparent;
      color: #fff;
      font: inherit;
      cursor: pointer;
      border-radius: 9999px;
    }
    .undo {
      font-weight: 500;
      text-decoration: underline;
      text-underline-offset: 2px;
      padding: 4px 8px;
    }
    .close {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
    }
    button:hover {
      background: rgba(255, 255, 255, 0.14);
    }
    button:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 1px;
    }
    @keyframes in {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
    }
    @media (max-width: 767px) {
      .region {
        right: 16px;
        bottom: 16px;
      }
    }
  `,
})
export class AdmToastHost {
  readonly toasts = inject(AdminToastService);
}
