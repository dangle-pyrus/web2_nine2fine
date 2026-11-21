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
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AUTH_API, AuthError } from './data-access/auth-api';
import { AuthFlowState, AuthSession, redirectWhenSignedIn } from './auth-session';
import { AuthMessage, authMessage, CODE_PATTERN, matches, passwordPolicy } from './auth-messages';
import {
  BirthDateParts,
  checkBirthDate,
  nameProblem,
  normalizeName,
  todayInVietnam,
} from './auth-validation';
import { AuthMessageText } from './ui/auth-message';
import { VerificationCodeField } from './ui/verification-code-field';
import { PasswordField } from './ui/password-field';

type NameKey = 'firstName' | 'lastName';
type FieldKey = NameKey | 'birthDate' | 'acceptedTerms' | 'password';
type RegisterStep = 'code' | 'details';

const NAME_MESSAGES: Record<NameKey, Record<string, string>> = {
  firstName: {
    required: 'Nhập tên của bạn.',
    chars: "Tên chỉ gồm chữ cái, dấu cách, dấu ' và dấu -.",
    max: 'Tên tối đa 50 ký tự.',
  },
  lastName: {
    required: 'Nhập họ của bạn.',
    chars: "Họ chỉ gồm chữ cái, dấu cách, dấu ' và dấu -.",
    max: 'Họ tối đa 50 ký tự.',
  },
};
const BIRTH_MESSAGES = {
  invalid: 'Ngày sinh chưa hợp lệ.',
  underage: 'Bạn cần đủ 13 tuổi để tạo tài khoản.',
};
const TERMS_MESSAGE = 'Bạn cần đồng ý để tạo tài khoản.';
const SERVER_FIELDS: readonly string[] = [
  'firstName',
  'lastName',
  'birthDate',
  'acceptedTerms',
  'password',
];

function nameValidator(control: AbstractControl<string>): ValidationErrors | null {
  const problem = nameProblem(control.value);
  return problem ? { name: problem } : null;
}

function birthDateValidator(group: AbstractControl<BirthDateParts>): ValidationErrors | null {
  const result = checkBirthDate(group.value, todayInVietnam());
  return result.kind === 'invalid' || result.kind === 'underage'
    ? { birthDate: result.kind }
    : null;
}

/**
 * Figma frame 43:1058, reached when the login email has no account yet. Two separate steps:
 * 1) verify the email code, 2) enter the profile + password and accept the policies.
 */
