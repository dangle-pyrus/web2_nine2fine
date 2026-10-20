import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'n2f-icon',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-icon [name]="name()" [size]="size()" aria-hidden="true" />',
  styles: ':host { display: inline-flex; flex-shrink: 0; vertical-align: middle; }',
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input('22px');
}
