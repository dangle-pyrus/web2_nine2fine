import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AUTH_API } from './data-access/auth-api';
import { AuthFlowState, AuthSession } from './auth-session';
import { authErrorMessage, CODE_PATTERN } from './auth-messages';
import { VerificationCodeField } from './ui/verification-code-field';

interface BirthDateParts {
  day: string;
  month: string;
  year: string;
}

/** Returns an ISO date for complete, real past dates; null when every part is empty. */
function toBirthDate({ day, month, year }: BirthDateParts): string | null | undefined {
  if (!day && !month && !year) return null;
  const [d, m, y] = [Number(day), Number(month), Number(year)];
  const date = new Date(Date.UTC(y, m - 1, d));
  const real =
    Number.isInteger(d) &&
    Number.isInteger(m) &&
    y >= 1900 &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  return real && date.getTime() < Date.now() ? date.toISOString().slice(0, 10) : undefined;
}

function birthDateValidator(group: AbstractControl<BirthDateParts>): ValidationErrors | null {
  return toBirthDate(group.value) === undefined ? { birthDate: true } : null;
}

/** Figma frame 43:1058, reached when the login email has no account yet. */
@Component({
  selector: 'n2f-register-page',
  imports: [ReactiveFormsModule, RouterLink, VerificationCodeField],
  template: `
    @if (flow.email()) {
      <h1>Giờ hãy thực hiện một bước cuối để trở thành thành viên nine2fine.</h1>
      <p class="lead">Chúng tôi đã gửi mã số đến</p>
      <p class="email-row">
        <strong>{{ flow.email() }}</strong
        ><a class="link" routerLink="/auth/login">Chỉnh sửa Email</a>
      </p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <n2f-verification-code-field
          fieldId="register-code"
          purpose="register"
          [email]="flow.email()"
          [control]="form.controls.code"
          (dispatchFailed)="error.set($event)"
        />
        <div class="name-row">
          @for (field of nameFields; track field.key) {
            <div>
              <div class="field">
                <input
                  [id]="'register-' + field.key"
                  type="text"
                  [attr.autocomplete]="field.autocomplete"
                  aria-required="true"
                  placeholder=" "
                  [formControlName]="field.key"
                  [attr.aria-invalid]="invalid(field.key)"
                  [attr.aria-describedby]="
                    invalid(field.key) ? 'register-' + field.key + '-error' : null
                  "
                />
                <label [for]="'register-' + field.key"
                  >{{ field.label }}<span class="req" aria-hidden="true">*</span></label
                >
              </div>
              @if (invalid(field.key)) {
                <p class="field-error" [id]="'register-' + field.key + '-error'">
                  {{ field.error }}
                </p>
              }
            </div>
          }
        </div>
        <fieldset formGroupName="birthDate" aria-describedby="birth-date-hint">
          <legend>Ngày sinh</legend>
          <div class="date-row">
            @for (part of dateParts; track part.key) {
              <div class="field">
                <input
                  [id]="'birth-' + part.key"
                  type="text"
                  inputmode="numeric"
                  [attr.maxlength]="part.maxLength"
                  [attr.autocomplete]="part.autocomplete"
                  placeholder=" "
                  [formControlName]="part.key"
                  [attr.aria-invalid]="birthDateInvalid()"
                />
                <label [for]="'birth-' + part.key">{{ part.label }}</label>
              </div>
            }
          </div>
          @if (birthDateInvalid()) {
            <p class="field-error" role="alert">Ngày sinh chưa hợp lệ.</p>
          }
          <p class="hint" id="birth-date-hint">
            Nhận ưu đãi thành viên khi đến ngày sinh nhật của bạn
          </p>
        </fieldset>
        <label class="check">
          <input type="checkbox" formControlName="marketingOptIn" />
          <span
            >Đăng ký nhận email để nhận cập nhật từ nine2fine về sản phẩm, ưu đãi và các quyền lợi
            dành cho thành viên.</span
          >
        </label>
        <label class="check">
          <input
            type="checkbox"
            formControlName="acceptedTerms"
            [attr.aria-invalid]="invalid('acceptedTerms')"
            [attr.aria-describedby]="invalid('acceptedTerms') ? 'terms-error' : null"
          />
          <span
            >Tôi đồng ý với <a routerLink="/policies/privacy">Chính sách bảo mật</a> và
            <a routerLink="/policies/terms">Điều khoản sử dụng</a> của nine2fine.</span
          >
        </label>
        @if (invalid('acceptedTerms')) {
          <p class="field-error" id="terms-error">Bạn cần đồng ý để tạo tài khoản.</p>
        }
        @if (error()) {
          <p class="form-error" role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <button class="pill" type="submit" [disabled]="busy()">
            {{ busy() ? 'Đang tạo tài khoản…' : 'Tạo tài khoản' }}
          </button>
        </div>
      </form>
    }
  `,
  styleUrl: './ui/auth-form.scss',
  styles: `
    .name-row,
    .date-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 calc(16 * var(--u));
    }
    .date-row {
      grid-template-columns: 1fr 1fr 1.4fr;
    }
    fieldset {
      margin: calc(28 * var(--u)) 0 0;
      padding: 0;
      border: 0;
    }
    legend {
      padding: 0;
      font-size: max(15px, calc(22 * var(--u)));
    }
    .date-row .field {
      margin-top: calc(14 * var(--u));
    }
    .check {
      display: flex;
      align-items: flex-start;
      gap: calc(16 * var(--u));
      margin-top: calc(20 * var(--u));
      font-size: max(14px, calc(22 * var(--u)));
      line-height: 1.6;
      cursor: pointer;
    }
    .check input {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      margin: 0.25em 0 0;
      accent-color: var(--ink);
    }
    .check a {
      font-weight: 700;
      text-decoration: underline;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  readonly flow = inject(AuthFlowState);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly nameFields = [
    { key: 'firstName', label: 'Tên', autocomplete: 'given-name', error: 'Nhập tên của bạn.' },
    { key: 'lastName', label: 'Họ', autocomplete: 'family-name', error: 'Nhập họ của bạn.' },
  ] as const;
  readonly dateParts = [
    { key: 'day', label: 'Ngày', maxLength: 2, autocomplete: 'bday-day' },
    { key: 'month', label: 'Tháng', maxLength: 2, autocomplete: 'bday-month' },
    { key: 'year', label: 'Năm', maxLength: 4, autocomplete: 'bday-year' },
  ] as const;

  private readonly api = inject(AUTH_API);
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly builder = inject(FormBuilder).nonNullable;
  readonly form = this.builder.group({
    code: ['', [Validators.required, Validators.pattern(CODE_PATTERN)]],
    firstName: ['', [Validators.required, Validators.pattern(/\S/)]],
    lastName: ['', [Validators.required, Validators.pattern(/\S/)]],
    birthDate: this.builder.group(
      { day: [''], month: [''], year: [''] },
      { validators: birthDateValidator },
    ),
    marketingOptIn: [false],
    acceptedTerms: [false, Validators.requiredTrue],
  });

  constructor() {
    // The email comes from the first login step; without it the code cannot be sent.
    if (!this.flow.email()) void this.router.navigateByUrl('/auth/login');
  }

  invalid(key: 'firstName' | 'lastName' | 'acceptedTerms'): boolean {
    const control = this.form.controls[key];
    return control.invalid && control.touched;
  }

  birthDateInvalid(): boolean {
    const group = this.form.controls.birthDate;
    return group.invalid && Object.values(group.controls).every((control) => control.touched);
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.api
      .register({
        email: this.flow.email(),
        code: value.code,
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        birthDate: toBirthDate(value.birthDate) ?? null,
        marketingOptIn: value.marketingOptIn,
        acceptedTerms: true,
      })
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (user) => {
          this.session.signIn(user);
          void this.router.navigateByUrl(this.flow.returnUrl());
        },
        error: (error: unknown) => this.error.set(authErrorMessage(error)),
      });
  }
}
