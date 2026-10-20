import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, map, of, startWith, Subject, switchMap } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CATALOG_API } from './data-access/catalog-api';
import {
  CATEGORIES,
  DEFAULT_QUERY,
  GENDERS,
  MOMENTS,
  SORT_OPTIONS,
  CatalogQuery,
  ProductPage,
  SortOrder,
} from './models/product';
import { ProductCardComponent } from '../../shared/commerce/product-card.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { WishlistState } from '../wishlist/wishlist-state';
import { CatalogFilters } from './catalog-filters';
import { FilterDialog, FilterDialogData } from './filter-dialog';
import { OverlayService } from '../../shared/ui/overlay.service';
import { readLocal, writeLocal } from '../../core/local-state';

const FILTERS_HIDDEN_KEY = 'n2f.plp.filters-hidden';

type CatalogResult = { status: 'loading' | 'success' | 'error'; page: ProductPage };

@Component({
  selector: 'n2f-catalog-page',
  imports: [FormsModule, ProductCardComponent, EmptyStateComponent, IconComponent, CatalogFilters],
  templateUrl: './catalog-page.html',
  styleUrl: './catalog-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CATALOG_API);
  private readonly destroyRef = inject(DestroyRef);
  private readonly retry$ = new Subject<void>();
  private readonly wishlist = inject(WishlistState);
  readonly categories = CATEGORIES;
  readonly moments = MOMENTS;
  readonly sorts = SORT_OPTIONS;
  readonly query = signal<CatalogQuery>(DEFAULT_QUERY);
  readonly result = signal<CatalogResult>({ status: 'loading', page: { items: [], total: 0 } });
  private readonly overlay = inject(OverlayService);
  readonly isWishlist = signal(false);
  /** Desktop "Ẩn bộ lọc" (Nike-style): widens the grid to four columns. Per-browser preference. */
  readonly filtersHidden = signal(
    readLocal(FILTERS_HIDDEN_KEY, false, (value): value is boolean => typeof value === 'boolean'),
  );
  readonly heading = signal('New in.');
  readonly visibleProducts = computed(() =>
    this.isWishlist()
      ? this.result().page.items.filter((product) => this.wishlist.savedIds().includes(product.id))
      : this.result().page.items,
  );
  readonly filterCount = computed(() => {
    const q = this.query();
    return [q.gender, q.category, q.moment, q.size, q.color, q.maxPrice, q.available].filter(
      Boolean,
    ).length;
  });

  constructor() {
    combineLatest([
      this.route.queryParamMap,
      this.route.paramMap,
      this.route.data,
      this.retry$.pipe(startWith(undefined)),
    ])
      .pipe(
        map(([params, path, data]) => {
          const gender = data['gender'] ?? params.get('gender') ?? '';
          const genderLabel = GENDERS.find((item) => item.value === gender)?.label;
          const category = path.get('category') ?? params.get('category') ?? '';
          const moment = path.get('moment') ?? params.get('moment') ?? '';
          const sort = params.get('sort') ?? 'featured';
          const price = Number(params.get('maxPrice'));
          this.isWishlist.set(data['kind'] === 'wishlist');
          this.heading.set(
            data['kind'] === 'wishlist'
              ? 'Đã yêu thích.'
              : data['kind'] === 'search'
                ? 'Tìm kiếm.'
                : (MOMENTS.find((item) => item.value === moment)?.label ??
                  CATEGORIES.find((item) => item.value === category)?.label ??
                  data['title'] ??
                  (genderLabel && `Thời trang ${genderLabel}.`) ??
                  'New in.'),
          );
          const query: CatalogQuery = {
            gender: GENDERS.some((item) => item.value === gender) ? gender : '',
            category,
            moment,
            size: params.get('size') ?? '',
            color: params.get('color') ?? '',
            available: params.get('available') === 'true',
            search: params.get('q') ?? '',
            maxPrice: Number.isFinite(price) && price > 0 ? price : 0,
            sort: SORT_OPTIONS.some((option) => option.value === sort)
              ? (sort as SortOrder)
              : 'featured',
          };
          this.query.set(query);
          return query;
        }),
        switchMap((query) =>
          this.api.list(query).pipe(
            map((page) => ({ status: 'success', page }) as CatalogResult),
            startWith({ status: 'loading', page: { items: [], total: 0 } } as CatalogResult),
            catchError(() =>
              of({ status: 'error', page: { items: [], total: 0 } } as CatalogResult),
            ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.result.set(result));
  }

  update(key: string, value: string | boolean | number): void {
    const params = { ...this.route.snapshot.queryParams, [key]: value || null };
    // Move path filters into query state so changing category/moment never leaves a hidden constraint.
    const category = this.route.snapshot.paramMap.get('category');
    const moment = this.route.snapshot.paramMap.get('moment');
    const gender = this.route.snapshot.data['gender'] as string | undefined;
    if (category && key !== 'category') params['category'] = category;
    if (moment && key !== 'moment') params['moment'] = moment;
    if (gender && key !== 'gender') params['gender'] = gender;
    void this.router.navigate(category || moment || gender ? ['/shop'] : [], {
      relativeTo: this.route,
      queryParams: params,
    });
  }

  clear(): void {
    const hasPath =
      this.route.snapshot.paramMap.has('category') ||
      this.route.snapshot.paramMap.has('moment') ||
      Boolean(this.route.snapshot.data['gender']);
    void this.router.navigate(hasPath ? ['/shop'] : [], {
      relativeTo: this.route,
      queryParams: {},
    });
  }
  toggleFilters(): void {
    this.filtersHidden.update((hidden) => !hidden);
    writeLocal(FILTERS_HIDDEN_KEY, this.filtersHidden());
  }
  retry(): void {
    this.retry$.next();
  }
  openFilters(): void {
    const data: FilterDialogData = {
      query: this.query,
      update: (key, value) => this.update(key, value),
      clear: () => this.clear(),
    };
    this.overlay.open(FilterDialog, 'Bộ lọc sản phẩm', 'drawer', data);
  }
}
