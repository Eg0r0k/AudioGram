import { computed, type ComputedRef } from "vue";
import { refDebounced } from "@vueuse/core";
import { useQuery } from "@tanstack/vue-query";
import type { Track } from "@/modules/player/types";
import type { SourceKind } from "@/types/track-ref";
import type { TrackId } from "@/types/ids";
import { queryKeys } from "@/queries/query-keys";
import { getTracksByIds } from "@/queries/track.queries";
import { THUMB_SIZE_ROW } from "@/lib/media/cover-sizes";
import { sourceCoverUrl, sourceTrackToDisplay } from "@/modules/sources/lib/display";
import { useSourcePlaylists, useSourceSearch } from "@/modules/sources/composables/useSourceCatalog";
import type { SearchResultItem, SearchEntityType } from "../types";
import { useSearch } from "./useSearch";

//
// One shape for the search pane, whatever answered the query: the local
// MiniSearch index or a source's own search endpoint. The pane renders this
// and nothing else, so the two paths cannot drift in what they display.
//

export interface SearchPaneResults {
  isLoading: ComputedRef<boolean>;
  hasQuery: ComputedRef<boolean>;
  /** The query these results belong to — debounced, so "no results for X" matches. */
  query: ComputedRef<string>;
  /** Cross-type best matches; only the scored local index produces them. */
  top: ComputedRef<SearchResultItem[]>;
  groups: ComputedRef<Record<SearchEntityType, SearchResultItem[]>>;
  trackRows: ComputedRef<Track[]>;
  topTrack: ComputedRef<Track | undefined>;
}

const REMOTE_DEBOUNCE_MS = 300;
const MAX_PLAYLIST_MATCHES = 10;

const EMPTY_GROUPS: Record<SearchEntityType, SearchResultItem[]> = {
  track: [], artist: [], album: [], playlist: [],
};

/** The library index: scored, so it is the only path with top results. */
const useLibraryResults = (enabled: ComputedRef<boolean>): SearchPaneResults => {
  const { query, results, isSearching, hasQuery } = useSearch();

  const groups = computed(() => (enabled.value ? results.value.groups : EMPTY_GROUPS));
  const top = computed(() => (enabled.value ? results.value.topResults : []));

  // The index stores ids; the rows behind them come from Dexie.
  const trackIds = computed(() => groups.value.track.map(item => item.entityId as TrackId));
  const { data: hydrated } = useQuery({
    queryKey: computed(() => queryKeys.tracks.byIds(trackIds.value)),
    queryFn: () => getTracksByIds(trackIds.value),
    enabled: computed(() => trackIds.value.length > 0),
  });
  const trackRows = computed<Track[]>(() => hydrated.value ?? []);

  return {
    isLoading: computed(() => enabled.value && isSearching.value),
    hasQuery: computed(() => enabled.value && hasQuery.value),
    query: computed(() => query.value),
    top,
    groups,
    trackRows,
    topTrack: computed(() => {
      const first = top.value[0];
      if (first?.type !== "track") return undefined;
      return trackRows.value.find(track => track.id === first.entityId);
    }),
  };
};

/** A source's own search. Parks on skipToken while `kind` is null. */
const useRemoteResults = (kind: ComputedRef<SourceKind | null>): SearchPaneResults => {
  const { query } = useSearch();

  const debounced = refDebounced(computed(() => query.value.trim()), REMOTE_DEBOUNCE_MS);
  const hasQuery = computed(() => kind.value !== null && debounced.value.length > 0);

  const search = useSourceSearch(kind, computed(() => (kind.value ? debounced.value : "")));
  const playlists = useSourcePlaylists(kind);

  const coverFor = (coverRef: string | undefined) =>
    (kind.value ? sourceCoverUrl(kind.value, coverRef, THUMB_SIZE_ROW) || undefined : undefined);

  const trackRows = computed<Track[]>(() =>
    (search.data.value?.tracks ?? []).map(sourceTrackToDisplay),
  );

  const groups = computed<Record<SearchEntityType, SearchResultItem[]>>(() => ({
    track: trackRows.value.map(track => ({
      id: track.id,
      type: "track",
      title: track.title,
      artist: track.artist,
      entityId: track.id,
      score: 0,
    })),
    album: (search.data.value?.albums ?? []).map(album => ({
      id: album.id,
      type: "album",
      title: album.title,
      artist: album.artistName,
      entityId: album.id,
      score: 0,
      coverPath: coverFor(album.coverRef),
    })),
    artist: (search.data.value?.artists ?? []).map(artist => ({
      id: artist.id,
      type: "artist",
      title: artist.name,
      entityId: artist.id,
      score: 0,
      coverPath: coverFor(artist.coverRef),
    })),
    // Subsonic's search3 does not cover playlists, so the (cached) playlist
    // list is filtered by name here instead.
    playlist: matchPlaylists(),
  }));

  function matchPlaylists(): SearchResultItem[] {
    const q = debounced.value.toLowerCase();
    if (!q) return [];
    return (playlists.data.value ?? [])
      .filter(playlist => playlist.name.toLowerCase().includes(q))
      .slice(0, MAX_PLAYLIST_MATCHES)
      .map(playlist => ({
        id: playlist.id,
        type: "playlist" as const,
        title: playlist.name,
        entityId: playlist.id,
        score: 0,
        coverPath: coverFor(playlist.coverRef),
      }));
  }

  return {
    isLoading: computed(() => hasQuery.value && search.isLoading.value),
    hasQuery,
    query: computed(() => debounced.value),
    // A source returns groups, not a ranking — nothing to promote.
    top: computed(() => []),
    groups,
    trackRows,
    topTrack: computed(() => undefined),
  };
};

/**
 * Results for the pane, from whichever source is selected. Both paths are
 * held unconditionally — composables cannot be called in a branch — and the
 * unselected one idles: the local one reads module state, the remote one
 * parks its queries on skipToken.
 */
export function useSearchPaneResults(kind: ComputedRef<SourceKind>): SearchPaneResults {
  const library = useLibraryResults(computed(() => kind.value === "local"));
  const remote = useRemoteResults(computed(() => (kind.value === "local" ? null : kind.value)));

  return {
    isLoading: computed(() => (kind.value === "local" ? library : remote).isLoading.value),
    hasQuery: computed(() => (kind.value === "local" ? library : remote).hasQuery.value),
    query: computed(() => (kind.value === "local" ? library : remote).query.value),
    top: computed(() => (kind.value === "local" ? library : remote).top.value),
    groups: computed(() => (kind.value === "local" ? library : remote).groups.value),
    trackRows: computed(() => (kind.value === "local" ? library : remote).trackRows.value),
    topTrack: computed(() => (kind.value === "local" ? library : remote).topTrack.value),
  };
}
