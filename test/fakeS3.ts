import { ImageMeta } from '../src/types';
import { setClient } from '../src/s3';

export function meta(id: string, takenAt: string, extra: Partial<ImageMeta> = {}): ImageMeta {
  return {
    id,
    shortcode: id.split('_')[0],
    imgIndex: Number(id.split('_')[1] ?? 1),
    imgCount: 1,
    caption: 'caption for ' + id,
    hashtags: [],
    location: null,
    takenAt,
    likes: 1,
    comments: 0,
    width: 1440,
    height: 1440,
    postUrl: 'https://www.instagram.com/p/' + id.split('_')[0] + '/',
    extractedAt: '2026-08-25T00:00:00.000Z',
    ...extra,
  };
}

/** Installs a fake S3 that serves the given index and 1-byte image bodies. */
export function installFakeS3(index: ImageMeta[], opts: { failFor?: string[] } = {}): void {
  const fail = new Set(opts.failFor ?? []);
  setClient({
    send: async (cmd: { input: { Key: string } }) => {
      const key = cmd.input.Key;
      if (fail.has(key)) throw new Error('simulated failure for ' + key);
      const payload =
        key === 'index.json' ? Buffer.from(JSON.stringify(index)) : Buffer.from([0xff, 0xd8, 0xff]);
      return { Body: { transformToByteArray: async () => new Uint8Array(payload) } };
    },
  } as never);
}
