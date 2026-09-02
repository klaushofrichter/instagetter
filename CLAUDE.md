# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

The service behind `insta.klaushofrichter.net`. It renders an Instagram-like
gallery of the newest images from the `klaushofrichter` account, reading them
from S3. There is no database and no persistence: S3 is the source of truth and
the local cache is disposable.

The host moved from `insta.skylar.technology` on 2026-09-02. The old name is
**not** retired: traefik serves a permanent 301 to the new one, and that stays
in place indefinitely (a year at minimum). Nothing in this repo implements the
redirect -- it is `manifests/insta/insta-legacy-redirect.yaml` in `kube-setup`,
tracked in that repo's issue #2. What matters here is that any script or
workflow pointing at the old host gets a 301, and `curl` does not follow
redirects by default: that is exactly how the nightly `/api/refresh` POST and
the deploy smoke test would have broken silently.

The page is **public** by deliberate choice, with `robots.txt` disallowing
crawlers. There is no OAuth and no session layer; the only credential is the
bearer token on `/api/status`.

## Commands

```bash
npm install
npm run dev     # tsx --env-file=.env src/server.ts
npm run build   # tsc -> dist/
npm test        # vitest run
```

Run one file: `npx vitest run test/api.test.ts`. No lint command is configured.

## Architecture

Plain Express, composed in `src/app.ts` (`createApp()`). `trust proxy` is on
because the per-IP rate limits sit behind kourier/traefik.

- `src/routes/gallery.ts` — the gallery API: `/api/images`, `POST /api/refresh`,
  and `/thumb|/image|/download/:id.jpg`. All public.
- `src/routes/health.ts` — `/health`, the Knative readiness probe. Keep it
  dependency-free and unauthenticated.
- `src/routes/api.ts` — token-gated `/api/*` placeholder.
- `src/routes/index.ts` — `/`, `/robots.txt`, favicon.
- `src/cache.ts` — the whole state layer. Pulls `index.json` from S3 and caches
  what is missing. Concurrent refreshes share one in-flight promise rather than
  racing on the cache directory; a single bad object is skipped rather than
  aborting the run. `resetCache()` exists for test isolation. See **Two tiers**
  below — the disk cache and what the gallery advertises are not the same set.
- `src/s3.ts` — thin S3 wrapper. `setClient()` is the test seam; the suite never
  touches the network (see `test/fakeS3.ts`).
- `src/views/page.ts` — the entire UI as one HTML string, no templating engine.
  Client JS deliberately avoids template literals so it can live inside a TS
  template literal without escaping traps.

### Two tiers: the catalog and the disk cache

The gallery advertises **every** slot in `index.json`; the disk holds less than
that. These were one thing originally, and separating them is what let the
archive grow past the cache size without growing the cache.

- **Catalog** — the full sorted index, metadata only, in memory. This is what
  `/api/images` returns, so pagination reaches the whole archive.
- **Thumbnails** — *all* of them on disk. At ~76KB against ~327KB for a full
  image, the entire thumb set is ~74MB even at the `S3_KEEP=999` ceiling, so
  caching the lot is cheap and grid pagination never waits on S3.
- **Full images** — only the newest `maxCached()` (99), evicted **by post date,
  not by last access**, so a frequently viewed old image still ages out.

#### Startup is staged, and nothing waits for it

`refresh()` publishes the catalog as soon as `index.json` lands, before
downloading a single picture. The catalog is the **only** blocking dependency:
`readOrFetch()` falls back to S3 for a thumbnail as readily as for a full
image, so a slot that has not been warmed yet still renders, just slower.
Waiting for every thumbnail meant a restart showed the loading screen for as
long as the whole archive took -- a time that grows with `S3_KEEP`, not with
the cache size. Measured against the live bucket at 122 slots: the catalog is
live **1.5s** after start, with 0 of 221 files warmed.

Warming then runs in the order a visitor needs things, not index order:

1. thumbnails for the first `WARM_HEAD_PAGES` grid pages -- the landing view
2. full images for the first page -- the likely first click
3. the rest of the thumbnails and full images inside the cache window, which
   have to exist on disk anyway
4. the remaining archive thumbnails, **paced** by `WARM_TAIL_DELAY_MS`

Steps 1-3 run `WARM_CONCURRENCY` at a time because someone is waiting for
them. Step 4 is serial, paced, and deliberately **not awaited** -- those
thumbnails already serve from S3 on demand, so warming them only makes deep
pagination quick. Awaiting it would make `POST /api/refresh` hang for as long
as the archive takes (minutes at the `S3_KEEP` ceiling) and would saturate the
uplink while it did. A `warmGeneration` counter makes a superseded tail
abandon itself rather than write files a newer refresh has already ruled on.

Because the tail outlives the promise, `progress.loading` is cleared by
whichever finishes last -- not by a `finally` around the refresh.

