/**
 * Throughput benchmarks for the import pipeline.
 *
 * Byte access and tag parsing are faked with a fixed cost so the numbers
 * reflect the pipeline's own overhead — batching, dedup, entity resolution and
 * persistence scheduling — rather than disk or codec speed. Run with:
 *
 *   pnpm test:bench
 */
import { bench, describe, vi } from "vitest";
import { ImportPipeline } from "../import/import-pipeline";
import { itemsFromPaths } from "../import/item-io";
import { yieldToEventLoop } from "../import/shared";
import type { ImportItemIO } from "../import/item-io";
import type { MetadataParser } from "../import/metadata-parser";
import type { ImportItem } from "../types";
import type { BaseMetadata } from "@/workers/types";

function okResult<T>(value: T) {
  return { isOk: () => true, isErr: () => false, value };
}

vi.mock("@/db/repositories", () => ({
  trackRepository: {
    getAllFingerprints: vi.fn(async () => okResult(new Set<string>())),
    createMany: vi.fn(async () => okResult([])),
    findByIds: vi.fn(async () => okResult([])),
  },
  artistRepository: {
    findByIds: vi.fn(async () => okResult([])),
    createMany: vi.fn(async () => okResult([])),
  },
  albumRepository: {
    findByIds: vi.fn(async () => okResult([])),
    createMany: vi.fn(async () => okResult([])),
  },
  coverRepository: { createMany: vi.fn(async () => okResult([])) },
}));

vi.mock("@/db/unit-of-work", () => ({
  unitOfWork: {
    runScoped: async (_tables: unknown, cb: () => Promise<void>) => {
      await cb();
      return okResult(undefined);
    },
  },
}));

vi.mock("@/db", () => {
  const chain = {
    equals: () => chain,
    anyOf: () => chain,
    toArray: async () => [],
  };
  return {
    db: {
      artists: { where: () => chain },
      albums: { where: () => chain },
      tracks: { where: () => chain },
      covers: {},
    },
  };
});

const META: BaseMetadata = {
  title: "Title",
  artists: ["Artist"],
  album: "Album",
  year: 2024,
  duration: 100,
  trackNo: 1,
  diskNo: 1,
  format: { codec: "MP3", bitrate: 320000, sampleRate: 44100, lossless: false, channels: 2 },
};

/** Burns a deterministic slice of wall time without a timer. */
async function work(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function makePipeline(opts: { uniqueArtists?: boolean } = {}) {
  const itemIO = {
    computeFingerprint: async (item: ImportItem) => {
      await work();
      return `fp:${item.name}`;
    },
    readHeadBytes: async () => {
      await work();
      return new Uint8Array(1024);
    },
    copyToStorage: async () => {
      await work();
    },
  } as unknown as ImportItemIO;

  const parser = {
    parse: async (name: string) => {
      await work();
      return opts.uniqueArtists
        ? { ...META, title: name, artists: [`Artist ${name}`], album: `Album ${name}` }
        : { ...META, title: name };
    },
  } as unknown as MetadataParser;

  return new ImportPipeline({ itemIO, metadataParser: parser });
}

function items(count: number, prefix = "s"): ImportItem[] {
  return itemsFromPaths(
    Array.from({ length: count }, (_, i) => `/music/${prefix}${i}.mp3`),
  );
}

describe("import throughput", () => {
  const sizes = [100, 1000, 5000];

  for (const size of sizes) {
    bench(`${size} files, all new`, async () => {
      await makePipeline().run(items(size));
    }, { iterations: size >= 5000 ? 3 : 10 });
  }

  bench("1000 files, every one a duplicate", async () => {
    const pipeline = makePipeline();
    const batch = items(1000);
    // Same fingerprint for all → dedup short-circuits before parse and copy.
    await pipeline.run(batch.map(i => ({ ...i, name: "same.mp3" })));
  }, { iterations: 10 });

  bench("1000 files, all unsupported", async () => {
    await makePipeline().run(
      itemsFromPaths(Array.from({ length: 1000 }, (_, i) => `/music/f${i}.txt`)),
    );
  }, { iterations: 10 });

  bench("1000 files, 1000 distinct artists and albums", async () => {
    await makePipeline({ uniqueArtists: true }).run(items(1000));
  }, { iterations: 10 });
});

describe("progress observation", () => {
  bench("1000 files with a progress callback", async () => {
    let last = 0;
    await makePipeline().run(items(1000), (current) => { last = current; });
    if (last !== 1000) throw new Error("progress did not complete");
  }, { iterations: 10 });
});

/**
 * The pipeline yields once per DB batch. `setTimeout(0)` is clamped to ~4ms by
 * browsers after a few nested calls and throttled to 1/s in a background tab;
 * this measures the yield primitive in isolation.
 */
describe("event loop yield (once per DB batch)", () => {
  bench("yieldToEventLoop x100", async () => {
    for (let i = 0; i < 100; i++) await yieldToEventLoop();
  }, { iterations: 20 });

  bench("setTimeout(0) x100", async () => {
    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }, { iterations: 20 });
});
