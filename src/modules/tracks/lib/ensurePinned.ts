import { toRaw } from "vue";
import { db } from "@/db";
import type { PinnedFlag } from "@/db/entities";
import { albumRepository, artistRepository, trackRepository } from "@/db/repositories";
import { unitOfWork } from "@/db/unit-of-work";
import { getLogger } from "@/lib/logger";
import { indexImportedTracks } from "@/modules/search/searchIndex";
import { buildRemoteShadowEntities, substituteLocalArtists, type RemotePinExisting } from "@/services/entity-resolver";
import type { Track } from "@/modules/player/types";
import { unwrapResult } from "@/queries/shared";
import type { TrackMenuSubject } from "../components/menu/type";
import { mapTrack } from "./mappers";
import { ensureShadowAlbumCover } from "./shadowAlbumCover";

/**
 * Guarantees a Dexie row for the subject and returns it as a Track: library
 * subjects pass through, remote DTOs run the pin cascade (track + shadow
 * album/artist rows) in one unitOfWork. Idempotent; a shadow request never
 * downgrades an existing pinned = 1 row.
 */
export async function ensurePinned(
  subject: TrackMenuSubject,
  options: { pinned?: PinnedFlag } = {},
): Promise<Track> {
  if (subject.kind === "library") return subject.track;
  if (subject.kind === "ephemeral") {
    throw new Error("Ephemeral tracks have no library identity and cannot be pinned");
  }

  const requestedPinned = options.pinned ?? 1;
  const now = Date.now();

  // DTOs from page composables are deep-reactive Vue proxies; IndexedDB's
  // structured clone rejects proxies (DataCloneError). Unwrap once here.
  const sourceDto = toRaw(subject.dto);

  const result = await unitOfWork.runScoped(
    [db.tracks, db.albums, db.artists],
    async () => {
      // A same-named local artist absorbs the remote track (no duplicates).
      const allArtists = (sourceDto.artistIds ?? []).length > 0
        ? await unwrapResult(artistRepository.findAll())
        : [];
      const dto = substituteLocalArtists(sourceDto, allArtists);

      const artistIds = dto.artistIds ?? [];
      const [track, album, artists] = await Promise.all([
        unwrapResult(trackRepository.findById(dto.id)),
        dto.albumId ? unwrapResult(albumRepository.findById(dto.albumId)) : Promise.resolve(undefined),
        artistIds.length > 0 ? unwrapResult(artistRepository.findByIds(artistIds)) : Promise.resolve([]),
      ]);

      const existing: RemotePinExisting = {
        track,
        album,
        artists: new Map(artists.map(artist => [artist.id, artist])),
      };
      const rows = buildRemoteShadowEntities(dto, requestedPinned, existing, now);

      await unwrapResult(trackRepository.upsert(rows.track));
      if (rows.album) await unwrapResult(albumRepository.upsert(rows.album));
      if (rows.artists.length > 0) await unwrapResult(artistRepository.upsertMany(rows.artists));

      return rows;
    },
  );

  if (result.isErr()) throw result.error;

  // Fetch the shadow album's artwork in the background (best-effort).
  if (result.value.album && subject.dto.coverRef) {
    void ensureShadowAlbumCover(result.value.album.id, subject.dto.coverRef);
  }

  // Best-effort: search sync must not fail the action that triggered the pin.
  if (requestedPinned === 1) {
    void indexImportedTracks([result.value.track.id]).catch((error) => {
      getLogger().warn(`[Search] Indexing pinned ${result.value.track.id} failed: ${String(error)}`);
    });
  }

  return mapTrack(result.value.track, result.value.artists, result.value.album);
}
