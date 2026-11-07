import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthMessage, SUPPORT_EMAIL } from '../auth-messages';

/** Message text with its optional support-email and sign-in links; put it inside the error `<p>`. */
@Component({
  selector: 'n2f-auth-message',
  imports: [RouterLink],
  template: `{{ message().text }}
    @if (message().signInLink) {
      <a class="link" routerLink="/auth/login">Đăng nhập</a>
    }
    @if (message().support) {
      <br />Email hỗ trợ: <a class="link" [href]="'mailto:' + supportEmail">{{ supportEmail }}</a>
    }`,
  styles: `
    .link {
      color: inherit;
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthMessageText {
  readonly message = input.required<AuthMessage>();
  readonly supportEmail = SUPPORT_EMAIL;
}
