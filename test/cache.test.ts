import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { refresh, getItems, resetCache, readCached, readOrFetch, isValidId, getProgress } from '../src/cache';
import { setClient } from '../src/s3';
import { installFakeS3, meta } from './fakeS3';

const cacheDir = process.env.CACHE_DIR as string;

async function wipe() {
  await fs.rm(cacheDir, { recursive: true, force: true });
  await fs.mkdir(cacheDir, { recursive: true });
}

beforeEach(async () => {
  resetCache();
  await wipe();
});

afterEach(() => setClient(null));

describe('refresh', () => {
  it('downloads images listed in the index and reports them newest first', async () => {
    installFakeS3([
      meta('aaa_1', '2026-01-01T00:00:00.000Z'),
      meta('ccc_1', '2026-03-01T00:00:00.000Z'),
      meta('bbb_1', '2026-02-01T00:00:00.000Z'),
    ]);

    const result = await refresh();

    expect(result.added).toBe(3);
    expect(getItems().map((m) => m.id)).toEqual(['ccc_1', 'bbb_1', 'aaa_1']);
    expect(await readCached('images', 'ccc_1')).not.toBeNull();
    expect(await readCached('thumbs', 'ccc_1')).not.toBeNull();
  });

  it('caps full images at CACHE_LIMIT but keeps every thumb and advertises all slots', async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      meta(`id${i}_1`, new Date(Date.UTC(2026, 0, i + 1)).toISOString()),
    );
    const original = process.env.CACHE_LIMIT;
    process.env.CACHE_LIMIT = '3';
    try {
      installFakeS3(many);
      await refresh();

      // The whole catalog is browsable, not just the cached window.
      const ids = getItems().map((m) => m.id);
      expect(ids).toEqual(['id4_1', 'id3_1', 'id2_1', 'id1_1', 'id0_1']);

      // Full images: newest three on disk, older two evicted.
      expect(await readCached('images', 'id2_1')).not.toBeNull();
      expect(await readCached('images', 'id1_1')).toBeNull();
      expect(await readCached('images', 'id0_1')).toBeNull();

      // Thumbs: all five, so grid pagination never waits on S3.
      for (const m of many) {
        expect(await readCached('thumbs', m.id)).not.toBeNull();
      }

      // An evicted image is still served, transparently, from S3 -- and is not
      // written back to disk, or eviction by post date would not hold.
      expect(await readOrFetch('images', 'id0_1')).not.toBeNull();
      expect(await readCached('images', 'id0_1')).toBeNull();

      // An id outside the catalog must not cause an S3 GET at all.
      expect(await readOrFetch('images', 'nosuch_1')).toBeNull();
    } finally {
      if (original === undefined) delete process.env.CACHE_LIMIT;
      else process.env.CACHE_LIMIT = original;
    }
  });

  it('evicts cached files that are no longer in the index', async () => {
    installFakeS3([meta('old_1', '2026-01-01T00:00:00.000Z')]);
    await refresh();
    expect(await readCached('images', 'old_1')).not.toBeNull();

    installFakeS3([meta('new_1', '2026-02-01T00:00:00.000Z')]);
    const result = await refresh();

    expect(result.evicted).toBe(1);
    expect(await readCached('images', 'old_1')).toBeNull();
    expect(getItems().map((m) => m.id)).toEqual(['new_1']);
  });

  it('skips a slot whose bytes fail to download rather than aborting', async () => {
    installFakeS3([meta('good_1', '2026-02-01T00:00:00.000Z'), meta('bad_1', '2026-01-01T00:00:00.000Z')], {
      failFor: ['images/bad_1.jpg'],
    });

    await refresh();

    expect(getItems().map((m) => m.id)).toEqual(['good_1']);
  });

  it('shares one in-flight refresh between concurrent callers', async () => {
    let calls = 0;
    setClient({
      send: async (cmd: { input: { Key: string } }) => {
        if (cmd.input.Key === 'index.json') calls += 1;
        const payload =
          cmd.input.Key === 'index.json'
            ? Buffer.from(JSON.stringify([meta('x_1', '2026-01-01T00:00:00.000Z')]))
            : Buffer.from([0xff]);
        await new Promise((r) => setTimeout(r, 10));
        return { Body: { transformToByteArray: async () => new Uint8Array(payload) } };
      },
    } as never);

    await Promise.all([refresh(), refresh(), refresh()]);

    expect(calls).toBe(1);
  });

  it('writes cache files under CACHE_DIR', async () => {
    installFakeS3([meta('z_1', '2026-01-01T00:00:00.000Z')]);
    await refresh();

    const stat = await fs.stat(path.join(cacheDir, 'images', 'z_1.jpg'));
    expect(stat.size).toBeGreaterThan(0);
  });
});

describe('slot id validation', () => {
  it('accepts real slot ids', () => {
    expect(isValidId('DcPbrvdCtlY_01')).toBe(true);
    expect(isValidId('DS0ovdXklvR_02')).toBe(true);
  });

  it('rejects ids containing path separators or traversal', () => {
    expect(isValidId('../../etc/passwd')).toBe(false);
    expect(isValidId('a/b')).toBe(false);
    expect(isValidId('..')).toBe(false);
    expect(isValidId('a.jpg')).toBe(false);
    expect(isValidId('')).toBe(false);
  });

  it('refuses to read a traversing id even when called directly', async () => {
    // The guard lives with the file access, so a caller that forgets to
    // validate still cannot escape the cache directory.
    expect(await readCached('images', '../../../etc/passwd')).toBeNull();
  });
});

describe('refresh progress', () => {
  it('starts idle', () => {
    expect(getProgress()).toEqual({ loading: false, done: 0, total: 0 });
  });

  it('reports loading with a total while a refresh is in flight, then clears', async () => {
    const index = [
      meta('p1_1', '2026-03-01T00:00:00.000Z'),
      meta('p2_1', '2026-02-01T00:00:00.000Z'),
    ];
    setClient({
      send: async (cmd: { input: { Key: string } }) => {
        const payload =
          cmd.input.Key === 'index.json' ? Buffer.from(JSON.stringify(index)) : Buffer.from([0xff]);
        await new Promise((r) => setTimeout(r, 30));
        return { Body: { transformToByteArray: async () => new Uint8Array(payload) } };
      },
    } as never);

    const inFlight = refresh();
    // Let the index resolve so `total` is known, then look mid-download.
    await new Promise((r) => setTimeout(r, 45));
    const during = getProgress();

    await inFlight;
    const after = getProgress();

    expect(during.loading).toBe(true);
    expect(during.total).toBe(2);
    expect(after.loading).toBe(false);
    expect(after.done).toBe(2);
  });

  it('clears the loading flag even when the refresh fails', async () => {
    setClient({
      send: async () => {
        throw new Error('S3 unavailable');
      },
    } as never);

    await expect(refresh()).rejects.toThrow('S3 unavailable');

    expect(getProgress().loading).toBe(false);
  });
});
