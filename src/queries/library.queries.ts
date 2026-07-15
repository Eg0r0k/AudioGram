import {
  albumRepository,
  artistRepository,
  folderRepository,
  playlistRepository,
  trackRepository,
} from "@/db/repositories";
import type { AlbumId, ArtistId } from "@/types/ids";
import { queryKeys } from "@/queries/query-keys";
import { queryOptions, type QueryClient } from "@tanstack/vue-query";
import { unwrapResult } from "./shared";
import type { LibrarySummaryData } from "./types";

export async function getLibrarySummary(): Promise<LibrarySummaryData> {
  const [artists, albums, playlists, folders, likedTracks] = await Promise.all([
    unwrapResult(artistRepository.findAll()),
    unwrapResult(albumRepository.findAll()),
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
    trackCount: albumTrackCounts.get(album.id as AlbumId) ?? 0,
  }));

  const artistsWithCounts = artists.map(artist => ({
    ...artist,
    trackCount: artistTrackCounts.get(artist.id as ArtistId) ?? 0,
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
    queryClient.invalidateQueries({ queryKey: queryKeys.covers.all() }),
  ]);
}

export async function clearLibraryData(queryClient: QueryClient) {
  await Promise.all([
    queryClient.removeQueries({ queryKey: queryKeys.library.summary() }),
    queryClient.removeQueries({ queryKey: queryKeys.artists.all() }),
    queryClient.removeQueries({ queryKey: queryKeys.albums.all() }),
    queryClient.removeQueries({ queryKey: queryKeys.playlists.all() }),
    queryClient.removeQueries({ queryKey: queryKeys.folders.all() }),
    queryClient.removeQueries({ queryKey: queryKeys.tracks.all() }),
    queryClient.removeQueries({ queryKey: queryKeys.covers.all() }),
  ]);

  await invalidateLibraryData(queryClient);
}
