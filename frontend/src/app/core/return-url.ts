const MAX_LENGTH = 512;
const BACKSLASH = String.fromCharCode(92);

/**
 * BR-AUTH-31: only internal paths. Exactly one leading `/`, no `//`, `/\` or `\`, no `://`, no
 * `/auth/...` and not the admin sign-in page, at most 512 characters. Anything else is dropped so
 * the caller falls back to the default page of the role.
 */
export function sanitizeReturnUrl(candidate: string | null | undefined): string | null {
  if (!candidate || candidate.length > MAX_LENGTH) return null;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null;
  // Also judge the decoded forms: `%255C` decodes to `%5C` and then to a backslash.
  let form = candidate;
  for (let round = 0; round < 3; round += 1) {
    if (form.startsWith('//') || form.includes(BACKSLASH) || form.includes('://')) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(form);
    } catch {
      return null;
    }
    if (decoded === form) break;
    form = decoded;
  }
  const path = candidate.split(/[?#]/, 1)[0];
  if (path === '/auth' || path.startsWith('/auth/')) return null;
  if (path === '/admin/login' || path.startsWith('/admin/login/')) return null;
  return candidate;
}

export function isAdminPath(url: string): boolean {
  return /^\/admin(?:[/?#]|$)/.test(url);
}

/** Admin sign-in only returns into the back office (decision 2026-11-07). */
export function sanitizeAdminReturnUrl(candidate: string | null | undefined): string | null {
  const url = sanitizeReturnUrl(candidate);
  return url && isAdminPath(url) ? url : null;
}
