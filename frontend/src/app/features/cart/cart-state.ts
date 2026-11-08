import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  forkJoin,
  map,
  Observable,
  of,
  pairwise,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { API_CONFIG } from '../../core/api-config';
import { CommercePolicy, MOCK_POLICY } from '../../core/commerce-policy';
import { readLocal, writeLocal } from '../../core/local-state';
import { STORE_INFO } from '../../core/store-info';
import { Product, ProductVariant } from '../catalog/models/product';
import { AuthSession } from '../auth/auth-session';
import { WishlistState } from '../wishlist/wishlist-state';
import { CHECKOUT_API, CheckoutError, RefreshedLine } from '../checkout/checkout-api';
import {
  CART_API,
  CartMergeResult,
  CartMutated,
  CartNotice,
  CartViewDto,
} from './data-access/cart-api';

export type SaleStatus = 'ACTIVE' | 'SOLD_OUT' | 'UNAVAILABLE';

export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  mediaId: string;
  variantId: string;
  color: string;
  size: string;
  price: number;
  stock: number;
  quantity: number;
  /** Missing in carts saved before Slice 3: treated as `ACTIVE`. */
  saleStatus?: SaleStatus;
  /** The server price differs from the one the shopper saw. */
  priceChange?: { from: number; to: number };
  /** min(5, stock) as last reported; missing means "use `stock` and the policy limit". */
  maxQuantity?: number;
  /** ISO datetimes, used to merge lines and to expire a browser cart after 30 days. */
  addedAt?: string;
  updatedAt?: string;
  limitReason?: 'stock' | 'limit';
}

/** New key: Slice 3 added fields to the line. Old lines are read with defaults. */
export const CART_KEY = 'n2f.cart.v2';
const BASELINE_KEY = 'n2f.cart.baseline.v1';
const PENDING_MERGE_KEY = 'n2f.cart.merge.pending';
export const CHECKOUT_RESUME_KEY = 'n2f.checkout.resume';
const MOCK_FLAGS_KEY = 'n2f.mock.flags';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 24 * 60 * 60 * 1000;
const REFRESH_DEBOUNCE_MS = 300;
const UNDO_MS = 5000;

function isCartLines(value: unknown): value is CartLine[] {
  return (
    Array.isArray(value) &&
    value.every(
      (line: Partial<CartLine>) =>
        typeof line?.variantId === 'string' &&
        typeof line.productId === 'string' &&
        typeof line.slug === 'string' &&
        typeof line.name === 'string' &&
        typeof line.mediaId === 'string' &&
        typeof line.color === 'string' &&
        typeof line.size === 'string' &&
        Number.isInteger(line.price) &&
        Number.isInteger(line.stock) &&
        Number.isInteger(line.quantity) &&
        (line.quantity ?? 0) > 0,
    )
  );
}

/** A browser cart not touched for 30 days is dropped when read (AC-CART-12). */
function freshLines(lines: CartLine[]): CartLine[] {
  const limit = Date.now() - MOCK_POLICY.cartRetentionDays * DAY;
  return lines.filter((line) => {
    const at = line.updatedAt ? Date.parse(line.updatedAt) : NaN;
    return Number.isNaN(at) || at >= limit;
  });
}

interface Baseline {
  userId: string;
  quantities: Record<string, number>;
}

function isBaseline(value: unknown): value is Baseline {
  const baseline = value as Partial<Baseline> | null;
  return (
    !!baseline && typeof baseline.userId === 'string' && typeof baseline.quantities === 'object'
  );
}

interface PendingMerge {
  key: string;
  userId: string;
  lines: { variantId: string; quantity: number }[];
}

function isPendingMerge(value: unknown): value is PendingMerge {
  const pending = value as Partial<PendingMerge> | null;
  return !!pending && typeof pending.key === 'string' && Array.isArray(pending.lines);
}

function createKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/** Words of BR-CART-02 for a line stopped at its limit. */
export function limitMessage(reason: 'stock' | 'limit', stock: number, max: number): string {
  return reason === 'stock'
    ? `Chỉ còn ${stock} sản phẩm cho màu, size này.`
    : `Mỗi đơn mua tối đa ${max} sản phẩm cùng màu, size. Cần mua số lượng lớn, vui lòng gọi hotline ${STORE_INFO.hotline}.`;
}

