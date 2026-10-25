import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** First-load skeleton rows for a table (5.9). Usage: `<tbody [admSkeleton]="6" [columns]="7"></tbody>`. */
@Component({
  selector: 'tbody[admSkeleton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (row of rows(); track row) {
      <tr aria-hidden="true">
        @for (col of cols(); track col) {
          <td>
            <span
              class="sk"
              [style.width.%]="col === 0 ? 70 : 40 + ((row * 7 + col * 13) % 40)"
            ></span>
          </td>
        }
      </tr>
    }
  `,
})
export class AdmSkeletonRows {
  readonly admSkeleton = input(6);
  readonly columns = input(5);
  readonly rows = computed(() => Array.from({ length: this.admSkeleton() }, (_, index) => index));
  readonly cols = computed(() => Array.from({ length: this.columns() }, (_, index) => index));
}
