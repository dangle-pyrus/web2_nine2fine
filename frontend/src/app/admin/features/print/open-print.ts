import { Router } from '@angular/router';

export type PrintKind = 'delivery' | 'pick';

/** Print sheets open in a new tab so the list or order the user came from stays as it was. */
export function openPrint(router: Router, kind: PrintKind, ids: string[]): void {
  const url = router.serializeUrl(
    router.createUrlTree(['/admin/print', kind], { queryParams: { ids: ids.join(','), auto: 1 } }),
  );
  window.open(url, '_blank');
}
