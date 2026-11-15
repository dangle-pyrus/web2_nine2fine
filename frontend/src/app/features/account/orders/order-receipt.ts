import { inject, Injectable } from '@angular/core';
import { filter, map, Observable } from 'rxjs';
import { OverlayService } from '../../../shared/ui/overlay.service';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { Order } from '../../orders/order-models';

/**
 * ORD-06 / ORD-11: "Đã nhận hàng" on an order that is on its way. Asks once, then the caller sends
 * it with its own adapter (member or guest). Without a press the server completes the order 7 days
 * after hand-over (COMMON-01.9).
 */
@Injectable({ providedIn: 'root' })
export class OrderReceipt {
  private readonly overlay = inject(OverlayService);

  ask(order: Order): Observable<void> {
    const data: ConfirmDialogData = {
      title: 'Bạn đã nhận được hàng?',
      message: `Xác nhận đã nhận đủ hàng của đơn #${order.id}. Đơn sẽ chuyển sang Hoàn thành và bạn có thể đánh giá sản phẩm hoặc yêu cầu trả hàng trong thời hạn.`,
      confirmLabel: 'Đã nhận hàng',
    };
    return this.overlay.open(ConfirmDialog, data.title, 'modal', data).closed.pipe(
      filter((confirmed) => confirmed === true),
      map(() => undefined),
    );
  }
}
