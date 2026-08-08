<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.index.proxy')" />

      <SettingsGroup>
        <Item @click="setEnabled(!enabled)">
          <ItemContent>
            <ItemTitle>{{ $t("settings.proxy.enable") }}</ItemTitle>
            <ItemSubtitle>
              {{ $t("settings.proxy.description") }}
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
        <Item>
          <ItemContent>
            <ItemTitle>{{ $t("settings.proxy.protocol") }}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Select
              :model-value="protocol"
              @update:model-value="(val) => setProtocol(val as ProxyProtocol)"
            >
              <SelectTrigger class="w-[120px] h-8 font-medium pointer-events-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in protocolOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </ItemActions>
        </Item>

        <div class="px-4 py-3 space-y-4">
          <div class="grid grid-cols-[1fr_auto] gap-3">
            <div class="space-y-1.5">
              <Label for="proxy-host">{{ $t("settings.proxy.host") }}</Label>
              <Input
                id="proxy-host"
                :model-value="host"
                surface="card"
                placeholder="127.0.0.1"
                autocomplete="off"
                spellcheck="false"
                @update:model-value="(val) => setHost(String(val))"
              />
            </div>
            <div class="space-y-1.5 w-28">
              <Label for="proxy-port">{{ $t("settings.proxy.port") }}</Label>
              <Input
                id="proxy-port"
                :model-value="port"
                type="number"
                surface="card"
                inputmode="numeric"
                @update:model-value="(val) => setPortValue(val)"
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <Label for="proxy-username">{{ $t("settings.proxy.username") }}</Label>
            <Input
              id="proxy-username"
              :model-value="username"
              surface="card"
              autocomplete="off"
              spellcheck="false"
              @update:model-value="(val) => setUsername(String(val))"
            />
          </div>

          <div class="space-y-1.5">
            <Label for="proxy-password">{{ $t("settings.proxy.password") }}</Label>
            <Input
              id="proxy-password"
              :model-value="password"
              type="password"
              surface="card"
              autocomplete="off"
              @update:model-value="(val) => setPassword(String(val))"
            />
          </div>
        </div>
      </SettingsGroup>

      <div class="px-4 mt-4 space-y-2">
        <Button
          variant="outline"
          class="w-full"
          :disabled="!canTest || isTesting"
          @click="handleTest"
        >
          <IconLoader2
            v-if="isTesting"
            class="size-4 animate-spin"
          />
          {{ $t("settings.proxy.test") }}
        </Button>

        <p
          v-if="testState === 'ok'"
          class="text-sm text-primary"
        >
          {{ testMessage }}
        </p>
        <p
          v-else-if="testState === 'error'"
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
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import IconLoader2 from "~icons/tabler/loader-2";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import { useProxySettings } from "@/modules/settings/store/proxy";
import { checkProxyConnection } from "@/modules/settings/services/proxy";
import type { ProxyProtocol } from "@/modules/settings/schema";
import ItemSubtitle from "@/components/ui/item/ItemSubtitle.vue";

const { t } = useI18n();

const {
  enabled,
  protocol,
  host,
  port,
  username,
  password,
  proxyUrl,
  protocolOptions,
  setEnabled,
  setProtocol,
  setHost,
  setPort,
  setUsername,
  setPassword,
} = useProxySettings();

const setPortValue = (value: string | number) => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return;
  setPort(Math.min(65535, Math.max(1, parsed)));
};

const isTesting = ref(false);
const testState = ref<"idle" | "ok" | "error">("idle");
const testMessage = ref("");

const canTest = computed(() => proxyUrl.value !== null);

const handleTest = async () => {
  const url = proxyUrl.value;
  if (!url) return;

  isTesting.value = true;
  testState.value = "idle";
  testMessage.value = "";

  const result = await checkProxyConnection(url);
  result.match(
    (latency) => {
      testState.value = "ok";
      testMessage.value = t("settings.proxy.testOk", { ms: latency });
    },
    (error) => {
      testState.value = "error";
      testMessage.value = t("settings.proxy.testFailed", { error: error.message });
    },
  );

  isTesting.value = false;
};
</script>
