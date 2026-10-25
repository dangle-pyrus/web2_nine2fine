import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injectable,
  Injector,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, map } from 'rxjs';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** Destructive: the confirm button is red (#B91C1C, Phụ lục A.2). */
  danger?: boolean;
  /** Bulk or money-affecting actions: the user must type this text first (5.8). */
  typeToConfirm?: string;
}

/**
 * Opens admin modals and drawers with the admin panel styles. Provided on the `/admin` route so
 * dialog content can inject the admin API tokens.
 */
@Injectable()
export class AdminDialogs {
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);

  confirm(options: ConfirmOptions): Observable<boolean> {
    return this.modal<ConfirmOptions, boolean>(ConfirmDialog, options).closed.pipe(map(Boolean));
  }

  modal<D, R>(
    component: ComponentType<unknown>,
    data: D,
    panelClass: string | string[] = 'adm-modal-panel',
  ): DialogRef<R, unknown> {
    return this.dialog.open<R, D, unknown>(component, {
      data,
      injector: this.injector,
      panelClass,
      backdropClass: 'adm-overlay-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }

  /** Right-hand panel for quick edits that keep the list visible (4.1, 5.6). */
  drawer<D, R>(component: ComponentType<unknown>, data: D): DialogRef<R, unknown> {
    return this.dialog.open<R, D, unknown>(component, {
      data,
      injector: this.injector,
      panelClass: 'adm-drawer-panel',
      backdropClass: 'adm-overlay-backdrop',
      positionStrategy: this.overlay.position().global().right('0').top('0'),
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }
}

@Component({
  selector: 'adm-confirm-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="canConfirm() && ref.close(true)">
      <h2>{{ data.title }}</h2>
      <p class="dialog-desc">{{ data.message }}</p>
      @if (data.typeToConfirm; as expected) {
        <div class="dialog-body">
          <div class="field">
            <label for="confirm-text"
              >Nhập <strong>{{ expected }}</strong> để xác nhận</label
            >
            <input
              id="confirm-text"
              class="input"
              name="typed"
              autocomplete="off"
              [ngModel]="typed()"
              (ngModelChange)="typed.set($event)"
            />
          </div>
        </div>
      }
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close(false)">Hủy bỏ</button>
        <button
          type="submit"
          class="adm-btn"
          [class.adm-btn--danger]="data.danger"
          [class.adm-btn--primary]="!data.danger"
          [disabled]="!canConfirm()"
        >
          {{ data.confirmLabel }}
        </button>
      </div>
    </form>
  `,
})
export class ConfirmDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<ConfirmOptions>(DIALOG_DATA);
  readonly typed = signal('');
  readonly canConfirm = computed(
    () => !this.data.typeToConfirm || this.typed().trim() === this.data.typeToConfirm,
  );
}
