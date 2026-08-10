import type { Ref } from "vue";
import { useEventListener } from "@vueuse/core";

// Порог как в Telegram Web K: вокруг меню лежит невидимая буферная рамка,
// пока курсор внутри неё — меню живёт, вышел дальше — закрывается само,
// без лишнего клика.
const CLOSE_DISTANCE_PX = 100;

// Зазор до ближайшей грани по каждой оси (внутри прямоугольника — отрицательный),
// не евклидово расстояние: диагональные траектории мимо меню не наказываются.
function isFartherThan(rect: DOMRect, x: number, y: number, distance: number): boolean {
  const diffX = x >= rect.right ? x - rect.right : rect.left - x;
  const diffY = y >= rect.bottom ? y - rect.bottom : rect.top - y;
  return diffX >= distance || diffY >= distance;
}

/**
 * Закрывает открытое меню, когда курсор уходит дальше порога от всех его
 * слоёв (корневой контент и открытые сабменю — у них общий data-slot).
 * Клавиатурную навигацию не ломает: без движений мыши событий нет.
 */
export function useMenuCursorAutoClose(
  isOpen: Ref<boolean>,
  close: () => void,
  options: { contentSelector: string },
) {
  useEventListener(document, "mousemove", (event: MouseEvent) => {
    if (!isOpen.value) return;

    const layers = document.querySelectorAll(options.contentSelector);
    if (layers.length === 0) return; // контент ещё не смонтирован

    for (const layer of layers) {
      if (!isFartherThan(layer.getBoundingClientRect(), event.clientX, event.clientY, CLOSE_DISTANCE_PX)) {
        return;
      }
    }

    close();
  }, { passive: true });
}
