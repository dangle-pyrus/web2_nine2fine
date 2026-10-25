import { Injectable } from '@angular/core';

const KEY = 'n2f.mock.v2';

/**
 * Keeps the in-memory mock "backend" (accounts, orders, stock, reviews, session) across reloads of
 * the same tab, so a demo survives F5. Uses sessionStorage: closing the tab resets the demo. Each
 * mock registers a snapshot under its own key; keys of mocks not created on this page are kept.
 * Mock mode only: with a real backend the server owns this state.
 */
@Injectable({ providedIn: 'root' })
export class MockPersistence {
  private readonly saved: Record<string, unknown> = read();
  private readonly sources = new Map<string, () => unknown>();

  constructor() {
    const save = () => this.save();
    globalThis.addEventListener?.('pagehide', save);
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
  }

  /** Returns the snapshot stored for `key` before the reload and saves `snapshot()` from now on. */
  register<T>(key: string, snapshot: () => T): T | undefined {
    this.sources.set(key, snapshot);
    return this.saved[key] as T | undefined;
  }

  save(): void {
    for (const [key, snapshot] of this.sources) this.saved[key] = snapshot();
    try {
      sessionStorage.setItem(KEY, JSON.stringify(this.saved));
    } catch {
      /* Storage full or unavailable: the demo just resets on reload. */
    }
  }
}

function read(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
