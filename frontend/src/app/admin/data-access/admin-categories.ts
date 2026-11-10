import { inject, Injectable, signal } from '@angular/core';
import { ADMIN_PRODUCTS_API } from './admin-apis';
import { errorMessage } from './http-support';
import type { AdminCategory } from './models';

/**
 * Categories for the product form, the product filter and the voucher form (BR-INV-10). The
 * products port answers from the mock list or `GET /admin/categories`; a failed load shows an
 * error with a retry in the field and never blocks the page.
 */
@Injectable()
export class AdminCategories {
  private readonly api = inject(ADMIN_PRODUCTS_API);
  readonly items = signal<AdminCategory[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  private loaded = false;

  /** Loads once; call again (or `retry`) after an error. */
  load(): void {
    if (this.loaded || this.loading()) return;
    this.fetch();
  }

  retry(): void {
    this.fetch();
  }

  label(value: string): string {
    return this.items().find((item) => item.value === value)?.label ?? value;
  }

  private fetch(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.categories().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loaded = true;
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(errorMessage(error));
        this.loading.set(false);
      },
    });
  }
}
