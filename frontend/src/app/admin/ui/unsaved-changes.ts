import { CanDeactivateFn } from '@angular/router';

/** Pages with a form implement this so leaving with unsaved changes asks first (principle 5). */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) =>
  !component.hasUnsavedChanges() ||
  confirm('Bạn có thay đổi chưa lưu. Rời trang sẽ mất các thay đổi này. Vẫn rời trang?');

/** `(window:beforeunload)` handler for the same pages. */
export function warnBeforeUnload(event: BeforeUnloadEvent, dirty: boolean): void {
  if (dirty) event.preventDefault();
}
