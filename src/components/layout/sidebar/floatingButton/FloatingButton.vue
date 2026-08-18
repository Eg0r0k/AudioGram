<template>
  <FloatingActionButton
    :show="show"
    :inline="inline"
  >
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button class="size-12 rounded-full shadow-lg">
          <IconPlus class="size-6" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        :side-offset="10"
        class="bg-popover/50 backdrop-blur-[50px]"
        align="end"
        side="top"
      >
        <DropdownMenuGroup>
          <DropdownMenuItem @click="handleImportTracks">
            <IconImport class="size-5.5" />
            {{ $t("common.import.button") }}
          </DropdownMenuItem>

          <DropdownMenuItem @click="createArtist">
            <IconUserPlus class="size-5.5" />
            {{ $t("common.createArtist") }}
          </DropdownMenuItem>

          <DropdownMenuItem @click="createAlbum">
            <IconAlbum class="size-5.5" />
            {{ $t("common.createAlbum") }}
          </DropdownMenuItem>

          <DropdownMenuItem @click="createPlaylist">
            <IconPlaylist class="size-5.5" />
            {{ $t("track.contextMenu.createPlaylist") }}
          </DropdownMenuItem>

          <DropdownMenuItem @click="emit('createFolder')">
            <IconFolderPlus class="size-5.5" />
            {{ $t("library.folder.create") }}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </FloatingActionButton>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import IconPlus from "~icons/tabler/plus";
import IconImport from "~icons/tabler/file-import";
import IconAlbum from "~icons/tabler/album";
import IconPlaylist from "~icons/tabler/playlist";
import IconUserPlus from "~icons/tabler/user-plus";
import IconFolderPlus from "~icons/tabler/folder-plus";
import { useLibrary } from "@/modules/library/composables/useLibrary";
import { useI18n } from "vue-i18n";
import { useImport } from "@/modules/library/composables/useImport";
import FloatingActionButton from "@/components/common/FloatingActionButton.vue";

defineProps<{
  show: boolean;
  inline?: boolean;
}>();

const emit = defineEmits<{
  createFolder: [];
}>();

const { t } = useI18n();
const { createPlaylist, createArtist, createAlbum } = useLibrary();
const { pickAndImport } = useImport();

async function handleImportTracks() {
  await pickAndImport({ title: t("common.import.button") });
}
</script>
