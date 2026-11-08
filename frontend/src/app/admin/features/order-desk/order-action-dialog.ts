import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CANCEL_REASON_LABELS,
  cancelReasonsOf,
  NOTE_REQUIRED_REASONS,
} from '../../core/order-desk-status';
import { AdminApiError } from '../../data-access/models';
import { ADMIN_ORDER_DESK_API, DeskApiError } from '../../data-access/order-desk-api';
import {
  DESK_CARRIER_MAX,
  DESK_CARRIER_MIN,
  DESK_CARRIER_SUGGESTIONS,
  DESK_INTERNAL_NOTE_MAX,
  DESK_NOTE_MAX,
  DESK_NOTE_MIN,
  DESK_TRACKING_MAX,
  DESK_TRACKING_MIN,
  DESK_TRACKING_PATTERN,
  type DeskAction,
  type DeskCancelReasonCode,
  type DeskCommand,
  type DeskOrder,
} from '../../data-access/order-desk-models';

/** The ten buttons of lát 4.3-4.6 (the six cancel reasons share one picker). */
export type DeskActionKind =
  | 'call-attempt'
  | 'confirm'
  | 'ship'
  | 'deliver'
  | 'cancel'
  | 'restock'
  | 'write-off'
  | 'approve-cancel'
  | 'reject-cancel'
  | 'add-note';

export interface DeskActionDialogData {
  order: DeskOrder;
  kind: DeskActionKind;
}

/** What the dialog hands back when it closes (nothing = the user backed out). */
export type DeskActionOutcome =
  | { kind: 'done'; order: DeskOrder; message: string }
  /** The server's order is shown; `order` is missing when the page must load it again. */
  | { kind: 'refresh'; order?: DeskOrder; message: string };

const RECENT_CARRIERS_KEY = 'n2f.admin.recentCarriers';
const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** One `Idempotency-Key` per intention (16-64 of A-Z a-z 0-9 -). */
function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `n2f-${Array.from(bytes, (byte) => KEY_ALPHABET[byte % KEY_ALPHABET.length]).join('')}`;
}

