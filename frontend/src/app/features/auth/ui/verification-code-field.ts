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
import { API_CONFIG } from '../../../core/api-config';
import { IconComponent } from '../../../shared/ui/icon.component';
import { DEMO_VERIFICATION_CODE } from '../../../../mocks/accounts';
import { AUTH_API, VerificationPurpose } from '../data-access/auth-api';
import { AuthMessage, authMessage, cleanCode } from '../auth-messages';
import { AuthMessageText } from './auth-message';

/**
 * 8-digit email code with resend cooldown; sends the first code when it appears. Errors that
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
        >Mã xác thực (8 số)<span class="req" aria-hidden="true">*</span></label
      >
      <button
        type="button"
        class="field-action"
        [attr.aria-label]="resendLabel()"
        [disabled]="sending() || secondsLeft() > 0"
        (click)="send()"
      >
        <n2f-icon name="reiconRefresh" size="26px" />
      </button>
    </div>
    @if (serverError(); as problem) {
      <p class="field-error" role="alert" [id]="fieldId() + '-error'">
        <n2f-auth-message [message]="problem" />
      </p>
    } @else if (showError()) {
      <p class="field-error" role="alert" [id]="fieldId() + '-error'">
        Nhập đủ 8 chữ số của mã xác thực.
      </p>
    }
    <p class="hint end" [id]="fieldId() + '-hint'" aria-hidden="true">
      {{
        sending()
          ? 'Đang gửi mã…'
          : secondsLeft()
            ? 'Gửi lại mã trong ' + secondsLeft() + ' giây'
            : 'Chưa nhận được mã? Bấm biểu tượng để gửi lại.'
      }}
    </p>
    <span class="sr-only" role="status" aria-live="polite">{{ announcement() }}</span>
    @if (isMock) {
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

  readonly isMock = inject(API_CONFIG).authMode === 'mock';
  readonly demoCode = DEMO_VERIFICATION_CODE;
  readonly secondsLeft = signal(0);
  readonly sending = signal(false);
  readonly showError = signal(false);
  readonly serverError = signal<AuthMessage | null>(null);
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
    this.destroyRef.onDestroy(() => clearInterval(this.countdown));
  }

  ngOnInit(): void {
    this.send();
  }

  /** Shows a server verdict under the field. */
  fail(message: AuthMessage): void {
    this.serverError.set(message);
  }

  focus(): void {
    this.box().nativeElement.focus();
  }

  onInput(): void {
    // Paste "1234 5678" or "1234-5678": keep the digits only, at most 8.
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
    if (this.sending() || this.secondsLeft() > 0) return;
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
        error: (error: unknown) => this.serverError.set(authMessage(error)),
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
