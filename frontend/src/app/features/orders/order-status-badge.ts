import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OrderStatus } from './order-models';
import { ORDER_STATUS } from './order-status';

/** Figma component set `order-status` (135:135): coloured dot + label. */
@Component({
  selector: 'n2f-order-status-badge',
  template: `<span class="dot" aria-hidden="true"></span>{{ meta().label }}`,
  host: { '[style.color]': 'meta().color' },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderStatusBadge {
  readonly status = input.required<OrderStatus>();
  readonly meta = computed(() => ORDER_STATUS[this.status()]);
}
