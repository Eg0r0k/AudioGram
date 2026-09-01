import { inject, type ComputedRef, type InjectionKey, type Ref } from "vue";

// The one usePlayerProgress instance of the full player, handed to the
// progress bar and the cover as refs. Read through props, the per-frame
// progress value re-rendered MobileFullPlayer itself — and with it every
// child — on each tick; injected, only the consumers that unwrap it do.
export interface MobilePlayerProgressContext {
  displayProgress: ComputedRef<number>;
  isTransitionEnabled: Ref<boolean>;
  isScrubbing: Ref<boolean>;
  scrubTimeDisplay: ComputedRef<string>;
}

export const mobilePlayerProgressKey: InjectionKey<MobilePlayerProgressContext> = Symbol("mobilePlayerProgress");

export const useMobilePlayerProgress = (): MobilePlayerProgressContext => {
  const context = inject(mobilePlayerProgressKey);
  if (!context) throw new Error("Must be rendered inside MobileFullPlayer");
  return context;
};
