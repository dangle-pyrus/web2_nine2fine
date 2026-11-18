import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AdminSession } from '../../core/admin-session';
import { NumPipe } from '../../core/format.pipes';
import { ADMIN_INVENTORY_API } from '../../data-access/admin-apis';
import {
  CHANNELS,
  channelStock,
  INITIAL_SYNC_MINUTES,
  listingCode,
  readSetups,
  saveSetups,
  type ChannelKey,
  type MarketplaceKey,
} from '../../data-access/marketplace-demo';
import type { InventoryItem } from '../../data-access/models';
import type { BadgeSpec } from '../../core/status';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { fetchAllPages, Selection } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { routeParam } from '../../ui/route-param';
import { AdmSkeletonRows } from '../../ui/skeleton';
import { AdminToastService } from '../../ui/toast';

type LinkFilter = 'all' | 'unlinked' | 'error' | 'linked';

/**
 * Setup page of one sales channel, opened from its card on Tồn kho. The marketplace side is a demo:
 * the connection and the SKU links live in this browser (marketplace-demo.ts) so the flow can be
 * shown. With a real integration, the same page would call the marketplace API instead.
 */
@Component({
  selector: 'adm-channel-setup-page',
  imports: [
    FormsModule,
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
    @if (channel(); as ch) {
      <adm-page-header [heading]="ch.name" back="/admin/inventory">
        <adm-badge badges [spec]="status()" />
        <ng-container actions>
          @if (market(); as key) {
            @if (setup()!.connected) {
              <button
                type="button"
                class="adm-btn adm-btn--lg"
                [disabled]="!canManage"
                (click)="disconnect(key)"
              >
                Ngắt kết nối
              </button>
            } @else {
              <button
                type="button"
                class="adm-btn adm-btn--lg adm-btn--primary"
                [disabled]="!canManage"
                (click)="connect(key)"
              >
                Kết nối {{ ch.name }}
              </button>
            }
          }
        </ng-container>
      </adm-page-header>
      <div class="page-body">
        <div class="banner banner--info" role="note">
          <adm-icon name="reiconInfoCircle" [size]="20" />
          <div class="banner-body">
            <p class="banner-title">Trang cấu hình ở chế độ demo</p>
            <p class="small secondary">
              Kết nối và liên kết SKU được lưu trên trình duyệt này để minh họa cách hoạt động, chưa
              gọi API của sàn.
            </p>
          </div>
        </div>

        <section class="section" aria-labelledby="conn-title">
          <header><h2 id="conn-title">Kết nối</h2></header>
          <div class="frame">
            <ul class="info">
              <li>
                <adm-icon name="reiconShop" [size]="18" />
                <span class="cell-title">{{ setup()?.shopName ?? 'Website nine2fine' }}</span>
              </li>
              @if (setup(); as value) {
                <li>
                  <adm-icon name="reiconTag" [size]="18" />
                  <span class="secondary">Mã gian hàng {{ value.shopId }}</span>
                </li>
                <li>
                  <adm-icon name="reiconHistory" [size]="18" />
                  <span class="secondary">
                    @if (value.connected) {
                      Đồng bộ gần nhất {{ minutes() }} phút trước
                    } @else {
                      Chưa kết nối, chưa có đồng bộ nào
                    }
                  </span>
                </li>
              } @else {
                <li>
                  <adm-icon name="reiconBox" [size]="18" />
                  <span class="secondary">Nguồn tồn kho gốc, cập nhật theo thời gian thực</span>
                </li>
              }
            </ul>
          </div>
        </section>

        <section class="section" aria-labelledby="sync-title">
          <header><h2 id="sync-title">Đồng bộ tồn kho</h2></header>
          <div class="frame">
            <ul class="info">
              <li>
                <adm-icon name="reiconRefresh" [size]="18" />
                <span>
                  Mọi biến động từ đơn hàng, điều chỉnh kho hoặc trả hàng ở bất kỳ kênh nào đều được
                  hệ thống tự đẩy tới {{ market() ? 'kênh này' : 'các kênh' }}.
                </span>
              </li>
              <li>
                <adm-icon name="reiconLayers" [size]="18" />
                <span>Dùng chung một số lượng tồn kho với mọi kênh</span>
              </li>
            </ul>
          </div>
        </section>

        @if (market(); as key) {
          <section class="section" aria-labelledby="link-title">
            <header>
              <h2 id="link-title">Liên kết SKU</h2>
            </header>
            @if (!setup()!.connected) {
              <div class="frame">
                <ul class="info">
                  <li>
                    <adm-icon name="reiconLink" [size]="18" />
                    <span class="secondary"
                      >Kết nối {{ ch.name }} để liên kết SKU với sản phẩm trên sàn.</span
                    >
                  </li>
                </ul>
              </div>
            } @else if (loadError()) {
              <adm-empty
                kind="error"
                heading="Không tải được danh sách SKU"
                description="Kiểm tra kết nối rồi thử lại."
              >
                <button type="button" class="adm-btn" (click)="load()">Thử lại</button>
              </adm-empty>
            } @else {
              <div class="frame">
                <ul class="info">
                  <li>
                    <adm-icon name="reiconLink" [size]="18" />
                    <span
                      >Đã liên kết
                      <strong class="num"
                        >{{ linkedCount() | admNum }}/{{ items()?.length ?? 0 | admNum }}</strong
                      >
                      SKU</span
                    >
                  </li>
                </ul>
              </div>
              <nav class="tabs" aria-label="Lọc theo trạng thái liên kết">
                @for (tab of tabs; track tab.value) {
                  <button
                    type="button"
                    [class.is-active]="filter() === tab.value"
                    (click)="filter.set(tab.value); page.set(1)"
                  >
                    {{ tab.label }} <span class="count">{{ counts()[tab.value] | admNum }}</span>
                  </button>
                }
              </nav>
              <div class="affix search link-search">
                <span class="prefix-icon"><adm-icon name="reiconSearch" [size]="16" /></span>
                <input
                  class="input input--sm"
                  type="search"
                  placeholder="Tìm SKU, tên sản phẩm"
                  aria-label="Tìm SKU để liên kết"
                  [ngModel]="search()"
                  (ngModelChange)="search.set($event); page.set(1)"
                />
              </div>
              @if (selection.count()) {
                <div class="bulkbar" role="region" aria-label="Thao tác hàng loạt">
                  <span>Đã chọn {{ selection.count() }} SKU</span>
                  <span class="spacer"></span>
                  <button type="button" class="adm-btn adm-btn--sm" (click)="bulk(key, true)">
                    Liên kết {{ selection.count() }} SKU
                  </button>
                  <button type="button" class="adm-btn adm-btn--sm" (click)="bulk(key, false)">
                    Hủy liên kết {{ selection.count() }} SKU
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
              @if (items() && !rows().length) {
                <adm-empty heading="Không có SKU nào khớp" description="Thử tìm từ khóa khác." />
              } @else {
                <div class="table-wrap">
                  <table class="table table--cards">
                    <thead>
                      <tr>
                        @if (canManage) {
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
                        <th>Mã trên {{ ch.name }}</th>
                        <th>Trạng thái</th>
                        <th><span class="sr-only">Thao tác</span></th>
                      </tr>
                    </thead>
                    @if (!items()) {
                      <tbody [admSkeleton]="8" [columns]="canManage ? 6 : 5"></tbody>
                    } @else {
                      <tbody>
                        @for (row of pageRows(); track row.item.variantId) {
                          <tr [class.is-selected]="selection.has(row.item.variantId)">
                            @if (canManage) {
                              <td class="w-check">
                                <label class="check">
                                  <input
                                    type="checkbox"
                                    [attr.aria-label]="'Chọn ' + row.item.sku"
                                    [checked]="selection.has(row.item.variantId)"
                                    (change)="selection.toggle(row.item.variantId)"
                                  />
                                </label>
                              </td>
                            }
                            <td>
                              <div class="cell-media">
                                <img class="thumb" [src]="row.item.image || placeholder" alt="" />
                                <div>
                                  <span class="cell-title">{{ row.item.productName }}</span>
                                  <div class="cell-sub">
                                    {{ row.item.color.name }} / {{ row.item.size }}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td class="mono" data-label="SKU">{{ row.item.sku }}</td>
                            <td class="mono" data-label="Mã trên sàn">
                              @if (row.linked) {
                                {{ code(row.item.sku, key) }}
                              } @else {
                                <span class="tertiary">—</span>
                              }
                            </td>
                            <td data-label="Trạng thái"><adm-badge [spec]="row.badge" /></td>
                            <td class="row-actions">
                              <button
                                type="button"
                                class="adm-btn adm-btn--sm"
                                [disabled]="!canManage"
                                (click)="toggle(key, row.item, row.linked)"
                              >
                                {{ row.linked ? 'Hủy liên kết' : 'Liên kết' }}
                              </button>
                            </td>
                          </tr>
                        }
                      </tbody>
                    }
                  </table>
                </div>
                <adm-pager
                  [total]="rows().length"
                  [page]="page()"
                  [pageSize]="pageSize()"
                  (pageChange)="page.set($event)"
                  (sizeChange)="pageSize.set($event); page.set(1)"
                />
              }
            }
          </section>
        }
      </div>
    } @else {
      <adm-page-header heading="Cấu hình kênh" back="/admin/inventory" />
      <div class="page-body">
        <adm-empty heading="Không tìm thấy kênh này" description="Quay lại Tồn kho và chọn lại." />
      </div>
    }
  `,
  styles: `
    .page-body {
      display: grid;
      gap: 28px;
      align-content: start;
    }
    .frame {
      padding: 16px;
      border-radius: var(--adm-radius-lg);
      background: var(--adm-muted);
    }
    .info {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
      li {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        adm-icon {
          margin-top: 2px;
          color: var(--adm-text-tertiary);
        }
      }
    }
    .link-search {
      margin: 12px 0;
      max-width: 360px;
    }
    .row-actions {
      width: 1%;
      white-space: nowrap;
      text-align: right;
    }
    .section > header h2 {
      font-size: 20px;
      line-height: 28px;
      font-weight: 500;
      letter-spacing: -0.01em;
    }
    .section > header {
      margin-bottom: 12px;
    }
  `,
})
export class ChannelSetupPage {
  private readonly api = inject(ADMIN_INVENTORY_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  /** Connecting and linking are shop settings: admin only, like the thresholds. */
  protected readonly canManage = inject(AdminSession).can('inventory.thresholds');
  protected readonly placeholder = '/assets/illustrations/shopping_bags.svg';
  private readonly key = routeParam('key');
  protected readonly setups = signal(readSetups());
  protected readonly items = signal<InventoryItem[] | null>(null);
  protected readonly search = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('q') ?? '');
  protected readonly loadError = signal(false);
  protected readonly selection = new Selection<string>();
  protected readonly tabs: { value: LinkFilter; label: string }[] = [
    { value: 'all', label: 'Tất cả' },
    { value: 'unlinked', label: 'Chưa liên kết' },
    { value: 'error', label: 'Lỗi đồng bộ' },
    { value: 'linked', label: 'Đã liên kết' },
  ];
  protected readonly filter = signal<LinkFilter>('all');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);

  protected readonly channel = computed(() => CHANNELS.find((item) => item.key === this.key()));
  protected readonly market = computed<MarketplaceKey | null>(() => {
    const key = this.channel()?.key;
    return key && key !== 'website' ? key : null;
  });
  protected readonly setup = computed(() => {
    const key = this.market();
    return key ? this.setups()[key] : null;
  });
  protected readonly minutes = computed(() => INITIAL_SYNC_MINUTES[this.key() as ChannelKey] || 1);

  protected readonly all = computed(() => {
    const key = this.market();
    const setup = this.setup();
    if (!key || !setup) return [];
    return (this.items() ?? []).map((item) => {
      const stock = channelStock(item.sku, item.available, key, setup);
      const badge: BadgeSpec = !stock.linked
        ? { label: 'Chưa liên kết', tone: 'neutral' }
        : stock.state === 'error'
          ? { label: 'Lỗi đồng bộ', tone: 'critical' }
          : stock.state === 'pending'
            ? { label: 'Chờ đẩy', tone: 'warning' }
            : { label: 'Đã liên kết', tone: 'success' };
      return { item, linked: stock.linked, error: stock.state === 'error', badge };
    });
  });
  protected readonly counts = computed<Record<LinkFilter, number>>(() => {
    const rows = this.all();
    return {
      all: rows.length,
      unlinked: rows.filter((row) => !row.linked).length,
      error: rows.filter((row) => row.error).length,
      linked: rows.filter((row) => row.linked).length,
    };
  });
  protected readonly linkedCount = computed(() => this.all().filter((row) => row.linked).length);
  protected readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const filter = this.filter();
    return this.all().filter(
      (row) =>
        (filter === 'all' ||
          (filter === 'unlinked' ? !row.linked : filter === 'error' ? row.error : row.linked)) &&
        (!term ||
          row.item.sku.toLowerCase().includes(term) ||
          row.item.productName.toLowerCase().includes(term)),
    );
  });
  protected readonly pageRows = computed(() => {
    const size = this.pageSize();
    return this.rows().slice((this.page() - 1) * size, this.page() * size);
  });

  protected readonly ids = computed(() => this.pageRows().map((row) => row.item.variantId));

  protected readonly status = computed<BadgeSpec>(() => {
    const setup = this.setup();
    if (!this.market()) return { label: 'Đang hoạt động', tone: 'success' };
    return setup?.connected
      ? { label: 'Đã kết nối', tone: 'success' }
      : { label: 'Chưa kết nối', tone: 'neutral' };
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(false);
    fetchAllPages((index, pageSize) =>
      this.api.list({
        view: 'all',
        search: '',
        category: '',
        color: '',
        size: '',
        sort: 'name',
        dir: 'asc',
        page: index,
        pageSize,
      }),
    ).subscribe({ next: (items) => this.items.set(items), error: () => this.loadError.set(true) });
  }

  protected code(sku: string, key: MarketplaceKey): string {
    return listingCode(sku, key);
  }

  protected connect(key: MarketplaceKey): void {
    this.patch(key, { connected: true });
    this.toast.show(`Đã kết nối ${this.channel()!.name} (dữ liệu mẫu)`);
  }

  protected disconnect(key: MarketplaceKey): void {
    const name = this.channel()!.name;
    this.dialogs
      .confirm({
        title: `Ngắt kết nối ${name}?`,
        message: 'Tồn kho sẽ ngừng được đẩy lên kênh này. Các SKU đã liên kết được giữ lại.',
        confirmLabel: 'Ngắt kết nối',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.patch(key, { connected: false });
        this.toast.show(`Đã ngắt kết nối ${name}`);
      });
  }

  protected toggle(key: MarketplaceKey, item: InventoryItem, linked: boolean): void {
    if (!linked) return this.setLinks(key, [item.sku], true);
    this.dialogs
      .confirm({
        title: `Hủy liên kết ${item.sku}?`,
        message: `${this.channel()!.name} sẽ không nhận tồn kho của SKU này nữa.`,
        confirmLabel: 'Hủy liên kết',
        danger: true,
      })
      .subscribe((ok) => ok && this.setLinks(key, [item.sku], false));
  }

  /** Every selected SKU at once; unlinking asks first. */
  protected bulk(key: MarketplaceKey, link: boolean): void {
    const ids = this.selection.ids();
    const skus = (this.items() ?? []).filter((item) => ids.has(item.variantId)).map((i) => i.sku);
    if (link) return this.setLinks(key, skus, true);
    this.dialogs
      .confirm({
        title: `Hủy liên kết ${skus.length} SKU?`,
        message: `${this.channel()!.name} sẽ không nhận tồn kho của các SKU này nữa.`,
        confirmLabel: 'Hủy liên kết',
        danger: true,
      })
      .subscribe((ok) => ok && this.setLinks(key, skus, false));
  }

  private setLinks(key: MarketplaceKey, skus: string[], link: boolean): void {
    const links = { ...this.setups()[key].links };
    for (const sku of skus) links[sku] = link;
    this.patch(key, { links });
    this.selection.clear();
    const name = this.channel()!.name;
    const one = skus.length === 1 ? skus[0] : `${skus.length} SKU`;
    this.toast.show(link ? `Đã liên kết ${one} với ${name}` : `Đã hủy liên kết ${one}`);
  }

  private patch(
    key: MarketplaceKey,
    patch: Partial<ReturnType<typeof readSetups>[MarketplaceKey]>,
  ): void {
    const next = { ...this.setups(), [key]: { ...this.setups()[key], ...patch } };
    this.setups.set(next);
    saveSetups(next);
  }
}
