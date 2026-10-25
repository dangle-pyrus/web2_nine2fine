import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MEDIA } from '../../../../media/media-manifest';

type MediaGroup = 'campaign' | 'editorial' | 'category' | 'product';

const GROUPS: { value: MediaGroup; label: string; test: (id: string) => boolean }[] = [
  { value: 'campaign', label: 'Banner', test: (id) => id.startsWith('uniqlo-campaign') },
  { value: 'editorial', label: 'Ảnh lifestyle', test: (id) => id.startsWith('editorial-') },
  { value: 'category', label: 'Danh mục', test: (id) => id.startsWith('uniqlo-category') },
  { value: 'product', label: 'Sản phẩm', test: (id) => id.startsWith('uniqlo-product') },
];

/** Thư viện ảnh của storefront: the home page references images by media id, not by upload. */
@Component({
  selector: 'adm-media-picker',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <div class="dialog">
      <h2>Chọn ảnh</h2>
      <p class="dialog-desc">Ảnh lấy từ thư viện ảnh của cửa hàng.</p>
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
  protected readonly groups = GROUPS;
  protected readonly picked = signal(this.current ?? '');
  protected readonly group = signal<MediaGroup>(
    GROUPS.find((item) => this.current && item.test(this.current))?.value ?? 'campaign',
  );
  protected readonly items = computed(() => {
    const test = GROUPS.find((item) => item.value === this.group())!.test;
    return Object.entries(MEDIA)
      .filter(([id]) => test(id))
      .map(([id, asset]) => ({ id, src: asset.src, alt: asset.alt }));
  });
}

/** Image URL for a media id, for previews in the admin. */
export function mediaSrc(id: string | undefined): string {
  return (id && MEDIA[id]?.src) || '';
}
