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
