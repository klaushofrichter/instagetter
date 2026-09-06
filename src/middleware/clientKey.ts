import { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';

/**
 * The key a hand-rolled limiter should count against.
 *
 * `req.ip` looks like the obvious choice and is subtly wrong for IPv6: a
 * client with a routed prefix owns every address in it, so keying on the exact
 * address lets it take a fresh budget for every request and never be limited.
 * `ipKeyGenerator` normalises to a /64, which is the unit actually assigned to
 * a subscriber.
 *
 * express-rate-limit applies this in its own default keyGenerator, so the
 * limiters built on that package are already covered -- which is exactly why
 * it is easy to miss that the hand-written ones are not.
 */
export function clientKey(req: Request): string {
  const ip = req.ip;
  if (!ip) return 'unknown';
  return ipKeyGenerator(ip);
}
