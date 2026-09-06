import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const TOKEN = 'trust-proxy-token-aaaaaaaaaaaa';

// The real chain on this cluster: traefik -> kourier/envoy -> queue-proxy.
// The client is leftmost; everything after it is in-cluster.
const CLUSTER_HOPS = '10.42.0.5, 10.42.0.15';

const originalTokens = process.env.INSTA_API_TOKENS;
const originalTrusted = process.env.TRUSTED_PROXIES;

beforeEach(() => {
  process.env.INSTA_API_TOKENS = TOKEN;
  delete process.env.TRUSTED_PROXIES;
});

afterEach(() => {
  if (originalTokens === undefined) delete process.env.INSTA_API_TOKENS;
  else process.env.INSTA_API_TOKENS = originalTokens;
  if (originalTrusted === undefined) delete process.env.TRUSTED_PROXIES;
  else process.env.TRUSTED_PROXIES = originalTrusted;
});

function status(xff: string) {
  return request(createApp())
    .get('/api/status')
    .set('Authorization', `Bearer ${TOKEN}`)
    .set('X-Forwarded-For', xff);
}

describe('client address resolution', () => {
  it('walks past every in-cluster hop, not just one', async () => {
    // The bug: `trust proxy: 1` stopped after a single hop and returned
    // 10.42.0.5 -- an in-cluster address shared by every caller.
    const res = await status(`203.0.113.7, ${CLUSTER_HOPS}`);

    expect(res.body.clientIp).toBe('203.0.113.7');
  });

  it('is unaffected by a hop being added or removed', async () => {
    // Why a CIDR list rather than a count: the topology can change without
    // anyone editing this, and a number would keep returning an address --
    // just the wrong one, silently.
    const shorter = await status('203.0.113.7, 10.42.0.15');
    const longer = await status(`203.0.113.7, 10.42.0.9, ${CLUSTER_HOPS}`);

    expect(shorter.body.clientIp).toBe('203.0.113.7');
    expect(longer.body.clientIp).toBe('203.0.113.7');
  });

  it('does not believe a forwarded address from an untrusted client', async () => {
    // A LAN host is not a trusted hop, so its claim to be someone else is
    // ignored. This is what express's `uniquelocal` shorthand would have
    // given away, since it trusts all of RFC1918 including the house LAN.
    const res = await status('203.0.113.7, 192.168.1.50');

    expect(res.body.clientIp).not.toBe('203.0.113.7');
  });

  it('keeps a LAN client distinguishable rather than collapsing it', async () => {
    const res = await status(`192.168.1.50, ${CLUSTER_HOPS}`);

    expect(res.body.clientIp).toBe('192.168.1.50');
  });

  it('honours TRUSTED_PROXIES when the cluster is renumbered', async () => {
    process.env.TRUSTED_PROXIES = 'loopback,172.20.0.0/16';

    const res = await status('203.0.113.7, 172.20.5.5');

    expect(res.body.clientIp).toBe('203.0.113.7');
  });

  it('gives two different clients separate rate-limit budgets', async () => {
    // The property all of the above exists to protect. Same app instance, so
    // one shared limiter: if the addresses collapsed, the second caller would
    // see the first caller's spend.
    const app = createApp();
    const call = (client: string) =>
      request(app)
        .get('/api/status')
        .set('Authorization', 'Bearer wrong-so-we-fall-back-to-ip')
        .set('X-Forwarded-For', `${client}, ${CLUSTER_HOPS}`);

    const first = await call('203.0.113.7');
    await call('203.0.113.7');
    const second = await call('198.51.100.9');

    expect(Number(second.headers['ratelimit-remaining'])).toBe(
      Number(first.headers['ratelimit-remaining']),
    );
  });
});
