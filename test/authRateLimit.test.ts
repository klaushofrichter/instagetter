import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const VALID = 'valid-token-aaaaaaaaaaaaaaaaaaaa';
const OTHER = 'other-token-bbbbbbbbbbbbbbbbbbbb';

// Every request in a test file shares one limiter instance per app, so each
// test builds its own app to start from a clean budget.
function app() {
  return createApp();
}

function remaining(res: { headers: Record<string, string> }): number {
  return Number(res.headers['ratelimit-remaining']);
}

const originalTokens = process.env.INSTA_API_TOKENS;

beforeEach(() => {
  process.env.INSTA_API_TOKENS = `${VALID},${OTHER}`;
});

afterEach(() => {
  if (originalTokens === undefined) delete process.env.INSTA_API_TOKENS;
  else process.env.INSTA_API_TOKENS = originalTokens;
});

describe('API rate limiting', () => {
  it('does not let unauthenticated traffic spend an authenticated budget', async () => {
    // The reported bug: one continuous count across both, so anonymous
    // requests drained the budget of a caller who had proved who it was.
    const a = app();

    const first = await request(a).get('/api/status').set('Authorization', `Bearer ${VALID}`);
    const afterAuth = remaining(first);

    await request(a).get('/api/status');
    await request(a).get('/api/status');

    const second = await request(a).get('/api/status').set('Authorization', `Bearer ${VALID}`);

    expect(second.status).toBe(200);
    expect(remaining(second)).toBe(afterAuth - 1);
  });

  it('gives two different valid tokens separate budgets', async () => {
    const a = app();

    await request(a).get('/api/status').set('Authorization', `Bearer ${VALID}`);
    await request(a).get('/api/status').set('Authorization', `Bearer ${VALID}`);
    const other = await request(a).get('/api/status').set('Authorization', `Bearer ${OTHER}`);

    expect(other.status).toBe(200);
    expect(remaining(other)).toBe(29);
  });

  it('makes every invalid token share one bucket, not get a fresh one', async () => {
    // The trap called out in the issue, and the reason the key must be the
    // token only AFTER it validates: keying on the raw Bearer value would let
    // an attacker vary the header per request and never be limited at all.
    const a = app();

    const first = await request(a).get('/api/status').set('Authorization', 'Bearer invented-1');
    const second = await request(a).get('/api/status').set('Authorization', 'Bearer invented-2');
    const third = await request(a).get('/api/status').set('Authorization', 'Bearer invented-3');

    expect(first.status).toBe(401);
    expect(remaining(second)).toBe(remaining(first) - 1);
    expect(remaining(third)).toBe(remaining(first) - 2);
  });

  it('puts an invalid token in the same bucket as no token at all', async () => {
    const a = app();

    const anonymous = await request(a).get('/api/status');
    const bogus = await request(a).get('/api/status').set('Authorization', 'Bearer nope');

    expect(remaining(bogus)).toBe(remaining(anonymous) - 1);
  });

  it('eventually 429s an attacker rotating the token on every request', async () => {
    const a = app();

    let last = 200;
    for (let i = 0; i < 31; i++) {
      const res = await request(a).get('/api/status').set('Authorization', `Bearer bogus-${i}`);
      last = res.status;
    }

    // 401 while budget remains, 429 once it is spent — never an endless 401.
    expect(last).toBe(429);
  });

  it('still serves a valid token after an attacker has burned the IP bucket', async () => {
    // The point of separating the buckets: abuse from an address must not
    // lock out a caller holding a real credential.
    const a = app();

    for (let i = 0; i < 31; i++) {
      await request(a).get('/api/status').set('Authorization', `Bearer bogus-${i}`);
    }

    const authed = await request(a).get('/api/status').set('Authorization', `Bearer ${VALID}`);

    expect(authed.status).toBe(200);
  });
});
