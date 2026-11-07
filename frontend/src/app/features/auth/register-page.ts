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
import { AuthMessage, authMessage, CODE_PATTERN } from './auth-messages';
import {
  BirthDateParts,
  checkBirthDate,
  nameProblem,
  normalizeName,
  todayInVietnam,
} from './auth-validation';
import { AuthMessageText } from './ui/auth-message';
import { VerificationCodeField } from './ui/verification-code-field';

type NameKey = 'firstName' | 'lastName';
type FieldKey = NameKey | 'birthDate' | 'acceptedTerms';

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
const SERVER_FIELDS: readonly string[] = ['firstName', 'lastName', 'birthDate', 'acceptedTerms'];

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

/** Figma frame 43:1058, reached when the login email has no account yet. */
@Component({
  selector: 'n2f-register-page',
  imports: [ReactiveFormsModule, RouterLink, AuthMessageText, VerificationCodeField],
  template: `
    @if (flow.email()) {
      <h1 #heading tabindex="-1">
        Giờ hãy thực hiện một bước cuối để trở thành thành viên nine2fine.
      </h1>
      <p class="lead">Chúng tôi đã gửi mã xác thực đến</p>
      <p class="email-row">
        <strong>{{ flow.email() }}</strong
        ><a class="link" routerLink="/auth/login">Chỉnh sửa Email</a>
      </p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <n2f-verification-code-field
          #codeField
          fieldId="register-code"
          purpose="register"
          [email]="flow.email()"
          [control]="form.controls.code"
        />
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
  private readonly codeField = viewChild<VerificationCodeField>('codeField');
  private readonly builder = inject(FormBuilder).nonNullable;
  readonly form = this.builder.group({
    code: ['', [Validators.required, Validators.pattern(CODE_PATTERN)]],
    firstName: ['', [Validators.required, nameValidator]],
    lastName: ['', [Validators.required, nameValidator]],
    birthDate: this.builder.group(
      { day: [''], month: [''], year: [''] },
      { validators: birthDateValidator },
    ),
    marketingOptIn: [false],
    acceptedTerms: [false, Validators.requiredTrue],
  });

  constructor() {
    redirectWhenSignedIn();
    // The email comes from the first login step; without it the code cannot be sent.
    if (!this.flow.email()) void this.router.navigateByUrl('/auth/login');
    else afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    // A new value makes an earlier server verdict about a field obsolete.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.serverErrors.set({}));
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
        code: value.code,
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
            .navigateByUrl(this.flow.destinationFor(user.role))
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
    const code = this.codeField();
    const aboutCode =
      failure?.code === 'invalid-code' || failure?.code === 'code-locked' || field === 'code';
    if (code && aboutCode) {
      code.fail(message);
      code.focus();
    } else if (field && SERVER_FIELDS.includes(field)) {
      this.serverErrors.set({ [field]: message.text });
      this.focusField(field as FieldKey);
    } else {
      this.error.set(message);
    }
  }

  private focusFirstProblem(): void {
    if (this.form.controls.code.invalid) return this.codeField()?.focus();
    for (const key of ['firstName', 'lastName', 'birthDate', 'acceptedTerms'] as const) {
      if (this.fieldError(key)) return this.focusField(key);
    }
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
