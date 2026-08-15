import type { AlbumEntity, TrackEntity } from "@/db/entities";
import { db } from "@/db";
import {
  albumRepository,
  artistRepository,
  coverRepository,
  offlineCopyRepository,
  playlistRepository,
  trackRepository,
} from "@/db/repositories";
import { unitOfWork } from "@/db/unit-of-work";
import { cleanupOfflineCopyFiles } from "@/modules/downloads/removeCopy";
import { sourceKindOf } from "@/modules/sources/lib/display";
import { cleanupAfterTrackRemoval } from "@/services/library-gc";
import { queryKeys } from "@/queries/query-keys";
import { buildAlbumDocFromDb, buildTrackDocFromDb } from "@/modules/search/buildDocuments";
import { removeSearchDocuments, upsertSearchDocuments } from "@/modules/search/searchIndex";
import { mapTracks } from "@/modules/tracks/lib/mappers";
import type { TrackSortKey } from "@/modules/tracks/types";
import { AlbumId as createAlbumId } from "@/types/ids";
import type { AlbumId, ArtistId } from "@/types/ids";
import { queryOptions, type QueryClient } from "@tanstack/vue-query";
import {
  invalidateForAlbumMutation,
  removeAlbumCaches,
  removeTracksFromCaches,
  syncAlbumCaches,
  syncPlaylistCaches,
  syncPlaylistTrackRemoval,
  updateCoverCache,
} from "./cache";
import { sortTracks, unwrapResult, unique } from "./shared";
import type { AlbumPageData, PaginatedTracksResult } from "./types";

const PAGE_SIZE = 50;

export interface AlbumChanges {
  title?: string;
  description?: string;
  coverBlob?: Blob;
  removeCover?: boolean;
}

export async function getAlbums() {
  return unwrapResult(albumRepository.findAll());
}

export async function getAlbumByIdOrThrow(albumId: AlbumId) {
  const album = await unwrapResult(albumRepository.findById(albumId));

  if (!album) {
    throw new Error("Album not found");
  }

  return album;
}

export async function searchAlbums(query: string, limit = 8) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    const albums = await unwrapResult(albumRepository.findAllSortedByTitle());
    return albums.slice(0, limit);
  }

  return unwrapResult(albumRepository.search(normalizedQuery, limit));
}

export async function getAlbumPageData(albumId: AlbumId, sortKey: TrackSortKey | null = null): Promise<AlbumPageData> {
  const [album, rawTracks] = await Promise.all([
    getAlbumByIdOrThrow(albumId),
    getAlbumTrackEntities(albumId, sortKey),
  ]);

  const artist = await unwrapResult(artistRepository.findById(album.artistId));

  if (!artist) {
    throw new Error("Artist not found");
  }

  return {
    album,
    artist,
    tracks: mapTracks(rawTracks, [artist], [album]),
  };
}

export async function getAlbumTracksPaginated(
  albumId: AlbumId,
  offset: number,
  limit = PAGE_SIZE,
  sortKey: TrackSortKey | null = null,
): Promise<PaginatedTracksResult> {
  const [countResult, album] = await Promise.all([
    unwrapResult(trackRepository.countByAlbumId(albumId)),
    getAlbumByIdOrThrow(albumId),
  ]);

  const total = countResult ?? 0;

  if (total === 0) {
    return { tracks: [], nextOffset: null, total };
  }

  let rawTracks: TrackEntity[];

  if (sortKey) {
    const sorted = await getAlbumTrackEntities(albumId, sortKey);
    rawTracks = sorted.slice(offset, offset + limit);
  }
  else {
    rawTracks = await unwrapResult(
      trackRepository.findByAlbumIdPaginated(albumId, offset, limit),
    );
  }

  const allArtistIds = unique(rawTracks.flatMap(t => t.artistIds));
  const allArtists = allArtistIds.length > 0
    ? await unwrapResult(artistRepository.findByIds(allArtistIds))
    : [];

  const mappedTracks = mapTracks(rawTracks, allArtists, [album]);

  const nextOffset = offset + limit < total ? offset + limit : null;

  return {
    tracks: mappedTracks,
    nextOffset,
    total,
  };
}

