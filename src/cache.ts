import { promises as fs } from 'fs';
import path from 'path';
import { ImageMeta, sortNewestFirst } from './types';
import { fetchIndex, fetchImage, fetchThumb } from './s3';

/** Read per call so the limit is configurable at runtime and testable. */
export function maxCached(): number {
  return Number(process.env.CACHE_LIMIT) || 99;
}

function cacheDir(): string {
  return process.env.CACHE_DIR ?? '/tmp/instagetter-cache';
}

let items: ImageMeta[] = [];
let lastRefresh: string | null = null;
let refreshing: Promise<RefreshResult> | null = null;

export interface RefreshResult {
  total: number;
  added: number;
  evicted: number;
  skipped: boolean;
  at: string;
}

export function getItems(): ImageMeta[] {
  return items;
}

export function getLastRefresh(): string | null {
  return lastRefresh;
}

/** Test isolation — mirrors resetReading() in steps-service. */
export function resetCache(): void {
  items = [];
  lastRefresh = null;
  refreshing = null;
}

/** Slot ids are `<shortcode>_<NN>` — letters, digits, underscore, hyphen. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/**
 * Guard here rather than trusting callers: this is the function that actually
 * touches the filesystem, so the check belongs with the access. basename()
 * strips any directory component, so the result cannot escape the cache dir
 * even if the pattern above is ever loosened.
 */
function filePath(kind: 'images' | 'thumbs', id: string): string {
  if (!isValidId(id)) throw new Error(`invalid slot id: ${id}`);
  return path.join(cacheDir(), kind, `${path.basename(id)}.jpg`);
}

export async function readCached(kind: 'images' | 'thumbs', id: string): Promise<Buffer | null> {
  if (!isValidId(id)) return null;
  try {
    return await fs.readFile(filePath(kind, id));
  } catch {
    return null;
  }
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(path.join(cacheDir(), 'images'), { recursive: true });
  await fs.mkdir(path.join(cacheDir(), 'thumbs'), { recursive: true });
}

/**
 * Pull index.json, download anything new, and drop anything that fell out of
 * the newest maxCached() by post date (not by last access — deliberately, so a
 * frequently viewed old image still ages out).
 *
 * Concurrent callers share one in-flight refresh rather than racing on the
 * cache directory.
 */
export function refresh(): Promise<RefreshResult> {
  if (refreshing) return refreshing;
  refreshing = doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<RefreshResult> {
  await ensureDirs();
  const index = sortNewestFirst(await fetchIndex());
  const keep = index.slice(0, maxCached());
  const keepIds = new Set(keep.map((m) => m.id));

  let added = 0;
  for (const meta of keep) {
    const haveThumb = await readCached('thumbs', meta.id);
    const haveImage = await readCached('images', meta.id);
    if (haveThumb && haveImage) continue;
    try {
      const [thumb, full] = await Promise.all([fetchThumb(meta.id), fetchImage(meta.id)]);
      await fs.writeFile(filePath('thumbs', meta.id), thumb);
      await fs.writeFile(filePath('images', meta.id), full);
      added += 1;
    } catch (err) {
      // One bad object must not abort the whole refresh.
      console.error(`refresh: skipping ${meta.id}:`, (err as Error).message);
    }
  }

  let evicted = 0;
  for (const kind of ['images', 'thumbs'] as const) {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(path.join(cacheDir(), kind));
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const id = entry.replace(/\.jpg$/, '');
      if (keepIds.has(id)) continue;
      await fs.rm(path.join(cacheDir(), kind, entry), { force: true });
      if (kind === 'images') evicted += 1;
    }
  }

  // Only advertise slots whose bytes actually made it into the cache.
  const usable: ImageMeta[] = [];
  for (const meta of keep) {
    if (await readCached('thumbs', meta.id)) usable.push(meta);
  }
  items = usable;
  lastRefresh = new Date().toISOString();
  return { total: items.length, added, evicted, skipped: false, at: lastRefresh };
}
