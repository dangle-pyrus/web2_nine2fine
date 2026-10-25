import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { AdmIcon } from './icon';
import { AdminToastService } from './toast';

/**
 * Small "copy" button next to values staff paste elsewhere every day: order ID, phone, address
 * (into the carrier's app, Zalo…).
 */
@Component({
  selector: 'adm-copy',
  imports: [AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="adm-btn adm-btn--icon adm-btn--ghost adm-btn--sm"
      [attr.aria-label]="'Sao chép ' + label()"
      [title]="'Sao chép ' + label()"
      (click)="copy()"
    >
      <adm-icon name="reiconCopy" [size]="14" />
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
    button {
      width: 28px;
      height: 28px;
      color: var(--adm-text-tertiary);
    }
    button:hover {
      color: var(--adm-text);
    }
  `,
})
export class AdmCopyButton {
  readonly value = input.required<string>();
  /** What is copied, lower case: "mã đơn", "số điện thoại"… */
  readonly label = input.required<string>();
  private readonly toast = inject(AdminToastService);

  copy(): void {
    const label = this.label();
    navigator.clipboard.writeText(this.value()).then(
      () => this.toast.show(`Đã sao chép ${label}`),
      () => this.toast.error(`Không sao chép được ${label}. Hãy chọn và sao chép thủ công.`),
    );
  }
}
