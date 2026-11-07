import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import {
  AuthApi,
  AuthError,
  AuthErrorCode,
  AuthUser,
  CodeDispatch,
  EmailLookup,
  RegisterRequest,
  ResetPasswordRequest,
  VerificationPurpose,
} from '../app/features/auth/data-access/auth-api';
import { PASSWORD_RULES, validEmail } from '../app/features/auth/auth-messages';
import {
  checkBirthDate,
  isoToParts,
  nameProblem,
  normalizeName,
  todayInVietnam,
} from '../app/features/auth/auth-validation';
import {
  DEMO_VERIFICATION_CODE,
  MOCK_OFFLINE_EMAIL,
  MOCK_RACE_EMAIL,
  MOCK_RATE_LIMITED_EMAIL,
  MockAccount,
} from './accounts';
import { MockAccountStore } from './mock-account-store';
import { fail, respond } from './mock-latency';
import { MockPersistence } from './mock-persistence';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
/** Same numbers as docs/api/openapi.yaml (BR-AUTH-05, 06, 08, 18). */
const RESEND_COOLDOWN = 60 * SECOND;
const CODE_TTL = 10 * MINUTE;
const SEND_WINDOW = 30 * MINUTE;
const MAX_SENDS = 5;
const MAX_FAILURES = 5;
const LOCK_TIME = 15 * MINUTE;

/**
 * Mock of the storefront auth endpoints that follows docs/api/openapi.yaml, error codes included:
 * `validation`, `underage`, `invalid-code`, `code-locked`, `rate-limited`, `password-locked`,
 * `invalid-credentials`, `account-disabled`, `email-registered`. The state lives in memory (the
 * session survives F5 through `MockPersistence`). Demo hooks, mock only: the code is always
 * `DEMO_VERIFICATION_CODE` once requested; `locked@nine2fine.vn` is a disabled account (it also
 * gets a code, so the "right code, disabled account" answer can be reached);
 * `MOCK_RATE_LIMITED_EMAIL` and `MOCK_OFFLINE_EMAIL` fail on lookup; registering `MOCK_RACE_EMAIL`
 * answers `email-registered`.
 */
@Injectable({ providedIn: 'root' })
export class MockAuthApi implements AuthApi {
  private readonly accounts = inject(MockAccountStore).accounts;
  private current: AuthUser | null;
  /** `email|purpose` -> expiry of the code currently valid. */
  private readonly issued = new Map<string, number>();
  private readonly lastSent = new Map<string, number>();
  private readonly sends = new Map<string, number[]>();
  private readonly codeFailures = new Map<string, number>();
  /** email -> end of the code-verification lock (all purposes). */
  private readonly codeLocks = new Map<string, number>();
  private readonly passwordFailures = new Map<string, { count: number; at: number }>();
  private readonly passwordLocks = new Map<string, number>();

  constructor() {
    this.current =
      inject(MockPersistence).register<AuthUser | null>('auth-session', () => this.current) ?? null;
  }

  lookupEmail(email: string): Observable<EmailLookup> {
    const address = normalize(email);
    if (!validEmail(address)) return failWith('validation', { field: 'email' });
    if (address === MOCK_OFFLINE_EMAIL) return failWith('unavailable');
    if (address === MOCK_RATE_LIMITED_EMAIL) return failWith('rate-limited', { seconds: 600 });
    return respond({ registered: this.accounts.has(address) });
  }

  requestCode(email: string, purpose: VerificationPurpose): Observable<CodeDispatch> {
    const address = normalize(email);
    if (!validEmail(address)) return failWith('validation', { field: 'email' });
    const locked = this.remaining(this.codeLocks, address);
    if (locked) return failWith('code-locked', { seconds: locked });
    const key = `${address}|${purpose}`;
    const now = Date.now();
    const cooldown = (this.lastSent.get(key) ?? 0) + RESEND_COOLDOWN - now;
    if (cooldown > 0) return respond({ resendAfterSeconds: Math.ceil(cooldown / SECOND) });
    const recent = (this.sends.get(key) ?? []).filter((time) => now - time < SEND_WINDOW);
    if (recent.length >= MAX_SENDS) {
      return failWith('rate-limited', {
        seconds: Math.ceil((recent[0] + SEND_WINDOW - now) / SECOND),
      });
    }
    this.sends.set(key, [...recent, now]);
    this.lastSent.set(key, now);
    const account = this.accounts.get(address);
    // Same answer whether or not a code was really sent (BR-AUTH-03).
    if (purpose === 'register' ? !account : !!account) {
      this.issued.set(key, now + CODE_TTL);
      this.codeFailures.delete(key);
    }
    return respond({ resendAfterSeconds: RESEND_COOLDOWN / SECOND });
  }

  loginWithCode(email: string, code: string): Observable<AuthUser> {
    const address = normalize(email);
    const problem = this.checkEmailAndCode(address, code);
    if (problem) return problem;
    const verdict = this.verifyCode(address, 'login', code);
    if (verdict) return verdict;
    const account = this.accounts.get(address);
    if (!account) return failWith('invalid-code');
    if (account.disabled) return failWith('account-disabled');
    this.passwordFailures.delete(address);
    this.passwordLocks.delete(address);
    return respond(this.startSession(account));
  }

