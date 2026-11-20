import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NumPipe } from '../core/format.pipes';

export type ExportScope = 'page' | 'all' | 'selected';

export interface ExportDialogData {
  /** What a row is, e.g. "đơn hàng", "SKU". */
  noun: string;
  /** Rows on the current page. */
  pageCount: number;
  /** Rows matching the current filters, across every page. */
  total: number;
  /** Rows ticked for a bulk action; 0 hides the option. */
  selectedCount?: number;
}

/**
 * "Xuất file" always says what will be exported (5.1): the page alone is rarely what people mean,
 * so the default is every row that matches the filters.
 */
@Component({
  selector: 'adm-export-dialog',
  imports: [FormsModule, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="rowCount() && ref.close(scope)">
      <h2>Xuất file CSV</h2>
      <p class="dialog-desc">File mở được bằng Excel hoặc Google Sheets.</p>
      <div class="dialog-body">
        <fieldset class="scopes">
          <legend class="sr-only">Phạm vi xuất</legend>
          <label class="check"
            ><input type="radio" name="scope" value="all" [(ngModel)]="scope" /><span
              >Tất cả {{ data.total | admNum }} {{ data.noun }} theo bộ lọc<span class="check-desc"
                >Gồm mọi trang của danh sách đang lọc.</span
              ></span
            ></label
          >
          <label class="check"
            ><input
              type="radio"
              name="scope"
              value="page"
              [disabled]="!data.pageCount"
              [(ngModel)]="scope"
            /><span
              >Trang hiện tại<span class="check-desc"
                >{{ data.pageCount | admNum }} {{ data.noun }} đang hiển thị.</span
              ></span
            ></label
          >
          @if (data.selectedCount) {
            <label class="check"
              ><input type="radio" name="scope" value="selected" [(ngModel)]="scope" /><span
                >{{ data.selectedCount | admNum }} {{ data.noun }} đã chọn</span
              ></label
            >
          }
        </fieldset>
        @if (!rowCount()) {
          <p class="dialog-desc" role="alert">Phạm vi này không có {{ data.noun }} nào để xuất.</p>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary" [disabled]="!rowCount()">
          Xuất file
        </button>
      </div>
    </form>
  `,
  styles: `
    .scopes {
      display: flex;
      flex-direction: column;
      gap: 12px;
      border: 0;
      padding: 0;
      margin: 0;
    }
  `,
})
export class ExportDialog {
  readonly ref = inject<DialogRef<ExportScope>>(DialogRef);
  readonly data = inject<ExportDialogData>(DIALOG_DATA);
  scope: ExportScope = this.data.selectedCount ? 'selected' : 'all';

  /** Rows the chosen scope holds; 0 blocks the export. */
  rowCount(): number {
    return this.scope === 'page'
      ? this.data.pageCount
      : this.scope === 'selected'
        ? (this.data.selectedCount ?? 0)
        : this.data.total;
  }
}
