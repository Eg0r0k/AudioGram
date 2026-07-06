// PWA update bridge — connects vite-plugin-pwa Service Worker lifecycle
// to our unified update store + changelog store.
//
// Flow:
//   1. SW detects new version → needRefresh = true
//   2. We fetch latest tag from GitHub (via TanStack Query cache)
//      and push status: 'available' into the update store
//   3. User clicks "Установить" → applyPwaUpdate()
//      → stages changelog for the target version → SW skipWaiting → page reloads
//   4. On reload, useChangelogOnStartup() promotes the staged changelog
//      → WhatsNewModal opens

import { watch, onUnmounted } from "vue";
import { useRegisterSW } from "virtual:pwa-register/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { useUpdateStore } from "../store/update.store";
import { useChangelogStore } from "../store/changelog.store";
import type { UpdateChannel } from "../types";
import { fetchReleaseNotes, latestTagQueryOptions } from "../api/changelogApi";
import { normalizeReleaseNotes } from "../lib/releaseNotes";

export const usePwaUpdate = (channel: UpdateChannel = "stable", notifyOnUpdate: boolean = true) => {
  const updateStore = useUpdateStore();
  const changelogStore = useChangelogStore();
  const queryClient = useQueryClient();

  let updateInterval: ReturnType<typeof setInterval> | null = null;

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

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
    if (!notifyOnUpdate) return;
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
   * Called when user confirms the update (UpdateToast "Установить" button).
   * Stages changelog before reloading so WhatsNewModal is ready on next launch.
   */
  async function applyPwaUpdate() {
    updateStore.$patch({ status: "downloading" });

    const version = updateStore.updateInfo?.version;
    if (version) {
      const tag = `v${version}`;
      // fetchReleaseNotes uses ofetch directly (ResultAsync) —
      // appropriate here since we're in an imperative async function,
      // not a reactive query context.
      const result = await fetchReleaseNotes(tag);
      result.match(
        (markdown) => {
          changelogStore.stageChangelog(version, normalizeReleaseNotes(markdown));
        },
        () => {
          // Changelog fetch failed — proceed with update anyway, skip modal
        },
      );
    }

    await updateServiceWorker(true);
  }

  return { needRefresh, applyPwaUpdate };
};