/**
 * The cart behind the bag icon, `/cart` and checkout. Two stores sit under one API:
 * - guest (and, with `checkoutMode: mock`, every shopper): lines in `localStorage`, refreshed
 *   against `POST /checkout/quote`;
 * - signed-in member with the server cart: the server's cart (`CART_API`), the signal is a copy;
 *   `baseline` remembers what the last sync looked like so only the difference is merged later.
 */
@Injectable({ providedIn: 'root' })
export class CartState {
  private readonly session = inject(AuthSession);
  private readonly wishlist = inject(WishlistState);
  private readonly cartApi = inject(CART_API);
  private readonly checkoutApi = inject(CHECKOUT_API);
  private readonly checkoutMode = inject(API_CONFIG).checkoutMode;

  readonly lines = signal<CartLine[]>(freshLines(readLocal(CART_KEY, [], isCartLines)));
  readonly count = computed(() => this.lines().reduce((sum, line) => sum + line.quantity, 0));
  readonly subtotal = computed(() =>
    this.lines().reduce((sum, line) => sum + line.quantity * line.price, 0),
  );
  readonly message = signal('');
  /** Sentence about the last change to the cart itself (limit hit, merge), read out in /cart. */
  readonly notice = signal('');
  /** Limits from the server (HTTP) or the mock; replaced by every answer that carries them. */
  readonly policy = signal<CommercePolicy>({
    ...MOCK_POLICY,
    // HTTP: transfers stay off until the server says otherwise (assumption Q2).
    bankTransferEnabled: this.checkoutMode === 'mock',
  });
  /** Price/stock refresh in flight (keeps the saved copy on screen, dims the prices). */
  readonly refreshing = signal(false);
  /** The last refresh failed: the saved copy is shown with "Chưa cập nhật được giá mới nhất". */
  readonly refreshError = signal(false);
  /** First load of the server cart (skeleton instead of a false empty cart). */
  readonly serverLoading = signal(false);
  /** The server cart could not be loaded. */
  readonly serverError = signal(false);
  /** Per-line sentence from the last refresh ("Chỉ còn N sản phẩm cho màu, size này."). */
  readonly notices = signal<Record<string, string>>({});
  /** Something changed price or availability since the shopper last looked. */
  readonly changed = signal(false);
  /** Last removed line, available to "Hoàn tác" for 5 seconds. */
  readonly undoable = signal<CartLine | null>(null);
  /** Variants the merge after sign-in brought over: the cart selects only these (AC-CART-13). */
  readonly mergedIds = signal<ReadonlySet<string> | null>(null);
  /**
   * Lines picked in the cart's selection mode when the shopper pressed checkout; null means the
   * whole cart. Session-only: after a reload checkout falls back to the whole cart.
   */
  readonly checkoutIds = signal<ReadonlySet<string> | null>(null);
  readonly checkoutLines = computed(() => {
    const ids = this.checkoutIds();
    return ids ? this.lines().filter((line) => ids.has(line.variantId)) : this.lines();
  });
  readonly checkoutCount = computed(() =>
    this.checkoutLines().reduce((sum, line) => sum + line.quantity, 0),
  );
  /** True when the signed-in shopper's cart lives on the server. */
  readonly serverCart = computed(() => this.session.signedIn() && this.serverCartEnabled());

  private readonly refresh$ = new Subject<void>();
  private undoTimer: ReturnType<typeof setTimeout> | undefined;
  /** Variant ids the member changed since the last server answer (guards a late refresh). */
  private mutating = 0;

  constructor() {
    effect(() => writeLocal(CART_KEY, this.lines()));

    this.refresh$
      .pipe(
        debounceTime(REFRESH_DEBOUNCE_MS),
        switchMap(() => this.refreshOnce()),
      )
      .subscribe();

    // Sign-in / sign-out of the shopper.
    toObservable(this.session.user)
      .pipe(startWith(null), pairwise())
      .subscribe(([before, after]) => {
        if (!before && after) untracked(() => this.onSignedIn(after.id));
      });
    this.session.loggedOut.subscribe(() => this.clearDeviceCart());
  }

  clear(): void {
    this.lines.set([]);
  }

