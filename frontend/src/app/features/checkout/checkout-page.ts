import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  finalize,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { CartState } from '../cart/cart-state';
import { API_CONFIG } from '../../core/api-config';
import { STORE_POLICY } from '../../core/store-policy';
import { AuthSession } from '../auth/auth-session';
import { ACCOUNT_API } from '../account/data-access/account-api';
import { Address, Location, Voucher } from '../account/data-access/account-models';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { getMedia } from '../../../media/media-manifest';
import { formatDate } from '../orders/order-status';
import {
  CHECKOUT_API,
  CheckoutError,
  CheckoutPaymentMethod,
  CheckoutQuote,
  CheckoutRequest,
  StockIssue,
} from './checkout-api';
import { CheckoutSession } from './checkout-session';

const PHONE_PATTERN = /^(?:0|\+84)\d{9}$/;
/** Vietnamese tax code: 10 digits, or 10 + "-" + 3 for a branch. */
const TAX_CODE_PATTERN = /^\d{10}(?:-\d{3})?$/;
const NEW_ADDRESS = 'new';

const ERROR_MESSAGES: Record<CheckoutError['code'], string> = {
  'stock-changed': 'Một số sản phẩm đã thay đổi số lượng tồn. Vui lòng kiểm tra lại giỏ hàng.',
  'invalid-address':
    'Địa chỉ giao hàng chưa hợp lệ. Vui lòng kiểm tra Tỉnh/Thành phố và Phường/Xã.',
  'invalid-voucher': 'Mã giảm giá không còn áp dụng được. Vui lòng gỡ mã và thử lại.',
  'not-found': 'Không tìm thấy thông tin yêu cầu.',
  'not-cancellable': 'Đơn hàng không thể hủy ở trạng thái hiện tại.',
  unavailable: 'Chưa thể tạo đơn hàng. Thông tin và giỏ hàng của bạn vẫn được giữ lại.',
};

