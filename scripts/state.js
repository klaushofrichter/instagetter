#!/usr/bin/env node
/**
 * Read and update the extraction state held in S3 as state.json.
 *
 *   node scripts/state.js                       # print current state
 *   node scripts/state.js --set-cursor <ISO>    # move the backfill cursor older
 *   node scripts/state.js --skip <shortcode>    # never attempt this post again
 *   node scripts/state.js --record <n> <m>      # note counts for the last run
 *
 * --record also stamps lastRunSource from INSTAGETTER_RUN_SOURCE (the cron
 * wrapper sets "cron"), so a run's origin is recorded rather than inferred.
 *
 * The cursor is the takenAt of the oldest post already handled; backfill
 * continues with posts older than it. If state.json is missing it is derived
 * from index.json, so the state is self-healing rather than authoritative.
 */
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.S3_BUCKET;
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

async function getJson(key) {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = await out.Body.transformToByteArray();
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

async function putJson(key, value) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: JSON.stringify(value, null, 2),
    ContentType: 'application/json', CacheControl: 'no-cache',
  }));
}

async function load() {
  const state = (await getJson('state.json')) || {};
  if (!state.backfillCursor) {
    // Derive from what is already stored: the oldest post handled so far.
    const index = (await getJson('index.json')) || [];
    const oldest = index.reduce((a, m) => (!a || m.takenAt < a ? m.takenAt : a), null);
    state.backfillCursor = oldest;
  }
  if (!Array.isArray(state.skipped)) state.skipped = [];
  return state;
}

async function main() {
  if (!BUCKET) throw new Error('Missing required environment variable: S3_BUCKET');
  const args = process.argv.slice(2);
  const state = await load();

  if (args[0] === '--set-cursor') {
    state.backfillCursor = args[1];
    await putJson('state.json', state);
  } else if (args[0] === '--skip') {
    if (!state.skipped.includes(args[1])) state.skipped.push(args[1]);
    await putJson('state.json', state);
  } else if (args[0] === '--record') {
    state.lastRun = new Date().toISOString();
    state.lastNewCount = Number(args[1]) || 0;
    state.lastBackfillCount = Number(args[2]) || 0;
    // The cron wrapper sets this, so a run can be attributed rather than
    // guessed at from upload timestamps alone.
    state.lastRunSource = process.env.INSTAGETTER_RUN_SOURCE || 'manual';
    await putJson('state.json', state);
  }

  console.log(JSON.stringify(state, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
