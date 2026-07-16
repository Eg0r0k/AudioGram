<template>
  <div class="flex h-full min-h-0 flex-col bg-card">
    <RightPanelHeader
      :show-close="true"
      :title="t('queue.title')"
      @close="rightPanel.close()"
    />

    <Tabs
      v-model="activeTab"
      class="min-h-0 flex-1 gap-0"
    >
      <Scrollable
        direction="horizontal"
        hide-thumb
        class="shrink-0"
      >
        <TabsList class="inline-flex items-center gap-0 px-4">
          <TabsTrigger
            value="queue"
            class="text-base font-medium mb-0.5"
          >
            {{ t("queue.tabQueue") }}
          </TabsTrigger>
          <TabsTrigger
            value="history"
            class="text-base font-medium mb-0.5"
          >
            {{ t("queue.tabHistory") }}
          </TabsTrigger>
        </TabsList>
      </Scrollable>

      <TabsContent
        value="queue"
        class="min-h-0"
      >
        <QueueList class="h-full" />
      </TabsContent>

      <TabsContent
        value="history"
        class="min-h-0"
      >
        <HistoryList class="h-full" />
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Scrollable } from "@/components/ui/scrollable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QueueList from "@/modules/queue/components/QueueList.vue";
import HistoryList from "@/modules/queue/components/HistoryList.vue";
import RightPanelHeader from "@/modules/right-panel/components/RightPanelHeader.vue";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";

const { t } = useI18n();
const rightPanel = useRightPanelStore();
const activeTab = ref("queue");
</script>
