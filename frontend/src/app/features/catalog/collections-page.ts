import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import {
  COLLECTIONS_API,
  COLLECTIONS_PROVIDERS,
  CollectionSummary,
} from './data-access/collections-api';

type State =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: CollectionSummary[] };

/** `/collections`: the active collections, newest first (BR-CMS-07, Should). */
@Component({
  selector: 'n2f-collections-page',
  imports: [RouterLink, EmptyStateComponent],
  providers: COLLECTIONS_PROVIDERS,
  template: `
    <div class="container collections">
      <h1>Bộ sưu tập</h1>
      @switch (state().status) {
        @case ('loading') {
          <p class="muted" role="status">Đang tải bộ sưu tập…</p>
        }
        @case ('error') {
          <n2f-empty-state
            heading="Chưa tải được bộ sưu tập"
            description="Bạn vui lòng thử lại sau một chút."
          >
            <button class="button dark" type="button" (click)="retry$.next()">Thử lại</button>
          </n2f-empty-state>
        }
        @case ('ready') {
          @if (items().length) {
            <ul class="list">
              @for (item of items(); track item.slug) {
                <li>
                  <a [routerLink]="['/collections', item.slug]">
                    <strong>{{ item.name }}</strong>
                    @if (item.description) {
                      <span class="desc">{{ item.description }}</span>
                    }
                    <span class="count">{{ item.productCount }} sản phẩm</span>
                  </a>
                </li>
              }
            </ul>
          } @else {
            <n2f-empty-state
              heading="Chưa có bộ sưu tập nào"
              description="Bạn quay lại sau nhé, hoặc xem các sản phẩm khác."
            >
              <a class="button dark" routerLink="/shop">Khám phá sản phẩm</a>
            </n2f-empty-state>
          }
        }
      }
    </div>
  `,
  styles: `
    .collections {
      padding-block: 40px 96px;
    }
    h1 {
      margin: 0 0 24px;
      font-size: clamp(28px, 3.4vw, 44px);
      font-weight: 600;
    }
    .muted {
      color: var(--muted);
    }
    .list {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    a {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
      padding: 24px;
      border: 1px solid var(--line);
    }
    a:hover {
      border-color: var(--ink);
    }
    strong {
      font-size: 20px;
      font-weight: 600;
    }
    .desc,
    .count {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }
    @media (max-width: 959px) {
      .list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 599px) {
      .list {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsPage {
  private readonly api = inject(COLLECTIONS_API);
  readonly retry$ = new Subject<void>();
  readonly state = signal<State>({ status: 'loading' });

  constructor() {
    this.retry$
      .pipe(
        startWith(undefined),
        switchMap(() =>
          this.api.list().pipe(
            map((items): State => ({ status: 'ready', items })),
            startWith<State>({ status: 'loading' }),
            catchError(() => of<State>({ status: 'error' })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  items(): CollectionSummary[] {
    const state = this.state();
    return state.status === 'ready' ? state.items : [];
  }
}