  /** Active sign-out: the cart stays on the account, this browser starts empty (K3, BR-CART-12). */
  clearDeviceCart(): void {
    if (!this.serverCartEnabled()) return;
    this.lines.set([]);
    this.checkoutIds.set(null);
    this.mergedIds.set(null);
    this.notices.set({});
    this.changed.set(false);
    try {
      localStorage.removeItem(CART_KEY);
      localStorage.removeItem(BASELINE_KEY);
    } catch {
      /* Storage unavailable: nothing persisted to clear. */
    }
  }

  /** After an order: remove only what was bought; unpicked lines stay in the cart. */
  clearCheckedOut(): void {
    const bought = new Set(this.checkoutLines().map((line) => line.variantId));
    this.lines.update((lines) => lines.filter((line) => !bought.has(line.variantId)));
    this.checkoutIds.set(null);
    // The server already took the bought lines out when it created the order.
    if (this.serverCart()) this.loadServerCart();
  }

  add(product: Product, variant: ProductVariant, quantity = 1): boolean {
    const policy = this.policy();
    const current = this.lines().find((line) => line.variantId === variant.id);
    if (!current && this.lines().length >= policy.maxCartLines) {
      this.say(`Giỏ hàng tối đa ${policy.maxCartLines} sản phẩm khác nhau.`);
      return false;
    }
    const cap = Math.min(policy.maxPerVariant, variant.inventory);
    if (cap <= (current?.quantity ?? 0)) {
      this.say(
        limitMessage(
          variant.inventory < policy.maxPerVariant ? 'stock' : 'limit',
          variant.inventory,
          policy.maxPerVariant,
        ),
      );
      return false;
    }
    const now = new Date().toISOString();
    const wanted = Math.min((current?.quantity ?? 0) + quantity, cap);
    this.lines.update((lines) =>
      current
        ? lines.map((line) =>
            line.variantId === variant.id
              ? { ...line, quantity: wanted, stock: variant.inventory, updatedAt: now }
              : line,
          )
        : [
            ...lines,
            {
              productId: product.id,
              slug: product.slug,
              name: product.name,
              mediaId: product.mediaId,
              variantId: variant.id,
              color: variant.color.name,
              size: variant.size,
              price: product.price,
              stock: variant.inventory,
              quantity: wanted,
              saleStatus: 'ACTIVE',
              maxQuantity: cap,
              addedAt: now,
              updatedAt: now,
            },
          ],
    );
    this.message.set('Đã thêm vào giỏ hàng.');
    this.serverCall(this.cartApi.addLine(variant.id, wanted - (current?.quantity ?? 0)));
    this.requestRefresh();
    return true;
  }

