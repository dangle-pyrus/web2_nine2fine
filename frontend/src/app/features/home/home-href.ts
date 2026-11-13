import { Params } from '@angular/router';

/**
 * Admin-edited links are internal paths that may carry a query (`/shop?moment=work`); `routerLink`
 * needs the path, the query and the fragment apart (a "?" inside a path string would be encoded).
 */
export function hrefPath(href: string): string {
  return href.split(/[?#]/)[0] || '/';
}

export function hrefQuery(href: string): Params | null {
  const query = href.split('#')[0].split('?')[1];
  if (!query) return null;
  const params: Params = {};
  new URLSearchParams(query).forEach((value, key) => (params[key] = value));
  return params;
}

export function hrefFragment(href: string): string | undefined {
  return href.split('#')[1] || undefined;
}
