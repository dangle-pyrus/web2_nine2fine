import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CATEGORIES } from '../../../features/catalog/models/product';
import { AdminSession } from '../../core/admin-session';
import { DatePipe, MoneyPipe, NumPipe } from '../../core/format.pipes';
import { productBadge } from '../../core/status';
import { ADMIN_PRODUCTS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type {
  AdminProductSummary,
  ProductQuery,
  ProductStatus,
  ProductView,
} from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader, Selection, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';
import { AdminToastService } from '../../ui/toast';

const VIEWS: { value: ProductView; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Đang bán' },
  { value: 'draft', label: 'Nháp' },
  { value: 'hidden', label: 'Đã ẩn' },
  { value: 'out-of-stock', label: 'Có size hết hàng' },
];

/** Products index (4.1, 6.2). */
@Component({
  selector: 'adm-product-list-page',
  imports: [
    FormsModule,
    RouterLink,
    AdmPageHeader,
    AdmBadge,
    AdmIcon,
    AdmPager,
    AdmSkeletonRows,
    AdmEmptyState,
    MoneyPipe,
    NumPipe,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Sản phẩm">
      <ng-container actions>
        @if (canEdit) {
          <a class="adm-btn adm-btn--primary adm-btn--lg" routerLink="/admin/products/new"
            ><adm-icon name="reiconPlus" [size]="16" /> Thêm sản phẩm</a
          >
        }
      </ng-container>
    </adm-page-header>
    <div class="page-body page-body--wide">
      <nav class="tabs" aria-label="Chế độ xem sản phẩm">
        @for (item of views; track item.value) {
          <button
            type="button"
            [class.is-active]="query().view === item.value"
            (click)="selection.clear(); list.update({ view: item.value })"
          >
            {{ item.label }}
          </button>
        }
      </nav>
      @if (selection.count()) {
        <div class="bulkbar" role="region" aria-label="Thao tác hàng loạt">
          <span>Đã chọn {{ selection.count() }} sản phẩm</span>
          <span class="spacer"></span>
          <button type="button" class="adm-btn adm-btn--sm" (click)="bulkStatus('active')">
            Đang bán
          </button>
          <button type="button" class="adm-btn adm-btn--sm" (click)="bulkStatus('hidden')">
            Ẩn
          </button>
          <button type="button" class="adm-btn adm-btn--sm" (click)="bulkStatus('draft')">
            Chuyển về nháp
          </button>
          <button
            type="button"
            class="adm-btn adm-btn--sm adm-btn--icon"
            aria-label="Bỏ chọn"
            (click)="selection.clear()"
          >
            <adm-icon name="reiconX" [size]="16" />
          </button>
        </div>
      } @else {
        <form class="toolbar" role="search" (ngSubmit)="list.update({ search: search().trim() })">
          <div class="affix search">
            <span class="prefix-icon"><adm-icon name="reiconSearch" [size]="16" /></span>
            <input
              class="input input--sm"
              type="search"
              name="search"
              placeholder="Tên sản phẩm, SKU, tag"
              aria-label="Tìm sản phẩm"
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
            @for (item of categories; track item.value) {
              <option [value]="item.value">{{ item.label }}</option>
            }
          </select>
          <select
            class="select select--sm"
            name="sort"
            aria-label="Sắp xếp"
            [ngModel]="query().sort + ':' + query().dir"
            (ngModelChange)="sort($event)"
          >
            <option value="updatedAt:desc">Mới cập nhật</option>
            <option value="name:asc">Tên A–Z</option>
            <option value="price:asc">Giá tăng dần</option>
            <option value="price:desc">Giá giảm dần</option>
            <option value="inventory:asc">Tồn kho ít nhất</option>
          </select>
        </form>
        @if (query().search || query().category) {
          <div class="chips filter-chips">
            @if (query().search) {
              <span class="chip"
                >Tìm: “{{ query().search }}”<button
                  type="button"
                  aria-label="Bỏ từ khóa"
                  (click)="search.set(''); list.update({ search: '' })"
                >
                  <adm-icon name="reiconX" [size]="12" /></button
              ></span>
            }
            @if (query().category) {
              <span class="chip"
                >Danh mục: {{ categoryLabel(query().category)
                }}<button
                  type="button"
                  aria-label="Bỏ lọc danh mục"
                  (click)="list.update({ category: '' })"
                >
                  <adm-icon name="reiconX" [size]="12" /></button
              ></span>
            }
            <button type="button" class="link small" (click)="search.set(''); list.reset(['view'])">
              Xóa tất cả
            </button>
          </div>
        }
      }

      @if (view.state().error && !page()) {
        <adm-empty
          kind="error"
          heading="Không tải được danh sách sản phẩm"
          [description]="view.state().error ?? ''"
        >
          <button type="button" class="adm-btn" (click)="view.reload()">Thử lại</button>
        </adm-empty>
      } @else if (page() && !page()!.total) {
        @if (query().search || query().category || query().view !== 'all') {
          <adm-empty
            heading="Không tìm thấy sản phẩm phù hợp"
            description="Thử từ khóa khác hoặc bỏ bớt bộ lọc."
          >
            <button type="button" class="adm-btn" (click)="search.set(''); list.reset()">
              Xóa bộ lọc
            </button>
          </adm-empty>
        } @else {
          <adm-empty
            kind="first"
            image="/assets/illustrations/product_photography.svg"
            heading="Thêm sản phẩm đầu tiên"
            description="Sản phẩm bạn thêm sẽ hiện trên cửa hàng khi chuyển sang Đang bán."
          >
            <a class="adm-btn adm-btn--primary" routerLink="/admin/products/new">Thêm sản phẩm</a>
          </adm-empty>
        }
      } @else {
        <div class="table-wrap" [class.is-refreshing]="view.state().refreshing">
          <table class="table table--cards">
            <thead>
              <tr>
                @if (canEdit) {
                  <th class="w-check">
                    <label class="check"
                      ><input
                        type="checkbox"
                        aria-label="Chọn tất cả sản phẩm trên trang"
                        [checked]="selection.allOf(ids())"
                        [indeterminate]="selection.someOf(ids())"
                        (change)="selection.setAll(ids(), $any($event.target).checked)"
                    /></label>
                  </th>
                }
                <th>Sản phẩm</th>
                <th>Trạng thái</th>
                <th>Tồn kho</th>
                <th>Danh mục</th>
                <th>Cập nhật</th>
                <th class="num">Giá</th>
              </tr>
            </thead>
            @if (view.state().loading) {
              <tbody [admSkeleton]="8" [columns]="7"></tbody>
            } @else {
              <tbody>
                @for (product of page()?.items ?? []; track product.id) {
                  <tr
                    class="clickable"
                    [class.is-selected]="selection.has(product.id)"
                    (click)="open(product, $event)"
                  >
                    @if (canEdit) {
                      <td class="w-check">
                        <label class="check"
                          ><input
                            type="checkbox"
                            [attr.aria-label]="'Chọn ' + product.name"
                            [checked]="selection.has(product.id)"
                            (change)="selection.toggle(product.id)"
                        /></label>
                      </td>
                    }
                    <td>
                      <div class="cell-media">
                        <img class="thumb" [src]="product.image || placeholder" alt="" />
                        <a class="cell-title" [routerLink]="['/admin/products', product.id]">{{
                          product.name
                        }}</a>
                      </div>
                    </td>
                    <td><adm-badge [spec]="badge(product.status)" /></td>
                    <td data-label="Tồn kho" [class.danger-text]="product.inventory <= 0">
                      {{ product.inventory | admNum }} trong {{ product.variantCount }} biến thể
                    </td>
                    <td data-label="Danh mục" class="secondary">
                      {{ categoryLabel(product.category) }}
                    </td>
                    <td class="secondary hide-sm">{{ product.updatedAt | admDate }}</td>
                    <td class="num" data-label="Giá">
                      {{ product.price | admMoney }}
                      @if (product.compareAtPrice) {
                        <div class="cell-sub">
                          <s>{{ product.compareAtPrice | admMoney }}</s>
                        </div>
                      }
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
  styles: '.danger-text { color: var(--adm-danger); }',
})
export class ProductListPage {
  private readonly api = inject(ADMIN_PRODUCTS_API);
  private readonly router = inject(Router);
  private readonly toast = inject(AdminToastService);
  protected readonly canEdit = inject(AdminSession).can('products.edit');
  protected readonly views = VIEWS;
  protected readonly categories = CATEGORIES;
  protected readonly badge = productBadge;
  protected readonly placeholder = '/assets/illustrations/shopping_bags.svg';
  protected readonly list = urlQuery<ProductQuery>({
    view: 'all',
    category: '',
    sort: 'updatedAt',
  });
  protected readonly query = this.list.query;
  protected readonly view = loader(this.query, (query) => this.api.list(query));
  protected readonly page = this.view.data;
  protected readonly selection = new Selection<string>();
  protected readonly search = signal(this.query().search);
  protected readonly ids = computed(() => this.page()?.items.map((item) => item.id) ?? []);

  categoryLabel(value: string): string {
    return CATEGORIES.find((item) => item.value === value)?.label ?? value;
  }

  sort(value: string): void {
    const [sort, dir] = value.split(':') as [string, 'asc' | 'desc'];
    this.list.update({ sort, dir });
  }

  open(product: AdminProductSummary, event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('input, a, button')) return;
    void this.router.navigate(['/admin/products', product.id]);
  }

  /** Reversible, so no confirmation: the toast offers "Hoàn tác" instead (5.8). */
  bulkStatus(status: ProductStatus): void {
    const ids = [...this.selection.ids()];
    const previous = new Map(
      this.page()
        ?.items.filter((item) => ids.includes(item.id))
        .map((item) => [item.id, item.status]),
    );
    this.api.setStatus(ids, status).subscribe({
      next: () => {
        this.selection.clear();
        this.view.reload();
        const label = productBadge(status).label;
        this.toast.show(`Đã chuyển ${ids.length} sản phẩm sang "${label}"`, {
          undo: () => {
            for (const value of new Set(previous.values())) {
              const group = ids.filter((id) => previous.get(id) === value);
              this.api.setStatus(group, value).subscribe(() => this.view.reload());
            }
          },
        });
      },
      error: (error: unknown) => this.toast.error(errorMessage(error)),
    });
  }
}
