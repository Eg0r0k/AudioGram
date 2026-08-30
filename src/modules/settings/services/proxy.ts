import { invoke } from "@tauri-apps/api/core";
import { ResultAsync, okAsync } from "neverthrow";
import { IS_TAURI } from "@/lib/environment/userAgent";

export class ProxyError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ProxyError";
  }
}

/**
 * The most specific text available: what the cause says about itself, the
 * bare string a Tauri command rejected with, or the caller's fallback.
 */
const messageOf = (cause: unknown, fallback: string): string => {
  if (cause instanceof Error) return cause.message;
  return typeof cause === "string" ? cause : fallback;
};

const toError = (message: string) => (cause: unknown) =>
  new ProxyError(messageOf(cause, message), cause);

/**
 * Pushes the active proxy URL (or `null` to clear) to the Rust side, where the
 * Innertube client and the `stream://` client pick it up. A no-op outside Tauri.
 */
export const applyProxy = (url: string | null): ResultAsync<void, ProxyError> => {
  if (!IS_TAURI) return okAsync(undefined);

  return ResultAsync.fromPromise(
    invoke<void>("set_proxy", { url }),
    toError("Failed to apply proxy"),
  );
};

/**
 * Verifies the proxy connects by routing a request through it. Resolves with the
 * round-trip latency in milliseconds.
 */
export const checkProxyConnection = (url: string): ResultAsync<number, ProxyError> => {
  if (!IS_TAURI) {
    return ResultAsync.fromPromise(
      Promise.reject(new ProxyError("Proxy is only available in the desktop app")),
      toError("Proxy is only available in the desktop app"),
    );
  }

  return ResultAsync.fromPromise(
    invoke<number>("proxy_check", { url }),
    toError("Proxy connection failed"),
  );
};
