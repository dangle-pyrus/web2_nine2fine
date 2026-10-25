import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { carrierTrackingUrl } from '../../../features/orders/order-status';
import { AdminSession } from '../../core/admin-session';
import { DateTimePipe, MoneyPipe, NumPipe, PhonePipe } from '../../core/format.pipes';
import { maskEmail } from '../../core/format';
import { orderBadge, paymentBadge, RETURN_REASONS } from '../../core/status';
import { ADMIN_ORDERS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { AdminOrder, ShippingAddress } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdmChipInput } from '../../ui/chip-input';
import { AdmCopyButton } from '../../ui/copy-button';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { isShortcutEvent } from '../../ui/keyboard';
import { loader } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { routeParam } from '../../ui/route-param';
import { AdmTimeline } from '../../ui/timeline';
import { AdminToastService } from '../../ui/toast';
import {
  CancelDialog,
  CompleteReturnDialog,
  ReturnDecisionDialog,
  ShipDialog,
} from './order-dialogs';
import {
  AddressDialog,
  ChangeItemData,
  ChangeItemDialog,
  DeliveryFailedDialog,
  ReturnToSenderDialog,
} from './order-edit-dialogs';
import { openPrint, PrintKind } from '../print/open-print';
import { OrderListContext } from './order-list-context';

interface PrimaryAction {
  label: string;
  run: () => void;
}

/**
 * Order detail (4.2, 6.5): 2/3 main column (items, payment, delivery, return, history) and 1/3
 * side column (note, customer, address, tags). Edited part by part through dialogs, so no save bar.
 */
