import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { storeSettings } from '../../../core/store-settings';
import { DateTimePipe, MoneyPipe, NumPipe, PhonePipe } from '../../core/format.pipes';
import { ADMIN_ORDERS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { AdminOrder } from '../../data-access/models';
import { AdminStylesheet } from '../../layout/admin-stylesheet';
import { AdmIcon } from '../../ui/icon';
import type { PrintKind } from './open-print';

interface PickLine {
  sku: string;
  name: string;
  variant: string;
  quantity: number;
  orders: string[];
}

/**
 * Print sheets (Đợt 2): an A5 delivery slip per order, or one pick list that adds up every SKU of
 * the chosen orders so the warehouse walks the shelves once. Outside the shell: nothing but paper.
 */
@Component({
  selector: 'adm-print-page',
  imports: [RouterLink, AdmIcon, MoneyPipe, NumPipe, DateTimePipe, PhonePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'adm adm-print',
    '[class.is-ready]': 'stylesheet.ready()',
    '[attr.data-kind]': 'kind()',
  },
  template: `
    <div class="print-bar">
      <a class="adm-btn adm-btn--ghost" routerLink="/admin/orders">
        <adm-icon name="reiconChevronLeft" [size]="16" /> Đơn hàng
      </a>
      <p class="print-bar-title">
        {{ kind() === 'pick' ? 'Phiếu nhặt hàng' : 'Phiếu giao hàng A5' }}
        @if (orders(); as list) {
          <span class="secondary"> · {{ list.length | admNum }} đơn</span>
        }
      </p>
      <button
        type="button"
        class="adm-btn adm-btn--primary"
        [disabled]="!orders()?.length"
        (click)="print()"
      >
        <adm-icon name="reiconPrinter" [size]="16" /> In ngay
      </button>
    </div>

    @if (error(); as message) {
      <p class="print-msg">{{ message }}</p>
    } @else if (!orders()) {
      <p class="print-msg secondary">Đang chuẩn bị phiếu…</p>
    } @else if (kind() === 'delivery') {
      @for (order of orders(); track order.id) {
        <article class="slip">
          <header class="slip-head">
            <div>
              <p class="slip-brand">nine2fine</p>
              <p class="small">{{ store().address }}</p>
              <p class="small">Hotline {{ store().hotline }}</p>
            </div>
            <div class="slip-id">
              <p class="small">Mã đơn</p>
              <p class="mono slip-code">#{{ order.id }}</p>
              <p class="small">{{ order.placedAt | admDateTime }}</p>
            </div>
          </header>

          <section class="slip-to">
            <p class="small label">Người nhận</p>
            <p class="slip-name">
              {{ order.shippingAddress.recipient }} · {{ order.shippingAddress.phone | admPhone }}
            </p>
            <p>
              {{ order.shippingAddress.street }}, {{ order.shippingAddress.ward }},
              {{ order.shippingAddress.province }}
            </p>
            @if (order.delivery; as delivery) {
              <p class="small">
                {{ delivery.carrier }} · Mã vận đơn
                <span class="mono">{{ delivery.trackingCode }}</span>
              </p>
            }
          </section>

          <table class="slip-items">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Phân loại</th>
                <th class="num">SL</th>
              </tr>
            </thead>
            <tbody>
              @for (item of order.items; track item.variantId) {
                <tr>
                  <td>
                    {{ item.name }}<br /><span class="mono small">{{ item.sku }}</span>
                  </td>
                  <td>{{ item.color }} / {{ item.size }}</td>
                  <td class="num">{{ item.quantity }}</td>
                </tr>
              }
            </tbody>
          </table>

          @if (order.note) {
            <p class="slip-note"><strong>Ghi chú:</strong> {{ order.note }}</p>
          }

          <div class="slip-cod" [class.is-paid]="!collect(order)">
            @if (collect(order)) {
              <p class="small">Thu hộ (COD)</p>
              <p class="slip-amount">{{ order.pricing.total | admMoney }}</p>
            } @else {
              <p class="slip-amount">Đã thanh toán · không thu tiền</p>
            }
          </div>

          <footer class="slip-foot">
            <div>
              <p class="small">
                Cho xem hàng, không cho thử. Đổi trả trong {{ order.returnDays }} ngày.
              </p>
            </div>
            <div class="slip-sign">
              <p class="small">Người nhận ký tên</p>
            </div>
          </footer>
        </article>
      }
    } @else {
      <article class="pick">
        <header class="pick-head">
          <h1>Phiếu nhặt hàng</h1>
          <p class="small">
            In lúc {{ now | admDateTime }} · {{ orders()!.length | admNum }} đơn ·
            {{ pickTotal() | admNum }} sản phẩm
          </p>
        </header>
        <table class="pick-table">
          <thead>
            <tr>
              <th class="tick" aria-label="Đã nhặt"></th>
              <th>SKU</th>
              <th>Sản phẩm</th>
              <th>Phân loại</th>
              <th class="num">SL</th>
              <th>Đơn</th>
            </tr>
          </thead>
          <tbody>
            @for (line of pickLines(); track line.sku) {
              <tr>
                <td class="tick"><span class="box"></span></td>
                <td class="mono">{{ line.sku }}</td>
                <td>{{ line.name }}</td>
                <td>{{ line.variant }}</td>
                <td class="num strong">{{ line.quantity }}</td>
                <td class="mono small">{{ line.orders.join(', ') }}</td>
              </tr>
            }
          </tbody>
        </table>
      </article>
    }
  `,
  styleUrl: './print-page.scss',
})
export class PrintPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ADMIN_ORDERS_API);
  private readonly injector = inject(Injector);
  protected readonly stylesheet = inject(AdminStylesheet);
  protected readonly store = computed(() => storeSettings().info);
  protected readonly now = new Date().toISOString();
  protected readonly error = signal<string | null>(null);

  protected readonly kind = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('kind') as PrintKind)),
    { initialValue: 'delivery' as PrintKind },
  );
  private readonly auto = this.route.snapshot.queryParamMap.get('auto') === '1';

  protected readonly orders = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => (params.get('ids') ?? '').split(',').filter(Boolean)),
      switchMap((ids) => {
        if (!ids.length) {
          this.error.set('Chưa chọn đơn nào để in.');
          return of([] as AdminOrder[]);
        }
        return forkJoin(ids.map((id) => this.api.get(id))).pipe(
          catchError((error: unknown) => {
            this.error.set(errorMessage(error));
            return of([] as AdminOrder[]);
          }),
        );
      }),
    ),
  );

  protected readonly pickLines = computed<PickLine[]>(() => {
    const lines = new Map<string, PickLine>();
    for (const order of this.orders() ?? []) {
      for (const item of order.items) {
        const line = lines.get(item.sku) ?? {
          sku: item.sku,
          name: item.name,
          variant: `${item.color} / ${item.size}`,
          quantity: 0,
          orders: [],
        };
        line.quantity += item.quantity;
        line.orders.push(order.id);
        lines.set(item.sku, line);
      }
    }
    return [...lines.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  });
  protected readonly pickTotal = computed(() =>
    this.pickLines().reduce((sum, line) => sum + line.quantity, 0),
  );

  constructor() {
    this.stylesheet.load();
    // Opened from a print button: show the browser dialog as soon as the sheets are on screen.
    const ref = effect(() => {
      if (!this.auto || !this.orders()?.length || !this.stylesheet.ready()) return;
      ref.destroy();
      afterNextRender(() => window.print(), { injector: this.injector });
    });
  }

  collect(order: AdminOrder): boolean {
    return order.payment.method === 'cod' && !order.payment.paid;
  }

  print(): void {
    window.print();
  }
}
