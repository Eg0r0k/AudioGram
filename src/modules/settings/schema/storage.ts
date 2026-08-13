import { object, number, string, optional } from "valibot";
import type { InferOutput } from "valibot";

export const StorageInfoSchema = object({
  tracksSize: optional(number(), 0),
  coversSize: optional(number(), 0),
  lyricsSize: optional(number(), 0),
  offlineNdSize: optional(number(), 0),
  offlineYtSize: optional(number(), 0),
  dbSize: optional(number(), 0),
  quotaTotal: optional(number(), 0),
  quotaUsed: optional(number(), 0),
  tracksCount: optional(number(), 0),
  albumsCount: optional(number(), 0),
  artistsCount: optional(number(), 0),
  storagePath: optional(string(), ""),
});

export type StorageInfo = InferOutput<typeof StorageInfoSchema>;
