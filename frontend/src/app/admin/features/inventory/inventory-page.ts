import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, Observable, of } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { AdminSession } from '../../core/admin-session';
import { money } from '../../core/format';
import { NumPipe } from '../../core/format.pipes';
import { ADMIN_INVENTORY_API, ADMIN_PRODUCTS_API } from '../../data-access/admin-apis';
import {
  CHANNELS,
  channelHeld,
  channelStock,
  MARKETPLACES,
  readSetups,
  sampleSyncLog,
  type ChannelKey,
  type ChannelStock,
} from '../../data-access/marketplace-demo';
import { errorMessage } from '../../data-access/http-support';
import type {
  InventoryFacets,
  InventoryItem,
  InventoryQuery,
  InventoryView,
  Page,
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
import { AdjustStockData, AdjustStockDrawer } from './adjust-stock-drawer';
import { QuickReceiveData, QuickReceiveDialog, QuickReceiveResult } from './quick-receive-dialog';
import {
  DefaultThresholdData,
  DefaultThresholdDialog,
  SkuThresholdData,
  SkuThresholdDialog,
} from './threshold-dialogs';

/** The URL also keeps the channel and a sync flag; both are applied here, not by the API. */
type InvQuery = InventoryQuery & { channel: string; flag: string };
type ChipKey = 'search' | 'category' | 'color' | 'size' | 'channel' | 'flag';

const FLAGS: Record<string, string> = {
  error: 'Lỗi đồng bộ',
  zero: 'Về 0 trên kênh',
};

const MARKET_KEYS = MARKETPLACES.map((channel) => channel.key);

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
            class="adm-btn adm-btn--lg adm-btn--primary"
            data-testid="quick-receive"
            (click)="quickReceive()"
          >
            <adm-icon name="reiconPlus" [size]="16" /> Nhập kho nhanh
          </button>
        }
        <button
          type="button"
          class="adm-btn adm-btn--lg"
          data-testid="sync-all"
          [class.is-busy]="syncing()"
          [disabled]="syncing() || !allItems()"
          (click)="syncAll()"
        >
          <adm-icon name="reiconRefresh" [size]="16" />
          {{ syncing() ? 'Đang đồng bộ…' : 'Đồng bộ lại' }}
        </button>
        <button
          type="button"
          class="adm-btn adm-btn--lg"
          data-testid="sync-log-open"
          (click)="logOpen.set(true)"
        >
          <adm-icon name="reiconHistory" [size]="16" /> Nhật ký đồng bộ
        </button>
        @if (canThresholds) {
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
      @if (loadError()) {
        <div class="banner banner--critical demo-banner" role="alert">
          <adm-icon name="reiconAlertCircle" [size]="20" />
          <div class="banner-body">
            <p class="banner-title">Không tải được số liệu các kênh</p>
          </div>
          <button type="button" class="adm-btn adm-btn--sm banner-action" (click)="loadAll()">
            Thử lại
          </button>
        </div>
      } @else if (errors().count && query().flag !== 'error') {
        <div class="banner banner--warning demo-banner" role="alert" data-testid="sync-errors">
          <adm-icon name="reiconAlertTriangle" [size]="20" />
          <div class="banner-body">
            <p class="banner-title">
              {{ errors().count }} SKU trên {{ errors().names.join(', ') }} đang hiện sai số lượng
            </p>
          </div>
          <button
            type="button"
            class="adm-btn adm-btn--sm banner-action"
            (click)="list.update({ flag: 'error' })"
          >
            Xem SKU lỗi
          </button>
        </div>
      }
      <div class="channels" data-testid="channel-cards">
        @for (card of channelCards(); track card.key) {
          <a
            class="ch-card"
            [routerLink]="['/admin/inventory/channels', card.key]"
            [attr.aria-label]="card.name + ': ' + card.status.label"
          >
            <img class="ch-logo ch-logo--card" [src]="card.logo" [alt]="card.name" />
            <dl class="ch-stats">
              <div>
                <dt class="small tertiary">SKU</dt>
                <dd class="num">{{ card.skus === null ? '—' : (card.skus | admNum) }}</dd>
              </div>
              <div>
                <dt class="small tertiary">Trạng thái</dt>
                <dd><adm-badge [spec]="card.status" /></dd>
              </div>
            </dl>
          </a>
        }
      </div>

      <div class="ch-bar">
        <div class="segmented" role="group" aria-label="Kênh bán">
          @for (item of channelTabs; track item.key) {
            <button
              type="button"
              [class.is-active]="channel() === item.key"
              [attr.aria-pressed]="channel() === item.key"
              (click)="setChannel(item.key)"
            >
              {{ item.label }}
            </button>
          }
        </div>
        <span class="spacer"></span>
        @if (zeroCount() && query().flag !== 'zero') {
          <button type="button" class="adm-btn adm-btn--sm" (click)="list.update({ flag: 'zero' })">
            {{ zeroCount() }} SKU còn hàng nhưng về 0 trên kênh
          </button>
        }
      </div>

      <div class="kpis inv-kpis" data-testid="inventory-kpis">
        @for (kpi of kpis(); track kpi.key) {
          @if (kpi.view; as target) {
            <button
              type="button"
              class="kpi-btn"
              [attr.data-testid]="'inv-kpi-' + kpi.key"
              [attr.aria-pressed]="query().view === target"
              (click)="list.update({ view: query().view === target ? 'all' : target })"
            >
              <span class="kpi-label">{{ kpi.label }}</span>
              <span class="kpi-value num" [class.bad]="kpi.bad">{{ kpi.value }}</span>
            </button>
          } @else {
            <div [attr.data-testid]="'inv-kpi-' + kpi.key">
              <p class="kpi-label">{{ kpi.label }}</p>
              <p class="kpi-value num" [class.bad]="kpi.bad">{{ kpi.value }}</p>
            </div>
          }
        }
      </div>

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
        @if (!contract) {
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
        }
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
        } @else if (channelEmpty(); as empty) {
          <adm-empty [heading]="empty.heading" [description]="empty.description">
            <a class="adm-btn adm-btn--primary" [routerLink]="empty.link">{{ empty.action }}</a>
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
                @if (canThresholds) {
                  <th class="w-check" rowspan="2">
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
                <th rowspan="2">Sản phẩm</th>
                <th rowspan="2">Trạng thái</th>
                <th rowspan="2" class="num">Trong kho</th>
                <th
                  class="held-group"
                  scope="colgroup"
                  [attr.colspan]="shownChannels().length"
                  title="Giữ cho đơn chưa giao, theo kênh bán"
                >
                  Đang giữ
                </th>
                <th rowspan="2" class="num">Có thể bán</th>
                <th rowspan="2" class="num">Ngưỡng</th>
              </tr>
              <tr class="held-row">
                @for (ch of shownChannels(); track ch.key) {
                  <th
                    class="ch-col"
                    scope="col"
                    [class.ch-off]="!isConnected(ch.key)"
                    [attr.title]="isConnected(ch.key) ? ch.name : ch.name + ': chưa kết nối'"
                  >
                    <img class="ch-logo" [src]="ch.logo" [alt]="ch.name" />
                  </th>
                }
              </tr>
            </thead>
            @if (view.state().loading) {
              <tbody
                [admSkeleton]="10"
                [columns]="(canThresholds ? 6 : 5) + shownChannels().length"
              ></tbody>
            } @else {
              <tbody>
                @for (item of page()?.items ?? []; track item.variantId) {
                  <tr
                    class="is-clickable"
                    tabindex="0"
                    [class.is-selected]="selection.has(item.variantId)"
                    (click)="open(item, $event)"
                    [attr.aria-label]="
                      'Xem tồn kho ' + item.productName + ' ' + item.color.name + '/' + item.size
                    "
                    (keydown.enter)="openByKey(item, $event)"
                    (keydown.space)="openByKey(item, $event)"
                  >
                    @if (canThresholds) {
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
                        <img class="thumb" [src]="item.image || placeholder" alt="" />
                        <div>
                          <span class="cell-title">{{ item.productName }}</span>
                          <div class="cell-sub">
                            <span class="swatch" [style.background]="item.color.hex"></span>
                            {{ item.color.name }} / {{ item.size }}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Trạng thái"><adm-badge [spec]="status[item.status]" /></td>
                    <td class="num" data-label="Trong kho">{{ item.onHand | admNum }}</td>
                    @for (ch of shownChannels(); track ch.key) {
                      @let held = heldFor(item, ch.key);
                      <td
                        class="ch-cell"
                        [attr.data-label]="'Đang giữ · ' + ch.name"
                        [class.tertiary]="!held"
                      >
                        {{ isConnected(ch.key) ? (held | admNum) : '—' }}
                      </td>
                    }
                    <td class="num strong" data-label="Có thể bán">
                      {{ sellable(item) | admNum }}
                      @if (syncIssue(item); as issue) {
                        <span class="sync-flag" [attr.title]="issue">
                          <i class="sync-dot" data-state="error" aria-hidden="true"></i>
                          <span class="sr-only">{{ issue }}</span>
                        </span>
                      }
                    </td>
                    <td class="num" data-label="Ngưỡng">{{ item.lowStockThreshold | admNum }}</td>
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

    @if (logOpen()) {
      <div class="log-scrim" (click)="logOpen.set(false)" aria-hidden="true"></div>
      <aside
        class="log-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-title"
        data-testid="sync-log"
        (keydown.escape)="logOpen.set(false)"
      >
        <header class="log-head">
          <div>
            <h2 id="log-title">Nhật ký đồng bộ</h2>
            <p class="small tertiary">Dữ liệu mẫu, kết nối sàn đang ở chế độ demo</p>
          </div>
          <button
            type="button"
            class="adm-btn adm-btn--icon adm-btn--ghost adm-btn--sm"
            aria-label="Đóng nhật ký"
            (click)="logOpen.set(false)"
          >
            <adm-icon name="reiconX" [size]="16" />
          </button>
        </header>
        <ol class="log-list">
          @for (entry of syncLog(); track entry.id) {
            <li [class.failed]="!entry.ok">
              <img class="ch-logo ch-logo--log" [src]="channelLogo(entry.channel)" alt="" />
              <div class="log-text">
                <p>
                  <span class="mono">{{ entry.sku }}</span>
                  <span class="secondary">{{ entry.change }}</span>
                </p>
                <p class="small" [class.bad]="!entry.ok" [class.tertiary]="entry.ok">
                  {{ entry.ok ? '' : 'Lỗi: ' }}{{ entry.message }} · {{ entry.ago }} phút trước
                </p>
                @if (!entry.ok) {
                  <p class="small">
                    <a
                      class="link"
                      [routerLink]="['/admin/inventory/channels', entry.channel]"
                      [queryParams]="entry.channel === 'tiktok' ? null : { q: entry.sku }"
                      >{{ entry.channel === 'tiktok' ? 'Kết nối lại' : 'Liên kết SKU' }}</a
                    >
                    @if (variantOf(entry.sku); as id) {
                      <button type="button" class="link" (click)="viewSku(id)">Xem SKU</button>
                    }
                  </p>
                }
              </div>
            </li>
          }
        </ol>
      </aside>
    }
  `,
  styles: `
    .strong {
      font-weight: 600;
    }
    .cell-sub .swatch {
      width: 10px;
      height: 10px;
    }
    /* ---------- Multichannel (demo, 2026-11-15) ---------- */
    .demo-banner {
      margin-bottom: 16px;
    }
    .channels {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .ch-card {
      display: grid;
      gap: 16px;
      align-content: start;
      padding: 16px;
      border-radius: 14px;
      background: var(--adm-raised);
      color: inherit;
      text-decoration: none;
      box-shadow:
        0 0 0 1px var(--adm-divider),
        0 1px 2px rgba(0, 0, 0, 0.03);
      transition: box-shadow 120ms ease-out;
      &:hover {
        box-shadow:
          0 0 0 1px var(--adm-text-tertiary),
          0 1px 2px rgba(0, 0, 0, 0.03);
      }
    }
    .ch-logo {
      height: 18px;
      max-width: 96px;
      object-fit: contain;
      vertical-align: middle;
    }
    .ch-stats {
      display: flex;
      gap: 32px;
      margin: 0;
      dd {
        margin: 4px 0 0;
        font-size: 20px;
        line-height: 28px;
        font-weight: 600;
      }
    }
    .ch-logo--card {
      height: 28px;
      max-width: 128px;
    }
    .ch-logo--log {
      width: 72px;
      height: 16px;
      margin: 4px 8px 0 0;
      flex-shrink: 0;
      object-position: left center;
    }
    .bad {
      color: var(--adm-critical-fg);
    }
    tr.is-clickable {
      cursor: pointer;
    }
    .ch-bar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .kpi-btn {
      width: 100%;
      border-style: solid;
      border-color: var(--adm-divider);
      border-width: 0 0 0 1px;
      background: none;
      font: inherit;
      text-align: left;
      cursor: pointer;
      &:hover .kpi-value {
        text-decoration: underline;
        text-underline-offset: 4px;
      }
    }
    .kpi-btn span {
      display: block;
    }
    .ch-off .ch-logo {
      opacity: 0.4;
    }
    .inv-kpis {
      margin-bottom: 8px;
      .kpi-value.bad {
        color: var(--adm-critical-fg);
      }
    }
    .ch-col,
    .ch-cell {
      white-space: nowrap;
      text-align: center;
    }
    .held-group {
      text-align: center;
    }
    /* Sticky header: the logo row sits under the 40px "Đang giữ" row. */
    .table-wrap > .table thead tr.held-row th {
      top: 40px;
      height: 36px;
    }
    .ch-col .ch-logo {
      display: block;
      margin: 0 auto;
      height: 16px;
      max-width: 72px;
    }
    .sync-flag {
      display: inline-flex;
      margin-left: 6px;
      vertical-align: middle;
    }
    .ch-qty {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .sync-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--adm-success-fg);
      &[data-state='pending'] {
        background: #d97706;
      }
      &[data-state='error'] {
        background: var(--adm-critical-fg);
      }
    }
    .log-scrim {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: rgba(0, 0, 0, 0.32);
    }
    .log-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 100;
      width: min(420px, 100vw);
      display: flex;
      flex-direction: column;
      background: var(--adm-raised);
      box-shadow: var(--adm-shadow-lg);
    }
    .log-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 20px;
      border-bottom: 1px solid var(--adm-divider);
      h2 {
        font-size: 16px;
        line-height: 24px;
      }
    }
    .log-list {
      list-style: none;
      margin: 0;
      padding: 8px 20px 24px;
      overflow-y: auto;
      li {
        display: flex;
        align-items: flex-start;
        gap: 4px;
        padding: 12px 0;
        border-bottom: 1px solid var(--adm-divider);
      }
      li.failed {
        background: linear-gradient(90deg, var(--adm-critical-bg), transparent 70%);
      }
      p {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
      }
    }
    .log-text {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
  `,
})
export class InventoryPage {
  private readonly api = inject(ADMIN_INVENTORY_API);
  private readonly productsApi = inject(ADMIN_PRODUCTS_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private drawerRef: DialogRef<InventoryItem> | null = null;
  private destroyed = false;
  protected readonly canAdjust = inject(AdminSession).can('inventory.adjust');
  /** Only an admin changes thresholds (S6-Q2); staff see them. */
  protected readonly canThresholds = inject(AdminSession).can('inventory.thresholds');
  /** Slice 6: the list runs on the API (fixed order). */
  protected readonly contract = inject(API_CONFIG).adminCatalogMode === 'http';
  protected readonly placeholder = '/assets/illustrations/shopping_bags.svg';
  protected readonly views = VIEWS;
  protected readonly sorts = SORTS;
  protected readonly status = STATUS;
  protected readonly list = urlQuery<InvQuery>({
    view: 'all',
    category: '',
    color: '',
    size: '',
    channel: '',
    flag: '',
    sort: 'available',
    dir: 'asc',
  });
  protected readonly query = this.list.query;
  protected readonly view = loader(this.query, (query) => this.fetchRows(query));
  protected readonly page = this.view.data;
  protected readonly search = signal(this.query().search);
  protected readonly total = computed(() => this.page()?.total ?? 0);
  protected readonly facets = signal<InventoryFacets | null>(null);
  protected readonly selection = new Selection<string>();
  protected readonly ids = computed(() => (this.page()?.items ?? []).map((item) => item.variantId));
  protected readonly filtered = computed(() => {
    const { view, search, category, color, size, channel, flag } = this.query();
    return view !== 'all' || !!search || !!category || !!color || !!size || !!channel || !!flag;
  });
  protected readonly chips = computed(() => {
    const { search, category, color, size, flag } = this.query();
    const chips: { key: ChipKey; label: string }[] = [];
    const channel = this.channel();
    if (channel !== 'all')
      chips.push({
        key: 'channel',
        label: `Kênh: ${CHANNELS.find((c) => c.key === channel)!.name}`,
      });
    if (flag && FLAGS[flag]) chips.push({ key: 'flag', label: FLAGS[flag] });
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

  // ---------- Multichannel view (marketplace figures are DEMO data, see marketplace-demo.ts) ----------
  protected readonly channels = CHANNELS;
  protected readonly channelTabs: { key: 'all' | ChannelKey; label: string }[] = [
    { key: 'all', label: 'Tất cả kênh' },
    ...CHANNELS.map((channel) => ({ key: channel.key, label: channel.name })),
  ];
  protected readonly marketplaces = MARKETPLACES;
  protected readonly channel = computed<'all' | ChannelKey>(() => {
    const key = this.query().channel;
    return CHANNELS.some((channel) => channel.key === key) ? (key as ChannelKey) : 'all';
  });
  protected readonly loadError = signal(false);
  protected readonly logOpen = signal(false);
  protected readonly syncing = signal(false);
  /** Set after "Đồng bộ lại" in this visit: pending pushes are done (sample). */
  private readonly flushed = signal(false);
  /** Connection and SKU links saved on each channel's setup page (demo). */
  private readonly setups = signal(readSetups());
  /** Every SKU (no filter), for the KPI strip, the channel cards and the drawer. */
  protected readonly allItems = signal<InventoryItem[] | null>(null);
  /** Selling price per product, for "Giá trị tồn". */
  private readonly prices = signal<Map<string, number>>(new Map());

  protected readonly shownChannels = computed(() => {
    const channel = this.channel();
    return channel === 'all' ? CHANNELS : CHANNELS.filter((item) => item.key === channel);
  });

  protected isConnected(key: ChannelKey): boolean {
    return key === 'website' || this.setups()[key].connected;
  }

  protected setChannel(key: 'all' | ChannelKey): void {
    this.list.update({ channel: key === 'all' ? '' : key });
  }

  /** Channel and sync filters run here on every SKU, since the API only knows the stock itself. */
  private matches(item: InventoryItem, query: InvQuery): boolean {
    const market = MARKET_KEYS.find((key) => key === query.channel);
    if (market && !this.stockFor(item, market).linked) return false;
    if (!query.flag) return true;
    const keys = market ? [market] : MARKET_KEYS;
    return keys.some((key) => {
      const stock = this.stockFor(item, key);
      return query.flag === 'error'
        ? stock.state === 'error'
        : stock.linked && stock.listed === 0 && item.available > 0;
    });
  }

  private allMatching(query: InvQuery): Observable<InventoryItem[]> {
    return fetchAllPages((index, pageSize) =>
      this.api.list({ ...query, page: index, pageSize }),
    ).pipe(map((items) => items.filter((item) => this.matches(item, query))));
  }

  private fetchRows(query: InvQuery): Observable<Page<InventoryItem>> {
    const market = !!query.channel && query.channel !== 'website';
    if (!market && !query.flag) return this.api.list(query);
    const { page, pageSize } = query;
    return this.allMatching(query).pipe(
      map((items) => ({
        items: items.slice((page - 1) * pageSize, page * pageSize),
        total: items.length,
        page,
        pageSize,
      })),
    );
  }

  /** Units held by unshipped orders of one channel (marketplaces: sample figures). */
  protected heldFor(item: InventoryItem, channel: ChannelKey): number {
    return channelHeld(
      item.sku,
      channel,
      item,
      channel === 'website' ? undefined : this.setups()[channel],
    );
  }

  /** One stock for every channel: on hand minus what every channel's orders hold. */
  protected sellable(item: InventoryItem): number {
    const held = MARKETPLACES.reduce((sum, ch) => sum + this.heldFor(item, ch.key), 0);
    return Math.max(0, item.available - held);
  }

  /** A short note when a marketplace shows another number than "Có thể bán". */
  protected syncIssue(item: InventoryItem): string {
    const names = MARKETPLACES.filter((ch) => this.stockFor(item, ch.key).state === 'error').map(
      (ch) => ch.name,
    );
    return names.length ? `Lệch số trên ${names.join(', ')}` : '';
  }

  protected stockFor(item: InventoryItem, channel: ChannelKey): ChannelStock {
    const stock = channelStock(
      item.sku,
      this.sellable(item),
      channel,
      channel === 'website' ? undefined : this.setups()[channel],
    );
    return stock.state === 'pending' && this.flushed()
      ? { ...stock, listed: stock.expected, state: 'synced' }
      : stock;
  }

  protected readonly channelCards = computed(() => {
    const items = this.allItems() ?? [];
    return CHANNELS.map((channel) => {
      let status: BadgeSpec = { label: 'Đang hoạt động', tone: 'success' };
      if (channel.key !== 'website') {
        const stocks = items.map((item) => this.stockFor(item, channel.key));
        status = !this.setups()[channel.key].connected
          ? { label: 'Chưa kết nối', tone: 'neutral' }
          : stocks.some((stock) => stock.state === 'error')
            ? { label: 'Lỗi đồng bộ', tone: 'critical' }
            : { label: 'Đã kết nối', tone: 'success' };
      }
      const skus = !this.allItems()
        ? null
        : channel.key === 'website'
          ? items.length
          : items.filter((item) => this.stockFor(item, channel.key).linked).length;
      return { ...channel, status, skus };
    });
  });

  protected readonly errors = computed(() => {
    const items = this.allItems() ?? [];
    const query = { ...this.query(), flag: 'error' };
    const only = this.channel();
    return {
      count: items.filter((item) => this.matches(item, query)).length,
      names: MARKETPLACES.filter(
        (ch) =>
          (only === 'all' || only === ch.key) &&
          items.some((item) => this.stockFor(item, ch.key).state === 'error'),
      ).map((ch) => ch.name),
    };
  });

  protected readonly zeroCount = computed(() => {
    const query = { ...this.query(), flag: 'zero' };
    return (this.allItems() ?? []).filter((item) => this.matches(item, query)).length;
  });

  /** A channel with nothing to show because it is not connected or has no linked SKU. */
  protected readonly channelEmpty = computed(() => {
    const key = this.channel();
    if (key === 'all' || key === 'website') return null;
    const name = CHANNELS.find((c) => c.key === key)!.name;
    const link = ['/admin/inventory/channels', key];
    if (!this.setups()[key].connected)
      return {
        heading: `${name} chưa kết nối`,
        description: 'Kết nối kênh để đẩy tồn kho lên sàn.',
        action: 'Kết nối kênh',
        link,
      };
    const items = this.allItems();
    if (items && !items.some((item) => this.stockFor(item, key).linked))
      return {
        heading: `Chưa có SKU nào liên kết với ${name}`,
        description: 'Liên kết SKU để tồn kho được đẩy lên kênh.',
        action: 'Liên kết SKU',
        link,
      };
    return null;
  });

  protected readonly kpis = computed<
    { key: string; label: string; value: string; bad: boolean; view?: InventoryView }[]
  >(() => {
    const items = this.allItems();
    const channel = this.channel();
    const prices = this.prices();
    const dash = '—';
    const labels = {
      onHand: 'Trong kho',
      skus: 'Số lượng SKU',
      low: 'SKU sắp hết',
      out: 'Hết hàng',
      value: 'Giá trị tồn (giá bán)',
    };
    if (!items)
      return Object.entries(labels).map(([key, label]) => ({
        key,
        label,
        value: dash,
        bad: false,
      }));
    // Real stock (what is in the warehouse); a channel only narrows which SKUs count.
    const scoped =
      channel === 'all' ? items : items.filter((item) => this.stockFor(item, channel).linked);
    const fmt = (value: number) => value.toLocaleString('vi-VN');
    const out = scoped.filter((item) => item.status === 'out').length;
    const value = scoped.reduce(
      (sum, item) => sum + item.onHand * (prices.get(item.productId) ?? 0),
      0,
    );
    return [
      {
        key: 'onHand',
        label: labels.onHand,
        value: fmt(scoped.reduce((sum, item) => sum + item.onHand, 0)),
        bad: false,
      },
      {
        key: 'skus',
        label: labels.skus,
        value: channel === 'all' ? fmt(items.length) : `${fmt(scoped.length)}/${fmt(items.length)}`,
        bad: false,
      },
      {
        key: 'low',
        label: labels.low,
        value: fmt(scoped.filter((item) => item.status === 'low').length),
        bad: false,
        view: 'low',
      },
      { key: 'out', label: labels.out, value: fmt(out), bad: out > 0, view: 'out' },
      { key: 'value', label: labels.value, value: prices.size ? money(value) : dash, bad: false },
    ];
  });

  protected readonly syncLog = computed(() =>
    sampleSyncLog(
      (this.allItems() ?? [])
        .slice(0, 40)
        .map((item) => ({ sku: item.sku, available: item.available })),
    ),
  );

  protected syncTitle(stock: ChannelStock): string {
    if (stock.state === 'error')
      return `Lỗi đồng bộ: sàn đang hiện ${stock.listed}, đúng ra là ${stock.expected} (mẫu)`;
    if (stock.state === 'pending') return `Đang chờ đẩy: sẽ thành ${stock.expected} (mẫu)`;
    return 'Đã đồng bộ (mẫu)';
  }

  protected channelLogo(key: ChannelKey): string {
    return CHANNELS.find((channel) => channel.key === key)!.logo;
  }

  /**
   * The server already pushes every change to every channel, so this is only the fallback: it
   * retries what is still pending or failed. Sample: waits 1–2 seconds, then says so.
   */
  protected syncAll(): void {
    const items = this.allItems() ?? [];
    const on = MARKETPLACES.filter((ch) => this.setups()[ch.key].connected);
    if (!on.length) {
      this.toast.error('Chưa có kênh nào kết nối');
      return;
    }
    const pushed = items.filter((item) =>
      on.some((ch) => this.stockFor(item, ch.key).state === 'pending'),
    ).length;
    this.syncing.set(true);
    const timer = setTimeout(
      () => {
        this.syncing.set(false);
        this.flushed.set(true);
        this.view.reload();
        const failed = on
          .map((ch) => ({
            name: ch.name,
            n: items.filter((item) => this.stockFor(item, ch.key).state === 'error').length,
          }))
          .filter((entry) => entry.n);
        const skipped = MARKETPLACES.length - on.length;
        const text =
          `Đã đẩy ${pushed} SKU` + (skipped ? `, bỏ qua ${skipped} kênh chưa kết nối` : '') + '.';
        if (failed.length)
          this.toast.error(
            `${text} Còn lỗi: ${failed.map((entry) => `${entry.n} SKU ở ${entry.name}`).join(', ')}.`,
          );
        else this.toast.show(text);
      },
      1000 + Math.round(Math.random() * 1000),
    );
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  private readonly destroyRef = inject(DestroyRef);

  protected loadAll(): void {
    this.loadError.set(false);
    fetchAllPages((index, pageSize) =>
      this.api.list({
        view: 'all',
        search: '',
        category: '',
        color: '',
        size: '',
        sort: 'available',
        dir: 'asc',
        page: index,
        pageSize,
      }),
    ).subscribe({
      next: (items) => this.allItems.set(items),
      error: () => this.loadError.set(true),
    });
  }

  private loadPrices(): void {
    fetchAllPages((index, pageSize) =>
      this.productsApi.list({
        view: 'all',
        category: '',
        search: '',
        sort: 'name',
        dir: 'asc',
        page: index,
        pageSize,
      }),
    ).subscribe({
      next: (products) =>
        this.prices.set(new Map(products.map((product) => [product.id, product.price]))),
      error: () => undefined,
    });
  }

  constructor() {
    this.loadAll();
    this.loadPrices();
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.drawerRef?.close();
    });
    // `?sku=<variantId>`: the stock drawer is open on that SKU.
    const openSku = toSignal(
      this.route.queryParamMap.pipe(map((params) => params.get('sku') ?? '')),
      {
        requireSync: true,
      },
    );
    effect(() => {
      const sku = openSku();
      const items = this.allItems();
      untracked(() => {
        if (!sku) {
          this.drawerRef?.close();
          return;
        }
        if (this.drawerRef || !items) return;
        const item = items.find((entry) => entry.variantId === sku);
        if (item) this.showDrawer(item);
        else {
          this.toast.error('Không tìm thấy SKU');
          void this.setOpen(null);
        }
      });
    });
    // Tab counts follow the search / category / colour / size filters (not the status tab).
    effect(() => {
      const { search, category, color, size } = this.query();
      untracked(() => this.loadFacets({ search, category, color, size }));
    });
  }

  removeChip(key: ChipKey): void {
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

  protected variantOf(sku: string): string | undefined {
    return this.allItems()?.find((item) => item.sku === sku)?.variantId;
  }

  protected viewSku(id: string): void {
    this.logOpen.set(false);
    void this.setOpen(id);
  }

  protected openByKey(item: InventoryItem, event: Event): void {
    if ((event.target as HTMLElement).closest('a,button,input,label')) return;
    event.preventDefault();
    this.open(item, event);
  }

  /** A row opens its SKU in the drawer; clicks on the checkbox do not. */
  open(item: InventoryItem, event: Event): void {
    if ((event.target as HTMLElement).closest('a,button,input,label')) return;
    void this.setOpen(item.variantId);
  }

  private setOpen(sku: string | null): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sku },
      queryParamsHandling: 'merge',
    });
  }

  private showDrawer(item: InventoryItem): void {
    const ref = this.dialogs.drawer<AdjustStockData, InventoryItem>(
      AdjustStockDrawer,
      {
        item,
        canAdjust: this.canAdjust,
        canThresholds: this.canThresholds,
        channels: CHANNELS.map((channel) => {
          const stock = this.stockFor(item, channel.key);
          return {
            key: channel.key,
            name: channel.name,
            logo: channel.logo,
            linked: stock.linked,
            connected: stock.connected,
            listed: stock.listed,
            expected: stock.expected,
            state: stock.state,
            note: this.explain(this.sellable(item)),
          };
        }),
        marketHeld: item.available - this.sellable(item),
        editThreshold: () => this.editThreshold(item),
      },
      true,
    );
    this.drawerRef = ref;
    ref.closed.subscribe((updated) => {
      this.drawerRef = null;
      if (this.destroyed) return;
      void this.setOpen(null).then(() => {
        if (!updated) return;
        this.refresh();
        this.toast.show(`Đã cập nhật tồn kho ${updated.sku}: còn ${updated.onHand}`);
      });
    });
  }

  /** Every channel shows the same "Có thể bán". */
  private explain(available: number): string {
    return `= ${available} có thể bán`;
  }

  /** Nhập kho nhanh: many SKUs at once, by hand or from a CSV / Excel file. */
  quickReceive(): void {
    const items = this.allItems();
    if (!items) {
      this.toast.error('Đang tải danh sách SKU, thử lại sau giây lát');
      return;
    }
    this.dialogs
      .modal<QuickReceiveData, QuickReceiveResult>(QuickReceiveDialog, { items }, [
        'adm-modal-panel',
        'adm-modal-panel--wide',
      ])
      .closed.subscribe((result) => {
        if (!result) return;
        if (result.done) this.refresh();
        const text = `Đã nhập ${result.units.toLocaleString('vi-VN')} sản phẩm vào ${result.done} SKU`;
        if (result.failed.length)
          this.toast.error(
            `${text}. Lỗi ${result.failed.length} SKU: ${result.failed
              .slice(0, 3)
              .map((entry) => `${entry.label} (${entry.message})`)
              .join('; ')}${result.failed.length > 3 ? '…' : ''}`,
          );
        else this.toast.show(text);
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
        const rows = scope === 'page' ? of(page.items) : this.allMatching(this.query());
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
                ...CHANNELS.map((ch) => `Đang giữ (${ch.name})`),
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
                ...CHANNELS.map((ch) => this.heldFor(item, ch.key)),
                this.sellable(item),
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
    this.loadAll();
    const { search, category, color, size } = this.query();
    this.loadFacets({ search, category, color, size });
  }

  private loadFacets(
    filters: Pick<InventoryQuery, 'search' | 'category' | 'color' | 'size'>,
  ): void {
    this.api.facets(filters).subscribe({
      next: (facets) => this.facets.set(facets),
      error: () => this.facets.set(null),
    });
  }
}
