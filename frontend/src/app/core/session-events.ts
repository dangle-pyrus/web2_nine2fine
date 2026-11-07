import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Raised by the HTTP interceptor when the backend rejects a request because the session is gone
 * (BR-AUTH-26). `AuthSession` and `AdminSession` listen and react for their own audience.
 */
@Injectable({ providedIn: 'root' })
export class SessionEvents {
  readonly expired = new Subject<'storefront' | 'admin'>();
}
