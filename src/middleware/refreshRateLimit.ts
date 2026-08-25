import { Request, Response, NextFunction } from 'express';

export const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_MIN_INTERVAL_MS) || 5000;

const lastByIp = new Map<string, number>();

/** Test isolation. */
export function resetRefreshLimiter(): void {
  lastByIp.clear();
}

/**
 * Server-enforced companion to the disabled-button in the UI: a client that
 * ignores the button state still cannot hammer S3.
 */
export function refreshRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const previous = lastByIp.get(ip);

  if (previous !== undefined && now - previous < REFRESH_INTERVAL_MS) {
    const retryInMs = REFRESH_INTERVAL_MS - (now - previous);
    res.set('Retry-After', String(Math.ceil(retryInMs / 1000)));
    res.status(429).json({ error: 'too many refreshes', retryInMs });
    return;
  }

  lastByIp.set(ip, now);
  next();
}
