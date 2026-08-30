import type { RouteLocationRaw } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";
import { ytAlbumId, ytArtistId, ytPlaylistId } from "@/types/track-ref";

//
// One id, two views. A downloaded remote album keeps the source's branded
// id, so "nd:al1" names both a library row and the live catalog entity —
// the id alone cannot say which the user asked for. The link says it:
// a catalog link comes from browsing a source (its search results, its
// sidebar, its pages), everything else means the library view.
//
export interface ViewIntent {
  /** Show the source's live entity even when a library row exists for it. */
  catalog?: boolean;
}

const CATALOG_QUERY = { catalog: "1" } as const;

/** Whether a resolved route asked for the source's view of the entity. */
export const wantsCatalogView = (query: Record<string, unknown>): boolean =>
  query.catalog === "1";

const withIntent = (
  name: string,
  id: string,
  intent?: ViewIntent,
): RouteLocationRaw =>
  (intent?.catalog
    ? { name, params: { id }, query: CATALOG_QUERY }
    : { name, params: { id } });

export const routeLocation = {
  home: (): RouteLocationRaw => ({ name: ROUTE_NAMES.HOME }),
  liked: (): RouteLocationRaw => ({ name: ROUTE_NAMES.LIKED }),
  album: (id: string, intent?: ViewIntent): RouteLocationRaw => withIntent(ROUTE_NAMES.ALBUM, id, intent),
  artist: (id: string, intent?: ViewIntent): RouteLocationRaw => withIntent(ROUTE_NAMES.ARTIST, id, intent),
  artistAlbums: (id: string, intent?: ViewIntent): RouteLocationRaw =>
    withIntent(ROUTE_NAMES.ARTIST_ALBUMS, id, intent),
  playlist: (id: string, intent?: ViewIntent): RouteLocationRaw => withIntent(ROUTE_NAMES.PLAYLIST, id, intent),
  settings: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS }),
  settingsGeneral: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_GENERAL }),
  settingsAudio: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_AUDIO }),
  settingsStorage: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_STORAGE }),
  settingsProxy: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_PROXY }),
  settingsSources: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_SOURCES }),
  settingsLanguage: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_LANGUAGE }),
  settingsNotifications: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_NOTIFICATIONS }),
  settingsStats: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_STATS }),
  settingsAppearance: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_APPEARANCE }),
  settingsAbout: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_ABOUT }),
  settingsTerms: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_TERMS }),
  settingsPrivacy: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_PRIVACY }),
  allMusic: (): RouteLocationRaw => ({ name: ROUTE_NAMES.ALL_MUSIC }),
  // YouTube collections live on the shared pages: these take a raw YouTube
  // id and brand it, so every call site keeps passing what the API gave it.
  // Always the catalog view — a YouTube link is by definition a link into
  // YouTube, even for an artist whose tracks are already downloaded.
  ytPlaylist: (id: string): RouteLocationRaw => routeLocation.playlist(ytPlaylistId(id), { catalog: true }),
  ytAlbum: (id: string): RouteLocationRaw => routeLocation.album(ytAlbumId(id), { catalog: true }),
  ytArtist: (id: string): RouteLocationRaw => routeLocation.artist(ytArtistId(id), { catalog: true }),
} as const;
