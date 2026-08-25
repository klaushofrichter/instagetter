import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ImageMeta } from './types';

let client: S3Client | null = null;

export function getClient(): S3Client {
  if (!client) {
    client = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return client;
}

/** Test seam — lets the suite run without touching the network. */
export function setClient(c: S3Client | null): void {
  client = c;
}

function bucket(): string {
  return process.env.S3_BUCKET ?? '';
}

async function getBytes(key: string): Promise<Buffer> {
  const out = await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const body = out.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) throw new Error(`empty body for ${key}`);
  return Buffer.from(await body.transformToByteArray());
}

/**
 * The upload script maintains index.json so a refresh is one GET rather than
 * one per slot.
 */
export async function fetchIndex(): Promise<ImageMeta[]> {
  const raw = await getBytes('index.json');
  const parsed = JSON.parse(raw.toString('utf8'));
  if (!Array.isArray(parsed)) throw new Error('index.json is not an array');
  return parsed as ImageMeta[];
}

export function fetchImage(id: string): Promise<Buffer> {
  return getBytes(`images/${id}.jpg`);
}

export function fetchThumb(id: string): Promise<Buffer> {
  return getBytes(`thumbs/${id}.jpg`);
}
