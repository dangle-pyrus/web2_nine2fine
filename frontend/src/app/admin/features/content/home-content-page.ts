import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminSession } from '../../core/admin-session';
import { ADMIN_STOREFRONT_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { LandingBlock, LandingContent } from '../../data-access/models';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmSaveBar } from '../../ui/save-bar';
import { AdminToastService } from '../../ui/toast';
import { HasUnsavedChanges } from '../../ui/unsaved-changes';
import { MediaPicker, mediaSrc } from './media-picker';

type Campaign = Extract<LandingBlock, { kind: 'campaign' }>;
type Edit = Extract<LandingBlock, { kind: 'products' }>;
type Shop = Extract<LandingBlock, { kind: 'shop' }>;

const KIND_LABELS: Record<LandingBlock['kind'], string> = {
  campaign: 'Banner',
  products: 'Gợi ý phối đồ',
  shop: 'Dải sản phẩm',
  categories: 'Danh mục',
};

const SORTS: { value: Shop['sort']; label: string }[] = [
  { value: 'bestselling', label: 'Bán chạy' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'featured', label: 'Nổi bật' },
  { value: 'price-asc', label: 'Giá thấp đến cao' },
];

/** Storefront routes offered as link suggestions; any path still works. */
const LINKS = [
  '/shop',
  '/new-in',
  '/shop/tops',
  '/shop/bottoms',
  '/shop/dresses',
  '/shop/outerwear',
  '/shop-by-moment/work',
  '/shop-by-moment/dinner',
  '/shop-by-moment/event',
  '/shop-by-moment/weekend',
];

/**
 * Nội dung trang chủ (Đợt 3): the storefront home blocks in order. Reorder, show/hide and edit
 * text, links and images; saving updates the shop's home page in the same browser tab.
 */
