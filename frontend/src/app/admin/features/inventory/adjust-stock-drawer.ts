import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DateTimePipe } from '../../core/format.pipes';
import { API_CONFIG } from '../../../core/api-config';
import { ADMIN_INVENTORY_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import { newIdempotencyKey } from '../../data-access/inventory-api';
import { AdminApiError } from '../../data-access/models';
import type { AdjustmentReason, InventoryItem, InventoryMovement } from '../../data-access/models';
import type { SyncState } from '../../data-access/marketplace-demo';
import { AdmIcon } from '../../ui/icon';

const REASONS: { value: AdjustmentReason; label: string }[] = [
  { value: 'received', label: 'Nhập hàng' },
  { value: 'count', label: 'Kiểm kho' },
  { value: 'damaged', label: 'Hư hỏng, lỗi' },
  { value: 'return', label: 'Hàng trả về nhập lại' },
  { value: 'correction', label: 'Sửa sai số liệu' },
];

const MOVEMENT_LABELS: Record<InventoryMovement['reason'], string> = {
  received: 'Nhập hàng',
  count: 'Kiểm kho',
  damaged: 'Hư hỏng',
  return: 'Hàng trả về',
  correction: 'Sửa sai',
  order: 'Bán theo đơn',
  cancel: 'Đơn hủy, hoàn kho',
};

export interface AdjustStockData {
  item: InventoryItem;
  canAdjust: boolean;
  canThresholds: boolean;
  /** What each channel shows for this SKU (marketplaces are demo figures). */
  channels: {
    key: string;
    name: string;
    logo: string;
    linked: boolean;
    connected: boolean;
    listed: number;
    expected: number;
    state: SyncState;
    /** How the figure follows from "Có thể bán", e.g. "30% của 5 − 1 tồn đệm". */
    note: string;
  }[];
  /** Opens the threshold dialog for this SKU; the drawer closes first. */
  editThreshold: () => void;
}

/** Stock adjustment drawer (6.4): add/remove or set a counted number, with a reason, plus history. */
@Component({
  selector: 'adm-adjust-stock-drawer',
  imports: [FormsModule, AdmIcon, DateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm' },
  template: `
    <div class="drawer od">
      <header>
        <div>
          <h2>{{ item().productName }}</h2>
          <p class="small secondary meta-list">
            <span>{{ item().color.name }} / {{ item().size }}</span>
            <span class="mono">SKU {{ item().sku }}</span>
          </p>
        </div>
        <button
          type="button"
          class="adm-btn adm-btn--sm adm-btn--icon"
          aria-label="Đóng"
          (click)="ref.close()"
        >
          <adm-icon name="reiconX" [size]="16" />
        </button>
      </header>
      <div class="drawer-body">
        <section class="section">
          <header>
            <h2>Sản phẩm</h2>
          </header>
          <div class="frame">
            <ul class="info">
              <li>
                <adm-icon name="reiconTshirt" [size]="18" />
                <a
                  class="link"
                  [href]="'/admin/products/' + item().productId"
                  (click)="openProduct($event)"
                  >Xem chi tiết sản phẩm</a
                >
              </li>
              <li>
                <adm-icon name="reiconTag" [size]="18" />
                <span class="mono">{{ item().sku }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="section">
          <header>
            <h2>Tồn kho</h2>
          </header>
          <div class="frame">
            <ul class="info">
              <li>
                <adm-icon name="reiconBox" [size]="18" />
                <span>Trong kho</span>
                <strong class="num push">{{ item().onHand }}</strong>
              </li>
              <li>
                <adm-icon name="reiconLock" [size]="18" />
                <span>Đang giữ cho đơn chưa giao</span>
                <strong class="num push">{{ item().reserved }}</strong>
              </li>
              <li>
                <adm-icon name="reiconCheckCircle" [size]="18" />
                <span>Có thể bán</span>
                <strong class="num push">{{ item().available }}</strong>
              </li>
              <li>
                <adm-icon name="reiconAlertTriangle" [size]="18" />
                <span>Ngưỡng sắp hết</span>
                <strong class="num push">{{ item().lowStockThreshold }}</strong>
                @if (data.canThresholds) {
                  <button type="button" class="link" (click)="changeThreshold()">Đổi</button>
                }
              </li>
            </ul>
          </div>
          @if (data.canAdjust && item().status !== 'in') {
            <button type="button" class="frame restock" (click)="restock()">
              <adm-icon name="reiconPackage" [size]="18" />
              <span
                >{{ item().status === 'out' ? 'Đã hết hàng' : 'Sắp hết hàng' }}. Nhập thêm
                hàng</span
              >
            </button>
          }
        </section>

        <section class="section">
          <header>
            <h2>Số lượng trên các kênh</h2>
          </header>
          <div class="frame">
            <ul class="info">
              @for (ch of data.channels; track ch.key) {
                <li>
                  <img class="ch-logo" [src]="ch.logo" [alt]="ch.name" />
                  <div class="ch-info push">
                    @if (!ch.connected) {
                      <span class="secondary">Kênh chưa kết nối</span>
                    } @else if (!ch.linked) {
                      <span class="secondary">Chưa liên kết</span>
                      <button type="button" class="link small" (click)="openChannel(ch.key)">
                        Liên kết
                      </button>
                    } @else {
                      <strong class="num">{{ ch.listed }}</strong>
                      @if (ch.listed !== ch.expected) {
                        <span class="small bad">
                          Đang hiện {{ ch.listed }}, đúng ra {{ ch.expected }} ·
                          {{ ch.state === 'error' ? 'Lỗi đồng bộ' : 'Chờ đẩy' }}
                        </span>
                      } @else {
                        <span class="small secondary">{{ ch.note }}</span>
                      }
                    }
                  </div>
                </li>
              }
            </ul>
          </div>
        </section>

        @if (data.canAdjust) {
          <section class="section">
            <header>
              <h2>Điều chỉnh tồn kho</h2>
            </header>
            <div class="frame">
              <form id="adjust-form" class="stack" (ngSubmit)="submit()">
                <div class="segmented" role="group" aria-label="Cách điều chỉnh">
                  <button
                    type="button"
                    [class.is-active]="mode() === 'delta'"
                    [attr.aria-pressed]="mode() === 'delta'"
                    (click)="setMode('delta')"
                  >
                    Thêm / bớt
                  </button>
                  <button
                    type="button"
                    [class.is-active]="mode() === 'set'"
                    [attr.aria-pressed]="mode() === 'set'"
                    (click)="setMode('set')"
                  >
                    Đặt số đếm được
                  </button>
                </div>
                <div class="field">
                  <label class="req" for="adj-qty">{{
                    mode() === 'delta' ? 'Số lượng thay đổi' : 'Số lượng thực tế'
                  }}</label>
                  <input
                    id="adj-qty"
                    class="input"
                    type="number"
                    name="qty"
                    [min]="mode() === 'set' ? 0 : null"
                    step="1"
                    [ngModel]="quantity()"
                    (ngModelChange)="setQuantity($event)"
                    [attr.aria-invalid]="tried() && !!error()"
                  />
                  @if (tried() && error(); as message) {
                    <p class="error">{{ message }}</p>
                  } @else {
                    <p class="hint">
                      {{
                        mode() === 'delta' ? 'Nhập số âm để bớt, ví dụ -2.' : 'Dùng khi kiểm kho.'
                      }}
                      Sau điều chỉnh: <strong>{{ after() }}</strong> trong kho → Có thể bán
                      <strong>{{ afterAvailable() }}</strong
                      >.
                    </p>
                  }
                </div>
                <div class="field">
                  <label class="req" for="adj-reason">Lý do</label>
                  <select
                    id="adj-reason"
                    class="select"
                    name="reason"
                    [ngModel]="reason()"
                    (ngModelChange)="reason.set($event); reasonError.set(''); changed()"
                    [attr.aria-invalid]="!!reasonError()"
                  >
                    @for (item of allowedReasons(); track item.value) {
                      <option [value]="item.value">{{ item.label }}</option>
                    }
                  </select>
                  @if (reasonError(); as message) {
                    <p class="error" role="alert">{{ message }}</p>
                  }
                </div>
                <div class="field">
                  <label for="adj-note" [class.req]="reason() === 'correction'">Ghi chú</label>
                  <input
                    id="adj-note"
                    class="input"
                    name="note"
                    maxlength="200"
                    placeholder="Ví dụ: Lô nhập 12/10"
                    [ngModel]="note()"
                    (ngModelChange)="note.set($event); changed()"
                    [attr.aria-invalid]="tried() && !!noteError()"
                  />
                  @if (tried() && noteError(); as message) {
                    <p class="error">{{ message }}</p>
                  }
                </div>
                @if (serverError()) {
                  <p class="error" role="alert">{{ serverError() }}</p>
                }
              </form>
            </div>
          </section>
        }

        <section class="section">
          <header>
            <h2>Lịch sử</h2>
          </header>
          <div class="frame">
            @if (history() === null) {
              <div class="sk"></div>
              <div class="sk"></div>
            } @else if (!history()!.length) {
              <p class="secondary">Chưa có thay đổi nào.</p>
            } @else {
              <ul class="history">
                @for (move of history(); track move.id) {
                  <li>
                    <div>
                      <p>
                        {{ labels[move.reason] }}
                        @if (move.note) {
                          <span class="secondary">({{ move.note }})</span>
                        }
                      </p>
                      <p class="small tertiary">
                        {{ move.at | admDateTime }} bởi {{ move.author }}
                      </p>
                    </div>
                    <p class="num change" [class.minus]="move.change < 0">
                      {{ move.change > 0 ? '+' : '' }}{{ move.change }}
                    </p>
                    <p class="num small secondary">
                      @if (move.after === null) {
                        —
                      } @else {
                        còn {{ move.after }}
                      }
                    </p>
                  </li>
                }
              </ul>
            }
          </div>
        </section>
      </div>
      <footer>
        <button type="button" class="adm-btn adm-btn--lg" (click)="ref.close()">Đóng</button>
        @if (data.canAdjust) {
          <button
            type="submit"
            form="adjust-form"
            class="adm-btn adm-btn--lg adm-btn--primary push"
            [class.is-busy]="saving()"
          >
            Lưu điều chỉnh
          </button>
        }
      </footer>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .drawer > footer {
      justify-content: flex-start;
      box-shadow: 0 -8px 16px -8px rgba(0, 0, 0, 0.1);
    }
    .push {
      margin-left: auto;
    }
    .frame {
      padding: 16px;
      border-radius: var(--adm-radius-lg);
      background: var(--adm-muted);
    }
    .info {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
      li {
        display: flex;
        align-items: center;
        gap: 10px;
        adm-icon {
          color: var(--adm-text-tertiary);
        }
      }
    }
    .restock {
      width: 100%;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      border: 0;
      font: inherit;
      text-align: left;
      cursor: pointer;
      adm-icon {
        color: var(--adm-text-tertiary);
      }
    }
    .ch-info {
      display: grid;
      justify-items: end;
      gap: 2px;
      text-align: right;
    }
    .bad {
      color: var(--adm-critical-fg);
    }
    .ch-logo {
      height: 18px;
      max-width: 96px;
      object-fit: contain;
    }
    .segmented {
      display: inline-flex;
      justify-self: start;
      padding: 2px;
      border-radius: var(--adm-radius-full);
      background: var(--adm-bg);
    }
    .segmented button {
      height: 30px;
      padding: 0 14px;
      border: 0;
      border-radius: var(--adm-radius-full);
      background: transparent;
      font: inherit;
      font-size: 13px;
      color: var(--adm-text-secondary);
      cursor: pointer;
    }
    .segmented .is-active {
      background: var(--adm-muted);
      color: var(--adm-text);
    }
    .history {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 14px;
    }
    .history li {
      display: grid;
      grid-template-columns: 1fr auto 64px;
      gap: 12px;
      align-items: center;
    }
    .change {
      font-weight: 500;
    }
    .change.minus {
      color: var(--adm-danger);
    }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class AdjustStockDrawer {
  private readonly api = inject(ADMIN_INVENTORY_API);
  private readonly router = inject(Router);
  private readonly contract = inject(API_CONFIG).adminCatalogMode === 'http';
  readonly ref = inject<DialogRef<InventoryItem>>(DialogRef);
  readonly data = inject<AdjustStockData>(DIALOG_DATA);
  /** The row as the person sees it; `stock-changed` replaces it with the current numbers. */
  readonly item = signal<InventoryItem>(this.data.item);
  /** One key per intent (BR-INV-33): kept on a retry, renewed when the person edits the form. */
  private idempotencyKey = newIdempotencyKey();
  protected readonly labels = MOVEMENT_LABELS;
  readonly mode = signal<'delta' | 'set'>('delta');
  readonly quantity = signal<number | null>(null);
  readonly reason = signal<AdjustmentReason>('received');
  readonly note = signal('');
  readonly tried = signal(false);
  readonly saving = signal(false);
  readonly serverError = signal('');
  readonly reasonError = signal('');
  readonly history = signal<InventoryMovement[] | null>(null);

  readonly after = computed(() => {
    const quantity = Number(this.quantity() ?? 0) || 0;
    return this.mode() === 'delta' ? this.item().onHand + quantity : quantity;
  });
  readonly afterAvailable = computed(() => this.after() - this.item().reserved);
  readonly error = computed(() => {
    const quantity = this.quantity();
    if (quantity === null || String(quantity) === '' || !Number.isInteger(Number(quantity)))
      return 'Nhập một số nguyên.';
    if (this.mode() === 'delta' && Number(quantity) === 0) return 'Số lượng thay đổi phải khác 0.';
    if (this.contract) {
      if (this.mode() === 'delta' && Math.abs(Number(quantity)) > 10_000)
        return 'Mỗi lần thêm hoặc bớt tối đa 10.000.';
      if (this.mode() === 'set' && Number(quantity) > 100_000) return 'Số đếm tối đa 100.000.';
      if (this.mode() === 'delta' && this.item().available + Number(quantity) < 0)
        return `Chỉ còn ${this.item().available} có thể bán.`;
    }
    if (this.after() < this.item().reserved)
      return `Không thể thấp hơn ${this.item().reserved} đang giữ cho đơn chưa giao.`;
    return '';
  });
  /** BR-INV-32: which reasons fit the way (add/remove or set) and the sign of the quantity. */
  readonly allowedReasons = computed(() => {
    const quantity = Number(this.quantity() ?? 0) || 0;
    const mode = this.mode();
    return REASONS.filter(({ value }) => {
      if (mode === 'set') return value === 'count' || value === 'correction';
      if (value === 'count') return false;
      if (quantity > 0) return value !== 'damaged';
      if (quantity < 0) return value === 'damaged' || value === 'correction';
      return true;
    });
  });

  protected openProduct(event: Event): void {
    event.preventDefault();
    this.ref.close();
    void this.router.navigate(['/admin/products', this.item().productId]);
  }

  protected openChannel(key: string): void {
    this.ref.close();
    void this.router.navigate(['/admin/inventory/channels', key], {
      queryParams: { q: this.item().sku },
    });
  }

  /** Low or out of stock: the form is ready to receive goods. */
  protected restock(): void {
    this.setMode('delta');
    this.reason.set('received');
    document.getElementById('adj-qty')?.focus();
  }

  protected changeThreshold(): void {
    this.ref.close();
    this.data.editThreshold();
  }

  protected setMode(mode: 'delta' | 'set'): void {
    this.mode.set(mode);
    this.syncReason();
    this.changed();
  }

  protected setQuantity(value: number | null): void {
    this.quantity.set(value);
    this.syncReason();
    this.changed();
  }

  /** Keeps the reason valid for the chosen way and sign; picks the natural one when it is not. */
  private syncReason(): void {
    const allowed = this.allowedReasons();
    if (allowed.some((item) => item.value === this.reason())) return;
    const quantity = Number(this.quantity() ?? 0) || 0;
    const preferred: AdjustmentReason =
      this.mode() === 'set' ? 'count' : quantity < 0 ? 'damaged' : 'received';
    this.reason.set(allowed.find((item) => item.value === preferred)?.value ?? allowed[0].value);
    this.reasonError.set('');
  }

  /** "Sửa sai" needs a note (S6-Q6). */
  readonly noteError = computed(() =>
    this.contract && this.reason() === 'correction' && !this.note().trim()
      ? 'Ghi chú là bắt buộc với lý do "Sửa sai số liệu".'
      : '',
  );

  constructor() {
    this.api
      .history(this.data.item.variantId)
      .subscribe({ next: (moves) => this.history.set(moves), error: () => this.history.set([]) });
  }

  /** The person changed the form, so this is a new intent and needs a new key. */
  protected changed(): void {
    this.idempotencyKey = newIdempotencyKey();
  }

  submit(): void {
    this.tried.set(true);
    if (this.error() || this.noteError()) return;
    this.saving.set(true);
    this.serverError.set('');
    this.reasonError.set('');
    const mode = this.mode();
    this.api
      .adjust(this.item().variantId, {
        mode,
        quantity: Number(this.quantity()),
        reason: this.reason(),
        note: this.note().trim(),
        ...(this.contract
          ? {
              idempotencyKey: this.idempotencyKey,
              ...(mode === 'set' ? { expectedAvailable: this.item().available } : {}),
            }
          : {}),
      })
      .subscribe({
        next: (item) => this.ref.close(item),
        error: (error: unknown) => {
          this.saving.set(false);
          // BR-INV-33: someone else moved the stock. Show the current numbers, keep the input.
          if (
            error instanceof AdminApiError &&
            error.code === 'stock-changed' &&
            error.detail.available !== undefined &&
            error.detail.reserved !== undefined
          ) {
            const { available, reserved } = error.detail;
            this.item.update((row) => ({
              ...row,
              available,
              reserved,
              onHand: available + reserved,
            }));
            this.idempotencyKey = newIdempotencyKey();
            this.serverError.set(
              `Tồn kho vừa thay đổi: còn ${available} có thể bán, ${reserved} đang giữ. Kiểm tra số đếm rồi lưu lại.`,
            );
            return;
          }
          const reasonMessage = error instanceof AdminApiError ? error.fields['reason'] : '';
          if (reasonMessage) {
            this.reasonError.set(reasonMessage);
            return;
          }
          this.serverError.set(errorMessage(error));
        },
      });
  }
}
