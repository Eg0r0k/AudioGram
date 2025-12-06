import { createRouter, createWebHistory } from "vue-router";
import { routes } from "./routes";
import { titleMiddleware } from "@/router/middleware/title.middleware";
const router = createRouter({
  history: createWebHistory("/"),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    if (to.hash) {
      return { el: to.hash, behavior: "smooth" };
    }
    return { top: 0 };
  },
  routes,
});
router.beforeEach(titleMiddleware);

export default router;
