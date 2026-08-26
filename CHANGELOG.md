# Changelog

Notable changes to instagetter. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

A release is cut when a change reaches the `production` branch. The version
here, the git tag, the GitHub release and the container image tag all refer to
the same build.

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

[Unreleased]: https://github.com/klaushofrichter/instagetter/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/klaushofrichter/instagetter/releases/tag/v1.0.0
