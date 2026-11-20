import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { CATALOG_API } from '../../catalog/data-access/catalog-api';
import { Product, ProductVariant } from '../../catalog/models/product';
import { CartState } from '../../cart/cart-state';
import { ToastService } from '../../../shared/ui/toast';
import { getMedia } from '../../../../media/media-manifest';
import { Order, OrderItem } from '../../orders/order-models';

/**
 * The variant the order line bought (ORD-12): by `variantId` when the order knows it (API orders),
 * else by the exact colour + size (mock orders). Never another size or colour, and never a
 * replacement when the bought one is sold out: that line is reported instead.
 */
export function boughtVariant(
  product: Product | undefined,
  line: Pick<OrderItem, 'variantId' | 'color' | 'size'>,
): ProductVariant | undefined {
  if (!product) return undefined;
  if (line.variantId) return product.variants.find((candidate) => candidate.id === line.variantId);
  return product.variants.find(
    (candidate) => candidate.color.name === line.color && candidate.size === line.size,
  );
}

/**
 * "Mua lại": puts an order's lines back in the bag with the same variant (colour, size) and
 * quantity, at today's price and stock. Lines whose variant is gone or sold out are reported by
 * name, not swapped for another variant.
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
            const variant = boughtVariant(product, line);
            // Gone or sold out: keep it out of the bag (no other size / colour is picked).
            if (!product || !variant || variant.inventory < 1) return { line, added: 0 };
            let added = 0;
            while (added < line.quantity && this.cart.add(product, variant)) added++;
            return { line, added };
          }),
        ),
      ),
    ).pipe(
      map((results) => {
        const added = results.reduce((sum, result) => sum + result.added, 0);
        const wanted = order.items.reduce((sum, line) => sum + line.quantity, 0);
        const missing = results
          .filter((result) => result.added < result.line.quantity)
          .map((result) => `${result.line.name} (${result.line.color} / ${result.line.size})`);
        this.toast.show(
          added
            ? {
                title: 'Đã thêm vào giỏ hàng',
                detail:
                  added < wanted
                    ? `${added}/${wanted} sản phẩm. Chưa thêm được: ${missing.join(', ')} (đã hết hàng hoặc ngừng bán).`
                    : `${added} sản phẩm từ đơn #${order.id}`,
                image: getMedia(order.items[0].mediaId).src,
                action: { label: `Xem giỏ hàng (${this.cart.count()})`, link: '/cart' },
              }
            : {
                title: 'Chưa thêm được',
                detail: `Đúng màu, size bạn đã mua hiện đã hết hàng hoặc ngừng bán: ${missing.join(', ')}.`,
              },
        );
        return added;
      }),
    );
  }
}
