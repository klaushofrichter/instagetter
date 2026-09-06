import { Request, Response, NextFunction } from 'express';
import { clientKey } from './clientKey';

export const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_MIN_INTERVAL_MS) || 5000;

const lastByIp = new Map<string, number>();

/** Test isolation. */
export function resetRefreshLimiter(): void {
  lastByIp.clear();
}

/** Exposed so a test can assert the map is actually bounded, not just that
 *  the limiter still answers. */
export function trackedIpCount(): number {
  return lastByIp.size;
}

/**
 * The endpoint is public, so the key space is every IP that ever asks. Without
 * this the map holds one entry per address for the life of the process --
 * archiveRateLimit already prunes for the same reason, and this limiter was
 * simply missed.
 *
 * An entry is only useful until its interval has elapsed; after that the
 * limiter would let the caller through anyway, so it carries no information.
 */
const MAX_TRACKED_IPS = 1000;

function prune(now: number): void {
  for (const [ip, last] of lastByIp) {
    if (now - last >= REFRESH_INTERVAL_MS) lastByIp.delete(ip);
  }
  if (lastByIp.size <= MAX_TRACKED_IPS) return;

  // Age alone does not bound this. Enough distinct addresses inside one
  // interval and nothing is old enough to drop, so the map grows anyway --
  // which is precisely the shape of the flood the cap exists for. Evict the
  // oldest entries until it fits.
  //
  // The trade is deliberate: an evicted caller could refresh again before its
  // interval elapsed. Those are the entries closest to expiring anyway, and a
  // bounded map matters more than perfect enforcement during an event that is
  // already abusive.
  const oldestFirst = [...lastByIp.entries()].sort((a, b) => a[1] - b[1]);
  for (const [ip] of oldestFirst.slice(0, lastByIp.size - MAX_TRACKED_IPS)) {
    lastByIp.delete(ip);
  }
}

/**
 * Server-enforced companion to the disabled-button in the UI: a client that
 * ignores the button state still cannot hammer S3.
 */
// Counts in memory, in this process. That is only authoritative because
// kube-setup's `manifests/insta/insta-ksvc.yaml` pins min-scale/max-scale to
// 1: with more replicas each keeps its own counter and every caller's real
// allowance becomes N x the limit, silently. A shared store is required before
// the replica count goes up. `replicaWarning()` in config.ts logs this at
// startup, since the annotation lives in a different repo from this file.
export function refreshRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = clientKey(req);
  const now = Date.now();
  const previous = lastByIp.get(ip);

  if (previous !== undefined && now - previous < REFRESH_INTERVAL_MS) {
    const retryInMs = REFRESH_INTERVAL_MS - (now - previous);
    res.set('Retry-After', String(Math.ceil(retryInMs / 1000)));
    res.status(429).json({ error: 'too many refreshes', retryInMs });
    return;
  }

  lastByIp.set(ip, now);
  if (lastByIp.size > MAX_TRACKED_IPS) prune(now);
  next();
}
