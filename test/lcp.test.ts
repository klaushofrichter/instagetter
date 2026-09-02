import { describe, it, expect } from 'vitest';
import { renderPage } from '../src/views/page';

// The grid is built by the client, so these assert on the shipped script rather
// than on rendered tiles; Lighthouse checks the resulting metric end to end.
// Lazy-loading the image that *is* the largest contentful paint defers the very
// thing the metric measures — Lighthouse flags it as `lcp-lazy-loaded`.
describe('above-the-fold thumbnails', () => {
  const page = renderPage('');

  it('does not lazy-load every tile unconditionally', () => {
    expect(page).not.toContain('\'<img loading="lazy" src="/thumb/\'');
  });

  it('gives the first tile fetch priority', () => {
    expect(page).toContain('fetchpriority="high"');
  });

  it('still lazy-loads tiles further down the grid', () => {
    expect(page).toContain('lazy');
  });
});
