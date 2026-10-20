import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { CATALOG_API } from '../../catalog/data-access/catalog-api';
import { CartState } from '../../cart/cart-state';
import { ToastService } from '../../../shared/ui/toast';
import { getMedia } from '../../../../media/media-manifest';
import { Order } from '../../orders/order-models';

/**
 * "Mua lại": puts an order's lines back in the bag with the same colour, size and quantity, at
 * today's price and stock. Lines whose variant is gone or sold out are reported, not added.
 */
@Injectable({ providedIn: 'root' })
export class BuyAgain {
  private readonly catalog = inject(CATALOG_API);
  private readonly cart = inject(CartState);
  private readonly toast = inject(ToastService);

  /** Emits how many pieces were added once every product has been looked up. */
  add(order: Order): Observable<number> {
    return forkJoin(
      order.items.map((line) =>
        this.catalog.get(line.productSlug).pipe(
          catchError(() => of(undefined)),
          map((product) => {
            const variant = product?.variants.find(
              (candidate) => candidate.color.name === line.color && candidate.size === line.size,
            );
            if (!product || !variant) return 0;
            let added = 0;
            while (added < line.quantity && this.cart.add(product, variant)) added++;
            return added;
          }),
        ),
      ),
    ).pipe(
      map((counts) => {
        const added = counts.reduce((sum, count) => sum + count, 0);
        const wanted = order.items.reduce((sum, line) => sum + line.quantity, 0);
        this.toast.show(
          added
            ? {
                title: 'Đã thêm vào giỏ hàng',
                detail:
                  added < wanted
                    ? `${added}/${wanted} sản phẩm, phần còn lại đã hết hàng.`
                    : `${added} sản phẩm từ đơn #${order.id}`,
                image: getMedia(order.items[0].mediaId).src,
                action: { label: `Xem giỏ hàng (${this.cart.count()})`, link: '/cart' },
              }
            : {
                title: 'Chưa thêm được',
                detail: 'Các sản phẩm trong đơn này hiện đã hết hàng.',
              },
        );
        return added;
      }),
    );
  }
}
