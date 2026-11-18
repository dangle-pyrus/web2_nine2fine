import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, concatMap, from, map, of, toArray } from 'rxjs';
import { NumPipe } from '../../core/format.pipes';
import { ADMIN_INVENTORY_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import { newIdempotencyKey } from '../../data-access/inventory-api';
import type { InventoryItem } from '../../data-access/models';
import { AdmIcon } from '../../ui/icon';
import { downloadCsv } from '../../ui/list-state';
import {
  detectMapping,
  fold,
  IMPORT_FIELDS,
  readSheet,
  type ImportField,
  type SheetRows,
} from './import-file';

export interface QuickReceiveData {
  /** Every SKU of the shop, to pick from and to match file rows against. */
  items: InventoryItem[];
}

export interface QuickReceiveResult {
  /** SKUs whose stock went up. */
  done: number;
  /** Units received in all. */
  units: number;
  failed: { label: string; message: string }[];
}

interface Line {
  item: InventoryItem;
  quantity: number | null;
}

interface FileRow {
  /** Row number in the file (header is row 1). */
  row: number;
  name: string;
  color: string;
  size: string;
  quantityText: string;
  quantity: number | null;
  item: InventoryItem | null;
  problem: string;
}

const MAX_RESULTS = 8;

/**
 * Nhập kho nhanh: many SKUs in one go, picked by hand or read from a CSV / Excel file. Every line is
 * a stock adjustment with the reason "Nhập hàng" (received), sent one after another.
 */
@Component({
  selector: 'adm-quick-receive-dialog',
  imports: [FormsModule, AdmIcon, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <div class="dialog qr">
      <header class="qr-head">
        <div>
          <h2>Nhập kho nhanh</h2>
          <p class="dialog-desc">
            Cộng thêm số lượng vào tồn kho của nhiều SKU cùng lúc. Lý do ghi nhận: Nhập hàng.
          </p>
        </div>
        <button
          type="button"
          class="adm-btn adm-btn--sm adm-btn--icon adm-btn--ghost"
          aria-label="Đóng"
          [disabled]="saving()"
          (click)="ref.close()"
        >
          <adm-icon name="reiconX" [size]="16" />
        </button>
      </header>

      <div class="segmented qr-modes" role="tablist" aria-label="Cách nhập">
        <button
          type="button"
          role="tab"
          data-testid="qr-mode-manual"
          [class.is-active]="mode() === 'manual'"
          [attr.aria-selected]="mode() === 'manual'"
          [disabled]="saving()"
          (click)="mode.set('manual')"
        >
          Chọn sản phẩm
        </button>
        <button
          type="button"
          role="tab"
          data-testid="qr-mode-file"
          [class.is-active]="mode() === 'file'"
          [attr.aria-selected]="mode() === 'file'"
          [disabled]="saving()"
          (click)="mode.set('file')"
        >
          Tải file CSV / Excel
        </button>
      </div>

      <div class="dialog-body">
        @if (mode() === 'manual') {
          <div class="qr-search">
            <div class="affix">
              <span class="prefix-icon"><adm-icon name="reiconSearch" [size]="16" /></span>
              <input
                class="input"
                type="search"
                placeholder="Tìm tên sản phẩm, màu, size hoặc SKU"
                aria-label="Tìm sản phẩm để nhập kho"
                data-testid="qr-search"
                [ngModel]="query()"
                (ngModelChange)="query.set($event)"
                (keydown.enter)="$event.preventDefault(); addFirst()"
              />
            </div>
            @if (query().trim()) {
              <ul class="qr-results" role="listbox" aria-label="Kết quả tìm kiếm">
                @for (item of results(); track item.variantId) {
                  <li>
                    <button type="button" role="option" (click)="add(item)">
                      <img class="thumb" [src]="item.image || placeholder" alt="" />
                      <span class="qr-name">
                        <span class="cell-title">{{ item.productName }}</span>
                        <span class="cell-sub">
                          <span class="swatch" [style.background]="item.color.hex"></span>
                          {{ item.color.name }} / {{ item.size }}
                        </span>
                      </span>
                      <span class="small tertiary">Trong kho {{ item.onHand | admNum }}</span>
                      <adm-icon name="reiconPlus" [size]="16" />
                    </button>
                  </li>
                } @empty {
                  <li class="small secondary qr-none">Không tìm thấy SKU nào.</li>
                }
                @if (sameProduct(); as group) {
                  <li>
                    <button type="button" class="qr-all" (click)="addAll(group.items)">
                      <adm-icon name="reiconPlus" [size]="16" />
                      Thêm cả {{ group.items.length }} biến thể của "{{ group.name }}"
                    </button>
                  </li>
                }
              </ul>
            }
          </div>

          @if (lines().length) {
            <div class="table-wrap qr-table">
              <table class="table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>Màu</th>
                    <th>Size</th>
                    <th class="num">Trong kho</th>
                    <th class="num qr-qty-col">Số lượng nhập</th>
                    <th class="w-icon"><span class="sr-only">Bỏ</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (line of lines(); track line.item.variantId; let i = $index) {
                    <tr>
                      <td>
                        <div class="cell-media">
                          <img class="thumb" [src]="line.item.image || placeholder" alt="" />
                          <span class="cell-title">{{ line.item.productName }}</span>
                        </div>
                      </td>
                      <td>
                        <span class="row-inline">
                          <span class="swatch" [style.background]="line.item.color.hex"></span>
                          {{ line.item.color.name }}
                        </span>
                      </td>
                      <td>{{ line.item.size }}</td>
                      <td class="num secondary">{{ line.item.onHand | admNum }}</td>
                      <td class="num">
                        <input
                          class="input input--sm num-input qr-qty"
                          type="number"
                          min="1"
                          max="99999"
                          step="1"
                          inputmode="numeric"
                          placeholder="0"
                          [attr.aria-label]="'Số lượng nhập ' + line.item.sku"
                          [attr.aria-invalid]="tried() && !validQty(line.quantity)"
                          [ngModel]="line.quantity"
                          (ngModelChange)="setQty(i, $event)"
                        />
                      </td>
                      <td class="w-icon">
                        <button
                          type="button"
                          class="adm-btn adm-btn--sm adm-btn--icon adm-btn--ghost"
                          [attr.aria-label]="'Bỏ ' + line.item.sku"
                          (click)="remove(i)"
                        >
                          <adm-icon name="reiconTrash" [size]="16" />
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (tried() && manualInvalid()) {
              <p class="error" role="alert">
                Nhập số lượng là số nguyên từ 1 trở lên cho mọi dòng.
              </p>
            }
          } @else {
            <p class="qr-empty small secondary">
              Tìm và chọn SKU ở ô bên trên. Mỗi SKU được chọn sẽ hiện ở đây kèm ô số lượng nhập.
            </p>
          }
        } @else {
          <div
            class="qr-drop"
            [class.is-over]="dragOver()"
            (dragover)="$event.preventDefault(); dragOver.set(true)"
            (dragleave)="dragOver.set(false)"
            (drop)="onDrop($event)"
          >
            <adm-icon name="reiconDocumentText" [size]="24" />
            @if (fileName(); as name) {
              <p>
                <strong>{{ name }}</strong>
                <span class="secondary"> · {{ fileRows().length }} dòng dữ liệu</span>
              </p>
            } @else {
              <p>Kéo thả file vào đây, hoặc</p>
            }
            <label class="adm-btn adm-btn--sm">
              {{ fileName() ? 'Chọn file khác' : 'Chọn file' }}
              <input
                class="sr-only"
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                data-testid="qr-file"
                (change)="onFile($event)"
              />
            </label>
            <p class="small tertiary">
              Hỗ trợ .csv và .xlsx. Dòng đầu là tên cột: product_name, color, size, quantity (có thể
              thêm sku).
              <button type="button" class="link small" (click)="downloadTemplate()">
                Tải file mẫu
              </button>
            </p>
          </div>
          @if (fileError(); as message) {
            <p class="error" role="alert">{{ message }}</p>
          }

          @if (header().length) {
            <section class="qr-map" aria-labelledby="qr-map-title">
              <h3 id="qr-map-title">Cột trong file</h3>
              <p class="small secondary">Đã tự nhận diện theo tên cột. Đổi lại nếu nhận sai.</p>
              <div class="qr-map-grid">
                @for (field of fields; track field.key) {
                  <label class="qr-map-item">
                    <span class="small" [class.req]="field.required">{{ field.label }}</span>
                    <select
                      class="select select--sm"
                      [attr.data-testid]="'qr-map-' + field.key"
                      [ngModel]="mapping()[field.key]"
                      (ngModelChange)="setMapping(field.key, $event)"
                    >
                      <option [ngValue]="-1">Không dùng</option>
                      @for (col of header(); track $index) {
                        <option [ngValue]="$index">{{ col || 'Cột ' + ($index + 1) }}</option>
                      }
                    </select>
                  </label>
                }
              </div>
              @if (missingFields().length) {
                <p class="error" role="alert">Chưa có cột cho: {{ missingFields().join(', ') }}.</p>
              }
            </section>

            @if (!missingFields().length) {
              <div class="qr-summary small">
                <span class="ok"
                  ><adm-icon name="reiconCheckCircle" [size]="14" /> {{ fileOk().length }} dòng hợp
                  lệ</span
                >
                @if (fileBad().length) {
                  <span class="bad"
                    ><adm-icon name="reiconAlertTriangle" [size]="14" /> {{ fileBad().length }} dòng
                    sẽ bỏ qua</span
                  >
                }
              </div>
              <div class="table-wrap qr-table">
                <table class="table">
                  <thead>
                    <tr>
                      <th class="num">Dòng</th>
                      <th>Sản phẩm</th>
                      <th>Màu</th>
                      <th>Size</th>
                      <th class="num">Số lượng</th>
                      <th>Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of fileRows(); track row.row) {
                      <tr [class.qr-bad]="!!row.problem">
                        <td class="num tertiary">{{ row.row }}</td>
                        <td>
                          <div class="cell-media">
                            @if (row.item) {
                              <img class="thumb" [src]="row.item.image || placeholder" alt="" />
                            }
                            <span class="cell-title">{{ row.item?.productName ?? row.name }}</span>
                          </div>
                        </td>
                        <td>
                          <span class="row-inline">
                            @if (row.item) {
                              <span class="swatch" [style.background]="row.item.color.hex"></span>
                            }
                            {{ row.item?.color?.name ?? row.color }}
                          </span>
                        </td>
                        <td>{{ row.item?.size ?? row.size }}</td>
                        <td class="num">{{ row.quantity ?? row.quantityText }}</td>
                        <td>
                          @if (row.problem) {
                            <span class="small bad">{{ row.problem }}</span>
                          } @else {
                            <span class="small ok">Khớp SKU {{ row.item!.sku }}</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        }

        <div class="field">
          <label for="qr-note">Ghi chú</label>
          <input
            id="qr-note"
            class="input"
            name="note"
            maxlength="200"
            [ngModel]="note()"
            (ngModelChange)="note.set($event)"
          />
          <p class="small tertiary">Lý do: Nhập hàng (tự ghi vào lịch sử từng SKU).</p>
        </div>
      </div>

      <div class="dialog-actions">
        @if (saving()) {
          <span class="small secondary qr-progress" aria-live="polite">
            Đang nhập {{ progress() }}/{{ pending().length }} SKU…
          </span>
        }
        <button type="button" class="adm-btn" [disabled]="saving()" (click)="ref.close()">
          Hủy bỏ
        </button>
        <button
          type="button"
          class="adm-btn adm-btn--primary"
          data-testid="qr-submit"
          [class.is-busy]="saving()"
          [disabled]="saving() || !pending().length"
          (click)="submit()"
        >
          @if (pending().length) {
            Nhập kho {{ pending().length }} SKU (+{{ totalUnits() | admNum }})
          } @else {
            Nhập kho
          }
        </button>
      </div>
    </div>
  `,
  styles: `
    .qr-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .qr-modes {
      margin-top: 16px;
    }
    .qr-search {
      position: relative;
    }
    .qr-results {
      list-style: none;
      margin: 6px 0 0;
      padding: 4px;
      max-height: 300px;
      overflow-y: auto;
      border-radius: 12px;
      background: #fff;
      box-shadow:
        0 0 0 1px var(--adm-divider),
        0 8px 24px rgba(0, 0, 0, 0.08);
      button {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 8px;
        border: 0;
        border-radius: 8px;
        background: none;
        font: inherit;
        text-align: left;
        cursor: pointer;
        &:hover,
        &:focus-visible {
          background: var(--adm-muted);
        }
      }
    }
    .qr-name {
      display: grid;
      flex: 1;
      min-width: 0;
    }
    .qr-none {
      padding: 10px 8px;
    }
    .qr-all {
      color: var(--adm-text-secondary);
      border-top: 1px solid var(--adm-divider) !important;
      border-radius: 0 0 8px 8px !important;
    }
    .qr-table {
      max-height: 340px;
      overflow: auto;
    }
    .qr-qty-col {
      width: 128px;
    }
    .qr-qty {
      width: 96px;
      text-align: right;
    }
    .w-icon {
      width: 40px;
    }
    .row-inline {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .swatch {
      width: 12px;
      height: 12px;
    }
    .qr-empty {
      padding: 24px;
      border-radius: 12px;
      background: var(--adm-muted);
      text-align: center;
    }
    .qr-drop {
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 24px;
      border: 1.5px dashed var(--adm-divider);
      border-radius: 14px;
      text-align: center;
      transition: background 120ms ease-out;
      &.is-over {
        background: var(--adm-muted);
        border-color: var(--adm-text-tertiary);
      }
      label {
        cursor: pointer;
      }
    }
    .qr-map {
      display: grid;
      gap: 8px;
      h3 {
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
      }
    }
    .qr-map-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
    }
    .qr-map-item {
      display: grid;
      gap: 4px;
    }
    .qr-summary {
      display: flex;
      gap: 16px;
      span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
    }
    .ok {
      color: var(--adm-success-fg);
    }
    .bad {
      color: var(--adm-critical-fg);
    }
    tr.qr-bad td {
      background: var(--adm-critical-bg);
    }
    .qr-progress {
      margin-right: auto;
      align-self: center;
    }
  `,
})
export class QuickReceiveDialog {
  readonly ref = inject<DialogRef<QuickReceiveResult>>(DialogRef);
  readonly data = inject<QuickReceiveData>(DIALOG_DATA);
  private readonly api = inject(ADMIN_INVENTORY_API);
  protected readonly placeholder = '/assets/illustrations/shopping_bags.svg';
  protected readonly fields = IMPORT_FIELDS;

  readonly mode = signal<'manual' | 'file'>('manual');
  readonly note = signal(`Nhập kho nhanh ${new Date().toLocaleDateString('vi-VN')}`);
  readonly saving = signal(false);
  readonly progress = signal(0);
  readonly tried = signal(false);

  // ---------- Manual ----------
  readonly query = signal('');
  readonly lines = signal<Line[]>([]);

  readonly results = computed(() => {
    const words = fold(this.query()).split(' ').filter(Boolean);
    if (!words.length) return [];
    const taken = new Set(this.lines().map((line) => line.item.variantId));
    return this.data.items
      .filter((item) => !taken.has(item.variantId))
      .filter((item) => {
        const text = fold(`${item.productName} ${item.color.name} ${item.size} ${item.sku}`);
        return words.every((word) => text.includes(word));
      })
      .slice(0, MAX_RESULTS);
  });

  /** When every result is one product: offer all its remaining variants at once. */
  readonly sameProduct = computed(() => {
    const results = this.results();
    if (!results.length || results.some((item) => item.productId !== results[0].productId))
      return null;
    const taken = new Set(this.lines().map((line) => line.item.variantId));
    const items = this.data.items.filter(
      (item) => item.productId === results[0].productId && !taken.has(item.variantId),
    );
    return items.length > 1 ? { name: results[0].productName, items } : null;
  });

  readonly manualInvalid = computed(() =>
    this.lines().some((line) => !this.validQty(line.quantity)),
  );

  protected validQty(value: number | null): boolean {
    return value !== null && Number.isInteger(value) && value >= 1 && value <= 99_999;
  }

  add(item: InventoryItem): void {
    this.lines.update((lines) => [...lines, { item, quantity: null }]);
    this.query.set('');
  }

  addAll(items: InventoryItem[]): void {
    this.lines.update((lines) => [...lines, ...items.map((item) => ({ item, quantity: null }))]);
    this.query.set('');
  }

  addFirst(): void {
    const first = this.results()[0];
    if (first) this.add(first);
  }

  remove(index: number): void {
    this.lines.update((lines) => lines.filter((_, i) => i !== index));
  }

  setQty(index: number, value: number | string | null): void {
    const quantity = value === null || value === '' ? null : Number(value);
    this.lines.update((lines) =>
      lines.map((line, i) => (i === index ? { ...line, quantity } : line)),
    );
  }

  // ---------- File ----------
  readonly dragOver = signal(false);
  readonly fileName = signal('');
  readonly fileError = signal('');
  private readonly sheet = signal<SheetRows>([]);
  readonly header = computed(() => (this.sheet()[0] ?? []).map((cell) => cell.trim()));
  readonly mapping = signal<Record<ImportField, number>>({
    sku: -1,
    product_name: -1,
    color: -1,
    size: -1,
    quantity: -1,
  });

  readonly missingFields = computed(() => {
    const mapping = this.mapping();
    const bySku = mapping.sku >= 0;
    return IMPORT_FIELDS.filter(
      (field) =>
        field.required &&
        mapping[field.key] < 0 &&
        // With a SKU column the name, colour and size are not needed to find the variant.
        !(bySku && field.key !== 'quantity'),
    ).map((field) => field.label);
  });

  private readonly bySku = computed(
    () => new Map(this.data.items.map((item) => [item.sku.toLowerCase(), item])),
  );
  private readonly byName = computed(
    () =>
      new Map(
        this.data.items.map((item) => [
          `${fold(item.productName)}|${fold(item.color.name)}|${fold(item.size)}`,
          item,
        ]),
      ),
  );

  readonly fileRows = computed<FileRow[]>(() => {
    const [, ...rows] = this.sheet();
    const m = this.mapping();
    const cell = (row: string[], index: number) => (index >= 0 ? (row[index] ?? '').trim() : '');
    const seen = new Set<string>();
    return rows.map((row, i) => {
      const name = cell(row, m.product_name);
      const color = cell(row, m.color);
      const size = cell(row, m.size);
      const sku = cell(row, m.sku);
      const quantityText = cell(row, m.quantity);
      const parsed = Number(quantityText.replace(/[\s.,](?=\d{3}\b)/g, '').replace(',', '.'));
      const quantity = quantityText && Number.isFinite(parsed) ? parsed : null;
      const item =
        (sku && this.bySku().get(sku.toLowerCase())) ||
        this.byName().get(`${fold(name)}|${fold(color)}|${fold(size)}`) ||
        null;
      let problem = '';
      if (!item)
        problem = sku
          ? `Không có SKU ${sku}`
          : !name || !color || !size
            ? 'Thiếu tên, màu hoặc size'
            : 'Không tìm thấy sản phẩm/màu/size';
      else if (!this.validQty(quantity)) problem = 'Số lượng phải là số nguyên ≥ 1';
      else if (seen.has(item.variantId)) problem = 'Trùng SKU với dòng trên, đã cộng gộp';
      if (item && this.validQty(quantity)) seen.add(item.variantId);
      return { row: i + 2, name, color, size, quantityText, quantity, item, problem };
    });
  });

  readonly fileOk = computed(() =>
    this.fileRows().filter((row) => !row.problem || row.problem.startsWith('Trùng')),
  );
  readonly fileBad = computed(() =>
    this.fileRows().filter((row) => row.problem && !row.problem.startsWith('Trùng')),
  );

  setMapping(field: ImportField, index: number): void {
    this.mapping.update((mapping) => ({ ...mapping, [field]: Number(index) }));
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.load(file);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.load(file);
    input.value = '';
  }

  private async load(file: File): Promise<void> {
    this.fileError.set('');
    if (file.size > 5 * 1024 * 1024) {
      this.fileError.set('File lớn hơn 5 MB.');
      return;
    }
    try {
      const rows = await readSheet(file);
      if (rows.length < 2) throw new Error('File không có dòng dữ liệu nào dưới dòng tên cột.');
      this.sheet.set(rows);
      this.fileName.set(file.name);
      this.mapping.set(detectMapping(rows[0]));
    } catch (error) {
      this.sheet.set([]);
      this.fileName.set('');
      this.fileError.set(error instanceof Error ? error.message : 'Không đọc được file.');
    }
  }

  downloadTemplate(): void {
    downloadCsv(
      'mau-nhap-kho.csv',
      ['product_name', 'color', 'size', 'quantity', 'sku'],
      this.data.items
        .slice(0, 3)
        .map((item) => [item.productName, item.color.name, item.size, 10, item.sku]),
    );
  }

  // ---------- Submit ----------

  /** What will be sent: one line per SKU, file duplicates added together. */
  readonly pending = computed<Line[]>(() => {
    if (this.mode() === 'manual')
      return this.lines().filter((line) => this.validQty(line.quantity));
    if (this.missingFields().length) return [];
    const merged = new Map<string, Line>();
    for (const row of this.fileOk()) {
      const current = merged.get(row.item!.variantId);
      merged.set(row.item!.variantId, {
        item: row.item!,
        quantity: (current?.quantity ?? 0) + row.quantity!,
      });
    }
    return [...merged.values()];
  });

  readonly totalUnits = computed(() =>
    this.pending().reduce((sum, line) => sum + (line.quantity ?? 0), 0),
  );

  submit(): void {
    this.tried.set(true);
    if (this.mode() === 'manual' && this.manualInvalid()) return;
    const lines = this.pending();
    if (!lines.length) return;
    const note = this.note().trim() || 'Nhập kho nhanh';
    this.saving.set(true);
    this.ref.disableClose = true;
    this.progress.set(0);
    from(lines)
      .pipe(
        concatMap((line) =>
          this.api
            .adjust(line.item.variantId, {
              mode: 'delta',
              quantity: line.quantity!,
              reason: 'received',
              note,
              idempotencyKey: newIdempotencyKey(),
            })
            .pipe(
              map(() => ({ line, message: '' })),
              catchError((error: unknown) => of({ line, message: errorMessage(error) })),
            ),
        ),
        map((result) => {
          this.progress.update((n) => n + 1);
          return result;
        }),
        toArray(),
      )
      .subscribe((results) => {
        this.saving.set(false);
        this.ref.disableClose = false;
        const ok = results.filter((result) => !result.message);
        this.ref.close({
          done: ok.length,
          units: ok.reduce((sum, result) => sum + (result.line.quantity ?? 0), 0),
          failed: results
            .filter((result) => result.message)
            .map((result) => ({
              label: `${result.line.item.productName} ${result.line.item.color.name}/${result.line.item.size}`,
              message: result.message,
            })),
        });
      });
  }
}
