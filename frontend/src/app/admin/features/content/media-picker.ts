import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getMedia, MEDIA } from '../../../../media/media-manifest';
import { ADMIN_PRODUCTS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import { AdminToastService } from '../../ui/toast';

type MediaGroup = 'uploaded' | 'campaign' | 'editorial' | 'category' | 'product';

/** Id of an uploaded image (`up-<32 hex>.<ext>`), served from the image CDN through `/api/media/{id}`. */
const UPLOADED_ID = /^up-[0-9a-f]{32}\.(jpg|png|webp)$/;

const GROUPS: { value: MediaGroup; label: string; test: (id: string) => boolean }[] = [
  { value: 'uploaded', label: 'Đã tải lên', test: (id) => UPLOADED_ID.test(id) },
  { value: 'campaign', label: 'Banner', test: (id) => id.startsWith('uniqlo-campaign') },
  { value: 'editorial', label: 'Ảnh lifestyle', test: (id) => id.startsWith('editorial-') },
  { value: 'category', label: 'Danh mục', test: (id) => id.startsWith('uniqlo-category') },
  { value: 'product', label: 'Sản phẩm', test: (id) => id.startsWith('uniqlo-product') },
];

/**
 * Thư viện ảnh của storefront + ảnh admin tải lên (lưu trên Cloudinary, DB chỉ giữ id). The home page references
 * images by media id; an upload returns a new `up-…` id that is picked right away.
 */
@Component({
  selector: 'adm-media-picker',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <div class="dialog">
      <h2>Chọn ảnh</h2>
      <p class="dialog-desc">
        Chọn từ thư viện ảnh của cửa hàng hoặc tải ảnh mới (JPG, PNG, WebP, tối đa 5 MB).
      </p>
      <div class="upload-row">
        <label class="adm-btn" [class.is-busy]="uploading()">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            (change)="upload(fileInput.files); fileInput.value = ''"
            #fileInput
            [disabled]="uploading()"
            hidden
          />
          {{ uploading() ? 'Đang tải ảnh…' : 'Tải ảnh lên' }}
        </label>
      </div>
      <div class="dialog-body">
        <nav class="tabs" aria-label="Nhóm ảnh">
          @for (item of groups; track item.value) {
            <button
              type="button"
              [class.is-active]="group() === item.value"
              (click)="group.set(item.value)"
            >
              {{ item.label }}
            </button>
          }
        </nav>
        @if (!items().length) {
          <p class="empty">Chưa có ảnh nào được tải lên trong lần mở này.</p>
        }
        <div class="grid" role="listbox" aria-label="Ảnh">
          @for (item of items(); track item.id) {
            <button
              type="button"
              role="option"
              class="tile"
              [class.is-selected]="item.id === picked()"
              [attr.aria-selected]="item.id === picked()"
              [attr.aria-label]="item.alt || item.id"
              (click)="picked.set(item.id)"
              (dblclick)="ref.close(item.id)"
            >
              <img [src]="item.src" alt="" loading="lazy" />
            </button>
          }
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button
          type="button"
          class="adm-btn adm-btn--primary"
          [disabled]="!picked()"
          (click)="ref.close(picked())"
        >
          Chọn ảnh
        </button>
      </div>
    </div>
  `,
  styles: `
    .upload-row {
      margin-bottom: 12px;
      .is-busy {
        opacity: 0.6;
        pointer-events: none;
      }
    }
    .empty {
      color: var(--adm-text-secondary);
      margin: 12px 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
      grid-auto-rows: 150px;
      gap: 8px;
      max-height: 52vh;
      overflow: auto;
      padding: 2px;
    }
    .tile {
      height: 100%;
      padding: 0;
      border: 2px solid transparent;
      border-radius: var(--adm-radius-md);
      overflow: hidden;
      background: var(--adm-muted);
      cursor: pointer;
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      &.is-selected {
        border-color: var(--adm-primary);
      }
    }
  `,
})
export class MediaPicker {
  readonly ref = inject<DialogRef<string>>(DialogRef);
  private readonly current = inject<string | null>(DIALOG_DATA);
  private readonly api = inject(ADMIN_PRODUCTS_API);
  private readonly toast = inject(AdminToastService);
  protected readonly groups = GROUPS;
  protected readonly picked = signal(this.current ?? '');
  protected readonly uploading = signal(false);
  /** Uploaded ids known in this dialog: the current value (if uploaded) plus what was uploaded now. */
  private readonly uploaded = signal<string[]>(
    this.current && UPLOADED_ID.test(this.current) ? [this.current] : [],
  );
  protected readonly group = signal<MediaGroup>(
    GROUPS.find((item) => this.current && item.test(this.current))?.value ?? 'campaign',
  );
  protected readonly items = computed(() => {
    if (this.group() === 'uploaded') {
      return this.uploaded().map((id) => ({ id, src: getMedia(id).src, alt: '' }));
    }
    const test = GROUPS.find((item) => item.value === this.group())!.test;
    return Object.entries(MEDIA)
      .filter(([id]) => test(id))
      .map(([id, asset]) => ({ id, src: asset.src, alt: asset.alt }));
  });

  protected upload(files: FileList | null): void {
    const file = files?.[0];
    if (!file || this.uploading()) return;
    this.uploading.set(true);
    this.api.uploadImage(file).subscribe({
      next: (image) => {
        this.uploading.set(false);
        this.uploaded.update((ids) => [image.id, ...ids.filter((id) => id !== image.id)]);
        this.group.set('uploaded');
        this.picked.set(image.id);
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }
}

/** Image URL for a media id, for previews in the admin. */
export function mediaSrc(id: string | undefined): string {
  return id ? getMedia(id).src : '';
}
