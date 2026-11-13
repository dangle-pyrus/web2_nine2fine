import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminSession } from '../../core/admin-session';
import {
  ADMIN_CONTENT_API,
  AdminHomeContent,
  ContentConflictError,
  type HomeBlock,
  type HomeContentInput,
} from '../../data-access/content-api';
import { errorMessage } from '../../data-access/http-support';
import { AdminApiError } from '../../data-access/models';
import { DateTimePipe } from '../../core/format.pipes';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmSaveBar } from '../../ui/save-bar';
import { AdminToastService } from '../../ui/toast';
import { HasUnsavedChanges } from '../../ui/unsaved-changes';
import { AdmLinkSelect } from './link-select';
import { MediaPicker, mediaSrc } from './media-picker';

type Campaign = Extract<HomeBlock, { kind: 'campaign' }>;
const MAX_BLOCKS = 16;

/** The part of the home content the form edits. */
type Draft = Pick<HomeContentInput, 'categories' | 'moments' | 'blocks'>;
type Edit = Extract<HomeBlock, { kind: 'products' }>;
type Shop = Extract<HomeBlock, { kind: 'shop' }>;

const KIND_LABELS: Record<HomeBlock['kind'], string> = {
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

/**
 * Nội dung trang chủ (Đợt 3): the storefront home blocks in order. Drag by the handle (or arrow keys
 * on it) to reorder, show/hide and edit text, links and images; saving updates the shop's home
 * page in the same browser tab.
 */
@Component({
  selector: 'adm-home-content-page',
  imports: [
    FormsModule,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    AdmLinkSelect,
    AdmPageHeader,
    AdmIcon,
    AdmEmptyState,
    AdmSaveBar,
    DateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <adm-page-header heading="Nội dung trang chủ">
      <p subtitle class="secondary small">
        Thứ tự và nội dung các khối trên trang chủ cửa hàng. Lưu là đăng ngay.
        @if (server()?.updatedAt; as at) {
          Lưu lần cuối {{ at | admDateTime }}
          @if (server()?.updatedBy; as by) {
            bởi {{ by.name }}
          }
          .
        } @else if (server()) {
          Đang dùng nội dung mặc định.
        }
      </p>
      <ng-container actions>
        <a class="adm-btn adm-btn--lg" href="/" target="_blank" rel="noopener">
          <adm-icon name="reiconEye" [size]="16" /> Xem trang chủ
        </a>
        @if (canEdit) {
          <button
            type="button"
            class="adm-btn adm-btn--lg"
            [disabled]="(draft()?.blocks?.length ?? 0) >= maxBlocks"
            [cdkMenuTriggerFor]="addMenu"
          >
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

    @if (conflict(); as other) {
      <div class="page-body banner" role="alert">
        <p>
          <strong>Người khác vừa lưu trang chủ</strong>
          @if (other.updatedBy) {
            ({{ other.updatedBy.name }}, {{ other.updatedAt | admDateTime }})
          }
          trước bạn. Bản của bạn vẫn được giữ nguyên và chưa lưu.
        </p>
        <div class="row">
          <button type="button" class="adm-btn adm-btn--sm" (click)="useServerCopy()">
            Dùng bản mới trên máy chủ
          </button>
          <button type="button" class="adm-btn adm-btn--sm adm-btn--primary" (click)="keepMine()">
            Giữ bản của tôi
          </button>
        </div>
      </div>
    }
    @if (errorList().length) {
      <div class="page-body banner banner--error" role="alert" aria-live="assertive">
        <p><strong>Chưa lưu được, kiểm tra các mục sau:</strong></p>
        <ul>
          @for (item of errorList(); track item.path) {
            <li>
              <span class="mono">{{ item.path }}</span
              >: {{ item.message }}
            </li>
          }
        </ul>
      </div>
    }
    @if (server()?.warnings?.length) {
      <div class="page-body banner" role="status">
        <p><strong>Lưu ý (không chặn việc lưu):</strong></p>
        <ul>
          @for (item of server()!.warnings; track item.path) {
            <li>
              <span class="mono">{{ item.path }}</span
              >: {{ item.message }}
            </li>
          }
        </ul>
      </div>
    }

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
            <p class="small tertiary drag-hint">
              Giữ biểu tượng 6 chấm rồi kéo khối tới vị trí mới. Thứ tự ở đây là thứ tự trên trang
              chủ, từ trên xuống.
            </p>
            <ol
              class="blocks"
              cdkDropList
              [cdkDropListDisabled]="!canEdit"
              (cdkDropListDropped)="drop($event)"
            >
              @for (block of content.blocks; track block.id; let i = $index; let last = $last) {
                <li
                  class="block"
                  cdkDrag
                  cdkDragLockAxis="y"
                  cdkDragPreviewContainer="parent"
                  [class.is-off]="block.enabled === false"
                >
                  <div class="drop-slot" *cdkDragPlaceholder></div>
                  <div class="block-row">
                    @if (canEdit) {
                      <button
                        type="button"
                        class="handle"
                        cdkDragHandle
                        [attr.aria-label]="
                          'Đổi vị trí khối ' +
                          title(block) +
                          ', đang ở vị trí ' +
                          (i + 1) +
                          '. Kéo thả, hoặc dùng phím mũi tên lên xuống.'
                        "
                        title="Kéo để đổi vị trí"
                        (keydown.arrowup)="$event.preventDefault(); move(i, -1, $event)"
                        (keydown.arrowdown)="$event.preventDefault(); last || move(i, 1, $event)"
                      >
                        <adm-icon name="reiconDrag" [size]="18" />
                      </button>
                    }
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
                                maxlength="40"
                                [ngModel]="asCampaign(block).eyebrow"
                                (ngModelChange)="patch(i, { eyebrow: $event })"
                              />
                            </div>
                            <div class="field">
                              <label class="req" [for]="block.id + '-title'">Tiêu đề</label>
                              <input
                                class="input"
                                [id]="block.id + '-title'"
                                maxlength="80"
                                [ngModel]="asCampaign(block).title"
                                (ngModelChange)="patch(i, { title: $event })"
                                [attr.aria-invalid]="!asCampaign(block).title.trim()"
                              />
                              @if (!asCampaign(block).title.trim()) {
                                <p class="error">Nhập tiêu đề.</p>
                              } @else if (errors()['blocks[' + i + '].title']; as message) {
                                <p class="error">{{ message }}</p>
                              }
                            </div>
                          </div>
                          <div class="field">
                            <label [for]="block.id + '-desc'">Mô tả</label>
                            <textarea
                              class="textarea"
                              rows="2"
                              [id]="block.id + '-desc'"
                              maxlength="200"
                              [ngModel]="asCampaign(block).description"
                              (ngModelChange)="patch(i, { description: $event })"
                            ></textarea>
                            @if (errors()['blocks[' + i + '].description']; as message) {
                              <p class="error">{{ message }}</p>
                            } @else {
                              <p class="hint">Xuống dòng sẽ giữ nguyên trên trang chủ.</p>
                            }
                          </div>
                          <div class="field">
                            <label [for]="block.id + '-href'">Khi bấm, mở trang</label>
                            <adm-link-select
                              [inputId]="block.id + '-href'"
                              [value]="asCampaign(block).href"
                              (changed)="patch(i, { href: $event })"
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
                                maxlength="80"
                                [ngModel]="asShop(block).label"
                                (ngModelChange)="patch(i, { label: $event })"
                              />
                              @if (errors()['blocks[' + i + '].label']; as message) {
                                <p class="error">{{ message }}</p>
                              }
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
                            <label [for]="block.id + '-href'">Nút "Xem tất cả" mở trang</label>
                            <adm-link-select
                              [inputId]="block.id + '-href'"
                              [value]="asShop(block).href"
                              (changed)="patch(i, { href: $event })"
                            />
                          </div>
                        }
                        @case ('products') {
                          <div class="field">
                            <label class="req" [for]="block.id + '-label'">Tên khối</label>
                            <input
                              class="input"
                              [id]="block.id + '-label'"
                              maxlength="80"
                              [ngModel]="asEdit(block).label"
                              (ngModelChange)="patch(i, { label: $event })"
                            />
                            @if (errors()['blocks[' + i + '].label']; as message) {
                              <p class="error">{{ message }}</p>
                            }
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
                                <adm-link-select
                                  [small]="true"
                                  [ariaLabel]="'Thẻ ' + (j + 1) + ' mở trang'"
                                  [value]="card.href"
                                  (changed)="patchCard(i, j, { href: $event })"
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
                    <label class="mini-label" [for]="'cat-label-' + j">Tên hiển thị</label>
                    <input
                      class="input input--sm"
                      [id]="'cat-label-' + j"
                      [ngModel]="cat.label"
                      (ngModelChange)="patchCategory(j, { label: $event })"
                    />
                    @if (errors()['categories[' + j + '].label']; as message) {
                      <p class="error">{{ message }}</p>
                    }
                    <label class="mini-label" [for]="'cat-href-' + j">Mở trang</label>
                    <adm-link-select
                      [small]="true"
                      [inputId]="'cat-href-' + j"
                      [value]="cat.href"
                      [disabled]="!canEdit"
                      (changed)="patchCategory(j, { href: $event })"
                    />
                  </div>
                </div>
              }
            </fieldset>
          </section>
          <section class="section" aria-labelledby="moments-title">
            <header><h2 id="moments-title">Mua theo dịp (Moment)</h2></header>
            <p class="small secondary">
              Chữ và ảnh của 4 thẻ cố định. Số sản phẩm và đường dẫn do hệ thống tự tính; thẻ chưa
              có sản phẩm sẽ tự ẩn.
            </p>
            <fieldset class="cats" [disabled]="!canEdit">
              @for (item of content.moments; track item.moment; let m = $index) {
                <div class="cat">
                  <button
                    type="button"
                    class="image-pick image-pick--square"
                    [attr.aria-label]="'Đổi ảnh thẻ ' + item.label"
                    (click)="pickMoment(m, item.mediaId)"
                  >
                    <img [src]="src(item.mediaId)" alt="" />
                  </button>
                  <div class="cat-fields">
                    <label class="mini-label" [for]="'moment-label-' + m">Tên thẻ</label>
                    <input
                      class="input input--sm"
                      maxlength="40"
                      [id]="'moment-label-' + m"
                      [ngModel]="item.label"
                      (ngModelChange)="patchMoment(m, { label: $event })"
                    />
                    @if (errors()['moments[' + m + '].label']; as message) {
                      <p class="error">{{ message }}</p>
                    }
                    <label class="mini-label" [for]="'moment-line-' + m + '-0'">Dòng chữ 1</label>
                    <input
                      class="input input--sm"
                      maxlength="60"
                      [id]="'moment-line-' + m + '-0'"
                      [ngModel]="item.lines[0] ?? ''"
                      (ngModelChange)="patchLine(m, 0, $event)"
                    />
                    <label class="mini-label" [for]="'moment-line-' + m + '-1'"
                      >Dòng chữ 2 (không bắt buộc)</label
                    >
                    <input
                      class="input input--sm"
                      maxlength="60"
                      [id]="'moment-line-' + m + '-1'"
                      [ngModel]="item.lines[1] ?? ''"
                      (ngModelChange)="patchLine(m, 1, $event)"
                    />
                    @if (
                      errors()['moments[' + m + '].lines[0]'] ??
                        errors()['moments[' + m + '].lines'];
                      as message
                    ) {
                      <p class="error">{{ message }}</p>
                    }
                  </div>
                </div>
              }
            </fieldset>
          </section>
        </aside>
      </div>
    } @else {
      <div class="page-body"><span class="sk sk--title"></span></div>
    }
  `,
  styles: `
    .banner {
      display: grid;
      gap: 8px;
      margin-bottom: 12px;
      padding: 12px 16px;
      border-radius: var(--adm-radius-lg);
      background: var(--adm-muted);
      ul {
        margin: 0;
        padding-left: 18px;
      }
      &.banner--error {
        color: var(--adm-danger);
      }
    }
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
    .drag-hint {
      margin: -4px 0 8px;
    }
    .handle {
      display: grid;
      place-items: center;
      width: 32px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: var(--adm-radius-sm);
      background: none;
      color: var(--adm-text-tertiary);
      cursor: grab;
      touch-action: none;
      &:hover,
      &:focus-visible {
        background: var(--adm-muted);
        color: var(--adm-text);
      }
      &:active {
        cursor: grabbing;
      }
    }
    .block.cdk-drag-preview {
      background: var(--adm-raised);
      box-shadow: var(--adm-shadow-lg);
      border-radius: var(--adm-radius-md);
      border-bottom: 0;
      padding: 0 12px;
      .editor {
        display: none;
      }
    }
    .drop-slot {
      height: 64px;
      border: 1px dashed var(--adm-text-tertiary);
      border-radius: var(--adm-radius-md);
      background: var(--adm-muted);
    }
    .blocks.cdk-drop-list-dragging .block:not(.cdk-drag-placeholder) {
      transition: transform 200ms var(--adm-ease);
    }
    .cdk-drag-animating {
      transition: transform 200ms var(--adm-ease);
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
      align-items: start;
    }
    .cat-fields {
      display: grid;
      gap: 4px;
    }
    .mini-label {
      font-size: 12px;
      color: var(--adm-text-secondary);
      margin-top: 4px;
    }
    .cats .cat + .cat {
      padding-top: 16px;
      border-top: 1px solid var(--adm-divider);
    }
    @media (max-width: 767px) {
      .images {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class HomeContentPage implements HasUnsavedChanges {
  private readonly api = inject(ADMIN_CONTENT_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  protected readonly canEdit = inject(AdminSession).can('content.edit');
  protected readonly kinds = KIND_LABELS;
  protected readonly sorts = SORTS;
  protected readonly src = mediaSrc;

  protected readonly maxBlocks = MAX_BLOCKS;
  /** The server's copy: its updatedAt is the lock key of the next save. */
  protected readonly server = signal<AdminHomeContent | null>(null);
  protected readonly conflict = signal<AdminHomeContent | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly errorList = computed(() =>
    Object.entries(this.errors()).map(([path, message]) => ({ path, message })),
  );
  protected readonly draft = signal<Draft | null>(null);
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

  title(block: HomeBlock): string {
    switch (block.kind) {
      case 'campaign':
        return block.title || '(Chưa có tiêu đề)';
      case 'categories':
        return 'Danh mục nổi bật';
      default:
        return block.label || '(Chưa có tên)';
    }
  }

  preview(block: HomeBlock): string {
    if (block.kind === 'campaign') return mediaSrc(block.mediaId);
    if (block.kind === 'products') return mediaSrc(block.cards[0]?.mediaId);
    return '';
  }

  icon(block: HomeBlock): string {
    return block.kind === 'shop' ? 'reiconTshirt' : 'reiconWidget';
  }

  asCampaign(block: HomeBlock): Campaign {
    return block as Campaign;
  }
  asShop(block: HomeBlock): Shop {
    return block as Shop;
  }
  asEdit(block: HomeBlock): Edit {
    return block as Edit;
  }

  toggle(id: string): void {
    this.open.update((value) => (value === id ? null : id));
  }

  patch(index: number, changes: Partial<Campaign> | Partial<Shop> | Partial<Edit>): void {
    this.update((content) => {
      content.blocks[index] = { ...content.blocks[index], ...changes } as HomeBlock;
    });
  }

  patchCard(index: number, card: number, changes: Partial<Edit['cards'][number]>): void {
    this.update((content) => {
      const block = content.blocks[index] as Edit;
      block.cards[card] = { ...block.cards[card], ...changes };
    });
  }

  patchMoment(index: number, changes: Partial<Draft['moments'][number]>): void {
    this.update((content) => {
      content.moments[index] = { ...content.moments[index], ...changes };
    });
  }

  /** Line 2 is optional: an empty second line is dropped, line 1 stays so the error shows. */
  patchLine(index: number, line: 0 | 1, value: string): void {
    this.update((content) => {
      const lines = [...content.moments[index].lines];
      lines[line] = value;
      content.moments[index].lines = lines[1] === '' ? lines.slice(0, 1) : lines;
    });
  }

  pickMoment(index: number, current: string): void {
    this.choose(current, (mediaId) => this.patchMoment(index, { mediaId }));
  }

  patchCategory(index: number, changes: Partial<Draft['categories'][number]>): void {
    this.update((content) => {
      content.categories[index] = { ...content.categories[index], ...changes };
    });
  }

  drop(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.update((content) =>
      moveItemInArray(content.blocks, event.previousIndex, event.currentIndex),
    );
  }

  /** Keyboard reorder from the handle; focus follows the block to its new place. */
  move(index: number, direction: 1 | -1, event?: Event): void {
    const target = index + direction;
    const count = this.draft()?.blocks.length ?? 0;
    if (target < 0 || target >= count) return;
    this.update((content) => moveItemInArray(content.blocks, index, target));
    const list = (event?.target as HTMLElement | undefined)?.closest('ol');
    setTimeout(() => list?.querySelectorAll<HTMLElement>('.handle')[target]?.focus());
  }

  add(kind: 'campaign' | 'shop' | 'products'): void {
    const id = `${kind}-${Date.now().toString(36)}`;
    const block: HomeBlock =
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
    const server = this.server();
    if (!draft || !server) return;
    this.saving.set(true);
    this.errors.set({});
    this.conflict.set(null);
    this.api.saveHome({ ...structuredClone(draft), updatedAt: server.updatedAt }).subscribe({
      next: (content) => {
        this.saving.set(false);
        this.apply(content);
        this.toast.show('Đã lưu trang chủ', {
          action: { label: 'Xem trang chủ', run: () => window.open('/', '_blank') },
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.fail(error);
      },
    });
  }

  discard(): void {
    this.errors.set({});
    this.conflict.set(null);
    this.draft.set(JSON.parse(this.original()) as Draft);
  }

  /** 409: drop my edits and take what the other admin saved. */
  useServerCopy(): void {
    const other = this.conflict();
    if (other) this.apply(other);
  }

  /** 409: keep my edits, but base the next save on the newer server copy. */
  keepMine(): void {
    const other = this.conflict();
    if (!other) return;
    this.server.set(other);
    this.conflict.set(null);
    this.toast.show('Đã giữ bản của bạn. Bấm Lưu và đăng để ghi đè bản mới.');
  }

  reset(): void {
    this.dialogs
      .confirm({
        title: 'Khôi phục nội dung mặc định?',
        message:
          'Mọi thay đổi trên trang chủ sẽ mất, kể cả các khối bạn đã thêm. Trang chủ cửa hàng đổi ngay.',
        confirmLabel: 'Khôi phục',
        danger: true,
      })
      .subscribe((ok) => {
        const server = this.server();
        if (!ok || !server) return;
        this.api.resetHome(server.updatedAt).subscribe({
          next: (content) => {
            this.errors.set({});
            this.conflict.set(null);
            this.apply(content);
            this.toast.show('Đã khôi phục trang chủ mặc định');
          },
          error: (error: unknown) => this.fail(error),
        });
      });
  }

  private fail(error: unknown): void {
    if (error instanceof ContentConflictError && error.current) {
      this.conflict.set(error.current as AdminHomeContent);
      return;
    }
    if (error instanceof AdminApiError && Object.keys(error.fields).length) {
      this.errors.set(error.fields);
      this.openFirstError(error.fields);
    }
    this.toast.error(errorMessage(error));
  }

  /** Opens the block whose field failed so the message is next to its input. */
  private openFirstError(fields: Record<string, string>): void {
    const path = Object.keys(fields).find((key) => key.startsWith('blocks['));
    const index = path ? Number(/^blocks\[(\d+)\]/.exec(path)?.[1]) : NaN;
    const block = this.draft()?.blocks[index];
    if (block) this.open.set(block.id);
  }

  private choose(current: string, done: (mediaId: string) => void): void {
    this.dialogs
      .modal<string, string>(MediaPicker, current, ['adm-modal-panel', 'adm-modal-panel--wide'])
      .closed.subscribe((mediaId) => mediaId && done(mediaId));
  }

  private update(change: (content: Draft) => void): void {
    const draft = this.draft();
    if (!draft) return;
    const next = structuredClone(draft);
    change(next);
    this.draft.set(next);
  }

  private apply(content: AdminHomeContent): void {
    const draft: Draft = {
      categories: content.categories,
      moments: content.moments,
      blocks: content.blocks,
    };
    this.server.set(content);
    this.conflict.set(null);
    this.original.set(JSON.stringify(draft));
    this.draft.set(structuredClone(draft));
  }
}
