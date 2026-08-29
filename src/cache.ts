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
/**
 * Bumped by every refresh so a background tail from a superseded run stops
 * instead of writing files the newer run has already decided about.
 */
let warmGeneration = 0;
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
  warmGeneration += 1;
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
  } catch (err) {
    // Only clear the flag on failure. On success the background tail may still
    // be running, and it clears the flag itself when it finishes.
    progress = { ...progress, loading: false };
    throw err;
  }
}

/**
 * Warm the archive's remaining thumbnails in the background, paced so the
 * cluster's bandwidth stays available to live requests. Abandons itself if a
 * newer refresh has started.
 */
async function warmTail(
  tail: WarmTask[],
  runTask: (t: WarmTask) => Promise<void>,
  generation: number,
): Promise<void> {
  const gap = warmTailDelayMs();
  try {
    for (const task of tail) {
      if (generation !== warmGeneration) return;
      await runTask(task);
      if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    }
  } finally {
    if (generation === warmGeneration) progress = { ...progress, loading: false };
  }
}

/** One grid page. The first few pages are what a visitor actually lands on. */
const PAGE_SIZE = 9;

function warmHeadPages(): number {
  return Number(process.env.WARM_HEAD_PAGES) || 3;
}

/** Parallel downloads for the priority work. The tail is paced instead. */
function warmConcurrency(): number {
  return Number(process.env.WARM_CONCURRENCY) || 4;
}

/**
 * Gap between downloads once the local cache is satisfied, so warming the rest
 * of the archive does not compete with live traffic for the cluster's bandwidth.
 */
function warmTailDelayMs(): number {
  const raw = process.env.WARM_TAIL_DELAY_MS;
  return raw === undefined ? 250 : Number(raw);
}

interface WarmTask {
  kind: 'images' | 'thumbs';
  id: string;
}

async function runRefresh(): Promise<RefreshResult> {
  const generation = ++warmGeneration;
  await ensureDirs();
  const catalog = sortNewestFirst(await fetchIndex());
  catalogIds = new Set(catalog.map((m) => m.id));

  // Publish the catalog before downloading anything. It is the only blocking
  // dependency: readOrFetch() falls back to S3 for a thumbnail as readily as
  // for an image, so a slot that has not been warmed yet still renders -- just
  // slower. Waiting for every thumbnail meant a restart showed the loading
  // screen for as long as the whole archive took, which grows with S3_KEEP
  // rather than with the cache size.
  items = catalog;
  lastRefresh = new Date().toISOString();

  // Full images are held for the newest window only; thumbs for everything.
  const keepImages = catalog.slice(0, maxCached());
  const keepImageIds = new Set(keepImages.map((m) => m.id));

  // Warm in the order a visitor needs things, not index order. The head is the
  // landing view and the first click; the local-cache window comes next
  // because it has to exist on disk anyway; the rest of the archive is a tail
  // that nothing waits for.
  const head = warmHeadPages() * PAGE_SIZE;
  const priority: WarmTask[] = [];
  const tail: WarmTask[] = [];

  const push = (into: WarmTask[], kind: 'images' | 'thumbs', from: ImageMeta[]) => {
    for (const m of from) into.push({ kind, id: m.id });
  };

  push(priority, 'thumbs', catalog.slice(0, head));                  // the landing grid
  push(priority, 'images', keepImages.slice(0, PAGE_SIZE));          // the likely first click
  push(priority, 'thumbs', catalog.slice(head, maxCached()));        // the rest of the window
  push(priority, 'images', keepImages.slice(PAGE_SIZE));             // the local image cache
  push(tail, 'thumbs', catalog.slice(maxCached()));                  // the archive, paced

  progress = { loading: true, done: 0, total: priority.length + tail.length };

  // Counted by slot, not by file: "3 new" should mean three pictures, even
  // though each needs a thumbnail and possibly a full image.
  const addedIds = new Set<string>();
  const broken = new Set<string>();

  const runTask = async (task: WarmTask): Promise<void> => {
    try {
      if (await readCached(task.kind, task.id)) return;
      const bytes =
        task.kind === 'thumbs' ? await fetchThumb(task.id) : await fetchImage(task.id);
      await fs.writeFile(filePath(task.kind, task.id), bytes);
      addedIds.add(task.id);
    } catch (err) {
      // One bad object must not abort the whole refresh.
      console.error(`refresh: skipping ${task.kind}/${task.id}:`, (err as Error).message);
      broken.add(task.id);
    } finally {
      progress = { ...progress, done: progress.done + 1 };
    }
  };

  // Priority work runs a few at a time: it is what someone is waiting for.
  let next = 0;
  const workers = Array.from({ length: Math.max(1, warmConcurrency()) }, async () => {
    while (next < priority.length) {
      await runTask(priority[next++]);
    }
  });
  await Promise.all(workers);

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

  // Drop any slot whose thumbnail would not come down -- a grid entry that
  // cannot be opened is worse than an absent one.
  items = catalog.filter((m) => !broken.has(m.id));
  lastRefresh = new Date().toISOString();
  const result = { total: items.length, added: addedIds.size, evicted, skipped: false, at: lastRefresh };

  // The tail is deliberately slow, serial, and *not* awaited. Nothing is
  // waiting for it: those thumbnails already serve from S3 on demand, warming
  // them merely makes deep pagination quick. Blocking on it would make
  // POST /api/refresh hang for as long as the archive takes -- minutes at the
  // S3_KEEP ceiling -- and would saturate the uplink while it did.
  if (tail.length === 0) {
    progress = { ...progress, loading: false };
  } else {
    void warmTail(tail, runTask, generation);
  }
  return result;
}
