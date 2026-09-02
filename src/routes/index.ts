import { Router, Request, Response } from 'express';
import { renderPage } from '../views/page';
import { buildOgTags } from '../views/og';
import { getItems } from '../cache';
import { sortNewestFirst } from '../types';
import { FAVICON_PNG_BASE64 } from '../assets/favicon';

export const indexRouter = Router();

// The gallery is meant to be findable. It was noindex + Disallow originally;
// that also kept Slack and X from unfurling a pasted link, since both fetch
// robots.txt first.
const ROBOTS_TXT = 'User-agent: *\nAllow: /\n';

indexRouter.get('/robots.txt', (_req: Request, res: Response) => {
  res.status(200).type('text/plain').send(ROBOTS_TXT);
});

indexRouter.get('/favicon.png', (_req: Request, res: Response) => {
  const bytes = Buffer.from(FAVICON_PNG_BASE64, 'base64');
  res.set('Cache-Control', 'public, max-age=86400');
  res.status(200).type('image/png').send(bytes);
});

// Public — no auth, by design.
indexRouter.get('/', (req: Request, res: Response) => {
  // og:image must be absolute. `trust proxy` is set in app.ts, so req.protocol
  // reflects X-Forwarded-Proto from kourier rather than the internal http hop.
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const newest = sortNewestFirst(getItems())[0] ?? null;
  res.status(200).type('html').send(renderPage(buildOgTags(baseUrl, newest)));
});
