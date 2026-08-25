import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireToken } from '../src/middleware/requireToken';

function buildApp(envVarName: string) {
  const app = express();
  app.get('/protected', requireToken(envVarName), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('requireToken', () => {
  it('rejects a malformed Authorization header', async () => {
    process.env.TEST_TOKENS = 'good-token';

    const response = await request(buildApp('TEST_TOKENS'))
      .get('/protected')
      .set('Authorization', 'good-token');

    expect(response.status).toBe(401);
  });

  it('accepts a token matching one entry in a comma-separated list', async () => {
    process.env.TEST_TOKENS = 'token-one, token-two ,token-three';

    const response = await request(buildApp('TEST_TOKENS'))
      .get('/protected')
      .set('Authorization', 'Bearer token-two');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('rejects when the configured env var is empty', async () => {
    process.env.TEST_TOKENS = '';

    const response = await request(buildApp('TEST_TOKENS'))
      .get('/protected')
      .set('Authorization', 'Bearer anything');

    expect(response.status).toBe(401);
  });
});
