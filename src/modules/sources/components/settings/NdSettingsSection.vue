<template>
  <SettingsGroup class="mt-2">
    <Item @click="setEnabled(!enabled)">
      <ItemContent>
        <ItemTitle>{{ $t("settings.sources.nd.enable") }}</ItemTitle>
        <ItemSubtitle>{{ $t("settings.sources.nd.description") }}</ItemSubtitle>
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
  </SettingsGroup>
</template>

<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import ItemSubtitle from "@/components/ui/item/ItemSubtitle.vue";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { useNdSourceSettings } from "@/modules/settings/store/sources";

//
// Navidrome's own settings, mounted by the sources page for the source that
// declares them (see SOURCE_SETTINGS). What is the same for every source —
// its name, its status, the connection check — belongs to the page; being
// switched on and where to log in is Navidrome's own business.
//
// Fields write on every keystroke; useNdSourceSync is what carries a settled
// change to Rust, re-probes it and drops what the previous server answered.
//

const {
  enabled,
  baseUrl,
  username,
  password,
  setEnabled,
  setBaseUrl,
  setUsername,
  setPassword,
} = useNdSourceSettings();
</script>