  loginWithPassword(email: string, password: string): Observable<AuthUser> {
    const address = normalize(email);
    if (!validEmail(address) || !password) return failWith('validation');
    const locked = this.remaining(this.passwordLocks, address);
    if (locked) return failWith('password-locked', { seconds: locked });
    const account = this.accounts.get(address);
    if (!account?.password || account.password !== password) {
      const now = Date.now();
      const previous = this.passwordFailures.get(address);
      const count = previous && now - previous.at <= LOCK_TIME ? previous.count + 1 : 1;
      this.passwordFailures.set(address, { count, at: now });
      if (count >= MAX_FAILURES) {
        this.passwordLocks.set(address, now + LOCK_TIME);
        return failWith('password-locked', { seconds: LOCK_TIME / SECOND });
      }
      return failWith('invalid-credentials');
    }
    if (account.disabled) return failWith('account-disabled');
    this.passwordFailures.delete(address);
    return respond(this.startSession(account));
  }

  register(request: RegisterRequest): Observable<AuthUser> {
    const address = normalize(request.email);
    const problem = this.checkEmailAndCode(address, request.code);
    if (problem) return problem;
    // Format checks come before the code is spent (BR-AUTH-10..12).
    const firstName = normalizeName(request.firstName);
    const lastName = normalizeName(request.lastName);
    if (nameProblem(firstName)) return failWith('validation', { field: 'firstName' });
    if (nameProblem(lastName)) return failWith('validation', { field: 'lastName' });
    if (request.birthDate !== null) {
      const birth = checkBirthDate(isoToParts(request.birthDate), todayInVietnam());
      if (birth.kind === 'invalid' || birth.kind === 'empty') {
        return failWith('validation', { field: 'birthDate' });
      }
      if (birth.kind === 'underage') return failWith('underage', { field: 'birthDate' });
    }
    if (request.acceptedTerms !== true) return failWith('validation', { field: 'acceptedTerms' });
    const verdict = this.verifyCode(address, 'register', request.code);
    if (verdict) return verdict;
    if (this.accounts.has(address) || address === MOCK_RACE_EMAIL) {
      return failWith('email-registered');
    }
    const account: MockAccount = {
      id: `member-${this.accounts.size + 1}`,
      email: address,
      firstName,
      lastName,
      password: null,
      birthDate: request.birthDate,
      phone: null,
    };
    this.accounts.set(address, account);
    return respond(this.startSession(account));
  }

  resetPassword(request: ResetPasswordRequest): Observable<void> {
    const address = normalize(request.email);
    const problem = this.checkEmailAndCode(address, request.code);
    if (problem) return problem;
    if (!PASSWORD_RULES.every((rule) => rule.test(request.newPassword, address))) {
      return failWith('validation', { field: 'newPassword' });
    }
    const verdict = this.verifyCode(address, 'reset-password', request.code);
    if (verdict) return verdict;
    const account = this.accounts.get(address);
    if (!account) return failWith('invalid-code');
    account.password = request.newPassword;
    this.passwordFailures.delete(address);
    this.passwordLocks.delete(address);
    // Every session of the account ends, this tab's included (BR-AUTH-22, 29).
    if (this.current?.email === address) this.current = null;
    return respond(undefined);
  }

  me(): Observable<AuthUser | null> {
    return of(this.current);
  }

  logout(): Observable<void> {
    this.current = null;
    return respond(undefined);
  }

  private startSession(account: MockAccount): AuthUser {
    const { id, email, firstName, lastName } = account;
    this.current = { id, email, firstName, lastName, role: account.role ?? 'member' };
    return this.current;
  }

  private checkEmailAndCode(address: string, code: string): Observable<never> | null {
    if (!validEmail(address)) return failWith('validation', { field: 'email' });
    return /^\d{8}$/.test(code.replace(/[\s-]/g, ''))
      ? null
      : failWith('validation', { field: 'code' });
  }

  /** Null when the code is right (and spent); otherwise the failure to answer with. */
  private verifyCode(
    address: string,
    purpose: VerificationPurpose,
    code: string,
  ): Observable<never> | null {
    const locked = this.remaining(this.codeLocks, address);
    if (locked) return failWith('code-locked', { seconds: locked });
    const key = `${address}|${purpose}`;
    const expiresAt = this.issued.get(key);
    const clean = code.replace(/[\s-]/g, '');
    if (expiresAt && expiresAt > Date.now() && clean === DEMO_VERIFICATION_CODE) {
      this.issued.delete(key);
      this.codeFailures.delete(key);
      return null;
    }
    const failures = (this.codeFailures.get(key) ?? 0) + 1;
    this.codeFailures.set(key, failures);
    if (failures >= MAX_FAILURES) {
      this.codeFailures.delete(key);
      this.issued.delete(key);
      this.codeLocks.set(address, Date.now() + LOCK_TIME);
      return failWith('code-locked', { seconds: LOCK_TIME / SECOND });
    }
    return failWith('invalid-code');
  }

  /** Seconds left of a lock, 0 when none (an expired lock is forgotten). */
  private remaining(locks: Map<string, number>, key: string): number {
    const until = locks.get(key);
    if (!until) return 0;
    const left = Math.ceil((until - Date.now()) / SECOND);
    if (left <= 0) locks.delete(key);
    return Math.max(left, 0);
  }
}

function failWith(
  code: AuthErrorCode,
  detail: { field?: string; seconds?: number } = {},
): Observable<never> {
  return fail(new AuthError(code, detail.seconds, detail.field));
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}
