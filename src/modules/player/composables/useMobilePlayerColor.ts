import { computed, watch, ref, type Ref } from "vue";
import { useCurrentPlayerTrack } from "@/modules/player/composables/useCurrentPlayerTrack";
import { useTrackCover } from "@/modules/covers/composables/useTrackCover";
import { getColorFromImage, type ColorResult } from "@/composables/useImageColor";

// Longer than the cover slide (useTrackSwipe's SLIDE_TRANSITION).
const COLOR_EXTRACTION_DELAY_MS = 400;

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
  // Extraction decodes the cover and samples it through a canvas. Right
  // after a track change that lands inside the cover slide, so it waits the
  // slide out; the colour then crossfades in over 900 ms anyway. The token
  // drops a result whose cover is no longer current — swiping through
  // several tracks must not settle on an earlier one's colour.
  let extractionToken = 0;
  watch(coverUrl, async (newCover) => {
    const token = ++extractionToken;
    if (!newCover) {
      color.value = { ...defaultFallback };
      return;
    }

    await new Promise(resolve => setTimeout(resolve, COLOR_EXTRACTION_DELAY_MS));
    if (token !== extractionToken) return;

    let next: ColorResult;
    try {
      next = await getColorFromImage(newCover);
    }
    catch {
      next = { ...defaultFallback };
    }
    if (token === extractionToken) color.value = next;
  }, { immediate: true });

  return {
    color: color as Ref<ColorResult>,
    coverUrl,
  };
}
