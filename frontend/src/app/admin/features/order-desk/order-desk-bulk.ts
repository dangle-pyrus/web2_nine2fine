import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { concatMap, from, Observable, of, catchError, map, finalize } from 'rxjs';
import { AdminApiError } from '../../data-access/models';
import { ADMIN_ORDER_DESK_API } from '../../data-access/order-desk-api';
import {
  DESK_CARRIER_MAX,
  DESK_CARRIER_MIN,
  DESK_CARRIER_SUGGESTIONS,
  DESK_TRACKING_MAX,
  DESK_TRACKING_MIN,
  DESK_TRACKING_PATTERN,
  type DeskOrderSummary,
} from '../../data-access/order-desk-models';

const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `n2f-${Array.from(bytes, (byte) => KEY_ALPHABET[byte % KEY_ALPHABET.length]).join('')}`;
}

export interface BulkShipData {
  orders: DeskOrderSummary[];
}

/** How many orders went through; the page reloads after any of them did. */
export interface BulkShipResult {
  shipped: number;
  failed: number;
}

type RowState = { status: 'idle' | 'busy' | 'done' } | { status: 'failed'; message: string };

/**
 * ADM-ORD-19: hand over several `to_ship` orders at once. One carrier for the batch, one tracking
 * number per order; each order is sent on its own (same contract and checks as the single
 * "Bàn giao"), one after another, so a refused order never blocks the others.
 */
