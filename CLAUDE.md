# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

The service behind `insta.skylar.technology`. It renders an Instagram-like
gallery of the newest images from the `klaushofrichter` account, reading them
from S3. There is no database and no persistence: S3 is the source of truth and
the local cache is disposable.

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
- `src/cache.ts` — the whole state layer. Pulls `index.json` from S3, downloads
  what is missing, evicts anything outside the newest `maxCached()` **by post
  date, not by last access**. Concurrent refreshes share one in-flight promise
  rather than racing on the cache directory; a single bad object is skipped
  rather than aborting the run. `resetCache()` exists for test isolation.
- `src/s3.ts` — thin S3 wrapper. `setClient()` is the test seam; the suite never
  touches the network (see `test/fakeS3.ts`).
- `src/views/page.ts` — the entire UI as one HTML string, no templating engine.
  Client JS deliberately avoids template literals so it can live inside a TS
  template literal without escaping traps.

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

A merge into `production` cuts a release: the deploy tags the image
`v<version>` from `package.json`, moves `latest`, and — once the rollout is
verified — creates the git tag and GitHub release, taking the notes from that
version's section of `CHANGELOG.md`.

So a change destined for production wants two things in the PR: a bumped
`version` and a matching `CHANGELOG.md` section. Forgetting is not fatal — the
release step sees the tag already exists and skips rather than failing — but the
release then covers more than its notes describe.

`latest` deliberately follows `production`, not `main`. It previously tracked
`main`, which meant pulling `latest` gave a build that had never been deployed.

## Secrets

- `INSTA_API_TOKENS` — runtime, from the `insta-secrets` Secret in the `insta`
  namespace via `envFrom`. Also in the local `.env` (gitignored).
- `KUBE_SETUP_DEPLOY_TOKEN` — a GitHub PAT stored as a repository secret, used
  only by `deploy-production.yml` to push the manifest bump to `kube-setup`.

## Cluster prerequisites

These are one-time and already done, but a deploy silently fails without them —
worth knowing if this pattern gets copied to a new service:

- **A per-repo runner must exist.** `deploy-production.yml` targets
  `[self-hosted, k3s]`, and runners in this cluster are registered per
  repository, not shared. Without one the job queues forever with no error.
  Ours is `manifests/instagetter-runner/` in `kube-setup` (derived from
  `bulbs-runner`), registered as `instagetter-in-cluster-runner` via a
  `runner-pat` Secret holding a GitHub PAT.
- **The host needs an entry in the kourier gateway Ingress**
  (`manifests/networking/knative-gateway-ingress.yaml`): both a host rule and
  a `tls` entry (`insta-skylar-technology-tls`). The DomainMapping alone is
  not enough — without the Ingress entry cert-manager issues no certificate
  and Traefik does not route, so the deploy "succeeds" into an unreachable
  service.
- **The ghcr package must be pullable by the cluster.** There are no image
  pull secrets anywhere in this cluster, so `ghcr.io/klaushofrichter/instagetter`
  is public even though the repo is private. If it is ever made private again,
  the pull needs a `dockerconfigjson` secret built from a **classic** PAT with
  `read:packages` — ghcr does not accept fine-grained PATs at all.

Failure mode to recognise: a revision stuck in `ContainerMissing` after a
failed image pull stays stuck. Knative does not retry digest resolution, and
re-applying an identical manifest creates no new revision — delete the ksvc and
re-apply. Normal deploys avoid this because each carries a new SHA tag.

## Extraction

`/extract-instagram` (`.claude/skills/extract-instagram.md`) drives the user's
local Chrome. It cannot run in the container or a cloud agent. That file records
the DOM traps — no `<article>` on post pages, ~2.5s hydration delay, the
"More posts" thumbnails that a loose selector will silently mistake for the
post's own images — and the standing constraint that Instagram's private API is
off-limits by the user's decision.

Scope is deliberately small: newest posts only, never a bulk scrape.

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

