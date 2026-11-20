import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { CANCEL_REASONS, CancelChoice, CancelReasonCode } from '../../orders/order-models';

export const CANCEL_REASON_MAX = 250;

export interface CancelRequestDialogData {
  orderId: string;
  /** `cancel` = huỷ ngay (`to_pay`); `request` = gửi yêu cầu để shop duyệt (`to_ship`). */
  mode?: 'cancel' | 'request';
  /** Replaces the lead text (direct cancel: refund note). */
  message?: string;
}

/**
 * What the dialog hands back when the shopper goes ahead; `choice` is null when they cancelled a
 * `to_pay` order without giving a reason (ORD-CC-01). Closing the dialog hands back nothing.
 */
export interface CancelRequestResult {
  choice: CancelChoice | null;
}

/**
 * Cancel dialog for both modes. `request` (`to_ship`, COMMON-01.5, ORD-CC-02): a reason from the
 * list is required; "Lý do khác" needs a note up to 250 characters; the shop reviews it (Slice 4,
 * BR-ADM-29). `cancel` (`to_pay`, ORD-CC-01): confirming is enough, the reason is optional.
 * Open through OverlayService with the 'modal' panel.
 */
@Component({
  selector: 'n2f-cancel-request-dialog',
  imports: [FormsModule],
  template: `
    <form (ngSubmit)="send()" novalidate>
      <h2>{{ request ? 'Gửi yêu cầu huỷ đơn?' : 'Hủy đơn hàng?' }}</h2>
      <p class="lead">
        @if (data.message) {
          {{ data.message }}
        } @else {
          Đơn #{{ data.orderId }} đã được nine2fine tiếp nhận nên chưa thể huỷ ngay. nine2fine sẽ
          xem xét yêu cầu của bạn và phản hồi qua email. Trong lúc chờ, đơn hàng vẫn được giữ
          nguyên.
        }
      </p>
      <fieldset [attr.aria-invalid]="showMissing()" aria-describedby="cancel-code-error">
        <legend>
          Lý do huỷ đơn
          @if (request) {
            <span class="req">*</span>
          } @else {
            <span class="optional">(không bắt buộc)</span>
          }
        </legend>
        @for (option of reasons; track option.code) {
          <label class="option">
            <input
              type="radio"
              name="reasonCode"
              [value]="option.code"
              [checked]="code() === option.code"
              (change)="code.set(option.code)"
            />
            <span>{{ option.label }}</span>
          </label>
        }
      </fieldset>
      @if (showMissing()) {
        <p id="cancel-code-error" class="error" role="alert">Vui lòng chọn lý do huỷ đơn.</p>
      }
      <label for="cancel-reason">
        {{ code() === 'other' ? 'Lý do cụ thể' : 'Ghi chú thêm (không bắt buộc)' }}
        @if (code() === 'other') {
          <span class="req">*</span>
        }
      </label>
      <textarea
        id="cancel-reason"
        name="reason"
        rows="3"
        [ngModel]="reason()"
        (ngModelChange)="reason.set($event)"
        [attr.aria-invalid]="tooLong() || noteMissing()"
        aria-describedby="cancel-reason-hint"
      ></textarea>
      <p id="cancel-reason-hint" class="hint" [class.over]="tooLong()">
        {{ length() }}/{{ max }} ký tự
      </p>
      @if (tooLong()) {
        <p class="error" role="alert">Lý do tối đa {{ max }} ký tự.</p>
      } @else if (noteMissing()) {
        <p class="error" role="alert">Vui lòng nhập lý do huỷ đơn.</p>
      }
      <div class="actions">
        <button type="button" class="pill outline" (click)="dialog.close()">Quay lại</button>
        <button type="submit" class="pill">{{ request ? 'Gửi yêu cầu huỷ' : 'Hủy đơn' }}</button>
      </div>
    </form>
  `,
  styles: `
    form {
      padding: 32px;
      max-width: 520px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 22px;
      font-weight: 600;
    }
    .lead {
      margin: 0 0 20px;
      color: var(--muted);
      line-height: 1.6;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 14px;
      font-weight: 500;
    }
    fieldset {
      margin: 0 0 16px;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 500;
    }
    .req {
      color: var(--brand);
    }
    .optional {
      color: var(--muted);
      font-weight: 400;
    }
    label.option {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 36px;
      margin: 0;
      font-weight: 400;
      cursor: pointer;
    }
    label.option input {
      width: 18px;
      height: 18px;
      accent-color: var(--ink);
    }
    textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius-button);
      font: inherit;
      resize: vertical;
    }
    textarea[aria-invalid='true'] {
      border-color: var(--brand);
    }
    .hint {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 13px;
      text-align: right;
    }
    .hint.over,
    .error {
      color: var(--brand);
    }
    .error {
      margin: 4px 0 0;
      font-size: 13px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 24px;
    }
    .pill {
      min-height: 44px;
      padding: 0 24px;
      border: 1px solid var(--ink);
      border-radius: 999px;
      background: var(--ink);
      color: #fff;
      font: inherit;
      font-weight: 500;
    }
    .pill.outline {
      border-color: var(--line);
      background: #fff;
      color: var(--ink);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancelRequestDialog {
  readonly dialog = inject<DialogRef<CancelRequestResult>>(DialogRef);
  readonly data = inject<CancelRequestDialogData>(DIALOG_DATA);
  readonly request = (this.data.mode ?? 'request') === 'request';
  readonly max = CANCEL_REASON_MAX;
  readonly reasons = CANCEL_REASONS;
  readonly code = signal<CancelReasonCode | null>(null);
  readonly reason = signal('');
  private readonly submitted = signal(false);
  readonly length = computed(() => this.reason().trim().length);
  readonly tooLong = computed(() => this.length() > CANCEL_REASON_MAX);
  /** Only a cancel request (`to_ship`) must have a reason; a `to_pay` cancel just confirms. */
  readonly showMissing = computed(() => this.request && this.submitted() && !this.code());
  readonly noteMissing = computed(
    () => this.submitted() && this.code() === 'other' && this.length() === 0,
  );

  send(): void {
    this.submitted.set(true);
    const code = this.code();
    if ((this.request && !code) || this.tooLong() || this.noteMissing()) return;
    const reason = this.reason().trim();
    if (!code) {
      this.dialog.close({ choice: null });
      return;
    }
    this.dialog.close({ choice: reason ? { reasonCode: code, reason } : { reasonCode: code } });
  }
}
