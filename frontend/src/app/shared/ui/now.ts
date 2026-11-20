import { DestroyRef, inject, Signal, signal } from '@angular/core';

/**
 * Current time as a signal that ticks every `periodMs` while the calling component lives (ORD-10):
 * countdowns and "may still pay" checks re-run on their own while the screen stays open.
 * Call it in an injection context (a field initializer or constructor).
 */
export function injectNow(periodMs = 15_000): Signal<number> {
  const now = signal(Date.now());
  const id = setInterval(() => now.set(Date.now()), periodMs);
  inject(DestroyRef).onDestroy(() => clearInterval(id));
  return now.asReadonly();
}