@Component({
  selector: 'adm-bulk-ship-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" role="group" aria-labelledby="bulk-ship-title" (ngSubmit)="submit()">
      <h2 id="bulk-ship-title">Bàn giao {{ orders.length }} đơn cho vận chuyển</h2>
      <p class="dialog-desc">
        Các đơn chuyển sang “Đang vận chuyển” và khách nhận email bàn giao. Không hoàn tác được.
      </p>
      <div class="dialog-body">
        <div class="field">
          <label for="bulk-carrier" class="req">Đơn vị vận chuyển</label>
          <input
            id="bulk-carrier"
            class="input"
            name="carrier"
            list="bulk-carriers"
            autocomplete="off"
            [ngModel]="carrier()"
            (ngModelChange)="carrier.set($event)"
            [disabled]="busy()"
            [attr.aria-invalid]="!!carrierError()"
          />
          <datalist id="bulk-carriers">
            @for (name of carriers; track name) {
              <option [value]="name"></option>
            }
          </datalist>
          @if (carrierError(); as message) {
            <p class="error">{{ message }}</p>
          }
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Người nhận</th>
              <th>Mã vận đơn</th>
            </tr>
          </thead>
          <tbody>
            @for (order of orders; track order.id; let i = $index) {
              <tr>
                <td class="mono">#{{ order.id }}</td>
                <td>{{ order.recipientName }}</td>
                <td>
                  <input
                    class="input input--sm mono"
                    [name]="'tracking-' + i"
                    autocomplete="off"
                    [attr.aria-label]="'Mã vận đơn đơn ' + order.id"
                    [ngModel]="tracking()[i]"
                    (ngModelChange)="setTracking(i, $event)"
                    [disabled]="busy() || rows()[i].status === 'done'"
                    [attr.aria-invalid]="!!trackingErrors()[i]"
                  />
                  @if (trackingErrors()[i]; as message) {
                    <p class="error small">{{ message }}</p>
                  }
                  @switch (rows()[i].status) {
                    @case ('done') {
                      <p class="small success-text">Đã bàn giao</p>
                    }
                    @case ('failed') {
                      <p class="error small">{{ failure(i) }}</p>
                    }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <p class="hint">
          Mỗi đơn một mã vận đơn, {{ min }}-{{ max }} ký tự gồm chữ, số và dấu gạch ngang; không
          trùng nhau.
        </p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" [disabled]="busy()" (click)="close()">
          {{ finished() ? 'Xong' : 'Đóng' }}
        </button>
        @if (!finished()) {
          <button
            type="submit"
            class="adm-btn adm-btn--primary"
            [class.is-busy]="busy()"
            [disabled]="busy()"
          >
            Bàn giao {{ pending() }} đơn
          </button>
        }
      </div>
    </form>
  `,
  styles: `
    .table td {
      vertical-align: top;
    }
    .success-text {
      color: var(--adm-success, #1a7f37);
    }
  `,
})
export class BulkShipDialog {
  private readonly ref = inject<DialogRef<BulkShipResult>>(DialogRef);
  private readonly api = inject(ADMIN_ORDER_DESK_API);
  protected readonly orders = inject<BulkShipData>(DIALOG_DATA).orders;
  protected readonly carriers = DESK_CARRIER_SUGGESTIONS;
  protected readonly min = DESK_TRACKING_MIN;
  protected readonly max = DESK_TRACKING_MAX;

  protected readonly carrier = signal('');
  protected readonly tracking = signal<string[]>(this.orders.map(() => ''));
  protected readonly rows = signal<RowState[]>(this.orders.map(() => ({ status: 'idle' })));
  protected readonly busy = signal(false);
  protected readonly carrierError = signal('');
  protected readonly trackingErrors = signal<string[]>(this.orders.map(() => ''));
  private readonly keys = this.orders.map(() => newKey());

  protected readonly pending = computed(
    () => this.rows().filter((row) => row.status !== 'done').length,
  );
  protected readonly finished = computed(() => this.pending() === 0);

  protected setTracking(index: number, value: string): void {
    this.tracking.update((list) => list.map((item, i) => (i === index ? value : item)));
  }

  protected failure(index: number): string {
    const row = this.rows()[index];
    return row.status === 'failed' ? row.message : '';
  }

  protected close(): void {
    const rows = this.rows();
    this.ref.close({
      shipped: rows.filter((row) => row.status === 'done').length,
      failed: rows.filter((row) => row.status === 'failed').length,
    });
  }

  protected submit(): void {
    if (this.busy() || !this.validate()) return;
    const carrier = this.carrier().trim();
    const todo = this.orders
      .map((order, index) => ({ order, index }))
      .filter(({ index }) => this.rows()[index].status !== 'done');
    this.busy.set(true);
    this.ref.disableClose = true;
    from(todo)
      .pipe(
        concatMap(({ order, index }) => this.shipOne(order, index, carrier)),
        finalize(() => {
          this.busy.set(false);
          this.ref.disableClose = false;
        }),
      )
      .subscribe();
  }

  private shipOne(order: DeskOrderSummary, index: number, carrier: string): Observable<void> {
    this.setRow(index, { status: 'busy' });
    const trackingNumber = this.tracking()[index].trim();
    return this.api
      .perform(
        order.id,
        { action: 'ship', expectedStatus: 'to_ship', carrier, trackingNumber },
        this.keys[index],
      )
      .pipe(
        map(() => this.setRow(index, { status: 'done' })),
        catchError((error: unknown) => {
          // A refused body needs a new key when it is sent again with other content.
          this.keys[index] = newKey();
          const message =
            error instanceof AdminApiError
              ? (Object.values(error.fields)[0] ?? shipRefusal(error.code, error.message))
              : 'Không kết nối được máy chủ.';
          this.setRow(index, { status: 'failed', message });
          return of(undefined);
        }),
      );
  }

  private setRow(index: number, state: RowState): void {
    this.rows.update((list) => list.map((row, i) => (i === index ? state : row)));
  }

  private validate(): boolean {
    const carrier = this.carrier().trim();
    this.carrierError.set(
      carrier.length < DESK_CARRIER_MIN || carrier.length > DESK_CARRIER_MAX
        ? `Đơn vị vận chuyển từ ${DESK_CARRIER_MIN} đến ${DESK_CARRIER_MAX} ký tự.`
        : '',
    );
    const values = this.tracking().map((value) => value.trim().toUpperCase());
    const errors = values.map((value, index) => {
      if (this.rows()[index].status === 'done') return '';
      if (
        value.length < DESK_TRACKING_MIN ||
        value.length > DESK_TRACKING_MAX ||
        !DESK_TRACKING_PATTERN.test(value)
      )
        return `Mã vận đơn từ ${DESK_TRACKING_MIN} đến ${DESK_TRACKING_MAX} ký tự, chỉ chữ, số và dấu gạch ngang.`;
      if (values.indexOf(value) !== index) return 'Mã vận đơn trùng với đơn khác trong danh sách.';
      return '';
    });
    this.trackingErrors.set(errors);
    return !this.carrierError() && errors.every((error) => !error);
  }
}

function shipRefusal(code: string, message: string): string {
  switch (code) {
    case 'order-state-changed':
    case 'invalid-transition':
      return 'Đơn đã đổi trạng thái, không bàn giao được nữa.';
    case 'condition-not-met':
      return 'Đơn cần gọi xác nhận trước khi bàn giao.';
    case 'forbidden':
      return 'Tài khoản không có quyền bàn giao.';
    default:
      return message || 'Chưa bàn giao được đơn này.';
  }
}

export type ExportScope = 'page' | 'selected' | 'all';

export interface ExportDialogData {
  pageCount: number;
  selectedCount: number;
  matchingCount: number;
}

/** ADM-ORD-18: choose what goes into the CSV. "Đơn đã chọn" only when something is ticked. */
@Component({
  selector: 'adm-order-export-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form
      class="dialog"
      role="group"
      aria-labelledby="export-title"
      (ngSubmit)="ref.close(scope())"
    >
      <h2 id="export-title">Xuất danh sách đơn (CSV)</h2>
      <div class="dialog-body">
        <fieldset class="field scopes">
          <legend class="field-label">Phạm vi</legend>
          <label class="check">
            <input
              type="radio"
              name="scope"
              value="page"
              [checked]="scope() === 'page'"
              (change)="scope.set('page')"
            />
            <span>Trang hiện tại ({{ data.pageCount }} đơn)</span>
          </label>
          <label class="check">
            <input
              type="radio"
              name="scope"
              value="selected"
              [disabled]="!data.selectedCount"
              [checked]="scope() === 'selected'"
              (change)="scope.set('selected')"
            />
            <span>Đơn đã chọn ({{ data.selectedCount }} đơn)</span>
          </label>
          <label class="check">
            <input
              type="radio"
              name="scope"
              value="all"
              [checked]="scope() === 'all'"
              (change)="scope.set('all')"
            />
            <span
              >Tất cả đơn khớp bộ lọc ({{ data.matchingCount }} đơn{{
                data.matchingCount > 5000 ? ', tối đa 5.000' : ''
              }})</span
            >
          </label>
        </fieldset>
        <p class="hint">Tệp UTF-8, mở được bằng Excel; tên tệp theo ngày xuất.</p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Đóng</button>
        <button type="submit" class="adm-btn adm-btn--primary">Xuất CSV</button>
      </div>
    </form>
  `,
  styles: `
    .scopes {
      border: 0;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
    }
  `,
})
export class ExportDialog {
  protected readonly ref = inject<DialogRef<ExportScope>>(DialogRef);
  protected readonly data = inject<ExportDialogData>(DIALOG_DATA);
  protected readonly scope = signal<ExportScope>(this.data.selectedCount ? 'selected' : 'page');
}
