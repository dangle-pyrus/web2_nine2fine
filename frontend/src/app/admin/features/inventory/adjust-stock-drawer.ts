import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DateTimePipe } from '../../core/format.pipes';
import { ADMIN_INVENTORY_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { AdjustmentReason, InventoryItem, InventoryMovement } from '../../data-access/models';
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

/** Stock adjustment drawer (6.4): add/remove or set a counted number, with a reason, plus history. */
@Component({
  selector: 'adm-adjust-stock-drawer',
  imports: [FormsModule, AdmIcon, DateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <div class="drawer">
      <header>
        <div>
          <h2>{{ data.item.productName }}</h2>
          <p class="small secondary">
            {{ data.item.color.name }} / {{ data.item.size }} ·
            <span class="mono">{{ data.item.sku }}</span>
          </p>
        </div>
        <button
          type="button"
          class="adm-btn adm-btn--icon adm-btn--ghost"
          aria-label="Đóng"
          (click)="ref.close()"
        >
          <adm-icon name="reiconX" />
        </button>
      </header>
      <div class="drawer-body">
        <dl class="stats">
          <div>
            <dt>Trong kho</dt>
            <dd>{{ data.item.onHand }}</dd>
          </div>
          <div>
            <dt>Đang giữ</dt>
            <dd>{{ data.item.reserved }}</dd>
          </div>
          <div>
            <dt>Có thể bán</dt>
            <dd>{{ data.item.available }}</dd>
          </div>
        </dl>

        @if (data.canAdjust) {
          <form class="stack" (ngSubmit)="submit()">
            <div class="segmented" role="group" aria-label="Cách điều chỉnh">
              <button
                type="button"
                [class.is-active]="mode() === 'delta'"
                (click)="mode.set('delta')"
              >
                Thêm / bớt
              </button>
              <button type="button" [class.is-active]="mode() === 'set'" (click)="mode.set('set')">
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
                (ngModelChange)="quantity.set($event)"
                [attr.aria-invalid]="tried() && !!error()"
              />
              @if (tried() && error(); as message) {
                <p class="error">{{ message }}</p>
              } @else {
                <p class="hint">
                  {{ mode() === 'delta' ? 'Nhập số âm để bớt, ví dụ -2.' : 'Dùng khi kiểm kho.' }}
                  Sau điều chỉnh: <strong>{{ after() }}</strong> trong kho.
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
                (ngModelChange)="reason.set($event)"
              >
                @for (item of reasons; track item.value) {
                  <option [value]="item.value">{{ item.label }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="adj-note">Ghi chú</label>
              <input
                id="adj-note"
                class="input"
                name="note"
                placeholder="Ví dụ: Lô nhập 12/10"
                [ngModel]="note()"
                (ngModelChange)="note.set($event)"
              />
            </div>
            @if (serverError()) {
              <p class="error">{{ serverError() }}</p>
            }
            <button type="submit" class="adm-btn adm-btn--primary" [class.is-busy]="saving()">
              Lưu điều chỉnh
            </button>
          </form>
        }

        <section>
          <h3 class="history-title">Lịch sử</h3>
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
                        <span class="secondary"> · {{ move.note }}</span>
                      }
                    </p>
                    <p class="small tertiary">{{ move.at | admDateTime }} · {{ move.author }}</p>
                  </div>
                  <p class="num change" [class.minus]="move.change < 0">
                    {{ move.change > 0 ? '+' : '' }}{{ move.change }}
                  </p>
                  <p class="num small secondary">còn {{ move.after }}</p>
                </li>
              }
            </ul>
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 0;
    }
    .stats div {
      padding: 12px;
      border-radius: var(--adm-radius-lg);
      background: var(--adm-muted);
    }
    .stats dt {
      font-size: 12px;
      color: var(--adm-text-secondary);
    }
    .stats dd {
      margin: 2px 0 0;
      font-size: 20px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .segmented {
      display: inline-flex;
      justify-self: start;
      padding: 2px;
      border-radius: var(--adm-radius-full);
      background: var(--adm-muted);
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
      background: var(--adm-bg);
      color: var(--adm-text);
      box-shadow: var(--adm-shadow-xs);
    }
    form .adm-btn--primary {
      justify-self: start;
    }
    .history-title {
      font-size: 14px;
      font-weight: 500;
      margin: 8px 0;
    }
    .history {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .history li {
      display: grid;
      grid-template-columns: 1fr auto 64px;
      gap: 12px;
      align-items: center;
      padding: 10px 0;
      border-top: 1px solid var(--adm-divider);
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
  readonly ref = inject<DialogRef<InventoryItem>>(DialogRef);
  readonly data = inject<{ item: InventoryItem; canAdjust: boolean }>(DIALOG_DATA);
  protected readonly reasons = REASONS;
  protected readonly labels = MOVEMENT_LABELS;
  readonly mode = signal<'delta' | 'set'>('delta');
  readonly quantity = signal<number | null>(null);
  readonly reason = signal<AdjustmentReason>('received');
  readonly note = signal('');
  readonly tried = signal(false);
  readonly saving = signal(false);
  readonly serverError = signal('');
  readonly history = signal<InventoryMovement[] | null>(null);

  readonly after = computed(() => {
    const quantity = Number(this.quantity() ?? 0) || 0;
    return this.mode() === 'delta' ? this.data.item.onHand + quantity : quantity;
  });
  readonly error = computed(() => {
    const quantity = this.quantity();
    if (quantity === null || String(quantity) === '' || !Number.isInteger(Number(quantity)))
      return 'Nhập một số nguyên.';
    if (this.mode() === 'delta' && Number(quantity) === 0) return 'Số lượng thay đổi phải khác 0.';
    if (this.after() < this.data.item.reserved)
      return `Không thể thấp hơn ${this.data.item.reserved} đang giữ cho đơn chưa giao.`;
    return '';
  });

  constructor() {
    this.api
      .history(this.data.item.variantId)
      .subscribe({ next: (moves) => this.history.set(moves), error: () => this.history.set([]) });
  }

  submit(): void {
    this.tried.set(true);
    if (this.error()) return;
    this.saving.set(true);
    this.serverError.set('');
    this.api
      .adjust(this.data.item.variantId, {
        mode: this.mode(),
        quantity: Number(this.quantity()),
        reason: this.reason(),
        note: this.note().trim(),
      })
      .subscribe({
        next: (item) => this.ref.close(item),
        error: (error: unknown) => {
          this.saving.set(false);
          this.serverError.set(errorMessage(error));
        },
      });
  }
}
