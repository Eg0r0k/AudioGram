<script setup lang="ts">
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

import { Code2Icon, PlusIcon, TrashIcon } from "lucide-vue-next";

</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <div
        v-ripple="{ opacity: 0.1, duration: 600 }"
        tabindex="0"
        class="gird relative select-none cursor-pointer p-2 rounded-[10px] hover:bg-muted/20"
      >
        <div class="flex items-center">
          <img
            :alt="$t('player.cover')"
            class="size-13 rounded-lg z-1 object-cover mr-3"
            loading="eager"
            width="40"
            height="40"
            src="https://i.scdn.co/image/ab67616d000048514feb42ff53928276cf9d9f5a"
          >
          <div>
            <div>
              <span class="font-medium truncate">Title</span>
            </div>
            <!-- <div>Badge</div> -->
            <div>
              <span
                class="inline-flex text-sm truncate items-center justify-center text-muted-foreground"
              >Artist</span>
            </div>
          </div>
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-52">
      <ContextMenuItem inset>
        Back
        <ContextMenuShortcut>⌘[</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem
        inset
        disabled
      >
        Forward
        <ContextMenuShortcut>⌘]</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem inset>
        Reload
        <ContextMenuShortcut>⌘R</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger inset>
          More Tools
        </ContextMenuSubTrigger>
        <ContextMenuSubContent class="w-44">
          <ContextMenuItem inset>
            Save Page...
            <ContextMenuShortcut>⇧⌘S</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>
            <PlusIcon />
            Create Shortcut...
          </ContextMenuItem>
          <ContextMenuItem inset>
            Name Window...
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>
            <Code2Icon />
            Developer Tools
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive">
            <TrashIcon />
            Delete
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  </ContextMenu>
</template>