  quantity(id: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    const line = this.lines().find((item) => item.variantId === id);
    if (!line || line.saleStatus === 'UNAVAILABLE') return;
    const cap = this.capOf(line);
    const next = Math.min(quantity, cap);
    if (quantity > cap) this.say(this.limitSentence(line));
    this.lines.update((lines) =>
      lines.map((item) =>
        item.variantId === id
          ? { ...item, quantity: next, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
    this.serverCall(this.cartApi.setQuantity(id, next));
    this.requestRefresh();
  }

  adjust(id: string, delta: number): void {
    const line = this.lines().find((item) => item.variantId === id);
    if (line) this.quantity(id, line.quantity + delta);
  }

  /**
   * Swap a line to another colour/size of the same product. If that variant is already in the
   * cart the two lines merge (capped at min(5, stock)). Returns whether lines were merged.
   */
  changeVariant(id: string, product: Product, variant: ProductVariant): boolean {
    if (id === variant.id) return false;
    const policy = this.policy();
    const cap = Math.min(policy.maxPerVariant, variant.inventory);
    let merged = false;
    const now = new Date().toISOString();
    this.lines.update((lines) => {
      const current = lines.find((line) => line.variantId === id);
      if (!current) return lines;
      const existing = lines.find((line) => line.variantId === variant.id);
      if (existing) {
        merged = true;
        const total = existing.quantity + current.quantity;
        const quantity = Math.min(total, cap);
        this.say(
          total > quantity
            ? `Đã gộp với sản phẩm cùng màu, size có sẵn trong giỏ. Số lượng được điều chỉnh còn ${quantity}.`
            : 'Đã gộp với sản phẩm cùng màu, size có sẵn trong giỏ.',
        );
        return lines
          .filter((line) => line.variantId !== id)
          .map((line) =>
            line.variantId === variant.id
              ? { ...line, quantity, stock: variant.inventory, updatedAt: now }
              : line,
          );
      }
      return lines.map((line) =>
        line.variantId === id
          ? {
              ...line,
              variantId: variant.id,
              color: variant.color.name,
              size: variant.size,
              price: product.price,
              stock: variant.inventory,
              quantity: Math.min(line.quantity, cap),
              maxQuantity: cap,
              saleStatus: 'ACTIVE' as const,
              priceChange: undefined,
              updatedAt: now,
            }
          : line,
      );
    });
    this.serverCall(this.cartApi.changeVariant(id, variant.id));
    this.requestRefresh();
    return merged;
  }

  /**
   * Applies what the shop reported at checkout: each line is set to what is left. A sold-out
   * line stays in the cart (greyed out) so the shopper can pick another size.
   */
  applyStock(issues: readonly { variantId: string; available: number }[]): void {
    const left = new Map(issues.map((issue) => [issue.variantId, issue.available]));
    this.lines.update((lines) =>
      lines.map((line) => {
        const available = left.get(line.variantId);
        if (available === undefined) return line;
        if (available < 1) return { ...line, stock: 0, saleStatus: 'SOLD_OUT' as const };
        return { ...line, stock: available, quantity: Math.min(line.quantity, available) };
      }),
    );
    for (const issue of issues) {
      if (issue.available > 0)
        this.serverCall(this.cartApi.setQuantity(issue.variantId, issue.available));
    }
    this.checkoutIds.update((ids) => {
      if (!ids) return ids;
      const next = new Set(ids);
      for (const issue of issues) if (issue.available < 1) next.delete(issue.variantId);
      return next;
    });
    this.requestRefresh();
  }

  /** Bulk delete from the cart's selection mode. */
  removeMany(ids: ReadonlySet<string>): void {
    this.lines.update((lines) => lines.filter((line) => !ids.has(line.variantId)));
    for (const id of ids) this.serverCall(this.cartApi.removeLine(id));
  }

  remove(id: string): void {
    const line = this.lines().find((item) => item.variantId === id);
    this.lines.update((lines) => lines.filter((item) => item.variantId !== id));
    this.serverCall(this.cartApi.removeLine(id));
    if (line) this.offerUndo(line);
  }

  /** "Hoàn tác": the removed line comes back with its quantity (AC-CART-20). */
  undoRemove(): void {
    const line = this.undoable();
    clearTimeout(this.undoTimer);
    this.undoable.set(null);
    if (!line || this.lines().some((item) => item.variantId === line.variantId)) return;
    this.lines.update((lines) => [...lines, { ...line, updatedAt: new Date().toISOString() }]);
    this.serverCall(this.cartApi.addLine(line.variantId, line.quantity));
    this.requestRefresh();
  }

  /** Price and stock refresh (debounced 300 ms; several taps become one request). */
  requestRefresh(): void {
    if (this.lines().length) this.refresh$.next();
  }

  /** Reads the server cart (member) — on app start, on opening `/cart`, after an order. */
  loadServerCart(): void {
    if (!this.serverCart()) return;
    this.serverLoading.set(!this.lines().length);
    this.serverError.set(false);
    this.cartApi.get().subscribe({
      next: (view) => {
        this.applyView(view);
        this.saveBaseline();
        this.serverLoading.set(false);
      },
      error: () => {
        this.serverLoading.set(false);
        // A saved copy stays on screen; an empty cart must not pretend to be the truth.
        this.serverError.set(true);
      },
    });
  }

  /** Opening `/cart`: the member cart is read again, the guest cart is repriced. */
  open(): void {
    if (this.serverCart()) this.loadServerCart();
    else this.requestRefresh();
  }

  // --- Internals -------------------------------------------------------------------------

  private serverCartEnabled(): boolean {
    if (this.checkoutMode === 'http') return true;
    try {
      const flags: unknown = JSON.parse(sessionStorage.getItem(MOCK_FLAGS_KEY) ?? 'null');
      return !!(flags as { serverCart?: boolean } | null)?.serverCart;
    } catch {
      return false;
    }
  }

  private capOf(line: CartLine): number {
    const policy = this.policy();
    return Math.min(policy.maxPerVariant, line.maxQuantity ?? line.stock);
  }

  private limitSentence(line: CartLine): string {
    const policy = this.policy();
    return limitMessage(
      line.stock < policy.maxPerVariant ? 'stock' : 'limit',
      line.stock,
      policy.maxPerVariant,
    );
  }

  private say(text: string): void {
    this.message.set(text);
    this.notice.set(text);
  }

  /** Tries the price refresh again after a failure ("Thử lại"). */
  retryRefresh(): void {
    this.refreshError.set(false);
    if (this.serverCart()) this.loadServerCart();
    else this.refresh$.next();
  }

  private offerUndo(line: CartLine): void {
    clearTimeout(this.undoTimer);
    this.undoable.set(line);
    this.undoTimer = setTimeout(() => this.undoable.set(null), UNDO_MS);
  }

  /** Runs a member cart write and replaces the local copy with the server's answer. */
  private serverCall(call: Observable<CartMutated>): void {
    if (!this.serverCart()) return;
    this.mutating++;
    call.subscribe({
      next: (result) => {
        this.mutating--;
        if (!this.mutating) this.applyView(result.cart);
        this.saveBaseline();
        this.showNotice(result.notice);
      },
      error: () => {
        this.mutating--;
        this.message.set('Chưa cập nhật được giỏ hàng. Vui lòng thử lại.');
        this.loadServerCart();
      },
    });
  }

  private showNotice(notice: CartNotice | null): void {
    if (!notice) return;
    const line = notice.variantId
      ? this.lines().find((item) => item.variantId === notice.variantId)
      : undefined;
    const policy = this.policy();
    if (notice.code === 'stock-limit' && notice.adjustedTo !== undefined) {
      this.say(limitMessage('stock', notice.adjustedTo, policy.maxPerVariant));
    } else if (notice.code === 'per-variant-limit') {
      this.say(limitMessage('limit', line?.stock ?? 0, policy.maxPerVariant));
    } else if (notice.code === 'merged') {
      this.say(
        notice.adjustedTo !== undefined
          ? `Đã gộp với sản phẩm cùng màu, size có sẵn trong giỏ. Số lượng được điều chỉnh còn ${notice.adjustedTo}.`
          : 'Đã gộp với sản phẩm cùng màu, size có sẵn trong giỏ.',
      );
    }
  }

  /** Replaces the copy with what the server holds, keeping the price the shopper saw. */
  private applyView(view: CartViewDto): void {
    this.policy.set(view.policy);
    this.applyRefreshed(
      view.lines,
      view.lines.map((line) => ({ addedAt: line.updatedAt, updatedAt: line.updatedAt })),
      true,
    );
  }

  /**
   * Merges refreshed lines into the cart: new price (with "from -> to" when it moved), stock and
   * sale status. With `replace` the cart becomes exactly `refreshed` (server cart).
   */
  private applyRefreshed(
    refreshed: RefreshedLine[],
    times: { addedAt: string; updatedAt: string }[],
    replace: boolean,
  ): void {
    const byId = new Map(this.lines().map((line) => [line.variantId, line]));
    const notices: Record<string, string> = {};
    let changed = false;
    const next = refreshed.map((fresh, index): CartLine => {
      const old = byId.get(fresh.variantId);
      if (fresh.availability === 'discontinued') {
        changed ||= !!old;
        return {
          ...(old ?? emptyLine(fresh)),
          stock: 0,
          saleStatus: 'UNAVAILABLE',
          maxQuantity: 0,
          priceChange: undefined,
        };
      }
      const soldOut = fresh.availability === 'out-of-stock';
      const priceMoved = !!old && old.price !== fresh.unitPrice;
      let priceChange = old?.priceChange;
      if (priceMoved) {
        priceChange = { from: priceChange?.from ?? old.price, to: fresh.unitPrice };
        if (priceChange.from === priceChange.to) priceChange = undefined;
      }
      // The server cart is the truth for quantities; a browser cart keeps what the shopper chose.
      const target = replace ? fresh.requestedQuantity : (old?.quantity ?? fresh.requestedQuantity);
      let quantity = target;
      if (!soldOut && fresh.effectiveQuantity < target) {
        quantity = fresh.effectiveQuantity;
        notices[fresh.variantId] =
          fresh.limitedBy === 'per-variant-limit'
            ? limitMessage('limit', fresh.inventory, this.policy().maxPerVariant)
            : limitMessage('stock', fresh.inventory, this.policy().maxPerVariant);
      }
      if (priceMoved || soldOut || notices[fresh.variantId]) changed = true;
      return {
        productId: fresh.productId,
        slug: fresh.slug,
        name: fresh.name,
        mediaId: fresh.mediaId,
        variantId: fresh.variantId,
        color: fresh.color,
        size: fresh.size,
        price: fresh.unitPrice,
        stock: fresh.inventory,
        quantity: Math.max(1, quantity),
        saleStatus: soldOut ? 'SOLD_OUT' : 'ACTIVE',
        priceChange,
        maxQuantity: fresh.maxQuantity,
        addedAt: old?.addedAt ?? times[index]?.addedAt,
        updatedAt: old?.updatedAt ?? times[index]?.updatedAt,
        limitReason: fresh.limitedBy
          ? fresh.limitedBy === 'stock'
            ? 'stock'
            : 'limit'
          : undefined,
      };
    });
    this.lines.set(
      replace
        ? next
        : this.lines().map((line) => next.find((n) => n.variantId === line.variantId) ?? line),
    );
    this.notices.set(notices);
    if (changed) this.changed.set(true);
  }

  private refreshOnce(): Observable<unknown> {
    const lines = this.lines();
    if (!lines.length) return of(null);
    if (this.serverCart()) {
      this.refreshing.set(true);
      return this.cartApi.get().pipe(
        tap((view) => {
          this.applyView(view);
          this.refreshError.set(false);
        }),
        catchError(() => {
          this.refreshError.set(true);
          return of(null);
        }),
        tap(() => this.refreshing.set(false)),
      );
    }
    // Lines saved by an older build (ids that are not UUIDs) cannot be looked up on the server.
    const legacy =
      this.checkoutMode === 'http' ? lines.filter((line) => !UUID.test(line.variantId)) : [];
    if (legacy.length) {
      const ids = new Set(legacy.map((line) => line.variantId));
      this.lines.update((all) =>
        all.map((line) =>
          ids.has(line.variantId)
            ? { ...line, saleStatus: 'UNAVAILABLE' as const, stock: 0, maxQuantity: 0 }
            : line,
        ),
      );
      this.changed.set(true);
    }
    const queryable = lines.filter((line) => !legacy.includes(line));
    if (!queryable.length) return of(null);
    this.refreshing.set(true);
    // Each request is limited to 20 pieces: a bigger cart is repriced in several requests.
    const batches = batchLines(queryable, this.policy().maxItemsPerOrder);
    return forkJoin(
      batches.map((batch) =>
        this.checkoutApi.quote({
          items: batch.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        }),
      ),
    ).pipe(
      tap((quotes) => {
        const first = quotes[0];
        if (first) this.policy.set(first.policy);
        const refreshed = quotes.flatMap((quote) => quote.lines);
        this.applyRefreshed(
          refreshed,
          refreshed.map(() => ({ addedAt: '', updatedAt: '' })),
          false,
        );
        this.refreshError.set(false);
      }),
      map(() => null),
      catchError(() => {
        // A broken answer keeps the saved copy; the shopper can retry.
        this.refreshError.set(true);
        return of(null);
      }),
      tap(() => this.refreshing.set(false)),
    );
  }

  // --- Signing in: merge the browser cart into the account -------------------------------

  private onSignedIn(userId: string): void {
    if (!this.serverCart()) return;
    const pending = readLocal<PendingMerge | null>(
      PENDING_MERGE_KEY,
      null,
      (value): value is PendingMerge | null => value === null || isPendingMerge(value),
    );
    const baseline = this.baselineFor(userId);
    const delta = this.lines()
      .map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity - (baseline[line.variantId] ?? 0),
      }))
      .filter((line) => line.quantity > 0 && line.variantId);
    if (pending && pending.userId === userId && pending.lines.length) {
      this.merge(pending.lines, pending.key, userId, true);
    } else if (delta.length) {
      this.merge(
        delta.map((line) => ({ ...line, quantity: Math.min(line.quantity, 5) })),
        createKey(),
        userId,
        true,
      );
    } else {
      this.loadServerCart();
    }
  }

