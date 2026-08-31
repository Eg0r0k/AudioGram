// PWA update bridge — connects vite-plugin-pwa Service Worker lifecycle
// to our unified update store.
//
// Flow:
//   1. SW detects new version → needRefresh = true
//   2. We fetch the latest tag from GitHub (via TanStack Query cache) purely
//      to show the version in the update button, then push status: 'available'
//   3. User clicks the sidebar update button → applyPwaUpdate() → SW
//      skipWaiting → reload
//   4. On reload, useChangelogOnStartup() resolves release notes for the
//      actual new __APP_VERSION__ → WhatsNewModal opens
//
// Changelog is intentionally NOT staged here: the version the SW installs is
// whatever the host deployed, which need not equal GitHub's latest tag, so
// staging under a guessed version was silently lossy. Resolving it after
// reload from __APP_VERSION__ is always correct.

import { watch, onUnmounted, toValue, type MaybeRefOrGetter } from "vue";
import { useRegisterSW } from "virtual:pwa-register/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { getLogger } from "@/lib/logger";
import { useUpdateStore } from "../store/update.store";
import type { UpdateChannel } from "../types";
import { latestTagQueryOptions } from "../api/changelogApi";

const POLL_INTERVAL_MS = 60 * 60 * 1000;

export const usePwaUpdate = (
  channel: MaybeRefOrGetter<UpdateChannel> = "stable",
  enabled: MaybeRefOrGetter<boolean> = true,
) => {
  const updateStore = useUpdateStore();
  const queryClient = useQueryClient();

  const isEnabled = () => toValue(enabled);

  let registration: ServiceWorkerRegistration | undefined;
  let updateInterval: ReturnType<typeof setInterval> | null = null;

  const stopPolling = () => {
    if (updateInterval !== null) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  };

  // A poll that cannot reach the server is expected offline; log it and let
  // the next tick try again. One helper for both the first poll and the
  // interval, so the interval callback stays synchronous.
  const poll = () => {
    registration?.update()
      .catch(error => getLogger().warn(`[Update] Service worker poll failed: ${String(error)}`));
  };

  const startPolling = () => {
    if (!registration || updateInterval !== null) return;
    poll();
    updateInterval = setInterval(poll, POLL_INTERVAL_MS);
  };

  const syncPolling = () => (isEnabled() ? startPolling() : stopPolling());

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      if (!reg) return;
      // The SW is always registered — it is what makes the app work offline.
      // Only the polling for new versions follows the setting.
      registration = reg;
      syncPolling();
    },
  });

  // Reacts to the setting being toggled at runtime, in both directions: a
  // pending update that was suppressed while disabled surfaces as soon as
  // automatic checks are turned back on.
  watch(isEnabled, syncPolling);

  onUnmounted(stopPolling);

  watch([needRefresh, isEnabled], async ([isReady, allowed]) => {
    if (!isReady || !allowed) return;
    // fetchQuery respects the cache: if latestTag was already fetched
    // this session it returns instantly without a network call.
    try {
      const tag = await queryClient.fetchQuery(latestTagQueryOptions(toValue(channel)));
      const version = tag.replace(/^v/, "");

      updateStore.$patch({
        status: "available",
        updateInfo: {
          version,
          currentVersion: __APP_VERSION__,
          body: null,
          date: null,
        },
      });
    }
    catch {
      updateStore.$patch({ status: "available" });
    }
  });

  /**
   * Asks the Service Worker to look for a new build now.
   * `needRefresh` flips through the watcher above when one is found.
   */
  async function checkPwaUpdate() {
    if (!registration) {
      updateStore.$patch({ status: "up-to-date" });
      return;
    }

    updateStore.$patch({ status: "checking" });

    try {
      await registration.update();
      // The watcher owns the "available" transition; only the negative
      // outcome has to be reported here.
      if (!needRefresh.value) {
        updateStore.$patch({ status: "up-to-date" });
      }
    }
    catch (e) {
      updateStore.$patch({
        status: "error",
        error: {
          kind: "NETWORK",
          message: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  /**
   * Called when the user confirms the update from the sidebar button.
   * Triggers the waiting SW to skipWaiting; the page reloads on controllerchange.
   */
  async function applyPwaUpdate() {
    updateStore.$patch({ status: "downloading" });

    try {
      await updateServiceWorker(true);
    }
    catch (e) {
      updateStore.$patch({
        status: "error",
        error: {
          kind: "INSTALL_FAILED",
          message: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  return { needRefresh, applyPwaUpdate, checkPwaUpdate };
};
