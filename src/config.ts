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
