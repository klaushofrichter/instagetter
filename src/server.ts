import { createApp } from './app';
import { assertRequiredEnv } from './config';
import { refresh } from './cache';

assertRequiredEnv();

const port = Number(process.env.PORT) || 8080;
const app = createApp();

app.listen(port, () => {
  console.log(`instagetter listening on port ${port}`);
  // Warm the cache from S3 so a restart doesn't show an empty grid. The cache
  // itself is disposable — S3 is the source of truth.
  refresh()
    .then((r) => console.log(`initial refresh: ${r.total} cached, ${r.added} downloaded`))
    .catch((err) => console.error('initial refresh failed:', (err as Error).message));
});
