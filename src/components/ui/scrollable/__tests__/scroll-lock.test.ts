import { describe, expect, it } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { isScrollLockedByOverlay, useOverlayScrollLock } from "../scroll-lock";

describe("overlay scroll lock", () => {
  it("locks while an overlay is open and releases on close", async () => {
    const open = ref(false);
    useOverlayScrollLock(open);
    expect(isScrollLockedByOverlay.value).toBe(false);

    open.value = true;
    await nextTick();
    expect(isScrollLockedByOverlay.value).toBe(true);

    open.value = false;
    await nextTick();
    expect(isScrollLockedByOverlay.value).toBe(false);
  });

  it("stays locked until every open overlay closes", async () => {
    const contextMenu = ref(true);
    const dropdown = ref(false);
    useOverlayScrollLock(contextMenu);
    useOverlayScrollLock(dropdown);
    await nextTick();
    expect(isScrollLockedByOverlay.value).toBe(true);

    dropdown.value = true;
    await nextTick();
    contextMenu.value = false;
    await nextTick();
    expect(isScrollLockedByOverlay.value).toBe(true);

    dropdown.value = false;
    await nextTick();
    expect(isScrollLockedByOverlay.value).toBe(false);
  });

  it("does not double-count repeated opens of the same overlay", async () => {
    const open = ref(true);
    useOverlayScrollLock(open);
    await nextTick();

    open.value = true;
    await nextTick();
    open.value = false;
    await nextTick();

    expect(isScrollLockedByOverlay.value).toBe(false);
  });

  it("releases the lock when the owning scope is disposed mid-open", async () => {
    const open = ref(false);
    const scope = effectScope();
    scope.run(() => {
      useOverlayScrollLock(open);
    });

    open.value = true;
    await nextTick();
    expect(isScrollLockedByOverlay.value).toBe(true);

    scope.stop();
    expect(isScrollLockedByOverlay.value).toBe(false);
  });
});
