import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { StoreSettingsValue } from '../../../core/store-settings';
import { money } from '../../core/format';
import { ADMIN_SETTINGS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmSaveBar } from '../../ui/save-bar';
import { AdminToastService } from '../../ui/toast';
import { HasUnsavedChanges } from '../../ui/unsaved-changes';

type Group = keyof StoreSettingsValue;
interface FieldSpec {
  group: Group;
  key: string;
  label: string;
  kind: 'text' | 'money' | 'number' | 'email';
  suffix?: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
}
interface SectionSpec {
  title: string;
  description: string;
  fields: FieldSpec[];
}

const SECTIONS: SectionSpec[] = [
  {
    title: 'Thông tin cửa hàng',
    description:
      'Hiện ở chân trang, hóa đơn và trang chính sách. Phải khớp giấy đăng ký kinh doanh.',
    fields: [
      {
        group: 'info',
        key: 'legalName',
        label: 'Tên doanh nghiệp',
        kind: 'text',
        required: true,
        wide: true,
      },
      {
        group: 'info',
        key: 'registrationNumber',
        label: 'Mã số doanh nghiệp',
        kind: 'text',
        required: true,
      },
      {
        group: 'info',
        key: 'registrationDate',
        label: 'Ngày cấp',
        kind: 'text',
        hint: 'YYYY-MM-DD',
      },
      { group: 'info', key: 'registrationIssuer', label: 'Nơi cấp', kind: 'text', wide: true },
      { group: 'info', key: 'address', label: 'Địa chỉ', kind: 'text', required: true, wide: true },
    ],
  },
  {
    title: 'Liên hệ',
    description: 'Khách dùng các kênh này để hỏi đơn hàng và đổi trả.',
    fields: [
      { group: 'info', key: 'hotline', label: 'Hotline', kind: 'text', required: true },
      { group: 'info', key: 'hours', label: 'Giờ làm việc', kind: 'text' },
      {
        group: 'info',
        key: 'email',
        label: 'Email chăm sóc khách hàng',
        kind: 'email',
        required: true,
      },
      { group: 'info', key: 'privacyEmail', label: 'Email về dữ liệu cá nhân', kind: 'email' },
    ],
  },
  {
    title: 'Vận chuyển và thanh toán',
    description: 'Áp dụng ngay cho giỏ hàng và trang thanh toán.',
    fields: [
      {
        group: 'policy',
        key: 'shippingFee',
        label: 'Phí vận chuyển',
        kind: 'money',
        suffix: '₫',
        required: true,
      },
      {
        group: 'policy',
        key: 'freeShippingFrom',
        label: 'Miễn phí vận chuyển từ',
        kind: 'money',
        suffix: '₫',
        hint: 'Giá trị đơn sau giảm giá.',
      },
      { group: 'policy', key: 'deliveryWindow', label: 'Thời gian giao dự kiến', kind: 'text' },
      {
        group: 'policy',
        key: 'paymentHoldMinutes',
        label: 'Giữ đơn chờ chuyển khoản',
        kind: 'number',
        suffix: 'phút',
        hint: 'Quá hạn, đơn tự hủy và trả hàng về kho.',
      },
    ],
  },
  {
    title: 'Đổi trả',
    description: 'Khách thấy các điều kiện này khi gửi yêu cầu trả hàng.',
    fields: [
      {
        group: 'policy',
        key: 'returnDays',
        label: 'Thời hạn trả hàng',
        kind: 'number',
        suffix: 'ngày',
        required: true,
      },
      {
        group: 'policy',
        key: 'returnShippingFee',
        label: 'Phí gửi trả',
        kind: 'money',
        suffix: '₫',
        hint: 'Trừ vào tiền hoàn, trừ khi lỗi từ cửa hàng.',
      },
      {
        group: 'policy',
        key: 'refundWorkingDays',
        label: 'Thời gian hoàn tiền',
        kind: 'text',
        suffix: 'ngày làm việc',
      },
    ],
  },
  {
    title: 'Hạng thành viên',
    description: 'Tính theo tổng chi tiêu trong năm. Thay đổi áp dụng từ lần xét hạng tiếp theo.',
    fields: [
      { group: 'membership', key: 'silverFrom', label: 'Hạng Bạc từ', kind: 'money', suffix: '₫' },
      { group: 'membership', key: 'goldFrom', label: 'Hạng Vàng từ', kind: 'money', suffix: '₫' },
      {
        group: 'membership',
        key: 'welcomePercent',
        label: 'Ưu đãi chào mừng',
        kind: 'number',
        suffix: '%',
      },
      {
        group: 'membership',
        key: 'welcomeMinOrder',
        label: 'Áp dụng cho đơn từ',
        kind: 'money',
        suffix: '₫',
      },
      {
        group: 'membership',
        key: 'birthdayAmount',
        label: 'Quà sinh nhật',
        kind: 'money',
        suffix: '₫',
      },
      {
        group: 'membership',
        key: 'birthdayMinOrder',
        label: 'Áp dụng cho đơn từ',
        kind: 'money',
        suffix: '₫',
      },
      {
        group: 'membership',
        key: 'reviewDay',
        label: 'Ngày xét hạng',
        kind: 'text',
        hint: 'dd/mm hằng năm',
      },
    ],
  },
];

