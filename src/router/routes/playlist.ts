import { RouteRecordRaw } from "vue-router";

export const playlistRoutes: RouteRecordRaw[] = [
  {
    path: "/playlist",
    name: "playlist",
    component: () => import("@/pages/PlaylistPage.vue"),
    meta: {
      titleKey: "nav.playlist",
      showInNav: false,
      showInMobileNav: false,
    },
  },
];
