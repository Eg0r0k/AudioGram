import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";
import { buildSearchAliases, normalizeSearchText, termProcessor, unicodeTokenizer } from "./searchNormalization";

describe("search normalization", () => {
  it("normalizes е and ё to the same token", () => {
    expect(normalizeSearchText("Тёмный принц")).toBe("темный принц");
    expect(unicodeTokenizer("Тёмный принц")).toEqual(["темный", "принц"]);
    expect(termProcessor("ТЁ")).toBe("те");
  });

  it("folds latin diacritics so unaccented queries match", () => {
    expect(normalizeSearchText("Motörhead & Beyoncé")).toBe("motorhead beyonce");
    expect(termProcessor("Björk")).toBe("bjork");
  });

  it("keeps cyrillic й distinct from и while folding", () => {
    expect(normalizeSearchText("Мой йогурт")).toBe("мой йогурт");
    expect(unicodeTokenizer("Тёплый край")).toEqual(["теплый", "край"]);
  });

  it("supports prefix search for normalized russian tokens", () => {
    const index = new MiniSearch({
      fields: ["title"],
      storeFields: ["title"],
      tokenize: unicodeTokenizer,
      processTerm: termProcessor,
      searchOptions: {
        prefix: true,
        tokenize: unicodeTokenizer,
        processTerm: termProcessor,
      },
    });

    index.add({ id: "track:1", title: "Тёмный принц" });

    expect(index.search("те")).toHaveLength(1);
    expect(index.search("темный")).toHaveLength(1);
    expect(index.search("тё")).toHaveLength(1);
  });

  it("builds aliases from the association dictionary", () => {
    expect(buildSearchAliases("Daft Punk feat. Pharrell")).toBe("ft featuring");
    expect(buildSearchAliases("Лучший саундтрек")).toContain("ost");
    expect(buildSearchAliases("DJ Groove")).toContain("диджей");
  });

  it("finds documents through associated terms", () => {
    const index = new MiniSearch({
      fields: ["title", "searchAliases"],
      storeFields: ["title"],
      tokenize: unicodeTokenizer,
      processTerm: termProcessor,
      searchOptions: {
        prefix: true,
        tokenize: unicodeTokenizer,
        processTerm: termProcessor,
      },
    });

    index.add({
      id: "track:2",
      title: "Daft Punk feat. Pharrell Williams",
      searchAliases: buildSearchAliases("Daft Punk feat. Pharrell Williams"),
    });

    expect(index.search("ft")).toHaveLength(1);
    expect(index.search("featuring")).toHaveLength(1);
  });
});
