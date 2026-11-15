import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminSession } from '../../core/admin-session';
import { DatePipe, DateTimePipe, NumPipe } from '../../core/format.pipes';
import {
  ADMIN_REVIEWS_API,
  type AdminReview,
  type AdminReviewCounts,
  type AdminReviewQuery,
  type AdminReviewView,
} from '../../data-access/content-api';
import { errorMessage } from '../../data-access/http-support';
import { AdminApiError, type PageQuery } from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader, urlQuery } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { ReasonDialog, ReasonDialogData } from '../../ui/reason-dialog';
import { AdminToastService } from '../../ui/toast';
import { mediaSrc } from './media-picker';

/** "Chưa trả lời" first and by default: the screen opens as a to-do inbox (2026-11-15). */
const VIEWS: { value: AdminReviewView; label: string; count: keyof AdminReviewCounts }[] = [
  { value: 'unanswered', label: 'Chưa trả lời', count: 'unanswered' },
  { value: 'low', label: '1–2 sao', count: 'low' },
  { value: 'all', label: 'Tất cả', count: 'all' },
  { value: 'hidden', label: 'Đã ẩn', count: 'hidden' },
];

const REPLY_MIN = 5;
const REPLY_MAX = 500;
const PAGE_SIZES = [20, 50] as const;

const FIT: Record<-1 | 0 | 1, string> = {
  [-1]: 'Chật hơn size',
  0: 'Đúng size',
  1: 'Rộng hơn size',
};

type ReviewListQuery = PageQuery & { view: AdminReviewView; rating: number };

