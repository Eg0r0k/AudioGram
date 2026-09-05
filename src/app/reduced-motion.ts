import { MotionGlobalConfig } from "motion-utils";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * One switch for every motion-v animation: `skipAnimations` makes motion-dom
 * apply the final keyframe instead of animating, so components declare their
 * full animations and never check the preference themselves. CSS transitions
 * are covered by the matching media query in style.css.
 */
export const installReducedMotion = (): (() => void) => {
  if (typeof matchMedia === "undefined") return () => {};

  const media = matchMedia(REDUCED_MOTION_QUERY);
  const apply = () => {
    MotionGlobalConfig.skipAnimations = media.matches;
  };
  apply();
  media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
};
