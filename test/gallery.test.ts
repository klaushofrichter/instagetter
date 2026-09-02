import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetCache } from '../src/cache';
import { setClient } from '../src/s3';
import { resetRefreshLimiter } from '../src/middleware/refreshRateLimit';
import { resetArchiveLimiter } from '../src/middleware/archiveRateLimit';
import { installFakeS3, meta } from './fakeS3';

const cacheDir = process.env.CACHE_DIR as string;

beforeEach(async () => {
  resetCache();
  resetRefreshLimiter();
  resetArchiveLimiter();
  await fs.rm(cacheDir, { recursive: true, force: true });
  await fs.mkdir(cacheDir, { recursive: true });
});

afterEach(() => setClient(null));

describe('GET /api/images', () => {
  it('is public and starts empty', async () => {
    const response = await request(createApp()).get('/api/images');

    expect(response.status).toBe(200);
    expect(response.body.images).toEqual([]);
    expect(response.body.limit).toBe(99);
    expect(response.body.progress).toEqual({ loading: false, done: 0, total: 0 });
  });
});

describe('POST /api/refresh', () => {
  it('pulls the index and returns the images', async () => {
    installFakeS3([meta('abc_1', '2026-05-01T00:00:00.000Z')]);

    const response = await request(createApp()).post('/api/refresh');

    expect(response.status).toBe(200);
    expect(response.body.added).toBe(1);
    expect(response.body.images.map((m: { id: string }) => m.id)).toEqual(['abc_1']);
  });

  it('rate limits a second refresh from the same client', async () => {
    installFakeS3([meta('abc_1', '2026-05-01T00:00:00.000Z')]);
    const app = createApp();

    const first = await request(app).post('/api/refresh');
    const second = await request(app).post('/api/refresh');

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
    expect(second.body.retryInMs).toBeGreaterThan(0);
  });

  it('reports a 502 when S3 is unreachable rather than crashing', async () => {
    setClient({
      send: async () => {
        throw new Error('network down');
      },
    } as never);

    const response = await request(createApp()).post('/api/refresh');

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('refresh failed');
  });
});

describe('image serving', () => {
  it('serves a cached thumbnail and full image as JPEG', async () => {
    installFakeS3([meta('abc_1', '2026-05-01T00:00:00.000Z')]);
    const app = createApp();
    await request(app).post('/api/refresh');

    const thumb = await request(app).get('/thumb/abc_1.jpg');
    const full = await request(app).get('/image/abc_1.jpg');

    expect(thumb.status).toBe(200);
    expect(thumb.headers['content-type']).toMatch(/image\/jpeg/);
    expect(full.status).toBe(200);
  });

  it('offers the full image as an attachment for download', async () => {
    installFakeS3([meta('abc_1', '2026-05-01T00:00:00.000Z')]);
    const app = createApp();
    await request(app).post('/api/refresh');

    const response = await request(app).get('/download/abc_1.jpg');

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('instagram_abc_1.jpg');
  });

  it('404s an id that is not cached', async () => {
    const response = await request(createApp()).get('/thumb/missing_1.jpg');

    expect(response.status).toBe(404);
  });

  it('rejects an id with path traversal characters', async () => {
    const response = await request(createApp()).get('/thumb/..%2F..%2Fetc%2Fpasswd.jpg');

    expect([400, 404]).toContain(response.status);
  });
});

describe('archive rate limiting', () => {
  const threeSlots = () => [
    meta('new_1', '2026-03-01T00:00:00.000Z'),
    meta('mid_1', '2026-02-01T00:00:00.000Z'),
    meta('old_1', '2026-01-01T00:00:00.000Z'),
  ];

  const withEnv = async (vars: Record<string, string>, run: () => Promise<void>) => {
    const originals = Object.entries(vars).map(([k]) => [k, process.env[k]] as const);
    Object.entries(vars).forEach(([k, v]) => (process.env[k] = v));
    try {
      await run();
    } finally {
      for (const [k, v] of originals) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it('does not count images served from local disk', async () => {
    await withEnv({ CACHE_LIMIT: '2', ARCHIVE_RATE_LIMIT: '3' }, async () => {
      installFakeS3(threeSlots());
      const app = createApp();
      await request(app).post('/api/refresh');

      // Well past the archive budget, but all of these are cached, so the
      // limiter must not count them at all.
      for (let i = 0; i < 10; i += 1) {
        expect((await request(app).get('/image/new_1.jpg')).status).toBe(200);
      }
    });
  });

  it('serves an evicted image from S3, then 429s once the budget is spent', async () => {
    await withEnv({ CACHE_LIMIT: '2', ARCHIVE_RATE_LIMIT: '3' }, async () => {
      installFakeS3(threeSlots());
      const app = createApp();
      await request(app).post('/api/refresh');

      // old_1 was evicted, so each request is the S3 path.
      for (let i = 0; i < 3; i += 1) {
        const ok = await request(app).get('/image/old_1.jpg');
        expect(ok.status).toBe(200);
        expect(ok.headers['content-type']).toContain('image/jpeg');
      }

      const blocked = await request(app).get('/image/old_1.jpg');
      expect(blocked.status).toBe(429);
      expect(blocked.body.error).toBe('too many archive images');
      expect(blocked.headers['retry-after']).toBeDefined();

      // A cached image is still served while the archive budget is exhausted.
      expect((await request(app).get('/image/new_1.jpg')).status).toBe(200);
    });
  });

  it('applies the same budget to downloads', async () => {
    await withEnv({ CACHE_LIMIT: '2', ARCHIVE_RATE_LIMIT: '1' }, async () => {
      installFakeS3(threeSlots());
      const app = createApp();
      await request(app).post('/api/refresh');

      expect((await request(app).get('/download/old_1.jpg')).status).toBe(200);
      expect((await request(app).get('/download/old_1.jpg')).status).toBe(429);
    });
  });
});
