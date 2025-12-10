import IS_TOUCH_SUPPORTED from "@/helpers/environment/touchSupport";
import { IS_APP } from "@/helpers/environment/userAgent";
import { watchEffect } from "vue";

export const usePreventPinchZoom = (isDisabled: boolean = false) => {
  const metaViewport = document.querySelector("meta[name=\"viewport\"]");
  const originalContent = metaViewport?.getAttribute("content") || "";

  const preventGesture = (e: Event) => e.preventDefault();

  watchEffect((onCleanup) => {
    if (!IS_TOUCH_SUPPORTED) return;

    if (isDisabled) {
      metaViewport?.setAttribute("content",
        "width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover",
      );
      return;
    }
    metaViewport?.setAttribute("content", originalContent);
    if (IS_APP) {
      document.addEventListener("gesturestart", preventGesture);
    }
    onCleanup(() => {
      if (!IS_APP) {
        document.removeEventListener("gesturestart", preventGesture);
      }
    });
  });
};
