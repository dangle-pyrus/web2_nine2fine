import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PasswordField } from '../../auth/ui/password-field';
import { matches, PASSWORD_RULES, PasswordRule, passwordPolicy } from '../../auth/auth-messages';
import { ACCOUNT_API } from '../data-access/account-api';
import { accountErrorMessage } from '../account-messages';

export interface PasswordDialogData {
  /** Passwordless members (registered by email code) create their first password. */
  mode: 'change' | 'create';
}

/** Figma frames 102:1011 (change) and 102:1159 (create). Closes with `true` on success. */
@Component({
  selector: 'n2f-password-dialog',
  imports: [ReactiveFormsModule, PasswordField, IconComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <button
        type="button"
        class="close"
        aria-label="Đóng"
        title="Đóng"
        (click)="dialog.close(false)"
      >
        <n2f-icon name="reiconX" />
      </button>
      <h2>{{ isChange ? 'Thay đổi mật khẩu' : 'Tạo mật khẩu' }}</h2>
      @if (isChange) {
        <n2f-password-field
          fieldId="current-password"
          label="Mật khẩu hiện tại"
          autocomplete="current-password"
          errorText="Nhập mật khẩu hiện tại."
          [control]="form.controls.currentPassword"
        />
      }
      <n2f-password-field
        fieldId="account-new-password"
        [label]="isChange ? 'Mật khẩu mới' : 'Mật khẩu'"
        autocomplete="new-password"
        [showRules]="true"
        [rules]="rules"
        [control]="newPassword"
      />
      <n2f-password-field
        fieldId="account-confirm-password"
        [label]="isChange ? 'Nhập lại mật khẩu mới' : 'Nhập lại mật khẩu'"
        autocomplete="new-password"
        errorText="Mật khẩu nhập lại chưa khớp."
        [control]="form.controls.confirmPassword"
      />
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button class="pill" type="submit" [disabled]="busy()">
          {{ busy() ? 'Đang lưu…' : isChange ? 'Đổi mật khẩu' : 'Tạo mật khẩu' }}
        </button>
      </div>
    </form>
  `,
  styleUrl: '../../auth/ui/auth-form.scss',
  styles: `
    :host {
      --u: 0.72px;
      position: relative;
    }
    form {
      padding: 36px 40px 32px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 600;
      text-align: center;
    }
    .close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 0;
      background: none;
      color: var(--ink);
    }
    .actions {
      margin-top: 32px;
    }
    @media (max-width: 480px) {
      form {
        padding: 32px 20px 24px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordDialog {
  readonly dialog = inject<DialogRef<boolean>>(DialogRef);
  readonly isChange = inject<PasswordDialogData>(DIALOG_DATA).mode === 'change';
  readonly busy = signal(false);
  readonly error = signal('');

  private readonly api = inject(ACCOUNT_API);
  private readonly destroyRef = inject(DestroyRef);
  private readonly builder = inject(FormBuilder).nonNullable;
  private readonly currentPassword = this.builder.control(
    '',
    this.isChange ? Validators.required : [],
  );
  readonly rules: readonly PasswordRule[] = this.isChange
    ? [
        ...PASSWORD_RULES,
        {
          id: 'different',
          label: 'Không trùng với mật khẩu hiện tại.',
          test: (value) => value.length > 0 && value !== this.currentPassword.value,
        },
      ]
    : PASSWORD_RULES;
  readonly newPassword = this.builder.control('', [
    Validators.required,
    passwordPolicy(this.rules),
  ]);
  readonly form = this.builder.group({
    currentPassword: this.currentPassword,
    newPassword: this.newPassword,
    confirmPassword: ['', [Validators.required, matches(() => this.newPassword.value)]],
  });

  constructor() {
    this.newPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
    this.currentPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.newPassword.updateValueAndValidity());
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .setPassword(this.isChange ? this.currentPassword.value : null, this.newPassword.value)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.dialog.close(true),
        error: (error: unknown) => this.error.set(accountErrorMessage(error)),
      });
  }
}
