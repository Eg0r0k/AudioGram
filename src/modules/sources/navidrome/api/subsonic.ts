import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { md5 } from "@noble/hashes/legacy.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { fetch } from "@tauri-apps/plugin-http";
import type { SourceError } from "../../types";

//
// Subsonic REST client for Navidrome. Transport is tauri-plugin-http: the
// request runs on the Rust side, so the user's server needs no CORS setup.
// Credentials never appear in code or logs — they arrive at runtime from
// the source settings.
//

export interface NdConfig {
  baseUrl: string;
  username: string;
  password: string;
}

const API_VERSION = "1.16.1";
const CLIENT_NAME = "audiogram";

export function randomSalt(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Per-request auth params: `t = md5(password + salt)` with a fresh salt each
 * call, so the password itself never travels.
 */
export function subsonicAuthParams(config: NdConfig, salt: string = randomSalt()): Record<string, string> {
  return {
    u: config.username,
    t: bytesToHex(md5(new TextEncoder().encode(config.password + salt))),
    s: salt,
    v: API_VERSION,
    c: CLIENT_NAME,
    f: "json",
  };
}

export function subsonicUrl(
  config: NdConfig,
  endpoint: string,
  params: Record<string, string | number> = {},
  salt?: string,
): string {
  const base = config.baseUrl.replace(/\/+$/, "");
  const search = new URLSearchParams(subsonicAuthParams(config, salt));
  for (const [key, value] of Object.entries(params)) {
    search.append(key, String(value));
  }
  return `${base}/rest/${endpoint}?${search.toString()}`;
}

/** The `subsonic-response` envelope every endpoint wraps its payload in. */
interface SubsonicEnvelope {
  "subsonic-response"?: {
    status?: "ok" | "failed";
    error?: { code?: number; message?: string };
  } & Record<string, unknown>;
}

export function mapSubsonicErrorCode(code: number | undefined, message: string): SourceError {
  switch (code) {
    case 40:
    case 41:
      return { kind: "AUTH", message };
    case 70:
      return { kind: "NOT_FOUND", message };
    case 0:
    default:
      return { kind: "UNKNOWN", message };
  }
}

/**
 * Parses a raw Subsonic JSON body into the typed payload or a SourceError.
 * Exported separately so envelope handling is unit-testable without any
 * transport.
 */
export function parseSubsonicBody<T>(body: unknown): { ok: true; value: T } | { ok: false; error: SourceError } {
  const envelope = (body as SubsonicEnvelope)?.["subsonic-response"];
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, error: { kind: "PARSE", message: "Missing subsonic-response envelope" } };
  }

  if (envelope.status !== "ok") {
    const error = envelope.error;
    return {
      ok: false,
      error: mapSubsonicErrorCode(error?.code, error?.message ?? "Subsonic request failed"),
    };
  }

  return { ok: true, value: envelope as T };
}

/**
 * Calls a Subsonic endpoint and returns its typed `subsonic-response`
 * payload. Network failures map to NETWORK, malformed bodies to PARSE,
 * API errors through {@link mapSubsonicErrorCode}.
 */
export function subsonicFetch<T>(
  config: NdConfig,
  endpoint: string,
  params: Record<string, string | number> = {},
): ResultAsync<T, SourceError> {
  return ResultAsync.fromPromise(
    fetch(subsonicUrl(config, endpoint, params)),
    (): SourceError => ({ kind: "NETWORK", message: `Request to ${endpoint} failed` }),
  ).andThen(response =>
    ResultAsync.fromPromise(
      response.json() as Promise<unknown>,
      (): SourceError => ({ kind: "PARSE", message: `Invalid JSON from ${endpoint}` }),
    ).andThen((body) => {
      const parsed = parseSubsonicBody<T>(body);
      return parsed.ok ? okAsync(parsed.value) : errAsync(parsed.error);
    }),
  );
}
