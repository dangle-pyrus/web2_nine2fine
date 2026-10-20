import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AuthApi,
  AuthError,
  AuthUser,
  CodeDispatch,
  EmailLookup,
  RegisterRequest,
  ResetPasswordRequest,
  VerificationPurpose,
} from '../app/features/auth/data-access/auth-api';
import { DEMO_VERIFICATION_CODE, MockAccount } from './accounts';
import { MockAccountStore } from './mock-account-store';
import { fail, respond } from './mock-latency';

const RESEND_AFTER_SECONDS = 30;

@Injectable({ providedIn: 'root' })
export class MockAuthApi implements AuthApi {
  private readonly accounts = inject(MockAccountStore).accounts;

  lookupEmail(email: string): Observable<EmailLookup> {
    return respond({ registered: this.accounts.has(normalize(email)) });
  }
  requestCode(email: string, purpose: VerificationPurpose): Observable<CodeDispatch> {
    const registered = this.accounts.has(normalize(email));
    if (purpose === 'register' && registered) return fail(new AuthError('email-registered'));
    if (purpose !== 'register' && !registered) return fail(new AuthError('email-not-registered'));
    return respond({ resendAfterSeconds: RESEND_AFTER_SECONDS });
  }
  loginWithCode(email: string, code: string): Observable<AuthUser> {
    const account = this.accounts.get(normalize(email));
    if (!account) return fail(new AuthError('email-not-registered'));
    if (code !== DEMO_VERIFICATION_CODE) return fail(new AuthError('invalid-code'));
    return respond(toUser(account));
  }
  loginWithPassword(email: string, password: string): Observable<AuthUser> {
    const account = this.accounts.get(normalize(email));
    if (!account?.password || account.password !== password) {
      return fail(new AuthError('invalid-credentials'));
    }
    return respond(toUser(account));
  }
  register(request: RegisterRequest): Observable<AuthUser> {
    const email = normalize(request.email);
    if (this.accounts.has(email)) return fail(new AuthError('email-registered'));
    if (request.code !== DEMO_VERIFICATION_CODE) return fail(new AuthError('invalid-code'));
    const account: MockAccount = {
      id: `member-${this.accounts.size + 1}`,
      email,
      firstName: request.firstName.trim(),
      lastName: request.lastName.trim(),
      password: null,
      birthDate: request.birthDate,
      phone: null,
    };
    this.accounts.set(email, account);
    return respond(toUser(account));
  }
  resetPassword(request: ResetPasswordRequest): Observable<void> {
    const account = this.accounts.get(normalize(request.email));
    if (!account) return fail(new AuthError('email-not-registered'));
    if (request.code !== DEMO_VERIFICATION_CODE) return fail(new AuthError('invalid-code'));
    account.password = request.newPassword;
    return respond(undefined);
  }
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function toUser({ id, email, firstName, lastName }: MockAccount): AuthUser {
  return { id, email, firstName, lastName };
}
