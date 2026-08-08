export const ROUTE_NAMES = {
  HOME: "home",
  PROFILE: "profile",
  ALBUM: "album",
  ARTIST: "artist",
  PLAYLIST: "playlist",
  LIKED: "liked",
  SETTINGS: "settings",
  SETTINGS_GENERAL: "settings-general",
  SETTINGS_AUDIO: "settings-audio",
  SETTINGS_STORAGE: "settings-storage",
  SETTINGS_PROXY: "settings-proxy",
  SETTINGS_LANGUAGE: "settings-language",
  SETTINGS_NOTIFICATIONS: "settings-notifications",
  SETTINGS_APPEARANCE: "settings-appearance",
  SETTINGS_ABOUT: "settings-about",
  SETTINGS_TERMS: "settings-terms",
  SETTINGS_PRIVACY: "settings-privacy",
  ALL_MUSIC: "all-music",
  YOUTUBE: "youtube",
} as const;

export type AppRouteName = (typeof ROUTE_NAMES)[keyof typeof ROUTE_NAMES];
