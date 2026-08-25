import { Router, Request, Response } from 'express';
import { getItems, getLastRefresh, readCached, refresh, maxCached } from '../cache';
import { refreshRateLimit } from '../middleware/refreshRateLimit';
import { createBrowseRateLimit } from '../middleware/browseRateLimit';

export const galleryRouter = Router();

const browseLimit = createBrowseRateLimit();

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

galleryRouter.get('/api/images', browseLimit, (_req: Request, res: Response) => {
  res.status(200).json({
    images: getItems(),
    lastRefresh: getLastRefresh(),
    limit: maxCached(),
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
    if (!ID_PATTERN.test(id)) {
      res.status(400).json({ error: 'bad id' });
      return;
    }
    const bytes = await readCached(kind, id);
    if (!bytes) {
      res.status(404).json({ error: 'not cached' });
      return;
    }
    // Slot ids are immutable, so the bytes never change under a given URL.
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.status(200).type('image/jpeg').send(bytes);
  };
}

galleryRouter.get('/thumb/:id.jpg', browseLimit, serve('thumbs'));
galleryRouter.get('/image/:id.jpg', browseLimit, serve('images'));

galleryRouter.get('/download/:id.jpg', browseLimit, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!ID_PATTERN.test(id)) {
    res.status(400).json({ error: 'bad id' });
    return;
  }
  const bytes = await readCached('images', id);
  if (!bytes) {
    res.status(404).json({ error: 'not cached' });
    return;
  }
  res.set('Content-Disposition', `attachment; filename="instagram_${id}.jpg"`);
  res.status(200).type('image/jpeg').send(bytes);
});
