import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetRefreshLimiter } from '../src/middleware/refreshRateLimit';
import { resetArchiveLimiter } from '../src/middleware/archiveRateLimit';
import { installFakeS3, meta } from './fakeS3';
import { refresh, resetCache } from '../src/cache';

// Two addresses inside one routed /64. A subscriber owns every address in its
// prefix, so if the limiter keys on the exact address these count separately
// and the budget is unlimited in practice.
const SAME_PREFIX_A = '2001:db8:1234:5678::1';
const SAME_PREFIX_B = '2001:db8:1234:5678::dead:beef';
const OTHER_PREFIX = '2001:db8:9999:0000::1';

const CLUSTER_HOPS = '10.42.0.5, 10.42.0.15';

beforeEach(() => {
  resetRefreshLimiter();
  resetArchiveLimiter();
  resetCache();
  // POST /api/refresh reaches S3; without a fake it 502s and the status
  // assertions below would be testing the wrong thing entirely.
  installFakeS3([meta('new_1', '2026-01-05T00:00:00.000Z')]);
});

afterEach(() => {
  resetRefreshLimiter();
  resetArchiveLimiter();
});

function post(app: ReturnType<typeof createApp>, client: string) {
  return app
    ? request(app).post('/api/refresh').set('X-Forwarded-For', `${client}, ${CLUSTER_HOPS}`)
    : null;
}

describe('IPv6 clients cannot walk their prefix for a fresh budget', () => {
  it('counts two addresses in one /64 as the same caller (refresh)', async () => {
    const app = createApp();

    const first = await post(app, SAME_PREFIX_A);
    const second = await post(app, SAME_PREFIX_B);

    expect(first!.status).toBe(200);
    // Same /64, so the 5s interval applies: the second is refused.
    expect(second!.status).toBe(429);
  });

  it('still separates genuinely different prefixes (refresh)', async () => {
    const app = createApp();

    const first = await post(app, SAME_PREFIX_A);
    const other = await post(app, OTHER_PREFIX);

    expect(first!.status).toBe(200);
    expect(other!.status).toBe(200);
  });

  it('counts two addresses in one /64 as the same caller (archive images)', async () => {
    process.env.ARCHIVE_RATE_LIMIT = '2';
    resetCache();
    installFakeS3([
      meta('new_1', '2026-01-05T00:00:00.000Z'),
      meta('old_1', '2026-01-01T00:00:00.000Z'),
    ]);
    process.env.CACHE_LIMIT = '1';
    const app = createApp();
    await refresh();

    const get = (client: string) =>
      request(app)
        .get('/image/old_1.jpg')
        .set('X-Forwarded-For', `${client}, ${CLUSTER_HOPS}`);

    await get(SAME_PREFIX_A);
    await get(SAME_PREFIX_A);
    const third = await get(SAME_PREFIX_B);

    // Budget of 2 already spent by the same /64, so switching address within
    // the prefix must not buy a third.
    expect(third.status).toBe(429);

    delete process.env.ARCHIVE_RATE_LIMIT;
    delete process.env.CACHE_LIMIT;
  });
});

describe('the refresh limiter does not grow without bound', () => {
  it('prunes entries whose interval has elapsed', async () => {
    // Entries past their interval carry no information: the limiter would let
    // that caller through anyway. Without pruning, the map holds one entry per
    // address for the life of the process, on a public endpoint whose key
    // space is every IP that ever asks.
    process.env.REFRESH_MIN_INTERVAL_MS = '1';
    const { refreshRateLimit, trackedIpCount, resetRefreshLimiter: reset } = await import(
      '../src/middleware/refreshRateLimit'
    );
    reset();

    const call = (ip: string): void => {
      const req = { ip } as never;
      const res = { set: () => undefined, status: () => ({ json: () => undefined }) } as never;
      refreshRateLimit(req, res, () => undefined);
    };

    // Must exceed MAX_TRACKED_IPS in DISTINCT addresses, or the map never
    // reaches the threshold and the test passes whether or not pruning works.
    // (It did exactly that on the first attempt: 400 distinct IPs, no growth,
    // green with the prune deleted.)
    const distinct = 2500;
    for (let i = 0; i < distinct; i++) {
      call(`203.0.113.${Math.floor(i / 250)}.${i % 250}`);
    }

    // The assertion that matters: bounded, not merely "still responds".
    expect(trackedIpCount()).toBeLessThanOrEqual(1001);

    delete process.env.REFRESH_MIN_INTERVAL_MS;
    reset();
  });
});

describe('the archive limiter does not grow without bound either', () => {
  it('bounds the map under a flood of distinct addresses', async () => {
    // Same defect, same shape: pruning by window alone cannot bound the map
    // when the addresses arrive faster than they age out.
    process.env.ARCHIVE_RATE_WINDOW_MS = '60000';
    const { archiveRateLimit, trackedIpCount, resetArchiveLimiter: reset } = await import(
      '../src/middleware/archiveRateLimit'
    );
    reset();

    const call = (ip: string): void => {
      const req = { ip, params: { id: 'not-local' } } as never;
      const res = { set: () => undefined, status: () => ({ json: () => undefined }) } as never;
      archiveRateLimit(req, res, () => undefined);
    };

    for (let i = 0; i < 2500; i++) call(`203.0.113.${Math.floor(i / 250)}.${i % 250}`);

    expect(trackedIpCount()).toBeLessThanOrEqual(1001);

    delete process.env.ARCHIVE_RATE_WINDOW_MS;
    reset();
  });
});
