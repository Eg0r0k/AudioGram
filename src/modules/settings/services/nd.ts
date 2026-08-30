import { invoke } from "@tauri-apps/api/core";
import { okAsync, ResultAsync } from "neverthrow";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { subsonicAuthParams, type NdConfig } from "@/modules/sources/navidrome/api/subsonic";
import type { SourceError } from "@/modules/sources/types";

/**
 * Pushes the Navidrome auth (or `null` to clear) to the Rust side, where the
 * `stream://` proxy builds upstream URLs from it. The raw password never
 * crosses into Rust: a fresh `{token, salt}` pair is derived here on every
 * config change. A no-op outside Tauri. Never log the payload.
 */
export const applyNdConfig = (config: NdConfig | null): ResultAsync<void, SourceError> => {
  if (!IS_TAURI) return okAsync(undefined);

  const payload = config
    ? (({ t, s }) => ({ baseUrl: config.baseUrl, username: config.username, token: t, salt: s }))(
        subsonicAuthParams(config),
      )
    : null;

  return ResultAsync.fromPromise(
    invoke<void>("nd_set_config", { config: payload }),
    (): SourceError => ({ kind: "UNKNOWN", message: "Failed to apply Navidrome config" }),
  );
};
