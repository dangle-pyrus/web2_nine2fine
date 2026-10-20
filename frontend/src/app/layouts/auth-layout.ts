import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

/** Split onboarding shell from Figma frames 12:41 / 43:1058 / 50:53. */
@Component({
  selector: 'n2f-auth-layout',
  imports: [RouterOutlet, RouterLink],
  template: `
    <a class="skip-link" href="#auth-content">Đến nội dung chính</a>
    <div class="auth-shell">
      <img
        class="auth-visual"
        src="/assets/onboarding/key-visual-1024.webp"
        srcset="
          /assets/onboarding/key-visual-640.webp   640w,
          /assets/onboarding/key-visual-1024.webp 1024w,
          /assets/onboarding/key-visual-1634.webp 1634w
        "
        sizes="max(42.55vw, 75.65vh)"
        width="1634"
        height="2160"
        alt=""
        fetchpriority="high"
      />
      <main class="auth-panel" id="auth-content" tabindex="-1">
        <div class="auth-content">
          <a routerLink="/" class="wordmark" aria-label="nine2fine - về cửa hàng"
            ><img src="/assets/brand/logo.svg" alt="nine2fine" width="234" height="46"
          /></a>
          <router-outlet />
        </div>
      </main>
    </div>
  `,
  styles: `
    .auth-shell {
      --u: clamp(0.66px, calc(100vw / 1920), 1px);
      min-height: 100dvh;
      display: grid;
      grid-template-columns: 42.55% 1fr;
      background: #fff;
    }
    .auth-visual {
      position: sticky;
      top: 0;
      width: 100%;
      height: 100dvh;
      object-fit: cover;
      /* Keep the people and the source PNG's right-edge fade when narrow viewports crop. */
      object-position: right top;
      /* Blend into the white panel regardless of crop; the PNG canvas is #fbfbfd, not #fff. */
      -webkit-mask-image: linear-gradient(to right, #000 72%, transparent);
      mask-image: linear-gradient(to right, #000 72%, transparent);
    }
    .auth-panel {
      padding: calc(57 * var(--u)) 32px 64px calc(98 * var(--u));
      outline: none;
    }
    .auth-content {
      max-width: calc(723 * var(--u));
    }
    .wordmark {
      display: inline-block;
    }
    .wordmark img {
      width: calc(234 * var(--u));
      height: auto;
    }
    @media (max-width: 900px) {
      .auth-shell {
        --u: 0.62px;
        grid-template-columns: 1fr;
      }
      .auth-visual {
        display: none;
      }
      .auth-panel {
        padding: 28px 20px 48px;
      }
      .auth-content {
        max-width: 560px;
        margin-inline: auto;
      }
      .wordmark img {
        width: 150px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayout {}
