import { delay, mergeMap, Observable, of, throwError, timer } from 'rxjs';

const LATENCY_MS = 400;

/** Emits like a network response so loading states are visible in mock mode. */
export function respond<T>(value: T): Observable<T> {
  return of(value).pipe(delay(LATENCY_MS));
}

export function fail(error: Error): Observable<never> {
  return timer(LATENCY_MS).pipe(mergeMap(() => throwError(() => error)));
}