export async function getAlbumTotalDuration(albumId: AlbumId): Promise<number> {
  return unwrapResult(trackRepository.sumDurationByAlbumId(albumId));
}

async function getAlbumTrackEntities(albumId: AlbumId, sortKey: TrackSortKey | null) {
  const albumTracks = await unwrapResult(trackRepository.findByAlbumId(albumId));

  if (!sortKey) {
    return albumTracks;
  }

  return sortTracks(albumTracks, sortKey);
}

export const albumQueries = {
  all: () =>
    queryOptions({
      queryKey: queryKeys.albums.all(),
      queryFn: getAlbums,
    }),
  detail: (albumId: AlbumId, enabled = true) =>
    queryOptions({
      queryKey: queryKeys.albums.detail(albumId),
      queryFn: () => getAlbumByIdOrThrow(albumId),
      enabled,
    }),
  page: (albumId: AlbumId) =>
    queryOptions({
      queryKey: queryKeys.albums.page(albumId),
      queryFn: () => getAlbumPageData(albumId),
    }),
  tracksPageInfinite: (albumId: AlbumId, pageParam: number, sortKey: TrackSortKey | null = null) =>
    queryOptions({
      queryKey: [...queryKeys.albums.tracksPage(albumId, sortKey), pageParam],
      queryFn: () => getAlbumTracksPaginated(albumId, pageParam, PAGE_SIZE, sortKey),
    }),
  totalDuration: (albumId: AlbumId, enabled = true) =>
    queryOptions({
      queryKey: queryKeys.albums.totalDuration(albumId),
      queryFn: () => getAlbumTotalDuration(albumId),
      enabled,
    }),
} as const;

export async function createAlbumAndSync(
  queryClient: QueryClient,
  artistId: ArtistId,
  title = "New album",
) {
  const now = Date.now();
  const album: AlbumEntity = {
    id: createAlbumId(crypto.randomUUID()),
    title,
    artistId,
    pinned: 1,
    addedAt: now,
    updatedAt: now,
  };

  await unwrapResult(albumRepository.create(album));
  syncAlbumCaches(queryClient, album);
  await upsertSearchDocuments([await buildAlbumDocFromDb(album)]);

  return album;
}

export async function updateAlbumAndSync(
  queryClient: QueryClient,
  currentAlbum: AlbumEntity,
  changes: AlbumChanges,
) {
  let nextAlbum = currentAlbum;
  let didUpdateAlbum = false;
  let updatedTracks: TrackEntity[] = [];

  if (changes.coverBlob) {
    await unwrapResult(coverRepository.upsertAlbumCover(currentAlbum.id, changes.coverBlob));
    updateCoverCache(queryClient, "album", currentAlbum.id, changes.coverBlob);
  }
  else if (changes.removeCover) {
    await unwrapResult(coverRepository.deleteAlbumCover(currentAlbum.id));
    updateCoverCache(queryClient, "album", currentAlbum.id, null);
  }

  if (changes.title && changes.title !== currentAlbum.title) {
    nextAlbum = {
      ...currentAlbum,
      title: changes.title,
      updatedAt: Date.now(),
    };

    await unwrapResult(albumRepository.update(currentAlbum.id, {
      title: changes.title,
    }));

    const albumTracks = await unwrapResult(trackRepository.findByAlbumId(currentAlbum.id));
    updatedTracks = albumTracks;

    for (const track of albumTracks) {
      await unwrapResult(trackRepository.update(track.id, {
        albumTitle: changes.title,
      }));
    }

    syncAlbumCaches(queryClient, nextAlbum);
    didUpdateAlbum = true;
  }

  if (didUpdateAlbum) {
    const searchDocuments = [
      await buildAlbumDocFromDb(nextAlbum),
      ...await Promise.all(updatedTracks.map(track => buildTrackDocFromDb(track))),
    ];

    await upsertSearchDocuments(searchDocuments);

    await invalidateForAlbumMutation(queryClient, { kind: "titleChange" });
  }

  return nextAlbum;
}

