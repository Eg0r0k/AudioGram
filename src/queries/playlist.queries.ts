import type { PlaylistEntity, TrackEntity } from "@/db/entities";
import {
  albumRepository,
  artistRepository,
  coverRepository,
  playlistRepository,
  trackRepository,
} from "@/db/repositories";
import { queryKeys } from "@/queries/query-keys";
import { buildPlaylistDoc } from "@/modules/search/buildDocuments";
import { removeSearchDocuments, upsertSearchDocuments } from "@/modules/search/searchIndex";
import { mapTracks } from "@/modules/tracks/lib/mappers";
import type { TrackSortKey } from "@/modules/tracks/types";
import type { Track } from "@/modules/player/types";
import type { PlaylistId } from "@/types/ids";
import { PlaylistId as createPlaylistId } from "@/types/ids";
import { queryOptions, type QueryClient } from "@tanstack/vue-query";
import {
  removePlaylistCaches,
  syncPlaylistCaches,
  syncPlaylistTrackAddition,
  syncPlaylistTrackRemoval,
  updateCoverCache,
} from "./cache";
import { sortTracks, unique, unwrapResult } from "./shared";
import type { PlaylistPageData, PaginatedPlaylistTracksResult } from "./types";

const PAGE_SIZE = 50;

export interface PlaylistChanges {
  name?: string;
  description?: string;
  coverBlob?: Blob;
  removeCover?: boolean;
}

export async function getPlaylists() {
  return unwrapResult(playlistRepository.findAll());
}

export async function getPlaylistByIdOrThrow(playlistId: PlaylistId) {
  const playlist = await unwrapResult(playlistRepository.findById(playlistId));

  if (!playlist) {
    throw new Error("Playlist not found");
  }

  return playlist;
}

export async function getPlaylistPageData(
  playlistId: PlaylistId,
  sortKey: TrackSortKey | null = null,
): Promise<PlaylistPageData> {
  const playlist = await getPlaylistByIdOrThrow(playlistId);

  if (playlist.trackIds.length === 0) {
    return { playlist, tracks: [] };
  }

  let rawTracks: TrackEntity[];
  if (sortKey) {
    rawTracks = await unwrapResult(trackRepository.findSortedByIds(playlist.trackIds, sortKey));
  }
  else {
    const unorderedTracks = await unwrapResult(trackRepository.findByIds(playlist.trackIds));
    const trackMap = new Map(unorderedTracks.map(track => [track.id, track]));
    rawTracks = playlist.trackIds.flatMap((id) => {
      const track = trackMap.get(id);
      return track ? [track] : [];
    });
  }

  const artistIds = unique(rawTracks.flatMap(track => track.artistIds));
  const albumIds = unique(rawTracks.map(track => track.albumId));

  const [artists, albums] = await Promise.all([
    unwrapResult(artistRepository.findByIds(artistIds)),
    unwrapResult(albumRepository.findByIds(albumIds)),
  ]);

  return {
    playlist,
    tracks: mapTracks(rawTracks, artists, albums),
  };
}

export async function getPlaylistTracksPaginated(
  playlistId: PlaylistId,
  offset: number,
  limit = PAGE_SIZE,
  sortKey: TrackSortKey | null = null,
): Promise<PaginatedPlaylistTracksResult> {
  const playlist = await getPlaylistByIdOrThrow(playlistId);
  const total = playlist.trackIds.length;

  if (total === 0) {
    return { tracks: [], nextOffset: null, total, totalDuration: 0 };
  }

  const allTracks = await unwrapResult(trackRepository.findByIds(playlist.trackIds));
  const totalDuration = allTracks.reduce((sum, t) => sum + (t.duration ?? 0), 0);

  let currentTracksPage: TrackEntity[];

  if (sortKey) {
    const sorted = sortTracks(allTracks, sortKey);
    currentTracksPage = sorted.slice(offset, offset + limit);
  }
  else {
    const trackMap = new Map(allTracks.map(track => [track.id, track]));
    const trackIdsPage = playlist.trackIds.slice(offset, offset + limit);
    currentTracksPage = trackIdsPage.flatMap((id) => {
      const track = trackMap.get(id);
      return track ? [track] : [];
    });
  }

  const artistIds = unique(currentTracksPage.flatMap(track => track.artistIds));
  const albumIds = unique(currentTracksPage.map(track => track.albumId));

  const [artists, albums] = await Promise.all([
    unwrapResult(artistRepository.findByIds(artistIds)),
    unwrapResult(albumRepository.findByIds(albumIds)),
  ]);

  const nextOffset = offset + limit < total ? offset + limit : null;

  return {
    tracks: mapTracks(currentTracksPage, artists, albums),
    nextOffset,
    total,
    totalDuration,
  };
}
export const playlistQueries = {
  all: () =>
    queryOptions({
      queryKey: queryKeys.playlists.all(),
      queryFn: getPlaylists,
    }),
  detail: (playlistId: PlaylistId) =>
    queryOptions({
      queryKey: queryKeys.playlists.detail(playlistId),
      queryFn: () => getPlaylistByIdOrThrow(playlistId),
    }),
  page: (playlistId: PlaylistId) =>
    queryOptions({
      queryKey: queryKeys.playlists.page(playlistId),
      queryFn: () => getPlaylistPageData(playlistId),
    }),
  tracksPageInfinite: (playlistId: PlaylistId, pageParam: number, sortKey: TrackSortKey | null = null) =>
    queryOptions({
      queryKey: [...queryKeys.playlists.tracksPage(playlistId, sortKey), pageParam],
      queryFn: () => getPlaylistTracksPaginated(playlistId, pageParam, PAGE_SIZE, sortKey),
    }),
} as const;

