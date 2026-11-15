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
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { AdminSession } from '../../core/admin-session';
import type { AdminReturn } from '../../data-access/returns-api';
import { ReturnPanel } from '../returns/return-panel';
import { DateTimePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import {
  ACTION_LABELS,
  actorLabel,
  CANCEL_REASON_LABELS,
  DESK_TABS,
  entryStatusLabel,
  OVERDUE_HINTS,
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
import { AdmIcon } from '../../ui/icon';
import {
  actionKindOf,
  DeskActionDialog,
  type DeskActionDialogData,
  type DeskActionKind,
  type DeskActionOutcome,
} from './order-action-dialog';
import { mediaSrc } from '../content/media-picker';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; order: DeskOrder }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

/**
 * Order detail of the orders desk (Slice 4, BR-ADM-09, 10) as a right-hand drawer over the list:
 * recipient, items, payment, shipping, the history newest first, and a footer with the buttons the
 * server allows right now (`allowedActions`). The list keeps its filters and scroll; it closes with
 * `true` when something changed so the list reloads. "In phiếu giao" opens the print view.
 */
@Component({
  selector: 'adm-order-detail-drawer',
  imports: [
    AdmBadge,
    AdmIcon,
    ReturnPanel,
    MoneyPipe,
    NumPipe,
    DateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm' },
  templateUrl: './order-detail-drawer.html',
  styleUrl: './order-detail-drawer.scss',
})
export class OrderDetailDrawer {
  private readonly api = inject(ADMIN_ORDER_DESK_API);
  protected readonly session = inject(AdminSession);
  private readonly dialogs = inject(AdminDialogs);
  private readonly router = inject(Router);
  protected readonly id = inject<{ id: string }>(DIALOG_DATA).id;
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private changed = false;
  protected readonly src = mediaSrc;
  private readonly tick = signal(0);
  /** Slice 9: the order shows its return request and the buttons to handle it. */
  protected readonly returnsOn = inject(API_CONFIG).returnsMode === 'http';

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
  protected readonly overdueHints = OVERDUE_HINTS;
  protected readonly cancelReasons = CANCEL_REASON_LABELS;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly actionLabels = ACTION_LABELS;

  protected readonly errorText = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });
  /** Only what the server lists (`allowedActions`), in the server's order. */
  protected readonly actions = computed<DeskAction[]>(() => this.order()?.allowedActions ?? []);
  /** Buttons that open a dialog (the cancel reasons share one). */
  protected readonly buttons = computed(() => {
    const seen = new Set<DeskActionKind>();
    const live: { action: DeskAction; kind: DeskActionKind }[] = [];
    for (const action of this.actions()) {
      const kind = actionKindOf(action);
      if (kind && !seen.has(kind)) {
        seen.add(kind);
        live.push({ action, kind });
      }
    }
    return { live };
  });
  /** Footer: one black primary (the step the order waits for), everything else outlined. */
  protected readonly footer = computed(() => {
    const quiet: DeskActionKind[] = ['cancel', 'write-off', 'reject-cancel', 'add-note'];
    const live = this.buttons().live;
    const primary = live.find((button) => !quiet.includes(button.kind)) ?? null;
    return { primary, secondary: live.filter((button) => button !== primary) };
  });
  /** BR-ADM-39: only when the server lists `print-slip` (`to_ship` / `to_receive`). */
  protected readonly canPrint = computed(() => this.actions().includes('print-slip'));
  /** Result of the last action: polite for success, assertive when the server said no. */
  protected readonly notice = signal<{ tone: 'success' | 'warning'; text: string } | null>(null);
  private readonly live = viewChild<ElementRef<HTMLElement>>('live');

  constructor() {
    toObservable(computed(() => ({ code: this.id, tick: this.tick() })))
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

  printSlip(): void {
    const order = this.order();
    if (!order) return;
    this.close();
    void this.router.navigate(['/admin/orders', order.id, 'slip']);
  }

  close(): void {
    this.ref.close(this.changed);
  }

  /** A return step changed the request (and maybe `paymentStatus`): show it, then reload the order. */
  onReturnUpdated(ret: AdminReturn): void {
    this.changed = true;
    const order = this.order();
    if (order) this.state.set({ kind: 'ready', order: { ...order, return: ret } });
    this.api
      .get(this.id)
      .pipe(catchError(() => of(null)))
      .subscribe((fresh) => {
        if (fresh) this.state.set({ kind: 'ready', order: fresh });
      });
  }

  dismissNotice(): void {
    this.notice.set(null);
  }

  /** The page changes only with the server's answer (BR-ADM-15); then it tells where the order went. */
  private settle(outcome: DeskActionOutcome | undefined): void {
    if (!outcome) return;
    this.changed = true;
    if (outcome.kind === 'done') {
      this.state.set({ kind: 'ready', order: outcome.order });
      // A note changes no status, so there is no tab to announce.
      if (outcome.order.timeline[0]?.kind === 'note') {
        this.notice.set({ tone: 'success', text: outcome.message });
        this.focusNotice();
      } else this.announceTab(outcome.order, outcome.message);
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
