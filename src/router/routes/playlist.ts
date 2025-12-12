import { RouteRecordRaw } from "vue-router";

export const playlistRoutes: RouteRecordRaw[] = [
  {
    path: "/playlist/:id",
    name: "playlist",
    component: () => import("@/pages/PlaylistPage.vue"),
    meta: {
      titleKey: "nav.playlist",
      showInNav: false,
      showInMobileNav: false,
    },
  },
];
