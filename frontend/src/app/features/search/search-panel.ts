import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Params, Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  timer,
} from 'rxjs';
import type { SearchOrigin } from './search-origin';
import { CATALOG_API } from '../catalog/data-access/catalog-api';
import { DEFAULT_QUERY, Product } from '../catalog/models/product';
import { IconComponent } from '../../shared/ui/icon.component';
import { MediaImageComponent } from '../../shared/ui/media-image.component';
import { PricePipe } from '../../shared/commerce/price.pipe';
import {
  buildSuggestions,
  highlight,
  POPULAR_SEARCHES,
  SearchHistory,
  SearchSuggestion,
} from './search-suggestions';

interface SearchState {
  items: Product[];
  total: number;
  loading: boolean;
  failed: boolean;
}

interface SearchOption {
  id: string;
  label: string;
  path: string | unknown[];
  queryParams?: Params;
  /** Term saved to recent searches when chosen. */
  term: string;
}

const OPEN_MS = 340;
const CLOSE_MS = 260;
const EASE_OUT = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

const IDLE: SearchState = { items: [], total: 0, loading: false, failed: false };

/**
 * Nike-style search: the header turns into a search sheet (logo · field · Hủy) with popular and
 * recent terms; typing shows top suggestions beside product cards. Combobox keyboard support
 * (↑/↓/Enter/Escape), debounced requests that cancel the previous one, focus trapped while open.
 *
 * Motion is one continuous surface: the header pill morphs (FLIP: position + size) into the field
 * while the bar fades in and results unfold; closing plays the reverse before `closed` fires.
 */
@Component({
  selector: 'n2f-search-panel',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CdkTrapFocus,
    IconComponent,
    MediaImageComponent,
    PricePipe,
  ],
  templateUrl: './search-panel.html',
  styleUrl: './search-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'close(false)',
    '[style.--bar-top.px]': 'origin()?.barTop ?? 0',
  },
})
export class SearchPanel {
  /** `true` when the panel closes because the shopper navigated to a result. */
  readonly closed = output<boolean>();
  readonly origin = input<SearchOrigin | null>(null);
  readonly history = inject(SearchHistory);
  readonly popular = POPULAR_SEARCHES;
  readonly search = new FormControl('', { nonNullable: true });
  readonly query = signal('');
  readonly state = signal<SearchState>(IDLE);
  readonly activeIndex = signal(-1);
  readonly highlight = highlight;
  readonly skeletons = [0, 1, 2, 3, 4];

  readonly suggestions = computed(() => buildSuggestions(this.query(), this.state().items));
  readonly products = computed(() => this.state().items.slice(0, 5));
  /** Keyboard order follows the layout: suggestions, "Xem tất cả", then products. */
  readonly options = computed<SearchOption[]>(() => {
    const query = this.query();
    if (!query) return [];
    const suggestionOptions = this.suggestions().map((suggestion, index) =>
      this.toOption(suggestion, `search-suggestion-${index}`),
    );
    const productOptions = this.products().map((product) => ({
      id: `search-product-${product.id}`,
      label: product.name,
      path: ['/product', product.slug],
      term: query,
    }));
    const all = this.state().items.length
      ? [
          {
            id: 'search-all',
            label: 'all',
            path: '/search',
            queryParams: { q: query },
            term: query,
          },
        ]
      : [];
    return [...suggestionOptions, ...all, ...productOptions];
  });
  readonly activeId = computed(() => this.options()[this.activeIndex()]?.id ?? null);

  private readonly api = inject(CATALOG_API);
  private readonly router = inject(Router);
  private readonly retry$ = new Subject<void>();
  private readonly fieldRef = viewChild.required<ElementRef<HTMLElement>>('field');
  private readonly sheetRef = viewChild.required<ElementRef<HTMLElement>>('sheet');
  private readonly barBgRef = viewChild.required<ElementRef<HTMLElement>>('barBg');
  private readonly resultsRef = viewChild.required<ElementRef<HTMLElement>>('results');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private closing = false;

  constructor() {
    combineLatest([
      this.search.valueChanges.pipe(
        map((value) => value.trim()),
        distinctUntilChanged(),
      ),
      this.retry$.pipe(startWith(undefined)),
    ])
      .pipe(
        map(([search]) => search),
        // Cancel the previous request immediately; debounce only the new one.
        switchMap((search) => {
          this.query.set(search);
          this.activeIndex.set(-1);
          return !search
            ? of(IDLE)
            : timer(250).pipe(
                switchMap(() => this.api.list({ ...DEFAULT_QUERY, search })),
                map((page): SearchState => ({ ...IDLE, items: page.items, total: page.total })),
                startWith<SearchState>({ ...this.state(), loading: true, failed: false }),
                catchError(() => of<SearchState>({ ...IDLE, failed: true })),
              );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));

    afterNextRender(() => this.play('open'));

    // Lock page scroll behind the sheet while it is mounted.
    const body = inject(DOCUMENT).body;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => (body.style.overflow = previous));
  }

