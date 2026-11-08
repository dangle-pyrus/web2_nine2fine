import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { AdminSession } from '../../core/admin-session';
import { DateTimePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import {
  ACTION_LABELS,
  actorLabel,
  entryStatusLabel,
  OVERDUE_LABELS,
  paymentState,
  statusBadge,
} from '../../core/order-desk-status';
import { paymentBadge, PAYMENT_METHODS } from '../../core/status';
import { AdminApiError } from '../../data-access/models';
import { errorMessage } from '../../data-access/http-support';
import { ADMIN_ORDER_DESK_API } from '../../data-access/order-desk-api';
import type { DeskAction, DeskOrder, DeskStaffRef } from '../../data-access/order-desk-models';
import { AdmBadge } from '../../ui/badge';
import { AdmCopyButton } from '../../ui/copy-button';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { routeParam } from '../../ui/route-param';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; order: DeskOrder }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

const CANCEL_REASONS: Record<string, string> = {
  unreachable: 'Không liên lạc được',
  declined_on_call: 'Khách từ chối khi gọi xác nhận',
  customer_request: 'Khách yêu cầu huỷ',
  refused: 'Khách từ chối nhận hàng',
  undeliverable: 'Giao không thành',
  other: 'Lý do khác',
};

/**
 * Order detail of the orders desk (Slice 4, BR-ADM-09, 10): customer, shipping and payment blocks,
 * the history newest first, and the buttons the server allows right now (`allowedActions`). The
 * actions themselves arrive with lát 4.3-4.6, so the buttons are shown but disabled.
 */
@Component({
  selector: 'adm-order-desk-detail-page',
  imports: [
    RouterLink,
    AdmPageHeader,
    AdmBadge,
    AdmIcon,
    AdmCopyButton,
    AdmEmptyState,
    MoneyPipe,
    NumPipe,
    DateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-desk-detail-page.html',
  styleUrl: './order-desk-detail-page.scss',
})
export class OrderDeskDetailPage {
  private readonly api = inject(ADMIN_ORDER_DESK_API);
  protected readonly session = inject(AdminSession);
  private readonly code = routeParam('id');
  private readonly tick = signal(0);

  protected readonly state = signal<LoadState>({ kind: 'loading' });
  protected readonly order = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.order : null;
  });

  protected readonly statusBadge = statusBadge;
  protected readonly paymentBadge = paymentBadge;
  protected readonly paymentState = paymentState;
  protected readonly actorLabel = actorLabel;
  protected readonly statusLabel = entryStatusLabel;
  protected readonly overdueLabels = OVERDUE_LABELS;
  protected readonly cancelReasons = CANCEL_REASONS;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly actionLabels = ACTION_LABELS;

  protected readonly errorText = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });
  /** Only what the server lists (`allowedActions`), in the server's order. */
  protected readonly actions = computed<DeskAction[]>(() => this.order()?.allowedActions ?? []);

  constructor() {
    toObservable(computed(() => ({ code: this.code(), tick: this.tick() })))
      .pipe(
        tap(() => this.state.set({ kind: 'loading' })),
        switchMap(({ code }) =>
          this.api.get(code).pipe(
            map((order): LoadState => ({ kind: 'ready', order })),
            catchError((error: unknown) =>
              of<LoadState>(
                error instanceof AdminApiError && error.code === 'not-found'
                  ? { kind: 'not-found' }
                  : { kind: 'error', message: errorMessage(error) },
              ),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  retry(): void {
    this.tick.update((value) => value + 1);
  }

  staff(ref: DeskStaffRef): string {
    return `${ref.name} (${ref.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'})`;
  }

  freeShipping(order: DeskOrder): boolean {
    return order.pricing.shippingFee - order.pricing.shippingDiscount === 0;
  }
}
