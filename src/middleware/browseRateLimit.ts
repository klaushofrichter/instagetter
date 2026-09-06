import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Generous by design: one grid page can pull nine thumbnails, so the browsing
 * limit only exists to stop abuse, not to pace normal viewing.
 */
// Counts in memory, in this process. That is only authoritative because
// kube-setup's `manifests/insta/insta-ksvc.yaml` pins min-scale/max-scale to
// 1: with more replicas each keeps its own counter and every caller's real
// allowance becomes N x the limit, silently. A shared store is required before
// the replica count goes up. `replicaWarning()` in config.ts logs this at
// startup, since the annotation lives in a different repo from this file.
export function createBrowseRateLimit(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.BROWSE_RATE_LIMIT) || 600,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
