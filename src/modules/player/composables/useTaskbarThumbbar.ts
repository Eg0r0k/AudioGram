import { invoke } from "@tauri-apps/api/core";
import { watch } from "vue";
import { useI18n } from "vue-i18n";
import useTauriEvent from "@/composables/tauri/useTauriEvent";
import { platformCaps } from "@/lib/environment/platformCaps";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useToggleTrackLike } from "@/modules/tracks/composables/useToggleTrackLike";
import { usePlayerStore } from "../store/player.store";
import { isLibraryTrack } from "../types";

/**
 * Windows taskbar thumbnail toolbar — the Like / Prev / Play-Pause / Next row
 * under the taskbar preview. The Rust side (`thumbbar.rs`) owns the native
 * buttons; this composable mirrors the player state into them and applies
 * the clicks they send back, the same way the Android media-session bridge
 * does for the notification controls.
 */

export type ThumbbarAction = "like" | "previous" | "play-pause" | "next";

export interface ThumbbarState {
  hasTrack: boolean;
  playing: boolean;
  liked: boolean;
  canLike: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  tooltips: {
    like: string;
    unlike: string;
    previous: string;
    play: string;
    pause: string;
    next: string;
  };
}

export const THUMBBAR_ACTION_EVENT = "thumbbar-action";
export const THUMBBAR_SET_STATE_COMMAND = "thumbbar_set_state";

export const useTaskbarThumbbar = () => {
  if (!platformCaps.hasTaskbarThumbbar) return;

  const player = usePlayerStore();
  const queue = useQueueStore();
  const { t } = useI18n();
  const { toggleTrackLike } = useToggleTrackLike();

  const buildState = (): ThumbbarState => {
    const track = player.currentTrack;
    const canLike = track !== null && isLibraryTrack(track);
    return {
      hasTrack: track !== null,
      playing: player.isPlaybackIntended,
      liked: canLike && track.isLiked,
      canLike,
      hasPrevious: queue.hasPrevious,
      hasNext: queue.hasNext,
      tooltips: {
        like: t("player.like"),
        unlike: t("player.unlike"),
        previous: t("player.previousTrack"),
        play: t("player.play"),
        pause: t("player.pause"),
        next: t("player.nextTrack"),
      },
    };
  };

  let lastSignature = "";

  const sync = (state: ThumbbarState) => {
    const signature = JSON.stringify(state);
    if (signature === lastSignature) return;
    lastSignature = signature;
    invoke(THUMBBAR_SET_STATE_COMMAND, { state }).catch((err) => {
      console.warn("[TaskbarThumbbar] set state failed:", err);
    });
  };

  watch(buildState, sync, { immediate: true });

  useTauriEvent<ThumbbarAction>(THUMBBAR_ACTION_EVENT, ({ payload }) => {
    switch (payload) {
      case "play-pause":
        player.togglePlay();
        break;
      case "next":
        if (queue.hasNext) queue.next();
        break;
      case "previous":
        if (queue.hasPrevious) queue.previous();
        break;
      case "like": {
        const track = player.currentTrack;
        if (track && isLibraryTrack(track)) toggleTrackLike(track);
        break;
      }
    }
  });
};
