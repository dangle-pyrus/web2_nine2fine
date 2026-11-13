import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { MoneyPipe } from '../../core/format.pipes';
import {
  ADMIN_SALES_API,
  type BulkSaleInput,
  type BulkSaleItem,
  type BulkSaleResult,
} from '../../data-access/content-api';
import { AdminCategories } from '../../data-access/admin-categories';
import { errorMessage } from '../../data-access/http-support';
import { AdminApiError } from '../../data-access/models';

const REASONS: Record<NonNullable<BulkSaleItem['reason']>, string> = {
  'sale-running': 'Đang có đợt giảm giá',
  'below-minimum': 'Giá giảm dưới 1.000 ₫',
  'not-reduced': 'Giá giảm không thấp hơn giá bán',
};

/** `YYYY-MM-DD` of today in Vietnam time. */
function today(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Giảm giá hàng loạt theo danh mục (Slice 10, BR-PROMO-07, Should). Two steps: "Xem trước" lists
 * what would change and what is skipped, then "Áp dụng" writes it all or nothing. The shop is
 * priced again on the server at apply time, so the numbers shown here are only a preview.
 */
@Component({
  selector: 'adm-bulk-sale-dialog',
  imports: [FormsModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="preview()">
      <h2>Giảm giá hàng loạt theo danh mục</h2>
      <p class="dialog-desc">
        Giá giảm làm tròn xuống bội số 1.000 ₫. Sản phẩm đang có đợt giảm giá được bỏ qua.
      </p>
      <div class="dialog-body">
        <div class="form-grid">
          <div class="field">
            <label for="bs-category" class="req">Danh mục</label>
            <select
              id="bs-category"
              class="select"
              name="category"
              [ngModel]="input().category"
              (ngModelChange)="patch({ category: $event })"
              [attr.aria-invalid]="!!errors()['category']"
            >
              @for (item of categories.items(); track item.value) {
                <option [value]="item.value">{{ item.label }}</option>
              }
            </select>
            @if (errors()['category']; as error) {
              <p class="error">{{ error }}</p>
            }
          </div>
          <div class="field">
            <label for="bs-percent" class="req">Giảm (%)</label>
            <input
              id="bs-percent"
              class="input"
              type="number"
              min="5"
              max="70"
              step="1"
              name="percent"
              [ngModel]="input().percent"
              (ngModelChange)="patch({ percent: +$event })"
              [attr.aria-invalid]="!!errors()['percent']"
            />
            @if (errors()['percent']; as error) {
              <p class="error">{{ error }}</p>
            } @else {
              <p class="hint">Từ 5 đến 70.</p>
            }
          </div>
          <div class="field">
            <label for="bs-start" class="req">Từ ngày</label>
            <input
              id="bs-start"
              class="input"
              type="date"
              name="startsOn"
              [ngModel]="input().startsOn"
              (ngModelChange)="patch({ startsOn: $event })"
              [attr.aria-invalid]="!!errors()['startsOn']"
            />
            @if (errors()['startsOn']; as error) {
              <p class="error">{{ error }}</p>
            }
          </div>
          <div class="field">
            <label for="bs-end" class="req">Đến hết ngày</label>
            <input
              id="bs-end"
              class="input"
              type="date"
              name="endsOn"
              [ngModel]="input().endsOn"
              (ngModelChange)="patch({ endsOn: $event })"
              [attr.aria-invalid]="!!errors()['endsOn']"
            />
            @if (errors()['endsOn']; as error) {
              <p class="error">{{ error }}</p>
            } @else {
              <p class="hint">Tối đa 90 ngày.</p>
            }
          </div>
        </div>
        @if (failure(); as message) {
          <p class="error" role="alert" data-testid="bulk-failure">{{ message }}</p>
        }
        @if (result(); as data) {
          <div aria-live="polite" data-testid="bulk-preview">
            <p>
              <strong>{{ data.applicable.length }} sản phẩm sẽ được giảm giá</strong>,
              {{ data.skipped.length }} sản phẩm bị bỏ qua.
            </p>
            @if (data.applicable.length) {
              <ul class="items">
                @for (item of data.applicable; track item.productId) {
                  <li>
                    <span>{{ item.name }}</span>
                    <span class="secondary"
                      ><s>{{ item.price | admMoney }}</s> → {{ item.salePrice | admMoney }}</span
                    >
                  </li>
                }
              </ul>
            }
            @if (data.skipped.length) {
              <p class="small secondary">Bỏ qua</p>
              <ul class="items">
                @for (item of data.skipped; track item.productId) {
                  <li>
                    <span>{{ item.name }}</span>
                    <span class="secondary">{{ reason(item) }}</span>
                  </li>
                }
              </ul>
            }
          </div>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close(applied())">Đóng</button>
        <button type="submit" class="adm-btn" [class.is-busy]="busy()" [disabled]="busy()">
          Xem trước
        </button>
        <button
          type="button"
          class="adm-btn adm-btn--primary"
          [class.is-busy]="busy()"
          [disabled]="busy() || !canApply()"
          (click)="apply()"
        >
          Áp dụng
        </button>
      </div>
    </form>
  `,
  styles: `
    .items {
      list-style: none;
      margin: 4px 0 12px;
      padding: 0;
      max-height: 200px;
      overflow: auto;
      li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 0;
        border-bottom: 1px solid var(--adm-divider);
      }
    }
  `,
})
export class BulkSaleDialog {
  readonly ref = inject(DialogRef<number>);
  private readonly api = inject(ADMIN_SALES_API);
  protected readonly categories = inject(AdminCategories);
  protected readonly input = signal<BulkSaleInput>({
    category: 'tops',
    percent: 20,
    startsOn: today(),
    endsOn: '',
  });
  protected readonly result = signal<BulkSaleResult | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly failure = signal('');
  protected readonly busy = signal(false);
  protected readonly applied = signal(0);
  /** Apply only what was previewed with these exact inputs. */
  protected readonly canApply = computed(() => !!this.result()?.applicable.length);

  constructor() {
    this.categories.load();
  }

  protected reason(item: BulkSaleItem): string {
    return item.reason ? REASONS[item.reason] : '';
  }

  protected patch(change: Partial<BulkSaleInput>): void {
    this.input.update((value) => ({ ...value, ...change }));
    this.result.set(null);
    this.errors.set({});
    this.failure.set('');
  }

  preview(): void {
    this.run(this.api.preview(this.input()), false);
  }

  apply(): void {
    this.run(this.api.apply(this.input()), true);
  }

  private run(request: Observable<BulkSaleResult>, apply: boolean): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.errors.set({});
    this.failure.set('');
    request.subscribe({
      next: (data) => {
        this.busy.set(false);
        this.result.set(data);
        if (apply) {
          this.applied.set(data.applied);
          this.ref.close(data.applied);
        }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (error instanceof AdminApiError && Object.keys(error.fields).length)
          this.errors.set(error.fields);
        else this.failure.set(errorMessage(error));
      },
    });
  }
}
