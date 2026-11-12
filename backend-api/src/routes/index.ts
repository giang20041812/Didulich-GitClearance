import type { Express } from 'express';
import { adminRouter } from './admin.js';
import { authRouter } from './auth.js';
import { exploreRouter } from './explore.js';
import { healthRouter } from './health.js';
import { comboRouter } from './combo.js';
import { cronRouter } from './internalCron.js';
import { partnerRouter, providerApplicationRouter } from './partner.js';
import { journeyRouter } from './publicJourney.js';
import { publicCatalogRouter } from './publicCatalog.js';
import { bookingRouter, stayRouter } from './publicBooking.js';
import { sepayRouter } from './sepayWebhook.js';
import { travelerRouter } from './traveler.js';

/** Gắn mọi router của API. Mỗi router gắn kèm "phong cách" lỗi của nhóm route (xem lib/errorHandler.ts). */
export function mountRoutes(app: Express): void {
  app.use(healthRouter);
  app.use(cronRouter);
  app.use('/api/v1/auth', authRouter);
  app.use(providerApplicationRouter);
  app.use(publicCatalogRouter);
  app.use(journeyRouter);
  app.use(bookingRouter);
  app.use(travelerRouter);
  app.use(partnerRouter);
  app.use(adminRouter);
  app.use(exploreRouter);
  app.use(comboRouter);
  app.use(stayRouter);
  app.use(sepayRouter);
}
