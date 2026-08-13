import type { NavigationGuardWithThis } from "vue-router";
import { routeLocation } from "@/app/router/route-locations";
import { youtubeProvider } from "@/modules/youtube/provider";

/** YT collection pages need the desktop provider; web/mobile fall back home. */
export const requireYoutube: NavigationGuardWithThis<undefined> = () => {
  return youtubeProvider.isAvailable ? true : routeLocation.home();
};