/** Store settings (4.4): annotated layout, contextual save bar. Saving updates the storefront live. */
@Component({
  selector: 'adm-store-settings-page',
  imports: [AdmPageHeader, AdmSaveBar, AdmEmptyState, AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <adm-page-header heading="Cửa hàng" back="/admin/settings" />
    <adm-save-bar
      [visible]="dirty()"
      [saving]="saving()"
      label="Cài đặt chưa được lưu"
      (save)="save()"
      (discard)="discard()"
    />
    <div class="page-body page-body--narrow">
      @if (error() && !value()) {
        <adm-empty kind="error" heading="Không tải được cài đặt" [description]="error()">
          <button type="button" class="adm-btn" (click)="load()">Thử lại</button>
        </adm-empty>
      } @else if (!value()) {
        <div class="stack">
          <div class="sk sk--title"></div>
          <div class="sk"></div>
          <div class="sk"></div>
        </div>
      } @else {
        @for (section of sections; track section.title) {
          <section class="annotated">
            <div>
              <h2>{{ section.title }}</h2>
              <p class="annotated-desc small">{{ section.description }}</p>
            </div>
            <div class="card form-grid">
              @for (field of section.fields; track field.group + field.key) {
                <div class="field" [class.span-2]="field.wide">
                  <label [for]="field.group + '-' + field.key" [class.req]="field.required">{{
                    field.label
                  }}</label>
                  <div class="affix">
                    <input
                      class="input"
                      [id]="field.group + '-' + field.key"
                      [type]="
                        field.kind === 'text' ? 'text' : field.kind === 'email' ? 'email' : 'number'
                      "
                      [attr.min]="field.kind === 'text' || field.kind === 'email' ? null : 0"
                      [attr.step]="field.kind === 'money' ? 1000 : null"
                      [value]="read(field)"
                      [attr.aria-invalid]="!!fieldError(field)"
                      (input)="write(field, $any($event.target).value)"
                    />
                    @if (field.suffix) {
                      <span class="suffix">{{ field.suffix }}</span>
                    }
                  </div>
                  @if (fieldError(field); as message) {
                    <p class="error">
                      <adm-icon name="reiconAlertCircle" [size]="14" /> {{ message }}
                    </p>
                  } @else if (field.kind === 'money' && read(field)) {
                    <p class="hint">
                      {{ money(+read(field)) }}{{ field.hint ? '. ' + field.hint : '' }}
                    </p>
                  } @else if (field.hint) {
                    <p class="hint">{{ field.hint }}</p>
                  }
                </div>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .card {
      padding: 20px;
      border: 1px solid var(--adm-divider);
      border-radius: var(--adm-radius-lg);
    }
    .affix .input[type='number'] {
      padding-right: 64px;
    }
    .affix .suffix {
      font-size: 13px;
    }
    @media (max-width: 767px) {
      .card {
        padding: 16px;
      }
      .form-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class StoreSettingsPage implements HasUnsavedChanges {
  private readonly api = inject(ADMIN_SETTINGS_API);
  private readonly toast = inject(AdminToastService);
  protected readonly sections = SECTIONS;
  protected readonly money = money;
  protected readonly value = signal<StoreSettingsValue | null>(null);
  private readonly original = signal('');
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly tried = signal(false);
  protected readonly dirty = computed(
    () => !!this.value() && JSON.stringify(this.value()) !== this.original(),
  );

  constructor() {
    this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.dirty() && !this.saving();
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  load(): void {
    this.error.set('');
    this.api.getStore().subscribe({
      next: (value) => this.reset(value),
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  private reset(value: StoreSettingsValue): void {
    this.value.set(structuredClone(value));
    this.original.set(JSON.stringify(value));
    this.tried.set(false);
  }

  read(field: FieldSpec): string {
    const group = this.value()?.[field.group] as unknown as Record<string, unknown> | undefined;
    const value = group?.[field.key];
    return value === null || value === undefined ? '' : String(value);
  }

  write(field: FieldSpec, raw: string): void {
    this.value.update((current) => {
      if (!current) return current;
      const value =
        field.kind === 'money' || field.kind === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
      return { ...current, [field.group]: { ...current[field.group], [field.key]: value } };
    });
  }

  fieldError(field: FieldSpec): string | null {
    if (!this.tried()) return null;
    const value = this.read(field).trim();
    if (field.required && (!value || value === '0')) return `Nhập ${field.label.toLowerCase()}.`;
    if (field.kind === 'email' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
      return 'Email chưa đúng định dạng.';
    if ((field.kind === 'money' || field.kind === 'number') && Number(value) < 0)
      return 'Không được nhỏ hơn 0.';
    return null;
  }

  discard(): void {
    this.reset(JSON.parse(this.original()) as StoreSettingsValue);
  }

  save(): void {
    this.tried.set(true);
    const value = this.value();
    if (!value) return;
    const invalid = SECTIONS.flatMap((section) => section.fields).find((field) =>
      this.fieldError(field),
    );
    if (invalid) {
      this.toast.error(`Chưa lưu được: ${this.fieldError(invalid)}`);
      return;
    }
    if (value.membership.goldFrom <= value.membership.silverFrom) {
      this.toast.error('Mức hạng Vàng phải cao hơn hạng Bạc.');
      return;
    }
    const info = { ...value.info, hotlineHref: `tel:${value.info.hotline.replace(/\D/g, '')}` };
    this.saving.set(true);
    this.api.updateStore({ ...value, info }).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.reset(saved);
        this.toast.show('Đã lưu cài đặt cửa hàng');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }
}
