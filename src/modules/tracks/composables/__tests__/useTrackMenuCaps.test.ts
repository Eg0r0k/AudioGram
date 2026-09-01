import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, shallowRef, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { ok } from "neverthrow";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import { TrackId } from "@/types/ids";
import { ytTrackId } from "@/types/track-ref";
import type { TrackMenuSubject } from "../../components/menu/type";

const offlineCopyMock = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock("@/db/repositories", () => ({
  offlineCopyRepository: offlineCopyMock,
}));

const registryMock = vi.hoisted(() => ({
  providers: {} as Record<string, { capabilities: { download: boolean } }>,
}));

vi.mock("@/modules/sources", () => ({
  sources: {
    get(kind: string) {
      const provider = registryMock.providers[kind];
      if (!provider) throw new Error(`No source provider registered for "${kind}"`);
      return provider;
    },
  },
}));

import { useTrackMenuCaps, type TrackMenuCaps } from "../useTrackMenuCaps";

function makeLibraryTrack(overrides: Partial<Track> = {}): Track {
  return {
    kind: "library",
    id: TrackId("local-1"),
    title: "Song",
    artist: "Artist",
    artistIds: [],
    albumId: "album-1",
    albumName: "Album",
    storagePath: "tracks/song.mp3",
    source: TrackSource.LOCAL_INTERNAL,
    state: TrackState.READY,
    pinned: 1,
    duration: 100,
    isLiked: false,
    ...overrides,
  } as Track;
}

function mountCaps(subject: Ref<TrackMenuSubject | null>) {
  let caps!: Ref<TrackMenuCaps>;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  mount(defineComponent({
    setup() {
      caps = useTrackMenuCaps(subject);
      return () => h("div");
    },
  }), { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  return caps;
}

async function flushQueries() {
  await Promise.resolve();
  await nextTick();
  await new Promise(resolve => setTimeout(resolve, 0));
  await nextTick();
}

describe("useTrackMenuCaps", () => {
  it("marks a pinned local library track: exportable, no remote abilities", () => {
    const subject = shallowRef<TrackMenuSubject | null>({ kind: "library", track: makeLibraryTrack() });

    const caps = mountCaps(subject);

    expect(caps.value).toEqual({
      source: "local",
      isInLibrary: true,
      isPinned: true,
      hasOfflineCopy: false,
      canExportFile: true,
      canOffline: false,
      canAttachLyrics: true,
      canOpenExternal: false,
    });
    expect(offlineCopyMock.findById).not.toHaveBeenCalled();
  });

  it("shadow-pinned remote library row is pinned but not in the library", () => {
    offlineCopyMock.findById.mockResolvedValue(ok(undefined));
    registryMock.providers = { yt: { capabilities: { download: true } } };
    const subject = shallowRef<TrackMenuSubject | null>({
      kind: "library",
      track: makeLibraryTrack({ id: ytTrackId("abc"), storagePath: "", source: TrackSource.REMOTE_YT, pinned: 0 }),
    });

    const caps = mountCaps(subject);

    expect(caps.value.source).toBe("yt");
    expect(caps.value.isPinned).toBe(true);
    expect(caps.value.isInLibrary).toBe(false);
    expect(caps.value.canExportFile).toBe(false);
    expect(caps.value.canOffline).toBe(true);
    expect(caps.value.canOpenExternal).toBe(true);
  });

  it("an offline copy flips canOffline off and canExportFile on", async () => {
    offlineCopyMock.findById.mockResolvedValue(ok({
      trackId: ytTrackId("abc"),
      storagePath: "offline/yt/abc.m4a",
      sizeBytes: 1,
      format: {},
      downloadedAt: 0,
    }));
    registryMock.providers = { yt: { capabilities: { download: true } } };
    const subject = shallowRef<TrackMenuSubject | null>({
      kind: "library",
      track: makeLibraryTrack({ id: ytTrackId("abc"), storagePath: "", source: TrackSource.REMOTE_YT }),
    });

    const caps = mountCaps(subject);
    await flushQueries();

    expect(caps.value.hasOfflineCopy).toBe(true);
    expect(caps.value.canOffline).toBe(false);
    expect(caps.value.canExportFile).toBe(true);
  });

  it("remote DTO subject: not pinned, downloadable, openable externally", () => {
    offlineCopyMock.findById.mockResolvedValue(ok(undefined));
    registryMock.providers = { yt: { capabilities: { download: true } } };
    const subject = shallowRef<TrackMenuSubject | null>({
      kind: "remote",
      dto: { id: ytTrackId("abc"), title: "Remote song" },
    });

    const caps = mountCaps(subject);

    expect(caps.value).toMatchObject({
      source: "yt",
      isInLibrary: false,
      isPinned: false,
      canExportFile: false,
      canOffline: true,
      canAttachLyrics: false,
      canOpenExternal: true,
    });
  });

  it("tolerates sources without a registered provider (nd until M2)", () => {
    offlineCopyMock.findById.mockResolvedValue(ok(undefined));
    registryMock.providers = {};
    const subject = shallowRef<TrackMenuSubject | null>({
      kind: "remote",
      dto: { id: TrackId("nd:song1"), title: "ND song" },
    });

    const caps = mountCaps(subject);

    expect(caps.value.source).toBe("nd");
    expect(caps.value.canOffline).toBe(false);
    expect(caps.value.canOpenExternal).toBe(true);
  });

  it("classifies a YT ephemeral stream as yt and a path ephemeral as local", () => {
    const ytSubject = shallowRef<TrackMenuSubject | null>({
      kind: "ephemeral",
      track: { kind: "ephemeral", id: "e1", title: "S", source: { type: "url", url: "http://127.0.0.1:60123/deadbeef/yt/abc" } },
    });
    const pathSubject = shallowRef<TrackMenuSubject | null>({
      kind: "ephemeral",
      track: { kind: "ephemeral", id: "e2", title: "F", source: { type: "path", path: "C:/x.mp3" } },
    });

    expect(mountCaps(ytSubject).value.source).toBe("yt");
    expect(mountCaps(pathSubject).value).toMatchObject({
      source: "local",
      isPinned: false,
      canAttachLyrics: false,
      canExportFile: false,
    });
  });
});
