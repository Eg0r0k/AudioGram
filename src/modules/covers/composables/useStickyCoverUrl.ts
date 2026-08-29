import { computed, ref, watch, type ComputedRef } from "vue";

/**
 * Cover URL that does not flash the fallback while the next cover's query
 * is still loading: the previous URL is held until the new one is known, or
 * until the absence is definitive (query settled empty).
 *
 * It deliberately does not probe/decode the new image — an <img> whose src
 * flips to a blob: URL that another element is showing reloads it anyway,
 * so a strip that wants a seamless swap must keep the DOM node instead
 * (see useTrackSwipe's keyed slots), not delay the URL.
 */
export const useStickyCoverUrl = (
  source: () => string | undefined,
  isLoading: () => boolean,
): ComputedRef<string | undefined> => {
  const held = ref<string | undefined>(source());

  watch([source, isLoading], ([nextUrl, loading]) => {
    if (nextUrl) held.value = nextUrl;
    else if (!loading) held.value = undefined;
  });

  return computed(() => held.value);
};
