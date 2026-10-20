import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProductFit, SizeChart } from '../catalog/models/product';

export interface SizeGuideData {
  productName: string;
  chart: SizeChart;
  fit: ProductFit;
  /** Sizes in stock for the colour being viewed; the recommended size can be picked if listed. */
  available: string[];
}

/** Where each body measurement sits on the figure (viewBox 0 0 120 250). */
const FIGURE_LINES: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
  Vai: { x1: 30, y1: 60, x2: 90, y2: 60 },
  Ngực: { x1: 33, y1: 80, x2: 87, y2: 80 },
  Eo: { x1: 38, y1: 112, x2: 82, y2: 112 },
  Mông: { x1: 33, y1: 138, x2: 87, y2: 138 },
  'Dài chân trong': { x1: 54, y1: 152, x2: 54, y2: 236 },
};

const HOW_TO: Record<string, string> = {
  Vai: 'Đo từ đầu vai trái sang đầu vai phải, qua phía sau lưng.',
  Ngực: 'Vòng thước qua điểm đầy nhất của ngực, giữ thước song song mặt đất.',
  Eo: 'Vòng quanh phần nhỏ nhất của eo, thường trên rốn khoảng 2 cm.',
  Mông: 'Vòng qua điểm đầy nhất của mông, chân khép.',
  'Dài chân trong': 'Đo từ đáy đũng quần xuống mắt cá chân.',
};

/** "82–86" → [82, 86]; a single value gets ±1 cm. */
function range(value: string): [number, number] {
  const parts = value.split(/[–-]/).map((part) => Number(part.trim()));
  return parts.length > 1 ? [parts[0], parts[1]] : [parts[0] - 1, parts[0] + 1];
}

/**
 * Size guide (Baymard: body vs garment, cm). Visual version (user request 2026-10-18): a figure
 * marks where to measure, the shopper types their measurements and gets a size, the matching
 * table row is highlighted and the size can be applied to the product in one tap.
 */
