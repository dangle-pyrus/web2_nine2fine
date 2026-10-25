import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { AdmIcon } from './icon';

/** Tags: type then Enter or comma to add a chip; Backspace on an empty field removes the last (3.13). */
@Component({
  selector: 'adm-chip-input',
  imports: [AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      class="input"
      [id]="inputId()"
      [placeholder]="placeholder()"
      [value]="draft()"
      [disabled]="disabled()"
      (input)="draft.set($any($event.target).value)"
      (keydown)="onKey($event)"
      (blur)="commit()"
    />
    @if (values().length) {
      <div class="chips">
        @for (value of values(); track value) {
          <span class="chip">
            {{ value }}
            @if (!disabled()) {
              <button type="button" [attr.aria-label]="'Bỏ ' + value" (click)="remove(value)">
                <adm-icon name="reiconX" [size]="12" />
              </button>
            }
          </span>
        }
      </div>
    }
  `,
  styles: ':host { display: grid; gap: 10px; }',
})
export class AdmChipInput {
  readonly values = model<string[]>([]);
  readonly placeholder = input('Nhập rồi nhấn Enter');
  readonly inputId = input<string | null>(null);
  readonly disabled = input(false);
  readonly draft = signal('');

  onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commit();
    } else if (event.key === 'Backspace' && !this.draft() && this.values().length) {
      this.values.set(this.values().slice(0, -1));
    }
  }

  commit(): void {
    const parts = this.draft()
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...this.values()];
    for (const part of parts)
      if (!next.some((value) => value.toLowerCase() === part.toLowerCase())) next.push(part);
    this.values.set(next);
    this.draft.set('');
  }

  remove(value: string): void {
    this.values.set(this.values().filter((item) => item !== value));
  }
}
