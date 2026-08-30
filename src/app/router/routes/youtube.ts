import type { RouteLocationGeneric, RouteRecordRaw } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";
import { routeLocation } from "@/app/router/route-locations";

//
// YouTube collections render on the shared album/artist/playlist pages now.
// These paths stay as redirects: they are in users' back history and in
// persisted queue sources, and a dead route there would be a hard 404 on a
// page that used to work.
//

const redirectTo = (to: (id: string) => ReturnType<typeof routeLocation.album>) =>
  (route: RouteLocationGeneric) => to(String(route.params.id));

export const youtubeRoutes: RouteRecordRaw[] = [
  {
    path: "/youtube/playlist/:id",
    name: ROUTE_NAMES.YOUTUBE_PLAYLIST,
    redirect: redirectTo(routeLocation.ytPlaylist),
  },
  {
    path: "/youtube/album/:id",
    name: ROUTE_NAMES.YOUTUBE_ALBUM,
    redirect: redirectTo(routeLocation.ytAlbum),
  },
  {
    path: "/youtube/artist/:id",
    name: ROUTE_NAMES.YOUTUBE_ARTIST,
    redirect: redirectTo(routeLocation.ytArtist),
  },
];
