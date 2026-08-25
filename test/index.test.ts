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

describe('GET /favicon.png', () => {
  it('serves the skylar.technology logo as a PNG', async () => {
    const response = await request(createApp()).get('/favicon.png');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/image\/png/);
    // PNG magic number, so a corrupt base64 blob fails loudly.
    expect(response.body.subarray(1, 4).toString()).toBe('PNG');
  });
});
