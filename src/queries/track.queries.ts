import type { ArtistEntity, TrackEntity } from "@/db/entities";
import {
  albumRepository,
  artistRepository,
  playlistRepository,
  trackRepository,
} from "@/db/repositories";
import { buildArtistDoc, buildTrackDocFromDb } from "@/modules/search/buildDocuments";
import {
  removeSearchDocuments,
  searchTracks as searchIndexedTracks,
  upsertSearchDocuments,
} from "@/modules/search/searchIndex";
import type { TrackSortKey } from "@/modules/tracks/types";
import type { SearchDocument } from "@/modules/search/types";
import { queryKeys } from "@/queries/query-keys";
import { mapTracks } from "@/modules/tracks/lib/mappers";
import type { Track } from "@/modules/player/types";
import { ArtistId as createArtistId } from "@/types/ids";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { queryOptions, type QueryClient } from "@tanstack/vue-query";
import {
  removeTracksFromCaches,
  syncPlaylistCaches,
  syncPlaylistTrackRemoval,
  syncArtistCaches,
  syncTrackLikeCaches,
  syncTrackMetadataCaches,
} from "./cache";
import { unique, unwrapResult } from "./shared";
import type { LikedTracksPageData, PaginatedTracksResult, TracksIndexPageData } from "./types";
import { getAlbumByIdOrThrow } from "./album.queries";
import { getArtistByIdOrThrow } from "./artist.queries";

const PAGE_SIZE = 50;

export interface TrackMetadataChanges {
  title: string;
  artistNames: string[];
  albumId: AlbumId;
}

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

async function resolveArtistName(artistIds: ArtistId[]): Promise<string> {
  if (artistIds.length === 0) {
    return "Unknown Artist";
  }

  const artists = await unwrapResult(artistRepository.findByIds(artistIds));
  return artists.map(artist => artist.name).join(", ") || "Unknown Artist";
}

function normalizeArtistNames(names: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const name of names) {
    const trimmed = name.trim().replace(/\s+/g, " ");
    const key = trimmed.toLowerCase();

    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
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
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.library.summary() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tracks.all() }),
    queryClient.invalidateQueries({
      predicate: query =>
        query.queryKey[0] === "tracks" && query.queryKey[1] === "index",
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.albums.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.artists.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.all() }),
  ]);
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
      trackRepository.findSortedByIds(searchResult.tracks.map(track => track.id as TrackId), sortKey),
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
    unwrapResult(trackRepository.sumDurationAll()),
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
  const [tracks, total, totalDuration] = await Promise.all([
    sortKey
      ? unwrapResult(trackRepository.findLikedSortedPaginated(sortKey, offset, limit))
      : unwrapResult(trackRepository.findLikedPaginated(offset, limit)),
    unwrapResult(trackRepository.countLiked()),
    unwrapResult(trackRepository.sumDurationByLiked()),
  ]);

  const mappedTracks = await loadTrackRelations(tracks);
  const nextOffset = offset + limit < total ? offset + limit : null;

  return {
    tracks: mappedTracks,
    nextOffset,
    total,
    totalDuration,
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
} as const;

export async function getAllTracksPaginated(
  offset: number,
  limit = PAGE_SIZE,
  sortKey?: TrackSortKey | null,
): Promise<PaginatedTracksResult> {
  const [rawTracks, total, totalDuration] = await Promise.all([
    sortKey
      ? unwrapResult(trackRepository.findAllSortedPaginated(sortKey, offset, limit))
      : unwrapResult(trackRepository.findPaginated(offset, limit)),
    unwrapResult(trackRepository.countAll()),
    unwrapResult(trackRepository.sumDurationAll()),
  ]);

  const mappedTracks = await loadTrackRelations(rawTracks);
  const nextOffset = offset + limit < total ? offset + limit : null;

  return {
    tracks: mappedTracks,
    nextOffset,
    total,
    totalDuration,
  };
}

