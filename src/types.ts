export interface ImageMeta {
  /** `<shortcode>_<NN>` — one slot per carousel image. */
  id: string;
  shortcode: string;
  imgIndex: number;
  imgCount: number;
  caption: string;
  hashtags: string[];
  location: string | null;
  /** ISO 8601, from the post's <time datetime>. Drives ordering and eviction. */
  takenAt: string;
  likes: number | null;
  comments: number | null;
  width: number;
  height: number;
  postUrl: string;
  extractedAt: string;
}

export function sortNewestFirst(items: ImageMeta[]): ImageMeta[] {
  return [...items].sort(
    (a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime() || a.id.localeCompare(b.id),
  );
}
