import { Request, Response, NextFunction } from 'express';
import { isLocalImage } from '../cache';

/** Read per call so the budget is configurable at runtime and testable. */
export function archiveWindowMs(): number {
  return Number(process.env.ARCHIVE_RATE_WINDOW_MS) || 60 * 1000;
}

export function archiveLimit(): number {
  return Number(process.env.ARCHIVE_RATE_LIMIT) || 120;
}

const hitsByIp = new Map<string, number[]>();

/** Test isolation. */
export function resetArchiveLimiter(): void {
  hitsByIp.clear();
}

/**
 * The endpoint is public, so the key space is every IP that ever asks. Drop
 * entries whose hits have all aged out, rather than letting the map grow for
 * the life of the process.
 */
function prune(now: number, windowMs: number): void {
  for (const [ip, hits] of hitsByIp) {
    if (hits.length === 0 || now - hits[hits.length - 1] >= windowMs) {
      hitsByIp.delete(ip);
    }
  }
}

/**
 * Rate limit only the full images that are *not* on local disk.
 *
 * browseRateLimit is deliberately generous (600/min) because a grid page pulls
 * nine thumbnails, and thumbnails are all local. That budget is far too loose
 * once a request can reach S3: 600 archive images a minute is ~196MB/min of
 * egress per IP. Limiting the whole route instead would throttle ordinary
 * viewing of cached images, which costs nothing to serve.
 *
 * The disk check is synchronous (isLocalImage) precisely so the decision can be
 * made here rather than in the handler. A cached image is not counted at all,
 * so paging through the newest 99 is unaffected no matter how fast.
 *
 * The default of 120/min sits above realistic browsing -- the client's own
 * 334ms step floor caps a held arrow key near 180/min -- while bounding S3
 * egress to roughly 39MB/min per IP.
 */
export function archiveRateLimit(req: Request, res: Response, next: NextFunction): void {
  const id = req.params.id;
  if (!id || isLocalImage(id)) {
    next();
    return;
  }

  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const windowMs = archiveWindowMs();
  const recent = (hitsByIp.get(ip) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= archiveLimit()) {
    const retryInMs = windowMs - (now - recent[0]);
    hitsByIp.set(ip, recent);
    res.set('Retry-After', String(Math.ceil(retryInMs / 1000)));
    res.status(429).json({ error: 'too many archive images', retryInMs });
    return;
  }

  recent.push(now);
  hitsByIp.set(ip, recent);
  if (hitsByIp.size > 1000) prune(now, windowMs);
  next();
}
