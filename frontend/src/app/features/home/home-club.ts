import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { API_CONFIG } from '../../core/api-config';
import { Analytics } from '../../core/analytics';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { NEWSLETTER_API } from './newsletter-api';
import { HomeContent } from './home-content';

/** Plan 8.9 newsletter / membership CTA. */
@Component({
  selector: 'n2f-home-club',
  imports: [ReactiveFormsModule, RevealDirective],
  template: `
    @let club = content();
    <section class="club" aria-labelledby="club-title">
      <div class="container inner" n2fReveal="editorial-reveal">
        <div>
          <h2 id="club-title" data-reveal-line>{{ club.title }}</h2>
          <ul data-reveal-line>
            @for (perk of club.perks; track perk) {
              <li>{{ perk }}</li>
            }
          </ul>
        </div>
        <div data-reveal-line>
          @if (joined()) {
            <p class="success" role="status">
              Chào mừng bạn đến After Five Club.
              @if (isMock) {
                <span>(Bản trải nghiệm: chưa có email nào được gửi.)</span>
              }
            </p>
          } @else {
            <form (submit)="$event.preventDefault(); join()" novalidate>
              <label for="club-email">Email của bạn</label>
              <div class="row">
                <input
                  id="club-email"
                  type="email"
                  autocomplete="email"
                  placeholder="ten@email.com"
                  [formControl]="email"
                  [attr.aria-invalid]="email.invalid && email.touched"
                  [attr.aria-describedby]="
                    email.invalid && email.touched ? 'club-error' : 'club-consent'
                  "
                />
                <button type="submit" [disabled]="busy()">
                  {{ busy() ? 'Đang gửi…' : 'Tham gia' }}
                </button>
              </div>
              @if (email.invalid && email.touched) {
                <p class="error" id="club-error">Nhập địa chỉ email hợp lệ.</p>
              }
              @if (failed()) {
                <p class="error" role="alert">Chưa thể đăng ký lúc này. Vui lòng thử lại.</p>
              }
              <p class="consent" id="club-consent">{{ club.consent }}</p>
            </form>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .club {
      background: var(--ink);
      color: #fff;
    }
    .inner {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 48px;
      align-items: end;
      padding-block: clamp(72px, 10vw, 128px);
    }
    h2 {
      margin: 0;
      font-size: clamp(40px, 6vw, 88px);
      font-weight: 800;
      line-height: 0.95;
      text-transform: uppercase;
    }
    ul {
      margin: 24px 0 0;
      padding: 0;
      list-style: none;
      font-family: 'Playfair Display', Georgia, serif;
      font-size: clamp(20px, 2vw, 28px);
      font-style: italic;
      line-height: 1.5;
    }
    label {
      display: block;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .row {
      display: flex;
      gap: 10px;
    }
    input {
      flex: 1;
      min-width: 0;
      min-height: 52px;
      padding: 0 20px;
      border: 1px solid #ffffff66;
      border-radius: 999px;
      background: transparent;
      color: #fff;
      font: inherit;
      font-size: 16px;
    }
    input::placeholder {
      color: #ffffff80;
    }
    input:focus {
      border-color: #fff;
      outline: none;
    }
    input[aria-invalid='true'] {
      border-color: #ff8a8c;
    }
    button {
      min-height: 52px;
      padding: 0 28px;
      border: 0;
      border-radius: 999px;
      background: var(--brand);
      color: #fff;
      font: inherit;
      font-weight: 700;
    }
    button:hover:not(:disabled) {
      background: var(--brand-hover);
    }
    .error {
      margin: 10px 0 0;
      color: #ff8a8c;
      font-size: 14px;
    }
    .consent {
      margin: 14px 0 0;
      color: #ffffffa6;
      font-size: 13px;
      line-height: 1.6;
    }
    .success {
      margin: 0;
      font-size: 20px;
      line-height: 1.6;
    }
    .success span {
      display: block;
      color: #ffffffa6;
      font-size: 14px;
    }
    @media (max-width: 800px) {
      .inner {
        grid-template-columns: 1fr;
        gap: 32px;
      }
      .row {
        flex-direction: column;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeClub {
  readonly content = input.required<HomeContent['club']>();
  readonly isMock = inject(API_CONFIG).mode === 'mock';
  readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });
  readonly busy = signal(false);
  readonly joined = signal(false);
  readonly failed = signal(false);
  private readonly api = inject(NEWSLETTER_API);
  private readonly analytics = inject(Analytics);
  private readonly destroyRef = inject(DestroyRef);

  join(): void {
    this.email.markAsTouched();
    if (this.email.invalid || this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    this.api
      .subscribe(this.email.value.trim())
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.joined.set(true);
          this.analytics.track('newsletter_signup', { list: 'after-five-club' });
        },
        error: () => this.failed.set(true),
      });
  }
}
