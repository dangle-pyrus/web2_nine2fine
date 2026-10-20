import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { seedDemoBrowserState } from './mocks/demo-seed'; // DEMO SEED (remove with src/mocks/demo-seed/)

seedDemoBrowserState(); // DEMO SEED (remove with src/mocks/demo-seed/)

bootstrapApplication(App, appConfig).catch((error) => console.error(error));