@Component({
  selector: 'n2f-size-guide-dialog',
  imports: [IconComponent],
  template: `
    <section>
      <header>
        <div>
          <h2>Hướng dẫn chọn size</h2>
          <p>{{ data.productName }}</p>
        </div>
        <button type="button" class="close" aria-label="Đóng" (click)="dialog.close()">
          <n2f-icon name="reiconX" />
        </button>
      </header>

      <div class="finder">
        <svg class="figure" viewBox="0 0 120 250" role="img" aria-label="Vị trí đo trên cơ thể">
          <circle cx="60" cy="24" r="14" class="body" />
          <path
            class="body"
            d="M44 44 Q60 40 76 44 L92 56 Q96 60 94 66 L98 128 Q99 136 92 136 L88 88 L86 112 Q90 126 88 146 L80 238 Q79 244 72 244 L64 244 L61 156 L59 156 L56 244 L48 244 Q41 244 40 238 L32 146 Q30 126 34 112 L32 88 L28 136 Q21 136 22 128 L26 66 Q24 60 28 56 Z"
          />
          @for (measure of measures(); track measure; let index = $index) {
            @if (lines[measure]; as line) {
              <g class="measure" [class.active]="focused() === measure">
                <line
                  [attr.x1]="line.x1"
                  [attr.y1]="line.y1"
                  [attr.x2]="line.x2"
                  [attr.y2]="line.y2"
                />
                <circle [attr.cx]="line.x2 + 9" [attr.cy]="line.y2" r="7" />
                <text [attr.x]="line.x2 + 9" [attr.y]="line.y2 + 3">{{ index + 1 }}</text>
              </g>
            }
          }
        </svg>

        <div class="inputs">
          <p class="lead">Nhập số đo của bạn (cm).</p>
          @for (measure of measures(); track measure; let index = $index) {
            <label class="field" [class.active]="focused() === measure">
              <span class="index" aria-hidden="true">{{ index + 1 }}</span>
              <span class="name">{{ measure }}</span>
              <input
                type="number"
                inputmode="decimal"
                min="30"
                max="200"
                placeholder="cm"
                [attr.aria-label]="measure + ' (cm)'"
                [value]="inputs()[measure] ?? ''"
                (focus)="focused.set(measure)"
                (blur)="focused.set('')"
                (input)="setInput(measure, $any($event.target).value)"
              />
            </label>
            @if (focused() === measure && howTo[measure]) {
              <p class="hint">{{ howTo[measure] }}</p>
            }
          }
        </div>
      </div>

      <div class="result" aria-live="polite">
        @if (recommendation(); as size) {
          @if (size === 'over') {
            <p>Số đo của bạn lớn hơn size lớn nhất của sản phẩm này.</p>
          } @else {
            <p>
              Size gợi ý cho bạn: <strong class="size">{{ size }}</strong>
            </p>
            @if (data.available.includes(size)) {
              <button type="button" class="button dark" (click)="dialog.close(size)">
                Chọn size {{ size }}
              </button>
            } @else {
              <span class="out">Size {{ size }} đang hết ở màu này</span>
            }
          }
        } @else {
          <p class="muted">
            Đo sát cơ thể, thước dây vừa khít nhưng không siết. Nếu nằm giữa hai size, chọn size lớn
            hơn để thoải mái.
          </p>
        }
      </div>

      <!-- Only the garment chart is shown (user request 2026-10-18); body sizes drive the finder. -->
      <div class="table-wrap">
        <table>
          <caption class="sr-only">
            Số đo sản phẩm (cm)
          </caption>
          <thead>
            <tr>
              <th scope="col">Size</th>
              @for (column of data.chart.garmentColumns; track column) {
                <th scope="col">{{ column }} (cm)</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of data.chart.garment; track row.size) {
              <tr [class.match]="recommendation() === row.size">
                <th scope="row">{{ row.size }}</th>
                @for (column of data.chart.garmentColumns; track column) {
                  <td>{{ row.values[column] }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="how">Số đo sản phẩm được đo khi trải phẳng, có thể chênh lệch ±1–2 cm.</p>
    </section>
  `,
  styles: `
    section {
      padding: 28px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }
    h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
    }
    header p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 14px;
    }
    .close {
      width: 44px;
      height: 44px;
      display: inline-grid;
      place-items: center;
      flex-shrink: 0;
      border: 0;
      background: none;
    }
    .finder {
      display: grid;
      grid-template-columns: 132px minmax(0, 1fr);
      gap: 20px;
      align-items: start;
      margin-top: 18px;
      padding: 18px;
      border-radius: var(--radius-card);
      background: var(--surface);
    }
    .figure {
      width: 100%;
      height: auto;
    }
    .figure .body {
      fill: #e3e3e3;
    }
    .measure line {
      stroke: var(--muted);
      stroke-width: 1.5;
      stroke-dasharray: 3 3;
    }
    .measure circle {
      fill: #fff;
      stroke: var(--muted);
    }
    .measure text {
      fill: var(--ink);
      font-size: 8px;
      font-weight: 700;
      text-anchor: middle;
    }
    .measure.active line {
      stroke: var(--brand);
      stroke-width: 2.5;
      stroke-dasharray: none;
    }
    .measure.active circle {
      fill: var(--brand);
      stroke: var(--brand);
    }
    .measure.active text {
      fill: #fff;
    }
    .lead {
      margin: 0 0 10px;
      font-size: 14px;
      line-height: 1.5;
    }
    .field {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) 84px;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
      font-size: 14px;
    }
    .index {
      width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      border: 1px solid var(--muted);
      border-radius: 50%;
      background: #fff;
      font-size: 12px;
      font-weight: 700;
    }
    .field.active .index {
      border-color: var(--brand);
      background: var(--brand);
      color: #fff;
    }
    input {
      width: 100%;
      height: 40px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: var(--radius-button);
      background: #fff;
      font: inherit;
      font-size: 15px;
      text-align: right;
    }
    input:focus {
      border-color: var(--ink);
      outline: none;
    }
    .hint {
      margin: 6px 0 0 32px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .result {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 56px;
      margin: 14px 0 6px;
    }
    .result p {
      margin: 0;
      font-size: 15px;
    }
    .result .muted {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .size {
      display: inline-grid;
      place-items: center;
      min-width: 40px;
      height: 40px;
      margin-left: 6px;
      padding: 0 8px;
      border-radius: var(--radius-button);
      background: var(--ink);
      color: #fff;
      font-size: 18px;
    }
    .result .button {
      min-height: 44px;
    }
    .out {
      color: var(--muted);
      font-size: 14px;
    }
    .table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
      margin-top: 12px;
      border-collapse: collapse;
      font-size: 14px;
    }
    th,
    td {
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      white-space: nowrap;
    }
    thead th {
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    tr.match th,
    tr.match td {
      background: var(--surface);
      font-weight: 700;
    }
    tr.match th {
      box-shadow: inset 3px 0 0 var(--ink);
    }
    .how {
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    @media (max-width: 520px) {
      section {
        padding: 20px;
      }
      .finder {
        grid-template-columns: 96px minmax(0, 1fr);
        gap: 14px;
        padding: 14px;
      }
      .field {
        grid-template-columns: 22px minmax(0, 1fr) 72px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SizeGuideDialog {
  readonly dialog = inject<DialogRef<string>>(DialogRef);
  readonly data = inject<SizeGuideData>(DIALOG_DATA);
  readonly lines = FIGURE_LINES;
  readonly howTo = HOW_TO;
  readonly focused = signal('');
  readonly inputs = signal<Record<string, number | undefined>>({});
  readonly measures = computed(() => this.data.chart.bodyColumns);

  /**
   * Smallest size whose range covers every entered measurement; between two sizes the larger
   * one wins, as the guide text advises. "over" when a value exceeds the largest size.
   */
  readonly recommendation = computed(() => {
    const entered = Object.entries(this.inputs()).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    );
    if (!entered.length) return null;
    const rows = this.data.chart.body;
    let index = 0;
    for (const [measure, value] of entered) {
      const fit = rows.findIndex((row) => value <= range(row.values[measure] ?? '0')[1]);
      if (fit === -1) return 'over';
      index = Math.max(index, fit);
    }
    return rows[index].size;
  });

  setInput(measure: string, raw: string): void {
    const value = Number(raw);
    this.inputs.update((all) => ({
      ...all,
      [measure]: raw.trim() && value >= 30 && value <= 200 ? value : undefined,
    }));
  }
}
