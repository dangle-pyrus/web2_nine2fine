import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CATEGORIES } from '../../../features/catalog/models/product';
import { AdminSession } from '../../core/admin-session';
import { dateTime } from '../../core/format';
import { NumPipe } from '../../core/format.pipes';
import { promotionBadge, promotionState, tierBadge } from '../../core/status';
import { ADMIN_CUSTOMERS_API, ADMIN_PROMOTIONS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import {
  AdminApiError,
  type AdminCustomerSummary,
  type CustomerTier,
  type Promotion,
  type PromotionAudience,
  type PromotionInput,
  type PromotionType,
} from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { routeParam } from '../../ui/route-param';
import { AdmSaveBar } from '../../ui/save-bar';
import { AdminToastService } from '../../ui/toast';
import { HasUnsavedChanges } from '../../ui/unsaved-changes';
import { promotionSummary } from './promotion-summary';

const TYPES: { value: PromotionType; label: string; help: string }[] = [
  { value: 'percent', label: 'Giảm theo %', help: 'Ví dụ giảm 10% toàn đơn' },
  { value: 'fixed', label: 'Giảm số tiền', help: 'Ví dụ giảm 100.000 ₫' },
  { value: 'free-shipping', label: 'Miễn phí vận chuyển', help: 'Khách không trả phí giao' },
];

const AUDIENCES: { value: PromotionAudience; label: string; help: string; icon: string }[] = [
  {
    value: 'everyone',
    label: 'Tất cả khách',
    help: 'Mọi khách đều dùng được, kể cả khách chưa có tài khoản.',
    icon: 'reiconUsers',
  },
  {
    value: 'tiers',
    label: 'Theo hạng thành viên',
    help: 'Chỉ khách thuộc hạng bạn chọn, ví dụ Bạc và Vàng.',
    icon: 'reiconCrown',
  },
  {
    value: 'customers',
    label: 'Khách được chọn',
    help: 'Chỉ những tài khoản bạn chỉ định.',
    icon: 'reiconShieldUser',
  },
  {
    value: 'private',
    label: 'Phát riêng',
    help: 'Không hiện cho ai, bạn tự gửi mã cho người nhận.',
    icon: 'reiconLock',
  },
];

const TIERS: { value: CustomerTier; label: string }[] = [
  { value: 'member', label: 'Đồng' },
  { value: 'silver', label: 'Bạc' },
  { value: 'gold', label: 'Vàng' },
];

/** `datetime-local` value in Vietnam time (the store's clock). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(Date.parse(iso) + 7 * 3_600_000);
  return date.toISOString().slice(0, 16);
}
function fromLocalInput(value: string): string | null {
  return value ? new Date(`${value}:00+07:00`).toISOString() : null;
}

function emptyPromotion(): PromotionInput {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  return {
    code: '',
    title: '',
    type: 'percent',
    value: 10,
    maxDiscount: null,
    minSubtotal: 0,
    categories: [],
    usageLimit: null,
    perCustomerLimit: 1,
    audience: 'everyone',
    tiers: [],
    customerIds: [],
    startsAt: start.toISOString(),
    endsAt: null,
    enabled: true,
  };
}

/** Create / edit a discount code (6.6) with a live plain-language summary. */
@Component({
  selector: 'adm-promotion-form-page',
  imports: [RouterLink, AdmPageHeader, AdmBadge, AdmIcon, AdmSaveBar, AdmEmptyState, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    @if (loading()) {
      <adm-page-header heading="Đang tải…" back="/admin/promotions" />
      <div class="columns">
        <div class="col-main stack">
          <div class="sk sk--title"></div>
          <div class="sk"></div>
          <div class="sk"></div>
        </div>
      </div>
    } @else if (loadError()) {
      <adm-page-header heading="Khuyến mãi" back="/admin/promotions" />
      <adm-empty kind="error" heading="Không tải được mã giảm giá" [description]="loadError()">
        <button type="button" class="adm-btn" (click)="load(id()!)">Thử lại</button>
      </adm-empty>
    } @else {
      <adm-page-header
        [heading]="isNew() ? 'Tạo mã giảm giá' : (saved()?.code ?? '')"
        back="/admin/promotions"
      >
        <ng-container badges>
          @if (saved(); as promo) {
            <adm-badge [spec]="badge(promo)" />
          }
        </ng-container>
        <ng-container actions>
          @if (isNew()) {
            <a class="adm-btn adm-btn--lg" routerLink="/admin/promotions">Hủy</a>
            <button
              type="button"
              class="adm-btn adm-btn--primary adm-btn--lg"
              [class.is-busy]="saving()"
              (click)="save()"
            >
              Lưu mã giảm giá
            </button>
          }
        </ng-container>
      </adm-page-header>
      @if (!isNew()) {
        <adm-save-bar
          [visible]="canEdit && dirty()"
          [saving]="saving()"
          label="Mã giảm giá chưa được lưu"
          (save)="save()"
          (discard)="discard()"
        />
      }

      <fieldset class="columns form" [disabled]="!canEdit">
        <div class="col-main">
          <section class="section" aria-labelledby="type-title">
            <header><h2 id="type-title">Loại giảm giá</h2></header>
            <div class="types" role="radiogroup" aria-labelledby="type-title">
              @for (type of types; track type.value) {
                <label class="type" [class.is-on]="draft().type === type.value">
                  <input
                    type="radio"
                    name="type"
                    [value]="type.value"
                    [checked]="draft().type === type.value"
                    (change)="patch({ type: type.value })"
                  />
                  <span class="type-label">{{ type.label }}</span>
                  <span class="small tertiary">{{ type.help }}</span>
                </label>
              }
            </div>
          </section>

          <section class="section stack" aria-labelledby="code-title">
            <header><h2 id="code-title">Mã và giá trị</h2></header>
            <div class="field">
              <label class="req" for="pr-code">Mã giảm giá</label>
              <div class="row">
                <input
                  id="pr-code"
                  class="input mono upper"
                  maxlength="20"
                  placeholder="VD: CHAOTHU10"
                  [value]="draft().code"
                  (input)="patch({ code: $any($event.target).value.toUpperCase() })"
                  (blur)="touch('code')"
                  [attr.aria-invalid]="!!showError('code')"
                />
                <button type="button" class="adm-btn" (click)="generate()">Tạo ngẫu nhiên</button>
              </div>
              @if (showError('code'); as error) {
                <p class="error"><adm-icon name="reiconAlertCircle" [size]="14" /> {{ error }}</p>
              } @else {
                <p class="hint">Khách nhập mã này khi thanh toán.</p>
              }
            </div>
            <div class="field">
              <label for="pr-title">Tên chương trình</label>
              <input
                id="pr-title"
                class="input"
                placeholder="VD: Chào thu 2026"
                [value]="draft().title"
                (input)="patch({ title: $any($event.target).value })"
              />
              <p class="hint">Chỉ nhân viên thấy.</p>
            </div>
            @if (draft().type !== 'free-shipping') {
              <div class="form-grid">
                <div class="field">
                  <label class="req" for="pr-value">{{
                    draft().type === 'percent' ? 'Phần trăm giảm' : 'Số tiền giảm'
                  }}</label>
                  <div class="affix">
                    <input
                      id="pr-value"
                      class="input"
                      type="number"
                      min="0"
                      [max]="draft().type === 'percent' ? 100 : null"
                      [value]="draft().value || ''"
                      (input)="patch({ value: num($any($event.target).value) ?? 0 })"
                      (blur)="touch('value')"
                      [attr.aria-invalid]="!!showError('value')"
                    />
                    <span class="suffix">{{ draft().type === 'percent' ? '%' : '₫' }}</span>
                  </div>
                  @if (showError('value'); as error) {
                    <p class="error">{{ error }}</p>
                  }
                </div>
                @if (draft().type === 'percent') {
                  <div class="field">
                    <label for="pr-max">Giảm tối đa</label>
                    <div class="affix">
                      <input
                        id="pr-max"
                        class="input"
                        type="number"
                        min="0"
                        step="1000"
                        [value]="draft().maxDiscount ?? ''"
                        (input)="patch({ maxDiscount: num($any($event.target).value) || null })"
                      />
                      <span class="suffix">₫</span>
                    </div>
                    <p class="hint">Để trống nếu không giới hạn.</p>
                  </div>
                }
              </div>
            }
          </section>

          <section class="section stack" aria-labelledby="cond-title">
            <header><h2 id="cond-title">Điều kiện áp dụng</h2></header>
            <div class="field">
              <label for="pr-min">Giá trị đơn tối thiểu</label>
              <div class="affix narrow">
                <input
                  id="pr-min"
                  class="input"
                  type="number"
                  min="0"
                  step="1000"
                  [value]="draft().minSubtotal || ''"
                  placeholder="0"
                  (input)="patch({ minSubtotal: num($any($event.target).value) ?? 0 })"
                />
                <span class="suffix">₫</span>
              </div>
            </div>
            <div class="field">
              <span class="field-label">Áp dụng cho</span>
              <div class="checks">
                @for (item of categories; track item.value) {
                  <label class="check"
                    ><input
                      type="checkbox"
                      [checked]="draft().categories.includes(item.value)"
                      (change)="toggleCategory(item.value, $any($event.target).checked)"
                    />{{ item.label }}</label
                  >
                }
              </div>
              <p class="hint">Không chọn danh mục nào = áp dụng cho toàn bộ sản phẩm.</p>
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="pr-limit">Tổng lượt dùng tối đa</label>
                <input
                  id="pr-limit"
                  class="input"
                  type="number"
                  min="1"
                  placeholder="Không giới hạn"
                  [value]="draft().usageLimit ?? ''"
                  (input)="patch({ usageLimit: num($any($event.target).value) || null })"
                />
              </div>
              <div class="field">
                <label for="pr-per">Mỗi khách dùng tối đa</label>
                <input
                  id="pr-per"
                  class="input"
                  type="number"
                  min="1"
                  [value]="draft().perCustomerLimit"
                  (input)="patch({ perCustomerLimit: num($any($event.target).value) || 1 })"
                />
              </div>
            </div>
          </section>

          <section class="section stack" aria-labelledby="audience-title">
            <header><h2 id="audience-title">Đối tượng nhận mã</h2></header>
            <div class="audiences" role="radiogroup" aria-labelledby="audience-title">
              @for (option of audiences; track option.value) {
                <label class="type" [class.is-on]="draft().audience === option.value">
                  <input
                    type="radio"
                    name="audience"
                    [value]="option.value"
                    [checked]="draft().audience === option.value"
                    (change)="patch({ audience: option.value })"
                  />
                  <span class="type-head">
                    <adm-icon [name]="option.icon" [size]="18" />
                    <span class="type-label">{{ option.label }}</span>
                  </span>
                  <span class="small tertiary">{{ option.help }}</span>
                </label>
              }
            </div>
            @switch (draft().audience) {
              @case ('tiers') {
                <div class="field">
                  <span class="field-label req">Hạng thành viên được dùng</span>
                  <div class="tiers">
                    @for (tier of tierOptions; track tier.value) {
                      <label class="tier" [class.is-on]="draft().tiers.includes(tier.value)">
                        <input
                          type="checkbox"
                          [checked]="draft().tiers.includes(tier.value)"
                          (change)="toggleTier(tier.value, $any($event.target).checked)"
                        />
                        <span>
                          <span class="type-label">{{ tier.label }}</span>
                          <span class="small tertiary block">{{
                            tierCounts()[tier.value] === undefined
                              ? 'Đang đếm khách…'
                              : (tierCounts()[tier.value] | admNum) + ' khách'
                          }}</span>
                        </span>
                      </label>
                    }
                  </div>
                  @if (showError('audience'); as error) {
                    <p class="error">{{ error }}</p>
                  } @else {
                    <p class="hint">
                      Khách phải đăng nhập tài khoản đúng hạng mới áp được mã. Hạng thay đổi theo
                      tổng chi tiêu ở trang Khách hàng.
                    </p>
                  }
                </div>
              }
              @case ('customers') {
                <div class="field">
                  <label class="req" for="pr-customer">Khách hàng được dùng</label>
                  <div class="affix">
                    <span class="prefix-icon"><adm-icon name="reiconSearch" [size]="16" /></span>
                    <input
                      id="pr-customer"
                      class="input"
                      type="search"
                      autocomplete="off"
                      placeholder="Tìm theo tên, số điện thoại hoặc email"
                      [value]="customerSearch()"
                      (input)="searchCustomers($any($event.target).value)"
                    />
                  </div>
                  @if (customerHits().length) {
                    <ul class="hits" role="listbox" aria-label="Kết quả tìm khách">
                      @for (customer of customerHits(); track customer.id) {
                        <li>
                          <button
                            type="button"
                            [disabled]="draft().customerIds.includes(customer.id)"
                            (click)="addCustomer(customer)"
                          >
                            <span class="cell-title">{{ customer.name }}</span>
                            <span class="small tertiary">{{ customer.phone }}</span>
                            <adm-badge [spec]="tierBadge(customer.tier)" />
                          </button>
                        </li>
                      }
                    </ul>
                  }
                  @if (draft().customerIds.length) {
                    <div class="chips">
                      @for (id of draft().customerIds; track id) {
                        <span class="chip"
                          >{{ customerNames()[id] ?? id
                          }}<button
                            type="button"
                            [attr.aria-label]="'Bỏ ' + (customerNames()[id] ?? id)"
                            (click)="removeCustomer(id)"
                          >
                            <adm-icon name="reiconX" [size]="12" /></button
                        ></span>
                      }
                    </div>
                  }
                  @if (showError('audience'); as error) {
                    <p class="error">{{ error }}</p>
                  } @else {
                    <p class="hint">Chỉ các tài khoản này áp được mã khi thanh toán.</p>
                  }
                </div>
              }
              @case ('private') {
                <p class="note small secondary">
                  <adm-icon name="reiconLock" [size]="16" />
                  <span
                    >Mã không hiện ở trang thanh toán hay trong tài khoản của khách nào. Bạn tự gửi
                    mã cho người cần nhận, ví dụ KOL hoặc khách cần xin lỗi. Ai có mã đều dùng được,
                    nên hãy đặt giới hạn lượt dùng ở trên.</span
                  >
                </p>
              }
            }
          </section>

          <section class="section stack" aria-labelledby="time-title">
            <header><h2 id="time-title">Thời gian</h2></header>
            <div class="form-grid">
              <div class="field">
                <label class="req" for="pr-start">Bắt đầu</label>
                <input
                  id="pr-start"
                  class="input"
                  type="datetime-local"
                  [value]="local(draft().startsAt)"
                  (change)="
                    patch({ startsAt: fromLocal($any($event.target).value) ?? draft().startsAt })
                  "
                />
              </div>
              <div class="field">
                <label for="pr-end">Kết thúc</label>
                <input
                  id="pr-end"
                  class="input"
                  type="datetime-local"
                  [value]="local(draft().endsAt)"
                  (change)="patch({ endsAt: fromLocal($any($event.target).value) })"
                  (blur)="touch('endsAt')"
                  [attr.aria-invalid]="!!showError('endsAt')"
                />
                @if (showError('endsAt'); as error) {
                  <p class="error">{{ error }}</p>
                } @else {
                  <p class="hint">Để trống nếu chạy đến khi tắt.</p>
                }
              </div>
            </div>
            <p class="hint">Giờ Việt Nam (GMT+7).</p>
          </section>

          @if (!isNew() && canEdit && saved()?.used === 0) {
            <button type="button" class="adm-btn adm-btn--danger" (click)="remove()">
              <adm-icon name="reiconTrash" [size]="16" /> Xóa mã giảm giá
            </button>
          }
        </div>

        <div class="col-side">
          <div class="summary">
            <p class="summary-code mono">{{ draft().code || 'MÃ GIẢM GIÁ' }}</p>
            <p class="summary-line">{{ summary() }}</p>
            <ul class="summary-list">
              <li>
                {{
                  draft().usageLimit
                    ? 'Tối đa ' + draft().usageLimit + ' lượt'
                    : 'Không giới hạn tổng lượt'
                }}, mỗi khách {{ draft().perCustomerLimit }} lần
              </li>
              <li>{{ audienceLine() }}</li>
              <li>
                Từ {{ formatDate(draft().startsAt)
                }}{{ draft().endsAt ? ' đến ' + formatDate(draft().endsAt!) : '' }}
              </li>
              @if (saved(); as promo) {
                <li>Đã dùng {{ promo.used | admNum }} lượt</li>
              }
            </ul>
          </div>
          <label class="enable">
            <input
              type="checkbox"
              class="toggle"
              [checked]="draft().enabled"
              (change)="patch({ enabled: $any($event.target).checked })"
            />
            <span>
              <span class="type-label">{{ draft().enabled ? 'Đang bật' : 'Đang tắt' }}</span>
              <span class="small tertiary block">Tắt để tạm dừng mã mà không cần xóa.</span>
            </span>
          </label>
        </div>
      </fieldset>
    }
  `,
  styles: `
    .form {
      margin: 0;
      padding: 0;
      border: 0;
      min-inline-size: 0;
    }
    .types {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .type {
      position: relative;
      display: grid;
      align-content: start;
      gap: 4px;
      padding: 16px;
      border: 1px solid var(--adm-divider);
      border-radius: var(--adm-radius-lg);
      cursor: pointer;
      transition: border-color 120ms ease-out;
    }
    .type:hover {
      border-color: var(--adm-text-tertiary);
    }
    .type.is-on {
      border-color: var(--adm-primary);
      box-shadow: 0 0 0 1px var(--adm-primary);
    }
    .type input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .type:has(input:focus-visible) {
      outline: 2px solid var(--adm-primary);
      outline-offset: 2px;
    }
    .type-label {
      font-weight: 500;
    }
    .block {
      display: block;
    }
    .upper {
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .row .input {
      flex: 1;
    }
    .narrow {
      max-width: 280px;
    }
    .audiences {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .type-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tiers {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .tier {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 14px;
      border: 1px solid var(--adm-divider);
      border-radius: var(--adm-radius-md);
      cursor: pointer;
      &.is-on {
        border-color: var(--adm-primary);
      }
      input {
        margin-top: 3px;
      }
    }
    .hits {
      list-style: none;
      margin: 0;
      padding: 4px;
      border: 1px solid var(--adm-divider);
      border-radius: var(--adm-radius-md);
      max-height: 240px;
      overflow: auto;
      button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 10px;
        border: 0;
        border-radius: var(--adm-radius-sm);
        background: none;
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
        &:hover:not(:disabled) {
          background: var(--adm-muted);
        }
        &:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .cell-title {
          flex: 1;
        }
      }
    }
    .note {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 14px;
      border-radius: var(--adm-radius-md);
      background: var(--adm-muted);
    }
    .checks {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
    }
    .summary {
      padding: 20px;
      border-radius: var(--adm-radius-lg);
      background: var(--adm-muted);
      margin-bottom: 20px;
    }
    .summary-code {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .summary-line {
      margin-top: 6px;
      font-weight: 500;
    }
    .summary-list {
      margin: 12px 0 0;
      padding-left: 18px;
      color: var(--adm-text-secondary);
      display: grid;
      gap: 4px;
    }
    .enable {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      cursor: pointer;
    }
    @media (max-width: 767px) {
      .types,
      .audiences,
      .tiers {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PromotionFormPage implements HasUnsavedChanges {
  private readonly api = inject(ADMIN_PROMOTIONS_API);
  private readonly router = inject(Router);
  private readonly toast = inject(AdminToastService);
  private readonly dialogs = inject(AdminDialogs);
  protected readonly canEdit = inject(AdminSession).can('promotions.edit');
  protected readonly id = routeParam('id');
  protected readonly isNew = computed(() => !this.id());
  protected readonly types = TYPES;
  protected readonly categories = CATEGORIES;
  protected readonly audiences = AUDIENCES;
  protected readonly tierOptions = TIERS;
  protected readonly tierBadge = tierBadge;
  private readonly customersApi = inject(ADMIN_CUSTOMERS_API);
  protected readonly tierCounts = signal<Partial<Record<CustomerTier, number>>>({});
  protected readonly customerSearch = signal('');
  protected readonly customerHits = signal<AdminCustomerSummary[]>([]);
  protected readonly customerNames = signal<Record<string, string>>({});
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  protected readonly audienceLine = computed(() => {
    const draft = this.draft();
    switch (draft.audience) {
      case 'tiers':
        return draft.tiers.length
          ? `Dành cho hạng ${TIERS.filter((tier) => draft.tiers.includes(tier.value))
              .map((tier) => tier.label)
              .join(', ')}`
          : 'Chưa chọn hạng thành viên';
      case 'customers':
        return `Dành cho ${draft.customerIds.length} khách được chọn`;
      case 'private':
        return 'Phát riêng, không hiện cho khách';
      default:
        return 'Dành cho tất cả khách';
    }
  });

  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly saved = signal<Promotion | null>(null);
  protected readonly draft = signal<PromotionInput>(emptyPromotion());
  private readonly original = signal(JSON.stringify(this.draft()));
  protected readonly touched = signal<Record<string, boolean>>({});
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== this.original());
  protected readonly summary = computed(() => promotionSummary(this.draft()));

  protected readonly errors = computed(() => {
    const draft = this.draft();
    const errors: Record<string, string> = { ...this.serverErrors() };
    if (!/^[A-Z0-9_-]{3,20}$/.test(draft.code.trim()))
      errors['code'] ??= 'Mã gồm 3–20 ký tự: chữ không dấu, số, gạch ngang.';
    if (draft.type === 'percent' && !(draft.value >= 1 && draft.value <= 100))
      errors['value'] = 'Phần trăm giảm từ 1 đến 100.';
    if (draft.type === 'fixed' && !(draft.value > 0)) errors['value'] = 'Nhập số tiền giảm.';
    if (draft.endsAt && draft.endsAt <= draft.startsAt)
      errors['endsAt'] = 'Ngày kết thúc phải sau ngày bắt đầu.';
    if (draft.audience === 'tiers' && !draft.tiers.length)
      errors['audience'] = 'Chọn ít nhất một hạng thành viên.';
    if (draft.audience === 'customers' && !draft.customerIds.length)
      errors['audience'] = 'Chọn ít nhất một khách hàng.';
    return errors;
  });

  constructor() {
    const id = this.id();
    if (id) this.load(id);
    for (const tier of TIERS)
      this.customersApi
        .list({
          tier: tier.value,
          status: '',
          search: '',
          page: 1,
          pageSize: 1,
          sort: '',
          dir: 'desc',
        })
        .subscribe({
          next: (page) =>
            this.tierCounts.update((counts) => ({ ...counts, [tier.value]: page.total })),
          error: () => undefined,
        });
  }

  toggleTier(tier: CustomerTier, on: boolean): void {
    const current = this.draft().tiers;
    this.patch({ tiers: on ? [...current, tier] : current.filter((item) => item !== tier) });
    this.touch('audience');
  }

  searchCustomers(text: string): void {
    this.customerSearch.set(text);
    clearTimeout(this.searchTimer);
    if (!text.trim()) {
      this.customerHits.set([]);
      return;
    }
    this.searchTimer = setTimeout(() => {
      this.customersApi
        .list({
          tier: '',
          status: 'active',
          search: text.trim(),
          page: 1,
          pageSize: 8,
          sort: '',
          dir: 'desc',
        })
        .subscribe({
          next: (page) => this.customerHits.set(page.items),
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
    }, 200);
  }

  addCustomer(customer: AdminCustomerSummary): void {
    this.customerNames.update((names) => ({ ...names, [customer.id]: customer.name }));
    this.patch({ customerIds: [...this.draft().customerIds, customer.id] });
    this.touch('audience');
  }

  removeCustomer(id: string): void {
    this.patch({ customerIds: this.draft().customerIds.filter((item) => item !== id) });
  }

  /** Names for customers already on a saved code. */
  private loadCustomerNames(ids: string[]): void {
    for (const id of ids.filter((item) => !this.customerNames()[item]))
      this.customersApi.get(id).subscribe({
        next: (customer) =>
          this.customerNames.update((names) => ({ ...names, [id]: customer.name })),
        error: () => undefined,
      });
  }

  hasUnsavedChanges(): boolean {
    return this.canEdit && this.dirty() && !this.saving();
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  load(id: string): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.get(id).subscribe({
      next: (promo) => {
        this.loading.set(false);
        this.apply(promo);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(errorMessage(error));
      },
    });
  }

  private apply(promo: Promotion): void {
    this.saved.set(promo);
    const copy: Partial<Promotion> = { ...promo };
    delete copy.id;
    delete copy.used;
    delete copy.createdAt;
    const input = copy as PromotionInput;
    this.draft.set(input);
    this.original.set(JSON.stringify(input));
    this.loadCustomerNames(input.customerIds);
    this.touched.set({});
    this.serverErrors.set({});
  }

  patch(change: Partial<PromotionInput>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
    if (Object.keys(change).some((key) => this.serverErrors()[key])) this.serverErrors.set({});
  }

  touch(field: string): void {
    this.touched.update((value) => ({ ...value, [field]: true }));
  }

  showError(field: string): string | null {
    return this.touched()[field] || this.serverErrors()[field]
      ? (this.errors()[field] ?? null)
      : null;
  }

  toggleCategory(value: string, on: boolean): void {
    const current = this.draft().categories;
    this.patch({ categories: on ? [...current, value] : current.filter((item) => item !== value) });
  }

  generate(): void {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const random = Array.from(
      { length: 6 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join('');
    this.patch({ code: `N2F${random}` });
  }

  badge(promo: Promotion) {
    return promotionBadge(promotionState(promo));
  }

  discard(): void {
    this.draft.set(JSON.parse(this.original()) as PromotionInput);
    this.touched.set({});
    this.serverErrors.set({});
  }

  save(): void {
    this.touched.set({ code: true, value: true, endsAt: true, audience: true });
    const local = { ...this.errors() };
    for (const key of Object.keys(this.serverErrors())) delete local[key];
    if (Object.keys(local).length) {
      this.toast.error(`Chưa lưu được: ${Object.values(local)[0]}`);
      return;
    }
    const draft = this.draft();
    const input: PromotionInput = {
      ...draft,
      code: draft.code.trim().toUpperCase(),
      title: draft.title.trim() || draft.code.trim().toUpperCase(),
      value: draft.type === 'free-shipping' ? 0 : draft.value,
      tiers: draft.audience === 'tiers' ? draft.tiers : [],
      customerIds: draft.audience === 'customers' ? draft.customerIds : [],
    };
    const id = this.id();
    this.saving.set(true);
    (id ? this.api.update(id, input) : this.api.create(input)).subscribe({
      next: (promo) => {
        this.saving.set(false);
        this.apply(promo);
        this.toast.show(id ? 'Đã lưu mã giảm giá' : `Đã tạo mã ${promo.code}`);
        if (!id) void this.router.navigate(['/admin/promotions', promo.id], { replaceUrl: true });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof AdminApiError && Object.keys(error.fields).length)
          this.serverErrors.set(error.fields);
        this.toast.error(errorMessage(error));
      },
    });
  }

  remove(): void {
    const promo = this.saved();
    if (!promo) return;
    this.dialogs
      .confirm({
        title: `Xóa mã ${promo.code}?`,
        message: 'Mã chưa được dùng lần nào. Sau khi xóa, khách nhập mã này sẽ báo không hợp lệ.',
        confirmLabel: 'Xóa mã',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.remove(promo.id).subscribe({
          next: () => {
            this.original.set(JSON.stringify(this.draft()));
            this.toast.show(`Đã xóa mã ${promo.code}`);
            void this.router.navigateByUrl('/admin/promotions');
          },
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
      });
  }

  protected readonly local = toLocalInput;
  protected readonly fromLocal = fromLocalInput;
  protected readonly formatDate = dateTime;
  protected num(value: unknown): number | null {
    return value === '' || value === null || value === undefined ? null : Number(value);
  }
}
