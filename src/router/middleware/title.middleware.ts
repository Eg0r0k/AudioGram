import { useTitle } from "@vueuse/core";

const APP_NAME = "Audiogram";

import type { RouteLocationNormalized } from "vue-router";
export const titleMiddleware = (to: RouteLocationNormalized) => {
  const title = to.meta.title
    ? `${to.meta.title} | ${APP_NAME}`
    : `${APP_NAME}`;
  useTitle(title);
};
