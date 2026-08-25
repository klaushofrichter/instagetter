import { describe, it, expect } from 'vitest';
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

describe('GET /favicon.svg', () => {
  it('serves an SVG favicon', async () => {
    const response = await request(createApp()).get('/favicon.svg');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/image\/svg\+xml/);
  });
});
