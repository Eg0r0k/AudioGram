import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import type { AlbumEntity, ArtistEntity } from "@/db/entities";
import { AlbumId, ArtistId } from "@/types/ids";
import type { BaseMetadata } from "@/workers/types";
import { EntityResolver } from "../entity-resolver";

// Линковка при импорте: одинаковые по смыслу имена артистов/альбомов должны
// схлопываться в одну сущность, чтобы пользователю не приходилось руками
// сливать дубликаты ("Aboba123" == "AbOba123" == " aboba123 ").

const artistId = ArtistId("a-existing");
const albumId = AlbumId("al-existing");

function artistRow(id: ArtistId, name: string): ArtistEntity {
  return { id, name, pinned: 1, addedAt: 1, updatedAt: 1 };
}

function albumRow(id: AlbumId, title: string, artist: ArtistId): AlbumEntity {
  return { id, title, artistId: artist, pinned: 1, addedAt: 1, updatedAt: 1 };
}

function meta(artists: string[], album = ""): BaseMetadata {
  return {
    title: "T",
    artists,
    album,
    duration: 100,
    format: {} as BaseMetadata["format"],
  };
}

async function resolved(...metas: BaseMetadata[]): Promise<EntityResolver> {
  const resolver = new EntityResolver();
  await resolver.resolve(metas);
  return resolver;
}

beforeEach(async () => {
  await db.open();
  await Promise.all([db.artists.clear(), db.albums.clear()]);
});

describe("artist linking", () => {
  it("matches an existing artist case-insensitively", async () => {
    await db.artists.add(artistRow(artistId, "Aboba123"));

    const resolver = await resolved(meta(["AbOba123"]));

    expect(resolver.getArtistId("AbOba123")).toBe(artistId);
  });

  it("matches an existing artist despite stray padding in the tag", async () => {
    await db.artists.add(artistRow(artistId, "Aboba123"));

    const resolver = await resolved(meta(["  Aboba123  "]));

    expect(resolver.getArtistId("  Aboba123  ")).toBe(artistId);
  });

  it("matches when the STORED name carries the padding/casing noise", async () => {
    await db.artists.add(artistRow(artistId, "  ABOBA123 "));

    const resolver = await resolved(meta(["aboba123"]));

    expect(resolver.getArtistId("aboba123")).toBe(artistId);
  });

  it("folds different casings within one import batch into a single new artist", async () => {
    const resolver = await resolved(meta(["Aboba123"]), meta(["ABOBA123"]));

    const id = resolver.getArtistId("Aboba123");
    expect(id).toBeDefined();
    expect(resolver.getArtistId("ABOBA123")).toBe(id);
  });

  it("creates a fresh id when nothing matches", async () => {
    await db.artists.add(artistRow(artistId, "Совсем другой"));

    const resolver = await resolved(meta(["Aboba123"]));

    const id = resolver.getArtistId("Aboba123");
    expect(id).toBeDefined();
    expect(id).not.toBe(artistId);
  });

  it("matches cyrillic names case-insensitively", async () => {
    await db.artists.add(artistRow(artistId, "Серега Пират"));

    const resolver = await resolved(meta(["СЕРЕГА ПИРАТ"]));

    expect(resolver.getArtistId("СЕРЕГА ПИРАТ")).toBe(artistId);
  });

  it("matches names that differ only by unicode normalization (NFC vs NFD)", async () => {
    // NFC: акцентированная буква одним символом (так пишет Windows);
    // NFD: базовая буква + комбинируемый акцент (так отдаёт macOS).
    const nfc = "Beyonc\u00E9";
    const nfd = "Beyonce\u0301";
    await db.artists.add(artistRow(artistId, nfc));

    const resolver = await resolved(meta([nfd]));

    expect(resolver.getArtistId(nfd)).toBe(artistId);
  });

  it("matches names that differ only by inner whitespace (double / nbsp)", async () => {
    await db.artists.add(artistRow(artistId, "Aboba 123"));

    const nbsp = "Aboba 123";
    const resolver = await resolved(meta(["Aboba  123"]), meta([nbsp]));

    expect(resolver.getArtistId("Aboba  123")).toBe(artistId);
    expect(resolver.getArtistId(nbsp)).toBe(artistId);
  });

  it("getArtistIds maps every artist of the meta and drops blank names", async () => {
    await db.artists.add(artistRow(artistId, "Aboba123"));

    const m = meta(["ABOBA123", "   ", "Новый артист"]);
    const resolver = await resolved(m);

    const ids = resolver.getArtistIds(m);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(artistId);
  });
});

