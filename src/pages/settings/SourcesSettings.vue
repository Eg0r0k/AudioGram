<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.index.sources')" />

      <SettingsGroup>
        <Item @click="setEnabled(!enabled)">
          <ItemContent>
            <ItemTitle>{{ $t("settings.sources.nd.enable") }}</ItemTitle>
            <ItemSubtitle>
              {{ $t("settings.sources.nd.description") }}
            </ItemSubtitle>
          </ItemContent>
          <ItemActions>
            <Switch
              :model-value="enabled"
              @click.stop
              @update:model-value="setEnabled"
            />
          </ItemActions>
        </Item>
      </SettingsGroup>

      <SettingsGroup
        class="mt-2"
        :class="{ 'opacity-40 pointer-events-none': !enabled }"
      >
        <div class="px-4 py-3 space-y-4">
          <Input
            id="nd-base-url"
            :model-value="baseUrl"
            :label="$t('settings.sources.nd.baseUrl')"
            surface="card"
            placeholder="https://music.example.com"
            autocomplete="off"
            spellcheck="false"
            @update:model-value="(val) => setBaseUrl(String(val))"
          />

          <Input
            id="nd-username"
            :model-value="username"
            :label="$t('settings.sources.nd.username')"
            surface="card"
            autocomplete="off"
            spellcheck="false"
            @update:model-value="(val) => setUsername(String(val))"
          />

          <Input
            id="nd-password"
            :model-value="password"
            :label="$t('settings.sources.nd.password')"
            type="password"
            surface="card"
            autocomplete="off"
            @update:model-value="(val) => setPassword(String(val))"
          />
        </div>

        <Button
          class="w-full h-14 justify-start"
          size="xl"
          variant="ghost-primary"
          :disabled="!canTest || isTesting"
          @click="handleTest"
        >
          <IconLoader2
            v-if="isTesting"
            class="size-6 animate-spin"
          />
          <IconPlugConnected
            v-else
            class="size-6"
          />
          {{ $t("settings.sources.nd.test") }}
        </Button>
      </SettingsGroup>

      <div
        v-if="testState !== 'idle'"
        class="px-4 mt-2"
      >
        <p
          v-if="testState === 'ok'"
          class="text-sm text-primary"
        >
          {{ $t("settings.sources.nd.testOk") }}
        </p>
        <p
          v-else
          class="text-sm text-destructive break-words"
        >
          {{ testMessage }}
        </p>
      </div>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Scrollable } from "@/components/ui/scrollable";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import IconLoader2 from "~icons/tabler/loader-2";
import IconPlugConnected from "~icons/tabler/plug-connected";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import ItemSubtitle from "@/components/ui/item/ItemSubtitle.vue";
import { useNdSourceSettings } from "@/modules/settings/store/sources";
import { pingNd } from "@/modules/settings/services/nd";

const { t } = useI18n();

const {
  enabled,
  baseUrl,
  username,
  password,
  ndConfig,
  setEnabled,
  setBaseUrl,
  setUsername,
  setPassword,
} = useNdSourceSettings();

const isTesting = ref(false);
const testState = ref<"idle" | "ok" | "error">("idle");
const testMessage = ref("");

const canTest = computed(() => ndConfig.value !== null);

const handleTest = async () => {
  const config = ndConfig.value;
  if (!config) return;

  isTesting.value = true;
  testState.value = "idle";
  testMessage.value = "";

  const result = await pingNd(config);
  result.match(
    () => {
      testState.value = "ok";
    },
    (error) => {
      testState.value = "error";
      testMessage.value = t("settings.sources.nd.testFailed", { error: error.message });
    },
  );

  isTesting.value = false;
};
</script>
