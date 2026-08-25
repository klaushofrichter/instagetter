#!/usr/bin/env node
/** Print the slot ids already in S3 (one per line) so extraction can skip them. */
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

async function main() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('Missing required environment variable: S3_BUCKET');
  const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: 'index.json' }));
    const bytes = await out.Body.transformToByteArray();
    for (const m of JSON.parse(Buffer.from(bytes).toString('utf8'))) console.log(m.id);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return; // empty bucket
    throw err;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
