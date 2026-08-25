---
name: extract-instagram
description: Extract the newest images and metadata from the klaushofrichter Instagram account via the local logged-in Chrome, stage them, and upload to S3 for the instagetter service. Use when asked to fetch/refresh Instagram images, pull the latest posts, or update the gallery.
---

# Extract Instagram images to S3

Pulls the newest posts from https://www.instagram.com/klaushofrichter using
Claude-in-Chrome against the user's logged-in browser, stages them locally,
then uploads to S3 via `scripts/upload-to-s3.js`.

This **cannot** run in the container or a cloud agent — it drives the user's
local Chrome. It is deliberately small-scale: newest posts only, never a bulk
scrape of the account or of anyone else's.

## Constraints learned the hard way

- **Do not call Instagram's private API** (`/api/v1/users/web_profile_info`).
  The user declined that on 2026-08-25. Use the rendered DOM only.
- **Image URLs come back redacted** to the tool caller. In-page JavaScript can
  still read and `fetch()` them, so do all URL handling inside the page and
  return only metadata.
- **Always use a fresh tab** (`tabs_create_mcp`), and close it when done. A
  reused tab has been observed serving a frozen snapshot.
- If more than one browser is connected, pin to the local Linux one with
  `select_browser` (deviceId `784e894b-66e6-4bf6-96a1-5b97e6a3af74`). Match on
  deviceId, never the display name — the labels swap between sessions.
- **Post pages have no `<article>` element.** The modal layout (opened from the
  profile grid) does; the standalone `/p/<code>/` layout does not. Select the
  main image by rendered size instead: `getBoundingClientRect().width > 400`.
  A broader selector picks up the "More posts from…" thumbnails, which are
  *other posts* and will silently corrupt the extraction.
- **Images hydrate ~2.5s after navigation.** Querying immediately returns zero
  images while `og:` meta tags are already present.
- Resolution is the original upload size and varies per post (2572, 2750, 2004,
  1440 … all observed). There is no `srcset`, so there is no larger variant to
  request — take what the page loads.
- **Grid tile hrefs are not prefixed `/p/`.** `a[href^="/p/"]` matches nothing.
  Match `/\/p\/([A-Za-z0-9_-]+)/` anywhere in the href instead.
- **A blob-anchor download fails silently when Chrome blocks it.** `a.click()`
  does not throw, and the blob `fetch` still returns real bytes — so the page
  will happily report success for a file that was never written. Chrome allows
  the first automatic download from a site and blocks the rest until the user
  permits them for that origin. **Always verify on disk afterwards** (step 5)
  and treat the in-page byte count as a claim, not proof.
- **`javascript_tool` calls time out at 45s.** Do not loop a whole carousel plus
  hydration waits in one call — one slide per call for carousels.
- **The location line is not always the location.** On a post Instagram has
  labelled as AI-generated, the body text runs `username / "AI content" /
  <real location>`, so taking the line after the username captures the badge
  instead. Skip a leading `AI content` line before reading the location.
- **Hydration is not a fixed delay.** 2.8s was enough for some posts and not for
  others; a post whose image had not loaded reported `imgCount: 0` with perfectly
  good metadata. Poll for the image (`width > 400`) up to ~15s instead of
  sleeping a fixed amount. Extraction is not time critical — prefer waiting.

## Steps

Each run has two phases: catch up on anything new at the top of the profile,
then take another 12 older posts from where the last run stopped.

### Setup

```bash
export AWS_SHARED_CREDENTIALS_FILE=$HOME/Development/kubesetup/credentials-insta
set -a; . .env; set +a          # S3_BUCKET, AWS_REGION
node scripts/state.js           # backfillCursor + skipped list
node scripts/known-ids.js       # slot ids already in S3
```

`state.json` in S3 holds `backfillCursor` (the takenAt of the oldest post
handled so far) and `skipped` (posts never to retry). If it is missing the
cursor is derived from the oldest entry in `index.json`, so the state is
self-healing rather than a fragile counter — deleting it costs nothing.

### Phase 1 — new posts

Open a fresh tab on the profile and read the grid links. Any shortcode not
already in S3 **and newer than the newest stored post** is new: extract it.
Usually there are none. Do not scroll for this phase; new posts are at the top.

### Phase 2 — backfill 12 older posts