/**
 * Remote (shadow) album deletion cascade: the downloaded tracks, their
 * offline copies and files leave with the album; playlists drop the ids and
 * GC collects the orphaned artist. Local albums keep the ungroup semantics.
 * Every row mutation of the cascade commits in one transaction; file
 * deletion and cache/search sync run strictly after it.
 */
export async function deleteAlbumAndSync(
  queryClient: QueryClient,
  albumEntity: AlbumEntity | null,
) {
  if (!albumEntity) {
    return;
  }

  const rawTracks = await unwrapResult(trackRepository.findByAlbumId(albumEntity.id));
  const isRemote = sourceKindOf(albumEntity.id) !== "local";
  const trackIds = rawTracks.map(track => track.id);
  const trackIdSet = new Set(trackIds);
  const now = Date.now();

  const playlists = isRemote ? await unwrapResult(playlistRepository.findAll()) : [];
  const affectedPlaylists = playlists
    .filter(playlist => playlist.trackIds.some(id => trackIdSet.has(id)))
    .map(playlist => ({
      next: {
        ...playlist,
        trackIds: playlist.trackIds.filter(id => !trackIdSet.has(id)),
        updatedAt: now,
      },
      removedIds: playlist.trackIds.filter(id => trackIdSet.has(id)),
    }));
  const nextPlaylists = affectedPlaylists.map(entry => entry.next);
  const copies = isRemote && trackIds.length > 0
    ? await unwrapResult(offlineCopyRepository.findByIds(trackIds))
    : [];

  const txResult = await unitOfWork.runScoped(
    [db.tracks, db.albums, db.artists, db.playlists, db.covers, db.offlineCopies],
    async () => {
      if (isRemote) {
        if (nextPlaylists.length > 0) {
          await unwrapResult(playlistRepository.upsertMany(nextPlaylists));
        }
        if (copies.length > 0) {
          await unwrapResult(offlineCopyRepository.deleteMany(copies.map(copy => copy.trackId)));
        }
        await unwrapResult(trackRepository.deleteMany(trackIds));
        // GC would also collect the album with its last track, but an empty
        // shadow album (0 tracks) must not survive either — delete explicitly
        // below, then let the artist cascade run.
        await cleanupAfterTrackRemoval(rawTracks);
      }
      else if (rawTracks.length > 0) {
        // Detach fully: a cleared title with a dangling albumId would keep
        // pointing list queries at a row that no longer exists.
        await unwrapResult(trackRepository.updateMany(rawTracks.map(track => ({
          key: track.id,
          changes: { albumTitle: undefined, albumId: createAlbumId("") },
        }))));
      }

      await unwrapResult(coverRepository.deleteAlbumCover(albumEntity.id));
      await unwrapResult(albumRepository.delete(albumEntity.id));
    },
  );
  if (txResult.isErr()) throw txResult.error;

  await cleanupOfflineCopyFiles(copies);
  if (isRemote) {
    for (const { next, removedIds } of affectedPlaylists) {
      for (const id of removedIds) {
        syncPlaylistTrackRemoval(queryClient, next.id, id);
      }
      syncPlaylistCaches(queryClient, next);
    }
    removeTracksFromCaches(queryClient, trackIds);
  }
  await removeSearchDocuments([
    ...(isRemote ? trackIds.map(id => `track:${id}`) : []),
    `album:${albumEntity.id}`,
  ]);
  if (!isRemote) {
    const updatedTracks = await unwrapResult(trackRepository.findByIds(rawTracks.map(track => track.id)));
    await upsertSearchDocuments(await Promise.all(updatedTracks.map(track => buildTrackDocFromDb(track))));
  }

  removeAlbumCaches(queryClient, albumEntity.id, albumEntity.artistId);

  queryClient.removeQueries({ queryKey: queryKeys.albums.cover(albumEntity.id), exact: true });

  await invalidateForAlbumMutation(queryClient, {
    kind: "removal",
    artistId: albumEntity.artistId,
  });
}
