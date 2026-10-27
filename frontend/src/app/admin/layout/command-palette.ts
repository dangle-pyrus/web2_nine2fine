import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, debounceTime, of, switchMap } from 'rxjs';
import { AdminSession } from '../core/admin-session';
import type { Permission } from '../core/permissions';
import { MoneyPipe } from '../core/format.pipes';
import { orderBadge } from '../core/status';
import { ADMIN_SEARCH_API } from '../data-access/admin-apis';
import type { SearchResults } from '../data-access/models';
import { AdmBadge } from '../ui/badge';
import { AdmIcon } from '../ui/icon';
import { GO_TO } from './shortcuts';

interface Hit {
  group: string;
  label: string;
  sub: string;
  link: string;
  image?: string;
  /** Commands show an icon instead of a thumbnail. */
  icon?: string;
  /** Keys shown on the right of a command, e.g. "G O". */
  keys?: string;
  badge?: ReturnType<typeof orderBadge>;
}

interface Command {
  label: string;
  sub: string;
  link: string;
  icon: string;
  permission: Permission | null;
  keys?: string;
}

const COMMANDS: Command[] = [
  {
    label: 'Đơn COD chờ xác nhận',
    sub: 'Gọi khách xác nhận trước khi đóng gói',
    link: '/admin/orders?view=to-confirm',
    icon: 'reiconPhone',
    permission: 'orders.view',
  },
  {
    label: 'Đơn giao không thành công',
    sub: 'Giao lại hoặc hoàn về kho',
    link: '/admin/orders?view=failed',
    icon: 'reiconAlertTriangle',
    permission: 'orders.view',
  },
  {
    label: 'Đánh giá chưa trả lời',
    sub: 'Trả lời hoặc ẩn đánh giá sản phẩm',
    link: '/admin/reviews?view=unanswered',
    icon: 'reiconStar',
    permission: 'products.view',
  },
  {
    label: 'Nội dung trang chủ',
    sub: 'Banner, danh mục và dải sản phẩm',
    link: '/admin/content',
    icon: 'reiconWidget',
    permission: 'products.view',
  },
  {
    label: 'Bảng size',
    sub: 'Số đo theo danh mục',
    link: '/admin/size-charts',
    icon: 'reiconRuler',
    permission: 'products.view',
  },
  {
    label: 'Báo cáo bán hàng',
    sub: 'Theo size, màu, trả hàng, tồn lâu, mã giảm',
    link: '/admin/reports',
    icon: 'reiconChartBar',
    permission: 'dashboard.revenue',
  },
  {
    label: 'Đơn cần chuẩn bị và giao',
    sub: 'Đã xác nhận, chưa bàn giao vận chuyển',
    link: '/admin/orders?view=to-fulfil',
    icon: 'reiconTruck',
    permission: 'orders.view',
  },
  {
    label: 'Đơn chờ thanh toán',
    sub: 'Chuyển khoản chưa đối soát',
    link: '/admin/orders?view=pending-payment',
    icon: 'reiconBill',
    permission: 'orders.view',
  },
  {
    label: 'Yêu cầu trả hàng chờ duyệt',
    sub: 'Khách đang chờ phản hồi',
    link: '/admin/returns?state=pending',
    icon: 'reiconReply',
    permission: 'returns.process',
  },
  {
    label: 'SKU sắp hết hàng',
    sub: 'Tồn kho dưới ngưỡng cảnh báo',
    link: '/admin/inventory?view=low',
    icon: 'reiconBox',
    permission: 'inventory.view',
  },
  {
    label: 'Thêm sản phẩm',
    sub: 'Tạo sản phẩm mới',
    link: '/admin/products/new',
    icon: 'reiconPlus',
    permission: 'products.edit',
  },
  {
    label: 'Tạo mã giảm giá',
    sub: 'Khuyến mãi mới',
    link: '/admin/promotions/new',
    icon: 'reiconTicketSale',
    permission: 'promotions.edit',
  },
  ...GO_TO.map((item) => ({
    label: `Đi tới ${item.label}`,
    sub: 'Mở trang',
    link: item.link,
    icon: 'reiconChevronRight',
    permission: item.permission,
    keys: `G ${item.key.toUpperCase()}`,
  })),
];

