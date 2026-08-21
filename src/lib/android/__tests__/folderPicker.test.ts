import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FOLDER_PICKED_EVENT,
  isAndroidFolderPickerAvailable,
  pickAndroidFolderTreeUri,
  treeUriToPath,
} from "../folderPicker";

const TREE = "content://com.android.externalstorage.documents/tree/";

describe("treeUriToPath", () => {
  it("maps primary-volume tree URIs to real paths", () => {
    expect(treeUriToPath(`${TREE}primary%3AMusic`)).toBe("/storage/emulated/0/Music");
    expect(treeUriToPath(`${TREE}primary%3ADownload%2FAlbums`)).toBe("/storage/emulated/0/Download/Albums");
  });

  it("decodes url-encoded segments — spaces and cyrillic", () => {
    expect(treeUriToPath(`${TREE}primary%3AMy%20Music`)).toBe("/storage/emulated/0/My Music");
    expect(treeUriToPath(`${TREE}primary%3A%D0%9C%D1%83%D0%B7%D1%8B%D0%BA%D0%B0`)).toBe("/storage/emulated/0/Музыка");
  });

  it("maps the bare primary volume to the mount root", () => {
    expect(treeUriToPath(`${TREE}primary%3A`)).toBe("/storage/emulated/0");
  });

  it("strips trailing slashes from the relative part", () => {
    expect(treeUriToPath(`${TREE}primary%3AMusic%2F`)).toBe("/storage/emulated/0/Music");
  });

  it("ignores a /document/ suffix appended to the tree segment", () => {
    expect(treeUriToPath(`${TREE}primary%3AMusic/document/primary%3AMusic%2Fsong.mp3`))
      .toBe("/storage/emulated/0/Music");
  });

  it("rejects non-primary volumes (SD card, USB)", () => {
    expect(treeUriToPath(`${TREE}1D04-2A08%3AMusic`)).toBeNull();
  });

  it("rejects other providers and document (non-tree) URIs", () => {
    expect(treeUriToPath("content://com.android.providers.downloads.documents/tree/downloads")).toBeNull();
    expect(treeUriToPath("content://com.android.externalstorage.documents/document/primary%3AMusic")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(treeUriToPath("")).toBeNull();
    expect(treeUriToPath(TREE)).toBeNull();
    expect(treeUriToPath(`${TREE}no-volume-separator`)).toBeNull();
    expect(treeUriToPath(`${TREE}primary%3A%ZZ`)).toBeNull();
    expect(treeUriToPath("/storage/emulated/0/Music")).toBeNull();
  });

  it("rejects path traversal inside the document id", () => {
    expect(treeUriToPath(`${TREE}primary%3AMusic%2F..%2F..%2Fdata`)).toBeNull();
  });
});

describe("pickAndroidFolderTreeUri", () => {
  afterEach(() => {
    delete window.AudiogramFolderPicker;
  });

  const dispatchPicked = (requestId: string, uri: string | null) => {
    window.dispatchEvent(new CustomEvent(FOLDER_PICKED_EVENT, { detail: { requestId, uri } }));
  };

  const installBridge = (onPick: (requestId: string) => void) => {
    window.AudiogramFolderPicker = { pick: vi.fn(onPick) };
  };

  it("reports availability from the bridge presence", () => {
    expect(isAndroidFolderPickerAvailable()).toBe(false);
    installBridge(() => {});
    expect(isAndroidFolderPickerAvailable()).toBe(true);
  });

  it("resolves with the uri delivered for its own request id", async () => {
    installBridge((requestId) => {
      queueMicrotask(() => dispatchPicked(requestId, `${TREE}primary%3AMusic`));
    });

    await expect(pickAndroidFolderTreeUri()).resolves.toBe(`${TREE}primary%3AMusic`);
  });

  it("ignores events for other request ids", async () => {
    installBridge((requestId) => {
      queueMicrotask(() => {
        dispatchPicked("someone-else", `${TREE}primary%3AWrong`);
        dispatchPicked(requestId, `${TREE}primary%3ARight`);
      });
    });

    await expect(pickAndroidFolderTreeUri()).resolves.toBe(`${TREE}primary%3ARight`);
  });

  it("resolves null when the user cancels", async () => {
    installBridge((requestId) => {
      queueMicrotask(() => dispatchPicked(requestId, null));
    });

    await expect(pickAndroidFolderTreeUri()).resolves.toBeNull();
  });

  it("resolves null without a bridge and when pick throws", async () => {
    await expect(pickAndroidFolderTreeUri()).resolves.toBeNull();

    installBridge(() => {
      throw new Error("activity gone");
    });
    await expect(pickAndroidFolderTreeUri()).resolves.toBeNull();
  });

  it("removes its listener after settling — later events are inert", async () => {
    let capturedId = "";
    installBridge((requestId) => {
      capturedId = requestId;
      queueMicrotask(() => dispatchPicked(requestId, `${TREE}primary%3AMusic`));
    });

    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    await pickAndroidFolderTreeUri();

    const added = addSpy.mock.calls.filter(([type]) => type === FOLDER_PICKED_EVENT).length;
    const removed = removeSpy.mock.calls.filter(([type]) => type === FOLDER_PICKED_EVENT).length;
    expect(added).toBe(1);
    expect(removed).toBe(1);

    // A stray duplicate delivery must not throw or resolve anything twice.
    dispatchPicked(capturedId, `${TREE}primary%3AOther`);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
