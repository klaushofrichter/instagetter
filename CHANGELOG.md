# Changelog

Versions are **generated at deploy time**, not carried in the sources: a merge
into `production` is tagged `vYYYY.MM.DD.N`, where `N` counts that day's
releases. Nothing needs bumping and nothing can be forgotten.

Each release's notes are assembled from the commits since the previous one,
preceded by anything curated under Unreleased below. The full history lives on
the [releases page](https://github.com/klaushofrichter/instagetter/releases);
this file is where notes are written *before* a release, not an archive of them.

<!-- Anything written under Unreleased is prepended to the next release's
     notes. Keep prose out of it unless you mean it to be published. -->
## [Unreleased]

### Security

- The last outstanding advisories are cleared: `qs` is pinned to ^6.16.0 through
  an `overrides` entry, taking `npm audit` to zero. No express release on either
  major ships a fixed `qs`, so the override is the only route.
- `isValidId()` now rejects non-strings. `RegExp.test()` coerces, so
  `isValidId(undefined)` previously returned **true** — it matched the string
  `"undefined"` — and a single-element array matched its own contents.

### Security

- Dependency security baseline: Dependabot alerts and automated security fixes
  enabled, `.github/dependabot.yml` covering npm, GitHub Actions and Docker, and
  `npm audit --audit-level=high` as a blocking step inside the required `test`
  check.
- PR checks now run on pull requests into `main`, not only `production`. A PR
  into `main` previously ran nothing at all, so dependency updates landed
  unverified.
- `vitest` 2 -> 4, clearing a critical advisory (arbitrary file read and execute
  via the Vitest UI server) and a high one in the bundled `vite` (path
  traversal). Test-only dependencies, never shipped in the image, but they run
  on CI runners with repository credentials in scope.

### Changed

- The service now lives at **insta.klaushofrichter.net**. The old address,
  `insta.skylar.technology`, permanently redirects there and will keep doing so
  indefinitely, so existing links and bookmarks continue to work -- including
  deep links, since the redirect preserves the path and query string.

### Fixed

- The first row of thumbnails no longer waits on lazy-loading. The largest
  image on screen *is* the first thumbnail, so deferring it delayed the very
  paint the metric measures.

- Links in dark mode were too faint to meet WCAG AA (3.7:1 against the required
  4.5:1). The accent is lightened in dark mode only; light mode is unchanged.

- A restart no longer shows the loading screen while every thumbnail downloads.
  The gallery is usable as soon as the index arrives -- about a second and a
  half -- and the pictures fill in behind it, newest pages first. Previously
  the wait grew with the size of the whole archive rather than the cache.

- The detail view no longer shows the *previous* picture while the next one
  loads. An `<img>` keeps painting its old bitmap until the new one decodes,
  which was invisible when every image came off local disk in milliseconds and
  obvious once archive images arrived from S3. The image is now blanked to the
  themed stage background the moment you navigate, so the picture never
  contradicts the caption beside it.

### Added

- The gallery now browses the **whole** S3 archive, not just the locally cached
  window. Every thumbnail is held on disk, so grid pagination stays instant at
  any depth; full images outside the newest `CACHE_LIMIT` are fetched from S3 on
  demand, adding roughly half a second the first time one is opened.
- Holding an arrow key now scrubs through the archive without fetching the
  full-size images as they fly past, so browsing cannot exhaust the server's
  own archive rate budget. The image loads as soon as you stop.
- Neighbouring images are prefetched after a short pause, so a settled reader
  steps through the archive instantly. Holding a key skips the prefetch rather
  than tripling the request rate.
- `ARCHIVE_RATE_LIMIT` (default 120/min per IP), a second rate budget counting
  only full images that are not on disk. Cached images are never counted, so
  ordinary browsing is unaffected.
- Open Graph tags on the gallery page, so a pasted link unfurls with the newest
  image as its preview. Before the first refresh the page falls back to a
  text-only card rather than pointing at an image the service cannot serve.
- `robots.txt` now allows every crawler, and the page no longer carries
  `noindex, nofollow`. The gallery is meant to be found; blocking indexing also
  stopped Slack and X unfurling a pasted link, since both read `robots.txt`
  first.
- A meta description, so search results and previews have something to quote.
- Responses are gzipped. The page is ~42KB of inline CSS and JS and was going
  out uncompressed; it is now ~13KB on the wire, and the image catalog shrinks
  with it. JPEG bytes are left alone.

## [1.0.0] - 2026-08-25

First production release: the gallery behind
[insta.skylar.technology](https://insta.skylar.technology).

### Added

- Responsive gallery: three-column grid on desktop, a single stacked column on
  narrow screens, nine per page with pagination.
- Detail view with the full-resolution image, caption, date, location,
  dimensions and links, condensed to three centred lines.
- Fullscreen showing the picture alone, scaling small originals up and large
  ones down while keeping the aspect ratio. `space` toggles a metadata overlay.
- Navigation by cursor keys, swipes and tap zones, all sharing one rate limit of
  three steps per second.
- Deep links: `?page=N` / `?image=N` by position, or by Instagram shortcode for
  a reference that survives newer uploads. The address bar tracks the current
  view.
- Light and dark themes following the system setting, with a manual toggle
  remembered per browser.
- About panel behind an `(i)` button, with a navigation hint and the content
  timestamp.
- S3-backed storage: full-resolution images with EXIF/IPTC embedded, generated
  thumbnails and sidecar metadata, indexed by a single `index.json`.
- Local cache of the newest 99 images, evicted by post date, refilled from S3 at
  startup with a progress display.
- `/extract-instagram` skill driving the local logged-in Chrome, running nightly
  from cron: new posts first, then twelve older ones from a persisted cursor.
- MIT licence.

### Fixed

- Carousel slides fetched with `?img_index=N`; the bare post URL renders a blank
  frame under automation, which had made two posts look unextractable.
- Downloads verified on disk after every fetch — a blocked download otherwise
  reported success while writing nothing.
- Fullscreen on iOS, where no element Fullscreen API exists, falls back to a
  fixed viewport-filling stage.
- Slot ids validated where the filesystem is touched, not only at the route
  (CodeQL `js/path-injection`).
- Likes are no longer displayed: the count is only true at the moment of
  extraction.

### Security

- CodeQL results upload to code scanning, and the check is required for merging
  into `production`.
- Container runs Node 24 LTS.

[1.0.0]: https://github.com/klaushofrichter/instagetter/releases/tag/v1.0.0

_1.0.0 was the last hand-numbered release; everything after it is dated._
