import type { RouteLocationRaw } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";
import { ytAlbumId, ytArtistId, ytPlaylistId } from "@/types/track-ref";

export const routeLocation = {
  home: (): RouteLocationRaw => ({ name: ROUTE_NAMES.HOME }),
  liked: (): RouteLocationRaw => ({ name: ROUTE_NAMES.LIKED }),
  album: (id: string): RouteLocationRaw => ({ name: ROUTE_NAMES.ALBUM, params: { id } }),
  artist: (id: string): RouteLocationRaw => ({ name: ROUTE_NAMES.ARTIST, params: { id } }),
  artistAlbums: (id: string): RouteLocationRaw => ({ name: ROUTE_NAMES.ARTIST_ALBUMS, params: { id } }),
  playlist: (id: string): RouteLocationRaw => ({ name: ROUTE_NAMES.PLAYLIST, params: { id } }),
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
  ytPlaylist: (id: string): RouteLocationRaw => routeLocation.playlist(ytPlaylistId(id)),
  ytAlbum: (id: string): RouteLocationRaw => routeLocation.album(ytAlbumId(id)),
  ytArtist: (id: string): RouteLocationRaw => routeLocation.artist(ytArtistId(id)),
} as const;
