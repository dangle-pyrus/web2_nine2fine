import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminSession } from '../../core/admin-session';
import { slugify } from '../../core/format';
import { DateTimePipe, NumPipe } from '../../core/format.pipes';
import { ADMIN_PRODUCTS_API, ADMIN_STOREFRONT_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import {
  AdminApiError,
  type AdminCollection,
  type AdminProductSummary,
  type CollectionInput,
} from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { AdminToastService } from '../../ui/toast';

/** Every product, for pickers and thumbnails (the catalogue is small enough for one page). */
function allProducts() {
  return inject(ADMIN_PRODUCTS_API).list({
    view: 'all',
    category: '',
    page: 1,
    pageSize: 500,
    search: '',
    sort: 'name',
    dir: 'asc',
  });
}

/** Bộ sưu tập (Đợt 3): hand-picked product groups such as a season or a campaign. */
@Component({
  selector: 'adm-collection-list-page',
  imports: [AdmPageHeader, AdmBadge, AdmIcon, AdmEmptyState, NumPipe, DateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Bộ sưu tập">
      <p subtitle class="secondary small">Nhóm sản phẩm theo mùa, chiến dịch hoặc dịp mặc.</p>
      <ng-container actions>
        @if (canEdit) {
          <button type="button" class="adm-btn adm-btn--primary adm-btn--lg" (click)="edit(null)">
            <adm-icon name="reiconPlus" [size]="16" /> Tạo bộ sưu tập
          </button>
        }
      </ng-container>
    </adm-page-header>
    <div class="page-body page-body--wide">
      @if (error(); as message) {
        <adm-empty kind="error" heading="Không tải được bộ sưu tập" [description]="message">
          <button type="button" class="adm-btn" (click)="load()">Thử lại</button>
        </adm-empty>
      } @else if (items(); as list) {
        @if (!list.length) {
          <adm-empty
            kind="first"
            image="/assets/illustrations/shopping_bags.svg"
            heading="Tạo bộ sưu tập đầu tiên"
            description="Ví dụ: Thu Đông 2026, Đồ đi tiệc, Cuối tuần."
          >
            @if (canEdit) {
              <button type="button" class="adm-btn adm-btn--primary" (click)="edit(null)">
                Tạo bộ sưu tập
              </button>
            }
          </adm-empty>
        } @else {
          <div class="table-wrap">
            <table class="table table--cards">
              <thead>
                <tr>
                  <th>Bộ sưu tập</th>
                  <th>Trạng thái</th>
                  <th>Sản phẩm</th>
                  <th>Cập nhật</th>
                  @if (canEdit) {
                    <th class="w-actions"><span class="sr-only">Thao tác</span></th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (item of list; track item.id) {
                  <tr [class.clickable]="canEdit" (click)="canEdit && edit(item)">
                    <td>
                      <span class="cell-title">{{ item.name }}</span>
                      <div class="cell-sub mono">/{{ item.slug }}</div>
                    </td>
                    <td data-label="Trạng thái">
                      <adm-badge
                        [label]="item.status === 'active' ? 'Đang hiển thị' : 'Bản nháp'"
                        [tone]="item.status === 'active' ? 'success' : 'neutral'"
                      />
                    </td>
                    <td data-label="Sản phẩm">
                      <span class="faces">
                        @for (id of item.productIds.slice(0, 5); track id) {
                          @if (images()[id]; as src) {
                            <img class="thumb thumb--xs" [src]="src" alt="" />
                          }
                        }
                      </span>
                      <span class="secondary">{{ item.productIds.length | admNum }} sản phẩm</span>
                    </td>
                    <td class="secondary" data-label="Cập nhật">
                      {{ item.updatedAt | admDateTime }}
                    </td>
                    @if (canEdit) {
                      <td class="w-actions">
                        <button
                          type="button"
                          class="adm-btn adm-btn--icon adm-btn--sm adm-btn--ghost"
                          [attr.aria-label]="'Xóa ' + item.name"
                          (click)="$event.stopPropagation(); remove(item)"
                        >
                          <adm-icon name="reiconTrash" [size]="16" />
                        </button>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <div class="stack"><span class="sk sk--title"></span><span class="sk"></span></div>
      }
    </div>
  `,
  styles: `
    .faces {
      display: inline-flex;
      margin-right: 8px;
      vertical-align: middle;
      img + img {
        margin-left: -8px;
      }
    }
    .thumb--xs {
      width: 28px;
      height: 28px;
      border: 2px solid var(--adm-raised);
    }
  `,
})
export class CollectionListPage {
  private readonly api = inject(ADMIN_STOREFRONT_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  protected readonly canEdit = inject(AdminSession).can('products.edit');
  protected readonly items = signal<AdminCollection[] | null>(null);
  protected readonly error = signal('');
  protected readonly products = signal<AdminProductSummary[]>([]);
  protected readonly images = computed(() =>
    Object.fromEntries(this.products().map((product) => [product.id, product.image])),
  );

  constructor() {
    this.load();
    allProducts().subscribe({ next: (page) => this.products.set(page.items) });
  }

  load(): void {
    this.error.set('');
    this.api.collections().subscribe({
      next: (items) => this.items.set(items),
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  edit(item: AdminCollection | null): void {
    this.dialogs
      .modal<AdminCollection | null, AdminCollection>(CollectionDialog, item, [
        'adm-modal-panel',
        'adm-modal-panel--wide',
      ])
      .closed.subscribe((saved) => {
        if (!saved) return;
        this.toast.show(item ? 'Đã lưu bộ sưu tập' : `Đã tạo bộ sưu tập ${saved.name}`);
        this.load();
      });
  }

  remove(item: AdminCollection): void {
    this.dialogs
      .confirm({
        title: `Xóa bộ sưu tập "${item.name}"?`,
        message: 'Sản phẩm trong bộ sưu tập không bị xóa. Thao tác này không hoàn tác được.',
        confirmLabel: 'Xóa bộ sưu tập',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.removeCollection(item.id).subscribe({
          next: () => {
            this.toast.show('Đã xóa bộ sưu tập');
            this.load();
          },
          error: (error: unknown) => this.toast.error(errorMessage(error)),
        });
      });
  }
}

/** Create or edit one collection: name, link, status and the products in it. */
@Component({
  selector: 'adm-collection-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="save()">
      <h2>{{ data ? 'Sửa bộ sưu tập' : 'Tạo bộ sưu tập' }}</h2>
      <div class="dialog-body">
        <div class="form-grid">
          <div class="field">
            <label for="c-name" class="req">Tên</label>
            <input
              id="c-name"
              class="input"
              name="name"
              [ngModel]="draft().name"
              (ngModelChange)="setName($event)"
              [attr.aria-invalid]="!!errors()['name']"
            />
            @if (errors()['name']; as error) {
              <p class="error">{{ error }}</p>
            }
          </div>
          <div class="field">
            <label for="c-slug">Đường dẫn</label>
            <input
              id="c-slug"
              class="input mono"
              name="slug"
              readonly
              [value]="'/' + (draft().slug || 'ten-bo-suu-tap')"
              [attr.aria-invalid]="!!errors()['slug']"
            />
            @if (errors()['slug']; as error) {
              <p class="error">{{ error }}</p>
            } @else {
              <p class="hint">
                {{ data ? 'Giữ cố định để liên kết cũ không hỏng.' : 'Tự tạo từ tên bộ sưu tập.' }}
              </p>
            }
          </div>
        </div>
        <div class="field">
          <label for="c-desc">Mô tả</label>
          <textarea
            id="c-desc"
            class="textarea"
            rows="2"
            name="description"
            [ngModel]="draft().description"
            (ngModelChange)="patch({ description: $event })"
          ></textarea>
        </div>
        <label class="check">
          <input
            type="checkbox"
            name="status"
            [ngModel]="draft().status === 'active'"
            (ngModelChange)="patch({ status: $event ? 'active' : 'draft' })"
          />
          <span
            >Hiển thị trên cửa hàng<span class="check-desc"
              >Bỏ chọn để lưu dạng bản nháp.</span
            ></span
          >
        </label>
        <fieldset class="picker">
          <legend>Sản phẩm ({{ draft().productIds.length }})</legend>
          <input
            class="input input--sm"
            type="search"
            name="filter"
            placeholder="Lọc sản phẩm"
            aria-label="Lọc sản phẩm"
            [ngModel]="filter()"
            (ngModelChange)="filter.set($event)"
          />
          <ul class="options">
            @for (product of visible(); track product.id) {
              <li>
                <label class="option">
                  <input
                    type="checkbox"
                    [checked]="draft().productIds.includes(product.id)"
                    (change)="toggle(product.id)"
                  />
                  <img class="thumb" [src]="product.image" alt="" />
                  <span>{{ product.name }}</span>
                </label>
              </li>
            } @empty {
              <li class="secondary small">Không có sản phẩm phù hợp.</li>
            }
          </ul>
        </fieldset>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary" [class.is-busy]="saving()">
          {{ data ? 'Lưu bộ sưu tập' : 'Tạo bộ sưu tập' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .picker {
      border: 0;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 8px;
      legend {
        font-weight: 500;
        margin-bottom: 8px;
      }
    }
    .options {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 280px;
      overflow: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 4px 12px;
    }
    .option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 0;
      cursor: pointer;
      input {
        accent-color: var(--adm-primary);
      }
    }
  `,
})
export class CollectionDialog {
  readonly ref = inject(DialogRef);
  readonly data = inject<AdminCollection | null>(DIALOG_DATA);
  private readonly api = inject(ADMIN_STOREFRONT_API);
  private readonly toast = inject(AdminToastService);
  protected readonly products = signal<AdminProductSummary[]>([]);
  protected readonly filter = signal('');
  protected readonly saving = signal(false);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly tried = signal(false);
  protected readonly draft = signal<CollectionInput>(
    this.data
      ? {
          name: this.data.name,
          slug: this.data.slug,
          description: this.data.description,
          status: this.data.status,
          productIds: [...this.data.productIds],
        }
      : { name: '', slug: '', description: '', status: 'active', productIds: [] },
  );
  slugTouched = !!this.data;

  protected readonly visible = computed(() => {
    const term = slugify(this.filter());
    return this.products().filter((product) => slugify(product.name).includes(term));
  });
  protected readonly errors = computed(() => {
    const errors: Record<string, string> = { ...this.serverErrors() };
    if (this.tried() && !this.draft().name.trim()) errors['name'] ??= 'Nhập tên bộ sưu tập.';
    return errors;
  });

  constructor() {
    allProducts().subscribe({ next: (page) => this.products.set(page.items) });
  }

  setName(name: string): void {
    this.patch(this.slugTouched ? { name } : { name, slug: slugify(name) });
  }

  patch(changes: Partial<CollectionInput>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }));
    this.serverErrors.set({});
  }

  toggle(id: string): void {
    const ids = this.draft().productIds;
    this.patch({
      productIds: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    });
  }

  save(): void {
    this.tried.set(true);
    if (Object.keys(this.errors()).length) return;
    this.saving.set(true);
    this.api.saveCollection(this.data?.id ?? null, this.draft()).subscribe({
      next: (saved) => this.ref.close(saved),
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof AdminApiError && Object.keys(error.fields).length)
          this.serverErrors.set(error.fields);
        else this.toast.error(errorMessage(error));
      },
    });
  }
}
