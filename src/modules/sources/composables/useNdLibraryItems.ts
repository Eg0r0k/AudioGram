import { computed, type MaybeRefOrGetter, toValue } from "vue";
import type { LibraryFilter, LibraryItem } from "@/modules/library/types";
import { routeLocation } from "@/app/router/route-locations";
import { PlaylistId } from "@/types/ids";
import { sourceCoverUrl, THUMB_SIZE_ROW } from "../lib/display";
import { useNdAlbumsInfinite, useNdArtists, useNdPlaylists } from "./useNdCatalog";

//
// ND catalog as sidebar LibraryItem VMs — the same list component renders
// local and ND items, no template branching. System items (liked, all
// music) are library-only and stay hidden in ND mode; folders and pinning
// are local concepts too.
//

export function useNdLibraryItems(filter: MaybeRefOrGetter<LibraryFilter>) {
  const artistsQuery = useNdArtists();
  const playlistsQuery = useNdPlaylists();
  const albumsQuery = useNdAlbumsInfinite("alpha");

  const items = computed<LibraryItem[]>(() => {
    const active = toValue(filter);
    const result: LibraryItem[] = [];

    if (active === "all" || active === "artist") {
      for (const artist of artistsQuery.data.value ?? []) {
        result.push({
          id: artist.id,
          type: "artist",
          title: artist.name,
          isPinned: false,
          addedAt: 0,
          updatedAt: 0,
          artistName: artist.name,
          image: sourceCoverUrl("nd", artist.coverRef, THUMB_SIZE_ROW) || undefined,
          to: routeLocation.artist(artist.id),
          rounded: true,
        });
      }
    }

    if (active === "all" || active === "album") {
      for (const album of albumsQuery.data.value?.pages.flat() ?? []) {
        result.push({
          id: album.id,
          type: "album",
          title: album.title,
          subtitle: album.artistName,
          isPinned: false,
          addedAt: 0,
          updatedAt: 0,
          artistName: album.artistName,
          image: sourceCoverUrl("nd", album.coverRef, THUMB_SIZE_ROW) || undefined,
          to: routeLocation.album(album.id),
          rounded: false,
          trackCount: album.trackCount,
        });
      }
    }

    if (active === "all" || active === "playlist") {
      for (const playlist of playlistsQuery.data.value ?? []) {
        result.push({
          id: playlist.id,
          type: "playlist",
          title: playlist.name,
          isPinned: false,
          addedAt: 0,
          updatedAt: 0,
          image: sourceCoverUrl("nd", playlist.coverRef, THUMB_SIZE_ROW) || undefined,
          to: routeLocation.playlist(PlaylistId(`nd:${playlist.id}`)),
          rounded: false,
          trackCount: playlist.trackCount,
        });
      }
    }

    return result;
  });

  const isLoading = computed(() =>
    artistsQuery.isLoading.value || playlistsQuery.isLoading.value || albumsQuery.isLoading.value,
  );

  /** Pulls the next getAlbumList2 page when the list scroll nears the end. */
  function loadMoreAlbums() {
    if (!albumsQuery.hasNextPage.value || albumsQuery.isFetchingNextPage.value) return;
    albumsQuery.fetchNextPage().catch(() => {});
  }

  return { items, isLoading, loadMoreAlbums };
}