@Component({
  selector: 'n2f-register-page',
  imports: [ReactiveFormsModule, RouterLink, AuthMessageText, VerificationCodeField, PasswordField],
  template: `
    @if (flow.email() && step() === 'code') {
      <h1 #heading tabindex="-1">Xác thực email để bắt đầu tạo tài khoản nine2fine.</h1>
      <p class="lead">Chúng tôi đã gửi mã xác thực đến</p>
      <p class="email-row">
        <strong>{{ flow.email() }}</strong
        ><a class="link" routerLink="/auth/login">Chỉnh sửa Email</a>
      </p>
      <form [formGroup]="codeForm" (ngSubmit)="verifyCode()" novalidate>
        <n2f-verification-code-field
          #codeField
          fieldId="register-code"
          purpose="register"
          [email]="flow.email()"
          [control]="codeForm.controls.code"
        />
        @if (error(); as problem) {
          <p class="form-error" role="alert"><n2f-auth-message [message]="problem" /></p>
        }
        <div class="actions">
          <button class="pill" type="submit" [disabled]="busy() || codeField?.locked()">
            {{ busy() ? 'Đang xác thực…' : 'Tiếp tục' }}
          </button>
        </div>
      </form>
    } @else if (flow.email() && step() === 'details') {
      <h1 #heading tabindex="-1">
        Giờ hãy thực hiện một bước cuối để trở thành thành viên nine2fine.
      </h1>
      <p class="lead">Email đã được xác thực</p>
      <p class="email-row">
        <strong>{{ flow.email() }}</strong
        ><a class="link" routerLink="/auth/login">Chỉnh sửa Email</a>
      </p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="name-row">
          @for (field of nameFields; track field.key) {
            <div>
              <div class="field">
                <input
                  [id]="'register-' + field.key"
                  type="text"
                  [attr.autocomplete]="field.autocomplete"
                  autocapitalize="words"
                  aria-required="true"
                  placeholder=" "
                  [formControlName]="field.key"
                  [attr.aria-invalid]="!!fieldError(field.key)"
                  [attr.aria-describedby]="
                    fieldError(field.key) ? 'register-' + field.key + '-error' : null
                  "
                />
                <label [for]="'register-' + field.key"
                  >{{ field.label }}<span class="req" aria-hidden="true">*</span></label
                >
              </div>
              @if (fieldError(field.key); as message) {
                <p class="field-error" [id]="'register-' + field.key + '-error'">{{ message }}</p>
              }
            </div>
          }
        </div>
        <fieldset formGroupName="birthDate" aria-describedby="birth-date-hint">
          <legend>Ngày sinh <span class="optional">(không bắt buộc)</span></legend>
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
                  [attr.aria-invalid]="!!fieldError('birthDate')"
                  [attr.aria-describedby]="
                    fieldError('birthDate') ? 'birth-date-error' : 'birth-date-hint'
                  "
                />
                <label [for]="'birth-' + part.key">{{ part.label }}</label>
              </div>
            }
          </div>
          @if (fieldError('birthDate'); as message) {
            <p class="field-error" id="birth-date-error" role="alert">{{ message }}</p>
          }
          <p class="hint" id="birth-date-hint">
            Nhận ưu đãi thành viên khi đến ngày sinh nhật của bạn
          </p>
        </fieldset>
        <n2f-password-field
          fieldId="register-password"
          label="Mật khẩu"
          autocomplete="new-password"
          [showRules]="true"
          [email]="flow.email()"
          [serverError]="serverErrors().password ?? null"
          [control]="form.controls.password"
        />
        <n2f-password-field
          fieldId="register-confirm-password"
          label="Nhập lại mật khẩu"
          autocomplete="new-password"
          errorText="Mật khẩu nhập lại chưa khớp."
          [control]="form.controls.confirmPassword"
        />
        <label class="check">
          <input type="checkbox" formControlName="marketingOptIn" />
          <span
            >Đăng ký nhận email để nhận cập nhật từ nine2fine về sản phẩm, ưu đãi và các quyền lợi
            dành cho thành viên.</span
          >
        </label>
        <label class="check">
          <input
            id="register-terms"
            type="checkbox"
            formControlName="acceptedTerms"
            [attr.aria-invalid]="!!fieldError('acceptedTerms')"
            [attr.aria-describedby]="fieldError('acceptedTerms') ? 'terms-error' : null"
          />
          <span
            >Tôi đồng ý với
            <a routerLink="/policies/privacy" target="_blank" rel="noopener"
              >Chính sách bảo mật<span class="sr-only"> (mở tab mới)</span></a
            >
            và
            <a routerLink="/policies/terms" target="_blank" rel="noopener"
              >Điều khoản sử dụng<span class="sr-only"> (mở tab mới)</span></a
            >
            của nine2fine.</span
          >
        </label>
        @if (fieldError('acceptedTerms'); as message) {
          <p class="field-error" id="terms-error">{{ message }}</p>
        }
        @if (error(); as problem) {
          <p class="form-error" role="alert"><n2f-auth-message [message]="problem" /></p>
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
    .optional {
      font-size: 0.8em;
      opacity: 0.7;
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
  readonly step = signal<RegisterStep>('code');
  /** One-time ticket from step 1; step 2 sends it instead of the code. */
  private registrationToken = '';
  readonly busy = signal(false);
  readonly error = signal<AuthMessage | null>(null);
  /** Verdicts the server gave for a field after the client check passed. */
  readonly serverErrors = signal<Partial<Record<FieldKey, string>>>({});
  readonly nameFields = [
    { key: 'firstName', label: 'Tên', autocomplete: 'given-name' },
    { key: 'lastName', label: 'Họ', autocomplete: 'family-name' },
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
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  protected readonly codeField = viewChild<VerificationCodeField>('codeField');
  private readonly builder = inject(FormBuilder).nonNullable;
  readonly codeForm = this.builder.group({
    code: ['', [Validators.required, Validators.pattern(CODE_PATTERN)]],
  });
  private readonly password = this.builder.control('', [
    Validators.required,
    passwordPolicy(() => this.flow.email()),
  ]);
  readonly form = this.builder.group({
    firstName: ['', [Validators.required, nameValidator]],
    lastName: ['', [Validators.required, nameValidator]],
    birthDate: this.builder.group(
      { day: [''], month: [''], year: [''] },
      { validators: birthDateValidator },
    ),
    marketingOptIn: [false],
    password: this.password,
    confirmPassword: ['', [Validators.required, matches(() => this.password.value)]],
    acceptedTerms: [false, Validators.requiredTrue],
  });

  constructor() {
    redirectWhenSignedIn();
    // The email comes from the first login step; without it the code cannot be sent.
    if (!this.flow.email()) void this.router.navigateByUrl('/auth/login');
    else afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    // A new value makes an earlier server verdict about a field obsolete.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.serverErrors.set({}));
    this.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  /** Step 1: check the code; on success move on to the profile step. */
  verifyCode(): void {
    this.codeForm.markAllAsTouched();
    if (this.busy()) return;
    if (this.codeForm.invalid) return this.codeField()?.focus();
    this.busy.set(true);
    this.error.set(null);
    this.api
      .verifyRegistration(this.flow.email(), this.codeForm.controls.code.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ registrationToken }) => {
          this.busy.set(false);
          this.registrationToken = registrationToken;
          this.goTo('details');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.showCodeFailure(error);
        },
      });
  }

  private goTo(step: RegisterStep): void {
    this.step.set(step);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  private showCodeFailure(error: unknown): void {
    const message = authMessage(error);
    const failure = error instanceof AuthError ? error : null;
    const code = this.codeField();
    const aboutCode =
      failure?.code === 'invalid-code' ||
      failure?.code === 'code-locked' ||
      failure?.field === 'code';
    if (code && aboutCode) {
      code.fail(message, error);
      code.focus();
    } else {
      this.error.set(message);
    }
  }

  /** Message under a field: the client check first, then what the server said about it. */
  fieldError(key: FieldKey): string | null {
    const server = this.serverErrors()[key] ?? null;
    switch (key) {
      case 'firstName':
      case 'lastName': {
        const control = this.form.controls[key];
        const problem = control.touched ? nameProblem(control.value) : null;
        return (problem && NAME_MESSAGES[key][problem]) || server;
      }
      case 'birthDate': {
        const group = this.form.controls.birthDate;
        const shown = Object.values(group.controls).every((control) => control.touched);
        const kind = shown ? (group.errors?.['birthDate'] as 'invalid' | 'underage' | null) : null;
        return (kind && BIRTH_MESSAGES[kind]) || server;
      }
      case 'acceptedTerms': {
        const control = this.form.controls.acceptedTerms;
        return control.invalid && control.touched ? TERMS_MESSAGE : server;
      }
      case 'password':
        return server;
    }
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.busy()) return;
    if (this.form.invalid) return this.focusFirstProblem();
    const value = this.form.getRawValue();
    const birth = checkBirthDate(value.birthDate, todayInVietnam());
    this.busy.set(true);
    this.error.set(null);
    this.api
      .register({
        email: this.flow.email(),
        registrationToken: this.registrationToken,
        password: value.password,
        firstName: normalizeName(value.firstName),
        lastName: normalizeName(value.lastName),
        birthDate: birth.kind === 'ok' ? birth.iso : null,
        marketingOptIn: value.marketingOptIn,
        acceptedTerms: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          // The button stays disabled until the target page is open, so a second click cannot
          // send the code again (AC-AUTH-96).
          this.flow.completing = true;
          this.session.signIn(user);
          void this.router
            .navigateByUrl(this.flow.destinationFor())
            .finally(() => this.busy.set(false));
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.showFailure(error);
        },
      });
  }

  private showFailure(error: unknown): void {
    const message = authMessage(error);
    const failure = error instanceof AuthError ? error : null;
    const field = failure?.field;
    if (field === 'registrationToken' || field === 'code' || failure?.code === 'invalid-code') {
      // The ticket expired (30 minutes) or was used: verify the email again with a new code.
      this.registrationToken = '';
      this.codeForm.reset();
      this.goTo('code');
      this.error.set(message);
    } else if (field && SERVER_FIELDS.includes(field)) {
      this.serverErrors.set({ [field]: message.text });
      this.focusField(field as FieldKey);
    } else {
      this.error.set(message);
    }
  }

  private focusFirstProblem(): void {
    for (const key of ['firstName', 'lastName', 'birthDate'] as const) {
      if (this.fieldError(key)) return this.focusField(key);
    }
    if (this.form.controls.password.invalid) return this.focusField('password');
    if (this.form.controls.confirmPassword.invalid) {
      this.host.nativeElement.querySelector<HTMLElement>('#register-confirm-password')?.focus();
      return;
    }
    if (this.fieldError('acceptedTerms')) this.focusField('acceptedTerms');
  }

  private focusField(key: FieldKey): void {
    const id =
      key === 'birthDate'
        ? 'birth-day'
        : key === 'acceptedTerms'
          ? 'register-terms'
          : `register-${key}`;
    this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus();
  }
}
