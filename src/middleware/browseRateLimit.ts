import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Generous by design: one grid page can pull nine thumbnails, so the browsing
 * limit only exists to stop abuse, not to pace normal viewing.
 */
export function createBrowseRateLimit(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.BROWSE_RATE_LIMIT) || 600,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
