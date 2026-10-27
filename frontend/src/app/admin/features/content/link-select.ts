import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CATEGORIES } from '../../../features/catalog/models/product';

interface Destination {
  group: string;
  label: string;
  href: string;
}

/** Storefront pages a block can link to. The path is derived from the choice, never typed. */
export const DESTINATIONS: Destination[] = [
  { group: 'Chung', label: 'Tất cả sản phẩm', href: '/shop' },
  { group: 'Chung', label: 'Hàng mới về', href: '/new-in' },
  ...CATEGORIES.map((category) => ({
    group: 'Danh mục',
    label: category.label,
    href: `/shop/${category.value}`,
  })),
  { group: 'Dịp mặc', label: 'Đi làm', href: '/shop-by-moment/work' },
  { group: 'Dịp mặc', label: 'Hẹn tối', href: '/shop-by-moment/dinner' },
  { group: 'Dịp mặc', label: 'Sự kiện', href: '/shop-by-moment/event' },
  { group: 'Dịp mặc', label: 'Cuối tuần', href: '/shop-by-moment/weekend' },
];

const GROUPS = [...new Set(DESTINATIONS.map((item) => item.group))];

export function destinationLabel(href: string): string {
  return DESTINATIONS.find((item) => item.href === href)?.label ?? href;
}

/**
 * "Liên kết tới": pick a page by name; the resulting path shows underneath in a grey read-only box
 * so staff can check it without being able to mistype it.
 */
@Component({
  selector: 'adm-link-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      class="select"
      [class.select--sm]="small()"
      [id]="inputId()"
      [attr.aria-label]="ariaLabel() || null"
      [disabled]="disabled()"
      (change)="changed.emit($any($event.target).value)"
    >
      @if (!known()) {
        <option [value]="value()" selected>Liên kết hiện tại</option>
      }
      @for (group of groups; track group) {
        <optgroup [label]="group">
          @for (item of byGroup(group); track item.href) {
            <option [value]="item.href" [selected]="item.href === value()">{{ item.label }}</option>
          }
        </optgroup>
      }
    </select>
    <input
      class="input mono"
      [class.input--sm]="small()"
      readonly
      tabindex="-1"
      [attr.aria-label]="'Đường dẫn: ' + value()"
      [value]="'nine2fine.vn' + value()"
    />
  `,
  styles: `
    :host {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
  `,
})
export class AdmLinkSelect {
  readonly value = input.required<string>();
  readonly inputId = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly small = input(false);
  readonly disabled = input(false);
  readonly changed = output<string>();

  protected readonly groups = GROUPS;
  protected readonly known = computed(() =>
    DESTINATIONS.some((item) => item.href === this.value()),
  );

  protected byGroup(group: string): Destination[] {
    return DESTINATIONS.filter((item) => item.group === group);
  }
}
