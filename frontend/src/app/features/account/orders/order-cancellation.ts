import { inject, Injectable } from '@angular/core';
import { filter, Observable, switchMap } from 'rxjs';
import { OverlayService } from '../../../shared/ui/overlay.service';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { ACCOUNT_API } from '../data-access/account-api';
import { Order } from '../../orders/order-models';
import { storeSettings } from '../../../core/store-settings';

/** Confirm-then-cancel flow shared by the order list and the order detail page. */
@Injectable({ providedIn: 'root' })
export class OrderCancellation {
  private readonly overlay = inject(OverlayService);
  private readonly api = inject(ACCOUNT_API);

  /** Emits the cancelled order only when the shopper confirms. */
  cancel(order: Order): Observable<Order> {
    const data: ConfirmDialogData = {
      title: 'Hủy đơn hàng?',
      message: order.payment.paid
        ? `Đơn #${order.id} sẽ được hủy và số tiền đã thanh toán được hoàn lại trong ${storeSettings().policy.refundWorkingDays} ngày làm việc.`
        : `Đơn #${order.id} sẽ được hủy và không thể khôi phục.`,
      confirmLabel: 'Hủy đơn',
    };
    return this.overlay.open(ConfirmDialog, data.title, 'modal', data).closed.pipe(
      filter((confirmed) => confirmed === true),
      switchMap(() => this.api.cancelOrder(order.id)),
    );
  }
}
