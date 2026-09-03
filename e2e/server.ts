// A real instagetter server, backed by a fake S3 that serves real JPEGs.
//
// e2e must not touch the network or need AWS credentials: the suite has to run
// on a clean GitHub runner and be deterministic. `setClient()` is the same
// seam the unit tests use, but here the bodies are genuine sharp-encoded JPEGs
// rather than the 3-byte stubs -- a browser has to decode them for the grid,
// the lightbox and the download link to mean anything.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { setClient } from '../src/s3';
import { ImageMeta } from '../src/types';

const COUNT = Number(process.env.E2E_IMAGES ?? 14); // > 9 so pagination has 2 pages

function meta(i: number): ImageMeta {
  const n = String(i).padStart(2, '0');
  // Newest first once sorted: higher i == older.
  const takenAt = new Date(Date.UTC(2026, 0, COUNT - i, 12, 0, 0)).toISOString();
  const carousel = i === 1;
  return {
    id: `SHORT${n}_01`,
    shortcode: `SHORT${n}`,
    imgIndex: 1,
    imgCount: carousel ? 3 : 1,
    caption: `Caption number ${n}`,
    hashtags: [],
    location: i === 0 ? 'Austin, Texas' : null,
    takenAt,
    likes: i,
    comments: 0,
    width: 240,
    height: 240,
    postUrl: `https://www.instagram.com/p/SHORT${n}/`,
    extractedAt: '2026-08-25T00:00:00.000Z',
  };
}

const index: ImageMeta[] = Array.from({ length: COUNT }, (_, i) => meta(i));

// One distinct colour per slot, so a test can tell "the image changed" from
// "the same bitmap is still on screen" -- the stale-frame bug this UI had.
const bodies = new Map<string, Buffer>();
async function body(key: string): Promise<Buffer> {
  const cached = bodies.get(key);
  if (cached) return cached;
  const n = Number(/SHORT(\d+)/.exec(key)?.[1] ?? 0);
  const size = key.startsWith('thumbs/') ? 64 : 240;
  const buf = await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: (n * 37) % 256, g: (n * 91) % 256, b: (n * 143) % 256 },
    },
  })
    .jpeg()
    .toBuffer();
  bodies.set(key, buf);
  return buf;
}

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'instagetter-e2e-'));
  process.env.CACHE_DIR = dir;
  process.env.INSTA_API_TOKENS ??= 'e2e-token';
  process.env.S3_BUCKET ??= 'e2e-bucket';
  process.env.AWS_REGION ??= 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID ??= 'e2e';
  process.env.AWS_SECRET_ACCESS_KEY ??= 'e2e';
  process.env.APP_VERSION ??= 'e2e';

  setClient({
    send: async (cmd: { input: { Key: string } }) => {
      const key = cmd.input.Key;
      const payload =
        key === 'index.json' ? Buffer.from(JSON.stringify(index)) : await body(key);
      return { Body: { transformToByteArray: async () => new Uint8Array(payload) } };
    },
  } as never);

  // Imported after the env is set: config is read at module scope in places.
  const { createApp } = await import('../src/app.js');
  const { refresh } = await import('../src/cache.js');

  const port = Number(process.env.PORT ?? 8080);
  const server = createApp().listen(port, async () => {
    // Warm before announcing, so tests never race the staged warm-up. The
    // suite is about the UI, not about startup ordering -- that has unit
    // coverage in test/cache.test.ts.
    await refresh();
    console.log(`e2e server listening on ${port} with ${index.length} images`);
  });

  const shutdown = async (): Promise<void> => {
    server.close();
    await rm(dir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void main();
