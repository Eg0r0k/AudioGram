import { boolean, object, optional, parse, string } from "valibot";
import type { InferOutput } from "valibot";
import type { NdConfig } from "@/modules/sources/navidrome/api/subsonic";

export const NdSourceSettingsSchema = object({
  enabled: optional(boolean(), false),
  baseUrl: optional(string(), ""),
  username: optional(string(), ""),
  password: optional(string(), ""),
});

export type NdSourceSettings = InferOutput<typeof NdSourceSettingsSchema>;

export const SourcesSettingsSchema = object({
  nd: optional(NdSourceSettingsSchema, parse(NdSourceSettingsSchema, {})),
});

export type SourcesSettings = InferOutput<typeof SourcesSettingsSchema>;

export const DEFAULT_SOURCES_SETTINGS = parse(SourcesSettingsSchema, {});

/**
 * Builds the config handed to the Subsonic client and the Rust proxy, or
 * `null` when the source is disabled or incomplete (nothing to talk to).
 */
export const buildNdConfig = (settings: NdSourceSettings): NdConfig | null => {
  if (!settings.enabled) return null;

  let baseUrl = settings.baseUrl.trim();
  while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  const username = settings.username.trim();
  if (!baseUrl || !username) return null;

  return { baseUrl, username, password: settings.password };
};