export async function searchTracksPaginated(
  query: string,
  offset: number,
  limit = PAGE_SIZE,
): Promise<PaginatedTracksResult> {
  const { tracks, total, totalDuration } = await searchIndexedTracks(query, offset, limit);
  const nextOffset = offset + limit < total ? offset + limit : null;

  return {
    tracks,
    nextOffset,
    total,
    totalDuration,
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

export async function addTracksToAlbumAndSync(
  queryClient: QueryClient,
  albumId: AlbumId,
  tracks: Track[],
) {
  const album = await getAlbumByIdOrThrow(albumId);
  const trackIds = unique(tracks.map(track => track.id as TrackId));
  const currentTracks = await unwrapResult(trackRepository.findByIds(trackIds));
  const trackMap = new Map(currentTracks.map(track => [track.id, track]));

  for (const trackId of trackIds) {
    const currentTrack = trackMap.get(trackId);

    if (!currentTrack) {
      throw new Error(`Track not found: ${trackId}`);
    }

    const nextArtistIds = currentTrack.artistIds.includes(album.artistId)
      ? currentTrack.artistIds
      : [album.artistId, ...currentTrack.artistIds];
    const nextArtistName = await resolveArtistName(nextArtistIds);

    if (currentTrack.albumId === albumId && nextArtistIds.length === currentTrack.artistIds.length) {
      continue;
    }

    await unwrapResult(trackRepository.update(trackId, {
      albumId,
      albumTitle: album.title,
      artistIds: nextArtistIds,
      artistName: nextArtistName,
    }));
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

  const trackIds = unique(tracks.map(track => track.id as TrackId));
  const currentTracks = await unwrapResult(trackRepository.findByIds(trackIds));
  const trackMap = new Map(currentTracks.map(track => [track.id, track]));

  for (const trackId of trackIds) {
    const currentTrack = trackMap.get(trackId);

    if (!currentTrack) {
      throw new Error(`Track not found: ${trackId}`);
    }

    if (currentTrack.artistIds.includes(artistId)) {
      continue;
    }

    const nextArtistIds = [...currentTrack.artistIds, artistId];
    const nextArtistName = await resolveArtistName(nextArtistIds);

    await unwrapResult(trackRepository.update(trackId, {
      artistIds: nextArtistIds,
      artistName: nextArtistName,
    }));
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
  const trackIds = unique(tracks.map(track => track.id as TrackId));
  const currentTracks = await unwrapResult(trackRepository.findByIds(trackIds));

  for (const track of currentTracks) {
    if (track.likedAt) {
      continue;
    }

    await unwrapResult(trackRepository.setLiked(track.id, true));
  }

  await invalidateTrackRelations(queryClient);
}

export async function toggleTrackLikeAndSync(
  queryClient: QueryClient,
  track: Track,
) {
  const currentTrack = await unwrapResult(trackRepository.findById(track.id as TrackId));

  if (!currentTrack) {
    throw new Error("Track not found");
  }

  const nextValue = !track.isLiked;
  const likedAt = nextValue ? Date.now() : undefined;

  await unwrapResult(trackRepository.setLiked(track.id as TrackId, nextValue));

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
  const currentTrack = await unwrapResult(trackRepository.findById(track.id as TrackId));

  if (!currentTrack) {
    throw new Error("Track not found");
  }

  await unwrapResult(trackRepository.setLyricsPath(track.id as TrackId, lyricsPath));

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

export async function updateTrackMetadataAndSync(
  queryClient: QueryClient,
  track: Track,
  changes: TrackMetadataChanges,
) {
  const currentTrack = await unwrapResult(trackRepository.findById(track.id as TrackId));

  if (!currentTrack) {
    throw new Error("Track not found");
  }

  const title = changes.title.trim();
  const artistNames = normalizeArtistNames(changes.artistNames);

  if (!title) {
    throw new Error("Track title is required");
  }

  if (artistNames.length === 0) {
    throw new Error("At least one artist is required");
  }

  const artists = await findOrCreateArtists(queryClient, artistNames);
  const album = await getAlbumByIdOrThrow(changes.albumId);
  const nextArtistIds = artists.map(artist => artist.id);
  const nextArtistName = artists.map(artist => artist.name).join(", ");

  const nextTrackEntity: TrackEntity = {
    ...currentTrack,
    title,
    artistIds: nextArtistIds,
    artistName: nextArtistName,
    albumId: album.id,
    albumTitle: album.title,
  };

  await unwrapResult(trackRepository.update(currentTrack.id, {
    title,
    artistIds: nextArtistIds,
    artistName: nextArtistName,
    albumId: album.id,
    albumTitle: album.title,
  }));

  const nextTrack: Track = {
    ...track,
    title,
    artist: nextArtistName,
    artistIds: nextArtistIds,
    albumId: album.id,
    albumName: album.title,
  };

  syncTrackMetadataCaches(queryClient, nextTrackEntity, nextTrack);

  await upsertSearchDocuments([await buildTrackDocFromDb(nextTrackEntity)]);

  const affectedArtistIds = unique([...currentTrack.artistIds, ...nextArtistIds]);
  const affectedAlbumIds = unique([currentTrack.albumId, album.id]);
  await Promise.all([
    ...affectedArtistIds.flatMap(artistId => [
      queryClient.invalidateQueries({ queryKey: queryKeys.artists.page(artistId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.artists.tracksPage(artistId) }),
    ]),
    queryClient.invalidateQueries({ queryKey: queryKeys.tracks.likedPage() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tracks.likedPageInfinite() }),
    ...affectedAlbumIds.flatMap(albumId => [
      queryClient.invalidateQueries({ queryKey: queryKeys.albums.page(albumId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.albums.tracksPage(albumId) }),
    ]),
    queryClient.invalidateQueries({
      predicate: query =>
        query.queryKey[0] === "tracks" && query.queryKey[1] === "index",
    }),
    queryClient.invalidateQueries({
      predicate: query =>
        query.queryKey[0] === "playlists" && query.queryKey[2] === "page",
    }),
  ]);

  return nextTrack;
}

export async function deleteTrackAndSync(
  queryClient: QueryClient,
  track: Track,
) {
  const trackId = track.id as TrackId;
  const currentTrack = await unwrapResult(trackRepository.findById(trackId));

  if (!currentTrack) {
    throw new Error("Track not found");
  }

  const playlists = await unwrapResult(playlistRepository.findAll());
  const affectedPlaylists = playlists.filter(playlist => playlist.trackIds.includes(trackId));

  for (const playlist of affectedPlaylists) {
    await unwrapResult(playlistRepository.removeTrack(playlist.id, trackId));

    const nextPlaylist = {
      ...playlist,
      trackIds: playlist.trackIds.filter(id => id !== trackId),
      updatedAt: Date.now(),
    };

    syncPlaylistCaches(queryClient, nextPlaylist);
    syncPlaylistTrackRemoval(queryClient, playlist.id, trackId);
  }

  await unwrapResult(trackRepository.delete(trackId));
  removeTracksFromCaches(queryClient, [trackId]);
  queryClient.removeQueries({ queryKey: queryKeys.tracks.detail(trackId), exact: true });
  await removeSearchDocuments([`track:${trackId}`]);

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.library.summary() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.albums.page(currentTrack.albumId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.albums.tracksPage(currentTrack.albumId) }),
    ...affectedPlaylists.flatMap(playlist => [
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists.detail(playlist.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists.page(playlist.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists.tracksPage(playlist.id) }),
    ]),
    ...currentTrack.artistIds.flatMap(artistId => [
      queryClient.invalidateQueries({ queryKey: queryKeys.artists.page(artistId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.artists.tracksPage(artistId) }),
    ]),
    queryClient.invalidateQueries({
      predicate: query =>
        query.queryKey[0] === "tracks" && query.queryKey[1] === "index",
    }),
  ]);
}
