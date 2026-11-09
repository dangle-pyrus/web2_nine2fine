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
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  concat,
  debounceTime,
  distinctUntilChanged,
  finalize,
  forkJoin,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { CHECKOUT_RESUME_KEY, CartState } from '../cart/cart-state';
import { API_CONFIG } from '../../core/api-config';
import { STORE_INFO } from '../../core/store-info';
import { storeSettings } from '../../core/store-settings';
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
  PaymentOption,
  StockIssue,
  VoucherApplied,
  VoucherKind,
} from './checkout-api';
import { CheckoutSession } from './checkout-session';
import { voucherMessage } from './voucher-messages';

/** Vietnamese mobile: 0 or +84, then 3/5/7/8/9 and 8 more digits (BR-CHK-04). */
const PHONE_PATTERN = /^(?:0|\+84)[35789]\d{8}$/;
/** Vietnamese tax code: 10 digits, or 10 + "-" + 3 for a branch. */
const TAX_CODE_PATTERN = /^\d{10}(?:-\d{3})?$/;
const NEW_ADDRESS = 'new';
const DRAFT_KEY = 'n2f.checkout.draft.v1';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const IDEM_KEY = 'n2f.checkout.idem';
const QUOTE_DEBOUNCE_MS = 300;

/** Length of the trimmed value must be in [min, max]. */
function trimmedLength(min: number, max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const length = String(control.value ?? '').trim().length;
    return length >= min && length <= max ? null : { trimmedLength: true };
  };
}

/** Server `field` (contract paths) -> form control. */
const FIELD_CONTROLS: Record<string, string> = {
  'contact.name': 'name',
  'contact.phone': 'phone',
  'contact.email': 'email',
  'address.provinceCode': 'provinceCode',
  'address.wardCode': 'wardCode',
  'address.street': 'street',
  note: 'note',
  acceptedTerms: 'acceptedTerms',
  'invoice.companyName': 'companyName',
  'invoice.taxCode': 'taxCode',
  'invoice.address': 'companyAddress',
  'invoice.email': 'invoiceEmail',
};

const PAYMENT_REASONS: Record<NonNullable<PaymentOption['reason']>, string> = {
  'over-limit': 'Đơn từ trên 5.000.000₫ chưa thanh toán khi nhận hàng được.',
  'too-many-refusals': 'Số điện thoại này chưa dùng được thanh toán khi nhận hàng.',
  'too-many-open-orders': 'Bạn đang có quá nhiều đơn thanh toán khi nhận hàng chưa giao.',
  'not-enabled': 'Chuyển khoản chưa khả dụng.',
};

interface PaymentChoice {
  value: CheckoutPaymentMethod;
  label: string;
  hint: string;
  disabled: boolean;
  reason: string;
}

