import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { LibraryItem } from "@/modules/library/types";
import { albumRepository, artistRepository } from "@/db/repositories";
import { useLibraryMenu } from "../useLibraryMenu";

vi.mock("@/db/repositories", () => ({
  albumRepository: { findById: vi.fn() },
  artistRepository: { findById: vi.fn() },
  playlistRepository: { findById: vi.fn() },
}));

function item(id: string, type: LibraryItem["type"]): LibraryItem {
  return {
    id, type, title: "T", isPinned: true, addedAt: 1, to: "/", rounded: false,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useLibraryMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const menu = useLibraryMenu();
    menu.activeItem.value = null;
    menu.isContextMenuOpen.value = false;
  });

  it("opens local items synchronously", () => {
    const menu = useLibraryMenu();
    menu.openMenu(item("local-uuid", "album"));

    expect(menu.activeItem.value?.id).toBe("local-uuid");
    expect(menu.isContextMenuOpen.value).toBe(true);
  });

  it("opens a remote-prefixed album once its shadow row is found", async () => {
    vi.mocked(albumRepository.findById).mockResolvedValue(ok({ id: "yt:MPREb_1" } as never));
    const menu = useLibraryMenu();

    menu.openMenu(item("yt:MPREb_1", "album"));
    await flush();

    expect(menu.activeItem.value?.id).toBe("yt:MPREb_1");
    expect(menu.isContextMenuOpen.value).toBe(true);
  });

  it("stays closed for a remote artist without a library row (catalog browsing)", async () => {
    vi.mocked(artistRepository.findById).mockResolvedValue(ok(undefined));
    const menu = useLibraryMenu();

    menu.openMenu(item("nd:artist9", "artist"));
    await flush();

    expect(menu.activeItem.value).toBeNull();
    expect(menu.isContextMenuOpen.value).toBe(false);
  });
});