describe("album linking", () => {
  it("matches an existing album of the same artist case-insensitively", async () => {
    await db.artists.add(artistRow(artistId, "Aboba123"));
    await db.albums.add(albumRow(albumId, "Aboba123", artistId));

    const resolver = await resolved(meta(["Aboba123"], "AbOba123"));

    expect(resolver.getAlbumEntry(artistId, "AbOba123")).toEqual({
      id: albumId,
      isNew: false,
    });
  });

  it("matches when the stored album title carries stray padding", async () => {
    await db.artists.add(artistRow(artistId, "Aboba123"));
    await db.albums.add(albumRow(albumId, "  Greatest Hits ", artistId));

    const resolver = await resolved(meta(["Aboba123"], "Greatest Hits"));

    expect(resolver.getAlbumEntry(artistId, "Greatest Hits")?.id).toBe(albumId);
  });

  it("matches album titles that differ only by NFC/NFD normalization", async () => {
    const nfc = "Caf\u00E9";
    const nfd = "Cafe\u0301";
    await db.artists.add(artistRow(artistId, "Aboba123"));
    await db.albums.add(albumRow(albumId, nfc, artistId));

    const resolver = await resolved(meta(["Aboba123"], nfd));

    expect(resolver.getAlbumEntry(artistId, nfd)?.id).toBe(albumId);
  });

  it("keeps same-titled albums of DIFFERENT artists apart", async () => {
    await db.artists.add(artistRow(artistId, "Aboba123"));
    await db.albums.add(albumRow(albumId, "Debut", artistId));

    const resolver = await resolved(meta(["Другой артист"], "Debut"));

    const otherArtistId = resolver.getArtistId("Другой артист")!;
    const entry = resolver.getAlbumEntry(otherArtistId, "Debut");
    expect(entry).toBeDefined();
    expect(entry!.id).not.toBe(albumId);
    expect(entry!.isNew).toBe(true);
  });

  it("folds different casings within one import batch into a single new album", async () => {
    const resolver = await resolved(
      meta(["Aboba123"], "Deluxe Edition"),
      meta(["ABOBA123"], "DELUXE EDITION"),
    );

    const id = resolver.getArtistId("Aboba123")!;
    const first = resolver.getAlbumEntry(id, "Deluxe Edition");
    const second = resolver.getAlbumEntry(id, "DELUXE EDITION");
    expect(first).toBeDefined();
    expect(first).toEqual(second);
    expect(first!.isNew).toBe(true);
  });

  it("skips empty and Unknown Album titles", async () => {
    const resolver = await resolved(
      meta(["Aboba123"], ""),
      meta(["Aboba123"], "Unknown Album"),
    );

    const id = resolver.getArtistId("Aboba123")!;
    expect(resolver.getAlbumEntry(id, "")).toBeUndefined();
    expect(resolver.getAlbumEntry(id, "Unknown Album")).toBeUndefined();
  });
});

