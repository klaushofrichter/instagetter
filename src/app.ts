import express, { Express } from 'express';
import { apiRouter } from './routes/api';
import { galleryRouter } from './routes/gallery';
import { healthRouter } from './routes/health';
import { indexRouter } from './routes/index';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1); // behind kourier/traefik — needed for per-IP limits
  app.use(express.json());
  app.use(healthRouter);
  app.use(galleryRouter);
  app.use(apiRouter);
  app.use(indexRouter);
  return app;
}
