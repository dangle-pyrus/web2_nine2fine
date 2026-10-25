import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { percent } from '../../core/format';
import { DatePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import { ADMIN_REPORTS_API } from '../../data-access/admin-apis';
import type { ReportRange } from '../../data-access/models';
import { AdmEmptyState } from '../../ui/empty-state';
import { loader } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';

const RANGES: { value: ReportRange; label: string }[] = [
  { value: '30d', label: '30 ngày' },
  { value: '90d', label: '90 ngày' },
  { value: '365d', label: '12 tháng' },
];

/**
 * Báo cáo (Đợt 3): the questions a fashion shop asks after the dashboard: which sizes and colours
 * sell, which products come back and why, what sits on the shelf, and whether codes pay off.
 */
@Component({
  selector: 'adm-reports-page',
  imports: [RouterLink, AdmPageHeader, AdmEmptyState, MoneyPipe, NumPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Báo cáo">
      <p subtitle class="secondary small">Tính trên đơn đã xác nhận, không gồm đơn hủy.</p>
      <ng-container actions>
        <div class="segmented" role="group" aria-label="Khoảng thời gian">
          @for (item of ranges; track item.value) {
            <button
              type="button"
              [class.is-active]="range() === item.value"
              [attr.aria-pressed]="range() === item.value"
              (click)="range.set(item.value)"
            >
              {{ item.label }}
            </button>
          }
        </div>
      </ng-container>
    </adm-page-header>
    <div class="page-body page-body--wide">
      @if (view.state().error && !report()) {
        <adm-empty
          kind="error"
          heading="Không tải được báo cáo"
          [description]="view.state().error ?? ''"
        >
          <button type="button" class="adm-btn" (click)="view.reload()">Thử lại</button>
        </adm-empty>
      } @else if (report(); as r) {
        <div class="grid" [class.is-refreshing]="view.state().refreshing">
          <section class="section" aria-labelledby="size-title">
            <header><h2 id="size-title">Bán theo size</h2></header>
            @if (r.bySize.length) {
              <table class="table bars">
                <thead>
                  <tr>
                    <th>Size</th>
                    <th class="w-bar"><span class="sr-only">Tỉ trọng</span></th>
                    <th class="num">Đã bán</th>
                    <th class="num">Bị trả</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of r.bySize; track row.size) {
                    <tr>
                      <td class="strong">{{ row.size }}</td>
                      <td class="w-bar">
                        <span class="bar" [style.width.%]="(row.units / maxSize()) * 100"></span>
                      </td>
                      <td class="num">{{ row.units | admNum }}</td>
                      <td class="num secondary">
                        {{
                          row.returned
                            ? (row.returned | admNum) + ' · ' + pct(row.returned, row.units)
                            : '–'
                        }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="secondary">Chưa có đơn trong khoảng này.</p>
            }
          </section>

          <section class="section" aria-labelledby="color-title">
            <header><h2 id="color-title">Bán theo màu</h2></header>
            @if (r.byColor.length) {
              <table class="table bars">
                <thead>
                  <tr>
                    <th>Màu</th>
                    <th class="w-bar"><span class="sr-only">Tỉ trọng</span></th>
                    <th class="num">Đã bán</th>
                    <th class="num">Doanh thu</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of r.byColor; track row.color) {
                    <tr>
                      <td>
                        <span class="swatch" [style.background]="row.hex"></span>{{ row.color }}
                      </td>
                      <td class="w-bar">
                        <span class="bar" [style.width.%]="(row.units / maxColor()) * 100"></span>
                      </td>
                      <td class="num">{{ row.units | admNum }}</td>
                      <td class="num secondary">{{ row.revenue | admMoney }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="secondary">Chưa có đơn trong khoảng này.</p>
            }
          </section>

          <section class="section span-2" aria-labelledby="returns-title">
            <header><h2 id="returns-title">Tỉ lệ trả hàng theo sản phẩm</h2></header>
            @if (r.returnsByProduct.length) {
              <div class="table-wrap">
                <table class="table table--cards">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th class="num">Đã bán</th>
                      <th class="num">Bị trả</th>
                      <th class="num">Tỉ lệ</th>
                      <th>Lý do chính</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of r.returnsByProduct; track row.productId) {
                      <tr>
                        <td>
                          <a class="cell-title" [routerLink]="['/admin/products', row.productId]">{{
                            row.name
                          }}</a>
                        </td>
                        <td class="num" data-label="Đã bán">{{ row.sold | admNum }}</td>
                        <td class="num" data-label="Bị trả">{{ row.returned | admNum }}</td>
                        <td class="num strong" data-label="Tỉ lệ">
                          {{ pct(row.returned, row.sold) }}
                        </td>
                        <td data-label="Lý do chính">
                          @for (reason of row.reasons; track reason.reason; let last = $last) {
                            {{ reason.reason }} ({{ reason.count }}){{ last ? '' : ', ' }}
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="small tertiary note">
                Lý do "Sai size" hoặc "Không vừa form" lặp lại thường là dấu hiệu bảng size cần sửa.
                <a class="link" routerLink="/admin/size-charts">Mở bảng size</a>
              </p>
            } @else {
              <p class="secondary">Không có đơn trả hàng trong khoảng này.</p>
            }
          </section>

          <section class="section span-2" aria-labelledby="aging-title">
            <header>
              <h2 id="aging-title">Hàng tồn lâu</h2>
              <a class="adm-btn adm-btn--ghost adm-btn--sm" routerLink="/admin/inventory"
                >Xem tồn kho</a
              >
            </header>
            <p class="section-desc">Biến thể còn hàng nhưng không bán được trong hơn 30 ngày.</p>
            @if (r.agingStock.length) {
              <div class="table-wrap">
                <table class="table table--cards">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>SKU</th>
                      <th class="num">Tồn</th>
                      <th>Bán gần nhất</th>
                      <th class="num">Giá trị tồn (giá vốn)</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of r.agingStock; track row.variantId) {
                      <tr>
                        <td>
                          <a class="cell-title" [routerLink]="['/admin/products', row.productId]">{{
                            row.name
                          }}</a>
                          <div class="cell-sub">{{ row.variant }}</div>
                        </td>
                        <td class="mono" data-label="SKU">{{ row.sku }}</td>
                        <td class="num" data-label="Tồn">{{ row.onHand | admNum }}</td>
                        <td class="secondary" data-label="Bán gần nhất">
                          {{ row.lastSoldAt ? (row.lastSoldAt | admDate) : 'Chưa bán lần nào' }}
                        </td>
                        <td class="num" data-label="Giá trị tồn">
                          {{ row.stockValue | admMoney }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="secondary">Không có hàng tồn lâu. Hàng đang xoay vòng tốt.</p>
            }
          </section>

          <section class="section span-2" aria-labelledby="promo-title">
            <header>
              <h2 id="promo-title">Hiệu quả mã giảm giá</h2>
              <a class="adm-btn adm-btn--ghost adm-btn--sm" routerLink="/admin/promotions"
                >Xem khuyến mãi</a
              >
            </header>
            @if (r.promotions.length) {
              <div class="table-wrap">
                <table class="table table--cards">
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th class="num">Số đơn</th>
                      <th class="num">Tiền đã giảm</th>
                      <th class="num">Doanh thu</th>
                      <th class="num">Giá trị đơn TB</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of r.promotions; track row.code) {
                      <tr>
                        <td>
                          <span class="cell-title mono">{{ row.code }}</span>
                          @if (row.title) {
                            <div class="cell-sub">{{ row.title }}</div>
                          }
                        </td>
                        <td class="num" data-label="Số đơn">{{ row.orders | admNum }}</td>
                        <td class="num" data-label="Tiền đã giảm">{{ row.discount | admMoney }}</td>
                        <td class="num" data-label="Doanh thu">{{ row.revenue | admMoney }}</td>
                        <td class="num" data-label="Giá trị đơn TB">
                          {{ row.averageOrder | admMoney }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="secondary">Chưa có đơn dùng mã giảm giá trong khoảng này.</p>
            }
          </section>
        </div>
      } @else {
        <div class="stack"><span class="sk sk--title"></span><span class="sk"></span></div>
      }
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 48px;
      transition: opacity 120ms ease-out;
      &.is-refreshing {
        opacity: 0.55;
      }
    }
    .span-2 {
      grid-column: 1 / -1;
    }
    .bars {
      width: 100%;
    }
    .w-bar {
      width: 45%;
    }
    .bar {
      display: block;
      height: 8px;
      min-width: 2px;
      border-radius: 4px;
      background: var(--adm-primary);
    }
    .swatch {
      display: inline-block;
      width: 12px;
      height: 12px;
      margin-right: 8px;
      border-radius: 50%;
      border: 1px solid var(--adm-divider);
      vertical-align: -1px;
    }
    .strong {
      font-weight: 500;
    }
    .note {
      margin-top: 12px;
    }
    @media (max-width: 1023px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class ReportsPage {
  private readonly api = inject(ADMIN_REPORTS_API);
  protected readonly ranges = RANGES;
  protected readonly range = signal<ReportRange>('90d');
  protected readonly view = loader(this.range, (range) => this.api.sales(range));
  protected readonly report = this.view.data;
  protected readonly maxSize = computed(() =>
    Math.max(1, ...(this.report()?.bySize.map((row) => row.units) ?? [])),
  );
  protected readonly maxColor = computed(() =>
    Math.max(1, ...(this.report()?.byColor.map((row) => row.units) ?? [])),
  );

  pct(part: number, whole: number): string {
    return whole ? percent(part / whole) : '–';
  }
}
