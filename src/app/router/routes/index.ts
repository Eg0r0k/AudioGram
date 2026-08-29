import { RouteRecordRaw } from "vue-router";
import { homeRoutes } from "./home";
import { settingsRoutes } from "./settings";
import { albumRoutes } from "./album";
import { artistRoutes } from "./artist";
import { playlistRoutes } from "./playlist";
import { favoriteRoutes } from "./favorite";
import { youtubeRoutes } from "./youtube";

export const routes: RouteRecordRaw[] = [
  ...homeRoutes,
  ...settingsRoutes,
  ...albumRoutes,
  ...artistRoutes,
  ...playlistRoutes,
  ...favoriteRoutes,
  ...youtubeRoutes,
];

export {
  homeRoutes,
  settingsRoutes,
  playlistRoutes,
  artistRoutes,
  albumRoutes,
  favoriteRoutes,
  youtubeRoutes,
};
