import { computed, ref, watch } from "vue";
import { useEventListener } from "@vueuse/core";
import type { ComputedRef, Ref } from "vue";

export interface Selectable {
  id: string;
}

export interface SelectionDragOptions {
  rowSelector?: string;
  idDataKey?: string;
  indexDataKey?: string;
  ignoreSelector?: string;
  /** Задержка long-press до входа в выделение на таче. */
  longPressMs?: number;
  /** Элемент для автоскролла при drag; по умолчанию ближайший скроллируемый предок. */
  scrollEl?: HTMLElement;
}

export interface UseSelectionReturn<T extends Selectable> {
  selectedIds: ComputedRef<ReadonlySet<string>>;
  isSelecting: ComputedRef<boolean>;
  selectedCount: ComputedRef<number>;
  isSelected: (id: string) => boolean;
  toggleById: (id: string, force?: boolean) => void;
  selectRange: (anchorId: string, targetId: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  handleSelect: (item: T, event: MouseEvent | KeyboardEvent) => void;
  attachDragListeners: (
    containerEl: HTMLElement,
    options?: SelectionDragOptions,
  ) => () => void;
}

export function useSelection<T extends Selectable>(
  items: Ref<T[]> | ComputedRef<T[]>,
): UseSelectionReturn<T> {
  const _selectedIds = ref<Set<string>>(new Set());
  const _lastToggledId = ref<string | null>(null);

  const selectedIds = computed(() => _selectedIds.value as ReadonlySet<string>);
  const isSelecting = computed(() => _selectedIds.value.size > 0);
  const selectedCount = computed(() => _selectedIds.value.size);

  function isSelected(id: string): boolean {
    return _selectedIds.value.has(id);
  }

  function toggleById(id: string, force?: boolean): void {
    const next = new Set(_selectedIds.value);
    const shouldAdd = force !== undefined ? force : !next.has(id);

    if (shouldAdd) next.add(id);
    else next.delete(id);

    _selectedIds.value = next;
    _lastToggledId.value = id;
  }

  function selectRange(anchorId: string, targetId: string): void {
    const list = items.value;
    const anchorIdx = list.findIndex(item => item.id === anchorId);
    const targetIdx = list.findIndex(item => item.id === targetId);

    if (anchorIdx === -1 || targetIdx === -1) return;

    const [start, end] = anchorIdx <= targetIdx
      ? [anchorIdx, targetIdx]
      : [targetIdx, anchorIdx];

    const shouldSelectRange = !_selectedIds.value.has(targetId);
    const next = new Set(_selectedIds.value);

    for (let i = start; i <= end; i++) {
      const id = list[i].id;
      if (shouldSelectRange) {
        next.add(id);
      }
      else {
        next.delete(id);
      }
    }

    _selectedIds.value = next;
    _lastToggledId.value = targetId;
  }

  function clearSelection(): void {
    _selectedIds.value = new Set();
    _lastToggledId.value = null;
  }

  function selectAll(): void {
    _selectedIds.value = new Set(items.value.map(item => item.id));
    _lastToggledId.value = null;
  }

  function handleSelect(item: T, event: MouseEvent | KeyboardEvent): void {
    if (event.shiftKey && _lastToggledId.value) {
      selectRange(_lastToggledId.value, item.id);
      return;
    }

    if (event.shiftKey) {
      toggleById(item.id);
      _lastToggledId.value = item.id;
      return;
    }

    toggleById(item.id);
  }

  function attachDragListeners(
    containerEl: HTMLElement,
    options: SelectionDragOptions = {},
  ): () => void {
    const {
      rowSelector = "[data-selectable-id]",
      idDataKey = "selectableId",
      indexDataKey = "selectableIndex",
      ignoreSelector = [
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "label",
        "[role='link']",
        "[data-no-drag-select]",
      ].join(", "),
      longPressMs = 450,
      scrollEl: _scrollEl,
    } = options;

    let dragStartIndex = -1;
    let movedToNewRow = false;
    let isDragSelecting: boolean | null = null;
    let snapshotAtDragStart: Set<string> | null = null;

    let stopMouseDrag: (() => void) | null = null;
    let stopTouchDrag: (() => void) | null = null;

    function getRowFromPoint(x: number, y: number) {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const row = el?.closest(rowSelector) as HTMLElement | null;
      if (!row) return null;

      const id = row.dataset[idDataKey];
      const index = Number.parseInt(row.dataset[indexDataKey] ?? "-1", 10);
      if (!id || index === -1) return null;

      return { id, index };
    }

    function applyDragRange(currentIndex: number): void {
      const [start, end] = dragStartIndex <= currentIndex
        ? [dragStartIndex, currentIndex]
        : [currentIndex, dragStartIndex];

      const next = new Set(snapshotAtDragStart!);
      for (let i = start; i <= end; i++) {
        const item = items.value[i];
        if (!item) continue;
        if (isDragSelecting) next.add(item.id);
        else next.delete(item.id);
      }

      _selectedIds.value = next;
    }

    function finalizeDrag(): void {
      if (movedToNewRow && dragStartIndex !== -1) {
        _lastToggledId.value = items.value[dragStartIndex]?.id ?? null;
      }

      dragStartIndex = -1;
      movedToNewRow = false;
      isDragSelecting = null;
      snapshotAtDragStart = null;
    }

    function initDragState(rowIndex: number, rowId: string): void {
      dragStartIndex = rowIndex;
      movedToNewRow = false;
      isDragSelecting = !_selectedIds.value.has(rowId);
      snapshotAtDragStart = new Set(_selectedIds.value);
    }

    function onMouseMove(e: MouseEvent): void {
      const current = getRowFromPoint(e.clientX, e.clientY);
      if (!current) return;
      if (current.index === dragStartIndex && !movedToNewRow) return;

      movedToNewRow = true;
      applyDragRange(current.index);
    }

    function onMouseUp(): void {
      if (movedToNewRow) {
        useEventListener(window, "click", e => e.stopPropagation(), {
          once: true,
          capture: true,
        });
      }

      finalizeDrag();
      stopMouseDrag?.();
      stopMouseDrag = null;
    }

    function onMouseDown(e: MouseEvent): void {
      if (e.button !== 0 || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest(ignoreSelector)) return;

      const row = getRowFromPoint(e.clientX, e.clientY);
      if (!row) return;

      e.preventDefault();
      stopMouseDrag?.();
      initDragState(row.index, row.id);

      const stopMove = useEventListener(window, "mousemove", onMouseMove);
      const stopUp = useEventListener(window, "mouseup", onMouseUp);
      stopMouseDrag = () => {
        stopMove();
        stopUp();
      };
    }

    const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
    const CLICK_SUPPRESS_WINDOW_MS = 350;

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let touchDragActive = false;
    let touchStartX = 0;
    let touchStartY = 0;

    const cancelLongPressTimer = (): void => {
      if (longPressTimer === null) return;
      clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    const abortTouchGesture = (): void => {
      touchDragActive = false;
      stopTouchDrag?.();
      stopTouchDrag = null;
    };

    // Long-press глушит наведённый браузером click по touchend, иначе клик по
    // строке в режиме выделения тут же снимает только что поставленную отметку.
    // Drag с preventDefault click не порождает вовсе — таймер убирает ловушку,
    // чтобы она не съела следующий честный тап.
    const suppressNextClick = (): void => {
      const stop = useEventListener(window, "click", (e) => {
        e.stopPropagation();
        stop();
      }, { capture: true });
      setTimeout(stop, CLICK_SUPPRESS_WINDOW_MS);
    };

    const activateTouchDrag = (row: { id: string; index: number }): void => {
      navigator.vibrate?.(10);
      initDragState(row.index, row.id);
      movedToNewRow = true;
      applyDragRange(row.index);
      touchDragActive = true;
    };

    function onTouchMove(e: TouchEvent): void {
      if (e.touches.length !== 1) {
        if (!touchDragActive) abortTouchGesture();
        return;
      }

      const touch = e.touches[0];

      if (!touchDragActive) {
        const distance = Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY);
        if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) abortTouchGesture();
        return;
      }

      e.preventDefault();

      const current = getRowFromPoint(touch.clientX, touch.clientY);
      if (!current) return;
      applyDragRange(current.index);
    }

    function onTouchEnd(): void {
      if (touchDragActive) {
        suppressNextClick();
        finalizeDrag();
      }
      abortTouchGesture();
    }

    function onTouchStart(e: TouchEvent): void {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      if ((touch.target as HTMLElement | null)?.closest(ignoreSelector)) return;

      const row = getRowFromPoint(touch.clientX, touch.clientY);
      if (!row) return;

      stopTouchDrag?.();
      touchDragActive = false;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        activateTouchDrag(row);
      }, longPressMs);

