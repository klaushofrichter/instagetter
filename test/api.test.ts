import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/status', () => {
  it('rejects a request with no Authorization header', async () => {
    const response = await request(createApp()).get('/api/status');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'unauthorized' });
  });

  it('rejects a wrong token', async () => {
    const response = await request(createApp())
      .get('/api/status')
      .set('Authorization', 'Bearer wrong-token');

    expect(response.status).toBe(401);
  });

  it('accepts the configured token', async () => {
    const response = await request(createApp())
      .get('/api/status')
      .set('Authorization', 'Bearer test-api-token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ service: 'instagetter', authenticated: true });
    // The resolved caller address, reported so a wrong trust-proxy setting is
    // observable rather than silent. See test/trustProxy.test.ts.
    expect(typeof response.body.clientIp).toBe('string');
  });
});
