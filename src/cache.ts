import { promises as fs } from 'fs';
import path from 'path';
import { ImageMeta, sortNewestFirst } from './types';
import { fetchIndex, fetchImage, fetchThumb } from './s3';

/**
 * How many *full images* are held on local disk. Thumbnails are not subject to
 * this: they are ~76KB against ~327KB, so the whole thumbnail set is cached
 * regardless of age and grid pagination never waits on S3. Read per call so the
 * limit is configurable at runtime and testable.
 */
export function maxCached(): number {
  return Number(process.env.CACHE_LIMIT) || 99;
}

function cacheDir(): string {
  return process.env.CACHE_DIR ?? '/tmp/instagetter-cache';
}

let items: ImageMeta[] = [];
/**
 * Every slot id in index.json, not just the cached window. Guards the S3
 * fallback so an arbitrary id cannot be used to make the service issue GETs.
 */
let catalogIds = new Set<string>();
/**
 * Full-image ids actually present on disk after the last refresh. Read from the
 * directory rather than inferred, and kept synchronous so rate-limiting
 * middleware can decide *before* the handler whether a request will reach S3.
 */
let localImageIds = new Set<string>();
let progress: Progress = { loading: false, done: 0, total: 0 };
let lastRefresh: string | null = null;
let refreshing: Promise<RefreshResult> | null = null;

export interface Progress {
  /** True while a refresh is in flight — notably the one at startup. */
  loading: boolean;
  done: number;
  total: number;
}

export interface RefreshResult {
  total: number;
  added: number;
  evicted: number;
  skipped: boolean;
  at: string;
}

/**
 * True when a full image is on local disk, so serving it costs nothing. False
 * means the request would fall through to S3 -- which is what gets rate limited.
 */
export function isLocalImage(id: string): boolean {
  return localImageIds.has(id);
}

export function isKnownSlot(id: string): boolean {
  return catalogIds.has(id);
}

export function getItems(): ImageMeta[] {
  return items;
}

export function getLastRefresh(): string | null {
  return lastRefresh;
}

export function getProgress(): Progress {
  return progress;
}

/** Test isolation — mirrors resetReading() in steps-service. */
export function resetCache(): void {
  items = [];
  catalogIds = new Set();
  localImageIds = new Set();
  lastRefresh = null;
  refreshing = null;
  progress = { loading: false, done: 0, total: 0 };
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

/**
 * Serve a slot, falling back to S3 for full images outside the cached window.
 *
 * The fallback deliberately does **not** write to disk. Eviction keeps the
 * newest maxCached() by post date; persisting an on-demand fetch would break
 * that invariant and let the cache grow without bound until the next refresh.
 * Thumbnails are different — every thumb belongs on disk, so a thumb fetched
 * here is worth keeping.
 */
export async function readOrFetch(
  kind: 'images' | 'thumbs',
  id: string,
): Promise<Buffer | null> {
  if (!isValidId(id)) return null;
  const local = await readCached(kind, id);
  if (local) return local;
  if (!catalogIds.has(id)) return null; // not a slot we know about — don't probe S3
  try {
    const bytes = kind === 'thumbs' ? await fetchThumb(id) : await fetchImage(id);
    if (kind === 'thumbs') {
      await ensureDirs();
      await fs.writeFile(filePath('thumbs', id), bytes);
    }
    return bytes;
  } catch (err) {
    console.error(`readOrFetch: ${kind}/${id}:`, (err as Error).message);
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
  progress = { loading: true, done: 0, total: 0 };
  try {
    return await runRefresh();
  } finally {
    progress = { ...progress, loading: false };
  }
}

async function runRefresh(): Promise<RefreshResult> {
  await ensureDirs();
  const catalog = sortNewestFirst(await fetchIndex());
  catalogIds = new Set(catalog.map((m) => m.id));

  // Full images are held for the newest window only; thumbs for everything.
  const keepImages = catalog.slice(0, maxCached());
  const keepImageIds = new Set(keepImages.map((m) => m.id));
  progress = { loading: true, done: 0, total: catalog.length };

  let added = 0;
  const broken = new Set<string>();

  for (const meta of catalog) {
    const wantImage = keepImageIds.has(meta.id);
    const haveThumb = await readCached('thumbs', meta.id);
    const haveImage = wantImage ? await readCached('images', meta.id) : true;
    if (haveThumb && haveImage) {
      progress = { ...progress, done: progress.done + 1 };
      continue;
    }
    try {
      if (!haveThumb) {
        await fs.writeFile(filePath('thumbs', meta.id), await fetchThumb(meta.id));
      }
      if (!haveImage) {
        await fs.writeFile(filePath('images', meta.id), await fetchImage(meta.id));
      }
      added += 1;
    } catch (err) {
      // One bad object must not abort the whole refresh.
      console.error(`refresh: skipping ${meta.id}:`, (err as Error).message);
      broken.add(meta.id);
    }
    progress = { ...progress, done: progress.done + 1 };
  }

  // Thumbs age out only when they leave index.json; images when they leave the
  // newest window. Both are by post date, never by last access.
  let evicted = 0;
  for (const kind of ['images', 'thumbs'] as const) {
    const keepIds = kind === 'images' ? keepImageIds : catalogIds;
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

  try {
    const onDisk = await fs.readdir(path.join(cacheDir(), 'images'));
    localImageIds = new Set(onDisk.map((e) => e.replace(/\.jpg$/, '')));
  } catch {
    localImageIds = new Set();
  }

  // Advertise the whole catalog, minus any slot whose bytes would not come down
  // -- a grid entry that cannot be opened is worse than an absent one. Full
  // images beyond the window are served from S3 on demand by readOrFetch().
  items = catalog.filter((m) => !broken.has(m.id));
  lastRefresh = new Date().toISOString();
  return { total: items.length, added, evicted, skipped: false, at: lastRefresh };
}
