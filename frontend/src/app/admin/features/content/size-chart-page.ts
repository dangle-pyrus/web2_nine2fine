import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminSession } from '../../core/admin-session';
import { ADMIN_STOREFRONT_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { AdminSizeChart, SizeChart } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmSaveBar } from '../../ui/save-bar';
import { AdminToastService } from '../../ui/toast';
import { HasUnsavedChanges } from '../../ui/unsaved-changes';

type Table = 'body' | 'garment';
const COLUMNS: Record<Table, 'bodyColumns' | 'garmentColumns'> = {
  body: 'bodyColumns',
  garment: 'garmentColumns',
};

/**
 * Bảng size (Đợt 3): one chart per category, shown on every product page of that category. Cells
 * are free text in cm so ranges like "86–90" stay possible.
 */
@Component({
  selector: 'adm-size-chart-page',
  imports: [FormsModule, RouterLink, AdmPageHeader, AdmBadge, AdmIcon, AdmEmptyState, AdmSaveBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <adm-page-header heading="Bảng size">
      <p subtitle class="secondary small">
        Mỗi danh mục một bảng, hiện ở mục "Hướng dẫn chọn size" trên trang sản phẩm.
      </p>
    </adm-page-header>
    <adm-save-bar
      [visible]="canEdit && dirty()"
      [saving]="saving()"
      label="Bảng size chưa được lưu"
      (save)="save()"
      (discard)="discard()"
    />
    <div class="page-body page-body--wide">
      @if (error(); as message) {
        <adm-empty kind="error" heading="Không tải được bảng size" [description]="message">
          <button type="button" class="adm-btn" (click)="load()">Thử lại</button>
        </adm-empty>
      } @else if (charts(); as list) {
        <nav class="tabs" aria-label="Danh mục">
          @for (item of list; track item.category) {
            <button
              type="button"
              [class.is-active]="active() === item.category"
              (click)="select(item.category)"
            >
              {{ item.label }}
            </button>
          }
        </nav>
        @if (current(); as chart) {
          <div class="meta">
            <p class="secondary">
              Áp dụng cho
              <a
                class="link"
                routerLink="/admin/products"
                [queryParams]="{ category: chart.category }"
                >{{ chart.productCount }} sản phẩm</a
              >
              thuộc danh mục {{ chart.label }}.
            </p>
            @if (chart.customised) {
              <adm-badge label="Đã chỉnh sửa" tone="info" />
              @if (canEdit) {
                <button type="button" class="adm-btn adm-btn--sm adm-btn--ghost" (click)="reset()">
                  <adm-icon name="reiconUndo" [size]="16" /> Về bảng mặc định
                </button>
              }
            }
          </div>
          @if (draft(); as value) {
            @for (table of tables; track table.key) {
              <section class="section" [attr.aria-labelledby]="table.key + '-title'">
                <header>
                  <h2 [id]="table.key + '-title'">{{ table.title }}</h2>
                  @if (canEdit) {
                    <span class="row">
                      <button
                        type="button"
                        class="adm-btn adm-btn--sm"
                        (click)="addColumn(table.key)"
                      >
                        <adm-icon name="reiconPlus" [size]="16" /> Thêm cột
                      </button>
                      <button type="button" class="adm-btn adm-btn--sm" (click)="addRow(table.key)">
                        <adm-icon name="reiconPlus" [size]="16" /> Thêm size
                      </button>
                    </span>
                  }
                </header>
                <p class="section-desc">{{ table.hint }}</p>
                <div class="table-wrap">
                  <table class="table grid" [attr.aria-describedby]="table.key + '-title'">
                    <thead>
                      <tr>
                        <th>Size</th>
                        @for (column of value[columns[table.key]]; track $index; let c = $index) {
                          <th>
                            <span class="head">
                              <input
                                class="input input--sm"
                                [attr.aria-label]="'Tên cột ' + (c + 1)"
                                [disabled]="!canEdit"
                                [ngModel]="column"
                                (ngModelChange)="renameColumn(table.key, c, $event)"
                              />
                              @if (canEdit) {
                                <button
                                  type="button"
                                  class="adm-btn adm-btn--icon adm-btn--sm adm-btn--ghost"
                                  [attr.aria-label]="'Xóa cột ' + column"
                                  (click)="removeColumn(table.key, c)"
                                >
                                  <adm-icon name="reiconX" [size]="14" />
                                </button>
                              }
                            </span>
                          </th>
                        }
                        @if (canEdit) {
                          <th class="w-actions"><span class="sr-only">Xóa</span></th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of value[table.key]; track $index; let r = $index) {
                        <tr>
                          <td>
                            <input
                              class="input input--sm size"
                              [attr.aria-label]="'Size dòng ' + (r + 1)"
                              [disabled]="!canEdit"
                              [ngModel]="row.size"
                              (ngModelChange)="setSize(table.key, r, $event)"
                            />
                          </td>
                          @for (column of value[columns[table.key]]; track $index) {
                            <td>
                              <input
                                class="input input--sm num"
                                inputmode="decimal"
                                [attr.aria-label]="column + ' size ' + row.size"
                                [disabled]="!canEdit"
                                [ngModel]="row.values[column] ?? ''"
                                (ngModelChange)="setCell(table.key, r, column, $event)"
                              />
                            </td>
                          }
                          @if (canEdit) {
                            <td class="w-actions">
                              <button
                                type="button"
                                class="adm-btn adm-btn--icon adm-btn--sm adm-btn--ghost"
                                [attr.aria-label]="'Xóa size ' + row.size"
                                (click)="removeRow(table.key, r)"
                              >
                                <adm-icon name="reiconTrash" [size]="16" />
                              </button>
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>
            }
          }
        }
      } @else {
        <div class="stack"><span class="sk sk--title"></span><span class="sk"></span></div>
      }
    </div>
  `,
  styles: `
    .meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px 12px;
      margin: 16px 0 24px;
    }
    .grid {
      min-width: 480px;
      th,
      td {
        padding: 6px 8px;
      }
      .input {
        min-width: 72px;
      }
    }
    .head {
      display: flex;
      align-items: center;
      gap: 2px;
      font-weight: 400;
    }
    .size {
      width: 72px;
      font-weight: 500;
    }
  `,
})
export class SizeChartPage implements HasUnsavedChanges {
  private readonly api = inject(ADMIN_STOREFRONT_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  protected readonly canEdit = inject(AdminSession).can('products.edit');
  protected readonly columns = COLUMNS;
  protected readonly tables: { key: Table; title: string; hint: string }[] = [
    { key: 'body', title: 'Số đo cơ thể', hint: 'Số đo của người mặc, đơn vị cm.' },
    { key: 'garment', title: 'Số đo sản phẩm', hint: 'Đo trên sản phẩm trải phẳng, đơn vị cm.' },
  ];

  protected readonly charts = signal<AdminSizeChart[] | null>(null);
  protected readonly error = signal('');
  protected readonly active = signal('');
  protected readonly draft = signal<SizeChart | null>(null);
  protected readonly saving = signal(false);
  protected readonly current = computed(
    () => this.charts()?.find((chart) => chart.category === this.active()) ?? null,
  );
  protected readonly dirty = computed(() => {
    const current = this.current();
    const draft = this.draft();
    return !!current && !!draft && JSON.stringify(draft) !== JSON.stringify(current.chart);
  });

  constructor() {
    this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.canEdit && this.dirty() && !this.saving();
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  load(): void {
    this.error.set('');
    this.api.sizeCharts().subscribe({
      next: (charts) => {
        this.charts.set(charts);
        this.select(this.active() || charts[0]?.category || '', true);
      },
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  select(category: string, force = false): void {
    if (!force && category === this.active()) return;
    if (!force && this.hasUnsavedChanges()) {
      this.toast.error('Lưu hoặc hủy thay đổi của bảng hiện tại trước khi chuyển danh mục.');
      return;
    }
    this.active.set(category);
    const chart = this.charts()?.find((item) => item.category === category);
    this.draft.set(chart ? structuredClone(chart.chart) : null);
  }

  setSize(table: Table, row: number, size: string): void {
    this.update((chart) => (chart[table][row].size = size));
  }

  setCell(table: Table, row: number, column: string, value: string): void {
    this.update((chart) => (chart[table][row].values[column] = value));
  }

  renameColumn(table: Table, index: number, name: string): void {
    this.update((chart) => {
      const before = chart[COLUMNS[table]][index];
      chart[COLUMNS[table]][index] = name;
      for (const row of chart[table]) {
        row.values[name] = row.values[before] ?? '';
        if (before !== name) delete row.values[before];
      }
    });
  }

  addColumn(table: Table): void {
    this.update((chart) => {
      const name = `Số đo ${chart[COLUMNS[table]].length + 1}`;
      chart[COLUMNS[table]].push(name);
      for (const row of chart[table]) row.values[name] = '';
    });
  }

  removeColumn(table: Table, index: number): void {
    this.update((chart) => {
      const [name] = chart[COLUMNS[table]].splice(index, 1);
      for (const row of chart[table]) delete row.values[name];
    });
  }

  addRow(table: Table): void {
    this.update((chart) =>
      chart[table].push({
        size: '',
        values: Object.fromEntries(chart[COLUMNS[table]].map((column) => [column, ''])),
      }),
    );
  }

  removeRow(table: Table, index: number): void {
    this.update((chart) => chart[table].splice(index, 1));
  }

  save(): void {
    const draft = this.draft();
    if (!draft) return;
    this.saving.set(true);
    this.api.saveSizeChart(this.active(), draft).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.replace(saved);
        this.toast.show(`Đã lưu bảng size ${saved.label}`);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  discard(): void {
    this.select(this.active(), true);
  }

  reset(): void {
    const chart = this.current();
    if (!chart) return;
    this.dialogs
      .confirm({
        title: `Dùng lại bảng size mặc định cho ${chart.label}?`,
        message: 'Các số đo bạn đã sửa cho danh mục này sẽ mất.',
        confirmLabel: 'Về bảng mặc định',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.resetSizeChart(chart.category).subscribe({
          next: (saved) => {
            this.replace(saved);
            this.toast.show('Đã khôi phục bảng size mặc định');
          },
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
      });
  }

  private replace(saved: AdminSizeChart): void {
    this.charts.update((charts) =>
      (charts ?? []).map((item) => (item.category === saved.category ? saved : item)),
    );
    this.select(saved.category, true);
  }

  private update(change: (chart: SizeChart) => void): void {
    const draft = this.draft();
    if (!draft) return;
    const next = structuredClone(draft);
    change(next);
    this.draft.set(next);
  }
}
