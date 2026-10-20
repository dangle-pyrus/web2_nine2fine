import { inject, Injectable } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { Overlay } from '@angular/cdk/overlay';

@Injectable({ providedIn: 'root' })
export class OverlayService {
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);

  open<T>(
    component: ComponentType<T>,
    label: string,
    panel: 'drawer' | 'modal' = 'drawer',
    data?: unknown,
  ): DialogRef<unknown, T> {
    this.dialog.closeAll();
    return this.dialog.open<unknown, unknown, T>(component, {
      data,
      ariaLabel: label,
      panelClass: `n2f-${panel}`,
      backdropClass: 'n2f-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      positionStrategy: this.position(panel),
    });
  }

  private position(panel: 'drawer' | 'modal') {
    const global = this.overlay.position().global();
    if (panel === 'drawer') return global.right('0').top('0');
    return global.centerHorizontally().centerVertically();
  }
}