`readOrFetch()` serves an out-of-window full image straight from S3. It
deliberately **does not write it to disk**: persisting on-demand fetches would
break eviction-by-date and let the cache grow without bound until the next
refresh. It also refuses ids absent from the catalog, so an arbitrary id cannot
make the service issue S3 GETs.

The cost of that fallback is latency, not money. Measured warm from the cluster
to `us-east-1`: **590–755ms** for a ~327KB image, once per image per browser
(`Cache-Control: immutable` covers repeats). Egress for the whole 999-slot
archive is ~400MB — about four cents, and inside the 100GB/month free tier.
What actually changes is the abuse surface: before, a client could only ever
pull the 99 local files: bounded and free. `browseRateLimit` is now the thing
holding that line.

### Why index.json

A refresh is one GET of `index.json` rather than one per slot. The upload script
maintains it. If it drifts from the actual objects, the service skips slots
whose bytes fail to download rather than failing the refresh.

### Rate control

`POST /api/refresh` is capped at one per 5s per IP **server-side**
(`src/middleware/refreshRateLimit.ts`), not merely by disabling the button — a
client ignoring the UI still cannot hammer S3. Browsing limits
(`browseRateLimit.ts`) are deliberately generous: one grid page pulls nine
thumbnails, so a tight limit would throttle normal viewing.

That generosity stopped being safe once a request could reach S3. 600/min of
~327KB archive images is ~196MB/min of egress per IP, so
`archiveRateLimit.ts` adds a second budget (default 120/min per IP) that counts
**only full images not already on disk**. It decides with the synchronous
`isLocalImage()` before the handler runs, so serving a cached image is never
counted and paging through the newest 99 is unaffected at any speed. 120/min
sits above realistic browsing -- the client's own 334ms step floor caps a held
arrow key near 180/min -- while bounding egress to ~39MB/min per IP. The per-IP
map is pruned above 1000 entries, since the key space on a public endpoint is
every IP that ever asks.

The budget is **below what the UI itself can generate** -- the 334ms navigation
floor allows 180/min against the 120/min limit -- so the client must not spend
it on images nobody looks at. `showImage()` therefore loads on the leading edge
and then debounces: a deliberate single step fetches at once, but steps
arriving inside 500ms of each other defer the fetch until the reader stops.
Holding an arrow key scrubs through the metadata and fetches nothing. Raising
the server budget instead would have been the wrong fix: it raises the ceiling
for a hostile client just as much, and 200/min of ~327KB images is ~65MB/min
per IP sustained.

Note when measuring this in a browser: Chrome clamps timers to 1000ms in a
hidden tab, so a scripted `setInterval` "scrub" silently runs at 1/s and takes
the immediate path. Use a synchronous busy-wait to get real spacing.

## CI/CD

- `build-push.yml` — push to `main`: tests, then publish
  `ghcr.io/klaushofrichter/instagetter` (`latest` + SHA).
- `production-checks.yml` — PRs into `production`: tests, build, CodeQL.
  SARIF upload is disabled (no GitHub Advanced Security on this private repo);
  findings are counted locally with `jq` and any finding fails the job.
- `deploy-production.yml` — push to `production`, on the self-hosted k3s
  runner: build/push the SHA image, clone `kube-setup`, rewrite the image tag
  in `manifests/insta/insta-ksvc.yaml`, commit/push it, `kubectl apply`, wait
  for `ksvc/insta` readiness, then smoke-test `/health` and `/`.

Merging to `main` only publishes an image; promoting `main` into `production`
is what actually deploys. Cluster manifests live in `kube-setup`
(`manifests/insta/`), not in this repo.

### Releasing

A merge into `production` cuts a release. The version is generated in the
workflow as `vYYYY.MM.DD.N` — the date in Central time, plus a counter over the
releases that already exist for that day. The existing tags are the only state,
so nothing is stored and nothing needs bumping. `package.json` deliberately
carries no `version` field.

Notes come from the commits since the previous release, preceded by anything
under `## [Unreleased]` in `CHANGELOG.md`. The release step runs after
`Verify rollout`, so a failed deploy produces no release, and the checkout uses
`fetch-depth: 0` because the notes are computed from history and tags.

`latest` deliberately follows `production`, not `main`. It previously tracked
`main`, which meant pulling `latest` gave a build that had never been deployed.

### The skill must be a directory, not a flat file

`.claude/skills/extract-instagram/SKILL.md` — **not** `.claude/skills/extract-instagram.md`.
A flat `.md` file sits there looking correct and is silently never registered:
`claude -p` asked whether the skill was available answered "NO ... exists as a
project file but is not registered as an invocable skill". After moving it into
a directory as `SKILL.md`, the same probe answers "YES". Worth re-checking with
that one-line probe after any change to the skill's location or frontmatter,
because nothing else reports the failure — the nightly job would simply run and
do nothing.

### Nightly run

`scripts/nightly-extract.sh` runs from the user's crontab at `48 2 * * *`
(the machine is `America/Chicago`, so that is already CT):

