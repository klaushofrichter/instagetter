import { Router, Request, Response } from 'express';
import { renderPage } from '../views/page';

export const indexRouter = Router();

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="2" y="2" width="60" height="60" rx="16" fill="#c13584"/>
  <rect x="14" y="14" width="36" height="36" rx="11" fill="none" stroke="#ffffff" stroke-width="4"/>
  <circle cx="32" cy="32" r="9" fill="none" stroke="#ffffff" stroke-width="4"/>
  <circle cx="43.5" cy="20.5" r="3" fill="#ffffff"/>
</svg>
`;

// Public, but deliberately not fed to search engines.
indexRouter.get('/robots.txt', (_req: Request, res: Response) => {
  res.status(200).type('text/plain').send('User-agent: *\nDisallow: /\n');
});

indexRouter.get('/favicon.svg', (_req: Request, res: Response) => {
  res.status(200).type('image/svg+xml').send(FAVICON_SVG);
});

// Public — no auth, by design.
indexRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).type('html').send(renderPage());
});