// Языкоспецифичные ловушки, которые не решаются голым toLowerCase():
// капс-теги в разных письменностях кодируют "те же буквы" иначе.
describe("language-specific identity", () => {
  it("turkish: dotted capital I (Istanbul in caps) matches plain latin i", async () => {
    // "İ" = İ; İ.toLowerCase() даёт "i" + комбинируемую точку U+0307.
    await db.artists.add(artistRow(artistId, "istanbul"));

    const resolver = await resolved(meta(["İstanbul"]));

    expect(resolver.getArtistId("İstanbul")).toBe(artistId);
  });

  it("turkish: caps tag loses the dotless-i distinction (IŞIK vs Işık)", async () => {
    // Хранится "Işık" (с dotless ı), капс-тег "IŞIK" в не-турецкой локали
    // lowercase-ится в "işik" — различие ı/i должно фолдиться.
    await db.artists.add(artistRow(artistId, "Işık"));

    const resolver = await resolved(meta(["IŞIK"]));

    expect(resolver.getArtistId("IŞIK")).toBe(artistId);
  });

  it("greek: final sigma ς matches medial σ from caps tags", async () => {
    // Хранится "Νικος" с конечной ς, тег — капсом "ΝΙΚΟΣ" (Σ).
    await db.artists.add(artistRow(artistId, "Νικος"));

    const resolver = await resolved(meta(["ΝΙΚΟΣ"]));

    expect(resolver.getArtistId("ΝΙΚΟΣ")).toBe(artistId);
  });

  it("german: caps tag STRASSE matches Straße", async () => {
    // Апперкейс ß — это "SS", поэтому капс-теги теряют ß безвозвратно.
    await db.artists.add(artistRow(artistId, "Straße"));

    const resolver = await resolved(meta(["STRASSE"]));

    expect(resolver.getArtistId("STRASSE")).toBe(artistId);
  });

  it("japanese: full-width latin from tags matches ASCII", async () => {
    // "ＡＢＢＡ" = ＡＢＢＡ полноширинными символами.
    await db.artists.add(artistRow(artistId, "ABBA"));

    const resolver = await resolved(meta(["ＡＢＢＡ"]));

    expect(resolver.getArtistId("ＡＢＢＡ")).toBe(artistId);
  });

  it("japanese: half-width katakana matches full-width katakana", async () => {
    // "ｱｲｳｴｵ" = ｱｲｳｴｵ (полуширинная катакана).
    await db.artists.add(artistRow(artistId, "アイウエオ"));

    const resolver = await resolved(meta(["ｱｲｳｴｵ"]));

    expect(resolver.getArtistId("ｱｲｳｴｵ")).toBe(artistId);
  });

  it("japanese: ideographic space (U+3000) matches a regular space", async () => {
    await db.artists.add(artistRow(artistId, "宇多田 ヒカル"));

    const resolver = await resolved(meta(["宇多田　ヒカル"]));

    expect(resolver.getArtistId("宇多田　ヒカル")).toBe(artistId);
  });

  it("russian: ё and е are used interchangeably in tags", async () => {
    // Хранится "Ёлка", тег — "ЕЛКА": в русских тегах ё/е пишут вперемешку.
    await db.artists.add(artistRow(artistId, "Ёлка"));

    const resolver = await resolved(meta(["ЕЛКА"]));

    expect(resolver.getArtistId("ЕЛКА")).toBe(artistId);
  });

  it("does NOT merge genuinely different accented names", async () => {
    // Настоящие акценты — значимы: "Mylène" и "Mylene" остаются разными.
    await db.artists.add(artistRow(artistId, "Mylène"));

    const resolver = await resolved(meta(["Mylene"]));

    const id = resolver.getArtistId("Mylene");
    expect(id).toBeDefined();
    expect(id).not.toBe(artistId);
  });

  it("does NOT merge katakana with hiragana", async () => {
    // カワイ (катакана) и かわい (хирагана) — разные написания, не фолдим.
    await db.artists.add(artistRow(artistId, "カワイ"));

    const resolver = await resolved(meta(["かわい"]));

    const id = resolver.getArtistId("かわい");
    expect(id).toBeDefined();
    expect(id).not.toBe(artistId);
  });
});
