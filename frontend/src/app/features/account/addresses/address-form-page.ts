import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, finalize, map, of, switchMap, tap } from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon.component';
import { ACCOUNT_API } from '../data-access/account-api';
import { AddressInput, Location } from '../data-access/account-models';
import { accountErrorMessage } from '../account-messages';

const PHONE_PATTERN = /^(?:0|\+84)\d{9}$/;

/** Figma `address-setting (2)` (116:1701); reused for editing an existing address. */
@Component({
  selector: 'n2f-address-form-page',
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  template: `
    <a class="back" routerLink="/account/addresses"
      ><n2f-icon name="reiconArrowLeft" size="16px" /> Địa chỉ nhận hàng</a
    >
    <h1>{{ editId ? 'Sửa địa chỉ nhận hàng' : 'Thêm địa chỉ nhận hàng' }}</h1>
    @if (loading()) {
      <p class="state" role="status">Đang tải…</p>
    } @else {
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h2>Địa chỉ</h2>
        <div class="row">
          <div class="field">
            <label for="province"
              >Tỉnh/Thành phố:<span class="req" aria-hidden="true">*</span></label
            >
            <span class="select">
              <select
                id="province"
                formControlName="provinceCode"
                autocomplete="address-level1"
                aria-required="true"
                [attr.aria-invalid]="invalid('provinceCode')"
              >
                <option value="" disabled>Chọn Tỉnh/Thành phố</option>
                @for (province of provinces(); track province.code) {
                  <option [value]="province.code">{{ province.name }}</option>
                }
              </select>
              <n2f-icon name="reiconChevronDown" size="20px" />
            </span>
            @if (invalid('provinceCode')) {
              <p class="field-error">Chọn Tỉnh/Thành phố.</p>
            }
          </div>
          <div class="field">
            <label for="ward">Phường/Xã:<span class="req" aria-hidden="true">*</span></label>
            <span class="select">
              <select
                id="ward"
                formControlName="wardCode"
                autocomplete="address-level2"
                aria-required="true"
                [attr.aria-invalid]="invalid('wardCode')"
              >
                <option value="" disabled>
                  {{
                    form.controls.provinceCode.value ? 'Chọn Phường/Xã' : 'Chọn Tỉnh/Thành trước'
                  }}
                </option>
                @for (ward of wards(); track ward.code) {
                  <option [value]="ward.code">{{ ward.name }}</option>
                }
              </select>
              <n2f-icon name="reiconChevronDown" size="20px" />
            </span>
            @if (invalid('wardCode')) {
              <p class="field-error">Chọn Phường/Xã.</p>
            }
          </div>
        </div>
        <div class="field">
          <label for="street"
            >Tên đường, Tòa nhà, Số nhà:<span class="req" aria-hidden="true">*</span></label
          >
          <input
            id="street"
            formControlName="street"
            autocomplete="address-line1"
            aria-required="true"
            aria-describedby="street-note"
            [attr.aria-invalid]="invalid('street')"
          />
          <p class="note" id="street-note">Lưu ý: Vui lòng nhập địa chỉ sau sáp nhập</p>
          @if (invalid('street')) {
            <p class="field-error">Nhập địa chỉ cụ thể (ít nhất 5 ký tự).</p>
          }
        </div>
        <h2>Thông tin liên hệ</h2>
        @for (field of contactFields; track field.key) {
          <div class="field">
            <label [for]="field.key"
              >{{ field.label }}<span class="req" aria-hidden="true">*</span></label
            >
            <input
              [id]="field.key"
              [type]="field.type"
              [attr.autocomplete]="field.autocomplete"
              [formControlName]="field.key"
              aria-required="true"
              [attr.aria-invalid]="invalid(field.key)"
            />
            @if (invalid(field.key)) {
              <p class="field-error">{{ field.error }}</p>
            }
          </div>
        }
        <label class="switch">
          <input
            type="checkbox"
            role="switch"
            formControlName="isDefault"
            [attr.aria-describedby]="lockedDefault() ? 'default-hint' : null"
          />
          <span class="track" aria-hidden="true"></span>
          Đặt làm địa chỉ mặc định
        </label>
        @if (lockedDefault()) {
          <p class="note" id="default-hint">
            Đây là địa chỉ mặc định. Chọn địa chỉ khác làm mặc định để thay đổi.
          </p>
        }
        <label class="switch">
          <input type="checkbox" role="switch" formControlName="isReturn" />
          <span class="track" aria-hidden="true"></span>
          Đặt làm địa chỉ trả hàng
        </label>
        @if (error()) {
          <p class="form-error" role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <a class="pill outline" routerLink="/account/addresses">Hủy</a>
          <button class="pill" type="submit" [disabled]="saving()">
            {{ saving() ? 'Đang lưu…' : editId ? 'Lưu địa chỉ' : 'Thêm địa chỉ' }}
          </button>
        </div>
      </form>
    }
  `,
  styleUrl: '../ui/account.scss',
  styles: `
    form {
      max-width: 760px;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 12px;
      color: var(--muted);
      font-size: 14px;
    }
    h2 {
      margin: calc(32 * var(--u)) 0 calc(16 * var(--u));
      font-size: max(18px, calc(30 * var(--u)));
      font-weight: 700;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 calc(100 * var(--u) + 8px);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: calc(18 * var(--u) + 6px);
    }
    label {
      font-size: max(14px, calc(22 * var(--u)));
    }
    input:not([type='checkbox']),
    select {
      width: 100%;
      height: max(48px, calc(86 * var(--u)));
      padding: 0 16px;
      border: 1px solid #898989;
      border-radius: var(--radius-card);
      background: #fff;
      color: var(--ink);
      font: inherit;
      font-size: 16px;
    }
    input:focus,
    select:focus {
      border-color: var(--ink);
      outline: none;
      box-shadow: 0 0 0 1px var(--ink);
    }
    [aria-invalid='true'] {
      border-color: var(--required) !important;
    }
    .select {
      position: relative;
      display: block;
    }
    select {
      padding-right: 44px;
      appearance: none;
    }
    .select n2f-icon {
      position: absolute;
      top: 50%;
      right: 16px;
      pointer-events: none;
      transform: translateY(-50%);
    }
    .note {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      font-style: italic;
      text-decoration: underline;
    }
    .field-error {
      margin: 0;
      color: var(--required);
      font-size: 13px;
    }
    .switch {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 44px;
      cursor: pointer;
    }
    .switch input {
      position: absolute;
      top: calc(50% - 11px);
      left: 0;
      z-index: 1;
      width: 40px;
      height: 22px;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }
    .track {
      position: relative;
      width: 40px;
      height: 22px;
      flex-shrink: 0;
      border-radius: 999px;
      background: #d9d9d9;
      transition: background 0.15s ease;
    }
    .track::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px #0003;
      transition: transform 0.15s ease;
    }
    .switch input:checked + .track {
      background: var(--brand);
    }
    .switch input:checked + .track::after {
      transform: translateX(18px);
    }
    .switch input:focus-visible + .track {
      outline: 2px solid var(--brand);
      outline-offset: 3px;
    }
    .switch input:disabled + .track {
      opacity: 0.6;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 32px;
    }
    @media (max-width: 600px) {
      .row {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddressFormPage {
  readonly editId = inject(ActivatedRoute).snapshot.paramMap.get('id');
  readonly provinces = signal<Location[]>([]);
  readonly wards = signal<Location[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly lockedDefault = signal(false);

  private readonly api = inject(ACCOUNT_API);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly builder = inject(FormBuilder).nonNullable;
  readonly form = this.builder.group({
    provinceCode: ['', Validators.required],
    wardCode: ['', Validators.required],
    street: ['', [Validators.required, Validators.pattern(/\S.{3,}\S/)]],
    recipient: ['', [Validators.required, Validators.pattern(/\S/)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    isDefault: [false],
    isReturn: [false],
  });
  readonly contactFields = [
    {
      key: 'recipient',
      label: 'Họ và tên:',
      type: 'text',
      autocomplete: 'name',
      error: 'Nhập họ và tên người nhận.',
    },
    {
      key: 'phone',
      label: 'Số điện thoại:',
      type: 'tel',
      autocomplete: 'tel',
      error: 'Nhập số điện thoại hợp lệ (0 hoặc +84).',
    },
  ] as const;

  constructor() {
    const province = this.form.controls.provinceCode;
    province.valueChanges
      .pipe(
        distinctUntilChanged(),
        tap(() => this.wards.set([])),
        switchMap((code) => (code ? this.api.listWards(code) : of([]))),
        takeUntilDestroyed(),
      )
      .subscribe((wards) => {
        this.wards.set(wards);
        const ward = this.form.controls.wardCode;
        if (!wards.some((candidate) => candidate.code === ward.value)) ward.setValue('');
      });

    this.api
      .listProvinces()
      .pipe(
        tap((provinces) => this.provinces.set(provinces)),
        switchMap(() => (this.editId ? this.loadExisting(this.editId) : this.prefillContact())),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(),
      )
      .subscribe({ error: (error: unknown) => this.error.set(accountErrorMessage(error)) });
  }

  invalid(key: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[key];
    return control.invalid && control.touched;
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const input: AddressInput = this.form.getRawValue();
    this.saving.set(true);
    this.error.set('');
    const request = this.editId
      ? this.api.updateAddress(this.editId, input)
      : this.api.createAddress(input);
    request
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => void this.router.navigateByUrl('/account/addresses'),
        error: (error: unknown) => this.error.set(accountErrorMessage(error)),
      });
  }

  private loadExisting(id: string) {
    return this.api.listAddresses().pipe(
      map((list) => list.find((address) => address.id === id)),
      tap((address) => {
        if (!address) {
          void this.router.navigateByUrl('/account/addresses');
          return;
        }
        this.form.setValue({
          provinceCode: address.province.code,
          wardCode: address.ward.code,
          street: address.street,
          recipient: address.recipient,
          phone: address.phone,
          isDefault: address.isDefault,
          isReturn: address.isReturn,
        });
        if (address.isDefault) {
          this.lockedDefault.set(true);
          this.form.controls.isDefault.disable();
        }
      }),
    );
  }

  private prefillContact() {
    return this.api.getProfile().pipe(
      tap((profile) =>
        this.form.patchValue({
          recipient: `${profile.lastName} ${profile.firstName}`.trim(),
          phone: profile.phone ?? '',
        }),
      ),
    );
  }
}
