import express, { Express } from 'express';
import { apiRouter } from './routes/api';
import { healthRouter } from './routes/health';
import { indexRouter } from './routes/index';

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use(apiRouter);
  app.use(indexRouter);
  return app;
}
