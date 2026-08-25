# instagetter

A small self-hosted gallery for your own Instagram photos, running at
**[insta.skylar.technology](https://insta.skylar.technology)**.

It extracts the newest posts from a single Instagram account you control,
stores them in S3 at full resolution with their metadata, and serves them as a
responsive grid with a lightbox. The site itself never talks to Instagram.

> Scope note: this is deliberately *not* a scraper. It reads the newest posts
> of one account — the owner's own — on demand, driven by a human-in-the-loop
> browser session. There is no bulk crawling and no third-party accounts.

## How it works

```
   your Chrome                  your machine              AWS            the cluster
┌────────────────┐          ┌──────────────────┐      ┌───────┐      ┌──────────────┐
│ instagram.com  │  images  │ upload-to-s3.js  │      │       │      │  instagetter │
│  (logged in)   ├─────────►│  EXIF + thumbs   ├─────►│  S3   │◄─────┤   Express    │
└────────────────┘  + meta  └──────────────────┘      │       │ pull └──────┬───────┘
        ▲                                             └───────┘             │
        │ /extract-instagram skill                                          ▼
   (Claude drives it)                                                    visitors
```

Extraction runs **on your machine**, because it uses your logged-in browser.
The deployed service only ever reads from S3, so it can restart, scale, or be
redeployed without touching Instagram.

### Why the browser

Instagram's public HTML is the only interface used. Headless automation is
blocked by bot detection, and the private API is off-limits by choice, so
extraction is driven through a real logged-in Chrome session by
[Claude in Chrome](https://claude.ai/code). Image URLs are fetched and handled
entirely inside the page.

## Quick start

```bash
npm install
cp .env.example .env        # then fill in the values
npm run dev                 # http://localhost:8080
npm test
```

The server refuses to start if required configuration is missing, so a
misconfigured deploy fails immediately rather than serving errors.

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `INSTA_API_TOKENS` | yes | Comma-separated bearer tokens for the protected API. Rotate by adding a new one, deploying, then dropping the old. |
| `S3_BUCKET` | yes | Bucket holding images, thumbnails and metadata. |
| `AWS_REGION` | yes | Bucket region. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | yes | Credentials scoped to that one bucket. |
| `CACHE_DIR` | no | Local image cache (default `/tmp/instagetter-cache`). |
| `CACHE_LIMIT` | no | Images cached locally, newest first (default `99`). |
| `REFRESH_MIN_INTERVAL_MS` | no | Server-enforced gap between refreshes (default `5000`). |
| `BROWSE_RATE_LIMIT` | no | Page/image requests per minute per IP (default `600`). |
| `S3_KEEP` | no | Slots retained in S3 by the upload script (default `999`). |

## Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /` | public | the gallery |
| `GET /api/images` | public | cached image metadata as JSON |
| `POST /api/refresh` | public, 1 per 5s per IP | re-sync from S3 |
| `GET /thumb/:id.jpg` | public | grid thumbnail (~640px) |
| `GET /image/:id.jpg` | public | full-resolution image |
| `GET /download/:id.jpg` | public | same, as a file download |
| `GET /health` | public | readiness probe |
| `GET /robots.txt` | public | disallow all |
| `GET /api/status` | bearer token | placeholder for future API |

## Storage layout

```
s3://<bucket>/index.json        every slot, newest first — one GET per refresh
s3://<bucket>/images/<id>.jpg   full resolution, EXIF/IPTC embedded
s3://<bucket>/thumbs/<id>.jpg   ~640px grid thumbnail
s3://<bucket>/meta/<id>.json    sidecar metadata
```

A slot id is `<shortcode>_<NN>`, where `NN` is the 1-based carousel index. A
two-image carousel therefore occupies two slots, adjacent in the sequence and
badged `1/2`, `2/2` in the grid.

Captions, dates, locations and hashtags are written into each JPEG as
EXIF/IPTC/XMP as well as the sidecar, so a downloaded file describes itself.

**Retention.** The upload script keeps the newest `S3_KEEP` slots in S3 and
deletes the rest. The service caches the newest `CACHE_LIMIT` locally, evicting
by *post date* rather than least-recently-used, so an old favourite still ages
out. The cache is disposable: S3 is the source of truth and a restart refills it.

## Extracting new images

With [Claude Code](https://claude.com/claude-code):

```
/extract-instagram
```

It opens your logged-in Chrome, walks the newest posts, downloads each image
with its metadata, and runs the uploader. Then press **Refresh** on the page.
Intended for roughly daily use; it is not time critical and prefers waiting
over speed.

Manual equivalents:

```bash
node scripts/known-ids.js                      # what is already in S3
node scripts/upload-to-s3.js --staging <dir>   # add --dry-run to preview
```

The uploader needs `exiftool` and `sharp`; neither ships in the container.

## The page

A three-column grid on desktop, a single stacked column on narrow screens, nine
images per page with pagination. Carousel slides sit adjacent and are badged
`1/2`, `2/2`, and so on.

The header carries three icon buttons: **theme** (light/dark, remembered per
browser), **refresh** (re-sync from S3, limited to one request per five seconds),
and **(i)** for an about panel. The title mark links to skylar.technology and the
name links to this repository.

### Detail view

Clicking a tile opens the image at full resolution alongside its caption, date,
location, dimensions, likes, and a link to the original post. Previous and next
are available as on-image buttons or with the cursor keys, plus buttons to
download the file, enter fullscreen, and close.

### Fullscreen

Fullscreen shows the picture and nothing else — no toolbar, no metadata, no
counter. The image scales to fill the screen in either direction while keeping
its aspect ratio, so small originals are enlarged rather than stranded in the
middle of a black field.

| Key / action | Effect |
|---|---|
| click the image | enter fullscreen |
| `f` | toggle fullscreen |
| `←` `→` | previous / next image, in fullscreen too |
| `space` | show or hide the metadata overlay (fullscreen only) |
| `Esc` | leave fullscreen, then close the detail view |
| the `X`, top right | leave fullscreen, or close the detail view |

The space-bar overlay is a translucent panel across the bottom of the screen
with the caption and facts centred, tinted to match the active theme.

## Deployment

A promotion flow:

1. push to `main` → tests run, image published to GHCR
2. PR into `production` → tests, build and a CodeQL scan must pass
3. merge → the self-hosted runner builds, updates the Knative manifest, applies
   it, and smoke-tests the result

Cluster manifests live in a separate repository. See `CLAUDE.md` for the
prerequisites a deploy depends on.

## License

[MIT](LICENSE) © 2026 Klaus Hofrichter
