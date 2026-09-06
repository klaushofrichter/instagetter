import { Router, Request, Response } from 'express';
import { requireToken } from '../middleware/requireToken';
import { createAuthRateLimit } from '../middleware/authRateLimit';

export const apiRouter = Router();

const apiRateLimit = createAuthRateLimit();
const requireApiToken = requireToken('INSTA_API_TOKENS');

// Placeholder endpoint. The real API surface is designed later; this exists so
// the token gate is wired, tested, and deployable from day one.
apiRouter.get('/api/status', apiRateLimit, requireApiToken, (req: Request, res: Response) => {
  // clientIp is the resolved caller address, after express has walked
  // X-Forwarded-For past the trusted in-cluster hops. It is reported because
  // the per-IP limits are only as good as this value and there is otherwise no
  // way to tell a correct one from a wrong one: an in-cluster address here
  // (10.42.x, 10.43.x) means every caller is sharing one bucket. Token-gated,
  // so it tells an anonymous visitor nothing, and it only ever echoes the
  // caller's own address back to it.
  res.status(200).json({
    service: 'instagetter',
    authenticated: true,
    clientIp: req.ip,
  });
});
