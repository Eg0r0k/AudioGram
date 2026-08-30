import { describe, expect, it, vi } from "vitest";
import type { RouteLocationNormalized } from "vue-router";

const availability = vi.hoisted(() => ({ nd: true, yt: false } as Record<string, boolean>));

vi.mock("@/modules/sources", () => ({
  sources: {
    isAvailable: (kind: string) => (kind === "local" ? true : availability[kind] ?? false),
  },
}));

import { requireSourceAvailable } from "../require-source-available";
import { routeLocation } from "@/app/router/route-locations";

const guard = requireSourceAvailable("id");
const enter = (id?: string) =>
  guard.call(undefined, { params: id === undefined ? {} : { id } } as unknown as RouteLocationNormalized,
    {} as RouteLocationNormalized, () => {});

describe("requireSourceAvailable", () => {
  it("lets a local id through", () => {
    expect(enter("album-uuid")).toBe(true);
  });

  it("lets a branded id through while its source is available", () => {
    expect(enter("nd:al1")).toBe(true);
  });

  // The page would otherwise render empty forever: every query behind an
  // unavailable source parks on skipToken, so nothing loads and nothing errors.
  it("sends a branded id home when its source is off on this platform", () => {
    expect(enter("yt:MPREb_x")).toEqual(routeLocation.home());
  });

  it("defers a missing param to the guard that checks for it", () => {
    expect(enter()).toBe(true);
  });
});
