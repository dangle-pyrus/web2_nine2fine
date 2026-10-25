/**
 * Single-key shortcuts (j/k, /, g o…) must not fire while the user types or while a dialog is
 * open, and never with Ctrl/⌘/Alt held (those belong to the browser).
 */
export function isShortcutEvent(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
    return false;
  return !document.querySelector('.cdk-overlay-container .cdk-dialog-container');
}
