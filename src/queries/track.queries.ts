import type { AlbumEntity, ArtistEntity, TrackEntity } from "@/db/entities";
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
import { buildAlbumDocFromDb, buildArtistDoc, buildTrackDocFromDb } from "@/modules/search/service/buildDocuments";
import {
  removeSearchDocuments,
  searchDocuments,
  searchTracks as searchIndexedTracks,
  upsertSearchDocuments,
} from "@/modules/search/service/searchIndex";
import type { TrackSortKey } from "@/modules/tracks/types";
import type { SearchDocument } from "@/modules/search/types";
import { queryKeys } from "@/queries/query-keys";
import { mapTracks } from "@/modules/tracks/lib/mappers";
import type { Track } from "@/modules/player/types";
import { AlbumId as createAlbumId, ArtistId as createArtistId } from "@/types/ids";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { queryOptions, type QueryClient } from "@tanstack/vue-query";
import {
  invalidateForTrackMutation,
  removeTracksFromCaches,
  syncAlbumCaches,
  syncPlaylistCaches,
  syncPlaylistTrackRemoval,
  syncArtistCaches,
  syncTrackLikeCaches,
  syncTrackMetadataCaches,
  updateCoverCache,
  removeCoverCache,
} from "./cache";
import { unique, unwrapResult } from "./shared";
import {
  findOfflineCopiesOf,
  purgeTracksInTx,
  syncAfterTrackPurge,
  trackCascadeTables,
} from "./track-cascade";
import type { LikedTracksPageData, PaginatedTracksResult, TracksIndexPageData } from "./types";
import { getAlbumByIdOrThrow } from "./album.queries";
import { getArtistByIdOrThrow } from "./artist.queries";
import { cleanupAfterTrackRemoval } from "@/services/library-gc";
import { cleanupOfflineCopyFiles } from "@/modules/downloads/service/removeCopy";
import { dedupeArtistNames, identityKey } from "@/lib/artist-names";
import { assertValidName } from "@/lib/limits";

const PAGE_SIZE = 50;

export interface TrackMetadataChanges {
  title: string;
  artistNames: string[];
  // At most one of albumId/albumTitle: an id picks an existing album, a title
  // finds-or-creates one under the first artist, neither detaches the track
  // from any album (albumId "" — the same shape album-less imports get).
  albumId?: AlbumId;
  albumTitle?: string;
  // undefined = leave unchanged, null = clear the stored value, number = set it.
  trackNo?: number | null;
  diskNo?: number | null;
}

// undefined = leave unchanged (keep current), null = clear (store undefined), number = set.
const resolveNullableNumber = (
  next: number | null | undefined,
  current: number | undefined,
): number | undefined => {
  if (next === undefined) return current;
  return next === null ? undefined : next;
};

async function loadTrackRelations(tracks: TrackEntity[]): Promise<Track[]> {
  if (tracks.length === 0) {
    return [];
  }

  const artistIds = unique(tracks.flatMap(track => track.artistIds));
  const albumIds = unique(tracks.map(track => track.albumId));

  const [artists, albums] = await Promise.all([
    unwrapResult(artistRepository.findByIds(artistIds)),
    unwrapResult(albumRepository.findByIds(albumIds)),
  ]);

  return mapTracks(tracks, artists, albums);
}

const joinArtistNames = (artistIds: readonly ArtistId[], nameById: ReadonlyMap<ArtistId, string>): string =>
  artistIds.map(id => nameById.get(id)).filter(Boolean).join(", ") || "Unknown Artist";

async function loadArtistNames(artistIds: readonly ArtistId[]): Promise<Map<ArtistId, string>> {
  const artists = await unwrapResult(artistRepository.findByIds(unique([...artistIds])));
  return new Map(artists.map(artist => [artist.id, artist.name]));
}

async function findOrCreateArtists(queryClient: QueryClient, names: string[]) {
  const artists: ArtistEntity[] = [];
  const createdDocuments: SearchDocument[] = [];
  const now = Date.now();

  for (const name of names) {
    const existing = await unwrapResult(artistRepository.findByName(name));

    if (existing) {
      artists.push(existing);
      continue;
    }

    const artist = {
      id: createArtistId(crypto.randomUUID()),
      name,
      pinned: 1 as const,
      addedAt: now,
      updatedAt: now,
    };

    await unwrapResult(artistRepository.create(artist));
    syncArtistCaches(queryClient, artist);
    artists.push(artist);
    createdDocuments.push(buildArtistDoc(artist));
  }

  if (createdDocuments.length > 0) {
    await upsertSearchDocuments(createdDocuments);
  }

  return artists;
}

