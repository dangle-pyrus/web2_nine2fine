import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
  /** Destructive action (cancel, delete, hide): the confirm button turns brand red. */
  danger?: boolean;
}

/** Closes with `true` when confirmed. Open through OverlayService with the 'modal' panel. */
@Component({
  selector: 'n2f-confirm-dialog',
  template: `
    <section>
      <h2>{{ data.title }}</h2>
      <p>{{ data.message }}</p>
      <div class="actions">
        <button type="button" class="pill outline" (click)="dialog.close(false)">Quay lại</button>
        <button
          type="button"
          class="pill"
          [class.danger]="data.danger"
          (click)="dialog.close(true)"
        >
          {{ data.confirmLabel }}
        </button>
      </div>
    </section>
  `,
  styles: `
    section {
      padding: 32px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 22px;
      font-weight: 600;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }
    .pill {
      min-height: 44px;
      padding: 0 24px;
      border: 1px solid var(--ink);
      border-radius: 999px;
      background: var(--ink);
      color: #fff;
      font: inherit;
      font-weight: 500;
    }
    .pill.danger {
      border-color: var(--brand);
      background: var(--brand);
    }
    p {
      white-space: pre-line;
    }
    .pill.outline {
      border-color: var(--line);
      background: #fff;
      color: var(--ink);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  readonly dialog = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
}
