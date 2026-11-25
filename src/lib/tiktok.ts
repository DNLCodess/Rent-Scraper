const HIT_TTL_MS = 30 * 60_000;
const MISS_TTL_MS = 5 * 60_000;

const cache = new Map<string, { value: string | null; expires: number }>();

/** Test helper: empties the in-memory thumbnail cache. */
export function clearThumbnailCache(): void {
  cache.clear();
}

export function embedUrl(videoId: string): string {
  return `https://www.tiktok.com/embed/v2/${videoId}`;
}

/**
 * Thumbnail for a TikTok video via the public oEmbed endpoint. Never throws:
 * any failure yields null. Hits are cached 30 min, misses 5 min (by video URL).
 */
export async function fetchThumbnail(videoUrl: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(videoUrl);
  if (cached && cached.expires > now) return cached.value;

  let value: string | null = null;
  try {
    const res = await fetchImpl(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`);
    if (res.ok) {
      const body = await res.json();
      if (typeof body?.thumbnail_url === "string" && body.thumbnail_url) value = body.thumbnail_url;
    }
  } catch {
    value = null;
  }
  cache.set(videoUrl, { value, expires: now + (value ? HIT_TTL_MS : MISS_TTL_MS) });
  return value;
}
