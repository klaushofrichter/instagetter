# instagetter

Service behind **https://insta.skylar.technology**. Serves a public status page
and a bearer-token-protected API. No OAuth, no database — in-memory only.

## Commands

```bash
npm install     # install dependencies
npm run dev     # run with tsx against .env, no build step
npm run build   # compile src/ -> dist/
npm start       # run compiled dist/server.js
npm test        # vitest run
```

## Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /` | public | HTML status page (placeholder for now) |
| `GET /favicon.svg` | public | inline SVG favicon |
| `GET /health` | public | `{"status":"ok"}` — Knative readiness probe |
| `GET /api/status` | **bearer token** | placeholder for the real API |

Protected calls:

```bash
curl https://insta.skylar.technology/api/status \
  -H "Authorization: Bearer $INSTA_API_TOKENS"
```

## Configuration

Copy `.env.example` to `.env`. `INSTA_API_TOKENS` is a comma-separated list of
accepted bearer tokens (rotate by adding the new one, deploying, then dropping
the old). Generate one with `openssl rand -hex 32`. The server refuses to start
if it is unset — see `src/config.ts`.

In the cluster the same variable is supplied from the `insta-secrets` Secret in
the `insta` namespace via `envFrom`.

## Deployment

A promotion flow, same as `steps-service`:

1. Push to `main` → tests run, image published to
   `ghcr.io/klaushofrichter/instagetter` (`latest` + commit SHA).
2. Open a PR into `production` → mandatory checks: tests, build, and a CodeQL
   scan that fails on any finding. Branch protection requires them to pass.
3. Merge into `production` → the self-hosted k3s runner builds the image,
   updates the image tag in `kube-setup`'s `manifests/insta/insta-ksvc.yaml`,
   applies it to `ksvc/insta`, waits for rollout, and smoke-tests `/health`
   and `/`.

Cluster manifests live in the separate `kube-setup` repo, not here.
