import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AdminSession } from '../core/admin-session';
import type { Permission } from '../core/permissions';

/** `*admCan="'orders.cancel'"` renders the block only for roles with that permission (8.2). */
@Directive({ selector: '[admCan]' })
export class CanDirective {
  readonly admCan = input.required<Permission>();
  private readonly session = inject(AdminSession);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private shown = false;

  constructor() {
    effect(() => {
      const allowed = this.session.can(this.admCan());
      if (allowed && !this.shown) this.container.createEmbeddedView(this.template);
      if (!allowed && this.shown) this.container.clear();
      this.shown = allowed;
    });
  }
}
