import { describe, expect, it } from "vitest";
import { dedupeArtistNames, identityKey, normalizeName, splitArtistNames } from "../artist-names";

describe("identityKey", () => {
  it("folds case, padding, inner whitespace and ё/е", () => {
    expect(identityKey("  СЕРЁГА   ПИРАТ ")).toBe(identityKey("Серега Пират"));
  });

  it("keeps genuinely different names apart", () => {
    expect(identityKey("Markul")).not.toBe(identityKey("NIKER"));
    expect(identityKey("Blue")).not.toBe(identityKey("Bleu"));
  });
});

describe("normalizeName", () => {
  it("collapses whitespace and trims without changing case", () => {
    expect(normalizeName("  AC/DC   Live \n")).toBe("AC/DC Live");
  });
});

describe("dedupeArtistNames", () => {
  it("drops blanks and identity duplicates, keeping the first spelling and order", () => {
    expect(dedupeArtistNames(["Markul", " ", "markul", "NIKER", "Markul "])).toEqual(["Markul", "NIKER"]);
  });
});

describe("splitArtistNames", () => {
  it("splits on comma, semicolon and ampersand", () => {
    expect(splitArtistNames("СЕРЕГА ПИРАТ & Barikader")).toEqual(["СЕРЕГА ПИРАТ", "Barikader"]);
    expect(splitArtistNames("A, B; C &D")).toEqual(["A", "B", "C", "D"]);
  });

  it("leaves slashes and pipes alone — they occur inside names", () => {
    expect(splitArtistNames("AC/DC")).toEqual(["AC/DC"]);
    expect(splitArtistNames("A | B")).toEqual(["A | B"]);
  });

  it("de-duplicates by identity and ignores empty input", () => {
    expect(splitArtistNames("Markul, NIKER, markul")).toEqual(["Markul", "NIKER"]);
    expect(splitArtistNames(" , ")).toEqual([]);
    expect(splitArtistNames(undefined)).toEqual([]);
  });
});
