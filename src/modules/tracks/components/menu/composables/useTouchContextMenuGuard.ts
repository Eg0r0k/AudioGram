import { useEventListener } from "@vueuse/core";
import type { Ref } from "vue";

/**
 * На таче long-press по строке трека уходит в режим выделения, а не в
 * контекстное меню (оно остаётся на «…» и правом клике мыши). reka-ui
 * ContextMenuTrigger проверяет defaultPrevented у pointerdown после
 * nextTick — capture-preventDefault здесь отменяет его long-press-таймер.
 * contextmenu, порождённый тач-нажатием, гасится тоже: Android WebView
 * синтезирует его независимо от reka.
 */
export const useTouchContextMenuGuard = (
  guardRef: Ref<HTMLElement | null>,
  canFillMenuFrom: (target: HTMLElement) => boolean,
  rowSelector = "[data-track-row]",
): void => {
  let lastPointerWasTouch = false;

  useEventListener(guardRef, "pointerdown", (e: PointerEvent) => {
    lastPointerWasTouch = e.pointerType === "touch" || e.pointerType === "pen";
    if (!lastPointerWasTouch) return;

    const target = e.target as HTMLElement;
    if (target.closest(rowSelector) || !canFillMenuFrom(target)) {
      e.preventDefault();
    }
  }, { capture: true });

  useEventListener(guardRef, "contextmenu", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const touchPressOnRow = lastPointerWasTouch && !!target.closest(rowSelector);
    if (!touchPressOnRow && canFillMenuFrom(target)) return;

    e.preventDefault();
    e.stopPropagation();
  }, { capture: true });
};
