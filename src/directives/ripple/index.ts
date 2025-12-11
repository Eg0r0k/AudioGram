import type { Directive, DirectiveBinding } from "vue";
import "./ripple.css";

interface Wave {
  id: number;
  element: HTMLElement;
  hideTimer?: ReturnType<typeof setTimeout>;
  removeTimer?: ReturnType<typeof setTimeout>;
  startTime: number;
  released: boolean;
}

interface RippleOptions {
  disabled?: boolean;
  color?: string;
  opacity?: number;
  duration?: number;
}

interface RippleHTMLElement extends HTMLElement {
  _ripple?: {
    container: HTMLElement;
    waves: Map<number, Wave>;
    waveId: number;
    options: RippleOptions;
    handlers: {
      pointerdown: (e: PointerEvent) => void;
      pointerup: (e: PointerEvent) => void;
      pointercancel: (e: PointerEvent) => void;
      pointerleave: (e: PointerEvent) => void;
    };
    currentWaveId?: number;
  };
}

const RIPPLE_DURATION = 400;

function parseBinding(binding: DirectiveBinding): RippleOptions {
  if (typeof binding.value === "boolean") {
    return { disabled: !binding.value };
  }
  if (typeof binding.value === "object") {
    return binding.value;
  }
  return {};
}

function calcRippleSize(
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  const dx = x > width / 2 ? x : width - x;
  const dy = y > height / 2 ? y : height - y;
  return Math.hypot(dx, dy) * 2;
}

function createRippleContainer(): HTMLElement {
  const container = document.createElement("span");
  container.className = "v-ripple";
  container.setAttribute("aria-hidden", "true");
  return container;
}

function createWaveElement(
  x: number,
  y: number,
  size: number,
  options: RippleOptions,
): HTMLElement {
  const wave = document.createElement("span");
  const halfSize = size / 2;
  wave.className = "v-ripple__circle";
  wave.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    left: ${x - halfSize}px;
    top: ${y - halfSize}px;
    ${options.color ? `--ripple-color: ${options.color};` : ""}
    ${
      options.opacity !== undefined
        ? `--ripple-max-opacity: ${options.opacity};`
        : ""
    }
    ${options.duration ? `--ripple-duration: ${options.duration}ms;` : ""}
  `;

  return wave;
}

function scheduleHide(el: RippleHTMLElement, waveId: number): void {
  const ripple = el._ripple;
  if (!ripple) return;

  const wave = ripple.waves.get(waveId);
  if (!wave) return;

  const duration = ripple.options.duration || RIPPLE_DURATION;
  const halfDuration = duration / 2;
  const elapsedTime = Date.now() - wave.startTime;

  if (elapsedTime < duration) {
    const delay = Math.max(duration - elapsedTime, halfDuration);
    const hideDelay = Math.max(delay - halfDuration, 0);

    wave.hideTimer = setTimeout(() => {
      wave.element.classList.add("hiding");
    }, hideDelay);

    wave.removeTimer = setTimeout(() => {
      wave.element.remove();
      ripple.waves.delete(waveId);
    }, delay);
  }
  else {
    wave.element.classList.add("hiding");

    wave.removeTimer = setTimeout(() => {
      wave.element.remove();
      ripple.waves.delete(waveId);
    }, halfDuration);
  }
}

function setupRipple(el: RippleHTMLElement, binding: DirectiveBinding): void {
  if (el._ripple) return;

  const options = parseBinding(binding);
  const computedStyle = window.getComputedStyle(el);
  if (computedStyle.position === "static") {
    el.style.position = "relative";
  }

  const container = createRippleContainer();
  el.appendChild(container);

  const handlers = {
    pointerdown(e: PointerEvent) {
      // Middle click
      if (e.button === 1) return;
      const ripple = el._ripple;
      if (!ripple || ripple.options.disabled) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const size = calcRippleSize(x, y, rect.width, rect.height);

      const waveId = ripple.waveId++;
      const waveElement = createWaveElement(x, y, size, ripple.options);

      ripple.container.appendChild(waveElement);
      ripple.currentWaveId = waveId;

      ripple.waves.set(waveId, {
        id: waveId,
        element: waveElement,
        startTime: Date.now(),
        released: false,
      });
    },

    pointerup() {
      const ripple = el._ripple;
      if (!ripple || ripple.currentWaveId === undefined) return;

      const wave = ripple.waves.get(ripple.currentWaveId);
      if (!wave || wave.released) return;

      wave.released = true;
      scheduleHide(el, ripple.currentWaveId);
    },

    pointercancel() {
      handlers.pointerup();
    },

    pointerleave() {
      handlers.pointerup();
    },
  };

  el._ripple = {
    container,
    waves: new Map(),
    waveId: 0,
    options,
    handlers,
  };

  el.addEventListener("pointerdown", handlers.pointerdown);
  el.addEventListener("pointerup", handlers.pointerup);
  el.addEventListener("pointercancel", handlers.pointercancel);
  el.addEventListener("pointerleave", handlers.pointerleave);
}

function cleanupRipple(el: RippleHTMLElement): void {
  const ripple = el._ripple;
  if (!ripple) return;

  ripple.waves.forEach((wave) => {
    if (wave.hideTimer) clearTimeout(wave.hideTimer);
    if (wave.removeTimer) clearTimeout(wave.removeTimer);
  });

  el.removeEventListener("pointerdown", ripple.handlers.pointerdown);
  el.removeEventListener("pointerup", ripple.handlers.pointerup);
  el.removeEventListener("pointercancel", ripple.handlers.pointercancel);
  el.removeEventListener("pointerleave", ripple.handlers.pointerleave);

  ripple.container.remove();

  delete el._ripple;
}

export const vRipple: Directive<RippleHTMLElement, boolean | RippleOptions> = {
  mounted(el, binding) {
    setupRipple(el, binding);
  },

  updated(el, binding) {
    if (el._ripple) {
      el._ripple.options = parseBinding(binding);
    }
  },

  beforeUnmount(el) {
    cleanupRipple(el);
  },
};

export default vRipple;
