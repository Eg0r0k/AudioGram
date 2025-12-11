import { RouteRecordRaw } from "vue-router";
import { homeRoutes } from "./home";
import { libraryRoutes } from "./library";
import { searchRoutes } from "./search";
import { profileRoutes } from "./profile";
import { settingsRoutes } from "./settings";

export const routes: RouteRecordRaw[] = [
  ...homeRoutes,
  ...libraryRoutes,
  ...searchRoutes,
  ...settingsRoutes,
  ...profileRoutes,
];

export {
  homeRoutes,
  libraryRoutes,
  profileRoutes,
  searchRoutes,
  settingsRoutes,
};
