import { LIBRARY_FILTERS, type LibraryFilter } from "@/modules/library/types";
import type { SourceKind } from "@/types/track-ref";
import { sources } from "../registry";
import type { SourceEntity } from "../types";

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
