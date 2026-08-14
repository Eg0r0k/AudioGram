import type { ComputedRef } from "vue";

export type MediaContext = "artist-page" | "liked" | "playlist" | "album";

export interface MediaActions {
  addToQueue: () => void;
  edit: () => void;
  delete: () => void;
  share: () => void;
  /**
   * The entity is a library row, so edit/delete have something to write to.
   * False on live catalog pages (ND album/artist) where both were no-ops.
   * Absent = assume manageable (local-only call sites).
   */
  canManage?: ComputedRef<boolean>;
  /** M4: ND album / any playlist — batch offline download. Absent = hidden. */
  canDownloadOffline?: ComputedRef<boolean>;
  downloadOffline?: () => void;
}
