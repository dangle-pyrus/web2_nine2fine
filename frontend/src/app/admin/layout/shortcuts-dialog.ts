import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SHORTCUT_HELP } from './shortcuts';

/** "?" — every keyboard shortcut on one card. */
@Component({
  selector: 'adm-shortcuts-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <div class="dialog">
      <h2>Phím tắt</h2>
      <p class="dialog-desc">Phím một chữ không hoạt động khi đang gõ trong ô nhập.</p>
      <div class="dialog-body">
        @for (group of groups; track group.group) {
          <section>
            <h3>{{ group.group }}</h3>
            <dl>
              @for (item of group.items; track item.label) {
                <div>
                  <dt>{{ item.label }}</dt>
                  <dd>
                    @for (key of item.keys; track $index) {
                      @if (!$first) {
                        <span class="then">{{ item.keys[0] === 'Ctrl' ? '+' : 'rồi' }}</span>
                      }
                      <kbd>{{ key }}</kbd>
                    }
                  </dd>
                </div>
              }
            </dl>
          </section>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Đóng</button>
      </div>
    </div>
  `,
  styles: `
    section + section {
      margin-top: 16px;
    }
    h3 {
      margin: 0 0 6px;
      font-size: 12px;
      font-weight: 500;
      color: var(--adm-text-tertiary);
    }
    dl {
      margin: 0;
    }
    dl > div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 6px 0;
    }
    dt {
      color: var(--adm-text);
    }
    dd {
      margin: 0;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    kbd {
      min-width: 24px;
      padding: 2px 6px;
      border-radius: 6px;
      background: var(--adm-muted);
      font-family: inherit;
      font-size: 12px;
      text-align: center;
    }
    .then {
      font-size: 12px;
      color: var(--adm-text-tertiary);
    }
  `,
})
export class ShortcutsDialog {
  readonly ref = inject(DialogRef);
  protected readonly groups = SHORTCUT_HELP;
}
