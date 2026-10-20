import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PASSWORD_RULES, PasswordRule } from '../auth-messages';

@Component({
  selector: 'n2f-password-field',
  imports: [ReactiveFormsModule, IconComponent],
  template: `
    <div class="field has-action">
      <input
        [id]="fieldId()"
        [type]="visible() ? 'text' : 'password'"
        [attr.autocomplete]="autocomplete()"
        aria-required="true"
        placeholder=" "
        [formControl]="control()"
        [attr.aria-invalid]="showError()"
        [attr.aria-describedby]="describedBy()"
      />
      <label [for]="fieldId()">{{ label() }}<span class="req" aria-hidden="true">*</span></label>
      <button
        type="button"
        class="field-action"
        [attr.aria-label]="visible() ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
        [attr.aria-pressed]="visible()"
        (click)="visible.set(!visible())"
      >
        <n2f-icon [name]="visible() ? 'reiconEye' : 'reiconEyeOff'" size="26px" />
      </button>
    </div>
    @if (showRules()) {
      <ul class="rules" [id]="fieldId() + '-rules'">
        @for (rule of rules(); track rule.id) {
          <li [class.met]="rule.test(value())">
            <n2f-icon
              [name]="rule.test(value()) ? 'reiconCheckCircle' : 'reiconXCircle'"
              size="18px"
            />
            <span
              >{{ rule.label
              }}<span class="sr-only">{{
                rule.test(value()) ? ' Đã đạt.' : ' Chưa đạt.'
              }}</span></span
            >
          </li>
        }
      </ul>
    } @else if (showError()) {
      <p class="field-error" [id]="fieldId() + '-error'">{{ errorText() }}</p>
    }
  `,
  styleUrl: './auth-form.scss',
  styles: `
    .rules {
      margin: 10px 0 0;
      padding: 0 0 0 calc(12 * var(--u));
      list-style: none;
      color: #9a9a9a;
      font-size: max(13px, calc(20 * var(--u)));
    }
    .rules li {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }
    .rules .met {
      color: var(--ink);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordField {
  readonly control = input.required<FormControl<string>>();
  readonly label = input('Mật khẩu');
  readonly fieldId = input('password');
  readonly autocomplete = input<'current-password' | 'new-password'>('current-password');
  readonly showRules = input(false);
  readonly errorText = input('Nhập mật khẩu của bạn.');
  readonly rules = input<readonly PasswordRule[]>(PASSWORD_RULES);

  readonly visible = signal(false);
  readonly value = signal('');
  readonly showError = signal(false);

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      this.value.set(control.value);
      const subscription = control.events.subscribe(() => {
        this.value.set(control.value);
        this.showError.set(control.invalid && control.touched);
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  describedBy(): string | null {
    if (this.showRules()) return `${this.fieldId()}-rules`;
    return this.showError() ? `${this.fieldId()}-error` : null;
  }
}
