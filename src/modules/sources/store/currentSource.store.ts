import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { SourceKind } from "@/types/track-ref";
import { sources } from "../registry";

//
// The library-pages source axis: pages (Artists/Albums/Album/Playlists) pick
// their data path from this store. It is a DIFFERENT axis from the search
// source switcher in SidebarHeader — that one asks the registry for
// `searchable()` where this one asks for `browsable()`.
//
// The list comes from the registry rather than from an ND config check, so a
// source added later shows up here without touching this file.
//

export const useCurrentSourceStore = defineStore("currentSource", () => {
  const selected = ref<SourceKind>("local");

  const availableSources = computed<SourceKind[]>(() => sources.browsable());

  /** The effective source: one that has gone away falls back to local. */
  const currentSource = computed<SourceKind>(() =>
    availableSources.value.includes(selected.value) ? selected.value : "local",
  );

  const setSource = (kind: SourceKind) => {
    selected.value = kind;
  };

  return { selected, availableSources, currentSource, setSource };
}, {
  persist: { pick: ["selected"] },
});