  /** Every exit path runs the reverse morph first, so the field lands back on the header pill. */
  close(navigated: boolean): void {
    if (this.closing) return;
    this.closing = true;
    void this.play('close').then(() => this.closed.emit(navigated));
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!count) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex.update(
        (index) => (index + step + count + (index < 0 && step < 0 ? 1 : 0)) % count,
      );
    } else if (event.key === 'Enter' && this.activeIndex() >= 0) {
      event.preventDefault();
      this.go(this.options()[this.activeIndex()]);
    }
  }

  submit(): void {
    const query = this.search.value.trim();
    if (query)
      this.go({
        id: 'submit',
        label: query,
        path: '/search',
        queryParams: { q: query },
        term: query,
      });
  }

  /** Links run their own navigation; this only records the term and closes the sheet. */
  chose(term: string): void {
    this.history.add(term);
    this.close(true);
  }

  clear(input: HTMLInputElement): void {
    this.search.setValue('');
    input.focus();
  }

  retry(): void {
    this.retry$.next();
  }

  isActive(id: string): boolean {
    return this.activeId() === id;
  }

  private go(option: SearchOption): void {
    this.history.add(option.term);
    const commands = Array.isArray(option.path) ? option.path : [option.path];
    void this.router.navigate(commands, { queryParams: option.queryParams });
    this.close(true);
  }

  private play(direction: 'open' | 'close'): Promise<void> {
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const field = this.fieldRef().nativeElement;
    if (reduce || typeof field.animate !== 'function') return Promise.resolve();

    const opening = direction === 'open';
    const timing = (duration: number, delay = 0): KeyframeAnimationOptions => ({
      duration,
      delay,
      easing: opening ? EASE_OUT : EASE_IN_OUT,
      direction: opening ? 'normal' : 'reverse',
      fill: 'both',
    });
    const fade = [{ opacity: 0 }, { opacity: 1 }];
    const chrome =
      this.sheetRef().nativeElement.querySelectorAll<HTMLElement>('.wordmark, .cancel');
    const animations = [
      this.host.nativeElement.querySelector('.scrim')!.animate(fade, timing(opening ? 260 : 220)),
      this.barBgRef().nativeElement.animate(fade, timing(opening ? 180 : 200, opening ? 0 : 60)),
      this.resultsRef().nativeElement.animate(
        [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
        timing(opening ? 300 : 200, opening ? 80 : 0),
      ),
      ...[...chrome].map((element) =>
        element.animate(
          [
            { opacity: 0, transform: 'translateY(-4px)' },
            { opacity: 1, transform: 'none' },
          ],
          timing(opening ? 220 : 160, opening ? 90 : 0),
        ),
      ),
    ];
    const morph = this.morph(field, opening);
    if (morph) animations.push(morph);
    return Promise.all(animations.map((animation) => animation.finished))
      .then(() => {
        // Keep the closed frame until Angular removes the panel; clear fills after opening.
        if (opening) animations.forEach((animation) => animation.cancel());
      })
      .catch(() => undefined);
  }

  /** FLIP from the header pill's rect/look to the field's final rect. */
  private morph(field: HTMLElement, opening: boolean): Animation | null {
    const from = this.origin();
    if (!from) return null;
    const to = field.getBoundingClientRect();
    const start: Keyframe = {
      transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      borderColor: from.borderColor,
      backgroundColor: from.backgroundColor,
      boxShadow: from.boxShadow,
    };
    const end: Keyframe = {
      transform: 'translate(0, 0)',
      width: `${to.width}px`,
      height: `${to.height}px`,
    };
    const timing: KeyframeAnimationOptions = {
      duration: opening ? OPEN_MS : CLOSE_MS,
      easing: opening ? EASE_OUT : EASE_IN_OUT,
      direction: opening ? 'normal' : 'reverse',
      fill: 'both',
    };
    // Icon-only trigger (tablet/mobile): start as a centred icon, let the text appear as it widens.
    if (from.width < 2 * from.height) {
      const inset = `${Math.max(0, (from.width - 24) / 2)}px`;
      Object.assign(start, { paddingLeft: inset, paddingRight: inset, gap: '0px' });
      const text = field.querySelectorAll<HTMLElement>('input, .clear');
      text.forEach((element) =>
        element.animate(
          [
            { opacity: 0, flexGrow: 0, flexBasis: '0px' },
            { opacity: 0, offset: 0.35 },
            { opacity: 1 },
          ],
          timing,
        ),
      );
    }
    return field.animate([start, end], timing);
  }

  private toOption(suggestion: SearchSuggestion, id: string): SearchOption {
    return { id, ...suggestion, term: suggestion.label };
  }
}
