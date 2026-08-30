import type { Component } from "vue";
import type { SourceKind } from "@/types/track-ref";
import IconBrandYoutube from "~icons/tabler/brand-youtube-filled";
import IconDeviceLaptop from "~icons/tabler/device-laptop";
import IconServer from "~icons/tabler/server";
import youtubeRaw from "~icons/tabler/brand-youtube-filled?raw";
import laptopRaw from "~icons/tabler/device-laptop?raw";
import serverRaw from "~icons/tabler/server?raw";

//
// How a source presents itself. Kept out of SourceProvider on purpose: the
// provider contract is about data, and a data module has no business
// importing Vue components. Keyed by SourceKind rather than by provider so
// "local" — which is Dexie, not a provider — has an entry like the rest.
//

export interface SourceUI {
  kind: SourceKind;
  /** i18n key: one shared `source.*` namespace, so a source is named once. */
  labelKey: string;
  icon: Component;
  /** The same glyph as raw SVG, for MorphIcon transitions. */
  iconRaw: string;
}

const UI: Record<SourceKind, SourceUI> = {
  local: { kind: "local", labelKey: "source.local", icon: IconDeviceLaptop, iconRaw: laptopRaw },
  nd: { kind: "nd", labelKey: "source.nd", icon: IconServer, iconRaw: serverRaw },
  yt: { kind: "yt", labelKey: "source.yt", icon: IconBrandYoutube, iconRaw: youtubeRaw },
};

export const sourceUI = (kind: SourceKind): SourceUI => UI[kind];
