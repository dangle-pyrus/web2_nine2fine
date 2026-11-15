import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, ValueChangeEvent } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon.component';
import { demoVerificationCode } from '../../../core/storefront-adapters';
import { AUTH_API, AuthError, VerificationPurpose } from '../data-access/auth-api';
import { AuthMessage, authMessage, cleanCode } from '../auth-messages';
import { AuthMessageText } from './auth-message';

/**
 * 6-digit email code (valid 5 minutes) with resend cooldown; after 5 wrong codes the server locks
 * code sign-in for 15 minutes and the field shows that lock with a countdown (box and resend disabled); sends the first code when it appears. Errors that
 * belong to the code (wrong, locked, resend blocked) show under the field: the parent hands
 * server answers to `fail()` and can move focus with `focus()`.
 */
@Component({
  selector: 'n2f-verification-code-field',
  imports: [ReactiveFormsModule, IconComponent, AuthMessageText],
  template: `
    <div class="field has-action">
      <input
        #input
        [id]="fieldId()"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        aria-required="true"
        placeholder=" "
        [formControl]="control()"
        [attr.aria-invalid]="showError() || serverError() !== null"
        [attr.aria-describedby]="describedBy()"
        (input)="onInput()"
      />
      <label [for]="fieldId()"
        >Mã xác thực (6 số)<span class="req" aria-hidden="true">*</span></label
      >
      <button
        type="button"
        class="field-action"
        [attr.aria-label]="resendLabel()"
        [disabled]="sending() || secondsLeft() > 0 || lockLeft() > 0"
        (click)="send()"
      >
        <n2f-icon name="reiconRefresh" size="26px" />
      </button>
    </div>
    @if (lockLeft() > 0) {
      <p class="field-error" role="alert" [id]="fieldId() + '-error'" data-testid="code-lock">
        Bạn đã nhập sai mã quá 5 lần. Phiên xác thực tạm khoá, vui lòng thử lại sau
        {{ lockClock() }}.
      </p>
    } @else if (serverError(); as problem) {
      <p class="field-error" role="alert" [id]="fieldId() + '-error'">
        <n2f-auth-message [message]="problem" />
      </p>
    } @else if (showError()) {
      <p class="field-error" role="alert" [id]="fieldId() + '-error'">
        Nhập đủ 6 chữ số của mã xác thực.
      </p>
    }
    <p class="hint end" [id]="fieldId() + '-hint'" aria-hidden="true">
      {{
        lockLeft() > 0
          ? 'Hết thời gian khoá, bấm biểu tượng để nhận mã mới.'
          : sending()
            ? 'Đang gửi mã…'
            : secondsLeft()
              ? 'Gửi lại mã trong ' + secondsLeft() + ' giây'
              : 'Chưa nhận được mã? Bấm biểu tượng để gửi lại.'
      }}
    </p>
    <span class="sr-only" role="status" aria-live="polite">{{ announcement() }}</span>
    @if (demoCode) {
      <p class="notice">Chế độ trải nghiệm: dùng mã {{ demoCode }}.</p>
    }
  `,
  styleUrl: './auth-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationCodeField implements OnInit {
  readonly control = input.required<FormControl<string>>();
  readonly email = input.required<string>();
  readonly purpose = input.required<VerificationPurpose>();
  readonly fieldId = input('verification-code');

  /** Set only in the mock (e2e) build; the normal build has no demo code in its bundle. */
  readonly demoCode = demoVerificationCode;
  readonly secondsLeft = signal(0);
  readonly sending = signal(false);
  readonly showError = signal(false);
  readonly serverError = signal<AuthMessage | null>(null);
  /** Seconds left of the 15-minute lock after too many wrong codes (0 = not locked). */
  readonly lockLeft = signal(0);
  readonly locked = computed(() => this.lockLeft() > 0);
  /** mm:ss, so the shopper sees the lock run down. */
  readonly lockClock = computed(() => {
    const total = this.lockLeft();
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  });
  /** Screen-reader text; changes only at milestones, never once per second. */
  readonly announcement = signal('');
  /** Rounded up to 10 s so the button name does not change every second. */
  readonly resendLabel = computed(() => {
    const seconds = this.secondsLeft();
    return seconds ? `Gửi lại mã sau ${Math.ceil(seconds / 10) * 10} giây` : 'Gửi lại mã xác thực';
  });

  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly api = inject(AUTH_API);
  private readonly destroyRef = inject(DestroyRef);
  private countdown?: ReturnType<typeof setInterval>;
  private lockTimer?: ReturnType<typeof setInterval>;

  constructor() {
    // Parent forms mark controls as touched on submit; mirror that into this OnPush view.
    effect((onCleanup) => {
      const control = this.control();
      const subscription = control.events.subscribe((event) => {
        this.showError.set(control.invalid && control.touched);
        // A new value makes the previous server verdict obsolete.
        if (event instanceof ValueChangeEvent) this.serverError.set(null);
      });
      onCleanup(() => subscription.unsubscribe());
    });
    this.destroyRef.onDestroy(() => {
      clearInterval(this.countdown);
      clearInterval(this.lockTimer);
    });
  }

  ngOnInit(): void {
    this.send();
  }

  /** Shows a server verdict under the field; a `code-locked` answer also starts the lock countdown. */
  fail(message: AuthMessage, error?: unknown): void {
    this.serverError.set(message);
    if (error instanceof AuthError && error.code === 'code-locked')
      this.lock(error.retryAfterSeconds);
  }

  /** Locks the box and the resend button for the time the server gave (15 minutes by default). */
  lock(seconds: number | undefined): void {
    const total = Math.max(1, Math.ceil(seconds ?? 15 * 60));
    clearInterval(this.lockTimer);
    clearInterval(this.countdown);
    this.secondsLeft.set(0);
    this.lockLeft.set(total);
    this.control().disable({ emitEvent: false });
    this.announcement.set('Phiên xác thực tạm khoá do nhập sai mã quá 5 lần.');
    this.lockTimer = setInterval(() => {
      const next = this.lockLeft() - 1;
      this.lockLeft.set(Math.max(next, 0));
      if (next <= 0) {
        clearInterval(this.lockTimer);
        this.control().enable({ emitEvent: false });
        this.control().reset('');
        this.serverError.set(null);
        this.announcement.set('Đã hết thời gian khoá. Có thể nhận mã mới.');
      }
    }, 1000);
  }

  focus(): void {
    this.box().nativeElement.focus();
  }

  onInput(): void {
    // Paste "123 456" or "123-456": keep the digits only, at most 6.
    const element = this.box().nativeElement;
    const clean = cleanCode(element.value);
    if (clean !== element.value) element.value = clean;
    this.control().setValue(clean);
  }

  describedBy(): string {
    const error = this.serverError() || this.showError() ? ` ${this.fieldId()}-error` : '';
    return `${this.fieldId()}-hint${error}`;
  }

  send(): void {
    if (this.sending() || this.secondsLeft() > 0 || this.lockLeft() > 0) return;
    this.sending.set(true);
    this.serverError.set(null);
    this.api
      .requestCode(this.email(), this.purpose())
      .pipe(
        finalize(() => this.sending.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ resendAfterSeconds }) => this.startCountdown(resendAfterSeconds),
        error: (error: unknown) => this.fail(authMessage(error), error),
      });
  }

  private startCountdown(seconds: number): void {
    clearInterval(this.countdown);
    this.secondsLeft.set(seconds);
    if (seconds <= 0) return;
    this.announcement.set(`Đã gửi mã xác thực. Có thể gửi lại sau ${seconds} giây.`);
    this.countdown = setInterval(() => {
      const next = this.secondsLeft() - 1;
      this.secondsLeft.set(Math.max(next, 0));
      if (next <= 0) {
        clearInterval(this.countdown);
        this.announcement.set('Có thể gửi lại mã xác thực.');
      }
    }, 1000);
  }
}
