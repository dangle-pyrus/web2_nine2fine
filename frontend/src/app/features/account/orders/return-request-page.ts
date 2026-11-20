import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  finalize,
  map,
  Observable,
  of,
  startWith,
  Subscription,
  switchMap,
} from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PricePipe } from '../../../shared/commerce/price.pipe';
import { ToastService } from '../../../shared/ui/toast';
import { getMedia } from '../../../../media/media-manifest';
import { storeSettings } from '../../../core/store-settings';
import { API_CONFIG } from '../../../core/api-config';
import { ORDERS_API, orderErrorMessage } from '../data-access/orders-api';
import { CHECKOUT_API, CheckoutError } from '../../checkout/checkout-api';
import { GuestOrderView } from '../../tracking/guest-order-view';
import {
  ReturnApiError,
  ReturnAudience,
  ReturnCreateBody,
  returnErrorBlocksOrder,
  returnErrorMessage,
  returnPhotoError,
  RETURNS_API,
} from '../../orders/returns-api';
import { ACCOUNT_API, MAX_RETURN_PHOTO_BYTES, MAX_RETURN_PHOTOS } from '../data-access/account-api';
import { accountErrorMessage } from '../account-messages';
import { Order, ReturnAmount, ReturnLine, ReturnReason } from '../../orders/order-models';
import { formatDate } from '../../orders/order-status';
import {
  canRequestReturn,
  estimateRefund,
  RETURN_REASONS,
  returnBlockedReason,
  returnDeadline,
  returnReason,
} from '../../orders/order-returns';

const MAX_PHOTOS = MAX_RETURN_PHOTOS;
const MAX_PHOTO_BYTES = MAX_RETURN_PHOTO_BYTES;
/** RET-04: the formats the server accepts. */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DETAIL_MAX = 500;
const DETAIL_MIN_SHOP_FAULT = 10;

/** RET-04: shop fault 10–500 characters (trimmed), the shopper's own reasons optional, ≤ 500. */
function detailValidator(control: AbstractControl): ValidationErrors | null {
  const length = String(control.value ?? '').trim().length;
  if (length > DETAIL_MAX) return { detail: true };
  const reason = control.parent?.get('reason')?.value as ReturnReason | '' | undefined;
  const shopFault = !!reason && returnReason(reason).sellerFault;
  return shopFault && length < DETAIL_MIN_SHOP_FAULT ? { detail: true } : null;
}

/** RET-06: 6–19 digits once spaces are removed. */
function accountNumberValidator(control: AbstractControl): ValidationErrors | null {
  return /^\d{6,19}$/.test(String(control.value ?? '').replace(/\s/g, ''))
    ? null
    : { accountNumber: true };
}

/** A picked photo; it uploads right away and the request only sends finished IDs. */
interface Photo {
  key: number;
  name: string;
  /** Local preview (object URL). */
  url: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  id?: string;
  error?: string;
}

/**
 * `/account/orders/:orderId/return` (member) and `/track-order/:orderId/return` (guest after the OTP
 * lookup, BR-RET-60): pick items, reason, photos and where the refund goes. One form for both; the
 * guest's calls go to `/orders/{code}/return*` and are opened by the `n2f_oa` grant cookie.
 */
