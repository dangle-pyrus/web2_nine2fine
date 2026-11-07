/** Client-side mirrors of the register rules (BR-AUTH-10, 11); the backend stays authoritative. */

export const NAME_MAX_LENGTH = 50;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} '-]*$/u;
const MIN_AGE = 13;
/** The date pickers never offer a year later than this many years ago (decision 2026-11-07). */
const MAX_YEAR_OFFSET = 10;

/** Trim, collapse inner whitespace and normalise to NFC, as the server does before validating. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').normalize('NFC');
}

export type NameProblem = 'required' | 'chars' | 'max';

export function nameProblem(raw: string): NameProblem | null {
  const name = normalizeName(raw);
  if (!name) return 'required';
  if (name.length > NAME_MAX_LENGTH) return 'max';
  return NAME_PATTERN.test(name) ? null : 'chars';
}

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** Today's date in Vietnam (UTC+7), the clock the 13-year rule is judged on. */
export function todayInVietnam(now: Date = new Date()): CalendarDate {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number);
  return { year, month, day };
}

export interface BirthDateParts {
  day: string;
  month: string;
  year: string;
}

export type BirthDateResult =
  { kind: 'empty' } | { kind: 'ok'; iso: string } | { kind: 'invalid' } | { kind: 'underage' };

const toNumber = (text: string): number => (/^\d+$/.test(text.trim()) ? Number(text) : Number.NaN);

/**
 * `empty` when all three parts are blank. A part missing, a day that does not exist, a year before
 * 1900 or a date after today is `invalid`. A real date that is younger than 13, or a year later
 * than (current year - 10), is `underage`.
 */
export function checkBirthDate(parts: BirthDateParts, today: CalendarDate): BirthDateResult {
  if (!parts.day.trim() && !parts.month.trim() && !parts.year.trim()) return { kind: 'empty' };
  const [day, month, year] = [toNumber(parts.day), toNumber(parts.month), toNumber(parts.year)];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    [day, month, year].every(Number.isInteger) &&
    year >= 1900 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!real) return { kind: 'invalid' };
  const key = year * 10_000 + month * 100 + day;
  const todayKey = today.year * 10_000 + today.month * 100 + today.day;
  if (key > todayKey) return { kind: 'invalid' };
  const adultKey = (year + MIN_AGE) * 10_000 + month * 100 + day;
  if (year > today.year - MAX_YEAR_OFFSET || adultKey > todayKey) return { kind: 'underage' };
  return { kind: 'ok', iso: date.toISOString().slice(0, 10) };
}

/** `YYYY-MM-DD` to its three parts, for checking a value that arrives as an ISO date. */
export function isoToParts(iso: string): BirthDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match
    ? { year: match[1], month: match[2], day: match[3] }
    : { day: 'x', month: 'x', year: 'x' };
}
