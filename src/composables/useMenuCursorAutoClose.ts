import type { Ref } from "vue";
import { useEventListener } from "@vueuse/core";

const CLOSE_DISTANCE_PX = 100;

function isFartherThan(rect: DOMRect, x: number, y: number, distance: number): boolean {
  const diffX = x >= rect.right ? x - rect.right : rect.left - x;
  const diffY = y >= rect.bottom ? y - rect.bottom : rect.top - y;
  return diffX >= distance || diffY >= distance;
}

export function useMenuCursorAutoClose(
  isOpen: Readonly<Ref<boolean>>,
  close: () => void,
  options: { contentSelector: string },
) {
  useEventListener(document, "mousemove", (event: MouseEvent) => {
    if (!isOpen.value) return;

    const layers = document.querySelectorAll(options.contentSelector);
    if (layers.length === 0) return;

    for (const layer of layers) {
      if (!isFartherThan(layer.getBoundingClientRect(), event.clientX, event.clientY, CLOSE_DISTANCE_PX)) {
        return;
      }
    }

    close();
  }, { passive: true });
}
