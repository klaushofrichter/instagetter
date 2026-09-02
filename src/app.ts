import express, { Express } from 'express';
import compression from 'compression';
import { apiRouter } from './routes/api';
import { galleryRouter } from './routes/gallery';
import { healthRouter } from './routes/health';
import { indexRouter } from './routes/index';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1); // behind kourier/traefik — needed for per-IP limits
  // The page inlines all of its CSS and JS, so it is ~41KB of highly
  // compressible text; the catalog is JSON. Neither was compressed on the wire
  // before this, and kourier does not do it for us. The default filter skips
  // already-compressed types, so the JPEG routes are untouched.
  app.use(compression());
  app.use(express.json());
  app.use(healthRouter);
  app.use(galleryRouter);
  app.use(apiRouter);
  app.use(indexRouter);
  return app;
}