  private merge(
    lines: { variantId: string; quantity: number }[],
    key: string,
    userId: string,
    mayRetry: boolean,
  ): void {
    writeLocal(PENDING_MERGE_KEY, { key, userId, lines } satisfies PendingMerge);
    this.serverLoading.set(!this.lines().length);
    this.cartApi.merge(lines.slice(0, 30), key).subscribe({
      next: (result) => {
        this.clearPending();
        this.afterMerge(result);
      },
      error: (error: unknown) => {
        this.serverLoading.set(false);
        if (error instanceof CheckoutError && error.code === 'idempotency-conflict' && mayRetry) {
          this.clearPending();
          this.merge(lines, createKey(), userId, false);
        } else if (error instanceof CheckoutError && error.code === 'unauthenticated') {
          // Session ended: the browser cart stays and the merge runs after the next sign-in.
          this.serverError.set(false);
        } else {
          // Offline / 5xx: keep the browser cart and the pending key; retried on the next load.
          this.serverError.set(true);
        }
      },
    });
  }

  private afterMerge(result: CartMergeResult): void {
    this.applyView(result.cart);
    this.saveBaseline();
    this.serverLoading.set(false);
    this.serverError.set(false);
    const resume = readResume();
    const merged = new Set(result.mergedVariantIds);
    // Only what the shopper brought over is selected (not the older lines of the account).
    this.mergedIds.set(merged.size ? merged : null);
    if (resume?.ids?.length) this.checkoutIds.set(new Set(resume.ids));
    else if (merged.size) this.checkoutIds.set(merged);
    if (result.addedCount > 0) {
      this.say(`Đã thêm ${result.addedCount} sản phẩm từ giỏ hàng trước khi đăng nhập.`);
    }
    if (result.evicted.length) {
      this.wishlist.addMany(result.evicted.map((line) => line.productId));
    }
  }

