import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { BadgeSpec, Tone } from '../core/status';

/** Subtle status badge: pale background + dark text of one tone, always with a label (3.10). */
@Component({
  selector: 'adm-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="dot" aria-hidden="true"></span>{{ spec()?.label ?? label() }}`,
  host: { '[attr.data-tone]': 'spec()?.tone ?? tone()' },
  styles: `
    :host {
      height: 22px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px 0 8px;
      border-radius: 9999px;
      font-size: 12px;
      line-height: 16px;
      font-weight: 500;
      white-space: nowrap;
      background: var(--adm-neutral-bg);
      color: var(--adm-neutral-fg);
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.8;
    }
    :host([data-tone='info']) {
      background: var(--adm-info-bg);
      color: var(--adm-info-fg);
    }
    :host([data-tone='success']) {
      background: var(--adm-success-bg);
      color: var(--adm-success-fg);
    }
    :host([data-tone='warning']) {
      background: var(--adm-warning-bg);
      color: var(--adm-warning-fg);
    }
    :host([data-tone='critical']) {
      background: var(--adm-critical-bg);
      color: var(--adm-critical-fg);
    }
  `,
})
export class AdmBadge {
  readonly spec = input<BadgeSpec | null>(null);
  readonly label = input('');
  readonly tone = input<Tone>('neutral');
}
