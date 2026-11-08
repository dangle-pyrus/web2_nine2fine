import { inject, Injectable } from '@angular/core';
import { filter, map, Observable, switchMap } from 'rxjs';
import { OverlayService } from '../../../shared/ui/overlay.service';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { ORDERS_API } from '../data-access/orders-api';
import { Order } from '../../orders/order-models';
import { cancelModeOf } from '../../orders/order-status';
import { storeSettings } from '../../../core/store-settings';
import { CancelRequestDialog, CancelRequestResult } from './cancel-request-dialog';

/**
 * Confirm-then-cancel flow shared by the order list, the order detail page and guest tracking.
 * `cancelMode` decides the dialog: "Hủy đơn" confirms a direct cancel (`to_pay`); "Gửi yêu cầu huỷ"
 * collects an optional reason for the shop to review (`to_ship`, Slice 4).
 */
@Injectable({ providedIn: 'root' })
export class OrderCancellation {
  private readonly overlay = inject(OverlayService);
  private readonly api = inject(ORDERS_API);

  /**
   * Asks the shopper; emits `{ reason }` (empty when none) only when they go ahead. The caller sends
   * it, so the guest page can use its own adapter.
   */
  ask(order: Order): Observable<{ reason?: string }> {
    if (cancelModeOf(order) === 'request') {
      return this.overlay
        .open(CancelRequestDialog, 'Gửi yêu cầu huỷ đơn', 'modal', { orderId: order.id })
        .closed.pipe(
          filter((result): result is CancelRequestResult => !!result),
          map((result) => ({ reason: result.reason || undefined })),
        );
    }
    const data: ConfirmDialogData = {
      title: 'Hủy đơn hàng?',
      message: order.payment.paid
        ? `Đơn #${order.id} sẽ được hủy và số tiền đã thanh toán được hoàn lại trong ${storeSettings().policy.refundWorkingDays} ngày làm việc.`
        : `Đơn #${order.id} sẽ được hủy và không thể khôi phục.`,
      confirmLabel: 'Hủy đơn',
    };
    return this.overlay.open(ConfirmDialog, data.title, 'modal', data).closed.pipe(
      filter((confirmed) => confirmed === true),
      map(() => ({})),
    );
  }

  /** Emits the updated order (cancelled, or `cancel-requested`) only when the shopper confirms. */
  cancel(order: Order): Observable<Order> {
    return this.ask(order).pipe(switchMap(({ reason }) => this.api.cancel(order.id, reason)));
  }
}
