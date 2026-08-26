import { invoke } from "@tauri-apps/api/core";
import { onUnmounted, watch } from "vue";
import { platformCaps } from "@/lib/environment/platformCaps";
import { getLogger } from "@/lib/logger";
import { usePlayerStore } from "../store/player.store";
import {
  createDiscordActivityPayload,
  getDiscordPositionBucket,
} from "../utils/discordPresence";

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID?.trim() ?? "";
const RETRY_DELAY_MS = 30_000;

export const useDiscordPresence = () => {
  if (!platformCaps.hasDiscord) return;
  if (!DISCORD_CLIENT_ID) {
    // A build without the id (it ships via .env.production) silently loses
    // the feature; say so once instead of leaving the log empty.
    getLogger().warn("[DiscordPresence] disabled: VITE_DISCORD_CLIENT_ID is empty in this build");
    return;
  }

  const player = usePlayerStore();

  let lastSignature = "";
  let retryAfter = 0;

  const invokeDiscord = async (command: string, args?: Record<string, unknown>) => {
    try {
      await invoke(command, args);
      retryAfter = 0;
    }
    catch (err) {
      retryAfter = Date.now() + RETRY_DELAY_MS;
      console.warn(`[DiscordPresence] ${command} failed:`, err);
    }
  };

  const clearActivity = () => {
    if (lastSignature === "clear") return;
    lastSignature = "clear";
    invokeDiscord("discord_clear_activity");
  };

  const syncActivity = () => {
    if (Date.now() < retryAfter) return;

    const payload = createDiscordActivityPayload({
      clientId: DISCORD_CLIENT_ID,
      track: player.currentTrack,
      isPlaying: player.isPlaying,
      duration: player.duration,
      currentTime: player.currentTime,
    });
    if (!payload) {
      clearActivity();
      return;
    }

    const signature = JSON.stringify(payload);
    if (signature === lastSignature) return;

    lastSignature = signature;
    invokeDiscord("discord_set_activity", { payload });
  };

  const stop = watch(
    () => [
      player.currentTrack?.id,
      player.currentTrack?.title,
      player.currentTrack?.artist,
      player.currentTrack?.albumName,
      player.isPlaying,
      player.duration,
      getDiscordPositionBucket(player.currentTime),
    ],
    syncActivity,
    { immediate: true },
  );

  onUnmounted(() => {
    stop();
    clearActivity();
  });
};
