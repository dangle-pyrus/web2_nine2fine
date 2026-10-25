import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

/**
 * Loads the admin CSS bundle (`admin.css`, built with `inject: false` in angular.json) once, so the
 * storefront never downloads it. `ready` turns true when the sheet has applied, avoiding a flash
 * of unstyled admin.
 */
@Injectable({ providedIn: 'root' })
export class AdminStylesheet {
  private readonly document = inject(DOCUMENT);
  readonly ready = signal(false);

  load(): void {
    const id = 'n2f-admin-css';
    const existing = this.document.getElementById(id) as HTMLLinkElement | null;
    if (existing) {
      this.ready.set(true);
      return;
    }
    const link = this.document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'admin.css';
    const done = () => this.ready.set(true);
    link.addEventListener('load', done);
    // A missing sheet must not leave the admin blank.
    link.addEventListener('error', done);
    setTimeout(done, 3000);
    this.document.head.appendChild(link);
  }
}
