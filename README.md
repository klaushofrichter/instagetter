# instagetter

Service behind **https://insta.skylar.technology**. Shows the newest images from
[@klaushofrichter](https://www.instagram.com/klaushofrichter) in an
Instagram-like grid, reading them from S3. In-memory/on-disk cache only — S3 is
the source of truth and the cache is disposable.

## Pipeline

    local Chrome (claude-in-chrome)  ->  staging dir  ->  S3  ->  service  ->  browser
        /extract-instagram skill         upload-to-s3.js      refresh/cache    gallery

Extraction runs on the user's machine, never in the container: it drives the
logged-in local Chrome. The service only ever reads S3.

## Commands

```bash
npm install     # dependencies
npm run dev     # tsx against .env
npm run build   # tsc -> dist/
npm test        # vitest run

export AWS_SHARED_CREDENTIALS_FILE=$HOME/Development/kubesetup/credentials-insta
node scripts/known-ids.js                        # slot ids already in S3
node scripts/upload-to-s3.js --staging <dir>     # embed EXIF, thumbnail, upload, prune
```

To fetch new images, run the `/extract-instagram` skill, then press **Refresh**
on the page.

## Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /` | public | gallery page |
| `GET /api/images` | public | cached image metadata |
| `POST /api/refresh` | public, 1 per 5s per IP | re-sync from S3 |
| `GET /thumb/:id.jpg` | public | grid thumbnail (~640px) |
| `GET /image/:id.jpg` | public | full-resolution image |
| `GET /download/:id.jpg` | public | same, as an attachment |
| `GET /health` | public | `{"status":"ok"}` |
| `GET /robots.txt` | public | disallow all |
| `GET /api/status` | bearer token | placeholder |

## Storage

    s3://<bucket>/index.json           every slot, newest first (one GET per refresh)
    s3://<bucket>/images/<id>.jpg      full-res, EXIF/IPTC embedded
    s3://<bucket>/thumbs/<id>.jpg      ~640px grid thumbnail
    s3://<bucket>/meta/<id>.json       sidecar metadata

A slot id is `<shortcode>_<NN>`, where `NN` is the 1-based carousel index — so a
two-image carousel takes two slots, adjacent in the sequence.

Retention: the upload script prunes S3 to the newest **999** slots by post date;
the service caches the newest **99** locally, evicting by post date (not by last
access). Restarting loses the cache and re-pulls from S3.

## Deployment

Promotion flow: push to `main` publishes an image; a PR into `production` must
pass tests + build + CodeQL; merging to `production` deploys to k3s. Cluster
manifests live in the `kube-setup` repo. See CLAUDE.md for the prerequisites.
