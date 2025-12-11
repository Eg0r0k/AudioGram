import { createRouter, createWebHistory } from "vue-router";
import { titleMiddleware } from "@/router/middleware/title.middleware";
import { routes } from "./routes/index";
const router = createRouter({
  history: createWebHistory("/"),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    if (to.hash) {
      return { el: to.hash, behavior: "smooth" };
    }
    if (to.matched[0]?.name !== from.matched[0]?.name) {
      return { top: 0, behavior: "smooth" };
    }
    return false;
  },
});
router.beforeEach(titleMiddleware);

export default router;
