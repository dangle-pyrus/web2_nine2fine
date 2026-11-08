import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { AdminSession } from '../../core/admin-session';
import { DateTimePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import {
  ACTION_LABELS,
  actorLabel,
  CANCEL_ACTION_REASON,
  CANCEL_REASON_LABELS,
  DESK_TABS,
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
import { AdminDialogs } from '../../ui/dialogs';
import { AdmBadge } from '../../ui/badge';
import { AdmCopyButton } from '../../ui/copy-button';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import {
  DeskActionDialog,
  type DeskActionDialogData,
  type DeskActionKind,
  type DeskActionOutcome,
} from './order-action-dialog';
import { routeParam } from '../../ui/route-param';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; order: DeskOrder }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

function kindOf(action: DeskAction): DeskActionKind | null {
  if (action in CANCEL_ACTION_REASON) return 'cancel';
  switch (action) {
    case 'call-attempt':
    case 'confirm':
    case 'ship':
    case 'deliver':
    case 'restock':
    case 'write-off':
      return action;
    default:
      return null;
  }
}

/**
 * Order detail of the orders desk (Slice 4, BR-ADM-09, 10): customer, shipping and payment blocks,
 * the history newest first, and the buttons the server allows right now (`allowedActions`).
 * Lát 4.3-4.4 act on them (call attempt, confirm, ship, deliver, cancel, returned stock); the
 * remaining buttons (cancel requests, notes, print) stay disabled until their lát.
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
  private readonly dialogs = inject(AdminDialogs);
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
  protected readonly cancelReasons = CANCEL_REASON_LABELS;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly actionLabels = ACTION_LABELS;

  protected readonly errorText = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });
  /** Only what the server lists (`allowedActions`), in the server's order. */
  protected readonly actions = computed<DeskAction[]>(() => this.order()?.allowedActions ?? []);
  /** Buttons that act now (the cancel reasons share one) and the ones that wait for a later lát. */
  protected readonly buttons = computed(() => {
    const seen = new Set<DeskActionKind>();
    const live: { action: DeskAction; kind: DeskActionKind }[] = [];
    const waiting: DeskAction[] = [];
    for (const action of this.actions()) {
      const kind = kindOf(action);
      if (!kind) waiting.push(action);
      else if (!seen.has(kind)) {
        seen.add(kind);
        live.push({ action, kind });
      }
    }
    return { live, waiting };
  });
  /** Result of the last action: polite for success, assertive when the server said no. */
  protected readonly notice = signal<{ tone: 'success' | 'warning'; text: string } | null>(null);
  private readonly live = viewChild<ElementRef<HTMLElement>>('live');

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

  open(kind: DeskActionKind): void {
    const order = this.order();
    if (!order) return;
    this.notice.set(null);
    this.dialogs
      .modal<DeskActionDialogData, DeskActionOutcome>(DeskActionDialog, { order, kind })
      .closed.subscribe((outcome) => this.settle(outcome));
  }

  dismissNotice(): void {
    this.notice.set(null);
  }

  /** The page changes only with the server's answer (BR-ADM-15); then it tells where the order went. */
  private settle(outcome: DeskActionOutcome | undefined): void {
    if (!outcome) return;
    if (outcome.kind === 'done') {
      this.state.set({ kind: 'ready', order: outcome.order });
      this.announceTab(outcome.order, outcome.message);
    } else {
      this.notice.set({ tone: 'warning', text: outcome.message });
      if (outcome.order) this.state.set({ kind: 'ready', order: outcome.order });
      else this.tick.update((value) => value + 1);
      this.focusNotice();
    }
  }

  private focusNotice(): void {
    setTimeout(() => this.live()?.nativeElement.focus());
  }

  /** Counts of the tabs follow the change (BR-ADM-07): say which tab the order is in now. */
  private announceTab(order: DeskOrder, message: string): void {
    this.api
      .counts({ q: '', payment: '', from: '', to: '' })
      .pipe(catchError(() => of(null)))
      .subscribe((counts) => {
        const label = DESK_TABS.find((tab) => tab.value === order.tab)?.label ?? '';
        this.notice.set({
          tone: 'success',
          text: counts
            ? `${message} Đơn nằm ở tab “${label}” (${counts[order.tab]} đơn).`
            : message,
        });
        this.focusNotice();
      });
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
