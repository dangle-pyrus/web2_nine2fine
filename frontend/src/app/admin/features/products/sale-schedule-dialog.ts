import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

export interface SaleScheduleData {
  startsAt: string | null;
  endsAt: string | null;
  canRemove: boolean;
}

export type SaleScheduleResult = { startsAt: string | null; endsAt: string | null } | 'remove';

/** Thời hạn của đợt giảm giá: chỉ chọn ngày, kiểm tra do trang sản phẩm và máy chủ làm (BR-PROMO-01). */
@Component({
  selector: 'adm-sale-schedule-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (submit)="$event.preventDefault(); done()">
      <h2>Thời hạn giảm giá</h2>
      <p class="dialog-desc">Hết hạn tự quay về giá bán, không cần làm gì thêm.</p>
      <div class="dialog-body">
        <div class="field">
          <label for="sale-start">Từ ngày</label>
          <input
            id="sale-start"
            class="input"
            type="date"
            [value]="startsAt() ?? ''"
            (input)="startsAt.set($any($event.target).value || null)"
          />
        </div>
        <div class="field">
          <label for="sale-end">Đến hết ngày</label>
          <input
            id="sale-end"
            class="input"
            type="date"
            [value]="endsAt() ?? ''"
            (input)="endsAt.set($any($event.target).value || null)"
          />
        </div>
      </div>
      <div class="dialog-actions">
        @if (data.canRemove) {
          <button type="button" class="adm-btn adm-btn--lg remove" (click)="ref.close('remove')">
            Gỡ đợt giảm giá
          </button>
        }
        <button type="submit" class="adm-btn adm-btn--primary adm-btn--lg">Xong</button>
      </div>
    </form>
  `,
  styles: '.remove { margin-right: auto; }',
})
export class SaleScheduleDialog {
  protected readonly data = inject<SaleScheduleData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<SaleScheduleResult>>(DialogRef);
  protected readonly startsAt = signal(this.data.startsAt);
  protected readonly endsAt = signal(this.data.endsAt);

  protected done(): void {
    this.ref.close({ startsAt: this.startsAt(), endsAt: this.endsAt() });
  }
}
