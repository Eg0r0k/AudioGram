import { inject, ref, watch, type InjectionKey, type Ref } from "vue";

/**
 * Provided by SlideTransition. False from the moment a new child is about to
 * slide in until its enter transition has actually started (without a CSS
 * transition: until the enter finished). Heavy content that mounts only after
 * this flips lands on the main thread when the compositor already owns the
 * slide, so a long mount no longer delays the first frame of motion.
 */
export const SLIDE_CONTENT_READY_KEY: InjectionKey<Readonly<Ref<boolean>>>
  = Symbol("slide-content-ready");

/**
 * Per-consumer latch over the provided gate: once true it stays true for this
 * component even when the transition resets the gate for the next child, so
 * the leaving page keeps its content while it slides out. Always true outside
 * a SlideTransition.
 */
export const useSlideContentReady = (): Readonly<Ref<boolean>> => {
  const gate = inject(SLIDE_CONTENT_READY_KEY, null);
  const ready = ref(gate?.value ?? true);
  if (gate && !ready.value) {
    watch(gate, () => {
      ready.value = true;
    }, { once: true });
  }
  return ready;
};
