import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { storageService } from "@/db/storage";
import { hasNativeSupport } from "@/db/storage/IFileStorage";
import { IS_TAURI } from "@/lib/environment/userAgent";
import type { Track } from "@/modules/player/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { attachTrackLyricsAndSync } from "@/queries/track.queries";

interface SelectedLyricsFile {
  file?: File;
  path?: string;
}

function pickLyricsFileFromBrowser(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let settled = false;

    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      resolve(file);
    };

    input.type = "file";
    input.accept = ".lrc,text/plain";
    input.style.display = "none";

    input.addEventListener("change", () => {
      finish(input.files?.[0] ?? null);
      input.remove();
    }, { once: true });

    window.addEventListener("focus", () => {
      window.setTimeout(() => {
        finish(input.files?.[0] ?? null);
        input.remove();
      }, 300);
    }, { once: true });

    document.body.append(input);
    input.click();
  });
}

async function pickLyricsFile(title: string): Promise<SelectedLyricsFile | null> {
  if (IS_TAURI && hasNativeSupport(storageService)) {
    const selected = await open({
      multiple: false,
      title,
      filters: [{
        name: "LRC",
        extensions: ["lrc"],
      }],
    });

    if (!selected || Array.isArray(selected)) {
      return null;
    }

    return { path: selected };
  }

  const file = await pickLyricsFileFromBrowser();
  return file ? { file } : null;
}

async function saveLyricsFile(trackId: string, selected: SelectedLyricsFile): Promise<string> {
  const targetPath = `lyrics/${trackId}.lrc`;

  if (selected.path && hasNativeSupport(storageService)) {
    const result = await storageService.importFile(selected.path, targetPath);
    if (result.isErr()) {
      throw result.error;
    }

    return result.value;
  }

  if (!selected.file) {
    throw new Error("Lyrics file not selected");
  }

  const result = await storageService.saveFile(targetPath, selected.file);
  if (result.isErr()) {
    throw result.error;
  }

  return result.value;
}

export function useAttachTrackLyrics() {
  const queryClient = useQueryClient();
  const queueStore = useQueueStore();
  const { t } = useI18n();

  const mutation = useMutation({
    mutationFn: async (track: Track) => {
      const selected = await pickLyricsFile(t("player.pickLyrics"));
      if (!selected) {
        return null;
      }

      const lyricsPath = await saveLyricsFile(track.id, selected);
      const nextTrack = await attachTrackLyricsAndSync(queryClient, track, lyricsPath);

      track.lyricsPath = nextTrack.lyricsPath;

      // The now-playing UI reads the queue's copy of the current track.
      queueStore.syncTrackMetadata(nextTrack);

      toast.success(t("player.lyricsAttached"));

      return nextTrack;
    },
    onError: () => {
      toast.error(t("player.lyricsAttachFailed"));
    },
  });

  return {
    attachTrackLyrics: mutation.mutateAsync,
    isAttachingLyrics: mutation.isPending,
  };
}
