import type { SourceKind } from "@/types/track-ref";
import { sources } from "../registry";
import type { SourceEntity } from "../types";
import { sourceKindOf } from "./display";

//
// Which source, if any, stands behind a branded entity id. Pure lookups over
// the registry's capability table — no reactivity, no queries — so routing
// guards, queries and composables can all ask the same question.
//

/**
 * The remote source behind an entity id when it can open that entity by id;
 * null → the local Dexie path. Asks about `open`, not `list`: a page reached
 * by id needs the one collection, not the catalog it came from.
 */
export const remoteCatalogKindOf = (id: string, entity: SourceEntity): SourceKind | null => {
  const kind = sourceKindOf(id);
  if (kind === "local") return null;
  return sources.get(kind).capabilities[entity].open ? kind : null;
};

/**
 * The remote source behind an entity id when it can enumerate that whole
 * collection; null → nothing to list. Distinct from {@link remoteCatalogKindOf}:
 * a source may open one entity by id without having a browsable catalog.
 */
export const remoteListKindOf = (id: string, entity: SourceEntity): SourceKind | null => {
  const kind = sourceKindOf(id);
  if (kind === "local") return null;
  return sources.get(kind).capabilities[entity].list ? kind : null;
};

/**
 * The source behind a playlist id that hands its tracks over page by page;
 * null → whatever opens it returns the playlist whole.
 *
 * The presence of {@link SourceProvider.getPlaylistPage} is the contract, so
 * a source added later opts into lazy paging by implementing it — nothing
 * here or on the page names a particular source.
 */
export const pagedPlaylistKindOf = (id: string): SourceKind | null => {
  const kind = remoteCatalogKindOf(id, "playlists");
  return kind && sources.get(kind).getPlaylistPage ? kind : null;
};
