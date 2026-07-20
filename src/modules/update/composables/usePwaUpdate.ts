// PWA update bridge — connects vite-plugin-pwa Service Worker lifecycle
// to our unified update store.
//
// Flow:
//   1. SW detects new version → needRefresh = true
//   2. We fetch the latest tag from GitHub (via TanStack Query cache) purely
//      to show the version in the update toast, then push status: 'available'
//   3. User clicks "Установить" → applyPwaUpdate() → SW skipWaiting → reload
//   4. On reload, useChangelogOnStartup() resolves release notes for the
//      actual new __APP_VERSION__ → WhatsNewModal opens
//
// Changelog is intentionally NOT staged here: the version the SW installs is
// whatever the host deployed, which need not equal GitHub's latest tag, so
// staging under a guessed version was silently lossy. Resolving it after
// reload from __APP_VERSION__ is always correct.

import { watch, onUnmounted } from "vue";
import { useRegisterSW } from "virtual:pwa-register/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { useUpdateStore } from "../store/update.store";
import type { UpdateChannel } from "../types";
import { latestTagQueryOptions } from "../api/changelogApi";

export const usePwaUpdate = (channel: UpdateChannel = "stable", enabled: boolean = true) => {
  const updateStore = useUpdateStore();
  const queryClient = useQueryClient();

  let updateInterval: ReturnType<typeof setInterval> | null = null;

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Auto-update checks are disabled — register the SW (needed for offline)
      // but never poll for or surface new versions.
      if (!enabled) return;

      registration.update();
      updateInterval = setInterval(() => registration.update(), 60 * 60 * 1000);
    },
  });

  onUnmounted(() => {
    if (updateInterval !== null) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  });

  watch(needRefresh, async (isReady) => {
    if (!isReady) return;
    if (!enabled) return;
    // fetchQuery respects the cache: if latestTag was already fetched
    // this session it returns instantly without a network call.
    try {
      const tag = await queryClient.fetchQuery(latestTagQueryOptions(channel));
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
   * Called when the user confirms the update (UpdateToast "Установить").
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

  return { needRefresh, applyPwaUpdate };
};
