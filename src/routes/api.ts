import { Router, Request, Response } from 'express';
import { requireToken } from '../middleware/requireToken';
import { createAuthRateLimit } from '../middleware/authRateLimit';

export const apiRouter = Router();

const apiRateLimit = createAuthRateLimit();
const requireApiToken = requireToken('INSTA_API_TOKENS');

// Placeholder endpoint. The real API surface is designed later; this exists so
// the token gate is wired, tested, and deployable from day one.
apiRouter.get('/api/status', apiRateLimit, requireApiToken, (_req: Request, res: Response) => {
  res.status(200).json({ service: 'instagetter', authenticated: true });
});
