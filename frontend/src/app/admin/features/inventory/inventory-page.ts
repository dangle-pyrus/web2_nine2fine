import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { AdminSession } from '../../core/admin-session';
import { NumPipe } from '../../core/format.pipes';
import { stockBadge } from '../../core/status';
import { ADMIN_INVENTORY_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { InventoryItem, InventoryQuery, InventoryView } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { ExportDialog, ExportDialogData, ExportScope } from '../../ui/export-dialog';
import { downloadCsv, fetchAllPages, loader, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';
import { AdminToastService } from '../../ui/toast';
import { AdjustStockDrawer } from './adjust-stock-drawer';

const VIEWS: { value: InventoryView; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'low', label: 'Sắp hết' },
  { value: 'out', label: 'Hết hàng' },
];

/** Stock per SKU (6.4): on hand, held by unshipped orders, available; adjustments always carry a reason. */
@Component({
  selector: 'adm-inventory-page',
  imports: [
    FormsModule,
    RouterLink,
    AdmPageHeader,
    AdmBadge,
    AdmIcon,
    AdmPager,
    AdmSkeletonRows,
    AdmEmptyState,
    NumPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Tồn kho">
      <ng-container actions>
        <button
          type="button"
          class="adm-btn adm-btn--lg"
          [disabled]="!page()?.items?.length"
          (click)="exportCsv()"
        >
          <adm-icon name="reiconDownload" [size]="16" /> Xuất CSV
        </button>
      </ng-container>
    </adm-page-header>
    <div class="page-body page-body--wide">
      <nav class="tabs" aria-label="Lọc tồn kho">
        @for (item of views; track item.value) {
          <button
            type="button"
            [class.is-active]="query().view === item.value"
            (click)="list.update({ view: item.value })"
          >
            {{ item.label }}
          </button>
        }
      </nav>
      <form class="toolbar" role="search" (ngSubmit)="list.update({ search: search().trim() })">
        <div class="affix search">
          <span class="prefix-icon"><adm-icon name="reiconSearch" [size]="16" /></span>
          <input
            class="input input--sm"
            type="search"
            name="search"
            placeholder="Tên sản phẩm hoặc SKU"
            aria-label="Tìm trong tồn kho"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
        </div>
        <select
          class="select select--sm"
          name="sort"
          aria-label="Sắp xếp"
          [ngModel]="query().sort + ':' + query().dir"
          (ngModelChange)="sort($event)"
        >
          <option value="available:asc">Còn ít nhất</option>
          <option value="available:desc">Còn nhiều nhất</option>
          <option value="name:asc">Tên A–Z</option>
          <option value="onHand:desc">Trong kho nhiều nhất</option>
        </select>
      </form>
      @if (query().search) {
        <div class="chips filter-chips">
          <span class="chip"
            >Tìm: “{{ query().search }}”<button
              type="button"
              aria-label="Bỏ từ khóa"
              (click)="search.set(''); list.update({ search: '' })"
            >
              <adm-icon name="reiconX" [size]="12" /></button
          ></span>
        </div>
      }

      @if (view.state().error && !page()) {
        <adm-empty
          kind="error"
          heading="Không tải được tồn kho"
          [description]="view.state().error ?? ''"
        >
          <button type="button" class="adm-btn" (click)="view.reload()">Thử lại</button>
        </adm-empty>
      } @else if (page() && !page()!.total) {
        @if (query().view === 'all' && !query().search) {
          <adm-empty
            heading="Chưa có biến thể nào"
            description="Tồn kho hiện theo từng màu và size sau khi bạn thêm sản phẩm."
          >
            <a class="adm-btn adm-btn--primary" routerLink="/admin/products/new">Thêm sản phẩm</a>
          </adm-empty>
        } @else if (query().view !== 'all' && !query().search) {
          <adm-empty
            [heading]="
              query().view === 'out' ? 'Không có SKU nào hết hàng' : 'Không có SKU nào sắp hết'
            "
            description="Mọi biến thể đang còn đủ hàng."
          />
        } @else {
          <adm-empty
            heading="Không tìm thấy SKU phù hợp"
            description="Thử tên sản phẩm hoặc SKU khác."
          >
            <button type="button" class="adm-btn" (click)="search.set(''); list.reset()">
              Xóa bộ lọc
            </button>
          </adm-empty>
        }
      } @else {
        <div class="table-wrap" [class.is-refreshing]="view.state().refreshing">
          <table class="table table--cards">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>SKU</th>
                <th class="num">Trong kho</th>
                <th class="num">Đang giữ</th>
                <th class="num">Có thể bán</th>
                <th><span class="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            @if (view.state().loading) {
              <tbody [admSkeleton]="10" [columns]="6"></tbody>
            } @else {
              <tbody>
                @for (item of page()?.items ?? []; track item.variantId) {
                  <tr>
                    <td>
                      <div class="cell-media">
                        <img class="thumb" [src]="item.image" alt="" />
                        <div>
                          <a
                            class="cell-title"
                            [routerLink]="['/admin/products', item.productId]"
                            >{{ item.productName }}</a
                          >
                          <div class="cell-sub">
                            <span class="swatch" [style.background]="item.color.hex"></span>
                            {{ item.color.name }} / {{ item.size }}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="mono secondary" data-label="SKU">{{ item.sku }}</td>
                    <td class="num" data-label="Trong kho">{{ item.onHand | admNum }}</td>
                    <td class="num secondary" data-label="Đang giữ" title="Giữ cho đơn chưa giao">
                      {{ item.reserved | admNum }}
                    </td>
                    <td class="num" data-label="Có thể bán">
                      <span class="avail">
                        @if (stock(item); as spec) {
                          <adm-badge [spec]="spec" />
                        }
                        <strong>{{ item.available | admNum }}</strong>
                      </span>
                    </td>
                    <td class="row-actions">
                      <button type="button" class="adm-btn adm-btn--sm" (click)="adjust(item)">
                        {{ canAdjust ? 'Điều chỉnh' : 'Lịch sử' }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            }
          </table>
        </div>
        @if (page(); as data) {
          <adm-pager
            [total]="data.total"
            [page]="data.page"
            [pageSize]="data.pageSize"
            (pageChange)="list.update({ page: $event })"
            (sizeChange)="list.update({ pageSize: $event })"
          />
        }
      }
    </div>
  `,
  styles: `
    .avail {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .cell-sub .swatch {
      width: 10px;
      height: 10px;
    }
    .row-actions {
      width: 1%;
      white-space: nowrap;
      text-align: right;
    }
  `,
})
export class InventoryPage {
  private readonly api = inject(ADMIN_INVENTORY_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  protected readonly canAdjust = inject(AdminSession).can('inventory.adjust');
  protected readonly views = VIEWS;
  protected readonly list = urlQuery<InventoryQuery>({
    view: 'all',
    sort: 'available',
    dir: 'asc',
  });
  protected readonly query = this.list.query;
  protected readonly view = loader(this.query, (query) => this.api.list(query));
  protected readonly page = this.view.data;
  protected readonly search = signal(this.query().search);
  protected readonly total = computed(() => this.page()?.total ?? 0);

  stock(item: InventoryItem) {
    return stockBadge(item.available, item.lowStockThreshold);
  }

  sort(value: string): void {
    const [sort, dir] = value.split(':') as [string, 'asc' | 'desc'];
    this.list.update({ sort, dir });
  }

  adjust(item: InventoryItem): void {
    this.dialogs
      .drawer<{ item: InventoryItem; canAdjust: boolean }, InventoryItem>(AdjustStockDrawer, {
        item,
        canAdjust: this.canAdjust,
      })
      .closed.subscribe((updated) => {
        if (!updated) return;
        this.view.reload();
        this.toast.show(`Đã cập nhật tồn kho ${updated.sku}: còn ${updated.onHand}`);
      });
  }

  exportCsv(): void {
    const page = this.page();
    if (!page) return;
    this.dialogs
      .modal<ExportDialogData, ExportScope>(ExportDialog, {
        noun: 'SKU',
        pageCount: page.items.length,
        total: page.total,
      })
      .closed.subscribe((scope) => {
        if (!scope) return;
        const rows =
          scope === 'page'
            ? of(page.items)
            : fetchAllPages((index, pageSize) =>
                this.api.list({ ...this.query(), page: index, pageSize }),
              );
        rows.subscribe({
          next: (items) => {
            downloadCsv(
              `ton-kho-${new Date().toISOString().slice(0, 10)}.csv`,
              ['SKU', 'Sản phẩm', 'Màu', 'Size', 'Trong kho', 'Đang giữ', 'Có thể bán'],
              items.map((item) => [
                item.sku,
                item.productName,
                item.color.name,
                item.size,
                item.onHand,
                item.reserved,
                item.available,
              ]),
            );
            this.toast.show(`Đã xuất ${items.length} SKU`);
          },
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
      });
  }
}
