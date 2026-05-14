import { ref, watch } from "vue";
import { useOnline } from "@vueuse/core";

export function useNetworkStatus() {
  const isOnline = useOnline();

  const wasOffline = ref(false);
  const showOffline = ref(false);
  const showOnline = ref(false);

  let onlineTimer: ReturnType<typeof setTimeout> | null = null;
  let offlineTimer: ReturnType<typeof setTimeout> | null = null;

  watch(isOnline, (online) => {
    if (onlineTimer) {
      clearTimeout(onlineTimer);
      onlineTimer = null;
    }

    if (offlineTimer) {
      clearTimeout(offlineTimer);
      offlineTimer = null;
    }

    if (!online) {
      wasOffline.value = true;
      showOnline.value = false;
      showOffline.value = true;

      offlineTimer = setTimeout(() => {
        showOffline.value = false;
        offlineTimer = null;
      }, 3000);
    }
    else {
      showOffline.value = false;
      offlineTimer = null;

      if (wasOffline.value) {
        showOnline.value = true;
        onlineTimer = setTimeout(() => {
          showOnline.value = false;
          wasOffline.value = false;
          onlineTimer = null;
        }, 3000);
      }
    }
  });

  return { isOnline, showOffline, showOnline };
}
