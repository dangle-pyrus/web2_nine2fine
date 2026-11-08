import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { apiConfig } from './app/core/api-config';

// DEMO SEED (remove with src/mocks/demo-seed/): loaded only when cart/catalog run on mocks, before
// bootstrap so `CartState`/`WishlistState` read the seeded values. Kept out of the initial chunk.
const seeded =
  apiConfig.checkoutMode === 'mock' && apiConfig.catalogMode === 'mock'
    ? import('./mocks/demo-seed').then(({ seedDemoBrowserState }) => seedDemoBrowserState())
    : Promise.resolve();

seeded.then(() => bootstrapApplication(App, appConfig)).catch((error) => console.error(error));
