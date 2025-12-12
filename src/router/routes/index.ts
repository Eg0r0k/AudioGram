import { RouteRecordRaw } from "vue-router";
import { homeRoutes } from "./home";
import { libraryRoutes } from "./library";
import { searchRoutes } from "./search";
import { profileRoutes } from "./profile";
import { settingsRoutes } from "./settings";
import { albumRoutes } from "./album";
import { artistRoutes } from "./artist";
import { playlistRoutes } from "./playlist";

export const routes: RouteRecordRaw[] = [
  ...homeRoutes,
  ...libraryRoutes,
  ...searchRoutes,
  ...settingsRoutes,
  ...profileRoutes,
  ...albumRoutes,
  ...artistRoutes,
  ...playlistRoutes,
];

export {
  homeRoutes,
  libraryRoutes,
  profileRoutes,
  searchRoutes,
  settingsRoutes,
  playlistRoutes,
  artistRoutes,
  albumRoutes,
};
