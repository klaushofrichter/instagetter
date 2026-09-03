# instagetter

[![Release](https://img.shields.io/github/v/release/klaushofrichter/instagetter?label=release&color=blue)](https://github.com/klaushofrichter/instagetter/releases)
[![PR checks](https://github.com/klaushofrichter/instagetter/actions/workflows/production-checks.yml/badge.svg)](https://github.com/klaushofrichter/instagetter/actions/workflows/production-checks.yml)
[![Build and publish image](https://github.com/klaushofrichter/instagetter/actions/workflows/build-push.yml/badge.svg)](https://github.com/klaushofrichter/instagetter/actions/workflows/build-push.yml)
[![Deploy production](https://github.com/klaushofrichter/instagetter/actions/workflows/deploy-production.yml/badge.svg)](https://github.com/klaushofrichter/instagetter/actions/workflows/deploy-production.yml)
[![Dependabot](https://img.shields.io/badge/dependabot-enabled-025E8C?logo=dependabot&logoColor=white)](https://github.com/klaushofrichter/instagetter/security/dependabot)

<!-- The release badge tracks the newest tag, which a successful production
     deploy cuts (see "Releasing" in CLAUDE.md). It is the last *released*
     version, not necessarily the running one: a deploy that rolls out and then
     fails its smoke test leaves production ahead of the tag. The about panel
     reports the running build.

     The three workflow badges are live status. The Dependabot one is static -
     GitHub publishes no endpoint for alert status on a repo, so it asserts
     that alerts, security updates, and .github/dependabot.yml are all in place
     rather than checking them. If Dependabot is ever turned off, this badge
     will not notice. -->

A small self-hosted gallery for your own Instagram photos, running at
**[insta.klaushofrichter.net](https://insta.klaushofrichter.net)**.

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
npm test                    # unit tests (vitest)
npm run test:e2e            # browser tests (playwright)
```

`test:e2e` starts its own server against a fake S3 that serves real JPEGs, so
it needs no credentials and reaches no network. First run locally:
`npx playwright install chromium`.

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
| `CACHE_LIMIT` | no | Full images held on disk, newest first (default `99`). Thumbnails are always cached in full. |
| `REFRESH_MIN_INTERVAL_MS` | no | Server-enforced gap between refreshes (default `5000`). |
| `BROWSE_RATE_LIMIT` | no | Page/image requests per minute per IP (default `600`). |
| `ARCHIVE_RATE_LIMIT` | no | Per minute per IP, counting only full images not on disk, i.e. those fetched from S3 (default `120`). |
| `ARCHIVE_RATE_WINDOW_MS` | no | Window for `ARCHIVE_RATE_LIMIT` (default `60000`). |
| `WARM_HEAD_PAGES` | no | Grid pages whose thumbnails are warmed first after a restart (default `3`). |
| `WARM_CONCURRENCY` | no | Parallel downloads while warming priority content (default `4`). |
| `WARM_TAIL_DELAY_MS` | no | Pause between archive thumbnails once the local cache is satisfied, so warming does not compete with live traffic (default `250`). |
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
| `GET /health` | public | readiness probe; reports `{"status":"ok","version":"…"}` |
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
deletes the rest. The service caches the newest `CACHE_LIMIT` full images locally
(all thumbnails, regardless of age), evicting
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
location, dimensions, and links to the original post and to a stable
permalink. Previous and next
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
| `←` `↑` | previous image |
| `→` `↓` | next image |
| `space` | show or hide the metadata overlay (fullscreen only) |
| `Esc` | leave fullscreen, then close the detail view |
| the `X`, top right | leave fullscreen, or close the detail view |

Arrow keys work the same in the detail view and in fullscreen. On the grid,
`←` and `→` page instead; `↑` and `↓` are left alone there so the page can
still be scrolled.

The space-bar overlay is a translucent panel across the bottom of the screen
with the caption and facts centred, tinted to match the active theme.

On iPhone there is no element Fullscreen API — Chrome and every other iOS
browser run on WebKit, so they share Safari's limitation — and fullscreen falls
back to a fixed, viewport-filling stage that behaves the same from the outside.

On a touch screen the whole picture is divided into tap zones, so fullscreen
needs no visible controls beyond the `X`:

| Tap where | Effect |
|---|---|
| top strip, or the middle | back to the detail view |
| left quarter | previous image |
| right quarter | next image |
| bottom fifth | show or hide the metadata |

The top strip takes precedence over the side zones, so a near miss on the `X`
closes fullscreen rather than skipping to the next image. The `X` itself is
enlarged on touch devices.

Swipes work in the detail view and fullscreen alike:

| Swipe | Effect |
|---|---|
| left, or up | next image |
| right, or down | previous image |

A drag shorter than 40px counts as a tap, so the tap zones still work. Note the
arrow keys are deliberately the other way round from the swipes: `↑` means
"previous", while swiping up pushes the current picture away to reveal the next
one — the finger moves the content, the key moves the selection.

Every route into navigation — arrow keys, swipes, tap zones, the on-image
arrows and the pager — shares one rate limit of three steps per second. Holding
a key or flicking repeatedly will not queue up a burst of full-resolution
decodes.

### Linking to a page or image

Both parameters are accepted on the gallery URL. Anything unrecognised or out
of range is ignored and the first page is shown — never an error. If both are
given, `image` wins silently.

| URL | Effect |
|---|---|
| `?page=3` | show the third page |
| `?image=23` | open the 23rd image |
| `?page=DTWA5w4EkHW` | show whichever page currently holds that post |
| `?image=DTWA5w4EkHW` | open that post |
| `?image=DS0ovdXklvR_02` | open a specific carousel slide |

**Numbers are positions, not identities.** `?image=1` means "whatever is newest
right now", so it points at something different after the next upload. That is
fine for a quick link, but not for one you intend to keep.

**Shortcodes are stable.** `?image=DTWA5w4EkHW` is Instagram's own id for the
post and always resolves to the same picture however many newer images arrive
above it. `?page=<shortcode>` is stable in the sense that matters: it shows the
page *currently* holding that image, so the link keeps working as the pagination
shifts beneath it, rather than silently drifting to a different set of nine.

The detail view shows this as **instagetter permalink** beside the link to
Instagram. The shortcode is also embedded in each JPEG — as `XMP-dc:Identifier`,
and within the post URL in `XMP-dc:Source` — so a downloaded file can be traced
back to its post and its permalink.

Likes are deliberately **not shown**. The count is only true at the moment of
extraction, and a stale number displayed as fact is worse than no number. It is
still captured in the sidecar metadata and the embedded EXIF.

## Deployment

A promotion flow:

1. push to `main` → tests run, image published to GHCR
2. PR into `production` → tests, build and a CodeQL scan must pass
3. merge → the self-hosted runner builds, updates the Knative manifest, applies
   it, and smoke-tests the result

Cluster manifests live in a separate repository. See `CLAUDE.md` for the
prerequisites a deploy depends on.

### Releases

Merging into `production` cuts a release. The version is **generated at deploy
time** as `vYYYY.MM.DD.N`, where `N` counts that day's releases — there is no
version in the sources to bump or forget. Dates are Central, so an evening
deploy is not filed under tomorrow.

```
ghcr.io/klaushofrichter/instagetter:v2026.08.25.1   the released build
ghcr.io/klaushofrichter/instagetter:latest          whatever production runs
ghcr.io/klaushofrichter/instagetter:main            newest main build, not deployed
ghcr.io/klaushofrichter/instagetter:<sha>           every build, by commit
```

`latest` is published by the production deploy rather than by `main`, so pulling
it gives what is actually deployed instead of an untested build.

Release notes are assembled from the commits since the previous release,
preceded by anything curated under Unreleased in `CHANGELOG.md`. The release is
created only after the rollout has been verified, so a failed deploy produces no
release.

## License

[MIT](LICENSE) © 2026 Klaus Hofrichter
