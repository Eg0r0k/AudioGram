import type { NavigationGuardWithThis } from "vue-router";
import { routeLocation } from "@/app/router/route-locations";
import { sourceKindOf } from "@/modules/sources/lib/display";
import { sources } from "@/modules/sources";

//
// Entity pages are reached by branded id ("nd:…", "yt:…"), and an id whose
// source is off on this platform has no page to show: every query behind it
// parks on skipToken, so the page would render empty forever rather than
// fail. Such a link can still arrive — from back history, from a persisted
// queue source, from a share — so it is turned away here.
//
// Asks the registry about the id's kind rather than naming a source, so a
// source added later is covered without touching this guard.
//

export const requireSourceAvailable = (paramName: string): NavigationGuardWithThis<undefined> => {
  return (to) => {
    const value = to.params[paramName] as string | string[] | undefined;
    const id = typeof value === "string" ? value : value?.[0];
    if (!id) return true;

    return sources.isAvailable(sourceKindOf(id)) ? true : routeLocation.home();
  };
};
