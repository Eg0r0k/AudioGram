<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.index.about')" />

      <SettingsGroup>
        <div class="px-4 py-6 flex flex-col items-center">
          <div class="size-20 rounded-2xl bg-primary flex items-center justify-center mb-4">
            <IconLogo class="size-15 text-white" />
          </div>
          <div class="font-semibold text-lg">
            Audiogram
          </div>
          <div class="text-sm text-muted-foreground mb-2">
            Version {{ appVersion }}  ({{ buildTime }})
          </div>
          <div class="flex gap-2">
            <Button
              size="icon-lg"
              variant="link"
              as-child
            >
              <Link
                to="https://github.com/Eg0r0k/Audiogram"
                confirm-external
              >
                <IconGithub
                  class="size-6"
                />
              </Link>
            </Button>
            <Button
              size="icon-lg"
              variant="link"
              as-child
            >
              <Link
                to="https://t.me/EG0RK13"
                confirm-external
              >
                <IconTelegram
                  class="size-6"
                />
              </Link>
            </Button>
          </div>
        </div>
      </SettingsGroup>
      <SettingsGroup class="mt-3">
        <SettingsItem
          :title="$t('update.checkForUpdates')"
          :subtitle="checkResultLabel"
          @click="handleCheckForUpdates"
        >
          <template #action>
            <IconLoader2
              v-if="updateStore.isBusy"
              class="size-4 animate-spin text-muted-foreground"
            />
            <IconRefresh
              v-else
              class="size-5 text-muted-foreground"
            />
          </template>
        </SettingsItem>

        <SettingsItem
          :title="$t('settings.about.whatsNew')"
          @click="handleOpenWhatsNew"
        >
          <template #action>
            <div class="flex items-center gap-2">
              <span
                v-if="changelog.hasUnseenUpdate"
                class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
              >
                {{ $t("settings.about.newBadge") }}
              </span>
              <IconLoader2
                v-if="isOpening"
                class="size-4 animate-spin text-muted-foreground"
              />
              <IconChevronRight
                v-else
                class="size-5 text-muted-foreground"
              />
            </div>
          </template>
        </SettingsItem>
        <SettingsItem
          :title="$t('settings.about.exportLogs')"
          @click="handleExportLogs"
        >
          <template #action>
            <IconLoader2
              v-if="isExporting"
              class="size-4 animate-spin text-muted-foreground"
            />

            <IconDownload
              v-else
              class="size-5 text-muted-foreground"
            />
          </template>
        </SettingsItem>
      </SettingsGroup>

      <SettingsGroup class="mt-3">
        <SettingsItem
          :title="$t('settings.about.termsOfService')"
          @click="router.push(routeLocation.settingsTerms())"
        >
          <template #action>
            <IconChevronRight
              class="size-5 text-muted-foreground"
            />
          </template>
        </SettingsItem>

        <SettingsItem
          :title="$t('settings.about.privacyPolicy')"
          @click="router.push(routeLocation.settingsPrivacy())"
        >
          <template #action>
            <IconChevronRight
              class="size-5 text-muted-foreground"
            />
          </template>
        </SettingsItem>

        <Link
          to="https://github.com/Eg0r0k/Audiogram/blob/main/LICENSE"
          confirm-external
        >
          <SettingsItem
            :title="$t('settings.about.licenses')"
          >
            <template #action>
              <IconExternalLink
                class="size-5 text-muted-foreground"
              />
            </template>
          </SettingsItem>
        </Link>
      </SettingsGroup>

      <div class="px-4 py-6 text-center text-xs text-muted-foreground">
        <p class=" inline-flex gap-1 items-center">
          {{ $t('settings.about.madeWith') }} <IconBarBell
            class="size-4"
          />
        </p>

        <p class="mt-1">
          © {{ dateYear }} Audiogram. {{ $t('settings.about.allRightsReserved') }}.
        </p>
      </div>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import IconGithub from "~icons/tabler/brand-github-filled";
import IconTelegram from "~icons/tabler/brand-telegram";
import IconChevronRight from "~icons/tabler/chevron-right";
import IconExternalLink from "~icons/tabler/external-link";
import IconBarBell from "~icons/tabler/brand-among-us";
import IconLoader2 from "~icons/tabler/loader-2";
import IconDownload from "~icons/tabler/download";
import IconRefresh from "~icons/tabler/refresh";

import IconLogo from "~icons/audiogram/logo";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";

import { Scrollable } from "@/components/ui/scrollable";
import Button from "@/components/ui/button/Button.vue";
import Link from "@/components/ui/link/Link.vue";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsItem from "@/modules/settings/components/SettingsItem.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import { useReleaseNotesDialog } from "@/modules/update/composables/useReleaseNotesDialog";
import { useChangelogStore } from "@/modules/update/store/changelog.store";
import { useUpdateStore } from "@/modules/update/store/update.store";
import { routeLocation } from "@/app/router/route-locations";
import { useRouter } from "vue-router";
import { exportLogs } from "@/lib/logger";
import { computed, ref } from "vue";

const isExporting = ref(false);

const router = useRouter();

const dateYear = new Date().getFullYear();
const appVersion = __APP_VERSION__;
const buildTime = __BUILD_TIME__;
const { t } = useI18n();
const changelog = useChangelogStore();
const updateStore = useUpdateStore();

/**
 * Outcome of the last check. An available update is not reported here — the
 * sidebar update button owns that, and it stays until the user acts on it.
 */
const checkResultLabel = computed(() => {
  switch (updateStore.status) {
    case "checking":
      return t("update.checking");
    case "up-to-date":
      return t("update.upToDate");
    case "error":
      return t("update.updateError", { message: updateStore.error?.message ?? "" });
    default:
      return undefined;
  }
});

const handleCheckForUpdates = () => {
  updateStore.check();
};
const {
  isOpening,
  error,
  clearError,
  openCurrent,
} = useReleaseNotesDialog();

const handleExportLogs = async () => {
  isExporting.value = true;
  await exportLogs().match(
    (success) => {
      if (success.kind === "saved")
        toast.success(t("settings.about.logsExportedTo", { path: success.path }));
      if (success.kind === "downloaded")
        toast.success(t("settings.about.logsDownloaded", { filename: success.filename }));
    },
    (err) => {
      if (err.type === "NO_DATA")
        toast.warning(t("settings.about.logsEmpty"));
      else
        toast.error(t("settings.about.logsExportFailed", { reason: err.reason }));
    },
  );

  isExporting.value = false;
};

const handleOpenWhatsNew = async () => {
  const isOpened = await openCurrent();

  if (isOpened) return;

  toast.error(error.value ?? t("settings.about.releaseNotesLoadFailed"));
  clearError();
};

</script>
