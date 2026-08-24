// DIAG — temporary instrumentation for the Android background-playback
// investigation (branch diag/android-background). Removed in one commit.
//
// Covers items 4 and 5 of the protocol:
//   4. actual setInterval delta          → hypothesis E (JS frozen) and the
//      explanation for lyra's 30s readiness timeout never firing;
//   5. a Range probe against the loopback server every 10s while hidden
//                                         → hypothesis C (server unreachable).
//
// Caveat to keep in mind when reading the output: the probe itself is driven
// by setInterval, so background throttling delays it too. That is why item 4
// exists — it measures the throttle factor the probe is subject to.
import { getLogger } from "@/lib/logger";

const TIMER_PERIOD_MS = 1_000;
const PROBE_PERIOD_MS = 10_000;
const TIMER_DRIFT_TOLERANCE_MS = 250;

let _probeUrl: string | null = null;

/** Last URL handed to the media element — the probe target. */
export const setDiagProbeUrl = (url: string | null): void => {
  _probeUrl = url;
};

const vis = (): string =>
  typeof document === "undefined" ? "?" : document.visibilityState;

const startTimerDelta = (): void => {
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const delta = now - last;
    last = now;
    // A steady 1000ms tick in the foreground is pure noise; log the deviations
    // and everything that happens while hidden.
    if (Math.abs(delta - TIMER_PERIOD_MS) > TIMER_DRIFT_TOLERANCE_MS || vis() === "hidden") {
      void getLogger().info(`[DIAG timer] t=${now} delta=${delta}ms vis=${vis()}`);
    }
  }, TIMER_PERIOD_MS);
};

const startRangeProbe = (): void => {
  setInterval(() => {
    if (vis() !== "hidden") return;
    const url = _probeUrl;
    if (!url) return;

    const started = Date.now();
    fetch(url, { headers: { Range: "bytes=0-1" } })
      .then((response) => {
        void getLogger().info(
          `[DIAG probe] t=${Date.now()} status=${response.status}`
          + ` latency=${Date.now() - started}ms vis=${vis()}`,
        );
      })
      .catch((error: unknown) => {
        void getLogger().warn(
          `[DIAG probe] t=${Date.now()} FAILED after ${Date.now() - started}ms`
          + ` vis=${vis()} err=${String(error)}`,
        );
      });
  }, PROBE_PERIOD_MS);
};

const startLifecycleLog = (): void => {
  document.addEventListener("visibilitychange", () => {
    void getLogger().info(
      `[DIAG vis] t=${Date.now()} -> ${vis()} hasFocus=${document.hasFocus()}`,
    );
  });
  // Page Lifecycle API: Chromium fires these when it actually freezes or
  // discards the page, which is a different event from mere invisibility.
  for (const name of ["freeze", "resume", "pageshow", "pagehide"]) {
    document.addEventListener(name, () => {
      void getLogger().info(`[DIAG lifecycle] t=${Date.now()} ${name} vis=${vis()}`);
    });
  }
};

export const startDiag = (): void => {
  void getLogger().info(`[DIAG] instrumentation active t=${Date.now()} vis=${vis()}`);
  startTimerDelta();
  startRangeProbe();
  startLifecycleLog();
};
