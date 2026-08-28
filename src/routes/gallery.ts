import { Router, Request, Response } from 'express';
import { getItems, getLastRefresh, readOrFetch, refresh, maxCached, isValidId, getProgress } from '../cache';
import { refreshRateLimit } from '../middleware/refreshRateLimit';
import { createBrowseRateLimit } from '../middleware/browseRateLimit';
import { archiveRateLimit } from '../middleware/archiveRateLimit';

export const galleryRouter = Router();

const browseLimit = createBrowseRateLimit();

galleryRouter.get('/api/images', browseLimit, (_req: Request, res: Response) => {
  res.status(200).json({
    images: getItems(),
    lastRefresh: getLastRefresh(),
    limit: maxCached(),
    progress: getProgress(),
  });
});

galleryRouter.post('/api/refresh', refreshRateLimit, async (_req: Request, res: Response) => {
  try {
    const result = await refresh();
    res.status(200).json({ ...result, images: getItems(), lastRefresh: getLastRefresh() });
  } catch (err) {
    res.status(502).json({ error: 'refresh failed', detail: (err as Error).message });
  }
});

function serve(kind: 'images' | 'thumbs') {
  return async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'bad id' });
      return;
    }
    const bytes = await readOrFetch(kind, id);
    if (!bytes) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    // Slot ids are immutable, so the bytes never change under a given URL.
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.status(200).type('image/jpeg').send(bytes);
  };
}

galleryRouter.get('/thumb/:id.jpg', browseLimit, serve('thumbs'));
// Archive images reach S3; the extra limiter skips anything already on disk.
galleryRouter.get('/image/:id.jpg', browseLimit, archiveRateLimit, serve('images'));

galleryRouter.get('/download/:id.jpg', browseLimit, archiveRateLimit, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!isValidId(id)) {
    res.status(400).json({ error: 'bad id' });
    return;
  }
  const bytes = await readOrFetch('images', id);
  if (!bytes) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.set('Content-Disposition', `attachment; filename="instagram_${id}.jpg"`);
  res.status(200).type('image/jpeg').send(bytes);
});
