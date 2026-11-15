import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdmIcon } from '../../ui/icon';

export interface ColorOption {
  name: string;
  hex: string;
}

export interface ColorDialogData {
  /** Màu đã lưu sẵn trong hệ thống. */
  presets: ColorOption[];
  /** Tên màu sản phẩm đang có (không chọn lại được). */
  taken: string[];
}

/** Thêm màu cho sản phẩm: chọn từ màu đã lưu hoặc nhập màu mới (tên + mã màu). */
@Component({
  selector: 'adm-product-color-dialog',
  imports: [AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (submit)="$event.preventDefault(); done()">
      <h2>Thêm màu</h2>
      <div class="dialog-body">
        <div class="field">
          <span class="field-label">Màu đã lưu</span>
          <div class="presets">
            @for (color of data.presets; track color.name) {
              <button
                type="button"
                class="preset"
                [class.is-on]="picked().includes(color.name)"
                [disabled]="isTaken(color.name)"
                [attr.aria-pressed]="picked().includes(color.name)"
                (click)="toggle(color.name)"
              >
                <span class="dot" [style.background]="color.hex">
                  @if (picked().includes(color.name) || isTaken(color.name)) {
                    <adm-icon name="reiconCheck" [size]="16" />
                  }
                </span>
                {{ color.name }}
              </button>
            }
          </div>
        </div>
        <div class="field">
          <span class="field-label">Màu mới</span>
          <div class="new-color">
            <input
              type="color"
              class="color-input"
              aria-label="Mã màu"
              [value]="hex()"
              (input)="hex.set($any($event.target).value)"
            />
            <input
              class="input"
              aria-label="Tên màu mới"
              placeholder="Ví dụ: Xanh rêu"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
          </div>
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn adm-btn--lg" (click)="ref.close()">Hủy</button>
        <button
          type="submit"
          class="adm-btn adm-btn--primary adm-btn--lg"
          [disabled]="!result().length"
        >
          Thêm màu
        </button>
      </div>
    </form>
  `,
  styles: `
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .preset {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 16px 0 6px;
      border: 1px solid var(--adm-border-input);
      border-radius: 999px;
      background: var(--adm-bg);
      font: inherit;
      color: var(--adm-text);
      cursor: pointer;
      &.is-on {
        border: 2px solid var(--adm-primary);
      }
      &:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }
    .dot {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 50%;
      color: #fff;
      filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.8));
    }
    .new-color {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .color-input {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      padding: 0;
      border: 1px solid var(--adm-border-input);
      border-radius: 50%;
      background: none;
      cursor: pointer;
      overflow: hidden;
      &::-webkit-color-swatch-wrapper {
        padding: 0;
      }
      &::-webkit-color-swatch {
        border: 0;
        border-radius: 50%;
      }
    }
  `,
})
export class ProductColorDialog {
  protected readonly data = inject<ColorDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ColorOption[]>>(DialogRef);
  protected readonly picked = signal<string[]>([]);
  protected readonly name = signal('');
  protected readonly hex = signal('#888888');
  protected readonly result = computed(() => {
    const colors = this.data.presets.filter((color) => this.picked().includes(color.name));
    const name = this.name().trim();
    return name ? [...colors, { name, hex: this.hex() }] : colors;
  });

  protected isTaken(name: string): boolean {
    return this.data.taken.some((item) => item.toLowerCase() === name.toLowerCase());
  }

  protected toggle(name: string): void {
    this.picked.update((list) =>
      list.includes(name) ? list.filter((item) => item !== name) : [...list, name],
    );
  }

  protected done(): void {
    if (this.result().length) this.ref.close(this.result());
  }
}
