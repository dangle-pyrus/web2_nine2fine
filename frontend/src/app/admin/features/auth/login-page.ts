import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { sanitizeAdminReturnUrl } from '../../../core/return-url';
import { formatWait, SUPPORT_EMAIL, validEmail } from '../../../features/auth/auth-messages';
import { AdminSession } from '../../core/admin-session';
import { ADMIN_AUTH_API } from '../../data-access/admin-apis';
import { AdminApiError } from '../../data-access/models';
import { AdminStylesheet } from '../../layout/admin-stylesheet';
import { AdmIcon } from '../../ui/icon';

interface LoginNavigationState {
  expired?: boolean;
}

/** Staff sign-in. Separate from the shopper login (`/auth/login`). */
@Component({
  selector: 'adm-login-page',
  imports: [FormsModule, AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm', '[class.is-ready]': 'stylesheet.ready()' },
  template: `
    <main class="wrap">
      <form class="panel" (ngSubmit)="submit()" novalidate>
        <img src="/assets/brand/logo-typho.svg" alt="nine2fine" height="22" />
        <div>
          <h1>Đăng nhập quản trị</h1>
          <p class="secondary">Dành cho nhân viên nine2fine.</p>
        </div>
        @if (expired()) {
          <div class="banner banner--info" role="status">
            <adm-icon name="reiconInfoCircle" />
            <div class="banner-body">Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.</div>
          </div>
        }
        @if (error(); as problem) {
          <div class="banner banner--critical" role="alert">
            <adm-icon name="reiconAlertCircle" />
            <div class="banner-body">
              {{ problem.text }}
              @if (problem.support) {
                <br />Email hỗ trợ:
                <a class="link" [href]="'mailto:' + supportEmail">{{ supportEmail }}</a>
              }
            </div>
          </div>
        }
        <div class="field">
          <label for="email">Email</label>
          <input
            id="email"
            class="input"
            type="email"
            name="email"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            required
            [attr.aria-invalid]="emailError() ? true : null"
            [attr.aria-describedby]="emailError() ? 'email-error' : null"
            [(ngModel)]="email"
          />
          @if (emailError(); as message) {
            <p class="error" id="email-error">{{ message }}</p>
          }
        </div>
        <div class="field">
          <label for="password">Mật khẩu</label>
          <input
            id="password"
            class="input"
            type="password"
            name="password"
            autocomplete="current-password"
            required
            [attr.aria-invalid]="passwordError() ? true : null"
            [attr.aria-describedby]="passwordError() ? 'password-error' : null"
            [(ngModel)]="password"
          />
          @if (passwordError(); as message) {
            <p class="error" id="password-error">{{ message }}</p>
          }
        </div>
        <button
          type="submit"
          class="adm-btn adm-btn--primary adm-btn--lg"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          [attr.aria-busy]="busy()"
        >
          {{ busy() ? 'Đang đăng nhập…' : 'Đăng nhập' }}
        </button>
      </form>
    </main>
  `,
  styles: `
    :host {
      display: block;
      opacity: 0;
    }
    :host(.is-ready) {
      opacity: 1;
    }
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px 16px;
      background: var(--adm-sidebar);
    }
    .panel {
      width: min(400px, 100%);
      display: grid;
      gap: 20px;
      padding: 32px;
      border-radius: 20px;
      background: var(--adm-bg);
      box-shadow: var(--adm-shadow-xs);
    }
    h1 {
      font-size: 20px;
      line-height: 28px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .banner {
      margin: 0;
    }
    .adm-btn {
      width: 100%;
    }
  `,
})
export class LoginPage {
  protected readonly stylesheet = inject(AdminStylesheet);
  protected readonly supportEmail = SUPPORT_EMAIL;
  private readonly api = inject(ADMIN_AUTH_API);
  private readonly session = inject(AdminSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  email = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal<{ text: string; support?: boolean } | null>(null);
  readonly emailError = signal('');
  readonly passwordError = signal('');
  readonly expired = signal((history.state as LoginNavigationState | null)?.expired === true);

  constructor() {
    this.stylesheet.load();
  }

  submit(): void {
    if (this.busy()) return;
    this.error.set(null);
    this.emailError.set(
      !this.email.trim()
        ? 'Nhập email.'
        : validEmail(this.email)
          ? ''
          : 'Nhập địa chỉ email hợp lệ.',
    );
    this.passwordError.set(this.password ? '' : 'Nhập mật khẩu.');
    if (this.emailError() || this.passwordError()) {
      const id = this.emailError() ? 'email' : 'password';
      this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus();
      return;
    }
    this.busy.set(true);
    this.api.login(this.email.trim(), this.password).subscribe({
      next: (user) => {
        this.session.user.set(user);
        const target = sanitizeAdminReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
        void this.router.navigateByUrl(target ?? '/admin');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(describe(error));
      },
    });
  }
}

/** Text chosen from the contract error code only. */
function describe(error: unknown): { text: string; support?: boolean } {
  const code = error instanceof AdminApiError ? error.code : 'unavailable';
  const wait = formatWait(error instanceof AdminApiError ? error.retryAfterSeconds : undefined);
  switch (code) {
    case 'invalid-credentials':
      return { text: 'Email hoặc mật khẩu chưa đúng.' };
    case 'password-locked':
      return { text: `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${wait}.` };
    case 'rate-limited':
      return { text: `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${wait}.` };
    case 'account-disabled':
      return {
        text: 'Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ nine2fine để được hỗ trợ.',
        support: true,
      };
    default:
      return { text: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}
