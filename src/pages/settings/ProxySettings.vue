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
            <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -- renderless reka root, the trigger below carries the label -->
            <Select
              :model-value="protocol"
              @update:model-value="(val) => setProtocol(val as ProxyProtocol)"
            >
              <SelectTrigger
                class="w-[120px] h-8 font-medium pointer-events-auto"
                :aria-label="$t('settings.proxy.protocol')"
              >
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
            <div class="min-w-0 space-y-1.5">
              <Input
                id="proxy-host"
                :model-value="host"
                :label="$t('settings.proxy.host')"
                surface="card"
                placeholder="127.0.0.1"
                autocomplete="off"
                spellcheck="false"
                :aria-invalid="!!hostError || undefined"
                :aria-describedby="hostError ? 'proxy-host-error' : undefined"
                :class="{ 'border-destructive focus-visible:ring-destructive': hostError }"
                @update:model-value="(val) => setHost(String(val))"
              />
              <p
                v-if="hostError"
                id="proxy-host-error"
                class="text-xs text-destructive"
                role="alert"
              >
                {{ hostError }}
              </p>
            </div>
            <div class="w-28">
              <Input
                id="proxy-port"
                :model-value="port"
                :label="$t('settings.proxy.port')"
                type="number"
                surface="card"
                inputmode="numeric"
                @update:model-value="(val) => setPortValue(val)"
              />
            </div>
          </div>

          <Input
            id="proxy-username"
            :model-value="username"
            :label="$t('settings.proxy.username')"
            surface="card"
            autocomplete="off"
            spellcheck="false"
            @update:model-value="(val) => setUsername(String(val))"
          />

          <Input
            id="proxy-password"
            :model-value="password"
            :label="$t('settings.proxy.password')"
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
          {{ $t("settings.proxy.test") }}
        </Button>
      </SettingsGroup>

      <div
        v-if="testState !== 'idle'"
        class="px-4 mt-2"
      >
        <p
          v-if="testState === 'ok'"
          class="text-sm text-muted-foreground font-medium"
        >
          {{ testMessage }}
        </p>
        <p
          v-else
          class="text-sm text-destructive wrap-break-word"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import IconLoader2 from "~icons/tabler/loader-2";
import IconPlugConnected from "~icons/tabler/plug-connected";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import { isValidProxyHost } from "@/modules/settings/schema/proxy";
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

// Live, not on submit: the page writes to the store on every keystroke, so
// the field is the only place a bad host can be pointed out. A rejected host
// also makes `proxyUrl` null — the backend never sees it.
const hostError = computed(() =>
  host.value.trim() !== "" && !isValidProxyHost(host.value) ? t("settings.proxy.hostInvalid") : null,
);

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
