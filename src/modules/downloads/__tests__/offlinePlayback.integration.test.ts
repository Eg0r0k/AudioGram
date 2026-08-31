import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { okAsync } from "neverthrow";
import { ndAlbumId, ndArtistId, ndTrackId } from "@/types/track-ref";
import type { SourceTrackDTO } from "@/modules/sources/types";

//
// End-to-end over real Dexie (fake-indexeddb): download → the player
// resolves the offline copy; removeFromLibrary → the copy (row and file) is
// gone and the same track resolves back to live streaming.
//

const storageMock = vi.hoisted(() => ({
  importFile: vi.fn(),
  getFileSize: vi.fn(),
  getAudioUrl: vi.fn(),
  deleteFile: vi.fn(),
}));
const providerMock = vi.hoisted(() => ({
  downloadToFile: vi.fn(),
  resolveStreamUrl: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/environment/userAgent", () => ({ IS_TAURI: true, IS_MOBILE: false, IS_WINDOWS: false }));
vi.mock("@/db/storage", () => ({ storageService: storageMock }));
vi.mock("@/modules/sources", () => ({
  sources: { forTrack: () => providerMock },
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 1 },
  readDir: vi.fn(async () => []),
  remove: vi.fn(async () => {}),
}));
vi.mock("@/queries/library.queries", () => ({
  invalidateLibraryData: vi.fn(async () => {}),
}));

// Player harness: only the audio layer is faked — resolution runs for real.
vi.mock("lyra-audio", () => {
  function MockPlayer() {
    return {
      dispose: vi.fn().mockResolvedValue(undefined),
      setVolume: vi.fn(),
      setMuted: vi.fn(),
      setPlaybackRate: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(),
      load: vi.fn().mockResolvedValue(undefined),
      fadeIn: vi.fn().mockResolvedValue(undefined),
      fadeOut: vi.fn().mockResolvedValue(undefined),
      fadeTo: vi.fn().mockResolvedValue(undefined),
      seekPercent: vi.fn(),
      toggleMute: vi.fn(),
      cancelFade: vi.fn(),
      clearLoudnessMetadata: vi.fn(),
      setLoudnessMetadata: vi.fn(),
      unlockAudio: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      get isReady() { return true; },
      get isPlaying() { return false; },
      get duration() { return 0; },
      get graph() { return null; },
    };
  }
  return { Player: MockPlayer };
});
vi.mock("hls.js", () => ({ default: class MockHls {} }));
vi.mock("@/modules/settings/store/audio", () => ({
  useAudioSettingsStore: () => ({
    isNormalizationEnabled: false,
    normalizationTargetLufs: -14,
    normalizationPreventClipping: true,
    isFadeEnabled: false,
    fadeInDuration: 0,
    fadeOutDuration: 0,
    pushToGraph: vi.fn(),
  }),
}));
vi.mock("@/services/stats.service", () => ({
  statsService: { stopListening: () => Promise.resolve(null), startListening: () => {} },
}));

import { db } from "@/db";
import { downloadSubject } from "../service/enqueue";
import { removeTrackFromLibrary } from "@/modules/tracks/service/libraryMembership";
import { usePlayerStore } from "@/modules/player/store/player.store";
import type { Track } from "@/modules/player/types";

const dto: SourceTrackDTO = {
  id: ndTrackId("song1"),
  title: "Remote Song",
  artistName: "Artist A",
  albumTitle: "Remote Album",
  albumId: ndAlbumId("album1"),
  artistIds: [ndArtistId("artist1")],
  duration: 240,
};

describe("download → offline copy plays → remove → streams (integration)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));

    storageMock.importFile.mockImplementation((_src: string, target: string) => okAsync(target));
    storageMock.getFileSize.mockReturnValue(okAsync(4096));
    storageMock.getAudioUrl.mockReturnValue(okAsync("blob:offline-copy-url"));
    storageMock.deleteFile.mockReturnValue(okAsync(undefined));
    providerMock.downloadToFile.mockReturnValue(okAsync({ path: "C:/tmp/downloads-tmp/song1.flac", format: { codec: "flac" } }));
    providerMock.resolveStreamUrl.mockReturnValue(okAsync("stream://localhost/nd/song/song1"));
  });

  it("plays the copy while it exists and falls back to streaming after removal", async () => {
    // Download from browsing: the subject gets pinned (library membership)
    // and the finished file becomes an offline copy in offline/nd/.
    await downloadSubject({ kind: "remote", dto });
    await vi.waitFor(async () => {
      expect(await db.offlineCopies.get(dto.id)).toBeDefined();
    });

    expect((await db.tracks.get(dto.id))?.pinned).toBe(1);
    const copy = await db.offlineCopies.get(dto.id);
    expect(copy).toMatchObject({
      storagePath: "offline/nd/song1.flac",
      sizeBytes: 4096,
      format: { codec: "flac" },
    });

    // Playback prefers the copy: the audio URL comes from storage, not the
    // stream proxy.
    const player = usePlayerStore();
    const track = (await db.tracks.get(dto.id)) as unknown as Track;
    await player.playPlayerTrack({ ...track, kind: "library" });
    expect(storageMock.getAudioUrl).toHaveBeenCalledWith("offline/nd/song1.flac");
    expect(providerMock.resolveStreamUrl).not.toHaveBeenCalled();

    // removeFromLibrary: the copy row and file go with the membership (M1
    // cascade — no M4 patches on top).
    await removeTrackFromLibrary(dto.id);
    expect(await db.offlineCopies.get(dto.id)).toBeUndefined();
    expect(storageMock.deleteFile).toHaveBeenCalledWith("offline/nd/song1.flac");
    expect((await db.tracks.get(dto.id))?.pinned).toBe(0);

    // The shadow row still plays — now over the live stream.
    storageMock.getAudioUrl.mockClear();
    const shadow = (await db.tracks.get(dto.id)) as unknown as Track;
    await player.playPlayerTrack({ ...shadow, kind: "library" });
    expect(providerMock.resolveStreamUrl).toHaveBeenCalledWith(dto.id);
    expect(storageMock.getAudioUrl).not.toHaveBeenCalled();
  });
});
