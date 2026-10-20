import { Component, inject, Signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CatalogFilters } from './catalog-filters';
import { CatalogQuery } from './models/product';
import { IconComponent } from '../../shared/ui/icon.component';

export interface FilterDialogData {
  query: Signal<CatalogQuery>;
  update: (key: string, value: string | number | boolean) => void;
  clear: () => void;
}

@Component({
  selector: 'n2f-filter-dialog',
  imports: [CatalogFilters, IconComponent],
  template: `<section>
    <header>
      <h2>Bộ lọc</h2>
      <button
        type="button"
        class="icon-button"
        aria-label="Đóng bộ lọc"
        title="Đóng"
        (click)="dialog.close()"
      >
        <n2f-icon name="reiconX" />
      </button>
    </header>
    <n2f-catalog-filters
      [query]="data.query()"
      (filtersChanged)="data.update($event.key, $event.value)"
      (filtersCleared)="data.clear()"
    /><button type="button" class="button dark" (click)="dialog.close()">Xem sản phẩm</button>
  </section>`,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
    }
    section {
      padding: 20px 24px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 23px;
      font-weight: 500;
    }
    .button {
      margin-top: 30px;
      width: 100%;
    }
  `,
})
export class FilterDialog {
  readonly dialog = inject(DialogRef);
  readonly data = inject<FilterDialogData>(DIALOG_DATA);
}
