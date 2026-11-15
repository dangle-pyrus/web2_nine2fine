import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminSession } from '../../core/admin-session';
import {
  ADMIN_CONTENT_API,
  type AdminSizeChart,
  ContentConflictError,
  type SizeChartTables as SizeChart,
} from '../../data-access/content-api';
import { errorMessage } from '../../data-access/http-support';
import { AdminApiError } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
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
  imports: [FormsModule, AdmPageHeader, AdmBadge, AdmIcon, AdmEmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <adm-page-header heading="Bảng size" />
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
          @if (chart.customised) {
            <div class="meta"><adm-badge label="Đã chỉnh sửa" tone="info" /></div>
          }
          @if (conflict(); as other) {
            <div class="banner" role="alert">
              <p>
                <strong>Người khác vừa lưu bảng size này</strong> trước bạn. Bản của bạn vẫn được
                giữ nguyên và chưa lưu.
              </p>
              <div class="row">
                <button type="button" class="adm-btn adm-btn--sm" (click)="useServerCopy()">
                  Dùng bản mới trên máy chủ
                </button>
                <button
                  type="button"
                  class="adm-btn adm-btn--sm adm-btn--primary"
                  (click)="keepMine()"
                >
                  Giữ bản của tôi
                </button>
              </div>
            </div>
          }
          @if (errorList().length) {
            <div class="banner banner--error" role="alert" aria-live="assertive">
              <p><strong>Chưa lưu được, kiểm tra các mục sau:</strong></p>
              <ul>
                @for (item of errorList(); track item.path) {
                  <li>
                    <span class="mono">{{ item.path }}</span
                    >: {{ item.message }}
                  </li>
                }
              </ul>
            </div>
          }
          @if (draft(); as value) {
            @for (table of tables; track table.key) {
              @let editing = isEditing(table.key);
              <section class="section" [attr.aria-labelledby]="table.key + '-title'">
                <header>
                  <h2 [id]="table.key + '-title'">{{ table.title }}</h2>
                  @if (canEdit) {
                    <span class="row">
                      @if (editing) {
                        <button
                          type="button"
                          class="adm-btn adm-btn--lg"
                          [disabled]="saving()"
                          (click)="discard(table.key)"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          class="adm-btn adm-btn--lg adm-btn--primary"
                          [class.is-busy]="saving()"
                          [disabled]="saving()"
                          (click)="save(table.key)"
                        >
                          Lưu
                        </button>
                      } @else {
                        <button type="button" class="adm-btn adm-btn--lg" (click)="edit(table.key)">
                          Chỉnh sửa
                        </button>
                      }
                    </span>
                  }
                </header>
                <p class="section-desc">{{ table.hint }}</p>
                <div class="frame table-wrap">
                  <table class="preview" [attr.aria-describedby]="table.key + '-title'">
                    <thead>
                      <tr>
                        <th>Size</th>
                        @for (column of value[columns[table.key]]; track $index; let c = $index) {
                          <th>
                            @if (editing) {
                              <span class="head">
                                <input
                                  class="input input--sm cell"
                                  [attr.aria-label]="'Tên cột ' + (c + 1)"
                                  maxlength="20"
                                  [ngModel]="column"
                                  (ngModelChange)="renameColumn(table.key, c, $event)"
                                />
                                <button
                                  type="button"
                                  class="adm-btn adm-btn--icon adm-btn--sm adm-btn--ghost"
                                  [attr.aria-label]="'Xóa cột ' + column"
                                  (click)="removeColumn(table.key, c)"
                                >
                                  <adm-icon name="reiconX" [size]="14" />
                                </button>
                              </span>
                            } @else {
                              {{ column }}
                            }
                          </th>
                        }
                        @if (editing) {
                          <th class="w-actions"><span class="sr-only">Xóa</span></th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of value[table.key]; track $index; let r = $index) {
                        <tr>
                          <th scope="row">
                            @if (editing) {
                              <input
                                class="input input--sm cell size"
                                [attr.aria-label]="'Size dòng ' + (r + 1)"
                                [attr.aria-invalid]="!!errors()[table.key + '[' + r + '].size']"
                                maxlength="10"
                                [ngModel]="row.size"
                                (ngModelChange)="setSize(table.key, r, $event)"
                              />
                            } @else {
                              {{ row.size }}
                            }
                          </th>
                          @for (column of value[columns[table.key]]; track $index) {
                            <td>
                              @if (editing) {
                                <input
                                  class="input input--sm cell"
                                  inputmode="decimal"
                                  [attr.aria-label]="column + ' size ' + row.size"
                                  [attr.aria-invalid]="
                                    !!errors()[table.key + '[' + r + '].values.' + column]
                                  "
                                  maxlength="20"
                                  [ngModel]="row.values[column] ?? ''"
                                  (ngModelChange)="setCell(table.key, r, column, $event)"
                                />
                              } @else {
                                {{ row.values[column] || '–' }}
                              }
                            </td>
                          }
                          @if (editing) {
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
                @if (editing) {
                  <div class="row adds">
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
                  </div>
                }
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
    .banner {
      display: grid;
      gap: 8px;
      margin-bottom: 16px;
      padding: 12px 16px;
      border-radius: var(--adm-radius-lg);
      background: var(--adm-muted);
      ul {
        margin: 0;
        padding-left: 18px;
      }
      &.banner--error {
        color: var(--adm-danger);
      }
    }
    .meta {
      margin: 16px 0 0;
    }
    .frame {
      padding: 16px;
      border-radius: var(--adm-radius-lg);
      background: var(--adm-muted);
    }
    .preview {
      width: 100%;
      min-width: 360px;
      border-collapse: collapse;
      text-align: center;
      th,
      td {
        height: 44px;
        padding: 0 8px;
        font-variant-numeric: tabular-nums;
      }
      th:first-child {
        text-align: left;
      }
      thead th {
        font-weight: 400;
        color: var(--adm-text-secondary);
      }
      tbody th {
        font-weight: 500;
      }
    }
    .section > header h2 {
      font-size: 20px;
      line-height: 28px;
      font-weight: 500;
      letter-spacing: -0.01em;
    }
    .cell {
      width: 100%;
      min-width: 72px;
      height: 32px;
      background: #fff;
      text-align: center;
    }
    .size {
      width: 72px;
      min-width: 0;
      font-weight: 500;
      text-align: left;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 2px;
      font-weight: 400;
    }
    .adds {
      margin-top: 12px;
    }
  `,
})
export class SizeChartPage implements HasUnsavedChanges {
  private readonly api = inject(ADMIN_CONTENT_API);
  private readonly toast = inject(AdminToastService);
  protected readonly canEdit = inject(AdminSession).can('content.edit');
  protected readonly columns = COLUMNS;
  protected readonly tables: { key: Table; title: string; hint: string }[] = [
    { key: 'body', title: 'Số đo cơ thể', hint: 'Số đo của người mặc, đơn vị cm.' },
    { key: 'garment', title: 'Số đo sản phẩm', hint: 'Đo trên sản phẩm trải phẳng, đơn vị cm.' },
  ];

  protected readonly charts = signal<AdminSizeChart[] | null>(null);
  protected readonly error = signal('');
  protected readonly active = signal('');
  protected readonly draft = signal<SizeChart | null>(null);
  protected readonly editing = signal<Record<Table, boolean>>({ body: false, garment: false });
  protected readonly saving = signal(false);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly conflict = signal<AdminSizeChart | null>(null);
  protected readonly errorList = computed(() =>
    Object.entries(this.errors()).map(([path, message]) => ({ path, message })),
  );
  protected readonly current = computed(
    () => this.charts()?.find((chart) => chart.category === this.active()) ?? null,
  );
  protected readonly dirty = computed(() => {
    const current = this.current();
    const draft = this.draft();
    return !!current && !!draft && JSON.stringify(draft) !== JSON.stringify(current.chart);
  });
  protected readonly anyEditing = computed(() => this.editing().body || this.editing().garment);

  constructor() {
    this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.canEdit && this.anyEditing() && this.dirty() && !this.saving();
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
    this.editing.set({ body: false, garment: false });
    this.errors.set({});
    this.conflict.set(null);
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

  isEditing(table: Table): boolean {
    return this.editing()[table];
  }

  edit(table: Table): void {
    this.editing.update((state) => ({ ...state, [table]: true }));
  }

  /** Both tables share one payload: send the saved copy with only this table replaced by my draft. */
  save(table: Table): void {
    const draft = this.draft();
    const current = this.current();
    if (!draft || !current) return;
    const payload = structuredClone(current.chart);
    payload[table] = draft[table];
    payload[COLUMNS[table]] = draft[COLUMNS[table]];
    this.saving.set(true);
    this.errors.set({});
    this.api.saveSizeChart(current.category, payload, current.updatedAt).subscribe({
      next: (saved) => {
        this.saving.set(false);
        const other: Table = table === 'body' ? 'garment' : 'body';
        const keep = this.editing()[other] ? draft : null;
        this.replace(saved);
        if (keep) {
          this.editing.update((state) => ({ ...state, [other]: true }));
          this.update((chart) => {
            chart[other] = keep[other];
            chart[COLUMNS[other]] = keep[COLUMNS[other]];
          });
        }
        this.toast.show(`Đã lưu bảng size ${saved.label}`);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof ContentConflictError && error.current) {
          this.conflict.set(error.current as AdminSizeChart);
          return;
        }
        if (error instanceof AdminApiError && Object.keys(error.fields).length)
          this.errors.set(error.fields);
        this.toast.error(errorMessage(error));
      },
    });
  }

  /** Drop my unsaved edits of this table only. */
  discard(table: Table): void {
    const saved = this.current()?.chart;
    if (!saved) return;
    this.update((chart) => {
      chart[table] = structuredClone(saved[table]);
      chart[COLUMNS[table]] = [...saved[COLUMNS[table]]];
    });
    this.errors.update((errors) =>
      Object.fromEntries(Object.entries(errors).filter(([path]) => !path.startsWith(table))),
    );
    this.editing.update((state) => ({ ...state, [table]: false }));
  }

  /** 409: take what the other admin saved. */
  useServerCopy(): void {
    const other = this.conflict();
    if (other) this.replace(other);
  }

  /** 409: keep my edits; the next save is based on the newer server copy. */
  keepMine(): void {
    const other = this.conflict();
    const draft = this.draft();
    if (!other || !draft) return;
    this.charts.update((charts) =>
      (charts ?? []).map((item) => (item.category === other.category ? other : item)),
    );
    this.draft.set(draft);
    this.conflict.set(null);
    this.toast.show('Đã giữ bản của bạn. Bấm Lưu để ghi đè bản mới.');
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
