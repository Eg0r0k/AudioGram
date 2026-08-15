import type { ArtistEntity, TrackEntity } from "@/db/entities";
import { db } from "@/db";
import {
  albumRepository,
  artistRepository,
  coverRepository,
  trackRepository,
} from "@/db/repositories";
import { unitOfWork } from "@/db/unit-of-work";
import { queryKeys } from "@/queries/query-keys";
import {
  buildAlbumDocFromDb,
  buildArtistDoc,
  buildTrackDocFromDb,
} from "@/modules/search/buildDocuments";
import { removeSearchDocuments, upsertSearchDocuments } from "@/modules/search/searchIndex";
import { mapTracks } from "@/modules/tracks/lib/mappers";
import type { TrackSortKey } from "@/modules/tracks/types";
import { ArtistId as createArtistId } from "@/types/ids";
import type { ArtistId } from "@/types/ids";
import { queryOptions, type QueryClient } from "@tanstack/vue-query";
import {
  invalidateForArtistMutation,
  removeAlbumCaches,
  removeArtistCaches,
  syncArtistCaches,
  updateCoverCache,
} from "./cache";
import { sortTracks, unwrapResult, unique } from "./shared";
import type { ArtistPageData, PaginatedTracksResult, PaginatedAlbumsResult } from "./types";

export interface ArtistChanges {
  name?: string;
  bio?: string;
  coverBlob?: Blob;
  removeCover?: boolean;
}

const PAGE_SIZE = 50;

async function getArtistTrackEntities(artistId: ArtistId, sortKey: TrackSortKey | null) {
  const artistTracks = await unwrapResult(trackRepository.findByArtistId(artistId));

  if (!sortKey) {
    return artistTracks;
  }

  return sortTracks(artistTracks, sortKey);
}

export async function getArtists() {
  return unwrapResult(artistRepository.findAll());
}

export async function getArtistByIdOrThrow(artistId: ArtistId) {
  const artist = await unwrapResult(artistRepository.findById(artistId));

  if (!artist) {
    throw new Error("Artist not found");
  }

  return artist;
}

export async function searchArtists(query: string, limit = 8) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    const artists = await unwrapResult(artistRepository.findAll());
    return artists.slice(0, limit);
  }

  return unwrapResult(artistRepository.search(normalizedQuery, limit));
}

export async function getArtistPageData(artistId: ArtistId, sortKey: TrackSortKey | null = null): Promise<ArtistPageData> {
  const [artist, albums, rawTracks] = await Promise.all([
    getArtistByIdOrThrow(artistId),
    unwrapResult(albumRepository.findByArtistId(artistId)),
    getArtistTrackEntities(artistId, sortKey),
  ]);

  const allArtistIds = unique(rawTracks.flatMap(t => t.artistIds));
  const allArtists = await unwrapResult(artistRepository.findByIds(allArtistIds));

  return {
    artist,
    albums,
    tracks: mapTracks(rawTracks, allArtists, albums),
  };
}

export async function getArtistTracksPaginated(
  artistId: ArtistId,
  offset: number,
  limit = PAGE_SIZE,
  sortKey: TrackSortKey | null = null,
): Promise<PaginatedTracksResult> {
  const [countResult] = await Promise.all([
    unwrapResult(trackRepository.countByArtistId(artistId)),
  ]);

  const total = countResult ?? 0;

  if (total === 0) {
    return { tracks: [], nextOffset: null, total };
  }

  let rawTracks: TrackEntity[];

  if (sortKey) {
    const sorted = await getArtistTrackEntities(artistId, sortKey);
    rawTracks = sorted.slice(offset, offset + limit);
  }
  else {
    rawTracks = await unwrapResult(
      trackRepository.findByArtistIdPaginated(artistId, offset, limit),
    );
  }

  await getArtistByIdOrThrow(artistId);
  const albumIds = unique(rawTracks.map(track => track.albumId));
  const albums = await unwrapResult(albumRepository.findByIds(albumIds));

  const allArtistIds = unique(rawTracks.flatMap(t => t.artistIds));
  const allArtists = await unwrapResult(artistRepository.findByIds(allArtistIds));

  const mappedTracks = mapTracks(rawTracks, allArtists, albums);

  const nextOffset = offset + limit < total ? offset + limit : null;

  return {
    tracks: mappedTracks,
    nextOffset,
    total,
  };
}

