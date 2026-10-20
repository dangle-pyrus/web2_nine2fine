import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { CATALOG_API } from '../catalog/data-access/catalog-api';
import { ProductVariant } from '../catalog/models/product';
import { AuthSession } from '../auth/auth-session';

/** "Báo tôi khi có hàng" for the sold-out sizes of the selected colour. */
@Component({
  selector: 'n2f-stock-alert',
  imports: [ReactiveFormsModule],
  template: `
    @if (sent(); as message) {
      <p class="sent" role="status">{{ message }}</p>
    } @else if (!open()) {
      <button type="button" class="link" (click)="open.set(true)">
        Hết size bạn cần? Báo tôi khi có hàng
      </button>
    } @else {
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate aria-label="Báo khi có hàng">
        <div class="row">
          <label
            >Size
            <select formControlName="variantId">
              @for (variant of soldOut(); track variant.id) {
                <option [value]="variant.id">{{ variant.size }}</option>
              }
            </select>
          </label>
          <label class="email"
            >Email nhận thông báo
            <input
              type="email"
              formControlName="email"
              autocomplete="email"
              [attr.aria-invalid]="form.controls.email.invalid && form.controls.email.touched"
            />
          </label>
          <button type="submit" class="submit" [disabled]="busy()">
            {{ busy() ? 'Đang gửi…' : 'Báo tôi' }}
          </button>
        </div>
        @if (form.controls.email.invalid && form.controls.email.touched) {
          <p class="error">Nhập địa chỉ email hợp lệ.</p>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <p class="hint">Email chỉ dùng để báo một lần khi sản phẩm có hàng lại.</p>
      </form>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: 10px;
    }
    .link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--ink);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    form {
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 10px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
    }
    .email {
      flex: 1 1 200px;
    }
    select,
    input {
      min-height: 44px;
      padding: 0 12px;
      border: 1px solid #898989;
      border-radius: var(--radius-card);
      background: #fff;
      font: inherit;
      font-size: 16px;
    }
    [aria-invalid='true'] {
      border-color: var(--required);
    }
    .submit {
      min-height: 44px;
      padding: 0 20px;
      border: 1px solid var(--ink);
      border-radius: 999px;
      background: var(--ink);
      color: #fff;
      font: inherit;
      font-weight: 600;
    }
    .hint,
    .sent,
    .error {
      margin: 8px 0 0;
      font-size: 13px;
      line-height: 1.5;
    }
    .hint {
      color: var(--muted);
    }
    .error {
      color: var(--required);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockAlert {
  readonly soldOut = input.required<ProductVariant[]>();
  private readonly api = inject(CATALOG_API);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(AuthSession);
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly sent = signal('');
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    variantId: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    // A new colour resets the form to its first sold-out size.
    effect(() => {
      const first = this.soldOut()[0];
      this.sent.set('');
      this.open.set(false);
      this.form.controls.variantId.setValue(first?.id ?? '');
    });
    const email = this.session.user()?.email;
    if (email) this.form.controls.email.setValue(email);
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const { variantId, email } = this.form.getRawValue();
    const variant = this.soldOut().find((candidate) => candidate.id === variantId);
    this.busy.set(true);
    this.error.set('');
    this.api
      .notifyBackInStock(variantId, email)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () =>
          this.sent.set(
            `Đã đăng ký. nine2fine sẽ email cho ${email.trim()} khi size ${variant?.size} màu ${variant?.color.name} có hàng lại.`,
          ),
        error: () => this.error.set('Chưa đăng ký được. Vui lòng thử lại.'),
      });
  }
}
