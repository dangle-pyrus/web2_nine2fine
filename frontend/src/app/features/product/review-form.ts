import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, of } from 'rxjs';
import { CATALOG_API } from '../catalog/data-access/catalog-api';
import { ProductReview, ReviewEligibility } from '../catalog/models/product';
import { AuthSession } from '../auth/auth-session';

/** "Viết đánh giá": only shoppers who received this product can review it, once. */
@Component({
  selector: 'n2f-review-form',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    @if (done()) {
      <p class="note" role="status">Cảm ơn bạn đã đánh giá. Đánh giá của bạn đã được đăng.</p>
    } @else if (eligibility(); as state) {
      @switch (state.status) {
        @case ('sign-in') {
          <p class="note">
            Đã mua sản phẩm này?
            <a routerLink="/auth/login" [queryParams]="{ returnUrl: returnUrl() }">Đăng nhập</a>
            để viết đánh giá.
          </p>
        }
        @case ('not-purchased') {
          <p class="note">Chỉ khách đã mua và nhận sản phẩm này mới có thể viết đánh giá.</p>
        }
        @case ('reviewed') {
          <p class="note">Bạn đã đánh giá sản phẩm này.</p>
        }
        @case ('eligible') {
          @if (!open()) {
            <button type="button" class="pill outline" (click)="open.set(true)">
              Viết đánh giá
            </button>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate aria-label="Viết đánh giá">
              <fieldset class="stars-field">
                <legend>Bạn chấm mấy sao?<span class="req" aria-hidden="true">*</span></legend>
                <div class="stars">
                  @for (star of [1, 2, 3, 4, 5]; track star) {
                    <label [class.on]="star <= form.controls.rating.value">
                      <input
                        type="radio"
                        formControlName="rating"
                        [value]="star"
                        [attr.aria-label]="star + ' sao'"
                      />★
                    </label>
                  }
                </div>
                @if (invalid('rating')) {
                  <p class="field-error">Chọn số sao.</p>
                }
              </fieldset>
              <fieldset>
                <legend>Độ vừa</legend>
                <div class="chips">
                  @for (option of fitOptions; track option.value) {
                    <label class="chip">
                      <input type="radio" formControlName="fit" [value]="option.value" />
                      {{ option.label }}
                    </label>
                  }
                </div>
              </fieldset>
              <div class="row">
                <div class="field">
                  <label for="review-size">Size đã mua</label>
                  <input id="review-size" formControlName="sizeBought" />
                </div>
                <div class="field">
                  <label for="review-height">Chiều cao (không bắt buộc)</label>
                  <input id="review-height" formControlName="height" placeholder="VD: 165 cm" />
                </div>
              </div>
              <div class="field">
                <label for="review-title"
                  >Tiêu đề<span class="req" aria-hidden="true">*</span></label
                >
                <input
                  id="review-title"
                  formControlName="title"
                  maxlength="80"
                  [attr.aria-invalid]="invalid('title')"
                />
                @if (invalid('title')) {
                  <p class="field-error">Nhập tiêu đề ngắn.</p>
                }
              </div>
              <div class="field">
                <label for="review-body"
                  >Nhận xét<span class="req" aria-hidden="true">*</span></label
                >
                <textarea
                  id="review-body"
                  formControlName="body"
                  rows="4"
                  maxlength="1000"
                  placeholder="Chất liệu, phom dáng, bạn mặc vào dịp nào…"
                  [attr.aria-invalid]="invalid('body')"
                ></textarea>
                @if (invalid('body')) {
                  <p class="field-error">Nhận xét cần ít nhất 20 ký tự.</p>
                }
              </div>
              <p class="hint">
                Đánh giá được đăng kèm tên rút gọn của bạn và nhãn "Đã mua hàng". Không ghi số điện
                thoại, địa chỉ hay thông tin cá nhân của người khác.
              </p>
              @if (error()) {
                <p class="field-error" role="alert">{{ error() }}</p>
              }
              <div class="actions">
                <button class="pill" type="submit" [disabled]="busy()">
                  {{ busy() ? 'Đang gửi…' : 'Đăng đánh giá' }}
                </button>
                <button type="button" class="pill outline" (click)="open.set(false)">Hủy</button>
              </div>
            </form>
          }
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
      margin: 12px 0 20px;
    }
    .note,
    .hint {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .note a {
      color: var(--ink);
      font-weight: 600;
      text-decoration: underline;
    }
    form {
      max-width: 640px;
      padding: 20px;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
    }
    fieldset {
      margin: 0 0 16px;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 600;
    }
    .stars {
      display: flex;
      gap: 4px;
      font-size: 28px;
      line-height: 1;
    }
    .stars label {
      color: #d0d0d0;
      cursor: pointer;
    }
    .stars label.on {
      color: var(--ink);
    }
    .stars input,
    .chip input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .stars label:has(input:focus-visible),
    .chip:has(input:focus-visible) {
      outline: 2px solid var(--ink);
      outline-offset: 2px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      position: relative;
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 999px;
      font-size: 13px;
      cursor: pointer;
    }
    .chip:has(input:checked) {
      border-color: var(--ink);
      background: var(--ink);
      color: #fff;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 16px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 14px;
      font-size: 14px;
    }
    input:not([type='radio']),
    textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #898989;
      border-radius: var(--radius-card);
      font: inherit;
      font-size: 16px;
    }
    [aria-invalid='true'] {
      border-color: var(--required) !important;
    }
    .req,
    .field-error {
      color: var(--required);
    }
    .field-error {
      margin: 4px 0 0;
      font-size: 13px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 16px;
    }
    .pill {
      min-height: 44px;
      padding: 0 22px;
      border: 1px solid var(--ink);
      border-radius: 999px;
      background: var(--ink);
      color: #fff;
      font: inherit;
      font-weight: 600;
    }
    .pill.outline {
      background: #fff;
      color: var(--ink);
    }
    @media (max-width: 600px) {
      .row {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewForm {
  readonly productId = input.required<string>();
  readonly reviewed = output<ProductReview>();
  private readonly api = inject(CATALOG_API);
  private readonly router = inject(Router);
  private readonly session = inject(AuthSession);
  private readonly destroyRef = inject(DestroyRef);
  readonly eligibility = signal<ReviewEligibility | null>(null);
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal('');
  readonly fitOptions = [
    { value: -1, label: 'Hơi chật' },
    { value: 0, label: 'Vừa size' },
    { value: 1, label: 'Hơi rộng' },
  ] as const;
  readonly form = inject(FormBuilder).nonNullable.group({
    rating: [0, Validators.min(1)],
    fit: [0 as -1 | 0 | 1],
    sizeBought: [''],
    height: [''],
    title: ['', [Validators.required, Validators.pattern(/\S.{1,}/)]],
    body: ['', [Validators.required, Validators.minLength(20)]],
  });

  constructor() {
    // Re-checked when the product or the signed-in shopper changes.
    effect((onCleanup) => {
      const id = this.productId();
      this.session.user();
      this.done.set(false);
      this.open.set(false);
      const sub = this.api
        .reviewEligibility(id)
        .pipe(catchError(() => of(null)))
        .subscribe((state) => {
          this.eligibility.set(state);
          if (state?.sizeBought) this.form.controls.sizeBought.setValue(state.sizeBought);
        });
      onCleanup(() => sub.unsubscribe());
    });
  }

  returnUrl(): string {
    return `${this.router.url.split('#')[0]}#reviews`;
  }

  invalid(key: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[key];
    return control.invalid && control.touched;
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .submitReview(this.productId(), this.form.getRawValue())
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (review) => {
          this.done.set(true);
          this.eligibility.set({ status: 'reviewed' });
          this.reviewed.emit(review);
        },
        error: () => this.error.set('Chưa gửi được đánh giá. Vui lòng thử lại.'),
      });
  }
}
