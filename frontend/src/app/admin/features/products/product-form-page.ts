import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CATEGORIES, GENDERS, MOMENTS } from '../../../features/catalog/models/product';
import { AdminSession } from '../../core/admin-session';
import { money, percent, slugify } from '../../core/format';
import { NumPipe, DateTimePipe } from '../../core/format.pipes';
import { PRODUCT_STATUS_OPTIONS, productBadge } from '../../core/status';
import {
  ADMIN_INVENTORY_API,
  ADMIN_PRODUCTS_API,
  ADMIN_STOREFRONT_API,
} from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import {
  AdminApiError,
  AdminCollection,
  AdminProduct,
  AdminVariant,
  ProductImage,
  ProductInput,
} from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdmChipInput } from '../../ui/chip-input';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { routeParam } from '../../ui/route-param';
import { AdmSaveBar } from '../../ui/save-bar';
import { AdminToastService } from '../../ui/toast';
import { HasUnsavedChanges } from '../../ui/unsaved-changes';
import { AdjustStockDrawer } from '../inventory/adjust-stock-drawer';

/** Sizes in garment order (6.3: never alphabetical). */
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const PRESET_COLORS = [
  { name: 'Đen', hex: '#242323' },
  { name: 'Trắng', hex: '#f5f4f0' },
  { name: 'Xám', hex: '#96958f' },
  { name: 'Be', hex: '#d8cbb5' },
  { name: 'Đỏ', hex: '#a91e2c' },
  { name: 'Xanh navy', hex: '#1f2a44' },
];

function emptyProduct(): ProductInput {
  return {
    slug: '',
    name: '',
    type: '',
    description: '',
    status: 'draft',
    category: 'tops',
    genders: ['nu'],
    moments: [],
    tags: [],
    price: 0,
    compareAtPrice: null,
    cost: null,
    material: '',
    care: [],
    fitSummary: '',
    images: [],
    colors: [PRESET_COLORS[0]],
    sizes: ['S', 'M', 'L'],
    variants: [],
    seoTitle: '',
    seoDescription: '',
  };
}

/** Editable part of a product (drops server-owned fields). */
function toInput(product: AdminProduct): ProductInput {
  const input: Partial<AdminProduct> = { ...product };
  delete input.id;
  delete input.createdAt;
  delete input.updatedAt;
  return input as ProductInput;
}

/**
 * Create / edit product (4.2, 6.2, 6.3, 3.13). One layout for both. Create uses header buttons;
 * edit uses the contextual save bar that only appears with unsaved changes.
 */
