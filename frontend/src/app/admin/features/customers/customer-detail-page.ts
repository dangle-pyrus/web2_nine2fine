import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminSession } from '../../core/admin-session';
import { maskEmail } from '../../core/format';
import { DatePipe, DateTimePipe, MoneyPipe, NumPipe, PhonePipe } from '../../core/format.pipes';
import { orderBadge, paymentBadge, tierBadge } from '../../core/status';
import { ADMIN_CUSTOMERS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { AdminCustomer, CustomerUpdate } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdmChipInput } from '../../ui/chip-input';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { routeParam } from '../../ui/route-param';
import { AdmSaveBar } from '../../ui/save-bar';
import { AdminToastService } from '../../ui/toast';
import { HasUnsavedChanges } from '../../ui/unsaved-changes';

/** Customer profile (6.5): KPIs, recent orders, sizes, addresses; staff notes and tags; block. */
@Component({
  selector: 'adm-customer-detail-page',
  imports: [
    RouterLink,
    AdmPageHeader,
    AdmBadge,
    AdmIcon,
    AdmChipInput,
    AdmSaveBar,
    AdmEmptyState,
    MoneyPipe,
    NumPipe,
    DatePipe,
    DateTimePipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (customer(); as customer) {
      <adm-page-header [heading]="customer.name" back="/admin/customers">
        <ng-container badges>
          <adm-badge [spec]="tierBadge(customer.tier)" />
          @if (customer.status === 'blocked') {
            <adm-badge label="Đã khóa" tone="critical" />
          }
        </ng-container>
        <p subtitle class="secondary small">Khách hàng từ {{ customer.createdAt | admDate }}</p>
        <ng-container actions>
          @if (canEdit) {
            <button type="button" class="adm-btn adm-btn--lg" (click)="toggleBlock(customer)">
              {{ customer.status === 'blocked' ? 'Mở khóa tài khoản' : 'Khóa tài khoản' }}
            </button>
          }
          @if (customer.status !== 'blocked') {
            <a
              class="adm-btn adm-btn--lg"
              routerLink="/admin/orders"
              [queryParams]="{ search: customer.email }"
              >Xem tất cả đơn</a
            >
          }
        </ng-container>
      </adm-page-header>

      <adm-save-bar
        [visible]="dirty()"
        [saving]="saving()"
        label="Ghi chú chưa được lưu"
        (save)="save()"
        (discard)="discard()"
      />

      <div class="columns">
        <div class="col-main">
          @if (customer.status === 'blocked') {
            <div class="banner banner--critical" role="status">
              <adm-icon name="reiconAlertCircle" />
              <div class="banner-body">
                <p class="banner-title">Tài khoản đang bị khóa</p>
                <p>Khách không đăng nhập và đặt hàng được. Đơn cũ vẫn giữ nguyên.</p>
              </div>
            </div>
          }
          <div class="kpis">
            <div>
              <p class="kpi-label">Đã chi</p>
              <p class="kpi-value">{{ customer.totalSpent | admMoney }}</p>
            </div>
            <div>
              <p class="kpi-label">Số đơn</p>
              <p class="kpi-value">{{ customer.orderCount | admNum }}</p>
            </div>
            <div>
              <p class="kpi-label">Giá trị TB/đơn</p>
              <p class="kpi-value">{{ customer.averageOrderValue | admMoney }}</p>
            </div>
            <div>
              <p class="kpi-label">Đã trả hàng</p>
              <p class="kpi-value" [class.warn]="customer.returnCount >= 2">
                {{ customer.returnCount }}
              </p>
            </div>
          </div>

          <section class="section" aria-labelledby="orders-title">
            <header><h2 id="orders-title">Đơn hàng gần đây</h2></header>
            @if (!customer.recentOrders.length) {
              <p class="secondary">Khách chưa đặt đơn nào.</p>
            } @else {
              <div class="table-wrap">
                <table class="table table--cards">
                  <thead>
                    <tr>
                      <th>Đơn</th>
                      <th>Ngày đặt</th>
                      <th>Thanh toán</th>
                      <th>Trạng thái</th>
                      <th class="num">Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (order of customer.recentOrders; track order.id) {
                      <tr>
                        <td>
                          <a class="cell-title mono" [routerLink]="['/admin/orders', order.id]"
                            >#{{ order.id }}</a
                          >
                        </td>
                        <td class="secondary" data-label="Ngày đặt">
                          {{ order.placedAt | admDateTime }}
                        </td>
                        <td data-label="Thanh toán">
                          <adm-badge [spec]="paymentBadge(order.paymentState)" />
                        </td>
                        <td data-label="Trạng thái">
                          <adm-badge [spec]="orderBadge(order.status)" />
                        </td>
                        <td class="num" data-label="Tổng">{{ order.total | admMoney }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>

          <section class="section" aria-labelledby="addr-title">
            <header><h2 id="addr-title">Sổ địa chỉ</h2></header>
            @if (!customer.addresses.length) {
              <p class="secondary">Chưa lưu địa chỉ nào.</p>
            } @else {
              <ul class="addresses">
                @for (address of customer.addresses; track $index) {
                  <li>
                    <p>
                      <strong>{{ address.recipient }}</strong>
                      @if (address.isDefault) {
                        <span class="chip chip--static small">Mặc định</span>
                      }
                    </p>
                    <p class="secondary num">{{ address.phone | admPhone: !canContact }}</p>
                    <p class="secondary">{{ address.line }}</p>
                  </li>
                }
              </ul>
            }
          </section>
        </div>

        <div class="col-side">
          <section class="section" aria-labelledby="contact-title">
            <header><h2 id="contact-title">Liên hệ</h2></header>
            <dl class="dl">
              <div>
                <dt>Email</dt>
                <dd>
                  @if (canContact) {
                    <a class="link" [href]="'mailto:' + customer.email">{{ customer.email }}</a>
                  } @else {
                    {{ maskEmail(customer.email) }}
                  }
                </dd>
              </div>
              <div>
                <dt>Điện thoại</dt>
                <dd class="num">{{ customer.phone | admPhone: !canContact }}</dd>
              </div>
              @if (customer.birthDate) {
                <div>
                  <dt>Sinh nhật</dt>
                  <dd>{{ customer.birthDate | admDate }}</dd>
                </div>
              }
              <div>
                <dt>Nhận tin khuyến mãi</dt>
                <dd>{{ customer.marketingOptIn ? 'Có' : 'Không' }}</dd>
              </div>
            </dl>
            @if (!canContact) {
              <p class="hint">Liên hệ được ẩn bớt theo quyền của bạn.</p>
            }
          </section>

          @if (customer.usualSizes.length) {
            <section class="section" aria-labelledby="size-title">
              <header><h2 id="size-title">Size hay mua</h2></header>
              <div class="chips">
                @for (size of customer.usualSizes; track size) {
                  <span class="chip chip--static">{{ size }}</span>
                }
              </div>
            </section>
          }

          <section class="section stack" aria-labelledby="note-title">
            <header><h2 id="note-title">Ghi chú nội bộ</h2></header>
            <div class="field">
              <label for="c-note" class="sr-only">Ghi chú</label>
              <textarea
                id="c-note"
                class="textarea"
                rows="4"
                placeholder="Chỉ nhân viên thấy"
                [disabled]="!canEdit"
                [value]="note()"
                (input)="note.set($any($event.target).value)"
              ></textarea>
            </div>
            <div class="field">
              <label for="c-tags">Tag</label>
              <adm-chip-input
                inputId="c-tags"
                placeholder="Ví dụ: vip, hay-doi-size"
                [disabled]="!canEdit"
                [values]="tags()"
                (valuesChange)="tags.set($event)"
              />
            </div>
          </section>
        </div>
      </div>
    } @else if (error()) {
      <adm-page-header heading="Khách hàng" back="/admin/customers" />
      <adm-empty kind="error" heading="Không tải được khách hàng" [description]="error()">
        <button type="button" class="adm-btn" (click)="load()">Thử lại</button>
      </adm-empty>
    } @else {
      <adm-page-header heading="Đang tải…" back="/admin/customers" />
      <div class="columns">
        <div class="col-main stack">
          <div class="sk sk--title"></div>
          <div class="sk"></div>
          <div class="sk"></div>
        </div>
      </div>
    }
  `,
  styles: `
    .kpis {
      margin-bottom: 24px;
    }
    .kpis {
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    }
    .kpis > div {
      padding: 4px 16px 20px;
    }
    .kpis > div:first-child {
      padding-left: 0;
    }
    .kpi-value {
      font-size: 22px;
    }
    .warn {
      color: var(--adm-warning-fg);
    }
    .addresses {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
    }
    .addresses li {
      padding: 14px 16px;
      border: 1px solid var(--adm-divider);
      border-radius: var(--adm-radius-lg);
      display: grid;
      gap: 2px;
    }
    .addresses .chip {
      height: 22px;
      margin-left: 6px;
      font-size: 11px;
    }
  `,
})
export class CustomerDetailPage implements HasUnsavedChanges {
  private readonly api = inject(ADMIN_CUSTOMERS_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  private readonly session = inject(AdminSession);
  protected readonly id = routeParam('id');
  protected readonly canEdit = this.session.can('customers.edit');
  protected readonly canContact = this.session.can('customers.contact');
  protected readonly tierBadge = tierBadge;
  protected readonly orderBadge = orderBadge;
  protected readonly paymentBadge = paymentBadge;
  protected readonly maskEmail = maskEmail;

  protected readonly customer = signal<AdminCustomer | null>(null);
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly note = signal('');
  protected readonly tags = signal<string[]>([]);
  protected readonly dirty = computed(() => {
    const customer = this.customer();
    return (
      !!customer &&
      this.canEdit &&
      (this.note() !== customer.note ||
        JSON.stringify(this.tags()) !== JSON.stringify(customer.tags))
    );
  });

  constructor() {
    effect(() => {
      if (this.id()) this.load();
    });
  }

  hasUnsavedChanges(): boolean {
    return this.dirty() && !this.saving();
  }

  load(): void {
    const id = this.id();
    if (!id) return;
    this.error.set('');
    this.api.get(id).subscribe({
      next: (customer) => this.apply(customer),
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  private apply(customer: AdminCustomer): void {
    this.customer.set(customer);
    this.note.set(customer.note);
    this.tags.set([...customer.tags]);
  }

  discard(): void {
    const customer = this.customer();
    if (customer) this.apply(customer);
  }

  save(): void {
    this.update({ note: this.note().trim(), tags: this.tags() }, 'Đã lưu ghi chú');
  }

  toggleBlock(customer: AdminCustomer): void {
    if (customer.status === 'blocked') {
      this.update({ status: 'active' }, 'Đã mở khóa tài khoản');
      return;
    }
    this.dialogs
      .confirm({
        title: `Khóa tài khoản ${customer.name}?`,
        message:
          'Khách sẽ không đăng nhập và đặt hàng được cho đến khi bạn mở khóa. Đơn đang xử lý không bị ảnh hưởng.',
        confirmLabel: 'Khóa tài khoản',
        danger: true,
      })
      .subscribe((ok) => ok && this.update({ status: 'blocked' }, 'Đã khóa tài khoản'));
  }

  private update(input: CustomerUpdate, message: string): void {
    const id = this.id();
    if (!id) return;
    this.saving.set(true);
    this.api.update(id, input).subscribe({
      next: (customer) => {
        this.saving.set(false);
        const keepDraft = !('note' in input) && this.dirty();
        const draft = { note: this.note(), tags: this.tags() };
        this.apply(customer);
        if (keepDraft) {
          this.note.set(draft.note);
          this.tags.set(draft.tags);
        }
        this.toast.show(message);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }
}
