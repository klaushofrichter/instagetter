import { ImageMeta } from '../types';

const SITE_NAME = 'instagetter';
const DESCRIPTION = 'The newest images from the klaushofrichter Instagram account.';
const GENERIC_ALT = 'The newest image on instagetter';
const ALT_MAX = 200;

/** Every value here is interpolated into an HTML attribute, and captions come
 *  from Instagram — so nothing reaches the page unescaped. */
function esc(value: string | number): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function property(name: string, value: string | number): string {
  return `<meta property="${name}" content="${esc(value)}">`;
}

function named(name: string, value: string): string {
  return `<meta name="${name}" content="${esc(value)}">`;
}

/** Truncation happens before escaping, so an entity can never be cut in half. */
function altText(caption: string): string {
  const trimmed = caption.trim();
  if (!trimmed) return GENERIC_ALT;
  if (trimmed.length <= ALT_MAX) return trimmed;
  return trimmed.slice(0, ALT_MAX - 1) + '\u2026';
}

/**
 * Open Graph tags for the gallery page. `newest` is the most recent cached
 * image, or null when nothing is cached yet.
 */
export function buildOgTags(baseUrl: string, newest: ImageMeta | null): string {
  const tags = [
    property('og:type', 'website'),
    property('og:site_name', SITE_NAME),
    property('og:title', SITE_NAME),
    property('og:description', DESCRIPTION),
    property('og:url', `${baseUrl}/`),
  ];

  if (newest) {
    tags.push(
      property('og:image', `${baseUrl}/image/${newest.id}.jpg`),
      property('og:image:type', 'image/jpeg'),
      property('og:image:width', newest.width),
      property('og:image:height', newest.height),
      property('og:image:alt', altText(newest.caption)),
      named('twitter:card', 'summary_large_image'),
    );
  } else {
    tags.push(named('twitter:card', 'summary'));
  }

  return tags.join('\n');
}
