import { Router, Request, Response } from 'express';
import { renderPage } from '../views/page';
import { buildOgTags } from '../views/og';
import { getItems } from '../cache';
import { sortNewestFirst } from '../types';
import { FAVICON_PNG_BASE64 } from '../assets/favicon';

export const indexRouter = Router();

// The site stays out of search results, but link-preview scrapers fetch
// robots.txt before unfurling a pasted URL — without these they would ignore
// the Open Graph tags and show a bare link. They fetch only the URL someone
// pasted, so this is not a crawl.
const PREVIEW_BOTS = [
  'Slackbot-LinkExpanding',
  'Slackbot',
  'Twitterbot',
  'facebookexternalhit',
  'Discordbot',
];

const ROBOTS_TXT =
  PREVIEW_BOTS.map((bot) => `User-agent: ${bot}\nAllow: /\n`).join('\n') +
  '\nUser-agent: *\nDisallow: /\n';

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