export async function getArtistAlbumsPaginated(
  artistId: ArtistId,
  offset: number,
  limit = PAGE_SIZE,
): Promise<PaginatedAlbumsResult> {
  const [albums, countResult] = await Promise.all([
    unwrapResult(albumRepository.findByArtistIdPaginated(artistId, offset, limit)),
    unwrapResult(albumRepository.countByArtistId(artistId)),
  ]);

  const total = countResult ?? 0;
  const nextOffset = offset + limit < total ? offset + limit : null;

  return {
    albums,
    nextOffset,
    total,
  };
}

export const artistQueries = {
  all: () =>
    queryOptions({
      queryKey: queryKeys.artists.all(),
      queryFn: getArtists,
    }),
  detail: (artistId: ArtistId) =>
    queryOptions({
      queryKey: queryKeys.artists.detail(artistId),
      queryFn: () => getArtistByIdOrThrow(artistId),
    }),
  page: (artistId: ArtistId) =>
    queryOptions({
      queryKey: queryKeys.artists.page(artistId),
      queryFn: () => getArtistPageData(artistId),
    }),
  tracksPageInfinite: (artistId: ArtistId, pageParam: number, sortKey: TrackSortKey | null = null) =>
    queryOptions({
      queryKey: [...queryKeys.artists.tracksPage(artistId, sortKey), pageParam],
      queryFn: () => getArtistTracksPaginated(artistId, pageParam, PAGE_SIZE, sortKey),
    }),
  albumsPageInfinite: (artistId: ArtistId, pageParam: number) =>
    queryOptions({
      queryKey: [...queryKeys.artists.albums(artistId), pageParam],
      queryFn: () => getArtistAlbumsPaginated(artistId, pageParam),
    }),
} as const;

export async function createArtistAndSync(
  queryClient: QueryClient,
  name = "New artist",
) {
  const now = Date.now();
  const artist: ArtistEntity = {
    id: createArtistId(crypto.randomUUID()),
    name,
    pinned: 1,
    addedAt: now,
    updatedAt: now,
  };

  await unwrapResult(artistRepository.create(artist));
  syncArtistCaches(queryClient, artist);
  await upsertSearchDocuments([buildArtistDoc(artist)]);

  return artist;
}

async function syncTrackArtistNames(artistId: ArtistId, nextArtistName: string) {
  const tracks = await unwrapResult(trackRepository.findByArtistId(artistId));

  if (tracks.length === 0) {
    return;
  }

  const allArtistIds = unique(tracks.flatMap(track => track.artistIds));
  const artists = await unwrapResult(artistRepository.findByIds(allArtistIds));
  const artistNameById = new Map(artists.map(artist => [artist.id, artist.name]));
  artistNameById.set(artistId, nextArtistName);

  for (const track of tracks) {
    const artistName = track.artistIds
      .map(id => artistNameById.get(id))
      .filter(Boolean)
      .join(", ") || "Unknown Artist";

    await unwrapResult(trackRepository.update(track.id, { artistName }));
  }
}

export async function updateArtistAndSync(
  queryClient: QueryClient,
  currentArtist: ArtistEntity,
  changes: ArtistChanges,
) {
  if (changes.coverBlob) {
    await unwrapResult(coverRepository.upsertArtistCover(currentArtist.id, changes.coverBlob));
    updateCoverCache(queryClient, "artist", currentArtist.id, changes.coverBlob);
  }
  else if (changes.removeCover) {
    await unwrapResult(coverRepository.deleteArtistCover(currentArtist.id));
    updateCoverCache(queryClient, "artist", currentArtist.id, null);
  }

  const updateData: Partial<ArtistEntity> = {};

  if (changes.name && changes.name !== currentArtist.name) {
    updateData.name = changes.name;
  }

  if (changes.bio !== undefined) {
    updateData.bio = changes.bio;
  }

  const nextArtist: ArtistEntity = {
    ...currentArtist,
    ...updateData,
    updatedAt: Date.now(),
  };

  if (Object.keys(updateData).length > 0) {
    await unwrapResult(artistRepository.update(currentArtist.id, updateData));

    if (updateData.name) {
      await syncTrackArtistNames(currentArtist.id, nextArtist.name);
    }

    syncArtistCaches(queryClient, nextArtist);

    const [albums, tracks] = await Promise.all([
      unwrapResult(albumRepository.findByArtistId(currentArtist.id)),
      unwrapResult(trackRepository.findByArtistId(currentArtist.id)),
    ]);

    const searchDocuments = [
      buildArtistDoc(nextArtist),
      ...await Promise.all(albums.map(album => buildAlbumDocFromDb(album))),
      ...await Promise.all(tracks.map(track => buildTrackDocFromDb(track))),
    ];

    await upsertSearchDocuments(searchDocuments);
  }

  await invalidateForArtistMutation(queryClient, {
    kind: "change",
    artistId: currentArtist.id,
  });

  return nextArtist;
}