export async function createPlaylistAndSync(queryClient: QueryClient, name = "New playlist") {
  const now = Date.now();
  const playlist: PlaylistEntity = {
    id: createPlaylistId(crypto.randomUUID()),
    name,
    trackIds: [],
    addedAt: now,
    updatedAt: now,
  };

  await unwrapResult(playlistRepository.create(playlist));
  syncPlaylistCaches(queryClient, playlist);
  await upsertSearchDocuments([buildPlaylistDoc(playlist)]);

  return playlist;
}

export async function updatePlaylistAndSync(
  queryClient: QueryClient,
  currentPlaylist: PlaylistEntity,
  changes: PlaylistChanges,
) {
  let nextPlaylist = currentPlaylist;
  let didUpdatePlaylist = false;

  if (changes.coverBlob) {
    await unwrapResult(coverRepository.upsertPlaylistCover(
      currentPlaylist.id,
      changes.coverBlob,
    ));
    updateCoverCache(queryClient, "playlist", currentPlaylist.id, changes.coverBlob);
  }
  else if (changes.removeCover) {
    await unwrapResult(coverRepository.deletePlaylistCover(currentPlaylist.id));
    updateCoverCache(queryClient, "playlist", currentPlaylist.id, null);
  }

  const updateData: Partial<PlaylistEntity> = {};

  if (changes.name && changes.name !== currentPlaylist.name) {
    updateData.name = changes.name;
  }

  if (changes.description !== undefined) {
    updateData.description = changes.description;
  }

  if (Object.keys(updateData).length > 0) {
    nextPlaylist = {
      ...currentPlaylist,
      ...updateData,
      updatedAt: Date.now(),
    };

    await unwrapResult(playlistRepository.update(currentPlaylist.id, updateData));
    syncPlaylistCaches(queryClient, nextPlaylist);
    didUpdatePlaylist = true;
  }

  if (didUpdatePlaylist) {
    await upsertSearchDocuments([buildPlaylistDoc(nextPlaylist)]);

    queryClient.setQueryData(queryKeys.playlists.page(currentPlaylist.id), (data: PlaylistPageData | undefined) =>
      data
        ? {
            ...data,
            playlist: nextPlaylist,
          }
        : data,
    );
  }

  return nextPlaylist;
}

export async function deletePlaylistAndSync(
  queryClient: QueryClient,
  currentPlaylist: PlaylistEntity | null,
) {
  if (!currentPlaylist) {
    return;
  }

  await unwrapResult(coverRepository.deletePlaylistCover(currentPlaylist.id));
  await unwrapResult(playlistRepository.delete(currentPlaylist.id));
  await removeSearchDocuments([`playlist:${currentPlaylist.id}`]);

  removePlaylistCaches(queryClient, currentPlaylist.id);
  queryClient.removeQueries({ queryKey: queryKeys.playlists.cover(currentPlaylist.id), exact: true });
}

export async function removeTrackFromPlaylistAndSync(
  queryClient: QueryClient,
  playlistId: PlaylistId,
  trackId: string,
) {
  const playlist = await getPlaylistByIdOrThrow(playlistId);

  await unwrapResult(playlistRepository.removeTrack(playlistId, trackId as never));

  const nextPlaylist: PlaylistEntity = {
    ...playlist,
    trackIds: playlist.trackIds.filter(id => id !== trackId),
    updatedAt: Date.now(),
  };

  syncPlaylistCaches(queryClient, nextPlaylist);
  syncPlaylistTrackRemoval(queryClient, playlistId, trackId);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.detail(playlistId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.page(playlistId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.tracksPage(playlistId) }),
  ]);

  return nextPlaylist;
}

export async function addTrackToPlaylistAndSync(
  queryClient: QueryClient,
  playlistId: PlaylistId,
  track: Track,
) {
  const playlist = await getPlaylistByIdOrThrow(playlistId);

  await unwrapResult(playlistRepository.addTrack(playlistId, track.id));

  const nextPlaylist: PlaylistEntity = {
    ...playlist,
    trackIds: playlist.trackIds.includes(track.id)
      ? playlist.trackIds
      : [...playlist.trackIds, track.id],
    updatedAt: Date.now(),
  };

  syncPlaylistCaches(queryClient, nextPlaylist);
  syncPlaylistTrackAddition(queryClient, playlistId, track);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.detail(playlistId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.page(playlistId) }),
  ]);

  return nextPlaylist;
}

export async function addTracksToPlaylistAndSync(
  queryClient: QueryClient,
  playlistId: PlaylistId,
  tracks: Track[],
) {
  const playlist = await getPlaylistByIdOrThrow(playlistId);
  const nextTrackIds = [...playlist.trackIds];

  for (const track of tracks) {
    await unwrapResult(playlistRepository.addTrack(playlistId, track.id));

    if (!nextTrackIds.includes(track.id)) {
      nextTrackIds.push(track.id);
    }

    syncPlaylistTrackAddition(queryClient, playlistId, track);
  }

  const nextPlaylist: PlaylistEntity = {
    ...playlist,
    trackIds: nextTrackIds,
    updatedAt: Date.now(),
  };

  syncPlaylistCaches(queryClient, nextPlaylist);

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.library.summary() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.detail(playlistId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.page(playlistId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.tracksPage(playlistId) }),
  ]);

  return nextPlaylist;
}
