import { Router, Request, Response } from 'express';
import { appVersion } from '../config';

export const healthRouter = Router();

// Deliberately dependency-free: this is the Knative readiness probe, so it
// must not touch S3 or the cache. The version is read from the environment,
// which is what lets the deploy's smoke test tell a new revision from the
// previous one still answering through the ingress.
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', version: appVersion() });
});
