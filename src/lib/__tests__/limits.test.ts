import { describe, expect, it } from "vitest";
import { assertValidName, NAME_MAX_LENGTH, validateName } from "../limits";

describe("validateName", () => {
  it("rejects empty and whitespace-only names", () => {
    expect(validateName("")).toBe("required");
    expect(validateName(" \t ")).toBe("required");
  });

  it("measures the limit after normalization", () => {
    expect(validateName("x".repeat(NAME_MAX_LENGTH))).toBeNull();
    expect(validateName(`  ${"x".repeat(NAME_MAX_LENGTH)}  `)).toBeNull();
    expect(validateName("x".repeat(NAME_MAX_LENGTH + 1))).toBe("tooLong");
  });
});

describe("assertValidName", () => {
  it("returns the normalized name or throws naming the field", () => {
    expect(assertValidName("  Markul   NIKER ", "artist")).toBe("Markul NIKER");
    expect(() => assertValidName(" ", "playlist")).toThrow(/playlist: invalid name \(required\)/);
    expect(() => assertValidName("x".repeat(NAME_MAX_LENGTH + 1), "album")).toThrow(/tooLong/);
  });
});