Scroll the grid (see the scrolling note below) until posts older than
`backfillCursor` appear, then take the next **12** shortcodes that are neither
in S3 nor in `skipped`, working from newest to oldest.

- **Carousels do not count against the 12 as a group** — if the twelfth post is
  a six-image carousel, take all six slides. Never leave a carousel half
  stored: complete the set even if that means 17 slots instead of 12.
- After a successful upload, move the cursor to the takenAt of the oldest post
  just handled: `node scripts/state.js --set-cursor <ISO>`.

### Images only

This app stores photographs. **Skip videos and reels** — check
`document.querySelectorAll('video').length` and the `og:video` meta tag before
extracting, and record a skip so the post is not retried every night:

```bash
node scripts/state.js --skip <shortcode>
```

Do the same for any post whose image genuinely cannot be fetched after trying
`?img_index=1`. Never let a skip pass silently as a success.

### Extracting one post

Navigate to `https://www.instagram.com/p/<shortcode>/?img_index=<n>` — always
with the index, even for a single image (see the carousel section: the bare URL
sometimes renders a blank frame). Then:

1. Poll for the main image rather than sleeping a fixed time.
2. Read metadata: caption from `og:title`, `takenAt` from `time[datetime]`,
   likes/comments from `og:description`, location from the body text — skipping
   an `AI content` badge if present.
3. In-page: `fetch(img.currentSrc)` -> blob -> anchor with
   `download="<shortcode>_<NN>.jpg"` -> click.
4. Repeat for each slide until the image bytes repeat, or the dot count is
   reached.

### Finishing

5. **Verify every expected file exists in `~/Downloads` with a non-zero size**
   before staging. If files are missing, downloads are being blocked — stop and
   tell the user rather than uploading a partial set. Then move them into a
   staging directory and write `manifest.json` — an array of the metadata
   objects, each with `id` (`<shortcode>_<NN>`), `shortcode`, `imgIndex`,
   `imgCount`, `caption`, `hashtags`, `location`, `takenAt`, `likes`,
   `comments`, `postUrl`, `extractedAt`. `width`/`height` are filled in by the
   upload script.
6. `node scripts/upload-to-s3.js --staging <dir>` (add `--dry-run` first if
   unsure). It embeds EXIF, builds thumbnails, uploads, rebuilds `index.json`
   and prunes S3 to the newest 999 slots.
7. `node scripts/state.js --set-cursor <oldest ISO handled>` and
   `node scripts/state.js --record <newCount> <backfillCount>`.
8. Close the tab. Then `curl -s -X POST https://insta.skylar.technology/api/refresh`
   so the live cache picks the images up, and report what was added.

### Scrolling the grid

The profile grid lazy-loads twelve posts at a time and **needs the page to have
focus first**: click a neutral margin (e.g. x≈1258, y≈300) before scrolling, or
the wheel events are swallowed and nothing loads. Programmatic `scrollTo` moves
the page but does not trigger the fetch; real wheel events do.

## Cadence

Runs nightly at 02:48 CT. The machine is `America/Chicago`, so a cron
expression of `48 2 * * *` in local time is already CT — no conversion.

Each run: catch up on new posts, then backfill twelve older ones. At twelve a
night the ~1,285-post archive takes a few months to walk, which is the point —
it is a trickle, not a scrape.

Nothing about this is time critical. Prefer waiting over speed: poll for images
rather than sleeping fixed amounts, and keep each `javascript_tool` call under
the 45s limit.

## Carousels

Each carousel image is its own slot (`<shortcode>_1`, `<shortcode>_2`, …) and
occupies its own grid tile, adjacent in the sequence. Example post with two
images: https://www.instagram.com/p/DS0ovdXklvR/

**Always fetch slides by URL: `/p/<code>/?img_index=<n>`.** Do not click the
Next control. Some carousels render a blank grey image frame in the automation
context — caption, location, likes and the slide dots all present, no image
ever loading, on a fresh tab, with no console error — while the same post
displays fine in the user's own window. Two posts were wrongly written off as
unextractable before this was found. With `?img_index=N` every slide loads
immediately (`waitedMs: 0`). It also avoids the click, the transition wait, and
the decode burst that can stall the renderer.

Take the slide count from the dots, and stop early if the image bytes repeat —
an out-of-range `img_index` just shows the last slide.
