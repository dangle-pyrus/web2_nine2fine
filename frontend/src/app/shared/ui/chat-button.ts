import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import { reiconChatRoundDots } from '@ng-icons/reicon';
import { storeSettings } from '../../core/store-settings';
import { IconComponent } from './icon.component';

/** Support hours when the store settings carry no "H:MM – H:MM" range (CHAT-03). */
const FALLBACK_HOURS = { from: 8 * 60, to: 22 * 60 };
/** Pages where the button would interrupt paying (CHAT-01). */
const HIDDEN_ON = [/^\/checkout(\/|$|\?|#)/, /^\/payment\//];

/** Minutes after midnight in Vietnam (UTC+7, no daylight saving). */
export function vietnamMinutes(at: Date = new Date()): number {
  return (at.getUTCHours() * 60 + at.getUTCMinutes() + 7 * 60) % (24 * 60);
}

/** First "H:MM – H:MM" (or "HH:MM-HH:MM") range of the store's opening hours text, in minutes. */
export function supportWindow(hours: string | undefined): { from: number; to: number } {
  const m = /(\d{1,2})[:h](\d{2})\s*[–—-]\s*(\d{1,2})[:h](\d{2})/.exec(hours ?? '');
  if (!m) return FALLBACK_HOURS;
  const from = Number(m[1]) * 60 + Number(m[2]);
  const to = Number(m[3]) * 60 + Number(m[4]);
  return from < to ? { from, to } : FALLBACK_HOURS;
}

/**
 * Turns the store's Facebook page link into a Messenger link: `facebook.com/<page>` -> `https://m.me/<page>`.
 * An `m.me` link is kept; a numeric `profile.php?id=` page uses the id. Anything else -> null (no button).
 */
export function messengerUrl(facebook: string | null | undefined): string | null {
  if (!facebook) return null;
  let url: URL;
  try {
    url = new URL(facebook);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  if (host === 'm.me') return url.pathname.length > 1 ? `https://m.me${url.pathname}` : null;
  if (host !== 'facebook.com' && host !== 'fb.com') return null;
  const id = url.searchParams.get('id');
  if (url.pathname.startsWith('/profile.php') && id)
    return `https://m.me/${encodeURIComponent(id)}`;
  const page = url.pathname.split('/').filter(Boolean)[0];
  return page ? `https://m.me/${encodeURIComponent(page)}` : null;
}

/**
 * Messenger chat button (CHAT-01..03): bottom-right on every storefront page except checkout and the
 * QR payment page; opens Messenger in a new tab (on phones the `m.me` link opens the Messenger app
 * when it is installed, the web chat otherwise). Outside support hours (store settings, Vietnam
 * time) it still opens, with a note that the reply comes in the next working hours.
 * Shown only when the store settings carry a Facebook page link.
 */
@Component({
  selector: 'n2f-chat-button',
  imports: [IconComponent],
  viewProviders: [provideIcons({ reiconChatRoundDots })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (href() && !hidden()) {
      <div class="chat" data-testid="chat-button">
        @if (offHours() && noteOpen()) {
          <p class="note" role="status">
            Ngoài giờ hỗ trợ, chúng tôi sẽ phản hồi trong giờ làm việc tiếp theo.
            <button
              type="button"
              class="close"
              aria-label="Đóng thông báo"
              (click)="noteOpen.set(false)"
            >
              ×
            </button>
          </p>
        }
        <a
          class="bubble"
          [href]="href()"
          target="_blank"
          rel="noopener noreferrer"
          [attr.aria-label]="
            'Chat với nine2fine qua Messenger' + (offHours() ? ' (ngoài giờ hỗ trợ)' : '')
          "
          (click)="opened()"
        >
          <n2f-icon name="reiconChatRoundDots" size="26px" />
        </a>
      </div>
    }
  `,
  styles: `
    .chat {
      position: fixed;
      right: 20px;
      bottom: calc(20px + env(safe-area-inset-bottom, 0px));
      z-index: 40;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }
    .bubble {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--ink, #111);
      color: var(--paper, #fff);
      box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
      transition: transform 0.15s ease;
    }
    .bubble:hover,
    .bubble:focus-visible {
      transform: translateY(-2px);
    }
    .note {
      max-width: 260px;
      margin: 0;
      padding: 10px 32px 10px 12px;
      position: relative;
      border-radius: 12px;
      background: var(--paper, #fff);
      color: var(--ink, #111);
      font-size: 13px;
      line-height: 1.4;
      box-shadow: 0 6px 18px rgb(0 0 0 / 14%);
    }
    .close {
      position: absolute;
      top: 4px;
      right: 6px;
      border: 0;
      background: transparent;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      color: inherit;
    }
    @media (max-width: 767px) {
      .chat {
        right: 16px;
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      }
      .bubble {
        width: 52px;
        height: 52px;
      }
    }
  `,
})
export class ChatButton {
  private readonly router = inject(Router);
  private readonly url = signal(this.router.url);
  private readonly now = signal(new Date());

  readonly href = computed(() => messengerUrl(storeSettings().info.social?.facebook));
  readonly hidden = computed(() => HIDDEN_ON.some((re) => re.test(this.url())));
  readonly offHours = computed(() => {
    const window = supportWindow(storeSettings().info.hours);
    const minutes = vietnamMinutes(this.now());
    return minutes < window.from || minutes >= window.to;
  });
  /** The out-of-hours note shows once per page view until closed. */
  readonly noteOpen = signal(true);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  opened(): void {
    this.now.set(new Date());
  }
}
