import type { RouteLocationRaw } from "vue-router";
import { routeLocation } from "@/app/router/route-locations";
import type { SearchResultItem } from "@/modules/search/types";
import type { YtArtistRef, YtMusicEntity } from "../types";
import { proxiedThumbnail, THUMB_SIZE_ROW } from "./thumbnail";

type Translate = (key: string, named?: Record<string, unknown>) => string;

function entitySubtitle(item: YtMusicEntity, t: Translate): string | undefined {
  switch (item.kind) {
    case "album": {
      const artist = item.artists.map(a => a.name).join(", ");
      return [artist, item.year].filter(Boolean).join(" · ") || undefined;
    }
    case "playlist":
      return item.trackCount != null
        ? t("youtube.tracksCount", { count: item.trackCount })
        : item.owner ?? undefined;
    default:
      // The row already labels the entity type — artists need no subtitle.
      return undefined;
  }
}

/** YT search entity as the local-search row VM (`SearchDropdownRow`). */
export function ytEntityResultItem(item: YtMusicEntity, t: Translate): SearchResultItem {
  return {
    id: item.id,
    type: item.kind,
    title: item.kind === "artist" ? item.name : item.title,
    artist: entitySubtitle(item, t),
    entityId: item.id,
    score: 0,
    coverPath: item.thumbnail ? proxiedThumbnail(item.thumbnail, THUMB_SIZE_ROW) : undefined,
  };
}

/** Artist links for a YT track row — entries without an id stay plain text. */
export function ytArtistRoutes(artists: YtArtistRef[]): (RouteLocationRaw | null)[] {
  return artists.map(artist => (artist.id ? routeLocation.ytArtist(artist.id) : null));
}

/** YT routes diverge from the local ones `SearchDropdownRow` derives. */
export function ytEntityRoute(item: YtMusicEntity): RouteLocationRaw | null {
  switch (item.kind) {
    case "album": return routeLocation.ytAlbum(item.id);
    case "playlist": return routeLocation.ytPlaylist(item.id);
    case "artist": return routeLocation.ytArtist(item.id);
    default: return null;
  }
}
