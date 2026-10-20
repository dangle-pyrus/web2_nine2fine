import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CatalogQuery, GENDERS, MOMENTS } from './models/product';
import { IconComponent } from '../../shared/ui/icon.component';

const COLORS = [
  { name: 'Đen', hex: '#242323' },
  { name: 'Trắng', hex: '#f5f4f0' },
  { name: 'Xám', hex: '#96958f' },
  { name: 'Đỏ', hex: '#a91e2c' },
];

const PRICES = [
  { value: 500000, label: 'Đến 500.000 ₫' },
  { value: 800000, label: 'Đến 800.000 ₫' },
  { value: 1000000, label: 'Đến 1.000.000 ₫' },
];

/**
 * Filter groups as collapsible accordions with an active count, following Nike's listing sidebar:
 * swatch grid for colour, size grid, single-choice price, availability toggle.
 */
@Component({
  selector: 'n2f-catalog-filters',
  imports: [IconComponent],
  template: `
    @if (activeCount()) {
      <div class="active-bar">
        <span>Đang lọc ({{ activeCount() }})</span>
        <button type="button" class="text-button" (click)="filtersCleared.emit()">
          Xóa tất cả
        </button>
      </div>
    }

    <details open>
      <summary>
        Dành cho
        @if (query().gender) {
          <span class="selected-count">(1)</span>
        }
        <n2f-icon name="reiconChevronDown" size="18px" />
      </summary>
      <fieldset>
        <legend class="sr-only">Dành cho</legend>
        @for (gender of genders; track gender.value) {
          <label class="choice"
            ><input
              type="checkbox"
              [checked]="query().gender === gender.value"
              (change)="toggle('gender', gender.value)"
            />{{ gender.label }}</label
          >
        }
      </fieldset>
    </details>

    <details open>
      <summary>
        Khoảnh khắc
        @if (query().moment) {
          <span class="selected-count">(1)</span>
        }
        <n2f-icon name="reiconChevronDown" size="18px" />
      </summary>
      <fieldset>
        <legend class="sr-only">Khoảnh khắc</legend>
        @for (moment of moments; track moment.value) {
          <label class="choice"
            ><input
              type="checkbox"
              [checked]="query().moment === moment.value"
              (change)="toggle('moment', moment.value)"
            />{{ moment.label }}</label
          >
        }
      </fieldset>
    </details>

    <details open>
      <summary>
        Kích cỡ
        @if (query().size) {
          <span class="selected-count">(1)</span>
        }
        <n2f-icon name="reiconChevronDown" size="18px" />
      </summary>
      <fieldset>
        <legend class="sr-only">Kích cỡ</legend>
        <div class="size-options">
          @for (size of ['S', 'M', 'L', 'XL']; track size) {
            <button
              type="button"
              [class.selected]="query().size === size"
              [attr.aria-pressed]="query().size === size"
              (click)="toggle('size', size)"
            >
              {{ size }}
            </button>
          }
        </div>
      </fieldset>
    </details>

    <details open>
      <summary>
        Màu sắc
        @if (query().color) {
          <span class="selected-count">(1)</span>
        }
        <n2f-icon name="reiconChevronDown" size="18px" />
      </summary>
      <fieldset>
        <legend class="sr-only">Màu sắc</legend>
        <div class="color-options">
          @for (color of colors; track color.name) {
            <button
              type="button"
              class="color-choice"
              [class.selected]="query().color === color.name"
              [attr.aria-pressed]="query().color === color.name"
              (click)="toggle('color', color.name)"
            >
              <span class="swatch" [style.background]="color.hex"></span>{{ color.name }}
            </button>
          }
        </div>
      </fieldset>
    </details>

    <details>
      <summary>
        Khoảng giá
        @if (query().maxPrice) {
          <span class="selected-count">(1)</span>
        }
        <n2f-icon name="reiconChevronDown" size="18px" />
      </summary>
      <fieldset>
        <legend class="sr-only">Khoảng giá</legend>
        <label class="choice"
          ><input
            type="radio"
            name="max-price"
            [checked]="!query().maxPrice"
            (change)="filtersChanged.emit({ key: 'maxPrice', value: 0 })"
          />Tất cả mức giá</label
        >
        @for (price of prices; track price.value) {
          <label class="choice"
            ><input
              type="radio"
              name="max-price"
              [checked]="query().maxPrice === price.value"
              (change)="filtersChanged.emit({ key: 'maxPrice', value: price.value })"
            />{{ price.label }}</label
          >
        }
      </fieldset>
    </details>

    <details open>
      <summary>
        Tình trạng
        @if (query().available) {
          <span class="selected-count">(1)</span>
        }
        <n2f-icon name="reiconChevronDown" size="18px" />
      </summary>
      <fieldset>
        <legend class="sr-only">Tình trạng</legend>
        <label class="choice"
          ><input
            type="checkbox"
            [checked]="query().available"
            (change)="filtersChanged.emit({ key: 'available', value: !query().available })"
          />
          Chỉ hiện còn hàng</label
        >
      </fieldset>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }
    .active-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
      font-size: 13px;
      font-weight: 600;
    }
    .active-bar .text-button {
      font-size: 13px;
    }
    details {
      border-bottom: 1px solid var(--line);
    }
    summary {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 54px;
      font-size: 16px;
      font-weight: 600;
      list-style: none;
      cursor: pointer;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    summary n2f-icon {
      margin-left: auto;
      transition: transform 0.2s ease;
    }
    details[open] summary n2f-icon {
      transform: rotate(180deg);
    }
    .selected-count {
      color: var(--muted);
      font-weight: 500;
    }
    fieldset {
      margin: 0;
      padding: 0 0 18px;
      border: 0;
    }
    .choice {
      display: flex;
      gap: 10px;
      align-items: center;
      min-height: 36px;
      font-size: 15px;
      cursor: pointer;
    }
    input[type='checkbox'],
    input[type='radio'] {
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--ink);
    }
    .size-options {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .size-options button {
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: white;
      font-size: 13px;
    }
    .size-options button:hover,
    .color-choice:hover {
      border-color: var(--ink);
    }
    .size-options .selected {
      border-color: var(--ink);
      box-shadow: inset 0 0 0 1px var(--ink);
      font-weight: 700;
    }
    .color-options {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px 6px;
    }
    .color-choice {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      border: 1px solid transparent;
      border-radius: 8px;
      background: none;
      font: inherit;
      font-size: 12px;
    }
    .swatch {
      width: 28px;
      height: 28px;
      border: 1px solid #0002;
      border-radius: 50%;
    }
    .color-choice.selected {
      font-weight: 700;
    }
    .color-choice.selected .swatch {
      box-shadow:
        0 0 0 2px #fff,
        0 0 0 3px var(--ink);
    }
    @media (prefers-reduced-motion: reduce) {
      summary n2f-icon {
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogFilters {
  readonly query = input.required<CatalogQuery>();
  readonly filtersChanged = output<{ key: string; value: string | number | boolean }>();
  readonly filtersCleared = output<void>();
  readonly genders = GENDERS;
  readonly moments = MOMENTS;
  readonly colors = COLORS;
  readonly prices = PRICES;
  readonly activeCount = computed(() => {
    const q = this.query();
    return [q.gender, q.moment, q.size, q.color, q.maxPrice, q.available].filter(Boolean).length;
  });

  /** Single-select toggles: choosing the active value again clears it. */
  toggle(key: 'gender' | 'moment' | 'size' | 'color', value: string): void {
    this.filtersChanged.emit({ key, value: this.query()[key] === value ? '' : value });
  }
}