async function invalidateTrackRelations(queryClient: QueryClient) {
  await invalidateForTrackMutation(queryClient, { kind: "relations" });
}

export async function getLikedTracks() {
  return unwrapResult(trackRepository.findLiked());
}

export async function getTrackEntityById(trackId: TrackId) {
  return unwrapResult(trackRepository.findById(trackId));
}

export async function getLikedTracksPageData(sortKey: TrackSortKey | null = null): Promise<LikedTracksPageData> {
  const tracks = sortKey
    ? await unwrapResult(trackRepository.findLikedSorted(sortKey))
    : await getLikedTracks();
  const mappedTracks = await loadTrackRelations(tracks);

  return {
    tracks: mappedTracks,
  };
}

export async function getTracksIndexPageData(
  sortKey: TrackSortKey,
  searchQuery = "",
  offset = 0,
  limit = 50,
): Promise<TracksIndexPageData> {
  const normalizedSearchQuery = searchQuery.trim();

  if (normalizedSearchQuery.length > 0) {
    const searchResult = await searchIndexedTracks(normalizedSearchQuery, 0, undefined);

    // Search matches come from the worker index. We re-apply ordering through Dexie
    // so the visible list still follows an indexed database sort instead of in-memory sorting.
    const rawTracks = await unwrapResult(
      trackRepository.findSortedByIds(searchResult.tracks.map(track => track.id), sortKey),
    );

    return {
      tracks: await loadTrackRelations(rawTracks),
      total: searchResult.total,
      totalDuration: searchResult.totalDuration,
    };
  }

  const [rawTracks, total, totalDuration] = await Promise.all([
    unwrapResult(trackRepository.findAllSortedPaginated(sortKey, offset, limit)),
    unwrapResult(trackRepository.countAll()),
    offset === 0 ? unwrapResult(trackRepository.sumDurationAll()) : Promise.resolve(0),
  ]);

  return {
    tracks: await loadTrackRelations(rawTracks),
    total,
    totalDuration,
  };
}

export async function getLikedTracksPaginated(
  offset: number,
  limit = PAGE_SIZE,
  sortKey: TrackSortKey | null = null,
): Promise<PaginatedTracksResult> {
  const [tracks, total] = await Promise.all([
    sortKey
      ? unwrapResult(trackRepository.findLikedSortedPaginated(sortKey, offset, limit))
      : unwrapResult(trackRepository.findLikedPaginated(offset, limit)),
    unwrapResult(trackRepository.countLiked()),
  ]);

  const mappedTracks = await loadTrackRelations(tracks);
  const nextOffset = offset + limit < total ? offset + limit : null;

  return {
    tracks: mappedTracks,
    nextOffset,
    total,
  };
}

// queryOptions factories — only for non-infinite queries.
// Infinite queries are configured directly in composables via useInfiniteQuery.
export const trackQueries = {
  liked: () =>
    queryOptions({
      queryKey: queryKeys.tracks.liked(),
      queryFn: getLikedTracks,
    }),
  likedPage: () =>
    queryOptions({
      queryKey: queryKeys.tracks.likedPage(),
      queryFn: () => getLikedTracksPageData(),
    }),
  index: (sortKey: TrackSortKey, searchQuery = "") =>
    queryOptions({
      queryKey: queryKeys.tracks.index(sortKey, searchQuery),
      queryFn: () => getTracksIndexPageData(sortKey, searchQuery),
      staleTime: Infinity,
    }),
  indexTotalDuration: (searchQuery = "") =>
    queryOptions({
      queryKey: queryKeys.tracks.indexTotalDuration(searchQuery),
      queryFn: () => getIndexTotalDuration(searchQuery),
    }),
  likedTotalDuration: () =>
    queryOptions({
      queryKey: queryKeys.tracks.likedTotalDuration(),
      queryFn: getLikedTotalDuration,
    }),
} as const;

export async function getAllTracksPaginated(
  offset: number,
  limit = PAGE_SIZE,
  sortKey?: TrackSortKey | null,
): Promise<PaginatedTracksResult> {
  const [rawTracks, total] = await Promise.all([
    sortKey
      ? unwrapResult(trackRepository.findAllSortedPaginated(sortKey, offset, limit))
      : unwrapResult(trackRepository.findPaginated(offset, limit)),
    unwrapResult(trackRepository.countAll()),
  ]);

  const mappedTracks = await loadTrackRelations(rawTracks);
  const nextOffset = offset + limit < total ? offset + limit : null;

  return {
    tracks: mappedTracks,
    nextOffset,
    total,
  };
}

