const REQUIRED_ENV_VARS = [
  'INSTA_API_TOKENS',
  'S3_BUCKET',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
] as const;

export function assertRequiredEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

// The build stamps APP_VERSION via a Docker build-arg; local runs have no
// stamp and report "dev". Read per call rather than at import so tests can
// set it, and so a restart picks up a changed value.
//
// The reported value is deliberately bare (2026.09.03.1). Git tags and image
// tags carry the "v" prefix, machine-readable version fields do not -- SemVer
// treats the "v" as a tag-naming convention rather than part of the value.
// The leading "v" is stripped here as well as omitted by the deploy, so an
// older image built when the build-arg still carried one still reports bare.
export function appVersion(): string {
  const raw = (process.env.APP_VERSION ?? '').trim();
  if (!raw) return 'dev';
  return raw.replace(/^v(?=\d)/, '');
}

// Hops whose X-Forwarded-For is believed. Defaults to loopback plus the k3s
// pod and service ranges, which is the ingress path
// traefik -> kourier/envoy -> queue-proxy -> app. Override with
// TRUSTED_PROXIES (comma separated) if the cluster is ever renumbered; a
// wrong value here is not loud, it just silently mis-attributes every
// rate-limit bucket.
const DEFAULT_TRUSTED_PROXIES = ['loopback', '10.42.0.0/16', '10.43.0.0/16'];

export function trustedProxies(): string[] {
  const raw = (process.env.TRUSTED_PROXIES ?? '').trim();
  if (!raw) return DEFAULT_TRUSTED_PROXIES;
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : DEFAULT_TRUSTED_PROXIES;
}

// Every rate limiter in this service counts in memory, in one process. That is
// only authoritative while exactly one replica is running, which is not a
// property of this repo at all -- it comes from
// `manifests/insta/insta-ksvc.yaml` in kube-setup pinning
// autoscaling.knative.dev/min-scale and max-scale to 1.
//
// Scale that out and each replica keeps its own counters, so a caller's real
// allowance silently becomes N x the configured limit. Nothing errors; the
// limits just quietly stop meaning what they say. The annotation lives in
// another repo from the limiter, so whoever changes it has no reason to look
// here -- hence this check, which turns a silent degradation into a line in
// the log.
//
// MAX_SCALE is named after the annotation it mirrors so the two are obviously
// the same knob.
export function replicaWarning(): string | null {
  const raw = (process.env.MAX_SCALE ?? '').trim();
  if (!raw) {
    return (
      'MAX_SCALE is not set, so the replica count cannot be checked. Rate ' +
      'limits count in memory per process and are only correct at one ' +
      'replica; see autoscaling.knative.dev/max-scale in kube-setup.'
    );
  }
  const count = Number(raw);
  if (!Number.isFinite(count) || count < 1) {
    return `MAX_SCALE is "${raw}", which is not a replica count. Rate limits assume exactly 1.`;
  }
  if (count > 1) {
    return (
      `MAX_SCALE is ${count}, but rate limits count in memory per process: ` +
      `every caller's real allowance is now ${count}x the configured limit. ` +
      'A shared store is required before running more than one replica.'
    );
  }
  return null;
}