      const stopMove = useEventListener(window, "touchmove", onTouchMove, { passive: false });
      const stopEnd = useEventListener(window, "touchend", onTouchEnd);
      const stopCancel = useEventListener(window, "touchcancel", onTouchEnd);
      stopTouchDrag = () => {
        cancelLongPressTimer();
        stopMove();
        stopEnd();
        stopCancel();
      };
    }

    const stopContainer = [
      useEventListener(containerEl, "mousedown", onMouseDown),
      useEventListener(containerEl, "touchstart", onTouchStart),
    ];

    return () => {
      stopContainer.forEach(stop => stop());
      stopMouseDrag?.();
      stopTouchDrag?.();
    };
  }

  watch(
    () => items.value.map(item => item.id),
    (ids) => {
      const validIds = new Set(ids);
      const next = new Set<string>();

      for (const id of _selectedIds.value) {
        if (validIds.has(id)) next.add(id);
      }

      if (next.size !== _selectedIds.value.size) {
        _selectedIds.value = next;
      }

      if (_lastToggledId.value && !validIds.has(_lastToggledId.value)) {
        _lastToggledId.value = null;
      }
    },
  );

  return {
    selectedIds,
    isSelecting,
    selectedCount,
    isSelected,
    toggleById,
    selectRange,
    clearSelection,
    selectAll,
    handleSelect,
    attachDragListeners,
  };
}
