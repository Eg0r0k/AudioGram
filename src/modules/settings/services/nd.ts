import { invoke } from "@tauri-apps/api/core";
import { okAsync, ResultAsync } from "neverthrow";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { subsonicFetch, type NdConfig } from "@/modules/sources/navidrome/api/subsonic";
import type { SourceError } from "@/modules/sources/types";

/**
 * Pushes the Navidrome config (or `null` to clear) to the Rust side, where
 * the `stream://` proxy builds auth tokens from it. A no-op outside Tauri.
 * Never log the config — it carries credentials.
 */
export const applyNdConfig = (config: NdConfig | null): ResultAsync<void, SourceError> => {
  if (!IS_TAURI) return okAsync(undefined);

  return ResultAsync.fromPromise(
    invoke<void>("nd_set_config", { config }),
    (): SourceError => ({ kind: "UNKNOWN", message: "Failed to apply Navidrome config" }),
  );
};

/** Health/credential check — Subsonic `ping`. */
export const pingNd = (config: NdConfig): ResultAsync<void, SourceError> =>
  subsonicFetch(config, "ping").map(() => undefined);
