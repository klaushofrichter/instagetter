import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetCache } from '../src/cache';
import { setClient } from '../src/s3';
import { resetRefreshLimiter } from '../src/middleware/refreshRateLimit';
import { installFakeS3, meta } from './fakeS3';

const cacheDir = process.env.CACHE_DIR as string;

describe('GET /', () => {
  it('serves the public HTML page without a token', async () => {
    const response = await request(createApp()).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.text).toContain('instagetter');
  });
});

describe('GET /favicon.png', () => {
  it('serves the skylar.technology logo as a PNG', async () => {
    const response = await request(createApp()).get('/favicon.png');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/image\/png/);
    // PNG magic number, so a corrupt base64 blob fails loudly.
    expect(response.body.subarray(1, 4).toString()).toBe('PNG');
  });
});

describe('GET /robots.txt', () => {
  it('still blocks every crawler by default', async () => {
    const response = await request(createApp()).get('/robots.txt');

    expect(response.status).toBe(200);
    expect(response.text).toContain('User-agent: *\nDisallow: /');
  });

  // Without these the Open Graph tags are dead weight in Slack and X, which
  // fetch robots.txt before unfurling a pasted link.
  it('lets the link-preview scrapers through', async () => {
    const response = await request(createApp()).get('/robots.txt');

    for (const bot of ['Slackbot-LinkExpanding', 'Slackbot', 'Twitterbot', 'facebookexternalhit', 'Discordbot']) {
      expect(response.text).toContain(`User-agent: ${bot}\nAllow: /`);
    }
  });
});

describe('build version', () => {
  const original = process.env.APP_VERSION;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = original;
  });

  it('shows the version stamped in at build time', async () => {
    process.env.APP_VERSION = 'v2026.01.02.3';
    const response = await request(createApp()).get('/');

    expect(response.text).toContain('version v2026.01.02.3');
  });

  it('falls back to dev when nothing was stamped in', async () => {
    delete process.env.APP_VERSION;
    const response = await request(createApp()).get('/');

    expect(response.text).toContain('version dev');
  });
});

describe('Open Graph tags on /', () => {
  beforeEach(async () => {
    resetCache();
    resetRefreshLimiter();
    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.mkdir(cacheDir, { recursive: true });
  });

  afterEach(() => setClient(null));

  async function seed(): Promise<ReturnType<typeof createApp>> {
    installFakeS3([
      meta('older_01', '2026-05-01T00:00:00.000Z'),
      meta('newest_01', '2026-06-01T00:00:00.000Z', { caption: 'A lake at dawn' }),
    ]);
    const app = createApp();
    await request(app).post('/api/refresh');
    return app;
  }

  it('advertises the newest cached image as the preview', async () => {
    const app = await seed();

    const response = await request(app).get('/');

    expect(response.text).toContain('/image/newest_01.jpg');
    expect(response.text).toContain('<meta property="og:image:alt" content="A lake at dawn">');
  });

  it('builds an absolute https URL from the proxy headers', async () => {
    const app = await seed();

    const response = await request(app).get('/').set('X-Forwarded-Proto', 'https');

    expect(response.text).toMatch(
      /<meta property="og:image" content="https:\/\/127\.0\.0\.1:\d+\/image\/newest_01\.jpg">/,
    );
  });

  it('serves a text-only card before the first refresh', async () => {
    const response = await request(createApp()).get('/');

    expect(response.text).not.toContain('og:image');
    expect(response.text).toContain('<meta name="twitter:card" content="summary">');
  });
});
