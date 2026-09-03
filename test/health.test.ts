import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const original = process.env.APP_VERSION;

afterEach(() => {
  if (original === undefined) delete process.env.APP_VERSION;
  else process.env.APP_VERSION = original;
});

describe('GET /health', () => {
  it('returns 200 with a status ok body', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('is public — no Authorization header required', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).not.toBe(401);
  });

  it('reports the stamped version', async () => {
    process.env.APP_VERSION = '2026.09.03.1';

    const response = await request(createApp()).get('/health');

    expect(response.body.version).toBe('2026.09.03.1');
  });

  it('reports the version bare, even if the stamp carries a leading v', async () => {
    // Images built before the deploy dropped the "v" from the build-arg still
    // exist; they must not report a value the smoke test cannot match.
    process.env.APP_VERSION = 'v2026.09.03.1';

    const response = await request(createApp()).get('/health');

    expect(response.body.version).toBe('2026.09.03.1');
  });

  it('reports dev when nothing stamped the build', async () => {
    delete process.env.APP_VERSION;

    const response = await request(createApp()).get('/health');

    expect(response.body.version).toBe('dev');
  });

  it('exposes version where the deploy smoke test looks for it', async () => {
    // The deploy has no jq, so it pulls the value out of the raw body with a
    // sed expression. This mirrors that expression: if the field stops being
    // top-level, the deploy stops being able to tell revisions apart, and it
    // would fail in the cluster rather than here.
    process.env.APP_VERSION = '2026.09.03.1';

    const response = await request(createApp()).get('/health');

    const served = /"version"\s*:\s*"([^"]*)"/.exec(response.text)?.[1];
    expect(served).toBe('2026.09.03.1');
  });
});
