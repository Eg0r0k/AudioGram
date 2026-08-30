import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { LIBRARY_FILTERS, type LibraryFilter, type LibraryItem } from "@/modules/library/types";
import { routeLocation } from "@/app/router/route-locations";
import { getLogger } from "@/lib/logger";
import type { SourceKind } from "@/types/track-ref";
import { sources } from "../registry";
import type { SourceEntity } from "../types";
import { sourceCoverUrl, THUMB_SIZE_LQ, THUMB_SIZE_ROW } from "../lib/display";
import { useSourceAlbumsInfinite, useSourceArtists, useSourcePlaylists } from "./useSourceCatalog";

//
// A remote catalog as sidebar LibraryItem VMs — the same list component
// renders local and catalog rows, no template branching. System items
// (liked, all music) are library-only and stay hidden while a catalog is
// open; folders and pinning are local concepts too.
//
// The kind is a parameter, not a constant: a null kind (the local library)
// parks every query on skipToken and yields an empty list, so the caller
// can hold this composable unconditionally, as composables require.
//

/** The capability each sidebar tab needs from the source behind it. */
const FILTER_ENTITY: Record<Exclude<LibraryFilter, "all">, SourceEntity> = {
  artist: "artists",
  album: "albums",
  playlist: "playlists",
};

/**
 * Tabs a source can actually fill. A source with no browsable collection at
 * all gets none — not even "all", which would open onto a permanently empty
 * list.
 */
export const catalogFilters = (kind: SourceKind | null): LibraryFilter[] => {
  if (!kind) return [];
  const caps = sources.get(kind).capabilities;
  const listable = LIBRARY_FILTERS.filter(
    (filter): filter is Exclude<LibraryFilter, "all"> =>
      filter !== "all" && caps[FILTER_ENTITY[filter]].list,
  );
  return listable.length > 0 ? ["all", ...listable] : [];
};

// These rows ARE the source's catalog, so their links ask for the source's
// view — otherwise a downloaded album would open as its library row while
// the user is browsing the server it came from.
const CATALOG = { catalog: true } as const;

/** Fields every catalog row shares, whatever entity it stands for. */
const catalogRow = (kind: SourceKind, coverRef: string | undefined) => ({
  isPinned: false,
  isCatalog: true,
  addedAt: 0,
  updatedAt: 0,
  image: sourceCoverUrl(kind, coverRef, THUMB_SIZE_ROW) || undefined,
  imageLow: sourceCoverUrl(kind, coverRef, THUMB_SIZE_LQ) || undefined,
});

export function useCatalogLibraryItems(
  kind: MaybeRefOrGetter<SourceKind | null>,
  filter: MaybeRefOrGetter<LibraryFilter>,
) {
  // Each collection is queried only from a source that can enumerate it —
  // otherwise the query would fire straight into an `unsupported` error.
  const kindFor = (entity: SourceEntity) => computed(() => {
    const resolved = toValue(kind);
    return resolved && sources.get(resolved).capabilities[entity].list ? resolved : null;
  });

  const artistsQuery = useSourceArtists(kindFor("artists"));
  const playlistsQuery = useSourcePlaylists(kindFor("playlists"));
  const albumsQuery = useSourceAlbumsInfinite(kindFor("albums"), "alpha");

  const items = computed<LibraryItem[]>(() => {
    const resolved = toValue(kind);
    if (!resolved) return [];

    const active = toValue(filter);
    const result: LibraryItem[] = [];

    if (active === "all" || active === "artist") {
      for (const artist of artistsQuery.data.value ?? []) {
        result.push({
          ...catalogRow(resolved, artist.coverRef),
          id: artist.id,
          type: "artist",
          title: artist.name,
          artistName: artist.name,
          to: routeLocation.artist(artist.id, CATALOG),
          rounded: true,
        });
      }
    }

    if (active === "all" || active === "album") {
      for (const album of albumsQuery.data.value?.pages.flat() ?? []) {
        result.push({
          ...catalogRow(resolved, album.coverRef),
          id: album.id,
          type: "album",
          title: album.title,
          subtitle: album.artistName,
          artistName: album.artistName,
          to: routeLocation.album(album.id, CATALOG),
          rounded: false,
          trackCount: album.trackCount,
        });
      }
    }

    if (active === "all" || active === "playlist") {
      for (const playlist of playlistsQuery.data.value ?? []) {
        result.push({
          ...catalogRow(resolved, playlist.coverRef),
          id: playlist.id,
          type: "playlist",
          title: playlist.name,
          to: routeLocation.playlist(playlist.id, CATALOG),
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

  /** Pulls the next album page when the list scroll nears the end. */
  const loadMoreAlbums = () => {
    if (!albumsQuery.hasNextPage.value || albumsQuery.isFetchingNextPage.value) return;
    // The query keeps its own error state for the UI; the log is what tells
    // us WHY a scroll stopped loading more albums.
    albumsQuery.fetchNextPage().catch((error: unknown) => {
      getLogger().warn(`[Sources] Loading the next album page failed: ${String(error)}`);
    });
  };

  return { items, isLoading, loadMoreAlbums };
}
