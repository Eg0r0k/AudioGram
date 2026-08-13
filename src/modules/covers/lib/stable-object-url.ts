const MAX_ENTRIES = 300;

const cache = new Map<string, { blob: Blob; url: string }>();

/**
 * Object URL that survives component remounts. `useObjectUrl` mints a fresh
 * `blob:` URL on every mount and revokes it on unmount, so each remount hands
 * `<img>` a never-seen-before src — load placeholders and fade-ins replay on
 * every panel switch even though the pixels haven't changed.
 *
 * Caching by entity key keeps the URL string identical while the blob is the
 * same instance (vue-query caches the blob itself), so remounted images render
 * from the browser cache on the first frame. A changed blob (edited cover)
 * revokes the stale URL and mints a new one; an LRU cap bounds the session's
 * live object URLs.
 */
export function stableObjectUrl(key: string, blob: Blob): string {
  const cached = cache.get(key);
  // Same instance, or a refetched blob with identical size/type (vue-query
  // hands out a fresh Blob after staleTime even when the cover is unchanged) —
  // keep the existing URL so the image stays byte-identical to <img>.
  const sameContent = cached
    && (cached.blob === blob
      || (cached.blob.size === blob.size && cached.blob.type === blob.type));

  if (cached && sameContent) {
    cached.blob = blob;
    // Re-insert to keep frequently used entries away from LRU eviction.
    cache.delete(key);
    cache.set(key, cached);
    return cached.url;
  }

  if (cached) URL.revokeObjectURL(cached.url);

  const url = URL.createObjectURL(blob);
  cache.set(key, { blob, url });

  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.entries().next().value;
    if (oldest) {
      URL.revokeObjectURL(oldest[1].url);
      cache.delete(oldest[0]);
    }
  }

  return url;
}
