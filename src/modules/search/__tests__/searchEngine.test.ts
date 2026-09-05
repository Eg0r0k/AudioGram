import { describe, expect, it } from "vitest";
import { createSearchEngine } from "../service/searchEngine";
import type { SearchDocument } from "../types";

const track = (id: string, title: string, extra: Partial<SearchDocument> = {}): SearchDocument => ({
  id: `track:${id}`,
  type: "track",
  title,
  entityId: id,
  ...extra,
});

const titles = (results: { title: string }[]) => results.map(r => r.title).sort();

describe("searchEngine limits", () => {
  const documents = Array.from({ length: 60 }, (_, i) => track(`t${i}`, `Song ${i}`));

  it("returns all matches when limit is undefined", () => {
    const engine = createSearchEngine();
    engine.build(documents);

    const response = engine.search("song", "track", { offset: 0 });

    expect(response.total).toBe(60);
    expect(response.results).toHaveLength(60);
  });

  it("respects an explicit limit while total still counts every match", () => {
    const engine = createSearchEngine();
    engine.build(documents);

    const response = engine.search("song", "track", { offset: 0, limit: 50 });

    expect(response.total).toBe(60);
    expect(response.results).toHaveLength(50);
  });
});

describe("searchEngine term combination", () => {
  const build = () => {
    const engine = createSearchEngine();
    engine.build([
      track("a", "Love Night"),
      track("b", "Night Fever"),
      track("c", "Love Story"),
    ]);
    return engine;
  };

  it("requires every term of a multi-word query", () => {
    const response = build().search("love night", "all");

    expect(titles(response.results)).toEqual(["Love Night"]);
  });

  it("falls back to any-term matching when no document has all terms", () => {
    const response = build().search("story fever", "all");

    expect(titles(response.results)).toEqual(["Love Story", "Night Fever"]);
  });
});

describe("searchEngine prefix matching", () => {
  const build = () => {
    const engine = createSearchEngine();
    engine.build([
      track("a", "Theme Park"),
      track("b", "The Park"),
    ]);
    return engine;
  };

  it("matches the last term as a prefix while the user is still typing", () => {
    const response = build().search("the pa", "all");

    expect(titles(response.results)).toEqual(["The Park"]);
  });

  it("treats completed terms as whole words", () => {
    const response = build().search("the park", "all");

    expect(titles(response.results)).toEqual(["The Park"]);
  });
});

describe("searchEngine fields", () => {
  it("finds documents by year, file name and description", () => {
    const engine = createSearchEngine();
    engine.build([
      { id: "album:a", type: "album", title: "Dummy", entityId: "a", year: 1994 },
      track("t", "Untitled 03", { fileName: "glory box" }),
      { id: "playlist:p", type: "playlist", title: "Roadtrip", entityId: "p", description: "songs for the highway" },
    ]);

    expect(titles(engine.search("1994", "all").results)).toEqual(["Dummy"]);
    expect(titles(engine.search("glory", "all").results)).toEqual(["Untitled 03"]);
    expect(titles(engine.search("highway", "all").results)).toEqual(["Roadtrip"]);
  });

  it("matches accented titles from unaccented queries", () => {
    const engine = createSearchEngine();
    engine.build([track("m", "Motörhead"), track("b", "Beyoncé")]);

    expect(titles(engine.search("motorhead", "all").results)).toEqual(["Motörhead"]);
    expect(titles(engine.search("beyonce", "all").results)).toEqual(["Beyoncé"]);
  });

  it("filters by entity type", () => {
    const engine = createSearchEngine();
    engine.build([
      track("t", "Paranoid"),
      { id: "album:a", type: "album", title: "Paranoid", entityId: "a" },
    ]);

    const response = engine.search("paranoid", "album");

    expect(response.results.map(r => r.type)).toEqual(["album"]);
  });
});

describe("searchEngine mutations", () => {
  it("upsert replaces an existing document", () => {
    const engine = createSearchEngine();
    engine.build([track("t", "Old Title")]);

    engine.upsert([track("t", "New Title")]);

    expect(engine.search("old", "all").results).toHaveLength(0);
    expect(titles(engine.search("new", "all").results)).toEqual(["New Title"]);
  });

  it("upsert adds a document the index has not seen", () => {
    const engine = createSearchEngine();
    engine.build([]);

    engine.upsert([track("t", "Fresh")]);

    expect(titles(engine.search("fresh", "all").results)).toEqual(["Fresh"]);
  });

  it("remove drops documents and ignores unknown ids", () => {
    const engine = createSearchEngine();
    engine.build([track("t", "Gone")]);

    engine.remove(["track:t", "track:never-existed"]);

    expect(engine.search("gone", "all").results).toHaveLength(0);
  });

  it("sums the duration of every match, not only the returned page", () => {
    const engine = createSearchEngine();
    engine.build([
      track("a", "Song A", { duration: 100 }),
      track("b", "Song B", { duration: 200 }),
    ]);

    const response = engine.search("song", "all", { limit: 1 });

    expect(response.results).toHaveLength(1);
    expect(response.totalDuration).toBe(300);
  });
});
