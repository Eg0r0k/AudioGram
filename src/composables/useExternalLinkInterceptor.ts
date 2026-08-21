import { IS_TAURI } from "@/lib/environment/userAgent";
import { openUrl } from "@tauri-apps/plugin-opener";
import { onMounted, onUnmounted } from "vue";

const isExternalLink = (url: string): boolean => {
  return (
    url.startsWith("http://")
    || url.startsWith("https://")
    || url.startsWith("mailto:")
    || url.startsWith("tel:")
    || url.startsWith("//")
  );
};

// plugin-shell's `open` spawns desktop opener programs (xdg-open/start) and
// has no Android intent path; plugin-opener works on desktop and mobile.
export const openExternal = async (url: string) => {
  if (IS_TAURI) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

const handleClick = (event: MouseEvent) => {
  if (event.defaultPrevented) return;
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target as HTMLElement;
  const link = target.closest("a");

  if (!link) return;
  const rawHref = link.getAttribute("href");
  if (!rawHref) return;
  if (!isExternalLink(rawHref)) return;
  event.preventDefault();
  event.stopPropagation();
  const href = link.href;
  openExternal(href).catch(() => undefined);
};

export const useExternalLinkInterceptor = () => {
  onMounted(() => {
    document.addEventListener("click", handleClick, true);
  });
  onUnmounted(() => {
    document.removeEventListener("click", handleClick, true);
  });
};
