import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { IconComponent } from '../../../shared/ui/icon.component';
import { DEMO_VERIFICATION_CODE } from '../../../../mocks/accounts';
import { AUTH_API, VerificationPurpose } from '../data-access/auth-api';
import { authErrorMessage } from '../auth-messages';

/** 8-digit email code with resend cooldown; sends the first code when it appears. */
@Component({
  selector: 'n2f-verification-code-field',
  imports: [ReactiveFormsModule, IconComponent],
  template: `
    <div class="field has-action">
      <input
        [id]="fieldId()"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        aria-required="true"
        maxlength="8"
        placeholder=" "
        [formControl]="control()"
        [attr.aria-invalid]="showError()"
        [attr.aria-describedby]="fieldId() + '-hint'"
      />
      <label [for]="fieldId()">Mã số (8 số)<span class="req" aria-hidden="true">*</span></label>
      <button
        type="button"
        class="field-action"
        [attr.aria-label]="
          secondsLeft() ? 'Gửi lại mã sau ' + secondsLeft() + ' giây' : 'Gửi lại mã xác thực'
        "
        [disabled]="sending() || secondsLeft() > 0"
        (click)="send()"
      >
        <n2f-icon name="reiconRefresh" size="26px" />
      </button>
    </div>
    @if (showError()) {
      <p class="field-error">Nhập đủ 8 chữ số của mã xác thực.</p>
    }
    <p class="hint end" [id]="fieldId() + '-hint'" aria-live="polite">
      {{
        sending()
          ? 'Đang gửi mã…'
          : secondsLeft()
            ? 'Gửi lại mã trong ' + secondsLeft() + ' giây'
            : 'Chưa nhận được mã? Bấm biểu tượng để gửi lại.'
      }}
    </p>
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
  readonly dispatchFailed = output<string>();

  readonly isMock = inject(API_CONFIG).mode === 'mock';
  readonly demoCode = DEMO_VERIFICATION_CODE;
  readonly secondsLeft = signal(0);
  readonly sending = signal(false);
  readonly showError = signal(false);
  private readonly api = inject(AUTH_API);
  private readonly destroyRef = inject(DestroyRef);
  private countdown?: ReturnType<typeof setInterval>;

  constructor() {
    // Parent forms mark controls as touched on submit; mirror that into this OnPush view.
    effect((onCleanup) => {
      const control = this.control();
      const subscription = control.events.subscribe(() =>
        this.showError.set(control.invalid && control.touched),
      );
      onCleanup(() => subscription.unsubscribe());
    });
    this.destroyRef.onDestroy(() => clearInterval(this.countdown));
  }

  ngOnInit(): void {
    this.send();
  }

  send(): void {
    if (this.sending() || this.secondsLeft() > 0) return;
    this.sending.set(true);
    this.api
      .requestCode(this.email(), this.purpose())
      .pipe(
        finalize(() => this.sending.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ resendAfterSeconds }) => this.startCountdown(resendAfterSeconds),
        error: (error: unknown) => this.dispatchFailed.emit(authErrorMessage(error)),
      });
  }

  private startCountdown(seconds: number): void {
    clearInterval(this.countdown);
    this.secondsLeft.set(seconds);
    this.countdown = setInterval(() => {
      const next = this.secondsLeft() - 1;
      this.secondsLeft.set(Math.max(next, 0));
      if (next <= 0) clearInterval(this.countdown);
    }, 1000);
  }
}
