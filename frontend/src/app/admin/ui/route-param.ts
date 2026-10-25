import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

/** Signal of a route parameter (the app router is not set up with component input binding). */
export function routeParam(name: string) {
  return toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get(name) ?? '')), {
    requireSync: true,
  });
}
