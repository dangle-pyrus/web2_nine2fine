import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { API_CONFIG } from '../../../core/api-config';
import { GENDERS, MOMENTS } from '../../../features/catalog/models/product';
import { AdminSession } from '../../core/admin-session';
import { money, percent, slugify } from '../../core/format';
import { NumPipe, DateTimePipe } from '../../core/format.pipes';
import { PRODUCT_STATUS_OPTIONS, productBadge } from '../../core/status';
import { ADMIN_INVENTORY_API, ADMIN_PRODUCTS_API } from '../../data-access/admin-apis';
import { ADMIN_CONTENT_API, type AdminCollection } from '../../data-access/content-api';
import { AdminCategories } from '../../data-access/admin-categories';
import { errorMessage, missingLabels } from '../../data-access/http-support';
import {
  AdminApiError,
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
import { ProductColorDialog, type ColorDialogData, type ColorOption } from './product-color-dialog';
import { AdmProductReviews } from './product-reviews-panel';
import {
  SaleScheduleDialog,
  type SaleScheduleData,
  type SaleScheduleResult,
} from './sale-schedule-dialog';

/** Sizes in garment order (6.3: never alphabetical). */
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
/** The API knows four sizes (BR-INV-19) and at most 8 colours, 12 images, 32 variants. */
const API_SIZES = ['S', 'M', 'L', 'XL'];
const MAX_COLORS = 8;
const MAX_IMAGES = 12;
const MAX_VARIANTS = 32;
const PRESET_COLORS = [
  { name: 'Đen', hex: '#242323' },
  { name: 'Trắng', hex: '#f5f4f0' },
  { name: 'Xám', hex: '#96958f' },
  { name: 'Be', hex: '#d8cbb5' },
  { name: 'Đỏ', hex: '#a91e2c' },
  { name: 'Xanh navy', hex: '#1f2a44' },
];

const SALE_MAX_DAYS = 89;

/** Client checks of the sale fields (BR-PROMO-01); the server repeats them and has the last word. */
function saleErrors(draft: ProductInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const { salePrice, saleStartsAt, saleEndsAt } = draft;
  if (salePrice == null && !saleStartsAt && !saleEndsAt) return errors;
  if (salePrice == null) errors['salePrice'] = 'Nhập giá giảm.';
  else if (salePrice < 1000 || salePrice >= draft.price)
    errors['salePrice'] = 'Giá giảm từ 1.000 ₫ và thấp hơn giá bán.';
  if (!saleStartsAt) errors['saleStartsAt'] = 'Chọn ngày bắt đầu.';
  if (!saleEndsAt) errors['saleEndsAt'] = 'Chọn ngày kết thúc.';
  if (saleStartsAt && saleEndsAt) {
    const days = (Date.parse(saleEndsAt) - Date.parse(saleStartsAt)) / 86_400_000;
    if (days < 0) errors['saleEndsAt'] = 'Ngày kết thúc phải từ ngày bắt đầu trở đi.';
    else if (days > SALE_MAX_DAYS) errors['saleEndsAt'] = 'Đợt giảm giá tối đa 90 ngày.';
  }
  return errors;
}

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
  // `updatedAt` stays: it is the version the API checks on save (BR-INV-05).
  const input: Partial<AdminProduct> = { ...product };
  delete input.id;
  delete input.createdAt;
  delete input.published;
  delete input.slugLocked;
  delete input.updatedBy;
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
    AdmProductReviews,
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
  private readonly contentApi = inject(ADMIN_CONTENT_API);
  /** Collections are saved on their own, straight away (not part of the product form). */
  protected readonly collections = signal<AdminCollection[] | null>(null);
  protected readonly categoryList = inject(AdminCategories);
  protected readonly categoryLabel = computed(() => {
    const value = this.draft().category;
    return this.categoryList.items().find((item) => item.value === value)?.label ?? '';
  });
  /** Slice 6: the screen runs on the API, so the Won't fields are hidden (S6-Q7). */
  protected readonly contract = inject(API_CONFIG).adminCatalogMode === 'http';
  protected readonly id = routeParam('id');
  protected readonly isNew = computed(() => !this.id());
  protected readonly canEdit = this.session.can('products.edit');
  /** Slice 10: the sale fields need `promotions.edit` as well (admin only, BR-PROMO-05). */
  protected readonly canSale = this.contract && this.session.can('promotions.edit');
  protected readonly canSeeCost = !this.contract && this.session.can('products.cost');

  protected readonly genders = GENDERS;
  protected readonly moments = MOMENTS;
  protected readonly statusOptions = PRODUCT_STATUS_OPTIONS;
  protected readonly allSizes = this.contract ? API_SIZES : SIZES;
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
  protected readonly dragIndex = signal<number | null>(null);
  /** A message that stays until the next save or reload (version conflict, publish gaps). */
  protected readonly notice = signal<
    { kind: 'conflict' } | { kind: 'publish'; missing: string[] } | null
  >(null);

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

  protected readonly errors = computed(() => {
    const draft = this.draft();
    const errors: Record<string, string> = { ...this.serverErrors() };
    if (!draft.name.trim()) errors['name'] = 'Nhập tên sản phẩm.';
    if (!(draft.price > 0)) errors['price'] = 'Giá bán phải lớn hơn 0.';
    if (this.contract) {
      if (draft.name.length > 120) errors['name'] = 'Tên tối đa 120 ký tự.';
      if (draft.price > 0 && (draft.price < 1000 || draft.price > 100_000_000))
        errors['price'] = 'Giá bán từ 1.000 đến 100.000.000 ₫.';
      if (draft.compareAtPrice !== null && draft.compareAtPrice > 100_000_000)
        errors['compareAtPrice'] = 'Giá gốc tối đa 100.000.000 ₫.';
      if (!draft.type.trim()) errors['type'] = 'Loại sản phẩm từ 1 đến 120 ký tự.';
      else if (draft.type.length > 120) errors['type'] = 'Loại sản phẩm từ 1 đến 120 ký tự.';
      if (!draft.genders.length) errors['genders'] = 'Chọn ít nhất một giới tính.';
      if (!draft.moments.length) errors['moments'] = 'Chọn ít nhất một dịp mặc.';
      if (draft.variants.length > MAX_VARIANTS)
        errors['variants'] = `Tối đa ${MAX_VARIANTS} biến thể.`;
    }
    if (
      draft.compareAtPrice !== null &&
      draft.compareAtPrice > 0 &&
      draft.compareAtPrice <= draft.price
    )
      errors['compareAtPrice'] = 'Giá gốc phải cao hơn giá bán.';
    if (this.canSale) Object.assign(errors, saleErrors(draft), this.serverErrors());
    if (!draft.colors.length || !draft.sizes.length)
      errors['variants'] = 'Chọn ít nhất một màu và một size.';
    // On the API the server answers `publish-incomplete` with the whole list (BR-INV-14).
    if (!this.contract && draft.status === 'active' && !draft.images.length)
      errors['images'] = 'Sản phẩm đang bán cần ít nhất một ảnh.';
    return errors;
  });

  /** Sale percent as the server shows it to shoppers: floor((1 - sale / price) x 100). */
  protected readonly saleDiscount = computed(() => {
    const { price, salePrice } = this.draft();
    return salePrice && price > 0 && salePrice < price
      ? Math.floor((1 - salePrice / price) * 100)
      : null;
  });
  protected readonly hasSale = computed(() => {
    const { salePrice, saleStartsAt, saleEndsAt } = this.draft();
    return salePrice != null || !!saleStartsAt || !!saleEndsAt;
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
    this.categoryList.load();
    const id = this.id();
    if (id) {
      this.load(id);
      // Collections are not in the API (S6-Q7): the section is hidden there.
      if (!this.contract)
        this.contentApi.collections().subscribe({
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
    const target = this.collections()?.find((item) => item.id === collectionId);
    if (!id || !target) return;
    const productIds = on
      ? [...target.productIds.filter((value) => value !== id), id]
      : target.productIds.filter((value) => value !== id);
    this.contentApi
      .updateCollection(
        target.id,
        {
          name: target.name,
          slug: target.slug,
          description: target.description,
          status: target.status,
          productIds,
        },
        target.updatedAt,
      )
      .subscribe({
        next: (saved) => {
          this.collections.update((items) =>
            (items ?? []).map((item) => (item.id === saved.id ? saved : item)),
          );
          this.toast.show(on ? `Đã thêm vào ${saved.name}` : `Đã bỏ khỏi ${saved.name}`);
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
    this.notice.set(null);
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
  }

  patch(change: Partial<ProductInput>): void {
    this.draft.update((draft) => {
      const next = { ...draft, ...change };
      // SKUs the user has not typed follow the product name (until they are saved).
      if (change.name !== undefined && !change.variants && this.autoSkus.size) {
        next.variants = next.variants.map((variant) => {
          if (!this.autoSkus.has(variant.id)) return variant;
          const colorIndex = Math.max(
            0,
            next.colors.findIndex((color) => color.name === variant.color.name),
          );
          return { ...variant, sku: this.autoSku(next.name, colorIndex, variant.size) };
        });
      }
      return next;
    });
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
    if (
      this.contract &&
      this.draft().images.length + this.uploading() + files.length > MAX_IMAGES
    ) {
      this.toast.error(`Mỗi sản phẩm tối đa ${MAX_IMAGES} ảnh.`);
      return;
    }
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

  pickColors(): void {
    this.dialogs
      .modal<ColorDialogData, ColorOption[]>(ProductColorDialog, {
        presets: PRESET_COLORS,
        taken: this.draft().colors.map((color) => color.name),
      })
      .closed.subscribe((colors) => colors?.forEach((color) => this.addColor(color)));
  }

  addColor(color: ColorOption): void {
    const name = color.name.trim();
    if (!name || this.draft().colors.some((item) => item.name.toLowerCase() === name.toLowerCase()))
      return;
    if (this.contract && this.draft().colors.length >= MAX_COLORS) {
      this.toast.error(`Tối đa ${MAX_COLORS} màu cho một sản phẩm.`);
      return;
    }
    this.applyOptions({ colors: [...this.draft().colors, { name, hex: color.hex }] });
  }

  removeColor(name: string): void {
    this.applyOptions({ colors: this.draft().colors.filter((item) => item.name !== name) });
  }

  private applyOptions(change: Partial<Pick<ProductInput, 'colors' | 'sizes'>>): void {
    const next = { ...this.draft(), ...change };
    this.patch({ ...change, variants: this.buildVariants(next) });
  }

  /** Ids of variants whose SKU was generated here and not yet edited by hand. */
  private readonly autoSkus = new Set<string>();
  /** Short random part so two products with the same initials never share SKUs. */
  private readonly skuSuffix = Array.from(
    { length: 4 },
    () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)],
  ).join('');

  private autoSku(name: string, colorIndex: number, size: string): string {
    const prefix =
      slugify(name)
        .split('-')
        .map((part) => part[0] ?? '')
        .join('')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4) || 'SP';
    return `N2F-${prefix}-${this.skuSuffix}-${colorIndex + 1}-${size}`;
  }

  /** Colour × size matrix; existing rows keep their SKU, price and stock. */
  private buildVariants(input: ProductInput): AdminVariant[] {
    return input.colors.flatMap((color, colorIndex) =>
      input.sizes.map((size) => {
        const existing = input.variants.find(
          (variant) => variant.color.name === color.name && variant.size === size,
        );
        if (existing) return existing;
        const id = `new-${slugify(color.name)}-${size}-${Math.random().toString(36).slice(2, 7)}`;
        this.autoSkus.add(id);
        return {
          id,
          sku: this.autoSku(input.name, colorIndex, size),
          color,
          size,
          price: null,
          inventory: 0,
        };
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

  /** Opens the same drawer as the Tồn kho page, then writes the new count into draft and baseline. */
  adjustStock(variant: AdminVariant): void {
    this.inventoryApi
      .list({
        view: 'all',
        category: '',
        color: '',
        size: '',
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
                  row.id === variant.id
                    ? { ...row, inventory: this.contract ? updated.available : updated.onHand }
                    : row,
                ),
              });
              this.original.set(JSON.stringify(apply(JSON.parse(this.original()) as ProductInput)));
              this.draft.update(apply);
              this.toast.show(
                `Đã cập nhật tồn kho ${updated.sku}: còn ${this.contract ? updated.available : updated.onHand}`,
              );
            });
        },
        error: (error: unknown) => this.toast.error(errorMessage(error)),
      });
  }

  // ---------- Save ----------

  discard(): void {
    this.notice.set(null);
    this.reset(JSON.parse(this.original()) as ProductInput);
  }

  /** ADM-PRD-10: saving a product as "Đã ẩn" takes it off the shop, so it asks first. */
  save(): void {
    const before = (JSON.parse(this.original()) as ProductInput).status;
    if (this.id() && before !== 'hidden' && this.draft().status === 'hidden') {
      this.dialogs
        .confirm({
          title: `Ẩn sản phẩm "${this.draft().name}"?`,
          message:
            'Sản phẩm sẽ không hiện trên cửa hàng và khách không mua được nữa. Bạn có thể chuyển lại "Đang bán" bất cứ lúc nào.',
          confirmLabel: 'Ẩn sản phẩm',
          danger: true,
        })
        .subscribe((ok) => {
          if (ok) this.persist();
        });
      return;
    }
    this.persist();
  }

  private persist(): void {
    this.touched.set({
      name: true,
      price: true,
      compareAtPrice: true,
      salePrice: true,
      saleStartsAt: true,
      saleEndsAt: true,
      variants: true,
      images: true,
      type: true,
      genders: true,
      moments: true,
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
      // The API makes the slug from the name when it is left empty (and numbers a clash).
      slug: this.contract ? draft.slug.trim() : draft.slug || slugify(draft.name),
      compareAtPrice:
        draft.compareAtPrice && draft.compareAtPrice > 0 ? draft.compareAtPrice : null,
    };
    this.saving.set(true);
    this.notice.set(null);
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
        this.showSaveError(error);
      },
    });
  }

  /** Field errors under their field, version conflict and publish gaps as a banner (BR-INV-05, 14). */
  private showSaveError(error: unknown): void {
    if (error instanceof AdminApiError) {
      if (error.code === 'version-conflict') this.notice.set({ kind: 'conflict' });
      if (error.code === 'publish-incomplete')
        this.notice.set({ kind: 'publish', missing: error.detail.missing ?? [] });
      const fields: Record<string, string> = {};
      for (const [key, message] of Object.entries(error.fields)) {
        // A problem in one row of the variant table (variants[2].sku) shows above the table.
        fields[key.startsWith('variants[') ? 'variants' : key] = message;
      }
      if (Object.keys(fields).length) this.serverErrors.set(fields);
    }
    this.toast.error(errorMessage(error));
  }

  /** Thời hạn giảm giá nằm trong hộp thoại riêng; "Gỡ đợt giảm" bỏ cả ba trường. */
  editSale(): void {
    const { saleStartsAt, saleEndsAt } = this.draft();
    this.dialogs
      .modal<SaleScheduleData, SaleScheduleResult>(SaleScheduleDialog, {
        startsAt: saleStartsAt ?? null,
        endsAt: saleEndsAt ?? null,
        canRemove: this.hasSale(),
      })
      .closed.subscribe((result) => {
        if (!result) return;
        if (result === 'remove') this.removeSale();
        else this.patch({ saleStartsAt: result.startsAt, saleEndsAt: result.endsAt });
        this.touch('saleStartsAt');
        this.touch('saleEndsAt');
      });
  }

  /** "Gỡ đợt giảm": all three fields `null` removes the sale (BR-PROMO-05). */
  removeSale(): void {
    this.patch({ salePrice: null, saleStartsAt: null, saleEndsAt: null });
  }

  protected readonly missingText = (missing: string[]): string => missingLabels(missing).join(', ');

  protected readonly uploadSlots = computed(() =>
    Array.from({ length: this.uploading() }, (_, index) => index),
  );
  protected variantAt(color: string, size: string): AdminVariant | undefined {
    return this.draft().variants.find(
      (variant) => variant.color.name === color && variant.size === size,
    );
  }
  protected dmy(value: string | null | undefined): string {
    return value ? value.split('-').reverse().join('/') : '';
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
