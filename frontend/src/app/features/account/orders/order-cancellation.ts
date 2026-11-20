import { inject, Injectable } from '@angular/core';
import { filter, map, Observable, switchMap } from 'rxjs';
import { OverlayService } from '../../../shared/ui/overlay.service';
import { ORDERS_API } from '../data-access/orders-api';
import { CancelChoice, Order } from '../../orders/order-models';
import { cancelModeOf } from '../../orders/order-status';
import { storeSettings } from '../../../core/store-settings';
import {
  CancelRequestDialog,
  CancelRequestDialogData,
  CancelRequestResult,
} from './cancel-request-dialog';

/**
 * Confirm-then-cancel flow shared by the order list, the order detail page and guest tracking.
 * `cancelMode` decides the dialog: "Hủy đơn" cancels now (`to_pay`, reason optional, ORD-CC-01);
 * "Gửi yêu cầu huỷ" sends a request the shop reviews (`to_ship`, Slice 4; reason required,
 * COMMON-01.5).
 */
@Injectable({ providedIn: 'root' })
export class OrderCancellation {
  private readonly overlay = inject(OverlayService);
  private readonly api = inject(ORDERS_API);

  /**
   * Asks the shopper to confirm (and for a reason when one is needed); emits only when they go
   * ahead: the reason, or `undefined` for a `to_pay` cancel without one. The caller sends it, so
   * the guest page can use its own adapter.
   */
  ask(order: Order): Observable<CancelChoice | undefined> {
    const request = cancelModeOf(order) === 'request';
    const data: CancelRequestDialogData = request
      ? { orderId: order.id, mode: 'request' }
      : {
          orderId: order.id,
          mode: 'cancel',
          message: order.payment.paid
            ? `Đơn #${order.id} sẽ được hủy và số tiền đã thanh toán được hoàn lại trong ${storeSettings().policy.refundWorkingDays} ngày làm việc.`
            : `Đơn #${order.id} sẽ được hủy và không thể khôi phục.`,
        };
    return this.overlay
      .open(CancelRequestDialog, request ? 'Gửi yêu cầu huỷ đơn' : 'Hủy đơn hàng?', 'modal', data)
      .closed.pipe(
        filter((result): result is CancelRequestResult => !!result),
        map((result) => result.choice ?? undefined),
      );
  }

  /** Emits the updated order (cancelled, or `cancel-requested`) only when the shopper confirms. */
  cancel(order: Order): Observable<Order> {
    return this.ask(order).pipe(switchMap((choice) => this.api.cancel(order.id, choice)));
  }
}
