import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isoDay, money } from '../../core/format';
import { MoneyPipe } from '../../core/format.pipes';

const CARRIERS = ['GHN', 'GHTK', 'Viettel Post'];

/** Hand-over to the carrier: one carrier + ETA, a tracking code per order (6.7). */
@Component({
  selector: 'adm-ship-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>
        {{
          data.ids.length > 1
            ? 'Bàn giao ' + data.ids.length + ' đơn cho vận chuyển'
            : 'Bàn giao cho vận chuyển'
        }}
      </h2>
      <p class="dialog-desc">Đơn chuyển sang "Đang vận chuyển" và khách nhận được mã vận đơn.</p>
      <div class="dialog-body">
        <div class="form-grid">
          <div class="field">
            <label for="carrier">Hãng vận chuyển</label>
            <select id="carrier" class="select" name="carrier" [(ngModel)]="carrier">
              @for (item of carriers; track item) {
                <option [value]="item">{{ item }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="eta">Dự kiến giao</label>
            <input
              id="eta"
              class="input"
              type="date"
              name="eta"
              [min]="today"
              [(ngModel)]="eta"
              required
            />
          </div>
        </div>
        @for (id of data.ids; track id) {
          <div class="field">
            <label class="req" [for]="'code-' + id"
              >Mã vận đơn{{ data.ids.length > 1 ? ' · #' + id : '' }}</label
            >
            <input
              [id]="'code-' + id"
              class="input mono"
              [name]="'code-' + id"
              autocomplete="off"
              [ngModel]="codes()[id] ?? ''"
              (ngModelChange)="setCode(id, $event)"
              [attr.aria-invalid]="tried() && !codes()[id]?.trim()"
            />
            @if (tried() && !codes()[id]?.trim()) {
              <p class="error">Nhập mã vận đơn của {{ carrier }}.</p>
            }
          </div>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary">Bàn giao vận chuyển</button>
      </div>
    </form>
  `,
})
export class ShipDialog {
  readonly ref = inject(DialogRef);
  readonly data = inject<{ ids: string[] }>(DIALOG_DATA);
  protected readonly carriers = CARRIERS;
  protected readonly today = isoDay(Date.now());
  carrier = CARRIERS[0];
  eta = isoDay(Date.now() + 3 * 86_400_000);
  readonly codes = signal<Record<string, string>>({});
  readonly tried = signal(false);

  setCode(id: string, value: string): void {
    this.codes.update((codes) => ({ ...codes, [id]: value }));
  }

  submit(): void {
    this.tried.set(true);
    if (this.data.ids.some((id) => !this.codes()[id]?.trim())) return;
    this.ref.close({
      carrier: this.carrier,
      estimatedAt: new Date(`${this.eta}T17:00:00+07:00`).toISOString(),
      codes: this.codes(),
    });
  }
}

const CANCEL_REASONS = [
  'Hết hàng',
  'Khách yêu cầu hủy',
  'Không liên lạc được khách',
  'Nghi ngờ đơn ảo',
  'Khác',
];

/** Cancelling cannot be undone: the dialog states the consequence and the red button names it (5.8). */
@Component({
  selector: 'adm-cancel-dialog',
  imports: [FormsModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>Hủy đơn #{{ data.id }}?</h2>
      <p class="dialog-desc">
        Khách sẽ nhận thông báo đơn bị hủy. Thao tác này không hoàn tác được.
      </p>
      <div class="dialog-body">
        <div class="field">
          <label for="reason" class="req">Lý do hủy</label>
          <select id="reason" class="select" name="reason" [(ngModel)]="reason">
            <option value="" disabled>Chọn lý do</option>
            @for (item of reasons; track item) {
              <option [value]="item">{{ item }}</option>
            }
          </select>
        </div>
        @if (reason === 'Khác') {
          <div class="field">
            <label for="other" class="req">Lý do khác</label>
            <input id="other" class="input" name="other" [(ngModel)]="other" />
          </div>
        }
        @if (data.paid) {
          <label class="check">
            <input type="checkbox" name="refund" [(ngModel)]="refund" />
            <span
              >Hoàn {{ data.total | admMoney }} về phương thức khách đã thanh toán<span
                class="check-desc"
                >Bỏ chọn nếu bạn hoàn tiền thủ công.</span
              ></span
            >
          </label>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Giữ đơn</button>
        <button type="submit" class="adm-btn adm-btn--danger" [disabled]="!value()">Hủy đơn</button>
      </div>
    </form>
  `,
})
export class CancelDialog {
  readonly ref = inject(DialogRef);
  readonly data = inject<{ id: string; paid: boolean; total: number }>(DIALOG_DATA);
  protected readonly reasons = CANCEL_REASONS;
  reason = '';
  other = '';
  refund = true;
  value(): string {
    return this.reason === 'Khác' ? this.other.trim() : this.reason;
  }
  submit(): void {
    if (this.value())
      this.ref.close({ reason: this.value(), refund: this.data.paid && this.refund });
  }
}

/** Approve or reject a return request; rejecting needs a reason the shopper will read. */
@Component({
  selector: 'adm-return-decision-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>
        {{ data.decision === 'approved' ? 'Duyệt yêu cầu trả hàng?' : 'Từ chối yêu cầu trả hàng?' }}
      </h2>
      <p class="dialog-desc">
        {{
          data.decision === 'approved'
            ? 'Khách nhận hướng dẫn gửi hàng về. Bạn hoàn tiền sau khi nhận và kiểm tra hàng.'
            : 'Đơn quay về "Hoàn thành". Khách thấy lý do bạn nhập dưới đây.'
        }}
      </p>
      <div class="dialog-body">
        <div class="field">
          <label for="note" [class.req]="data.decision === 'rejected'">{{
            data.decision === 'approved' ? 'Lời nhắn cho khách (không bắt buộc)' : 'Lý do từ chối'
          }}</label>
          <textarea id="note" class="textarea" name="note" rows="3" [(ngModel)]="note"></textarea>
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button
          type="submit"
          class="adm-btn"
          [class.adm-btn--primary]="data.decision === 'approved'"
          [class.adm-btn--danger]="data.decision === 'rejected'"
          [disabled]="data.decision === 'rejected' && !note.trim()"
        >
          {{ data.decision === 'approved' ? 'Duyệt trả hàng' : 'Từ chối trả hàng' }}
        </button>
      </div>
    </form>
  `,
})
export class ReturnDecisionDialog {
  readonly ref = inject(DialogRef);
  readonly data = inject<{ decision: 'approved' | 'rejected' }>(DIALOG_DATA);
  note = '';
  submit(): void {
    if (this.data.decision === 'rejected' && !this.note.trim()) return;
    this.ref.close(this.note.trim());
  }
}

/** Receiving returned goods: refund amount + where the units go (6.6). Affects money: type-to-confirm. */
@Component({
  selector: 'adm-complete-return-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>Nhận hàng trả và hoàn tiền</h2>
      <p class="dialog-desc">
        Đề xuất hoàn {{ suggested }} (giá trị hàng trả trừ phí gửi trả). Tiền được chuyển cho khách
        ngay khi xác nhận.
      </p>
      <div class="dialog-body">
        <div class="field">
          <label for="amount" class="req">Số tiền hoàn</label>
          <div class="affix">
            <input
              id="amount"
              class="input num"
              type="number"
              min="0"
              [max]="data.max"
              step="1000"
              name="amount"
              [ngModel]="amount()"
              (ngModelChange)="amount.set(+$event)"
            />
            <span class="suffix">₫</span>
          </div>
          @if (invalid()) {
            <p class="error">Số tiền từ 0 đến {{ maxText }}.</p>
          }
        </div>
        <fieldset class="stack" style="border: 0; padding: 0; margin: 0; gap: 10px">
          <legend
            class="field-label"
            style="margin-bottom: 8px; font-size: 13px; color: var(--adm-text-secondary)"
          >
            Hàng nhận về
          </legend>
          <label class="check"
            ><input type="radio" name="restock" [value]="true" [(ngModel)]="restock" /><span
              >Nhập lại kho bán<span class="check-desc"
                >Hàng còn nguyên tem mác, bán lại được.</span
              ></span
            ></label
          >
          <label class="check"
            ><input type="radio" name="restock" [value]="false" [(ngModel)]="restock" /><span
              >Chuyển kho hàng lỗi<span class="check-desc">Không cộng vào tồn kho bán.</span></span
            ></label
          >
        </fieldset>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary" [disabled]="invalid()">
          Hoàn {{ amountText() }}
        </button>
      </div>
    </form>
  `,
})
export class CompleteReturnDialog {
  readonly ref = inject(DialogRef);
  readonly data = inject<{ suggested: number; max: number }>(DIALOG_DATA);
  readonly amount = signal(this.data.suggested);
  restock = true;
  protected readonly suggested = money(this.data.suggested);
  protected readonly maxText = money(this.data.max);
  readonly invalid = computed(() => !(this.amount() >= 0 && this.amount() <= this.data.max));
  readonly amountText = computed(() => money(this.amount() || 0));
  submit(): void {
    if (!this.invalid()) this.ref.close({ refundAmount: this.amount(), restock: this.restock });
  }
}
