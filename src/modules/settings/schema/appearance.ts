import { object, picklist, optional } from "valibot";
import type { InferOutput as InferOut } from "valibot";

export const ACCENT_COLORS = [
  "blue",
  "pink",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
] as const;

// Presets plus a user-picked color (the hex itself is stored separately).
export const ACCENT_COLOR_VALUES = [...ACCENT_COLORS, "custom"] as const;

export type AccentColor = (typeof ACCENT_COLOR_VALUES)[number];

export const AppearanceSettingsSchema = object({
  theme: optional(picklist(["light", "dark", "system"] as const), "system"),
  accentColor: optional(picklist(ACCENT_COLOR_VALUES), "blue"),
});

export type AppearanceSettings = InferOut<typeof AppearanceSettingsSchema>;