@Component({
  selector: 'adm-home-content-page',
  imports: [
    FormsModule,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    AdmPageHeader,
    AdmIcon,
    AdmEmptyState,
    AdmSaveBar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <adm-page-header heading="Nội dung trang chủ">
      <p subtitle class="secondary small">Thứ tự và nội dung các khối trên trang chủ cửa hàng.</p>
      <ng-container actions>
        <a class="adm-btn adm-btn--lg" href="/" target="_blank" rel="noopener">
          <adm-icon name="reiconEye" [size]="16" /> Xem trang chủ
        </a>
        @if (canEdit) {
          <button type="button" class="adm-btn adm-btn--lg" [cdkMenuTriggerFor]="addMenu">
            <adm-icon name="reiconPlus" [size]="16" /> Thêm khối
          </button>
          <button
            type="button"
            class="adm-btn adm-btn--lg adm-btn--icon"
            aria-label="Thao tác khác"
            [cdkMenuTriggerFor]="moreMenu"
          >
            <adm-icon name="reiconMoreH" [size]="16" />
          </button>
        }
      </ng-container>
    </adm-page-header>
    <adm-save-bar
      [visible]="canEdit && dirty()"
      [saving]="saving()"
      label="Trang chủ chưa được lưu"
      saveLabel="Lưu và đăng"
      (save)="save()"
      (discard)="discard()"
    />

    <ng-template #addMenu>
      <div class="adm">
        <div class="menu" cdkMenu>
          <button cdkMenuItem type="button" (click)="add('campaign')">
            <adm-icon name="reiconGalleryAdd" [size]="16" /> Banner
          </button>
          <button cdkMenuItem type="button" (click)="add('shop')">
            <adm-icon name="reiconTshirt" [size]="16" /> Dải sản phẩm
          </button>
          <button cdkMenuItem type="button" (click)="add('products')">
            <adm-icon name="reiconWidget" [size]="16" /> Gợi ý phối đồ (4 ảnh)
          </button>
        </div>
      </div>
    </ng-template>
    <ng-template #moreMenu>
      <div class="adm">
        <div class="menu" cdkMenu>
          <button cdkMenuItem type="button" class="danger" (click)="reset()">
            <adm-icon name="reiconUndo" [size]="16" /> Khôi phục nội dung mặc định
          </button>
        </div>
      </div>
    </ng-template>

    @if (loadError(); as message) {
      <adm-empty kind="error" heading="Không tải được nội dung" [description]="message">
        <button type="button" class="adm-btn" (click)="load()">Thử lại</button>
      </adm-empty>
    } @else if (draft(); as content) {
      <div class="columns">
        <div class="col-main">
          <section class="section" aria-labelledby="blocks-title">
            <header>
              <h2 id="blocks-title">Các khối ({{ content.blocks.length }})</h2>
              <span class="small secondary">{{ shownCount() }} đang hiển thị</span>
            </header>
            <ol class="blocks">
              @for (block of content.blocks; track block.id; let i = $index; let last = $last) {
                <li class="block" [class.is-off]="block.enabled === false">
                  <div class="block-row">
                    <div class="order">
                      <button
                        type="button"
                        class="adm-btn adm-btn--icon adm-btn--sm adm-btn--ghost"
                        [attr.aria-label]="'Đưa lên: ' + title(block)"
                        [disabled]="!canEdit || i === 0"
                        (click)="move(i, -1)"
                      >
                        <adm-icon name="reiconChevronUp" [size]="16" />
                      </button>
                      <button
                        type="button"
                        class="adm-btn adm-btn--icon adm-btn--sm adm-btn--ghost"
                        [attr.aria-label]="'Đưa xuống: ' + title(block)"
                        [disabled]="!canEdit || last"
                        (click)="move(i, 1)"
                      >
                        <adm-icon name="reiconChevronDown" [size]="16" />
                      </button>
                    </div>
                    @if (preview(block); as src) {
                      <img class="thumb thumb--wide" [src]="src" alt="" />
                    } @else {
                      <span class="thumb thumb--wide thumb--icon"
                        ><adm-icon [name]="icon(block)" [size]="18"
                      /></span>
                    }
                    <button
                      type="button"
                      class="block-main"
                      [attr.aria-expanded]="open() === block.id"
                      (click)="toggle(block.id)"
                    >
                      <span class="small secondary">{{ kinds[block.kind] }}</span>
                      <span class="cell-title">{{ title(block) }}</span>
                    </button>
                    <input
                      type="checkbox"
                      class="toggle"
                      [attr.aria-label]="(block.enabled === false ? 'Hiện ' : 'Ẩn ') + title(block)"
                      [checked]="block.enabled !== false"
                      [disabled]="!canEdit"
                      (change)="patch(i, { enabled: $any($event.target).checked })"
                    />
                  </div>

                  @if (open() === block.id) {
                    <fieldset class="editor" [disabled]="!canEdit">
                      @switch (block.kind) {
                        @case ('campaign') {
                          <div class="form-grid">
                            <div class="field">
                              <label [for]="block.id + '-eyebrow'">Dòng nhỏ phía trên</label>
                              <input
                                class="input"
                                [id]="block.id + '-eyebrow'"
                                [ngModel]="asCampaign(block).eyebrow"
                                (ngModelChange)="patch(i, { eyebrow: $event })"
                              />
                            </div>
                            <div class="field">
                              <label class="req" [for]="block.id + '-title'">Tiêu đề</label>
                              <input
                                class="input"
                                [id]="block.id + '-title'"
                                [ngModel]="asCampaign(block).title"
                                (ngModelChange)="patch(i, { title: $event })"
                                [attr.aria-invalid]="!asCampaign(block).title.trim()"
                              />
                              @if (!asCampaign(block).title.trim()) {
                                <p class="error">Nhập tiêu đề.</p>
                              }
                            </div>
                          </div>
                          <div class="field">
                            <label [for]="block.id + '-desc'">Mô tả</label>
                            <textarea
                              class="textarea"
                              rows="2"
                              [id]="block.id + '-desc'"
                              [ngModel]="asCampaign(block).description"
                              (ngModelChange)="patch(i, { description: $event })"
                            ></textarea>
                            <p class="hint">Xuống dòng sẽ giữ nguyên trên trang chủ.</p>
                          </div>
                          <div class="field">
                            <label [for]="block.id + '-href'">Liên kết khi bấm</label>
                            <input
                              class="input mono"
                              list="adm-links"
                              [id]="block.id + '-href'"
                              [ngModel]="asCampaign(block).href"
                              (ngModelChange)="patch(i, { href: $event })"
                            />
                          </div>
                          <div class="images">
                            <div>
                              <p class="small secondary">Ảnh máy tính</p>
                              <button
                                type="button"
                                class="image-pick"
                                (click)="pick(i, 'mediaId', asCampaign(block).mediaId)"
                              >
                                <img [src]="src(asCampaign(block).mediaId)" alt="" />
                                <span class="adm-btn adm-btn--sm">Đổi ảnh</span>
                              </button>
                            </div>
                            <div>
                              <p class="small secondary">Ảnh điện thoại</p>
                              <button
                                type="button"
                                class="image-pick image-pick--tall"
                                (click)="pick(i, 'mobileMediaId', asCampaign(block).mobileMediaId)"
                              >
                                <img [src]="src(asCampaign(block).mobileMediaId)" alt="" />
                                <span class="adm-btn adm-btn--sm">Đổi ảnh</span>
                              </button>
                            </div>
                          </div>
                        }
                        @case ('shop') {
                          <div class="form-grid">
                            <div class="field">
                              <label class="req" [for]="block.id + '-label'">Tên dải</label>
                              <input
                                class="input"
                                [id]="block.id + '-label'"
                                [ngModel]="asShop(block).label"
                                (ngModelChange)="patch(i, { label: $event })"
                              />
                            </div>
                            <div class="field">
                              <label [for]="block.id + '-sort'">Sản phẩm hiển thị</label>
                              <select
                                class="select"
                                [id]="block.id + '-sort'"
                                [ngModel]="asShop(block).sort"
                                (ngModelChange)="patch(i, { sort: $event })"
                              >
                                @for (item of sorts; track item.value) {
                                  <option [value]="item.value">{{ item.label }}</option>
                                }
                              </select>
                            </div>
                          </div>
                          <div class="field">
                            <label [for]="block.id + '-href'">Liên kết "Xem tất cả"</label>
                            <input
                              class="input mono"
                              list="adm-links"
                              [id]="block.id + '-href'"
                              [ngModel]="asShop(block).href"
                              (ngModelChange)="patch(i, { href: $event })"
                            />
                          </div>
                        }
                        @case ('products') {
                          <div class="field">
                            <label class="req" [for]="block.id + '-label'">Tên khối</label>
                            <input
                              class="input"
                              [id]="block.id + '-label'"
                              [ngModel]="asEdit(block).label"
                              (ngModelChange)="patch(i, { label: $event })"
                            />
                          </div>
                          <div class="cards">
                            @for (card of asEdit(block).cards; track $index; let j = $index) {
                              <div class="card">
                                <button
                                  type="button"
                                  class="image-pick image-pick--tall"
                                  [attr.aria-label]="'Đổi ảnh thẻ ' + (j + 1)"
                                  (click)="pickCard(i, j, card.mediaId)"
                                >
                                  <img [src]="src(card.mediaId)" alt="" />
                                  <span class="adm-btn adm-btn--sm">Đổi ảnh</span>
                                </button>
                                <input
                                  class="input input--sm"
                                  [attr.aria-label]="'Tiêu đề thẻ ' + (j + 1)"
                                  placeholder="Tiêu đề"
                                  [ngModel]="card.title"
                                  (ngModelChange)="patchCard(i, j, { title: $event })"
                                />
                                <input
                                  class="input input--sm"
                                  [attr.aria-label]="'Chú thích thẻ ' + (j + 1)"
                                  placeholder="Chú thích"
                                  [ngModel]="card.caption"
                                  (ngModelChange)="patchCard(i, j, { caption: $event })"
                                />
                                <input
                                  class="input input--sm mono"
                                  list="adm-links"
                                  [attr.aria-label]="'Liên kết thẻ ' + (j + 1)"
                                  placeholder="/shop"
                                  [ngModel]="card.href"
                                  (ngModelChange)="patchCard(i, j, { href: $event })"
                                />
                              </div>
                            }
                          </div>
                        }
                        @case ('categories') {
                          <p class="secondary">
                            Khối này hiển thị các danh mục bên cạnh. Sửa tên, ảnh và liên kết ở cột
                            phải.
                          </p>
                        }
                      }
                      @if (block.kind !== 'categories') {
                        <div class="editor-foot">
                          <button
                            type="button"
                            class="adm-btn adm-btn--sm adm-btn--ghost danger"
                            (click)="remove(i)"
                          >
                            <adm-icon name="reiconTrash" [size]="16" /> Xóa khối
                          </button>
                        </div>
                      }
                    </fieldset>
                  }
                </li>
              }
            </ol>
          </section>
        </div>

        <aside class="col-side">
          <section class="section" aria-labelledby="cats-title">
            <header><h2 id="cats-title">Danh mục nổi bật</h2></header>
            <fieldset class="cats" [disabled]="!canEdit">
              @for (cat of content.categories; track $index; let j = $index) {
                <div class="cat">
                  <button
                    type="button"
                    class="image-pick image-pick--square"
                    [attr.aria-label]="'Đổi ảnh danh mục ' + cat.label"
                    (click)="pickCategory(j, cat.mediaId)"
                  >
                    <img [src]="src(cat.mediaId)" alt="" />
                  </button>
                  <div class="cat-fields">
                    <input
                      class="input input--sm"
                      [attr.aria-label]="'Tên danh mục ' + (j + 1)"
                      [ngModel]="cat.label"
                      (ngModelChange)="patchCategory(j, { label: $event })"
                    />
                    <input
                      class="input input--sm mono"
                      list="adm-links"
                      [attr.aria-label]="'Liên kết danh mục ' + (j + 1)"
                      [ngModel]="cat.href"
                      (ngModelChange)="patchCategory(j, { href: $event })"
                    />
                  </div>
                </div>
              }
            </fieldset>
          </section>
          <section class="section">
            <header><h2>Lưu ý</h2></header>
            <p class="secondary small">
              Đây là chức năng chỉ có ở giao diện, chạy trên dữ liệu mẫu. Thay đổi hiển thị ngay
              trên trang chủ ở cùng trình duyệt, chưa lưu lên máy chủ.
            </p>
          </section>
        </aside>
      </div>
      <datalist id="adm-links">
        @for (link of links; track link) {
          <option [value]="link"></option>
        }
      </datalist>
    } @else {
      <div class="page-body"><span class="sk sk--title"></span></div>
    }
  `,
  styles: `
    .blocks {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .block {
      border-bottom: 1px solid var(--adm-divider);
      &.is-off .block-row {
        opacity: 0.5;
      }
    }
    .block-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
    }
    .order {
      display: flex;
      flex-direction: column;
      .adm-btn:disabled {
        visibility: hidden;
      }
    }
    .thumb--wide {
      width: 72px;
      height: 44px;
      object-fit: cover;
    }
    .thumb--icon {
      display: grid;
      place-items: center;
      background: var(--adm-muted);
      color: var(--adm-text-secondary);
    }
    .block-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
      border: 0;
      background: none;
      padding: 4px 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      .cell-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }
    }
    .editor {
      border: 0;
      margin: 0 0 16px;
      padding: 16px;
      border-radius: var(--adm-radius-lg);
      background: var(--adm-muted);
      display: grid;
      gap: 16px;
    }
    .editor-foot {
      display: flex;
      justify-content: flex-end;
    }
    .danger {
      color: var(--adm-danger);
    }
    .hint {
      margin-top: 4px;
      font-size: 12px;
      color: var(--adm-text-tertiary);
    }
    .images {
      display: grid;
      grid-template-columns: 2fr 1fr;
      align-items: start;
      gap: 12px;
    }
    .image-pick {
      position: relative;
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      padding: 0;
      border: 1px solid var(--adm-divider);
      border-radius: var(--adm-radius-md);
      overflow: hidden;
      background: var(--adm-raised);
      cursor: pointer;
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .adm-btn {
        position: absolute;
        right: 8px;
        bottom: 8px;
        background: var(--adm-raised);
      }
    }
    .image-pick--tall {
      aspect-ratio: 4 / 5;
    }
    .image-pick--square {
      width: 56px;
      height: 56px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px;
    }
    .card {
      display: grid;
      gap: 6px;
    }
    .cats {
      border: 0;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 12px;
    }
    .cat {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
    }
    .cat-fields {
      display: grid;
      gap: 6px;
    }
    @media (max-width: 767px) {
      .images {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class HomeContentPage implements HasUnsavedChanges {
  private readonly api = inject(ADMIN_STOREFRONT_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  protected readonly canEdit = inject(AdminSession).can('products.edit');
  protected readonly kinds = KIND_LABELS;
  protected readonly sorts = SORTS;
  protected readonly links = LINKS;
  protected readonly src = mediaSrc;

  protected readonly draft = signal<LandingContent | null>(null);
  private readonly original = signal('');
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly open = signal<string | null>(null);
  protected readonly dirty = computed(() => {
    const draft = this.draft();
    return !!draft && JSON.stringify(draft) !== this.original();
  });
  protected readonly shownCount = computed(
    () => this.draft()?.blocks.filter((block) => block.enabled !== false).length ?? 0,
  );

  constructor() {
    this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.canEdit && this.dirty() && !this.saving();
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  load(): void {
    this.loadError.set('');
    this.api.getHome().subscribe({
      next: (content) => this.apply(content),
      error: (error: unknown) => this.loadError.set(errorMessage(error)),
    });
  }

  title(block: LandingBlock): string {
    switch (block.kind) {
      case 'campaign':
        return block.title || '(Chưa có tiêu đề)';
      case 'categories':
        return 'Danh mục nổi bật';
      default:
        return block.label || '(Chưa có tên)';
    }
  }

  preview(block: LandingBlock): string {
    if (block.kind === 'campaign') return mediaSrc(block.mediaId);
    if (block.kind === 'products') return mediaSrc(block.cards[0]?.mediaId);
    return '';
  }

  icon(block: LandingBlock): string {
    return block.kind === 'shop' ? 'reiconTshirt' : 'reiconWidget';
  }

  asCampaign(block: LandingBlock): Campaign {
    return block as Campaign;
  }
  asShop(block: LandingBlock): Shop {
    return block as Shop;
  }
  asEdit(block: LandingBlock): Edit {
    return block as Edit;
  }

  toggle(id: string): void {
    this.open.update((value) => (value === id ? null : id));
  }

  patch(index: number, changes: Partial<Campaign> | Partial<Shop> | Partial<Edit>): void {
    this.update((content) => {
      content.blocks[index] = { ...content.blocks[index], ...changes } as LandingBlock;
    });
  }

  patchCard(index: number, card: number, changes: Partial<Edit['cards'][number]>): void {
    this.update((content) => {
      const block = content.blocks[index] as Edit;
      block.cards[card] = { ...block.cards[card], ...changes };
    });
  }

  patchCategory(index: number, changes: Partial<LandingContent['categories'][number]>): void {
    this.update((content) => {
      content.categories[index] = { ...content.categories[index], ...changes };
    });
  }

  move(index: number, direction: 1 | -1): void {
    this.update((content) => {
      const [block] = content.blocks.splice(index, 1);
      content.blocks.splice(index + direction, 0, block);
    });
  }

  add(kind: 'campaign' | 'shop' | 'products'): void {
    const id = `${kind}-${Date.now().toString(36)}`;
    const block: LandingBlock =
      kind === 'campaign'
        ? {
            kind,
            id,
            eyebrow: '',
            title: 'Banner mới',
            description: '',
            href: '/shop',
            mediaId: 'uniqlo-campaign-01',
            mobileMediaId: 'uniqlo-campaign-01',
          }
        : kind === 'shop'
          ? { kind, id, label: 'Dải sản phẩm mới', sort: 'newest', href: '/new-in' }
          : {
              kind,
              id,
              label: 'Gợi ý phối đồ',
              cards: Array.from({ length: 4 }, () => ({
                title: '',
                caption: '',
                href: '/shop',
                mediaId: 'uniqlo-product-1-1-09',
              })),
            };
    this.update((content) => content.blocks.unshift(block));
    this.open.set(id);
  }

  remove(index: number): void {
    const block = this.draft()?.blocks[index];
    if (!block) return;
    this.dialogs
      .confirm({
        title: `Xóa khối "${this.title(block)}"?`,
        message:
          'Khối sẽ biến khỏi trang chủ sau khi bạn lưu. Nếu chỉ muốn tạm ẩn, hãy tắt công tắc.',
        confirmLabel: 'Xóa khối',
        danger: true,
      })
      .subscribe((ok) => ok && this.update((content) => content.blocks.splice(index, 1)));
  }

  pick(index: number, key: 'mediaId' | 'mobileMediaId', current: string): void {
    this.choose(current, (mediaId) => this.patch(index, { [key]: mediaId }));
  }

  pickCard(index: number, card: number, current: string): void {
    this.choose(current, (mediaId) => this.patchCard(index, card, { mediaId }));
  }

  pickCategory(index: number, current: string): void {
    this.choose(current, (mediaId) => this.patchCategory(index, { mediaId }));
  }

  save(): void {
    const draft = this.draft();
    if (!draft) return;
    this.saving.set(true);
    this.api.saveHome(draft).subscribe({
      next: (content) => {
        this.saving.set(false);
        this.apply(content);
        this.toast.show('Đã lưu trang chủ', {
          action: { label: 'Xem trang chủ', run: () => window.open('/', '_blank') },
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  discard(): void {
    this.draft.set(JSON.parse(this.original()) as LandingContent);
  }

  reset(): void {
    this.dialogs
      .confirm({
        title: 'Khôi phục nội dung mặc định?',
        message: 'Mọi thay đổi trên trang chủ sẽ mất, kể cả các khối bạn đã thêm.',
        confirmLabel: 'Khôi phục',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.resetHome().subscribe({
          next: (content) => {
            this.apply(content);
            this.toast.show('Đã khôi phục trang chủ mặc định');
          },
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
      });
  }

  private choose(current: string, done: (mediaId: string) => void): void {
    this.dialogs
      .modal<string, string>(MediaPicker, current, ['adm-modal-panel', 'adm-modal-panel--wide'])
      .closed.subscribe((mediaId) => mediaId && done(mediaId));
  }

  private update(change: (content: LandingContent) => void): void {
    const draft = this.draft();
    if (!draft) return;
    const next = structuredClone(draft);
    change(next);
    this.draft.set(next);
  }

  private apply(content: LandingContent): void {
    this.original.set(JSON.stringify(content));
    this.draft.set(content);
  }
}
