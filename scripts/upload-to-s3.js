#!/usr/bin/env node
/**
 * Upload a staged extraction to S3.
 *
 * Local-only: depends on `sharp` (devDependency) and the `exiftool` binary,
 * neither of which ships in the container. The service only ever reads S3.
 *
 *   node scripts/upload-to-s3.js --staging <dir> [--dry-run]
 *
 * <dir> must contain manifest.json (an array of ImageMeta) and one
 * <id>.jpg per entry.
 */
const { promises: fs } = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sharp = require('sharp');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');

const execFileAsync = promisify(execFile);

const KEEP_IN_S3 = Number(process.env.S3_KEEP) || 999;
const THUMB_WIDTH = 640;

function parseArgs(argv) {
  const args = { staging: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--staging') args.staging = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function readIndex(s3, bucket) {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: 'index.json' }));
    const bytes = await out.Body.transformToByteArray();
    const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return [];
    throw err;
  }
}

/** Mirror the sidecar metadata into the JPEG so downloads are self-describing. */
async function embedExif(file, meta) {
  const args = ['-overwrite_original', '-P'];
  if (meta.caption) {
    args.push(`-EXIF:ImageDescription=${meta.caption}`);
    args.push(`-IPTC:Caption-Abstract=${meta.caption}`);
    args.push(`-XMP-dc:Description=${meta.caption}`);
  }
  args.push('-XMP-dc:Creator=Klaus Hofrichter', '-EXIF:Artist=Klaus Hofrichter');
  for (const tag of meta.hashtags || []) {
    args.push(`-XMP-dc:Subject+=${tag}`, `-IPTC:Keywords+=${tag}`);
  }
  if (meta.takenAt) {
    const stamp = meta.takenAt.replace('T', ' ').replace(/\..*$/, '').replace(/-/g, ':');
    args.push(`-EXIF:DateTimeOriginal=${stamp}`, `-XMP-photoshop:DateCreated=${meta.takenAt}`);
  }
  if (meta.location) {
    args.push(`-IPTC:Sub-location=${meta.location}`, `-XMP-photoshop:City=${meta.location}`);
  }
  if (meta.postUrl) args.push(`-XMP-dc:Source=${meta.postUrl}`);
  args.push(file);
  await execFileAsync('exiftool', args);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.staging) throw new Error('usage: upload-to-s3.js --staging <dir> [--dry-run]');

  const bucket = requireEnv('S3_BUCKET');
  const region = process.env.AWS_REGION || 'us-east-1';
  const s3 = new S3Client({ region });

  const manifestPath = path.join(args.staging, 'manifest.json');
  const staged = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!Array.isArray(staged) || staged.length === 0) {
    console.log('manifest.json is empty — nothing to upload.');
    return;
  }

  const existing = await readIndex(s3, bucket);
  const known = new Set(existing.map((m) => m.id));
  const fresh = staged.filter((m) => !known.has(m.id));
  console.log(`${staged.length} staged, ${fresh.length} new (${staged.length - fresh.length} already in S3)`);

  const uploaded = [];
  for (const meta of fresh) {
    const file = path.join(args.staging, `${meta.id}.jpg`);
    let bytes;
    try {
      bytes = await fs.readFile(file);
    } catch {
      console.error(`  ! ${meta.id}: no image file at ${file} — skipping`);
      continue;
    }

    const probe = await sharp(bytes).metadata();
    meta.width = probe.width;
    meta.height = probe.height;

    if (args.dryRun) {
      console.log(`  (dry-run) ${meta.id} ${probe.width}x${probe.height}`);
      uploaded.push(meta);
      continue;
    }

    await embedExif(file, meta);
    const withExif = await fs.readFile(file);
    const thumb = await sharp(withExif)
      .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 80 })
      .toBuffer();

    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: `images/${meta.id}.jpg`, Body: withExif, ContentType: 'image/jpeg',
    }));
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: `thumbs/${meta.id}.jpg`, Body: thumb, ContentType: 'image/jpeg',
    }));
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: `meta/${meta.id}.json`, Body: JSON.stringify(meta, null, 2),
      ContentType: 'application/json',
    }));
    uploaded.push(meta);
    console.log(`  + ${meta.id} ${probe.width}x${probe.height}`);
  }

  const merged = [...existing, ...uploaded].sort(
    (a, b) => new Date(b.takenAt) - new Date(a.takenAt) || a.id.localeCompare(b.id),
  );
  const keep = merged.slice(0, KEEP_IN_S3);
  const drop = merged.slice(KEEP_IN_S3);

  if (drop.length && !args.dryRun) {
    const objects = drop.flatMap((m) => [
      { Key: `images/${m.id}.jpg` },
      { Key: `thumbs/${m.id}.jpg` },
      { Key: `meta/${m.id}.json` },
    ]);
    for (let i = 0; i < objects.length; i += 1000) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: bucket, Delete: { Objects: objects.slice(i, i + 1000) },
      }));
    }
    console.log(`pruned ${drop.length} slot(s) beyond the newest ${KEEP_IN_S3}`);
  } else if (drop.length) {
    console.log(`(dry-run) would prune ${drop.length} slot(s)`);
  }

  if (!args.dryRun) {
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: 'index.json', Body: JSON.stringify(keep, null, 2),
      ContentType: 'application/json', CacheControl: 'no-cache',
    }));
  }
  console.log(`index.json now lists ${keep.length} slot(s)`);
}

main().catch((err) => {
  console.error('upload failed:', err.message);
  process.exit(1);
});
