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
- **Hydration is not a fixed delay.** 2.8s was enough for some posts and not for
  others; a post whose image had not loaded reported `imgCount: 0` with perfectly
  good metadata. Poll for the image (`width > 400`) up to ~15s instead of
  sleeping a fixed amount. Extraction is not time critical — prefer waiting.

## Steps

1. `export AWS_SHARED_CREDENTIALS_FILE=$HOME/Development/kubesetup/credentials-insta`
   and load `.env` for `S3_BUCKET` / `AWS_REGION`.
2. `node scripts/known-ids.js` → the slot ids already in S3. Skip those posts.
3. New tab → `https://www.instagram.com/klaushofrichter`. Collect the newest
   post links from the grid (`a[href^="/p/"]`), newest first. Default to the
   newest 12 posts unless the user asks for more.
4. For each unknown shortcode, newest first:
   - Navigate to `https://www.instagram.com/p/<shortcode>/`, wait ~2.5s.
   - Read metadata:
     - caption — `meta[property="og:title"]` (text inside the quotes), or the
       caption line of `body.innerText`
     - `takenAt` — `document.querySelector('time').getAttribute('datetime')`
     - location — the line under the username in the header, when present
     - likes / comments — from `meta[property="og:description"]`
     - `imgCount` — number of carousel dots; 1 when there are none
   - For each slide `NN` from 1..imgCount:
     - Locate the main image (`width > 400` rule above).
     - In-page: `fetch(img.currentSrc)` → blob → anchor with
       `download="<shortcode>_<NN>.jpg"` → click. Record `naturalWidth/Height`.
     - If more slides remain, click the `aria-label="Next"` control and wait
       ~800ms. Slides already mounted need no click; long carousels do.
5. **Verify every expected file exists in `~/Downloads` with a non-zero size**
   before staging. If files are missing, downloads are being blocked — stop and
   tell the user rather than uploading a partial set. Then move them into a
   staging directory and
   write `manifest.json` there — an array of the metadata objects, each with
   `id` (`<shortcode>_<NN>`), `shortcode`, `imgIndex`, `imgCount`, `caption`,
   `hashtags`, `location`, `takenAt`, `likes`, `comments`, `postUrl`,
   `extractedAt`. `width`/`height` are filled in by the upload script.
6. `node scripts/upload-to-s3.js --staging <dir>` (add `--dry-run` first if
   unsure). It embeds EXIF, builds thumbnails, uploads, rebuilds `index.json`
   and prunes S3 to the newest 999 slots.
7. Close the tab. Tell the user what was added, then hit **Refresh** on
   https://insta.skylar.technology (or `POST /api/refresh`) to pull it into the
   service cache.

## Cadence

Intended to run about once a day. It is not time critical, so favour generous
waits and spacing between downloads over speed.

## Carousels

Each carousel image is its own slot (`<shortcode>_1`, `<shortcode>_2`, …) and
occupies its own grid tile, adjacent in the sequence. Example post with two
images: https://www.instagram.com/p/DS0ovdXklvR/