@Component({
  selector: 'adm-product-form-page',
  imports: [
    FormsModule,
    RouterLink,
    AdmPageHeader,
    AdmBadge,
    AdmIcon,
    AdmChipInput,
    AdmSaveBar,
    AdmEmptyState,
    NumPipe,
    DateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-form-page.html',
  styleUrl: './product-form-page.scss',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class ProductFormPage implements HasUnsavedChanges {
  private readonly api = inject(ADMIN_PRODUCTS_API);
  private readonly router = inject(Router);
  private readonly toast = inject(AdminToastService);
  private readonly dialogs = inject(AdminDialogs);
  private readonly session = inject(AdminSession);
  private readonly inventoryApi = inject(ADMIN_INVENTORY_API);
  private readonly storefrontApi = inject(ADMIN_STOREFRONT_API);
  /** Collections are saved on their own, straight away (not part of the product form). */
  protected readonly collections = signal<AdminCollection[] | null>(null);
  protected readonly categoryLabel = computed(
    () => CATEGORIES.find((item) => item.value === this.draft().category)?.label ?? '',
  );
  protected readonly id = routeParam('id');
  protected readonly isNew = computed(() => !this.id());
  protected readonly canEdit = this.session.can('products.edit');
  protected readonly canDelete = this.session.can('products.delete');
  protected readonly canSeeCost = this.session.can('products.cost');

  protected readonly categories = CATEGORIES;
  protected readonly genders = GENDERS;
  protected readonly moments = MOMENTS;
  protected readonly statusOptions = PRODUCT_STATUS_OPTIONS;
  protected readonly allSizes = SIZES;
  protected readonly presetColors = PRESET_COLORS;
  protected readonly badge = productBadge;

  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly uploading = signal(0);
  protected readonly product = signal<AdminProduct | null>(null);
  protected readonly draft = signal<ProductInput>(emptyProduct());
  private readonly original = signal(JSON.stringify(emptyProduct()));
  protected readonly touched = signal<Record<string, boolean>>({});
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly groupBy = signal<'color' | 'size'>('color');
  protected readonly selectedVariants = signal<ReadonlySet<string>>(new Set());
  protected readonly bulkPrice = signal<number | null>(null);
  protected readonly bulkStock = signal<number | null>(null);
  protected readonly newColor = signal({ name: '', hex: '#888888' });
  protected readonly dragIndex = signal<number | null>(null);

  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== this.original());

  /**
   * Stock of a saved variant changes only through an adjustment with a reason, so it has history
   * (6.4); the table types stock only for variants that do not exist yet.
   */
  private readonly savedVariantIds = computed(
    () => new Set(this.product()?.variants.map((variant) => variant.id) ?? []),
  );
  protected readonly canAdjustStock = this.session.can('inventory.adjust');
  protected stockLocked(variant: AdminVariant): boolean {
    return this.savedVariantIds().has(variant.id);
  }
  protected readonly bulkStockAllowed = computed(() =>
    [...this.selectedVariants()].some((id) => !this.savedVariantIds().has(id)),
  );

  protected readonly errors = computed(() => {
    const draft = this.draft();
    const errors: Record<string, string> = { ...this.serverErrors() };
    if (!draft.name.trim()) errors['name'] = 'Nhập tên sản phẩm.';
    if (!(draft.price > 0)) errors['price'] = 'Giá bán phải lớn hơn 0.';
    if (
      draft.compareAtPrice !== null &&
      draft.compareAtPrice > 0 &&
      draft.compareAtPrice <= draft.price
    )
      errors['compareAtPrice'] = 'Giá gốc phải cao hơn giá bán.';
    if (!draft.colors.length || !draft.sizes.length)
      errors['variants'] = 'Chọn ít nhất một màu và một size.';
    if (draft.status === 'active' && !draft.images.length)
      errors['images'] = 'Sản phẩm đang bán cần ít nhất một ảnh.';
    return errors;
  });

  protected readonly discount = computed(() => {
    const { price, compareAtPrice } = this.draft();
    return compareAtPrice && compareAtPrice > price && price > 0
      ? (compareAtPrice - price) / compareAtPrice
      : null;
  });
  protected readonly margin = computed(() => {
    const { price, cost } = this.draft();
    return cost && price > 0 ? (price - cost) / price : null;
  });
  protected readonly totalStock = computed(() =>
    this.draft().variants.reduce((sum, variant) => sum + variant.inventory, 0),
  );

  /** Variant table grouped by colour (default) or size, with per-group totals (6.3). */
  protected readonly groups = computed(() => {
    const { variants, colors, sizes } = this.draft();
    if (this.groupBy() === 'color') {
      return colors.map((color) => {
        const rows = sizes
          .map((size) =>
            variants.find((variant) => variant.color.name === color.name && variant.size === size),
          )
          .filter((row): row is AdminVariant => !!row);
        return {
          key: color.name,
          label: color.name,
          hex: color.hex,
          rows,
          stock: rows.reduce((sum, row) => sum + row.inventory, 0),
        };
      });
    }
    return sizes.map((size) => {
      const rows = colors
        .map((color) =>
          variants.find((variant) => variant.color.name === color.name && variant.size === size),
        )
        .filter((row): row is AdminVariant => !!row);
      return {
        key: size,
        label: `Size ${size}`,
        hex: '',
        rows,
        stock: rows.reduce((sum, row) => sum + row.inventory, 0),
      };
    });
  });

  protected readonly seoPreview = computed(() => {
    const draft = this.draft();
    return {
      title: draft.seoTitle || `${draft.name || 'Tên sản phẩm'} | nine2fine`,
      url: `nine2fine.vn/product/${draft.slug || slugify(draft.name) || 'ten-san-pham'}`,
      description:
        draft.seoDescription ||
        draft.description.slice(0, 155) ||
        'Mô tả ngắn hiện trên kết quả tìm kiếm.',
    };
  });

  constructor() {
    const id = this.id();
    if (id) {
      this.load(id);
      this.storefrontApi.collections().subscribe({
        next: (items) => this.collections.set(items),
        error: () => this.collections.set([]),
      });
    } else {
      const draft = emptyProduct();
      draft.variants = this.buildVariants(draft);
      this.reset(draft);
    }
  }

  toggleCollection(collectionId: string, on: boolean): void {
    const id = this.id();
    const current = this.collections();
    if (!id || !current) return;
    const ids = current
      .filter((item) => (item.id === collectionId ? on : item.productIds.includes(id)))
      .map((item) => item.id);
    this.storefrontApi.setProductCollections(id, ids).subscribe({
      next: (items) => {
        this.collections.set(items);
        const name = items.find((item) => item.id === collectionId)?.name;
        this.toast.show(on ? `Đã thêm vào ${name}` : `Đã bỏ khỏi ${name}`);
      },
      error: (error: unknown) => this.toast.error(errorMessage(error)),
    });
  }

  hasUnsavedChanges(): boolean {
    return this.canEdit && this.dirty() && !this.saving();
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  load(id: string): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.get(id).subscribe({
      next: (product) => {
        this.loading.set(false);
        this.product.set(product);
        this.reset(toInput(product));
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(errorMessage(error));
      },
    });
  }

  private reset(input: ProductInput): void {
    this.draft.set(structuredClone(input));
    this.original.set(JSON.stringify(input));
    this.touched.set({});
    this.serverErrors.set({});
    this.selectedVariants.set(new Set());
  }

  patch(change: Partial<ProductInput>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
    if (Object.keys(change).some((key) => this.serverErrors()[key])) {
      this.serverErrors.update((errors) => {
        const next = { ...errors };
        for (const key of Object.keys(change)) delete next[key];
        return next;
      });
    }
  }

  touch(field: string): void {
    this.touched.update((value) => ({ ...value, [field]: true }));
  }

  showError(field: string): string | null {
    return this.touched()[field] || this.serverErrors()[field]
      ? (this.errors()[field] ?? null)
      : null;
  }

  toggleIn(list: 'genders' | 'moments', value: string, on: boolean): void {
    const current = this.draft()[list];
    this.patch({ [list]: on ? [...current, value] : current.filter((item) => item !== value) });
  }

  // ---------- Images ----------

  upload(files: FileList | null): void {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      this.uploading.update((count) => count + 1);
      this.api.uploadImage(file).subscribe({
        next: (image) => {
          this.uploading.update((count) => count - 1);
          this.patch({ images: [...this.draft().images, image] });
        },
        error: (error: unknown) => {
          this.uploading.update((count) => count - 1);
          this.toast.error(errorMessage(error));
        },
      });
    }
  }

  removeImage(image: ProductImage): void {
    this.patch({ images: this.draft().images.filter((item) => item.id !== image.id) });
  }

  setImageColor(image: ProductImage, color: string): void {
    this.patch({
      images: this.draft().images.map((item) => (item.id === image.id ? { ...item, color } : item)),
    });
  }

  dropImage(target: number): void {
    const from = this.dragIndex();
    this.dragIndex.set(null);
    if (from === null || from === target) return;
    this.moveImage(from, target);
  }

  moveImage(from: number, to: number): void {
    const images = [...this.draft().images];
    if (to < 0 || to >= images.length) return;
    const [moved] = images.splice(from, 1);
    images.splice(to, 0, moved);
    this.patch({ images });
  }

  // ---------- Options and variants ----------

  toggleSize(size: string, on: boolean): void {
    const sizes = on
      ? SIZES.filter((item) => item === size || this.draft().sizes.includes(item))
      : this.draft().sizes.filter((item) => item !== size);
    this.applyOptions({ sizes });
  }

  addColor(color: { name: string; hex: string }): void {
    const name = color.name.trim();
    if (!name || this.draft().colors.some((item) => item.name.toLowerCase() === name.toLowerCase()))
      return;
    this.applyOptions({ colors: [...this.draft().colors, { name, hex: color.hex }] });
    this.newColor.set({ name: '', hex: '#888888' });
  }

  removeColor(name: string): void {
    this.applyOptions({ colors: this.draft().colors.filter((item) => item.name !== name) });
  }

  private applyOptions(change: Partial<Pick<ProductInput, 'colors' | 'sizes'>>): void {
    const next = { ...this.draft(), ...change };
    this.patch({ ...change, variants: this.buildVariants(next) });
  }

  /** Colour × size matrix; existing rows keep their SKU, price and stock. */
  private buildVariants(input: ProductInput): AdminVariant[] {
    const prefix = (
      slugify(input.name)
        .split('-')
        .map((part) => part[0])
        .join('') || 'sp'
    )
      .toUpperCase()
      .slice(0, 4);
    return input.colors.flatMap((color, colorIndex) =>
      input.sizes.map((size) => {
        const existing = input.variants.find(
          (variant) => variant.color.name === color.name && variant.size === size,
        );
        return (
          existing ?? {
            id: `new-${slugify(color.name)}-${size}-${Math.random().toString(36).slice(2, 7)}`,
            sku: `N2F-${prefix}-${colorIndex + 1}-${size}`,
            color,
            size,
            price: null,
            inventory: 0,
          }
        );
      }),
    );
  }

  updateVariant(id: string, change: Partial<AdminVariant>): void {
    this.patch({
      variants: this.draft().variants.map((variant) =>
        variant.id === id ? { ...variant, ...change } : variant,
      ),
    });
  }

  toggleVariant(id: string, on: boolean): void {
    const next = new Set(this.selectedVariants());
    if (on) next.add(id);
    else next.delete(id);
    this.selectedVariants.set(next);
  }

  toggleGroup(rows: AdminVariant[], on: boolean): void {
    const next = new Set(this.selectedVariants());
    for (const row of rows) {
      if (on) next.add(row.id);
      else next.delete(row.id);
    }
    this.selectedVariants.set(next);
  }

  groupChecked(rows: AdminVariant[]): boolean {
    return rows.length > 0 && rows.every((row) => this.selectedVariants().has(row.id));
  }

  applyBulk(): void {
    const ids = this.selectedVariants();
    const price = this.bulkPrice();
    const stock = this.bulkStock();
    this.patch({
      variants: this.draft().variants.map((variant) =>
        ids.has(variant.id)
          ? {
              ...variant,
              ...(price !== null ? { price: price > 0 ? price : null } : {}),
              ...(stock !== null && stock >= 0 && !this.stockLocked(variant)
                ? { inventory: Math.floor(stock) }
                : {}),
            }
          : variant,
      ),
    });
    this.toast.show(`Đã cập nhật ${ids.size} biến thể. Nhớ lưu sản phẩm.`);
    this.selectedVariants.set(new Set());
    this.bulkPrice.set(null);
    this.bulkStock.set(null);
  }

  /** Opens the same drawer as the Tồn kho page, then writes the new count into draft and baseline. */
  adjustStock(variant: AdminVariant): void {
    this.inventoryApi
      .list({
        view: 'all',
        search: variant.sku,
        page: 1,
        pageSize: 20,
        sort: '',
        dir: 'asc',
      })
      .subscribe({
        next: (page) => {
          const item = page.items.find((row) => row.variantId === variant.id);
          if (!item) {
            this.toast.error('Không tìm thấy biến thể trong tồn kho. Hãy lưu sản phẩm trước.');
            return;
          }
          this.dialogs
            .drawer<{ item: typeof item; canAdjust: boolean }, typeof item>(AdjustStockDrawer, {
              item,
              canAdjust: this.canAdjustStock,
            })
            .closed.subscribe((updated) => {
              if (!updated) return;
              const apply = (input: ProductInput): ProductInput => ({
                ...input,
                variants: input.variants.map((row) =>
                  row.id === variant.id ? { ...row, inventory: updated.onHand } : row,
                ),
              });
              this.original.set(JSON.stringify(apply(JSON.parse(this.original()) as ProductInput)));
              this.draft.update(apply);
              this.toast.show(`Đã cập nhật tồn kho ${updated.sku}: còn ${updated.onHand}`);
            });
        },
        error: (error: unknown) => this.toast.error(errorMessage(error)),
      });
  }

  // ---------- Save ----------

  discard(): void {
    this.reset(JSON.parse(this.original()) as ProductInput);
  }

  save(): void {
    this.touched.set({
      name: true,
      price: true,
      compareAtPrice: true,
      variants: true,
      images: true,
    });
    const local = { ...this.errors() };
    for (const key of Object.keys(this.serverErrors())) delete local[key];
    if (Object.keys(local).length) {
      this.toast.error(`Chưa lưu được: ${Object.values(local)[0]}`);
      return;
    }
    const draft = this.draft();
    const input: ProductInput = {
      ...draft,
      name: draft.name.trim(),
      slug: draft.slug || slugify(draft.name),
      compareAtPrice:
        draft.compareAtPrice && draft.compareAtPrice > 0 ? draft.compareAtPrice : null,
    };
    this.saving.set(true);
    const id = this.id();
    const request = id ? this.api.update(id, input) : this.api.create(input);
    request.subscribe({
      next: (product) => {
        this.saving.set(false);
        const saved = toInput(product);
        this.product.set(product);
        this.reset(saved);
        if (id) {
          this.toast.show('Đã lưu sản phẩm');
        } else {
          this.toast.show('Đã tạo sản phẩm');
          void this.router.navigate(['/admin/products', product.id], { replaceUrl: true });
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof AdminApiError && Object.keys(error.fields).length)
          this.serverErrors.set(error.fields);
        this.toast.error(errorMessage(error));
      },
    });
  }

  remove(): void {
    const product = this.product();
    if (!product) return;
    this.dialogs
      .confirm({
        title: `Xóa sản phẩm "${product.name}"?`,
        message:
          'Sản phẩm và toàn bộ biến thể, tồn kho sẽ bị xóa vĩnh viễn. Nếu chỉ muốn ngừng bán, hãy chuyển trạng thái sang "Đã ẩn".',
        confirmLabel: 'Xóa sản phẩm',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.remove(product.id).subscribe({
          next: () => {
            this.original.set(JSON.stringify(this.draft()));
            this.toast.show('Đã xóa sản phẩm');
            void this.router.navigateByUrl('/admin/products');
          },
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
      });
  }

  clearSelection(): void {
    this.selectedVariants.set(new Set());
  }

  protected readonly uploadSlots = computed(() =>
    Array.from({ length: this.uploading() }, (_, index) => index),
  );
  protected hasColor(name: string): boolean {
    return this.draft().colors.some((color) => color.name === name);
  }
  protected stockValue(value: unknown): number {
    return Math.max(0, Math.floor(this.numberOrNull(value) ?? 0));
  }

  protected readonly money = money;
  protected readonly percent = percent;
  protected readonly statusHelp = computed(
    () => PRODUCT_STATUS_OPTIONS.find((item) => item.value === this.draft().status)?.help ?? '',
  );
  protected readonly numberOrNull = (value: unknown): number | null =>
    value === '' || value === null || value === undefined ? null : Number(value);
}
