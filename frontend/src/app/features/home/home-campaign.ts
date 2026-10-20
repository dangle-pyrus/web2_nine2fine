import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { getMedia } from '../../../media/media-manifest';
import { RouterLink } from '@angular/router';
import { LandingCampaign } from './landing-content';

@Component({
  selector: 'n2f-home-campaign',
  imports: [RouterLink],
  template: `
    <section
      class="campaign"
      [class.hero]="hero()"
      [attr.aria-labelledby]="content().id + '-title'"
    >
      <picture class="campaign-media">
        <source
          media="(max-width: 959px)"
          [srcset]="mobile().srcset ?? mobile().src"
          sizes="100vw"
        />
        <img
          [src]="media().src"
          alt=""
          [attr.srcset]="media().srcset ?? null"
          sizes="100vw"
          [style.object-position]="media().objectPosition ?? null"
          [width]="media().width"
          [height]="media().height"
          [attr.loading]="hero() ? 'eager' : 'lazy'"
          [attr.fetchpriority]="hero() ? 'high' : null"
        />
      </picture>
      @if (media().videoSrc) {
        <video
          #clip
          class="campaign-video"
          [class.ready]="hasPlayed()"
          [muted]="true"
          loop
          playsinline
          preload="none"
          aria-hidden="true"
          (playing)="playing.set(true); hasPlayed.set(true)"
          (pause)="playing.set(false)"
          (error)="videoFailed.set(true); playing.set(false); hasPlayed.set(false)"
        ></video>
      }
      <a class="campaign-link" [routerLink]="content().href">
        <div class="campaign-copy">
          <p class="eyebrow">{{ content().eyebrow }}</p>
          @if (hero()) {
            <h1 [id]="content().id + '-title'" [attr.lang]="content().titleLang ?? null">
              {{ content().title }}
            </h1>
          } @else {
            <h2 [id]="content().id + '-title'" [attr.lang]="content().titleLang ?? null">
              {{ content().title }}
            </h2>
          }
          @if (content().description) {
            <p class="description">{{ content().description }}</p>
          }
        </div>
      </a>
      @if (media().videoSrc && !videoFailed()) {
        <button
          type="button"
          class="video-control"
          [attr.aria-label]="(playing() ? 'Tạm dừng video: ' : 'Phát video: ') + content().title"
          (click)="toggleVideo()"
        >
          @if (playing()) {
            <span class="pause-icon" aria-hidden="true"></span>
          } @else {
            <span class="play-icon" aria-hidden="true"></span>
          }
        </button>
      }
    </section>
  `,
  styleUrl: './home-campaign.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeCampaign {
  readonly content = input.required<LandingCampaign>();
  readonly hero = input(false);
  readonly media = computed(() => getMedia(this.content().mediaId));
  readonly mobile = computed(() => getMedia(this.content().mobileMediaId));
  readonly playing = signal(false);
  readonly hasPlayed = signal(false);
  readonly videoFailed = signal(false);
  private readonly clip = viewChild<ElementRef<HTMLVideoElement>>('clip');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly preference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  private inView = false;
  private userPaused = false;

  constructor() {
    afterNextRender(() => {
      const video = this.clip()?.nativeElement;
      if (!video) return;
      const syncPlayback = () => {
        if (this.inView && !document.hidden && !this.userPaused && !this.preference?.matches) {
          this.play();
        } else video.pause();
      };
      const observer = new IntersectionObserver(
        ([entry]) => {
          this.inView = entry.isIntersecting && entry.intersectionRatio >= 0.2;
          syncPlayback();
        },
        { threshold: [0, 0.2] },
      );
      observer.observe(this.host.nativeElement);
      this.preference?.addEventListener('change', syncPlayback);
      document.addEventListener('visibilitychange', syncPlayback);
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        this.preference?.removeEventListener('change', syncPlayback);
        document.removeEventListener('visibilitychange', syncPlayback);
        video.pause();
        video.removeAttribute('src');
        video.load();
      });
    });
  }

  toggleVideo(): void {
    const video = this.clip()?.nativeElement;
    if (!video) return;
    this.userPaused = !video.paused;
    if (this.userPaused) video.pause();
    else this.play();
  }

  private play(): void {
    const video = this.clip()?.nativeElement;
    const source = this.media().videoSrc;
    if (!video || !source || this.videoFailed()) return;
    if (!video.getAttribute('src')) video.src = source;
    void video.play().catch(() => this.playing.set(false));
  }
}
