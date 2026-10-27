import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface DefaultThresholdData {
  value: number;
  customCount: number;
}

/**
 * Ngưỡng sắp hết của cả cửa hàng: a SKU whose sellable stock falls to this number or lower shows
 * as "Sắp hết" in Tồn kho and on the dashboard.
 */
@Component({
  selector: 'adm-default-threshold-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>Ngưỡng cảnh báo sắp hết</h2>
      <p class="dialog-desc">
        Khi số "Có thể bán" của một SKU bằng hoặc thấp hơn ngưỡng, SKU đó chuyển sang trạng thái Sắp
        hết và hiện trong mục Cần xử lý ở Tổng quan.
      </p>
      <div class="dialog-body">
        <div class="field">
          <label for="default-threshold" class="req">Ngưỡng mặc định cho mọi SKU</label>
          <div class="affix narrow">
            <input
              id="default-threshold"
              class="input num-input"
              name="value"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              [(ngModel)]="value"
            />
            <span class="suffix">sản phẩm</span>
          </div>
        </div>
        @if (data.customCount) {
          <label class="check">
            <input type="checkbox" name="reset" [(ngModel)]="resetCustom" />
            <span
              >Áp dụng cho cả {{ data.customCount }} SKU đang có ngưỡng riêng
              <span class="check-desc"
                >Nếu không chọn, các SKU này giữ ngưỡng riêng của chúng.</span
              ></span
            >
          </label>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary" [disabled]="!valid()">Lưu</button>
      </div>
    </form>
  `,
  styles: `
    .narrow {
      max-width: 200px;
    }
  `,
})
export class DefaultThresholdDialog {
  readonly ref = inject<DialogRef<{ value: number; resetCustom: boolean }>>(DialogRef);
  readonly data = inject<DefaultThresholdData>(DIALOG_DATA);
  value: number | null = this.data.value;
  resetCustom = false;

  valid(): boolean {
    return Number.isInteger(this.value) && (this.value ?? -1) >= 0;
  }

  submit(): void {
    if (this.valid()) this.ref.close({ value: this.value!, resetCustom: this.resetCustom });
  }
}

export interface SkuThresholdData {
  /** What the dialog is for, e.g. "N2F-01-0-S" or "12 SKU". */
  label: string;
  current: number | null;
  defaultValue: number;
}

/** Own threshold for one or more SKUs, or back to the shop default (null). */
@Component({
  selector: 'adm-sku-threshold-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>Ngưỡng sắp hết cho {{ data.label }}</h2>
      <p class="dialog-desc">
        Dùng ngưỡng riêng cho mẫu bán nhanh hoặc hàng nhập lâu. Ngưỡng mặc định của cửa hàng là
        {{ data.defaultValue }}.
      </p>
      <div class="dialog-body">
        <label class="check">
          <input
            type="radio"
            name="mode"
            [checked]="mode === 'default'"
            (change)="mode = 'default'"
          />
          <span>Theo mặc định của cửa hàng ({{ data.defaultValue }})</span>
        </label>
        <label class="check">
          <input
            type="radio"
            name="mode"
            [checked]="mode === 'custom'"
            (change)="mode = 'custom'"
          />
          <span>Ngưỡng riêng</span>
        </label>
        @if (mode === 'custom') {
          <div class="field indent">
            <label for="sku-threshold" class="sr-only">Ngưỡng riêng</label>
            <div class="affix narrow">
              <input
                id="sku-threshold"
                class="input num-input"
                name="value"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                [(ngModel)]="value"
              />
              <span class="suffix">sản phẩm</span>
            </div>
          </div>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary" [disabled]="!valid()">Lưu</button>
      </div>
    </form>
  `,
  styles: `
    .narrow {
      max-width: 200px;
    }
    .indent {
      padding-left: 28px;
    }
  `,
})
export class SkuThresholdDialog {
  readonly ref = inject<DialogRef<{ value: number | null }>>(DialogRef);
  readonly data = inject<SkuThresholdData>(DIALOG_DATA);
  mode: 'default' | 'custom' = this.data.current === null ? 'default' : 'custom';
  value: number | null = this.data.current ?? this.data.defaultValue;

  valid(): boolean {
    return this.mode === 'default' || (Number.isInteger(this.value) && (this.value ?? -1) >= 0);
  }

  submit(): void {
    if (this.valid()) this.ref.close({ value: this.mode === 'default' ? null : this.value });
  }
}
