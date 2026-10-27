import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminSession } from '../../core/admin-session';
import { DatePipe, DateTimePipe, NumPipe } from '../../core/format.pipes';
import { ADMIN_STOREFRONT_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type {
  AdminReview,
  ReviewQuery,
  ReviewStats,
  ReviewStatus,
  ReviewView,
} from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader, Selection, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdminToastService } from '../../ui/toast';

const VIEWS: { value: ReviewView; label: string; count?: keyof ReviewStats }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unanswered', label: 'Chưa trả lời', count: 'unanswered' },
  { value: 'low', label: '3 sao trở xuống', count: 'low' },
  { value: 'hidden', label: 'Đã ẩn', count: 'hidden' },
];

const FIT: Record<-1 | 0 | 1, string> = {
  [-1]: 'Chật hơn size',
  0: 'Đúng size',
  1: 'Rộng hơn size',
};

/**
 * Đánh giá sản phẩm (Đợt 3): read, answer and hide shopper reviews. Replies appear on the product
 * page as "Phản hồi từ nine2fine"; hidden reviews disappear from the shop.
 */
@Component({
  selector: 'adm-review-list-page',
  imports: [
    FormsModule,
    RouterLink,
    AdmPageHeader,
    AdmBadge,
    AdmIcon,
    AdmPager,
    AdmEmptyState,
    NumPipe,
    DatePipe,
    DateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Đánh giá sản phẩm">
      @if (stats(); as s) {
        <p subtitle class="secondary small meta-list">
          <span>{{ s.total | admNum }} đánh giá</span>
          <span>Điểm trung bình {{ s.average }}/5</span>
          <span>{{ s.unanswered | admNum }} chưa trả lời</span>
        </p>
      }
    </adm-page-header>
    <div class="page-body page-body--wide">
      <nav class="tabs" aria-label="Lọc đánh giá">
        @for (item of views; track item.value) {
          <button
            type="button"
            [class.is-active]="query().view === item.value"
            (click)="list.update({ view: item.value })"
          >
            {{ item.label }}
            @if (item.count && stats()?.[item.count]) {
              <span class="count">{{ stats()![item.count] }}</span>
            }
          </button>
        }
      </nav>

      @if (selection.count()) {
        <div class="bulkbar" role="region" aria-label="Thao tác hàng loạt">
          <span>Đã chọn {{ selection.count() }} đánh giá</span>
          <span class="spacer"></span>
          <button
            type="button"
            class="adm-btn adm-btn--sm"
            [class.is-busy]="busy()"
            (click)="setStatus([...selection.ids()], 'hidden')"
          >
            <adm-icon name="reiconEyeOff" [size]="16" /> Ẩn
          </button>
          <button
            type="button"
            class="adm-btn adm-btn--sm"
            [class.is-busy]="busy()"
            (click)="setStatus([...selection.ids()], 'published')"
          >
            <adm-icon name="reiconEye" [size]="16" /> Hiện
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
              placeholder="Sản phẩm, khách hoặc nội dung"
              aria-label="Tìm đánh giá"
              [ngModel]="search()"
              (ngModelChange)="search.set($event)"
            />
          </div>
          <select
            class="select select--sm"
            name="rating"
            aria-label="Số sao"
            [ngModel]="query().rating"
            (ngModelChange)="list.update({ rating: +$event })"
          >
            <option [ngValue]="0">Mọi số sao</option>
            @for (star of [5, 4, 3, 2, 1]; track star) {
              <option [ngValue]="star">{{ star }} sao</option>
            }
          </select>
        </form>
      }

      @if (view.state().error && !page()) {
        <adm-empty
          kind="error"
          heading="Không tải được đánh giá"
          [description]="view.state().error ?? ''"
        >
          <button type="button" class="adm-btn" (click)="view.reload()">Thử lại</button>
        </adm-empty>
      } @else if (page() && !page()!.total) {
        <adm-empty
          [heading]="
            query().view === 'unanswered' ? 'Đã trả lời hết đánh giá' : 'Không có đánh giá nào'
          "
          [description]="
            query().view === 'unanswered'
              ? 'Đánh giá mới sẽ hiện ở đây.'
              : 'Thử bỏ bộ lọc hoặc từ khóa.'
          "
        >
          @if (query().view !== 'all' || query().search || query().rating) {
            <button type="button" class="adm-btn" (click)="search.set(''); list.reset()">
              Xem tất cả
            </button>
          }
        </adm-empty>
      } @else if (page(); as data) {
        <label class="check select-all">
          <input
            type="checkbox"
            [checked]="selection.allOf(ids())"
            [indeterminate]="selection.someOf(ids())"
            [disabled]="!canEdit"
            (change)="selection.setAll(ids(), $any($event.target).checked)"
          />
          <span class="small secondary">Chọn cả trang</span>
        </label>
        <ul class="reviews" [class.is-refreshing]="view.state().refreshing">
          @for (review of data.items; track review.id) {
            <li class="review" [class.is-hidden]="review.status === 'hidden'">
              <input
                type="checkbox"
                class="pick"
                [attr.aria-label]="'Chọn đánh giá của ' + review.author"
                [checked]="selection.has(review.id)"
                [disabled]="!canEdit"
                (change)="selection.toggle(review.id)"
              />
              <div class="review-body">
                <div class="review-head">
                  <span class="stars" [attr.aria-label]="review.rating + ' trên 5 sao'"
                    >{{ '★'.repeat(review.rating)
                    }}<span class="off">{{ '★'.repeat(5 - review.rating) }}</span></span
                  >
                  <span class="cell-title">{{ review.title }}</span>
                  @if (review.status === 'hidden') {
                    <adm-badge label="Đã ẩn" tone="neutral" />
                  }
                  @if (review.sample) {
                    <adm-badge label="Dữ liệu mẫu" tone="info" />
                  }
                </div>
                <p>{{ review.body }}</p>
                <p class="small secondary meta-list">
                  <span>{{ review.author }}</span>
                  <span>Size đã mua: {{ review.sizeBought }}</span>
                  <span>{{ fit[review.fit] }}</span>
                  <span>{{ review.date | admDate }}</span>
                </p>
                <a class="product" [routerLink]="['/admin/products', review.productId]">
                  @if (review.productImage) {
                    <img class="thumb thumb--sm" [src]="review.productImage" alt="" />
                  }
                  <span class="small">{{ review.productName }}</span>
                </a>

                @if (editing() === review.id) {
                  <form class="reply-form" (ngSubmit)="reply(review)">
                    <label class="sr-only" [for]="'reply-' + review.id">Phản hồi</label>
                    <textarea
                      class="textarea"
                      rows="3"
                      maxlength="1000"
                      name="reply"
                      [id]="'reply-' + review.id"
                      placeholder="Phản hồi công khai, khách và người mua khác đều thấy"
                      [ngModel]="replyText()"
                      (ngModelChange)="replyText.set($event)"
                    ></textarea>
                    <div class="row">
                      <span class="small tertiary">{{ replyText().length }}/1000</span>
                      <span class="spacer"></span>
                      <button type="button" class="adm-btn adm-btn--sm" (click)="editing.set(null)">
                        Hủy bỏ
                      </button>
                      <button
                        type="submit"
                        class="adm-btn adm-btn--sm adm-btn--primary"
                        [class.is-busy]="busy()"
                        [disabled]="!replyText().trim()"
                      >
                        Đăng phản hồi
                      </button>
                    </div>
                  </form>
                } @else if (review.reply; as answer) {
                  <blockquote class="answer">
                    <p class="small secondary meta-list">
                      <span>Phản hồi của {{ answer.author }}</span>
                      <span>{{ answer.at | admDateTime }}</span>
                    </p>
                    <p>{{ answer.body }}</p>
                  </blockquote>
                }

                @if (canEdit && editing() !== review.id) {
                  <div class="row actions">
                    <button type="button" class="adm-btn adm-btn--sm" (click)="startReply(review)">
                      <adm-icon name="reiconReply" [size]="16" />
                      {{ review.reply ? 'Sửa phản hồi' : 'Trả lời' }}
                    </button>
                    @if (review.reply) {
                      <button
                        type="button"
                        class="adm-btn adm-btn--sm adm-btn--ghost"
                        (click)="removeReply(review)"
                      >
                        Xóa phản hồi
                      </button>
                    }
                    <button
                      type="button"
                      class="adm-btn adm-btn--sm adm-btn--ghost"
                      (click)="
                        setStatus([review.id], review.status === 'hidden' ? 'published' : 'hidden')
                      "
                    >
                      <adm-icon
                        [name]="review.status === 'hidden' ? 'reiconEye' : 'reiconEyeOff'"
                        [size]="16"
                      />
                      {{ review.status === 'hidden' ? 'Hiện lại' : 'Ẩn khỏi cửa hàng' }}
                    </button>
                  </div>
                }
              </div>
            </li>
          }
        </ul>
        <adm-pager
          [total]="data.total"
          [page]="data.page"
          [pageSize]="data.pageSize"
          (pageChange)="list.update({ page: $event })"
          (sizeChange)="list.update({ pageSize: $event })"
        />
      } @else {
        <div class="stack"><span class="sk sk--title"></span><span class="sk"></span></div>
      }
    </div>
  `,
  styles: `
    .select--sm {
      width: auto;
    }
    .select-all {
      margin: 4px 0 8px;
    }
    .reviews {
      list-style: none;
      margin: 0;
      padding: 0;
      transition: opacity 120ms ease-out;
      &.is-refreshing {
        opacity: 0.55;
      }
    }
    .review {
      display: flex;
      gap: 12px;
      padding: 16px 0;
      border-top: 1px solid var(--adm-divider);
      &.is-hidden .review-body > :not(.actions) {
        opacity: 0.55;
      }
    }
    .pick {
      margin-top: 4px;
      width: 16px;
      height: 16px;
      accent-color: var(--adm-primary);
    }
    .review-body {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 6px;
    }
    .review-head {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .stars {
      color: #b45309;
      letter-spacing: 1px;
      .off {
        color: var(--adm-muted-strong);
      }
    }
    .product {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--adm-text-secondary);
      text-decoration: none;
      width: fit-content;
      &:hover span {
        text-decoration: underline;
      }
    }
    .thumb--sm {
      width: 28px;
      height: 28px;
    }
    .answer {
      margin: 4px 0 0;
      padding: 10px 14px;
      border-left: 2px solid var(--adm-primary);
      background: var(--adm-muted);
      border-radius: 0 var(--adm-radius-md) var(--adm-radius-md) 0;
    }
    .reply-form {
      display: grid;
      gap: 8px;
    }
    .actions {
      flex-wrap: wrap;
      margin-top: 4px;
    }
  `,
})
export class ReviewListPage {
  private readonly api = inject(ADMIN_STOREFRONT_API);
  private readonly toast = inject(AdminToastService);
  protected readonly canEdit = inject(AdminSession).can('products.edit');
  protected readonly views = VIEWS;
  protected readonly fit = FIT;
  protected readonly list = urlQuery<ReviewQuery>({ view: 'all', rating: 0, sort: 'date' });
  protected readonly query = this.list.query;
  protected readonly view = loader(this.query, (query) => this.api.reviews(query));
  protected readonly page = this.view.data;
  protected readonly stats = signal<ReviewStats | null>(null);
  protected readonly search = signal(this.query().search);
  protected readonly selection = new Selection<string>();
  protected readonly ids = computed(() => this.page()?.items.map((review) => review.id) ?? []);
  protected readonly busy = signal(false);
  protected readonly editing = signal<string | null>(null);
  protected readonly replyText = signal('');

  constructor() {
    this.refreshStats();
  }

  startReply(review: AdminReview): void {
    this.replyText.set(review.reply?.body ?? '');
    this.editing.set(review.id);
  }

  reply(review: AdminReview): void {
    this.send(review, this.replyText(), review.reply ? 'Đã sửa phản hồi' : 'Đã đăng phản hồi');
  }

  removeReply(review: AdminReview): void {
    this.send(review, '', 'Đã xóa phản hồi');
  }

  setStatus(ids: string[], status: ReviewStatus): void {
    this.busy.set(true);
    this.api.setReviewStatus(ids, status).subscribe({
      next: () => {
        this.busy.set(false);
        this.selection.clear();
        this.toast.show(
          status === 'hidden'
            ? `Đã ẩn ${ids.length} đánh giá khỏi cửa hàng`
            : `Đã hiện lại ${ids.length} đánh giá`,
          { action: { label: 'Hoàn tác', run: () => this.setStatus(ids, flip(status)) } },
        );
        this.view.reload();
        this.refreshStats();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  private send(review: AdminReview, body: string, success: string): void {
    this.busy.set(true);
    this.api.replyReview(review.id, body).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.editing.set(null);
        this.view.patch((page) => ({
          ...page,
          items: page.items.map((item) => (item.id === updated.id ? updated : item)),
        }));
        this.refreshStats();
        this.toast.show(success);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  private refreshStats(): void {
    this.api.reviewStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: () => undefined,
    });
  }
}

function flip(status: ReviewStatus): ReviewStatus {
  return status === 'hidden' ? 'published' : 'hidden';
}
