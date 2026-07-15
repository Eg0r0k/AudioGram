import type { AlbumEntity, TrackEntity } from "@/db/entities";
import {
  albumRepository,
  artistRepository,
  coverRepository,
  trackRepository,
} from "@/db/repositories";
import { queryKeys } from "@/queries/query-keys";
import { buildAlbumDocFromDb, buildTrackDocFromDb } from "@/modules/search/buildDocuments";
import { removeSearchDocuments, upsertSearchDocuments } from "@/modules/search/searchIndex";
import { mapTracks } from "@/modules/tracks/lib/mappers";
import type { TrackSortKey } from "@/modules/tracks/types";
import { AlbumId as createAlbumId } from "@/types/ids";
import type { AlbumId, ArtistId } from "@/types/ids";
import { queryOptions, type QueryClient } from "@tanstack/vue-query";
import {
  removeAlbumCaches,
  syncAlbumCaches,
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
  const totalDuration = await unwrapResult(trackRepository.sumDurationByAlbumId(albumId)) ?? 0;

  if (total === 0) {
    return { tracks: [], nextOffset: null, total, totalDuration };
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
    totalDuration,
  };
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
  detail: (albumId: AlbumId) =>
    queryOptions({
      queryKey: queryKeys.albums.detail(albumId),
      queryFn: () => getAlbumByIdOrThrow(albumId),
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

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.tracks.likedPage() }),
      queryClient.invalidateQueries({
        predicate: query => query.queryKey[0] === "tracks" && query.queryKey[1] === "index",
      }),
      queryClient.invalidateQueries({
        predicate: query => query.queryKey[0] === "playlists" && query.queryKey[2] === "page",
      }),
    ]);
  }

  return nextAlbum;
}

export async function deleteAlbumAndSync(
  queryClient: QueryClient,
  albumEntity: AlbumEntity | null,
) {
  if (!albumEntity) {
    return;
  }

  const rawTracks = await unwrapResult(trackRepository.findByAlbumId(albumEntity.id));

  for (const track of rawTracks) {
    await unwrapResult(trackRepository.update(track.id, {
      albumTitle: undefined,
    }));
  }

  await unwrapResult(coverRepository.deleteAlbumCover(albumEntity.id));
  await unwrapResult(albumRepository.delete(albumEntity.id));
  await removeSearchDocuments([
    `album:${albumEntity.id}`,
  ]);
  const updatedTracks = await unwrapResult(trackRepository.findByIds(rawTracks.map(track => track.id)));
  await upsertSearchDocuments(await Promise.all(updatedTracks.map(track => buildTrackDocFromDb(track))));

  removeAlbumCaches(queryClient, albumEntity.id, albumEntity.artistId);

  queryClient.removeQueries({ queryKey: queryKeys.albums.cover(albumEntity.id), exact: true });

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.library.summary() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tracks.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tracks.likedPage() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tracks.likedPageInfinite() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.artists.page(albumEntity.artistId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.artists.albums(albumEntity.artistId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.artists.tracksPage(albumEntity.artistId) }),
    queryClient.invalidateQueries({
      predicate: query =>
        query.queryKey[0] === "tracks" && query.queryKey[1] === "index",
    }),
    queryClient.invalidateQueries({
      predicate: query =>
        query.queryKey[0] === "playlists" && query.queryKey[2] === "page",
    }),
  ]);
}
