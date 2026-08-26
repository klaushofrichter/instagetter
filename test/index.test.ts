import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

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
