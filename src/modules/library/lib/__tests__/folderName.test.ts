import { describe, expect, it } from "vitest";
import {
  assertValidFolderName,
  FOLDER_NAME_MAX_LENGTH,
  normalizeFolderName,
  validateFolderName,
} from "../folderName";

describe("folder name rules", () => {
  it("rejects an empty or whitespace-only name", () => {
    expect(validateFolderName("")).toBe("required");
    expect(validateFolderName("   ")).toBe("required");
    expect(validateFolderName("\t\n")).toBe("required");
  });

  it("rejects a name longer than the ceiling, measured after normalization", () => {
    expect(validateFolderName("x".repeat(FOLDER_NAME_MAX_LENGTH))).toBeNull();
    expect(validateFolderName("x".repeat(FOLDER_NAME_MAX_LENGTH + 1))).toBe("tooLong");
    // Padding does not count: it is stripped before the length check.
    expect(validateFolderName(`  ${"x".repeat(FOLDER_NAME_MAX_LENGTH)}  `)).toBeNull();
  });

  it("normalizes padding and inner whitespace", () => {
    expect(normalizeFolderName("  Рок   2020 \n")).toBe("Рок 2020");
  });

  it("assertValidFolderName returns the normalized name or throws", () => {
    expect(assertValidFolderName(" Jazz ")).toBe("Jazz");
    expect(() => assertValidFolderName(" ")).toThrow(/required/);
    expect(() => assertValidFolderName("x".repeat(FOLDER_NAME_MAX_LENGTH + 1))).toThrow(/tooLong/);
  });
});
