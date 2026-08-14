import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { youtubeProvider } from "../provider";
import { youtubeErrorMessage } from "../lib/errors";
import { ytEphemeralTrack } from "../lib/playable";
import type { YtPlayable } from "../types";
import { useYoutubeStore } from "../store/youtube.store";

/**
 * YouTube playback orchestration. Downloading moved to the shared download
 * manager in M5 (`downloadSubject` with a `ytPlayableToDto` subject).
 */
export function useYoutube() {
  const store = useYoutubeStore();
  const queue = useQueueStore();
  const { t } = useI18n();

  /** Stream immediately as an ephemeral track (no download). */
  const play = async (item: YtPlayable): Promise<void> => {
    if (store.resolvingId) return;
    store.resolvingId = item.id;

    const result = await youtubeProvider.resolve(item.id);
    store.resolvingId = null;

    if (result.isErr()) {
      toast.error(youtubeErrorMessage(result.error, t));
      return;
    }

    const track = ytEphemeralTrack({ ...item, id: result.value });
    await queue.setQueue([track], 0, { type: "manual" });
  };

  return { store, play };
}

export { ytEphemeralTrack } from "../lib/playable";
