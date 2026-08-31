import { computed, watch, ref, type Ref } from "vue";
import { useCurrentPlayerTrack } from "@/modules/player/composables/useCurrentPlayerTrack";
import { useTrackCover } from "@/modules/covers/composables/useTrackCover";
import { getColorFromImage, type ColorResult } from "@/composables/useImageColor";

const defaultFallback: ColorResult = {
  hex: "#535353",
  rgb: "rgb(83, 83, 83)",
  hsl: "hsl(0, 0%, 21%)",
  isDark: true,
};

export function useMobilePlayerColor() {
  const { currentTrack, libraryTrack } = useCurrentPlayerTrack();

  const { url: coverBlobUrl } = useTrackCover(libraryTrack);

  // Unlike useCurrentTrackCover this one has no fallback image: with no cover
  // to sample, the colour stays the neutral default below.
  const coverUrl = computed(() => {
    const track = currentTrack.value;
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
