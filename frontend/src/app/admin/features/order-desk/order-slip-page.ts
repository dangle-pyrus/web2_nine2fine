import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { MoneyPipe } from '../../core/format.pipes';
import { AdminApiError } from '../../data-access/models';
import { errorMessage } from '../../data-access/http-support';
import { ADMIN_ORDER_DESK_API } from '../../data-access/order-desk-api';
import type { DeskOrder } from '../../data-access/order-desk-models';
import { AdminStylesheet } from '../../layout/admin-stylesheet';
import { AdmIcon } from '../../ui/icon';
import { routeParam } from '../../ui/route-param';

type SlipState =
  | { kind: 'loading' }
  | { kind: 'ready'; order: DeskOrder }
  | { kind: 'unavailable'; message: string };

/**
 * Print view of the delivery slip (BR-ADM-39, Should): built from the order detail, outside the
 * admin shell so only the slip prints (`@media print` hides the toolbar). It carries exactly what
 * the PRD lists: code, recipient, phone, address, lines (name, colour, size, quantity), the
 * customer's delivery note and the amount the courier collects (COD = total, otherwise 0). Staff
 * notes and the history are never part of it.
 */
@Component({
  selector: 'adm-order-slip-page',
  imports: [RouterLink, AdmIcon, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm slip-host', '[class.is-ready]': 'stylesheet.ready()' },
  template: `
    <div class="slip-bar">
      <a class="adm-btn adm-btn--ghost" [routerLink]="['/admin/orders', code()]">
        <adm-icon name="reiconChevronLeft" [size]="16" /> Về đơn hàng
      </a>
      <p class="slip-bar-title">Phiếu giao hàng</p>
      <button
        type="button"
        class="adm-btn adm-btn--primary"
        [disabled]="state().kind !== 'ready'"
        (click)="print()"
      >
        <adm-icon name="reiconPrinter" [size]="16" /> In phiếu
      </button>
    </div>

    @switch (state().kind) {
      @case ('loading') {
        <p class="slip-msg secondary" role="status">Đang chuẩn bị phiếu…</p>
      }
      @case ('unavailable') {
        <p class="slip-msg" role="alert">{{ message() }}</p>
      }
      @case ('ready') {
        @if (order(); as order) {
          <article class="slip" aria-label="Phiếu giao hàng" data-testid="delivery-slip">
            <header class="slip-head">
              <p class="slip-brand">nine2fine</p>
              <div class="slip-id">
                <p class="small">Mã đơn</p>
                <p class="mono slip-code">#{{ order.id }}</p>
              </div>
            </header>

            <section class="slip-to">
              <p class="small label">Người nhận</p>
              <p class="slip-name">{{ order.recipient.name }}</p>
              <p>Số điện thoại: {{ order.recipient.phone }}</p>
              <p>
                {{ order.shippingAddress.street }}, {{ order.shippingAddress.ward }},
                {{ order.shippingAddress.province }}
              </p>
            </section>

            <table class="slip-items">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Màu</th>
                  <th>Size</th>
                  <th class="num">SL</th>
                </tr>
              </thead>
              <tbody>
                @for (item of order.items; track item.variantId) {
                  <tr>
                    <td>{{ item.name }}</td>
                    <td>{{ item.color }}</td>
                    <td>{{ item.size }}</td>
                    <td class="num">{{ item.quantity }}</td>
                  </tr>
                }
              </tbody>
            </table>

            @if (order.note) {
              <p class="slip-note"><strong>Ghi chú giao hàng:</strong> {{ order.note }}</p>
            }

            <div class="slip-cod" [class.is-paid]="!collect()">
              <p class="small">Số tiền shipper thu</p>
              <p class="slip-amount" data-testid="slip-collect">{{ collect() | admMoney }}</p>
            </div>
          </article>
        }
      }
    }
  `,
  styleUrl: './order-slip-page.scss',
})
export class OrderSlipPage {
  private readonly api = inject(ADMIN_ORDER_DESK_API);
  protected readonly stylesheet = inject(AdminStylesheet);
  protected readonly code = routeParam('id');

  protected readonly state = signal<SlipState>({ kind: 'loading' });
  protected readonly order = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.order : null;
  });
  protected readonly message = computed(() => {
    const state = this.state();
    return state.kind === 'unavailable' ? state.message : '';
  });
  /** COD collects the whole total; a paid transfer collects nothing. */
  protected readonly collect = computed(() => {
    const order = this.order();
    return order && order.paymentMethod === 'cod' ? order.pricing.total : 0;
  });

  constructor() {
    this.stylesheet.load();
    toObservable(this.code)
      .pipe(
        tap(() => this.state.set({ kind: 'loading' })),
        switchMap((code) =>
          this.api.get(code).pipe(
            // Same gate as the button: the server lists `print-slip` only for to_ship / to_receive.
            map((order): SlipState =>
              order.allowedActions.includes('print-slip')
                ? { kind: 'ready', order }
                : {
                    kind: 'unavailable',
                    message:
                      'Đơn này không có phiếu giao (chỉ in được đơn đang chuẩn bị hoặc đang vận chuyển).',
                  },
            ),
            catchError((error: unknown) =>
              of<SlipState>({
                kind: 'unavailable',
                message:
                  error instanceof AdminApiError && error.code === 'not-found'
                    ? 'Không tìm thấy đơn hàng.'
                    : errorMessage(error),
              }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  protected print(): void {
    window.print();
  }
}
