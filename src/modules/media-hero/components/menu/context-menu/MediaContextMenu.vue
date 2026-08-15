<template>
  <ContextMenu v-model:open="isOpen">
    <ContextMenuCloseBridge :open="isOpen" />
    <div
      ref="triggerGuardRef"
      class="contents"
    >
      <ContextMenuTrigger
        as-child
        :disabled="disabled"
      >
        <slot />
      </ContextMenuTrigger>
    </div>
    <ContextMenuContent class="w-60 bg-popover/50 backdrop-blur-[50px] ">
      <component
        :is="contextComponent"
        v-bind="contextProps"
      />
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import { ContextMenu, ContextMenuCloseBridge, ContextMenuTrigger, ContextMenuContent } from "@/components/ui/context-menu";
import { useEventListener } from "@vueuse/core";
import { useMenuCursorAutoClose } from "@/composables/useMenuCursorAutoClose";
import { computed, shallowRef, useTemplateRef, type Component } from "vue";
import { useMediaContext } from "@/modules/media-hero/composables/useMediaContext";
import AlbumContext from "../contexts/AlbumContext.vue";
import ArtistContext from "../contexts/ArtistContext.vue";
import PlaylistContext from "../contexts/PlaylistContext.vue";
import LikedContext from "../contexts/LikedContext.vue";

import { MediaContext } from "../types";
import { contextMenuComponents, provideMenuComponents } from "@/modules/media-hero/composables/useMenuComponents";

provideMenuComponents(contextMenuComponents);

const props = withDefaults(defineProps<{
  context?: MediaContext;
  isPlaylistOwner?: boolean;
  /** The context would render no items (e.g. a catalog artist) — don't open. */
  disabled?: boolean;
}>(), {
  context: "album",
  disabled: false,
});

const contexts: Record<MediaContext, Component> = {
  "album": AlbumContext,
  "artist-page": ArtistContext,
  "liked": LikedContext,
  "playlist": PlaylistContext,
};

// reka сам управляет открытием (v-model:open «только на чтение»);
// локальное состояние нужно курсорному автозакрытию и мосту
const isOpen = shallowRef(false);

useMenuCursorAutoClose(isOpen, () => {
  isOpen.value = false;
}, { contentSelector: "[data-slot=\"context-menu-content\"]" });

// A disabled menu must swallow the right-click entirely: with the reka
// trigger inert, the event reaches the surrounding TrackContextMenu and an
// empty track menu opens instead.
const triggerGuardRef = useTemplateRef<HTMLElement>("triggerGuardRef");
useEventListener(triggerGuardRef, "contextmenu", (event: MouseEvent) => {
  if (!props.disabled) return;
  event.preventDefault();
  event.stopPropagation();
}, { capture: true });

const actions = useMediaContext();
const contextComponent = computed(() => contexts[props.context]);

const contextProps = computed(() => {
  const base = { actions };
  if (props.context === "playlist") {
    return { ...base, isOwner: props.isPlaylistOwner };
  }
  return base;
});
</script>