/**
 * Kiểm duyệt đánh giá (Slice 10, BR-REV-07): read, answer, hide and show shopper reviews. Replies
 * appear on the product page as "Phản hồi từ nine2fine"; hidden reviews leave the shop and its
 * average. Every write carries the review's `updatedAt`; a `409` reloads the list.
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
      @if (page(); as data) {
        <p subtitle class="secondary small meta-list">
          <span>{{ data.counts.all | admNum }} đánh giá</span>
          <span>
            Điểm trung bình {{ data.average === null ? 'chưa có' : data.average + '/5' }}
          </span>
          <span>{{ data.counts.unanswered | admNum }} chưa trả lời</span>
        </p>
      }
    </adm-page-header>
    <div class="page-body page-body--wide">
      @if (page(); as data) {
        <div class="inbox" data-testid="review-inbox">
          <div class="inbox-text">
            <p class="strong">Hộp việc cần làm</p>
            <p class="small secondary">
              @if (data.counts.unanswered || data.counts.low) {
                Trả lời đánh giá mới và xử lý đánh giá thấp trước. Mỗi dòng có liên kết mở đúng sản
                phẩm.
              } @else {
                Không còn đánh giá nào cần xử lý.
              }
            </p>
          </div>
          <button
            type="button"
            class="inbox-chip"
            [class.is-active]="query().view === 'unanswered'"
            (click)="list.update({ view: 'unanswered', rating: 0 })"
          >
            <span class="num">{{ data.counts.unanswered | admNum }}</span> chưa trả lời
          </button>
          <button
            type="button"
            class="inbox-chip inbox-chip--low"
            [class.is-active]="query().view === 'low'"
            (click)="list.update({ view: 'low', rating: 0 })"
          >
            <span class="num">{{ data.counts.low | admNum }}</span> đánh giá 1–2 sao
          </button>
        </div>
      }
      <nav class="tabs" aria-label="Lọc đánh giá">
        @for (item of views; track item.value) {
          <button
            type="button"
            [class.is-active]="query().view === item.value"
            (click)="list.update({ view: item.value })"
          >
            {{ item.label }}
            @if (page()?.counts?.[item.count]) {
              <span class="count">{{ page()!.counts[item.count] }}</span>
            }
          </button>
        }
      </nav>

      <div class="toolbar">
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
      </div>

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
            query().view === 'unanswered' ? 'Đánh giá mới sẽ hiện ở đây.' : 'Thử bỏ bộ lọc.'
          "
        >
          @if (query().view !== 'all' || query().rating) {
            <button type="button" class="adm-btn" (click)="list.reset()">Xem tất cả</button>
          }
        </adm-empty>
      } @else if (page(); as data) {
        <ul class="reviews" [class.is-refreshing]="view.state().refreshing">
          @for (review of data.items; track review.id) {
            <li class="review" [class.is-hidden]="review.status === 'hidden'">
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
                </div>
                <p>{{ review.body }}</p>
                <p class="small secondary meta-list">
                  <span>{{ review.author }}</span>
                  <span>Size đã mua: {{ review.sizeBought }}</span>
                  @if (review.height) {
                    <span>Cao {{ review.height }}</span>
                  }
                  <span>{{ fit[review.fit] }}</span>
                  <span>{{ review.date | admDate }}</span>
                </p>
                @if (review.status === 'hidden' && review.hiddenReason) {
                  <p class="small secondary">
                    Đã ẩn{{ review.hiddenBy ? ' bởi ' + review.hiddenBy.name : '' }}:
                    {{ review.hiddenReason }}
                  </p>
                }
                <a
                  class="product"
                  [routerLink]="['/admin/products', review.productId]"
                  [attr.title]="'Mở sản phẩm ' + review.productName"
                >
                  @if (review.productImage) {
                    <img class="thumb thumb--sm" [src]="src(review.productImage)" alt="" />
                  }
                  <span class="small">{{ review.productName }}</span>
                </a>

                @if (editing() === review.id) {
                  <form class="reply-form" (ngSubmit)="reply(review)">
                    <label class="sr-only" [for]="'reply-' + review.id">Phản hồi</label>
                    <textarea
                      class="textarea"
                      rows="3"
                      name="reply"
                      [maxlength]="replyMax"
                      [id]="'reply-' + review.id"
                      placeholder="Phản hồi công khai, khách và người mua khác đều thấy"
                      [ngModel]="replyText()"
                      (ngModelChange)="replyText.set($event)"
                    ></textarea>
                    <div class="row">
                      <span class="small tertiary"
                        >{{ replyText().trim().length }}/{{ replyMax }}</span
                      >
                      <span class="spacer"></span>
                      <button type="button" class="adm-btn adm-btn--sm" (click)="editing.set(null)">
                        Hủy bỏ
                      </button>
                      <button
                        type="submit"
                        class="adm-btn adm-btn--sm adm-btn--primary"
                        [class.is-busy]="busy()"
                        [disabled]="busy() || replyText().trim().length < replyMin"
                      >
                        Đăng phản hồi
                      </button>
                    </div>
                    @if (replyError(); as message) {
                      <p class="error" role="alert">{{ message }}</p>
                    }
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
                      [disabled]="busy()"
                      (click)="toggleHidden(review)"
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
          [pageSize]="data.limit"
          [sizes]="pageSizes"
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
    .inbox {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      padding: 14px 16px;
      margin-bottom: 16px;
      border-radius: 14px;
      background: var(--adm-muted);
    }
    .inbox-text {
      flex: 1;
      min-width: 220px;
      .strong {
        font-weight: 600;
      }
    }
    .inbox-chip {
      height: 36px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 14px;
      border: 1px solid var(--adm-divider);
      border-radius: 9999px;
      background: var(--adm-raised);
      font: inherit;
      color: var(--adm-text);
      cursor: pointer;
      .num {
        font-weight: 600;
      }
      &.is-active {
        border-color: var(--adm-text);
        box-shadow: inset 0 0 0 1px var(--adm-text);
      }
    }
    .inbox-chip--low .num {
      color: var(--adm-critical-fg);
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
  private readonly api = inject(ADMIN_REVIEWS_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  protected readonly canEdit = inject(AdminSession).can('reviews.moderate');
  protected readonly views = VIEWS;
  protected readonly fit = FIT;
  protected readonly src = mediaSrc;
  protected readonly replyMin = REPLY_MIN;
  protected readonly replyMax = REPLY_MAX;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly list = urlQuery<ReviewListQuery>({
    view: 'unanswered',
    rating: 0,
    pageSize: 20,
  });
  protected readonly query = this.list.query;
  private readonly request = computed<AdminReviewQuery>(() => {
    const { view, rating, page, pageSize } = this.query();
    return { view, rating, page, limit: pageSize === 50 ? 50 : 20 };
  });
  protected readonly view = loader(this.request, (query) => this.api.list(query));
  protected readonly page = this.view.data;
  protected readonly editing = signal<string | null>(null);
  protected readonly replyText = signal('');
  protected readonly replyError = signal('');
  protected readonly busy = signal(false);

  startReply(review: AdminReview): void {
    this.replyText.set(review.reply?.body ?? '');
    this.replyError.set('');
    this.editing.set(review.id);
  }

  reply(review: AdminReview): void {
    const body = this.replyText().trim();
    if (body.length < REPLY_MIN || body.length > REPLY_MAX) {
      this.replyError.set(`Phản hồi từ ${REPLY_MIN} đến ${REPLY_MAX} ký tự.`);
      return;
    }
    this.send(review, body, review.reply ? 'Đã sửa phản hồi' : 'Đã đăng phản hồi');
  }

  removeReply(review: AdminReview): void {
    this.dialogs
      .confirm({
        title: 'Xóa phản hồi này?',
        message: 'Phản hồi sẽ biến khỏi trang sản phẩm.',
        confirmLabel: 'Xóa phản hồi',
        danger: true,
      })
      .subscribe((ok) => ok && this.send(review, null, 'Đã xóa phản hồi'));
  }

  toggleHidden(review: AdminReview): void {
    if (review.status === 'hidden') {
      this.busy.set(true);
      this.api.show(review.id, review.updatedAt).subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.replace(updated);
          this.toast.show('Đã hiện lại đánh giá');
        },
        error: (error: unknown) => this.failed(error),
      });
      return;
    }
    const data: ReasonDialogData<AdminReview> = {
      title: 'Ẩn đánh giá này khỏi cửa hàng?',
      message: 'Đánh giá biến khỏi trang sản phẩm và điểm trung bình. Bạn có thể hiện lại sau.',
      confirmLabel: 'Ẩn đánh giá',
      danger: true,
      required: true,
      run: (reason) => this.api.hide(review.id, reason, review.updatedAt),
    };
    this.dialogs
      .modal<ReasonDialogData<AdminReview>, AdminReview>(ReasonDialog, data)
      .closed.subscribe((updated) => {
        if (!updated) return;
        this.replace(updated);
        this.toast.show('Đã ẩn đánh giá khỏi cửa hàng');
      });
  }

  private send(review: AdminReview, body: string | null, success: string): void {
    this.busy.set(true);
    this.replyError.set('');
    this.api.reply(review.id, body, review.updatedAt).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.editing.set(null);
        this.replace(updated);
        this.toast.show(success);
      },
      error: (error: unknown) => this.failed(error),
    });
  }

  /** The counts and the tabs change with every write, so the list is read again. */
  private replace(updated: AdminReview): void {
    this.view.patch((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === updated.id ? updated : item)),
    }));
    this.view.reload();
  }

  private failed(error: unknown): void {
    this.busy.set(false);
    if (error instanceof AdminApiError && error.code === 'version-conflict') {
      this.editing.set(null);
      this.toast.error('Đánh giá vừa được người khác cập nhật. Danh sách đã được tải lại.');
      this.view.reload();
      return;
    }
    if (this.editing() && error instanceof AdminApiError && error.fields['body'])
      this.replyError.set(error.fields['body']);
    else this.toast.error(errorMessage(error));
  }
}
