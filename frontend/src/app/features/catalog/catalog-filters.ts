import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { API_CONFIG } from '../../core/api-config';
import { CatalogQuery, GENDERS, PRODUCT_COLORS } from './models/product';
import { CATALOG_API } from './data-access/catalog-api';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { IconComponent } from '../../shared/ui/icon.component';

/**
 * Price slider bounds come from the live catalog (`facets`, cheapest .. dearest product, rounded to the step);
 * these are only the fallback. The API filters by an upper bound (`maxPrice`), so the slider has one thumb;
 * dragging it to the far right means "every price" (`maxPrice` 0, no filter).
 */
const PRICE_MIN = 200000;
const PRICE_MAX = 2000000;
const PRICE_STEP = 100000;
const SIZES = ['S', 'M', 'L', 'XL'];
const VND = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

/**
 * Filter groups as collapsible accordions with an active count, following Nike's listing sidebar:
 * swatch grid for colour, size grid, max-price slider, availability toggle.
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
        Kích cỡ
        @if (query().size) {
          <span class="selected-count">(1)</span>
        }
        <n2f-icon name="reiconChevronDown" size="18px" />
      </summary>
      <fieldset>
        <legend class="sr-only">Kích cỡ</legend>
        <div class="size-options">
          @for (size of sizes(); track size) {
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
          @for (color of colors(); track color.name) {
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

    <details open>
      <summary>
        Khoảng giá
        @if (query().maxPrice) {
          <span class="selected-count">(1)</span>
        }
        <n2f-icon name="reiconChevronDown" size="18px" />
      </summary>
      <fieldset>
        <legend class="sr-only">Khoảng giá</legend>
        <label class="price-value" for="price-range">{{ priceLabel() }}</label>
        <input
          id="price-range"
          class="price-range"
          type="range"
          [min]="priceMinValue()"
          [max]="priceMaxValue()"
          [step]="priceStep"
          [value]="sliderValue()"
          [style.--fill]="sliderFill()"
          [attr.aria-valuetext]="priceLabel()"
          (input)="draftPrice.set(+$any($event.target).value)"
          (change)="commitPrice(+$any($event.target).value)"
        />
        <div class="price-bounds" aria-hidden="true">
          <span>{{ formatPrice(priceMinValue()) }}</span>
          <span>{{ formatPrice(priceMaxValue()) }}</span>
        </div>
      </fieldset>
    </details>

    <details open>
      <summary>
        Tình trạng
        @if (query().available || query().sale) {
          <span class="selected-count"
            >({{ (query().available ? 1 : 0) + (query().sale ? 1 : 0) }})</span
          >
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
        @if (saleFilter) {
          <label class="choice"
            ><input
              type="checkbox"
              [checked]="!!query().sale"
              (change)="filtersChanged.emit({ key: 'sale', value: !query().sale })"
            />
            Đang giảm giá</label
          >
        }
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
    .price-value {
      display: block;
      margin-bottom: 12px;
      font-size: 15px;
      font-weight: 600;
    }
    .price-range {
      width: 100%;
      height: 20px;
      margin: 0;
      background: transparent;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
    }
    .price-range::-webkit-slider-runnable-track {
      height: 4px;
      border-radius: 2px;
      background: linear-gradient(
        to right,
        var(--ink) 0 var(--fill, 100%),
        var(--line) var(--fill, 100%) 100%
      );
    }
    .price-range::-moz-range-track {
      height: 4px;
      border-radius: 2px;
      background: var(--line);
    }
    .price-range::-moz-range-progress {
      height: 4px;
      border-radius: 2px;
      background: var(--ink);
    }
    .price-range::-webkit-slider-thumb {
      width: 20px;
      height: 20px;
      margin-top: -8px;
      border: 2px solid #fff;
      border-radius: 50%;
      background: var(--ink);
      box-shadow: 0 0 0 1px var(--ink);
      -webkit-appearance: none;
    }
    .price-range::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border: 2px solid #fff;
      border-radius: 50%;
      background: var(--ink);
      box-shadow: 0 0 0 1px var(--ink);
    }
    .price-range:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 4px;
    }
    .price-bounds {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
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
  /** "Đang giảm giá" exists once `promotionsMode` is http (`sale=true`, BR-PROMO-07). */
  readonly saleFilter = inject(API_CONFIG).promotionsMode === 'http';
  readonly genders = GENDERS;
  /** Colours, sizes and price range that exist in the catalog; fixed lists until (or if) the facets load. */
  private readonly facets = toSignal(
    inject(CATALOG_API)
      .facets()
      .pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  readonly colors = computed(() => this.facets()?.colors ?? [...PRODUCT_COLORS]);
  readonly sizes = computed(() => (this.facets()?.sizes.length ? this.facets()!.sizes : SIZES));
  readonly priceStep = PRICE_STEP;
  readonly priceMinValue = computed(() => {
    const min = this.facets()?.priceMin;
    return min ? Math.floor(min / PRICE_STEP) * PRICE_STEP : PRICE_MIN;
  });
  readonly priceMaxValue = computed(() => {
    const max = this.facets()?.priceMax;
    return max
      ? Math.max(Math.ceil(max / PRICE_STEP) * PRICE_STEP, this.priceMinValue() + PRICE_STEP)
      : PRICE_MAX;
  });
  /** Value while the thumb is being dragged; the filter is applied only on release. */
  readonly draftPrice = signal<number | null>(null);
  readonly sliderValue = computed(() => {
    const draft = this.draftPrice();
    if (draft !== null) return draft;
    const max = this.query().maxPrice;
    const [lo, hi] = [this.priceMinValue(), this.priceMaxValue()];
    return max ? Math.min(Math.max(max, lo), hi) : hi;
  });
  readonly sliderFill = computed(
    () =>
      `${((this.sliderValue() - this.priceMinValue()) / (this.priceMaxValue() - this.priceMinValue())) * 100}%`,
  );
  readonly priceLabel = computed(() => {
    const draft = this.draftPrice();
    const value = draft ?? this.query().maxPrice;
    if (!value || value >= this.priceMaxValue()) return 'Tất cả mức giá';
    return `Đến ${VND.format(value)}`;
  });

  formatPrice(value: number): string {
    return VND.format(value);
  }

  commitPrice(value: number): void {
    this.draftPrice.set(null);
    this.filtersChanged.emit({ key: 'maxPrice', value: value >= this.priceMaxValue() ? 0 : value });
  }

  readonly activeCount = computed(() => {
    const q = this.query();
    return [q.gender, q.moment, q.size, q.color, q.maxPrice, q.available, q.sale].filter(Boolean)
      .length;
  });

  /** Single-select toggles: choosing the active value again clears it. */
  toggle(key: 'gender' | 'moment' | 'size' | 'color', value: string): void {
    this.filtersChanged.emit({ key, value: this.query()[key] === value ? '' : value });
  }
}