  private baselineFor(userId: string): Record<string, number> {
    const stored = readLocal<Baseline | null>(
      BASELINE_KEY,
      null,
      (value): value is Baseline | null => value === null || isBaseline(value),
    );
    return stored && stored.userId === userId ? stored.quantities : {};
  }

  private saveBaseline(): void {
    const user = this.session.user();
    if (!user || !this.serverCart()) return;
    writeLocal(BASELINE_KEY, {
      userId: user.id,
      quantities: Object.fromEntries(this.lines().map((line) => [line.variantId, line.quantity])),
    } satisfies Baseline);
  }

  private clearPending(): void {
    try {
      localStorage.removeItem(PENDING_MERGE_KEY);
    } catch {
      /* Nothing persisted. */
    }
  }
}

/** Lines and form kept in this tab while the shopper signs in from checkout (BR-CART-11). */
function readResume(): { ids?: string[] } | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(CHECKOUT_RESUME_KEY) ?? 'null');
    return value && typeof value === 'object' ? (value as { ids?: string[] }) : null;
  } catch {
    return null;
  }
}

function emptyLine(fresh: RefreshedLine): CartLine {
  return {
    productId: fresh.productId,
    slug: fresh.slug,
    name: fresh.name,
    mediaId: fresh.mediaId,
    variantId: fresh.variantId,
    color: fresh.color,
    size: fresh.size,
    price: fresh.unitPrice,
    stock: 0,
    quantity: fresh.requestedQuantity,
  };
}

/** Greedy groups of lines whose pieces add up to at most `limit` (one quote per group). */
function batchLines(lines: CartLine[], limit: number): CartLine[][] {
  const batches: CartLine[][] = [];
  let current: CartLine[] = [];
  let pieces = 0;
  for (const line of lines) {
    if (current.length && pieces + line.quantity > limit) {
      batches.push(current);
      current = [];
      pieces = 0;
    }
    current.push(line);
    pieces += line.quantity;
  }
  if (current.length) batches.push(current);
  return batches;
}
