import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, openDatabase } from "@/db";

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
});

describe("openDatabase", () => {
  it("opens a fresh database and reports ok", async () => {
    const result = await openDatabase();

    expect(result.isOk()).toBe(true);
    expect(db.isOpen()).toBe(true);
    expect(db.verno).toBeGreaterThanOrEqual(11);
  });

  it("classifies an open failure instead of throwing", async () => {
    vi.spyOn(db, "open").mockRejectedValueOnce(new Dexie.UpgradeError("upgrade blew up"));

    const result = await openDatabase();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("UPGRADE");
      expect(result.error.message).toBe("upgrade blew up");
    }
  });
});