export async function searchTracksPaginated(
  query: string,
  offset: number,
  limit = PAGE_SIZE,
): Promise<PaginatedTracksResult> {
  const { tracks, total } = await searchIndexedTracks(query, offset, limit);
  const nextOffset = offset + limit < total ? offset + limit : null;

  return {
    tracks,
    nextOffset,
    total,
  };
}

export async function getTracksPaginated(
  offset: number,
  searchQuery = "",
  limit = PAGE_SIZE,
  sortKey?: TrackSortKey | null,
): Promise<PaginatedTracksResult> {
  const normalizedSearchQuery = searchQuery.trim();

  if (normalizedSearchQuery.length > 0) {
    return searchTracksPaginated(normalizedSearchQuery, offset, limit);
  }

  return getAllTracksPaginated(offset, limit, sortKey);
}

export async function getAllTracksForQueue(sortKey: TrackSortKey, searchQuery = ""): Promise<Track[]> {
  const q = searchQuery.trim();
  if (q.length > 0) {
    const searchResult = await searchIndexedTracks(q, 0, undefined);
    const rawTracks = await unwrapResult(
      trackRepository.findSortedByIds(searchResult.tracks.map(t => t.id), sortKey),
    );
    return loadTrackRelations(rawTracks);
  }
  const rawTracks = await unwrapResult(trackRepository.findAllSorted(sortKey));
  return loadTrackRelations(rawTracks);
}

export async function getTracksByIds(ids: TrackId[]): Promise<Track[]> {
  if (ids.length === 0) return [];
  const entities = await unwrapResult(trackRepository.findByIds(ids));
  return loadTrackRelations(entities);
}

/** Every track id matching the index page's sort + search, ids only. Search
 *  results come back in score order — a selection set does not care. */
export async function getAllTrackIds(sortKey: TrackSortKey, searchQuery = ""): Promise<TrackId[]> {
  const q = searchQuery.trim();
  if (q.length > 0) {
    const response = await searchDocuments(q, "track", { offset: 0 });
    return response.results.map(item => item.entityId as TrackId);
  }
  return unwrapResult(trackRepository.findAllIdsSorted(sortKey));
}

export async function getTracksByIdsSorted(ids: TrackId[], sortKey: TrackSortKey): Promise<Track[]> {
  if (ids.length === 0) return [];
  const entities = await unwrapResult(trackRepository.findSortedByIds(ids, sortKey));
  return loadTrackRelations(entities);
}

/** One repository write for the whole batch, one invalidation for every list
 *  that may move. Per-track cache patches are O(N·M) here, so none are made. */
export async function setTracksLikedAndSync(
  queryClient: QueryClient,
  ids: TrackId[],
  liked: boolean,
): Promise<number> {
  if (ids.length === 0) return 0;
  const changed = liked
    ? await unwrapResult(trackRepository.likeMany(ids, Date.now()))
    : await unwrapResult(trackRepository.unlikeMany(ids));

  const idSet = new Set<string>(ids);
  await queryClient.invalidateQueries({
    predicate: query => query.queryKey[0] === "tracks" && idSet.has(query.queryKey[1] as string),
  });
  await invalidateForTrackMutation(queryClient, { kind: "relations" });
  return changed;
}

