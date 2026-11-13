import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, map, of, startWith, Subject, switchMap } from 'rxjs';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ProductCardComponent } from '../../shared/commerce/product-card.component';
import {
  COLLECTIONS_API,
  COLLECTIONS_PROVIDERS,
  CollectionDetail,
} from './data-access/collections-api';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; collection: CollectionDetail };

/** `/collections/:slug` (BR-CMS-07, Should): a named set of products chosen by the shop. */
@Component({
  selector: 'n2f-collection-page',
  imports: [RouterLink, EmptyStateComponent, ProductCardComponent],
  providers: COLLECTIONS_PROVIDERS,
  template: `
    <div class="container collection">
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
        @case ('missing') {
          <n2f-empty-state
            heading="Không tìm thấy bộ sưu tập"
            description="Bộ sưu tập này không còn hoặc chưa mở. Khám phá những lựa chọn khác."
          >
            <a class="button dark" routerLink="/shop">Khám phá sản phẩm</a>
          </n2f-empty-state>
        }
        @case ('ready') {
          @if (ready(); as collection) {
            <h1>{{ collection.name }}</h1>
            @if (collection.description) {
              <p class="lead">{{ collection.description }}</p>
            }
            @if (collection.products.length) {
              <div class="grid">
                @for (product of collection.products; track product.id) {
                  <n2f-product-card [product]="product" />
                }
              </div>
            } @else {
              <n2f-empty-state
                heading="Bộ sưu tập chưa có sản phẩm nào đang bán"
                description="Bạn quay lại sau nhé, hoặc xem các sản phẩm khác."
              >
                <a class="button dark" routerLink="/shop">Khám phá sản phẩm</a>
              </n2f-empty-state>
            }
          }
        }
      }
    </div>
  `,
  styles: `
    .collection {
      padding-block: 40px 96px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(28px, 3.4vw, 44px);
      font-weight: 600;
    }
    .lead,
    .muted {
      max-width: 620px;
      margin: 0 0 24px;
      color: var(--muted);
      line-height: 1.6;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 32px 16px;
    }
    @media (max-width: 959px) {
      .grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionPage {
  private readonly api = inject(COLLECTIONS_API);
  readonly retry$ = new Subject<void>();
  readonly state = signal<State>({ status: 'loading' });

  constructor() {
    combineLatest([inject(ActivatedRoute).paramMap, this.retry$.pipe(startWith(undefined))])
      .pipe(
        switchMap(([params]) =>
          this.api.get(params.get('slug') ?? '').pipe(
            map((collection): State =>
              collection ? { status: 'ready', collection } : { status: 'missing' },
            ),
            startWith<State>({ status: 'loading' }),
            catchError(() => of<State>({ status: 'error' })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  ready(): CollectionDetail | null {
    const state = this.state();
    return state.status === 'ready' ? state.collection : null;
  }
}
