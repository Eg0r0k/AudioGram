import { computed, watch, ref, type Ref } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useEntityCover } from "@/modules/covers/composables/useEntityCover";
import { getColorFromImage, type ColorResult } from "@/composables/useImageColor";

const defaultFallback: ColorResult = {
  hex: "#535353",
  rgb: "rgb(83, 83, 83)",
  hsl: "hsl(0, 0%, 21%)",
  isDark: true,
};

export function useMobilePlayerColor() {
  const playerStore = usePlayerStore();

  const libraryTrack = computed(() => {
    const track = playerStore.currentTrack;
    return track?.kind === "library" ? track : null;
  });

  const { url: coverBlobUrl } = useEntityCover(
    "album",
    () => libraryTrack.value?.albumId ?? null,
  );

  const coverUrl = computed(() => {
    const track = playerStore.currentTrack;
    if (!track) return undefined;
    if (track.kind === "ephemeral") return track.cover;
    return coverBlobUrl.value ?? undefined;
  });

  const color = ref<ColorResult>({ ...defaultFallback });
  watch(coverUrl, async (newCover) => {
    if (!newCover) {
      color.value = { ...defaultFallback };
      return;
    }

    try {
      color.value = await getColorFromImage(newCover);
    }
    catch {
      color.value = { ...defaultFallback };
    }
  }, { immediate: true });

  return {
    color: color as Ref<ColorResult>,
    coverUrl,
  };
}
