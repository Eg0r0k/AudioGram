import {
  albumRepository,
  artistRepository,
  folderRepository,
  playlistRepository,
  trackRepository,
} from "@/db/repositories";
import { queryKeys } from "@/queries/query-keys";
import { coverCache } from "@/modules/covers/lib/cover-cache";
import { queryOptions, type QueryClient } from "@tanstack/vue-query";
import { unwrapResult } from "./shared";
import type { LibrarySummaryData } from "./types";

export async function getLibrarySummary(): Promise<LibrarySummaryData> {
  // Playing from ND/YT browsing must not grow the library — shadow rows
  // (pinned = 0) are excluded by the pinned index.
  const [artists, albums, playlists, folders, likedTracks] = await Promise.all([
    unwrapResult(artistRepository.findPinned()),
    unwrapResult(albumRepository.findPinned()),
    unwrapResult(playlistRepository.findAll()),
    unwrapResult(folderRepository.findAll()),
    unwrapResult(trackRepository.findLiked()),
  ]);

  const [albumTrackCounts, artistTrackCounts] = await Promise.all([
    unwrapResult(trackRepository.countByAlbumIds(albums.map(a => a.id))),
    unwrapResult(trackRepository.countByArtistIds(artists.map(a => a.id))),
  ]);

  const albumsWithCounts = albums.map(album => ({
    ...album,
    trackCount: albumTrackCounts.get(album.id) ?? 0,
  }));

  const artistsWithCounts = artists.map(artist => ({
    ...artist,
    trackCount: artistTrackCounts.get(artist.id) ?? 0,
  }));

  return {
    artists: artistsWithCounts,
    albums: albumsWithCounts,
    playlists,
    folders,
    likedTracks,
  };
}

export const libraryQueries = {
  summary: () =>
    queryOptions({
      queryKey: queryKeys.library.summary(),
      queryFn: getLibrarySummary,
    }),
} as const;

export async function invalidateLibrarySummary(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.library.summary() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.folders.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tracks.liked() }),
  ]);
}

export async function invalidateLibraryData(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.library.summary() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.artists.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.albums.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.folders.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tracks.all() }),
  ]);
  coverCache.invalidateAll();
}

/**
 * After a full database wipe. Every cached answer is wrong now, so all of
 * them go — reset, not removed: removeQueries leaves a mounted observer
 * holding the old rows, reset blanks it and re-reads the empty database.
 */
export async function clearLibraryData(queryClient: QueryClient) {
  await queryClient.resetQueries();
  coverCache.invalidateAll();
}
