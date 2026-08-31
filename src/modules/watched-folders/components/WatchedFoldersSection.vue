<template>
  <SettingsGroup>
    <div class="px-4 py-3">
      <div class="text-primary font-medium">
        {{ $t('watchedFolders.title') }}
      </div>
    </div>

    <Item @click="autoScanOnStartup = !autoScanOnStartup">
      <ItemContent>
        <ItemTitle>{{ $t('watchedFolders.autoScan') }}</ItemTitle>
        <ItemDescription>{{ $t('watchedFolders.autoScanDesc') }}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          :model-value="autoScanOnStartup"
          @click.stop
          @update:model-value="autoScanOnStartup = $event"
        />
      </ItemActions>
    </Item>

    <WatchedFolderItem
      v-for="folder in folders"
      :key="folder.id"
      :folder="folder"
      @scan="handleScan"
      @remove="confirmRemove"
      @relink="relinkFolder"
    />

    <Button
      v-if="canAddFolder"
      class="w-full h-14 justify-start"
      variant="ghost-primary"
      size="xl"
      @click="addFolder"
    >
      <IconFolderPlus class="size-6" />
      {{ $t(addFolderLabelKey) }}
    </Button>

    <Button
      v-if="folders.length > 0"
      class="w-full h-14 justify-start"
      variant="ghost-primary"
      size="xl"
      :disabled="isAnyScanning"
      @click="scanAllFolders"
    >
      <IconRefresh class="size-6" />
      {{ $t('watchedFolders.scanAll') }}
    </Button>
  </SettingsGroup>

  <Dialog v-model:open="isRemoveDialogOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('watchedFolders.removeDialogTitle') }}</DialogTitle>
        <DialogDescription>
          {{ $t('watchedFolders.removeDialogDescription', { name: folderToRemove?.name }) }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex justify-end gap-2 pt-2">
        <Button
          variant="ghost-primary"
          @click="cancelRemove"
        >
          {{ $t('common.cancel') }}
        </Button>
        <Button
          variant="destructive-link"
          @click="executeRemove"
        >
          {{ $t('common.delete') }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { getLogger } from "@/lib/logger";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import WatchedFolderItem from "./WatchedFolderItem.vue";
import { useWatchedFolders } from "../composables/useWatchedFolders";
import { isAndroidFolderPickerAvailable } from "@/lib/android/folderPicker";
import { IS_MOBILE } from "@/lib/environment/userAgent";
import type { WatchedFolder } from "../types";

import IconFolderPlus from "~icons/tabler/folder-plus";
import IconRefresh from "~icons/tabler/refresh";

const {
  folders,
  autoScanOnStartup,
  addFolder,
  removeFolder,
  scanFolder,
  scanAllFolders,
  relinkFolder,
} = useWatchedFolders();

const { t } = useI18n();

const isAnyScanning = computed(() =>
  folders.value.some(f => f.status === "scanning"),
);

// With the SAF picker bridge any internal-storage folder is bindable, any
// number of times. Without it (outdated APK, web preview) the legacy
// behavior remains: one bound Music folder, then the button disappears.
const hasMobilePicker = isAndroidFolderPickerAvailable();
const canAddFolder = computed(
  () => !IS_MOBILE || hasMobilePicker || folders.value.length === 0,
);
const addFolderLabelKey = computed(() =>
  IS_MOBILE && !hasMobilePicker ? "watchedFolders.addMusicFolder" : "watchedFolders.addFolder",
);

const isRemoveDialogOpen = ref(false);
const folderToRemove = ref<WatchedFolder | null>(null);

function handleScan(folder: WatchedFolder) {
  scanFolder(folder).catch(error => getLogger().error(`[WatchedFolders] Scanning ${folder.name} failed: ${String(error)}`));
}

function confirmRemove(id: string) {
  const folder = folders.value.find(f => f.id === id);
  if (!folder) return;
  folderToRemove.value = folder;
  isRemoveDialogOpen.value = true;
}

function cancelRemove() {
  isRemoveDialogOpen.value = false;
  folderToRemove.value = null;
}

async function executeRemove() {
  const folder = folderToRemove.value;
  isRemoveDialogOpen.value = false;
  folderToRemove.value = null;
  if (!folder) return;

  try {
    await removeFolder(folder.id);
  }
  catch (e) {
    // Unawaited, this rejected into nothing: the dialog closed, the folder
    // stayed and neither the user nor the log heard about it.
    getLogger().error(`[WatchedFolders] Removing ${folder.name} failed: ${String(e)}`);
    toast.error(t("watchedFolders.removeFailed", { name: folder.name }));
  }
}
</script>
