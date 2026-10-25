import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DateTimePipe } from '../core/format.pipes';
import type { AdminOrderEvent } from '../data-access/models';

type Filter = 'all' | 'comment' | 'system';

/**
 * History (5.5): system events and internal comments in one stream, newest first. Comments are
 * staff-only and never sent to the shopper.
 */
@Component({
  selector: 'adm-timeline',
  imports: [FormsModule, DateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (allowComment()) {
      <form class="composer" (ngSubmit)="submit()">
        <textarea
          class="textarea"
          name="comment"
          rows="2"
          placeholder="Viết ghi chú nội bộ (khách không thấy)…"
          aria-label="Ghi chú nội bộ"
          [ngModel]="draft()"
          (ngModelChange)="draft.set($event)"
        ></textarea>
        <div class="row">
          <span class="small tertiary">Chỉ nhân viên thấy ghi chú này.</span>
          <span class="spacer"></span>
          <button
            type="submit"
            class="adm-btn adm-btn--sm"
            [disabled]="!draft().trim() || posting()"
            [class.is-busy]="posting()"
          >
            Thêm ghi chú
          </button>
        </div>
      </form>
    }
    <div class="filters" role="group" aria-label="Lọc lịch sử">
      @for (option of filters; track option.value) {
        <button
          type="button"
          class="chip chip--static"
          [class.on]="filter() === option.value"
          [attr.aria-pressed]="filter() === option.value"
          (click)="filter.set(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
    <ol>
      @for (event of visible(); track event.id) {
        <li [class.comment]="event.kind === 'comment'">
          <span class="marker" aria-hidden="true"></span>
          <div>
            <p class="title">{{ event.title }}</p>
            @if (event.detail) {
              <p class="detail">{{ event.detail }}</p>
            }
            <p class="meta">
              {{ event.at | admDateTime }}
              @if (event.author) {
                · {{ event.author }}
              }
            </p>
          </div>
        </li>
      } @empty {
        <li class="none">Chưa có mục nào.</li>
      }
    </ol>
  `,
  styles: `
    .composer {
      display: grid;
      gap: 8px;
      margin-bottom: 16px;
    }
    .composer .textarea {
      min-height: 72px;
    }
    .filters {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }
    .chip {
      cursor: pointer;
    }
    .chip.on {
      background: var(--adm-primary);
      color: #fff;
    }
    ol {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      position: relative;
      display: grid;
      grid-template-columns: 16px 1fr;
      gap: 12px;
      padding-bottom: 16px;
    }
    li:not(:last-child)::before {
      content: '';
      position: absolute;
      left: 7px;
      top: 14px;
      bottom: 0;
      width: 1px;
      background: var(--adm-divider);
    }
    .marker {
      width: 9px;
      height: 9px;
      margin: 5px 0 0 3px;
      border-radius: 50%;
      background: #bdbdbd;
    }
    li.comment .marker {
      background: var(--adm-primary);
    }
    li.comment .title {
      white-space: pre-line;
    }
    .title {
      font-weight: 500;
    }
    li.comment .title {
      font-weight: 400;
    }
    .detail {
      color: var(--adm-text-secondary);
    }
    .meta {
      font-size: 12px;
      line-height: 16px;
      color: var(--adm-text-tertiary);
      margin-top: 2px;
    }
    .none {
      display: block;
      color: var(--adm-text-tertiary);
    }
  `,
})
export class AdmTimeline {
  readonly events = input.required<AdminOrderEvent[]>();
  readonly allowComment = input(true);
  readonly posting = input(false);
  readonly comment = output<string>();

  readonly draft = signal('');
  readonly filter = signal<Filter>('all');
  protected readonly filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Tất cả' },
    { value: 'comment', label: 'Ghi chú' },
    { value: 'system', label: 'Hệ thống' },
  ];
  readonly visible = computed(() => {
    const filter = this.filter();
    return filter === 'all'
      ? this.events()
      : this.events().filter((event) => event.kind === filter);
  });

  submit(): void {
    const text = this.draft().trim();
    if (!text) return;
    this.comment.emit(text);
  }

  /** Called by the parent after the comment is saved. */
  clear(): void {
    this.draft.set('');
  }
}
