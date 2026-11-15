import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { BUILD_STAMP } from './build-info';

// Always says which version is running: stale service-worker caches have fooled us before.
console.info(`PileScan build ${BUILD_STAMP}`);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
