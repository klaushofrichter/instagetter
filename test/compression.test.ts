import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetCache } from '../src/cache';
import { setClient } from '../src/s3';
import { resetRefreshLimiter } from '../src/middleware/refreshRateLimit';
import { installFakeS3, meta } from './fakeS3';

const cacheDir = process.env.CACHE_DIR as string;

describe('response compression', () => {
  beforeEach(async () => {
    resetCache();
    resetRefreshLimiter();
    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.mkdir(cacheDir, { recursive: true });
  });

  afterEach(() => setClient(null));

  // The page is one big inline-CSS/JS string; uncompressed it is ~41KB on the wire.
  it('compresses the HTML page for a client that accepts gzip', async () => {
    const response = await request(createApp()).get('/').set('Accept-Encoding', 'gzip');

    expect(response.headers['content-encoding']).toBe('gzip');
  });

  // compression has a 1KB threshold, so this needs a catalog of realistic size
  // rather than a single slot; production serves ~56KB here.
  it('compresses the image catalog', async () => {
    installFakeS3(
      Array.from({ length: 40 }, (_, i) =>
        meta('slot' + i + '_01', '2026-05-' + String((i % 28) + 1).padStart(2, '0') + 'T00:00:00.000Z'),
      ),
    );
    const app = createApp();
    await request(app).post('/api/refresh');

    const response = await request(app).get('/api/images').set('Accept-Encoding', 'gzip');

    expect(response.headers['content-encoding']).toBe('gzip');
  });

  // JPEG is already compressed; re-compressing burns CPU for nothing.
  it('leaves JPEG bytes alone', async () => {
    installFakeS3([meta('abc_01', '2026-05-01T00:00:00.000Z')]);
    const app = createApp();
    await request(app).post('/api/refresh');

    const response = await request(app).get('/image/abc_01.jpg').set('Accept-Encoding', 'gzip');

    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('still serves a client that does not ask for compression', async () => {
    const response = await request(createApp()).get('/').set('Accept-Encoding', 'identity');

    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.text).toContain('instagetter');
  });
});
