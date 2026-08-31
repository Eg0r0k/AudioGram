import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/modules/library/types";
import { getAlbumLibraryRow } from "@/queries/album.queries";
import { getArtistLibraryRow } from "@/queries/artist.queries";
import { useLibraryMenu } from "../useLibraryMenu";

vi.mock("@/queries/album.queries", () => ({ getAlbumLibraryRow: vi.fn() }));
vi.mock("@/queries/artist.queries", () => ({ getArtistLibraryRow: vi.fn() }));
vi.mock("@/queries/playlist.queries", () => ({ getPlaylistLibraryRow: vi.fn() }));

function item(id: string, type: LibraryItem["type"], isCatalog = false): LibraryItem {
  return {
    id, type, title: "T", isPinned: true, addedAt: 1, to: "/", rounded: false, isCatalog,
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
    vi.mocked(getAlbumLibraryRow).mockResolvedValue({ id: "yt:MPREb_1" } as never);
    const menu = useLibraryMenu();

    menu.openMenu(item("yt:MPREb_1", "album"));
    await flush();

    expect(menu.activeItem.value?.id).toBe("yt:MPREb_1");
    expect(menu.isContextMenuOpen.value).toBe(true);
  });

  it("stays closed for a remote artist without a library row (catalog browsing)", async () => {
    vi.mocked(getArtistLibraryRow).mockResolvedValue(null);
    const menu = useLibraryMenu();

    menu.openMenu(item("nd:artist9", "artist"));
    await flush();

    expect(menu.activeItem.value).toBeNull();
    expect(menu.isContextMenuOpen.value).toBe(false);
  });

  //
  // ND browsing: catalog rows have no DB row, so the library flavor would
  // render an empty popup. Albums/playlists get the catalog flavor (queue +
  // download); an artist has nothing actionable and must not open at all.
  //
  it("opens a catalog album with the catalog flavor, without touching the DB", () => {
    const menu = useLibraryMenu();

    menu.openMenu(item("nd:album1", "album", true));

    expect(menu.activeItem.value?.id).toBe("nd:album1");
    expect(menu.menuFlavor.value).toBe("catalog");
    expect(menu.isContextMenuOpen.value).toBe(true);
    expect(getAlbumLibraryRow).not.toHaveBeenCalled();
  });

  it("never opens for a catalog artist", () => {
    const menu = useLibraryMenu();

    menu.openMenu(item("nd:artist1", "artist", true));

    expect(menu.activeItem.value).toBeNull();
    expect(menu.isContextMenuOpen.value).toBe(false);
  });

  it("keeps the library flavor for a downloaded shadow album", async () => {
    vi.mocked(getAlbumLibraryRow).mockResolvedValue({ id: "yt:MPREb_1" } as never);
    const menu = useLibraryMenu();

    menu.openMenu(item("yt:MPREb_1", "album"));
    await flush();

    expect(menu.menuFlavor.value).toBe("library");
  });
});
