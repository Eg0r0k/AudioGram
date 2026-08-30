import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { SourceKind } from "@/types/track-ref";
import { sources } from "../registry";
import {
  forgetSourceHealth,
  setSourceHealth,
  sourceHealth,
  type SourceHealth,
} from "../lib/health";

const UNKNOWN: SourceHealth = { state: "unknown" };

/**
 * Probes one source and records the verdict. A source that offers no probe
 * stays `unknown` — nothing was learned, and reporting `ok` would be a guess;
 * so does one that is no longer available, whose previous verdict was about a
 * configuration that is gone.
 */
export const checkSource = async (kind: SourceKind): Promise<SourceHealth> => {
  const provider = sources.available().find(candidate => candidate.id === kind);

  if (!provider?.checkConnection) {
    forgetSourceHealth(kind);
    return UNKNOWN;
  }

  setSourceHealth(kind, { state: "checking" });
  const result = await provider.checkConnection();
  const next: SourceHealth = result.isOk()
    ? { state: "ok" }
    : { state: "failed", error: result.error };

  setSourceHealth(kind, next);
  return next;
};

/** Re-probes everything configured — used when the route out changes. */
export const checkAvailableSources = (): Promise<SourceHealth[]> =>
  Promise.all(sources.available().map(provider => checkSource(provider.id)));

/** Reactive health of a source for the views that report it. */
export const useSourceHealth = (
  kind: MaybeRefOrGetter<SourceKind | null>,
): ComputedRef<SourceHealth> =>
  computed(() => {
    const resolved = toValue(kind);
    return resolved ? sourceHealth(resolved) : UNKNOWN;
  });
