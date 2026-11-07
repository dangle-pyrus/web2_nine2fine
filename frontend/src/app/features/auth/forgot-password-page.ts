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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { finalize, map } from 'rxjs';
import { AUTH_API, AuthError } from './data-access/auth-api';
import { AuthFlowState, redirectWhenSignedIn } from './auth-session';
import { AuthMessage, authMessage, CODE_PATTERN, matches, passwordPolicy } from './auth-messages';
import { AuthMessageText } from './ui/auth-message';
import { VerificationCodeField } from './ui/verification-code-field';
import { PasswordField } from './ui/password-field';

/** Figma frame 50:53. The submit button stays disabled until the form is valid, as designed. */
@Component({
  selector: 'n2f-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthMessageText, VerificationCodeField, PasswordField],
  template: `
    @if (flow.email()) {
      <h1 #heading tabindex="-1">Xác nhận email và cập nhật mật khẩu mới cho tài khoản của bạn.</h1>
      <p class="lead">Chúng tôi đã gửi mã xác thực đến</p>
      <p class="email-row">
        <strong>{{ flow.email() }}</strong
        ><a class="link" routerLink="/auth/login">Chỉnh sửa Email</a>
      </p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <n2f-verification-code-field
          #codeField
          fieldId="reset-code"
          purpose="reset-password"
          [email]="flow.email()"
          [control]="form.controls.code"
        />
        <n2f-password-field
          fieldId="new-password"
          label="Mật khẩu mới"
          autocomplete="new-password"
          [showRules]="true"
          [email]="flow.email()"
          [serverError]="passwordError()"
          [control]="form.controls.newPassword"
        />
        <n2f-password-field
          fieldId="confirm-password"
          label="Nhập lại mật khẩu mới"
          autocomplete="new-password"
          errorText="Mật khẩu nhập lại chưa khớp."
          [control]="form.controls.confirmPassword"
        />
        @if (error(); as problem) {
          <p class="form-error" role="alert"><n2f-auth-message [message]="problem" /></p>
        }
        <div class="actions">
          <a class="pill outline" routerLink="/auth/login">Hủy bỏ</a>
          <button class="pill" type="submit" [disabled]="!formValid() || busy()">
            {{ busy() ? 'Đang cập nhật…' : 'Đổi mật khẩu' }}
          </button>
        </div>
      </form>
    }
  `,
  styleUrl: './ui/auth-form.scss',
  styles: `
    .actions {
      margin-top: calc(64 * var(--u));
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {
  readonly flow = inject(AuthFlowState);
  readonly busy = signal(false);
  readonly error = signal<AuthMessage | null>(null);
  /** The server refused the new password although the client rules passed. */
  readonly passwordError = signal<string | null>(null);

  private readonly api = inject(AUTH_API);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly codeField = viewChild<VerificationCodeField>('codeField');
  private readonly builder = inject(FormBuilder).nonNullable;
  private readonly newPassword = this.builder.control('', [
    Validators.required,
    passwordPolicy(() => this.flow.email()),
  ]);
  readonly form = this.builder.group({
    code: ['', [Validators.required, Validators.pattern(CODE_PATTERN)]],
    newPassword: this.newPassword,
    confirmPassword: ['', [Validators.required, matches(() => this.newPassword.value)]],
  });
  readonly formValid = toSignal(this.form.statusChanges.pipe(map((status) => status === 'VALID')), {
    initialValue: false,
  });

  constructor() {
    redirectWhenSignedIn();
    if (!this.flow.email()) void this.router.navigateByUrl('/auth/login');
    else afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    this.form.controls.newPassword.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.passwordError.set(null);
      this.form.controls.confirmPassword.updateValueAndValidity();
    });
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const { code, newPassword } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.api
      .resetPassword({ email: this.flow.email(), code, newPassword })
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () =>
          void this.router.navigateByUrl('/auth/login', {
            state: {
              step: 'password',
              notice: 'Đã cập nhật mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.',
            },
          }),
        error: (error: unknown) => this.showFailure(error),
      });
  }

  private showFailure(error: unknown): void {
    const message = authMessage(error);
    const failure = error instanceof AuthError ? error : null;
    const code = this.codeField();
    if (failure?.code === 'validation' && failure.field === 'newPassword') {
      this.passwordError.set(message.text);
    } else if (
      code &&
      (failure?.code === 'invalid-code' ||
        failure?.code === 'code-locked' ||
        (failure?.code === 'validation' && failure.field === 'code'))
    ) {
      code.fail(message);
      code.focus();
    } else {
      this.error.set(message);
    }
  }
}
