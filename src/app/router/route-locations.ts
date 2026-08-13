import type { RouteLocationRaw } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";

export const routeLocation = {
  home: (): RouteLocationRaw => ({ name: ROUTE_NAMES.HOME }),
  profile: (): RouteLocationRaw => ({ name: ROUTE_NAMES.PROFILE }),
  liked: (): RouteLocationRaw => ({ name: ROUTE_NAMES.LIKED }),
  album: (id: string): RouteLocationRaw => ({ name: ROUTE_NAMES.ALBUM, params: { id } }),
  artist: (id: string): RouteLocationRaw => ({ name: ROUTE_NAMES.ARTIST, params: { id } }),
  playlist: (id: string): RouteLocationRaw => ({ name: ROUTE_NAMES.PLAYLIST, params: { id } }),
  settings: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS }),
  settingsGeneral: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_GENERAL }),
  settingsAudio: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_AUDIO }),
  settingsStorage: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_STORAGE }),
  settingsProxy: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_PROXY }),
  settingsLanguage: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_LANGUAGE }),
  settingsNotifications: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_NOTIFICATIONS }),
  settingsAppearance: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_APPEARANCE }),
  settingsAbout: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_ABOUT }),
  settingsTerms: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_TERMS }),
  settingsPrivacy: (): RouteLocationRaw => ({ name: ROUTE_NAMES.SETTINGS_PRIVACY }),
  allMusic: (): RouteLocationRaw => ({ name: ROUTE_NAMES.ALL_MUSIC }),
  ytPlaylist: (id: string): RouteLocationRaw => ({ name: ROUTE_NAMES.YOUTUBE_PLAYLIST, params: { id } }),
  ytAlbum: (id: string): RouteLocationRaw => ({ name: ROUTE_NAMES.YOUTUBE_ALBUM, params: { id } }),
  ytArtist: (id: string): RouteLocationRaw => ({ name: ROUTE_NAMES.YOUTUBE_ARTIST, params: { id } }),
} as const;
