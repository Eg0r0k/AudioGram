import { useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";
import { routeLocation } from "@/app/router/route-locations";
import { getLogger } from "@/lib/logger";

/**
 * Back button for a page that can be the first one opened (deep link,
 * reload): steps back through history when there is somewhere to go,
 * otherwise lands on the fallback route.
 */
export const useGoBack = (fallback: RouteLocationRaw = routeLocation.home()) => {
  const router = useRouter();

  return () => {
    const prevPath = router.options.history.state.back;

    if (prevPath && typeof prevPath === "string") {
      router.back();
    }
    else {
      router.push(fallback).catch(error => getLogger().error(`[useGoBack] Fallback navigation failed: ${String(error)}`));
    }
  };
};
