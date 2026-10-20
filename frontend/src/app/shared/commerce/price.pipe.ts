import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
@Pipe({ name: 'vnd' })
export class PricePipe implements PipeTransform {
  transform(value: number): string {
    return formatter.format(value);
  }
}
