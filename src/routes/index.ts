import { Router, Request, Response } from 'express';
import { renderPage } from '../views/page';
import { FAVICON_PNG_BASE64 } from '../assets/favicon';

export const indexRouter = Router();

indexRouter.get('/robots.txt', (_req: Request, res: Response) => {
  res.status(200).type('text/plain').send('User-agent: *\nDisallow: /\n');
});

indexRouter.get('/favicon.png', (_req: Request, res: Response) => {
  const bytes = Buffer.from(FAVICON_PNG_BASE64, 'base64');
  res.set('Cache-Control', 'public, max-age=86400');
  res.status(200).type('image/png').send(bytes);
});

// Public — no auth, by design.
indexRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).type('html').send(renderPage());
});