export async function deleteArtistAndSync(
  queryClient: QueryClient,
  artistEntity: ArtistEntity | null,
) {
  if (!artistEntity) {
    return;
  }

  const albums = await unwrapResult(albumRepository.findByArtistId(artistEntity.id));
  const rawTracks = await unwrapResult(trackRepository.findByArtistId(artistEntity.id));
  const albumTracks = (await Promise.all(
    albums.map(album => unwrapResult(trackRepository.findByAlbumId(album.id))),
  )).flat();
  const affectedTracks = [...new Map(
    [...rawTracks, ...albumTracks].map(track => [track.id, track]),
  ).values()];
  const remainingArtistIds = unique(
    affectedTracks.flatMap(track => track.artistIds.filter(id => id !== artistEntity.id)),
  );
  const remainingArtists = await unwrapResult(artistRepository.findByIds(remainingArtistIds));
  const remainingArtistNameById = new Map(remainingArtists.map(artist => [artist.id, artist.name]));
  const deletedAlbumIds = new Set(albums.map(album => album.id));

  const trackUpdates = affectedTracks.map((track) => {
    const nextArtistIds = track.artistIds.filter(id => id !== artistEntity.id);
    const nextArtistName = nextArtistIds
      .map(id => remainingArtistNameById.get(id))
      .filter(Boolean)
      .join(", ") || undefined;
    const nextAlbumTitle = deletedAlbumIds.has(track.albumId) ? undefined : track.albumTitle;

    return {
      key: track.id,
      changes: {
        artistIds: nextArtistIds,
        artistName: nextArtistName,
        albumTitle: nextAlbumTitle,
      },
    };
  });

  const txResult = await unitOfWork.runScoped(
    [db.tracks, db.albums, db.artists, db.covers],
    async () => {
      if (trackUpdates.length > 0) {
        await unwrapResult(trackRepository.updateMany(trackUpdates));
      }
      for (const album of albums) {
        await unwrapResult(coverRepository.deleteAlbumCover(album.id));
      }
      if (albums.length > 0) {
        await unwrapResult(albumRepository.deleteMany(albums.map(album => album.id)));
      }
      await unwrapResult(coverRepository.deleteArtistCover(artistEntity.id));
      await unwrapResult(artistRepository.delete(artistEntity.id));
    },
  );
  if (txResult.isErr()) throw txResult.error;

  for (const album of albums) {
    removeAlbumCaches(queryClient, album.id, artistEntity.id);
    queryClient.removeQueries({ queryKey: queryKeys.albums.cover(album.id), exact: true });
  }
  await removeSearchDocuments([
    `artist:${artistEntity.id}`,
    ...albums.map(album => `album:${album.id}`),
  ]);
  const updatedTracks = await unwrapResult(trackRepository.findByIds(affectedTracks.map(track => track.id)));
  await upsertSearchDocuments(await Promise.all(updatedTracks.map(track => buildTrackDocFromDb(track))));

  removeArtistCaches(queryClient, artistEntity.id);
  queryClient.removeQueries({ queryKey: queryKeys.covers.detail("artist", artistEntity.id), exact: true });

  await invalidateForArtistMutation(queryClient, {
    kind: "removal",
    albumIds: albums.map(album => album.id),
  });
}
