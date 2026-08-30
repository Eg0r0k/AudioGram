<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.index.sources')" />

      <section
        v-for="source in sourceList"
        :key="source.kind"
        class="mb-6"
      >
        <SettingsGroup>
          <Item>
            <ItemMedia>
              <component
                :is="source.ui.icon"
                class="size-6 text-muted-foreground"
              />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{{ $t(source.ui.labelKey) }}</ItemTitle>
              <ItemSubtitle>{{ statusLabel(source.kind) }}</ItemSubtitle>
            </ItemContent>
          </Item>
        </SettingsGroup>

        <component
          :is="source.settings"
          v-if="source.settings"
        />

        <template v-if="source.canCheck">
          <Button
            class="w-full h-14 justify-start mt-2"
            size="xl"
            variant="ghost-primary"
            :disabled="!source.isAvailable || isChecking(source.kind)"
            @click="check(source.kind)"
          >
            <IconLoader2
              v-if="isChecking(source.kind)"
              class="size-6 animate-spin"
            />
            <IconPlugConnected
              v-else
              class="size-6"
            />
            {{ $t("source.status.check") }}
          </Button>

          <p
            v-if="failureOf(source.kind)"
            class="text-sm text-destructive wrap-break-word px-4 mt-2"
          >
            {{ failureOf(source.kind)?.message }}
          </p>
          <p
            v-else-if="health(source.kind).state === 'ok'"
            class="text-sm text-primary px-4 mt-2"
          >
            {{ $t("source.status.ok") }}
          </p>
        </template>
      </section>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import { useI18n } from "vue-i18n";
import { Scrollable } from "@/components/ui/scrollable";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import ItemSubtitle from "@/components/ui/item/ItemSubtitle.vue";
import { Button } from "@/components/ui/button";
import IconLoader2 from "~icons/tabler/loader-2";
import IconPlugConnected from "~icons/tabler/plug-connected";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import { sources } from "@/modules/sources";
import { sourceUI } from "@/modules/sources/lib/source-ui";
import { checkSource } from "@/modules/sources/composables/useSourceHealth";
import { sourceHealth } from "@/modules/sources/lib/health";
import NdSettingsSection from "@/modules/sources/components/settings/NdSettingsSection.vue";
import type { SourceKind } from "@/types/track-ref";

//
// One section per source the build registers — the page asks the registry
// what exists instead of knowing. Sources are compiled in statically, so the
// form a source needs is looked up in a static map here rather than carried
// on the provider: SourceProvider is a data contract and has no business
// referencing Vue components.
//
// A source with no form (YouTube: nothing to configure) still gets its row,
// which is where its status is reported.
//

const SOURCE_SETTINGS: Partial<Record<SourceKind, Component>> = {
  nd: NdSettingsSection,
};

const { t } = useI18n();

const sourceList = computed(() =>
  sources.all().map(provider => ({
    kind: provider.id,
    ui: sourceUI(provider.id),
    settings: SOURCE_SETTINGS[provider.id],
    isAvailable: provider.isAvailable,
    canCheck: !!provider.checkConnection,
  })),
);

const health = (kind: SourceKind) => sourceHealth(kind);
const isChecking = (kind: SourceKind) => sourceHealth(kind).state === "checking";
const failureOf = (kind: SourceKind) => {
  const current = sourceHealth(kind);
  return current.state === "failed" ? current.error : null;
};

const statusLabel = (kind: SourceKind): string => {
  if (!sources.isAvailable(kind)) return t("source.status.notConfigured");

  switch (sourceHealth(kind).state) {
    case "checking": return t("source.status.checking");
    case "ok": return t("source.status.ok");
    case "failed": return t("source.status.failed");
    default: return t("source.status.available");
  }
};

const check = (kind: SourceKind) => checkSource(kind);
</script>
