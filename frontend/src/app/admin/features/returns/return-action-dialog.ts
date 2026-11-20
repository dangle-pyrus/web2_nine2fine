import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, Observable, of } from 'rxjs';
import { MoneyPipe } from '../../core/format.pipes';
import { AdminApiError } from '../../data-access/models';
import {
  ADMIN_RETURN_DESK_API,
  AdminReturn,
  AdminReturnAction,
  RETURN_NOTE_MAX,
  RETURN_NOTE_MIN,
  RETURN_REFERENCE_MAX,
  RETURN_REFERENCE_MIN,
  returnDeskErrorMessage,
  ReturnDisposition,
} from '../../data-access/returns-api';

export interface ReturnActionDialogData {
  ret: AdminReturn;
  kind: AdminReturnAction;
}

/** `done`: the server answered with the new request; `stale`: someone else got there first. */
export type ReturnActionOutcome =
  | { kind: 'done'; ret: AdminReturn; message: string }
  | { kind: 'stale'; ret: AdminReturn | null; message: string };

/** ADM-RET-05/08: per line, how many units pass and how many of those go back into stock. */
interface ReceiveRow {
  variantId: string;
  label: string;
  quantity: number;
  accepted: number;
  restock: number;
}

const TITLES: Record<AdminReturnAction, string> = {
  approve: 'Duyệt yêu cầu trả hàng',
  reject: 'Từ chối / đóng yêu cầu',
  receive: 'Nhận hàng trả và kiểm hàng',
  refund: 'Xác nhận đã hoàn tiền',
};

/**
 * One dialog for the four writes of the returns desk (BR-RET-33..37). It sends the request itself:
 * a failure keeps the dialog and every typed value (lost connection, 422 on a field); a lost race
 * (`409 invalid-transition`) closes it with the fresh request. The send button locks while the
 * request is in flight, so a double click sends one request.
 */
