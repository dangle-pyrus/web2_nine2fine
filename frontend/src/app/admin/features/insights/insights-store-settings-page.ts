import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { money } from '../../core/format';
import { ADMIN_STORE_SETTINGS_API } from '../../data-access/insights-api';
import { insightsErrorMessage, insightsFieldErrors } from '../../data-access/insights-errors';
import type { AdminStoreSettings, StoreSettingsInput } from '../../data-access/insights-models';
import { AdminApiError } from '../../data-access/models';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { AdminToastService } from '../../ui/toast';
import { HasUnsavedChanges } from '../../ui/unsaved-changes';

type Kind = 'text' | 'email' | 'date' | 'url' | 'int';

interface FieldSpec {
  /** Path of the contract, also the key of `drafts` and of the server's field errors. */
  path: string;
  label: string;
  kind: Kind;
  suffix?: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
  money?: boolean;
}

interface SectionSpec {
  id: string;
  title: string;
  description: string;
  fields: FieldSpec[];
}

/**
 * The groups the HTTP build offers (BR-SET-12): no Đổi trả, no Hạng thành viên, no bank account,
 * and the low-stock threshold is only a link to Tồn kho.
 */
const SECTIONS: SectionSpec[] = [
  {
    id: 'info',
    title: 'Thông tin cửa hàng',
    description:
      'Hiện ở chân trang, trợ giúp và các trang chính sách. Phải khớp giấy đăng ký kinh doanh.',
    fields: [
      {
        path: 'info.legalName',
        label: 'Tên doanh nghiệp',
        kind: 'text',
        required: true,
        wide: true,
      },
      {
        path: 'info.registrationNumber',
        label: 'Mã số thuế / số ĐKKD',
        kind: 'text',
        required: true,
        hint: '10 hoặc 13 chữ số.',
      },
      { path: 'info.registrationDate', label: 'Ngày cấp', kind: 'date' },
      { path: 'info.registrationIssuer', label: 'Nơi cấp', kind: 'text', wide: true },
      { path: 'info.address', label: 'Địa chỉ', kind: 'text', required: true, wide: true },
    ],
  },
  {
    id: 'contact',
    title: 'Liên hệ',
    description: 'Khách dùng các kênh này để hỏi về đơn hàng và chính sách.',
    fields: [
      { path: 'info.hotline', label: 'Hotline', kind: 'text', required: true },
      { path: 'info.hours', label: 'Giờ làm việc', kind: 'text' },
      {
        path: 'info.email',
        label: 'Email chăm sóc khách hàng',
        kind: 'email',
        required: true,
      },
      { path: 'info.privacyEmail', label: 'Email về dữ liệu cá nhân', kind: 'email' },
      {
        path: 'info.notificationUrl',
        label: 'Liên kết thông báo Bộ Công Thương',
        kind: 'url',
        wide: true,
        hint: 'Để trống nếu chưa thông báo; chân trang sẽ ẩn biểu tượng.',
      },
      {
        path: 'info.social.facebook',
        label: 'Facebook',
        kind: 'url',
        hint: 'Bắt đầu bằng https://',
      },
      {
        path: 'info.social.instagram',
        label: 'Instagram',
        kind: 'url',
        hint: 'Bắt đầu bằng https://',
      },
      { path: 'info.social.tiktok', label: 'TikTok', kind: 'url', hint: 'Bắt đầu bằng https://' },
      { path: 'info.social.youtube', label: 'YouTube', kind: 'url', hint: 'Bắt đầu bằng https://' },
    ],
  },
  {
    id: 'shipping',
    title: 'Vận chuyển và thanh toán',
    description: 'Áp dụng ngay cho báo giá và đơn tạo sau khi lưu; đơn đã tạo giữ nguyên.',
    fields: [
      {
        path: 'operations.shippingFee',
        label: 'Phí vận chuyển',
        kind: 'int',
        suffix: '₫',
        money: true,
        required: true,
        hint: '0 đến 500.000, bội số của 1.000.',
      },
      {
        path: 'operations.freeShippingThreshold',
        label: 'Miễn phí vận chuyển từ',
        kind: 'int',
        suffix: '₫',
        money: true,
        required: true,
        hint: 'Giá trị hàng trước mã giảm giá.',
      },
      {
        path: 'operations.bankHoldMinutes',
        label: 'Giữ đơn chờ chuyển khoản',
        kind: 'int',
        suffix: 'phút',
        required: true,
        hint: '10 đến 1.440. Quá hạn, đơn tự huỷ và trả hàng về kho.',
      },
      {
        path: 'operations.codMaxTotal',
        label: 'Trần giá trị đơn COD',
        kind: 'int',
        suffix: '₫',
        money: true,
        required: true,
        hint: 'Đơn lớn hơn phải chuyển khoản.',
      },
      {
        path: 'operations.deliveryDaysMin',
        label: 'Giao nhanh nhất',
        kind: 'int',
        suffix: 'ngày',
        required: true,
      },
      {
        path: 'operations.deliveryDaysMax',
        label: 'Giao chậm nhất',
        kind: 'int',
        suffix: 'ngày',
        required: true,
      },
      {
        path: 'operations.cutoffHour',
        label: 'Giờ chốt đơn trong ngày',
        kind: 'int',
        suffix: 'giờ',
        required: true,
        hint: '0 đến 23, giờ Việt Nam.',
      },
    ],
  },
  {
    id: 'cart',
    title: 'Tham số giỏ hàng và COD',
    description: 'Đổi không cắt giỏ hay đơn đang có; chỉ áp cho thao tác mới.',
    fields: [
      {
        path: 'cart.maxPerVariant',
        label: 'Tối đa mỗi biến thể',
        kind: 'int',
        required: true,
        hint: '1 đến 20.',
      },
      {
        path: 'cart.maxItemsPerOrder',
        label: 'Tối đa sản phẩm mỗi đơn',
        kind: 'int',
        required: true,
        hint: '1 đến 100.',
      },
      {
        path: 'cart.maxCartLines',
        label: 'Tối đa dòng trong giỏ',
        kind: 'int',
        required: true,
        hint: '1 đến 100.',
      },
      {
        path: 'cart.cartRetentionDays',
        label: 'Giữ giỏ hàng',
        kind: 'int',
        suffix: 'ngày',
        required: true,
        hint: '1 đến 180.',
      },
      {
        path: 'cart.codRefusalLimit',
        label: 'Số lần từ chối nhận COD bị chặn',
        kind: 'int',
        required: true,
        hint: '1 đến 10.',
      },
      {
        path: 'cart.codRefusalMonths',
        label: 'Tính từ chối COD trong',
        kind: 'int',
        suffix: 'tháng',
        required: true,
        hint: '1 đến 24.',
      },
      {
        path: 'cart.codOpenOrderLimit',
        label: 'Số đơn COD đang mở tối đa',
        kind: 'int',
        required: true,
        hint: '1 đến 10.',
      },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((section) => section.fields);
type Drafts = Record<string, string>;

function read(settings: AdminStoreSettings, path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      settings as unknown,
    );
  return value === null || value === undefined ? '' : String(value);
}

function toDrafts(settings: AdminStoreSettings): Drafts {
  return Object.fromEntries(ALL_FIELDS.map((field) => [field.path, read(settings, field.path)]));
}

function toInput(drafts: Drafts, updatedAt: string): StoreSettingsInput {
  const text = (path: string) => (drafts[path] ?? '').trim();
  const int = (path: string) => Number(text(path));
  return {
    updatedAt,
    info: {
      legalName: text('info.legalName'),
      registrationNumber: text('info.registrationNumber'),
      registrationIssuer: text('info.registrationIssuer'),
      registrationDate: text('info.registrationDate') || null,
      address: text('info.address'),
      hotline: text('info.hotline'),
      email: text('info.email'),
      privacyEmail: text('info.privacyEmail'),
      hours: text('info.hours'),
      notificationUrl: text('info.notificationUrl'),
      social: {
        facebook: text('info.social.facebook'),
        instagram: text('info.social.instagram'),
        tiktok: text('info.social.tiktok'),
        youtube: text('info.social.youtube'),
      },
    },
    operations: {
      shippingFee: int('operations.shippingFee'),
      freeShippingThreshold: int('operations.freeShippingThreshold'),
      bankHoldMinutes: int('operations.bankHoldMinutes'),
      codMaxTotal: int('operations.codMaxTotal'),
      deliveryDaysMin: int('operations.deliveryDaysMin'),
      deliveryDaysMax: int('operations.deliveryDaysMax'),
      cutoffHour: int('operations.cutoffHour'),
    },
    cart: {
      maxPerVariant: int('cart.maxPerVariant'),
      maxItemsPerOrder: int('cart.maxItemsPerOrder'),
      maxCartLines: int('cart.maxCartLines'),
      cartRetentionDays: int('cart.cartRetentionDays'),
      codRefusalLimit: int('cart.codRefusalLimit'),
      codRefusalMonths: int('cart.codRefusalMonths'),
      codOpenOrderLimit: int('cart.codOpenOrderLimit'),
    },
  };
}

const fieldId = (path: string) => `set-${path.replace(/\./g, '-')}`;

/**
 * Cài đặt › Cửa hàng on the real API (Slice 8, BR-SET-01..13). One atomic save of the whole form
 * with the `updatedAt` that was read: `409 version-conflict` reloads the server's copy and keeps
 * the draft so the two can be compared; `422` marks every rejected field; a lost connection keeps
 * everything typed. Admin only.
 */
@Component({
  selector: 'adm-insights-store-settings-page',
  imports: [RouterLink, AdmPageHeader, AdmEmptyState, AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  templateUrl: './insights-store-settings-page.html',
  styles: `
    .card {
      padding: 20px;
      border: 1px solid var(--adm-divider);
      border-radius: var(--adm-radius-lg);
    }
    .affix .input {
      padding-right: 64px;
    }
    .affix .suffix {
      font-size: 13px;
    }
    .banner {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 24px;
      padding: 12px 16px;
      border-radius: var(--adm-radius-lg);
      background: var(--adm-muted);
      &.is-error {
        color: var(--adm-danger);
      }
      &.is-ok {
        color: var(--adm-success-fg);
      }
    }
    .banner p {
      margin: 0;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .current {
      color: var(--adm-warning-fg);
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
export class InsightsStoreSettingsPage implements HasUnsavedChanges {
  private readonly api = inject(ADMIN_STORE_SETTINGS_API);
  private readonly toast = inject(AdminToastService);
  private readonly dialogs = inject(AdminDialogs);
  protected readonly sections = SECTIONS;
  protected readonly fieldId = fieldId;
  protected readonly money = money;

  /** Last copy read from the server: the baseline of "has changes" and the source of `updatedAt`. */
  private readonly server = signal<AdminStoreSettings | null>(null);
  protected readonly baseline = signal<Drafts>({});
  protected readonly drafts = signal<Drafts>({});
  /** Fields someone else changed while this form was open (409): path → value now on the server. */
  protected readonly theirs = signal<Drafts>({});
  protected readonly loadError = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly notice = signal<{ tone: 'ok' | 'error'; text: string } | null>(null);

  protected readonly ready = computed(() => this.server() !== null);
  protected readonly dirty = computed(() => {
    const baseline = this.baseline();
    const drafts = this.drafts();
    return ALL_FIELDS.some((field) => (drafts[field.path] ?? '') !== (baseline[field.path] ?? ''));
  });
  protected readonly lowStockDefault = computed(() => this.server()?.derived.lowStockDefault);
  /** "2–4 ngày": what the storefront will show, built from the two day fields as typed. */
  protected readonly deliveryWindow = computed(() => {
    const drafts = this.drafts();
    const min = Number(drafts['operations.deliveryDaysMin']);
    const max = Number(drafts['operations.deliveryDaysMax']);
    return Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= min
      ? `${min}–${max} ngày`
      : (this.server()?.derived.deliveryWindow ?? '');
  });

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
    this.loadError.set('');
    this.loading.set(true);
    this.api.get().subscribe({
      next: (settings) => {
        this.loading.set(false);
        this.adopt(settings);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(insightsErrorMessage(error));
      },
    });
  }

  private adopt(settings: AdminStoreSettings): void {
    const drafts = toDrafts(settings);
    this.server.set(settings);
    this.baseline.set(drafts);
    this.drafts.set({ ...drafts });
    this.theirs.set({});
    this.errors.set({});
  }

  value(path: string): string {
    return this.drafts()[path] ?? '';
  }

  write(path: string, raw: string): void {
    this.drafts.update((drafts) => ({ ...drafts, [path]: raw }));
    this.notice.set(null);
    if (this.errors()[path])
      this.errors.update((errors) => {
        const rest = { ...errors };
        delete rest[path];
        return rest;
      });
  }

  discard(): void {
    this.drafts.set({ ...this.baseline() });
    this.errors.set({});
    this.theirs.set({});
    this.notice.set(null);
  }

  /** Client-side checks that need no server: empty required fields and non-integers. */
  private localErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const field of ALL_FIELDS) {
      const value = this.value(field.path).trim();
      if (field.required && !value) errors[field.path] = `Nhập ${field.label.toLowerCase()}.`;
      else if (field.kind === 'int' && value && !/^-?\d+$/.test(value))
        errors[field.path] = 'Nhập một số nguyên, không có dấu chấm hay chữ.';
    }
    return errors;
  }

  save(): void {
    if (this.saving() || !this.dirty()) return;
    const server = this.server();
    if (!server) return;
    const local = this.localErrors();
    if (Object.keys(local).length) {
      this.errors.set(local);
      this.notice.set({ tone: 'error', text: 'Chưa lưu: kiểm tra các ô được đánh dấu.' });
      this.focusFirst(Object.keys(local));
      return;
    }
    const input = toInput(this.drafts(), server.updatedAt);
    const freeForAll =
      input.operations.freeShippingThreshold === 0 &&
      this.baseline()['operations.freeShippingThreshold'] !== '0';
    if (freeForAll) {
      this.dialogs
        .confirm({
          title: 'Miễn phí vận chuyển cho mọi đơn?',
          message:
            'Ngưỡng miễn phí vận chuyển bằng 0 nghĩa là mọi đơn hàng đều được miễn phí vận chuyển. Bạn có chắc muốn lưu?',
          confirmLabel: 'Vẫn lưu',
        })
        .subscribe((ok) => {
          if (ok) this.send(input);
        });
      return;
    }
    this.send(input);
  }

  private send(input: StoreSettingsInput): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.notice.set(null);
    this.errors.set({});
    this.api.save(input).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.adopt(saved);
        this.notice.set({ tone: 'ok', text: 'Đã lưu' });
        this.toast.show('Đã lưu cài đặt cửa hàng');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.onSaveError(error);
      },
    });
  }

  private onSaveError(error: unknown): void {
    const kind = error instanceof AdminApiError ? error.code : 'unavailable';
    if (kind === 'validation') {
      const fields = insightsFieldErrors(error);
      this.errors.set(fields);
      this.notice.set({
        tone: 'error',
        text: 'Chưa lưu: một số trường chưa hợp lệ. Kiểm tra các ô được đánh dấu.',
      });
      this.focusFirst(Object.keys(fields));
      return;
    }
    if (kind === 'version-conflict') {
      this.notice.set({ tone: 'error', text: insightsErrorMessage(error) });
      this.reloadForCompare();
      return;
    }
    const text = insightsErrorMessage(error);
    this.notice.set({ tone: 'error', text });
    this.toast.error(text);
  }

  /** 409: take the server's newer copy as the baseline and keep what the user typed. */
  private reloadForCompare(): void {
    this.api.get().subscribe({
      next: (latest) => {
        const before = this.baseline();
        const now = toDrafts(latest);
        const drafts = this.drafts();
        const changed: Drafts = {};
        for (const field of ALL_FIELDS) {
          if (now[field.path] !== before[field.path] && now[field.path] !== drafts[field.path])
            changed[field.path] = now[field.path];
        }
        this.server.set(latest);
        this.baseline.set(now);
        this.theirs.set(changed);
      },
      error: () => undefined,
    });
  }

  private focusFirst(paths: string[]): void {
    const first = ALL_FIELDS.find((field) => paths.includes(field.path));
    if (first) setTimeout(() => document.getElementById(fieldId(first.path))?.focus(), 0);
  }

  protected isNumber(value: string): boolean {
    return value.trim() !== '' && Number.isFinite(Number(value));
  }

  protected errorFor(path: string): string | undefined {
    return this.errors()[path];
  }
}
