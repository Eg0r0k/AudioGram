import type { ComputedRef } from "vue";

export type MediaContext = "artist-page" | "liked" | "playlist" | "album";

export interface MediaActions {
  addToQueue: () => void;
  edit: () => void;
  delete: () => void;
  share: () => void;
  /** M4: ND album / any playlist — batch offline download. Absent = hidden. */
  canDownloadOffline?: ComputedRef<boolean>;
  downloadOffline?: () => void;
}