- cron has almost no environment, so PATH is set explicitly — node lives under
  nvm, claude under `~/.local/bin`.
- Tool authority is a named `--allowed-tools` allowlist, deliberately not a
  blanket permission bypass, so the user's settings and hooks still apply.
- `flock` prevents overlapping runs; logs land in `logs/` (gitignored) and are
  pruned after a fortnight.
- It sits eighteen minutes after an existing Home Assistant backup job at 02:30.

**The cron run needs `--chrome`.** Without it the Claude-in-Chrome tools are
simply absent and the run does nothing. `claude mcp list` does not show
`claude-in-chrome` — it is not an MCP server, but the extension bridging over
native messaging (see the `--chrome-native-host` process) — which made it look
as though a `claude -p` run could never reach the browser. It can: `claude -p
--chrome` exposes all of the browser tools. The first cron run (2026-08-26
02:48) failed for exactly this reason, fired on time and extracted nothing.

Two consequences worth keeping:

- The wrapper exits 2 when a run records nothing, because that first run
  reported exit 0 while doing nothing — the worst outcome, since it looks
  healthy in every log.
- `select_browser` and `list_connected_browsers` are in the allowlist. A run
  without them cannot pin the local Linux browser and takes whichever is
  default; with a macOS browser also connected that is luck, not choice, and an
  unlucky night drives a logged-out profile.

### Model and cost

The nightly run uses `--model opus` at **default effort**. Both alternatives
tried so far were worse, and both were worse for the same reason:

| Run | Time | Turns | Cost |
|---|---|---|---|
| Opus 5, default, 2026-08-26 | 9.5 min | **67** | $3.32 |
| Sonnet 5, 2026-08-27 | 20.7 min | 150 | $3.81 |
| Opus 5, `--effort low`, 2026-08-28 | 12.0 min | 88 | $4.38 |

**The lesson: for an agentic loop, cheaper per-token rates and lower effort do
not mean cheaper runs. Turn count drives consumption, and turn count is
model- and effort-dependent.**

Sonnet was predicted at ~40% of Opus and came in at 115%: 150 turns against 67,
and every extra turn in an agentic loop re-reads the whole cached context.
`--effort low` was then tried on the theory that fewer, more consolidated tool
calls would cut turns. It did the opposite — 88 turns — so the run got more
expensive, not less. The Haiku estimate from the original table rested on the
same bad assumption and should be treated as **unknown until measured**; a
weaker model plausibly needs more turns still, and it has a 200K context window
against 1M.

#### Reading those cost figures

Two caveats, both learned by checking rather than assuming:

- **They are not money billed.** The cron job exports no `ANTHROPIC_API_KEY`, so
  it runs on the stored OAuth subscription credentials. `total_cost_usd` — which
  `scripts/format-stream.py` passes through verbatim from the CLI result event,
  it is not computed here — is a *notional* pay-as-you-go equivalent. The real
  constraint is subscription usage, not dollars. The numbers are still valid for
  comparing runs against each other, which is all they are used for.
- **Only instrumented runs have token detail.** Token logging was added in
  `91034ef`, for the Sonnet run. The 2026-08-26 Opus baseline predates it and
  logged only turns, duration and cost — it has no `cache_read` figure, and an
  earlier version of this table cited one that is not in the log. Do not quote
  per-token detail for that run.

Sonnet's output quality was fine: 16 slots including a 5-slide carousel
completed in full, sensible captions and locations, no thumbnails. The risk
worth watching turned out to be cost, not correctness — but the correctness risk
is still real, because the no-op guard catches a run that records nothing, not
one that records twelve images with wrong captions.

`scripts/format-stream.py` logs the token totals and turn count per run, which
is what made this measurable. **Turns is the number to compare** (baseline: 67).

Output streams as NDJSON through `scripts/format-stream.py`. Buffered output
made a twelve-minute extraction look identical to a hang, and cost a run that
had already succeeded.

The run needs Chrome open and logged in. If the machine is asleep the night is
simply missed, which is harmless: the cursor in `state.json` means the next run
resumes exactly where it stopped.

### Carousels: always use ?img_index=N

Fetch each carousel slide by URL — `https://www.instagram.com/p/<code>/?img_index=<n>`
— rather than clicking the Next control.

This is not merely tidier, it is the difference between working and not. Some
carousels render a **blank grey image frame** in the automation context: the
caption, location, likes and the slide dots all appear, but no image ever
loads, on a fresh tab, across repeated attempts, with no console error. The
same post shows its images normally in the user's own browser window. Two posts
were written off as unextractable on that basis. Adding `?img_index=N` loads
every slide instantly — `waitedMs: 0` on all six slides of a post that had
never rendered one.

It is also faster and steadier than clicking through: no click, no wait for the
slide transition, and no burst of decodes to stall the renderer.

Slide count comes from the dots in the DOM; `?img_index=N` beyond the end
simply shows the last slide, so stop when the image bytes repeat.

