import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminSession } from '../../core/admin-session';
import { DatePipe, NumPipe } from '../../core/format.pipes';
import { promotionBadge, promotionState } from '../../core/status';
import { ADMIN_PROMOTIONS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { Promotion, PromotionQuery, PromotionState } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';
import { AdminToastService } from '../../ui/toast';
import { promotionAudience, promotionSummary } from './promotion-summary';

const VIEWS: { value: PromotionState | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'running', label: 'Đang chạy' },
  { value: 'scheduled', label: 'Đã lên lịch' },
  { value: 'expired', label: 'Đã hết hạn' },
  { value: 'disabled', label: 'Đã tắt' },
];

/** Discount codes (6.6). Enabling/disabling is inline and reversible. */
@Component({
  selector: 'adm-promotion-list-page',
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
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Khuyến mãi">
      <ng-container actions>
        @if (canEdit) {
          <a class="adm-btn adm-btn--primary adm-btn--lg" routerLink="/admin/promotions/new"
            ><adm-icon name="reiconPlus" [size]="16" /> Tạo mã giảm giá</a
          >
        }
      </ng-container>
    </adm-page-header>
    <div class="page-body page-body--wide">
      <nav class="tabs" aria-label="Lọc mã giảm giá">
        @for (item of views; track item.value) {
          <button
            type="button"
            [class.is-active]="query().state === item.value"
            (click)="list.update({ state: item.value })"
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
            placeholder="Mã hoặc tên chương trình"
            aria-label="Tìm mã giảm giá"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
        </div>
      </form>

      @if (view.state().error && !page()) {
        <adm-empty
          kind="error"
          heading="Không tải được khuyến mãi"
          [description]="view.state().error ?? ''"
        >
          <button type="button" class="adm-btn" (click)="view.reload()">Thử lại</button>
        </adm-empty>
      } @else if (page() && !page()!.total) {
        @if (query().search || query().state) {
          <adm-empty
            heading="Không có mã nào phù hợp"
            description="Thử từ khóa khác hoặc xem tất cả."
          >
            <button type="button" class="adm-btn" (click)="search.set(''); list.reset()">
              Xem tất cả
            </button>
          </adm-empty>
        } @else {
          <adm-empty
            kind="first"
            image="/assets/illustrations/shopping_bags.svg"
            heading="Tạo mã giảm giá đầu tiên"
            description="Giảm theo phần trăm, số tiền cố định hoặc miễn phí vận chuyển."
          >
            @if (canEdit) {
              <a class="adm-btn adm-btn--primary" routerLink="/admin/promotions/new"
                >Tạo mã giảm giá</a
              >
            }
          </adm-empty>
        }
      } @else {
        <div class="table-wrap" [class.is-refreshing]="view.state().refreshing">
          <table class="table table--cards">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Trạng thái</th>
                <th>Đối tượng</th>
                <th>Thời gian</th>
                <th class="num">Đã dùng</th>
                @if (canEdit) {
                  <th class="num">Bật</th>
                }
              </tr>
            </thead>
            @if (view.state().loading) {
              <tbody [admSkeleton]="6" [columns]="canEdit ? 6 : 5"></tbody>
            } @else {
              <tbody>
                @for (promo of page()?.items ?? []; track promo.id) {
                  <tr class="clickable" (click)="open(promo, $event)">
                    <td>
                      <a class="cell-title mono" [routerLink]="['/admin/promotions', promo.id]">{{
                        promo.code
                      }}</a>
                      <div class="cell-sub">{{ summary(promo) }}</div>
                    </td>
                    <td data-label="Trạng thái"><adm-badge [spec]="badge(promo)" /></td>
                    <td data-label="Đối tượng">{{ audience(promo) }}</td>
                    <td class="secondary" data-label="Thời gian">
                      {{ promo.startsAt | admDate }} –
                      {{ promo.endsAt ? (promo.endsAt | admDate) : 'không giới hạn' }}
                    </td>
                    <td class="num" data-label="Đã dùng">
                      {{ promo.used | admNum
                      }}{{ promo.usageLimit !== null ? ' / ' + promo.usageLimit : '' }}
                    </td>
                    @if (canEdit) {
                      <td class="num" data-label="Bật">
                        <input
                          type="checkbox"
                          class="toggle"
                          [attr.aria-label]="(promo.enabled ? 'Tắt mã ' : 'Bật mã ') + promo.code"
                          [checked]="promo.enabled"
                          [disabled]="busy() === promo.id"
                          (change)="toggle(promo, $any($event.target).checked)"
                        />
                      </td>
                    }
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
})
export class PromotionListPage {
  private readonly api = inject(ADMIN_PROMOTIONS_API);
  private readonly router = inject(Router);
  private readonly toast = inject(AdminToastService);
  protected readonly canEdit = inject(AdminSession).can('promotions.edit');
  protected readonly views = VIEWS;
  protected readonly list = urlQuery<PromotionQuery>({ state: '', sort: 'createdAt', dir: 'desc' });
  protected readonly query = this.list.query;
  protected readonly view = loader(this.query, (query) => this.api.list(query));
  protected readonly page = this.view.data;
  protected readonly search = signal(this.query().search);
  protected readonly busy = signal<string | null>(null);
  protected readonly summary = promotionSummary;

  badge(promo: Promotion) {
    return promotionBadge(promotionState(promo));
  }

  open(promo: Promotion, event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('a, button, input')) return;
    void this.router.navigate(['/admin/promotions', promo.id]);
  }

  toggle(promo: Promotion, enabled: boolean): void {
    this.busy.set(promo.id);
    this.api.setEnabled(promo.id, enabled).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.view.patch((page) => ({
          ...page,
          items: page.items.map((item) => (item.id === updated.id ? updated : item)),
        }));
        this.toast.show(`${enabled ? 'Đã bật' : 'Đã tắt'} mã ${promo.code}`, {
          undo: () => this.toggle(updated, !enabled),
        });
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.view.reload();
        this.toast.error(errorMessage(error));
      },
    });
  }

  audience(promo: Promotion): string {
    return promotionAudience(promo);
  }
}