@Component({
  selector: 'n2f-return-request-page',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, PricePipe],
  template: `
    <a class="back" [routerLink]="orderLink"
      ><n2f-icon name="reiconArrowLeft" size="16px" /> {{ guest ? 'Tra cứu đơn hàng · ' : '' }}Đơn
      #{{ orderId }}</a
    >
    <h1>Yêu cầu trả hàng</h1>
    @if (error() && !order()) {
      <p class="form-error" role="alert">
        {{ error() }}
        @if (guest) {
          <a routerLink="/track-order" [queryParams]="{ orderCode: orderId }">Tra cứu đơn hàng</a>
        }
      </p>
    } @else if (order(); as current) {
      @if (!eligible(current)) {
        <p class="lead" data-testid="return-blocked">
          @if (blockedReason(current); as reason) {
            {{ reason }}
          } @else {
            Đơn này chưa đủ điều kiện trả hàng hoặc đã quá thời hạn {{ policy.returnDays }} ngày.
          }
          <a routerLink="/help">Liên hệ nine2fine</a> nếu bạn cần hỗ trợ.
          <a [routerLink]="orderLink">Xem chi tiết đơn</a>
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
            @if (serverError('lines'); as text) {
              <p class="field-error" role="alert">{{ text }}</p>
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
            @if (serverError('reason'); as text) {
              <p class="field-error" role="alert">{{ text }}</p>
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
              maxlength="500"
              [attr.aria-invalid]="invalid('detail')"
              aria-describedby="return-detail-count"
            ></textarea>
            <p class="hint count" id="return-detail-count">
              {{ detailLength() }}/500 ký tự{{ sellerFault() ? ' (tối thiểu 10)' : '' }}
            </p>
            @if (invalid('detail')) {
              <p class="field-error">
                {{
                  sellerFault()
                    ? 'Mô tả lỗi từ 10 đến 500 ký tự.'
                    : 'Mô tả tối đa 500 ký tự.'
                }}
              </p>
            }
            @if (serverError('detail'); as text) {
              <p class="field-error" role="alert">{{ text }}</p>
            }
            <label class="upload">
              <n2f-icon name="reiconPlus" size="18px" /> Thêm ảnh ({{ photos().length }}/{{
                maxPhotos
              }})
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                [disabled]="photos().length >= maxPhotos"
                (change)="addPhotos($event)"
              />
            </label>
            @if (photos().length) {
              <ul class="photos">
                @for (photo of photos(); track photo.key; let i = $index) {
                  <li [class.failed]="photo.status === 'error'">
                    <img [src]="photo.url" [alt]="photo.name" width="72" height="72" />
                    @if (photo.status === 'uploading') {
                      <progress
                        max="100"
                        [value]="photo.progress"
                        [attr.aria-label]="'Đang tải ' + photo.name"
                      ></progress>
                    } @else if (photo.status === 'error') {
                      <span class="photo-error" role="alert">{{ photo.error }}</span>
                    }
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
              Tối đa {{ maxPhotos }} ảnh JPEG, PNG hoặc WebP, mỗi ảnh tối đa 5 MB.
            </p>
            @if (photoError()) {
              <p class="field-error" role="alert">{{ photoError() }}</p>
            }
            @if (serverError('photos'); as text) {
              <p class="field-error" role="alert">{{ text }}</p>
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
                  @if (serverError('bank'); as text) {
                    <p class="field-error" role="alert">{{ text }}</p>
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
                  @if (serverError('accountNumber'); as text) {
                    <p class="field-error" role="alert">{{ text }}</p>
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
                @if (serverError('accountName'); as text) {
                  <p class="field-error" role="alert">{{ text }}</p>
                }
              </div>
            } @else {
              <p class="hint">
                Đơn đã thanh toán bằng chuyển khoản QR: tiền được hoàn về tài khoản đã thanh toán
                đơn này, bạn không cần nhập tài khoản mới.
              </p>
            }
          </fieldset>

          <section class="estimate" aria-live="polite" data-testid="return-estimate">
            @let amount = refund();
            @if (amount.goodsAmount) {
              <dl class="breakdown">
                <div>
                  <dt>Tiền hàng trả lại</dt>
                  <dd>{{ amount.goodsAmount | vnd }}</dd>
                </div>
                @if (amount.shippingRefund) {
                  <div>
                    <dt>Hoàn phí giao hàng ban đầu</dt>
                    <dd>+{{ amount.shippingRefund | vnd }}</dd>
                  </div>
                }
                @if (amount.returnShippingFee) {
                  <div>
                    <dt>Phí gửi trả (lý do của bạn)</dt>
                    <dd>−{{ amount.returnShippingFee | vnd }}</dd>
                  </div>
                }
              </dl>
            }
            <div>
              <span>Dự kiến hoàn</span>
              <strong>{{ amount.amount | vnd }}</strong>
            </div>
            <p class="hint">
              @if (!amount.goodsAmount) {
                Chọn sản phẩm và lý do để xem số tiền dự kiến.
              } @else if (sellerFault() && !amount.shippingRefund) {
                Phí giao hàng ban đầu chỉ được hoàn khi trả lại toàn bộ đơn vì lỗi của nine2fine.
              }
              @if (httpMode) {
                Số tiền dự kiến, chốt sau khi nine2fine kiểm hàng. Dự kiến hoàn trong
                {{ policy.refundWorkingDays }} ngày làm việc sau khi nine2fine nhận hàng.
              } @else {
                Hoàn trong {{ policy.refundWorkingDays }} ngày làm việc sau khi nine2fine nhận và
                kiểm tra hàng.
              }
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
            @if (serverError('conditionAck'); as text) {
              <p class="field-error" role="alert">{{ text }}</p>
            }
          }

          @if (error()) {
            <p class="form-error" role="alert">
              {{ error() }}
              @if (blocked()) {
                <a [routerLink]="orderLink">Xem chi tiết đơn</a>
              }
            </p>
          }
          <div class="actions">
            <button class="pill" type="submit" [disabled]="busy() || uploading()">
              {{ busy() ? 'Đang gửi…' : uploading() ? 'Đang tải ảnh…' : 'Gửi yêu cầu trả hàng' }}
            </button>
            <a class="pill outline" [routerLink]="orderLink">Hủy</a>
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
      display: grid;
      gap: 4px;
      width: 72px;
    }
    .photos li.failed img {
      opacity: 0.4;
    }
    .photos progress {
      width: 72px;
      height: 6px;
    }
    .photo-error {
      color: var(--brand);
      font-size: 11px;
      line-height: 1.3;
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
    .estimate .breakdown {
      display: grid;
      gap: 6px;
      margin: 0 0 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
      font-size: 14px;
    }
    .estimate .breakdown dt {
      color: var(--muted);
    }
    .estimate .breakdown dd {
      margin: 0;
    }
    .count {
      text-align: right;
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
  private readonly ordersApi = inject(ORDERS_API);
  private readonly checkout = inject(CHECKOUT_API);
  private readonly returns = inject(RETURNS_API);
  /** `returnsMode: http`: server-computed eligibility and amount, raw-byte photos, idempotent send. */
  readonly httpMode = this.isGuest() || inject(API_CONFIG).returnsMode === 'http';
  private readonly router = inject(Router);
  /** Read before the fields that depend on it. */
  private isGuest(): boolean {
    return inject(ActivatedRoute).snapshot.data['guest'] === true;
  }
  private readonly guestView = inject(GuestOrderView);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  get policy() {
    return storeSettings().policy;
  }
  readonly reasons = RETURN_REASONS;
  readonly maxPhotos = MAX_PHOTOS;
  readonly media = getMedia;
  readonly orderId = inject(ActivatedRoute).snapshot.paramMap.get('orderId') ?? '';
  /** A guest who passed the OTP lookup (BR-RET-60); needs the real API (`returnsMode: http`). */
  readonly guest = inject(ActivatedRoute).snapshot.data['guest'] === true;
  private readonly audience: ReturnAudience = this.guest ? 'guest' : 'member';
  /** Where "back" and "Xem chi tiết đơn" go. */
  readonly orderLink = this.guest ? ['/track-order'] : ['/account/orders', this.orderId];

  readonly order = signal<Order | null>(null);
  readonly error = signal('');
  /** Server field errors (422), keyed by contract field name. */
  private readonly serverErrors = signal<Record<string, string>>({});
  /** The request cannot be sent at all (not returnable / window closed / already requested). */
  readonly blocked = signal(false);
  /** Same body, same key: a retry after a lost answer never creates a second request. */
  private sendKey: { fingerprint: string; key: string } | null = null;
  private readonly serverAmount = signal<ReturnAmount | null>(null);
  readonly busy = signal(false);
  readonly submitted = signal(false);
  /** Line index → quantity to return. */
  readonly picked = signal<ReadonlyMap<number, number>>(new Map());
  readonly photos = signal<Photo[]>([]);
  readonly photoError = signal('');
  /** The request waits for photos still uploading. */
  readonly uploading = computed(() => this.photos().some((photo) => photo.status === 'uploading'));
  private readonly uploads = new Map<number, Subscription>();
  private photoKey = 0;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly form = inject(FormBuilder).nonNullable.group({
    reason: ['' as ReturnReason | '', Validators.required],
    detail: ['', detailValidator],
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
  readonly detailLength = toSignal(
    this.form.controls.detail.valueChanges.pipe(map((value) => value.trim().length)),
    { initialValue: 0 },
  );
  /** RET-07: from the order as stored (server estimate when it answered, else the same formula). */
  readonly refund = computed((): ReturnAmount => {
    const order = this.order();
    const reason = this.reason() || 'changed-mind';
    const server = this.serverAmount();
    if (this.httpMode && server) return server;
    return order
      ? estimateRefund(order, this.lines(), reason)
      : { goodsAmount: 0, shippingRefund: 0, returnShippingFee: 0, amount: 0, final: false };
  });

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(
        map((params) => params.get('orderId') ?? ''),
        switchMap((id) =>
          this.guest
            ? this.checkout.getOrder(id)
            : this.httpMode
              ? this.ordersApi.getMine(id)
              : this.api.getOrder(id),
        ),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (order) => {
          this.order.set(order);
          // A single-line order starts with that line picked.
          if (order.items.length === 1) this.picked.set(new Map([[0, order.items[0].quantity]]));
          this.setAccountValidators(this.needsAccount(order));
        },
        error: (error: unknown) =>
          this.error.set(
            this.guest
              ? this.guestLoadError(error)
              : this.httpMode
                ? orderErrorMessage(error)
                : accountErrorMessage(error),
          ),
      });
    if (this.httpMode) this.watchEstimate();
    // Any edit clears the server's complaint about that field.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.clearServerErrors());
    // RET-02/04: fault reasons need a description; the shopper's own reasons need the condition
    // (tags on, unused, unwashed) confirmed.
    this.form.controls.reason.valueChanges.pipe(takeUntilDestroyed()).subscribe((reason) => {
      const fault = !!reason && returnReason(reason).sellerFault;
      this.form.controls.condition.setValidators(fault ? [] : [Validators.requiredTrue]);
      this.form.controls.detail.updateValueAndValidity();
      this.form.controls.condition.updateValueAndValidity();
    });
    this.destroyRef.onDestroy(() => {
      this.uploads.forEach((upload) => upload.unsubscribe());
      this.photos().forEach((photo) => URL.revokeObjectURL(photo.url));
    });
  }

  serverError(field: string): string {
    return this.serverErrors()[field] ?? '';
  }

  private clearServerErrors(...fields: string[]): void {
    this.serverErrors.update((current) => {
      if (!Object.keys(current).length) return current;
      if (!fields.length) return {};
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  }

  /** "Dự kiến hoàn" from the server formula, refreshed as the lines or the reason change. */
  private watchEstimate(): void {
    const input = computed(() => {
      const order = this.order();
      const reason = this.reason();
      const lines = this.lines().flatMap((line) => {
        const variantId = order?.items[line.index]?.variantId;
        return variantId ? [{ variantId, quantity: line.quantity }] : [];
      });
      return order && reason && lines.length ? { id: order.id, lines, reason } : null;
    });
    toObservable(input)
      .pipe(
        debounceTime(250),
        switchMap((value) =>
          value
            ? this.returns
                .estimate(value.id, value.lines, value.reason, this.audience)
                .pipe(catchError(() => of(null)))
            : of(null),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((amount) => this.serverAmount.set(amount));
  }

  eligible(order: Order): boolean {
    return canRequestReturn(order);
  }

  /** RET-03: the request that stops a new one (in progress, rejected or refunded). */
  blockedReason(order: Order): string {
    return returnBlockedReason(order);
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
    this.clearServerErrors('lines');
    this.picked.update((current) => {
      const next = new Map(current);
      if (next.has(index)) next.delete(index);
      else next.set(index, quantity);
      return next;
    });
  }

  setQuantity(index: number, value: string): void {
    this.clearServerErrors('lines');
    this.picked.update((current) => new Map(current).set(index, Number(value)));
  }

  addPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    this.photoError.set('');
    const room = MAX_PHOTOS - this.photos().length;
    const wrongType = files.filter((file) => !PHOTO_TYPES.includes(file.type));
    const tooBig = files.filter(
      (file) => PHOTO_TYPES.includes(file.type) && file.size > MAX_PHOTO_BYTES,
    );
    const accepted = files.filter(
      (file) => PHOTO_TYPES.includes(file.type) && file.size <= MAX_PHOTO_BYTES,
    );
    const problems: string[] = [];
    if (wrongType.length) problems.push('Chỉ nhận ảnh JPEG, PNG hoặc WebP.');
    if (tooBig.length) problems.push('Mỗi ảnh tối đa 5 MB.');
    if (accepted.length > room) problems.push(`Tối đa ${MAX_PHOTOS} ảnh.`);
    this.photoError.set(problems.join(' '));
    for (const file of accepted.slice(0, room)) this.upload(file);
  }

  removePhoto(index: number): void {
    const photo = this.photos()[index];
    if (!photo) return;
    this.uploads.get(photo.key)?.unsubscribe();
    this.uploads.delete(photo.key);
    URL.revokeObjectURL(photo.url);
    this.clearServerErrors('photos');
    this.photos.update((photos) => photos.filter((_, i) => i !== index));
  }

  /** Uploads one photo now; a failure stays on that photo and does not block the others. */
  private upload(file: File): void {
    const key = ++this.photoKey;
    const patch = (change: Partial<Photo>) =>
      this.photos.update((photos) =>
        photos.map((photo) => (photo.key === key ? { ...photo, ...change } : photo)),
      );
    this.photos.update((photos) => [
      ...photos,
      { key, name: file.name, url: URL.createObjectURL(file), status: 'uploading', progress: 0 },
    ]);
    const source$: Observable<
      { kind: 'progress'; percent: number } | { kind: 'done'; photo: { id: string } }
    > = this.httpMode
      ? this.returns.uploadPhoto(file, this.guest ? this.orderId : undefined)
      : this.api.uploadReturnPhoto(file);
    const upload = source$.subscribe({
      next: (event) =>
        event.kind === 'progress'
          ? patch({ progress: event.percent })
          : patch({ status: 'done', progress: 100, id: event.photo.id }),
      error: (error: unknown) => {
        patch({
          status: 'error',
          error: this.httpMode
            ? returnPhotoError(error, this.audience)
            : accountErrorMessage(error),
        });
        this.uploads.delete(key);
      },
      complete: () => this.uploads.delete(key),
    });
    this.uploads.set(key, upload);
  }

  submit(order: Order): void {
    if (this.busy() || this.uploading()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const uploaded = this.photos().filter((photo) => photo.status === 'done' && photo.id);
    const needsPhoto = this.sellerFault() && !uploaded.length;
    if (needsPhoto) this.photoError.set('Vui lòng thêm ít nhất 1 ảnh sản phẩm.');
    if (this.form.invalid || !this.picked().size || needsPhoto) {
      this.error.set('Vui lòng kiểm tra các thông tin được đánh dấu.');
      this.focusFirstError();
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.blocked.set(false);
    if (this.httpMode) {
      this.sendHttp(order, value, uploaded);
      return;
    }
    this.api
      .requestReturn(order.id, {
        lines: this.lines(),
        reason: value.reason as ReturnReason,
        detail: value.detail,
        photoCount: uploaded.length,
        photoIds: uploaded.map((photo) => photo.id!),
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

  private sendHttp(
    order: Order,
    value: ReturnType<typeof this.form.getRawValue>,
    uploaded: Photo[],
  ): void {
    const lines = this.lines().map((line) => ({
      variantId: order.items[line.index]?.variantId ?? '',
      quantity: line.quantity,
    }));
    if (lines.some((line) => !line.variantId)) {
      this.busy.set(false);
      this.error.set('Không đọc được dòng sản phẩm của đơn. Tải lại trang rồi thử lại.');
      return;
    }
    const body: ReturnCreateBody = {
      lines,
      reason: value.reason as ReturnReason,
      ...(value.detail.trim() ? { detail: value.detail.trim() } : {}),
      ...(this.sellerFault() ? {} : { conditionAck: value.condition }),
      photos: uploaded.map((photo) => photo.id!),
      ...(this.needsAccount(order)
        ? {
            bank: value.bank.trim(),
            accountNumber: value.accountNumber.replace(/\s/g, ''),
            accountName: value.accountName.trim(),
          }
        : {}),
    };
    // One key per content: a retry of the same body reuses it, an edited body gets a new one.
    const fingerprint = JSON.stringify(body);
    if (this.sendKey?.fingerprint !== fingerprint) {
      this.sendKey = { fingerprint, key: crypto.randomUUID() };
    }
    this.returns
      .create(order.id, body, this.sendKey.key, this.audience)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.sendKey = null;
          this.toast.show({
            title: 'Đã gửi yêu cầu trả hàng',
            detail: this.guest
              ? 'nine2fine sẽ xem và phản hồi qua email của đơn. Theo dõi trạng thái ở Tra cứu đơn hàng.'
              : 'nine2fine sẽ xem và phản hồi qua email. Theo dõi trạng thái ở chi tiết đơn.',
          });
          if (this.guest) this.backToLookup(order.id);
          else void this.router.navigate(['/account/orders', order.id]);
        },
        error: (error: unknown) => {
          // RET-08: everything typed stays; field errors go next to their fields.
          if (error instanceof ReturnApiError) {
            if (error.code === 'validation') {
              this.serverErrors.set(error.fieldErrors);
              this.focusFirstError();
            }
            if (error.code === 'idempotency-conflict') this.sendKey = null;
          }
          this.blocked.set(returnErrorBlocksOrder(error));
          this.error.set(returnErrorMessage(error, this.audience));
        },
      });
  }

  /** The order, read again with the grant, is what Tra cứu đơn shows next (the request included). */
  private backToLookup(orderCode: string): void {
    this.checkout
      .getOrder(orderCode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => this.guestView.set(fresh),
        error: () => this.guestView.set(null),
        complete: () => void this.router.navigate(['/track-order'], { queryParams: { orderCode } }),
      });
  }

  private guestLoadError(error: unknown): string {
    const code = error instanceof CheckoutError ? error.code : 'unavailable';
    return code === 'unauthenticated' || code === 'not-found'
      ? 'Phiên xem đơn đã hết hạn hoặc không tìm thấy đơn. Vui lòng tra cứu lại đơn hàng bằng mã xác minh.'
      : orderErrorMessage(error);
  }

  /** Brings the first marked field (or field error) into view. */
  private focusFirstError(): void {
    setTimeout(() => {
      const root = this.host.nativeElement;
      const target =
        root.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        root.querySelector<HTMLElement>('.field-error');
      target?.scrollIntoView({ block: 'center' });
      target?.focus?.();
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
      required ? [Validators.required, accountNumberValidator] : [],
    );
    controls.accountName.setValidators(
      required ? [Validators.required, Validators.pattern(/\S.{1,}/)] : [],
    );
    for (const key of ['bank', 'accountNumber', 'accountName'] as const) {
      controls[key].updateValueAndValidity();
    }
  }
}
