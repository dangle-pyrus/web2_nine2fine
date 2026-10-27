import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { API_CONFIG } from '../../../core/api-config';
import { AdminSession } from '../../core/admin-session';
import { ADMIN_AUTH_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import { AdminStylesheet } from '../../layout/admin-stylesheet';
import { AdmIcon } from '../../ui/icon';

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
        @if (error()) {
          <div class="banner banner--critical" role="alert">
            <adm-icon name="reiconAlertCircle" />
            <div class="banner-body">{{ error() }}</div>
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
            required
            [(ngModel)]="email"
          />
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
            [(ngModel)]="password"
          />
        </div>
        <button
          type="submit"
          class="adm-btn adm-btn--primary adm-btn--lg"
          [class.is-busy]="busy()"
          [disabled]="!email || !password"
        >
          Đăng nhập
        </button>
        @if (mock) {
          <div class="demo">
            <p class="small tertiary">Tài khoản demo (chế độ mock)</p>
            <button type="button" class="link" (click)="fill('admin@nine2fine.vn', 'admin123')">
              Quản trị viên: admin&#64;nine2fine.vn / admin123
            </button>
            <button type="button" class="link" (click)="fill('staff@nine2fine.vn', 'staff123')">
              Nhân viên: staff&#64;nine2fine.vn / staff123
            </button>
          </div>
        }
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
    .demo {
      display: grid;
      gap: 6px;
      padding-top: 16px;
      border-top: 1px solid var(--adm-divider);
      justify-items: start;
    }
    .demo .link {
      font-size: 13px;
    }
  `,
})
export class LoginPage {
  protected readonly stylesheet = inject(AdminStylesheet);
  private readonly api = inject(ADMIN_AUTH_API);
  private readonly session = inject(AdminSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly mock = inject(API_CONFIG).mode === 'mock';

  email = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    this.stylesheet.load();
  }

  fill(email: string, password: string): void {
    this.email = email;
    this.password = password;
  }

  submit(): void {
    if (!this.email || !this.password || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.login(this.email, this.password).subscribe({
      next: (user) => {
        this.session.user.set(user);
        const target = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(target?.startsWith('/admin') ? target : '/admin');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(errorMessage(error));
      },
    });
  }
}
