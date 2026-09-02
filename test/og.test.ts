import { describe, it, expect } from 'vitest';
import { buildOgTags } from '../src/views/og';
import { meta } from './fakeS3';

const BASE = 'https://insta.example.com';

describe('buildOgTags', () => {
  it('points og:image at the newest cached image on an absolute URL', () => {
    const tags = buildOgTags(BASE, meta('abc_01', '2026-05-01T00:00:00.000Z'));

    expect(tags).toContain(
      '<meta property="og:image" content="https://insta.example.com/image/abc_01.jpg">',
    );
  });

  it('declares the image dimensions and type from the metadata', () => {
    const tags = buildOgTags(BASE, meta('abc_01', '2026-05-01T00:00:00.000Z', { width: 1080, height: 1350 }));

    expect(tags).toContain('<meta property="og:image:type" content="image/jpeg">');
    expect(tags).toContain('<meta property="og:image:width" content="1080">');
    expect(tags).toContain('<meta property="og:image:height" content="1350">');
  });

  it('carries the page identity tags', () => {
    const tags = buildOgTags(BASE, meta('abc_01', '2026-05-01T00:00:00.000Z'));

    expect(tags).toContain('<meta property="og:type" content="website">');
    expect(tags).toContain('<meta property="og:site_name" content="instagetter">');
    expect(tags).toContain('<meta property="og:title" content="instagetter">');
    expect(tags).toContain('<meta property="og:url" content="https://insta.example.com/">');
    expect(tags).toMatch(/<meta property="og:description" content="[^"]+">/);
  });

  it('asks for the large-image card layout when there is an image', () => {
    const tags = buildOgTags(BASE, meta('abc_01', '2026-05-01T00:00:00.000Z'));

    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  // A preview pointing at an image the service cannot serve looks broken; a
  // text-only card does not.
  it('degrades to a text card with no image when the cache is empty', () => {
    const tags = buildOgTags(BASE, null);

    expect(tags).toContain('<meta name="twitter:card" content="summary">');
    expect(tags).not.toContain('og:image');
    expect(tags).toContain('<meta property="og:title" content="instagetter">');
  });

  it('uses the caption as the image alt text', () => {
    const tags = buildOgTags(BASE, meta('abc_01', '2026-05-01T00:00:00.000Z', { caption: 'Sunrise over the lake' }));

    expect(tags).toContain('<meta property="og:image:alt" content="Sunrise over the lake">');
  });

  // Captions come from Instagram, straight into an HTML attribute.
  it('escapes a caption that would otherwise break out of the attribute', () => {
    const hostile = 'say "hi" & <script>alert(1)</script>';
    const tags = buildOgTags(BASE, meta('abc_01', '2026-05-01T00:00:00.000Z', { caption: hostile }));

    expect(tags).toContain(
      '<meta property="og:image:alt" content="say &quot;hi&quot; &amp; &lt;script&gt;alert(1)&lt;/script&gt;">',
    );
    expect(tags).not.toContain('<script>');
  });

  it('escapes the base URL, which arrives from a request header', () => {
    const tags = buildOgTags('https://evil"><script>x</script>', meta('abc_01', '2026-05-01T00:00:00.000Z'));

    expect(tags).not.toContain('<script>');
  });

  it('truncates a long caption rather than dumping the whole post into a meta tag', () => {
    const long = 'x'.repeat(400);
    const tags = buildOgTags(BASE, meta('abc_01', '2026-05-01T00:00:00.000Z', { caption: long }));

    const alt = /<meta property="og:image:alt" content="([^"]*)">/.exec(tags)?.[1] ?? '';
    expect(alt.length).toBeLessThanOrEqual(200);
    expect(alt.endsWith('\u2026')).toBe(true);
  });

  it('falls back to a generic alt when the post has no caption', () => {
    const tags = buildOgTags(BASE, meta('abc_01', '2026-05-01T00:00:00.000Z', { caption: '   ' }));

    expect(tags).toContain('<meta property="og:image:alt" content="The newest image on instagetter">');
  });
});