/** Single-page checkout: contact → shipping → payment with a sticky order summary. */
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
  readonly isMock = inject(API_CONFIG).checkoutMode === 'mock';
  readonly hotline = STORE_INFO.hotline;
  get policy() {
    return storeSettings().policy;
  }
  readonly media = getMedia;
  readonly newAddress = NEW_ADDRESS;

  private readonly api = inject(CHECKOUT_API);
  private readonly account = inject(ACCOUNT_API);
  private readonly checkoutSession = inject(CheckoutSession);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly builder = inject(FormBuilder).nonNullable;

  readonly form = this.builder.group({
    name: ['', [Validators.required, trimmedLength(2, 50), Validators.pattern(/\p{L}/u)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    email: ['', [Validators.required, Validators.maxLength(100), Validators.email]],
    savedAddress: [NEW_ADDRESS],
    provinceCode: ['', Validators.required],
    wardCode: ['', Validators.required],
    street: ['', [Validators.required, trimmedLength(5, 200)]],
    note: ['', Validators.maxLength(250)],
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
    companyName: [Validators.required, trimmedLength(2, 200)],
    taxCode: [Validators.required, Validators.pattern(TAX_CODE_PATTERN)],
    companyAddress: [Validators.required, trimmedLength(5, 200)],
    invoiceEmail: [Validators.required, Validators.maxLength(100), Validators.email],
  } as const;

  /** Two code boxes: a goods discount and a free-shipping code (BR-VOU-01). */
  readonly voucherInputs = {
    discount: this.builder.control(''),
    shipping: this.builder.control(''),
  };
  readonly voucherSlots = [
    { slot: 'discount', label: 'Mã giảm giá', button: 'Áp dụng mã giảm giá' },
    { slot: 'shipping', label: 'Mã miễn phí giao hàng', button: 'Áp dụng mã miễn phí giao hàng' },
  ] as const;
  /** Applied codes by kind: only these go out with the quote and the order. */
  readonly appliedCodes = signal<Record<VoucherKind, string | null>>({
    discount: null,
    'free-shipping': null,
  });
  readonly voucherErrors = signal<Record<'discount' | 'shipping', string>>({
    discount: '',
    shipping: '',
  });
  readonly voucherChecking = signal(false);
  /** Both boxes locked after too many wrong codes; the message carries the wait. */
  readonly voucherLock = signal('');

  readonly provinces = signal<Location[]>([]);
  readonly wards = signal<Location[]>([]);
  readonly wardsLoading = signal(false);
  readonly wardsFailed = signal(false);
  readonly savedAddresses = signal<Address[]>([]);
  readonly memberVouchers = signal<Voucher[]>([]);
  readonly quote = signal<CheckoutQuote | null>(null);
  readonly quoteFailed = signal(false);
  readonly quoting = signal(false);
  /** Lines the shop cannot fill, from the last quote or order attempt. */
  readonly stockIssues = signal<StockIssue[]>([]);
  /** "old -> new" unit prices after `price-changed`. */
  readonly priceNotes = signal<Record<string, { from: number; to: number }>>({});
  readonly previousTotal = signal<number | null>(null);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly info = signal('');
  readonly canRetry = signal(false);
  /** Seconds left of an order rate limit (the button stays locked meanwhile). */
  readonly waitSeconds = signal(0);
  readonly duplicateOf = signal<string | null>(null);
  readonly serverErrors = signal<Record<string, string>>({});
  readonly summaryCount = computed(() => this.cart.checkoutCount());
  /** Summary is sticky on desktop and collapsed by default on mobile. */
  readonly summaryOpen = !globalThis.matchMedia?.('(max-width: 900px)').matches;

  readonly paymentChoices = computed<PaymentChoice[]>(() => {
    const options = this.quote()?.paymentMethods ?? [
      { method: 'cod', available: true },
      { method: 'bank-transfer', available: this.isMock },
    ];
    const hold = this.quote()?.policy.bankHoldMinutes ?? storeSettings().policy.paymentHoldMinutes;
    return (options as PaymentOption[])
      .filter((option) => option.available || option.reason !== 'not-enabled')
      .map((option) => ({
        value: option.method,
        label:
          option.method === 'cod' ? 'Thanh toán khi nhận hàng (COD)' : 'Chuyển khoản qua mã QR',
        hint:
          option.method === 'cod'
            ? 'Trả tiền mặt hoặc chuyển khoản cho nhân viên giao hàng.'
            : `Quét mã QR sau khi đặt đơn, hệ thống tự xác nhận khi nhận tiền. Đơn được giữ ${hold} phút.`,
        disabled: !option.available,
        reason: option.available || !option.reason ? '' : PAYMENT_REASONS[option.reason],
      }));
  });
  /** No way to pay online (e.g. over the COD limit while transfers are off). */
  readonly paymentBlocked = computed(() => {
    const quote = this.quote();
    return !!quote && !quote.paymentMethods.some((option) => option.available);
  });

  readonly contactFields = [
    {
      key: 'name',
      label: 'Họ và tên',
      type: 'text',
      autocomplete: 'name',
      hint: '',
      required: true,
      error: 'Nhập họ và tên (2–50 ký tự, có chữ cái).',
    },
    {
      key: 'phone',
      label: 'Số điện thoại',
      type: 'tel',
      autocomplete: 'tel',
      hint: '',
      required: true,
      error: 'Nhập số điện thoại di động hợp lệ (0 hoặc +84).',
    },
    {
      key: 'email',
      label: 'Email',
      hint: 'Dùng để gửi xác nhận đơn hàng và tra cứu đơn.',
      type: 'email',
      autocomplete: 'email',
      required: true,
      error: 'Nhập địa chỉ email hợp lệ (tối đa 100 ký tự).',
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

  private readonly retryQuote$ = new Subject<void>();
  /** Set before the request leaves, so a second click inside the same tick sends nothing. */
  private submitLock = false;
  private waitTimer: ReturnType<typeof setInterval> | undefined;
  private lockTimer: ReturnType<typeof setTimeout> | undefined;
  private confirmDuplicate = false;
  /** The shop reported the shortage on order: a later quote must not hide it until fixed. */
  private stockFromError = false;
  /** Order pressed while the quote was being recalculated: it goes out when the quote lands. */
  private submitWhenQuoted = false;
  /** Ward from a saved draft, selected again once its province's ward list has loaded. */
  private pendingWard = '';

  constructor() {
    this.api
      .provinces()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (provinces) => this.provinces.set(provinces), error: () => undefined });

    this.form.controls.provinceCode.valueChanges
      .pipe(
        distinctUntilChanged(),
        tap(() => {
          this.wards.set([]);
          this.wardsFailed.set(false);
        }),
        switchMap((code) => this.loadWards(code)),
        takeUntilDestroyed(),
      )
      .subscribe((wards) => {
        this.wards.set(wards);
        const ward = this.form.controls.wardCode;
        const wanted = this.pendingWard || ward.value;
        this.pendingWard = '';
        ward.setValue(wards.some((candidate) => candidate.code === wanted) ? wanted : '');
      });

    this.form.controls.wantsInvoice.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((wanted) => this.toggleInvoice(wanted));
    this.form.controls.savedAddress.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.useSavedAddress(id));

    // Editing a field clears the message the server gave for it.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (Object.keys(this.serverErrors()).length) this.serverErrors.set({});
    });

    this.restoreDraft();
    this.restoreResume();
    if (this.session.signedIn()) this.prefillMember();

    // Server-side quote: any change of lines, codes, address or phone reprices (debounced).
    combineLatest([
      toObservable(this.cart.checkoutLines),
      toObservable(this.appliedCodes),
      this.form.valueChanges.pipe(
        startWith(null),
        map(() => {
          const value = this.form.getRawValue();
          return JSON.stringify([
            value.provinceCode,
            value.wardCode,
            PHONE_PATTERN.test(value.phone) ? value.phone : '',
            this.form.controls.email.valid ? value.email.trim() : '',
          ]);
        }),
        distinctUntilChanged(),
      ),
      this.retryQuote$.pipe(startWith(undefined)),
    ])
      .pipe(
        debounceTime(QUOTE_DEBOUNCE_MS),
        switchMap(([lines]) => {
          if (!lines.length) return of<CheckoutQuote | null | 'loading'>(null);
          return concat(
            of<'loading'>('loading'),
            this.api.quote(this.quoteRequest()).pipe(
              catchError((error: unknown) => {
                this.stockIssues.set(error instanceof CheckoutError ? error.stockIssues : []);
                this.quoteFailed.set(true);
                return of(null);
              }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result === 'loading') {
          this.quoting.set(true);
          return;
        }
        this.quoting.set(false);
        if (result) this.useQuote(result);
        else if (!this.cart.checkoutLines().length) this.quote.set(null);
        if (this.submitWhenQuoted) {
          this.submitWhenQuoted = false;
          if (result) this.submit();
        }
      });

    this.form.valueChanges
      .pipe(debounceTime(400), takeUntilDestroyed())
      .subscribe(() => this.saveDraft());
    this.destroyRef.onDestroy(() => {
      clearInterval(this.waitTimer);
      clearTimeout(this.lockTimer);
    });
  }

  invalid(key: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[key];
    return (control.invalid && control.touched) || !!this.serverErrors()[key];
  }

  /** Message for a field the server rejected (shown instead of the client text). */
  serverError(key: string): string {
    return this.serverErrors()[key] ?? '';
  }

  usingSavedAddress(): boolean {
    return this.form.controls.savedAddress.value !== NEW_ADDRESS;
  }

  /** Where a code goes: the box it was typed in is only the place its error shows. */
  discountChip(): VoucherApplied | undefined {
    return this.quote()?.vouchers.find((voucher) => voucher.kind === 'discount');
  }
  shippingChip(): VoucherApplied | undefined {
    return this.quote()?.vouchers.find((voucher) => voucher.kind === 'free-shipping');
  }

  applyVoucher(slot: 'discount' | 'shipping' = 'discount', code?: string): void {
    const input = this.voucherInputs[slot];
    const normalized = (code ?? input.value).trim().toUpperCase();
    if (code !== undefined) input.setValue(normalized);
    this.voucherErrors.update((errors) => ({ ...errors, [slot]: '' }));
    if (!normalized || this.voucherChecking() || this.voucherLock()) return;
    this.voucherChecking.set(true);
    const request = this.quoteRequest();
    this.api
      .checkVoucher(normalized, {
        items: request.items,
        voucherCodes: request.voucherCodes,
        address: request.address,
        contact: request.contact,
      })
      .pipe(
        finalize(() => this.voucherChecking.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ result, quote }) => {
          if (result.applied) {
            // The chip goes to the slot of its kind, whichever box the code was typed in.
            this.appliedCodes.update((codes) => ({ ...codes, [result.kind]: result.code }));
            this.voucherInputs.discount.setValue('');
            this.voucherInputs.shipping.setValue('');
            this.voucherErrors.set({ discount: '', shipping: '' });
          } else {
            this.voucherErrors.update((errors) => ({ ...errors, [slot]: voucherMessage(result) }));
          }
          this.useQuote(quote, false);
        },
        error: (error: unknown) => {
          if (error instanceof CheckoutError && error.code === 'rate-limited') {
            this.lockVouchers(error.retryAfterSeconds ?? 900);
          } else {
            this.voucherErrors.update((errors) => ({
              ...errors,
              [slot]: 'Chưa kiểm tra được mã. Vui lòng thử lại.',
            }));
          }
        },
      });
  }

  removeVoucher(kind: VoucherKind): void {
    this.appliedCodes.update((codes) => ({ ...codes, [kind]: null }));
  }

  /** Line total at the quoted price (the server's, not the browser copy). */
  lineTotal(variantId: string, fallback: number): number {
    const line = this.quote()?.lines.find((item) => item.variantId === variantId);
    return line ? line.unitPrice * line.effectiveQuantity : fallback;
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

  /** Sets the lines the shop reported to what is left, then the quote runs again. */
  fixStock(): void {
    this.cart.applyStock(this.stockIssues());
    this.stockFromError = false;
    this.stockIssues.set([]);
    this.error.set('');
  }

  retryQuote(): void {
    this.quoteFailed.set(false);
    this.retryQuote$.next();
  }

  retryWards(): void {
    const code = this.form.controls.provinceCode.value;
    this.loadWards(code).subscribe((wards) => this.wards.set(wards));
  }

  /** Login from checkout: the picked lines and the form wait in sessionStorage (BR-CART-11). */
  rememberForLogin(): void {
    try {
      sessionStorage.setItem(
        CHECKOUT_RESUME_KEY,
        JSON.stringify({
          ids: this.cart.checkoutLines().map((line) => line.variantId),
          form: this.draftValue(),
        }),
      );
    } catch {
      /* Without storage the shopper just fills the form again. */
    }
  }

  confirmDuplicateOrder(): void {
    this.confirmDuplicate = true;
    this.duplicateOf.set(null);
    this.submit();
  }

  submit(): void {
    if (this.submitLock || this.submitting() || this.waitSeconds() > 0) return;
    this.submitLock = true;
    this.info.set('');
    this.canRetry.set(false);
    this.form.markAllAsTouched();
    const request = this.buildRequest();
    if (this.form.invalid || !request) {
      this.submitLock = false;
      this.error.set('Vui lòng kiểm tra các thông tin được đánh dấu.');
      this.focusFirstError();
      return;
    }
    if (this.quoting()) {
      this.submitLock = false;
      this.submitWhenQuoted = true;
      return;
    }
    if (this.quoteFailed()) {
      this.submitLock = false;
      this.error.set('Chưa tính được tổng thanh toán. Vui lòng bấm Thử lại.');
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    const key = this.keyFor(request);
    this.api
      .placeOrder(request, key)
      .pipe(
        finalize(() => {
          this.submitting.set(false);
          this.submitLock = false;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (receipt) => {
          this.confirmDuplicate = false;
          this.checkoutSession.remember(receipt);
          this.clearIdempotency();
          this.clearDraft();
          this.cart.clearCheckedOut();
          // Bank transfer continues on the QR page; Back must not return to the form.
          void this.router.navigate(
            receipt.paymentMethod === 'bank-transfer'
              ? ['/payment', receipt.orderId]
              : ['/order-success', receipt.orderId],
            { replaceUrl: true },
          );
        },
        error: (error: unknown) => this.onPlaceError(error, request),
      });
  }

  // --- Request building ----------------------------------------------------------------

  private codesList(): string[] {
    const codes = this.appliedCodes();
    return [codes.discount, codes['free-shipping']].filter((code): code is string => !!code);
  }

  private quoteRequest() {
    const value = this.form.getRawValue();
    const email = this.form.controls.email.valid ? value.email.trim() : '';
    const phone = PHONE_PATTERN.test(value.phone) ? normalizePhone(value.phone) : '';
    return {
      items: this.cart
        .checkoutLines()
        .map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      voucherCodes: this.codesList(),
      address:
        value.provinceCode && value.wardCode
          ? { provinceCode: value.provinceCode, wardCode: value.wardCode }
          : undefined,
      contact:
        email || phone ? { ...(email ? { email } : {}), ...(phone ? { phone } : {}) } : undefined,
    };
  }

  private buildRequest(): CheckoutRequest | null {
    const quote = this.quote();
    if (!quote) return null;
    const value = this.form.getRawValue();
    return {
      contact: {
        name: value.name.trim(),
        phone: normalizePhone(value.phone),
        email: value.email.trim(),
      },
      address: {
        provinceCode: value.provinceCode,
        wardCode: value.wardCode,
        street: value.street.trim(),
      },
      note: value.note.trim(),
      paymentMethod: value.paymentMethod,
      invoice: value.wantsInvoice
        ? {
            companyName: value.companyName.trim(),
            taxCode: value.taxCode.trim(),
            address: value.companyAddress.trim(),
            email: value.invoiceEmail.trim(),
          }
        : null,
      acceptedTerms: value.acceptedTerms,
      items: this.cart
        .checkoutLines()
        .map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      voucherCodes: this.codesList(),
      expected: {
        lines: quote.lines.map((line) => ({
          variantId: line.variantId,
          unitPrice: line.unitPrice,
        })),
        pricing: quote.pricing,
      },
      ...(this.confirmDuplicate ? { confirmDuplicate: true } : {}),
    };
  }

  // --- Idempotency key: one per attempt, kept while the content is the same -------------

  private keyFor(request: CheckoutRequest): string {
    const signature = hash(JSON.stringify(request));
    try {
      const stored = JSON.parse(sessionStorage.getItem(IDEM_KEY) ?? 'null') as {
        key?: string;
        signature?: string;
      } | null;
      if (stored?.key && stored.signature === signature) return stored.key;
      const key = createKey();
      sessionStorage.setItem(IDEM_KEY, JSON.stringify({ key, signature }));
      return key;
    } catch {
      return createKey();
    }
  }

  private clearIdempotency(): void {
    try {
      sessionStorage.removeItem(IDEM_KEY);
    } catch {
      /* Nothing stored. */
    }
  }

  // --- Quote and errors ----------------------------------------------------------------

  /** Shows a quote; codes the server dropped lose their chip and say why under their box. */
  private useQuote(quote: CheckoutQuote, dropRejected = true): void {
    this.quote.set(quote);
    this.quoteFailed.set(false);
    const shortage = quote.lines
      .filter((line) => line.effectiveQuantity < line.requestedQuantity)
      .map((line) => ({ variantId: line.variantId, available: line.maxQuantity }));
    if (shortage.length || !this.stockFromError) this.stockIssues.set(shortage);
    if (dropRejected) {
      const applied = this.appliedCodes();
      const gone = quote.rejectedVouchers.filter(
        (rejection) =>
          rejection.code === applied.discount || rejection.code === applied['free-shipping'],
      );
      if (gone.length) {
        this.appliedCodes.update((codes) => ({
          discount: gone.some((r) => r.code === codes.discount) ? null : codes.discount,
          'free-shipping': gone.some((r) => r.code === codes['free-shipping'])
            ? null
            : codes['free-shipping'],
        }));
        for (const rejection of gone) {
          const slot = rejection.code === applied.discount ? 'discount' : 'shipping';
          this.voucherErrors.update((errors) => ({ ...errors, [slot]: voucherMessage(rejection) }));
        }
      }
    }
    this.ensurePayment(quote);
  }

  /** COD no longer allowed: switch to transfer (when it exists) and say so. */
  private ensurePayment(quote: CheckoutQuote): void {
    const control = this.form.controls.paymentMethod;
    const current = quote.paymentMethods.find((option) => option.method === control.value);
    if (current?.available) return;
    const alternative = quote.paymentMethods.find((option) => option.available);
    if (alternative) {
      control.setValue(alternative.method);
      this.info.set(
        'Tổng đơn thay đổi nên phương thức thanh toán đã chuyển sang chuyển khoản qua mã QR.',
      );
    }
  }

  private lockVouchers(seconds: number): void {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    this.voucherLock.set(`Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`);
    clearTimeout(this.lockTimer);
    this.lockTimer = setTimeout(() => this.voucherLock.set(''), seconds * 1000);
  }

  private startWait(seconds: number): void {
    this.waitSeconds.set(seconds);
    clearInterval(this.waitTimer);
    this.waitTimer = setInterval(() => {
      this.waitSeconds.update((left) => Math.max(0, left - 1));
      if (this.waitSeconds() === 0) clearInterval(this.waitTimer);
    }, 1000);
  }

  private onPlaceError(error: unknown, request: CheckoutRequest): void {
    const known = error instanceof CheckoutError ? error : new CheckoutError('unavailable');
    this.clearIdempotencyIfContentChanges(known.code);
    switch (known.code) {
      case 'price-changed': {
        if (known.quote) this.showChangedQuote(known.quote, request);
        this.error.set(
          'Giá một số sản phẩm vừa thay đổi. Vui lòng xem lại tổng thanh toán và bấm Đặt hàng để xác nhận.',
        );
        break;
      }
      case 'voucher-changed': {
        for (const code of known.removedVoucherCodes) {
          const applied = this.appliedCodes();
          this.appliedCodes.set({
            discount: applied.discount === code ? null : applied.discount,
            'free-shipping': applied['free-shipping'] === code ? null : applied['free-shipping'],
          });
        }
        if (known.quote) this.useQuote(known.quote, false);
        this.error.set(
          `Mã ${known.removedVoucherCodes.join(', ') || 'giảm giá'} vừa hết hiệu lực. Tổng thanh toán mới là ${(known.quote?.pricing.total ?? 0).toLocaleString('vi-VN')}₫. Bấm Đặt hàng để tiếp tục.`,
        );
        break;
      }
      case 'stock-changed':
        if (known.quote) this.quote.set(known.quote);
        this.stockFromError = true;
        this.stockIssues.set(known.stockIssues);
        this.error.set('Một số sản phẩm không còn đủ số lượng.');
        break;
      case 'idempotency-conflict':
        this.error.set('Đơn hàng đã thay đổi, vui lòng kiểm tra và bấm Đặt hàng lại.');
        break;
      case 'possible-duplicate':
        this.duplicateOf.set(known.existingOrderCode ?? '');
        break;
      case 'invalid-address':
        this.form.controls.wardCode.setValue('');
        this.serverErrors.set({
          provinceCode: 'Chọn lại Tỉnh/Thành phố.',
          wardCode: 'Địa chỉ giao hàng chưa hợp lệ. Vui lòng chọn lại tỉnh/thành và phường/xã.',
        });
        this.error.set('Địa chỉ giao hàng chưa hợp lệ. Vui lòng chọn lại tỉnh/thành và phường/xã.');
        this.focusFirstError();
        break;
      case 'validation': {
        const control = known.field ? FIELD_CONTROLS[known.field] : undefined;
        if (known.field === 'paymentMethod') this.retryQuote$.next();
        if (control) {
          this.serverErrors.set({ [control]: 'Thông tin này chưa hợp lệ. Vui lòng kiểm tra lại.' });
          this.focusFirstError();
        }
        this.error.set('Vui lòng kiểm tra các thông tin được đánh dấu.');
        break;
      }
      case 'rate-limited': {
        const seconds = known.retryAfterSeconds ?? 30;
        this.startWait(seconds);
        this.error.set(`Bạn thao tác quá nhanh. Vui lòng thử lại sau ${seconds} giây.`);
        break;
      }
      default:
        this.error.set('Chưa đặt được hàng do lỗi kết nối. Đơn của bạn chưa bị mất, hãy thử lại.');
        this.canRetry.set(true);
    }
  }

  /** After a 409 the shopper reviews and the content changes, so the next attempt needs a new key. */
  private clearIdempotencyIfContentChanges(code: CheckoutError['code']): void {
    if (
      code === 'price-changed' ||
      code === 'voucher-changed' ||
      code === 'stock-changed' ||
      code === 'idempotency-conflict' ||
      code === 'invalid-address' ||
      code === 'validation'
    ) {
      this.clearIdempotency();
    }
  }

  /** Old and new unit prices side by side, and the new quote in the summary. */
  private showChangedQuote(quote: CheckoutQuote, request: CheckoutRequest): void {
    const notes: Record<string, { from: number; to: number }> = {};
    for (const line of quote.lines) {
      const before = request.expected.lines.find((item) => item.variantId === line.variantId);
      if (before && before.unitPrice !== line.unitPrice) {
        notes[line.variantId] = { from: before.unitPrice, to: line.unitPrice };
      }
    }
    this.priceNotes.set(notes);
    this.previousTotal.set(request.expected.pricing.total);
    this.useQuote(quote, false);
  }

  private loadWards(code: string) {
    if (!code) return of<Location[]>([]);
    this.wardsLoading.set(true);
    this.wardsFailed.set(false);
    return this.api.wards(code).pipe(
      catchError(() => {
        this.wardsFailed.set(true);
        return of<Location[]>([]);
      }),
      tap(() => this.wardsLoading.set(false)),
    );
  }

  // --- Form helpers --------------------------------------------------------------------

  private focusFirstError(): void {
    setTimeout(() => {
      const target = this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]');
      target?.scrollIntoView({ block: 'center' });
      target?.focus();
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
    // Slice 5: profile + address book (+ vouchers) from ACCOUNT_API in both modes (BR-ACC-14). A
    // failure falls back to the signed-in user's name and email, so checkout never blocks on it.
    const fallback = () => {
      const user = this.session.user();
      if (!user) return;
      const patch: Partial<{ name: string; email: string }> = {};
      if (!this.form.controls.name.value) patch.name = `${user.lastName} ${user.firstName}`.trim();
      if (!this.form.controls.email.value) patch.email = user.email;
      this.form.patchValue(patch);
    };
    forkJoin({
      profile: this.account.getProfile(),
      addresses: this.account.listAddresses(),
      vouchers: this.account.listVouchers().pipe(catchError(() => of([] as Voucher[]))),
    })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((member) => {
        if (!member) {
          fallback();
          return;
        }
        // What the shopper already typed (a draft, or the form kept while signing in) wins.
        const controls = this.form.controls;
        // A saved address would overwrite the recipient and address fields.
        const typedAddress = !!(
          controls.name.value ||
          controls.phone.value ||
          controls.street.value ||
          controls.provinceCode.value
        );
        this.form.patchValue({
          name:
            controls.name.value || `${member.profile.lastName} ${member.profile.firstName}`.trim(),
          email: controls.email.value || member.profile.email,
          phone: controls.phone.value || (member.profile.phone ?? ''),
        });
        this.savedAddresses.set(member.addresses);
        this.memberVouchers.set(member.vouchers);
        const preferred =
          member.addresses.find((address) => address.isDefault) ?? member.addresses[0];
        if (preferred && !typedAddress) this.form.controls.savedAddress.setValue(preferred.id);
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

  // --- Draft (24 h) and the form kept across a sign-in -----------------------------------

  private draftValue() {
    const value = this.form.getRawValue();
    return {
      name: value.name,
      phone: value.phone,
      email: value.email,
      provinceCode: value.provinceCode,
      wardCode: value.wardCode,
      street: value.street,
      note: value.note,
    };
  }

  private saveDraft(): void {
    if (this.submitting()) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ savedAt: Date.now(), value: this.draftValue() }),
      );
    } catch {
      /* No storage: no draft. */
    }
  }

  private clearDraft(): void {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* Nothing stored. */
    }
  }

  private restoreDraft(): void {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as {
        savedAt?: number;
        value?: ReturnType<CheckoutPage['draftValue']>;
      } | null;
      if (!draft?.value || Date.now() - (draft.savedAt ?? 0) > DRAFT_MAX_AGE_MS) return;
      this.patchText(draft.value);
    } catch {
      /* Corrupt draft: start empty. */
    }
  }

  private restoreResume(): void {
    try {
      const resume = JSON.parse(sessionStorage.getItem(CHECKOUT_RESUME_KEY) ?? 'null') as {
        form?: ReturnType<CheckoutPage['draftValue']>;
      } | null;
      if (resume?.form) this.patchText(resume.form);
      sessionStorage.removeItem(CHECKOUT_RESUME_KEY);
    } catch {
      /* Nothing to restore. */
    }
  }

  private patchText(value: Partial<ReturnType<CheckoutPage['draftValue']>>): void {
    const text = (item: unknown) => (typeof item === 'string' ? item : '');
    this.form.patchValue({
      name: text(value.name),
      phone: text(value.phone),
      email: text(value.email),
      provinceCode: text(value.provinceCode),
      street: text(value.street),
      note: text(value.note),
    });
    this.pendingWard = text(value.wardCode);
  }
}

function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  return digits.startsWith('+84') ? `0${digits.slice(3)}` : digits;
}

function createKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/** Small non-cryptographic hash: tells whether two request bodies are the same. */
function hash(text: string): string {
  let value = 5381;
  for (let index = 0; index < text.length; index++) {
    value = (value * 33) ^ text.charCodeAt(index);
  }
  return (value >>> 0).toString(36);
}
