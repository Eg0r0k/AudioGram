import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useChangelogStore } from "./changelog.store";
import type { DownloadProgress, PwaUpdateHandlers, UpdateChannel, UpdateError, UpdateInfo, UpdateStatus } from "../types";
import { checkUpdate, installUpdate } from "../api/updateApi";
import { fetchReleaseNotes } from "../api/changelogApi";
import { normalizeReleaseNotes } from "../lib/releaseNotes";
import { IS_TAURI } from "@/lib/environment/userAgent";

export const useUpdateStore = defineStore("update", () => {
  const status = ref<UpdateStatus>("idle");
  const updateInfo = ref<UpdateInfo | null>(null);
  const error = ref<UpdateError | null>(null);
  const channel = ref<UpdateChannel>("stable");
  const downloadProgress = ref<DownloadProgress | null>(null);

  const isUpdateAvailable = computed(() => status.value === "available");
  const isDownloading = computed(() => status.value === "downloading");
  const isInstalling = computed(() => status.value === "installing");
  const isBusy = computed(
    () =>
      status.value === "checking"
      || status.value === "downloading"
      || status.value === "installing",
  );
  const downloadPercent = computed(() => {
    const p = downloadProgress.value;
    if (!p || !p.contentLength) return null;
    return Math.round((p.chunkLength / p.contentLength) * 100);
  });

  const setChannel = (c: UpdateChannel) => {
    channel.value = c;
  };

  const stageChangelogForInstall = async () => {
    const version = updateInfo.value?.version;
    if (!version) return;

    const changelogStore = useChangelogStore();
    const inlineNotes = updateInfo.value?.body?.trim();

    if (inlineNotes) {
      changelogStore.stageChangelog(version, normalizeReleaseNotes(inlineNotes));
      return;
    }

    const result = await fetchReleaseNotes(`v${version}`);

    result.match(
      (markdown) => {
        changelogStore.stageChangelog(version, normalizeReleaseNotes(markdown));
      },
      () => {
        changelogStore.clearStagedChangelog(version);
      },
    );
  };

  /**
   * PWA mode has no Tauri commands to invoke — the Service Worker bridge
   * registers its own check/apply here so callers can stay mechanism-agnostic.
   */
  const pwaHandlers = ref<PwaUpdateHandlers | null>(null);
  const registerPwaHandlers = (handlers: PwaUpdateHandlers) => {
    pwaHandlers.value = handlers;
  };

  const check = async (): Promise<void> => {
    if (isBusy.value) return;

    if (!IS_TAURI) {
      await pwaHandlers.value?.check();
      return;
    }

    status.value = "checking";
    error.value = null;
    downloadProgress.value = null;

    const result = await checkUpdate();

    result.match(
      (info) => {
        if (info) {
          updateInfo.value = info;
          status.value = "available";
        }
        else {
          updateInfo.value = null;
          status.value = "up-to-date";
        }
      },
      (e) => {
        error.value = e;
        status.value = "error";
      },
    );
  };

  const install = async (): Promise<void> => {
    if (status.value !== "available") return;

    if (!IS_TAURI) {
      error.value = {
        kind: "INSTALL_FAILED",
        message: "Native install is not available in PWA mode",
      };
      status.value = "error";
      return;
    }

    const { listen } = await import("@tauri-apps/api/event");
    const changelogStore = useChangelogStore();
    const versionToInstall = updateInfo.value?.version ?? null;

    await stageChangelogForInstall();

    status.value = "downloading";
    downloadProgress.value = { chunkLength: 0, contentLength: null };

    const unlistenProgress = await listen<DownloadProgress>(
      "update://download-progress",
      ({ payload }) => {
        if (status.value !== "downloading") return;
        downloadProgress.value = {
          chunkLength: (downloadProgress.value?.chunkLength ?? 0) + payload.chunkLength,
          contentLength: payload.contentLength,
        };
      },
    );

    const unlistenInstallStarted = await listen("update://install-started", () => {
      status.value = "installing";
      unlistenProgress();
    });

    const result = await installUpdate();

    unlistenProgress();
    unlistenInstallStarted();

    result.match(
      () => {},
      (e) => {
        if (versionToInstall) {
          changelogStore.clearStagedChangelog(versionToInstall);
        }
        error.value = e;
        status.value = "error";
        downloadProgress.value = null;
      },
    );
  };
  /**
   * Starts the update the user asked for, whichever mechanism is in play.
   * Prefer this over {@link install} outside of Tauri-only code paths.
   */
  const apply = async (): Promise<void> => {
    if (IS_TAURI) {
      await install();
      return;
    }
    await pwaHandlers.value?.apply();
  };

  const dismiss = (): void => {
    if (
      status.value === "available"
      || status.value === "up-to-date"
      || status.value === "error"
    ) {
      status.value = "idle";
      error.value = null;
    }
  };

  return {
    status,
    updateInfo,
    error,
    channel,
    downloadProgress,
    isUpdateAvailable,
    isDownloading,
    isInstalling,
    isBusy,
    downloadPercent,
    setChannel,
    check,
    install,
    apply,
    dismiss,
    registerPwaHandlers,
  };
});
