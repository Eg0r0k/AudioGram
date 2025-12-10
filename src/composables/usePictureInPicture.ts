import vRipple from "@/directives/ripple";
import { IS_MOBILE, IS_TAURI } from "@/helpers/environment/userAgent";
import { App, Component, createApp, ref, shallowRef } from "vue";

export interface PipOptions {
  width?: number;
  height?: number;
  component: Component;
  plugins?: Array<{ install: (app: App) => void }>;

}

export const usePictureInPicture = () => {
  const PIP_SUPPORTED = !IS_MOBILE && !IS_TAURI && typeof window !== "undefined" && "documentPictureInPicture" in window;
  const pipWindow = shallowRef<Window | null>(null);
  const pipApp = shallowRef<App | null>(null);
  const isPipOpen = ref(false);
  let currentOptions: PipOptions | null = null;

  const syncStyles = (target: Document) => {
    target.querySelectorAll("[data-pip-style]").forEach(el => el.remove());
    document.querySelectorAll("style, link[rel=\"stylesheet\"]").forEach((el) => {
      const clone = el.cloneNode(true) as Element;
      clone.setAttribute("data-pip-style", "");
      target.head.appendChild(clone);
    });
    // :root sync
    const rootStyles = getComputedStyle(document.documentElement);
    const cssVars = Array.from(rootStyles)
      .filter(prop => prop.startsWith("--"))
      .map(prop => `${prop}: ${rootStyles.getPropertyValue(prop)}`)
      .join("; ");

    const varStyle = target.createElement("style");
    varStyle.setAttribute("data-pip-style", "");
    varStyle.setAttribute("data-pip-vars", "");
    varStyle.textContent = `:root { ${cssVars} }`;
    target.head.appendChild(varStyle);
  };

  const setupPip = (win: Window) => {
    pipWindow.value = win;
    isPipOpen.value = true;
    Object.assign(win.document.body.style, {
      margin: "0",
      overflow: "hidden",
      background: "var(--background, #000)",
    });
    syncStyles(win.document);
    const container = win.document.createElement("div");
    container.id = "pip-app";
    Object.assign(container.style, {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
    });
    win.document.body.appendChild(container);

    if (currentOptions) {
      const app = createApp(currentOptions.component);
      app.directive("ripple", vRipple);
      currentOptions.plugins?.forEach(plugin => app.use(plugin));
      app.mount(container);
      pipApp.value = app;
    }
    win.addEventListener("pagehide", handleClose);
    win.addEventListener("beforeunload", handleClose);
  };
  const handleClose = () => {
    pipApp.value?.unmount();
    pipApp.value = null;
    pipWindow.value = null;
    isPipOpen.value = false;
  };
  const open = async (options: PipOptions): Promise<boolean> => {
    if (!PIP_SUPPORTED) {
      console.warn("[PIP] Not supported in this environment");
      return false;
    }

    if (isPipOpen.value) {
      close();
      return false;
    }

    currentOptions = options;

    try {
      const win = await window.documentPictureInPicture.requestWindow({
        width: options.width ?? 400,
        height: options.height ?? 280,
      });

      setupPip(win);
      console.log("[PIP] Window opened");
      return true;
    }
    catch (e) {
      console.error("[PIP] Failed to open:", e);
      return false;
    }
  };

  const toggle = async (options: PipOptions): Promise<void> => {
    if (isPipOpen.value) {
      close();
    }
    else {
      await open(options);
    }
  };

  const restore = (options: PipOptions): void => {
    if (!PIP_SUPPORTED) return;

    currentOptions = options;
    try {
      const existingWindow = window.documentPictureInPicture.window;
      if (existingWindow) {
        setupPip(existingWindow);
        console.log("[PIP] Restored existing window");
      }
    }
    catch (e) {
      console.error("[PIP] Restore error:", e);
    }
  };
  const close = (): void => {
    if (!isPipOpen.value) return;

    try {
      if (pipApp.value) {
        pipApp.value.unmount();
        pipApp.value = null;
      }

      if (pipWindow.value) {
        pipWindow.value.removeEventListener("pagehide", handleClose);
        pipWindow.value.removeEventListener("beforeunload", handleClose);

        if (!pipWindow.value.closed) {
          pipWindow.value.close();
        }
        pipWindow.value = null;
      }

      isPipOpen.value = false;
      currentOptions = null;
    }
    catch (e) {
      console.error("[PIP] Failed to close:", e);
    }
  };

  return {
    PIP_SUPPORTED,
    isPipOpen,
    pipWindow,
    close,
    open,
    restore,
    toggle,

  };
};
