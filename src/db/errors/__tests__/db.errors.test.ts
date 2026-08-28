import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { DbError, toDbError } from "../db.errors";

describe("toDbError", () => {
  it("maps Dexie error names to codes", () => {
    expect(toDbError(new Dexie.VersionError("v")).code).toBe("VERSION");
    expect(toDbError(new Dexie.UpgradeError("u")).code).toBe("UPGRADE");
    expect(toDbError(new Dexie.QuotaExceededError("q")).code).toBe("QUOTA");
    expect(toDbError(new Dexie.DatabaseClosedError("c")).code).toBe("CLOSED");
    expect(toDbError(new Dexie.ConstraintError("k")).code).toBe("CONSTRAINT");
    expect(toDbError(new Dexie.BulkError("b", [])).code).toBe("CONSTRAINT");
  });

  it("looks through the inner error Dexie wraps (AbortError over QuotaExceededError)", () => {
    const inner = new Dexie.QuotaExceededError("full");
    const wrapped = new Dexie.AbortError("aborted", inner);
    expect(toDbError(wrapped).code).toBe("QUOTA");
  });

  it("keeps the message and the original as cause", () => {
    const original = new Error("boom");
    const mapped = toDbError(original);
    expect(mapped).toBeInstanceOf(DbError);
    expect(mapped).toBeInstanceOf(Error);
    expect(mapped.code).toBe("UNKNOWN");
    expect(mapped.message).toBe("boom");
    expect(mapped.cause).toBe(original);
  });

  it("passes an existing DbError through unchanged", () => {
    const existing = new DbError("QUOTA", "x");
    expect(toDbError(existing)).toBe(existing);
  });

  it("stringifies non-Error throwables", () => {
    expect(toDbError("nope").message).toBe("nope");
  });
});