const RECENT_KEY = 'n2f.admin.recent';
const RECENT_MAX = 5;

/** Accent- and case-insensitive, so "don can giao" finds "Đơn cần giao". */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

function readRecent(): Hit[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Hit[];
    return Array.isArray(value) ? value.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(hits: Hit[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(hits.slice(0, RECENT_MAX)));
  } catch {
    /* Storage unavailable: recent items last for this page only. */
  }
}

/**
 * Global search (2.2, Ctrl/⌘ K): order ID, customer name/phone, product name, SKU. With an empty
 * box it lists recently opened records and quick commands, so it doubles as a launcher.
 */
@Component({
  selector: 'adm-command-palette',
  imports: [AdmIcon, AdmBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <div class="search">
      <adm-icon name="reiconSearch" />
      <input
        type="search"
        aria-label="Tìm đơn hàng, sản phẩm, khách hàng"
        placeholder="Tìm mã đơn, khách, sản phẩm, SKU hoặc gõ lệnh…"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-results"
        [attr.aria-activedescendant]="hits().length ? 'hit-' + active() : null"
        [value]="term()"
        (input)="term.set($any($event.target).value); active.set(0)"
        (keydown)="onKey($event)"
        autocomplete="off"
      />
      <kbd>Esc</kbd>
    </div>
    <ul id="palette-results" role="listbox" aria-label="Kết quả tìm kiếm">
      @for (hit of hits(); track hit.group + hit.link; let index = $index) {
        @if (index === 0 || hits()[index - 1].group !== hit.group) {
          <li class="group" role="presentation">{{ hit.group }}</li>
        }
        <li
          [id]="'hit-' + index"
          role="option"
          [attr.aria-selected]="index === active()"
          [class.active]="index === active()"
          (mouseenter)="active.set(index)"
          tabindex="-1"
          (click)="go(hit)"
          (keydown.enter)="go(hit)"
        >
          @if (hit.icon) {
            <span class="cmd-icon"><adm-icon [name]="hit.icon" [size]="16" /></span>
          } @else if (hit.image !== undefined) {
            <img class="thumb" [src]="hit.image" alt="" />
          }
          <span class="text">
            <span class="label">{{ hit.label }}</span>
            <span class="sub">{{ hit.sub }}</span>
          </span>
          @if (hit.badge) {
            <adm-badge [spec]="hit.badge" />
          }
          @if (hit.keys) {
            <kbd class="keys">{{ hit.keys }}</kbd>
          }
        </li>
      } @empty {
        <li class="none" role="presentation">
          {{
            term().trim()
              ? loading()
                ? 'Đang tìm…'
                : 'Không tìm thấy kết quả phù hợp.'
              : 'Nhập ít nhất 2 ký tự để tìm.'
          }}
        </li>
      }
    </ul>
  `,
  styles: `
    .search {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 20px;
      height: 60px;
      border-bottom: 1px solid var(--adm-divider);
      color: var(--adm-text-secondary);
    }
    input {
      flex: 1;
      border: 0;
      outline: none;
      background: none;
      font: inherit;
      font-size: 16px;
      color: var(--adm-text);
    }
    input::placeholder {
      color: var(--adm-text-tertiary);
    }
    kbd {
      font-family: inherit;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 6px;
      background: var(--adm-muted);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 8px;
      max-height: min(60vh, 480px);
      overflow-y: auto;
    }
    .group {
      padding: 10px 12px 4px;
      font-size: 12px;
      color: var(--adm-text-tertiary);
    }
    li[role='option'] {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-radius: 12px;
      cursor: pointer;
    }
    li.active {
      background: var(--adm-muted);
    }
    .thumb {
      width: 32px;
      height: 32px;
    }
    .text {
      flex: 1;
      display: grid;
      min-width: 0;
    }
    .label {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sub {
      font-size: 12px;
      line-height: 16px;
      color: var(--adm-text-tertiary);
    }
    .cmd-icon {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: var(--adm-muted);
      color: var(--adm-text-secondary);
    }
    li.active .cmd-icon {
      background: var(--adm-bg);
    }
    .keys {
      flex-shrink: 0;
      color: var(--adm-text-tertiary);
    }
    .none {
      padding: 24px 12px;
      text-align: center;
      color: var(--adm-text-secondary);
    }
  `,
})
export class CommandPalette {
  private readonly ref = inject(DialogRef);
  private readonly router = inject(Router);
  private readonly session = inject(AdminSession);
  private readonly api = inject(ADMIN_SEARCH_API);
  private readonly money = new MoneyPipe();

  readonly term = signal('');
  readonly active = signal(0);
  readonly loading = signal(false);
  private readonly results = signal<SearchResults>({
    orders: [],
    products: [],
    customers: [],
  });

  private readonly recent = signal(readRecent());
  private readonly commands = COMMANDS.filter((command) =>
    command.permission === null
      ? this.session.can('settings.store') ||
        this.session.can('settings.staff') ||
        this.session.can('settings.audit')
      : this.session.can(command.permission),
  ).map<Hit>((command) => ({ ...command, group: 'Lệnh' }));

  readonly hits = computed<Hit[]>(() => {
    const term = fold(this.term().trim());
    if (!term) {
      return [...this.recent().map((hit) => ({ ...hit, group: 'Xem gần đây' })), ...this.commands];
    }
    return [
      ...this.recordHits(),
      ...this.commands.filter((command) => fold(command.label).includes(term)),
    ];
  });

  private readonly recordHits = computed<Hit[]>(() => {
    const { orders, products, customers } = this.results();
    const hits: Hit[] = [];
    if (this.session.can('orders.view')) {
      for (const order of orders) {
        hits.push({
          group: 'Đơn hàng',
          label: `#${order.id}`,
          sub: `${order.customerName}, ${this.money.transform(order.total)}`,
          link: `/admin/orders/${order.id}`,
          badge: orderBadge(order.status),
        });
      }
    }
    if (this.session.can('products.view')) {
      for (const product of products) {
        hits.push({
          group: 'Sản phẩm',
          label: product.name,
          sub: product.sku ? `SKU ${product.sku}` : 'Sản phẩm',
          link: `/admin/products/${product.id}`,
          image: product.image,
        });
      }
    }
    if (this.session.can('customers.view')) {
      for (const customer of customers) {
        hits.push({
          group: 'Khách hàng',
          label: customer.name,
          sub: this.session.can('customers.contact')
            ? `${customer.phone}, ${customer.email}`
            : 'Khách hàng',
          link: `/admin/customers/${customer.id}`,
        });
      }
    }
    return hits;
  });

  constructor() {
    toObservable(this.term)
      .pipe(
        debounceTime(150),
        switchMap((term) => {
          if (term.trim().length < 2) return of({ orders: [], products: [], customers: [] });
          this.loading.set(true);
          return this.api
            .search(term.trim())
            .pipe(catchError(() => of({ orders: [], products: [], customers: [] })));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((results) => {
        this.loading.set(false);
        this.results.set(results);
      });
  }

  onKey(event: KeyboardEvent): void {
    const count = this.hits().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.active.set((this.active() + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active.set((this.active() - 1 + count) % count);
    } else if (event.key === 'Enter' && count) {
      event.preventDefault();
      this.go(this.hits()[this.active()]);
    }
  }

  go(hit: Hit): void {
    // Records (not commands) go to the top of "Xem gần đây"; the order badge is left out as stale.
    if (!hit.icon) {
      const { label, sub, link, image } = hit;
      writeRecent([
        {
          group: 'Xem gần đây',
          label,
          sub,
          link,
          ...(image !== undefined ? { image } : {}),
        },
        ...this.recent().filter((item) => item.link !== link),
      ]);
    }
    this.ref.close();
    void this.router.navigateByUrl(hit.link);
  }
}
