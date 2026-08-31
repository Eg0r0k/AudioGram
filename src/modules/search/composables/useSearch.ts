import { computed, readonly, ref, shallowRef, watch } from "vue";
import { useDebounceFn, useLocalStorage } from "@vueuse/core";
import {
  SEARCH_ENTITY_TYPES,
  createEmptyResults,
  type GroupedResults,
  type SearchFilter,
  type SearchResultItem,
} from "../types";
import {
  initSearchIndex,
  rebuildSearchIndex,
  searchDocuments,
} from "../service/searchIndex";
import { getLogger } from "@/lib/logger";
import type { SourceKind } from "@/types/track-ref";

const DEBOUNCE_MS = 150;
/** YT search fans out to several network requests — pause a bit longer. */
const YT_DEBOUNCE_MS = 400;
const TOP_RESULTS_COUNT = 6;
const MAX_HISTORY_ITEMS = 6;
const SEARCH_HISTORY_KEY = "audiogram-search-history";

// The search axis speaks the same vocabulary as every other source axis:
// one name per source, so a dropdown can render straight off the registry.
export type SearchSource = SourceKind;
export type YtChip = "all" | "tracks" | "albums" | "artists" | "playlists" | "videos";

const query = ref("");
const source = ref<SearchSource>("local");
const ytChip = ref<YtChip>("all");
/**
 * The query YT results search for: typing auto-commits it after a pause,
 * Enter commits instantly and (unlike auto-commits) writes history.
 */
const submittedYtQuery = ref("");
const activeFilter = ref<SearchFilter>("all");
const results = shallowRef<GroupedResults>(createEmptyResults());
const isSearching = ref(false);
const recentQueries = useLocalStorage<string[]>(
  SEARCH_HISTORY_KEY,
  [],
);
let latestSearchId = 0;

function groupResults(raw: SearchResultItem[]): GroupedResults {
  const grouped = createEmptyResults();

  for (const item of raw) {
    grouped.groups[item.type].push(item);
  }

  grouped.topResults = raw.slice(0, TOP_RESULTS_COUNT);

  return grouped;
}

const debouncedSearch = useDebounceFn(async (q: string, filter: SearchFilter) => {
  try {
    await initSearchIndex();

    const thisId = ++latestSearchId;
    const response = await searchDocuments(q, filter, { limit: 50 });

    if (thisId !== latestSearchId) return;

    results.value = groupResults(response.results);
  }
  catch (err) {
    getLogger().error(`[Search] Query failed: ${String(err)}`);
    results.value = createEmptyResults();
  }
  finally {
    isSearching.value = false;
  }
}, DEBOUNCE_MS);

watch([query, activeFilter], ([q, filter]) => {
  const trimmed = q.trim();

  if (!trimmed) {
    results.value = createEmptyResults();
    isSearching.value = false;
    latestSearchId++;
    return;
  }

  isSearching.value = true;
  // Nothing can surface here: a query failure is caught and logged inside the
  // debounced body, and a call superseded during the pause is dropped by the
  // debouncer rather than rejected.
  debouncedSearch(trimmed, filter).catch(() => {});
});

const debouncedYtCommit = useDebounceFn((trimmed: string) => {
  // The source may have switched away during the pause.
  if (source.value !== "yt") return;
  submittedYtQuery.value = trimmed;
}, YT_DEBOUNCE_MS);

watch(query, (q) => {
  if (source.value !== "yt") return;
  const trimmed = q.trim();

  if (!trimmed) {
    submittedYtQuery.value = "";
    return;
  }

  // The debounced body only assigns a ref, and a superseded call is dropped
  // rather than rejected — there is no failure to report.
  debouncedYtCommit(trimmed).catch(() => {});
});

const availableFilters: { label: string; value: SearchFilter }[] = [
  { label: "all", value: "all" },
  ...SEARCH_ENTITY_TYPES.map(type => ({ label: type, value: type })),
];

const isSearchOpen = ref(false);
// Bumped by anything that wants the search field focused without owning it
// — the mobile bottom nav, for one. The field lives in SidebarHeader, which
// watches this and does the focusing.
const focusRequests = ref(0);
// Открытие из compact-сайдбара: движение даёт анимация ширины панели,
// собственный слайд поисковой панели на это время глушится (и на закрытии).
const suppressPanelSlide = ref(false);

export function useSearch() {
  const saveQueryToHistory = (rawQuery?: string) => {
    const trimmed = (rawQuery ?? query.value).trim();
    if (!trimmed) return;

    recentQueries.value = [trimmed, ...recentQueries.value.filter(item => item !== trimmed)]
      .slice(0, MAX_HISTORY_ITEMS);
  };

  const removeHistoryItem = (value: string) => {
    recentQueries.value = recentQueries.value.filter(item => item !== value);
  };
  const clearHistory = () => {
    recentQueries.value = [];
  };
  const applyHistoryItem = (value: string) => {
    query.value = value;
  };

  const openSearch = (options?: { fromCompactExpand?: boolean }) => {
    // Повторные вызовы на уже открытой панели (focusin, ввод текста) не
    // трогают флаг — иначе фокус после Ctrl+F вернул бы слайд до закрытия.
    if (!isSearchOpen.value) {
      suppressPanelSlide.value = options?.fromCompactExpand ?? false;
    }
    isSearchOpen.value = true;
  };

  const closeSearch = () => {
    isSearchOpen.value = false;
  };

  const submitYtSearch = () => {
    const trimmed = query.value.trim();
    if (!trimmed) return;
    submittedYtQuery.value = trimmed;
    saveQueryToHistory(trimmed);
  };

  const setSource = (next: SearchSource) => {
    source.value = next;
    // Switching to YouTube with a pending query commits it right away.
    if (next === "yt" && query.value.trim() && query.value.trim() !== submittedYtQuery.value) {
      submitYtSearch();
    }
  };

  return {
    query,
    source: readonly(source),
    ytChip: readonly(ytChip),
    submittedYtQuery: readonly(submittedYtQuery),
    activeFilter,
    availableFilters,
    recentQueries: readonly(recentQueries),
    results,
    isSearching: readonly(isSearching),
    isSearchOpen: readonly(isSearchOpen),
    suppressPanelSlide: readonly(suppressPanelSlide),
    hasQuery: computed(() => query.value.trim().length > 0),
    openSearch,
    closeSearch,
    focusRequests: readonly(focusRequests),
    requestSearchFocus: () => { focusRequests.value++; },

    setSource,
    setYtChip: (chip: YtChip) => { ytChip.value = chip; },
    submitYtSearch,

    setFilter: (filter: SearchFilter) => { activeFilter.value = filter; },
    saveQueryToHistory,
    removeHistoryItem,
    clearHistory,
    applyHistoryItem,

    clear: () => {
      query.value = "";
      activeFilter.value = "all";
      submittedYtQuery.value = "";
    },
    rebuildIndex: async () => {
      await rebuildSearchIndex();
    },
  };
}
