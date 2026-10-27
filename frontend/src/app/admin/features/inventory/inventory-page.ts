import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { AdminSession } from '../../core/admin-session';
import { NumPipe } from '../../core/format.pipes';
import { ADMIN_INVENTORY_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type {
  InventoryFacets,
  InventoryItem,
  InventoryQuery,
  InventoryView,
  StockStatus,
} from '../../data-access/models';
import type { BadgeSpec } from '../../core/status';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { ExportDialog, ExportDialogData, ExportScope } from '../../ui/export-dialog';
import { downloadCsv, fetchAllPages, loader, Selection, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';
import { AdminToastService } from '../../ui/toast';
import { AdjustStockDrawer } from './adjust-stock-drawer';
import {
  DefaultThresholdData,
  DefaultThresholdDialog,
  SkuThresholdData,
  SkuThresholdDialog,
} from './threshold-dialogs';

const VIEWS: { value: InventoryView; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'in', label: 'Còn hàng' },
  { value: 'low', label: 'Sắp hết' },
  { value: 'out', label: 'Hết hàng' },
];

const STATUS: Record<StockStatus, BadgeSpec> = {
  in: { label: 'Còn hàng', tone: 'success' },
  low: { label: 'Sắp hết', tone: 'warning' },
  out: { label: 'Hết hàng', tone: 'critical' },
};

const SORTS: { value: string; label: string }[] = [
  { value: 'available:asc', label: 'Có thể bán: ít đến nhiều' },
  { value: 'available:desc', label: 'Có thể bán: nhiều đến ít' },
  { value: 'onHand:desc', label: 'Trong kho: nhiều đến ít' },
  { value: 'name:asc', label: 'Tên sản phẩm: A đến Z' },
  { value: 'sku:asc', label: 'SKU: A đến Z' },
];

/**
 * Stock per SKU (6.4): on hand, held by unshipped orders, available, and a status from the low-stock
 * threshold (shop default, or the SKU's own). Adjustments always carry a reason.
 */
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
        @if (canAdjust) {
          <button
            type="button"
            class="adm-btn adm-btn--lg"
            [disabled]="!facets()"
            (click)="editDefault()"
          >
            <adm-icon name="reiconSettings" [size]="16" /> Ngưỡng sắp hết
          </button>
        }
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
      <nav class="tabs" aria-label="Lọc theo trạng thái tồn kho">
        @for (item of views; track item.value) {
          <button
            type="button"
            [class.is-active]="query().view === item.value"
            (click)="list.update({ view: item.value })"
          >
            {{ item.label }}
            @if (facets(); as f) {
              <span class="count">{{ f.counts[item.value] | admNum }}</span>
            }
          </button>
        }
      </nav>
      @if (facets(); as f) {
        <p class="rule small secondary">
          <adm-icon name="reiconInfoCircle" [size]="16" />
          <span
            >Một SKU là "Sắp hết" khi số Có thể bán còn bằng hoặc thấp hơn ngưỡng. Ngưỡng mặc định
            hiện là <strong>{{ f.defaultThreshold }}</strong
            >{{ f.customCount ? ', ' + f.customCount + ' SKU dùng ngưỡng riêng' : '' }}.</span
          >
          @if (canAdjust) {
            <button type="button" class="link" (click)="editDefault()">Đổi ngưỡng</button>
          }
        </p>
      }
      <form class="toolbar" role="search" (ngSubmit)="list.update({ search: search().trim() })">
        <div class="affix search">
          <span class="prefix-icon"><adm-icon name="reiconSearch" [size]="16" /></span>
          <input
            class="input input--sm"
            type="search"
            name="search"
            placeholder="Tìm SKU, tên sản phẩm, màu"
            aria-label="Tìm trong tồn kho"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
        </div>
        <select
          class="select select--sm"
          name="category"
          aria-label="Lọc theo danh mục"
          [ngModel]="query().category"
          (ngModelChange)="list.update({ category: $event })"
        >
          <option value="">Danh mục: tất cả</option>
          @for (item of facets()?.categories ?? []; track item.value) {
            <option [value]="item.value">{{ item.label }}</option>
          }
        </select>
        <select
          class="select select--sm"
          name="color"
          aria-label="Lọc theo màu"
          [ngModel]="query().color"
          (ngModelChange)="list.update({ color: $event })"
        >
          <option value="">Màu: tất cả</option>
          @for (item of facets()?.colors ?? []; track item.name) {
            <option [value]="item.name">{{ item.name }}</option>
          }
        </select>
        <select
          class="select select--sm"
          name="size"
          aria-label="Lọc theo size"
          [ngModel]="query().size"
          (ngModelChange)="list.update({ size: $event })"
        >
          <option value="">Size: tất cả</option>
          @for (item of facets()?.sizes ?? []; track item) {
            <option [value]="item">{{ item }}</option>
          }
        </select>
        <label class="sort-select">
          <span class="small secondary">Sắp xếp</span>
          <select
            class="select select--sm"
            name="sort"
            aria-label="Sắp xếp tồn kho"
            [ngModel]="query().sort + ':' + query().dir"
            (ngModelChange)="sort($event)"
          >
            @for (item of sorts; track item.value) {
              <option [value]="item.value">{{ item.label }}</option>
            }
          </select>
        </label>
      </form>
      @if (chips().length) {
        <div class="chips filter-chips">
          @for (chip of chips(); track chip.key) {
            <span class="chip"
              >{{ chip.label
              }}<button
                type="button"
                [attr.aria-label]="'Bỏ lọc ' + chip.label"
                (click)="removeChip(chip.key)"
              >
                <adm-icon name="reiconX" [size]="12" /></button
            ></span>
          }
          <button type="button" class="link small" (click)="clearFilters()">Xóa tất cả</button>
        </div>
      }

      @if (selection.count()) {
        <div class="bulkbar" role="region" aria-label="Thao tác hàng loạt">
          <span>Đã chọn {{ selection.count() }} SKU</span>
          <span class="spacer"></span>
          <button type="button" class="adm-btn adm-btn--sm" (click)="editThreshold()">
            <adm-icon name="reiconSettings" [size]="16" /> Đặt ngưỡng sắp hết
          </button>
          <button
            type="button"
            class="adm-btn adm-btn--sm adm-btn--ghost"
            (click)="selection.clear()"
          >
            Bỏ chọn
          </button>
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
        @if (!filtered()) {
          <adm-empty
            heading="Chưa có biến thể nào"
            description="Tồn kho hiện theo từng màu và size sau khi bạn thêm sản phẩm."
          >
            <a class="adm-btn adm-btn--primary" routerLink="/admin/products/new">Thêm sản phẩm</a>
          </adm-empty>
        } @else {
          <adm-empty
            heading="Không có SKU nào khớp bộ lọc"
            description="Thử bỏ bớt bộ lọc hoặc tìm SKU khác."
          >
            <button type="button" class="adm-btn" (click)="clearFilters()">Xóa bộ lọc</button>
          </adm-empty>
        }
      } @else {
        <div class="table-wrap" [class.is-refreshing]="view.state().refreshing">
          <table class="table table--cards">
            <thead>
              <tr>
                @if (canAdjust) {
                  <th class="w-check">
                    <label class="check">
                      <input
                        type="checkbox"
                        aria-label="Chọn tất cả SKU trên trang"
                        [checked]="selection.allOf(ids())"
                        [indeterminate]="selection.someOf(ids())"
                        (change)="selection.setAll(ids(), $any($event.target).checked)"
                      />
                    </label>
                  </th>
                }
                <th>Sản phẩm</th>
                <th>SKU</th>
                <th>Trạng thái</th>
                <th class="num">Trong kho</th>
                <th class="num">Đang giữ</th>
                <th class="num">Có thể bán</th>
                <th class="num">Ngưỡng</th>
                <th><span class="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            @if (view.state().loading) {
              <tbody [admSkeleton]="10" [columns]="canAdjust ? 9 : 8"></tbody>
            } @else {
              <tbody>
                @for (item of page()?.items ?? []; track item.variantId) {
                  <tr [class.is-selected]="selection.has(item.variantId)">
                    @if (canAdjust) {
                      <td class="w-check">
                        <label class="check">
                          <input
                            type="checkbox"
                            [attr.aria-label]="'Chọn ' + item.sku"
                            [checked]="selection.has(item.variantId)"
                            (change)="selection.toggle(item.variantId)"
                          />
                        </label>
                      </td>
                    }
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
                    <td class="mono" data-label="SKU">{{ item.sku }}</td>
                    <td data-label="Trạng thái"><adm-badge [spec]="status[item.status]" /></td>
                    <td class="num" data-label="Trong kho">{{ item.onHand | admNum }}</td>
                    <td class="num secondary" data-label="Đang giữ" title="Giữ cho đơn chưa giao">
                      {{ item.reserved | admNum }}
                    </td>
                    <td class="num strong" data-label="Có thể bán">
                      {{ item.available | admNum }}
                    </td>
                    <td class="num" data-label="Ngưỡng">
                      @if (canAdjust) {
                        <button
                          type="button"
                          class="threshold"
                          [attr.aria-label]="'Đổi ngưỡng sắp hết của ' + item.sku"
                          (click)="editThreshold(item)"
                        >
                          {{ item.lowStockThreshold }}
                          <span class="tertiary small">{{
                            item.thresholdCustom ? 'riêng' : 'mặc định'
                          }}</span>
                        </button>
                      } @else {
                        {{ item.lowStockThreshold }}
                      }
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
    .rule {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;
    }
    .strong {
      font-weight: 600;
    }
    .threshold {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      border: 0;
      border-bottom: 1px dashed var(--adm-divider);
      background: none;
      padding: 2px 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      &:hover {
        border-bottom-color: var(--adm-text);
      }
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
  protected readonly sorts = SORTS;
  protected readonly status = STATUS;
  protected readonly list = urlQuery<InventoryQuery>({
    view: 'all',
    category: '',
    color: '',
    size: '',
    sort: 'available',
    dir: 'asc',
  });
  protected readonly query = this.list.query;
  protected readonly view = loader(this.query, (query) => this.api.list(query));
  protected readonly page = this.view.data;
  protected readonly search = signal(this.query().search);
  protected readonly total = computed(() => this.page()?.total ?? 0);
  protected readonly facets = signal<InventoryFacets | null>(null);
  protected readonly selection = new Selection<string>();
  protected readonly ids = computed(() => (this.page()?.items ?? []).map((item) => item.variantId));
  protected readonly filtered = computed(() => {
    const { view, search, category, color, size } = this.query();
    return view !== 'all' || !!search || !!category || !!color || !!size;
  });
  protected readonly chips = computed(() => {
    const { search, category, color, size } = this.query();
    const chips: { key: 'search' | 'category' | 'color' | 'size'; label: string }[] = [];
    if (search) chips.push({ key: 'search', label: `Tìm: "${search}"` });
    if (category)
      chips.push({
        key: 'category',
        label: `Danh mục: ${this.facets()?.categories.find((item) => item.value === category)?.label ?? category}`,
      });
    if (color) chips.push({ key: 'color', label: `Màu: ${color}` });
    if (size) chips.push({ key: 'size', label: `Size: ${size}` });
    return chips;
  });

  constructor() {
    this.loadFacets();
  }

  removeChip(key: 'search' | 'category' | 'color' | 'size'): void {
    if (key === 'search') this.search.set('');
    this.list.update({ [key]: '' });
  }

  clearFilters(): void {
    this.search.set('');
    this.list.reset();
  }

  sort(value: string): void {
    const [sort, dir] = value.split(':') as [string, 'asc' | 'desc'];
    this.list.update({ sort, dir });
  }

  editDefault(): void {
    const facets = this.facets();
    if (!facets) return;
    this.dialogs
      .modal<DefaultThresholdData, { value: number; resetCustom: boolean }>(
        DefaultThresholdDialog,
        {
          value: facets.defaultThreshold,
          customCount: facets.customCount,
        },
      )
      .closed.subscribe((result) => {
        if (!result) return;
        this.api.setDefaultThreshold(result.value, result.resetCustom).subscribe({
          next: () => {
            this.refresh();
            this.toast.show(`Ngưỡng sắp hết mặc định giờ là ${result.value}`);
          },
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
      });
  }

  /** One SKU from its row, or every selected SKU from the bulk bar. */
  editThreshold(item?: InventoryItem): void {
    const facets = this.facets();
    if (!facets) return;
    const ids = item ? [item.variantId] : [...this.selection.ids()];
    if (!ids.length) return;
    this.dialogs
      .modal<SkuThresholdData, { value: number | null }>(SkuThresholdDialog, {
        label: item ? item.sku : `${ids.length} SKU`,
        current: item?.thresholdCustom ? item.lowStockThreshold : null,
        defaultValue: facets.defaultThreshold,
      })
      .closed.subscribe((result) => {
        if (!result) return;
        this.api.setThreshold(ids, result.value).subscribe({
          next: () => {
            this.selection.clear();
            this.refresh();
            this.toast.show(
              result.value === null
                ? `${ids.length} SKU dùng lại ngưỡng mặc định`
                : `Đã đặt ngưỡng ${result.value} cho ${ids.length} SKU`,
            );
          },
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
      });
  }

  adjust(item: InventoryItem): void {
    this.dialogs
      .drawer<{ item: InventoryItem; canAdjust: boolean }, InventoryItem>(AdjustStockDrawer, {
        item,
        canAdjust: this.canAdjust,
      })
      .closed.subscribe((updated) => {
        if (!updated) return;
        this.refresh();
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
              [
                'SKU',
                'Sản phẩm',
                'Màu',
                'Size',
                'Trạng thái',
                'Trong kho',
                'Đang giữ',
                'Có thể bán',
                'Ngưỡng sắp hết',
              ],
              items.map((item) => [
                item.sku,
                item.productName,
                item.color.name,
                item.size,
                STATUS[item.status].label,
                item.onHand,
                item.reserved,
                item.available,
                item.lowStockThreshold,
              ]),
            );
            this.toast.show(`Đã xuất ${items.length} SKU`);
          },
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
      });
  }

  private refresh(): void {
    this.view.reload();
    this.loadFacets();
  }

  private loadFacets(): void {
    this.api.facets().subscribe({
      next: (facets) => this.facets.set(facets),
      error: () => this.facets.set(null),
    });
  }
}
