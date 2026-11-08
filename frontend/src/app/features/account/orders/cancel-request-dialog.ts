import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';

export const CANCEL_REASON_MAX = 250;

export interface CancelRequestDialogData {
  orderId: string;
}

/** What the dialog hands back when the shopper sends the request (`reason` is trimmed, maybe empty). */
export interface CancelRequestResult {
  reason: string;
}

/**
 * Cancelling a `to_ship` order is a request the shop reviews (Slice 4, BR-ADM-29): an optional
 * reason up to 250 characters. Open through OverlayService with the 'modal' panel.
 */
@Component({
  selector: 'n2f-cancel-request-dialog',
  imports: [FormsModule],
  template: `
    <form (ngSubmit)="send()" novalidate>
      <h2>Gửi yêu cầu huỷ đơn?</h2>
      <p class="lead">
        Đơn #{{ data.orderId }} đã được nine2fine tiếp nhận nên chưa thể huỷ ngay. nine2fine sẽ xem
        xét yêu cầu của bạn và phản hồi qua email. Trong lúc chờ, đơn hàng vẫn được giữ nguyên.
      </p>
      <label for="cancel-reason">Lý do huỷ (không bắt buộc)</label>
      <textarea
        id="cancel-reason"
        name="reason"
        rows="3"
        [ngModel]="reason()"
        (ngModelChange)="reason.set($event)"
        [attr.aria-invalid]="tooLong()"
        aria-describedby="cancel-reason-hint"
      ></textarea>
      <p id="cancel-reason-hint" class="hint" [class.over]="tooLong()">
        {{ length() }}/{{ max }} ký tự
      </p>
      @if (tooLong()) {
        <p class="error" role="alert">Lý do tối đa {{ max }} ký tự.</p>
      }
      <div class="actions">
        <button type="button" class="pill outline" (click)="dialog.close()">Quay lại</button>
        <button type="submit" class="pill">Gửi yêu cầu huỷ</button>
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
  readonly max = CANCEL_REASON_MAX;
  readonly reason = signal('');
  readonly length = computed(() => this.reason().trim().length);
  readonly tooLong = computed(() => this.length() > CANCEL_REASON_MAX);

  send(): void {
    if (this.tooLong()) return;
    this.dialog.close({ reason: this.reason().trim() });
  }
}
