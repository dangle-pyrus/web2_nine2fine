import { Pipe, PipeTransform } from '@angular/core';
import * as fmt from './format';

@Pipe({ name: 'admMoney' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return fmt.money(value);
  }
}

@Pipe({ name: 'admNum' })
export class NumPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return fmt.num(value);
  }
}

@Pipe({ name: 'admPercent' })
export class PercentPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return fmt.percent(value);
  }
}

@Pipe({ name: 'admDate' })
export class DatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return fmt.date(value);
  }
}

@Pipe({ name: 'admDateTime' })
export class DateTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return fmt.dateTime(value);
  }
}

@Pipe({ name: 'admRelative' })
export class RelativePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return fmt.relative(value);
  }
}

@Pipe({ name: 'admPhone' })
export class PhonePipe implements PipeTransform {
  transform(value: string | null | undefined, masked = false): string {
    return masked ? fmt.maskPhone(value) : fmt.phone(value);
  }
}

export const FORMAT_PIPES = [
  MoneyPipe,
  NumPipe,
  PercentPipe,
  DatePipe,
  DateTimePipe,
  RelativePipe,
  PhonePipe,
] as const;
