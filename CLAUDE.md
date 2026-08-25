# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

The service behind `insta.skylar.technology`. Scaffolded from the sibling
`steps-service` repo and deliberately minimal: a public HTML page, a public
`/health` endpoint, and a token-protected API surface that is still a
placeholder. The actual feature set is yet to be designed — do not invent it.

Unlike `steps-service` there is **no OAuth and no session layer**: the page is
public, and the only credential is the bearer token.

## Commands

```bash
npm install
npm run dev     # tsx --env-file=.env src/server.ts
npm run build   # tsc -> dist/
npm test        # vitest run
```

Run one file: `npx vitest run test/api.test.ts`. No lint command is configured.

## Architecture

Plain Express, composed in `src/app.ts` (`createApp()`), listened to by
`src/server.ts`. Three routers:

- `src/routes/health.ts` — `GET /health`, static `{status:"ok"}`. Public, and
  used as the Knative readiness probe — keep it dependency-free and unauthenticated.
- `src/routes/api.ts` — everything under `/api`, gated by
  `requireToken('INSTA_API_TOKENS')` plus a rate limit. New API endpoints go
  here so they inherit the gate.
- `src/routes/index.ts` — `GET /` (public page from `src/views/page.ts`) and
  the inline SVG favicon.

`src/middleware/requireToken.ts` compares the `Authorization: Bearer` value
against a comma-separated env list using `timingSafeEqual` (length-checked
first, since `timingSafeEqual` throws on unequal buffers). Copied verbatim from
`steps-service` — keep them in sync if either changes.

`src/config.ts` asserts required env vars at boot so a misconfigured deploy
fails fast instead of serving 401s. Tests set env in `test/setup.ts`.

`src/views/page.ts` returns a complete HTML string — no templating engine. It
is a placeholder pending design.

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

## Secrets

- `INSTA_API_TOKENS` — runtime, from the `insta-secrets` Secret in the `insta`
  namespace via `envFrom`. Also in the local `.env` (gitignored).
- `KUBE_SETUP_DEPLOY_TOKEN` — a GitHub PAT stored as a repository secret, used
  only by `deploy-production.yml` to push the manifest bump to `kube-setup`.
