import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Observable } from 'rxjs';
import { AUTH_API, AuthError, AuthUser } from './data-access/auth-api';
import { AuthFlowState, AuthSession, redirectWhenSignedIn } from './auth-session';
import { AuthMessage, authMessage, CODE_PATTERN, emailValidator } from './auth-messages';
import { AuthMessageText } from './ui/auth-message';
import { VerificationCodeField } from './ui/verification-code-field';
import { PasswordField } from './ui/password-field';

type LoginStep = 'email' | 'code' | 'password';

interface LoginNavigationState {
  step?: LoginStep;
  notice?: string;
}

const HEADINGS: Record<LoginStep, string> = {
  email: 'Nhập email của bạn để tham gia hoặc đăng nhập.',
  code: 'Nhập mã 8 số chúng tôi vừa gửi qua email của bạn.',
  password: 'Nhập mật khẩu của bạn để đăng nhập vào tài khoản.',
};

/** Figma frames 12:41 (email), 43:1134 (one-time code) and 47:1197 (password). */
@Component({
  selector: 'n2f-login-page',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    AuthMessageText,
    VerificationCodeField,
    PasswordField,
  ],
  template: `
    @if (session.restoring()) {
      <p class="notice" role="status">Đang kiểm tra phiên đăng nhập…</p>
    } @else if (!session.signedIn()) {
      <h1 #heading tabindex="-1">{{ headings[step()] }}</h1>
      @if (notice()) {
        <p class="notice" role="status">{{ notice() }}</p>
      }
      @switch (step()) {
        @case ('email') {
          <form [formGroup]="emailForm" (ngSubmit)="continueWithEmail()" novalidate>
            <div class="field">
              <input
                id="login-email"
                type="email"
                autocomplete="email"
                autocapitalize="off"
                spellcheck="false"
                aria-required="true"
                placeholder=" "
                formControlName="email"
                [attr.aria-invalid]="emailInvalid()"
                [attr.aria-describedby]="emailInvalid() ? 'login-email-error' : null"
              />
              <label for="login-email">Email<span class="req" aria-hidden="true">*</span></label>
            </div>
            @if (emailInvalid()) {
              <p class="field-error" id="login-email-error">Nhập địa chỉ email hợp lệ.</p>
            }
            <p class="legal">
              Bằng việc tiếp tục, tôi đồng ý với
              <a routerLink="/policies/privacy" target="_blank" rel="noopener"
                >Chính sách bảo mật<span class="sr-only"> (mở tab mới)</span></a
              >
              và
              <a routerLink="/policies/terms" target="_blank" rel="noopener"
                >Điều khoản sử dụng<span class="sr-only"> (mở tab mới)</span></a
              >
              của nine2fine.
            </p>
            @if (error(); as problem) {
              <p class="form-error" role="alert"><n2f-auth-message [message]="problem" /></p>
            }
            <div class="actions">
              <button class="pill" type="submit" [disabled]="busy()">
                {{ busy() ? 'Đang kiểm tra…' : 'Tiếp tục' }}
              </button>
            </div>
          </form>
        }
        @case ('code') {
          <ng-container [ngTemplateOutlet]="emailRow" />
          <form [formGroup]="codeForm" (ngSubmit)="loginWithCode()" novalidate>
            <n2f-verification-code-field
              #codeField
              fieldId="login-code"
              purpose="login"
              [email]="flow.email()"
              [control]="codeForm.controls.code"
            />
            @if (error(); as problem) {
              <p class="form-error" role="alert"><n2f-auth-message [message]="problem" /></p>
            }
            <div class="stack">
              <button class="pill wide" type="submit" [disabled]="busy()">
                {{ busy() ? 'Đang đăng nhập…' : 'Đăng nhập' }}
              </button>
              <span class="divider">hoặc</span>
              <button class="pill wide outline" type="button" (click)="goTo('password')">
                Sử dụng mật khẩu
              </button>
            </div>
          </form>
        }
        @case ('password') {
          <ng-container [ngTemplateOutlet]="emailRow" />
          <form [formGroup]="passwordForm" (ngSubmit)="loginWithPassword()" novalidate>
            <n2f-password-field
              fieldId="login-password"
              [control]="passwordForm.controls.password"
            />
            <p class="hint end">
              <a class="link" routerLink="/auth/forgot-password">Quên mật khẩu</a>
            </p>
            @if (error(); as problem) {
              <p class="form-error" role="alert"><n2f-auth-message [message]="problem" /></p>
            }
            <div class="stack">
              <button class="pill wide" type="submit" [disabled]="busy()">
                {{ busy() ? 'Đang đăng nhập…' : 'Đăng nhập' }}
              </button>
              <span class="divider">hoặc</span>
              <button class="pill wide outline" type="button" (click)="goTo('code')">
                Sử dụng mã xác thực
              </button>
            </div>
          </form>
        }
      }
    }
    <ng-template #emailRow>
      <p class="email-row">
        <strong>{{ flow.email() }}</strong
        ><button type="button" class="link" (click)="goTo('email')">Chỉnh sửa Email</button>
      </p>
    </ng-template>
  `,
  styleUrl: './ui/auth-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  readonly flow = inject(AuthFlowState);
  readonly session = inject(AuthSession);
  readonly headings = HEADINGS;
  readonly step = signal<LoginStep>('email');
  readonly busy = signal(false);
  readonly error = signal<AuthMessage | null>(null);
  readonly notice = signal('');

  private readonly api = inject(AUTH_API);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly codeField = viewChild<VerificationCodeField>('codeField');
  private readonly builder = inject(FormBuilder).nonNullable;

  readonly emailForm = this.builder.group({
    email: [this.flow.email(), [Validators.required, emailValidator]],
  });
  readonly codeForm = this.builder.group({
    code: ['', [Validators.required, Validators.pattern(CODE_PATTERN)]],
  });
  readonly passwordForm = this.builder.group({ password: ['', Validators.required] });

  constructor() {
    redirectWhenSignedIn();
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    // Coming back from register or reset has no query: keep the path chosen earlier in the flow.
    if (query.has('returnUrl')) this.flow.setReturnUrl(query.get('returnUrl'));
    const state = history.state as LoginNavigationState | null;
    if (state?.step && this.flow.email()) this.step.set(state.step);
    if (state?.notice) this.notice.set(state.notice);
  }

  emailInvalid(): boolean {
    const control = this.emailForm.controls.email;
    return control.invalid && control.touched;
  }

  goTo(step: LoginStep): void {
    this.error.set(null);
    this.notice.set('');
    if (step === 'email') this.emailForm.controls.email.setValue(this.flow.email());
    this.codeForm.reset();
    this.passwordForm.reset();
    this.step.set(step);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  continueWithEmail(): void {
    this.emailForm.markAllAsTouched();
    if (this.emailForm.invalid || this.busy()) return;
    const email = this.emailForm.controls.email.value.trim();
    this.run(this.api.lookupEmail(email), ({ registered }) => {
      this.flow.email.set(email);
      if (registered) this.goTo('code');
      else void this.router.navigateByUrl('/auth/register');
    });
  }

  loginWithCode(): void {
    this.codeForm.markAllAsTouched();
    if (this.codeForm.invalid || this.busy()) return;
    this.run(
      this.api.loginWithCode(this.flow.email(), this.codeForm.controls.code.value),
      (user) => this.complete(user),
      (error) => {
        const field = this.codeField();
        const belongsToCode =
          error instanceof AuthError &&
          (error.code === 'invalid-code' ||
            error.code === 'code-locked' ||
            (error.code === 'validation' && error.field === 'code'));
        if (!field || !belongsToCode) return this.error.set(authMessage(error));
        field.fail(authMessage(error));
        field.focus();
      },
    );
  }

  loginWithPassword(): void {
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid || this.busy()) return;
    this.run(
      this.api.loginWithPassword(this.flow.email(), this.passwordForm.controls.password.value),
      (user) => this.complete(user),
    );
  }

  private complete(user: AuthUser): void {
    this.flow.completing = true;
    this.session.signIn(user);
    void this.router.navigateByUrl(this.flow.destinationFor());
  }

  private run<T>(
    request: Observable<T>,
    onSuccess: (value: T) => void,
    onError: (error: unknown) => void = (error) => this.error.set(authMessage(error)),
  ): void {
    this.busy.set(true);
    this.error.set(null);
    request
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({ next: onSuccess, error: onError });
  }
}
