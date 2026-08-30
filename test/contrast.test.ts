import { describe, it, expect } from 'vitest';
import { renderPage } from '../src/views/page';

const css = renderPage('');

/** Declarations inside these token blocks are flat, so the first `}` ends one. */
function tokens(marker: string): Record<string, string> {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error('no such block: ' + marker);
  const body = css.slice(start + marker.length, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const base = tokens(':root {');

// WCAG AA for body text. Lighthouse fails the whole accessibility audit on one
// offending node, so this is worth a test rather than a careful eye.
describe.each([
  ['light', ':root {'],
  ['dark (system)', ':root:not([data-theme="light"]) {'],
  ['dark (explicit)', ':root[data-theme="dark"] {'],
])('%s theme', (_name, marker) => {
  const theme = { ...base, ...tokens(marker) };

  it('has a link colour readable against the page background', () => {
    expect(contrast(theme['--accent'], theme['--bg'])).toBeGreaterThanOrEqual(4.5);
  });

  it('has body text readable against the page background', () => {
    expect(contrast(theme['--fg'], theme['--bg'])).toBeGreaterThanOrEqual(4.5);
  });
});