@Component({
  selector: 'adm-order-detail-page',
  imports: [
    RouterLink,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    AdmPageHeader,
    AdmBadge,
    AdmIcon,
    AdmTimeline,
    AdmChipInput,
    AdmCopyButton,
    AdmEmptyState,
    MoneyPipe,
    NumPipe,
    DateTimePipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-detail-page.html',
  styleUrl: './order-detail-page.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class OrderDetailPage {
  readonly id = routeParam('id');
  protected readonly session = inject(AdminSession);
  private readonly api = inject(ADMIN_ORDERS_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  private readonly timeline = viewChild(AdmTimeline);
  private readonly router = inject(Router);
  private readonly listContext = inject(OrderListContext);

  protected readonly view = loader(this.id, (id) => this.api.get(id));
  protected readonly order = this.view.data;
  protected readonly busy = signal(false);
  protected readonly posting = signal(false);
  protected readonly orderBadge = orderBadge;
  protected readonly paymentBadge = paymentBadge;
  protected readonly reasons = RETURN_REASONS;
  protected readonly maskEmail = maskEmail;
  protected readonly stepping = signal(false);

  /** Where this order sits in the list the user opened it from (null when opened by link). */
  protected readonly position = computed(() => {
    const snapshot = this.listContext.snapshot();
    const index = snapshot?.ids.indexOf(this.id() ?? '') ?? -1;
    if (!snapshot || index < 0) return null;
    const absolute = (snapshot.query.page - 1) * snapshot.query.pageSize + index;
    return {
      index: absolute + 1,
      total: snapshot.total,
      hasPrev: absolute > 0,
      hasNext: absolute + 1 < snapshot.total,
    };
  });
  protected readonly backQuery = computed(() => this.listContext.snapshot()?.params ?? null);
  protected readonly addressText = computed(() => {
    const address = this.order()?.shippingAddress;
    return address
      ? `${address.recipient}, ${address.phone}, ${address.street}, ${address.ward}, ${address.province}`
      : '';
  });
  protected readonly canMarkDelivering = computed(
    () => this.order()?.status === 'shipping' && this.session.can('orders.process'),
  );
  /** Address and variants can change until the parcel leaves (Đợt 2). */
  protected readonly canEdit = computed(() => {
    const status = this.order()?.status;
    return (
      this.session.can('orders.process') &&
      (status === 'pending-payment' || status === 'pending-confirmation' || status === 'processing')
    );
  });
  protected readonly canReportFailure = computed(() => {
    const status = this.order()?.status;
    return this.session.can('orders.process') && (status === 'shipping' || status === 'delivering');
  });
  protected readonly canReturnToSender = computed(
    () => this.order()?.status === 'delivery-failed' && this.session.can('orders.process'),
  );
  protected readonly canReject = computed(() => {
    const order = this.order();
    return (
      order?.status === 'return-requested' &&
      !order.returnRequest?.decision &&
      this.session.can('returns.process')
    );
  });
  protected readonly hasMenu = computed(
    () =>
      this.canCancel() ||
      this.canMarkDelivering() ||
      this.canReportFailure() ||
      this.canReturnToSender() ||
      this.canReject(),
  );

  protected readonly trackingUrl = computed(() => {
    const delivery = this.order()?.delivery;
    return delivery ? carrierTrackingUrl(delivery.carrier, delivery.trackingCode) : null;
  });
  protected readonly returnLines = computed(() => {
    const order = this.order();
    if (!order?.returnRequest) return [];
    return order.returnRequest.lines.map((line) => ({
      ...order.items[line.index],
      quantity: line.quantity,
    }));
  });
  protected readonly overdue = computed(() => {
    const order = this.order();
    return (
      order?.status === 'pending-payment' &&
      !!order.paymentDueAt &&
      Date.parse(order.paymentDueAt) < Date.now()
    );
  });
  protected readonly canCancel = computed(() => {
    const status = this.order()?.status;
    return (
      this.session.can('orders.cancel') &&
      (status === 'pending-payment' || status === 'pending-confirmation' || status === 'processing')
    );
  });

  /** At most one primary action per page (2.3), picked from the order's state. */
  protected readonly primary = computed<PrimaryAction | null>(() => {
    const order = this.order();
    if (!order) return null;
    const process = this.session.can('orders.process');
    switch (order.status) {
      case 'pending-payment':
        return process
          ? { label: 'Xác nhận đã nhận tiền', run: () => this.confirmPayment(order) }
          : null;
      case 'pending-confirmation':
        return process
          ? {
              label: 'Xác nhận đơn',
              run: () => this.run(this.api.confirm(order.id), 'Đã xác nhận đơn', true),
            }
          : null;
      case 'processing':
        return process ? { label: 'Bàn giao vận chuyển', run: () => this.ship(order) } : null;
      case 'delivery-failed':
        return process
          ? {
              label: 'Giao lại',
              run: () =>
                this.run(this.api.redeliver(order.id), 'Đã chuyển đơn sang giao lại', true),
            }
          : null;
      // Usually the carrier moves the order on; staff confirm delivery directly from either step.
      case 'shipping':
      case 'delivering':
        return process
          ? {
              label: 'Xác nhận giao thành công',
              run: () =>
                this.run(this.api.markDelivered(order.id), 'Đã xác nhận giao thành công', true),
            }
          : null;
      case 'return-requested':
        if (!this.session.can('returns.process')) return null;
        return order.returnRequest?.decision
          ? { label: 'Nhận hàng và hoàn tiền', run: () => this.completeReturn(order) }
          : { label: 'Duyệt trả hàng', run: () => this.decide('approved') };
      default:
        return null;
    }
  });

  /** Previous/next order of the same filtered list, loading the neighbouring page at the edges. */
  step(direction: 1 | -1): void {
    const snapshot = this.listContext.snapshot();
    const position = this.position();
    if (!snapshot || !position || this.stepping()) return;
    if (direction === 1 ? !position.hasNext : !position.hasPrev) return;
    const index = snapshot.ids.indexOf(this.id() ?? '') + direction;
    if (index >= 0 && index < snapshot.ids.length) {
      void this.router.navigate(['/admin/orders', snapshot.ids[index]]);
      return;
    }
    const page = snapshot.query.page + direction;
    this.stepping.set(true);
    this.api.list({ ...snapshot.query, page }).subscribe({
      next: (result) => {
        this.stepping.set(false);
        const ids = result.items.map((order) => order.id);
        if (!ids.length) return;
        this.listContext.snapshot.set({
          ...snapshot,
          query: { ...snapshot.query, page },
          params: { ...snapshot.params, page: page === 1 ? null : page },
          ids,
          total: result.total,
        });
        void this.router.navigate(['/admin/orders', direction === 1 ? ids[0] : ids.at(-1)]);
      },
      error: (error: unknown) => {
        this.stepping.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  onKey(event: KeyboardEvent): void {
    if (!isShortcutEvent(event)) return;
    if (event.key === 'j') this.step(1);
    else if (event.key === 'k') this.step(-1);
    else return;
    event.preventDefault();
  }

  markDelivering(): void {
    const order = this.order();
    if (order) this.run(this.api.markDelivering(order.id), 'Đã cập nhật: shipper đang giao');
  }

  confirmPayment(order: AdminOrder): void {
    this.dialogs
      .confirm({
        title: `Xác nhận đã nhận tiền cho đơn #${order.id}?`,
        message: `Chỉ xác nhận khi tài khoản ngân hàng đã nhận đủ ${new MoneyPipe().transform(order.pricing.total)} với nội dung chuyển khoản ${order.id}.`,
        confirmLabel: 'Xác nhận đã nhận tiền',
      })
      .subscribe(
        (ok) => ok && this.run(this.api.confirmPayment(order.id), 'Đã xác nhận thanh toán', true),
      );
  }

  ship(order: AdminOrder): void {
    this.dialogs
      .modal<
        { ids: string[] },
        { carrier: string; estimatedAt: string; codes: Record<string, string> }
      >(ShipDialog, { ids: [order.id] })
      .closed.subscribe((result) => {
        if (result)
          this.run(
            this.api.ship(order.id, {
              carrier: result.carrier,
              estimatedAt: result.estimatedAt,
              trackingCode: result.codes[order.id],
            }),
            `Đã bàn giao cho ${result.carrier}`,
            true,
          );
      });
  }

  reportFailure(): void {
    const order = this.order();
    if (!order) return;
    this.dialogs
      .modal<void, { reason: string }>(DeliveryFailedDialog, undefined)
      .closed.subscribe(
        (result) =>
          result &&
          this.run(this.api.failDelivery(order.id, result), 'Đã ghi nhận giao không thành công'),
      );
  }

  returnToSender(): void {
    const order = this.order();
    if (!order) return;
    const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    this.dialogs
      .modal<{ id: string; quantity: number }, { restock: boolean }>(ReturnToSenderDialog, {
        id: order.id,
        quantity,
      })
      .closed.subscribe(
        (result) =>
          result &&
          this.run(
            this.api.returnToSender(order.id, result),
            result.restock ? 'Đã hoàn đơn và nhập lại kho' : 'Đã hoàn đơn về shop',
          ),
      );
  }

  editAddress(): void {
    const order = this.order();
    if (!order) return;
    this.dialogs
      .modal<ShippingAddress, ShippingAddress>(AddressDialog, order.shippingAddress)
      .closed.subscribe(
        (address) =>
          address &&
          this.run(this.api.updateAddress(order.id, address), 'Đã cập nhật địa chỉ giao hàng'),
      );
  }

  changeItem(index: number): void {
    const order = this.order();
    if (!order) return;
    this.dialogs
      .modal<ChangeItemData, string>(ChangeItemDialog, {
        item: order.items[index],
        taken: order.items.map((item) => item.variantId),
        paid: order.payment.paid,
      })
      .closed.subscribe(
        (variantId) =>
          variantId &&
          this.run(this.api.changeItem(order.id, { index, variantId }), 'Đã đổi biến thể'),
      );
  }

  cancel(): void {
    const order = this.order();
    if (!order) return;
    this.dialogs
      .modal<{ id: string; paid: boolean; total: number }, { reason: string; refund: boolean }>(
        CancelDialog,
        { id: order.id, paid: order.payment.paid, total: order.pricing.total },
      )
      .closed.subscribe(
        (result) =>
          result && this.run(this.api.cancel(order.id, result), `Đã hủy đơn #${order.id}`),
      );
  }

  decide(decision: 'approved' | 'rejected'): void {
    const order = this.order();
    if (!order) return;
    this.dialogs
      .modal<{ decision: 'approved' | 'rejected' }, string>(ReturnDecisionDialog, { decision })
      .closed.subscribe((note) => {
        if (note === undefined) return;
        this.run(
          this.api.decideReturn(order.id, { decision, note }),
          decision === 'approved' ? 'Đã duyệt yêu cầu trả hàng' : 'Đã từ chối yêu cầu trả hàng',
        );
      });
  }

  completeReturn(order: AdminOrder): void {
    const request = order.returnRequest!;
    this.dialogs
      .modal<{ suggested: number; max: number }, { refundAmount: number; restock: boolean }>(
        CompleteReturnDialog,
        {
          suggested: Math.max(0, request.amount - request.returnShippingFee),
          max: order.pricing.total,
        },
      )
      .closed.subscribe(
        (result) =>
          result && this.run(this.api.completeReturn(order.id, result), 'Đã hoàn tiền trả hàng'),
      );
  }

  comment(text: string): void {
    const order = this.order();
    if (!order) return;
    this.posting.set(true);
    this.api.addComment(order.id, text).subscribe({
      next: (event) => {
        this.posting.set(false);
        this.timeline()?.clear();
        this.view.patch((value) => ({ ...value, events: [event, ...value.events] }));
      },
      error: (error: unknown) => {
        this.posting.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  saveTags(tags: string[]): void {
    const order = this.order();
    if (!order) return;
    this.api.updateTags(order.id, tags).subscribe({
      next: (value) => this.view.patch(() => value),
      error: (error: unknown) => this.toast.error(errorMessage(error)),
    });
  }

  print(kind: PrintKind): void {
    const id = this.id();
    if (id) openPrint(this.router, kind, [id]);
  }

  /** `offerNext`: after finishing an order, the toast offers the next one of the list. */
  private run(request: Observable<AdminOrder>, success: string, offerNext = false): void {
    this.busy.set(true);
    request.subscribe({
      next: (order) => {
        this.busy.set(false);
        this.view.patch(() => order);
        this.toast.show(
          success,
          offerNext && this.position()?.hasNext
            ? { action: { label: 'Đơn tiếp theo', run: () => this.step(1) } }
            : {},
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.error(errorMessage(error));
        this.view.reload();
      },
    });
  }
}
