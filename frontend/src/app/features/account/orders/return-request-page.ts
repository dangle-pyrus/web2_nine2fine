import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { finalize, map, startWith, switchMap } from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PricePipe } from '../../../shared/commerce/price.pipe';
import { ToastService } from '../../../shared/ui/toast';
import { getMedia } from '../../../../media/media-manifest';
import { STORE_POLICY } from '../../../core/store-policy';
import { ACCOUNT_API } from '../data-access/account-api';
import { accountErrorMessage } from '../account-messages';
import { Order, ReturnLine, ReturnReason } from '../../orders/order-models';
import { formatDate } from '../../orders/order-status';
import {
  canRequestReturn,
  estimateRefund,
  RETURN_REASONS,
  returnDeadline,
  returnReason,
} from '../../orders/order-returns';

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

interface Photo {
  name: string;
  url: string;
}

/** `/account/orders/:orderId/return`: pick items, reason, photos and where the refund goes. */
@Component({
  selector: 'n2f-return-request-page',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, PricePipe],
  template: `
    <a class="back" [routerLink]="['/account/orders', orderId]"
      ><n2f-icon name="reiconArrowLeft" size="16px" /> Đơn #{{ orderId }}</a
    >
    <h1>Yêu cầu trả hàng</h1>
    @if (error() && !order()) {
      <p class="form-error" role="alert">{{ error() }}</p>
    } @else if (order(); as current) {
      @if (!eligible(current)) {
        <p class="lead">
          Đơn này không còn trong thời hạn trả hàng {{ policy.returnDays }} ngày hoặc đã có yêu cầu
          trả hàng. <a routerLink="/help">Liên hệ nine2fine</a> nếu bạn cần hỗ trợ.
        </p>
      } @else {
        <p class="lead">
          Hạn gửi yêu cầu: hết ngày {{ deadline(current) }}.
          <a routerLink="/policies/returns" target="_blank">Xem chính sách trả hàng</a>
        </p>
        <form [formGroup]="form" (ngSubmit)="submit(current)" novalidate>
          <fieldset>
            <legend>1. Chọn sản phẩm muốn trả<span class="req" aria-hidden="true">*</span></legend>
            @for (item of current.items; track $index; let i = $index) {
              <div class="item" [class.picked]="picked().has(i)">
                <label class="item-check">
                  <input
                    type="checkbox"
                    [checked]="picked().has(i)"
                    (change)="toggle(i, item.quantity)"
                  />
                  <img [src]="media(item.mediaId).src" alt="" width="56" height="70" />
                  <span>
                    <strong>{{ item.name }}</strong>
                    <small>{{ item.color }} / {{ item.size }} · {{ item.unitPrice | vnd }}</small>
                  </span>
                </label>
                @if (picked().has(i) && item.quantity > 1) {
                  <label class="qty"
                    >Số lượng
                    <select
                      [value]="picked().get(i)"
                      (change)="setQuantity(i, $any($event.target).value)"
                    >
                      @for (n of range(item.quantity); track n) {
                        <option [value]="n">{{ n }}</option>
                      }
                    </select>
                  </label>
                }
              </div>
            }
            @if (submitted() && !picked().size) {
              <p class="field-error">Chọn ít nhất một sản phẩm.</p>
            }
          </fieldset>

          <fieldset>
            <legend>2. Lý do trả hàng<span class="req" aria-hidden="true">*</span></legend>
            <div class="reasons">
              @for (option of reasons; track option.value) {
                <label class="reason">
                  <input type="radio" formControlName="reason" [value]="option.value" />
                  <span
                    >{{ option.label }}
                    <small>{{
                      option.sellerFault
                        ? 'Miễn phí gửi trả'
                        : 'Phí gửi trả ' + (policy.returnShippingFee | vnd)
                    }}</small></span
                  >
                </label>
              }
            </div>
            @if (invalid('reason')) {
              <p class="field-error">Chọn lý do trả hàng.</p>
            }
          </fieldset>

          <fieldset>
            <legend>
              3. Mô tả và hình ảnh
              @if (sellerFault()) {
                <span class="req" aria-hidden="true">*</span>
              }
            </legend>
            <label for="return-detail" class="sr-only">Mô tả</label>
            <textarea
              id="return-detail"
              formControlName="detail"
              rows="3"
              [placeholder]="
                sellerFault()
                  ? 'Ví dụ: Đặt size M nhưng nhận size L, tem ghi L.'
                  : 'Không bắt buộc. Ví dụ: Áo hơi rộng ở vai.'
              "
              [attr.aria-invalid]="invalid('detail')"
            ></textarea>
            @if (invalid('detail')) {
              <p class="field-error">Mô tả ngắn vấn đề (ít nhất 10 ký tự).</p>
            }
            <label class="upload">
              <n2f-icon name="reiconPlus" size="18px" /> Thêm ảnh ({{ photos().length }}/{{
                maxPhotos
              }})
              <input
                type="file"
                accept="image/*"
                multiple
                [disabled]="photos().length >= maxPhotos"
                (change)="addPhotos($event)"
              />
            </label>
            @if (photos().length) {
              <ul class="photos">
                @for (photo of photos(); track photo.url; let i = $index) {
                  <li>
                    <img [src]="photo.url" [alt]="photo.name" width="72" height="72" />
                    <button
                      type="button"
                      [attr.aria-label]="'Xóa ảnh ' + photo.name"
                      (click)="removePhoto(i)"
                    >
                      <n2f-icon name="reiconX" size="14px" />
                    </button>
                  </li>
                }
              </ul>
            }
            <p class="hint">
              @if (sellerFault()) {
                Cần ít nhất 1 ảnh chụp sản phẩm và tem nhãn.
              } @else {
                Ảnh không bắt buộc.
              }
              Tối đa {{ maxPhotos }} ảnh, mỗi ảnh dưới 5 MB.
            </p>
            @if (photoError()) {
              <p class="field-error" role="alert">{{ photoError() }}</p>
            }
          </fieldset>

          <fieldset>
            <legend>4. Nhận tiền hoàn</legend>
            @if (needsAccount(current)) {
              <p class="hint">Đơn thanh toán khi nhận hàng được hoàn bằng chuyển khoản.</p>
              <div class="row">
                <div class="field">
                  <label for="refund-bank"
                    >Ngân hàng<span class="req" aria-hidden="true">*</span></label
                  >
                  <input
                    id="refund-bank"
                    formControlName="bank"
                    placeholder="VD: Vietcombank"
                    [attr.aria-invalid]="invalid('bank')"
                  />
                  @if (invalid('bank')) {
                    <p class="field-error">Nhập tên ngân hàng.</p>
                  }
                </div>
                <div class="field">
                  <label for="refund-number"
                    >Số tài khoản<span class="req" aria-hidden="true">*</span></label
                  >
                  <input
                    id="refund-number"
                    formControlName="accountNumber"
                    inputmode="numeric"
                    autocomplete="off"
                    [attr.aria-invalid]="invalid('accountNumber')"
                  />
                  @if (invalid('accountNumber')) {
                    <p class="field-error">Số tài khoản gồm 6–19 chữ số.</p>
                  }
                </div>
              </div>
              <div class="field">
                <label for="refund-name"
                  >Chủ tài khoản<span class="req" aria-hidden="true">*</span></label
                >
                <input
                  id="refund-name"
                  formControlName="accountName"
                  autocomplete="off"
                  [attr.aria-invalid]="invalid('accountName')"
                />
                @if (invalid('accountName')) {
                  <p class="field-error">Nhập tên chủ tài khoản.</p>
                }
              </div>
            } @else {
              <p class="hint">Tiền được hoàn về phương thức bạn đã dùng để thanh toán đơn này.</p>
            }
          </fieldset>

          <section class="estimate" aria-live="polite">
            <div>
              <span>Dự kiến hoàn</span>
              <strong>{{ refund().amount | vnd }}</strong>
            </div>
            <p class="hint">
              @if (refund().returnShippingFee) {
                Đã trừ phí gửi trả {{ refund().returnShippingFee | vnd }}.
              }
              Hoàn trong {{ policy.refundWorkingDays }} ngày làm việc sau khi nine2fine nhận và kiểm
              tra hàng.
            </p>
          </section>

          @if (!sellerFault()) {
            <label class="ack">
              <input
                type="checkbox"
                formControlName="condition"
                [attr.aria-invalid]="invalid('condition')"
              />
              <span>Sản phẩm còn nguyên tem nhãn, chưa qua sử dụng và chưa giặt.</span>
            </label>
            @if (invalid('condition')) {
              <p class="field-error">Vui lòng xác nhận tình trạng sản phẩm.</p>
            }
          }

          @if (error()) {
            <p class="form-error" role="alert">{{ error() }}</p>
          }
          <div class="actions">
            <button class="pill" type="submit" [disabled]="busy()">
              {{ busy() ? 'Đang gửi…' : 'Gửi yêu cầu trả hàng' }}
            </button>
            <a class="pill outline" [routerLink]="['/account/orders', orderId]">Hủy</a>
          </div>
        </form>
      }
    } @else {
      <p class="state" role="status">Đang tải đơn hàng…</p>
    }
  `,
  styleUrl: '../ui/account.scss',
  styles: `
    :host {
      max-width: 760px;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 13px;
    }
    h1 {
      margin-top: 12px;
    }
    .lead a,
    .lead + form a {
      text-decoration: underline;
    }
    fieldset {
      margin: 0 0 28px;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: 12px;
      font-size: 17px;
      font-weight: 700;
    }
    .item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
    }
    .item + .item {
      margin-top: 10px;
    }
    .item.picked {
      border-color: var(--ink);
    }
    .item-check {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }
    .item-check img {
      border-radius: 6px;
      object-fit: cover;
    }
    .item-check span {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    small {
      color: var(--muted);
      font-size: 13px;
    }
    .qty {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    input[type='checkbox'],
    input[type='radio'] {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      accent-color: var(--ink);
    }
    .reasons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .reason {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
      cursor: pointer;
    }
    .reason:has(input:checked) {
      border-color: var(--ink);
      box-shadow: 0 0 0 1px var(--ink);
    }
    .reason span {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    textarea,
    .field input,
    select {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #898989;
      border-radius: var(--radius-card);
      background: #fff;
      font: inherit;
      font-size: 16px;
    }
    select {
      width: auto;
      padding: 6px 10px;
    }
    .upload {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      padding: 10px 16px;
      border: 1px dashed var(--ink);
      border-radius: 999px;
      font-size: 14px;
      cursor: pointer;
    }
    .upload input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
    .photos {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
    }
    .photos li {
      position: relative;
    }
    .photos img {
      border-radius: 8px;
      object-fit: cover;
    }
    .photos button {
      position: absolute;
      top: -6px;
      right: -6px;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: 0;
      border-radius: 50%;
      background: var(--ink);
      color: #fff;
    }
    .hint {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
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
      margin-top: 14px;
      font-size: 14px;
    }
    .field-error {
      margin: 6px 0 0;
      color: var(--required);
      font-size: 13px;
    }
    [aria-invalid='true'] {
      border-color: var(--required) !important;
    }
    .estimate {
      margin-bottom: 20px;
      padding: 16px 18px;
      border-radius: var(--radius-card);
      background: var(--surface);
    }
    .estimate div {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .estimate strong {
      font-size: 22px;
    }
    .ack {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      line-height: 1.5;
      cursor: pointer;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 24px;
    }
    @media (max-width: 700px) {
      .reasons,
      .row {
        grid-template-columns: 1fr;
      }
      .actions .pill {
        flex: 1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnRequestPage {
  private readonly api = inject(ACCOUNT_API);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly policy = STORE_POLICY;
  readonly reasons = RETURN_REASONS;
  readonly maxPhotos = MAX_PHOTOS;
  readonly media = getMedia;
  readonly orderId = inject(ActivatedRoute).snapshot.paramMap.get('orderId') ?? '';

  readonly order = signal<Order | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly submitted = signal(false);
  /** Line index → quantity to return. */
  readonly picked = signal<ReadonlyMap<number, number>>(new Map());
  readonly photos = signal<Photo[]>([]);
  readonly photoError = signal('');

  readonly form = inject(FormBuilder).nonNullable.group({
    reason: ['' as ReturnReason | '', Validators.required],
    detail: [''],
    bank: [''],
    accountNumber: [''],
    accountName: [''],
    condition: [false],
  });
  private readonly reason = toSignal(
    this.form.controls.reason.valueChanges.pipe(startWith(this.form.controls.reason.value)),
    { requireSync: true },
  );
  readonly sellerFault = computed(() => {
    const reason = this.reason();
    return !!reason && returnReason(reason).sellerFault;
  });
  readonly refund = computed(() => {
    const order = this.order();
    const reason = this.reason() || 'changed-mind';
    return order
      ? estimateRefund(order, this.lines(), reason)
      : { amount: 0, returnShippingFee: 0 };
  });

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(
        map((params) => params.get('orderId') ?? ''),
        switchMap((id) => this.api.getOrder(id)),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (order) => {
          this.order.set(order);
          // A single-line order starts with that line picked.
          if (order.items.length === 1) this.picked.set(new Map([[0, order.items[0].quantity]]));
          this.setAccountValidators(this.needsAccount(order));
        },
        error: (error: unknown) => this.error.set(accountErrorMessage(error)),
      });
    // Fault reasons need a description; the shopper's own reasons need the condition confirmed.
    this.form.controls.reason.valueChanges.pipe(takeUntilDestroyed()).subscribe((reason) => {
      const fault = !!reason && returnReason(reason).sellerFault;
      this.form.controls.detail.setValidators(
        fault ? [Validators.required, Validators.minLength(10), Validators.pattern(/\S/)] : [],
      );
      this.form.controls.condition.setValidators(fault ? [] : [Validators.requiredTrue]);
      this.form.controls.detail.updateValueAndValidity();
      this.form.controls.condition.updateValueAndValidity();
    });
    this.destroyRef.onDestroy(() =>
      this.photos().forEach((photo) => URL.revokeObjectURL(photo.url)),
    );
  }

  eligible(order: Order): boolean {
    return canRequestReturn(order);
  }

  deadline(order: Order): string {
    const iso = returnDeadline(order);
    return iso ? formatDate(iso) : '';
  }

  needsAccount(order: Order): boolean {
    return !order.payment.paid || order.payment.method === 'cod';
  }

  invalid(key: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[key];
    return control.invalid && (control.touched || this.submitted());
  }

  range(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index + 1);
  }

  toggle(index: number, quantity: number): void {
    this.picked.update((current) => {
      const next = new Map(current);
      if (next.has(index)) next.delete(index);
      else next.set(index, quantity);
      return next;
    });
  }

  setQuantity(index: number, value: string): void {
    this.picked.update((current) => new Map(current).set(index, Number(value)));
  }

  addPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    this.photoError.set('');
    const room = MAX_PHOTOS - this.photos().length;
    const accepted = files.filter(
      (file) => file.type.startsWith('image/') && file.size <= MAX_PHOTO_BYTES,
    );
    if (accepted.length < files.length) this.photoError.set('Chỉ nhận ảnh dưới 5 MB.');
    if (accepted.length > room) this.photoError.set(`Tối đa ${MAX_PHOTOS} ảnh.`);
    this.photos.update((photos) => [
      ...photos,
      ...accepted
        .slice(0, room)
        .map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    ]);
  }

  removePhoto(index: number): void {
    const photo = this.photos()[index];
    if (photo) URL.revokeObjectURL(photo.url);
    this.photos.update((photos) => photos.filter((_, i) => i !== index));
  }

  submit(order: Order): void {
    if (this.busy()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const needsPhoto = this.sellerFault() && !this.photos().length;
    if (needsPhoto) this.photoError.set('Vui lòng thêm ít nhất 1 ảnh sản phẩm.');
    if (this.form.invalid || !this.picked().size || needsPhoto) {
      this.error.set('Vui lòng kiểm tra các thông tin được đánh dấu.');
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.api
      .requestReturn(order.id, {
        lines: this.lines(),
        reason: value.reason as ReturnReason,
        detail: value.detail,
        photoCount: this.photos().length,
        refundAccount: this.needsAccount(order)
          ? {
              bank: value.bank.trim(),
              accountNumber: value.accountNumber.replace(/\s/g, ''),
              accountName: value.accountName.trim().toUpperCase(),
            }
          : null,
      })
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.toast.show({
            title: 'Đã gửi yêu cầu trả hàng',
            detail: 'nine2fine sẽ liên hệ trong 24 giờ làm việc để hẹn lấy hàng.',
          });
          void this.router.navigate(['/account/orders', updated.id]);
        },
        error: (error: unknown) => this.error.set(accountErrorMessage(error)),
      });
  }

  private lines(): ReturnLine[] {
    return [...this.picked()].map(([index, quantity]) => ({ index, quantity }));
  }

  private setAccountValidators(required: boolean): void {
    const controls = this.form.controls;
    controls.bank.setValidators(
      required ? [Validators.required, Validators.pattern(/\S{2,}/)] : [],
    );
    controls.accountNumber.setValidators(
      required ? [Validators.required, Validators.pattern(/^\s*\d[\d\s]{4,22}\d\s*$/)] : [],
    );
    controls.accountName.setValidators(
      required ? [Validators.required, Validators.pattern(/\S.{1,}/)] : [],
    );
    for (const key of ['bank', 'accountNumber', 'accountName'] as const) {
      controls[key].updateValueAndValidity();
    }
  }
}
