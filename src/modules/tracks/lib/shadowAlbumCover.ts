import { coverRepository } from "@/db/repositories";
import { getLogger } from "@/lib/logger";
import { sources } from "@/modules/sources";
import type { AlbumId, TrackId } from "@/types/ids";
import { parseTrackRef } from "@/types/track-ref";
import { unwrapResult } from "@/queries/shared";

/**
 * Gives a freshly pinned shadow album a cover: fetches the source-proxied
 * artwork for `coverRef` and stores the blob in the covers table, so the
 * album renders like a local one on library pages. Idempotent (an existing
 * cover wins) and strictly best-effort — a failed fetch leaves the album
 * cover-less, never breaks the pin.
 */
export async function ensureShadowAlbumCover(albumId: AlbumId, coverRef: string): Promise<void> {
  const kind = parseTrackRef(albumId as unknown as TrackId).kind;
  if (kind === "local") return;

  try {
    const existing = await unwrapResult(coverRepository.findByOwner("album", albumId));
    if (existing) return;

    const response = await fetch(sources.get(kind).coverUrl(coverRef));
    if (!response.ok) return;
    const blob = await response.blob();
    if (blob.size === 0) return;

    await unwrapResult(coverRepository.upsertAlbumCover(albumId, blob));
  }
  catch (error) {
    getLogger().warn(`[Covers] Shadow album cover failed for ${albumId}: ${String(error)}`);
  }
}
