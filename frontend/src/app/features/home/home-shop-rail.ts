import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CATALOG_API } from '../catalog/data-access/catalog-api';
import { CatalogQuery, DEFAULT_QUERY, Product, SortOrder } from '../catalog/models/product';
import { ProductCardComponent } from '../../shared/commerce/product-card.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { LandingShop } from './landing-content';

/** Four sellable products (price, sizes, add to cart) between the editorial blocks. */
@Component({
  selector: 'n2f-home-shop-rail',
  imports: [RouterLink, ProductCardComponent, IconComponent],
  template: `
    @if (products().length) {
      <section [attr.aria-labelledby]="content().id + '-title'">
        <div class="rail-head">
          <h2 [id]="content().id + '-title'">{{ content().label }}</h2>
          <a [routerLink]="content().href" [queryParams]="content().queryParams"
            >Xem tất cả <n2f-icon name="reiconArrowRight" size="16px"
          /></a>
        </div>
        <div class="shop-rail">
          @for (product of products(); track product.id) {
            <n2f-product-card [product]="product" />
          }
        </div>
      </section>
    }
  `,
  styleUrl: './home-shop-rail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeShopRail implements OnInit {
  readonly content = input.required<LandingShop>();
  readonly products = signal<Product[]>([]);
  private readonly catalog = inject(CATALOG_API);
  private readonly destroyRef = inject(DestroyRef);

  /** The block's own filters (`queryParams`: category, moment, sale, ...) narrow the four products. */
  private query(): CatalogQuery {
    const { sort, queryParams = {} } = this.content();
    const price = Number(queryParams['maxPrice']);
    return {
      ...DEFAULT_QUERY,
      gender: queryParams['gender'] ?? '',
      category: queryParams['category'] ?? '',
      moment: queryParams['moment'] ?? '',
      size: queryParams['size'] ?? '',
      color: queryParams['color'] ?? '',
      q: queryParams['q'] ?? '',
      maxPrice: Number.isFinite(price) && price > 0 ? price : 0,
      available: queryParams['available'] === 'true',
      sale: queryParams['sale'] === 'true',
      sort: (queryParams['sort'] as SortOrder | undefined) ?? sort,
      limit: 4,
    };
  }

  ngOnInit(): void {
    this.catalog
      .list(this.query())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((page) => this.products.set(page.items));
  }
}
