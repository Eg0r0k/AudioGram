import { ResultAsync } from "neverthrow";
import type { UpdateError, UpdateErrorKind, UpdateInfo } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { IS_MOBILE } from "@/lib/environment/userAgent";
import { checkUpdateAndroid, installUpdateAndroid } from "./androidUpdateApi";

// The Rust commands return a typed { kind, message } error
// (see src-tauri/src/updater.rs). Pass it through as-is; the fallback only
// covers transport-level rejections that never reach that mapping.
const isUpdateError = (raw: unknown): raw is UpdateError =>
  typeof raw === "object"
  && raw !== null
  && "kind" in raw
  && "message" in raw;

const toUpdateError = (raw: unknown, fallbackKind: UpdateErrorKind): UpdateError => {
  if (isUpdateError(raw)) return raw;
  return { kind: fallbackKind, message: typeof raw === "string" ? raw : String(raw) };
};

export const installUpdate = (): ResultAsync<void, UpdateError> =>
  IS_MOBILE
    ? installUpdateAndroid()
    : ResultAsync.fromPromise(
        invoke<void>("install_update"),
        e => toUpdateError(e, "INSTALL_FAILED"),
      );

export const checkUpdate = (): ResultAsync<UpdateInfo | null, UpdateError> =>
  IS_MOBILE
    ? checkUpdateAndroid()
    : ResultAsync.fromPromise(
        invoke<UpdateInfo | null>("check_update"),
        e => toUpdateError(e, "NETWORK"),
      );