/** Single-page checkout (plan 16): contact → shipping → payment with a sticky order summary. */
@Component({
  selector: 'n2f-checkout-page',
  imports: [ReactiveFormsModule, RouterLink, PricePipe, EmptyStateComponent],
  templateUrl: './checkout-page.html',
  styleUrl: './checkout-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPage {
  readonly cart = inject(CartState);
  readonly session = inject(AuthSession);
  readonly isMock = inject(API_CONFIG).mode === 'mock';
  readonly policy = STORE_POLICY;
  readonly media = getMedia;
  readonly newAddress = NEW_ADDRESS;

  private readonly api = inject(CHECKOUT_API);
  private readonly account = inject(ACCOUNT_API);
  private readonly checkoutSession = inject(CheckoutSession);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly builder = inject(FormBuilder).nonNullable;

  readonly form = this.builder.group({
    name: ['', [Validators.required, Validators.pattern(/\S.{1,}/)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    email: ['', Validators.email],
    savedAddress: [NEW_ADDRESS],
    provinceCode: ['', Validators.required],
    wardCode: ['', Validators.required],
    street: ['', [Validators.required, Validators.pattern(/\S.{3,}\S/)]],
    note: [''],
    paymentMethod: ['cod' as CheckoutPaymentMethod],
    wantsInvoice: [false],
    companyName: [''],
    taxCode: [''],
    companyAddress: [''],
    invoiceEmail: [''],
    acceptedTerms: [false, Validators.requiredTrue],
  });
  /** Company fields, required only when a VAT invoice is requested. */
  private readonly invoiceValidators = {
    companyName: [Validators.required, Validators.pattern(/\S.{1,}/)],
    taxCode: [Validators.required, Validators.pattern(TAX_CODE_PATTERN)],
    companyAddress: [Validators.required, Validators.pattern(/\S.{3,}\S/)],
    invoiceEmail: [Validators.required, Validators.email],
  } as const;
  readonly voucherInput = this.builder.control('');

  readonly provinces = signal<Location[]>([]);
  readonly wards = signal<Location[]>([]);
  readonly savedAddresses = signal<Address[]>([]);
  readonly memberVouchers = signal<Voucher[]>([]);
  readonly appliedCode = signal<string | null>(null);
  readonly quote = signal<CheckoutQuote | null>(null);
  readonly quoteFailed = signal(false);
  /** Lines the shop cannot fill, from the last quote or order attempt. */
  readonly stockIssues = signal<StockIssue[]>([]);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly summaryCount = computed(() => this.cart.checkoutCount());
  /** Plan 16.3: summary is sticky on desktop and collapsed by default on mobile. */
  readonly summaryOpen = !globalThis.matchMedia?.('(max-width: 900px)').matches;
  /** Kept across retries so a repeated submit cannot create a second order. */
  private idempotencyKey = createKey();

  readonly paymentOptions = [
    {
      value: 'cod',
      label: 'Thanh toán khi nhận hàng (COD)',
      hint: 'Trả tiền mặt hoặc chuyển khoản cho nhân viên giao hàng.',
    },
    {
      value: 'bank-transfer',
      label: 'Chuyển khoản qua mã QR',
      hint: `Quét mã QR sau khi đặt đơn, hệ thống tự xác nhận khi nhận tiền. Đơn được giữ ${STORE_POLICY.paymentHoldMinutes} phút.`,
    },
  ] as const;

  readonly contactFields = [
    {
      key: 'name',
      label: 'Họ và tên',
      type: 'text',
      autocomplete: 'name',
      hint: '',
      required: true,
      error: 'Nhập họ và tên của bạn.',
    },
    {
      key: 'phone',
      label: 'Số điện thoại',
      type: 'tel',
      autocomplete: 'tel',
      hint: '',
      required: true,
      error: 'Nhập số điện thoại hợp lệ (0 hoặc +84).',
    },
    {
      key: 'email',
      label: 'Email',
      hint: 'Không bắt buộc. Dùng để gửi xác nhận và hóa đơn điện tử.',
      type: 'email',
      autocomplete: 'email',
      required: false,
      error: 'Nhập địa chỉ email hợp lệ.',
    },
  ] as const;
  readonly invoiceFields = [
    { key: 'companyName', label: 'Tên công ty', error: 'Nhập tên công ty.', wide: true },
    {
      key: 'taxCode',
      label: 'Mã số thuế',
      error: 'Mã số thuế gồm 10 số, hoặc 10 số kèm "-" và 3 số chi nhánh.',
      wide: false,
    },
    {
      key: 'invoiceEmail',
      label: 'Email nhận hóa đơn',
      error: 'Nhập địa chỉ email hợp lệ.',
      wide: false,
    },
    {
      key: 'companyAddress',
      label: 'Địa chỉ công ty',
      error: 'Nhập địa chỉ công ty theo đăng ký thuế.',
      wide: true,
    },
  ] as const;

  constructor() {
    this.account
      .listProvinces()
      .pipe(takeUntilDestroyed())
      .subscribe((provinces) => this.provinces.set(provinces));

    this.form.controls.provinceCode.valueChanges
      .pipe(
        distinctUntilChanged(),
        tap(() => this.wards.set([])),
        switchMap((code) => (code ? this.account.listWards(code) : of([]))),
        takeUntilDestroyed(),
      )
      .subscribe((wards) => {
        this.wards.set(wards);
        const ward = this.form.controls.wardCode;
        if (!wards.some((candidate) => candidate.code === ward.value)) ward.setValue('');
      });

    this.form.controls.wantsInvoice.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((wanted) => this.toggleInvoice(wanted));
    this.form.controls.savedAddress.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.useSavedAddress(id));

    if (this.session.signedIn()) this.prefillMember();

    combineLatest([toObservable(this.cart.checkoutLines), toObservable(this.appliedCode)])
      .pipe(
        map(([lines, voucherCode]) => ({
          items: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
          voucherCode,
        })),
        switchMap((request) =>
          request.items.length
            ? this.api.quote(request).pipe(
                tap(() => {
                  this.quoteFailed.set(false);
                  this.stockIssues.set([]);
                }),
                catchError((error: unknown) => {
                  this.quoteFailed.set(true);
                  this.stockIssues.set(error instanceof CheckoutError ? error.stockIssues : []);
                  return of(null);
                }),
              )
            : of(null),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((quote) => this.quote.set(quote));
  }

  invalid(key: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[key];
    return control.invalid && control.touched;
  }

  usingSavedAddress(): boolean {
    return this.form.controls.savedAddress.value !== NEW_ADDRESS;
  }

  applyVoucher(code = this.voucherInput.value): void {
    const normalized = code.trim().toUpperCase();
    this.voucherInput.setValue(normalized);
    this.appliedCode.set(normalized || null);
  }

  removeVoucher(): void {
    this.voucherInput.setValue('');
    this.appliedCode.set(null);
  }

  date(iso: string): string {
    return formatDate(iso);
  }

  /** "Chỉ còn 2" / "Đã hết hàng" for a summary line, or '' when the line is fine. */
  stockIssue(variantId: string): string {
    const issue = this.stockIssues().find((candidate) => candidate.variantId === variantId);
    if (!issue) return '';
    return issue.available > 0 ? `Chỉ còn ${issue.available} sản phẩm` : 'Đã hết hàng';
  }

  /** Caps or removes the lines the shop reported, then the quote runs again. */
  fixStock(): void {
    this.cart.applyStock(this.stockIssues());
    this.stockIssues.set([]);
    this.error.set('');
  }

  submit(): void {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.cart.checkoutLines().length) {
      this.error.set('Vui lòng kiểm tra các thông tin được đánh dấu.');
      return;
    }
    // Live checkout must be enabled only after server-side totals/reservation are integrated.
    if (!this.isMock) {
      this.error.set('Thanh toán hiện chưa khả dụng. Vui lòng thử lại sau.');
      return;
    }
    const quote = this.quote();
    if (quote?.voucherError) {
      this.error.set('Mã giảm giá chưa áp dụng được. Vui lòng gỡ hoặc đổi mã.');
      return;
    }
    const value = this.form.getRawValue();
    const request: CheckoutRequest = {
      contact: { name: value.name, phone: value.phone, email: value.email.trim() },
      address: { provinceCode: value.provinceCode, wardCode: value.wardCode, street: value.street },
      note: value.note,
      paymentMethod: value.paymentMethod,
      invoice: value.wantsInvoice
        ? {
            companyName: value.companyName,
            taxCode: value.taxCode,
            address: value.companyAddress,
            email: value.invoiceEmail,
          }
        : null,
      acceptedTerms: value.acceptedTerms,
      items: this.cart
        .checkoutLines()
        .map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      voucherCode: this.appliedCode(),
    };
    this.submitting.set(true);
    this.error.set('');
    this.api
      .placeOrder(request, this.idempotencyKey)
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (receipt) => {
          this.checkoutSession.lastReceipt.set(receipt);
          this.cart.clearCheckedOut();
          this.idempotencyKey = createKey();
          // Bank transfer continues on the QR / virtual-account payment page.
          void this.router.navigate(
            receipt.paymentMethod === 'bank-transfer'
              ? ['/payment', receipt.orderId]
              : ['/order-success', receipt.orderId],
          );
        },
        error: (error: unknown) => {
          const known = error instanceof CheckoutError;
          if (known) this.stockIssues.set(error.stockIssues);
          this.error.set(
            known && error.stockIssues.length
              ? 'Một số sản phẩm không còn đủ số lượng. Xem các dòng được đánh dấu trong đơn hàng.'
              : ERROR_MESSAGES[known ? error.code : 'unavailable'],
          );
        },
      });
  }

  private toggleInvoice(wanted: boolean): void {
    for (const [key, validators] of Object.entries(this.invoiceValidators)) {
      const control = this.form.get(key)!;
      control.setValidators(wanted ? [...validators] : []);
      control.updateValueAndValidity({ emitEvent: false });
    }
    // Most invoices go to the same inbox as the order confirmation.
    const email = this.form.controls.invoiceEmail;
    if (wanted && !email.value) email.setValue(this.form.controls.email.value);
  }

  private prefillMember(): void {
    forkJoin({
      profile: this.account.getProfile(),
      addresses: this.account.listAddresses(),
      vouchers: this.account.listVouchers(),
    })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((member) => {
        if (!member) return;
        this.form.patchValue({
          name: `${member.profile.lastName} ${member.profile.firstName}`.trim(),
          email: member.profile.email,
          phone: member.profile.phone ?? '',
        });
        this.savedAddresses.set(member.addresses);
        this.memberVouchers.set(member.vouchers);
        const preferred =
          member.addresses.find((address) => address.isDefault) ?? member.addresses[0];
        if (preferred) this.form.controls.savedAddress.setValue(preferred.id);
      });
  }

  private useSavedAddress(id: string): void {
    const address = this.savedAddresses().find((candidate) => candidate.id === id);
    if (!address) return;
    this.form.patchValue({
      name: address.recipient,
      phone: address.phone,
      provinceCode: address.province.code,
      wardCode: address.ward.code,
      street: address.street,
    });
  }
}

function createKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
