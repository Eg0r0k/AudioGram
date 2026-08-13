import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getNdConfig } from "../navidrome/config";

//
// The library-pages source axis: pages (Artists/Albums/Album/Playlists) pick
// their data path from this store. It is a DIFFERENT axis from the search
// source switcher in SidebarHeader (library/youtube) — that one stays as is.
//

/** Sources the library pages can browse. YT keeps its own dedicated pages. */
export type PageSourceKind = "local" | "nd";

export const useCurrentSourceStore = defineStore("currentSource", () => {
  const selected = ref<PageSourceKind>("local");

  const ndAvailable = computed(() => getNdConfig() !== null);

  const availableSources = computed<PageSourceKind[]>(() =>
    ndAvailable.value ? ["local", "nd"] : ["local"],
  );

  /** The effective source: a vanished ND config falls back to local. */
  const currentSource = computed<PageSourceKind>(() =>
    selected.value === "nd" && !ndAvailable.value ? "local" : selected.value,
  );

  function setSource(kind: PageSourceKind) {
    selected.value = kind;
  }

  return { selected, ndAvailable, availableSources, currentSource, setSource };
}, {
  persist: { pick: ["selected"] },
});