@Component({
  selector: 'adm-return-action-dialog',
  imports: [FormsModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form
      class="dialog"
      (ngSubmit)="submit()"
      [attr.aria-busy]="busy()"
      data-testid="return-dialog"
    >
      <h2>{{ title }}</h2>
      <div class="dialog-body">
        @switch (kind) {
          @case ('approve') {
            <p class="dialog-desc">
              Khách nhận hướng dẫn gửi hàng trong chi tiết đơn và qua email. Tồn kho và tiền chưa
              đổi.
            </p>
            <div class="field">
              <label for="ret-note">Hướng dẫn cho khách (tuỳ chọn)</label>
              <textarea
                id="ret-note"
                class="textarea"
                name="note"
                rows="3"
                [maxlength]="max"
                [disabled]="busy()"
                [ngModel]="note()"
                (ngModelChange)="note.set($event)"
              ></textarea>
            </div>
            <div class="field">
              <label for="ret-carrier">Đơn vị vận chuyển (tuỳ chọn)</label>
              <input
                id="ret-carrier"
                class="input"
                name="carrier"
                maxlength="50"
                [disabled]="busy()"
                [ngModel]="carrier()"
                (ngModelChange)="carrier.set($event)"
              />
            </div>
            <div class="field">
              <label for="ret-tracking">Mã vận đơn (tuỳ chọn)</label>
              <input
                id="ret-tracking"
                class="input"
                name="tracking"
                maxlength="40"
                [disabled]="busy()"
                [ngModel]="tracking()"
                (ngModelChange)="tracking.set($event)"
              />
            </div>
          }
          @case ('reject') {
            <p class="dialog-desc">
              Lý do được hiển thị cho khách và gửi qua email. Không đổi tồn kho và tiền; khách không
              gửi lại được yêu cầu cho đơn này.
            </p>
            <div class="field">
              <label for="ret-note" class="req">Lý do</label>
              <textarea
                id="ret-note"
                class="textarea"
                name="note"
                rows="3"
                [maxlength]="max"
                [attr.aria-invalid]="tried() && !!noteProblem()"
                [disabled]="busy()"
                [ngModel]="note()"
                (ngModelChange)="note.set($event)"
              ></textarea>
              <p class="hint">Từ {{ min }} đến {{ max }} ký tự.</p>
              @if (tried() && noteProblem(); as text) {
                <p class="error">{{ text }}</p>
              }
            </div>
          }
          @case ('receive') {
            <p class="dialog-desc">
              Kiểm từng dòng: nhập số lượng đạt (0 đến số khách trả), rồi chia phần đạt thành phần
              nhập lại kho bán và phần không nhập kho (hỏng, bẩn…). Chỉ phần nhập lại kho được cộng
              vào tồn. Số tiền hoàn do hệ thống tính theo số lượng đạt, không sửa tay.
            </p>
            <table class="table" data-testid="receive-lines">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th class="num">Khách trả</th>
                  <th>Số lượng đạt</th>
                  <th>Nhập lại kho</th>
                  <th class="num">Không nhập kho</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.variantId; let i = $index) {
                  <tr>
                    <td>{{ row.label }}</td>
                    <td class="num">{{ row.quantity }}</td>
                    <td>
                      <input
                        class="input input--sm"
                        type="number"
                        min="0"
                        [max]="row.quantity"
                        [attr.aria-label]="'Số lượng đạt: ' + row.label"
                        [disabled]="busy()"
                        [ngModel]="row.accepted"
                        [name]="'accepted' + i"
                        (ngModelChange)="setAccepted(i, $event)"
                      />
                    </td>
                    <td>
                      @if (row.accepted > 0) {
                        <input
                          class="input input--sm"
                          type="number"
                          min="0"
                          [max]="row.accepted"
                          [attr.aria-label]="'Nhập lại kho: ' + row.label"
                          [disabled]="busy()"
                          [ngModel]="row.restock"
                          [name]="'restock' + i"
                          (ngModelChange)="setRestock(i, $event)"
                        />
                      } @else {
                        <span class="secondary">—</span>
                      }
                    </td>
                    <td class="num" [attr.data-testid]="'writeoff-' + i">
                      {{ row.accepted > 0 ? writeOff(row) : '—' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            @if (tried() && linesProblem(); as text) {
              <p class="error" role="alert">{{ text }}</p>
            }
            @if (allRejected()) {
              <p class="hint">Không có hàng đạt: yêu cầu sẽ được đóng, không hoàn tiền.</p>
            }
            <div class="field">
              <label for="ret-note" [class.req]="needsNote()">Ghi chú kiểm hàng</label>
              <textarea
                id="ret-note"
                class="textarea"
                name="note"
                rows="2"
                [maxlength]="max"
                [attr.aria-invalid]="tried() && !!noteProblem()"
                [disabled]="busy()"
                [ngModel]="note()"
                (ngModelChange)="note.set($event)"
              ></textarea>
              <p class="hint">
                {{
                  needsNote()
                    ? 'Bắt buộc khi có hàng không đạt: từ ' + min + ' đến ' + max + ' ký tự.'
                    : 'Không bắt buộc.'
                }}
              </p>
              @if (tried() && noteProblem(); as text) {
                <p class="error">{{ text }}</p>
              }
            </div>
          }
          @case ('refund') {
            <p class="dialog-desc">
              Chuyển khoản cho khách ngoài hệ thống trước, rồi ghi nhận ở đây. Thao tác này không
              hoàn tác được.
            </p>
            <dl class="refund-info" data-testid="refund-info">
              <div>
                <dt>Số tiền đã chốt</dt>
                <dd data-testid="refund-amount">
                  {{ ret.amount.amount | admMoney }}
                  <span class="small secondary">
                    (tiền hàng {{ ret.amount.goodsAmount | admMoney }}
                    @if (ret.amount.shippingRefund) {
                      + phí giao {{ ret.amount.shippingRefund | admMoney }}
                    }
                    @if (ret.amount.returnShippingFee) {
                      − phí gửi trả {{ ret.amount.returnShippingFee | admMoney }}
                    }
                    )
                  </span>
                </dd>
              </div>
              @if (ret.refundTo.type === 'account') {
                <div>
                  <dt>Ngân hàng</dt>
                  <dd>{{ ret.refundTo.bank }}</dd>
                </div>
                <div>
                  <dt>Số tài khoản</dt>
                  <dd data-testid="refund-account-number">
                    {{ ret.refundTo.accountNumber ?? '****' + ret.refundTo.last4 }}
                  </dd>
                </div>
                <div>
                  <dt>Chủ tài khoản</dt>
                  <dd>{{ ret.refundTo.accountName }}</dd>
                </div>
              } @else {
                <div>
                  <dt>Hoàn về</dt>
                  <dd>Tài khoản đã thanh toán đơn</dd>
                </div>
              }
            </dl>
            <div class="field">
              <label for="ret-ref" class="req">Mã giao dịch / nội dung chuyển khoản</label>
              <input
                id="ret-ref"
                class="input"
                name="reference"
                [maxlength]="refMax"
                [attr.aria-invalid]="tried() && !!refProblem()"
                [disabled]="busy()"
                [ngModel]="reference()"
                (ngModelChange)="reference.set($event)"
              />
              @if (tried() && refProblem(); as text) {
                <p class="error">{{ text }}</p>
              }
            </div>
            <label class="row small">
              <input
                type="checkbox"
                name="confirm"
                [disabled]="busy()"
                [ngModel]="confirmed()"
                (ngModelChange)="confirmed.set($event)"
              />
              Tôi đã chuyển đủ {{ ret.amount.amount | admMoney }} cho khách.
            </label>
            <p class="hint">
              Số tiền do hệ thống chốt sau kiểm hàng, không sửa được. Nếu số này đã đổi, hệ thống
              sẽ từ chối và tải lại bản mới nhất.
            </p>
            @if (tried() && !confirmed()) {
              <p class="error">Xác nhận bạn đã chuyển khoản.</p>
            }
          }
        }
        @for (entry of serverFields(); track entry[0]) {
          <p class="error" role="alert">{{ entry[1] }}</p>
        }
        <p class="error" role="alert" data-testid="return-failure">{{ failure() }}</p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" [disabled]="busy()" (click)="ref.close()">
          Hủy bỏ
        </button>
        <button
          type="submit"
          class="adm-btn"
          [class.adm-btn--danger]="kind === 'reject'"
          [class.adm-btn--primary]="kind !== 'reject'"
          [class.is-busy]="busy()"
          [disabled]="busy()"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .refund-info {
      display: grid;
      gap: 6px;
      margin: 0 0 12px;
    }
    .refund-info div {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px;
    }
    .refund-info dd {
      margin: 0;
      font-weight: 600;
    }
  `,
})
export class ReturnActionDialog {
  readonly ref = inject<DialogRef<ReturnActionOutcome>>(DialogRef);
  private readonly data = inject<ReturnActionDialogData>(DIALOG_DATA);
  private readonly api = inject(ADMIN_RETURN_DESK_API);

  protected readonly ret = this.data.ret;
  protected readonly kind = this.data.kind;
  protected readonly title = TITLES[this.kind];
  protected readonly confirmLabel = {
    approve: 'Duyệt',
    reject: 'Từ chối',
    receive: 'Xác nhận đã nhận hàng',
    refund: 'Xác nhận đã hoàn tiền',
  }[this.kind];
  protected readonly min = RETURN_NOTE_MIN;
  protected readonly max = RETURN_NOTE_MAX;
  protected readonly refMax = RETURN_REFERENCE_MAX;

  protected readonly note = signal('');
  protected readonly carrier = signal('');
  protected readonly tracking = signal('');
  protected readonly reference = signal('');
  protected readonly confirmed = signal(false);
  protected readonly tried = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  protected readonly fields = signal<Record<string, string>>({});
  protected readonly serverFields = computed(() => Object.entries(this.fields()));
  protected readonly rows = signal<ReceiveRow[]>(
    this.data.ret.lines.map((line) => ({
      variantId: line.variantId,
      label: `${line.name} (${line.color} / ${line.size})`,
      quantity: line.quantity,
      accepted: line.quantity,
      restock: line.quantity,
    })),
  );

  private readonly noteLength = computed(() => this.note().trim().length);
  protected readonly needsNote = computed(
    () => this.kind === 'receive' && this.rows().some((row) => row.accepted < row.quantity),
  );
  protected readonly allRejected = computed(() => this.rows().every((row) => row.accepted === 0));
  protected readonly noteProblem = computed(() => {
    const length = this.noteLength();
    const required = this.kind === 'reject' || this.needsNote();
    if (required && length < RETURN_NOTE_MIN) return `Nhập ghi chú từ ${RETURN_NOTE_MIN} ký tự.`;
    if (length > RETURN_NOTE_MAX) return `Ghi chú tối đa ${RETURN_NOTE_MAX} ký tự.`;
    return '';
  });
  protected readonly linesProblem = computed(() => {
    for (const row of this.rows()) {
      if (!Number.isInteger(row.accepted) || row.accepted < 0 || row.accepted > row.quantity)
        return `Số lượng đạt của "${row.label}" từ 0 đến ${row.quantity}.`;
      if (
        row.accepted > 0 &&
        (!Number.isInteger(row.restock) || row.restock < 0 || row.restock > row.accepted)
      )
        return `Số nhập lại kho của "${row.label}" từ 0 đến ${row.accepted}.`;
    }
    return '';
  });
  protected readonly refProblem = computed(() => {
    const length = this.reference().trim().length;
    return length < RETURN_REFERENCE_MIN || length > RETURN_REFERENCE_MAX
      ? `Mã giao dịch từ ${RETURN_REFERENCE_MIN} đến ${RETURN_REFERENCE_MAX} ký tự.`
      : '';
  });

  /** A new accepted count keeps the restock part inside it (all accepted units by default). */
  setAccepted(index: number, value: number | string): void {
    const accepted = Number(value);
    this.rows.update((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const restock =
          row.restock === row.accepted ? accepted : Math.min(row.restock, Math.max(0, accepted));
        return { ...row, accepted, restock };
      }),
    );
  }
  setRestock(index: number, value: number | string): void {
    const restock = Number(value);
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, restock } : row)));
  }
  protected writeOff(row: ReceiveRow): number {
    return Math.max(0, row.accepted - (Number.isInteger(row.restock) ? row.restock : 0));
  }

  submit(): void {
    if (this.busy()) return;
    this.tried.set(true);
    this.failure.set('');
    this.fields.set({});
    const id = this.ret.id;
    let request: Observable<AdminReturn>;
    switch (this.kind) {
      case 'approve':
        request = this.api.approve(id, {
          ...(this.note().trim() ? { note: this.note().trim() } : {}),
          ...(this.carrier().trim() ? { carrier: this.carrier().trim() } : {}),
          ...(this.tracking().trim() ? { trackingNumber: this.tracking().trim() } : {}),
        });
        break;
      case 'reject':
        if (this.noteProblem()) return;
        request = this.api.reject(id, this.note().trim());
        break;
      case 'receive':
        if (this.linesProblem() || this.noteProblem()) return;
        request = this.api.receive(id, {
          lines: this.rows().map((row) => ({
            variantId: row.variantId,
            acceptedQuantity: row.accepted,
            ...(row.accepted > 0
              ? {
                  // `disposition` for older servers; `restockQuantity` is the exact split.
                  disposition: (row.restock > 0 ? 'restock' : 'writeoff') as ReturnDisposition,
                  restockQuantity: row.restock,
                }
              : {}),
          })),
          ...(this.note().trim() ? { note: this.note().trim() } : {}),
        });
        break;
      case 'refund':
        if (this.refProblem() || !this.confirmed()) return;
        request = this.api.refund(id, {
          amount: this.ret.amount.amount,
          refundReference: this.reference().trim(),
        });
        break;
    }
    this.busy.set(true);
    request.subscribe({
      next: (ret) => this.ref.close({ kind: 'done', ret, message: this.doneMessage(ret) }),
      error: (error: unknown) => this.failed(error),
    });
  }

  private doneMessage(ret: AdminReturn): string {
    switch (this.kind) {
      case 'approve':
        return 'Đã duyệt yêu cầu. Khách sẽ nhận hướng dẫn gửi hàng.';
      case 'reject':
        return 'Đã từ chối yêu cầu.';
      case 'receive': {
        if (ret.state === 'rejected')
          return 'Không có hàng đạt: yêu cầu đã được đóng, không hoàn tiền.';
        // ADM-RET-08: say what changed in stock (the inventory screens read it fresh).
        const restocked = this.rows().reduce(
          (sum, row) => sum + (row.accepted > 0 ? row.restock : 0),
          0,
        );
        return restocked
          ? `Đã nhận hàng trả về, nhập lại kho ${restocked} sản phẩm. Yêu cầu chuyển sang chờ hoàn tiền.`
          : 'Đã nhận hàng trả về, không nhập lại kho sản phẩm nào. Yêu cầu chuyển sang chờ hoàn tiền.';
      }
      case 'refund':
        return 'Đã ghi nhận hoàn tiền.';
    }
  }

  private failed(error: unknown): void {
    if (error instanceof AdminApiError && error.code === 'invalid-transition') {
      // Someone else handled it: close and show the current state (BR-RET-42).
      this.api
        .get(this.ret.id)
        .pipe(catchError(() => of(null)))
        .subscribe((ret) =>
          this.ref.close({ kind: 'stale', ret, message: returnDeskErrorMessage(error) }),
        );
      return;
    }
    this.busy.set(false);
    if (error instanceof AdminApiError && error.code === 'validation') {
      this.fields.set(error.fields);
      // A refund amount that no longer matches means the request changed: show it fresh.
      if (error.fields['amount']) {
        this.api
          .get(this.ret.id)
          .pipe(catchError(() => of(null)))
          .subscribe((ret) =>
            this.ref.close({
              kind: 'stale',
              ret,
              message:
                'Số tiền hoàn đã thay đổi. Đã tải lại bản mới nhất; kiểm tra rồi xác nhận lại.',
            }),
          );
      }
      return;
    }
    this.failure.set(returnDeskErrorMessage(error));
  }
}
