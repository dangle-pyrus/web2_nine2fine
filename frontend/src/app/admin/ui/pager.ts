import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { num } from '../core/format';
import { PAGE_SIZES } from '../data-access/models';
import { AdmIcon } from './icon';

/** Pagination + rows per page (4.1: default 50, options 20/50/100). */
@Component({
  selector: 'adm-pager',
  imports: [AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pager">
      <span>{{ range() }}</span>
      <div class="row">
        <label class="row small">
          <span class="secondary">Số dòng</span>
          <select class="select select--sm" (change)="sizeChange.emit(+$any($event.target).value)">
            @for (size of sizes; track size) {
              <option [value]="size" [selected]="size === pageSize()">{{ size }}</option>
            }
          </select>
        </label>
        <button
          type="button"
          class="adm-btn adm-btn--icon adm-btn--sm"
          aria-label="Trang trước"
          [disabled]="page() <= 1"
          (click)="pageChange.emit(page() - 1)"
        >
          <adm-icon name="reiconChevronLeft" [size]="16" />
        </button>
        <button
          type="button"
          class="adm-btn adm-btn--icon adm-btn--sm"
          aria-label="Trang sau"
          [disabled]="page() >= pages()"
          (click)="pageChange.emit(page() + 1)"
        >
          <adm-icon name="reiconChevronRight" [size]="16" />
        </button>
      </div>
    </div>
  `,
})
export class AdmPager {
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();
  protected readonly sizes = PAGE_SIZES;
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly range = computed(() => {
    const total = this.total();
    if (!total) return '0 kết quả';
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(total, this.page() * this.pageSize());
    return `${num(start)}–${num(end)} trong ${num(total)} kết quả`;
  });
}
