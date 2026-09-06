import { Request } from 'express';
import rateLimit, { ipKeyGenerator, RateLimitRequestHandler } from 'express-rate-limit';
import { createHash } from 'crypto';
import { bearerToken, isValidToken } from './requireToken';

/**
 * Rate limit for the token-gated API.
 *
 * Keyed on the caller's token once it has validated, falling back to the IP
 * for everything else. Two properties matter, and the second is the one that
 * is easy to get wrong:
 *
 *  - An authenticated caller gets its own budget, rather than sharing one with
 *    every anonymous request arriving from the same address. Behind NAT, and
 *    behind this cluster's ingress in particular, that address is shared by
 *    callers who have nothing to do with each other.
 *
 *  - The key is the token ONLY AFTER it validates. Keying on the raw Bearer
 *    value would hand every invented string a fresh budget, so an attacker
 *    varying the header per request would never be limited at all -- the
 *    limiter would switch itself off for exactly the traffic it exists to
 *    stop. Invalid and absent tokens therefore share the IP bucket.
 *
 * The token is hashed so the raw credential never becomes an in-memory key or
 * turns up in diagnostics that print one.
 */
// Counts in memory, in this process. That is only authoritative because
// kube-setup's `manifests/insta/insta-ksvc.yaml` pins min-scale/max-scale to
// 1: with more replicas each keeps its own counter and every caller's real
// allowance becomes N x the limit, silently. A shared store is required before
// the replica count goes up. `replicaWarning()` in config.ts logs this at
// startup, since the annotation lives in a different repo from this file.
export function createAuthRateLimit(envVarName = 'INSTA_API_TOKENS'): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request): string => {
      const presented = bearerToken(req);
      if (isValidToken(envVarName, presented)) {
        return `t:${createHash('sha256').update(presented as string).digest('hex').slice(0, 16)}`;
      }
      // ipKeyGenerator rather than req.ip directly: it normalises IPv6 to a
      // /64, so a client with a routed prefix cannot walk addresses to get a
      // fresh budget for every request.
      return `ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
  });
}
