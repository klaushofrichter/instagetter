import express, { Express } from 'express';
import compression from 'compression';
import { apiRouter } from './routes/api';
import { galleryRouter } from './routes/gallery';
import { healthRouter } from './routes/health';
import { indexRouter } from './routes/index';
import { trustedProxies } from './config';

export function createApp(): Express {
  const app = express();
  // Trust by CIDR, not by hop count. The ingress path is
  // traefik -> kourier/envoy -> queue-proxy -> app, which is more than the one
  // hop this used to claim, so express stopped walking X-Forwarded-For early
  // and returned an in-cluster address: every caller then shared a single
  // rate-limit bucket. A number is only ever right for today's topology and
  // fails silently when a hop is added or removed -- it still returns *an*
  // address, just the wrong one. A CIDR list walks past anything in-cluster
  // and lands on the first address that is not, whatever the hop count.
  //
  // Deliberately the k3s pod/service ranges rather than express's
  // `uniquelocal` shorthand: that trusts all of RFC1918, which includes the
  // house LAN, and a trusted hop's X-Forwarded-For is taken at face value. A
  // LAN client would then be able to forge its own apparent address. Narrow
  // ranges mean only the cluster's own hops are believed.
  app.set('trust proxy', trustedProxies());
  // The page inlines all of its CSS and JS, so it is ~41KB of highly
  // compressible text; the catalog is JSON. Neither was compressed on the wire
  // before this, and kourier does not do it for us. The default filter skips
  // already-compressed types, so the JPEG routes are untouched.
  app.use(compression());
  app.use(express.json());
  app.use(healthRouter);
  app.use(galleryRouter);
  app.use(apiRouter);
  app.use(indexRouter);
  return app;
}
