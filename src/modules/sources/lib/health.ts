import { reactive } from "vue";
import type { SourceError, SourceErrorKind } from "@/types/source-dto";
import type { SourceKind } from "@/types/track-ref";

/**
 * What the last exchange with a source says about the source itself, as
 * opposed to the thing that was asked of it. A rejected password and an
 * unreachable server both come out of a list query as "nothing here" — this
 * is what lets a page say which of the two happened.
 *
 * `unknown` is the honest starting point: nothing has been asked yet.
 */
export type SourceHealth
  = | { state: "unknown" }
    | { state: "checking" }
    | { state: "ok" }
    | { state: "failed"; error: SourceError };

/**
 * Failures that describe the source rather than the request. A missing album
 * is not a broken Navidrome; a rejected credential is. PARSE stays out on
 * purpose — a response this build cannot read still came from a server that
 * is reachable and authenticated, and blaming the connection for it would
 * send the user to re-enter a password that was never wrong.
 */
const SOURCE_LEVEL: ReadonlySet<SourceErrorKind> = new Set<SourceErrorKind>([
  "AUTH",
  "NETWORK",
  "UNAVAILABLE",
]);

const UNKNOWN: SourceHealth = { state: "unknown" };

const health = reactive(new Map<SourceKind, SourceHealth>());

export const sourceHealth = (kind: SourceKind): SourceHealth => health.get(kind) ?? UNKNOWN;

export const setSourceHealth = (kind: SourceKind, next: SourceHealth): void => {
  health.set(kind, next);
};

/**
 * An answer came back, so the source is reachable and the credentials hold —
 * whatever the previous verdict was. Writes only on a change: this runs on
 * every successful query.
 */
export const reportSourceOk = (kind: SourceKind): void => {
  if (health.get(kind)?.state !== "ok") health.set(kind, { state: "ok" });
};

/**
 * A live request already learned what a probe would have. Errors about the
 * request itself are ignored — see {@link SOURCE_LEVEL}.
 */
export const reportSourceError = (kind: SourceKind, error: SourceError): void => {
  if (SOURCE_LEVEL.has(error.kind)) health.set(kind, { state: "failed", error });
};

/**
 * Back to `unknown`. The configuration changed, so the previous verdict was
 * about a different server, account or route out.
 */
export const forgetSourceHealth = (kind?: SourceKind): void => {
  if (kind) health.delete(kind);
  else health.clear();
};
