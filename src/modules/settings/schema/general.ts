import { object, boolean, picklist, optional, parse, intersect } from "valibot";
import type { InferOutput } from "valibot";

export const SUPPORTED_LANGUAGES = ["system", "en", "ru"] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

const BaseGeneralSchema = object({
  language: optional(picklist(SUPPORTED_LANGUAGES), "system"),
  checkUpdatesOnLaunch: optional(boolean(), true),
  analyzeTracks: optional(boolean(), false),
  confirmTrackDeletion: optional(boolean(), true),
});

const TauriGeneralSchema = object({
  closeToTray: optional(boolean(), true),
  launchAtStartup: optional(boolean(), false),
  launchMinimized: optional(boolean(), false),
});

export const GeneralSettingsSchema = intersect([BaseGeneralSchema, TauriGeneralSchema]);
export type GeneralSettings = InferOutput<typeof GeneralSettingsSchema>;
export type BaseGeneralSettings = InferOutput<typeof BaseGeneralSchema>;
export type TauriGeneralSettings = InferOutput<typeof TauriGeneralSchema>;

export const DEFAULT_GENERAL_SETTINGS = parse(GeneralSettingsSchema, {});

export const TAURI_ONLY_KEYS: (keyof TauriGeneralSettings)[] = [
  "closeToTray",
  "launchAtStartup",
  "launchMinimized",
];