export async function deleteTracksAndSync(
  queryClient: QueryClient,
  ids: TrackId[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const tracks = await unwrapResult(trackRepository.findByIds(ids));
  if (tracks.length === 0) return 0;

  const trackIds = tracks.map(track => track.id);
  const now = Date.now();
  const copies = await findOfflineCopiesOf(trackIds);

  const txResult = await unitOfWork.runScoped(
    trackCascadeTables(),
    async () => purgeTracksInTx(tracks, copies, now),
  );
  if (txResult.isErr()) throw txResult.error;
  const removals = txResult.value;

  await syncAfterTrackPurge(queryClient, trackIds, removals, copies);
  for (const id of trackIds) {
    queryClient.removeQueries({ queryKey: queryKeys.tracks.detail(id), exact: true });
    removeCoverCache("track", id);
  }

  await invalidateForTrackMutation(queryClient, {
    kind: "removal",
    albumIds: unique(tracks.map(track => track.albumId).filter(Boolean)),
    artistIds: unique(tracks.flatMap(track => track.artistIds)),
    playlistIds: removals.map(removal => removal.next.id),
  });
  return trackIds.length;
}

// Region-scoped duration aggregate. Lives outside the infinite-query pages so the
// page lifecycle (refetch/replacement) can't zero it out; keyed by region + search
// only (never sortKey — the sum is order-independent).
export async function getIndexTotalDuration(searchQuery = ""): Promise<number> {
  const q = searchQuery.trim();
  if (q.length > 0) {
    const { totalDuration } = await searchIndexedTracks(q, 0, undefined);
    return totalDuration;
  }
  return unwrapResult(trackRepository.sumDurationAll());
}

export async function getLikedTotalDuration(): Promise<number> {
  return unwrapResult(trackRepository.sumDurationByLiked());
}

export async function addTracksToAlbumAndSync(
  queryClient: QueryClient,
  albumId: AlbumId,
  tracks: Track[],
) {
  const album = await getAlbumByIdOrThrow(albumId);
  const trackIds = unique(tracks.map(track => track.id));
  const currentTracks = await unwrapResult(trackRepository.findByIds(trackIds));
  const trackMap = new Map(currentTracks.map(track => [track.id, track]));

  for (const trackId of trackIds) {
    if (!trackMap.has(trackId)) {
      throw new Error(`Track not found: ${trackId}`);
    }
  }

  const nameById = await loadArtistNames([album.artistId, ...currentTracks.flatMap(track => track.artistIds)]);
  const updates = currentTracks.flatMap((currentTrack) => {
    const nextArtistIds = currentTrack.artistIds.includes(album.artistId)
      ? currentTrack.artistIds
      : [album.artistId, ...currentTrack.artistIds];

    if (currentTrack.albumId === albumId && nextArtistIds.length === currentTrack.artistIds.length) {
      return [];
    }

    return [{
      key: currentTrack.id,
      changes: {
        albumId,
        albumTitle: album.title,
        artistIds: nextArtistIds,
        artistName: joinArtistNames(nextArtistIds, nameById),
      },
    }];
  });

  if (updates.length > 0) {
    await unwrapResult(trackRepository.updateMany(updates));
  }

  const updatedTracks = await unwrapResult(trackRepository.findByIds(trackIds));
  const searchDocuments = await Promise.all(updatedTracks.map(track => buildTrackDocFromDb(track)));

  await invalidateTrackRelations(queryClient);
  await upsertSearchDocuments(searchDocuments);
}

export async function addTracksToArtistAndSync(
  queryClient: QueryClient,
  artistId: ArtistId,
  tracks: Track[],
) {
  await getArtistByIdOrThrow(artistId);

  const trackIds = unique(tracks.map(track => track.id));
  const currentTracks = await unwrapResult(trackRepository.findByIds(trackIds));
  const trackMap = new Map(currentTracks.map(track => [track.id, track]));

  for (const trackId of trackIds) {
    if (!trackMap.has(trackId)) {
      throw new Error(`Track not found: ${trackId}`);
    }
  }

  const nameById = await loadArtistNames([artistId, ...currentTracks.flatMap(track => track.artistIds)]);
  const updates = currentTracks.flatMap((currentTrack) => {
    if (currentTrack.artistIds.includes(artistId)) {
      return [];
    }
    const nextArtistIds = [...currentTrack.artistIds, artistId];
    return [{
      key: currentTrack.id,
      changes: { artistIds: nextArtistIds, artistName: joinArtistNames(nextArtistIds, nameById) },
    }];
  });

  if (updates.length > 0) {
    await unwrapResult(trackRepository.updateMany(updates));
  }

  const updatedTracks = await unwrapResult(trackRepository.findByIds(trackIds));
  const searchDocuments = await Promise.all(updatedTracks.map(track => buildTrackDocFromDb(track)));

  await invalidateTrackRelations(queryClient);
  await upsertSearchDocuments(searchDocuments);
}

export async function favoriteTracksAndSync(
  queryClient: QueryClient,
  tracks: Track[],
) {
  const trackIds = unique(tracks.map(track => track.id));

  // Rows already liked keep their original likedAt.
  await unwrapResult(trackRepository.likeMany(trackIds, Date.now()));

  await invalidateTrackRelations(queryClient);
}

export async function toggleTrackLikeAndSync(
  queryClient: QueryClient,
  track: Track,
) {
  const currentTrack = await unwrapResult(trackRepository.findById(track.id));

  if (!currentTrack) {
    throw new Error("Track not found");
  }

  const nextValue = !track.isLiked;
  const likedAt = nextValue ? Date.now() : undefined;

  await unwrapResult(trackRepository.setLiked(track.id, nextValue));

  const nextTrackEntity: TrackEntity = {
    ...currentTrack,
    likedAt,
  };
  const nextTrack: Track = { ...track, isLiked: nextValue };

  syncTrackLikeCaches(queryClient, nextTrackEntity, nextTrack);

  return nextTrack;
}

export async function attachTrackLyricsAndSync(
  queryClient: QueryClient,
  track: Track,
  lyricsPath: string,
) {
  const currentTrack = await unwrapResult(trackRepository.findById(track.id));

  if (!currentTrack) {
    throw new Error("Track not found");
  }

  await unwrapResult(trackRepository.setLyricsPath(track.id, lyricsPath));

  const nextTrackEntity: TrackEntity = {
    ...currentTrack,
    lyricsPath,
  };
  const nextTrack: Track = {
    ...track,
    lyricsPath,
  };

  syncTrackMetadataCaches(queryClient, nextTrackEntity, nextTrack);

  return nextTrack;
}

const resolveAlbumForChanges = async (
  queryClient: QueryClient,
  changes: TrackMetadataChanges,
  firstArtistId: ArtistId,
): Promise<AlbumEntity | null> => {
  if (changes.albumId) return getAlbumByIdOrThrow(changes.albumId);

  const title = changes.albumTitle?.trim().replace(/\s+/g, " ");
  if (!title) return null;

  const artistAlbums = await unwrapResult(albumRepository.findByArtistId(firstArtistId));
  const existing = artistAlbums.find(album => identityKey(album.title) === identityKey(title));
  if (existing) return existing;

  const now = Date.now();
  const created: AlbumEntity = {
    id: createAlbumId(crypto.randomUUID()),
    title,
    artistId: firstArtistId,
    pinned: 1,
    addedAt: now,
    updatedAt: now,
  };
  await unwrapResult(albumRepository.create(created));
  // Mirror findOrCreateArtists: a brand-new row needs a point-sync into the
  // list cache and a search document, or it stays invisible until reload.
  syncAlbumCaches(queryClient, created);
  await upsertSearchDocuments([await buildAlbumDocFromDb(created)]);
  return created;
};

export async function updateTrackMetadataAndSync(
  queryClient: QueryClient,
  track: Track,
  changes: TrackMetadataChanges,
) {
  const currentTrack = await unwrapResult(trackRepository.findById(track.id));

  if (!currentTrack) {
    throw new Error("Track not found");
  }

  const title = assertValidName(changes.title, "track title");
  const artistNames = dedupeArtistNames(changes.artistNames);
  for (const name of artistNames) assertValidName(name, "artist");

  if (artistNames.length === 0) {
    throw new Error("At least one artist is required");
  }

  const artists = await findOrCreateArtists(queryClient, artistNames);
  const album = await resolveAlbumForChanges(queryClient, changes, artists[0].id);
  const nextArtistIds = artists.map(artist => artist.id);
  const nextArtistName = artists.map(artist => artist.name).join(", ");
  const nextTrackNo = resolveNullableNumber(changes.trackNo, currentTrack.trackNo);
  const nextDiskNo = resolveNullableNumber(changes.diskNo, currentTrack.diskNo);
  const nextAlbumId = album?.id ?? createAlbumId("");
  // "" not undefined: albumTitle is indexed (see entities.ts).
  const nextAlbumTitle = album?.title ?? "";

  const nextTrackEntity: TrackEntity = {
    ...currentTrack,
    title,
    artistIds: nextArtistIds,
    artistName: nextArtistName,
    albumId: nextAlbumId,
    albumTitle: nextAlbumTitle,
    trackNo: nextTrackNo,
    diskNo: nextDiskNo,
  };

  await unwrapResult(trackRepository.update(currentTrack.id, {
    title,
    artistIds: nextArtistIds,
    artistName: nextArtistName,
    albumId: nextAlbumId,
    albumTitle: nextAlbumTitle,
    trackNo: nextTrackNo,
    diskNo: nextDiskNo,
  }));

  // An album-less track resolves its cover from its own id; once it joins an
  // album that owner stops being consulted, so the embedded art must follow —
  // to the album when it has none, otherwise the track row is just retired.
  if (!currentTrack.albumId && album) {
    const trackCover = await unwrapResult(coverRepository.findByOwner("track", currentTrack.id));
    if (trackCover) {
      const albumCover = await unwrapResult(coverRepository.findByOwner("album", album.id));
      if (!albumCover) {
        await unwrapResult(coverRepository.upsertOwnerCover("album", album.id, trackCover.blob));
        updateCoverCache("album", album.id, trackCover.blob);
      }
      await unwrapResult(coverRepository.deleteByOwner("track", currentTrack.id));
      removeCoverCache("track", currentTrack.id);
    }
  }

  // The reverse move: leaving an album makes the track its own cover owner,
  // so it takes a copy of the album art along unless it already has its own.
  // The album keeps its cover — other tracks may still live there.
  if (currentTrack.albumId && !album) {
    const trackCover = await unwrapResult(coverRepository.findByOwner("track", currentTrack.id));
    if (!trackCover) {
      const albumCover = await unwrapResult(coverRepository.findByOwner("album", currentTrack.albumId));
      if (albumCover) {
        await unwrapResult(coverRepository.upsertOwnerCover("track", currentTrack.id, albumCover.blob));
        updateCoverCache("track", currentTrack.id, albumCover.blob);
      }
    }
  }

  const nextTrack: Track = {
    ...track,
    title,
    artist: nextArtistName,
    artistIds: nextArtistIds,
    albumId: nextAlbumId,
    albumName: nextAlbumTitle,
    trackNo: nextTrackEntity.trackNo,
    diskNo: nextTrackEntity.diskNo,
  };

  syncTrackMetadataCaches(queryClient, nextTrackEntity, nextTrack);

  await upsertSearchDocuments([await buildTrackDocFromDb(nextTrackEntity)]);

  await invalidateForTrackMutation(queryClient, {
    kind: "metadata",
    artistIds: unique([...currentTrack.artistIds, ...nextArtistIds]),
    albumIds: unique([currentTrack.albumId, nextAlbumId].filter(Boolean)),
  });

  return nextTrack;
}

export async function deleteTrackAndSync(
  queryClient: QueryClient,
  track: Track,
) {
  const trackId = track.id;
  const currentTrack = await unwrapResult(trackRepository.findById(trackId));

  if (!currentTrack) {
    throw new Error("Track not found");
  }

  const now = Date.now();
  // Rows die inside the transaction, the copy's file after it.
  const copies = await unwrapResult(offlineCopyRepository.findByIds([trackId]));

  const txResult = await unitOfWork.runScoped(
    [db.tracks, db.albums, db.artists, db.playlists, db.covers, db.offlineCopies],
    async () => {
      // Playlists are read inside the tx and written back as partial updates,
      // so a rename racing the delete survives.
      const playlists = await unwrapResult(playlistRepository.findAll());
      const nextPlaylists = playlists
        .filter(playlist => playlist.trackIds.includes(trackId))
        .map(playlist => ({
          ...playlist,
          trackIds: playlist.trackIds.filter(id => id !== trackId),
          updatedAt: now,
        }));
      if (nextPlaylists.length > 0) {
        await unwrapResult(playlistRepository.updateMany(nextPlaylists.map(playlist => ({
          key: playlist.id,
          changes: { trackIds: playlist.trackIds, updatedAt: playlist.updatedAt },
        }))));
      }
      if (copies.length > 0) {
        await unwrapResult(offlineCopyRepository.deleteMany(copies.map(copy => copy.trackId)));
      }
      await unwrapResult(trackRepository.delete(trackId));
      // The album dies with its last track, the artist with their last album.
      await cleanupAfterTrackRemoval([currentTrack]);
      return nextPlaylists;
    },
  );
  if (txResult.isErr()) throw txResult.error;
  const nextPlaylists = txResult.value;

  await cleanupOfflineCopyFiles(copies);
  for (const nextPlaylist of nextPlaylists) {
    syncPlaylistCaches(queryClient, nextPlaylist);
    syncPlaylistTrackRemoval(queryClient, nextPlaylist.id, trackId);
  }
  removeTracksFromCaches(queryClient, [trackId]);
  queryClient.removeQueries({ queryKey: queryKeys.tracks.detail(trackId), exact: true });
  removeCoverCache("track", trackId);
  await removeSearchDocuments([`track:${trackId}`]);

  await invalidateForTrackMutation(queryClient, {
    kind: "removal",
    albumIds: [currentTrack.albumId],
    artistIds: currentTrack.artistIds,
    playlistIds: nextPlaylists.map(playlist => playlist.id),
  });
}
