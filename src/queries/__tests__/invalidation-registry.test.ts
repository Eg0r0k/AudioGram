import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { invalidateForPlaylistMutation, invalidateForTrackMutation } from "../cache";
import { queryKeys } from "../query-keys";
import { PlaylistId } from "@/types/ids";

const seed = (keys: readonly (readonly unknown[])[]) => {
  const queryClient = new QueryClient();
  for (const key of keys) queryClient.setQueryData(key, {});
  return queryClient;
};

const isInvalidated = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated === true;

describe("invalidateForTrackMutation: removal", () => {
  const likedKeys = [
    queryKeys.tracks.likedPageInfinite(),
    queryKeys.tracks.likedPageInfinite("title_asc"),
    queryKeys.tracks.likedPage(),
    queryKeys.tracks.likedTotalDuration(),
  ];

  it("marks every liked page, whatever its sort, and the liked duration stale", async () => {
    const queryClient = seed(likedKeys);

    await invalidateForTrackMutation(queryClient, {
      kind: "removal",
      albumIds: [],
      artistIds: [],
      playlistIds: [],
    });

    for (const key of likedKeys) expect(isInvalidated(queryClient, key), String(key)).toBe(true);
  });
});

describe("invalidateForPlaylistMutation: trackAddition", () => {
  // The point-sync patches a page shape nobody observes; the paged list the
  // playlist page renders is re-read through the `["playlists", id]` prefix
  // that `detail` invalidates — this pins that the prefix keeps covering it.
  it("marks the playlist's paged tracks stale", async () => {
    const playlistId = PlaylistId("pl-1");
    const paged = queryKeys.playlists.tracksPage(playlistId, "title_asc");
    const queryClient = seed([paged]);

    await invalidateForPlaylistMutation(queryClient, { kind: "trackAddition", playlistId });

    expect(isInvalidated(queryClient, paged)).toBe(true);
  });
});

describe("invalidateForTrackMutation: like", () => {
  // The default (likedAt desc) page is patched in place; a sorted page cannot
  // be — the row's position depends on the sort — so it is re-read instead.
  it("marks the sorted liked pages stale and leaves the default one alone", async () => {
    const sorted = queryKeys.tracks.likedPageInfinite("title_asc");
    const byDefault = queryKeys.tracks.likedPageInfinite();
    const queryClient = seed([sorted, byDefault]);

    await invalidateForTrackMutation(queryClient, { kind: "like" });

    expect(isInvalidated(queryClient, sorted)).toBe(true);
    expect(isInvalidated(queryClient, byDefault)).toBe(false);
  });
});
