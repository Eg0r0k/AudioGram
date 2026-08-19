import { describe, it, expect, vi, beforeEach } from "vitest";
import { TauriStorage } from "../tauri.storage";
import { StorageError, StorageErrorCode } from "@/db/errors/storage.errors";

const mocks = vi.hoisted(() => ({
  isAndroid: false,
  writeFile: vi.fn(),
  readFile: vi.fn(),
  copyFile: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
  open: vi.fn(),
  stat: vi.fn(),
  appDataDir: vi.fn(),
  convertFileSrc: vi.fn(),
  fileHandle: {
    read: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: mocks.writeFile,
  readFile: mocks.readFile,
  copyFile: mocks.copyFile,
  exists: mocks.exists,
  mkdir: mocks.mkdir,
  readDir: mocks.readDir,
  remove: mocks.remove,
  open: mocks.open,
  stat: mocks.stat,
  BaseDirectory: { AppData: 1 },
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: mocks.appDataDir,
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: mocks.convertFileSrc,
}));

vi.mock("@/lib/environment/userAgent", () => ({
  get IS_ANDROID() {
    return mocks.isAndroid;
  },
}));

describe("TauriStorage", () => {
  let storage: TauriStorage;
  const APP_DATA_PATH = "/usr/appdata";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAndroid = false;
    storage = new TauriStorage();

    mocks.appDataDir.mockResolvedValue(APP_DATA_PATH);
    mocks.exists.mockResolvedValue(true);
    mocks.open.mockResolvedValue(mocks.fileHandle);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    mocks.copyFile.mockResolvedValue(undefined);
    mocks.mkdir.mockResolvedValue(undefined);
  });

  describe("warmup", () => {
    it("should create directories if they do not exist", async () => {
      mocks.exists.mockResolvedValue(false);

      await storage.warmup(["tracks", "covers"]);

      expect(mocks.mkdir).toHaveBeenCalledTimes(2);
      expect(mocks.mkdir).toHaveBeenCalledWith("tracks", expect.any(Object));
      expect(mocks.mkdir).toHaveBeenCalledWith("covers", expect.any(Object));
    });

    it("should not create directories if they exist", async () => {
      mocks.exists.mockResolvedValue(true);

      await storage.warmup(["tracks"]);

      expect(mocks.mkdir).not.toHaveBeenCalled();
    });
  });

  describe("saveFile", () => {
    it("should write Uint8Array to file system", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const result = await storage.saveFile("tracks/1.mp3", data);

      expect(result.isOk()).toBe(true);
      expect(mocks.writeFile).toHaveBeenCalledWith(
        "tracks/1.mp3",
        data,
        expect.objectContaining({ baseDir: 1 }),
      );
    });

    it("should convert Blob to Uint8Array and write", async () => {
      const blob = new Blob(["test"]);
      const result = await storage.saveFile("tracks/blob.txt", blob);

      expect(result.isOk()).toBe(true);
      expect(mocks.writeFile).toHaveBeenCalledWith(
        "tracks/blob.txt",
        expect.any(Uint8Array),
        expect.any(Object),
      );
    });

    it("should handle write errors", async () => {
      mocks.writeFile.mockRejectedValue(new Error("Disk full"));

      const result = await storage.saveFile("tracks/fail.mp3", new Uint8Array([]));

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(StorageError);
    });
  });

  describe("importFile", () => {
    it("should copy file using absolute paths", async () => {
      const source = "/users/downloads/music.mp3";
      const target = "tracks/music.mp3";

      const result = await storage.importFile(source, target);

      expect(result.isOk()).toBe(true);
      expect(mocks.copyFile).toHaveBeenCalledWith(
        source,
        `${APP_DATA_PATH}/${target}`,
      );
      expect(mocks.open).not.toHaveBeenCalled();
    });

    it("should stream content:// sources through open() instead of copyFile", async () => {
      const chunks = [new Uint8Array([1, 2, 3])];
      let readCall = 0;
      const src = {
        read: vi.fn(async (buffer: Uint8Array) => {
          if (readCall >= chunks.length) return 0;
          buffer.set(chunks[readCall]);
          return chunks[readCall++].length;
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const dest = {
        write: vi.fn(async (data: Uint8Array) => data.length),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mocks.open.mockResolvedValueOnce(src).mockResolvedValueOnce(dest);

      const result = await storage.importFile("content://media/audio/123", "tracks/x.mp3");

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe("tracks/x.mp3");
      expect(mocks.copyFile).not.toHaveBeenCalled();
      expect(mocks.open).toHaveBeenNthCalledWith(1, "content://media/audio/123", { read: true });
      expect(mocks.open).toHaveBeenNthCalledWith(2, "tracks/x.mp3", expect.objectContaining({
        write: true,
        create: true,
        baseDir: 1,
      }));
      expect(dest.write).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
      expect(src.close).toHaveBeenCalled();
      expect(dest.close).toHaveBeenCalled();
    });

    it("should close both handles and fail when the streamed read throws", async () => {
      const src = {
        read: vi.fn().mockRejectedValue(new Error("EACCES")),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const dest = {
        write: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mocks.open.mockResolvedValueOnce(src).mockResolvedValueOnce(dest);

      const result = await storage.importFile("content://media/audio/9", "tracks/y.mp3");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(StorageErrorCode.WRITE_FAILED);
      expect(src.close).toHaveBeenCalled();
      expect(dest.close).toHaveBeenCalled();
    });
  });

  describe("readBytes", () => {
    it("should read partial content from file", async () => {
      mocks.fileHandle.read.mockImplementation(async (buffer: Uint8Array) => {
        buffer[0] = 10;
        buffer[1] = 20;
        return 2;
      });

      const result = await storage.readBytes("test.mp3", 512);

      expect(result.isOk()).toBe(true);
      expect(mocks.open).toHaveBeenCalledWith("test.mp3", { read: true });

      const data = result._unsafeUnwrap();
      expect(data.length).toBe(2);
      expect(data[0]).toBe(10);
      expect(mocks.fileHandle.close).toHaveBeenCalled();
    });

    it("should handle cases when file is smaller than buffer", async () => {
      mocks.fileHandle.read.mockResolvedValue(0);

      const result = await storage.readBytes("empty.mp3", 10);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().length).toBe(0);
    });

    it("should handle null return from read (fix check)", async () => {
      mocks.fileHandle.read.mockResolvedValue(null);

      const result = await storage.readBytes("empty.mp3", 10);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().length).toBe(0);
    });
  });

  describe("getAudioUrl", () => {
    it("should convert path to asset url", async () => {
      mocks.convertFileSrc.mockReturnValue("asset://localhost/usr/appdata/tracks/1.mp3");

      const result = await storage.getAudioUrl("tracks/1.mp3");

      expect(result.isOk()).toBe(true);
      expect(mocks.convertFileSrc).toHaveBeenCalledWith(`${APP_DATA_PATH}/tracks/1.mp3`);
      expect(result._unsafeUnwrap()).toBe("asset://localhost/usr/appdata/tracks/1.mp3");
    });

    it("should use absolute source path directly without joining appData", async () => {
      mocks.convertFileSrc.mockReturnValue("asset://localhost/abs/x.mp3");

      const result = await storage.getAudioUrl("/abs/path/x.mp3");

      expect(result.isOk()).toBe(true);
      expect(mocks.convertFileSrc).toHaveBeenCalledWith("/abs/path/x.mp3");
      expect(mocks.appDataDir).not.toHaveBeenCalled();
    });

    it("should normalize windows backslashes before conversion", async () => {
      mocks.convertFileSrc.mockReturnValue("asset://localhost/c/x.mp3");

      const result = await storage.getAudioUrl("C:\\music\\x.mp3");

      expect(result.isOk()).toBe(true);
      expect(mocks.convertFileSrc).toHaveBeenCalledWith("C:/music/x.mp3");
    });

    it("should route relative paths through the stream local proxy on android", async () => {
      mocks.isAndroid = true;
      mocks.convertFileSrc.mockReturnValue("http://stream.localhost/local%2F...");

      const result = await storage.getAudioUrl("tracks/1.mp3");

      expect(result.isOk()).toBe(true);
      expect(mocks.convertFileSrc).toHaveBeenCalledWith(
        `local/${APP_DATA_PATH}/tracks/1.mp3`,
        "stream",
      );
    });

    it("should route absolute paths through the stream local proxy on android", async () => {
      mocks.isAndroid = true;
      mocks.convertFileSrc.mockReturnValue("http://stream.localhost/local%2F...");

      const result = await storage.getAudioUrl("/storage/emulated/0/Music/x.mp3");

      expect(result.isOk()).toBe(true);
      expect(mocks.convertFileSrc).toHaveBeenCalledWith(
        "local//storage/emulated/0/Music/x.mp3",
        "stream",
      );
    });
  });

  describe("saveFile", () => {
    it("should convert ArrayBuffer to Uint8Array and write", async () => {
      const buffer = new ArrayBuffer(4);
      const result = await storage.saveFile("tracks/ab.bin", buffer);

      expect(result.isOk()).toBe(true);
      expect(mocks.writeFile).toHaveBeenCalledWith(
        "tracks/ab.bin",
        expect.any(Uint8Array),
        expect.objectContaining({ baseDir: 1 }),
      );
      const written = mocks.writeFile.mock.calls[0][1] as Uint8Array;
      expect(written.length).toBe(4);
    });
  });

  describe("getFile", () => {
    it("should read bytes and wrap them in a Blob", async () => {
      mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));

      const result = await storage.getFile("tracks/1.mp3");

      expect(result.isOk()).toBe(true);
      const blob = result._unsafeUnwrap();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBe(3);
      expect(mocks.readFile).toHaveBeenCalledWith("tracks/1.mp3", expect.objectContaining({ baseDir: 1 }));
    });

    it("should map read errors to READ_FAILED", async () => {
      mocks.readFile.mockRejectedValue(new Error("io"));

      const result = await storage.getFile("tracks/missing.mp3");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(StorageErrorCode.READ_FAILED);
    });

    it("should return FILE_NOT_FOUND when the file is absent", async () => {
      mocks.exists.mockResolvedValue(false);

      const result = await storage.getFile("tracks/gone.mp3");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(StorageErrorCode.FILE_NOT_FOUND);
      expect(mocks.readFile).not.toHaveBeenCalled();
    });
  });

  describe("readFile", () => {
    it("should return raw bytes on success", async () => {
      mocks.readFile.mockResolvedValue(new Uint8Array([9, 8, 7]));

      const result = await storage.readFile("/abs/file.mp3");

      expect(result.isOk()).toBe(true);
      expect(Array.from(result._unsafeUnwrap())).toEqual([9, 8, 7]);
      expect(mocks.readFile).toHaveBeenCalledWith("/abs/file.mp3");
    });

    it("should map errors to READ_FAILED", async () => {
      mocks.readFile.mockRejectedValue(new Error("io"));

      const result = await storage.readFile("/abs/file.mp3");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(StorageErrorCode.READ_FAILED);
    });
  });

  describe("getFileSize", () => {
    it("should return size from stat metadata", async () => {
      mocks.stat.mockResolvedValue({ size: 4096 });

      const result = await storage.getFileSize("tracks/1.mp3");

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(4096);
      expect(mocks.stat).toHaveBeenCalledWith("tracks/1.mp3", expect.objectContaining({ baseDir: 1 }));
    });

    it("should map stat errors to READ_FAILED", async () => {
      mocks.stat.mockRejectedValue(new Error("no entry"));

      const result = await storage.getFileSize("tracks/missing.mp3");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(StorageErrorCode.READ_FAILED);
    });

    it("should return FILE_NOT_FOUND when the file is absent", async () => {
      mocks.exists.mockResolvedValue(false);

      const result = await storage.getFileSize("tracks/gone.mp3");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(StorageErrorCode.FILE_NOT_FOUND);
      expect(mocks.stat).not.toHaveBeenCalled();
    });
  });

  describe("listFiles", () => {
    it("should return empty list when folder does not exist", async () => {
      mocks.exists.mockResolvedValue(false);

      const result = await storage.listFiles("tracks");

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
      expect(mocks.readDir).not.toHaveBeenCalled();
    });

    it("should list only files, skipping subdirectories", async () => {
      mocks.exists.mockResolvedValue(true);
      mocks.readDir.mockResolvedValue([
        { name: "a.mp3", isFile: true },
        { name: "b.mp3", isFile: true },
        { name: "nested", isFile: false },
      ]);

      const result = await storage.listFiles("tracks");

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(["tracks/a.mp3", "tracks/b.mp3"]);
    });

    it("should map readDir errors to READ_FAILED", async () => {
      mocks.exists.mockResolvedValue(true);
      mocks.readDir.mockRejectedValue(new Error("io"));

      const result = await storage.listFiles("tracks");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(StorageErrorCode.READ_FAILED);
    });
  });

  describe("deleteFile", () => {
    it("should remove an existing file", async () => {
      mocks.exists.mockResolvedValue(true);

      const result = await storage.deleteFile("tracks/1.mp3");

      expect(result.isOk()).toBe(true);
      expect(mocks.remove).toHaveBeenCalledWith("tracks/1.mp3", expect.objectContaining({ baseDir: 1 }));
    });

    it("should be idempotent when file is absent", async () => {
      mocks.exists.mockResolvedValue(false);

      const result = await storage.deleteFile("tracks/ghost.mp3");

      expect(result.isOk()).toBe(true);
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it("should map remove errors to DELETE_FAILED", async () => {
      mocks.exists.mockResolvedValue(true);
      mocks.remove.mockRejectedValue(new Error("locked"));

      const result = await storage.deleteFile("tracks/1.mp3");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(StorageErrorCode.DELETE_FAILED);
    });
  });

  describe("directory caching", () => {
    it("should probe a folder only once across repeated writes", async () => {
      mocks.exists.mockResolvedValue(true);

      await storage.saveFile("tracks/1.mp3", new Uint8Array([1]));
      await storage.saveFile("tracks/2.mp3", new Uint8Array([2]));

      expect(mocks.exists).toHaveBeenCalledTimes(1);
    });

    it("should re-probe after clearCaches", async () => {
      mocks.exists.mockResolvedValue(true);

      await storage.saveFile("tracks/1.mp3", new Uint8Array([1]));
      storage.clearCaches();
      await storage.saveFile("tracks/2.mp3", new Uint8Array([2]));

      expect(mocks.exists).toHaveBeenCalledTimes(2);
    });
  });

  describe("getAppDataDir", () => {
    it("should resolve the app data dir only once", async () => {
      const a = await storage.getAppDataDir();
      const b = await storage.getAppDataDir();

      expect(a).toBe(APP_DATA_PATH);
      expect(b).toBe(APP_DATA_PATH);
      expect(mocks.appDataDir).toHaveBeenCalledTimes(1);
    });
  });

  describe("path normalization", () => {
    it("should collapse backslashes and duplicate slashes when writing", async () => {
      const result = await storage.saveFile("tracks\\\\album//song.mp3", new Uint8Array([1]));

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe("tracks/album/song.mp3");
      expect(mocks.writeFile).toHaveBeenCalledWith(
        "tracks/album/song.mp3",
        expect.any(Uint8Array),
        expect.objectContaining({ baseDir: 1 }),
      );
      expect(mocks.mkdir).not.toHaveBeenCalled();
    });

    it("should normalize the import target path", async () => {
      const result = await storage.importFile("/downloads/x.mp3", "tracks\\\\x.mp3");

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe("tracks/x.mp3");
      expect(mocks.copyFile).toHaveBeenCalledWith("/downloads/x.mp3", `${APP_DATA_PATH}/tracks/x.mp3`);
    });
  });
});
