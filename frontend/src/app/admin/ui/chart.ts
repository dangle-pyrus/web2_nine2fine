import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
);

export interface ChartSeries {
  label: string;
  data: number[];
  /** Comparison period: light grey, dashed (3.10 Biểu đồ). */
  comparison?: boolean;
}

const INK = '#111111';
const GREY = '#c7c7c7';
const GRID = '#ededed';
const TEXT = '#767676';

/**
 * Chart.js wrapper with the monochrome theme of guideline 3.10: black main series, light grey
 * dashed comparison, faint horizontal grid only, no 3D or gradients (Phụ lục A.1).
 */
@Component({
  selector: 'adm-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas role="img" [attr.aria-label]="label()"></canvas>`,
  styles: ':host { display: block; position: relative; height: 260px; }',
})
export class AdmChart {
  readonly type = input<'line' | 'bar'>('line');
  readonly labels = input.required<string[]>();
  readonly series = input.required<ChartSeries[]>();
  readonly label = input('Biểu đồ');
  /** Formats axis ticks and tooltip values. */
  readonly format = input<(value: number) => string>((value) => String(value));

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    afterNextRender(() => this.render());
    effect(() => {
      const labels = this.labels();
      const series = this.series();
      if (!this.chart) return;
      this.chart.data.labels = labels;
      this.chart.data.datasets = this.datasets(series);
      this.chart.update();
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }

  private datasets(series: ChartSeries[]) {
    return series.map((item) => ({
      label: item.label,
      data: item.data,
      borderColor: item.comparison ? GREY : INK,
      backgroundColor: item.comparison ? GREY : INK,
      borderDash: item.comparison ? [4, 4] : [],
      borderWidth: this.type() === 'line' ? 2 : 0,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.3,
      borderRadius: 6,
      maxBarThickness: 28,
    }));
  }

  private render(): void {
    const format = this.format();
    this.chart = new Chart(this.canvas().nativeElement, {
      type: this.type(),
      data: { labels: this.labels(), datasets: this.datasets(this.series()) },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 200 },
        interaction: { mode: 'index', intersect: false },
        font: { family: getComputedStyle(document.body).fontFamily },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: TEXT, maxRotation: 0, autoSkipPadding: 16, font: { size: 12 } },
          },
          y: {
            grid: { color: GRID },
            border: { display: false },
            ticks: {
              color: TEXT,
              font: { size: 12 },
              callback: (value: string | number) => format(Number(value)),
              maxTicksLimit: 5,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#ffffff',
            titleColor: INK,
            bodyColor: '#595959',
            borderColor: '#e6e6e6',
            borderWidth: 1,
            cornerRadius: 16,
            padding: 12,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              label: (item: { dataset: { label?: string }; raw: unknown }) =>
                ` ${item.dataset.label}: ${format(Number(item.raw))}`,
            },
          },
        },
      } as never,
    });
  }
}
