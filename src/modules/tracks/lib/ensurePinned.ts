import { toRaw } from "vue";
import { db } from "@/db";
import type { PinnedFlag } from "@/db/entities";
import { albumRepository, artistRepository, trackRepository } from "@/db/repositories";
import { unitOfWork } from "@/db/unit-of-work";
import { getLogger } from "@/lib/logger";
import { indexImportedTracks } from "@/modules/search/searchIndex";
import { alignArtists, buildRemoteShadowEntities, type RemotePinExisting } from "@/services/entity-resolver";
import type { Track } from "@/modules/player/types";
import { unwrapResult } from "@/queries/shared";
import type { TrackMenuSubject } from "../components/menu/type";
import { trackCoverOwner } from "@/modules/covers/composables/useTrackCover";
import { mapTrack } from "./mappers";
import { ensureShadowCover } from "./shadowAlbumCover";

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
      // Every credited name gets exactly one artist row: a same-named local
      // artist absorbs the remote one, names the source has no id for get a
      // row of their own.
      const hasArtists = (sourceDto.artistIds ?? []).length > 0 || !!sourceDto.artistName;
      const allArtists = hasArtists ? await unwrapResult(artistRepository.findAll()) : [];
      const dto = alignArtists(sourceDto, allArtists);

      const track = await unwrapResult(trackRepository.findById(dto.id));
      // The cascade falls back to the row's own artists when the DTO carries
      // none; their current rows must be loaded too, or the upsert would
      // rebuild them from a DTO that knows no names.
      const artistIds = dto.artistIds ?? track?.artistIds ?? [];
      const [album, artists] = await Promise.all([
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

  // Fetch the artwork in the background (best-effort). The album owns it when
  // there is one; an album-less track (a YouTube music video) carries it
  // under its own id — the same rule the import pipeline applies to files.
  if (subject.dto.coverRef) {
    const owner = trackCoverOwner(result.value.track);
    if (owner) ensureShadowCover(owner.ownerType, owner.ownerId, subject.dto.coverRef);
  }

  // Best-effort: search sync must not fail the action that triggered the pin.
  if (requestedPinned === 1) {
    indexImportedTracks([result.value.track.id]).catch((error) => {
      getLogger().warn(`[Search] Indexing pinned ${result.value.track.id} failed: ${String(error)}`);
    });
  }

  return mapTrack(result.value.track, result.value.artists, result.value.album);
}
