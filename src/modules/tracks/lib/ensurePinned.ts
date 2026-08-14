import { db } from "@/db";
import type { PinnedFlag } from "@/db/entities";
import { albumRepository, artistRepository, trackRepository } from "@/db/repositories";
import { unitOfWork } from "@/db/unit-of-work";
import { buildRemoteShadowEntities, substituteLocalArtists, type RemotePinExisting } from "@/services/entity-resolver";
import type { Track } from "@/modules/player/types";
import { unwrapResult } from "@/queries/shared";
import type { TrackMenuSubject } from "../components/menu/type";
import { mapTrack } from "./mappers";
import { ensureShadowAlbumCover } from "./shadowAlbumCover";

/**
 * Actions-layer utility (NOT a menu item): guarantees a Dexie row for the
 * subject and returns it as a Track. Library subjects pass through; remote
 * DTOs run the pin cascade (track + shadow album/artist rows, deterministic
 * prefixed ids) strictly inside a unitOfWork transaction. Idempotent put()
 * upserts — pinning twice is a snapshot refresh; a shadow request never
 * downgrades an existing pinned = 1 row.
 *
 * Every action that needs a DB row (toggleLike, addToPlaylist, attachLyrics,
 * offline) calls this first, so "like from ND browsing" just works.
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

  const result = await unitOfWork.runScoped(
    [db.tracks, db.albums, db.artists],
    async () => {
      // A same-named local artist absorbs the remote track instead of a
      // shadow row — downloading never duplicates an artist the user has.
      const allArtists = (subject.dto.artistIds ?? []).length > 0
        ? await unwrapResult(artistRepository.findAll())
        : [];
      const dto = substituteLocalArtists(subject.dto, allArtists);

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

  // A pinned shadow album should look like a local one on library pages —
  // fetch its artwork in the background (idempotent, best-effort).
  if (result.value.album && subject.dto.coverRef) {
    void ensureShadowAlbumCover(result.value.album.id, subject.dto.coverRef);
  }

  return mapTrack(result.value.track, result.value.artists, result.value.album);
}
