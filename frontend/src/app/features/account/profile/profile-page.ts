import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon.component';
import { OverlayService } from '../../../shared/ui/overlay.service';
import { PricePipe } from '../../../shared/commerce/price.pipe';
import { ACCOUNT_API } from '../data-access/account-api';
import {
  AccountProfile,
  Membership,
  ProfileUpdate,
  TIER_LABEL,
} from '../data-access/account-models';
import { accountErrorMessage } from '../account-messages';
import { formatDate } from '../../orders/order-status';
import { PasswordDialog, PasswordDialogData } from './password-dialog';

type EditableField = 'birthDate' | 'phone';
const PHONE_PATTERN = /^(?:0|\+84)\d{9}$/;

/** Figma frame `profile-setting` (64:445) with membership block and password dialogs. */
@Component({
  selector: 'n2f-profile-page',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, PricePipe],
  template: `
    <h1>Hồ sơ tài khoản</h1>
    @if (loadError()) {
      <p class="form-error" role="alert">{{ loadError() }}</p>
    } @else if (!profile()) {
      <p class="state" role="status">Đang tải hồ sơ…</p>
    } @else {
      @let user = profile()!;
      <div class="fields">
        <div class="box">
          <span class="legend">Email<span class="req" aria-hidden="true">*</span></span>
          <span class="value">{{ user.email }}</span>
        </div>
        <div class="box">
          <span class="legend">Mật khẩu<span class="req" aria-hidden="true">*</span></span>
          <span class="value">{{ user.hasPassword ? '••••••••••••' : 'Chưa tạo mật khẩu' }}</span>
          <button type="button" class="edit" (click)="openPasswordDialog(user)">
            @if (user.hasPassword) {
              Chỉnh sửa<span class="sr-only"> mật khẩu</span>
            } @else {
              Tạo mật khẩu
            }
          </button>
        </div>
        @for (field of editableFields; track field.key) {
          @if (editing() === field.key) {
            <form
              class="box editing"
              (submit)="$event.preventDefault(); save(field.key)"
              novalidate
            >
              <label class="legend" [for]="'profile-' + field.key">{{ field.label }}</label>
              <input
                class="value"
                [id]="'profile-' + field.key"
                [type]="field.type"
                [attr.autocomplete]="field.autocomplete"
                [attr.inputmode]="field.key === 'phone' ? 'tel' : null"
                [attr.max]="field.key === 'birthDate' ? today : null"
                min="1900-01-01"
                [formControl]="controls[field.key]"
                [attr.aria-invalid]="controls[field.key].invalid && controls[field.key].touched"
                [attr.aria-describedby]="'profile-' + field.key + '-error'"
              />
              <span class="edit-actions">
                <button type="button" class="edit muted" (click)="cancelEdit()">Hủy</button>
                <button type="submit" class="edit" [disabled]="saving()">
                  {{ saving() ? 'Đang lưu…' : 'Lưu' }}
                </button>
              </span>
            </form>
            <p class="field-error" [id]="'profile-' + field.key + '-error'" aria-live="polite">
              @if (controls[field.key].invalid && controls[field.key].touched) {
                {{ field.error }}
              }
            </p>
          } @else {
            <div class="box">
              <span class="legend">{{ field.label }}</span>
              <span class="value">{{ display(user, field.key) }}</span>
              <button type="button" class="edit" (click)="startEdit(field.key, user)">
                Chỉnh sửa<span class="sr-only"> {{ field.label.toLowerCase() }}</span>
              </button>
            </div>
          }
        }
      </div>
      @if (notice()) {
        <p class="notice" role="status">{{ notice() }}</p>
      }
      @if (saveError()) {
        <p class="form-error" role="alert">{{ saveError() }}</p>
      }
    }

    @if (membership(); as member) {
      <h2 class="section-title membership-title">Hạng thành viên</h2>
      <div class="membership">
        <img
          class="member-card"
          [src]="'/assets/membership/card-' + member.tier + '.webp'"
          [alt]="'Thẻ thành viên ' + tierLabel()"
          width="430"
          height="251"
        />
        <div class="spend">
          <p class="spend-label">Chi tiêu hiện tại</p>
          <p class="spend-value">
            <strong>{{ member.spent | vnd }}</strong>
            @if (member.nextTierAt) {
              <span> / {{ member.nextTierAt | vnd }}</span>
            }
          </p>
          @if (member.nextTierAt) {
            <div
              class="bar"
              role="progressbar"
              aria-label="Tiến độ lên hạng tiếp theo"
              aria-valuemin="0"
              [attr.aria-valuemax]="member.nextTierAt"
              [attr.aria-valuenow]="member.spent"
              [attr.aria-valuetext]="progress() + '%'"
            >
              <span [style.width.%]="progress()"></span>
            </div>
          }
          <p class="review">Thứ hạng cập nhật sau {{ reviewDate() }}.</p>
          <a class="pill compact" routerLink="/account/vouchers"
            >Xem ưu đãi <n2f-icon name="reiconArrowRight" size="16px"
          /></a>
        </div>
      </div>
    }
  `,
  styleUrl: '../ui/account.scss',
  styles: `
    h1 {
      margin-bottom: calc(32 * var(--u));
    }
    .fields {
      display: flex;
      flex-direction: column;
      gap: calc(22 * var(--u) + 6px);
      max-width: 715px;
    }
    .box {
      position: relative;
      min-height: max(56px, calc(86 * var(--u)));
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px calc(24 * var(--u) + 4px);
      border: 1px solid var(--ink);
      border-radius: var(--radius-card);
    }
    .legend {
      position: absolute;
      top: 0;
      left: calc(14 * var(--u) + 2px);
      padding: 0 6px;
      background: #fff;
      color: var(--muted);
      font-size: max(11px, calc(16 * var(--u)));
      font-weight: 500;
      transform: translateY(-50%);
    }
    .value {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
      font-size: max(15px, calc(24 * var(--u)));
      font-weight: 500;
    }
    input.value {
      padding: 6px 0;
      border: 0;
      outline: none;
      background: none;
      color: var(--ink);
      font: inherit;
      font-size: max(16px, calc(24 * var(--u)));
    }
    .editing:focus-within {
      box-shadow: 0 0 0 1px var(--ink);
    }
    .editing:has([aria-invalid='true']) {
      border-color: var(--required);
    }
    .edit {
      min-height: 44px;
      padding: 0 4px;
      border: 0;
      background: none;
      color: var(--ink);
      font: inherit;
      font-size: max(14px, calc(22 * var(--u)));
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 4px;
    }
    .edit.muted {
      color: var(--muted);
      font-weight: 500;
    }
    .edit-actions {
      display: flex;
      gap: 12px;
    }
    .field-error {
      min-height: 0;
      margin: -14px 0 0 4px;
      color: var(--required);
      font-size: 13px;
    }
    .field-error:empty {
      display: none;
    }
    .notice {
      max-width: 715px;
      margin: 16px 0 0;
      padding: 12px 16px;
      border-radius: var(--radius-button);
      background: var(--surface);
      font-size: 14px;
    }
    .membership-title {
      margin-top: calc(64 * var(--u) + 8px);
      margin-bottom: calc(24 * var(--u));
    }
    .membership {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: calc(54 * var(--u)) calc(54 * var(--u) + 8px);
    }
    .member-card {
      width: min(100%, calc(430 * var(--u) + 40px));
      height: auto;
      border-radius: 18px;
      box-shadow: 0 6px 18px #0002;
    }
    .spend {
      flex: 1;
      min-width: 260px;
      max-width: 460px;
      padding-top: 4px;
    }
    .spend-label,
    .review {
      margin: 0;
      font-size: max(14px, calc(24 * var(--u)));
    }
    .spend-value {
      margin: 8px 0 12px;
      color: var(--muted);
      font-size: max(14px, calc(24 * var(--u)));
    }
    .spend-value strong {
      color: var(--ink);
      font-size: max(24px, calc(44 * var(--u)));
      font-weight: 700;
    }
    .bar {
      height: 14px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--line);
    }
    .bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--brand);
    }
    .review {
      margin: 16px 0 calc(40 * var(--u) + 8px);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  private readonly api = inject(ACCOUNT_API);
  private readonly overlay = inject(OverlayService);
  private readonly destroyRef = inject(DestroyRef);

  readonly profile = signal<AccountProfile | null>(null);
  readonly membership = signal<Membership | null>(null);
  readonly loadError = signal('');
  readonly editing = signal<EditableField | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly notice = signal('');
  readonly today = new Date().toISOString().slice(0, 10);

  readonly tierLabel = computed(() => {
    const member = this.membership();
    return member ? TIER_LABEL[member.tier] : '';
  });
  readonly progress = computed(() => {
    const member = this.membership();
    if (!member?.nextTierAt) return 100;
    return Math.min(100, Math.round((member.spent / member.nextTierAt) * 100));
  });
  readonly reviewDate = computed(() => {
    const member = this.membership();
    return member ? formatDate(member.reviewDate) : '';
  });

  readonly controls: Record<EditableField, FormControl<string>> = {
    birthDate: new FormControl('', { nonNullable: true, validators: Validators.required }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(PHONE_PATTERN)],
    }),
  };
  readonly editableFields = [
    {
      key: 'birthDate',
      label: 'Sinh nhật',
      type: 'date',
      autocomplete: 'bday',
      error: 'Chọn ngày sinh hợp lệ.',
    },
    {
      key: 'phone',
      label: 'Số điện thoại',
      type: 'tel',
      autocomplete: 'tel',
      error: 'Nhập số điện thoại hợp lệ (0 hoặc +84).',
    },
  ] as const;

  constructor() {
    forkJoin({ profile: this.api.getProfile(), membership: this.api.getMembership() })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: ({ profile, membership }) => {
          this.profile.set(profile);
          this.membership.set(membership);
        },
        error: (error: unknown) => this.loadError.set(accountErrorMessage(error)),
      });
  }

  display(user: AccountProfile, key: EditableField): string {
    if (key === 'birthDate') return user.birthDate ? formatDate(user.birthDate) : 'Chưa cập nhật';
    return user.phone ?? 'Chưa cập nhật';
  }

  startEdit(key: EditableField, user: AccountProfile): void {
    this.controls[key].reset(user[key] ?? '');
    this.saveError.set('');
    this.notice.set('');
    this.editing.set(key);
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  save(key: EditableField): void {
    const control = this.controls[key];
    control.markAsTouched();
    const value = control.value.trim();
    const invalidDate = key === 'birthDate' && (value > this.today || value < '1900-01-01');
    if (control.invalid || invalidDate) {
      if (invalidDate) control.setErrors({ range: true });
      return;
    }
    if (this.saving()) return;
    const update: ProfileUpdate = { [key]: value };
    this.saving.set(true);
    this.api
      .updateProfile(update)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (profile) => {
          this.profile.set(profile);
          this.editing.set(null);
          this.notice.set('Đã lưu thay đổi.');
        },
        error: (error: unknown) => this.saveError.set(accountErrorMessage(error)),
      });
  }

  openPasswordDialog(user: AccountProfile): void {
    const mode: PasswordDialogData['mode'] = user.hasPassword ? 'change' : 'create';
    const label = mode === 'change' ? 'Thay đổi mật khẩu' : 'Tạo mật khẩu';
    this.overlay
      .open(PasswordDialog, label, 'modal', { mode } satisfies PasswordDialogData)
      .closed.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved !== true) return;
        this.profile.update((current) => current && { ...current, hasPassword: true });
        this.notice.set(mode === 'change' ? 'Đã đổi mật khẩu.' : 'Đã tạo mật khẩu.');
      });
  }
}
