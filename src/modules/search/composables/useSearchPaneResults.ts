import { computed, type ComputedRef } from "vue";
import { refDebounced } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { useQuery } from "@tanstack/vue-query";
import type { Track } from "@/modules/player/types";
import type { SourceKind } from "@/types/track-ref";
import type { TrackId } from "@/types/ids";
import { queryKeys } from "@/queries/query-keys";
import { getTracksByIds } from "@/queries/track.queries";
import { sourceTrackToDisplay } from "@/modules/sources/lib/display";
import { useSourcePlaylists, useSourceSearch } from "@/modules/sources/composables/useSourceCatalog";
import {
  albumResultItem,
  artistResultItem,
  playlistResultItem,
  trackResultItem,
} from "../lib/resultItems";
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
  const { t } = useI18n();

  const debounced = refDebounced(computed(() => query.value.trim()), REMOTE_DEBOUNCE_MS);
  const hasQuery = computed(() => kind.value !== null && debounced.value.length > 0);

  const search = useSourceSearch(kind, computed(() => (kind.value ? debounced.value : "")));
  const playlists = useSourcePlaylists(kind);

  const trackRows = computed<Track[]>(() =>
    (search.data.value?.tracks ?? []).map(sourceTrackToDisplay),
  );

  const groups = computed<Record<SearchEntityType, SearchResultItem[]>>(() => {
    const resolved = kind.value;
    if (!resolved) return EMPTY_GROUPS;

    return {
      track: (search.data.value?.tracks ?? []).map(trackResultItem),
      album: (search.data.value?.albums ?? []).map(album => albumResultItem(album, resolved)),
      artist: (search.data.value?.artists ?? []).map(artist => artistResultItem(artist, resolved)),
      // Subsonic's search3 does not cover playlists, so the (cached) playlist
      // list is filtered by name here instead.
      playlist: matchPlaylists(resolved),
    };
  });

  function matchPlaylists(resolved: SourceKind): SearchResultItem[] {
    const q = debounced.value.toLowerCase();
    if (!q) return [];
    return (playlists.data.value ?? [])
      .filter(playlist => playlist.name.toLowerCase().includes(q))
      .slice(0, MAX_PLAYLIST_MATCHES)
      .map(playlist => playlistResultItem(playlist, resolved, t));
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
