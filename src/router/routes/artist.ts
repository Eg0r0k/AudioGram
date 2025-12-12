import { RouteRecordRaw } from "vue-router";

export const artistRoutes: RouteRecordRaw[] = [
  {
    path: "/artist/:id",
    name: "artist",
    component: () => import("@/pages/ArtistPage.vue"),
    meta: {
      titleKey: "nav.artist",
      showInNav: false,
      showInMobileNav: false,
    },
  },
];
