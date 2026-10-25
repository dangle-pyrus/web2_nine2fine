import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/** Reicon outline icon (Phụ lục A.1). Icons are registered by `provideAdminIcons()`. */
@Component({
  selector: 'adm-icon',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-icon [name]="name()" [size]="size() + \'px\'" aria-hidden="true" />',
  styles: ':host { display: inline-flex; flex-shrink: 0; line-height: 0; }',
})
export class AdmIcon {
  readonly name = input.required<string>();
  readonly size = input(18);
}
