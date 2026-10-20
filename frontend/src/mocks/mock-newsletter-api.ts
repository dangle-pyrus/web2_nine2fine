import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { NewsletterApi } from '../app/features/home/newsletter-api';
import { respond } from './mock-latency';

/** Accepts every valid email; nothing is stored or sent in mock mode. */
@Injectable({ providedIn: 'root' })
export class MockNewsletterApi implements NewsletterApi {
  subscribe(): Observable<void> {
    return respond(undefined);
  }
}
