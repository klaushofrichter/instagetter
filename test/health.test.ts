import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /health', () => {
  it('returns 200 with a status ok body', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('is public — no Authorization header required', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).not.toBe(401);
  });
});
