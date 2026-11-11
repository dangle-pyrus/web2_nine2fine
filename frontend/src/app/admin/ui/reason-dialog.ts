import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { usersErrorMessage } from '../data-access/users-errors';

export const REASON_MIN = 5;
export const REASON_MAX = 250;

export interface ReasonDialogData<T> {
  title: string;
  message: string;
  confirmLabel: string;
  /** Destructive: the confirm button is red. */
  danger?: boolean;
  /** Lock: 5..250 characters. Unlock and role change: optional, at most 250. */
  required: boolean;
  /** Sends the request. The dialog stays open on failure and shows why (AC-USR-10). */
  run: (reason: string) => Observable<T>;
}

/**
 * Asks for the reason of a lock / unlock / role change and sends the request itself, so a failure
 * (`last-admin`, 429, lost connection) keeps the dialog and the typed reason in place. The confirm
 * button is disabled while the request is in flight, so a double click sends one request.
 */
@Component({
  selector: 'adm-reason-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()" [attr.aria-busy]="busy()">
      <h2>{{ data.title }}</h2>
      <p class="dialog-desc">{{ data.message }}</p>
      <div class="dialog-body">
        <div class="field">
          <label for="reason-text" [class.req]="data.required">Lý do</label>
          <textarea
            id="reason-text"
            class="textarea"
            name="reason"
            rows="3"
            [maxlength]="max"
            [attr.aria-invalid]="tried() && !!problem()"
            [attr.aria-describedby]="'reason-hint' + (tried() && problem() ? ' reason-error' : '')"
            [disabled]="busy()"
            [ngModel]="reason()"
            (ngModelChange)="reason.set($event)"
          ></textarea>
          <p class="hint" id="reason-hint">
            {{ data.required ? 'Từ ' + min + ' đến ' + max + ' ký tự.' : 'Không bắt buộc.' }}
            <span data-testid="reason-count">{{ length() }}/{{ max }}</span>
          </p>
          @if (tried() && problem(); as message) {
            <p class="error" id="reason-error">{{ message }}</p>
          }
        </div>
        <p class="error" role="alert" data-testid="reason-failure">{{ failure() }}</p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" [disabled]="busy()" (click)="ref.close()">
          Hủy bỏ
        </button>
        <button
          type="submit"
          class="adm-btn"
          [class.adm-btn--danger]="data.danger"
          [class.adm-btn--primary]="!data.danger"
          [class.is-busy]="busy()"
          [disabled]="busy()"
        >
          {{ data.confirmLabel }}
        </button>
      </div>
    </form>
  `,
})
export class ReasonDialog<T> {
  readonly ref = inject<DialogRef<T>>(DialogRef);
  readonly data = inject<ReasonDialogData<T>>(DIALOG_DATA);
  protected readonly min = REASON_MIN;
  protected readonly max = REASON_MAX;
  protected readonly reason = signal('');
  protected readonly tried = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  protected readonly length = computed(() => this.reason().trim().length);
  protected readonly problem = computed(() => {
    const length = this.length();
    if (this.data.required && length < REASON_MIN) return `Nhập lý do từ ${REASON_MIN} ký tự.`;
    if (length > REASON_MAX) return `Lý do tối đa ${REASON_MAX} ký tự.`;
    return '';
  });

  submit(): void {
    if (this.busy()) return;
    this.tried.set(true);
    this.failure.set('');
    if (this.problem()) return;
    this.busy.set(true);
    this.data.run(this.reason().trim()).subscribe({
      next: (result) => this.ref.close(result),
      error: (error: unknown) => {
        this.busy.set(false);
        this.failure.set(usersErrorMessage(error));
      },
    });
  }
}
