import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

function getValidTokens(envVarName: string): string[] {
  return (process.env[envVarName] ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function tokensMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** The Bearer value, or undefined when the header is missing or malformed. */
export function bearerToken(req: Request): string | undefined {
  return req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
}

/**
 * Whether a presented token is one of the configured ones.
 *
 * Exported so the rate limiter can key on a caller's identity using exactly
 * the same check as the gate. If these two ever diverge, the limiter starts
 * handing a private bucket to a token the gate rejects -- which is the whole
 * failure this is meant to avoid.
 */
export function isValidToken(envVarName: string, presented: string | undefined): boolean {
  return (
    typeof presented === 'string' &&
    getValidTokens(envVarName).some((validToken) => tokensMatch(presented, validToken))
  );
}

export function requireToken(envVarName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isValidToken(envVarName, bearerToken(req))) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    next();
  };
}
