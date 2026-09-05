import { useEventListener } from "@vueuse/core";
import { animate, useMotionValue } from "motion-v";
import { onUnmounted, ref, type Ref } from "vue";

// Distance (px) the mouse has to travel before a press turns into a drag.
// Anything shorter is a click and is left alone.
const DRAG_THRESHOLD = 4;
// Velocity (px/s) below which the release does not get an inertia tail.
const MIN_FLING_VELOCITY = 50;
// getVelocity() only looks at the last two pointer samples, so a single
// jittery event can produce absurd numbers — clamp before feeding inertia.
const MAX_FLING_VELOCITY = 4000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const useDragScroll = (containerRef: Readonly<Ref<HTMLElement | null>>) => {
  const isDragging = ref(false);

  // Every scrollLeft write goes through this motion value: during the drag
  // it is set from the pointer, after release `animate` drives it with an
  // inertia transition, and the change listener mirrors it into the DOM.
  const position = useMotionValue(0);
  const unsubscribePosition = position.on("change", (value) => {
    const container = containerRef.value;
    if (container) container.scrollLeft = value;
  });

  let inertia: ReturnType<typeof animate> | null = null;
  let isPressed = false;
  let suppressClick = false;
  let activePointerId = -1;
  let startClientX = 0;
  let startScrollLeft = 0;
  const cleanupListeners: Array<() => void> = [];

  const maxScroll = (container: HTMLElement) =>
    container.scrollWidth - container.clientWidth;

  const stopInertia = () => {
    inertia?.stop();
    inertia = null;
  };

  const startFling = (container: HTMLElement) => {
    const velocity = clamp(
      position.getVelocity(),
      -MAX_FLING_VELOCITY,
      MAX_FLING_VELOCITY,
    );
    if (Math.abs(velocity) < MIN_FLING_VELOCITY) return;

    inertia = animate(position, position.get(), {
      type: "inertia",
      velocity,
      min: 0,
      max: maxScroll(container),
      power: 0.6,
      timeConstant: 300,
      bounceStiffness: 400,
      bounceDamping: 40,
      restDelta: 0.5,
      onComplete: () => {
        inertia = null;
      },
    });
  };

  const release = () => {
    cleanupListeners.forEach(cleanup => cleanup());
    cleanupListeners.length = 0;
    isPressed = false;
    activePointerId = -1;

    if (!isDragging.value) return;
    isDragging.value = false;
    document.body.style.userSelect = "";

    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);

    const container = containerRef.value;
    if (container) startFling(container);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    const container = containerRef.value;
    if (!container) return;

    const delta = e.clientX - startClientX;
    if (!isDragging.value) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      isDragging.value = true;
      document.body.style.userSelect = "none";
    }

    position.set(clamp(startScrollLeft - delta, 0, maxScroll(container)));
  };

  const onPointerEnd = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    release();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const container = containerRef.value;
    if (!container || maxScroll(container) <= 0) return;

    stopInertia();
    isPressed = true;
    activePointerId = e.pointerId;
    startClientX = e.clientX;
    startScrollLeft = container.scrollLeft;
    position.jump(startScrollLeft);

    cleanupListeners.push(
      useEventListener(window, "pointermove", onPointerMove),
      useEventListener(window, "pointerup", onPointerEnd),
      useEventListener(window, "pointercancel", onPointerEnd),
    );
  };

  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClick) return;
    e.stopPropagation();
    e.preventDefault();
  };

  const onDragStart = (e: DragEvent) => {
    if (isPressed) e.preventDefault();
  };

  useEventListener(containerRef, "wheel", stopInertia, { passive: true });

  onUnmounted(() => {
    release();
    stopInertia();
    unsubscribePosition();
  });

  return {
    isDragging,
    onPointerDown,
    onClickCapture,
    onDragStart,
  };
};

export default useDragScroll;
