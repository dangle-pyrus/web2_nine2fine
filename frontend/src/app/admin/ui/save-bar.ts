import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AdmIcon } from './icon';

/**
 * Contextual save bar (4.2): appears over the page header only while the form has unsaved changes.
 */
@Component({
  selector: 'adm-save-bar',
  imports: [AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="bar" role="region" aria-label="Thay đổi chưa lưu">
        <adm-icon name="reiconInfoCircle" />
        <span class="label">{{ label() }}</span>
        <button type="button" class="adm-btn" (click)="discard.emit()" [disabled]="saving()">
          Hủy thay đổi
        </button>
        <button
          type="button"
          class="adm-btn adm-btn--light"
          [class.is-busy]="saving()"
          (click)="save.emit()"
        >
          {{ saveLabel() }}
        </button>
      </div>
    }
  `,
  styles: `
    .bar {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 60;
      width: min(720px, calc(100vw - 32px));
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 6px 6px 18px;
      border-radius: 9999px;
      background: var(--adm-primary);
      color: #fff;
      box-shadow: var(--adm-shadow-lg);
      animation: in 150ms ease-out both;
    }
    .label {
      flex: 1;
      font-weight: 500;
    }
    .adm-btn {
      background: transparent;
      border-color: rgba(255, 255, 255, 0.4);
      color: #fff;
    }
    .adm-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
    .adm-btn--light {
      background: #fff;
      border-color: #fff;
      color: var(--adm-text);
    }
    .adm-btn--light:hover {
      background: #ededed;
      color: var(--adm-text);
    }
    @keyframes in {
      from {
        opacity: 0;
        transform: translate(-50%, -6px);
      }
    }
    @media (max-width: 767px) {
      .bar {
        top: auto;
        bottom: 12px;
      }
      .label {
        display: none;
      }
      .adm-btn {
        flex: 1;
      }
    }
  `,
})
export class AdmSaveBar {
  readonly visible = input.required<boolean>();
  readonly saving = input(false);
  readonly label = input('Thay đổi chưa lưu');
  readonly saveLabel = input('Lưu');
  readonly save = output();
  readonly discard = output();
}
