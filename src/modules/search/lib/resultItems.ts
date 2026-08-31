import type { RouteLocationRaw } from "vue-router";
import { routeLocation, type ViewIntent } from "@/app/router/route-locations";
import { THUMB_SIZE_ROW } from "@/lib/media/cover-sizes";
import { sourceCoverUrl } from "@/modules/sources/lib/display";
import type {
  SourceAlbumDTO,
  SourceArtistDTO,
  SourcePlaylistDTO,
  SourceSearchHit,
  SourceTrackDTO,
} from "@/modules/sources/types";
import type { SourceKind } from "@/types/track-ref";
import type { SearchResultItem } from "../types";

//
// Source DTO → the row the search pane renders. One place, because every
// list that shows search results would otherwise grow its own answer to
// "what does an album row say" — which is exactly what the YouTube pane
// used to do, with a different one.
//

/** `t` with a count is vue-i18n's plural form: t("common.trackCount", 3). */
type Translate = (key: string, plural: number) => string;

const coverOf = (kind: SourceKind, coverRef: string | undefined): string | undefined =>
  sourceCoverUrl(kind, coverRef, THUMB_SIZE_ROW) || undefined;

export const trackResultItem = (dto: SourceTrackDTO): SearchResultItem => ({
  id: dto.id,
  type: "track",
  title: dto.title,
  artist: dto.artistName,
  album: dto.albumTitle,
  entityId: dto.id,
  score: 0,
  duration: dto.duration,
});

export const albumResultItem = (dto: SourceAlbumDTO, kind: SourceKind): SearchResultItem => ({
  id: dto.id,
  type: "album",
  title: dto.title,
  artist: [dto.artistName, dto.year].filter(Boolean).join(" · ") || undefined,
  entityId: dto.id,
  score: 0,
  coverPath: coverOf(kind, dto.coverRef),
});

// The row already labels the entity as an artist — a subtitle would only
// repeat it.
export const artistResultItem = (dto: SourceArtistDTO, kind: SourceKind): SearchResultItem => ({
  id: dto.id,
  type: "artist",
  title: dto.name,
  entityId: dto.id,
  score: 0,
  coverPath: coverOf(kind, dto.coverRef),
});

export const playlistResultItem = (
  dto: SourcePlaylistDTO,
  kind: SourceKind,
  t: Translate,
): SearchResultItem => ({
  id: dto.id,
  type: "playlist",
  title: dto.name,
  // A search card often omits the count; 0 there means "not said", not empty.
  artist: dto.trackCount > 0 ? t("common.trackCount", dto.trackCount) : undefined,
  entityId: dto.id,
  score: 0,
  coverPath: coverOf(kind, dto.coverRef),
});

/**
 * Per-artist links for a track row. Built from the ordered credits, so a
 * name whose artist has no page stays plain text in its own position —
 * `artistIds` alone cannot say which name it belongs to.
 */
export const trackArtistRoutes = (
  dto: SourceTrackDTO,
  intent?: ViewIntent,
): (RouteLocationRaw | null)[] =>
  (dto.artists ?? []).map(artist => (artist.id ? routeLocation.artist(artist.id, intent) : null));

export const hitResultItem = (
  hit: SourceSearchHit,
  kind: SourceKind,
  t: Translate,
): SearchResultItem => {
  switch (hit.kind) {
    case "track": return trackResultItem(hit.item);
    case "album": return albumResultItem(hit.item, kind);
    case "artist": return artistResultItem(hit.item, kind);
    case "playlist": return playlistResultItem(hit.item, kind, t);
  }
};

/**
 * Where a result leads. Tracks return null — a track result plays, it does
 * not navigate. `intent` is what makes a remote row open the source's view
 * of an entity rather than the library row under the same branded id.
 */
export const searchResultRoute = (
  item: SearchResultItem,
  intent?: ViewIntent,
): RouteLocationRaw | null => {
  switch (item.type) {
    // Branded ids: search results carry the same `<kind>:<id>` the routes take.
    case "album": return routeLocation.album(item.entityId, intent);
    case "artist": return routeLocation.artist(item.entityId, intent);
    case "playlist": return routeLocation.playlist(item.entityId, intent);
    default: return null;
  }
};
