import { onUnmounted, shallowRef } from "vue";

export interface Wave {
  x: number;
  y: number;
  size: number;
  id: number;
  hiding: boolean;
}
interface RippleElement extends HTMLElement {
  __rippleId?: number;
}

const RIPPLE_DURATION = 400;

let waveId = 0;

const useRipple = () => {
  const waves = shallowRef<Wave[]>([]);

  const waveData = new Map<
    number,
    {
      startTime: number;
      released: boolean;
      hideTimer?: ReturnType<typeof setTimeout>;
      removeTimer?: ReturnType<typeof setTimeout>;
    }
  >();

  const calcRippleSize = (
    x: number,
    y: number,
    width: number,
    height: number,
  ): number => {
    const dx = Math.abs(x - width / 2) + width / 2;
    const dy = Math.abs(y - height / 2) + height / 2;
    return Math.hypot(dx, dy);
  };

  const scheduleHide = (id: number) => {
    const data = waveData.get(id);
    if (!data) {
      return;
    }

    const elapsedTime = Date.now() - data.startTime;
    const duration = RIPPLE_DURATION;
    const halfDuration = duration / 2;

    if (elapsedTime < duration) {
      const delay = Math.max(duration - elapsedTime, halfDuration);
      const hideDelay = Math.max(delay - halfDuration, 0);

      data.hideTimer = setTimeout(() => {
        waves.value = waves.value.map(w =>
          w.id === id ? { ...w, hiding: true } : w,
        );
      }, hideDelay);
      data.removeTimer = setTimeout(() => {
        waves.value = waves.value.filter(w => w.id !== id);
        waveData.delete(id);
      }, delay);
    }
    else {
      waves.value = waves.value.map(w =>
        w.id === id ? { ...w, hiding: true } : w,
      );

      data.removeTimer = setTimeout(() => {
        waves.value = waves.value.filter(w => w.id !== id);
        waveData.delete(id);
      }, halfDuration);
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    const el = e.currentTarget as RippleElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = calcRippleSize(x, y, rect.width, rect.height);

    const id = waveId++;

    waveData.set(id, {
      startTime: Date.now(),
      released: false,
    });

    el.__rippleId = id;

    waves.value = [...waves.value, { x, y, size, id, hiding: false }];
  };

  const onPointerUp = (e: PointerEvent) => {
    const el = e.currentTarget as RippleElement;
    const id = el.__rippleId;
    if (id === undefined) {
      return;
    }

    const data = waveData.get(id);
    if (!data || data.released) {
      return;
    }

    data.released = true;
    scheduleHide(id);
  };

  const onPointerCancel = (e: PointerEvent) => {
    const el = e.currentTarget as RippleElement;
    const id = el.__rippleId;
    if (id === undefined) {
      return;
    }

    const data = waveData.get(id);
    if (!data || data.released) {
      return;
    }

    data.released = true;
    scheduleHide(id);
  };

  const onPointerLeave = (e: PointerEvent) => {
    const el = e.currentTarget as RippleElement;
    const id = el.__rippleId;
    if (id === undefined) {
      return;
    }

    const data = waveData.get(id);
    if (!data || data.released) {
      return;
    }

    data.released = true;
    scheduleHide(id);
  };

  onUnmounted(() => {
    waveData.forEach((data) => {
      if (data.hideTimer) {
        clearTimeout(data.hideTimer);
      }
      if (data.removeTimer) {
        clearTimeout(data.removeTimer);
      }
    });
  });

  return {
    waves,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
  };
};

export default useRipple;