function recentCarriers(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_CARRIERS_KEY) ?? '[]') as unknown;
    return Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function rememberCarrier(name: string): void {
  try {
    const next = [name, ...recentCarriers().filter((item) => item !== name)].slice(0, 5);
    localStorage.setItem(RECENT_CARRIERS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the suggestions simply do not remember */
  }
}

const TITLES: Record<DeskActionKind, string> = {
  'call-attempt': 'Ghi không liên lạc được',
  confirm: 'Khách đã xác nhận đơn?',
  ship: 'Bàn giao cho đơn vị vận chuyển',
  deliver: 'Xác nhận giao thành công?',
  cancel: 'Huỷ đơn',
  restock: 'Cộng lại tồn kho?',
  'write-off': 'Loại bỏ hàng hoàn?',
  'approve-cancel': 'Duyệt yêu cầu huỷ?',
  'reject-cancel': 'Từ chối yêu cầu huỷ?',
  'add-note': 'Thêm ghi chú nội bộ',
};

const SUBMIT_LABELS: Record<DeskActionKind, string> = {
  'call-attempt': 'Ghi nhận',
  confirm: 'Xác nhận',
  ship: 'Bàn giao',
  deliver: 'Giao xong',
  cancel: 'Huỷ đơn',
  restock: 'Cộng lại tồn kho',
  'write-off': 'Loại bỏ hàng hoàn',
  'approve-cancel': 'Duyệt huỷ',
  'reject-cancel': 'Từ chối huỷ',
  'add-note': 'Lưu ghi chú',
};

/** Where a failure of the write ends up (BR-ADM-13..15, 34). */
function refuseMessage(code: string, kind: DeskActionKind): string {
  if (code === 'condition-not-met')
    return kind === 'ship'
      ? 'Đơn cần gọi xác nhận nhưng khách chưa xác nhận nên chưa thể bàn giao.'
      : 'Đơn chưa đủ điều kiện cho thao tác này (chưa có 3 lần không liên lạc được liên tiếp trong 24 giờ).';
  return 'Thao tác này không còn hợp lệ ở trạng thái hiện tại của đơn. Đã tải lại đơn.';
}

/**
 * One dialog for every write of lát 4.3-4.4: it asks for the input the action needs, sends it once
 * (busy, no double click) and keeps the input on a network failure so "Thử lại" can send it again
 * with the same `Idempotency-Key` (BR-ADM-15). It never changes the order on screen by itself: the
 * page replaces it only with the server's answer.
 */
@Component({
  selector: 'adm-order-action-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" role="group" aria-labelledby="desk-action-title" (ngSubmit)="submit()">
      <h2 id="desk-action-title">{{ title }}</h2>
      <p class="dialog-desc">
        Đơn <strong>#{{ order.id }}</strong
        >: {{ description() }}
      </p>
      <div class="dialog-body">
        @if (kind === 'cancel') {
          <fieldset class="field reasons" [attr.aria-invalid]="!!errors()['reason']">
            <legend class="field-label req">Lý do huỷ</legend>
            @for (item of reasons; track item) {
              <label class="check">
                <input
                  type="radio"
                  name="reason"
                  [value]="item"
                  [checked]="reason() === item"
                  [disabled]="busy()"
                  (change)="pick(item)"
                />
                <span
                  >{{ labels[item] }}<span class="check-desc">{{ reasonHint(item) }}</span></span
                >
              </label>
            }
            @if (errors()['reason']; as message) {
              <p class="error">{{ message }}</p>
            }
          </fieldset>
        }
        @if (kind === 'ship') {
          <div class="field">
            <label for="desk-carrier" class="req">Đơn vị vận chuyển</label>
            <input
              id="desk-carrier"
              class="input"
              name="carrier"
              list="desk-carriers"
              autocomplete="off"
              [ngModel]="carrier()"
              (ngModelChange)="carrier.set($event)"
              [disabled]="busy()"
              [attr.aria-invalid]="!!errors()['carrier']"
              [attr.aria-describedby]="errors()['carrier'] ? 'desk-carrier-error' : null"
            />
            <datalist id="desk-carriers">
              @for (name of carrierOptions; track name) {
                <option [value]="name"></option>
              }
            </datalist>
            <p class="hint">Nhập tự do, hoặc chọn tên đã dùng gần đây.</p>
            @if (errors()['carrier']; as message) {
              <p class="error" id="desk-carrier-error">{{ message }}</p>
            }
          </div>
          <div class="field">
            <label for="desk-tracking" class="req">Mã vận đơn</label>
            <input
              id="desk-tracking"
              class="input mono"
              name="trackingNumber"
              autocomplete="off"
              [ngModel]="tracking()"
              (ngModelChange)="tracking.set($event)"
              [disabled]="busy()"
              [attr.aria-invalid]="!!errors()['trackingNumber']"
              [attr.aria-describedby]="errors()['trackingNumber'] ? 'desk-tracking-error' : null"
            />
            <p class="hint">
              {{ trackingMin }}-{{ trackingMax }} ký tự gồm chữ, số và dấu gạch ngang; hệ thống lưu
              chữ hoa.
            </p>
            @if (errors()['trackingNumber']; as message) {
              <p class="error" id="desk-tracking-error">{{ message }}</p>
            }
          </div>
        }
        @if (noteShown()) {
          <div class="field">
            <label for="desk-note" [class.req]="noteRequired()">{{ noteLabel() }}</label>
            <textarea
              id="desk-note"
              class="textarea"
              name="note"
              rows="3"
              [ngModel]="note()"
              (ngModelChange)="note.set($event)"
              [disabled]="busy()"
              [attr.aria-invalid]="!!errors()['note']"
              [attr.aria-describedby]="errors()['note'] ? 'desk-note-error' : 'desk-note-hint'"
            ></textarea>
            <p class="hint" id="desk-note-hint">
              {{
                kind === 'reject-cancel'
                  ? 'Khách sẽ thấy lý do này (trên đơn và trong email).'
                  : 'Chỉ nhân viên thấy ghi chú này, khách không thấy.'
              }}
              {{
                kind === 'add-note'
                  ? 'Bắt buộc 1-' + noteLimit() + ' ký tự.'
                  : noteRequired()
                    ? 'Bắt buộc ' + noteMin + '-' + noteMax + ' ký tự.'
                    : 'Tối đa ' + noteMax + ' ký tự.'
              }}
            </p>
            @if (kind === 'add-note') {
              <p class="hint" data-testid="note-count">
                {{ note().trim().length }}/{{ noteLimit() }}
              </p>
            }
            @if (errors()['note']; as message) {
              <p class="error" id="desk-note-error">{{ message }}</p>
            }
          </div>
        }
        @if (failure(); as message) {
          <p class="error failure" role="alert">{{ message }}</p>
        }
        @if (wait() > 0) {
          <p class="failure" data-testid="cooldown">
            Chờ <strong>{{ wait() }}</strong> giây rồi bấm Thử lại.
          </p>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" [disabled]="busy()" (click)="ref.close()">
          Đóng
        </button>
        <button
          type="submit"
          class="adm-btn"
          [class.adm-btn--primary]="!danger"
          [class.adm-btn--danger]="danger"
          [class.is-busy]="busy()"
          [disabled]="busy() || wait() > 0"
          [attr.aria-busy]="busy()"
        >
          {{ retrying() ? 'Thử lại' : submitLabel }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .reasons {
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
      gap: 12px;
    }
    .failure {
      font-size: 14px;
      line-height: 20px;
    }
  `,
})
export class DeskActionDialog {
  protected readonly ref = inject<DialogRef<DeskActionOutcome>>(DialogRef);
  private readonly data = inject<DeskActionDialogData>(DIALOG_DATA);
  private readonly api = inject(ADMIN_ORDER_DESK_API);

  protected readonly order = this.data.order;
  protected readonly kind = this.data.kind;
  protected readonly title = TITLES[this.kind];
  protected readonly submitLabel = SUBMIT_LABELS[this.kind];
  protected readonly danger =
    this.kind === 'cancel' || this.kind === 'write-off' || this.kind === 'approve-cancel';
  protected readonly labels = CANCEL_REASON_LABELS;
  protected readonly reasons = cancelReasonsOf(this.order);
  protected readonly trackingMin = DESK_TRACKING_MIN;
  protected readonly trackingMax = DESK_TRACKING_MAX;
  protected readonly noteMin = DESK_NOTE_MIN;
  protected readonly noteMax = DESK_NOTE_MAX;
  protected readonly carrierOptions = [
    ...new Set([...recentCarriers(), ...DESK_CARRIER_SUGGESTIONS]),
  ];

  protected readonly reason = signal<DeskCancelReasonCode | ''>('');
  protected readonly carrier = signal('');
  protected readonly tracking = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly failure = signal('');
  /** The last try failed on the network (or 5xx / 429): the next press retries. */
  protected readonly retrying = signal(false);
  /** Seconds left of a `rate-limited` answer (`retryAfterSeconds`); the retry waits for 0. */
  protected readonly wait = signal(0);
  private timer: ReturnType<typeof setInterval> | undefined;

  protected readonly noteShown = computed(() => {
    switch (this.kind) {
      case 'call-attempt':
      case 'cancel':
      case 'restock':
      case 'write-off':
      case 'reject-cancel':
      case 'add-note':
        return this.kind !== 'cancel' || !!this.reason();
      default:
        return false;
    }
  });
  protected readonly noteRequired = computed(() => {
    const reason = this.reason();
    return (
      this.kind === 'write-off' ||
      this.kind === 'reject-cancel' ||
      this.kind === 'add-note' ||
      (this.kind === 'cancel' && !!reason && NOTE_REQUIRED_REASONS.includes(reason))
    );
  });
  protected readonly noteLimit = computed(() => DESK_INTERNAL_NOTE_MAX);
  protected readonly noteLabel = computed(() =>
    this.kind === 'add-note'
      ? 'Ghi chú nội bộ'
      : this.kind === 'write-off'
        ? 'Lý do loại bỏ (hỏng / mất)'
        : this.kind === 'reject-cancel'
          ? 'Lý do từ chối'
          : this.noteRequired()
            ? 'Ghi chú nội bộ'
            : 'Ghi chú nội bộ (tuỳ chọn)',
  );

  private key = newKey();
  private sentJson = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.ref.disableClose = false;
      clearInterval(this.timer);
    });
  }

  protected description(): string {
    switch (this.kind) {
      case 'call-attempt':
        return 'ghi một lần gọi khách không liên lạc được. Trạng thái đơn không đổi.';
      case 'confirm':
        return 'khách đã xác nhận qua điện thoại. Đơn chuyển sang “Đang chuẩn bị”.';
      case 'ship':
        return 'đơn chuyển sang “Đang vận chuyển” và khách nhận email bàn giao. Không hoàn tác được.';
      case 'deliver':
        return 'đơn hoàn thành, ghi nhận đã thu tiền (COD). Không hoàn tác được.';
      case 'cancel':
        return 'huỷ đơn, khách nhận email kèm lý do chuẩn. Không hoàn tác được.';
      case 'restock':
        return 'hàng hoàn đã về kho: cộng lại đúng số lượng từng dòng. Chỉ xử lý được một lần.';
      case 'write-off':
        return 'hàng hoàn hỏng hoặc mất: không cộng tồn kho. Chỉ xử lý được một lần.';
      case 'approve-cancel':
        return 'đơn được huỷ theo yêu cầu của khách, cộng lại tồn kho và khách nhận email. Không hoàn tác được.';
      case 'reject-cancel':
        return 'đơn trở về “Đang chuẩn bị” và khách nhận email kèm lý do. Khách không gửi lại được yêu cầu thứ hai.';
      case 'add-note':
        return 'ghi chú hiện trong lịch sử đơn cho nhân viên. Không đổi trạng thái, khách không thấy, không gửi email.';
    }
  }

  protected reasonHint(reason: DeskCancelReasonCode): string {
    switch (reason) {
      case 'unreachable':
        return 'Đã có 3 lần không liên lạc được liên tiếp trong 24 giờ. Hoàn kho và trả lượt voucher.';
      case 'declined_on_call':
        return 'Khách báo không muốn nhận đơn khi gọi xác nhận. Hoàn kho.';
      case 'customer_request':
        return 'Khách gọi hotline xin huỷ trước khi bàn giao. Hoàn kho; ghi chú bắt buộc.';
      case 'refused':
        return 'Tính vào giới hạn COD của số điện thoại. Hàng chờ về kho ở tab Hàng hoàn.';
      case 'undeliverable':
        return 'Không tính giới hạn COD. Hàng chờ về kho ở tab Hàng hoàn.';
      case 'other':
        return 'Chỉ quản trị viên. Ghi chú bắt buộc.';
    }
  }

  protected pick(reason: DeskCancelReasonCode): void {
    this.reason.set(reason);
    this.errors.update((errors) => ({ ...errors, reason: '', note: '' }));
  }

  protected submit(): void {
    if (this.busy()) return;
    const command = this.validated();
    if (!command) return;
    this.failure.set('');
    // A note has no status to compare and the same key replays the same answer: send it as is.
    if (this.retrying() && command.action !== 'add-note') this.reloadThenSend(command);
    else this.send(command);
  }

  /** Client-side checks that mirror the contract (the server still decides). */
  private validated(): DeskCommand | null {
    const errors: Record<string, string> = {};
    const expectedStatus = this.order.status;
    const note = this.note().trim();
    const range = `Nhập ghi chú từ ${DESK_NOTE_MIN} đến ${DESK_NOTE_MAX} ký tự.`;
    const reasonRange = `Nhập lý do từ ${DESK_NOTE_MIN} đến ${DESK_NOTE_MAX} ký tự.`;
    let command: DeskCommand | null = null;
    switch (this.kind) {
      case 'call-attempt':
        if (note.length > DESK_NOTE_MAX) errors['note'] = `Ghi chú tối đa ${DESK_NOTE_MAX} ký tự.`;
        command = { action: 'call-attempt', expectedStatus, ...(note ? { note } : {}) };
        break;
      case 'add-note':
        if (!note.length) errors['note'] = 'Nhập nội dung ghi chú.';
        else if (note.length > DESK_INTERNAL_NOTE_MAX)
          errors['note'] = `Ghi chú tối đa ${DESK_INTERNAL_NOTE_MAX} ký tự.`;
        command = { action: 'add-note', note };
        break;
      case 'confirm':
        command = { action: 'confirm', expectedStatus };
        break;
      case 'deliver':
        command = { action: 'deliver', expectedStatus };
        break;
      case 'ship': {
        const carrier = this.carrier().trim();
        const trackingNumber = this.tracking().trim();
        if (carrier.length < DESK_CARRIER_MIN || carrier.length > DESK_CARRIER_MAX)
          errors['carrier'] =
            `Đơn vị vận chuyển từ ${DESK_CARRIER_MIN} đến ${DESK_CARRIER_MAX} ký tự.`;
        if (
          trackingNumber.length < DESK_TRACKING_MIN ||
          trackingNumber.length > DESK_TRACKING_MAX ||
          !DESK_TRACKING_PATTERN.test(trackingNumber)
        )
          errors['trackingNumber'] =
            `Mã vận đơn từ ${DESK_TRACKING_MIN} đến ${DESK_TRACKING_MAX} ký tự, chỉ gồm chữ, số và dấu gạch ngang.`;
        command = { action: 'ship', expectedStatus, carrier, trackingNumber };
        break;
      }
      case 'cancel': {
        const reason = this.reason();
        if (!reason) {
          errors['reason'] = 'Chọn lý do huỷ.';
          break;
        }
        const required = NOTE_REQUIRED_REASONS.includes(reason);
        if (note.length > DESK_NOTE_MAX || (required && note.length < DESK_NOTE_MIN))
          errors['note'] = required ? range : `Ghi chú tối đa ${DESK_NOTE_MAX} ký tự.`;
        command = { action: 'cancel', expectedStatus, reason, ...(note ? { note } : {}) };
        break;
      }
      case 'approve-cancel':
        command = { action: 'approve-cancel', expectedStatus };
        break;
      case 'reject-cancel':
        if (note.length < DESK_NOTE_MIN || note.length > DESK_NOTE_MAX)
          errors['note'] = reasonRange;
        command = { action: 'reject-cancel', expectedStatus, reason: note };
        break;
      case 'restock':
      case 'write-off': {
        const written = this.kind === 'write-off';
        if (note.length > DESK_NOTE_MAX || (written && note.length < DESK_NOTE_MIN))
          errors['note'] = written ? range : `Ghi chú tối đa ${DESK_NOTE_MAX} ký tự.`;
        command = {
          action: 'returned-stock',
          expectedStatus,
          decision: written ? 'written_off' : 'restocked',
          ...(note ? { note } : {}),
        };
        break;
      }
    }
    this.errors.set(errors);
    return Object.values(errors).some(Boolean) ? null : command;
  }

  private send(command: DeskCommand): void {
    // A key belongs to one body: an edited body is a new intention and gets a new key.
    const json = JSON.stringify(command);
    if (this.sentJson && json !== this.sentJson) this.key = newKey();
    this.sentJson = json;
    this.setBusy(true);
    this.api.perform(this.order.id, command, this.key).subscribe({
      next: (order) => {
        if (command.action === 'ship') rememberCarrier(command.carrier);
        this.ref.close({ kind: 'done', order, message: this.doneMessage(order) });
      },
      error: (error: unknown) => {
        this.setBusy(false);
        this.fail(error);
      },
    });
  }

  /** BR-ADM-15: after a lost answer look at the order first; send again only if it still fits. */
  private reloadThenSend(command: Exclude<DeskCommand, { action: 'add-note' }>): void {
    this.setBusy(true);
    this.api.get(this.order.id).subscribe({
      next: (order) => {
        if (order.status !== command.expectedStatus) {
          this.ref.close({
            kind: 'refresh',
            order,
            message:
              'Đơn đã thay đổi trong lúc mất kết nối (có thể thao tác trước đã được xử lý). Đã tải lại đơn, không gửi lại.',
          });
        } else if (!this.stillAllowed(order, command)) {
          this.ref.close({
            kind: 'refresh',
            order,
            message:
              'Thao tác này không còn khả dụng với đơn (có thể đã được xử lý). Đã tải lại đơn, không gửi lại.',
          });
        } else {
          this.send(command);
        }
      },
      error: (error: unknown) => {
        this.setBusy(false);
        this.fail(error);
      },
    });
  }

  private stillAllowed(
    order: DeskOrder,
    command: Exclude<DeskCommand, { action: 'add-note' }>,
  ): boolean {
    const allowed: DeskAction[] = order.allowedActions;
    switch (command.action) {
      case 'call-attempt':
      case 'confirm':
      case 'ship':
      case 'deliver':
        return allowed.includes(command.action);
      case 'cancel':
        return cancelReasonsOf(order).includes(command.reason);
      case 'approve-cancel':
      case 'reject-cancel':
        return allowed.includes(command.action);
      case 'returned-stock':
        return allowed.includes(command.decision === 'restocked' ? 'restock' : 'write-off');
    }
  }

  private fail(error: unknown): void {
    const code = error instanceof AdminApiError ? error.code : 'unavailable';
    this.retrying.set(false);
    switch (code) {
      case 'order-state-changed': {
        const order = error instanceof DeskApiError ? error.order : undefined;
        this.ref.close({
          kind: 'refresh',
          order,
          message: 'Đơn vừa được cập nhật bởi người khác. Thao tác của bạn chưa được thực hiện.',
        });
        return;
      }
      case 'invalid-transition':
      case 'condition-not-met':
        this.ref.close({ kind: 'refresh', message: refuseMessage(code, this.kind) });
        return;
      case 'forbidden':
        this.ref.close({
          kind: 'refresh',
          message: 'Tài khoản của bạn không có quyền thực hiện thao tác này.',
        });
        return;
      case 'not-found':
        this.ref.close({ kind: 'refresh', message: 'Không tìm thấy đơn hàng.' });
        return;
      case 'validation': {
        const fields = (error as AdminApiError).fields;
        const known = ['reason', 'note', 'carrier', 'trackingNumber'];
        const mine = Object.entries(fields)
          .filter(([field]) => known.includes(field))
          // The reject reason is typed in the shared text box.
          .map(([field, text]) => [
            this.kind === 'reject-cancel' && field === 'reason' ? 'note' : field,
            text,
          ]);
        if (mine.length) {
          this.errors.set(Object.fromEntries(mine));
          this.failure.set('Máy chủ từ chối dữ liệu đã nhập. Sửa các trường được đánh dấu.');
          return;
        }
        this.failure.set('Dữ liệu chưa hợp lệ. Kiểm tra lại rồi thử lại.');
        return;
      }
      case 'conflict':
        // Same key, different content: start over with a new key.
        this.key = newKey();
        this.sentJson = '';
        this.failure.set('Thao tác này bị trùng khoá với một thao tác khác. Bấm lại để gửi.');
        return;
      case 'rate-limited': {
        this.retrying.set(true);
        this.failure.set('Bạn thao tác quá nhanh nên chưa gửi được. Dữ liệu đã nhập vẫn được giữ.');
        this.countDown((error as AdminApiError).retryAfterSeconds ?? 5);
        return;
      }
      default:
        this.retrying.set(true);
        this.failure.set(
          'Không kết nối được máy chủ nên chưa biết thao tác đã xong chưa. Dữ liệu đã nhập vẫn được giữ; bấm Thử lại (đơn sẽ được tải lại trước, không gửi trùng).',
        );
    }
  }

  private countDown(seconds: number): void {
    clearInterval(this.timer);
    this.wait.set(Math.max(1, Math.ceil(seconds)));
    this.timer = setInterval(() => {
      this.wait.update((value) => Math.max(0, value - 1));
      if (this.wait() === 0) clearInterval(this.timer);
    }, 1000);
  }

  private setBusy(busy: boolean): void {
    this.busy.set(busy);
    this.ref.disableClose = busy;
  }

  private doneMessage(order: DeskOrder): string {
    switch (this.kind) {
      case 'call-attempt':
        return `Đã ghi nhận không liên lạc được (${order.callAttempts.total} lần, ${order.callAttempts.inFirstDay}/3 trong 24 giờ).`;
      case 'confirm':
        return 'Đã ghi nhận khách xác nhận đơn.';
      case 'ship':
        return `Đã bàn giao cho ${order.shipment?.carrier ?? 'đơn vị vận chuyển'}, mã vận đơn ${order.shipment?.trackingNumber ?? ''}.`;
      case 'deliver':
        return 'Đã giao thành công: đơn hoàn thành và ghi nhận đã thu tiền.';
      case 'cancel': {
        const code = order.cancellation?.reasonCode;
        const label = code ? CANCEL_REASON_LABELS[code] : '';
        return order.returnHandling
          ? `Đã huỷ đơn (${label}). Hàng chờ về kho: xử lý ở tab Hàng hoàn.`
          : `Đã huỷ đơn (${label}). Tồn kho đã được cộng lại.`;
      }
      case 'restock':
        return 'Đã cộng lại tồn kho cho hàng hoàn.';
      case 'write-off':
        return 'Đã loại bỏ hàng hoàn, không cộng tồn kho.';
      case 'approve-cancel':
        return 'Đã duyệt yêu cầu huỷ. Đơn đã huỷ và tồn kho được cộng lại.';
      case 'reject-cancel':
        return 'Đã từ chối yêu cầu huỷ. Đơn trở về “Đang chuẩn bị”.';
      case 'add-note':
        return 'Đã thêm ghi chú nội bộ. Chỉ nhân viên thấy ghi chú này.';
    }
  }
}
