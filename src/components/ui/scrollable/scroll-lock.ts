import { computed, getCurrentScope, onScopeDispose, ref, watch, type WatchSource } from "vue";

const overlayCount = ref(0);

export const isScrollLockedByOverlay = computed(() => overlayCount.value > 0);

export const useOverlayScrollLock = (isOpen: WatchSource<boolean>): void => {
  let holding = false;

  const release = () => {
    if (!holding) return;
    holding = false;
    overlayCount.value = Math.max(0, overlayCount.value - 1);
  };

  watch(isOpen, (open) => {
    if (open && !holding) {
      holding = true;
      overlayCount.value++;
    }
    else if (!open) {
      release();
    }
  }, { immediate: true });

  if (getCurrentScope()) {
    onScopeDispose(release);
  }
};
